'use client'

import { useState } from 'react'
import type { BetRecord } from '@/hooks/useMyBets'
import type { SlotId } from '@/lib/config'
import type { ToastData } from './Toast'
import { cn } from '@/lib/utils'

interface Props {
  bets:        BetRecord[]
  loading:     boolean
  claiming:    boolean
  address:     string | null
  onFetch:     () => void
  onClaim:     (slot: SlotId, ids: bigint[]) => Promise<string | undefined>
  onToast:     (t: Omit<ToastData, 'id'>) => void
}

function statusBadge(bet: BetRecord) {
  if (bet.voided)   return <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted">已作废</span>
  if (!bet.settled) return <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">进行中</span>
  const isWin = (bet.upWon && bet.upShares > 0n) || (!bet.upWon && bet.downShares > 0n)
  return isWin
    ? <span className="text-xs px-2 py-0.5 rounded-full bg-up-dim text-up font-medium">赢了</span>
    : <span className="text-xs px-2 py-0.5 rounded-full bg-down-dim text-down font-medium">输了</span>
}

export default function MyBets({ bets, loading, claiming, address, onFetch, onClaim, onToast }: Props) {
  const [querying, setQuerying] = useState(false)

  const handleQuery = async () => {
    if (!address) {
      onToast({ type: 'warning', title: '请先连接钱包' })
      return
    }
    setQuerying(true)
    try {
      await onFetch()
    } finally {
      setQuerying(false)
    }
  }

  const handleClaim = async (bet: BetRecord) => {
    try {
      const hash = await onClaim(bet.slot, [bet.roundId])
      if (hash) onToast({ type: 'success', title: '领奖成功！', txHash: hash })
    } catch (e: unknown) {
      onToast({ type: 'error', title: '领奖失败', message: (e as Error).message?.slice(0, 100) })
    }
  }

  return (
    <section className="glass p-5 sm:p-6 w-full" aria-label="我的下注记录">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-semibold text-foreground text-base">我的下注记录</h2>
        <button
          onClick={handleQuery}
          disabled={querying || !address}
          className="btn-secondary text-xs px-3 py-1.5"
        >
          {querying ? '查询中…' : '刷新'}
        </button>
      </div>

      {!address && (
        <p className="text-center text-muted text-sm py-8">连接钱包后查看下注记录</p>
      )}

      {address && bets.length === 0 && !loading && (
        <p className="text-center text-muted text-sm py-8">暂无下注记录，点击刷新查询</p>
      )}

      {loading && (
        <div className="space-y-2 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-surface-2" />
          ))}
        </div>
      )}

      {bets.length > 0 && (
        <div className="space-y-2">
          {bets.map((bet) => {
            const myDir = bet.upShares > 0n ? '涨' : '跌'
            const myShares = bet.upShares > 0n ? bet.upShares : bet.downShares
            return (
              <div
                key={`${bet.slot}-${bet.roundId}`}
                className="glass-2 p-3 rounded-lg flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs text-muted">{bet.slotLabel}</span>
                    <span className="text-xs text-fg-dim">#{bet.roundId.toString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-sm font-semibold',
                        bet.upShares > 0n ? 'text-up' : 'text-down',
                      )}
                    >
                      {myDir} {myShares.toString()} 份
                    </span>
                    {statusBadge(bet)}
                  </div>
                </div>
                {bet.claimable && (
                  <button
                    onClick={() => handleClaim(bet)}
                    disabled={claiming}
                    className="btn-primary text-xs px-3 py-1.5 shrink-0"
                  >
                    {claiming ? '领取中…' : '领奖'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
