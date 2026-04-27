// ─── 合约地址 ──────────────────────────────────────────────────────
export const PREDICTION_ADDRESS = '0x14fb19D46896198be280296045DDcD419C1FFA67'
export const TOKEN_ADDRESS       = '0x7ba7e046c9d062839611d4ca17909a2097567777'

// ─── 网络 ──────────────────────────────────────────────────────────
export const BSC_CHAIN_ID = 56
export const BSC_RPC      = 'https://shy-proportionate-butterfly.bsc.quiknode.pro/f99481698b34b4bd221c635cfccd4d06f2c26068/'
export const BSC_CHAIN_CONFIG = {
  chainId:           `0x${BSC_CHAIN_ID.toString(16)}`,
  chainName:         'BNB Smart Chain',
  nativeCurrency:    { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls:           [BSC_RPC],
  blockExplorerUrls: ['https://bscscan.com'],
}

// ─── 时间档（与合约 SLOT_DURATIONS / BETTING_CLOSE_BEFORE 完全对应）──
export const SLOTS = [
  { label: '20 分钟', duration: 20 * 60,   bettingCloseBefore: 2 * 60  },
  { label: '1 小时',  duration: 60 * 60,   bettingCloseBefore: 5 * 60  },
  { label: '24 小时', duration: 24 * 3600, bettingCloseBefore: 60 * 60 },
] as const

export type SlotId = 0 | 1 | 2

// ─── 份数配置（合约常量）──────────────────────────────────────────
// MAX_SHARES_PER_BET = 20，sharePrice = 500_000 ether（18 位精度）
export const SHARES_MIN              = 1
export const SHARES_MAX              = 20
export const DEFAULT_SHARE_PRICE_ETH = 500_000  // 单位：ether（即 500000 * 1e18 wei）
