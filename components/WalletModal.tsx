'use client'

import { useEffect } from 'react'
import type { EIP6963ProviderDetail } from '@/lib/web3'
import { cn } from '@/lib/utils'

interface Props {
  open:        boolean
  wallets:     EIP6963ProviderDetail[]
  isConnecting: boolean
  onConnect:   (detail: EIP6963ProviderDetail) => void
  onClose:     () => void
}

export default function WalletModal({ open, wallets, isConnecting, onConnect, onClose }: Props) {
  // 关闭时恢复滚动
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="连接钱包"
    >
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 弹窗主体 */}
      <div className="relative glass rounded-2xl p-6 w-full max-w-sm animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-foreground text-lg">选择钱包</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground text-2xl leading-none"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {wallets.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-fg-dim text-sm">未检测到浏览器钱包</p>
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-sm inline-block px-6 py-2.5"
            >
              安装 MetaMask
            </a>
          </div>
        ) : (
          <ul className="space-y-2">
            {wallets.map((w) => (
              <li key={w.info.uuid}>
                <button
                  onClick={() => onConnect(w)}
                  disabled={isConnecting}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl text-left',
                    'glass-2 hover:bg-surface-2 transition-colors',
                    isConnecting && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={w.info.icon}
                    alt={w.info.name}
                    className="w-9 h-9 rounded-lg"
                  />
                  <span className="font-medium text-foreground text-sm">{w.info.name}</span>
                  <span className="ml-auto text-xs text-muted">{isConnecting ? '连接中…' : '→'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-center text-xs text-muted mt-5">
          连接即代表同意服务条款，请确认网络为 BSC 主网
        </p>
      </div>
    </div>
  )
}
