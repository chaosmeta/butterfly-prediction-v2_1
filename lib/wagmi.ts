import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { defineChain } from 'viem'

export const bsc = defineChain({
  id: 56,
  name: 'BNB Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://shy-proportionate-butterfly.bsc.quiknode.pro/f99481698b34b4bd221c635cfccd4d06f2c26068/'],
    },
  },
  blockExplorers: {
    default: { name: 'BscScan', url: 'https://bscscan.com' },
  },
})

// ssr: true 告知 wagmi 在 SSR 阶段跳过需要浏览器 API（indexedDB 等）的初始化
export const wagmiConfig = getDefaultConfig({
  appName: '蝴蝶预测',
  projectId: 'bf1c89fe908ae4a3bfa2e47f1d99d60f',
  chains: [bsc],
  ssr: true,
})

export type WagmiConfig = typeof wagmiConfig
