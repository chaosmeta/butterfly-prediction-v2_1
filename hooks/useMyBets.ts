'use client'

import { useState, useCallback } from 'react'
import { ethers } from 'ethers'
import { getReadPrediction, getSignerPrediction } from '@/lib/web3'
import type { SlotId } from '@/lib/config'
import { SLOTS } from '@/lib/config'

export interface BetRecord {
  slot:        SlotId
  slotLabel:   string
  roundId:     bigint
  shares:      bigint    // Bet.shares（uint16）
  isUp:        boolean
  /** 是否已领奖（合约 Bet.claimed） */
  claimed:     boolean
  /** 已结算结果 */
  settled:     boolean
  upWon:       boolean | null
  voided:      boolean
  /** 可领取（settled && 赢了 && 未 void && 未 claimed） */
  claimable:   boolean
  /** 合约 getMyBet 返回的预计 BNB 收益 */
  estimatedClaim: bigint
}

export function useMyBets(
  address: string | null,
  signer: ethers.Signer | null,
  currentSlot: SlotId,
  currentRoundId: bigint | null,
) {
  const [bets, setBets] = useState<BetRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [claiming, setClaiming] = useState(false)

  const fetchBets = useCallback(async () => {
    if (!address || currentRoundId === null) return
    setLoading(true)
    try {
      const readContract = getReadPrediction()
      // getMyBet 使用 msg.sender，必须用 signer 调用
      const signerContract = signer ? getSignerPrediction(signer) : null
      const results: BetRecord[] = []

      for (let slot = 0; slot < 3; slot++) {
        // currentRoundId mapping 的 key 是 uint256
        const rid: bigint = await readContract.currentRoundId(BigInt(slot))
        const lookback = rid > 20n ? rid - 20n : 0n

        for (let id = rid; id >= lookback; id--) {
          try {
            // bets(slot, roundId, address) — 读取任意地址的下注，用 readProvider 即可
            const bet = await readContract.bets(slot, id, address)
            if (Number(bet.shares) === 0) continue

            // rounds(slot, rid) — 读取轮次结算状态
            const round = await readContract.rounds(slot, id)

            // getMyBet 需要 msg.sender，优先用 signerContract；
            // 若未连接钱包则降级用 bets + rounds 数据推断
            let isWinner = false
            let settled  = round.settled as boolean
            let estimatedClaim = 0n

            if (signerContract) {
              try {
                const myBet = await signerContract.getMyBet(slot, id)
                isWinner       = myBet.isWinner as boolean
                settled        = myBet.roundSettled as boolean
                estimatedClaim = myBet.estimatedClaim as bigint
              } catch {
                // getMyBet 失败时回退到手动推断
                const upWon = round.upWon as boolean
                isWinner = settled && (bet.isUp === upWon)
              }
            } else {
              const upWon = round.upWon as boolean
              isWinner = settled && (bet.isUp === upWon)
            }

            results.push({
              slot:           slot as SlotId,
              slotLabel:      SLOTS[slot].label,
              roundId:        id,
              shares:         BigInt(bet.shares),
              isUp:           bet.isUp as boolean,
              claimed:        bet.claimed as boolean,
              settled,
              upWon:          settled ? (round.upWon as boolean) : null,
              voided:         round.voided as boolean,
              claimable:      settled && !round.voided && isWinner && !(bet.claimed as boolean),
              estimatedClaim,
            })
          } catch {
            // 某轮不存在或查询失败时跳过
          }
        }
      }

      results.sort((a, b) => (a.roundId > b.roundId ? -1 : 1))
      setBets(results)
    } finally {
      setLoading(false)
    }
  }, [address, signer, currentRoundId])

  // 合约 claim(slot, rid) 是单轮领取，逐轮调用
  const claimRounds = useCallback(async (slot: SlotId, roundIds: bigint[]) => {
    if (!signer || roundIds.length === 0) return
    setClaiming(true)
    let lastHash = ''
    try {
      const contract = getSignerPrediction(signer)
      for (const rid of roundIds) {
        const tx = await contract.claim(slot, rid)
        await tx.wait()
        lastHash = tx.hash as string
      }
      await fetchBets()
      return lastHash
    } finally {
      setClaiming(false)
    }
  }, [signer, fetchBets])

  return { bets, loading, claiming, fetchBets, claimRounds }
}
