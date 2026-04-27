import dynamic from 'next/dynamic'

// 整个 DApp 依赖 wagmi/RainbowKit，其 WalletConnect connector 在 SSR 阶段
// 会访问 indexedDB 等浏览器 API，必须完全跳过服务端渲染
const ButterflyApp = dynamic(() => import('@/components/ButterflyApp'), {
  ssr: false,
  loading: () => (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
      color: 'var(--color-muted)',
      fontSize: '0.9rem',
    }}>
      正在加载...
    </div>
  ),
})

export default function Home() {
  return <ButterflyApp />
}
