---
doc_type: issue-report
issue: exe-preview-stuck
type: bug
status: closed
severity: high
tags: [web-preview, solid-resource, freeze, keyboard-navigation]
created: 2026-11-07
closed: 2026-11-08
---

# 键盘翻页经过 exe 后，文本文件预览暂时卡住

## 关闭结论

- **根因已确认**：`blob` 资源在不支持预览的类型（exe）上 source 变为 `undefined`，Solid 保持旧值且不再触发 fetcher；紧接着切到文本文件时，新请求尚未返回，`textSource()` 读到上一个文本文件的旧 Blob，把那份（可能很大的）旧文本再整份解码一次，主线程被占住，直到真正的内容到达才自行恢复。
- **修复**：`src/components/DataPanel.tsx` 三处守卫（主动 abort / `blob.loading` 时返回 `undefined` / `nextPaint()` 后复核再解码），已在主人本机（Edge、真实操作节奏）实测复现消失。
- 质量证据：exe → 文本（`.txt` / `.tsx` / `.json`）翻页即时渲染，无卡顿、无 7% CPU 长尾、控制台无报错；直连与经 exe 中转路径表现一致。
- 回写位置：根 issue，无 epic 关联，未改动 spec 层文档。
- 遗留：无。`.exe` 仍走 unsupported 分支（只保留悬浮栏下载入口），设计未变。

## 现象

在 `DataPanel` 显示文件时按 `w` / `s` 上下翻页：若中间经过 `.exe` 文件，紧接着的纯文本文件（`.txt` / `.tsx` / `.json` 均可复现）预览会短暂卡住，之后自己恢复并跳到该文件。控制台无报错，不弹“网页无响应”。

- 复现条件：`exe` → 文本文件，慢速单按也能复现，不依赖连按。
- CPU：平时几乎为 0%，卡住时约 7% 持续一段时间后恢复。
- 影响面：仅预览区；文件列表与悬浮栏（下载/复制）仍可点。

最小场景（主人目录 `D:\t\test`）：`NOTICE`（unsupported）→ 或 `wsmc`、`qingjian` exe → `.txt/.tsx/.json` 文本文件。

## 期望 / 实际

- 期望：`w` / `s` 翻页后立即渲染下一个文件的文本预览。
- 实际：经过 exe 后，下一个文本文件会卡住一段时间才自行跳到该文件；同为 jpg/png、html 等不经 exe 中转时不易复现。

## 根因

`DataPanel.tsx` 里的预览内容链是 `blob`（`createResource`）→ `textSource()` → `decodeText()`（`nextPaint()` + `content.text()`）→ `TextPanel`。

`blob` 的 source 是 `previewKind() !== 'unsupported' && !isStreamKind() ? [currentFile(), retryTick()] : undefined`，而 **`.exe` 是白名单里唯一的非流式 unsupported 类型**，前端不为它发请求。于是：

1. 切到 exe 时 source 变 `undefined`，`createResource` 既不刷新也不清空，`blob()` 仍保留上一个文本文件的旧 Blob；同时因为“下一次 `fetchBlob` 才会 abort 上一次请求”的写法，这时也没有任何东西去中止仍在传输的旧请求。
2. 再切到文本文件时 source 恢复，新请求刚发出、`blob.loading === true`，但 `blob()` 仍是旧值。`textSource()` 不加判断地返回旧 Blob，`decodeText()` 便把上一份（可能很大的）文本整份 `text()` 解码一遍 —— 这就是 7% CPU、预览区不更新、随后自行恢复的来源（图片类只做 objectURL、不解码，所以不经 exe 时更不容易命中）。
3. 直接 text → text 也走同一条链，但 `fetchBlob()` 一进来就 `abort()` 上一次请求，脏窗口更短，实际难以稳定命中。

修复（`src/components/DataPanel.tsx`）：

- 切到 `unsupported` / 流式类型时主动 `loadController?.abort()`；
- `textSource()` 在 `blob.loading` 时返回 `undefined`，绝不把旧 Blob 送进解码；
- `decodeText()` 在 `nextPaint()` 后复核 `previewKind` / `blob.loading` / `safeBlob() === content`，已过期就跳过这次昂贵解码。

## 排查过程与已排除方向（留作经验）

### 自动化无法复现

- Playwright + 临时 outDir 构建 + 隔离后端的自动化翻页、burst 连按、fetch / pushState 打点，全部无法复现。
- 后续用 **CDP 探针驱动真实 Chrome / Edge**（注入 fetch 包装、`longtask` 观察器、rAF 间隔采样、`pushState` / `keydown` 拦截、预览区 MutationObserver）在主人本机重测，覆盖回环与局域网地址、隐藏/可见面板、3000+ 文件目录、1200ms / 1000ms 按键间隔，**依旧全部 35–50ms 出预览**，无 longtask > 100ms、无 rAF 长间隔、无重复请求、无回放。该临时设施（`.tmp-repro/`）已清理，未入库。

**结论：等速自动按键的时序与真实手动操作不同，这类“脏窗口”竞态必须由本人在现场按节奏复现验证。**

- 2026-11-08 曾因自动化测不出来，把首版“中止 + 加载守卫”补丁判为无效；实际是同一个补丁在真实节奏下有效。**结论不能只凭自动化探针下**。

### 已被数据否定

1. 旧请求未中止 / 旧 Blob 回写污染 —— 这个方向本身是对的（见上节根因第 1 条），当初判“无效”只是因为自动化测不出来；`createResource` 1.9.14 的 `loadEnd` 有 `pr === p` 守卫，真正的坑是“旧值被重复消费”，不是“旧请求写回”。
2. 后端 / 网络收紧 —— 回环与局域网都是 20–35ms 返回头 + body，Fiber 侧无异常。
3. 文件数 / 列表渲染成本 —— 3000 文件目录下同样 40ms 内完成。
4. 浏览器进程差异 —— Chrome 与 Edge 表现一致。
5. 定时器链 —— 全量 grep `setTimeout` / `setInterval` / `requestIdleCallback` 仅三处（`nextPaint` 让出一帧、`copyStatus` 2 秒复位、MessageBox 5 秒自动隐藏），均与预览无关。
6. `history.pushState` / `hashchange` 回放 —— 探针未观察到多余调用。

## 现状怎么工作（帮排查时不迷路）

- `App.tsx` 的 `onkeydown` 把 `w` / `s` 写为 `store.nextStep = -1 / 1`；`FileExplorer.tsx` 的 effect 消费后 `seekFile()` 并重置为 0，`clickItem()` 改 `store.currentFile` 并 `pushState`。
- `DataPanel.tsx` 的 `previewKind()` 按扩展名白名单判定；exe 不在白名单 → unsupported，不发 `blob` 请求。
- 文本链：`blob`（`createResource`）→ `textSource()` → `decodeText()`（`nextPaint` + `content.text()`）→ `TextPanel`。
- **改动这条链时必须记住**：`createResource` 在 source 为 `undefined` 时保留旧值，任何下游消费方都要用 `blob.loading` / 身份比较把旧值挡掉。

## 执行记录

- 2026-11-07：Playwright 环境未复现；主人本地确认复现与 CPU 特征；落地首版补丁（中止 + 加载守卫 + 解码前复核）。
- 2026-11-08：CDP 探针在真实 Chrome / Edge 上仍复现不了，一度误判补丁无效。
- 2026-11-08：主人本机再次实测，**补丁有效，卡顿消失**，根因按上文确认，issue 关闭。
