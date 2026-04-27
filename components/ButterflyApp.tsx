'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi'
import { formatUnits, maxUint256 } from 'viem'
import {
  PREDICTION_ADDRESS,
  TOKEN_ADDRESS,
  PREDICTION_ABI,
  TOKEN_ABI,
  SLOTS,
  MAX_SHARES,
  MIN_SHARES,
  SHARE_PRICE_DEFAULT,
} from '@/lib/contracts'
import { bsc } from '@/lib/wagmi'

// ─── Types ─────────────────────────────────────────────────────────────
type SlotId = 0 | 1 | 2
type Direction = 'up' | 'down'
type TxStep = 'idle' | 'approving' | 'waiting_approve' | 'betting' | 'waiting_bet'

interface ToastItem {
  id: number
  type: 'info' | 'success' | 'error'
  title: string
  msg?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────
let _toastId = 0

function fmtBfly(wei: bigint, decimals = 18): string {
  const n = parseFloat(formatUnits(wei, decimals))
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function fmtBnb(wei: bigint): string {
  return parseFloat(formatUnits(wei, 18)).toFixed(4) + ' BNB'
}

function fmtCountdown(sec: number): string {
  if (sec <= 0) return '00:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

function pad(n: number) { return String(n).padStart(2, '0') }

function errMsg(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string }
  return (err.shortMessage ?? err.message ?? '未知错误').slice(0, 140)
}

function isUserReject(e: unknown): boolean {
  const err = e as { code?: string; message?: string }
  return (
    err.code === 'ACTION_REJECTED' ||
    err.code === '4001' ||
    !!(err.message?.toLowerCase().includes('user rejected')) ||
    !!(err.message?.toLowerCase().includes('user denied'))
  )
}

// ─── Main Component ─────────────────────────────────────────────────────
export default function ButterflyApp() {
  const { address, isConnected, chain } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [slot, setSlot]       = useState<SlotId>(0)
  const [dir, setDir]         = useState<Direction | null>(null)
  const [shares, setShares]   = useState(1)
  const [step, setStep]       = useState<TxStep>('idle')
  const [approveTx, setApproveTx] = useState<`0x${string}` | undefined>()
  const [betTx, setBetTx]         = useState<`0x${string}` | undefined>()
  const [toasts, setToasts]   = useState<ToastItem[]>([])
  const [secs, setSecs]       = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const wrongChain = isConnected && chain?.id !== bsc.id

  // ── Toast ────────────────────────────────────────────────────────
  const addToast = useCallback((type: ToastItem['type'], title: string, msg?: string) => {
    const id = ++_toastId
    setToasts(p => [...p.slice(-4), { id, type, title, msg }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 5000)
  }, [])

  // ── Read: getCurrentRound ────────────────────────────────────────
  const { data: roundData, refetch: refetchRound } = useReadContract({
    address: PREDICTION_ADDRESS,
    abi: PREDICTION_ABI,
    functionName: 'getCurrentRound',
    args: [slot],
    chainId: bsc.id,
    query: { refetchInterval: 10_000, staleTime: 5_000 },
  })

  // Destructure the 11-field tuple by index
  const roundId          = roundData ? roundData[0] : 0n
  const endTime          = roundData ? roundData[2] : 0n
  const openPrice        = roundData ? roundData[3] : 0n
  const currentPrice     = roundData ? roundData[4] : 0n
  const totalUpShares    = roundData ? roundData[5] : 0n
  const totalDownShares  = roundData ? roundData[6] : 0n
  const bnbPool          = roundData ? roundData[7] : 0n
  const sharePriceLocked = (roundData && roundData[8] > 0n) ? roundData[8] : SHARE_PRICE_DEFAULT
  const bettingOpen      = roundData ? roundData[10] : false
  const notStarted       = !roundData || (roundId === 0n && endTime === 0n)

  // ── Countdown timer ──────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (notStarted) { setSecs(0); return }
    const end = Number(endTime)
    const tick = () => setSecs(Math.max(0, end - Math.floor(Date.now() / 1000)))
    tick()
    timerRef.current = setInterval(tick, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [endTime, notStarted])

  // ── Read: token balance ──────────────────────────────────────────
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: bsc.id,
    query: { enabled: !!address, refetchInterval: 15_000 },
  })

  // ── Read: token decimals ─────────────────────────────────────────
  const { data: decimalsRaw } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: 'decimals',
    chainId: bsc.id,
  })
  const decimals = Number(decimalsRaw ?? 18)

  const totalCost = sharePriceLocked * BigInt(shares)

  // ── Wait: approve tx ─────────────────────────────────────────────
  const { isSuccess: approveOk, isError: approveErr } = useWaitForTransactionReceipt({
    hash: approveTx,
    chainId: bsc.id,
    query: { enabled: !!approveTx },
  })

  // ── Wait: bet tx ─────────────────────────────────────────────────
  const { isSuccess: betOk, isError: betErr } = useWaitForTransactionReceipt({
    hash: betTx,
    chainId: bsc.id,
    query: { enabled: !!betTx },
  })

  // ── doPlaceBet (called after approve confirmed or if already approved) ──
  const doPlaceBet = useCallback(async () => {
    if (!address || !dir) return
    try {
      setStep('betting')
      addToast('info', '步骤 2/2：确认下注', '请在钱包弹窗中确认下注交易')
      const hash = await writeContractAsync({
        address: PREDICTION_ADDRESS,
        abi: PREDICTION_ABI,
        functionName: 'placeBet',
        args: [slot, dir === 'up', shares],
        chainId: bsc.id,
      })
      setBetTx(hash)
      setStep('waiting_bet')
    } catch (e) {
      if (!isUserReject(e)) addToast('error', '下注失败', errMsg(e))
      setStep('idle')
      setBetTx(undefined)
    }
  }, [address, dir, slot, shares, writeContractAsync, addToast])

  // approve confirmed → place bet
  useEffect(() => {
    if (approveOk && step === 'waiting_approve') {
      addToast('success', '授权成功', '即将发送下注交易')
      setApproveTx(undefined)
      doPlaceBet()
    }
    if (approveErr && step === 'waiting_approve') {
      addToast('error', '授权交易失败')
      setStep('idle')
      setApproveTx(undefined)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveOk, approveErr])

  // bet confirmed
  useEffect(() => {
    if (betOk && step === 'waiting_bet') {
      addToast('success', '下注成功！', '已成功下注，等待轮次结算')
      setStep('idle')
      setDir(null)
      setBetTx(undefined)
      refetchRound()
      refetchBalance()
    }
    if (betErr && step === 'waiting_bet') {
      addToast('error', '下注交易失败')
      setStep('idle')
      setBetTx(undefined)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betOk, betErr])

  // ── Main bet handler ─────────────────────────────────────────────
  const handleBet = useCallback(async () => {
    if (!address || !dir || !publicClient) return
    try {
      // Check current allowance first
      const allowance = await publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: TOKEN_ABI,
        functionName: 'allowance',
        args: [address, PREDICTION_ADDRESS],
      }) as bigint

      if (allowance < totalCost) {
        // Need approval
        setStep('approving')
        addToast('info', '步骤 1/2：代币授权', '请在钱包弹窗中确认授权')
        const hash = await writeContractAsync({
          address: TOKEN_ADDRESS,
          abi: TOKEN_ABI,
          functionName: 'approve',
          args: [PREDICTION_ADDRESS, maxUint256],
          chainId: bsc.id,
        })
        setApproveTx(hash)
        setStep('waiting_approve')
      } else {
        // Already approved, go straight to bet
        await doPlaceBet()
      }
    } catch (e) {
      if (!isUserReject(e)) addToast('error', '操作失败', errMsg(e))
      setStep('idle')
      setApproveTx(undefined)
    }
  }, [address, dir, publicClient, totalCost, writeContractAsync, doPlaceBet, addToast])

  // ── Derived UI state ─────────────────────────────────────────────
  const isBusy = step !== 'idle'
  const canBet = isConnected && !wrongChain && !isBusy && !!dir && (notStarted || bettingOpen)

  const totalShares = Number(totalUpShares) + Number(totalDownShares)
  const upPct   = totalShares > 0 ? Math.round(Number(totalUpShares) / totalShares * 100) : 50
  const downPct = 100 - upPct

  const slotDuration = SLOTS[slot].duration
  const progress = notStarted ? 0 : Math.max(0, Math.min(1, 1 - secs / slotDuration))

  const btnLabel =
    !isConnected          ? '请先连接钱包' :
    wrongChain            ? '请切换到 BSC 网络' :
    step === 'approving'  ? '等待授权签名…' :
    step === 'waiting_approve' ? '等待授权上链…' :
    step === 'betting'    ? '等待下注签名…' :
    step === 'waiting_bet' ? '等待下注上链…' :
    !dir                  ? (notStarted ? '选择方向后启动第一轮' : '请选择涨 / 跌') :
    (!notStarted && !bettingOpen) ? '本轮已关闭下注' :
    `${notStarted ? '首笔下注' : '确认下注'} · ${dir === 'up' ? '涨' : '跌'} ${shares} 份`

  return (
    <div className="relative min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <StarBg />

      {/* ── Navbar ── */}
      <nav
        className="relative z-10 flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-3">
          <img src="/assets/logo.webp" alt="蝴蝶预测" className="w-8 h-8 rounded-full" />
          <span className="font-bold text-lg tracking-tight" style={{ color: 'var(--color-fg)' }}>
            蝴蝶预测
          </span>
        </div>
        <ConnectButton chainStatus="icon" showBalance={false} accountStatus="avatar" />
      </nav>

      {wrongChain && (
        <div
          className="relative z-10 text-center py-2 text-sm font-medium"
          style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--color-down)' }}
        >
          请在钱包中切换到 BNB Smart Chain（链 ID 56）
        </div>
      )}

      <main className="relative z-10 max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* ── Slot Tabs ── */}
        <div className="flex justify-center gap-2" role="tablist" aria-label="时间档位">
          {SLOTS.map((s, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={slot === i}
              className={`slot-tab${slot === i ? ' active' : ''}`}
              onClick={() => { setSlot(i as SlotId); setDir(null) }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Round Info ── */}
          <section className="glass p-5 space-y-4" aria-label="当前轮次信息">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base" style={{ color: 'var(--color-fg)' }}>
                {SLOTS[slot].label}
                {!notStarted && (
                  <span className="ml-2 text-sm font-normal" style={{ color: 'var(--color-muted)' }}>
                    #{roundId.toString()}
                  </span>
                )}
              </h2>
              {!notStarted && (
                <span
                  className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{
                    background: bettingOpen ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                    color: bettingOpen ? 'var(--color-up)' : 'var(--color-down)',
                  }}
                >
                  {bettingOpen ? '投注中' : '已关闭'}
                </span>
              )}
            </div>

            {/* Countdown */}
            <div className="text-center py-3">
              <div
                className="text-5xl font-mono font-bold tabular-nums"
                style={{ color: 'var(--color-primary)', letterSpacing: '-0.03em' }}
              >
                {notStarted ? '--:--' : fmtCountdown(secs)}
              </div>
              <p className="text-xs mt-1.5" style={{ color: 'var(--color-muted)' }}>
                {notStarted ? '首笔下注后自动开始计时' : '距离本轮结算'}
              </p>
            </div>

            {/* Progress */}
            <div className="progress-bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-bar-fill" style={{ width: `${progress * 100}%` }} />
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: '开盘价',  value: openPrice > 0n ? fmtBfly(openPrice) + ' BNB' : '—' },
                { label: '当前价',  value: currentPrice > 0n ? fmtBfly(currentPrice) + ' BNB' : '—' },
                { label: '奖池',    value: fmtBnb(bnbPool) },
                { label: '份价',    value: fmtBfly(sharePriceLocked, decimals) + ' BFLY' },
              ].map(item => (
                <div key={item.label} className="glass-2 p-3 rounded-xl">
                  <div className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>{item.label}</div>
                  <div className="font-mono font-semibold text-sm" style={{ color: 'var(--color-fg)' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Up/Down ratio */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span style={{ color: 'var(--color-up)' }}>
                  涨 {upPct}% &middot; {totalUpShares.toString()} 份
                </span>
                <span style={{ color: 'var(--color-down)' }}>
                  跌 {downPct}% &middot; {totalDownShares.toString()} 份
                </span>
              </div>
              <div className="flex rounded-full overflow-hidden h-2.5">
                <div style={{ width: `${upPct}%`, background: 'var(--color-up)', transition: 'width 0.6s ease' }} />
                <div style={{ flex: 1, background: 'var(--color-down)' }} />
              </div>
            </div>
          </section>

          {/* ── Bet Panel ── */}
          <section className="glass p-5 space-y-5" aria-label="下注面板">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base" style={{ color: 'var(--color-fg)' }}>我要投注</h2>
              {isConnected && balance !== undefined && (
                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  余额&nbsp;
                  <span className="font-semibold" style={{ color: 'var(--color-fg)' }}>
                    {fmtBfly(balance as bigint, decimals)} BFLY
                  </span>
                </span>
              )}
            </div>

            {/* Direction buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                className={`btn-up rounded-xl py-6 font-bold text-xl${dir === 'up' ? ' active' : ''}`}
                onClick={() => !isBusy && setDir('up')}
                disabled={isBusy}
                aria-pressed={dir === 'up'}
              >
                ▲ 涨
              </button>
              <button
                className={`btn-down rounded-xl py-6 font-bold text-xl${dir === 'down' ? ' active' : ''}`}
                onClick={() => !isBusy && setDir('down')}
                disabled={isBusy}
                aria-pressed={dir === 'down'}
              >
                ▼ 跌
              </button>
            </div>

            {/* Shares */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
                  份数（1 ~ {MAX_SHARES}）
                </span>
                <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                  {fmtBfly(totalCost, decimals)} BFLY
                </span>
              </div>

              <div className="flex items-center gap-4">
                <button
                  className="stepper-btn"
                  onClick={() => setShares(s => Math.max(MIN_SHARES, s - 1))}
                  disabled={isBusy || shares <= MIN_SHARES}
                  aria-label="减少份数"
                >
                  −
                </button>
                <div className="flex-1 text-center">
                  <span className="text-4xl font-bold tabular-nums" style={{ color: 'var(--color-fg)' }}>
                    {shares}
                  </span>
                  <span className="text-sm ml-1.5" style={{ color: 'var(--color-muted)' }}>份</span>
                </div>
                <button
                  className="stepper-btn"
                  onClick={() => setShares(s => Math.min(MAX_SHARES, s + 1))}
                  disabled={isBusy || shares >= MAX_SHARES}
                  aria-label="增加份数"
                >
                  +
                </button>
              </div>

              {/* Quick select */}
              <div className="flex gap-2 mt-3">
                {[1, 5, 10, 20].map(n => (
                  <button
                    key={n}
                    onClick={() => !isBusy && setShares(n)}
                    disabled={isBusy}
                    className="flex-1 py-1.5 text-xs rounded-lg border transition-all"
                    style={{
                      borderColor: shares === n ? 'var(--color-primary)' : 'var(--color-border)',
                      color: shares === n ? 'var(--color-primary)' : 'var(--color-muted)',
                      background: shares === n ? 'rgba(167,139,250,0.12)' : 'transparent',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary box */}
            {dir && (
              <div className="glass-2 rounded-xl p-3 space-y-1.5 text-xs">
                <Row label="代币花费" value={`${fmtBfly(totalCost, decimals)} BFLY`} />
                <Row
                  label="方向"
                  value={dir === 'up' ? '押涨' : '押跌'}
                  valueColor={dir === 'up' ? 'var(--color-up)' : 'var(--color-down)'}
                />
                <Row label="输了退款" value="代币全额退还" />
                <Row label="赢了获得" value="按份额比例分配奖池 BNB" />
              </div>
            )}

            {/* Bet button */}
            <button
              className="btn-primary w-full py-4 text-base"
              onClick={handleBet}
              disabled={!canBet}
            >
              {isBusy && (
                <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin mr-2 align-middle" />
              )}
              {btnLabel}
            </button>

            {/* Step indicator */}
            {isBusy && (
              <div className="flex items-center justify-center gap-6 text-xs" style={{ color: 'var(--color-muted)' }}>
                <StepDot
                  active={step === 'approving' || step === 'waiting_approve'}
                  done={step === 'betting' || step === 'waiting_bet'}
                  label="1. 授权"
                />
                <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                <StepDot
                  active={step === 'betting' || step === 'waiting_bet'}
                  done={false}
                  label="2. 下注"
                />
              </div>
            )}
          </section>
        </div>

        {/* ── My Bets ── */}
        {isConnected && !!address && (
          <MyBets address={address} slot={slot} roundId={roundId} />
        )}

        {/* ── How it works ── */}
        <section className="glass p-5">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--color-fg)' }}>玩法说明</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {[
              { step: '1', title: '选档位', desc: '20分钟 / 1小时 / 24小时，独立轮次' },
              { step: '2', title: '押方向', desc: '选涨或跌，1份 = 50万 BFLY 代币' },
              { step: '3', title: '授权下注', desc: '先在钱包授权代币，再确认下注' },
              { step: '4', title: '结算领奖', desc: '赢得奖池 BNB；输了代币原额退还' },
            ].map(item => (
              <div key={item.step} className="glass-2 p-3.5 rounded-xl">
                <div className="font-semibold mb-1" style={{ color: 'var(--color-primary)' }}>
                  {item.step}. {item.title}
                </div>
                <div className="leading-relaxed" style={{ color: 'var(--color-muted)' }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </section>

      </main>

      {/* ── Toasts ── */}
      <div
        className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast ${t.type}`}
            role="alert"
          >
            <p className="font-semibold text-sm" style={{ color: 'var(--color-fg)' }}>{t.title}</p>
            {t.msg && <p className="mt-0.5 text-xs" style={{ color: 'var(--color-fg-dim)' }}>{t.msg}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span style={{ color: 'var(--color-muted)' }}>{label}</span>
      <span className="font-semibold" style={{ color: valueColor ?? 'var(--color-fg)' }}>{value}</span>
    </div>
  )
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-2 h-2 rounded-full"
        style={{
          background: done ? 'var(--color-up)' : active ? 'var(--color-primary)' : 'var(--color-border)',
        }}
      />
      <span style={{ color: active || done ? 'var(--color-fg)' : 'var(--color-muted)' }}>{label}</span>
    </div>
  )
}

// ─── StarBg ─────────────────────────────────────────────────────────────
function StarBg() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    type Star = { x: number; y: number; r: number; alpha: number; speed: number; phase: number }
    const stars: Star[] = Array.from({ length: 180 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.5 + 0.2,
      alpha: Math.random() * 0.7 + 0.15,
      speed: Math.random() * 0.6 + 0.2,
      phase: Math.random() * Math.PI * 2,
    }))

    let raf: number
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const t = Date.now() / 1000
      for (const s of stars) {
        const a = s.alpha * (0.4 + 0.6 * ((Math.sin(t * s.speed + s.phase) + 1) / 2))
        ctx.beginPath()
        ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(167,139,250,${a.toFixed(3)})`
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(raf)
    }
  }, [])

  return <canvas ref={ref} className="starfield" aria-hidden="true" />
}

// ─── MyBets ──────────────────────────────────────────────────────────────
interface BetRecord {
  slot: number
  roundId: bigint
  shares: number
  isUp: boolean
  claimed: boolean
  settled: boolean
  upWon: boolean
  voided: boolean
}

function MyBets({
  address,
  slot,
  roundId,
}: {
  address: `0x${string}`
  slot: SlotId
  roundId: bigint
}) {
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [records, setRecords] = useState<BetRecord[]>([])
  const [loading, setLoading]   = useState(false)
  const [claimingId, setClaimingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!publicClient) return
    setLoading(true)
    const out: BetRecord[] = []
    try {
      for (let s = 0; s < 3; s++) {
        // Get current round id for this slot
        const curId = await publicClient.readContract({
          address: PREDICTION_ADDRESS,
          abi: PREDICTION_ABI,
          functionName: 'currentRoundId',
          args: [BigInt(s)],
        }) as bigint

        if (curId === 0n) continue

        // Check last 20 rounds
        const fromId = curId > 20n ? curId - 20n : 1n
        for (let rid = curId; rid >= fromId; rid--) {
          try {
            const bet = await publicClient.readContract({
              address: PREDICTION_ADDRESS,
              abi: PREDICTION_ABI,
              functionName: 'bets',
              args: [s, rid, address],
            }) as readonly [number, boolean, boolean]

            if (!bet[0]) continue // no bet in this round

            const round = await publicClient.readContract({
              address: PREDICTION_ADDRESS,
              abi: PREDICTION_ABI,
              functionName: 'rounds',
              args: [s, rid],
            }) as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean, boolean, boolean]

            out.push({
              slot: s,
              roundId: rid,
              shares: Number(bet[0]),
              isUp: bet[1],
              claimed: bet[2],
              settled: round[10],
              upWon: round[11],
              voided: round[12],
            })
          } catch {
            // round doesn't exist yet, skip
          }
        }
      }

      out.sort((a, b) => {
        if (a.slot !== b.slot) return a.slot - b.slot
        return Number(b.roundId - a.roundId)
      })
      setRecords(out)
    } finally {
      setLoading(false)
    }
  }, [publicClient, address])

  // Reload when current round id changes (new bet placed or round rolled)
  useEffect(() => { load() }, [load, roundId])

  const handleClaim = async (rec: BetRecord) => {
    if (!publicClient) return
    const key = `${rec.slot}-${rec.roundId}`
    try {
      setClaimingId(key)
      const hash = await writeContractAsync({
        address: PREDICTION_ADDRESS,
        abi: PREDICTION_ABI,
        functionName: 'claim',
        args: [rec.slot, rec.roundId],
        chainId: bsc.id,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      load()
    } catch {
      // user rejected or tx failed — silently ignore
    } finally {
      setClaimingId(null)
    }
  }

  if (!loading && records.length === 0) return null

  return (
    <section className="glass p-5 space-y-3" aria-label="我的下注记录">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold" style={{ color: 'var(--color-fg)' }}>我的下注记录</h2>
        <button
          onClick={load}
          className="text-xs px-3 py-1 rounded-lg"
          style={{
            color: 'var(--color-primary)',
            border: '1px solid var(--color-border)',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>

      {records.map(rec => {
        const key = `${rec.slot}-${rec.roundId}`
        const isWinner = rec.settled && !rec.voided && (rec.isUp === rec.upWon)
        const claimable = isWinner && !rec.claimed
        const isClaiming = claimingId === key

        const status =
          rec.voided    ? { text: '已作废', color: 'var(--color-muted)' }   :
          !rec.settled  ? { text: '进行中', color: 'var(--color-warn)' }    :
          isWinner      ? { text: '赢了',   color: 'var(--color-up)' }      :
                          { text: '输了',   color: 'var(--color-down)' }

        return (
          <div
            key={key}
            className="glass-2 p-3.5 rounded-xl flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>
                {SLOTS[rec.slot].label} &middot; 轮次 #{rec.roundId.toString()}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-sm font-semibold"
                  style={{ color: rec.isUp ? 'var(--color-up)' : 'var(--color-down)' }}
                >
                  {rec.isUp ? '▲ 涨' : '▼ 跌'} &nbsp;{rec.shares} 份
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ color: status.color, background: `${status.color}1a` }}
                >
                  {status.text}
                </span>
                {rec.claimed && (
                  <span className="text-xs" style={{ color: 'var(--color-muted)' }}>已领取</span>
                )}
              </div>
            </div>

            {claimable && (
              <button
                className="btn-primary shrink-0 text-xs px-4 py-2"
                onClick={() => handleClaim(rec)}
                disabled={isClaiming}
              >
                {isClaiming ? '领取中…' : '领奖'}
              </button>
            )}
          </div>
        )
      })}
    </section>
  )
}
