# Codex 项目维护记录

## 项目核心提示词

- 这是 Cloudflare Workers DoH 项目。
- 核心文件是 `_worker.js`。
- 保持单文件 Worker 部署。
- 不引入复杂依赖。
- 不破坏标准 DoH GET / POST。
- 安全优先，避免开放代理。
- `TOKEN` 仅兼容旧逻辑，不推荐继续使用。
- `PATH` 控制 DoH 路径。
- `AUTH_TOKEN` 控制鉴权。
- `/ip-info` 默认关闭。
- 错误响应不暴露 stack。
- README 和测试脚本需要同步维护。
- 除非用户明确要求，否则以后所有 Codex 任务都必须先阅读 `codex.md`，再开始修改代码。

## Codex 工作记录

### 2026-06-25 07:48
- 分支：feature/personal-secure-doh-config
- 修改文件：`_worker.js`、`README.md`、`scripts/test_doh.js`、`codex.md`
- 修改内容摘要：新增统一配置解析；拆分 `PATH`/`TOKEN`/`AUTH_TOKEN` 职责；默认关闭并鉴权保护 `/ip-info`；限制 DoH 上游白名单；收敛公开错误响应；支持关闭 Web UI 并保留 `URL=nginx`、`URL302`；更新测试脚本环境变量和 README 文档。
- 测试情况：已运行 `node --check _worker.js`、`node --check scripts/test_doh.js`。
- 风险/注意事项：`ALLOWED_UPSTREAMS` 仅允许列出的上游，前端旧自定义 DoH 上游若不在白名单会被拒绝；启用 `/ip-info` 必须设置 `ENABLE_IP_INFO=true` 和 `AUTH_TOKEN`。
- 是否创建 PR：是。

### 2026-06-25 08:02
- 分支：codex/refactor-doh-project-configuration-and-security-2026-06-25-07-58-02
- 修改文件：`_worker.js`、`codex.md`
- 修改内容摘要：修复 HTML 模板中残留的旧 `DoH路径` / `DoH` 变量，改为通过 `HTML(config)` 使用 `config.dohPath` 和 `config.upstreamHost`；移除前端 `/ip-info` 请求中基于 DoH 路径拼接的 token，避免向页面注入或泄露鉴权信息。
- 测试情况：已运行 `node --check _worker.js`、`node --check scripts/test_doh.js`、`git diff --check`。
- 风险/注意事项：默认 UI 若启用，IP 位置信息请求不再携带 token；在 `/ip-info` 默认关闭或未授权时，前端会按失败逻辑显示位置信息获取失败。
- 是否创建 PR：否，本次为 PR #1 追加小修复 commit。

### 2026-06-25 08:08
- 分支：codex/refactor-doh-project-configuration-and-security-2026-06-25-07-58-02
- 修改文件：`README.md`、`codex.md`
- 修改内容摘要：仅修正文档中的 Cloudflare Worker 部署名称，将部署命令中的 `--name dns-doh` 改为真实 Worker 名称 `--name dns`，并确认文档中无其他 `dns-doh` 残留。
- 测试情况：已运行 `git diff --check`。
- 风险/注意事项：本次仅修改文档和维护记录，不涉及 Worker 运行时代码。
- 是否创建 PR：否，本次为 PR #1 追加小修复 commit。


### 2026-06-25 08:20
- 分支：fix/provider-aware-json-endpoint
- 修改文件：`_worker.js`、`README.md`、`codex.md`
- 修改内容摘要：新增 provider-aware JSON endpoint 生成逻辑，确保 `dns.google` 使用 `/resolve`，Cloudflare 及其他允许上游使用 `/dns-query`；同步 README 中上游 endpoint 说明。
- 测试情况：已运行 `node --check _worker.js`、`node --check scripts/test_doh.js`、`git diff --check`；线上 curl 因当前环境 CONNECT tunnel 403 未能直连验证。
- 风险/注意事项：仅调整 JSON DoH endpoint 生成逻辑，DNS Message endpoint、`/ip-info`、`PATH`、`AUTH_TOKEN`、`DISABLE_WEB_UI`、`URL=nginx` 逻辑保持不变。
- 是否创建 PR：是。
