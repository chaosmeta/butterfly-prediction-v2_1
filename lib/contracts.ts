// ─── 合约地址 ─────────────────────────────────────────────────────
export const PREDICTION_ADDRESS = '0x14fb19D46896198be280296045DDcD419C1FFA67' as const
export const TOKEN_ADDRESS       = '0x7ba7e046c9d062839611d4ca17909a2097567777' as const

// ─── 合约常量（与合约源码一致）────────────────────────────────────
export const SHARE_PRICE_DEFAULT = 500_000n * 10n ** 18n  // 500,000 ether
export const MAX_SHARES          = 20
export const MIN_SHARES          = 1

export const SLOTS = [
  { label: '20 分钟', duration: 20 * 60 },
  { label: '1 小时',  duration: 60 * 60 },
  { label: '24 小时', duration: 24 * 3600 },
] as const

// ─── Prediction ABI（100% 对照 ABI JSON，逐字段验证）─────────────
export const PREDICTION_ABI = [
  // getCurrentRound → 11 字段
  {
    name: 'getCurrentRound',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'slot', type: 'uint8' }],
    outputs: [
      { name: 'roundId',          type: 'uint256' },
      { name: 'startTime',        type: 'uint256' },
      { name: 'endTime',          type: 'uint256' },
      { name: 'openPrice',        type: 'uint256' },
      { name: 'currentPrice',     type: 'uint256' },
      { name: 'totalUpShares',    type: 'uint256' },
      { name: 'totalDownShares',  type: 'uint256' },
      { name: 'bnbPool',          type: 'uint256' },
      { name: 'sharePriceLocked', type: 'uint256' },
      { name: 'secondsLeft',      type: 'uint256' },
      { name: 'bettingOpen',      type: 'bool'    },
    ],
  },
  // rounds → 13 字段
  {
    name: 'rounds',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'slot', type: 'uint8' }, { name: 'rid', type: 'uint256' }],
    outputs: [
      { name: 'startTime',        type: 'uint256' },
      { name: 'endTime',          type: 'uint256' },
      { name: 'openPrice',        type: 'uint256' },
      { name: 'closePrice',       type: 'uint256' },
      { name: 'openCumPrice',     type: 'uint256' },
      { name: 'openCumTimestamp', type: 'uint256' },
      { name: 'totalUpShares',    type: 'uint256' },
      { name: 'totalDownShares',  type: 'uint256' },
      { name: 'bnbPool',          type: 'uint256' },
      { name: 'sharePriceLocked', type: 'uint256' },
      { name: 'settled',          type: 'bool'    },
      { name: 'upWon',            type: 'bool'    },
      { name: 'voided',           type: 'bool'    },
    ],
  },
  // currentRoundId(uint256) → uint256
  {
    name: 'currentRoundId',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // bets(uint8, uint256, address) → Bet
  {
    name: 'bets',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'slot',    type: 'uint8'   },
      { name: 'roundId', type: 'uint256' },
      { name: 'user',    type: 'address' },
    ],
    outputs: [
      { name: 'shares',  type: 'uint16' },
      { name: 'isUp',    type: 'bool'   },
      { name: 'claimed', type: 'bool'   },
    ],
  },
  // getMyBet — 使用 msg.sender，须用已连接钱包调用
  {
    name: 'getMyBet',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'slot', type: 'uint8'   },
      { name: 'rid',  type: 'uint256' },
    ],
    outputs: [
      { name: 'shares',         type: 'uint16'  },
      { name: 'isUp',           type: 'bool'    },
      { name: 'claimed',        type: 'bool'    },
      { name: 'isWinner',       type: 'bool'    },
      { name: 'roundSettled',   type: 'bool'    },
      { name: 'estimatedClaim', type: 'uint256' },
    ],
  },
  // sharePrice
  {
    name: 'sharePrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // placeBet(uint8, bool, uint16)
  {
    name: 'placeBet',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'slot',   type: 'uint8'  },
      { name: 'isUp',   type: 'bool'   },
      { name: 'shares', type: 'uint16' },
    ],
    outputs: [],
  },
  // claim(uint8, uint256)
  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'slot', type: 'uint8'   },
      { name: 'rid',  type: 'uint256' },
    ],
    outputs: [],
  },
  // settle(uint8)
  {
    name: 'settle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'slot', type: 'uint8' }],
    outputs: [],
  },
] as const

// ─── ERC-20 ABI（最小集）────────────────────────────────────────
export const TOKEN_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner',   type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount',  type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const
