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
  <a href="https://www.uomp.org"><img src="https://img.shields.io/badge/website-uomp.org-0A0A0A?logo=google-chrome&logoColor=white" alt="Website" /></a>
  <a href="https://www.uomp.org/spec/"><img src="https://img.shields.io/badge/spec-Draft--00-6B7280" alt="Spec" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License" /></a>
  <a href="https://github.com/0xaicrypto/uomp/discussions"><img src="https://img.shields.io/github/discussions/0xaicrypto/uomp" alt="Discussions" /></a>
  <a href="https://github.com/0xaicrypto/uomp-core/issues"><img src="https://img.shields.io/github/issues/0xaicrypto/uomp-core" alt="Issues" /></a>
  <a href="https://github.com/0xaicrypto/uomp-core"><img src="https://img.shields.io/github/stars/0xaicrypto/uomp-core?style=social" alt="Stars" /></a>
</p>

<p align="center">
  <a href="https://star-history.com/#0xaicrypto/uomp-core&Date">
    <img src="https://api.star-history.com/svg?repos=0xaicrypto/uomp-core&type=Date" alt="Star History Chart" width="600" />
  </a>
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

- **Local-first memory store** — SQLite-based storage under `~/.uomp`, with a pluggable `IMemoryStore` abstraction.
- **Agent manifest (`uom.json`)** — Agents declare requested scopes (tags/keys) upfront.
- **Interactive authorization** — The CLI shows the manifest and lets the user approve a scoped session.
- **JWT Capability Tokens** — EdDSA-signed tokens bound to a session, injected via `UOM_TOKEN`.
- **Memory Guard** — Filters every request against the granted scope and logs all access.
- **SDK (`@uomp/sdk`)** — `UompClient` with sub-clients for memory, aggregate, payload, session, audit, and auth.
- **Aggregate queries** — `sum`/`avg`/`count`/`min`/`max` without exposing raw data.
- **Deletion proof** — Agents submit cryptographic proof of data deletion before session close.
- **Remote Authorization Gateway** — Exposes the Memory Guard over mTLS + Cloudflare Tunnel for remote Agents.
- **Wallet authentication** — Browser-based auth via MetaMask (Ethereum) and Argent X (Starknet), with PBKDF2 key derivation.
- **Browser dashboard** — Zero-install portfolio manager with Dropbox sync and Agent analysis.
- **Cloud Relay** — Stateless public relay for token validation, rate-limiting, and ciphertext forwarding.
- **Store abstraction** — `IMemoryStore` interface with SQLite, encrypted object, and S3 backends.

### Architecture

```
                  ┌──────────────────────────────────────────────┐
                  │                 LOCAL MACHINE                 │
                  │                                              │
  ┌───────────┐   │  ┌──────────┐    ┌─────────┐   ┌─────────┐  │
  │  Browser  │   │  │   CLI    │    │  Auth   │   │  Guard  │  │
  │ (wallet + │───│─>│authorize │───>│ Service │──>│ (scope  │  │
  │  Dropbox) │   │  └──────────┘    └────┬────┘   │ filter  │  │
  └─────┬─────┘   │                      │ UOM_    │  +audit)│  │
        │         │                      │ TOKEN   └────┬────┘  │
        │         │  ┌──────────┐         │             │       │
        │         │  │  Agent   │<────────┘             │       │
        │         │  │ process  │                       │       │
        │         │  └──────────┘                       │       │
        │         │                                     │       │
        │         │            ┌───────────┐            │       │
        │         │            │  Gateway  │<───────────┘       │
        │         │            │ + Tunnel  │                    │
        │         │            └─────┬─────┘                    │
        └─────────┼──────────────────┼──────────────────────────┘
                  │                  │
                  │            ┌─────┴─────┐   ┌─────────┐
                  │            │   Cloud   │   │  Remote │
                  │            │   Relay   │──>│  Agent  │
                  │            └───────────┘   └─────────┘
                  │
            ┌─────┴─────┐
            │  Dropbox  │  ← encrypted portfolio data
            └───────────┘
```
Three access modes: **Local** (Agent runs alongside Guard), **Remote** (Gateway + Tunnel), and **Browser** (wallet auth + Dropbox storage).

### Quick start

**Requirements**

- Node.js >= 22
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
pnpm cli agent run ./examples/calendar-agent
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
pnpm cli agent run ./examples/calendar-agent
```

This bundles authorization, Guard startup, and Agent launch into one command.

#### Remote mode via Gateway

Use the Gateway when the Agent runs outside your local machine. One command, no public IP required:

```bash
# Start Gateway + Cloudflare Tunnel (auto-exposes public URL)
uomp gateway start

# Output:
# ═══ Public Gateway URL ═══
#   https://xxx.trycloudflare.com
# export UOMP_BASE_URL="https://xxx.trycloudflare.com"

# Authorize a remote Agent
pnpm cli authorize ./examples/stock-analyst --scope portfolio:holdings profile:risk --output /tmp/uomp.env
source /tmp/uomp.env

# The Agent can now connect from anywhere.
# Or use the hosted DO Agent:
# curl -X POST https://uomp-stock-analyst-mvblm.ondigitalocean.app/analyze \
#   -H 'Content-Type: application/json' \
#   -d '{"token":"$UOM_TOKEN","gateway_url":"$UOMP_BASE_URL"}'
```

**Without tunnel** (manual Gateway only):

```bash
node apps/gateway/dist/index.js                          # Gateway only
uomp gateway start --no-tunnel                           # or via CLI
```

See `apps/gateway/README.md` for full configuration options.

### Project structure

```
uomp-mvp/
├── packages/
│   ├── core/          # Shared types and constants
│   ├── store/         # SQLite Memory Store (pluggable IMemoryStore)
│   ├── token/         # EdDSA JWT issuance and verification
│   ├── identity/      # DID / GPG / Wallet identity verification
│   ├── registry/      # ERC-8004 Registry client
│   ├── auth/          # Auth Service HTTP API
│   ├── guard/         # Memory Guard HTTP API
│   ├── sdk/           # Agent TypeScript SDK (UompClient + BrowserSDK)
│   └── cli/           # uomp command-line tool
├── apps/
│   ├── server/        # Combined Auth + Guard service
│   ├── gateway/       # Remote Authorization Gateway (mTLS + Cloudflare Tunnel)
│   └── relay/         # Stateless Cloud Relay (token validation + rate limiting)
├── examples/
│   ├── calendar-agent/# Example calendar Agent
│   ├── stock-analyst/ # Multi-dimensional stock analysis Agent
│   └── browser-dashboard/ # Zero-install portfolio dashboard
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
import { UompClient } from '@uomp/sdk';

const uomp = UompClient.fromEnv();

const preferences = await uomp.memory.getByTag('preference');
console.log(preferences);
```

Run it:

```bash
pnpm cli agent run ./my-agent
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
- [x] SDK (`@uomp/sdk`) with `UompClient`
- [x] Aggregate queries + deletion proof
- [x] Remote Authorization Gateway + Cloudflare Tunnel
- [x] Cloud Relay
- [x] Wallet auth + Browser Dashboard
- [x] Store abstraction (`IMemoryStore`)
- [x] Example Agents (calendar + stock analyst)
- [ ] Agent write staging & approval flow
- [ ] Starknet on-chain revocation anchoring
- [ ] Semantic retrieval (`query` endpoint)
- [ ] Production-grade multi-backend support

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

- **本地优先的记忆存储** — 基于 SQLite，默认存放在 `~/.uomp`，支持可插拔的 `IMemoryStore` 抽象。
- **Agent 声明文件 `uom.json`** — Agent 事先声明请求的读取范围（tags/keys）。
- **交互式授权** — CLI 展示 Agent 声明，用户确认后生成限定范围的会话。
- **JWT Capability Token** — 使用 EdDSA 签名，通过 `UOM_TOKEN` 注入 Agent。
- **Memory Guard** — 按授权范围过滤每次请求，并记录审计日志。
- **SDK（`@uomp/sdk`）** — `UompClient` 提供 memory、aggregate、payload、session、audit、auth 子客户端。
- **聚合查询** — `sum`/`avg`/`count`/`min`/`max`，不暴露原始数据。
- **删除证明** — Agent 在关闭会话前提交密码学删除证明。
- **远程授权 Gateway** — 通过 mTLS + Cloudflare Tunnel 暴露 Memory Guard 给远程 Agent。
- **钱包认证** — 浏览器端通过 MetaMask（Ethereum）和 Argent X（Starknet）认证，PBKDF2 密钥派生。
- **浏览器 Dashboard** — 零安装的组合管理器，支持 Dropbox 同步和 Agent 分析。
- **Cloud Relay** — 无状态公共中继，验证 Token、限流、密文转发。
- **Store 抽象** — `IMemoryStore` 接口，支持 SQLite、加密对象、S3 后端。

### 架构

```
                  ┌──────────────────────────────────────────────┐
                  │                  本地机器                      │
                  │                                              │
  ┌───────────┐   │  ┌──────────┐    ┌─────────┐   ┌─────────┐  │
  │  浏览器    │   │  │   CLI    │    │  Auth   │   │  Guard  │  │
  │ (钱包 +   │───│─>│authorize │───>│ Service │──>│ (范围   │  │
  │  Dropbox) │   │  └──────────┘    └────┬────┘   │ 过滤    │  │
  └─────┬─────┘   │                      │ UOM_    │ +审计)  │  │
        │         │                      │ TOKEN   └────┬────┘  │
        │         │  ┌──────────┐         │             │       │
        │         │  │  Agent   │<────────┘             │       │
        │         │  │  进程    │                       │       │
        │         │  └──────────┘                       │       │
        │         │                                     │       │
        │         │            ┌───────────┐            │       │
        │         │            │  Gateway  │<───────────┘       │
        │         │            │ + Tunnel  │                    │
        │         │            └─────┬─────┘                    │
        └─────────┼──────────────────┼──────────────────────────┘
                  │                  │
                  │            ┌─────┴─────┐   ┌─────────┐
                  │            │   Cloud   │   │  远程   │
                  │            │   Relay   │──>│  Agent  │
                  │            └───────────┘   └─────────┘
                  │
            ┌─────┴─────┐
            │  Dropbox  │  ← 加密存储组合数据
            └───────────┘
```
三种模式：**本地**（Agent 与 Guard 同机运行）、**远程**（Gateway + Tunnel）、**浏览器**（钱包认证 + Dropbox 存储）。

### 快速开始

**环境要求**

- Node.js >= 22
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
pnpm cli agent run ./examples/calendar-agent
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
pnpm cli agent run ./examples/calendar-agent
```

该命令把授权、启动 Guard、启动 Agent 打包在一起，仅适用于本地开发测试。

#### 方式三：远程模式（Gateway + Cloudflare Tunnel）

一条命令，无需公网 IP，将本地 Memory Guard 暴露给任意远程 Agent：

```bash
# 启动 Gateway + 自动反代隧道
uomp gateway start

# 输出：
# ═══ Public Gateway URL ═══
#   https://xxx.trycloudflare.com
# export UOMP_BASE_URL="https://xxx.trycloudflare.com"

# 授权远程 Agent
pnpm cli authorize ./examples/stock-analyst --scope portfolio:holdings profile:risk --output /tmp/uomp.env
source /tmp/uomp.env

# 调用已部署的 DO Agent：
curl -X POST https://uomp-stock-analyst-mvblm.ondigitalocean.app/analyze \
  -H 'Content-Type: application/json' \
  -d '{"token":"$UOM_TOKEN","gateway_url":"$UOMP_BASE_URL"}'
```

详见 `apps/gateway/README.md`。

### 项目结构

```
uomp-mvp/
├── packages/
│   ├── core/          # 共享类型和常量
│   ├── store/         # SQLite Memory Store（可插拔 IMemoryStore）
│   ├── token/         # EdDSA JWT 签发与验证
│   ├── identity/      # DID / GPG / 钱包 身份验证
│   ├── registry/      # ERC-8004 Registry 客户端
│   ├── auth/          # Auth Service HTTP API
│   ├── guard/         # Memory Guard HTTP API
│   ├── sdk/           # Agent TypeScript SDK（UompClient + BrowserSDK）
│   └── cli/           # uomp 命令行工具
├── apps/
│   ├── server/        # Auth + Guard 组合服务
│   ├── gateway/       # 远程授权 Gateway（mTLS + Cloudflare Tunnel）
│   └── relay/         # 无状态 Cloud Relay（Token 验证 + 限流）
├── examples/
│   ├── calendar-agent/# 示例日历 Agent
│   ├── stock-analyst/ # 多维股票分析 Agent
│   └── browser-dashboard/ # 零安装组合管理 Dashboard
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
import { UompClient } from '@uomp/sdk';

const uomp = UompClient.fromEnv();

const preferences = await uomp.memory.getByTag('preference');
console.log(preferences);
```

运行：

```bash
pnpm cli agent run ./my-agent
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
- [x] SDK（`@uomp/sdk`）含 `UompClient`
- [x] 聚合查询 + 删除证明
- [x] 远程授权 Gateway + Cloudflare Tunnel
- [x] Cloud Relay
- [x] 钱包认证 + 浏览器 Dashboard
- [x] Store 抽象（`IMemoryStore`）
- [x] 示例 Agent（calendar + stock analyst）
- [ ] Agent 写入 staging/审批流程
- [ ] Starknet 链上撤销锚定
- [ ] 语义检索（`query` 接口）
- [ ] 生产级多后端支持

### 链接

- 协议网站：https://www.uomp.org
- 规范：https://www.uomp.org/spec/
- 协议讨论区：https://github.com/0xaicrypto/uomp
- 本仓库 Issues：https://github.com/0xaicrypto/uomp-core/issues
