'use client'

import { useState, useEffect } from 'react'
import { formatPrice } from '@/lib/format'

interface TickerItem {
  pair: string
  price: string
  change: string
  up: boolean
}

// 静态展示数据（链上价格通过 round 已获取，ticker 仅做氛围展示）
const PAIRS = ['BNB/USDT', 'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'CAKE/USDT', 'BTC/USDT', 'ETH/USDT']

export function useTicker(bnbPriceRaw?: bigint): TickerItem[] {
  const [items, setItems] = useState<TickerItem[]>(() => buildItems(bnbPriceRaw))

  useEffect(() => {
    setItems(buildItems(bnbPriceRaw))
  }, [bnbPriceRaw])

  return items
}

function buildItems(bnbPriceRaw?: bigint): TickerItem[] {
  const bnbStr = bnbPriceRaw ? formatPrice(bnbPriceRaw) : '$—'
  return [
    { pair: 'BNB/USDT', price: bnbStr, change: '+1.24%', up: true },
    { pair: 'BTC/USDT', price: '$67,420.00', change: '+0.87%', up: true },
    { pair: 'ETH/USDT', price: '$3,512.50', change: '-0.34%', up: false },
    { pair: 'CAKE/USDT', price: '$2.87',    change: '+3.15%', up: true },
    { pair: 'BNB/USDT', price: bnbStr,      change: '+1.24%', up: true },
    { pair: 'BTC/USDT', price: '$67,420.00', change: '+0.87%', up: true },
    { pair: 'ETH/USDT', price: '$3,512.50', change: '-0.34%', up: false },
  ]
}
