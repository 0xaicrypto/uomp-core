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
</p>

<p align="center">
  <a href="https://github.com/0xaicrypto/uomp-core/stargazers"><img src="https://img.shields.io/github/stars/0xaicrypto/uomp-core?style=for-the-badge&color=8B5CF6" alt="GitHub Stars" /></a>
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

Three modes, three independent paths — all converge at the same Guard + Memory Store.

**Mode 1 — Browser** (zero install, wallet-powered)

```
  Wallet sign ──→ encryption key ──→ Dropbox (encrypted data)
       │
  Browser Dashboard ──→ Gateway ──→ Guard ──→ Memory Store
       ↑                                  │
  Agent report ←────────────────── audit log
```

The wallet signature derives an encryption key. Data stored in Dropbox is ciphertext — the server never sees plaintext. The browser calls Guard through Gateway, same as any other Agent.

**Mode 2 — Local CLI** (Agent runs alongside Guard)

```
  pnpm cli authorize ──→ Auth Service ──→ issues UOM_TOKEN
                                               │
  Agent process ←──────────────────────────────┘
       │
       ├──→ Guard (scope filter) ──→ Memory Store
       │         │
       │    audit log
       │
       └──→ submitDeletionProof ──→ session closed
```

CLI authorizes, Auth issues a scoped JWT. Agent runs as independent process with the token in its environment. Every read goes through Guard which enforces scope and logs access.

**Mode 3 — Remote** (Gateway + Cloudflare Tunnel)

```
  pnpm cli authorize ──→ Auth ──→ UOM_TOKEN (saved to .env)
                                    │
  uomp gateway start ←──────────────┘
       │
  Cloudflare Tunnel ──→ public URL (https://xxx.trycloudflare.com)
       │
  Remote Agent ──→ POST /v1/memory/read ──→ Gateway ──→ Guard ──→ Store
                                                        │
                                                   audit log
```

One command to go public. Remote Agent connects through the tunnel URL with the same Token-based auth.

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
- [ ] On-chain audit (authorization, revocation, access events)
- [ ] FHE integration (agent computes on ciphertext, never sees plaintext)
- [ ] Semantic retrieval (`query` endpoint)
- [ ] Production-grade multi-backend support

### Ultimate vision: FHE + On-chain Audit

Today: you authorize an agent, it reads your plaintext data, it could remember it. You trust the agent.

**Endgame**: Fully Homomorphic Encryption. Your data is encrypted before it leaves your machine. The agent reads **ciphertext**, runs analysis on **ciphertext**, outputs **ciphertext results**. Only you decrypt the results. The agent can keep the ciphertext forever — without your private key, it's garbage.

```
Today:                             Endgame:
  plaintext → Agent                ciphertext → Agent
  Agent may remember               Agent cannot decrypt
  Trust required                   Trustless by math
```

Combined with on-chain audit (Phase 4-5), this creates a full trustless lifecycle:

```
User encrypts → Agent computes on ciphertext → results decrypted by user
     ↓                          ↓                          ↓
  Chain: Authorization      Chain: Access           Chain: zkFHE proof
  (scopes, fhe_mode)        (tag, ciphertext)       (computation verified)
```

When both are in place, UOMP achieves its original promise: **your data, your rules, verifiable by anyone, trusted by no one.**

Read the full design: [docs/on-chain-audit-design.md](docs/on-chain-audit-design.md)

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

三种模式，三条独立路径 —— 最终汇聚到同一套 Guard + Memory Store。

**模式一 — 浏览器**（零安装，钱包驱动）

```
  钱包签名 ──→ 加密密钥 ──→ Dropbox（密文存储）
       │
  浏览器 Dashboard ──→ Gateway ──→ Guard ──→ Memory Store
       ↑                                  │
  Agent 报告 ←────────────────── 审计日志
```

钱包签名派生出加密密钥。存入 Dropbox 的数据全是密文，服务器看不到明文。浏览器和 Agent 一样通过 Gateway 调用 Guard。

**模式二 — 本地 CLI**（Agent 与 Guard 同机运行）

```
  pnpm cli authorize ──→ Auth Service ──→ 签发 UOM_TOKEN
                                               │
  Agent 进程 ←─────────────────────────────────┘
       │
       ├──→ Guard（范围过滤）──→ Memory Store
       │         │
       │    审计日志
       │
       └──→ submitDeletionProof ──→ 会话关闭
```

CLI 授权，Auth 签发限定范围的 JWT。Agent 作为独立进程运行，Token 通过环境变量注入。每次读取都经过 Guard 校验范围并记录审计。

**模式三 — 远程**（Gateway + Cloudflare Tunnel）

```
  pnpm cli authorize ──→ Auth ──→ UOM_TOKEN（存入 .env）
                                    │
  uomp gateway start ←──────────────┘
       │
  Cloudflare Tunnel ──→ 公网地址（https://xxx.trycloudflare.com）
       │
  远程 Agent ──→ POST /v1/memory/read ──→ Gateway ──→ Guard ──→ Store
                                                        │
                                                   审计日志
```

一条命令暴露公网。远程 Agent 通过隧道 URL 连接，使用同样的 Token 鉴权。

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
- [ ] 链上审计（授权、撤销、访问事件）
- [ ] FHE 集成（Agent 在密文上计算，永远看不到明文）
- [ ] 语义检索（`query` 接口）
- [ ] 生产级多后端支持

### 终极愿景：FHE + 链上审计

现在：你授权 Agent，Agent 读明文数据，Agent 可以记住。你需要信任 Agent。

**终局**：全同态加密。数据在离开你的设备前已经加密。Agent 读**密文**，在**密文**上分析，输出**密文**结果。只有你能解密结果。Agent 可以永远保留密文——没有你的私钥，它就是垃圾。

```
现在：                             终局：
  明文 → Agent                     密文 → Agent
  Agent 可能记住                   Agent 无法解密
  需信任 Agent                     数学保证，无需信任
```

结合链上审计（Phase 4-5），形成完整的无信任闭环：

```
用户加密 → Agent 密文计算 → 用户解密结果
   ↓               ↓              ↓
链上：授权       链上：访问      链上：zkFHE
(scopes, fhe)    (tag, 密文)     (计算验证)
```

两者兼备时，UOMP 兑现其原始承诺：**你的数据，你的规则，人人可验证，无需信任任何人。**

完整设计文档：[docs/on-chain-audit-design.md](docs/on-chain-audit-design.md)

### 链接

- 协议网站：https://www.uomp.org
- 规范：https://www.uomp.org/spec/
- 协议讨论区：https://github.com/0xaicrypto/uomp
- 本仓库 Issues：https://github.com/0xaicrypto/uomp-core/issues
