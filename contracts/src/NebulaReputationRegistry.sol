// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IIdentityRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
    function agentIdByAddress(address) external view returns (uint256);
}

/// @title NebulaReputationRegistry
/// @notice ERC-8004 ("Trustless Agents") Reputation Registry for Mantle.
///
/// Standardizes how feedback about agents is recorded on-chain: a persistent,
/// queryable history of scores + evaluations submitted by clients or other
/// agents after an interaction. Each entry carries a 0–100 score, a short tag
/// (e.g. "trade-exec", "accuracy"), and an optional URI to detailed feedback.
/// A cheap on-chain aggregate (count + running average) sits alongside the full
/// event/array history for off-chain indexing.
///
/// Pairs with the Identity Registry (an agentId must exist to be rated). Keeps
/// trust application logic off-chain, per ERC-8004.
contract NebulaReputationRegistry {
    IIdentityRegistry public immutable identity;

    struct Feedback {
        address rater;
        uint8 score; // 0–100
        string tag;
        string uri;
        uint64 timestamp;
    }

    mapping(uint256 => Feedback[]) private _feedback;
    mapping(uint256 => uint256) public feedbackCount;
    mapping(uint256 => uint256) public scoreSum;

    event FeedbackGiven(
        uint256 indexed agentId, address indexed rater, uint8 score, string tag, string uri
    );

    constructor(address identityRegistry) {
        identity = IIdentityRegistry(identityRegistry);
    }

    /// @notice Record feedback about an agent. Anyone may rate; the agent's own
    /// owner may not rate itself. Reverts if `agentId` doesn't exist.
    function giveFeedback(uint256 agentId, uint8 score, string calldata tag, string calldata uri)
        external
    {
        require(score <= 100, "score > 100");
        address owner = identity.ownerOf(agentId); // reverts if agent doesn't exist
        require(msg.sender != owner, "cannot self-rate");
        _feedback[agentId].push(Feedback(msg.sender, score, tag, uri, uint64(block.timestamp)));
        feedbackCount[agentId] += 1;
        scoreSum[agentId] += score;
        emit FeedbackGiven(agentId, msg.sender, score, tag, uri);
    }

    /// @notice Cheap aggregate: number of ratings + integer average (0 if none).
    function getReputation(uint256 agentId)
        external
        view
        returns (uint256 count, uint256 averageScore)
    {
        count = feedbackCount[agentId];
        averageScore = count == 0 ? 0 : scoreSum[agentId] / count;
    }

    /// @notice Read one feedback entry by index (full history).
    function getFeedback(uint256 agentId, uint256 index)
        external
        view
        returns (address rater, uint8 score, string memory tag, string memory uri, uint64 timestamp)
    {
        Feedback storage f = _feedback[agentId][index];
        return (f.rater, f.score, f.tag, f.uri, f.timestamp);
    }
}
