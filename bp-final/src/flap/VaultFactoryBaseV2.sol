// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {IVaultFactory} from "./IVaultFactory.sol";
import {VaultDataSchema} from "./IVaultSchemasV1.sol";

abstract contract VaultFactoryBaseV2 is IVaultFactory {
    error UnsupportedChain(uint256 chainId);

    function vaultDataSchema() public pure virtual returns (VaultDataSchema memory schema);

    function _getVaultPortal() internal view returns (address vaultPortal) {
        uint256 chainId = block.chainid;
        if (chainId == 56) {
            return 0x90497450f2a706f1951b5bdda52B4E5d16f34C06;
        } else if (chainId == 97) {
            return 0x027e3704fC5C16522e9393d04C60A3ac5c0d775f;
        }
        revert UnsupportedChain(chainId);
    }

    function _getGuardian() internal view returns (address guardian) {
        uint256 chainId = block.chainid;
        if (chainId == 56) {
            return 0x9e27098dcD8844bcc6287a557E0b4D09C86B8a4b;
        } else if (chainId == 97) {
            return 0x76Fa8C526f8Bc27ba6958B76DeEf92a0dbE46950;
        }
        revert UnsupportedChain(chainId);
    }
}
