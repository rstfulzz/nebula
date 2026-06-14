// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IIdentityRegistryV {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title NebulaValidationRegistry
/// @notice ERC-8004 ("Trustless Agents") Validation Registry for Mantle.
///
/// A standardized request/response surface for validators to publish
/// verification results about an agent's behavior or output. A requester
/// anchors the work being validated by its `dataHash` (+ optional URI); an
/// independent validator responds with pass/fail, a 0–100 score, and an
/// optional URI to the verification artifact. The trust mechanism itself
/// (re-execution, TEE attestation, human review, …) is left to the application,
/// per ERC-8004.
///
/// Pairs with the Identity Registry (an agentId must exist to be validated).
contract NebulaValidationRegistry {
    IIdentityRegistryV public immutable identity;

    struct Validation {
        uint256 agentId;
        address requester;
        bytes32 dataHash; // hash of the work/output under validation
        string requestUri;
        address validator; // address(0) until responded
        bool responded;
        bool passed;
        uint8 score; // 0–100
        string responseUri;
        uint64 requestedAt;
        uint64 respondedAt;
    }

    Validation[] private _validations; // requestId == index

    event ValidationRequested(
        uint256 indexed requestId,
        uint256 indexed agentId,
        address indexed requester,
        bytes32 dataHash,
        string uri
    );
    event ValidationResponded(
        uint256 indexed requestId, address indexed validator, bool passed, uint8 score, string uri
    );

    constructor(address identityRegistry) {
        identity = IIdentityRegistryV(identityRegistry);
    }

    /// @notice Open a validation request for an agent's output (`dataHash`).
    /// Reverts if `agentId` doesn't exist.
    function requestValidation(uint256 agentId, bytes32 dataHash, string calldata uri)
        external
        returns (uint256 requestId)
    {
        identity.ownerOf(agentId); // reverts if agent doesn't exist
        requestId = _validations.length;
        _validations.push(
            Validation({
                agentId: agentId,
                requester: msg.sender,
                dataHash: dataHash,
                requestUri: uri,
                validator: address(0),
                responded: false,
                passed: false,
                score: 0,
                responseUri: "",
                requestedAt: uint64(block.timestamp),
                respondedAt: 0
            })
        );
        emit ValidationRequested(requestId, agentId, msg.sender, dataHash, uri);
    }

    /// @notice A validator publishes the result. One response per request; the
    /// requester cannot validate their own request.
    function respondValidation(uint256 requestId, bool passed, uint8 score, string calldata uri)
        external
    {
        require(score <= 100, "score > 100");
        Validation storage v = _validations[requestId];
        require(v.requestedAt != 0, "unknown request");
        require(!v.responded, "already responded");
        require(msg.sender != v.requester, "requester cannot validate");
        v.validator = msg.sender;
        v.responded = true;
        v.passed = passed;
        v.score = score;
        v.responseUri = uri;
        v.respondedAt = uint64(block.timestamp);
        emit ValidationResponded(requestId, msg.sender, passed, score, uri);
    }

    function getValidation(uint256 requestId) external view returns (Validation memory) {
        return _validations[requestId];
    }

    function totalValidations() external view returns (uint256) {
        return _validations.length;
    }
}
