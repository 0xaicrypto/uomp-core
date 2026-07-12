# UOMP-Draft-00

# User-Owned Memory Protocol (UOMP)

**版本**：Draft-00
**状态**：草案（Draft）
**发布日期**：2026-07-12
**目标**：作为公开 RFC 草案征求意见

---

## 1. Abstract

User-Owned Memory Protocol（UOMP）定义了一种用户主权型授权协议，允许用户将其个人记忆数据（偏好、设置、身份属性等）临时授权给 AI Agent 访问。授权基于会话（Session）生效，按标签（Tag）或键（Key）限定范围，会话结束或撤销后授权立即失效。UOMP 默认运行在本机环境，同时定义远程 Agent 扩展机制。

## 2. Status of This Memo

本文档为 UOMP 协议草案（Draft-00），描述协议设计意图、数据格式、HTTP API 和安全要求。本文档旨在通过公开讨论后演进为正式标准。本文档中的关键词 "MUST"、"MUST NOT"、"REQUIRED"、"SHALL"、"SHALL NOT"、"SHOULD"、"SHOULD NOT"、"RECOMMENDED"、"MAY"、"OPTIONAL" 按照 [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119) 解释。

## 3. Introduction

### 3.1 Motivation

当前 AI Agent 在为用户提供服务时，通常需要访问用户的个人数据。现有方案往往要求用户将数据上传至 Agent 提供商的服务器，导致：

- 用户失去对数据的直接控制。
- Agent 可能长期保留用户数据。
- 用户难以审计 Agent 访问了哪些数据。

UOMP 的设计目标是：

- **用户始终拥有记忆数据**。
- **每次访问都需要临时授权**。
- **授权范围最小化**。
- **授权会话结束后立即失效**。
- **所有访问可审计**。

### 3.2 Design Principles

- **Local-first**：默认部署模型下，Memory Guard 运行在本机，仅监听 `127.0.0.1`。
- **Capability-based authorization**：使用短期 Capability Token 表达授权范围。
- **Tag/Key scoping**：授权可按标签或精确键进行。
- **Session-bound**：Token 绑定到具体 Session，Session 结束即失效。
- **Transport-agnostic core**：核心协议基于 HTTP，但可扩展至其他传输。

## 4. Terminology

| 术语 | 定义 |
|------|------|
| **Memory** | 用户个人记忆数据，包括偏好、设置、身份属性等。 |
| **Memory Item** | 单条记忆记录，包含 key、value、tags、sensitivity 等元数据。 |
| **Memory Store** | 持久化存储 Memory Item 的用户侧存储。 |
| **Memory Guard** | 访问代理层，校验授权、过滤数据、记录审计日志。 |
| **Auth Service** | 会话管理组件，负责创建/关闭 Session、签发/校验 Capability Token。 |
| **Session** | 一次 Agent 任务周期，拥有唯一 `session_id`。 |
| **Capability Token** | 会话级授权凭证，标明 Agent 可访问的标签/键范围。 |
| **Agent** | 通过 UOMP 访问用户记忆的程序，可运行在本机或远程。 |
| **uom.json** | Agent 声明文件，描述 Agent 身份和默认请求的记忆范围。 |
| **Local Profile** | 本机部署模式，Memory Guard 监听 `127.0.0.1`。 |
| **Remote Profile** | 远程部署模式，Memory Guard 通过 TLS + mTLS 暴露。 |

## 5. Protocol Overview

### 5.1 Architecture

```
┌─────────────┐      create/grant/revoke      ┌──────────────┐
│   用户 UI    │  ◄────────────────────────►  │ Auth Service │
└─────────────┘                               └──────┬───────┘
                                                     │
                              Capability Token       │
                                                     ▼
┌─────────────┐      HTTP + Authorization         ┌──────────────┐
│    Agent    │  ─────────────────────────────►   │ Memory Guard │
└─────────────┘                                   └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ Memory Store │
                                                  └──────────────┘
```

### 5.2 Flow

1. Agent 提供 `uom.json` 声明其身份和默认请求的记忆范围。
2. 用户选择连接 Agent，Auth Service 创建 Session（`created` 状态）。
3. 用户确认或调整授权范围后，Auth Service 签发 Capability Token。
4. Session 进入 `active` 状态，Agent 通过 HTTP API 携带 Token 访问 Memory Guard。
5. Memory Guard 校验 Token，按 scope 过滤数据，返回结果并记录审计日志。
6. Agent 任务完成、超时、或用户撤销时，Session 关闭，Token 失效。

### 5.3 Profiles

UOMP 定义两种部署配置：

| Profile | 默认端口 | 传输 | 认证 |
|---------|---------|------|------|
| Local Profile | `127.0.0.1:9374` | HTTP | Capability Token |
| Remote Profile | 用户配置 | HTTPS | Capability Token + mTLS |

Local Profile 为默认且 RECOMMENDED 配置。Remote Profile 必须显式开启。

## 6. Agent Manifest: `uom.json`

### 6.1 Location

Agent 必须在可执行文件同级目录或包根目录提供 `uom.json`。

### 6.2 Format

```json
{
  "uomp_version": "1.0",
  "agent": {
    "id": "calendar_agent",
    "name": "日程助手",
    "version": "1.2.0",
    "description": "帮助用户管理日程",
    "publisher": "example-org"
  },
  "requested_scopes": {
    "read": {
      "tags": ["preference", "identity:public"],
      "keys": [],
      "description": "读取用户偏好和公开身份信息"
    },
    "write": {
      "tags": ["preference"],
      "keys": [],
      "description": "写入与日程相关的偏好设置"
    }
  },
  "required_capabilities": ["memory.read"],
  "optional_capabilities": ["memory.query"],
  "requires_remote": false,
  "identity": {
    "did": "did:ethr:0xabc123...",
    "verification_methods": ["did", "gpg", "x509"],
    "proof": {
      "type": "Ed25519Signature2020",
      "created": "2026-07-12T10:00:00Z",
      "proofValue": "..."
    }
  }
}
```

### 6.3 Fields

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `uomp_version` | string | MUST | 协议版本，当前为 `"1.0"`。 |
| `agent.id` | string | MUST | Agent 唯一标识符。 |
| `agent.name` | string | MUST | 人类可读的名称。 |
| `agent.version` | string | MUST | 语义化版本。 |
| `agent.description` | string | OPTIONAL | 功能描述。 |
| `agent.publisher` | string | OPTIONAL | 发布者名称。 |
| `requested_scopes` | object | MUST | 默认请求的记忆范围。 |
| `required_capabilities` | string[] | OPTIONAL | 必需能力列表。 |
| `optional_capabilities` | string[] | OPTIONAL | 可选能力列表。 |
| `requires_remote` | boolean | OPTIONAL | 是否必须远程连接，默认 `false`。 |
| `identity` | object | OPTIONAL | 发布者身份验证信息。 |

### 6.4 Scope Object

Scope Object 用于 `requested_scopes.read` 和 `requested_scopes.write`：

```json
{
  "tags": ["preference"],
  "keys": ["user.display_name"],
  "deny_tags": ["financial"],
  "deny_keys": ["user.password"],
  "description": "说明为何需要此范围"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tags` | string[] | MUST | 请求授权的标签列表。 |
| `keys` | string[] | MUST | 请求授权的具体键列表。 |
| `deny_tags` | string[] | OPTIONAL | 显式拒绝的标签。 |
| `deny_keys` | string[] | OPTIONAL | 显式拒绝的键。 |
| `description` | string | RECOMMENDED | 说明用途，用于授权面板展示。 |

## 7. Capability Token

### 7.1 Format

Capability Token 采用 JWT 格式，由 Auth Service 使用私钥签名。

```json
{
  "version": "1.0",
  "session_id": "sess_abc123",
  "agent_id": "calendar_agent",
  "issued_at": "2026-07-12T10:00:00Z",
  "expires_at": "2026-07-12T10:30:00Z",
  "scopes": {
    "read": {
      "tags": ["preference"],
      "keys": ["user.display_name"],
      "deny_tags": ["financial"],
      "deny_keys": []
    },
    "write": {
      "tags": [],
      "keys": [],
      "deny_tags": ["identity"],
      "deny_keys": []
    }
  },
  "limits": {
    "max_read_queries": 50,
    "max_write_queries": 10
  },
  "profile": "local",
  "audience": "http://127.0.0.1:9374",
  "allowed_endpoints": ["127.0.0.1"]
}
```

### 7.2 Claims

| Claim | 类型 | 必填 | 说明 |
|-------|------|------|------|
| `version` | string | MUST | Token 格式版本。 |
| `session_id` | string | MUST | 绑定 Session。 |
| `agent_id` | string | MUST | Agent 标识。 |
| `issued_at` | ISO8601 | MUST | 签发时间。 |
| `expires_at` | ISO8601 | MUST | 过期时间。 |
| `scopes` | object | MUST | 读写授权范围。 |
| `limits` | object | OPTIONAL | 查询次数限制。 |
| `profile` | string | OPTIONAL | `local` 或 `remote`，默认 `local`。 |
| `audience` | string | OPTIONAL | Token 绑定的 Memory Guard 端点。 |
| `allowed_endpoints` | string[] | OPTIONAL | 允许使用该 Token 的网络位置白名单。 |

### 7.3 Validity

Auth Service 和 Memory Guard 在收到 Token 后 MUST 执行以下校验：

1. Token 签名有效。
2. 当前时间早于 `expires_at`。
3. `session_id` 处于 `active` 状态。
4. Token 不在黑名单中。
5. `profile` 与当前部署配置匹配。
6. `audience` 与当前 Memory Guard 端点匹配（Remote Profile 时 REQUIRED）。

任一校验失败，Memory Guard MUST 拒绝请求并返回错误。

## 8. HTTP API

### 8.1 Base URL

- Local Profile: `http://127.0.0.1:9374`
- Remote Profile: 用户配置的 HTTPS URL

### 8.2 Versioning

API 路径包含主版本号：

```
/v1/sessions
/v1/memory/:key
```

### 8.3 Authentication

所有 Agent 请求 MUST 在 HTTP 头中携带 Token：

```http
Authorization: Bearer <capability-token>
```

### 8.4 Error Format

所有错误响应 MUST 使用统一格式：

```json
{
  "error": {
    "code": "ACCESS_DENIED",
    "message": "Key is not within granted scope",
    "session_id": "sess_abc123"
  }
}
```

常见错误码：

| 错误码 | 说明 |
|--------|------|
| `INVALID_TOKEN` | Token 签名无效或格式错误。 |
| `TOKEN_EXPIRED` | Token 已过期。 |
| `SESSION_REVOKED` | Session 已被撤销。 |
| `ACCESS_DENIED` | 请求超出授权范围。 |
| `QUOTA_EXCEEDED` | 查询次数已耗尽。 |
| `WRITE_NOT_AVAILABLE` | MVP 阶段写入接口未启用。 |
| `STORE_UNAVAILABLE` | Memory Store 不可用。 |

## 9. Auth Service API

### 9.1 Create Session

```http
POST /v1/sessions
Content-Type: application/json
```

Request:

```json
{
  "agent_id": "calendar_agent",
  "agent_name": "日程助手",
  "requested_scopes": {
    "read": {
      "tags": ["preference", "identity:public"],
      "keys": []
    }
  },
  "duration_minutes": 30
}
```

Response:

```json
{
  "session_id": "sess_abc123",
  "status": "created",
  "agent_id": "calendar_agent",
  "requested_scopes": { ... },
  "expires_at": "2026-07-12T10:30:00Z"
}
```

### 9.2 Grant Session

```http
POST /v1/sessions/:id/grant
Content-Type: application/json
```

Request:

```json
{
  "granted_scopes": {
    "read": {
      "tags": ["preference"],
      "keys": ["user.display_name"]
    }
  }
}
```

Response:

```json
{
  "token": "<jwt-capability-token>",
  "token_type": "Bearer",
  "expires_at": "2026-07-12T10:30:00Z"
}
```

### 9.3 Close Session

```http
POST /v1/sessions/:id/close
```

Response:

```json
{
  "session_id": "sess_abc123",
  "status": "closed"
}
```

### 9.4 Revoke Session

```http
POST /v1/sessions/:id/revoke
```

Revoke MUST 使对应 Token 立即失效，并将其加入持久化黑名单。

### 9.5 Validate Token

```http
POST /v1/tokens/validate
Content-Type: application/json
```

Request:

```json
{
  "token": "<jwt-capability-token>"
}
```

Response:

```json
{
  "valid": true,
  "session_id": "sess_abc123",
  "expires_at": "2026-07-12T10:30:00Z"
}
```

## 10. Memory Guard API

### 10.1 Endpoints

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/v1/memory/:key` | 按 Key 读取 |
| GET | `/v1/memory?tag=:tag` | 按 Tag 读取 |
| POST | `/v1/memory/query` | 语义查询（MVP 不做） |
| PUT | `/v1/memory/:key` | 写入或更新（MVP 返回 `WRITE_NOT_AVAILABLE`） |
| DELETE | `/v1/memory/:key` | 删除（MVP 返回 `WRITE_NOT_AVAILABLE`） |

### 10.2 Read by Key

```http
GET /v1/memory/preference.theme
Authorization: Bearer <token>
```

Response:

```json
{
  "key": "preference.theme",
  "value": "dark",
  "tags": ["preference", "ui"],
  "sensitivity": "low",
  "source": "user",
  "updated_at": "2026-07-12T10:00:00Z"
}
```

### 10.3 Read by Tag

```http
GET /v1/memory?tag=preference
Authorization: Bearer <token>
```

Response:

```json
{
  "items": [
    {
      "key": "preference.theme",
      "value": "dark",
      "tags": ["preference", "ui"],
      "sensitivity": "low"
    }
  ]
}
```

### 10.4 Access Control

Memory Guard MUST 按以下顺序判定访问权限：

1. Token 签名有效。
2. Token 未过期。
3. Session 处于 `active` 状态。
4. Token 不在黑名单。
5. 查询次数未耗尽。
6. 目标 Key 或 Tag 在对应 action 的授权范围内。
7. 目标 Key 或 Tag 未被显式拒绝。
8. `sensitivity=high` 的 Memory Item 不能通过 tag 授权访问，必须命中 `keys`。

任一检查失败，MUST 返回 `ACCESS_DENIED` 并记录审计日志。

## 11. Memory Item

### 11.1 Format

```json
{
  "key": "preference.theme",
  "value": "dark",
  "tags": ["preference", "ui"],
  "sensitivity": "low",
  "source": "user",
  "created_at": "2026-07-01T10:00:00Z",
  "updated_at": "2026-07-12T10:00:00Z",
  "description": "用户界面主题偏好"
}
```

### 11.2 Fields

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `key` | string | MUST | 唯一标识符，建议使用点分命名空间。 |
| `value` | any | MUST | 记忆值。 |
| `tags` | string[] | MUST | 标签列表。 |
| `sensitivity` | enum | MUST | `low`、`medium`、`high`。 |
| `source` | string | MUST | `user` 或 `agent`。 |
| `created_at` | ISO8601 | MUST | 创建时间。 |
| `updated_at` | ISO8601 | MUST | 更新时间。 |
| `description` | string | OPTIONAL | 人类可读描述。 |

### 11.3 Sensitivity Rules

- `sensitivity=high` 的 Memory Item 不能通过 tag 授权访问。
- Agent 在 MVP 阶段 MUST NOT 写入任何 Memory Item。
- Milestone 2 引入 Staging 写入后，Agent 写入高敏感项仍 MUST 被拒绝。

## 12. Session

### 12.1 States

```
[created] --grant--> [active] --close/timeout/revoke--> [closed/expired/revoked]
```

### 12.2 Fields

```json
{
  "session_id": "sess_abc123",
  "agent_id": "calendar_agent",
  "status": "active",
  "created_at": "2026-07-12T10:00:00Z",
  "expires_at": "2026-07-12T10:30:00Z",
  "closed_at": null,
  "granted_scopes": { ... },
  "token_hash": "sha256:..."
}
```

### 12.3 Multi-Session Support

UOMP MUST 支持多个独立 Session 同时存在。每个 Session 拥有独立的 Token 和生命周期。不同 Session 的访问 MUST 独立审计。

### 12.4 Real-Time Revocation

Session 撤销后，对应 Token MUST 立即失效。Auth Service MUST 将 Token 加入持久化黑名单，Memory Guard 每次收到请求 MUST 先检查黑名单。

## 13. Local Profile

### 13.1 Requirements

- Memory Guard MUST 默认监听 `127.0.0.1:9374`。
- Memory Guard MUST NOT 默认绑定到 `0.0.0.0` 或公网接口。
- Local Profile 下的 Token `profile` claim MUST 为 `"local"`。

### 13.2 Token Delivery

MVP 实现 RECOMMENDED 通过环境变量传递 Token：

```bash
export UOM_TOKEN="<capability-token>"
uom-calendar-agent
```

## 14. Remote Profile

### 14.1 Overview

Remote Profile 允许 Agent 不在用户本机运行时访问 Memory Guard。UOMP 协议定义安全要求，但不强制具体连接模式。

### 14.2 Security Requirements

Remote Profile 实现 MUST 满足：

1. 使用 TLS 1.3。
2. 使用 mTLS，远程 Agent 持有用户签发的客户端证书。
3. Capability Token 的 `profile` claim 为 `"remote"`。
4. Token 包含 `audience` claim，绑定到具体 Memory Guard 端点。
5. Token 有效期 SHOULD 不超过 10 分钟。
6. 用户必须显式开启 Remote Profile。

### 14.3 Connection Modes

Remote Profile 支持但不限于以下模式：

- 用户自托管网关
- 反向隧道（Tunnel）
- P2P 加密连接

具体模式由实现选择，协议不做强制要求。

## 15. Agent Identity Verification

### 15.1 Overview

UOMP 支持多种 Agent 发布者身份验证机制。用户/宿主程序可选择信任哪些方式。

### 15.2 Supported Methods

| 方法 | 说明 |
|------|------|
| DID | 去中心化标识符，如 `did:ethr`、`did:web`。 |
| GPG | 发布者使用 GPG 密钥签名 `uom.json`。 |
| X.509 | 发布者使用 CA 签发的证书签名。 |
| Registry | ERC8004 等 Registry 提供的验证状态。 |

### 15.3 Verification Process

1. 读取 `uom.json` 中的 `identity` 字段。
2. 根据 `verification_methods` 选择验证方式。
3. 验证 `uom.json` 的签名或证明。
4. 验证通过后才允许创建 Session。

### 15.4 Trust Policy

- 用户 MAY 配置信任列表：信任的 DID、GPG Key ID、CA、Registry。
- 未通过身份验证的 Agent MAY 被允许运行，但授权面板 MUST 提示"未验证发布者"。
- 企业部署 MAY 强制要求特定验证方式。

## 16. Agent Registry

### 16.1 Overview

UOMP 核心协议不定义 Agent Registry。协议参考实现 MAY 支持现有 Registry 标准，如 ERC8004。

### 16.2 Registry Client

MVP 参考实现 SHOULD 提供以下 CLI 命令：

```bash
uom registry search <keyword>
uom registry install <agent_id>
```

Registry 客户端 MUST 返回 Agent 元数据和 `uom.json` 位置，但 MUST NOT 参与授权决策。

### 16.3 Registry Independence

- 用户 MUST 能够不通过 Registry 直接安装和运行 Agent。
- 授权决策 MUST 始终在用户本地完成。

## 17. Audit and Logging

### 17.1 Audit Log Entry

```json
{
  "id": "log_xxx",
  "timestamp": "2026-07-12T10:05:00Z",
  "session_id": "sess_abc123",
  "agent_id": "calendar_agent",
  "action": "read",
  "key": "preference.theme",
  "tags": ["preference", "ui"],
  "allowed": true,
  "reason": "scope matched",
  "request_size": 0,
  "response_size": 12,
  "query_count_remaining": 49
}
```

### 17.2 Required Fields

每条审计日志 MUST 包含：

- `timestamp`
- `session_id`
- `agent_id`
- `action`
- `key` 或 `tag`
- `allowed`
- `reason`

### 17.3 Storage

- 审计日志 MUST 与 Memory Store 分开存储。
- 审计日志保留时长 MUST 可配置，默认 90 天。
- 审计日志 SHOULD 加密存储，防止 Agent 篡改。

### 17.4 Blockchain Extension

未来扩展 MAY 将授权事件和访问事件摘要锚定到区块链，实现不可篡改的审计证明。协议本身不强制特定链。

## 18. Security Considerations

### 18.1 Token Security

- Capability Token MUST 由 Auth Service 私钥签名。
- Token SHOULD 使用短有效期（默认 30 分钟，Remote Profile 10 分钟）。
- Token MUST NOT 被持久化到 Agent 可任意读取的位置。

### 18.2 Memory Store Security

- Memory Store SHOULD 加密存储。
- 高敏感数据 SHOULD 额外加密。

### 18.3 Communication Security

- Local Profile 使用 HTTP over localhost。
- Remote Profile MUST 使用 TLS 1.3 + mTLS。
- SDK MUST NOT 记录 Token。

### 18.4 Agent Write Restrictions

- MVP 阶段 Agent MUST NOT 写入 Memory。
- Milestone 2 引入 Staging 写入后，Agent 写入 MUST 经用户确认才生效。
- Agent MUST NOT 写入 `sensitivity=high` 的 Memory Item。

## 19. Privacy Considerations

- UOMP 设计目标是最小化 Agent 访问的数据范围。
- 用户 SHOULD 能够查看并撤销任何活跃 Session。
- 审计日志 SHOULD 帮助用户理解 Agent 访问了哪些数据。
- Memory Guard SHOULD 避免返回授权范围外的任何数据，包括存在性信息。

## 20. Future Work

- Agent 写入 Staging 机制。
- 语义检索（`query` 接口）。
- 写入版本历史与回滚。
- 策略模板。
- Remote Profile 参考实现。
- 区块链审计锚定。

## 21. References

- [RFC 2119] Key words for use in RFCs to Indicate Requirement Levels
- [RFC 7519] JSON Web Token (JWT)
- [RFC 8446] The Transport Layer Security (TLS) Protocol Version 1.3
- [ERC8004] Agent Registry on Blockchain（用户提及的现有标准）

---

## 附录 A: 最小交互示例

```bash
# 1. 用户发现 Agent（通过 ERC8004 Registry 或本地）
uom registry search calendar

# 2. 安装 Agent
uom registry install calendar_agent

# 3. 用户侧创建 Session
curl -X POST http://127.0.0.1:9374/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "calendar_agent",
    "agent_name": "日程助手",
    "requested_scopes": {
      "read": { "tags": ["preference"], "keys": [] }
    },
    "duration_minutes": 30
  }'

# 4. 用户确认授权
curl -X POST http://127.0.0.1:9374/v1/sessions/sess_abc123/grant \
  -H "Content-Type: application/json" \
  -d '{
    "granted_scopes": {
      "read": { "tags": ["preference"], "keys": [] }
    }
  }'

# 5. Agent 运行（携带 Token）
export UOM_TOKEN="<token>"
uom-calendar-agent

# 6. Agent 内部读取记忆
# const memory = new UserMemory({ token: process.env.UOM_TOKEN });
# const theme = await memory.get<string>('preference.theme');

# 7. 关闭 Session
curl -X POST http://127.0.0.1:9374/v1/sessions/sess_abc123/close
```

---

## 附录 B: `uom.json` 完整示例

```json
{
  "uomp_version": "1.0",
  "agent": {
    "id": "calendar_agent",
    "name": "日程助手",
    "version": "1.2.0",
    "description": "帮助用户管理日程和待办事项",
    "publisher": "example-org"
  },
  "requested_scopes": {
    "read": {
      "tags": ["preference", "identity:public"],
      "keys": [],
      "description": "读取用户偏好和公开身份信息，以提供个性化日程建议"
    },
    "write": {
      "tags": ["preference"],
      "keys": [],
      "description": "写入与日程相关的偏好设置"
    }
  },
  "required_capabilities": ["memory.read"],
  "optional_capabilities": ["memory.query"],
  "requires_remote": false,
  "identity": {
    "did": "did:ethr:0xabc123...",
    "verification_methods": ["did", "gpg"],
    "proof": {
      "type": "Ed25519Signature2020",
      "created": "2026-07-12T10:00:00Z",
      "proofValue": "..."
    }
  }
}
```
