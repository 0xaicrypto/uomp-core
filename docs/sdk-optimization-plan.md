# UOMP SDK & CLI 优化方案

> 基于当前 SDK、CLI、Browser Dashboard 的全面审计。目标是统一三种消费者（CLI、Node.js Agent、浏览器 App）都通过同一套 SDK 访问 UOMP。

---

## 1. 当前问题

```
          ┌──────────────┐
          │  UOMP SDK    │ ← 设计良好但几乎无人使用
          │ (UompClient) │
          └──────────────┘
                 ↑
        ┌────────┼────────┐
        │        │        │
       ❌       ❌       ❌
     CLI     Agent    Browser
    (自己调    (部分用   (全手写
    Auth/     SDK)      HTTP)
    Guard/
    Store)
```

**三个消费者各有各的调用方式，SDK 没有成为统一入口。**

---

## 2. 优化目标

重构后：

```
  CLI ──► UompClient (Local) ──► AuthService + Guard + Store (同进程)
  Agent ─► UompClient (HTTP) ──► Gateway ──► Guard ──► Store
  Browser ─► UompClient (HTTP) ──► Gateway ──► Guard ──► Store
             │
             └── 同一套 API，同一个 package
```

---

## 3. 具体改动

### Phase 1：SDK 填空（让浏览器 Dashboard 能用 SDK）

| # | 做什么 | 改哪里 |
|---|--------|--------|
| 1 | SDK 增加 `./browser` export，使 `import { BrowserSDK } from '@uomp/sdk/browser'` 可用 | `packages/sdk/package.json` |
| 2 | `BrowserSDK.fromWallet()` 接入真正的钱包签名逻辑（从 dashboard/sdk.js 移植 PBKDF2 密钥推导） | `packages/sdk/src/browser.ts` |
| 3 | `BrowserSDK.fromSeedPhrase()` 实现 12 词 BIP-39 | 同上 |
| 4 | `BrowserSDK.fromUrlHash()`、`createFromStorage()` 保持现有实现 | 同上 |
| 5 | `MemoryClient` 增加 `set()`、`delete()`、`import()`（目前只读） | `packages/sdk/src/memory.ts` |

### Phase 2：CLI 迁移到 SDK

| # | 做什么 | 改哪里 |
|---|--------|--------|
| 6 | CLI 的 `authorize` 改为调用 `uomp.auth.createSession()` + `uomp.auth.grant()` | `packages/cli/src/commands/authorize.ts` |
| 7 | CLI 的 `sessions` 改为调用 SDK 方法（或 AuthService 暴露 `listSessions` 接口） | `packages/cli/src/commands/sessions.ts` |
| 8 | CLI 的 `audit` 改为调用 `uomp.audit.query()` | `packages/cli/src/commands/audit.ts` |
| 9 | 删除 `commands/session.ts`（死代码） | 删除文件 |
| 10 | 删除 CLI 中直接的 `AuthService`/`MemoryGuard`/`MemoryStore`/`JWTTokenIssuer` 导入，统一通过 SDK | 所有 CLI 命令文件 |

### Phase 3：去重 + 清理

| # | 做什么 | 改哪里 |
|---|--------|--------|
| 11 | `inferSensitivity()` 移到 `@uomp/core`，删除 3 处重复 | `core/src/index.ts` + CLI cmd 文件 |
| 12 | `loadManifest()` / `normalizeManifest()` 移到 `@uomp/core`，删除 `run.ts` 里的重复实现 | `packages/core` + CLI |
| 13 | `IdentityVerifier` 通过 SDK 暴露（`uomp.identity.verify()`） | `packages/sdk/src/client.ts` |
| 14 | StoreRouter 重构为复用 MemoryClient/Transport，不是平行实现 | `packages/sdk/src/store-router.ts` |

### Phase 4：浏览器 Dashboard 去手写代码

| # | 做什么 | 改哪里 |
|---|--------|--------|
| 15 | Dashboard 用 `<script type="module">` 直接 import SDK bundle | `public/dashboard/index.html` |
| 16 | 删除 dashboard 内联的 `UompGateway` 类、手写 HTTP 请求 | 同上 |
| 17 | 改用 `uomp.memory.getByTag()`、`uomp.aggregate.query()` 等 | 同上 |

---

## 4. 新增 API 一览

```ts
// ── SDK 新增 ──────────────────────────────────────

// Browser 入口（Phase 1）
import { BrowserSDK } from '@uomp/sdk/browser';
const uomp = await BrowserSDK.fromWallet();      // MetaMask/Argent X
const uomp = BrowserSDK.fromSeedPhrase(words);   // 12词恢复
const uomp = BrowserSDK.fromUrlHash();           // URL hash 自动填充

// Memory 写操作（Phase 1）
await uomp.memory.set('AAPL', item);             // 写入
await uomp.memory.delete('AAPL');                // 删除
await uomp.memory.importCSV(csvText, opts);      // CSV 导入

// Identity（Phase 3）
const result = await uomp.identity.verifyManifest(manifest);

// Auth 增强（Phase 2）
const { sessionId, token } = await uomp.auth.createAndGrant(manifest, scopes);

// ── @uomp/core 新增 ────────────────────────────────

import { inferSensitivity, loadManifest, normalizeManifest } from '@uomp/core';
```

---

## 5. 不改的部分

| 保留 | 原因 |
|------|------|
| `UserMemory` | 向后兼容，不删 |
| `apps/gateway`、`apps/relay`、`apps/server` | 功能完整，不需要改动 |
| `packages/token`、`packages/auth`、`packages/guard`、`packages/store` | 作为 SDK 依赖，继续独立存在 |
| dashboard/sdk.js 独立 bundle | 在 SDK 完成 Phase 1 后逐步替换 |

---

## 6. 改动量估算

| Phase | 文件 | 行数（增/删） |
|-------|------|-------------|
| 1 | SDK browser.ts, memory.ts, package.json | +80 / -20 |
| 2 | CLI 6 个命令文件 | +40 / -120 |
| 3 | core + SDK + CLI 去重 | +30 / -80 |
| 4 | dashboard/index.html | +20 / -80 |
| **合计** | | **+170 / -300** |

净删 130 行，增 170 行。改动量小，风险可控。
