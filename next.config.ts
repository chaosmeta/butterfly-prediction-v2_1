import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // ethers 是纯 ESM，需要转译
  transpilePackages: ['ethers'],
  images: {
    // 允许 data URI 头像（EIP-6963 钱包图标）
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    remotePatterns: [],
  },
}

export default nextConfig
