// ─── Prediction 合约 ABI ───────────────────────────────────────────
// 100% 对照合约源码逐字段验证，不可随意更改
export const PREDICTION_ABI = [
  // getCurrentRound(uint8 slot) → 11 字段
  // 注意：roundId=0 且 endTime=0 表示合约尚未启动（第一次 placeBet 会自动触发 _maybeRollRound 开新轮）
  'function getCurrentRound(uint8 slot) view returns (uint256 roundId, uint256 startTime, uint256 endTime, uint256 openPrice, uint256 currentPrice, uint256 totalUpShares, uint256 totalDownShares, uint256 bnbPool, uint256 sharePriceLocked, uint256 secondsLeft, bool bettingOpen)',

  // rounds(uint8, uint256) → 13 字段完整 Round 结构体
  'function rounds(uint8 slot, uint256 rid) view returns (uint256 startTime, uint256 endTime, uint256 openPrice, uint256 closePrice, uint256 openCumPrice, uint256 openCumTimestamp, uint256 totalUpShares, uint256 totalDownShares, uint256 bnbPool, uint256 sharePriceLocked, bool settled, bool upWon, bool voided)',

  // currentRoundId 是 uint256[3] public 数组，ABI 暴露为 currentRoundId(uint256 index)
  'function currentRoundId(uint256 index) view returns (uint256)',

  // bets(uint8, uint256, address) → Bet 结构体
  'function bets(uint8 slot, uint256 roundId, address user) view returns (uint16 shares, bool isUp, bool claimed)',

  // getMyBet 使用 msg.sender → 必须用 signer 调用
  'function getMyBet(uint8 slot, uint256 rid) view returns (uint16 shares, bool isUp, bool claimed, bool isWinner, bool roundSettled, uint256 estimatedClaim)',

  // previewPayout → 估算 BNB 收益
  'function previewPayout(uint8 slot, bool isUp, uint16 shares) view returns (uint256 estimatedBnb)',

  // getProtocolStats → 6 字段
  'function getProtocolStats() view returns (uint256 _reservePool, uint256 _totalBurned, uint256 _totalWinnerPaid, uint256 _totalInflow, uint256 vaultBnbBalance, uint256 currentSharePrice)',

  // getCurrentPrice → spot 价
  'function getCurrentPrice() view returns (uint256)',

  // sharePrice → 当前每份价格（wei，18 位精度，默认 500_000 ether）
  'function sharePrice() view returns (uint256)',

  // placeBet(uint8, bool, uint16) — 无 roundId 参数，合约自动用 currentRoundId[slot]
  'function placeBet(uint8 slot, bool isUp, uint16 shares) nonpayable',

  // claim(uint8, uint256) — 单轮领取，代币原数返还 + BNB 奖金
  'function claim(uint8 slot, uint256 rid) nonpayable',

  // settle(uint8) — 任何人可调，触发结算并开启下一轮
  'function settle(uint8 slot) nonpayable',
] as const

// ─── ERC-20 Token ABI ─────────────────────────────────────────────
export const TOKEN_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
] as const
