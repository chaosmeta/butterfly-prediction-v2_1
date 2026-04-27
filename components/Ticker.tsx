'use client'

import { cn } from '@/lib/utils'

interface TickerItem {
  pair:   string
  price:  string
  change: string
  up:     boolean
}

interface Props {
  items: TickerItem[]
}

export default function Ticker({ items }: Props) {
  // 复制一份用于无缝滚动
  const doubled = [...items, ...items]

  return (
    <div
      className="w-full overflow-hidden border-y border-border/30 bg-surface/50 py-2.5"
      aria-label="行情滚动条"
    >
      <div className="ticker-track">
        {doubled.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-6 shrink-0"
          >
            <span className="text-fg-dim text-xs font-medium">{item.pair}</span>
            <span className="text-foreground text-sm font-semibold">{item.price}</span>
            <span
              className={cn(
                'text-xs font-medium',
                item.up ? 'text-up' : 'text-down',
              )}
            >
              {item.change}
            </span>
            <span className="text-border/60 mx-2 select-none">|</span>
          </div>
        ))}
      </div>
    </div>
  )
}
