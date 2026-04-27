'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import {
  useAccount, useReadContract, useWriteContract,
  useWaitForTransactionReceipt, usePublicClient,
} from 'wagmi'
import { formatUnits, maxUint256 } from 'viem'
import {
  PREDICTION_ADDRESS, TOKEN_ADDRESS,
  PREDICTION_ABI, TOKEN_ABI,
  SLOTS, MAX_SHARES, MIN_SHARES, SHARE_PRICE_DEFAULT,
} from '@/lib/contracts'
import { bsc } from '@/lib/wagmi'

// ─── Types ────────────────────────────────────────────────────────────
type SlotId = 0 | 1 | 2
type Direction = 'up' | 'down'
type Step = 'idle' | 'approving' | 'betting'

interface Toast {
  id: number
  type: 'info' | 'success' | 'error'
  title: string
  message?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────
function fmtToken(wei: bigint, dec = 18): string {
  const n = parseFloat(formatUnits(wei, dec))
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}
function fmtBnb(wei: bigint): string {
  return parseFloat(formatUnits(wei, 18)).toFixed(4) + ' BNB'
}
function fmtCountdown(secs: number): string {
  if (secs <= 0) return '00:00'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
let _tid = 0

// ─── Main ─────────────────────────────────────────────────────────────
export default function ButterflyApp() {
  const { address, isConnected, chain } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [slot, setSlot]         = useState<SlotId>(0)
  const [direction, setDir]     = useState<Direction | null>(null)
  const [shares, setShares]     = useState(1)
  const [step, setStep]         = useState<Step>('idle')
  const [toasts, setToasts]     = useState<Toast[]>([])
  const [countdown, setCountdown] = useState(0)
  const [approveTx, setApproveTx] = useState<`0x${string}` | undefined>()
  const [betTx, setBetTx]         = useState<`0x${string}` | undefined>()
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const wrongChain = isConnected && chain?.id !== bsc.id

  // ─── Toast ──────────────────────────────────────────────────────
  const toast = useCallback((type: Toast['type'], title: string, message?: string) => {
    const id = ++_tid
    setToasts(p => [...p, { id, type, title, message }])
    setTimeout(() => setToasts(p => p.filter(x => x.id !== id)), 5000)
  }, [])

  // ─── Round data ──────────────────────────────────────────────────
  const { data: raw, refetch: refetchRound } = useReadContract({
    address: PREDICTION_ADDRESS,
    abi: PREDICTION_ABI,
    functionName: 'getCurrentRound',
    args: [slot],
    chainId: bsc.id,
    query: { refetchInterval: 10_000 },
  })

  // raw: [roundId, startTime, endTime, openPrice, currentPrice,
  //       totalUpShares, totalDownShares, bnbPool, sharePriceLocked, secondsLeft, bettingOpen]
  const roundId          = raw?.[0] ?? 0n
  const endTime          = raw?.[2] ?? 0n
  const openPrice        = raw?.[3] ?? 0n
  const currentPrice     = raw?.[4] ?? 0n
  const totalUpShares    = raw?.[5] ?? 0n
  const totalDownShares  = raw?.[6] ?? 0n
  const bnbPool          = raw?.[7] ?? 0n
  const sharePriceLocked = raw?.[8] && raw[8] > 0n ? raw[8] : SHARE_PRICE_DEFAULT
  const secondsLeft      = raw?.[9] ?? 0n
  const bettingOpen      = raw?.[10] ?? false
  const notStarted       = !raw || (roundId === 0n && endTime === 0n)

  // ─── Countdown ──────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (notStarted) { setCountdown(0); return }
    const end = Number(endTime)
    const update = () => setCountdown(Math.max(0, end - Math.floor(Date.now() / 1000)))
    update()
    timerRef.current = setInterval(update, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [endTime, notStarted])

  // ─── Token info ──────────────────────────────────────────────────
  const { data: balance } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  })
  const { data: decimalsRaw } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: 'decimals',
  })
  const decimals = Number(decimalsRaw ?? 18)
  const totalCost = sharePriceLocked * BigInt(shares)

  // ─── Wait for approve tx ─────────────────────────────────────────
  const { isSuccess: approveOk } = useWaitForTransactionReceipt({
    hash: approveTx,
    query: { enabled: !!approveTx },
  })

  // ─── Wait for bet tx ─────────────────────────────────────────────
  const { isSuccess: betOk } = useWaitForTransactionReceipt({
    hash: betTx,
    query: { enabled: !!betTx },
  })

  // When approve confirmed → send bet
  const doPlaceBet = useCallback(async () => {
    if (!address || !direction) return
    try {
      setStep('betting')
      toast('info', '步骤 2/2：确认下注', '请在钱包中确认交易…')
      const hash = await writeContractAsync({
        address: PREDICTION_ADDRESS,
        abi: PREDICTION_ABI,
        functionName: 'placeBet',
        args: [slot, direction === 'up', shares],
        chainId: bsc.id,
      })
      setBetTx(hash)
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string; code?: string }
      if (!err.code?.includes('ACTION_REJECTED') && !err.message?.includes('User rejected')) {
        toast('error', '下注失败', err.shortMessage ?? err.message?.slice(0, 120))
      }
      setStep('idle'); setBetTx(undefined)
    }
  }, [address, direction, slot, shares, writeContractAsync, toast])

  useEffect(() => {
    if (approveOk && step === 'approving') {
      toast('success', '授权成功')
      doPlaceBet()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveOk])

  useEffect(() => {
    if (betOk && step === 'betting') {
      toast('success', '下注成功！')
      setStep('idle'); setDir(null); setBetTx(undefined); setApproveTx(undefined)
      setTimeout(() => refetchRound(), 2000)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betOk])

  // ─── Handle Bet button ───────────────────────────────────────────
  const handleBet = useCallback(async () => {
    if (!address || !direction || !publicClient) return
    try {
      const allowance = await publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: TOKEN_ABI,
        functionName: 'allowance',
        args: [address, PREDICTION_ADDRESS],
      }) as bigint

      if (allowance < totalCost) {
        setStep('approving')
        toast('info', '步骤 1/2：代币授权', '请在钱包中确认授权…')
        const hash = await writeContractAsync({
          address: TOKEN_ADDRESS,
          abi: TOKEN_ABI,
          functionName: 'approve',
          args: [PREDICTION_ADDRESS, maxUint256],
          chainId: bsc.id,
        })
        setApproveTx(hash)
      } else {
        await doPlaceBet()
      }
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string; code?: string }
      if (!err.code?.includes('ACTION_REJECTED') && !err.message?.includes('User rejected')) {
        toast('error', '操作失败', err.shortMessage ?? err.message?.slice(0, 120))
      }
      setStep('idle'); setApproveTx(undefined)
    }
  }, [address, direction, publicClient, totalCost, writeContractAsync, doPlaceBet, toast])

  // ─── UI state ────────────────────────────────────────────────────
  const isBusy   = step !== 'idle'
  const canBet   = isConnected && !wrongChain && !isBusy && !!direction && (notStarted || bettingOpen)
  const totalShares = Number(totalUpShares) + Number(totalDownShares)
  const upPct    = totalShares > 0 ? Math.round(Number(totalUpShares) / totalShares * 100) : 50
  const downPct  = 100 - upPct
  const duration = notStarted ? SLOTS[slot].duration : (Number(endTime) - Number(endTime - secondsLeft))
  const progress = notStarted ? 0 : Math.max(0, Math.min(1, 1 - countdown / (duration || 1)))

  const btnLabel =
    !isConnected       ? '请先连接钱包' :
    wrongChain         ? '请切换到 BSC' :
    step === 'approving' ? '授权中…' :
    step === 'betting'   ? '下注中…' :
    !direction           ? (notStarted ? '选择方向以启动第一轮' : '请选择涨 / 跌') :
    !notStarted && !bettingOpen ? '本轮已关闭下注' :
    notStarted
      ? `首笔下注 · ${shares} 份 ${direction === 'up' ? '涨' : '跌'}`
      : `确认下注 · ${shares} 份 ${direction === 'up' ? '涨' : '跌'}`

  return (
    <div className="relative min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <StarField />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '1.5rem' }}>🦋</span>
          <span className="font-bold text-base" style={{ color: 'var(--color-fg)' }}>蝴蝶预测</span>
        </div>
        <ConnectButton chainStatus="icon" showBalance={false} accountStatus="avatar" />
      </nav>

      {wrongChain && (
        <div className="relative z-10 text-center py-2 text-sm font-medium"
          style={{ background: 'rgba(248,113,113,0.12)', color: 'var(--color-down)' }}>
          请在钱包切换到 BNB Smart Chain
        </div>
      )}

      <main className="relative z-10 max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Slot tabs */}
        <div className="flex justify-center gap-2">
          {SLOTS.map((s, i) => (
            <button
              key={i}
              className={`slot-tab${slot === i ? ' active' : ''}`}
              onClick={() => { setSlot(i as SlotId); setDir(null) }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Round Panel */}
          <div className="glass p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold" style={{ color: 'var(--color-fg)' }}>
                {SLOTS[slot].label} · {notStarted ? '等待第一笔下注' : `轮次 #${roundId.toString()}`}
              </h2>
              {!notStarted && (
                <span className="text-xs px-2 py-1 rounded-full" style={{
                  background: bettingOpen ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
                  color: bettingOpen ? 'var(--color-up)' : 'var(--color-down)',
                }}>
                  {bettingOpen ? '投注中' : '已关闭'}
                </span>
              )}
            </div>

            <div className="text-center py-2">
              <div className="text-5xl font-mono font-bold" style={{ color: 'var(--color-primary)', letterSpacing: '-0.02em' }}>
                {notStarted ? '--:--' : fmtCountdown(countdown)}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                {notStarted ? '首笔下注后开始计时' : '距离结算'}
              </div>
            </div>

            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${progress * 100}%` }} />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: '开盘价', value: openPrice > 0n ? fmtToken(openPrice) : '—' },
                { label: '当前价', value: currentPrice > 0n ? fmtToken(currentPrice) : '—' },
                { label: '奖池', value: fmtBnb(bnbPool) },
                { label: '份价', value: `${fmtToken(sharePriceLocked, decimals)} BFLY` },
              ].map(item => (
                <div key={item.label} className="glass-2 p-3 rounded-lg">
                  <div style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>{item.label}</div>
                  <div className="font-mono font-semibold mt-0.5" style={{ color: 'var(--color-fg)' }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span style={{ color: 'var(--color-up)' }}>涨 {upPct}% · {totalUpShares.toString()} 份</span>
                <span style={{ color: 'var(--color-down)' }}>跌 {downPct}% · {totalDownShares.toString()} 份</span>
              </div>
              <div className="flex rounded-full overflow-hidden h-2">
                <div style={{ width: `${upPct}%`, background: 'var(--color-up)', transition: 'width 0.5s' }} />
                <div style={{ flex: 1, background: 'var(--color-down)' }} />
              </div>
            </div>
          </div>

          {/* Bet Panel */}
          <div className="glass p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold" style={{ color: 'var(--color-fg)' }}>我要投注</h2>
              {isConnected && balance !== undefined && (
                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  余额 <span style={{ color: 'var(--color-fg)' }}>{fmtToken(balance as bigint, decimals)} BFLY</span>
                </span>
              )}
            </div>

            {/* Direction */}
            <div className="grid grid-cols-2 gap-3">
              {(['up', 'down'] as const).map(d => (
                <button
                  key={d}
                  className={`${d === 'up' ? 'btn-up' : 'btn-down'} rounded-xl py-5 font-bold text-lg${direction === d ? ' active' : ''}`}
                  onClick={() => setDir(d)}
                  disabled={isBusy}
                >
                  {d === 'up' ? '▲ 涨' : '▼ 跌'}
                </button>
              ))}
            </div>

            {/* Shares stepper */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm" style={{ color: 'var(--color-muted)' }}>份数 (1–{MAX_SHARES})</span>
                <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                  共 {fmtToken(totalCost, decimals)} BFLY
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button className="stepper-btn" onClick={() => setShares(s => Math.max(MIN_SHARES, s - 1))} disabled={isBusy || shares <= MIN_SHARES}>−</button>
                <div className="flex-1 text-center">
                  <span className="text-3xl font-bold" style={{ color: 'var(--color-fg)' }}>{shares}</span>
                  <span className="text-sm ml-1" style={{ color: 'var(--color-muted)' }}>份</span>
                </div>
                <button className="stepper-btn" onClick={() => setShares(s => Math.min(MAX_SHARES, s + 1))} disabled={isBusy || shares >= MAX_SHARES}>+</button>
              </div>
              <div className="flex gap-1.5 mt-2">
                {[1, 5, 10, 20].map(n => (
                  <button key={n} onClick={() => setShares(n)} disabled={isBusy}
                    className="flex-1 py-1 text-xs rounded-md border transition-all"
                    style={{
                      borderColor: shares === n ? 'var(--color-primary)' : 'var(--color-border)',
                      color: shares === n ? 'var(--color-primary)' : 'var(--color-muted)',
                      background: shares === n ? 'rgba(167,139,250,0.12)' : 'transparent',
                    }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            {direction && (
              <div className="glass-2 rounded-lg p-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-muted)' }}>代币花费</span>
                  <span style={{ color: 'var(--color-fg)', fontWeight: 600 }}>{fmtToken(totalCost, decimals)} BFLY</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-muted)' }}>方向</span>
                  <span style={{ color: direction === 'up' ? 'var(--color-up)' : 'var(--color-down)', fontWeight: 600 }}>
                    {direction === 'up' ? '押涨' : '押跌'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-muted)' }}>输了退款</span>
                  <span style={{ color: 'var(--color-fg)' }}>代币全额退还</span>
                </div>
              </div>
            )}

            <button className="btn-primary w-full" onClick={handleBet} disabled={!canBet}>
              {btnLabel}
            </button>
          </div>
        </div>

        {/* My Bets */}
        {isConnected && address && (
          <MyBetsPanel address={address} currentSlot={slot} currentRoundId={roundId} />
        )}

        {/* How it works */}
        <div className="glass p-5">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--color-fg)' }}>玩法说明</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {[
              { n: 1, t: '选档位', d: '三档：20分钟 / 1小时 / 24小时' },
              { n: 2, t: '选方向', d: '押涨或押跌，1份 = 50万 BFLY' },
              { n: 3, t: '授权下注', d: '钱包确认授权后再确认下注' },
              { n: 4, t: '等结算', d: '赢得 BNB；输了代币原额退还' },
            ].map(item => (
              <div key={item.n} className="glass-2 p-3 rounded-lg">
                <div className="font-medium mb-1" style={{ color: 'var(--color-primary)' }}>{item.n}. {item.t}</div>
                <div style={{ color: 'var(--color-muted)' }}>{item.d}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Toasts */}
      <div className="fixed bottom-6 right-6 z-50 space-y-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <div className="font-semibold" style={{ color: 'var(--color-fg)' }}>{t.title}</div>
            {t.message && <div className="mt-0.5 text-xs" style={{ color: 'var(--color-fg-dim)' }}>{t.message}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── StarField ────────────────────────────────────────────────────────
function StarField() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d'); if (!ctx) return
    const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight }
    resize(); window.addEventListener('resize', resize)
    const stars = Array.from({ length: 160 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.4 + 0.3,
      a: Math.random() * 0.8 + 0.2,
      sp: Math.random() * 0.008 + 0.002,
      ph: Math.random() * Math.PI * 2,
    }))
    let raf: number
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height)
      const t = Date.now() / 1000
      stars.forEach(s => {
        const alpha = s.a * (0.3 + 0.7 * ((Math.sin(t * s.sp * 10 + s.ph) + 1) / 2))
        ctx.beginPath()
        ctx.arc(s.x * c.width, s.y * c.height, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(167,139,250,${alpha})`
        ctx.fill()
      })
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(raf) }
  }, [])
  return <canvas ref={ref} className="starfield" aria-hidden="true" />
}

// ─── MyBetsPanel ──────────────────────────────────────────────────────
function MyBetsPanel({
  address, currentSlot, currentRoundId,
}: {
  address: `0x${string}`
  currentSlot: SlotId
  currentRoundId: bigint
}) {
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  interface BetRecord {
    slot: number; roundId: bigint
    shares: number; isUp: boolean; claimed: boolean
    settled: boolean; upWon: boolean; voided: boolean
    isWinner: boolean
  }

  const [records, setRecords] = useState<BetRecord[]>([])
  const [loading, setLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!publicClient || !address) return
    setLoading(true)
    const out: BetRecord[] = []
    try {
      for (let s = 0; s < 3; s++) {
        const rid = await publicClient.readContract({
          address: PREDICTION_ADDRESS, abi: PREDICTION_ABI,
          functionName: 'currentRoundId', args: [BigInt(s)],
        }) as bigint
        const from = rid > 15n ? rid - 15n : 0n
        for (let id = rid; id >= from; id--) {
          try {
            const bet = await publicClient.readContract({
              address: PREDICTION_ADDRESS, abi: PREDICTION_ABI,
              functionName: 'bets', args: [s, id, address],
            }) as [number, boolean, boolean]
            if (!bet[0]) continue
            const round = await publicClient.readContract({
              address: PREDICTION_ADDRESS, abi: PREDICTION_ABI,
              functionName: 'rounds', args: [s, id],
            }) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean, boolean, boolean]
            const settled = round[10]; const upWon = round[11]; const voided = round[12]
            out.push({
              slot: s, roundId: id,
              shares: Number(bet[0]), isUp: bet[1], claimed: bet[2],
              settled, upWon, voided,
              isWinner: settled && !voided && bet[1] === upWon,
            })
          } catch { /* skip missing rounds */ }
        }
      }
      out.sort((a, b) => (a.slot !== b.slot ? a.slot - b.slot : Number(b.roundId - a.roundId)))
      setRecords(out)
    } finally { setLoading(false) }
  }, [publicClient, address])

  // Refetch when current round advances
  useEffect(() => { fetchAll() }, [fetchAll, currentRoundId])

  const handleClaim = async (rec: BetRecord) => {
    try {
      const hash = await writeContractAsync({
        address: PREDICTION_ADDRESS, abi: PREDICTION_ABI,
        functionName: 'claim', args: [rec.slot, rec.roundId], chainId: bsc.id,
      })
      await publicClient!.waitForTransactionReceipt({ hash })
      fetchAll()
    } catch { /* ignore user reject */ }
  }

  if (!records.length && !loading) return null

  return (
    <div className="glass p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold" style={{ color: 'var(--color-fg)' }}>我的下注记录</h2>
        <button onClick={fetchAll} className="text-xs" style={{ color: 'var(--color-primary)' }}>
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>
      {records.map(rec => {
        const claimable = rec.settled && !rec.voided && rec.isWinner && !rec.claimed
        const status =
          rec.voided   ? { text: '已作废', color: 'var(--color-muted)' } :
          !rec.settled ? { text: '进行中', color: 'var(--color-warn)' } :
          rec.isWinner ? { text: '赢了',   color: 'var(--color-up)' } :
                         { text: '输了',   color: 'var(--color-down)' }
        return (
          <div key={`${rec.slot}-${rec.roundId}`}
            className="glass-2 p-3 rounded-lg flex items-center justify-between gap-2">
            <div>
              <div className="text-xs mb-0.5" style={{ color: 'var(--color-muted)' }}>
                {SLOTS[rec.slot].label} · #{rec.roundId.toString()}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold"
                  style={{ color: rec.isUp ? 'var(--color-up)' : 'var(--color-down)' }}>
                  {rec.isUp ? '▲ 涨' : '▼ 跌'} {rec.shares} 份
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{ color: status.color, background: `${status.color}22` }}>
                  {status.text}
                </span>
                {rec.claimed && (
                  <span className="text-xs" style={{ color: 'var(--color-muted)' }}>已领</span>
                )}
              </div>
            </div>
            {claimable && (
              <button className="btn-primary text-xs px-3 py-1.5 shrink-0" onClick={() => handleClaim(rec)}>
                领奖
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
