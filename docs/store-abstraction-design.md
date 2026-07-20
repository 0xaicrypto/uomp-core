# UOMP Store 抽象化设计文档

> 状态：草案
> 目标：将 Memory Store 从硬编码 SQLite 改为可插拔后端，支持多设备、云端加密存储、去中心化

---

## 1. 动机

| 问题 | 现状 | 目标 |
|------|------|------|
| 多设备访问 | SQLite 绑定单机文件系统，换电脑 = 数据丢失 | 同一份数据，任意设备可访问 |
| 浏览器模式 | 浏览器无法读 `~/.uomp/memory.db` | 浏览器通过 Gateway → API → Store 后端 |
| 数据主权 | 已满足（数据在本地） | 扩展到云端时保持 E2E 加密 |
| 同步复杂度 | 用户手动 Dropbox/Syncthing 同步 SQLite | 内置同步，无需第三方 |


## 2. 架构

```
                        Guard (不变)
                           │
                    ┌──────┴──────┐
                    │ Store API   │  ← 抽象层（新增）
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────┴─────┐     ┌──────┴──────┐    ┌──────┴──────┐
   │ SQLite   │     │ Encrypted   │    │  IPFS       │
   │ (本地)   │     │ Object      │    │  (去中心化) │
   │ 文件系统 │     │ S3/R2/B2    │    │             │
   └──────────┘     └─────────────┘    └─────────────┘
        │                  │                  │
   ~/.uomp/          s3://bucket/        ipfs://cid
   memory.db         encrypted blobs     content-addressed
```

### 核心原则

1. **Guard 不感知后端**——只调用 Store API
2. **加密在 Guard 层完成**——后端不知道明文
3. **用户持有密钥**——通过 seed phrase 在多设备间共享
4. **本地 SQLite 永远是默认**——`uomp init` 不改变现有体验


## 3. Store API

```ts
// packages/store/src/types.ts
export interface IMemoryStore {
  // Connection
  connect(config: StoreConfig): Promise<void>;
  disconnect(): Promise<void>;

  // CRUD
  get<T = unknown>(key: string): Promise<MemoryItem<T> | null>;
  getByTag<T = unknown>(tag: string): Promise<MemoryItem<T>[]>;
  getAll<T = unknown>(): Promise<MemoryItem<T>[]>;
  set<T = unknown>(item: Omit<MemoryItem<T>, 'createdAt' | 'updatedAt'> & Partial<Pick<MemoryItem<T>, 'createdAt' | 'updatedAt'>>): Promise<boolean>;
  delete(key: string): Promise<boolean>;

  // Metadata
  listTags(): Promise<string[]>;
  count(): Promise<number>;
  stats(): Promise<StoreStats>;

  // Backend info
  readonly backend: string;
  readonly isReady: boolean;
}

export interface StoreConfig {
  backend: 'sqlite' | 'encrypted-object' | 'ipfs';
  sqlite?: { dbPath: string };
  s3?: {
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  ipfs?: { gateway: string };
  encryption?: {
    enabled: boolean;
    keyId?: string;
  };
}

export interface StoreStats {
  itemCount: number;
  totalSizeBytes: number;
  backend: string;
  encryptionEnabled: boolean;
}
```

### 与现有 MemoryStore 的关系

现有 `MemoryStore` 类（`packages/store/src/index.ts`）实现 `IMemoryStore` 接口。SQLite 版本保持不变，新增 `EncryptedObjectStore` 和 `IPFSStore`。


## 4. 加密对象存储后端

### 数据布局

```
s3://uomp-data/user-abc123/
├── meta.json           # 加密（store metadata）
├── items/
│   ├── AAPL           # 加密（单个 Memory Item）
│   ├── TSLA           # 加密
│   └── NVDA           # 加密
├── tags/
│   ├── portfolio:holdings → ["AAPL", "TSLA", "NVDA"]  # 加密
│   └── profile:risk → ["user-risk-profile"]            # 加密
└── index.json         # 加密（item key → blob key 映射）
```

### 加密方案

```
Item 明文 → AES-256-GCM → ciphertext + nonce + tag
                    ↑
           ItemKey = HKDF(masterKey, item.key)
                    ↑
           masterKey = 用户的 Ed25519 seed 派生
```

- 每个 item 独立加密（独立 nonce，独立 key derivation）
- `tags/` 索引也加密（tag 名称是明文的，但内容是加密的 key 列表）
- `meta.json` 存后端配置、schema version、加密参数

### 查询流程

```ts
// GET /v1/memory?tag=portfolio:holdings
// →
// 1. 读 tags/portfolio:holdings（解密 → 得到 key 列表）
// 2. 并发读 items/AAPL, items/TSLA, items/NVDA（解密）
// 3. 返回明文 MemoryItem[]
```

写回 Index 缓存优化：Guard 内存缓存 tag→keys 映射，避免每次读 tags/ 对象。


## 5. 密钥管理（Seed Phrase）

```
User                     Device A                    Device B
────                     ────────                    ────────
uomp init
  → 生成 Ed25519 keypair
  → 显示 12 词 seed phrase              uomp user setup
    "coral maple ..."                        → 输入 seed phrase
  → 派生 masterKey                          → 派生相同 masterKey
  → 存储 seed hash                          → 验证 seed hash 一致
  → 自动 sync pull                          → 数据立即可用
```

### 命令

```bash
uomp user init              # 生成 seed phrase（首次）
uomp user setup             # 从 seed phrase 恢复（新设备）
uomp user export            # 显示 seed phrase（迁移）
uomp user status            # 当前用户 ID + 后端状态
```


## 6. 命令行设计

```bash
# Store 管理
uomp store status           # 当前后端 + 数据统计
uomp store switch <backend> # 切换后端（SQLite → S3）
uomp store migrate          # 将数据从当前后端迁移到指定后端

# 同步
uomp sync pull              # 从后端拉取最新数据到本地
uomp sync push              # 推送本地数据到后端
uomp sync auto              # 自动同步（Guard 每次写后 push）

# 配置
uomp config set store.backend encrypted-object
uomp config set store.s3.bucket uomp-data
uomp config set store.s3.region us-east-1
uomp config set store.encryption.enabled true
```

## 7. 与 Guard 的集成

现在 Guard 直接实例化 `MemoryStore`：

```ts
// packages/guard/src/index.ts (现有)
this.store = new MemoryStore({ dbPath: options.memoryDbPath });
```

改为通过 Store 工厂创建：

```ts
// 新
this.store = await createStore(config.store);
```

工厂根据 `~/.uomp/config.json` 的 `store.backend` 选择实现：

```ts
// packages/store/src/factory.ts
export async function createStore(config: StoreConfig): Promise<IMemoryStore> {
  switch (config.backend) {
    case 'sqlite':
      return new SQLiteStore(config.sqlite!);
    case 'encrypted-object':
      return new EncryptedObjectStore(config);
    case 'ipfs':
      return new IPFSStore(config.ipfs!);
    default:
      return new SQLiteStore({ dbPath: join(homedir(), '.uomp', 'memory.db') });
  }
}
```

Guard 接口不变——`get()`, `getByTag()` 签名一致。


## 8. 对规范的影响

| 位置 | 变更 |
|------|------|
| **§4 Terminology** | 新增 `Store Backend` 术语：Memory Store 的可插拔持久化后端 |
| **§4 Memory Store** (新) | 新增一段描述 Store 抽象层、三种后端类型、加密策略 |
| **§5.1 Architecture** | 架构图增加 Store Backend 层（在 Memory Store 下方） |
| **§11 Memory Item** | 无变化 |
| **§11.4 Store Backends** (新) | 定义 SQLite Backend、Encrypted Object Backend、IPFS Backend 的规范要求 |
| **§20 Security Considerations** | 新增 §20.5 Store Backend Security：E2E 加密要求、密钥管理 BEST PRACTICES、seed phrase entropy 要求 |
| **§21 Future Work** | 加 IPFS Backend、去中心化 Store 发现协议 |
| **§8 HTTP API** | GET /v1/store/stats（新增，可选） |
| **§8.4 Error Codes** | 新增 `STORE_MIGRATION_IN_PROGRESS`、`BACKEND_UNAVAILABLE` |
| **附录 A 最小交互示例** | 新增 Store 切换命令 |

### 推荐新增章节草稿

#### §11.4 Store Backends

> UOMP defines a **pluggable store backend** interface. Memory Guard interacts with the store through this interface and is agnostic to the backend implementation.
>
> Implementations MUST support three backend profiles:
>
> **SQLite Backend** (local)
> - Default for Local Profile.
> - Stores Memory Items in a single SQLite file under `~/.uomp/memory.db`.
> - No encryption required at the store layer (disk encryption is the user's responsibility).
>
> **Encrypted Object Backend** (cloud)
> - Each Memory Item is stored as an independently encrypted object (RECOMMENDED: AES-256-GCM).
> - Tag indices MUST also be encrypted.
> - Encryption keys MUST be derived from the user's Ed25519 seed (HKDF).
> - Backend servers MUST NOT have access to plaintext data.
> - RECOMMENDED object stores: S3-compatible, R2, B2.
>
> **IPFS Backend** (decentralized)
> - Memory Items are content-addressed and stored on IPFS.
> - A local index maps tags to CIDs.
> - Encryption at the IPFS layer is OPTIONAL but RECOMMENDED.

#### §20.5 Store Backend Security

> When using a cloud store backend:
> 1. Data MUST be encrypted before leaving the Memory Guard process.
> 2. Each Memory Item MUST use an independent encryption key derived from the item's `key` field.
> 3. The user's seed phrase SHOULD have ≥128 bits of entropy (12-word BIP-39).
> 4. Seed phrases MUST NOT be stored on cloud backends.
> 5. Backend credentials (S3 keys, etc.) SHOULD be stored in `~/.uomp/config.json` with file permissions `0600`.


## 9. SDK 改动

### `@uomp/sdk` 新增

```ts
interface UompClient {
  store: StoreClient;  // ← 新增
}

interface StoreClient {
  stats(): Promise<StoreStats>;
  migrate(target: StoreBackend): Promise<void>;
}

const stats = await uomp.store.stats();
// { backend: 'sqlite', itemCount: 10, totalSizeBytes: 4096 }
```

### `@uomp/cli` 新增

```
uomp user init / setup / export / status
uomp store status / switch / migrate
uomp sync pull / push / auto
```


## 10. 实施路线

### Phase 1：Store 接口抽象（核心）

| 任务 | 文件 |
|------|------|
| 定义 `IMemoryStore` 接口 | `packages/store/src/types.ts`（新） |
| 现有 `MemoryStore` 实现接口 | `packages/store/src/index.ts`（重构） |
| Store 工厂 `createStore()` | `packages/store/src/factory.ts`（新） |
| Guard 改用工厂 | `packages/guard/src/index.ts`（改 3 行） |
| `uomp store status` 命令 | `packages/cli/src/commands/store.ts`（新） |

### Phase 2：Seed Phrase 密钥管理

| 任务 | 文件 |
|------|------|
| Seed phrase 生成（BIP-39） | `packages/identity/src/seed.ts`（新） |
| `uomp user init / setup / export` | `packages/cli/src/commands/user.ts`（新） |
| `~/.uomp/user.json` 存储 | CLI/SDK 共用 |

### Phase 3：Encrypted Object Backend

| 任务 | 文件 |
|------|------|
| AES-256-GCM 加密/解密层 | `packages/store/src/encryption.ts`（新） |
| S3 客户端封装 | `packages/store/src/backends/s3.ts`（新） |
| 加密 index（tag→keys 映射） | 同上 |
| `uomp store switch encrypted-object` | CLI |

### Phase 4：浏览器体验

| 任务 | 文件 |
|------|------|
| `uomp user setup` 支持 seed phrase QR 码 | CLI |
| 浏览器 Seed Input UI | 浏览器 SDK |
| S3 后端浏览器直连（绕过 Gateway） | 浏览器 SDK（可选） |


## 11. 向后兼容

- 现有用户：`uomp init` 后默认 `backend: sqlite`，行为完全不变
- `~/.uomp/config.json` 新增 `store` 字段（可选，缺省 = sqlite）
- 已有的 SQLite 用户升级后不受影响
- migration 功能允许从 SQLite 迁移到加密对象存储
