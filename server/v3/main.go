package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/url"
	"os"
	"path/filepath"
	"strings"

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

// linkTarget 是链接文件解析后返回给前端的目标信息。路径统一转成“/”，
// 以匹配前端路由和 URL hash 使用的跨平台路径表示。
type linkTarget struct {
	Path        string `json:"path"`
	IsDirectory bool   `json:"isDirectory"`
}

// resolveLinkTarget 统一支持两类本地链接：文件系统符号链接，以及 Windows .lnk 快捷方式。
// .lnk 的解析必须在服务端执行，浏览器无法读取 Windows Shell 的快捷方式元数据。
func resolveLinkTarget(filePath string) (linkTarget, error) {
	linkInfo, err := os.Lstat(filePath)
	if err != nil {
		return linkTarget{}, fmt.Errorf("read link metadata: %w", err)
	}

	var targetPath string
	switch {
	case linkInfo.Mode()&os.ModeSymlink != 0:
		targetPath, err = filepath.EvalSymlinks(filePath)
		if err != nil {
			return linkTarget{}, fmt.Errorf("resolve symbolic link: %w", err)
		}
	case strings.EqualFold(filepath.Ext(filePath), ".lnk"):
		targetPath, err = resolveWindowsShortcut(filePath)
		if err != nil {
			return linkTarget{}, err
		}
	default:
		return linkTarget{}, fmt.Errorf("file is not a supported local link")
	}

	targetInfo, err := os.Stat(targetPath)
	if err != nil {
		return linkTarget{}, fmt.Errorf("read link target: %w", err)
	}

	return linkTarget{
		Path:        filepath.ToSlash(targetPath),
		IsDirectory: targetInfo.IsDir(),
	}, nil
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
		pwd := c.Query("dir")
		// 无论请求是否显式携带 dir=，空路径都表示“设备”根视图，
		// 由当前平台返回盘符列表或 Unix 根目录，避免 Linux 误访问 C:/。
		if pwd == "" {
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
			filePath := filepath.Join(pwd, file.Name())
			linkInfo, err := os.Lstat(filePath)
			if err != nil {
				log.Printf("Error reading link metadata: %v", err)
				continue
			}

			// Stat 会跟随符号链接，因此链接到目录时仍可作为目录进入；
			// 若链接已失效，则保留其自身信息，使前端仍可展示错误状态而不是静默消失。
			stat, err := os.Stat(filePath)
			if err != nil {
				stat = linkInfo
			}
			// 符号链接指向目录时也按“链接文件”展示，用户可在 DataPanel 中查看并跳转，
			// 而不是误把链接目录当作真实目录直接进入。
			isLink := linkInfo.Mode()&os.ModeSymlink != 0 || strings.EqualFold(filepath.Ext(file.Name()), ".lnk")

			fileInfo := map[string]any{
				"name":        file.Name(),
				"size":        stat.Size(),
				"mtime":       stat.ModTime().UnixMilli(),
				"isFile":      isLink || !stat.IsDir(),
				"isDirectory": !isLink && stat.IsDir(),
				"isLink":      isLink,
			}
			fileArr = append(fileArr, fileInfo)
		}

		return c.JSON(fileArr)
	})

	// Resolve a local link without exposing this host's paths for ordinary files.
	// Only .lnk files and filesystem symbolic links can return a target.
	app.Get("/link-target", func(c fiber.Ctx) error {
		pwd := c.Query("dir")
		name := c.Query("name")
		if pwd == "" || name == "" {
			return c.Status(fiber.StatusBadRequest).SendString("Missing 'dir' or 'name' query parameter")
		}

		target, err := resolveLinkTarget(filepath.Join(pwd, name))
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"message": err.Error()})
		}
		return c.JSON(target)
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
		if err := openBrowser(fmt.Sprintf("http://%s:%d%s", realhost, config.Port, config.MountPoint)); err != nil {
			log.Printf("Open browser failed: %v", err)
		}
	}

	log.Fatal(app.Listen(fmt.Sprintf("%s:%d", config.Host, config.Port)))
}
