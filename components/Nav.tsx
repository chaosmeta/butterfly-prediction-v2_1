'use client'

import Image from 'next/image'
import { ethers } from 'ethers'
import { shortenAddress, formatToken } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Props {
  address:      string | null
  tokenBalance: bigint
  isWrongChain: boolean
  isConnecting: boolean
  onOpenWallet: () => void
  onSwitchChain: () => void
  onDisconnect: () => void
}

export default function Nav({
  address,
  tokenBalance,
  isWrongChain,
  isConnecting,
  onOpenWallet,
  onSwitchChain,
  onDisconnect,
}: Props) {
  return (
    <header className="fixed top-0 inset-x-0 z-50 glass border-b border-border/50">
      <nav
        className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4"
        role="navigation"
        aria-label="主导航"
      >
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5 shrink-0">
          <Image
            src="/assets/logo.webp"
            alt="蝴蝶预测 Logo"
            width={36}
            height={36}
            className="rounded-full"
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).src = '/assets/logo.png'
            }}
          />
          <span className="font-bold text-lg text-foreground tracking-tight hidden sm:block">
            蝴蝶预测
          </span>
        </a>

        {/* Nav links */}
        <ul className="hidden md:flex items-center gap-6 text-sm text-fg-dim">
          {['首页', '玩法说明', '历史轮次', '白皮书'].map((item) => (
            <li key={item}>
              <a
                href="#"
                className="hover:text-primary transition-colors duration-200"
              >
                {item}
              </a>
            </li>
          ))}
        </ul>

        {/* Wallet area */}
        <div className="flex items-center gap-2 shrink-0">
          {address ? (
            <>
              {isWrongChain ? (
                <button
                  onClick={onSwitchChain}
                  className="btn-primary text-sm px-4 py-2 animate-pulse"
                >
                  切换到 BSC
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {/* 余额 */}
                  <div className="glass-2 px-3 py-1.5 text-xs text-fg-dim hidden sm:flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-up inline-block" />
                    {formatToken(tokenBalance, 2)} BFLY
                  </div>
                  {/* 地址 */}
                  <button
                    onClick={onDisconnect}
                    className="glass-2 px-3 py-1.5 text-xs text-primary hover:bg-surface-2 transition-colors rounded-lg flex items-center gap-1.5"
                    title="点击断开连接"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block animate-pulse" />
                    {shortenAddress(address)}
                  </button>
                </div>
              )}
            </>
          ) : (
            <button
              onClick={onOpenWallet}
              disabled={isConnecting}
              className={cn('btn-primary text-sm px-4 py-2', isConnecting && 'opacity-60')}
            >
              {isConnecting ? '连接中…' : '连接钱包'}
            </button>
          )}
        </div>
      </nav>
    </header>
  )
}
