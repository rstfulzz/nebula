// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {NebulaIdentityRegistry} from "../src/NebulaIdentityRegistry.sol";

/// @notice Deploy the ERC-8004 Identity Registry to Mantle via CREATE2 (same
/// address on testnet + mainnet given identical bytecode + salt).
///
///   # testnet (Mantle Sepolia, chain 5003)
///   forge script contracts/script/DeployIdentityRegistry.s.sol:DeployIdentityRegistry \
///     --rpc-url mantle_testnet --broadcast --private-key $DEPLOYER_PK \
///     --priority-gas-price 2000000000 --with-gas-price 2500000000
///
///   # mainnet (Mantle, chain 5000)
///   forge script contracts/script/DeployIdentityRegistry.s.sol:DeployIdentityRegistry \
///     --rpc-url mantle_mainnet --broadcast --private-key $DEPLOYER_PK \
///     --priority-gas-price 2000000000 --with-gas-price 2500000000
///
/// After deploy, set NEBULA_IDENTITY_REGISTRY=<address> in your env so the CLI
/// (`nebula identity register|show`) and the onchain `identity.*` tools target it.
contract DeployIdentityRegistry is Script {
    function run() external returns (NebulaIdentityRegistry registry) {
        vm.startBroadcast();
        registry = new NebulaIdentityRegistry();
        vm.stopBroadcast();
        console2.log("NebulaIdentityRegistry deployed at:", address(registry));
        console2.log("Chain ID:", block.chainid);
    }
}
