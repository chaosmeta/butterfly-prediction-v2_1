// ─── 合约地址 ──────────────────────────────────────────────────────
export const PREDICTION_ADDRESS = '0x14fb19D46896198be280296045DDcD419C1FFA67'
export const TOKEN_ADDRESS       = '0x7ba7e046c9d062839611d4ca17909a2097567777'

// ─── 网络 ──────────────────────────────────────────────────────────
export const BSC_CHAIN_ID    = 56
export const BSC_RPC_URL     = 'https://bsc-dataseed1.binance.org'
export const BSC_EXPLORER    = 'https://bscscan.com'
export const BSC_CHAIN_NAME  = 'BNB Smart Chain'
export const BSC_CURRENCY    = { name: 'BNB', symbol: 'BNB', decimals: 18 }

// ─── WalletConnect ─────────────────────────────────────────────────
// 在 https://cloud.walletconnect.com 申请后替换
export const WC_PROJECT_ID = 'YOUR_WALLETCONNECT_PROJECT_ID'

// ─── 时间档 ────────────────────────────────────────────────────────
export const SLOTS = [
  { id: 0, label: '20分钟', seconds: 20 * 60 },
  { id: 1, label: '1小时',  seconds: 60 * 60 },
  { id: 2, label: '24小时', seconds: 24 * 60 * 60 },
] as const

export type SlotId = 0 | 1 | 2

// ─── 份数配置 ──────────────────────────────────────────────────────
export const SHARES_MIN  = 1
export const SHARES_MAX  = 100
export const SHARE_PRICE = 10   // 每份代币数量（UI 展示用，合约以 sharePriceLocked 为准）
