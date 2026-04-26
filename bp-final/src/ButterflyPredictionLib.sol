// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {
    VaultUISchema,
    VaultMethodSchema,
    FieldDescriptor,
    ApproveAction
} from "./flap/IVaultSchemasV1.sol";

interface IPancakePair {
    function getReserves() external view returns (uint112, uint112, uint32);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function price0CumulativeLast() external view returns (uint256);
    function price1CumulativeLast() external view returns (uint256);
}

interface IFlapTaxToken {
    function mainPool() external view returns (address);
}

interface IFlapPortalQuoter {
    struct QuoteExactInputParams {
        address inputToken;
        address outputToken;
        uint256 inputAmount;
    }
    function quoteExactInput(QuoteExactInputParams calldata params) external returns (uint256);
}

/// @title ButterflyPredictionLib
/// @notice 价格读取（Portal + LP TWAP）+ UI schema 构建
library ButterflyPredictionLib {

    /// @dev 读取当前瞬时价 + LP price cumulative + 该池 reserves 的 timestamp
    /// 累积值会被推进到当前区块时间（按 Uniswap V2 oracle 标准）
    /// @return spotPrice 当前瞬时价（BNB per token, scaled 1e18）
    /// @return cumPrice  价格累积值（已推进到当前区块）
    /// @return cumTimestamp 推进后的时间戳（= block.timestamp 截断到 uint32）
    function readPriceWithCumulative(address token, address portal) public view returns (
        uint256 spotPrice,
        uint256 cumPrice,
        uint32 cumTimestamp
    ) {
        // 优先用 FLAP Portal Oracle 取瞬时价
        spotPrice = _queryPortal(token, portal);

        // 不论 spot 是否拿到，都尝试读 LP cumulative 用于 TWAP
        address pool = _getPool(token);
        if (pool == address(0)) return (spotPrice, 0, 0);

        (uint112 r0, uint112 r1, uint32 lastTs) = _safeGetReserves(pool);
        uint256 rawCum = _readPriceCumulative(pool, token);

        // 当前 spot price 用 reserves 算（避免 portal 不可用）
        bool tokenIsT0;
        uint256 reserveToken;
        uint256 reserveBnb;
        try IPancakePair(pool).token0() returns (address t0) {
            tokenIsT0 = (t0 == token);
        } catch {
            return (spotPrice, 0, 0);
        }
        reserveToken = tokenIsT0 ? uint256(r0) : uint256(r1);
        reserveBnb = tokenIsT0 ? uint256(r1) : uint256(r0);

        // 如果 spot 没拿到，从 LP 储备直接算
        if (spotPrice == 0 && reserveToken > 0) {
            spotPrice = (reserveBnb * 1e18) / reserveToken;
        }

        // 把累积值推进到当前区块（Uniswap V2 oracle 标准做法）
        // priceQ = reserveBnb * 2^112 / reserveToken (UQ112.112)
        cumTimestamp = uint32(block.timestamp);
        cumPrice = rawCum;
        if (lastTs != 0 && cumTimestamp > lastTs && reserveToken > 0) {
            // priceQ = (reserveBnb << 112) / reserveToken
            uint256 priceQ = (reserveBnb << 112) / reserveToken;
            cumPrice = rawCum + priceQ * uint256(cumTimestamp - lastTs);
        }
    }

    /// @dev 在两个时间点之间计算 TWAP 价格
    /// @param token 代币地址
    /// @param portal Flap Portal 地址（fallback 用，TWAP 主要靠 LP）
    /// @param openCum 开盘累积值（已推进到 openTs）
    /// @param openTs 开盘时间戳
    /// @param nowTs 当前区块时间戳
    /// @return twapPrice TWAP 价（BNB per token, scaled 1e18）；返回 0 表示 TWAP 不可用
    function computeTwapBetween(
        address token,
        address portal,
        uint256 openCum,
        uint32 openTs,
        uint32 nowTs
    ) public view returns (uint256 twapPrice) {
        if (nowTs <= openTs) return 0;
        uint32 elapsed = nowTs - openTs;
        if (elapsed < 60) return 0; // 至少 60 秒老化

        // 读取并把累积推进到 nowTs
        (, uint256 cumNow, ) = readPriceWithCumulative(token, portal);
        if (cumNow == 0 || cumNow <= openCum) return 0;

        // UQ112.112: avgPriceQ = (cumNow - openCum) / elapsed; price = avgPriceQ * 1e18 / 2^112
        uint256 avgQ = (cumNow - openCum) / uint256(elapsed);
        twapPrice = (avgQ * 1e18) >> 112;

        // Sanity check: portal 价 fallback 防止 TWAP 异常
        if (twapPrice == 0 && portal != address(0)) {
            twapPrice = _queryPortal(token, portal);
        }
    }

    function _queryPortal(address token, address portal) private view returns (uint256) {
        if (portal == address(0)) return 0;
        IFlapPortalQuoter.QuoteExactInputParams memory params = IFlapPortalQuoter.QuoteExactInputParams({
            inputToken: token,
            outputToken: address(0),
            inputAmount: 1e18
        });
        bytes memory payload = abi.encodeWithSelector(IFlapPortalQuoter.quoteExactInput.selector, params);
        (bool ok, bytes memory ret) = portal.staticcall(payload);
        if (!ok || ret.length < 32) return 0;
        return abi.decode(ret, (uint256));
    }

    function _getPool(address token) private view returns (address) {
        try IFlapTaxToken(token).mainPool() returns (address mp) {
            return mp;
        } catch {
            return address(0);
        }
    }

    function _safeGetReserves(address pool) private view returns (uint112, uint112, uint32) {
        try IPancakePair(pool).getReserves() returns (uint112 r0, uint112 r1, uint32 ts) {
            return (r0, r1, ts);
        } catch {
            return (0, 0, 0);
        }
    }

    function _readPriceCumulative(address pool, address token) private view returns (uint256) {
        try IPancakePair(pool).token0() returns (address t0) {
            if (t0 == token) {
                try IPancakePair(pool).price0CumulativeLast() returns (uint256 p) { return p; } catch { return 0; }
            } else {
                try IPancakePair(pool).price1CumulativeLast() returns (uint256 p) { return p; } catch { return 0; }
            }
        } catch {
            return 0;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //                          Description
    // ═══════════════════════════════════════════════════════════════════

    function buildDescription(uint256 reservePool, uint256 totalBurned) external pure returns (string memory) {
        reservePool; totalBurned;
        return unicode"蝴蝶预测 Butterfly Prediction —— 三档涨跌预测协议（20分钟 / 1小时 / 24小时）。押 BFLY 选涨跌，输不亏代币（原数返还），赢家瓜分 BNB 奖池。1 份 = 50万 BFLY，单笔 1-20 份。手续费结构按 Flap 推荐公式：fee = msg.value * 6 / taxRateBps（4% 税率代币 = 1.5% 手续费）。/ Three-tier price prediction (20m / 1h / 24h). Bet BFLY on up/down — lose nothing (tokens fully refunded), winners share the BNB jackpot. Commission fee follows Flap recommended formula: fee = msg.value * 6 / taxRateBps (1.5% for a 4% tax token).";
    }

    // ═══════════════════════════════════════════════════════════════════
    //                          UI Schema
    // ═══════════════════════════════════════════════════════════════════

    function buildUISchema(VaultUISchema memory schema) external pure returns (VaultUISchema memory) {
        schema.vaultType = "ButterflyPrediction";
        schema.description = unicode"蝴蝶预测：三档涨跌（20分钟/1小时/24小时），押 BFLY 选涨跌，输了代币原数返还，赢家瓜分 BNB 奖池。/ Bet on price up/down across 3 time slots — lose nothing, winners take all.";

        VaultMethodSchema[] memory methods = new VaultMethodSchema[](7);

        // ─── 0. placeBet ───
        methods[0].name = "placeBet";
        methods[0].description = unicode"🦋 投注：slot 0=20分钟 / 1=1小时 / 2=24小时；isUp true=押涨 false=押跌；shares=份数(1-20)";
        FieldDescriptor[] memory placeIns = new FieldDescriptor[](3);
        placeIns[0] = FieldDescriptor("slot", "uint256", unicode"档位 (0/1/2 = 20分/1时/24时)", 0);
        placeIns[1] = FieldDescriptor("isUp", "bool", unicode"是否押涨", 0);
        placeIns[2] = FieldDescriptor("shares", "uint256", unicode"份数 (1-20)", 0);
        methods[0].inputs = placeIns;
        ApproveAction[] memory aps = new ApproveAction[](1);
        aps[0] = ApproveAction({tokenType: "taxToken", amountFieldName: "shares"});
        // 注：实际授权金额 = shares × sharePrice，前端需要相应处理；这里把 shares 名字传过去做提示
        methods[0].approvals = aps;
        methods[0].isWriteMethod = true;

        // ─── 1. claim ───
        methods[1].name = "claim";
        methods[1].description = unicode"🏆 领取代币 + 奖金（一次一轮）";
        FieldDescriptor[] memory claimIns = new FieldDescriptor[](2);
        claimIns[0] = FieldDescriptor("slot", "uint256", unicode"档位", 0);
        claimIns[1] = FieldDescriptor("rid", "uint256", unicode"轮次 ID", 0);
        methods[1].inputs = claimIns;
        methods[1].isWriteMethod = true;

        // ─── 2. settle (任何人触发结算) ───
        methods[2].name = "settle";
        methods[2].description = unicode"⚡ 触发结算（自动会触发，仅备用）";
        FieldDescriptor[] memory setIns = new FieldDescriptor[](1);
        setIns[0] = FieldDescriptor("slot", "uint256", unicode"档位", 0);
        methods[2].inputs = setIns;
        methods[2].isWriteMethod = true;

        // ─── 3. getCurrentRound ───
        methods[3].name = "getCurrentRound";
        methods[3].description = unicode"📊 当前轮次状态";
        FieldDescriptor[] memory rdIns = new FieldDescriptor[](1);
        rdIns[0] = FieldDescriptor("slot", "uint256", unicode"档位", 0);
        methods[3].inputs = rdIns;
        FieldDescriptor[] memory rdOuts = new FieldDescriptor[](11);
        rdOuts[0] = FieldDescriptor("roundId", "uint256", unicode"轮次 ID", 0);
        rdOuts[1] = FieldDescriptor("startTime", "time", unicode"开盘时间", 0);
        rdOuts[2] = FieldDescriptor("endTime", "time", unicode"结算时间", 0);
        rdOuts[3] = FieldDescriptor("openPrice", "uint256", unicode"开盘价", 18);
        rdOuts[4] = FieldDescriptor("currentPrice", "uint256", unicode"当前价", 18);
        rdOuts[5] = FieldDescriptor("totalUpShares", "uint256", unicode"押涨总份数", 0);
        rdOuts[6] = FieldDescriptor("totalDownShares", "uint256", unicode"押跌总份数", 0);
        rdOuts[7] = FieldDescriptor("bnbPool", "uint256", unicode"奖池 BNB", 18);
        rdOuts[8] = FieldDescriptor("sharePriceLocked", "uint256", unicode"该轮份额大小", 18);
        rdOuts[9] = FieldDescriptor("secondsLeft", "uint256", unicode"剩余秒数", 0);
        rdOuts[10] = FieldDescriptor("bettingOpen", "bool", unicode"投注开放", 0);
        methods[3].outputs = rdOuts;

        // ─── 4. previewPayout ───
        methods[4].name = "previewPayout";
        methods[4].description = unicode"🔮 假设投注后能赢多少 BNB（按当前奖池估算）";
        FieldDescriptor[] memory prIns = new FieldDescriptor[](3);
        prIns[0] = FieldDescriptor("slot", "uint256", unicode"档位", 0);
        prIns[1] = FieldDescriptor("isUp", "bool", unicode"是否押涨", 0);
        prIns[2] = FieldDescriptor("shares", "uint256", unicode"份数", 0);
        methods[4].inputs = prIns;
        FieldDescriptor[] memory prOuts = new FieldDescriptor[](1);
        prOuts[0] = FieldDescriptor("estimatedBnb", "uint256", unicode"预期 BNB", 18);
        methods[4].outputs = prOuts;

        // ─── 5. getMyBet ───
        methods[5].name = "getMyBet";
        methods[5].description = unicode"📜 我在某轮的下注情况";
        FieldDescriptor[] memory myIns = new FieldDescriptor[](2);
        myIns[0] = FieldDescriptor("slot", "uint256", unicode"档位", 0);
        myIns[1] = FieldDescriptor("rid", "uint256", unicode"轮次 ID", 0);
        methods[5].inputs = myIns;
        FieldDescriptor[] memory myOuts = new FieldDescriptor[](6);
        myOuts[0] = FieldDescriptor("shares", "uint256", unicode"份数", 0);
        myOuts[1] = FieldDescriptor("isUp", "bool", unicode"押涨方向", 0);
        myOuts[2] = FieldDescriptor("claimed", "bool", unicode"已领取", 0);
        myOuts[3] = FieldDescriptor("isWinner", "bool", unicode"是否赢", 0);
        myOuts[4] = FieldDescriptor("roundSettled", "bool", unicode"轮次是否结算", 0);
        myOuts[5] = FieldDescriptor("estimatedClaim", "uint256", unicode"可领 BNB", 18);
        methods[5].outputs = myOuts;

        // ─── 6. getProtocolStats ───
        methods[6].name = "getProtocolStats";
        methods[6].description = unicode"📈 协议总体数据";
        FieldDescriptor[] memory stOuts = new FieldDescriptor[](6);
        stOuts[0] = FieldDescriptor("reservePool", "uint256", unicode"储备池 BNB", 18);
        stOuts[1] = FieldDescriptor("totalBurned", "uint256", unicode"累计销毁代币", 18);
        stOuts[2] = FieldDescriptor("totalWinnerPaid", "uint256", unicode"累计胜方奖金 BNB", 18);
        stOuts[3] = FieldDescriptor("totalInflow", "uint256", unicode"累计流入 BNB", 18);
        stOuts[4] = FieldDescriptor("vaultBnbBalance", "uint256", unicode"合约总 BNB", 18);
        stOuts[5] = FieldDescriptor("currentSharePrice", "uint256", unicode"当前份额大小", 18);
        methods[6].outputs = stOuts;

        schema.methods = methods;
        return schema;
    }
}
