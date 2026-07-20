---
doc_type: feature-review
feature: drive-root-picker
date: 2026-07-20
review_state: passed
reviewer: subagent
execution_lane: quick
---

## 结论
pass

## 首轮 Findings 与处置

1. **important** — hash 解析 `#/home` 塌成 computer root
   - **已修并复审通过**：`dir === '' && raw.startsWith('/')` → `dir = '/'`；盘符父路径补 `/`

2. **important** — A–Z `os.Stat` 可能阻塞
   - **已修并复审通过**：`GetLogicalDrives`；空结果 `[]`

3. **nit** — JSON `null`
   - **已修**

## 残留风险
- hash 仍把最后一段当文件名（目录-only 深链老问题）
- 默认根仍写死 `C:/`
- computer root 下上传会失败（边界）

## 验证
- `go build` 通过
- `/list?dir=` 返回盘符列表
- 独立 subagent 复审：pass
