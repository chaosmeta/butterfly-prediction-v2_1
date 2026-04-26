// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VaultFactoryBaseV2} from "./flap/VaultFactoryBaseV2.sol";
import {VaultDataSchema, FieldDescriptor} from "./flap/IVaultSchemasV1.sol";
import {ButterflyPrediction} from "./ButterflyPrediction.sol";

/// @title ButterflyPredictionFactory
/// @notice 通过 VaultPortal 部署 ButterflyPrediction 实例
contract ButterflyPredictionFactory is VaultFactoryBaseV2 {

    function newVault(
        address taxToken,
        address /* quoteToken */,
        address creator,
        bytes calldata /* vaultData */
    )
        external
        override
        returns (address vault)
    {
        if (msg.sender != _getVaultPortal()) revert OnlyVaultPortal();
        if (taxToken == address(0) || creator == address(0)) revert ZeroAddress();

        ButterflyPrediction p = new ButterflyPrediction(taxToken, creator);
        vault = address(p);
    }

    function isQuoteTokenSupported(address quoteToken) external pure override returns (bool) {
        return quoteToken == address(0);
    }

    function vaultDataSchema() public pure override returns (VaultDataSchema memory schema) {
        schema.description = unicode"蝴蝶预测 Butterfly Prediction —— 三档涨跌预测协议（20分钟 / 1小时 / 24小时）。押 BFLY 选涨跌，输不亏代币，赢家瓜分 BNB 奖池。手续费按 Flap 推荐公式 fee = msg.value * 6 / taxRateBps（4% 税 = 1.5% fee）。无需自定义参数，vaultData 被忽略。/ Three-tier price prediction with BFLY-as-stake, lose-nothing mechanism, BNB jackpot for winners. Commission fee follows Flap recommended formula: 1.5% for a 4% tax token. No vaultData required.";
        schema.fields = new FieldDescriptor[](0);
        schema.isArray = false;
    }
}
