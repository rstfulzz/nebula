// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {NebulaReputationRegistry} from "../src/NebulaReputationRegistry.sol";
import {NebulaValidationRegistry} from "../src/NebulaValidationRegistry.sol";

/// @notice Deploy the ERC-8004 Reputation + Validation registries, bound to the
/// existing Identity Registry. The identity address comes from
/// NEBULA_IDENTITY_REGISTRY (defaults to the Mantle Sepolia deployment).
///
///   forge script contracts/script/DeployReputationValidation.s.sol:DeployReputationValidation \
///     --rpc-url mantle_testnet --broadcast --private-key $DEPLOYER_PK \
///     --legacy --with-gas-price 52000000000
///
/// After deploy, set NEBULA_REPUTATION_REGISTRY + NEBULA_VALIDATION_REGISTRY.
contract DeployReputationValidation is Script {
    function run() external returns (NebulaReputationRegistry rep, NebulaValidationRegistry val) {
        address identityRegistry = vm.envOr(
            "NEBULA_IDENTITY_REGISTRY", address(0x529ae7B0e8A8191c0307b918AA62f1Fc6557a621)
        );
        vm.startBroadcast();
        rep = new NebulaReputationRegistry(identityRegistry);
        val = new NebulaValidationRegistry(identityRegistry);
        vm.stopBroadcast();
        console2.log("Identity Registry:        ", identityRegistry);
        console2.log("NebulaReputationRegistry: ", address(rep));
        console2.log("NebulaValidationRegistry: ", address(val));
        console2.log("Chain ID:", block.chainid);
    }
}
