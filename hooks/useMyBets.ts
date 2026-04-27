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
  upShares:    bigint
  downShares:  bigint
  /** 已结算结果 */
  settled:     boolean
  upWon:       boolean | null
  voided:      boolean
  /** 是否已领奖 */
  claimed:     boolean
  /** 可领取（settled && 赢了 && 未 void && 未 claimed） */
  claimable:   boolean
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
      const contract = getReadPrediction()
      const results: BetRecord[] = []

      // 查最近 20 轮
      const startId = currentRoundId > 20n ? currentRoundId - 20n : 0n

      for (let slot = 0; slot < 3; slot++) {
        let rid = await contract.currentRoundId(slot)
        const lookback = rid > 20n ? rid - 20n : 0n
        for (let id = rid; id >= lookback; id--) {
          try {
            const bet = await contract.betOf(slot, id, address)
            if (bet.upShares === 0n && bet.downShares === 0n) continue

            const round = await contract.rounds(slot, id)
            results.push({
              slot:       slot as SlotId,
              slotLabel:  SLOTS[slot].label,
              roundId:    id,
              upShares:   bet.upShares,
              downShares: bet.downShares,
              settled:    round.settled,
              upWon:      round.settled ? round.upWon : null,
              voided:     round.voided,
              claimed:    false,   // 合约暂无 claimed 映射，靠本地过滤
              claimable:  round.settled && !round.voided && (
                (round.upWon  && bet.upShares   > 0n) ||
                (!round.upWon && bet.downShares > 0n)
              ),
            })
          } catch {
            // 某轮不存在时跳过
          }
        }
        void startId // suppress unused-var
      }

      results.sort((a, b) => (a.roundId > b.roundId ? -1 : 1))
      setBets(results)
    } finally {
      setLoading(false)
    }
  }, [address, currentRoundId])

  const claimRounds = useCallback(async (slot: SlotId, roundIds: bigint[]) => {
    if (!signer || roundIds.length === 0) return
    setClaiming(true)
    try {
      const contract = getSignerPrediction(signer)
      const tx = await contract.claim(slot, roundIds)
      await tx.wait()
      await fetchBets()
      return tx.hash as string
    } finally {
      setClaiming(false)
    }
  }, [signer, fetchBets])

  return { bets, loading, claiming, fetchBets, claimRounds }
}
