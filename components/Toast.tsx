'use client'

import { useEffect } from 'react'
import { cn } from '@/lib/utils'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastData {
  id:      string
  type:    ToastType
  title:   string
  message?: string
  txHash?: string
}

interface Props {
  toasts: ToastData[]
  onDismiss: (id: string) => void
}

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
}

const BORDER: Record<ToastType, string> = {
  success: 'border-up',
  error:   'border-down',
  warning: 'border-[var(--color-warn)]',
  info:    'border-primary',
}

const TEXT: Record<ToastType, string> = {
  success: 'text-up',
  error:   'text-down',
  warning: 'text-[var(--color-warn)]',
  info:    'text-primary',
}

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 5000)
    return () => clearTimeout(t)
  }, [toast.id, onDismiss])

  return (
    <div
      className={cn(
        'toast animate-slide-up flex gap-3',
        BORDER[toast.type],
      )}
      role="alert"
    >
      <span className={cn('text-lg font-bold shrink-0 mt-0.5', TEXT[toast.type])}>
        {ICONS[toast.type]}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground text-sm">{toast.title}</p>
        {toast.message && (
          <p className="text-fg-dim text-xs mt-0.5 break-words">{toast.message}</p>
        )}
        {toast.txHash && (
          <a
            href={`https://bscscan.com/tx/${toast.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-xs underline mt-1 block"
          >
            查看交易 ↗
          </a>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-muted hover:text-foreground text-lg leading-none shrink-0"
        aria-label="关闭"
      >
        ×
      </button>
    </div>
  )
}

export default function ToastContainer({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null
  return (
    <div
      aria-live="polite"
      className="fixed bottom-8 right-8 z-[9999] flex flex-col gap-3 pointer-events-none"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  )
}
