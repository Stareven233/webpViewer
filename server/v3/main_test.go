package main

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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
