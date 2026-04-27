// ─── Prediction 合约 ABI ───────────────────────────────────────────
// 严格对照合约函数签名，不可随意更改字段顺序或类型
export const PREDICTION_ABI = [
  // getCurrentRound：返回 11 个字段，与合约完全一致
  'function getCurrentRound(uint8 slot) view returns (uint256 roundId, uint256 startTime, uint256 endTime, uint256 openPrice, uint256 currentPrice, uint256 totalUpShares, uint256 totalDownShares, uint256 bnbPool, uint256 sharePriceLocked, uint256 secondsLeft, bool bettingOpen)',

  // rounds() 公共 mapping：Round 结构体 13 个字段
  'function rounds(uint8 slot, uint256 rid) view returns (uint256 startTime, uint256 endTime, uint256 openPrice, uint256 closePrice, uint256 openCumPrice, uint256 openCumTimestamp, uint256 totalUpShares, uint256 totalDownShares, uint256 bnbPool, uint256 sharePriceLocked, bool settled, bool upWon, bool voided)',

  // currentRoundId：mapping(uint256 => uint256)，key 是 uint256（slot 编号）
  'function currentRoundId(uint256 slot) view returns (uint256)',

  // bets()：公共 mapping bets[slot][roundId][user]
  'function bets(uint8 slot, uint256 roundId, address user) view returns (uint16 shares, bool isUp, bool claimed)',

  // getMyBet：用 msg.sender，必须用 signer（写入 provider）调用
  'function getMyBet(uint8 slot, uint256 rid) view returns (uint16 shares, bool isUp, bool claimed, bool isWinner, bool roundSettled, uint256 estimatedClaim)',

  // placeBet：slot(uint8), isUp(bool), shares(uint16)，无 roundId
  'function placeBet(uint8 slot, bool isUp, uint16 shares) external',

  // settle：触发结算并开启下一轮
  'function settle(uint8 slot) external',

  // claim：单轮领奖
  'function claim(uint8 slot, uint256 rid) external',

  // previewPayout：预估赢家可得 BNB（估算）
  'function previewPayout(uint8 slot, bool isUp, uint16 shares) view returns (uint256 estimatedBnb)',

  // getProtocolStats：协议统计，含 currentSharePrice
  'function getProtocolStats() view returns (uint256 reservePool, uint256 totalBurned, uint256 totalWinnerPaid, uint256 totalInflow, uint256 vaultBnbBalance, uint256 currentSharePrice)',
] as const

// ─── ERC-20 Token ABI ─────────────────────────────────────────────
export const TOKEN_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
] as const
