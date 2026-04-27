'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getReadPrediction } from '@/lib/web3'
import type { SlotId } from '@/lib/config'

export interface RoundData {
  roundId:          bigint
  startTime:        bigint
  endTime:          bigint
  openPrice:        bigint
  closePrice:       bigint
  openCumPrice:     bigint
  openCumTimestamp: bigint
  totalUpShares:    bigint
  totalDownShares:  bigint
  bnbPool:          bigint
  sharePriceLocked: bigint
  settled:          boolean
  upWon:            boolean
  voided:           boolean
  bettingOpen:      boolean
  /** 剩余秒数（前端计算） */
  secondsLeft:      number
  /** 0-1 进度（前端计算） */
  progress:         number
  /** 是否从未启动（roundId=0 且 endTime=0） */
  notStarted:       boolean
}

export function useRound(slot: SlotId) {
  const [round, setRound] = useState<RoundData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchRound = useCallback(async () => {
    try {
      const contract = getReadPrediction()
      const r = await contract.getCurrentRound(slot)

      const now = Math.floor(Date.now() / 1000)
      const end  = Number(r.endTime)
      const start = Number(r.startTime)
      const duration = end - start
      const secsLeft = Math.max(0, end - now)
      const progress = duration > 0 ? Math.min(1, (now - start) / duration) : 0

      // Bug 2 修复：roundId=0 且 endTime=0 → 合约未启动
      const notStarted = Number(r.roundId) === 0 && end === 0

      const data: RoundData = {
        roundId:          r.roundId,
        startTime:        r.startTime,
        endTime:          r.endTime,
        openPrice:        r.openPrice,
        closePrice:       r.closePrice,
        openCumPrice:     r.openCumPrice,
        openCumTimestamp: r.openCumTimestamp,
        totalUpShares:    r.totalUpShares,
        totalDownShares:  r.totalDownShares,
        bnbPool:          r.bnbPool,
        sharePriceLocked: r.sharePriceLocked,
        settled:          r.settled,
        upWon:            r.upWon,
        voided:           r.voided,
        bettingOpen:      !notStarted && r.bettingOpen,
        secondsLeft:      secsLeft,
        progress,
        notStarted,
      }
      setRound(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '数据加载失败')
    } finally {
      setLoading(false)
    }
  }, [slot])

  // 每 10 秒全量刷新一次链上数据
  useEffect(() => {
    setLoading(true)
    fetchRound()
    const id = setInterval(fetchRound, 10_000)
    return () => clearInterval(id)
  }, [fetchRound])

  // 每秒更新倒计时（纯本地计算，不触发链上请求）
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setRound((prev) => {
        if (!prev || prev.notStarted) return prev
        const now = Math.floor(Date.now() / 1000)
        const end = Number(prev.endTime)
        const start = Number(prev.startTime)
        const duration = end - start
        const secsLeft = Math.max(0, end - now)
        const progress = duration > 0 ? Math.min(1, (now - start) / duration) : 0
        return { ...prev, secondsLeft: secsLeft, progress }
      })
    }, 1_000)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [])

  return { round, loading, error, refresh: fetchRound }
}
