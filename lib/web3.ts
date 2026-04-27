import { ethers } from 'ethers'
import { BSC_CHAIN_ID, BSC_RPC, BSC_CHAIN_CONFIG, PREDICTION_ADDRESS, TOKEN_ADDRESS } from './config'
import { PREDICTION_ABI, TOKEN_ABI } from './abi'

// ─── 只读 provider（公共 RPC）────────────────────────────────────
let _readProvider: ethers.JsonRpcProvider | null = null
export function getReadProvider(): ethers.JsonRpcProvider {
  if (!_readProvider) {
    _readProvider = new ethers.JsonRpcProvider(BSC_RPC, BSC_CHAIN_ID)
  }
  return _readProvider
}

export function getReadPrediction() {
  return new ethers.Contract(PREDICTION_ADDRESS, PREDICTION_ABI, getReadProvider())
}

export function getReadToken() {
  return new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, getReadProvider())
}

// ─── 写入 signer（来自注入钱包）─────────────────────────────────
export function getSignerPrediction(signer: ethers.Signer) {
  return new ethers.Contract(PREDICTION_ADDRESS, PREDICTION_ABI, signer)
}

export function getSignerToken(signer: ethers.Signer) {
  return new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer)
}

// ─── 切链到 BSC ───────────────────────────────────────────────────
export async function switchToBSC(provider: ethers.BrowserProvider): Promise<void> {
  try {
    await provider.send('wallet_switchEthereumChain', [{ chainId: BSC_CHAIN_CONFIG.chainId }])
  } catch (e: unknown) {
    const err = e as { code?: number }
    if (err.code === 4902) {
      await provider.send('wallet_addEthereumChain', [BSC_CHAIN_CONFIG])
    } else {
      throw e
    }
  }
}

// ─── EIP-6963 provider 发现 ───────────────────────────────────────
export interface EIP6963ProviderInfo {
  uuid: string
  name: string
  icon: string
  rdns: string
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo
  provider: ethers.Eip1193Provider
}

export function discoverWallets(
  onFound: (detail: EIP6963ProviderDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = (e: Event) => {
    const ev = e as CustomEvent<EIP6963ProviderDetail>
    onFound(ev.detail)
  }
  window.addEventListener('eip6963:announceProvider', handler as EventListener)
  window.dispatchEvent(new Event('eip6963:requestProvider'))

  return () => window.removeEventListener('eip6963:announceProvider', handler as EventListener)
}

// ─── Tx explorer 链接 ─────────────────────────────────────────────
export function txLink(hash: string): string {
  return `${BSC_CHAIN_CONFIG.blockExplorerUrls[0]}/tx/${hash}`
}
