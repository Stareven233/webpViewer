package main

import (
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/static"
)

const (
	host       = "0.0.0.0"
	port       = 4412
	mountPoint = "/index"
	appRoot    = "./dist"
)

func main() {
	app := fiber.New()
	// Serve static files for the mount point
	app.Get(fmt.Sprintf("%s/*", mountPoint), static.New(appRoot))

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

	// Start the server
	log.Printf("App running at http://%s:%d%s", host, port, mountPoint)
	log.Fatal(app.Listen(fmt.Sprintf("%s:%d", host, port)))
}
