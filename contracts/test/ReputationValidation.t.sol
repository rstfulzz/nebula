// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {NebulaIdentityRegistry} from "../src/NebulaIdentityRegistry.sol";
import {NebulaReputationRegistry} from "../src/NebulaReputationRegistry.sol";
import {NebulaValidationRegistry} from "../src/NebulaValidationRegistry.sol";

contract ReputationValidationTest is Test {
    NebulaIdentityRegistry id;
    NebulaReputationRegistry rep;
    NebulaValidationRegistry val;

    address operator = address(0xA11CE);
    address agentEoa = address(0xB0B);
    address rater = address(0xCAFE);
    address validator = address(0xBEEF);
    uint256 agentId;

    function setUp() public {
        id = new NebulaIdentityRegistry();
        rep = new NebulaReputationRegistry(address(id));
        val = new NebulaValidationRegistry(address(id));
        vm.prank(operator);
        agentId = id.register("ipfs://card", agentEoa);
    }

    // ── Reputation ──
    function test_giveFeedback_and_aggregate() public {
        vm.prank(rater);
        rep.giveFeedback(agentId, 90, "trade-exec", "ipfs://fb1");
        vm.prank(address(0xD00D));
        rep.giveFeedback(agentId, 70, "accuracy", "");
        (uint256 count, uint256 avg) = rep.getReputation(agentId);
        assertEq(count, 2);
        assertEq(avg, 80);
        (address r, uint8 s, string memory tag,,) = rep.getFeedback(agentId, 0);
        assertEq(r, rater);
        assertEq(s, 90);
        assertEq(tag, "trade-exec");
    }

    function test_cannot_self_rate() public {
        vm.prank(operator);
        vm.expectRevert("cannot self-rate");
        rep.giveFeedback(agentId, 100, "", "");
    }

    function test_score_cap() public {
        vm.prank(rater);
        vm.expectRevert("score > 100");
        rep.giveFeedback(agentId, 101, "", "");
    }

    function test_feedback_unknown_agent_reverts() public {
        vm.prank(rater);
        vm.expectRevert();
        rep.giveFeedback(99, 50, "", "");
    }

    // ── Validation ──
    function test_validation_request_respond() public {
        vm.prank(rater);
        uint256 reqId = val.requestValidation(agentId, keccak256("output"), "ipfs://req");
        assertEq(reqId, 0);
        assertEq(val.totalValidations(), 1);
        vm.prank(validator);
        val.respondValidation(reqId, true, 95, "ipfs://resp");
        NebulaValidationRegistry.Validation memory v = val.getValidation(reqId);
        assertTrue(v.responded);
        assertTrue(v.passed);
        assertEq(v.score, 95);
        assertEq(v.validator, validator);
        assertEq(v.agentId, agentId);
    }

    function test_requester_cannot_validate() public {
        vm.prank(rater);
        uint256 reqId = val.requestValidation(agentId, keccak256("o"), "");
        vm.prank(rater);
        vm.expectRevert("requester cannot validate");
        val.respondValidation(reqId, true, 50, "");
    }

    function test_no_double_response() public {
        vm.prank(rater);
        uint256 reqId = val.requestValidation(agentId, keccak256("o"), "");
        vm.prank(validator);
        val.respondValidation(reqId, true, 50, "");
        vm.prank(address(0x1234));
        vm.expectRevert("already responded");
        val.respondValidation(reqId, false, 0, "");
    }

    function test_validation_unknown_agent_reverts() public {
        vm.prank(rater);
        vm.expectRevert();
        val.requestValidation(99, keccak256("o"), "");
    }
}
