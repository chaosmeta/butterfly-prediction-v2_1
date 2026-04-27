// ─── Prediction 合约 ABI ───────────────────────────────────────────
// rounds() 字段顺序严格对应合约 Round 结构体：
// startTime, endTime, openPrice, closePrice,
// openCumPrice, openCumTimestamp,
// totalUpShares, totalDownShares, bnbPool,
// sharePriceLocked, settled, upWon, voided
export const PREDICTION_ABI = [
  // 读取当前轮
  'function getCurrentRound(uint8 slot) view returns (uint256 roundId, uint256 startTime, uint256 endTime, uint256 openPrice, uint256 closePrice, uint256 openCumPrice, uint256 openCumTimestamp, uint256 totalUpShares, uint256 totalDownShares, uint256 bnbPool, uint256 sharePriceLocked, bool settled, bool upWon, bool voided, bool bettingOpen)',
  // 按 slot + roundId 读取历史轮
  'function rounds(uint8 slot, uint256 rid) view returns (uint256 startTime, uint256 endTime, uint256 openPrice, uint256 closePrice, uint256 openCumPrice, uint256 openCumTimestamp, uint256 totalUpShares, uint256 totalDownShares, uint256 bnbPool, uint256 sharePriceLocked, bool settled, bool upWon, bool voided)',
  // 当前轮 ID
  'function currentRoundId(uint8 slot) view returns (uint256)',
  // 查询用户在某轮的下注信息
  'function betOf(uint8 slot, uint256 roundId, address user) view returns (uint256 upShares, uint256 downShares)',
  // 下注：slot, roundId, isUp, shares
  'function placeBet(uint8 slot, uint256 roundId, bool isUp, uint256 shares) external',
  // 结算（触发下一轮）
  'function settle(uint8 slot) external',
  // 领奖
  'function claim(uint8 slot, uint256[] calldata roundIds) external',
] as const

// ─── ERC-20 Token ABI ─────────────────────────────────────────────
export const TOKEN_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
] as const
