'use client'

import { useState, useCallback, useId } from 'react'
import dynamic from 'next/dynamic'

import Nav          from './Nav'
import Hero         from './Hero'
import Ticker       from './Ticker'
import RoundPanel   from './RoundPanel'
import BetPanel     from './BetPanel'
import MyBets       from './MyBets'
import WalletModal  from './WalletModal'
import HowItWorks   from './HowItWorks'
import Footer       from './Footer'
import ToastContainer, { type ToastData } from './Toast'

import { useWallet }  from '@/hooks/useWallet'
import { useRound }   from '@/hooks/useRound'
import { useTicker }  from '@/hooks/useTicker'
import { useMyBets }  from '@/hooks/useMyBets'
import type { SlotId } from '@/lib/config'

// Starfield 只在客户端渲染（canvas 操作）
const Starfield = dynamic(() => import('./Starfield'), { ssr: false })

export default function ButterflyApp() {
  const [slot, setSlot]             = useState<SlotId>(0)
  const [walletOpen, setWalletOpen] = useState(false)
  const [toasts, setToasts]         = useState<ToastData[]>([])
  const uid = useId()

  // ── Wallet ───────────────────────────────────────────────────────
  const wallet = useWallet()

  // ── Round ────────────────────────────────────────────────────────
  const { round, loading: roundLoading, error: roundError, refresh } = useRound(slot)

  // ── Ticker ───────────────────────────────────────────────────────
  const tickerItems = useTicker(round?.openPrice)

  // ── My Bets ──────────────────────────────────────────────────────
  const {
    bets, loading: betsLoading, claiming,
    fetchBets, claimRounds,
  } = useMyBets(wallet.address, wallet.signer, slot, round?.roundId ?? null)

  // ── Toast helpers ─────────────────────────────────────────────────
  const addToast = useCallback((t: Omit<ToastData, 'id'>) => {
    const id = `${uid}-${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev.slice(-4), { ...t, id }])
  }, [uid])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // ── Wallet connect ────────────────────────────────────────────────
  const handleConnect = useCallback(async (detail: Parameters<typeof wallet.connect>[0]) => {
    try {
      await wallet.connect(detail)
      setWalletOpen(false)
      addToast({ type: 'success', title: '钱包已连接' })
    } catch (e: unknown) {
      addToast({ type: 'error', title: '连接失败', message: (e as Error).message?.slice(0, 80) })
    }
  }, [wallet, addToast])

  const handleDisconnect = useCallback(() => {
    wallet.disconnect()
    addToast({ type: 'info', title: '已断开连接' })
  }, [wallet, addToast])

  return (
    <div className="relative min-h-screen text-foreground">
      {/* 星空背景 */}
      <Starfield />

      {/* 内容层 */}
      <div className="relative z-10 flex flex-col min-h-screen">
        <Nav
          address={wallet.address}
          tokenBalance={wallet.tokenBalance}
          isWrongChain={wallet.isWrongChain}
          isConnecting={wallet.isConnecting}
          onOpenWallet={() => setWalletOpen(true)}
          onSwitchChain={async () => {
            try {
              await wallet.switchChain()
              addToast({ type: 'success', title: '已切换到 BSC' })
            } catch {
              addToast({ type: 'error', title: '切链失败，请手动切换' })
            }
          }}
          onDisconnect={handleDisconnect}
        />

        <main className="flex-1">
          <Hero />

          <Ticker items={tickerItems} />

          {/* 核心交互区 */}
          <section
            className="max-w-5xl mx-auto px-4 sm:px-6 py-10"
            aria-label="押注区域"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <RoundPanel
                slot={slot}
                onSlot={(s) => { setSlot(s) }}
                round={round}
                loading={roundLoading}
                error={roundError}
              />
              <BetPanel
                slot={slot}
                round={round}
                signer={wallet.signer}
                address={wallet.address}
                onToast={addToast}
                onRefresh={() => { refresh(); wallet.refreshBalance() }}
              />
            </div>
          </section>

          {/* 我的记录 */}
          <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-10">
            <MyBets
              bets={bets}
              loading={betsLoading}
              claiming={claiming}
              address={wallet.address}
              onFetch={fetchBets}
              onClaim={claimRounds}
              onToast={addToast}
            />
          </section>

          <HowItWorks />
        </main>

        <Footer />
      </div>

      {/* 钱包弹窗 */}
      <WalletModal
        open={walletOpen}
        wallets={wallet.wallets}
        isConnecting={wallet.isConnecting}
        onConnect={handleConnect}
        onClose={() => setWalletOpen(false)}
      />

      {/* Toast */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
