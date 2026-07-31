//go:build !windows

package main

import (
	"fmt"
	"os/exec"
	"runtime"
)

// setConsoleTitle 在非 Windows 平台中无需调用 Console API，保留调用点以统一启动流程。
func setConsoleTitle(string) error {
	return nil
}

// openBrowser 使用当前桌面环境的标准工具唤起默认浏览器。
func openBrowser(address string) error {
	if runtime.GOOS == "darwin" {
		return exec.Command("open", address).Start()
	}
	return exec.Command("xdg-open", address).Start()
}

// listComputerRoot 将 Unix 文件系统根目录作为“设备”列表中的唯一入口。
func listComputerRoot() []map[string]any {
	return []map[string]any{{
		"name":        "/",
		"size":        int64(-1),
		"mtime":       int64(0),
		"isFile":      false,
		"isDirectory": true,
	}}
}

// 非 Windows 平台不支持 Windows Shell 快捷方式；符号链接仍由通用逻辑处理。
func resolveWindowsShortcut(string) (string, error) {
	return "", fmt.Errorf("Windows shortcut files are unsupported on %s", runtime.GOOS)
}
