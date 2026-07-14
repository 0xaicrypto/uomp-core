# 股票分析 Agent（Stock Analyst）

这是一个完整的 UOMP 使用范例：用户把持仓 CSV 和风险偏好导入本地 Memory Store，然后授权一个外部股票分析 Agent 读取必要数据，Agent 结合公开行情生成本地投资分析报告。

> 本示例演示的是 **Agent 与用户不在同一进程** 的标准模式。CLI 只负责发现、连接、授权和签发 Token，Agent 由用户独立启动。

---

## 目录

- [前置条件](#前置条件)
- [示例文件说明](#示例文件说明)
- [完整操作流程](#完整操作流程)
  - [1. 构建并初始化](#1-构建并初始化)
  - [2. 启动 Auth + Guard 服务](#2-启动-auth--guard-服务)
  - [3. 导入私有数据](#3-导入私有数据)
  - [4. 发现并连接 Agent](#4-发现并连接-agent)
  - [5. 授权 Agent](#5-授权-agent)
  - [6. 运行 Agent](#6-运行-agent)
  - [7. 查看会话与审计](#7-查看会话与审计)
  - [8. 撤销授权](#8-撤销授权)
- [命令速查](#命令速查)
- [常见问题](#常见问题)

---

## 前置条件

- Node.js >= 20
- pnpm 9（`corepack enable` 或 `npm install -g pnpm@9`）
- 已克隆并进入 `uomp-mvp` 仓库根目录

---

## 示例文件说明

```
examples/stock-analyst/
├── uom.json              # Agent 声明：请求范围、字段、用途、发布者
├── sample-holdings.csv   # 示例持仓 CSV
├── sample-risk.json      # 示例风险偏好 JSON
├── index.js              # Agent 入口
└── README.md             # 本文档
```

- `uom.json`：声明 Agent 需要读取 `portfolio:holdings`（高敏感）、`portfolio:watchlist`、`profile:risk`（中敏感），并列出了会读到的字段和用途。
- `sample-holdings.csv`：模拟从券商导出的持仓，包含 `symbol`、`quantity`、`cost_basis`、`market_value`。
- `sample-risk.json`：自描述的记忆项，包含 `tags`、`sensitivity`、`source`。
- `index.js`：Agent 启动后通过 `@uomp/sdk` 读取授权数据，调用公开行情 API，生成 Markdown 报告到 `output/`。

---

## 完整操作流程

### 1. 构建并初始化

```bash
pnpm install
pnpm build
pnpm cli init
```

`pnpm cli init` 会在 `~/.uomp` 创建：

- `uomp.sqlite`：Memory Store
- `config.json`：用户配置
- `.secrets/`：Token 签名密钥

### 2. 启动 Auth + Guard 服务

在**终端 1**启动本地组合服务（监听 `http://127.0.0.1:9374`）：

```bash
pnpm --filter @uomp/server start
```

保持该终端运行。

### 3. 导入私有数据

在**终端 2**执行导入。示例数据已包含在仓库中，直接按下方命令导入即可。

#### 3.1 导入风险偏好（JSON）

`sample-risk.json` 是自描述记录，包含 `tags` 和 `sensitivity`，无需额外指定：

```bash
pnpm cli import ./examples/stock-analyst/sample-risk.json
```

输出示例：

```text
Imported 1 items into tag "profile:risk" (sensitivity: medium)
```

#### 3.2 导入持仓 CSV（高敏感）

CSV 本身没有 UOMP 元数据，需要显式指定标签和敏感度：

```bash
pnpm cli import ./examples/stock-analyst/sample-holdings.csv \
  --tag portfolio:holdings \
  --sensitivity high
```

输出示例：

```text
Imported 3 items into tag "portfolio:holdings" (sensitivity: high)
```

> **为什么 `--sensitivity high`？** 持仓属于核心财务隐私。Guard 对高敏感数据要求**按 key 显式授权**，仅授权 tag 不会返回具体记录。

### 4. 发现并连接 Agent

```bash
pnpm cli discover ./examples/stock-analyst
pnpm cli connect ./examples/stock-analyst
```

- `discover`：读取并展示 `uom.json` 信息。
- `connect`：验证 Agent 身份（MVP 阶段可选）、校验清单、缓存到本地 Registry。

如果 Agent 没有配置身份，`connect` 会打印黄色警告，但不会阻止后续授权。

### 5. 授权 Agent

#### 交互式授权（推荐，适合普通用户）

```bash
pnpm cli authorize ./examples/stock-analyst
```

CLI 会展示字段级授权面板：

```text
Agent "持仓分析助手" requests access to:
Description: 基于持仓和市场公开信息生成投资策略分析
Publisher: uomp-community
  [high] portfolio:holdings
      Fields: symbol, quantity, cost_basis, market_value
      Purpose: 计算仓位权重、行业分布和盈亏分析
  [medium] portfolio:watchlist
  [medium] profile:risk
? Select tags to authorize for reading: (Press <space> to select, <a> to toggle all, ...)
```

按 `<space>` 选择标签，`<enter>` 确认。CLI 会自动为高敏感 tag 包含对应 item key，然后输出：

```text
Session granted: sess_xxxxxxxx
Token expires at: 2026-07-14T14:01:00.000Z

Set the following environment variables in the terminal where you run the Agent:
  export UOM_TOKEN="<token>"
  export UOMP_BASE_URL="http://127.0.0.1:9374"
```

#### 非交互式授权（适合脚本或自动化）

```bash
pnpm cli authorize ./examples/stock-analyst \
  --scope portfolio:holdings profile:risk \
  --output /tmp/uomp.env \
  --no-server
```

参数说明：

- `--scope`：直接指定授权的标签列表。
- `--output /tmp/uomp.env`：把 `UOM_TOKEN` 和 `UOMP_BASE_URL` 写入文件。
- `--no-server`：不自动启动本地服务（因为我们已经在终端 1 启动了）。

### 6. 运行 Agent

在**终端 2**加载 Token 并启动 Agent：

```bash
source /tmp/uomp.env
node ./examples/stock-analyst/index.js
```

如果使用的是交互式授权输出的 Token，手动设置环境变量：

```bash
export UOM_TOKEN="<token>"
export UOMP_BASE_URL="http://127.0.0.1:9374"
node ./examples/stock-analyst/index.js
```

输出示例：

```text
Stock Analyst started

Read 3 holdings
Risk profile: moderate

Fetching market data for: AAPL, TSLA, NVDA
Received 3 quotes

Analysis complete:
  Total P&L: 23382.70 (68.77%)
  Report saved to: ./output/stock-analysis-1784036924791.md
```

> **重要**：Agent 运行在独立进程，它只知道 `UOM_TOKEN` 和 `UOMP_BASE_URL`，不会接触到你的券商账号或 API 密钥。

### 7. 查看会话与审计

在**终端 2**查看当前会话：

```bash
pnpm cli sessions -a
```

查看访问审计：

```bash
pnpm cli audit --limit 20
```

输出示例：

```text
2026-07-14T13:48:44.621Z | sess_xxxxxxxx | stock-analyst | read profile:risk | allowed | Tag allowed
2026-07-14T13:48:44.603Z | sess_xxxxxxxx | stock-analyst | read portfolio:holdings | allowed | Tag allowed
```

### 8. 撤销授权

分析完成后，建议撤销会话：

```bash
pnpm cli revoke <session-id>
```

`<session-id>` 可在 `pnpm cli sessions -a` 中找到。

---

## 命令速查

| 步骤 | 命令 |
|------|------|
| 构建 | `pnpm install && pnpm build` |
| 初始化 | `pnpm cli init` |
| 启动服务 | `pnpm --filter @uomp/server start` |
| 导入风险 | `pnpm cli import ./examples/stock-analyst/sample-risk.json` |
| 导入持仓 | `pnpm cli import ./examples/stock-analyst/sample-holdings.csv --tag portfolio:holdings --sensitivity high` |
| 发现 Agent | `pnpm cli discover ./examples/stock-analyst` |
| 连接 Agent | `pnpm cli connect ./examples/stock-analyst` |
| 授权 | `pnpm cli authorize ./examples/stock-analyst` |
| 运行 Agent | `source /tmp/uomp.env && node ./examples/stock-analyst/index.js` |
| 查看会话 | `pnpm cli sessions -a` |
| 查看审计 | `pnpm cli audit --limit 20` |
| 撤销 | `pnpm cli revoke <session-id>` |

---

## 常见问题

### Q1: 授权时提示 “Identity verification warning”

这是正常提示。MVP 阶段 Agent 身份验证是可选的，未配置 identity 仍可授权运行。生产环境建议配置 DID 或 GPG 验证。

### Q2: Agent 读取到 0 条持仓

检查：

1. 持仓是否已导入：`pnpm cli import ... --tag portfolio:holdings --sensitivity high`。
2. 授权时是否选择了 `portfolio:holdings`。
3. 高敏感数据必须按 key 授权；如果 Guard 返回 `denied`，CLI 授权面板会自动处理，脚本模式请确保 `--scope` 包含 `portfolio:holdings`。

### Q3: 如何导入真实券商 CSV？

券商 CSV 列名可能不同，例如列名为 `股票代码`、`持仓数量`、`成本价`、`市值`。使用 `--map` 映射：

```bash
pnpm cli import ./my-holdings.csv \
  --tag portfolio:holdings \
  --sensitivity high \
  --map "symbol=股票代码" \
  --map "quantity=持仓数量" \
  --map "cost_basis=成本价" \
  --map "market_value=市值"
```

### Q4: 能不能让 CLI 自动启动 Agent？

标准用户流程不允许，这是安全边界。只有开发者快捷命令 `pnpm cli agent run ./examples/stock-analyst` 会把授权、启动 Guard、启动 Agent 打包在一起，仅用于本地调试。
