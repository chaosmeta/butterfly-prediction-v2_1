import { PREDICTION_ADDRESS, TOKEN_ADDRESS } from '@/lib/config'

export default function Footer() {
  return (
    <footer className="border-t border-border/30 py-10 px-4 text-center text-xs text-muted space-y-3">
      <p className="font-semibold text-fg-dim text-sm">蝴蝶预测</p>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-muted">
        <span>预测合约：
          <a
            href={`https://bscscan.com/address/${PREDICTION_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary/80 hover:text-primary transition-colors"
          >
            {PREDICTION_ADDRESS.slice(0, 10)}…
          </a>
        </span>
        <span>代币合约：
          <a
            href={`https://bscscan.com/address/${TOKEN_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary/80 hover:text-primary transition-colors"
          >
            {TOKEN_ADDRESS.slice(0, 10)}…
          </a>
        </span>
      </div>
      <p className="text-muted/60">
        基于 BNB Smart Chain · 智能合约开源 · 仅供娱乐，投资需谨慎
      </p>
    </footer>
  )
}
