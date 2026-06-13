// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISidRegistry {
    function owner(bytes32 node) external view returns (address);
    /// @dev 0G's SANN-deployed registry implements this with `void` return
    /// even though some ENS variants return bytes32. Declaring no return
    /// here avoids Solidity's abi-decoder revert on "returned no data".
    function setSubnodeRecord(
        bytes32 parentNode,
        bytes32 label,
        address newOwner,
        address resolver,
        uint64 ttl
    ) external;
    function isApprovedForAll(address owner_, address operator) external view returns (bool);
    function setApprovalForAll(address operator, bool approved) external;
}

/// @notice Permissionless registrar for `<label>.nebula.0g` subnames under the
/// `nebula.0g` parent on 0G mainnet. Any EOA can call `claim` once per unique
/// label. Contract has no admin; dev.deployer's only one-time involvement is
/// `SidRegistry.setApprovalForAll(registrar, true)` so this contract can call
/// `setSubnodeRecord` on behalf of nebula.0g's registry ownership.
///
/// @dev Trust boundary: the `registry` address passed at construction is the
/// canonical SANN SidRegistry, an audited trusted party. If a malicious
/// registry were supplied, the `owner(subnameNode)` pre-check could be
/// spoofed; since we only accept the canonical address (asserted at deploy
/// time via `registry.owner(NEBULA_NODE) == nebulaOwner_`), this is out of scope.
contract NebulaSubnameRegistrar {
    /// @dev SANN namehash for `nebula.0g`, precomputed:
    ///   keccak256(abi.encode(
    ///     keccak256(abi.encode(
    ///       keccak256(abi.encode(bytes32(0), bytes32(TLD_IDENTIFIER))),
    ///       keccak256("0g"))),
    ///     keccak256("nebula")))
    bytes32 public constant NEBULA_NODE =
        0xb8a6c74b0b09d90544912d761c6c285b8d1e4336f3cdd13cfa35469b943ff182;

    ISidRegistry public immutable registry;
    address public immutable defaultResolver;
    address public immutable nebulaOwner;

    event SubnameClaimed(
        string label, bytes32 indexed subnameNode, address indexed owner, address indexed claimer
    );

    error EmptyLabel();
    error LabelTooLong();
    error LabelAlreadyTaken();
    error NebulaOwnerMismatch();

    /// @param registry_ SidRegistry address (0x5dC881dDA4e4a8d312be3544AD13118D1a04Cb17 on 0G mainnet).
    /// @param resolver_ PublicResolver address (0x6D3B3F99177FB2A5de7F9E928a9BD807bF7b5BAD on 0G mainnet).
    /// @param nebulaOwner_ Registry owner of nebula.0g (must pre-approve this contract).
    /// @dev Asserts at construction that the supplied `nebulaOwner_` matches
    /// `registry.owner(NEBULA_NODE)`. Catches namehash typos AND wrong-chain
    /// deploys in a single revert.
    constructor(address registry_, address resolver_, address nebulaOwner_) {
        if (ISidRegistry(registry_).owner(NEBULA_NODE) != nebulaOwner_) revert NebulaOwnerMismatch();
        registry = ISidRegistry(registry_);
        defaultResolver = resolver_;
        nebulaOwner = nebulaOwner_;
    }

    /// @notice Register `<label>.nebula.0g` to `owner`. Reverts if label is
    /// empty, too long, or already taken. Sets PublicResolver as resolver.
    /// After this call, `owner` can write text records via the resolver.
    function claim(string calldata label, address owner_) external returns (bytes32 subnameNode) {
        bytes memory labelBytes = bytes(label);
        if (labelBytes.length == 0) revert EmptyLabel();
        if (labelBytes.length > 63) revert LabelTooLong();

        bytes32 labelHash = keccak256(labelBytes);
        subnameNode = keccak256(abi.encode(NEBULA_NODE, labelHash));
        if (registry.owner(subnameNode) != address(0)) revert LabelAlreadyTaken();

        registry.setSubnodeRecord(NEBULA_NODE, labelHash, owner_, defaultResolver, 0);
        emit SubnameClaimed(label, subnameNode, owner_, msg.sender);
    }

    /// @notice Convenience view: is this registrar approved by the CURRENT
    /// nebula.0g registry owner to write subnames? Re-reads the parent owner
    /// dynamically so an nebula.0g transfer correctly flips this false until
    /// the new owner re-approves.
    function isOperational() external view returns (bool) {
        address currentOwner = registry.owner(NEBULA_NODE);
        return currentOwner != address(0) && registry.isApprovedForAll(currentOwner, address(this));
    }
}
