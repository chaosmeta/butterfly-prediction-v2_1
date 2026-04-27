import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '蝴蝶预测 | BNB 链价格涨跌竞猜',
  description: '基于 BNB Chain 的去中心化价格涨跌预测协议，支持 20 分钟 / 1 小时 / 24 小时三档投注',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
