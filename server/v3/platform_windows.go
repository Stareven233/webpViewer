//go:build windows

package main

import (
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"unsafe"
)

// setConsoleTitle 使用 Windows Console API 设置标题；其他平台由对应实现安全忽略。
func setConsoleTitle(title string) error {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	proc := kernel32.NewProc("SetConsoleTitleW")

	ptr, err := syscall.UTF16PtrFromString(title)
	if err != nil {
		return err
	}

	proc.Call(uintptr(unsafe.Pointer(ptr)))
	return nil
}

// openBrowser 通过 Windows shell 打开默认浏览器，不依赖 Edge 是否已安装。
func openBrowser(address string) error {
	return exec.Command("cmd", "/c", "start", "", address).Start()
}

// listComputerRoot 返回当前 Windows 主机可用的盘符。
func listComputerRoot() []map[string]any {
	drives := make([]map[string]any, 0)

	// GetLogicalDrives 避免 Stat 空软盘或光驱时发生阻塞。
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	proc := kernel32.NewProc("GetLogicalDrives")
	ret, _, callErr := proc.Call()
	if ret == 0 {
		// 此函数不能返回 error；失败时返回空列表并记录原因。
		// 调用方仍会得到合法 JSON 数组，而不会误将 C:/ 当作跨平台默认路径。
		fmt.Printf("GetLogicalDrives failed: %v\n", callErr)
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

// resolveWindowsShortcut 使用 Windows Script Host 读取 .lnk 目标路径。
func resolveWindowsShortcut(filePath string) (string, error) {
	// 路径通过环境变量传入，避免快捷方式名称被拼入 PowerShell 脚本造成命令注入。
	// PowerShell 5.1 的标准输出仍受当前控制台代码页影响，直接输出中文会变成乱码；
	// 因此使用 UTF-8 Base64 传回，Go 端解码后可稳定保留 Unicode 路径。
	command := exec.Command(
		"powershell",
		"-NoProfile",
		"-NonInteractive",
		"-ExecutionPolicy", "Bypass",
		"-Command", "$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($env:WEBP_VIEWER_SHORTCUT); $bytes = [Text.Encoding]::UTF8.GetBytes([string]$shortcut.TargetPath); [Console]::Out.Write([Convert]::ToBase64String($bytes))",
	)
	command.Env = append(os.Environ(), "WEBP_VIEWER_SHORTCUT="+filePath)
	output, err := command.Output()
	if err != nil {
		return "", fmt.Errorf("read Windows shortcut target: %w", err)
	}

	decodedTargetPath, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(output)))
	if err != nil {
		return "", fmt.Errorf("decode Windows shortcut target: %w", err)
	}
	targetPath := string(decodedTargetPath)
	if targetPath == "" {
		return "", fmt.Errorf("Windows shortcut has no local target")
	}
	return targetPath, nil
}
