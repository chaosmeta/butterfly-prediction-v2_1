import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: '蝴蝶预测 | BNB 链价格涨跌竞猜',
  description: '基于 BNB Chain 的去中心化价格涨跌预测协议，支持 20 分钟 / 1 小时 / 24 小时三档投注',
  keywords: ['BNB', '预测', 'DeFi', '链上', '涨跌', 'butterfly'],
}

export const viewport: Viewport = {
  themeColor: '#050816',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="bg-background">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
