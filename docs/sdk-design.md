# UOMP SDK 设计文档

> 状态：草案（Draft）
> 目标：定义 UOMP Agent SDK 的完整 API、架构、集成模式与实现路线。

---

## 1. 背景与目标

### 1.1 现状

`packages/sdk` 目前只有一个 `UserMemory` 类，提供 `get()` / `getByTag()` 两个读方法。Agent 开发者需要自行处理：

- mTLS 证书加载（Gateway 模式）
- 聚合查询（手动构造 HTTP 请求）
- Payload 上传 / 下载
- 删除证明提交
- Token 刷新
- 审计日志查询
- 错误重试与降级

### 1.2 目标

提供**一个 `UompClient` 类**，Agent 开发者导入后即可完整使用 UOMP 所有能力：

```ts
import { UompClient } from '@uomp/sdk';

const uomp = new UompClient({
  token: process.env.UOM_TOKEN,
  baseUrl: process.env.UOMP_BASE_URL,
});

// Reading memory
const holdings = await uomp.memory.getByTag('portfolio:holdings');

// Aggregation queries
const total = await uomp.aggregate.sum('portfolio:holdings', 'value.market_value');

// Payload management
const payloadId = await uomp.payload.upload(report);

// Session management
await uomp.session.submitDeletionProof();

// Audit queries
const logs = await uomp.audit.query({ limit: 20 });
```

---

## 2. 设计原则

| 原则 | 说明 |
|------|------|
| **零配置起步** | `new UompClient({ token })` 就能工作，其余全部自动检测 |
| **渐进增强** | 简单场景用默认值，复杂场景可按需配置 |
| **位置无关** | 同一套 API，Local / Remote / Gateway mTLS 自动适配 |
| **类型安全** | 完整的 TypeScript 类型，泛型支持 |
| **错误友好** | 结构化错误码，区分可重试 / 不可重试 |
| **轻量** | 零运行时依赖（仅使用 Node.js 内置 `fetch` / `https`） |

---

## 3. 架构

```
┌──────────────────────────────────────────────────────┐
│                    UompClient                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │   memory     │  │  aggregate   │  │  payload  │  │
│  │  get()       │  │  sum()       │  │  upload() │  │
│  │  getByTag()  │  │  avg()       │  │  download()│  │
│  │  getByKey()  │  │  count()     │  │  list()   │  │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘  │
│         │                 │                 │         │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌─────┴─────┐  │
│  │   session    │  │    audit     │  │ transport │  │
│  │  refresh()   │  │  query()     │  │  fetch()  │  │
│  │  deleteProof │  │  get()       │  │  mTLS     │  │
│  │  close()     │  └──────────────┘  │  retry    │  │
│  └──────────────┘                    │  timeout  │  │
│                                      └───────────┘  │
└──────────────────────────────────────────────────────┘
```

### 3.1 Transport 层

- 自动检测 `baseUrl` 协议（`http://` → 直连，`https://` → Gateway mTLS）
- Gateway 模式下自动加载 `~/.uomp/.gateway-certs/` 客户端证书
- 支持自定义 `fetch` 注入（用于测试、代理等）
- 内置重试（可配置次数、退避策略）
- 请求超时控制

### 3.2 子客户端

每个子客户端是一个独立的对象，内部共享同一个 transport 实例：

| 子客户端 | 职责 |
|----------|------|
| `memory` | 读写 Memory Item（get, getByTag, getByKey） |
| `aggregate` | 聚合查询（sum, avg, count, min, max） |
| `payload` | Payload 上传 / 下载 / 列表 |
| `session` | Session 管理（刷新 Token、提交删除证明、关闭） |
| `audit` | 审计日志查询 |
| `health` | 健康检查 |

---

## 4. API 设计

### 4.1 UompClient 构造

```ts
interface UompClientOptions {
  /** Capability Token (UOM_TOKEN) */
  token?: string;
  /** Memory Guard or Gateway URL (UOMP_BASE_URL) */
  baseUrl?: string;
  /** Agent ID (for X-UOMP-Agent-Id header) */
  agentId?: string;
  /** Session ID (for deletion proof, refresh) */
  sessionId?: string;

  /** mTLS configuration */
  tls?: {
    /** Path to client certificate */
    certPath?: string;
    /** Path to client key */
    keyPath?: string;
    /** Path to CA certificate */
    caPath?: string;
    /** Disable TLS verification (dev only) */
    rejectUnauthorized?: boolean;
  };

  /** Transport options */
  transport?: {
    /** Request timeout in ms */
    timeout?: number;
    /** Max retry count */
    retries?: number;
    /** Backoff base in ms */
    retryBackoff?: number;
    /** Custom fetch implementation */
    fetch?: typeof fetch;
  };

  /** Auto-initialize from env vars? */
  autoInit?: boolean;
}

const uomp = new UompClient({
  token: process.env.UOM_TOKEN,      // required
  baseUrl: process.env.UOMP_BASE_URL, // defaults to http://127.0.0.1:9374
  agentId: 'stock-analyst',
});
```

### 4.2 Memory 子客户端

```ts
interface MemoryClient {
  /** Get a single memory item by key */
  get<T = Record<string, unknown>>(key: string): Promise<MemoryItem<T> | null>;

  /** Get all items for a tag */
  getByTag<T = Record<string, unknown>>(tag: string): Promise<MemoryItem<T>[]>;

  /** Get multiple items by keys */
  getByKeys<T = Record<string, unknown>>(keys: string[]): Promise<MemoryItem<T>[]>;
}
```

### 4.3 Aggregate 子客户端

```ts
type AggregateOp = 'sum' | 'avg' | 'count' | 'min' | 'max';

interface AggregateResult {
  op: AggregateOp;
  field?: string;
  result: number;
  tag?: string;
}

interface AggregateClient {
  sum(tag: string, field: string): Promise<AggregateResult>;
  avg(tag: string, field: string): Promise<AggregateResult>;
  count(tag: string): Promise<AggregateResult>;
  min(tag: string, field: string): Promise<AggregateResult>;
  max(tag: string, field: string): Promise<AggregateResult>;
  query(tag: string, op: AggregateOp, field?: string): Promise<AggregateResult>;
}
```

### 4.4 Payload 子客户端

```ts
interface PayloadClient {
  /** Upload payload (returns payload_id) */
  upload(data: string | Buffer | Uint8Array, contentType?: string): Promise<string>;

  /** Download payload by ID */
  download(id: string): Promise<Buffer>;

  /** Get payload metadata */
  info(id: string): Promise<PayloadInfo>;
}
```

### 4.5 Session 子客户端

```ts
interface SessionClient {
  /** Refresh the access token (requires refresh_token) */
  refresh(refreshToken: string): Promise<{ token: string; expiresAt: string }>;

  /** Submit a deletion proof */
  submitDeletionProof(opts?: {
    fieldsAccessed?: string[];
    method?: string;
  }): Promise<{ status: string; deletionProofId: string }>;

  /** Close the current session */
  close(): Promise<void>;

  /** Check if session is active */
  isActive(): Promise<boolean>;
}
```

### 4.6 Audit 子客户端

```ts
interface AuditQueryOptions {
  sessionId?: string;
  agentId?: string;
  limit?: number;
  offset?: number;
}

interface AuditClient {
  query(options?: AuditQueryOptions): Promise<AuditLogEntry[]>;
  getLastAccess(sessionId?: string): Promise<AuditLogEntry | null>;
}
```

---

## 5. 集成模式

### 5.1 Node.js Agent（最常用）

```ts
import { UompClient } from '@uomp/sdk';

const uomp = new UompClient();
// auto-initializes from UOM_TOKEN + UOMP_BASE_URL env vars

const holdings = await uomp.memory.getByTag('portfolio:holdings');
```

### 5.2 Gateway mTLS 模式

```ts
const uomp = new UompClient({
  baseUrl: 'https://my-gateway.example.com',
  tls: {
    autoMtls: true, // auto-load ~/.uomp/.gateway-certs/
  },
});
```

### 5.3 浏览器 / Web App

```ts
const uomp = new UompClient({
  baseUrl: 'https://my-gateway.example.com',
  transport: {
    fetch: window.fetch.bind(window), // use browser fetch
  },
});
```

注意：浏览器中无法直接使用 mTLS（需要 Service Worker 或浏览器扩展支持）。推荐浏览器 App 通过自己的后端代理 Gateway。

### 5.4 无状态 / Serverless Agent

```ts
export default async function handler(req) {
  const { token, gatewayUrl } = req.body;
  const uomp = new UompClient({ token, baseUrl: gatewayUrl });

  const holdings = await uomp.memory.getByTag('portfolio:holdings');
  // ... analyze ...

  await uomp.session.submitDeletionProof();
  return { analysis };
}
```

---

## 6. 错误处理

```ts
import { UompError, UompErrorCode } from '@uomp/sdk';

try {
  await uomp.memory.getByTag('private');
} catch (err) {
  if (err instanceof UompError) {
    switch (err.code) {
      case UompErrorCode.ACCESS_DENIED:
        // Token scope doesn't cover this tag
        break;
      case UompErrorCode.TOKEN_EXPIRED:
        // Need to refresh
        break;
      case UompErrorCode.INVALID_TOKEN:
        // Token malformed or revoked
        break;
      case UompErrorCode.AUDIENCE_MISMATCH:
        // Wrong Gateway URL
        break;
      case UompErrorCode.QUOTA_EXCEEDED:
        // Request limit reached
        break;
      case UompErrorCode.NETWORK_ERROR:
        // Retryable (Gateway unreachable)
        break;
    }
  }
}
```

---

## 7. 向后兼容

现有的 `UserMemory` 类保持可用，但标记为 deprecated：

```ts
// Old (still works)
import { UserMemory } from '@uomp/sdk';
const memory = new UserMemory({ token, baseUrl });
const items = await memory.getByTag('tag');

// New (recommended)
import { UompClient } from '@uomp/sdk';
const uomp = new UompClient({ token, baseUrl });
const items = await uomp.memory.getByTag('tag');
```

---

## 8. 实现路线

### Phase 1：核心 SDK（当前优先级）

| 任务 | 实现 |
|------|------|
| `UompClient` 主类 | `packages/sdk/src/client.ts` |
| Transport 层（HTTP + mTLS + 重试） | `packages/sdk/src/transport.ts` |
| `memory` 子客户端 | `packages/sdk/src/memory.ts` |
| `aggregate` 子客户端 | `packages/sdk/src/aggregate.ts` |
| `payload` 子客户端 | `packages/sdk/src/payload.ts` |
| `session` 子客户端 | `packages/sdk/src/session.ts` |
| `audit` 子客户端 | `packages/sdk/src/audit.ts` |
| 类型定义 | `packages/sdk/src/types.ts` |
| 错误类型 | `packages/sdk/src/errors.ts` |
| 向后兼容（保留 UserMemory） | `packages/sdk/src/index.ts` |

### Phase 2：高级特性

| 任务 | 说明 |
|------|------|
| Token 自动刷新 | SDK 内部维护 refresh_token，过期前自动续期 |
| Payload E2E 加密 | 使用 Remote Profile 公钥自动加密/解密 |
| mTLS 证书自动生成 | 首次使用时自动生成客户端证书 |
| 连接池与 keep-alive | 复用 HTTPS 连接 |

### Phase 3：跨平台

| 任务 | 说明 |
|------|------|
| React Native 适配 | 使用 RN 原生 fetch |
| 浏览器 Service Worker | 处理 CORS + 跨域请求 |
| Python SDK | 端口核心逻辑 |
| CLI SDK 重构 | 复用 packages/sdk 而非重复实现 |

---

## 9. 与现有代码的关系

现有 `index.js` 中的 agent：
```ts
// Before (stock-analyst/index.js)
import { UserMemory } from '@uomp/sdk';
const memory = new UserMemory({ token, baseUrl, agentId, fetch: mtlsFetch });
const holdings = await memory.getByTag('portfolio:holdings');
```

迁移后：
```ts
// After
import { UompClient } from '@uomp/sdk';
const uomp = new UompClient();
const holdings = await uomp.memory.getByTag('portfolio:holdings');
const total = await uomp.aggregate.sum('portfolio:holdings', 'value.market_value');
await uomp.session.submitDeletionProof();
```

代码量减少 ~80%，mTLS 自动处理。

---

## 10. 文件结构

```
packages/sdk/
├── src/
│   ├── index.ts          # 导出 UompClient + 兼容 UserMemory
│   ├── client.ts         # UompClient 主类
│   ├── memory.ts         # MemoryClient
│   ├── aggregate.ts      # AggregateClient
│   ├── payload.ts        # PayloadClient
│   ├── session.ts        # SessionClient
│   ├── audit.ts          # AuditClient
│   ├── transport.ts      # HTTP 传输层（fetch、mTLS、重试）
│   ├── types.ts          # 公开类型定义
│   └── errors.ts         # UompError 类
├── package.json
├── tsconfig.json
└── README.md
```

---

## 相关文档

- [CLI/SDK 设计（范例推导）](./cli-sdk-design.md)
- [远程授权设计](./remote-authorization-design.md)
- [协议规范](https://www.uomp.org/spec/)
