'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ethers } from 'ethers'
import {
  discoverWallets,
  switchToBSC,
  type EIP6963ProviderDetail,
} from '@/lib/web3'
import { BSC_CHAIN_ID } from '@/lib/config'

export interface WalletState {
  address: string | null
  signer: ethers.Signer | null
  chainId: number | null
  isConnecting: boolean
  isWrongChain: boolean
  tokenBalance: bigint
  /** 已发现的 EIP-6963 钱包列表 */
  wallets: EIP6963ProviderDetail[]
  /** 当前激活的 provider detail */
  activeWallet: EIP6963ProviderDetail | null
}

export interface WalletActions {
  connect: (detail: EIP6963ProviderDetail) => Promise<void>
  disconnect: () => void
  switchChain: () => Promise<void>
  refreshBalance: () => Promise<void>
}

export function useWallet(): WalletState & WalletActions {
  const [address, setAddress] = useState<string | null>(null)
  const [signer, setSigner] = useState<ethers.Signer | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n)
  const [wallets, setWallets] = useState<EIP6963ProviderDetail[]>([])
  const [activeWallet, setActiveWallet] = useState<EIP6963ProviderDetail | null>(null)

  const browserProviderRef = useRef<ethers.BrowserProvider | null>(null)

  // ── EIP-6963 发现 ────────────────────────────────────────────────
  useEffect(() => {
    const cleanup = discoverWallets((detail) => {
      setWallets((prev) => {
        if (prev.find((w) => w.info.uuid === detail.info.uuid)) return prev
        return [...prev, detail]
      })
    })
    return cleanup
  }, [])

  // ── 刷新代币余额 ─────────────────────────────────────────────────
  const refreshBalance = useCallback(async () => {
    if (!address) return
    try {
      const { getReadToken } = await import('@/lib/web3')
      const token = getReadToken()
      const bal: bigint = await token.balanceOf(address)
      setTokenBalance(bal)
    } catch {
      // 静默失败
    }
  }, [address])

  useEffect(() => {
    if (address) {
      refreshBalance()
      const id = setInterval(refreshBalance, 15_000)
      return () => clearInterval(id)
    }
  }, [address, refreshBalance])

  // ── 连接钱包 ─────────────────────────────────────────────────────
  const connect = useCallback(async (detail: EIP6963ProviderDetail) => {
    setIsConnecting(true)
    try {
      const bp = new ethers.BrowserProvider(detail.provider)
      browserProviderRef.current = bp
      await bp.send('eth_requestAccounts', [])
      const net = await bp.getNetwork()
      const cid = Number(net.chainId)
      setChainId(cid)

      if (cid !== BSC_CHAIN_ID) {
        await switchToBSC(bp)
        const net2 = await bp.getNetwork()
        setChainId(Number(net2.chainId))
      }

      const s = await bp.getSigner()
      const addr = await s.getAddress()
      setSigner(s)
      setAddress(addr)
      setActiveWallet(detail)

      // 监听账号/链切换
      const raw = detail.provider as unknown as {
        on?: (event: string, handler: (...args: unknown[]) => void) => void
      }
      if (raw.on) {
        raw.on('accountsChanged', (accounts: unknown) => {
          const accs = accounts as string[]
          if (accs.length === 0) {
            setSigner(null); setAddress(null); setChainId(null)
          } else {
            bp.getSigner().then((s2) => {
              setSigner(s2)
              setAddress(accs[0])
            })
          }
        })
        raw.on('chainChanged', (hexId: unknown) => {
          setChainId(parseInt(hexId as string, 16))
        })
      }
    } finally {
      setIsConnecting(false)
    }
  }, [])

  // ── 断开连接 ─────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    setSigner(null)
    setAddress(null)
    setChainId(null)
    setActiveWallet(null)
    setTokenBalance(0n)
    browserProviderRef.current = null
  }, [])

  // ── 切换到 BSC ───────────────────────────────────────────────────
  const switchChain = useCallback(async () => {
    const bp = browserProviderRef.current
    if (!bp) return
    await switchToBSC(bp)
    const net = await bp.getNetwork()
    setChainId(Number(net.chainId))
  }, [])

  const isWrongChain = chainId !== null && chainId !== BSC_CHAIN_ID

  return {
    address, signer, chainId, isConnecting,
    isWrongChain, tokenBalance, wallets, activeWallet,
    connect, disconnect, switchChain, refreshBalance,
  }
}
