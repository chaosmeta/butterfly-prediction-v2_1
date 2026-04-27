'use client'

import { useState, useCallback } from 'react'
import { ethers } from 'ethers'
import type { RoundData } from '@/hooks/useRound'
import type { SlotId } from '@/lib/config'
import { SHARES_MIN, SHARES_MAX, SHARE_PRICE_TOKENS, PREDICTION_ADDRESS } from '@/lib/config'
import { formatToken, calcOdds, calcEstReturn } from '@/lib/format'
import { getSignerToken, getSignerPrediction } from '@/lib/web3'
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

  const isBusy     = step !== 'idle'
  // notStarted：round 为 null（加载中/失败）或 roundId=0 且 endTime=0
  const notStarted = !round || round.notStarted
  // 已连接钱包时允许操作：未启动（第一笔下注）或投注窗口开放中
  const canBet     = !!signer && !!address && (notStarted || !!round?.bettingOpen)

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
    if (!signer || !address || !direction) return

    try {
      const tokenContract = getSignerToken(signer)
      const predContract  = getSignerPrediction(signer)
      // round 未加载时（notStarted）用兜底价；已启动时用链上 sharePriceLocked
      const sharePriceLocked: bigint = round?.sharePriceLocked ?? 0n
      const pricePerShare = sharePriceLocked > 0n
        ? sharePriceLocked
        : ethers.parseEther(String(SHARE_PRICE_TOKENS))
      const totalCost = pricePerShare * BigInt(shares)

      // 0. 检查余额是否充足，提前给出明确错误
      const balance: bigint = await tokenContract.balanceOf(address)
      if (balance < totalCost) {
        const need = ethers.formatEther(totalCost)
        const have = ethers.formatEther(balance)
        onToast({
          type: 'error',
          title: '余额不足',
          message: `需要 ${Number(need).toLocaleString('zh-CN')} BFLY，钱包余额仅 ${Number(have).toLocaleString('zh-CN')} BFLY`,
        })
        return
      }

      // 1. 检查 allowance
      const allowance: bigint = await tokenContract.allowance(address, PREDICTION_ADDRESS)
      if (allowance < totalCost) {
        setStep('approving')
        onToast({ type: 'info', title: '等待授权', message: '请在钱包中确认代币授权…' })
        const approveTx = await tokenContract.approve(PREDICTION_ADDRESS, totalCost * 10n)
        await approveTx.wait()
        onToast({ type: 'success', title: '授权成功' })
      }

      // 2. 下注（合约签名：placeBet(uint8 slot, bool isUp, uint16 shares)，无 roundId 参数）
      setStep('betting')
      onToast({ type: 'info', title: '等待下注', message: '请在钱包中确认交易…' })
      const isUp = direction === 'up'
      const betTx = await predContract.placeBet(slot, isUp, shares)
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
    if (!address)             return '请连接钱包'
    if (step === 'approving') return '授权中…'
    if (step === 'betting')   return '下注中…'
    if (!direction)           return notStarted ? '选方向以启动第一轮' : '请选择涨/跌'
    if (notStarted)           return `首笔下注 · 启动第一轮 ${shares} 份 ${direction === 'up' ? '涨' : '跌'}`
    if (!round?.bettingOpen)  return '本轮已关闭'
    return `确认下注 ${shares} 份 ${direction === 'up' ? '涨' : '跌'}`
  }

  // 仅以下情况禁用按钮：
  // 1. 处理中  2. 未连钱包  3. 已选方向但不能下注（且已启动、投注窗关闭）
  const btnDisabled = isBusy || !address || (!direction && !notStarted) || (!canBet && !!direction)

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
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-muted">份数</label>
          {/* 右侧实时显示所需代币数 */}
          <span className="text-xs text-primary font-medium">
            需 {(shares * SHARE_PRICE_TOKENS).toLocaleString('zh-CN')} BFLY
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button className="stepper-btn" onClick={() => adjustShares(-1)} disabled={isBusy || shares <= SHARES_MIN} aria-label="减少">−</button>
          <div className="flex-1 text-center">
            <span className="font-bold text-xl text-foreground">{shares}</span>
            <div className="text-xs text-muted mt-0.5">份</div>
          </div>
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

      {/* 费用预估：sharePriceLocked > 0 用链上价，否则用兜底价展示 */}
      {round && (
        <div className="glass-2 rounded-lg p-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted">每份价格</span>
            <span className="text-foreground font-medium">
              {round.sharePriceLocked > 0n
                ? `${formatToken(round.sharePriceLocked)} BFLY`
                : `${SHARE_PRICE_TOKENS.toLocaleString('zh-CN')} BFLY`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">合计花费</span>
            <span className="text-foreground font-medium">
              {round.sharePriceLocked > 0n
                ? `${formatToken(round.sharePriceLocked * BigInt(shares))} BFLY`
                : `${(shares * SHARE_PRICE_TOKENS).toLocaleString('zh-CN')} BFLY`}
            </span>
          </div>
          {direction && (
            <>
              <div className="flex justify-between">
                <span className="text-muted">赔率（预估）</span>
                <span className="text-foreground font-medium">{oddsStr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">预计收益</span>
                <span className={cn('font-medium', 'text-up')}>
                  {estReturn} BFLY
                </span>
              </div>
            </>
          )}
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
