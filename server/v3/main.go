package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"unsafe"

	"gopkg.in/yaml.v2"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/static"
)

// 在 const 声明之后添加配置结构体定义
type Config struct {
	Host        string `yaml:"host"`
	Port        int    `yaml:"port"`
	MountPoint  string `yaml:"mountPoint"`
	AppRoot     string `yaml:"appRoot"`
	BodyLimit   int    `yaml:"bodyLimit"`
	OpenBrowser bool   `yaml:"openBrowser"`
}

// 在 readAppInfo 函数之后添加读取配置的函数
func readConfig() Config {
	// 默认配置值
	config := Config{
		Host:       "0.0.0.0",
		Port:       4412,
		MountPoint: "/index",
		AppRoot:    "./dist",
		BodyLimit:  100 * 1024 * 1024, // 100MB
	}

	// 尝试从 config.yaml 读取配置
	data, err := os.ReadFile("config.yaml")
	if err != nil {
		log.Println("Warning: config file not found, using default configuration")
		return config
	}

	// 解析 YAML 配置
	err = yaml.Unmarshal(data, &config)
	if err != nil {
		log.Fatalf("Error parsing config.yaml: %v", err)
	}

	return config
}

type AppInfo struct {
	Name      string `json:"name"`
	Version   string `json:"version"`
	Author    string `json:"author"`
	BuildTime string `json:"buildTime"`
}

func readAppInfo(path string) AppInfo {
	// 读取 package.json 文件
	data, err := os.ReadFile(path)
	if err != nil {
		log.Fatal("Error reading package.json:", err)
	}

	// 解析 JSON 数据
	var appinfo AppInfo
	err = json.Unmarshal(data, &appinfo)
	if err != nil {
		log.Fatal("Error parsing package.json:", err)
	}

	return appinfo
}

func setConsoleTitle(title string) error {
	// 获取kernel32.dll中的SetConsoleTitleW函数
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	proc := kernel32.NewProc("SetConsoleTitleW")

	// 将Go字符串转换为UTF16指针
	ptr, err := syscall.UTF16PtrFromString(title)
	if err != nil {
		return err
	}

	// 调用Windows API
	proc.Call(uintptr(unsafe.Pointer(ptr)))
	return nil
}

func OpenEdge(url string) error {
	var err error

	switch runtime.GOOS {
	case "windows":
		// Windows 上 Edge 是默认浏览器，可以直接使用 start 命令
		err = exec.Command("cmd", "/c", "start", "msedge", url).Run()
	case "darwin": // macOS
		err = exec.Command("open", "-a", "Microsoft Edge", url).Run()
	case "linux":
		err = exec.Command("microsoft-edge", url).Run()
	default:
		err = fmt.Errorf("unsupported platform")
	}

	return err
}

// listComputerRoot returns top-level selectable roots.
// On Windows this is available drive letters (C:/, D:/, ...);
// on Unix-like systems it is the filesystem root "/".
func listComputerRoot() []map[string]any {
	// Always return a non-nil slice so JSON is [] not null.
	drives := make([]map[string]any, 0)

	if runtime.GOOS == "windows" {
		// GetLogicalDrives avoids Stat-blocking on empty floppy/optical drives.
		kernel32 := syscall.NewLazyDLL("kernel32.dll")
		proc := kernel32.NewProc("GetLogicalDrives")
		ret, _, callErr := proc.Call()
		if ret == 0 {
			log.Printf("GetLogicalDrives failed: %v", callErr)
			return drives
		}
		mask := uint32(ret)
		for i := 0; i < 26; i++ {
			if mask&(1<<uint(i)) == 0 {
				continue
			}
			letter := string(rune('A' + i))
			drives = append(drives, map[string]any{
				"name":        letter + ":",
				"size":        int64(-1),
				"mtime":       int64(0),
				"isFile":      false,
				"isDirectory": true,
			})
		}
		return drives
	}

	// Unix-like: computer root surfaces "/" as a single entry.
	return append(drives, map[string]any{
		"name":        "/",
		"size":        int64(-1),
		"mtime":       int64(0),
		"isFile":      false,
		"isDirectory": true,
	})
}

// saveUploadedFile 会先将完整内容写入目标目录内的临时文件，再替换正式文件。
// 这样首个请求中断或写入失败时不会留下残缺文件，后续重试也不会误以为修复了上传。
func saveUploadedFile(dir string, file *multipart.FileHeader) error {
	if strings.TrimSpace(dir) == "" {
		return fmt.Errorf("upload destination is empty")
	}

	dirInfo, err := os.Stat(dir)
	if err != nil {
		return fmt.Errorf("read upload destination: %w", err)
	}
	if !dirInfo.IsDir() {
		return fmt.Errorf("upload destination is not a directory")
	}

	// 浏览器提供的文件名不应参与路径拼接，防止携带不同平台分隔符时越过当前目录。
	fileName := filepath.Base(strings.ReplaceAll(file.Filename, "\\", "/"))
	if fileName == "." || fileName == ".." || fileName == string(filepath.Separator) || fileName == "" {
		return fmt.Errorf("invalid upload file name")
	}

	src, err := file.Open()
	if err != nil {
		return fmt.Errorf("open uploaded file: %w", err)
	}
	defer src.Close()

	tempFile, err := os.CreateTemp(dir, ".webpviewer-upload-*")
	if err != nil {
		return fmt.Errorf("create temporary upload file: %w", err)
	}
	tempPath := tempFile.Name()
	cleanupTempFile := func() {
		tempFile.Close()
		os.Remove(tempPath)
	}

	if _, err := io.Copy(tempFile, src); err != nil {
		cleanupTempFile()
		return fmt.Errorf("write uploaded file: %w", err)
	}
	if err := tempFile.Close(); err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("close temporary upload file: %w", err)
	}

	dstPath := filepath.Join(dir, fileName)
	// 保持原有“同名文件覆盖”的行为，但只在临时文件完整写入后才替换旧文件。
	if err := os.Remove(dstPath); err != nil && !os.IsNotExist(err) {
		os.Remove(tempPath)
		return fmt.Errorf("replace existing file: %w", err)
	}
	if err := os.Rename(tempPath, dstPath); err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("finalize uploaded file: %w", err)
	}

	return nil
}

func main() {
	config := readConfig()
	infoPath := filepath.Join(config.AppRoot, "version.json")
	appInfo := readAppInfo(infoPath)

	app := fiber.New(fiber.Config{
		AppName:   appInfo.Name,
		BodyLimit: config.BodyLimit,
	})

	// Serve static files for the mount point
	app.Get(fmt.Sprintf("%s/*", config.MountPoint), static.New(config.AppRoot))

	// List directory contents.
	// Empty dir means "computer root": Windows returns available drive letters;
	// Unix-like systems return filesystem root "/".
	app.Get("/list", func(c fiber.Ctx) error {
		// Fiber treats missing and empty query the same; clients send dir= for computer root.
		rawQuery := string(c.Request().URI().QueryString())
		hasDirParam := strings.Contains(rawQuery, "dir=")
		pwd := c.Query("dir")
		if !hasDirParam && pwd == "" {
			pwd = "C:/"
		}
		if hasDirParam && pwd == "" {
			return c.JSON(listComputerRoot())
		}
		if strings.HasSuffix(pwd, ":") {
			pwd += "/"
		}

		files, err := os.ReadDir(pwd)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).SendString(err.Error())
		}

		var fileArr []map[string]any
		for _, file := range files {
			// filePath := filepath.Join(pwd, file.Name())
			// stat, err := os.Lstat(filePath)
			stat, err := file.Info()
			if err != nil {
				log.Printf("Error reading file stats: %v", err)
				continue
			}

			fileInfo := map[string]any{
				"name":  file.Name(),
				"size":  stat.Size(),
				"mtime": stat.ModTime().UnixMilli(),
				// TODO 更好的文件类型表示
				"isFile":      !file.IsDir(),
				"isDirectory": file.IsDir(),
			}
			fileArr = append(fileArr, fileInfo)
		}

		return c.JSON(fileArr)
	})

	// Handle file requests
	app.Get("/files", func(c fiber.Ctx) error {
		pwd := c.Query("dir")
		name := c.Query("name")
		fmt.Println(name)
		if pwd == "" || name == "" {
			return c.Status(fiber.StatusBadRequest).SendString("Missing 'dir' or 'name' query parameter")
		}

		filePath := filepath.Join(pwd, name)
		if c.Query("download") != "" {
			c.Attachment(name)
			if !strings.Contains(filePath, "#") {
				return c.SendFile(filePath)
			}
			content, err := os.ReadFile(filePath)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).SendString(err.Error())
			}
			return c.Send(content)
		}
		ext := filepath.Ext(name)

		switch ext {
		case ".mhtml":
			html, err := ParseMHTMLIndex(filePath)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).SendString(err.Error())
			}
			c.Type("html")
			return c.Send(html)
		case ".html":
			dir, stemURI, err := CheckHTMLResource(filePath)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).SendString(err.Error())
			}
			app.Get(stemURI, static.New(dir))
		case ".jfif":
			c.Type("jpeg")
		default:
			// Fallthrough to send file
		}
		// fmt.Println(pwd, name, filePath)
		if !strings.Contains(filePath, "#") {
			// MARK fiber v3.0.0-beta.4 存在bug: 文件名若存在#则导致无法读取
			return c.SendFile(filePath)
		}
		content, err := os.ReadFile(filePath)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).SendString(err.Error())
		}
		c.Type(filepath.Ext(name)[1:])
		return c.Send(content)
	})

	// Serve MHTML resources from cache
	app.Get(fmt.Sprintf("%s/*", MHTMLENDPOINT), func(c fiber.Ctx) error {
		key, err := url.PathUnescape(c.Params("*"))
		if err != nil {
			return c.Status(fiber.StatusBadRequest).SendString(err.Error())
		}
		result, exists := ResourceCache[key]
		// fmt.Println(result, exists, key)
		if !exists {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"msg": "not found"})
		}
		c.Set("Content-Type", result.Type)
		return c.Send(result.Content)
	})

	// Clear MHTML resource cache
	app.Delete(MHTMLENDPOINT, func(c fiber.Ctx) error {
		ResourceCache = make(map[string]Resource)
		return c.JSON(fiber.Map{"msg": "ok"})
	})

	// File upload endpoint
	app.Post("/upload", func(c fiber.Ctx) error {
		dir := c.Query("dir")
		if strings.TrimSpace(dir) == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"message": "Please select a destination folder"})
		}

		file, err := c.FormFile("file")
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"message": "Invalid file upload"})
		}

		if err := saveUploadedFile(dir, file); err != nil {
			log.Printf("Upload %q to %q failed: %v", file.Filename, dir, err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "Failed to save uploaded file"})
		}

		return c.JSON(fiber.Map{"message": "File uploaded successfully"})
	})

	realhost, err := getLocalIP()
	if err != nil {
		fmt.Printf("Error getting local IPs: %v\n", err)
		return
	}

	// Start the server
	if config.Host == "0.0.0.0" {
		log.Println("Listening on 0.0.0.0")
	} else {
		realhost = config.Host
	}
	title := fmt.Sprintf("%s v%s", appInfo.Name, appInfo.Version)
	setConsoleTitle(title)
	log.Printf("%s running at http://%s:%d%s\n", title, realhost, config.Port, config.MountPoint)
	if config.OpenBrowser {
		OpenEdge(fmt.Sprintf("http://%s:%d%s", realhost, config.Port, config.MountPoint))
	}

	log.Fatal(app.Listen(fmt.Sprintf("%s:%d", config.Host, config.Port)))
}
