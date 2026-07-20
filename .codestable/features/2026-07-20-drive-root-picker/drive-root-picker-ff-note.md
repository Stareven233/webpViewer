---
doc_type: feature-ff-note
feature: drive-root-picker
date: 2026-07-20
requirement:
tags: [file-explorer, windows-drives, navigation]
execution_lane: quick
---

## 做了什么
文件浏览器不断点“上一级”时，到达盘符根 / Unix 根后再上一级进入“此电脑”视图；Windows 列出可用盘符，Linux 显示 `/`，可再进入对应根目录。

## 改了哪些
- [server/v3/main.go](server/v3/main.go) — `/list?dir=` 返回 computer root；Windows 用 `GetLogicalDrives` 枚举盘符，Unix 返回 `/`；空结果保证是 `[]`
- [src/utils/format.ts](src/utils/format.ts) — `COMPUTER_ROOT` / `parent_of` / 重写 `path_join`，盘符根上一级变为 computer root
- [src/components/FileExplorer.tsx](src/components/FileExplorer.tsx) — `goParent`、从 computer root 进入盘符、空路径 resource 拉取、地址栏显示“此电脑”；hash 解析避免 `#/home` 塌成 computer root
- [README.md](README.md) — TODO 中盘符选择项勾掉

## 怎么验证的
- `go build` 通过；临时跑 v3 server：`GET /list?dir=` 返回 `C:` / `D:` 等盘符
- 手写 `path_join` / `parent_of` 用例：`C:/`+`..`→`''`，`/home`+`..`→`/`，`C:/Users/a`+`..`→`C:/Users`
- 审查反馈后修复：hash 对 Unix 单层路径、`GetLogicalDrives` 替代 A–Z Stat
- 未做完整浏览器 E2E（需本地 `pnpm dev` + 后端）；`tsc` 仅见既有 `touch.ts` 报错

## 顺手发现（可选，不阻塞）
- 默认根仍写死 `C:/`（store + server），Linux 首次进入会先失败，可再上一级进此电脑
- hash 仍把最后一段当文件名（目录-only 深链的老问题）
