import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // ethers v6 是纯 ESM，需要转译
  transpilePackages: ['ethers'],

  images: {
    // 允许 data URI 头像（EIP-6963 钱包图标）
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    remotePatterns: [],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            // ethers v6 ABI 编解码器内部使用 new Function()，必须允许 unsafe-eval
            // 否则在 enforce CSP 环境下所有合约调用会静默失败
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              // BSC RPC 节点：允许 fetch 调用链上数据（包含 QuikNode 专用节点）
              "connect-src 'self' https://*.quiknode.pro https://*.binance.org https://*.nodereal.io wss://*.binance.org",
              "img-src 'self' data: blob:",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
