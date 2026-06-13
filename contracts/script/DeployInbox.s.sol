// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {NebulaInbox} from "../src/NebulaInbox.sol";

/// @notice Deploy NebulaInbox via CREATE2. Same address on testnet + mainnet
/// (assuming nonce-free CREATE2 + identical bytecode).
///
///   forge script contracts/script/DeployInbox.s.sol:DeployInbox \
///     --rpc-url og_testnet --broadcast --private-key $DEV_DEPLOYER_PK \
///     --priority-gas-price 2000000000 --with-gas-price 2500000000
///
///   forge script contracts/script/DeployInbox.s.sol:DeployInbox \
///     --rpc-url og_mainnet --broadcast --private-key $DEV_DEPLOYER_PK \
///     --priority-gas-price 2000000000 --with-gas-price 2500000000
contract DeployInbox is Script {
    bytes32 public constant SALT = keccak256("nebula:NebulaInbox:v1");

    function run() external returns (NebulaInbox inbox) {
        vm.startBroadcast();
        inbox = new NebulaInbox{salt: SALT}();
        vm.stopBroadcast();
        console2.log("NebulaInbox deployed at:", address(inbox));
        console2.log("Salt:", vm.toString(SALT));
        console2.log("Chain ID:", block.chainid);
    }
}
