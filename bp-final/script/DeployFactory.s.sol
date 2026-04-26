// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {ButterflyPredictionFactory} from "../src/ButterflyPredictionFactory.sol";

/*
   ┌───────────────────────────────────────────────────────────────────────┐
   │  Butterfly Prediction — Factory Deployment Script                     │
   │                                                                       │
   │  使用：                                                                 │
   │  PRIVATE_KEY=0x... forge script script/DeployFactory.s.sol \           │
   │      --rpc-url bsc --broadcast --verify                               │
   │                                                                       │
   │  部署完成后将 Factory 地址在 flap.sh 创建代币时填入"vault factory"字段。 │
   └───────────────────────────────────────────────────────────────────────┘
*/

contract DeployFactory is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        console.log(unicode"🦋 Deployer:", deployer);
        console.log(unicode"💰 Balance (wei):", deployer.balance);

        vm.startBroadcast(pk);

        // ButterflyPredictionLib 是 internal/private 函数库 → Foundry 自动 inline
        // 所以只需要部署 Factory 一个合约
        ButterflyPredictionFactory factory = new ButterflyPredictionFactory();

        vm.stopBroadcast();

        console.log(unicode"✓ ButterflyPredictionFactory deployed at:", address(factory));
        console.log(unicode"\n📋 Next step:");
        console.log(unicode"   1. Verify on BscScan (if --verify failed):");
        console.log(unicode"      forge verify-contract <factory_addr> ButterflyPredictionFactory --chain bsc");
        console.log(unicode"   2. Go to flap.sh and create your '蝴蝶预测' token (BFLY)");
        console.log(unicode"   3. In the vault factory field, paste:");
        console.log(unicode"      ", address(factory));
        console.log(unicode"   4. Get the deployed token & vault addresses from the receipt");
        console.log(unicode"   5. Update CONFIG in butterfly-prediction.html");
    }
}
