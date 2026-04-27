// ─── Prediction 合约 ABI ───────────────────────────────────────────
// 严格对照合约函数签名，不可随意更改字段顺序或类型
export const PREDICTION_ABI = [
  // getCurrentRound：返回 11 个字段，与合约完全一致
  'function getCurrentRound(uint8 slot) view returns (uint256 roundId, uint256 startTime, uint256 endTime, uint256 openPrice, uint256 currentPrice, uint256 totalUpShares, uint256 totalDownShares, uint256 bnbPool, uint256 sharePriceLocked, uint256 secondsLeft, bool bettingOpen)',

  // rounds() 公共 mapping：Round 结构体 13 个字段
  'function rounds(uint8 slot, uint256 rid) view returns (uint256 startTime, uint256 endTime, uint256 openPrice, uint256 closePrice, uint256 openCumPrice, uint256 openCumTimestamp, uint256 totalUpShares, uint256 totalDownShares, uint256 bnbPool, uint256 sharePriceLocked, bool settled, bool upWon, bool voided)',

  // currentRoundId：每个 slot 独立的自增 ID
  'function currentRoundId(uint8 slot) view returns (uint256)',

  // bets()：公共 mapping，返回 Bet 结构体
  'function bets(uint8 slot, uint256 roundId, address user) view returns (uint16 shares, bool isUp, bool claimed)',

  // getMyBet：合约提供的便捷查询，含 isWinner / estimatedClaim
  'function getMyBet(uint8 slot, uint256 rid) view returns (uint16 shares, bool isUp, bool claimed, bool isWinner, bool roundSettled, uint256 estimatedClaim)',

  // placeBet：slot, isUp, shares（没有 roundId 参数，合约自动用 currentRoundId）
  'function placeBet(uint8 slot, bool isUp, uint16 shares) external',

  // settle：触发结算并开启下一轮
  'function settle(uint8 slot) external',

  // claim：单轮领奖（slot + 单个 roundId）
  'function claim(uint8 slot, uint256 rid) external',

  // previewPayout：预估收益
  'function previewPayout(uint8 slot, bool isUp, uint16 shares) view returns (uint256 estimatedBnb)',
] as const

// ─── ERC-20 Token ABI ─────────────────────────────────────────────
export const TOKEN_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
] as const
