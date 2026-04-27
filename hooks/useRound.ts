'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getReadPrediction, rotateRpc } from '@/lib/web3'
import type { SlotId } from '@/lib/config'

export interface RoundData {
  roundId:          bigint
  startTime:        bigint
  endTime:          bigint
  openPrice:        bigint
  currentPrice:     bigint   // getCurrentRound 返回的实时现价
  totalUpShares:    bigint
  totalDownShares:  bigint
  bnbPool:          bigint
  sharePriceLocked: bigint
  bettingOpen:      boolean
  /** 链上返回的剩余秒数 */
  secondsLeftOnchain: number
  /** 前端本地倒计时（每秒更新） */
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

      // getCurrentRound 返回：roundId, startTime, endTime, openPrice, currentPrice,
      // totalUpShares, totalDownShares, bnbPool, sharePriceLocked, secondsLeft, bettingOpen
      const now = Math.floor(Date.now() / 1000)
      const end   = Number(r.endTime)
      const start = Number(r.startTime)
      const duration = end - start
      const secsLeftOnchain = Number(r.secondsLeft)
      const secsLeft = Math.max(0, end - now)
      const progress = duration > 0 ? Math.min(1, (now - start) / duration) : 0

      // roundId=0 且 endTime=0 → 合约从未启动（第一笔下注前）
      const notStarted = Number(r.roundId) === 0 && end === 0

      const data: RoundData = {
        roundId:            r.roundId,
        startTime:          r.startTime,
        endTime:            r.endTime,
        openPrice:          r.openPrice,
        currentPrice:       r.currentPrice,
        totalUpShares:      r.totalUpShares,
        totalDownShares:    r.totalDownShares,
        bnbPool:            r.bnbPool,
        sharePriceLocked:   r.sharePriceLocked,
        bettingOpen:        !notStarted && r.bettingOpen,
        secondsLeftOnchain: secsLeftOnchain,
        secondsLeft:        secsLeft,
        progress,
        notStarted,
      }
      setRound(data)
      setError(null)
    } catch (e) {
      // RPC 节点失败时自动切换到下一个节点，下一次轮询时使用新节点
      rotateRpc()
      const msg = e instanceof Error ? e.message : String(e)
      // 只在非网络超时时才显示错误（超时会自动重试）
      if (!msg.includes('timeout') && !msg.includes('network')) {
        setError(msg.slice(0, 100))
      }
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
