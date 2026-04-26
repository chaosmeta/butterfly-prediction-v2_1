# 🦋 蝴蝶预测 · Butterfly Prediction

> 三档涨跌预测协议 · 输不亏代币 · 赢瓜分 BNB · 完全符合 Flap V2 Vault 规范

---

## 📂 项目结构（符合 Flap 官方规范）

```
butterfly-prediction/
├── src/
│   ├── flap/                            ← 必需且不可改动 (Flap 规范)
│   │   ├── IVaultFactory.sol
│   │   ├── IVaultSchemasV1.sol
│   │   ├── VaultBase.sol
│   │   ├── VaultBaseV2.sol
│   │   └── VaultFactoryBaseV2.sol
│   ├── ButterflyPrediction.sol          ← 主合约（VaultBaseV2 实现）
│   ├── ButterflyPredictionLib.sol       ← 价格 oracle + UI schema 构建器
│   └── ButterflyPredictionFactory.sol   ← 工厂（VaultFactoryBaseV2 实现）
├── script/
│   └── DeployFactory.s.sol              ← Foundry 部署脚本
├── foundry.toml
├── remappings.txt
├── butterfly-prediction.html            ← 单文件前端 dApp
└── README.md
```

---

## 🎯 玩法核心

### 三档时间槽
- **20 分钟档** — 高频
- **1 小时档** — 节奏舒适
- **24 小时档** — 长线判断

### 下注规则
- 押 **BFLY 代币**（不是 BNB），代币锁仓到结算
- **1 份 = 50 万 BFLY**（可治理调整 10-500 万）
- 单笔 **1-20 份**
- 一轮一注，不能加注/反向/取消

### 结算
- 开盘价 = 下注开始时合约 spot 价
- 收盘价 = TWAP（20 分档 2min / 1小时 5min / 24小时 30min）
- closePrice > openPrice → 涨方赢

### 奖池
- **来源**：上轮滚存 + 本轮代币税费 BNB
- **分配**：70% 胜方瓜分 / 20% 滚下期 / 10% 买代币烧毁
- **暴击保留**：单边失衡时小众派暴击赢
- 输家代币 100% 原数返还

---

## 💸 手续费结构（按 Flap V2 推荐公式）

```
if (taxRateBps <= 100) {              // ≤1% 税率
    fee = msg.value * 6 / 100         // = 6%
} else {
    fee = msg.value * 6 / taxRateBps  // 与税率成反比
}
```

### 4% 税率代币的实际手续费

```
fee = msg.value * 6 / 400 = 1.5%
```

每流入 1 BNB 税费：
- **0.015 BNB** → 协议方（feeRecipient）
- **0.197 BNB** (净额 × 20%) → 20 分钟档奖池
- **0.296 BNB** (净额 × 30%) → 1 小时档奖池
- **0.394 BNB** (净额 × 40%) → 24 小时档奖池
- **0.099 BNB** (净额 × 10%) → 储备池

剩余 70% 由胜方瓜分；20% 滚下轮；10% 买回代币烧毁。

### 手续费提取（Pull 模式）

任何人可以触发 `withdrawFee()`，但 BNB 永远只会进 `feeRecipient` 钱包。  
这种 pull 模式避免 receive() 阶段转账失败导致全协议阻塞。

---

## 🛡️ 安全机制

| 机制 | 作用 |
|------|------|
| `nonReentrant` | 防重入 |
| TWAP 价格 | 防鲸鱼瞬时拉砸盘 |
| 投注窗口提前关闭 | 20分前 2 分钟 / 1小时前 5 分钟 / 24小时前 1 小时 |
| 单笔上限 20 份 | 防鲸鱼一家独大 |
| 一轮一注 | 防止中途反向作弊 |
| 价格无效熔断 | openPrice/closePrice = 0 时本轮作废 |
| **Guardian 不可撤销** | Flap Guardian 永远拥有紧急访问权 |
| `emergencyWithdrawBNB` | Guardian only |
| `emergencyWithdrawToken` | Guardian only — 救回误转入的代币 |
| Pull-mode fee | 避免 receive 阶段转账失败 |

---

## 🚀 部署流程

### 前置准备

1. 安装 [Foundry](https://book.getfoundry.sh/getting-started/installation)：
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

2. 准备一个干净的部署钱包，里面放约 **0.05 BNB** gas

3. 在 [BscScan](https://bscscan.com/myapikey) 申请一个 API key（用于 verify 合约）

### Step 1: 克隆并安装依赖

```bash
git clone <你的仓库> butterfly-prediction
cd butterfly-prediction

# 安装 Foundry 依赖
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install foundry-rs/forge-std --no-commit
```

### Step 2: 编译 + 测试

```bash
forge build

# (可选) 用 AI 工具自检合约（Flap 官方推荐）
# 把 src/ButterflyPrediction.sol 内容粘给 https://aistudio.google.com/
# 用 prompt: "You are a professional smart contract auditor..."
```

### Step 3: 配置部署密钥

```bash
cp .env.example .env
# 编辑 .env 填入 PRIVATE_KEY 和 BSCSCAN_API_KEY
```

### Step 4: 先在 BSC 测试网部署一遍

```bash
source .env
forge script script/DeployFactory.s.sol \
    --rpc-url bscTestnet \
    --broadcast \
    --verify
```

输出会显示 Factory 地址。**复制下来**。

### Step 5: 在测试网 flap.sh 创建代币

1. 切换 MetaMask 到 BSC Testnet
2. 用测试 BNB（[faucet](https://www.bnbchain.org/en/testnet-faucet)）
3. 去 flap.sh 创建蝴蝶预测代币：
   - **Name**: 蝴蝶预测
   - **Symbol**: BFLY (或你想要的)
   - **Tax rate**: 4% (= 400 bps)
   - **Vault Factory**: 粘贴你 Step 4 的 factory 地址
4. 提交交易
5. 在 BscScan 测试网查看 receipt → 找到 `TokenCreated` 事件 → 拿到 token 地址 + vault 地址

### Step 6: 测试网完整测试

填两个地址到 `butterfly-prediction.html` 的 `CONFIG`，本地 `python3 -m http.server` 打开，跑一次完整流程：
- 买点 BFLY
- approve + placeBet
- 等结算（用 20 分钟档最快）
- claim 看是否拿回代币 + BNB

### Step 7: 主网部署

测试网验证一切正常后：

```bash
forge script script/DeployFactory.s.sol \
    --rpc-url bsc \
    --broadcast \
    --verify
```

然后去主网 flap.sh 重复 Step 5。

### Step 8: 部署前端

把最终 token + vault 地址填到 `butterfly-prediction.html`：

```javascript
const CONFIG = {
  VAULT_ADDRESS: '0x...你的合约地址',
  TOKEN_ADDRESS: '0x...BFLY代币地址',
  CHAIN_ID: 56,
  RPC_URL: 'https://bsc-dataseed.binance.org/',
};
```

上传到任何静态托管：Vercel / Cloudflare Pages / GitHub Pages 都行。

---

## 📊 主要 Public 方法

### 用户操作（写）

| 方法 | 描述 |
|------|------|
| `placeBet(slot, isUp, shares)` | 投注 |
| `claim(slot, rid)` | 领取代币 + 奖金 |
| `claimMany(slots[], rids[])` | 批量领取（最多 10 个） |

### 协议运维（写）

| 方法 | 调用者 | 描述 |
|------|------|------|
| `settle(slot)` | 任何人 | 触发结算（自动也会触发） |
| `flushInflow()` | 任何人 | 把 pending 税费推进各档奖池 |
| `withdrawFee()` | 任何人 | 提取累计手续费到 feeRecipient |
| `refreshTaxRate()` | 任何人 | 刷新代币税率（税率变化后调用） |
| `setSharePrice(newPrice)` | Creator/Guardian | 调整每份代币数量 |
| `setFeeRecipient(addr)` | Creator/Guardian | 转移手续费收款地址 |
| `emergencyWithdrawBNB(to, amt)` | Guardian | 紧急提取 BNB |
| `emergencyWithdrawToken(token, to, amt)` | Guardian | 紧急提取任意 BEP20 |

### 数据查询（读）

| 方法 | 描述 |
|------|------|
| `getCurrentRound(slot)` | 当前轮次完整状态（11 字段） |
| `previewPayout(slot, isUp, shares)` | 预估某方向某份数能赢多少 BNB |
| `getMyBet(slot, rid)` | 我在某轮的下注情况 |
| `getProtocolStats()` | 协议总体数据 |
| `getCurrentPrice()` | 当前 BFLY/BNB 价格 |
| `description()` | 动态描述（Flap 规范要求） |
| `vaultUISchema()` | UI schema（自动生成 UI） |

### Factory 数据（读）

| 方法 | 描述 |
|------|------|
| `vaultDataSchema()` | 工厂数据 schema（描述 vaultData 格式） |
| `isQuoteTokenSupported(token)` | 是否支持该 quoteToken（仅 0x0 = BNB） |

---

## 🔬 关键参数

```solidity
// 时间档
SLOT_DURATIONS         = [20分钟, 1小时, 24小时]
TWAP_WINDOWS           = [2分钟, 5分钟, 30分钟]
BETTING_CLOSE_BEFORE   = [2分钟, 5分钟, 1小时]

// 奖池分配
SLOT_INFLOW_BPS        = [20%, 30%, 40%]   // 净流入分给三档
RESERVE_INFLOW_BPS     = 10%
WINNERS_BPS            = 70%
ROLLOVER_BPS           = 20%
BURN_BPS               = 10%

// 份额
sharePrice             = 50万 BFLY (默认，可调 10万-500万)
MAX_SHARES_PER_BET     = 20

// 手续费（按 Flap V2 推荐公式自动计算）
// fee = (amount * 6) / taxRateBps
// 4% 税 → 1.5%
```

---

## ⚠️ 已知限制

1. **首轮可能空跑** — 部署后第一轮 LP cumulative 可能是 0，导致价格无效；该轮自动 voided 滚到下期，用户代币原数返还。
2. **TWAP 不是绝对防操纵** — 鲸鱼可以持续砸盘 5 分钟操纵 TWAP，但成本极高。
3. **没有连胜系统** — 用户要求纯粹猜涨跌不加额外功能。
4. **第一笔交易税读取** — taxRateBps 默认 0，第一次 receive 时从 token 读取并缓存；用户也可手动 `refreshTaxRate()`。

---

## 📋 已部署合约地址（Flap V2 BSC）

| 合约 | 地址 |
|------|------|
| Portal (Token) | `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0` |
| VaultPortal | `0x90497450f2a706f1951b5bdda52B4E5d16f34C06` |
| Guardian | `0x9e27098dcD8844bcc6287a557E0b4D09C86B8a4b` |

测试网 (BSC Chapel, chainid 97):

| 合约 | 地址 |
|------|------|
| Portal (Token) | `0x5bEacaF7ABCbB3aB280e80D007FD31fcE26510e9` |
| VaultPortal | `0x027e3704fC5C16522e9393d04C60A3ac5c0d775f` |
| Guardian | `0x76Fa8C526f8Bc27ba6958B76DeEf92a0dbE46950` |

---

## 📜 License

MIT
