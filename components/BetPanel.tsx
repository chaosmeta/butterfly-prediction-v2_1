'use client'

import { useState, useCallback } from 'react'
import { ethers } from 'ethers'
import type { RoundData } from '@/hooks/useRound'
import type { SlotId } from '@/lib/config'
import { SHARES_MIN, SHARES_MAX } from '@/lib/config'
import { formatToken, calcOdds, calcEstReturn } from '@/lib/format'
import { getSignerToken, getSignerPrediction } from '@/lib/web3'
import { PREDICTION_ADDRESS } from '@/lib/config'
import { cn } from '@/lib/utils'
import type { ToastData } from './Toast'

type Direction = 'up' | 'down' | null

interface Props {
  slot:    SlotId
  round:   RoundData | null
  signer:  ethers.Signer | null
  address: string | null
  onToast: (t: Omit<ToastData, 'id'>) => void
  onRefresh: () => void
}

export default function BetPanel({ slot, round, signer, address, onToast, onRefresh }: Props) {
  const [direction, setDirection] = useState<Direction>(null)
  const [shares, setShares]       = useState(1)
  const [step, setStep]           = useState<'idle' | 'approving' | 'betting'>('idle')

  const isBusy   = step !== 'idle'
  const notStarted = round?.notStarted ?? false
  const canBet   = !!signer && !!address && (notStarted || (!!round?.bettingOpen))

  // 预计费用
  const upShares   = round ? Number(round.totalUpShares)   : 0
  const downShares = round ? Number(round.totalDownShares) : 0
  const myPool     = direction === 'up' ? upShares + shares : downShares + shares
  const oppPool    = direction === 'up' ? downShares : upShares
  const oddsStr    = direction ? calcOdds(shares, myPool, oppPool) : '—'
  const estReturn  = direction && round
    ? calcEstReturn(shares, myPool, oppPool, round.sharePriceLocked)
    : '—'

  const adjustShares = (delta: number) => {
    setShares((s) => Math.max(SHARES_MIN, Math.min(SHARES_MAX, s + delta)))
  }

  const handleBet = useCallback(async () => {
    if (!signer || !address || !direction || !round) return
    const rid = round.roundId

    try {
      const tokenContract = getSignerToken(signer)
      const predContract  = getSignerPrediction(signer)
      const sharePriceLocked: bigint = round.sharePriceLocked
      // 如果未启动，用合约默认份价（10 BFLY）
      const pricePerShare = sharePriceLocked > 0n
        ? sharePriceLocked
        : ethers.parseEther('10')
      const totalCost = pricePerShare * BigInt(shares)

      // 1. 检查 allowance
      const allowance: bigint = await tokenContract.allowance(address, PREDICTION_ADDRESS)
      if (allowance < totalCost) {
        setStep('approving')
        onToast({ type: 'info', title: '等待授权', message: '请在钱包中确认代币授权…' })
        const approveTx = await tokenContract.approve(PREDICTION_ADDRESS, totalCost * 10n)
        await approveTx.wait()
        onToast({ type: 'success', title: '授权成功' })
      }

      // 2. 下注
      setStep('betting')
      onToast({ type: 'info', title: '等待下注', message: '请在钱包中确认交易…' })
      const isUp = direction === 'up'
      const betTx = await predContract.placeBet(slot, rid, isUp, BigInt(shares))
      onToast({ type: 'info', title: '交易发送', message: '等待区块确认…', txHash: betTx.hash })
      await betTx.wait()

      onToast({ type: 'success', title: '下注成功！', message: `${shares} 份 ${isUp ? '涨' : '跌'}`, txHash: betTx.hash })
      onRefresh()
      setDirection(null)
      setShares(1)
    } catch (e: unknown) {
      const msg = (e as { reason?: string; message?: string }).reason
        ?? (e as Error).message
        ?? '交易失败'
      onToast({ type: 'error', title: '操作失败', message: msg.slice(0, 120) })
    } finally {
      setStep('idle')
    }
  }, [signer, address, direction, round, shares, slot, onToast, onRefresh])

  const btnLabel = () => {
    if (!address) return '请连接钱包'
    if (step === 'approving') return '授权中…'
    if (step === 'betting')   return '下注中…'
    if (notStarted && direction) return `首笔下注 · 启动第一轮 ${shares} 份 ${direction === 'up' ? '涨' : '跌'}`
    if (!direction)           return '请选择涨/跌'
    if (!round?.bettingOpen && !notStarted) return '本轮已关闭'
    return `确认下注 ${shares} 份 ${direction === 'up' ? '涨' : '跌'}`
  }

  const btnDisabled = isBusy || !address || !direction || (!canBet && !notStarted)

  return (
    <div className="glass p-5 sm:p-6 w-full space-y-5">
      <h2 className="font-semibold text-foreground text-base">押注</h2>

      {/* 方向选择 */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setDirection('up')}
          className={cn('btn-up rounded-xl py-4 font-bold text-sm flex flex-col items-center gap-1', direction === 'up' && 'active')}
          disabled={isBusy}
          aria-pressed={direction === 'up'}
        >
          <span className="text-2xl">↑</span>
          <span>涨</span>
          {direction === 'up' && <span className="text-xs opacity-70">{oddsStr}</span>}
        </button>
        <button
          onClick={() => setDirection('down')}
          className={cn('btn-down rounded-xl py-4 font-bold text-sm flex flex-col items-center gap-1', direction === 'down' && 'active')}
          disabled={isBusy}
          aria-pressed={direction === 'down'}
        >
          <span className="text-2xl">↓</span>
          <span>跌</span>
          {direction === 'down' && <span className="text-xs opacity-70">{oddsStr}</span>}
        </button>
      </div>

      {/* 份数调整 */}
      <div>
        <label className="text-xs text-muted mb-2 block">份数</label>
        <div className="flex items-center gap-3">
          <button className="stepper-btn" onClick={() => adjustShares(-1)} disabled={isBusy || shares <= SHARES_MIN} aria-label="减少">−</button>
          <span className="flex-1 text-center font-bold text-xl text-foreground">{shares}</span>
          <button className="stepper-btn" onClick={() => adjustShares(1)}  disabled={isBusy || shares >= SHARES_MAX} aria-label="增加">+</button>
        </div>
        <div className="flex gap-2 mt-2">
          {[1, 5, 10, 20].map((n) => (
            <button
              key={n}
              onClick={() => setShares(n)}
              disabled={isBusy}
              className={cn(
                'flex-1 py-1 text-xs rounded border transition-colors',
                shares === n
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'border-border text-muted hover:border-primary/50',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* 费用预估 */}
      {round && round.sharePriceLocked > 0n && (
        <div className="glass-2 rounded-lg p-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted">花费</span>
            <span className="text-foreground font-medium">
              {formatToken(round.sharePriceLocked * BigInt(shares))} BFLY
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">赔率（预估）</span>
            <span className="text-foreground font-medium">{oddsStr}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">预计收益</span>
            <span className={cn('font-medium', direction ? 'text-up' : 'text-muted')}>
              {estReturn} BFLY
            </span>
          </div>
        </div>
      )}

      {/* 下注按钮 */}
      <button
        className="btn-primary w-full py-3 text-sm"
        disabled={btnDisabled}
        onClick={handleBet}
      >
        {btnLabel()}
      </button>
    </div>
  )
}
