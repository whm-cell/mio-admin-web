# Mio Web 管理控制台 (`mio-admin-web`)

独立于 `mio` 后端插件仓库的管理员 Web 控制台，采用 **Vite + React 19 + TypeScript + Tailwind CSS** 构建，全部业务元数据与协议预设均通过 `/api/v1/admin/*` 动态获取（前端零硬编码预设）。核心功能包括：

1. **平台模型白名单与完整 CRUD**：
   - 支持粘贴任意 OneLink API Key 内存单次拉取 `/v1/models` 探测候选，或加密保存常用探测 Key 一键重刷，批量导入平台白名单；
   - 支持平台模型主表的完整增删改查：手动补录上游未列出的隐藏型号（`allowUndiscovered = true`）、对普通用户隐藏屏蔽（`userVisible = false`）、维护展示别名与实际调用说明（`callNotes`）以及删除并按需忽略后续导入。
2. **数据库动态协议模板 CRUD 与双模路由配置**：
   - 独立模板管理页支持数据库动态原厂协议模板的增删改查（含 `uiHints` 快捷推荐项与排序），前端不维护静态模板常量；
   - 路由抽屉支持可视化 + JSON 双模编辑、按模板一键填充、发布前差异预览与启停控制。
3. **运行与中间件完整档监控**：
   - 按时间窗口展示供应商账号健康度、生图任务三类失败拆解（准入拒绝、上游生成失败、存储物化失败）、对话请求脱敏统计与计算任务 Outbox/Inbox 状态（支持快捷跳转至「计算 Worker」菜单）；
   - 接入 RabbitMQ（节点资源/告警、队列深度与吞吐、死信队列）与 Redis（延迟、时钟偏差、内存/OOM 风险、客户端、命中率与持久化）完整档只读监控。
4. **计算 Worker 观测与动态调限**：
   - 通过 `/api/v1/admin/compute/*` 提供集群并发总览、近 1 小时 SVG 并发历史曲线（>15 秒缺测断线、阶梯上限与超限排空标记）、Worker 实例详情与受乐观锁修订保护的动态并发调限（支持 `0/0/0` 暂停新任务准入与 409 冲突一键刷新重填）、任务占槽事件时间线及调限审计历史；
   - 后端需配置 `MIO_COMPUTE_WORKER_INSTANCE_IDS` 及计算观测表后启用，未启用时展示独立空态提示且不影响其余管理页。
5. **变更记录与回滚**：记录路由新增/变更/启停/删除/回滚前后快照及全链路管理员操作审计，支持一键按历史版本重新发布。
6. **全局配置**：支持邮箱密码登录热开关与手机验证码策略（真实短信 / 固定 6 位验证码 / 停用入口）在线管理，附带乐观锁修订冲突保护与审计记录。
7. **管理员账号安全**：支持超级管理员修改本人用户名、校验原密码后更新登录密码，以及本地记住登录凭据管理。

## 本地启动

1. 在后端仓库 `mio` 完成数据库迁移、超级管理员预置、中间件监控初始化并启动服务（开启 `MIO_ADMIN_ENABLED=true`）：
   ```bash
   cd ../mio
   pnpm migrate:dev providers --apply
   pnpm migrate:dev admin --apply
   printf 'miioo_admin\n' | pnpm admin:dev --username miioo_admin --password-stdin
   pnpm monitor:init:dev
   pnpm build
   pnpm start:dev
   ```
2. 启动前端管理台（默认监听 `http://127.0.0.1:4330`，自动同源代理 `/api` 至 `http://127.0.0.1:4310`，可通过 `MIO_API_ORIGIN` 覆盖）：
   ```bash
   cd ../mio-admin-web
   pnpm dev
   ```

## 开发验证与工程护栏

提交或交付前执行全量静态检查与单元测试：

```bash
pnpm check          # 等价于 pnpm check:static && pnpm test
pnpm check:static   # format:check + typecheck + lint + guard + build
pnpm test           # Vitest 单元测试与 AST 护栏负向夹具测试
pnpm format         # Prettier 自动格式化
pnpm guard          # 单独执行 TypeScript AST 架构与卫生护栏
```

仓库开发约定与护栏边界见 [AGENTS.md](AGENTS.md)，后端契约见 [管理后台 HTTP 契约](../mio/docs/apis/admin.md)。
