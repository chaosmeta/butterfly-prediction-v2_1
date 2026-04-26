// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {VaultBase} from "./VaultBase.sol";
import {VaultUISchema} from "./IVaultSchemasV1.sol";

abstract contract VaultBaseV2 is VaultBase {
    function vaultUISchema() public pure virtual returns (VaultUISchema memory schema);
}
