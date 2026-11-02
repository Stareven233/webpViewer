package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type Resource struct {
	Type    string
	Content []byte
}

var (
	MHTMLENDPOINT = "/mhtml-resources"
	// Fiber 的 handler 是并发执行的，ResourceCache 必须加锁：
	// 并发写普通 map 会触发 Go 的 fatal error 直接杀掉进程，让页面彻底无法加载。
	resourceCacheMu sync.RWMutex
	ResourceCache   = make(map[string]Resource)
)

func cacheGet(key string) (Resource, bool) {
	resourceCacheMu.RLock()
	defer resourceCacheMu.RUnlock()
	res, ok := ResourceCache[key]
	return res, ok
}

func cacheSet(key string, res Resource) {
	resourceCacheMu.Lock()
	defer resourceCacheMu.Unlock()
	ResourceCache[key] = res
}

func cacheReset() {
	resourceCacheMu.Lock()
	defer resourceCacheMu.Unlock()
	ResourceCache = make(map[string]Resource)
}

func ParseMHTMLIndex(filePath string) ([]byte, error) {
	if index, exists := cacheGet(filePath); exists {
		return index.Content, nil
	}
	err := Parse(filePath)
	if err != nil {
		return []byte(""), fmt.Errorf("failed to parse file: %v", err)
	}

	index, exists := cacheGet(filePath)
	if !exists {
		return []byte(""), fmt.Errorf("parsed mhtml but index is missing")
	}
	return index.Content, nil
}

func CheckHTMLResource(filePath string) (string, string, error) {
	ext := filepath.Ext(filePath)
	if ext != ".html" {
		return "", "", fmt.Errorf("checkHTMLResource: not html file: %s", filePath)
	}

	dirName := strings.TrimSuffix(filePath, ext) + "_files"
	if _, err := os.Stat(dirName); err != nil {
		return "", "", nil
	}

	stem := "/" + filepath.Base(dirName)
	return dirName, stem, nil
}
