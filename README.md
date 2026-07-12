# UOMP MVP

User-Owned Memory Protocol 的 MVP 实现。

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
└── specs/
    └── draft-00.md # 协议规范
```

## 快速开始

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 初始化数据目录
pnpm cli init

# 添加记忆
pnpm cli memory add preference.theme "dark" --tags preference,ui --sensitivity low

# 启动组合服务
pnpm dev

# 或者运行 Agent
pnpm cli run ./path/to/agent
```

## 开发

```bash
# 类型检查
pnpm typecheck

# 构建
pnpm build
```

## 协议规范

见 [specs/draft-00.md](./specs/draft-00.md)。
