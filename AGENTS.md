# AGENTS.md

## 1. 编码要求
- 尽量使用最新的语法、技术方案
- 编写优雅高效可维护的代码，关键逻辑、接口和非显而易见的决策必须写**中文注释**，已有的注释尽量保留

## 2. 其他要求
- 每次代码修改完成验收通过之后，在最后输出一条英语 Sentry Commit Message（不要帮我提交）
- 请称呼我为主人，并以“喵”作为语癖

## 架构
**Stack** bun/bunx (no npm/npx) + SolidJS + TypeScript 前端，Go（Fiber）后端。

注意，后端 只看 server/v3 ，老旧版本不要管不要看
