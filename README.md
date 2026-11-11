# CodeFloe Cloud Connector

面向 ChatGPT 的 CodeFloe 云端连接器，包含手机/桌面浏览器可用的连接设置页，以及一个把 CodeFloe 官方 MCP 能力转接给 ChatGPT 的 MCP 服务。

## 能力

- 浏览器打开连接页，支持桌面和手机布局。
- 用户分别使用自己的 CodeFloe Token；服务端按 ChatGPT 用户身份隔离凭据。
- Token 先向 CodeFloe 用户接口验证，再以 AES-GCM 加密后写入 Cloudflare D1。
- MCP 提供连接状态、官方工具发现和调用入口；工具参数以 CodeFloe 官方 MCP 返回的 schema 为准。
- 上游请求使用 `redirect: "manual"`，不会自动跟随重定向转发 Authorization。
- 插件清单位于 [`plugin/`](plugin/)，网页与 MCP Worker 源码分布在 `app/`、`components/`、`db/` 和 `worker/`。

## 目录

| 路径 | 用途 |
| --- | --- |
| `app/` | 响应式连接页面、连接 API、ChatGPT MCP 路由和服务端逻辑 |
| `components/` | 页面组件 |
| `db/`、`drizzle/` | D1 数据模型与迁移 |
| `worker/` | Cloudflare Worker 入口 |
| `plugin/` | ChatGPT 插件及 MCP server 声明 |
| `scripts/` | Vinext/Cloudflare 构建与本地开发辅助脚本 |
| `.openai/hosting.json` | 当前 Sites 项目的部署绑定配置 |

## 部署说明

当前 ChatGPT Sites 部署支持按 ChatGPT 用户身份隔离凭据，并使用 D1 保存加密后的 CodeFloe Token。以下单用户 Cloudflare 部署是可选模式，不需要 D1，也不影响 Sites 模式。

Sites 模式的 `TOKEN_ENCRYPTION_KEY` 是 Cloudflare Worker 运行时 Secret，必须是 Base64 编码的 32 字节随机密钥。只在 Sites 的 Secret 设置中配置；绝不能写入源码或提交记录。密钥轮换会导致旧密文无法解密，轮换前需先规划现有凭据迁移。

连接页面和 MCP 在 Sites 模式依赖 Sites 注入的 `oai-authenticated-user-id`。单用户模式改为通过 Cloudflare Worker Secrets 读取个人 CodeFloe Token，并要求 MCP 调用携带独立的 Bearer 密钥。网页不会收集或显示这两个密钥。

## 单用户部署到自己的 Cloudflare

此模式只供你本人使用。MCP Worker 的 URL 可公开访问，但所有 MCP 请求都必须通过 `MCP_ACCESS_TOKEN` 验证；不要把它发给其他人。先在 Cloudflare 登录并进行首次部署：

```sh
pnpm exec wrangler login
pnpm install --frozen-lockfile
pnpm cf:build
pnpm cf:deploy
```

`cf:build` 会生成不带 D1/R2 绑定的 Cloudflare Worker 部署配置；本模式不需要创建数据库或配置 `TOKEN_ENCRYPTION_KEY`。

首次部署创建 Worker 后，设置两个 Worker Secret：

```sh
pnpm exec wrangler secret put CODEFLOE_TOKEN
pnpm exec wrangler secret put MCP_ACCESS_TOKEN
```

在 Wrangler 提示时分别输入 CodeFloe 个人访问令牌和独立生成的随机值。`MCP_ACCESS_TOKEN` 至少需要 32 字节随机数据；可在本机用 `openssl rand -hex 32` 生成。不要将生成值写入仓库、命令参数或聊天记录。`wrangler secret put` 会立即部署含新 Secret 的 Worker 版本。

设置好 Secret 后，将 `plugin/mcp.cloudflare.example.json` 中的示例 URL 换成 Wrangler 显示的 Worker URL，并在 ChatGPT 的连接设置中把 API Key 设为同一个 `MCP_ACCESS_TOKEN`。

单用户模式下，连接页只显示 Secret 是否已配置；CodeFloe Token 是否有效由经过 Bearer 验证的 `codefloe_connection_status` 工具检查。使用 `pnpm exec wrangler secret put CODEFLOE_TOKEN` 更新密钥时，Wrangler 会立即创建并部署 Worker 新版本。

## 本地开发

要求 Node.js `>=22.13.0` 和 pnpm `11.25.0`。此项目使用 Vinext 与 Cloudflare Vite 插件：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

本地预览和生产构建按仓库现有 Sites 脚本配置运行：

```sh
pnpm build
pnpm start
```

本地开发不能访问生产 D1 或解密生产凭据。不要将真实 CodeFloe Token 填入开发环境日志、终端命令或测试数据。

## ChatGPT 插件配置

`plugin/mcp.json` 指向官方 CodeFloe MCP 转发服务。首次连接需要按 ChatGPT 的插件连接流程授权；用户 Token 在本项目的连接页安全配置，不应写入插件清单或聊天记录。插件显示信息在 `plugin/plugin.json`。

## 安全边界

- 每条凭据使用 ChatGPT 的稳定用户 ID 做 D1 主键和 AES-GCM 附加认证数据，避免跨用户读取。
- MCP 工具调用会修改 CodeFloe 状态时，ChatGPT 应按工具说明取得用户授权；连接器不应在用户未要求时发消息或改仓库。
- Token 仅用于服务端向 CodeFloe 发请求；客户端状态 API 不返回 Token。
- `.env*`、`.dev.vars*`、数据库文件、构建产物和本地运行状态均不应提交。

## 许可

此仓库没有附带开源许可证；除已单独标注许可的第三方文件外，源码权利保留。提交前请确认仓库访问级别和第三方组件许可。
