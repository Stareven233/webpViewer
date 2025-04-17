// https://github.com/gonejack/mhtml-to-html
package main

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/textproto"
	"os"
	"regexp"
	"strings"
	"unicode"

	"github.com/PuerkitoBio/goquery"
)

const defaultContentType = "text/html; charset=utf-8"

// ErrMissingBoundary is returned when there is no boundary given for a multipart entity
var ErrMissingBoundary = errors.New("no boundary found for multipart entity")

// ErrMissingContentType is returned when there is no "Content-Type" header for a MIME entity
var ErrMissingContentType = errors.New("no Content-Type found for MIME entity")

var reRemoveHash = regexp.MustCompile(`#.*`)
var reSeparator = regexp.MustCompile(`/|\\`)

func getPathBase(path string, strict bool) string {
	// 取路径最后一部分，包含后缀名；
	// 去除#开头的子串并转义，避免充当url时被判定为hash
	var t = reSeparator.Split(path, -1)
	var p = t[len(t)-1]
	if strict {
		p = reRemoveHash.ReplaceAllString(p, "")
		// p = url.PathEscape(p)
	}
	return p
}

type part struct {
	header textproto.MIMEHeader
	body   []byte
}

func parseMIMEParts(hs textproto.MIMEHeader, b io.Reader) ([]*part, error) {
	var ps []*part
	// If no content type is given, set it to the default
	if _, ok := hs["Content-Type"]; !ok {
		hs.Set("Content-Type", defaultContentType)
	}
	ct, params, err := mime.ParseMediaType(hs.Get("Content-Type"))
	if err != nil {
		return ps, fmt.Errorf("parse content-type [%s] failed: %s", hs.Get("Content-Type"), err)
	}
	// If it's a multipart email, recursively parse the parts
	if strings.HasPrefix(ct, "multipart/") {
		if _, ok := params["boundary"]; !ok {
			return ps, ErrMissingBoundary
		}
		mr := multipart.NewReader(b, params["boundary"])
		for {
			var buf bytes.Buffer
			p, err := mr.NextPart()
			if err == io.EOF {
				break
			}
			if err != nil {
				return ps, err
			}
			if _, ok := p.Header["Content-Type"]; !ok {
				p.Header.Set("Content-Type", defaultContentType)
			}
			subct, _, err := mime.ParseMediaType(p.Header.Get("Content-Type"))
			if err != nil {
				return ps, err
			}
			if strings.HasPrefix(subct, "multipart/") {
				sps, err := parseMIMEParts(p.Header, p)
				if err != nil {
					return ps, err
				}
				ps = append(ps, sps...)
			} else {
				var reader io.Reader
				reader = p
				const cte = "Content-Transfer-Encoding"
				if p.Header.Get(cte) == "base64" {
					reader = base64.NewDecoder(base64.StdEncoding, reader)
				}
				// Otherwise, just append the part to the list
				// Copy the part data into the buffer
				if _, err := io.Copy(&buf, reader); err != nil {
					return ps, err
				}
				ps = append(ps, &part{body: buf.Bytes(), header: p.Header})
			}
		}
	} else {
		// If it is not a multipart email, parse the body content as a single "part"
		switch hs.Get("Content-Transfer-Encoding") {
		case "quoted-printable":
			b = quotedprintable.NewReader(b)
		case "base64":
			b = base64.NewDecoder(base64.StdEncoding, b)
		}
		var buf bytes.Buffer
		if _, err := io.Copy(&buf, b); err != nil {
			return ps, err
		}
		ps = append(ps, &part{body: buf.Bytes(), header: hs})
	}
	return ps, nil
}

func rewriteRef(e *goquery.Selection, ref_maps map[string]string) {
	attr := "src"
	switch e.Get(0).Data {
	case "img":
		e.RemoveAttr("loading")
		e.RemoveAttr("srcset")
	case "link":
		attr = "href"
	}
	ref, _ := e.Attr(attr)
	local, exist := ref_maps[ref]
	if exist {
		e.SetAttr(attr, local)
	}
}

type trimReader struct {
	rd      io.Reader
	trimmed bool
}

func (tr *trimReader) Read(buf []byte) (int, error) {
	n, err := tr.rd.Read(buf)
	if err != nil {
		return n, err
	}
	if !tr.trimmed {
		t := bytes.TrimLeftFunc(buf[:n], tr.isSpace)
		tr.trimmed = true
		n = copy(buf, t)
	}
	return n, err
}

func (tr *trimReader) isSpace(r rune) bool {
	const (
		ZWSP   = '\u200B' // ZWSP represents zero-width space.
		ZWNBSP = '\uFEFF' // ZWNBSP represents zero-width no-break space.
		ZWJ    = '\u200D' // ZWJ represents zero-width joiner.
		ZWNJ   = '\u200C' // ZWNJ represents zero-width non-joiner.
	)
	switch r {
	case ZWSP, ZWNBSP, ZWJ, ZWNJ:
		return true
	default:
		return unicode.IsSpace(r)
	}
}

func Parse(mhtPath string) error {
	fd, err := os.Open(mhtPath)
	if err != nil {
		return err
	}
	defer fd.Close()
	tp := textproto.NewReader(bufio.NewReader(&trimReader{rd: fd}))
	hdr, err := tp.ReadMIMEHeader()
	if err != nil {
		return err
	}
	parts, err := parseMIMEParts(hdr, tp.R)
	if err != nil {
		return err
	}
	var html *part
	var uri_base = getPathBase(mhtPath, true)
	var ref_maps = make(map[string]string)

	for idx, part := range parts {
		contentType := part.header.Get("Content-Type")
		if contentType == "" {
			return ErrMissingContentType
		}
		mimetype, _, err := mime.ParseMediaType(contentType)
		if err != nil {
			return err
		}
		if html == nil && mimetype == "text/html" {
			html = part
			continue
		}

		ref := part.header.Get("Content-Location")
		uri := fmt.Sprintf("%s@%d-%s", uri_base, idx, getPathBase(ref, false))
		ref_maps[ref] = fmt.Sprintf("%s/%s", MHTMLENDPOINT, uri)
		ResourceCache[uri] = Resource{contentType, part.body}
	}

	if html == nil {
		return errors.New("html not found")
	}

	doc, err := goquery.NewDocumentFromReader(bytes.NewReader(html.body))
	if err != nil {
		return err
	}
	doc.Find("img,link,script").Each(func(i int, e *goquery.Selection) {
		rewriteRef(e, ref_maps)
	})
	txt, err := doc.Html()
	ResourceCache[mhtPath] = Resource{"text/html", []byte(txt)}
	return err
}
