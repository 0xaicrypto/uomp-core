# UOMP MVP

<p align="center">
  <b>User-Owned Memory Protocol — Reference Implementation</b><br/>
  Keep your memory local. Grant AI Agents scoped, session-based access.
</p>

<p align="center">
  <a href="https://www.uomp.org">Website</a> •
  <a href="https://www.uomp.org/spec/">Protocol Spec</a> •
  <a href="https://github.com/0xaicrypto/uomp">Protocol Repo</a> •
  <a href="https://github.com/0xaicrypto/uomp-core/issues">Issues</a>
</p>

<p align="center">
  <a href="#english">English</a> | <a href="#中文">中文</a>
</p>

---

<h2 id="english">English</h2>

### What is UOMP?

**UOMP (User-Owned Memory Protocol)** is an open protocol that lets users keep their personal memory data on their own device while granting AI Agents temporary, scoped, and auditable access through short-lived **Capability Tokens**.

This repository is the reference TypeScript implementation of the protocol draft.

### Why it matters

AI Agents need rich personal context to be useful. Today that context is usually obtained by either:

- Uploading everything to a centralized cloud, or
- Handing over long-lived API keys with too much scope.

Both break user sovereignty. UOMP proposes a third path:

> **Your memory stays on your device. Agents receive only the minimum, temporary access you explicitly authorize.**

### Features

- **Local-first memory store** — SQLite-based storage under `~/.uomp`.
- **Agent manifest (`uom.json`)** — Agents declare requested scopes (tags/keys) upfront.
- **Interactive authorization** — The CLI shows the manifest and lets the user approve a scoped session.
- **JWT Capability Tokens** — EdDSA-signed tokens bound to a session, injected via `UOM_TOKEN`.
- **Memory Guard** — Filters every request against the granted scope and logs all access.
- **Read-only by design in MVP** — Agent writes are gated behind a future staging/approval flow.
- **Optional identity verification** — DID (`did:ethr`, `did:web`) and GPG support, not enforced in MVP.

### Architecture

```
┌─────────────┐     uom.json      ┌─────────────────┐
│   Agent     │ ─────────────────>│   uomp CLI      │
└─────────────┘                   │  (Authorization)│
       ^                          └────────┬────────┘
       │                                   │
       │    UOM_TOKEN (JWT)                │ create / grant
       │                                   ▼
       │                          ┌─────────────────┐
       │                          │  Auth Service   │
       │                          └─────────────────┘
       │
       └────────────────────────────────────────────┐
                                                    │
              Authorization: Bearer <UOM_TOKEN>     │
                                                    ▼
                                          ┌─────────────────┐
                                          │  Memory Guard   │
                                          │  (scope filter  │
                                          │   + audit log)  │
                                          └────────┬────────┘
                                                   │
                                                   │ read / write (filtered)
                                                   ▼
                                          ┌─────────────────┐
                                          │  Memory Store   │
                                          │   (SQLite)      │
                                          └─────────────────┘
```

### Quick start

**Requirements**

- Node.js >= 20
- pnpm 9 (`corepack enable` or `npm install -g pnpm@9`)

**Install & build**

```bash
pnpm install
pnpm build
```

**Initialize the data directory**

```bash
pnpm cli init
```

This creates `~/.uomp/` with SQLite stores, config, and an Ed25519 key pair for signing tokens.

**Run the example Agent**

```bash
pnpm cli run ./examples/calendar-agent
```

### Usage modes

#### Standard mode (recommended)

The CLI only handles authorization; the Agent runs as an independent process.

```bash
# Terminal 1: start Auth + Guard
pnpm --filter @uomp/server start

# Terminal 2: authorize and get a token
pnpm cli authorize ./examples/calendar-agent

# Terminal 2: run the Agent independently
export UOM_TOKEN="<token>"
export UOMP_BASE_URL="http://127.0.0.1:9374"
node ./examples/calendar-agent/index.js
```

#### Local development shortcut

```bash
pnpm cli run ./examples/calendar-agent
```

This bundles authorization, Guard startup, and Agent launch into one command.

### Project structure

```
uomp-mvp/
├── packages/
│   ├── core/          # Shared types and constants
│   ├── store/         # SQLite Memory Store
│   ├── token/         # EdDSA JWT issuance and verification
│   ├── identity/      # DID / GPG identity verification
│   ├── registry/      # ERC-8004 Registry client
│   ├── auth/          # Auth Service HTTP API
│   ├── guard/         # Memory Guard HTTP API
│   ├── sdk/           # Agent TypeScript SDK
│   └── cli/           # uomp command-line tool
├── apps/
│   └── server/        # Combined Auth + Guard service
├── examples/
│   └── calendar-agent/# Example Agent
└── specs/
    └── draft-00.md    # Protocol specification
```

### Creating your own Agent

```
my-agent/
├── uom.json      # Agent manifest
└── index.js      # Agent entry point
```

**`uom.json`**

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

**`index.js`**

```javascript
import { UompAgent } from '@uomp/sdk';

const agent = new UompAgent();
await agent.connect();

const preferences = await agent.query({ tag: 'preference' });
console.log(preferences);
```

Run it:

```bash
pnpm cli run ./my-agent
```

### Security model

1. **Agent declares** the requested scope in `uom.json`.
2. **User authorizes** via the local CLI, optionally after identity verification.
3. **Auth Service** issues a session-bound JWT with the granted scope.
4. **Memory Guard** validates the token, filters every request, and writes an audit log.

MVP defaults are intentionally conservative:

- Tokens expire after 30 minutes.
- Write operations return `503 WRITE_NOT_AVAILABLE`.
- Identity verification is optional and shows a warning if missing.

### Status & roadmap

- [x] Draft-00 spec
- [x] Local SQLite Memory Store
- [x] JWT Capability Token (EdDSA)
- [x] Auth Service + Memory Guard
- [x] CLI with interactive authorization
- [x] Example Agent
- [ ] Remote / multi-device profiles
- [ ] Agent write staging & approval
- [ ] Starknet identity & revocation anchoring
- [ ] Production-ready storage backends

### Links

- Protocol website: https://www.uomp.org
- Spec: https://www.uomp.org/spec/
- Protocol discussions: https://github.com/0xaicrypto/uomp
- Reference implementation issues: https://github.com/0xaicrypto/uomp-core/issues

---

<h2 id="中文">中文</h2>

### UOMP 是什么？

**UOMP（User-Owned Memory Protocol，用户主权记忆协议）** 是一个开放协议草案，让用户能够将个人记忆数据保留在自己的设备上，同时通过短期的 **Capability Token** 向 AI Agent 授予临时、限定范围且可审计的访问权限。

本仓库是 UOMP 协议的 TypeScript 参考实现。

### 为什么重要

AI Agent 需要丰富的个人上下文才能提供有用服务。目前通常有两种方式：

- 把所有数据上传到中心化云端；
- 给 Agent 长期、过度授权的 API key。

这两种方式都让用户失去控制权。UOMP 提出第三条路径：

> **你的记忆留在你的设备上；Agent 只获得你明确授权的最小、临时访问权限。**

### 特性

- **本地优先的记忆存储** — 基于 SQLite，默认存放在 `~/.uomp`。
- **Agent 声明文件 `uom.json`** — Agent 事先声明请求的读取范围（tags/keys）。
- **交互式授权** — CLI 展示 Agent 声明，用户确认后生成限定范围的会话。
- **JWT Capability Token** — 使用 EdDSA 签名，通过 `UOM_TOKEN` 注入 Agent。
- **Memory Guard** — 按授权范围过滤每次请求，并记录审计日志。
- **MVP 阶段只读** — Agent 写入由未来的 staging/审批机制控制。
- **可选身份验证** — 支持 DID（`did:ethr`、`did:web`）和 GPG，MVP 阶段不强制。

### 架构

```
┌─────────────┐     uom.json      ┌─────────────────┐
│   Agent     │ ─────────────────>│   uomp CLI      │
└─────────────┘                   │  （授权代理）   │
       ^                          └────────┬────────┘
       │                                   │
       │    UOM_TOKEN (JWT)                │ create / grant
       │                                   ▼
       │                          ┌─────────────────┐
       │                          │  Auth Service   │
       │                          └─────────────────┘
       │
       └────────────────────────────────────────────┐
                                                    │
              Authorization: Bearer <UOM_TOKEN>     │
                                                    ▼
                                          ┌─────────────────┐
                                          │  Memory Guard   │
                                          │  （范围过滤    │
                                          │   + 审计日志）  │
                                          └────────┬────────┘
                                                   │
                                                   │ read / write (filtered)
                                                   ▼
                                          ┌─────────────────┐
                                          │  Memory Store   │
                                          │   （SQLite）    │
                                          └─────────────────┘
```

### 快速开始

**环境要求**

- Node.js >= 20
- pnpm 9（通过 `corepack enable` 或 `npm install -g pnpm@9` 安装）

**安装并构建**

```bash
pnpm install
pnpm build
```

**初始化数据目录**

```bash
pnpm cli init
```

该命令会在 `~/.uomp/` 创建 SQLite 数据库、配置文件以及用于签发 Token 的 Ed25519 密钥对。

**运行示例 Agent**

```bash
pnpm cli run ./examples/calendar-agent
```

### 使用方式

#### 方式一：标准模式（推荐）

CLI 只负责授权，Agent 作为独立进程运行。

```bash
# 终端 1：启动 Auth + Guard 服务
pnpm --filter @uomp/server start

# 终端 2：为示例 Agent 授权并获取 Token
pnpm cli authorize ./examples/calendar-agent

# 终端 2：独立启动 Agent
export UOM_TOKEN="<token>"
export UOMP_BASE_URL="http://127.0.0.1:9374"
node ./examples/calendar-agent/index.js
```

#### 方式二：本地开发 shortcut

```bash
pnpm cli run ./examples/calendar-agent
```

该命令把授权、启动 Guard、启动 Agent 打包在一起，仅适用于本地开发测试。

### 项目结构

```
uomp-mvp/
├── packages/
│   ├── core/          # 共享类型和常量
│   ├── store/         # SQLite Memory Store
│   ├── token/         # EdDSA JWT 签发与验证
│   ├── identity/      # DID / GPG 身份验证
│   ├── registry/      # ERC-8004 Registry 客户端
│   ├── auth/          # Auth Service HTTP API
│   ├── guard/         # Memory Guard HTTP API
│   ├── sdk/           # Agent TypeScript SDK
│   └── cli/           # uomp 命令行工具
├── apps/
│   └── server/        # Auth + Guard 组合服务
├── examples/
│   └── calendar-agent/# 示例 Agent
└── specs/
    └── draft-00.md    # 协议规范
```

### 创建自己的 Agent

```
my-agent/
├── uom.json      # Agent 声明
└── index.js      # Agent 入口
```

**`uom.json` 示例**

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

**`index.js` 示例**

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

### 安全模型

1. **Agent 声明**：在 `uom.json` 中声明请求范围。
2. **用户授权**：通过本地 CLI 确认，可选进行身份验证。
3. **签发 Token**：Auth Service 根据授权范围生成会话绑定的 JWT。
4. **Guard 鉴权**：验证 Token、过滤请求、记录审计日志。

MVP 默认采取保守策略：

- Token 默认 30 分钟有效期。
- 写入操作返回 `503 WRITE_NOT_AVAILABLE`。
- 身份验证可选，缺失时 CLI 会显示警告。

### 状态与路线图

- [x] Draft-00 规范
- [x] 本地 SQLite Memory Store
- [x] JWT Capability Token（EdDSA）
- [x] Auth Service + Memory Guard
- [x] 交互式授权 CLI
- [x] 示例 Agent
- [ ] 远程 / 多设备 profile
- [ ] Agent 写入 staging/审批机制
- [ ] Starknet 身份与撤销锚定
- [ ] 生产级存储后端

### 链接

- 协议网站：https://www.uomp.org
- 规范：https://www.uomp.org/spec/
- 协议讨论区：https://github.com/0xaicrypto/uomp
- 本仓库 Issues：https://github.com/0xaicrypto/uomp-core/issues
