// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal Safe interface for module execution.
interface ISafe {
    function execTransactionFromModuleReturnData(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        returns (bool success, bytes memory returnData);
}

/// @title ScopedAgentModule
/// @notice A Safe module that lets a single `agent` key execute treasury actions
///         from a Safe, bounded by an owner-controlled allowlist of
///         (target, function-selector) pairs and a per-tx native-value cap.
///
///         This is the on-chain policy layer for the nebula treasury agent: the
///         Safe holds the funds and stays in the owner's control; the agent can
///         ONLY perform allowlisted calls, never move funds out arbitrarily, and
///         the owner can re-scope or revoke (setAgent(0) / Safe.disableModule)
///         instantly. CALL-only is enforced — delegatecall is never allowed
///         (it would let a target hijack the Safe).
///
///         DEMO-grade: keys on (target, selector) only, not arguments. Keep the
///         allowlist free of `approve` (owner pre-approves routers from the Safe)
///         so the agent can't approve an arbitrary spender. For argument-level
///         conditions (recipient/amount allowlists) use Zodiac Roles in prod.
contract ScopedAgentModule {
    ISafe public immutable safe;

    address public owner; // controls scope/agent/cap (the Safe owner EOA or the Safe itself)
    address public agent; // the session key allowed to execute; 0 = revoked
    uint256 public maxValueWei; // per-tx native-value cap

    /// keccak256(abi.encodePacked(target, selector)) => allowed
    mapping(bytes32 => bool) public allowed;

    event OwnerSet(address indexed owner);
    event AgentSet(address indexed agent);
    event MaxValueSet(uint256 maxValueWei);
    event Scoped(address indexed target, bytes4 indexed selector, bool allowed);
    event Executed(address indexed to, uint256 value, bytes4 indexed selector);

    error NotOwner();
    error NotAgent();
    error ValueOverCap();
    error NotAllowed();
    error ExecFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _safe, address _owner, address _agent, uint256 _maxValueWei) {
        safe = ISafe(_safe);
        owner = _owner;
        agent = _agent;
        maxValueWei = _maxValueWei;
        emit OwnerSet(_owner);
        emit AgentSet(_agent);
        emit MaxValueSet(_maxValueWei);
    }

    function setOwner(address a) external onlyOwner {
        owner = a;
        emit OwnerSet(a);
    }

    function setAgent(address a) external onlyOwner {
        agent = a;
        emit AgentSet(a);
    }

    function setMaxValue(uint256 v) external onlyOwner {
        maxValueWei = v;
        emit MaxValueSet(v);
    }

    function key(address target, bytes4 selector) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(target, selector));
    }

    function isAllowed(address target, bytes4 selector) external view returns (bool) {
        return allowed[key(target, selector)];
    }

    /// @notice Owner allowlists / removes a (target, selector) the agent may call.
    function scope(address target, bytes4 selector, bool ok) external onlyOwner {
        allowed[key(target, selector)] = ok;
        emit Scoped(target, selector, ok);
    }

    /// @notice Batch variant of scope().
    function scopeBatch(address[] calldata targets, bytes4[] calldata selectors, bool ok) external onlyOwner {
        require(targets.length == selectors.length, "len");
        for (uint256 i = 0; i < targets.length; i++) {
            allowed[key(targets[i], selectors[i])] = ok;
            emit Scoped(targets[i], selectors[i], ok);
        }
    }

    /// @notice The agent executes an allowlisted call FROM the Safe treasury.
    ///         CALL-only (operation 0). Reverts unless agent + within cap + the
    ///         (to, selector) pair is allowlisted.
    function exec(address to, uint256 value, bytes calldata data) external returns (bytes memory) {
        if (msg.sender != agent) revert NotAgent();
        if (value > maxValueWei) revert ValueOverCap();
        bytes4 sel = data.length >= 4 ? bytes4(data[0:4]) : bytes4(0);
        if (!allowed[key(to, sel)]) revert NotAllowed();
        (bool ok, bytes memory ret) = safe.execTransactionFromModuleReturnData(to, value, data, 0);
        if (!ok) revert ExecFailed();
        emit Executed(to, value, sel);
        return ret;
    }
}
