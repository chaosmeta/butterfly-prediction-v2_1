'use client'

import type { RoundData } from '@/hooks/useRound'
import type { SlotId } from '@/lib/config'
import { SLOTS } from '@/lib/config'
import { formatPrice, formatToken, formatCountdown } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Props {
  slot:      SlotId
  onSlot:    (s: SlotId) => void
  round:     RoundData | null
  loading:   boolean
  error:     string | null
}

export default function RoundPanel({ slot, onSlot, round, loading, error }: Props) {
  const notStarted = round?.notStarted ?? false
  const secsLeft   = round?.secondsLeft ?? 0
  const progress   = round?.progress ?? 0

  const upShares   = round ? Number(round.totalUpShares)   : 0
  const downShares = round ? Number(round.totalDownShares) : 0
  const total      = upShares + downShares || 1
  const upPct      = Math.round((upShares / total) * 100)
  const downPct    = 100 - upPct

  return (
    <div className="glass p-5 sm:p-6 w-full">
      {/* 时间档 Tabs */}
      <div className="flex gap-2 mb-6" role="tablist" aria-label="时间档选择">
        {SLOTS.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={slot === s.id}
            onClick={() => onSlot(s.id as SlotId)}
            className={cn('slot-tab', slot === s.id && 'active')}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 错误状态 */}
      {error && (
        <div className="text-down text-sm text-center py-2 mb-4 rounded-lg bg-down-dim/20 border border-down/20">
          {error}
        </div>
      )}

      {/* 加载骨架 */}
      {loading && !round && (
        <div className="space-y-3 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-6 rounded bg-surface-2" />
          ))}
        </div>
      )}

      {/* 未启动提示 */}
      {!loading && notStarted && (
        <div className="text-center py-6 space-y-2">
          <p className="text-fg-dim text-sm">合约已部署，等待第一笔下注启动第一轮</p>
          <p className="text-muted text-xs">首次下注将自动触发 _startNewRound</p>
        </div>
      )}

      {/* 轮次数据 */}
      {round && !notStarted && (
        <div className="space-y-4">
          {/* 轮次 + 开盘价 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted mb-0.5">当前轮次</p>
              <p className="font-semibold text-primary">
                #{round.roundId.toString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted mb-0.5">开盘价</p>
              <p className="font-semibold text-foreground">
                {formatPrice(round.openPrice)}
              </p>
            </div>
          </div>

          {/* 倒计时 + 进度条 */}
          <div>
            <div className="flex justify-between text-xs text-muted mb-1.5">
              <span>{round.bettingOpen ? '投注中' : '等待结算'}</span>
              <span className={cn('font-mono font-semibold', secsLeft < 60 ? 'text-down' : 'text-primary')}>
                {formatCountdown(secsLeft)}
              </span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>

          {/* 奖池 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-2 p-3 rounded-lg">
              <p className="text-xs text-muted mb-1">奖池 (BNB)</p>
              <p className="font-semibold text-foreground text-sm">
                {formatToken(round.bnbPool, 4)} BNB
              </p>
            </div>
            <div className="glass-2 p-3 rounded-lg">
              <p className="text-xs text-muted mb-1">份价 (BFLY)</p>
              <p className="font-semibold text-foreground text-sm">
                {formatToken(round.sharePriceLocked)}
              </p>
            </div>
          </div>

          {/* 多空分布 */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-up font-medium">涨 {upShares} 份 ({upPct}%)</span>
              <span className="text-down font-medium">跌 {downShares} 份 ({downPct}%)</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden flex">
              <div
                className="bg-up transition-all duration-500"
                style={{ width: `${upPct}%` }}
              />
              <div
                className="bg-down flex-1 transition-all duration-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
