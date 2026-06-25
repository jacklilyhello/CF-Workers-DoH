# 📶 CF-Workers-DoH
![img](./img.png)

CF-Workers-DoH 是一个基于 Cloudflare Workers 构建的 DNS over HTTPS (DoH) 解析服务，适合个人安全、隐藏部署。项目维护记录见 [codex.md](./codex.md)。

> [!CAUTION]
> 请自行部署使用，不建议把个人 Worker 暴露为开放代理或公开 DNS 服务。

## 🚀 部署方式

- **Workers** 部署：复制 [_worker.js](./_worker.js) 代码，保存并部署。
- **Git 连接部署**：Cloudflare Worker 已连接仓库时，可使用：

```bash
npx wrangler deploy _worker.js --name dns-doh --keep-vars --compatibility-date 2026-06-25
```

## 🔐 推荐个人部署变量

```env
PATH=dns-query
DOH=cloudflare-dns.com
URL=nginx
ENABLE_IP_INFO=false
AUTH_TOKEN=强随机字符串
DISABLE_WEB_UI=true
ALLOWED_UPSTREAMS=cloudflare-dns.com,dns.google
```

- `PATH` 只控制 DoH 路径，支持 `dns-query` 或 `/dns-query`，最终入口为 `/dns-query`。
- `AUTH_TOKEN` 只用于 `/ip-info` 或未来管理接口鉴权。
- `TOKEN` 已废弃（deprecated）：仅为兼容旧配置保留。当没有设置 `PATH` 但设置了 `TOKEN` 时，`TOKEN` 会临时作为 DoH 路径；不推荐继续使用。
- `/ip-info` 默认关闭，必须显式设置 `ENABLE_IP_INFO=true` 才会启用。
- `DISABLE_WEB_UI=true` 时不会显示默认 DNS 查询 HTML 页面；若 `URL=nginx`，首页 `/` 会返回 nginx 伪装页。
- `ALLOWED_UPSTREAMS` 用于限制可用 DoH 上游，避免 `doh=` 参数变成开放代理。

## 📖 DoH 使用与测试

假设实际部署域名为：`https://dns.888888.mom/dns-query`

### 标准 DoH 地址

```url
https://dns.888888.mom/dns-query
```

### JSON 查询

```bash
curl "https://dns.888888.mom/dns-query?name=google.com&type=A" -H "Accept: application/dns-json"
curl "https://dns.888888.mom/dns-query?name=google.com&type=AAAA" -H "Accept: application/dns-json"
```

### RFC8484 dns 参数 / POST

`scripts/test_doh.js` 会测试：

1. GET `?dns=base64url_dns_message`
2. POST `application/dns-message`
3. GET JSON API

推荐通过环境变量指定端点：

```bash
DOH_ENDPOINT=https://dns.888888.mom/dns-query node scripts/test_doh.js
TEST_DOMAIN=google.com DOH_ENDPOINT=https://dns.888888.mom/dns-query node scripts/test_doh.js
```

## 🌐 上游 DoH

`DOH` 支持填写主机名或完整 URL，例如：

```env
DOH=cloudflare-dns.com
DOH=dns.google
DOH=https://cloudflare-dns.com/dns-query
```

Worker 会提取 host，并生成：

- DNS Message Endpoint：`https://<host>/dns-query`
- DNS JSON Endpoint：`https://<host>/resolve`

`DOH` 必须位于 `ALLOWED_UPSTREAMS` 白名单内。测试白名单建议：

```env
ALLOWED_UPSTREAMS=cloudflare-dns.com,dns.google
```

## 🧭 /ip-info 安全说明

`/ip-info` 默认关闭：

```env
ENABLE_IP_INFO=false
```

启用时必须同时设置强随机 `AUTH_TOKEN`：

```env
ENABLE_IP_INFO=true
AUTH_TOKEN=强随机字符串
```

支持 URL token：

```bash
curl -i "https://dns.888888.mom/ip-info?ip=8.8.8.8&token=强随机字符串"
```

也支持 Bearer Token：

```bash
curl -i "https://dns.888888.mom/ip-info?ip=8.8.8.8" -H "Authorization: Bearer 强随机字符串"
```

未启用时访问 `/ip-info` 返回 `404`；启用但鉴权失败返回 `403`。

## 🔧 变量说明

| 变量名 | 示例 | 必填 | 备注 |
|--|--|--|--|
| `PATH` | `dns-query` | ❌ | DoH 服务路径，默认 `/dns-query` |
| `DOH` | `cloudflare-dns.com` | ❌ | 上游 DoH，默认 `cloudflare-dns.com` |
| `ALLOWED_UPSTREAMS` | `cloudflare-dns.com,dns.google` | ❌ | 允许的上游白名单 |
| `ENABLE_IP_INFO` | `false` | ❌ | 是否启用 `/ip-info`，默认关闭 |
| `AUTH_TOKEN` | `强随机字符串` | 启用 `/ip-info` 时建议 | `/ip-info` 鉴权 token |
| `DISABLE_WEB_UI` | `true` | ❌ | 是否关闭默认 HTML 查询页面 |
| `URL` | `nginx` | ❌ | 首页伪装；`nginx` 返回 nginx 默认页，URL 则反代 |
| `URL302` | `https://example.com/` | ❌ | 首页 302 跳转，优先于 `URL` |
| `TOKEN` | `dns-query` | ❌ | 已废弃，仅兼容旧 DoH 路径逻辑，不推荐使用 |

## 🧪 常用测试命令

```bash
curl -I https://dns.888888.mom/dns-query
curl "https://dns.888888.mom/dns-query?name=google.com&type=A" -H "Accept: application/dns-json"
curl "https://dns.888888.mom/dns-query?name=google.com&type=AAAA" -H "Accept: application/dns-json"
curl -i "https://dns.888888.mom/ip-info"
curl -i "https://dns.888888.mom/ip-info?ip=8.8.8.8&token=test888"
curl -I https://dns.888888.mom/
DOH_ENDPOINT=https://dns.888888.mom/dns-query node scripts/test_doh.js
```

## 💡 技术特性

- 基于 Cloudflare Workers 无服务器架构
- 单文件 `_worker.js` 部署
- 不引入复杂依赖
- 支持标准 DoH GET / POST
- 安全优先：限制上游、默认关闭 `/ip-info`、公开错误不暴露 stack

## 📝 许可证

本项目开源使用，欢迎自由部署和修改。

## 🙏 鸣谢

[tina-hello](https://github.com/tina-hello/doh-cf-workers)、[ip-api](https://ip-api.com/)、Cloudflare、GPT
