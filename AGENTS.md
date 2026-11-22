# Mio Admin Web 开发入口

本仓库为 `Mio` 独立 Web 管理后台（Vite + React 19 + TypeScript + Tailwind CSS），默认监听 `127.0.0.1:4330`，开发与预览均同源代理 `/api` 至 `127.0.0.1:4310`（可通过 `MIO_API_ORIGIN` 覆盖）。

## 权威文档

- 对外接口契约：[管理后台 HTTP 契约](../mio/docs/apis/admin.md)
- 产品范围与验收边界：[Web 管理后台 PRD](../mio/docs/tasks/web-admin-console/prd.md)
- 本地启动与功能总览：[README](README.md)

## 目录与分层

- `src/types.ts`、`src/api.ts`、`src/savedCredentials.ts`：基础契约与能力适配层，只向上提供类型、HTTP 客户端与本地凭据读写。
- `src/App.tsx`、`src/components/**`：页面与交互组件层，仅通过基础适配层访问接口与本地存储。
- `scripts/guard.ts` + `harness.config.json`：基于 TypeScript 编译器 AST 的架构边界、文件清册、卫生与代码形态护栏。
- `tests/**`：Vitest 单元测试与护栏负向夹具测试。

## 常用命令

- `pnpm dev`：启动本地开发服务器（`http://127.0.0.1:4330`）
- `pnpm check`：运行全量验证（`pnpm check:static && pnpm test`）
- `pnpm check:static`：运行 `format:check`、`typecheck`、`lint`、`guard`、`build`
- `pnpm test`：运行 Vitest 单元测试与护栏负向测试
- `pnpm format`：按 `.prettierrc.json` 格式化仓库文件
- `pnpm build`：执行 `tsc -b && vite build` 生产构建
- `pnpm guard`：单独运行 TypeScript AST 护栏并查看 `[SHAPE-REVIEW]` 提示

## 工程护栏与可强制规则

以下规则由 `eslint.config.mjs`、`tsconfig.check.json`、`harness.config.json` 与 `scripts/guard.ts` 共同强制，交付前必须通过 `pnpm check`：

1. **零硬编码模型清单 / 驱动预设 / 尺寸常量**
   - 严禁在前端源码内硬编码模型白名单、厂商驱动清单、快捷模板或默认尺寸/比例常量；一律经由 `/api/v1/admin/*` 动态拉取。
   - 严禁复活 `src/**/presets.ts` 或 `src/**/presets.tsx`（触发 `FORBIDDEN_PRESETS_FILE` 阻断）。

2. **单一网络与本地存储适配层、依赖方向与文件清册**
   - 仅 `src/api.ts` 允许调用 `fetch`（含 `window.fetch` / `globalThis.fetch`）；外部调用触发 `FORBIDDEN_FETCH`。
   - 仅 `src/savedCredentials.ts` 允许读写 `localStorage` / `sessionStorage`；外部调用触发 `FORBIDDEN_STORAGE`。
   - 基础模块 `src/types.ts`、`src/api.ts`、`src/savedCredentials.ts` 禁止反向依赖 `src/App.tsx` 或 `src/components/**`（`REVERSE_DEPENDENCY`）。
   - `src/**` 禁止依赖 `tests/**` 或 `scripts/**`（`FORBIDDEN_LAYER_IMPORT`），禁止循环依赖（`IMPORT_CYCLE`）、不可解析相对导入（`UNRESOLVED_IMPORT`）及未在 `harness.config.json` 声明的文件（`UNKNOWN_FILE`）。
   - `src/**/*.{ts,tsx}` 禁止 `any`、`eval`、`console.*`，并启用 `consistent-type-imports` 与 `react-hooks` 规则。

3. **公开资料与源码卫生**
   - 严禁在任何非忽略文件（含文档、配置、源码与测试）中写入个人本机绝对路径或真实 `sk-...` 密钥字面量（触发 `PERSONAL_PATH` / `SECRET_LITERAL`）。
   - 凭据、构建产物与个人临时目录（`.env*`、`dist/`、`coverage/`、`*.tsbuildinfo`、`.work/`、`.runtime/`、`.claude/`）均不入库。

4. **代码形态审阅与 `DESIGN-OVER-001`**
   - `pnpm guard` 对超过 `800` 行的 `src/**/*.{ts,tsx}` 文件或超过 `250` 行的函数输出 `[SHAPE-REVIEW]` 审阅提示（不阻断退出码，用于人工评审）。
   - 当前已登记的后续按职责拆分审阅热点：`src/components/RouteEditorDrawer.tsx`、`src/components/ModelCatalogPage.tsx`。
   - 禁止通过压行、机械拆碎或放宽阈值规避提示；新增抽象、状态机或工具脚本前须说明具体失败模式与最小替代方案，不复制后端重型 `.work` CLI 或多余状态机。
