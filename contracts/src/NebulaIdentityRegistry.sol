// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title NebulaIdentityRegistry
/// @notice ERC-8004 ("Trustless Agents") Identity Registry for Mantle.
///
/// Each agent receives a transferable ERC-721 identity token whose `tokenURI`
/// points at the agent's card — a JSON document (the A2A "agent card") carrying
/// the agent's name, description, service endpoints, operational wallet, and
/// skills. Other agents and systems discover and trust an agent by resolving
/// its identity → card, then layering reputation/validation on top.
///
/// This is the Identity Registry only; the ERC-8004 Reputation and Validation
/// registries are intentionally out of scope for this minimal deployment and
/// can be added as separate contracts later. Keeps application logic and
/// payments off-chain, per the ERC-8004 design.
///
/// Self-contained (no external library deps) so it compiles + deploys cheaply
/// on Mantle. Implements the ERC-721 + ERC-721Metadata surface needed for an
/// identity token; `safeTransferFrom` does not invoke `onERC721Received`
/// (identity tokens are expected to live in EOAs / agent-operator wallets).
contract NebulaIdentityRegistry {
    // ─── ERC-721 metadata ──────────────────────────────────────────────────
    string public constant name = "Nebula Agent Identity";
    string public constant symbol = "NEBULA-ID";

    // ─── identity storage ──────────────────────────────────────────────────
    struct Agent {
        address agentAddress; // operational EOA the agent signs + pays gas from
        string cardURI; // ERC-8004 / A2A agent card (https:// or ipfs://)
    }

    /// @notice Monotonic counter; agent ids start at 1 (0 is the "none" sentinel).
    uint256 public totalAgents;
    mapping(uint256 => Agent) private _agents;
    /// @notice Reverse lookup: agent operational address → agentId (0 = none).
    mapping(address => uint256) public agentIdByAddress;

    // ─── ERC-721 core ──────────────────────────────────────────────────────
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    // ─── events ────────────────────────────────────────────────────────────
    event AgentRegistered(
        uint256 indexed agentId, address indexed owner, address indexed agentAddress, string cardURI
    );
    event AgentCardUpdated(uint256 indexed agentId, string cardURI);
    event AgentAddressUpdated(uint256 indexed agentId, address indexed agentAddress);
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    // ─── registration ──────────────────────────────────────────────────────

    /// @notice Register a new agent identity. Mints the ERC-721 to `msg.sender`
    /// (the operator/owner) and binds the agent's operational address + card URI.
    /// @return agentId the freshly minted identity token id.
    function register(string calldata cardURI, address agentAddress)
        external
        returns (uint256 agentId)
    {
        require(agentAddress != address(0), "zero agent address");
        require(agentIdByAddress[agentAddress] == 0, "agent address already registered");
        agentId = ++totalAgents;
        _owners[agentId] = msg.sender;
        unchecked {
            _balances[msg.sender] += 1;
        }
        _agents[agentId] = Agent({agentAddress: agentAddress, cardURI: cardURI});
        agentIdByAddress[agentAddress] = agentId;
        emit Transfer(address(0), msg.sender, agentId);
        emit AgentRegistered(agentId, msg.sender, agentAddress, cardURI);
    }

    /// @notice Update the agent card URI. Owner (or approved) only.
    function setAgentCard(uint256 agentId, string calldata cardURI) external {
        require(_isOwnerOrApproved(msg.sender, agentId), "not authorized");
        _agents[agentId].cardURI = cardURI;
        emit AgentCardUpdated(agentId, cardURI);
    }

    /// @notice Rotate the agent's operational address. Owner (or approved) only.
    function setAgentAddress(uint256 agentId, address agentAddress) external {
        require(_isOwnerOrApproved(msg.sender, agentId), "not authorized");
        require(agentAddress != address(0), "zero agent address");
        require(agentIdByAddress[agentAddress] == 0, "agent address already registered");
        address prev = _agents[agentId].agentAddress;
        if (prev != address(0)) agentIdByAddress[prev] = 0;
        _agents[agentId].agentAddress = agentAddress;
        agentIdByAddress[agentAddress] = agentId;
        emit AgentAddressUpdated(agentId, agentAddress);
    }

    // ─── resolution ────────────────────────────────────────────────────────

    /// @notice Resolve an agent id to its owner, operational address, and card.
    function resolve(uint256 agentId)
        external
        view
        returns (address owner, address agentAddress, string memory cardURI)
    {
        owner = _owners[agentId];
        require(owner != address(0), "unknown agent");
        Agent storage a = _agents[agentId];
        return (owner, a.agentAddress, a.cardURI);
    }

    /// @notice ERC-721 Metadata: the token URI IS the agent card URI.
    function tokenURI(uint256 agentId) external view returns (string memory) {
        require(_owners[agentId] != address(0), "unknown agent");
        return _agents[agentId].cardURI;
    }

    // ─── ERC-721 ───────────────────────────────────────────────────────────
    function ownerOf(uint256 tokenId) public view returns (address owner) {
        owner = _owners[tokenId];
        require(owner != address(0), "unknown token");
    }

    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "zero owner");
        return _balances[owner];
    }

    function approve(address to, uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        require(msg.sender == owner || _operatorApprovals[owner][msg.sender], "not authorized");
        _tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        require(_owners[tokenId] != address(0), "unknown token");
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(_isOwnerOrApproved(msg.sender, tokenId), "not authorized");
        require(ownerOf(tokenId) == from, "from != owner");
        require(to != address(0), "zero to");
        _tokenApprovals[tokenId] = address(0);
        unchecked {
            _balances[from] -= 1;
            _balances[to] += 1;
        }
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        transferFrom(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external {
        transferFrom(from, to, tokenId);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 // ERC-165
            || id == 0x80ac58cd // ERC-721
            || id == 0x5b5e139f; // ERC-721 Metadata
    }

    // ─── internal ──────────────────────────────────────────────────────────
    function _isOwnerOrApproved(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = _owners[tokenId];
        require(owner != address(0), "unknown token");
        return spender == owner || _tokenApprovals[tokenId] == spender
            || _operatorApprovals[owner][spender];
    }
}
