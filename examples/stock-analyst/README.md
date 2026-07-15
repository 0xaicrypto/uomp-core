# 股票分析 Agent / Stock Analyst

[English](#english) | [中文](#中文)

---

## 中文

### 概述

UOMP 完整验收示例：用户把持仓 CSV 和风险偏好导入本地 Memory Store，授权外部股票分析 Agent 读取数据，Agent 结合公开行情生成多维投资分析报告。同时演示 **Local Profile** 和 **Remote Profile + Gateway + mTLS** 两种部署模式。

**v0.2 新增**：
- 10 只股票、5 个行业的多维度分析
- 历史表现指标：年化波动率、Beta
- 行业偏离度分析（vs 目标配置）
- 集中度 HHI 指数
- 止损/止盈交易信号
- 风险回撤告警
- 中英双语报告
- 聚合查询（`/v1/memory/aggregate`）
- Gateway Payload 上传 + 删除证明
- 完整端到端测试脚本

### 文件说明

```
examples/stock-analyst/
├── uom.json              # Agent 声明 v0.2：zero retention、字段声明、行业数据
├── sample-holdings.csv   # 10 只股票、含 sector 字段
├── sample-risk.json      # 风险偏好：drawdown、horizon、目标配置、止损止盈
├── index.js              # Agent：聚合查询、多维度分析、双语报告、Payload/删除证明
└── README.md
```

### 快速开始

```bash
# 1. 初始化 + 启动服务
pnpm build
pnpm --filter @uomp/server start

# 2. 导入数据
pnpm cli import ./examples/stock-analyst/sample-risk.json --replace
pnpm cli import ./examples/stock-analyst/sample-holdings.csv \
  --tag portfolio:holdings --sensitivity high --replace

# 3. 发现 + 授权 + 运行（本地模式）
pnpm cli discover ./examples/stock-analyst
pnpm cli authorize ./examples/stock-analyst \
  --scope portfolio:holdings profile:risk --output /tmp/uomp.env --no-server
source /tmp/uomp.env && node ./examples/stock-analyst/index.js

# 4. 查看审计
pnpm cli sessions -a && pnpm cli audit --limit 10
```

### 远程 Gateway 模式

```bash
# 生成证书 + 启动 Gateway
./scripts/generate-gateway-certs.sh
node apps/gateway/dist/index.js

# 获取高敏感数据 keys，创建远程 session 并运行
./scripts/test-stock-analyst.sh
```

Agent 在 Gateway 模式下会：
1. 通过 mTLS 连接 Gateway
2. 先尝试聚合查询（`/v1/memory/aggregate`）
3. 读取持仓和风险数据
4. 生成本地 + 双语报告
5. 上传加密 Payload 到 Gateway
6. 提交删除证明 → Session 自动关闭

### 分析维度

| 维度 | 说明 |
|------|------|
| **盈亏分析** | 逐股 P&L、P&L%、权重占比、组合总盈亏 |
| **行业分布** | 按行业聚合市值，对比目标配置，计算偏差 |
| **集中度** | HHI 指数，> 2500 警告 |
| **风险指标** | 逐股年化波动率、Beta（vs 组合均值） |
| **交易信号** | 止损触发（浮亏超阈值）、止盈触发（浮盈超阈值） |
| **回撤告警** | 单股回撤超出 max_drawdown 时告警 |
| **组合波动** | 组合整体年化波动率 |

---

## English

### Overview

Complete UOMP acceptance example demonstrating both **Local Profile** and **Remote Profile + Gateway + mTLS** deployments.

**v0.2 highlights**:
- 10 stocks across 5 sectors with multi-dimensional analysis
- Historical metrics: annualized volatility, Beta
- Sector deviation vs target allocation
- HHI concentration index
- Stop-loss / take-profit signals
- Drawdown alerts
- Bilingual reports (Chinese + English)
- Aggregate query (`/v1/memory/aggregate`)
- Gateway Payload upload + deletion proof
- Full end-to-end test script

### Quick Start

```bash
pnpm build && pnpm --filter @uomp/server start
pnpm cli import ./examples/stock-analyst/sample-risk.json --replace
pnpm cli import ./examples/stock-analyst/sample-holdings.csv \
  --tag portfolio:holdings --sensitivity high --replace
pnpm cli authorize ./examples/stock-analyst \
  --scope portfolio:holdings profile:risk --output /tmp/uomp.env --no-server
source /tmp/uomp.env && node ./examples/stock-analyst/index.js
```

### Remote Gateway Mode

```bash
./scripts/generate-gateway-certs.sh
node apps/gateway/dist/index.js
./scripts/test-stock-analyst.sh
```

### Analysis Dimensions

| Dimension | Description |
|-----------|-------------|
| P&L | Per-stock and portfolio P&L, P&L%, weight |
| Sector | Allocation vs target, deviation |
| Concentration | HHI index, > 2500 = high concentration |
| Risk Metrics | Annualized volatility, Beta per stock |
| Signals | Stop-loss and take-profit alerts |
| Drawdown | Max drawdown alerts per position |
| Portfolio Vol | Total portfolio annualized volatility |
