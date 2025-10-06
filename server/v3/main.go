package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"gopkg.in/yaml.v2"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/static"
)

// 在 const 声明之后添加配置结构体定义
type Config struct {
	Host       string `yaml:"host"`
	Port       int    `yaml:"port"`
	MountPoint string `yaml:"mountPoint"`
	AppRoot    string `yaml:"appRoot"`
	BodyLimit  int    `yaml:"bodyLimit"`
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

	// List directory contents
	app.Get("/list", func(c fiber.Ctx) error {
		pwd := c.Query("dir")
		if pwd == "" {
			pwd = "C:/"
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
			stat, err := os.Lstat(filePath)
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
		file, err := c.FormFile("file")
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"message": "Invalid file upload"})
		}

		src, err := file.Open()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "Failed to open uploaded file"})
		}
		defer src.Close()

		dstPath := filepath.Join(dir, file.Filename)
		dst, err := os.Create(dstPath)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "Failed to create file"})
		}
		defer dst.Close()

		if _, err := io.Copy(dst, src); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "Failed to save file"})
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

	log.Fatal(app.Listen(fmt.Sprintf("%s:%d", config.Host, config.Port)))
}
