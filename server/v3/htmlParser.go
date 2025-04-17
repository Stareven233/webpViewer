package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type Resource struct {
	Type    string
	Content []byte
}

var (
	MHTMLENDPOINT = "/mhtml-resources"
	ResourceCache = make(map[string]Resource)
)

func ParseMHTMLIndex(filePath string) ([]byte, error) {
	index, exists := ResourceCache[filePath]
	if exists {
		return index.Content, nil
	}
	err := Parse(filePath)
	if err != nil {
		return []byte(""), fmt.Errorf("failed to parse file: %v", err)
	}

	return ResourceCache[filePath].Content, nil
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
