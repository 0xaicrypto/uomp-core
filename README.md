# UOMP MVP

User-Owned Memory Protocol 的 MVP 实现。UOMP 让用户完全控制自己的记忆数据，并通过短时会话令牌（Capability Token）向 AI Agent 授权最小必要的读取范围。

MVP 特性：

- 用户本地 SQLite Memory Store
- Agent `uom.json` 声明请求的读取范围（tags/keys）
- CLI 交互式授权并签发 JWT Capability Token
- Agent 通过 `UOM_TOKEN` 环境变量读取数据，无需用户凭证
- 读写分离：MVP 仅开放读取；写入需通过未来的 staging/审批机制
- 可选 DID / GPG 身份验证（MVP 阶段未强制）

## 结构

```
uomp-mvp/
├── packages/
│   ├── core/      # 共享类型和常量
│   ├── store/     # SQLite Memory Store
│   ├── token/     # JWT Capability Token
│   ├── identity/  # DID / GPG 身份验证
│   ├── registry/  # ERC8004 Registry 客户端
│   ├── auth/      # Auth Service HTTP API
│   ├── guard/     # Memory Guard HTTP API
│   ├── sdk/       # Agent TypeScript SDK
│   └── cli/       # uomp 命令行工具
├── apps/
│   └── server/    # Auth + Guard 组合服务
├── examples/
│   └── calendar-agent/ # 示例 Agent
└── specs/
    └── draft-00.md # 协议规范
```

## 环境要求

- Node.js >= 20
- pnpm 9（可通过 `corepack enable` 或 `npm install -g pnpm@9` 安装）

## 快速开始

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 初始化数据目录（默认 ~/.uomp）
pnpm cli init

# 添加一条记忆
pnpm cli memory add preference.theme "dark" --tags preference,ui --sensitivity low

# 运行示例 Agent（交互式授权）
pnpm cli run ./examples/calendar-agent
```

## 完整测试流程

下面演示从初始化用户数据到运行示例 Agent 的完整流程。

### 1. 构建

```bash
pnpm install
pnpm build
```

构建成功后，所有 TypeScript 包会输出到各自目录的 `dist/` 中。

### 2. 初始化数据目录

```bash
pnpm cli init
```

输出示例：

```
UOMP initialized at /home/<user>/.uomp
```

该命令会创建：

- `~/.uomp/uomp.sqlite` — Memory Store
- `~/.uomp/config.json` — 用户配置
- `~/.uomp/.secrets/` — Ed25519 密钥对（用于签发 Token）

### 3. 添加记忆

```bash
pnpm cli memory add preference.theme "dark" --tags preference,ui --sensitivity low
pnpm cli memory add preference.locale "zh-CN" --tags preference --sensitivity low
```

### 4. 运行示例 Agent

`examples/calendar-agent/` 是一个读取用户偏好的示例 Agent。

```bash
pnpm cli run ./examples/calendar-agent
```

CLI 会显示 Agent 的 `uom.json` 声明，并提示你选择授权的标签：

```
Agent "Calendar Assistant" requests access to:
Description: A simple calendar assistant that reads user preferences
Publisher: uomp-community
? Select tags to authorize for reading: (Press <space> to select, <a> to toggle all, ...)
❯◉ preference
```

按 `<enter>` 授权后，CLI 会：

1. 创建会话并签发 `UOM_TOKEN`
2. 启动本地 Guard 服务（默认 `http://127.0.0.1:9374`）
3. 以子进程方式启动 Agent，并注入 `UOM_TOKEN`

输出示例：

```
Session granted: sess_xxxxxxxx
Token expires at: 2026-07-12T17:26:21.174Z
UOMP server listening on http://127.0.0.1:9374
Starting agent: ./examples/calendar-agent/index.js
Calendar Agent started
Reading user preferences...
Theme preference: "dark"
Found 2 preference item(s):
Calendar Agent finished
Agent exited with code 0
```

### 5. 手动验证 Guard API

如果你想手动测试 Guard，可以先运行示例 Agent 获得 token，再用 curl：

```bash
# 导出示例 Agent 运行后打印的 token（或在 CLI 输出中复制）
export UOM_TOKEN="<paste-token-here>"

curl -H "Authorization: Bearer $UOM_TOKEN" \
  "http://127.0.0.1:9374/v1/memory?tag=preference"
```

响应示例：

```json
{
  "items": [
    { "id": 1, "key": "preference.theme", "value": "dark", "tags": ["preference", "ui"], "sensitivity": "low" },
    { "id": 2, "key": "preference.locale", "value": "zh-CN", "tags": ["preference"], "sensitivity": "low" }
  ],
  "page": { "limit": 50, "offset": 0, "total": 2 }
}
```

尝试访问未授权的标签会返回 403：

```bash
curl -H "Authorization: Bearer $UOM_TOKEN" \
  "http://127.0.0.1:9374/v1/memory?tag=private"
```

### 6. 组合服务方式（不通过 CLI 运行 Agent）

```bash
# 终端 1：启动 Auth + Guard 服务
pnpm --filter @uomp/server start

# 终端 2：创建会话（请求体使用 snake_case）
CREATE=$(curl -s -X POST http://127.0.0.1:9374/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"calendar-agent","requested_scopes":{"read":{"tags":["preference"],"keys":[],"denyTags":[],"denyKeys":[]},"write":{"tags":[],"keys":[],"denyTags":[],"denyKeys":[]}},"duration_minutes":30}')
SESSION_ID=$(echo "$CREATE" | node -p "JSON.parse(require('fs').readFileSync(0,'utf-8')).session_id")

# 终端 2：授权会话并获取 token
GRANT=$(curl -s -X POST "http://127.0.0.1:9374/v1/sessions/$SESSION_ID/grant" \
  -H "Content-Type: application/json" \
  -d '{"granted_scopes":{"read":{"tags":["preference"],"keys":[],"denyTags":[],"denyKeys":[]},"write":{"tags":[],"keys":[],"denyTags":[],"denyKeys":[]}}}')
TOKEN=$(echo "$GRANT" | node -p "JSON.parse(require('fs').readFileSync(0,'utf-8')).token")

# 终端 2：使用 token 调用 Guard
curl -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:9374/v1/memory?tag=preference"
```

## 创建自己的 Agent

最小 Agent 目录结构：

```
my-agent/
├── uom.json      # Agent 声明
└── index.js      # Agent 入口
```

`uom.json` 示例：

```json
{
  "uomp_version": "1.0",
  "agent": {
    "id": "my-agent",
    "name": "My Agent",
    "version": "0.1.0",
    "description": "An example agent",
    "publisher": "me"
  },
  "requested_scopes": {
    "read": {
      "tags": ["preference"],
      "deny_tags": ["private"]
    }
  },
  "required_capabilities": ["memory.read"]
}
```

`index.js` 示例（Node.js）：

```javascript
import { UompAgent } from '@uomp/sdk';

const agent = new UompAgent();
await agent.connect();

const preferences = await agent.query({ tag: 'preference' });
console.log(preferences);
```

运行：

```bash
pnpm cli run ./my-agent
```

## 开发

```bash
# 类型检查
pnpm typecheck

# 构建
pnpm build

# 清理
pnpm -r exec rm -rf dist
```

## 协议规范

见 [specs/draft-00.md](./specs/draft-00.md)。

## 注意事项

- MVP 默认使用本地文件系统存储，不建议直接用于生产环境。
- Token 默认有效期 30 分钟，可在 CLI 或 Auth API 中调整。
- DID / GPG 身份验证在 MVP 阶段为可选；未配置身份的 Agent 会收到黄色警告，但仍可继续运行。
