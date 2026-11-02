package main

import (
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v3"
)

// mediaContentTypes 覆盖前端白名单里的音视频容器。
// Go 的内置 mime 表不含视频类型，系统 MIME 表缺失时会回退到 octet-stream，
// 浏览器拿到错误类型就可能拒绝解码，因此这里显式兜底。
var mediaContentTypes = map[string]string{
	".mp4":  "video/mp4",
	".m4v":  "video/mp4",
	".mov":  "video/quicktime",
	".webm": "video/webm",
	".ogv":  "video/ogg",
	".ogg":  "video/ogg",
	".mkv":  "video/x-matroska",
	".mp3":  "audio/mpeg",
	".m4a":  "audio/mp4",
	".aac":  "audio/aac",
	".flac": "audio/flac",
	".wav":  "audio/wav",
	".opus": "audio/ogg",
	".oga":  "audio/ogg",
}

// contentTypeOf 按扩展名推断媒体类型；未注册的扩展名回退为通用二进制流。
func contentTypeOf(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	if contentType, ok := mediaContentTypes[ext]; ok {
		return contentType
	}
	if contentType := mime.TypeByExtension(ext); contentType != "" {
		return contentType
	}
	return "application/octet-stream"
}

// parseRange 解析单区间 Range 头。
// ranged 为 false 表示按整份文件响应；err 非 nil 表示区间非法（调用方应回 416）。
// 多区间请求（含逗号）直接当作整份响应：浏览器播放器只会发单区间。
func parseRange(header string, size int64) (start, end int64, ranged bool, err error) {
	header = strings.TrimSpace(header)
	if !strings.HasPrefix(header, "bytes=") || size <= 0 {
		return 0, 0, false, nil
	}

	spec := strings.TrimSpace(strings.TrimPrefix(header, "bytes="))
	if spec == "" || strings.Contains(spec, ",") {
		return 0, 0, false, nil
	}

	rawStart, rawEnd, ok := strings.Cut(spec, "-")
	if !ok {
		return 0, 0, false, nil
	}
	rawStart, rawEnd = strings.TrimSpace(rawStart), strings.TrimSpace(rawEnd)

	// "bytes=-N"：请求末尾 N 字节，播放器拖到结尾附近时会用到。
	if rawStart == "" {
		suffix, convErr := strconv.ParseInt(rawEnd, 10, 64)
		if convErr != nil || suffix <= 0 {
			return 0, 0, false, fmt.Errorf("invalid suffix range %q", spec)
		}
		if suffix > size {
			suffix = size
		}
		return size - suffix, size - 1, true, nil
	}

	start, convErr := strconv.ParseInt(rawStart, 10, 64)
	if convErr != nil || start < 0 {
		return 0, 0, false, fmt.Errorf("invalid range start %q", spec)
	}
	if start >= size {
		return 0, 0, false, fmt.Errorf("range start %d exceeds file size %d", start, size)
	}
	// "bytes=N-"：从 N 到文件末尾。
	if rawEnd == "" {
		return start, size - 1, true, nil
	}

	end, convErr = strconv.ParseInt(rawEnd, 10, 64)
	if convErr != nil || end < start {
		return 0, 0, false, fmt.Errorf("invalid range end %q", spec)
	}
	if end >= size {
		end = size - 1
	}
	return start, end, true, nil
}

// intSize 把字节长度转换成 SendStream 需要的 int。
// 32 位主机上超过 int 上限的响应会被拒绝，避免长度被截断成错误的 Content-Length。
func intSize(length int64) (int, error) {
	value := int(length)
	if int64(value) != length {
		return 0, fmt.Errorf("response size %d exceeds platform int limit", length)
	}
	return value, nil
}

// limitedFile 把“文件剩余区间”包装成 io.ReadCloser。
// io.LimitReader 不实现 Closer，直接使用会绕过 fasthttp 的自动关闭，导致句柄泄漏。
type limitedFile struct {
	file      *os.File
	remaining int64
}

func (r *limitedFile) Read(p []byte) (int, error) {
	if r.remaining <= 0 {
		return 0, io.EOF
	}
	if int64(len(p)) > r.remaining {
		p = p[:r.remaining]
	}
	n, err := r.file.Read(p)
	r.remaining -= int64(n)
	return n, err
}

func (r *limitedFile) Close() error {
	return r.file.Close()
}

// serveStream 以 HTTP Range 增量返回文件，供浏览器边下边播、拖动进度即时响应。
// 文件内容始终以流的方式写回，绝不会整份读入内存。
func serveStream(c fiber.Ctx, filePath, name string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return c.Status(fiber.StatusNotFound).SendString(err.Error())
	}
	// 成功交给 SendStream 的文件所有权由 fasthttp 在写完 body 时关闭（实现 io.Closer 即自动 Close）；
	// 任何提前返回都必须自己关，避免文件句柄泄漏。
	streamed := false
	defer func() {
		if !streamed {
			file.Close()
		}
	}()

	info, err := file.Stat()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).SendString(err.Error())
	}
	if info.IsDir() {
		return c.Status(fiber.StatusBadRequest).SendString("directory cannot be streamed")
	}

	size := info.Size()
	// 浏览器据此判断文件支持断点/拖动。
	c.Set(fiber.HeaderAcceptRanges, "bytes")
	c.Set(fiber.HeaderContentType, contentTypeOf(name))

	start, end, ranged, err := parseRange(c.Get(fiber.HeaderRange), size)
	if err != nil {
		c.Set(fiber.HeaderContentRange, "bytes */"+strconv.FormatInt(size, 10))
		return c.Status(fiber.StatusRequestedRangeNotSatisfiable).SendString(err.Error())
	}

	length := size
	if ranged {
		length = end - start + 1
		if _, err := file.Seek(start, io.SeekStart); err != nil {
			return c.Status(fiber.StatusInternalServerError).SendString(err.Error())
		}
		c.Status(fiber.StatusPartialContent)
		c.Set(fiber.HeaderContentRange, fmt.Sprintf("bytes %d-%d/%d", start, end, size))
	}

	streamLength, err := intSize(length)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).SendString(err.Error())
	}
	if ranged {
		// 限定读取区间，避免把文件剩余部分一起写出去。
		streamed = true
		return c.SendStream(&limitedFile{file: file, remaining: length}, streamLength)
	}
	streamed = true
	return c.SendStream(file, streamLength)
}
