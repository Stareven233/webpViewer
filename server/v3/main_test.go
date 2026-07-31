package main

import (
	"bytes"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
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
