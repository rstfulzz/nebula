// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {NebulaIdentityRegistry} from "../src/NebulaIdentityRegistry.sol";

contract NebulaIdentityRegistryTest is Test {
    NebulaIdentityRegistry reg;
    address operator = address(0xA11CE);
    address agentEoa = address(0xB0B);

    function setUp() public {
        reg = new NebulaIdentityRegistry();
    }

    function test_register_assigns_id_card_and_reverse_lookup() public {
        vm.prank(operator);
        uint256 id = reg.register("https://nebula.xyz/cards/1.json", agentEoa);
        assertEq(id, 1);
        assertEq(reg.totalAgents(), 1);
        assertEq(reg.ownerOf(id), operator);
        assertEq(reg.balanceOf(operator), 1);
        assertEq(reg.agentIdByAddress(agentEoa), 1);
        (address o, address a, string memory uri) = reg.resolve(id);
        assertEq(o, operator);
        assertEq(a, agentEoa);
        assertEq(uri, "https://nebula.xyz/cards/1.json");
        assertEq(reg.tokenURI(id), "https://nebula.xyz/cards/1.json");
    }

    function test_register_rejects_zero_and_duplicate_agent_address() public {
        vm.prank(operator);
        vm.expectRevert("zero agent address");
        reg.register("uri", address(0));

        vm.prank(operator);
        reg.register("uri1", agentEoa);
        vm.prank(operator);
        vm.expectRevert("agent address already registered");
        reg.register("uri2", agentEoa);
    }

    function test_setAgentCard_owner_only() public {
        vm.prank(operator);
        uint256 id = reg.register("uri1", agentEoa);

        vm.prank(operator);
        reg.setAgentCard(id, "uri2");
        assertEq(reg.tokenURI(id), "uri2");

        vm.prank(address(0xDEAD));
        vm.expectRevert("not authorized");
        reg.setAgentCard(id, "uri3");
    }

    function test_setAgentAddress_rotates_reverse_lookup() public {
        vm.prank(operator);
        uint256 id = reg.register("uri1", agentEoa);
        address newEoa = address(0xCAFE);
        vm.prank(operator);
        reg.setAgentAddress(id, newEoa);
        assertEq(reg.agentIdByAddress(newEoa), 1);
        assertEq(reg.agentIdByAddress(agentEoa), 0);
    }

    function test_transfer_moves_ownership() public {
        vm.prank(operator);
        uint256 id = reg.register("uri1", agentEoa);
        vm.prank(operator);
        reg.transferFrom(operator, address(0xCAFE), id);
        assertEq(reg.ownerOf(id), address(0xCAFE));
        assertEq(reg.balanceOf(operator), 0);
        assertEq(reg.balanceOf(address(0xCAFE)), 1);
    }

    function test_supportsInterface() public view {
        assertTrue(reg.supportsInterface(0x01ffc9a7)); // ERC-165
        assertTrue(reg.supportsInterface(0x80ac58cd)); // ERC-721
        assertTrue(reg.supportsInterface(0x5b5e139f)); // ERC-721 Metadata
        assertFalse(reg.supportsInterface(0xffffffff));
    }

    function test_resolve_unknown_reverts() public {
        vm.expectRevert("unknown agent");
        reg.resolve(99);
    }
}
