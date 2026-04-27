import { ethers } from 'ethers'

/**
 * 格式化 BNB/Token 数量（18位小数）
 * @param raw   bigint | string
 * @param dp    保留小数位，默认 4
 */
export function formatToken(raw: bigint | string, dp = 4): string {
  try {
    const val = parseFloat(ethers.formatEther(raw))
    return val.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: dp })
  } catch {
    return '—'
  }
}

/**
 * 格式化价格（8 位小数 Chainlink 格式）
 * @param raw  bigint
 */
export function formatPrice(raw: bigint): string {
  if (!raw || raw === 0n) return '—'
  try {
    const val = Number(raw) / 1e8
    return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  } catch {
    return '—'
  }
}

/**
 * 格式化倒计时 秒 → mm:ss 或 hh:mm:ss
 */
export function formatCountdown(totalSecs: number): string {
  if (totalSecs <= 0) return '00:00'
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  if (h > 0) return `${String(h).padStart(2, '0')}:${mm}:${ss}`
  return `${mm}:${ss}`
}

/**
 * 缩略地址  0x1234...abcd
 */
export function shortenAddress(addr: string): string {
  if (!addr) return ''
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

/**
 * 计算赔率（含 1% 平台费）
 * @param myShares  我方份数
 * @param myPool    我方总份数
 * @param oppPool   对方总份数
 */
export function calcOdds(myShares: number, myPool: number, oppPool: number): string {
  if (myPool === 0) return '—'
  // 净分配 = 对方池 * 0.99 / 我方池（份额比）
  const odds = (1 + (oppPool * 0.99) / myPool).toFixed(2)
  return `${odds}x`
}

/**
 * 计算预计收益
 */
export function calcEstReturn(
  shares: number,
  myTotalShares: number,
  oppTotalShares: number,
  sharePriceLocked: bigint,
): string {
  if (myTotalShares === 0) return '—'
  try {
    const spf = parseFloat(ethers.formatEther(sharePriceLocked))
    const totalCost = shares * spf
    const myRatio = shares / myTotalShares
    const prize = oppTotalShares * spf * 0.99 * myRatio + totalCost
    return prize.toFixed(2)
  } catch {
    return '—'
  }
}
