package main

import (
	"bytes"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/gofiber/fiber/v3"
)

func newUploadFileHeader(t *testing.T, fileName, content string) *multipart.FileHeader {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		t.Fatalf("create multipart field: %v", err)
	}
	if _, err := part.Write([]byte(content)); err != nil {
		t.Fatalf("write multipart content: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/upload", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	if err := request.ParseMultipartForm(int64(body.Len())); err != nil {
		t.Fatalf("parse multipart request: %v", err)
	}

	return request.MultipartForm.File["file"][0]
}

func TestSaveUploadedFileWritesCompleteFileAndReplacesExistingContent(t *testing.T) {
	dir := t.TempDir()
	fileName := "first-upload.txt"

	if err := saveUploadedFile(dir, newUploadFileHeader(t, fileName, "first upload")); err != nil {
		t.Fatalf("save first upload: %v", err)
	}
	if err := saveUploadedFile(dir, newUploadFileHeader(t, fileName, "retry upload")); err != nil {
		t.Fatalf("replace upload on retry: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(dir, fileName))
	if err != nil {
		t.Fatalf("read uploaded file: %v", err)
	}
	if actual := string(content); actual != "retry upload" {
		t.Fatalf("unexpected uploaded content: got %q", actual)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read upload directory: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("temporary upload file was not cleaned up: got %d entries", len(entries))
	}
}

func TestSaveUploadedFileRejectsEmptyDestination(t *testing.T) {
	if err := saveUploadedFile("", newUploadFileHeader(t, "file.txt", "content")); err == nil {
		t.Fatal("expected an empty destination to be rejected")
	}
}

func TestResolveLinkTargetFollowsSymbolicLink(t *testing.T) {
	dir := t.TempDir()
	targetPath := filepath.Join(dir, "actual.txt")
	if err := os.WriteFile(targetPath, []byte("target"), 0o600); err != nil {
		t.Fatalf("write target: %v", err)
	}

	linkPath := filepath.Join(dir, "shortcut")
	if err := os.Symlink(targetPath, linkPath); err != nil {
		// Windows machines without Developer Mode or the symlink privilege cannot create
		// a test link. The production resolver remains covered on capable hosts.
		t.Skipf("create symbolic link: %v", err)
	}

	target, err := resolveLinkTarget(linkPath)
	if err != nil {
		// 部分受限 Windows 环境可创建链接但禁止解析目标；这类主机无法验证链接能力。
		if runtime.GOOS == "windows" && errors.Is(err, os.ErrPermission) {
			t.Skipf("resolve symbolic link: %v", err)
		}
		t.Fatalf("resolve symbolic link: %v", err)
	}
	if target.Path != filepath.ToSlash(targetPath) {
		t.Fatalf("unexpected target path: got %q, want %q", target.Path, filepath.ToSlash(targetPath))
	}
	if target.IsDirectory {
		t.Fatal("file target was reported as a directory")
	}
}

func TestResolveLinkTargetRejectsRegularFile(t *testing.T) {
	filePath := filepath.Join(t.TempDir(), "regular.txt")
	if err := os.WriteFile(filePath, []byte("not a link"), 0o600); err != nil {
		t.Fatalf("write regular file: %v", err)
	}

	if _, err := resolveLinkTarget(filePath); err == nil {
		t.Fatal("expected a regular file to be rejected as a link")
	}
}

func TestParseRange(t *testing.T) {
	const size = 1000

	tests := []struct {
		name    string
		header  string
		start   int64
		end     int64
		ranged  bool
		wantErr bool
	}{
		{name: "no range header", header: ""},
		{name: "non byte unit", header: "items=0-10"},
		// 多区间浏览器播放器不会发送，统一回退为整份响应。
		{name: "multiple ranges fall back to full", header: "bytes=0-9,20-29"},
		{name: "closed range", header: "bytes=0-99", start: 0, end: 99, ranged: true},
		{name: "open ended range", header: "bytes=100-", start: 100, end: 999, ranged: true},
		{name: "suffix range", header: "bytes=-100", start: 900, end: 999, ranged: true},
		{name: "suffix larger than file", header: "bytes=-5000", start: 0, end: 999, ranged: true},
		{name: "end beyond file is clamped", header: "bytes=990-5000", start: 990, end: 999, ranged: true},
		{name: "start beyond file", header: "bytes=1000-", wantErr: true},
		{name: "end before start", header: "bytes=500-100", wantErr: true},
		{name: "empty suffix", header: "bytes=-", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			start, end, ranged, err := parseRange(tt.header, size)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected an error for %q", tt.header)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error for %q: %v", tt.header, err)
			}
			if ranged != tt.ranged || start != tt.start || end != tt.end {
				t.Fatalf("unexpected result for %q: got (%d, %d, %v), want (%d, %d, %v)",
					tt.header, start, end, ranged, tt.start, tt.end, tt.ranged)
			}
		})
	}
}

// newStreamTestApp 构造一个只挂载 /files 的最小应用，用于验证流式响应。
func newStreamTestApp() *fiber.App {
	app := fiber.New()
	app.Get("/files", func(c fiber.Ctx) error {
		dir, name := c.Query("dir"), c.Query("name")
		if dir == "" || name == "" {
			return c.Status(fiber.StatusBadRequest).SendString("missing query parameter")
		}
		return serveStream(c, filepath.Join(dir, name), name)
	})
	return app
}

func TestServeStreamReturnsPartialContent(t *testing.T) {
	dir := t.TempDir()
	content := make([]byte, 1000)
	for i := range content {
		content[i] = byte(i % 251)
	}
	if err := os.WriteFile(filepath.Join(dir, "clip.mp4"), content, 0o600); err != nil {
		t.Fatalf("write media file: %v", err)
	}

	app := newStreamTestApp()
	request := httptest.NewRequest(http.MethodGet, "/files?dir="+dir+"&name=clip.mp4", nil)
	request.Header.Set(fiber.HeaderRange, "bytes=100-199")
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("send range request: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != fiber.StatusPartialContent {
		t.Fatalf("unexpected status: got %d, want %d", response.StatusCode, fiber.StatusPartialContent)
	}
	if got := response.Header.Get(fiber.HeaderContentRange); got != "bytes 100-199/1000" {
		t.Fatalf("unexpected content range: %q", got)
	}
	if got := response.Header.Get(fiber.HeaderAcceptRanges); got != "bytes" {
		t.Fatalf("unexpected accept ranges: %q", got)
	}
	if got := response.Header.Get(fiber.HeaderContentType); got != "video/mp4" {
		t.Fatalf("unexpected content type: %q", got)
	}

	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}
	if !bytes.Equal(body, content[100:200]) {
		t.Fatalf("unexpected body: got %d bytes", len(body))
	}
}

func TestServeStreamFallsBackToFullContent(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "clip.webm"), []byte("abcdef"), 0o600); err != nil {
		t.Fatalf("write media file: %v", err)
	}

	app := newStreamTestApp()
	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/files?dir="+dir+"&name=clip.webm", nil))
	if err != nil {
		t.Fatalf("send full request: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != fiber.StatusOK {
		t.Fatalf("unexpected status: got %d, want %d", response.StatusCode, fiber.StatusOK)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}
	if string(body) != "abcdef" {
		t.Fatalf("unexpected body: %q", string(body))
	}
}

func TestServeStreamRejectsInvalidRange(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "clip.mp4"), []byte("abcdef"), 0o600); err != nil {
		t.Fatalf("write media file: %v", err)
	}

	app := newStreamTestApp()
	request := httptest.NewRequest(http.MethodGet, "/files?dir="+dir+"&name=clip.mp4", nil)
	request.Header.Set(fiber.HeaderRange, "bytes=100-")
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("send invalid range request: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != fiber.StatusRequestedRangeNotSatisfiable {
		t.Fatalf("unexpected status: got %d, want %d", response.StatusCode, fiber.StatusRequestedRangeNotSatisfiable)
	}
	if got := response.Header.Get(fiber.HeaderContentRange); got != "bytes */6" {
		t.Fatalf("unexpected content range: %q", got)
	}
}

func TestResolveLinkTargetFollowsWindowsShortcut(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows shortcut files are only available on Windows")
	}

	dir := t.TempDir()
	// 目标和快捷方式均使用中文，确保 PowerShell 到 Go 的路径传递不依赖当前控制台代码页。
	targetDir := filepath.Join(dir, "中文目录")
	if err := os.Mkdir(targetDir, 0o700); err != nil {
		t.Fatalf("create Unicode target directory: %v", err)
	}
	targetPath := filepath.Join(targetDir, "真实文件.md")
	if err := os.WriteFile(targetPath, []byte("target"), 0o600); err != nil {
		t.Fatalf("write shortcut target: %v", err)
	}

	shortcutPath := filepath.Join(dir, "中文快捷方式.lnk")
	command := exec.Command(
		"powershell",
		"-NoProfile",
		"-NonInteractive",
		"-Command", "$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($env:WEBP_VIEWER_SHORTCUT); $shortcut.TargetPath = $env:WEBP_VIEWER_TARGET; $shortcut.Save()",
	)
	command.Env = append(os.Environ(), "WEBP_VIEWER_SHORTCUT="+shortcutPath, "WEBP_VIEWER_TARGET="+targetPath)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("create Windows shortcut: %v: %s", err, output)
	}

	target, err := resolveLinkTarget(shortcutPath)
	if err != nil {
		t.Fatalf("resolve Windows shortcut: %v", err)
	}
	if target.Path != filepath.ToSlash(targetPath) {
		t.Fatalf("unexpected shortcut target path: got %q, want %q", target.Path, filepath.ToSlash(targetPath))
	}
	if target.IsDirectory {
		t.Fatal("file shortcut target was reported as a directory")
	}
}
