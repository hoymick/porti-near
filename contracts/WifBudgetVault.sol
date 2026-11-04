// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {EIP712} from '@openzeppelin/contracts/utils/cryptography/EIP712.sol';
import {SignatureChecker} from '@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

/// @notice Unaudited development vault. One owner and one budget per deployment.
/// @dev Standard non-rebasing, non-tax ERC20 only. Offchain delivery is attested.
contract WifBudgetVault is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    address public immutable owner;
    address public immutable feeRecipient;
    address public attestor;
    bool public paused;
    uint256 public available;
    uint256 public reserved;
    uint256 public spent;
    uint256 public dailyCap;
    uint256 public lifetimeCap;
    mapping(uint256 => uint256) public dayUsage;
    mapping(address => uint256) public credits;
    mapping(address => Policy) public agents;
    mapping(address => mapping(uint256 => mapping(bytes32 => bool))) public allowedServices;
    mapping(bytes32 => Service) public services;
    mapping(bytes32 => Task) public tasks;
    mapping(bytes32 => Job) public jobs;
    struct Policy { uint256 version; uint256 expiry; uint256 callCap; bool active; }
    struct Service { address signer; address payout; bool enabled; }
    struct Task { address agent; uint256 cap; uint256 used; uint256 deadline; }
    enum Status { None, Reserved, Settled, Cancelled, Expired }
    struct Job { bytes32 taskId; uint256 total; uint256 fee; uint256 day; uint256 deadline; address payout; address deliveryAttestor; Status status; }
    struct Quote { bytes32 jobId; bytes32 taskId; bytes32 serviceId; bytes32 requestDigest; address agent; address payout; uint256 agentVersion; uint256 providerAmount; uint256 platformFee; uint256 expiresAt; uint256 deliveryDeadline; }
    bytes32 public constant QUOTE_TYPEHASH = keccak256('Quote(bytes32 jobId,bytes32 taskId,bytes32 serviceId,bytes32 requestDigest,address agent,address payout,uint256 agentVersion,uint256 providerAmount,uint256 platformFee,uint256 expiresAt,uint256 deliveryDeadline)');
    bytes32 public constant DELIVERY_TYPEHASH = keccak256('Delivery(bytes32 jobId,bytes32 resultDigest,uint256 validUntil)');
    bytes32 public constant CANCELLATION_TYPEHASH = keccak256('Cancellation(bytes32 jobId,uint256 validUntil)');
    event Funded(uint256 amount);
    event Withdrawn(uint256 amount);
    event AgentPolicy(address indexed agent, uint256 version, bool active);
    event TaskAuthorized(bytes32 indexed taskId, address indexed agent, uint256 cap);
    event JobReserved(bytes32 indexed jobId, bytes32 indexed taskId, uint256 total);
    event JobFinished(bytes32 indexed jobId, Status status, bytes32 resultDigest);
    event CreditWithdrawn(address indexed recipient, uint256 amount);
    error Unauthorized(); error Invalid(); error Limit(); error Terminal(); error Expired(); error InvalidSignature();
    modifier onlyOwner() { if(msg.sender != owner) revert Unauthorized(); _; }
    constructor(address token_, address attestor_, address feeRecipient_, uint256 daily_, uint256 lifetime_) EIP712('WIF PORT','1') {
        if(token_ == address(0) || attestor_ == address(0) || feeRecipient_ == address(0) || daily_ == 0 || lifetime_ == 0) revert Invalid();
        token=IERC20(token_); owner=msg.sender; attestor=attestor_; feeRecipient=feeRecipient_; dailyCap=daily_; lifetimeCap=lifetime_;
    }
    function deposit(uint256 amount) external onlyOwner nonReentrant {
        if(amount == 0) revert Invalid(); uint256 beforeBalance=token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender,address(this),amount);
        if(token.balanceOf(address(this))-beforeBalance != amount) revert Invalid();
        available+=amount; emit Funded(amount);
    }
    function withdrawAvailable(uint256 amount) external onlyOwner nonReentrant {
        if(amount == 0 || amount > available) revert Limit(); available-=amount;
        token.safeTransfer(owner,amount); emit Withdrawn(amount);
    }
    function setLimits(uint256 daily_,uint256 lifetime_) external onlyOwner {
        if(daily_ == 0 || lifetime_ == 0) revert Invalid(); dailyCap=daily_; lifetimeCap=lifetime_;
    }
    function setPaused(bool value) external onlyOwner { paused=value; }
    function setAttestor(address value) external onlyOwner { if(value==address(0))revert Invalid(); attestor=value; }
    function setService(bytes32 id,address signer,address payout,bool enabled) external onlyOwner {
        if(signer==address(0)||payout==address(0))revert Invalid(); services[id]=Service(signer,payout,enabled);
    }
    function setAgentPolicy(address agent,uint256 expiry,uint256 callCap,bytes32[] calldata allowed) external onlyOwner {
        if(agent==address(0)||expiry<=block.timestamp||callCap==0)revert Invalid();
        Policy storage p=agents[agent]; p.version++;p.expiry=expiry;p.callCap=callCap;p.active=true;
        // Each version has its own exact allowlist; omitted services lose permission.
        for(uint256 i;i<allowed.length;i++)allowedServices[agent][p.version][allowed[i]]=true;
        emit AgentPolicy(agent,p.version,true);
    }
    function revokeAgent(address agent) external onlyOwner { agents[agent].active=false;agents[agent].version++;emit AgentPolicy(agent,agents[agent].version,false); }
    function authorizeTask(bytes32 id,address agent,uint256 cap,uint256 deadline) external onlyOwner {
        if(tasks[id].agent!=address(0)||agent==address(0)||cap==0||deadline<=block.timestamp)revert Invalid();
        tasks[id]=Task(agent,cap,0,deadline);emit TaskAuthorized(id,agent,cap);
    }
    function quoteDigest(Quote calldata q) public view returns(bytes32) { return _hashTypedDataV4(keccak256(abi.encode(QUOTE_TYPEHASH,q))); }
    function reserveJob(Quote calldata q,bytes calldata providerSignature,bytes calldata agentSignature) external nonReentrant {
        Policy memory p=agents[q.agent];Service memory service=services[q.serviceId];Task storage task=tasks[q.taskId];
        if(paused||!p.active||!service.enabled||!allowedServices[q.agent][p.version][q.serviceId]||task.agent!=q.agent)revert Unauthorized();
        if(block.timestamp>=p.expiry||block.timestamp>=q.expiresAt||block.timestamp>=task.deadline)revert Expired();
        if(jobs[q.jobId].status!=Status.None)revert Terminal();
        if(q.agentVersion!=p.version||q.payout!=service.payout||q.deliveryDeadline<=block.timestamp||q.deliveryDeadline>task.deadline)revert Invalid();
        uint256 total=q.providerAmount+q.platformFee;uint256 today=block.timestamp/1 days;
        if(total==0||q.platformFee>total*200/10000)revert Invalid();
        if(total>p.callCap||total>available||task.used+total>task.cap||dayUsage[today]+total>dailyCap||spent+reserved+total>lifetimeCap)revert Limit();
        bytes32 digest=quoteDigest(q);
        if(!SignatureChecker.isValidSignatureNow(service.signer,digest,providerSignature)||!SignatureChecker.isValidSignatureNow(q.agent,digest,agentSignature))revert InvalidSignature();
        available-=total;reserved+=total;dayUsage[today]+=total;task.used+=total;
        jobs[q.jobId]=Job(q.taskId,total,q.platformFee,today,q.deliveryDeadline,q.payout,attestor,Status.Reserved);
        emit JobReserved(q.jobId,q.taskId,total);
    }
    function settleJob(bytes32 id,bytes32 resultDigest) external nonReentrant {
        Job storage j=jobs[id];if(j.status!=Status.Reserved)revert Terminal();
        if(msg.sender!=j.deliveryAttestor)revert Unauthorized();if(block.timestamp>=j.deadline)revert Expired();
        _settle(id,resultDigest);
    }
    /// @notice Any gas-paying relayer can submit an attestor-signed delivery.
    function settleJobWithSignature(bytes32 id,bytes32 resultDigest,uint256 validUntil,bytes calldata signature) external nonReentrant {
        Job storage j=jobs[id];if(j.status!=Status.Reserved)revert Terminal();
        if(block.timestamp>=j.deadline||block.timestamp>=validUntil)revert Expired();
        bytes32 digest=_hashTypedDataV4(keccak256(abi.encode(DELIVERY_TYPEHASH,id,resultDigest,validUntil)));
        if(!SignatureChecker.isValidSignatureNow(j.deliveryAttestor,digest,signature))revert InvalidSignature();
        _settle(id,resultDigest);
    }
    function _settle(bytes32 id,bytes32 resultDigest) internal {
        Job storage j=jobs[id];
        j.status=Status.Settled;reserved-=j.total;spent+=j.total;credits[j.payout]+=j.total-j.fee;credits[feeRecipient]+=j.fee;
        emit JobFinished(id,Status.Settled,resultDigest);
    }
    function cancelJob(bytes32 id) external nonReentrant {
        Job storage j=jobs[id];if(j.status!=Status.Reserved)revert Terminal();if(msg.sender!=j.deliveryAttestor)revert Unauthorized();_release(id,Status.Cancelled);
    }
    function cancelJobWithSignature(bytes32 id,uint256 validUntil,bytes calldata signature) external nonReentrant {
        Job storage j=jobs[id];if(j.status!=Status.Reserved)revert Terminal();if(block.timestamp>=validUntil)revert Expired();
        bytes32 digest=_hashTypedDataV4(keccak256(abi.encode(CANCELLATION_TYPEHASH,id,validUntil)));
        if(!SignatureChecker.isValidSignatureNow(j.deliveryAttestor,digest,signature))revert InvalidSignature();_release(id,Status.Cancelled);
    }
    function expireJob(bytes32 id) external nonReentrant {
        Job storage j=jobs[id];if(j.status!=Status.Reserved)revert Terminal();if(block.timestamp<j.deadline)revert Invalid();_release(id,Status.Expired);
    }
    function _release(bytes32 id,Status status) internal {
        Job storage j=jobs[id];j.status=status;reserved-=j.total;available+=j.total;dayUsage[j.day]-=j.total;tasks[j.taskId].used-=j.total;emit JobFinished(id,status,bytes32(0));
    }
    function withdrawCredits() external nonReentrant {
        uint256 value=credits[msg.sender];if(value==0)revert Invalid();credits[msg.sender]=0;token.safeTransfer(msg.sender,value);emit CreditWithdrawn(msg.sender,value);
    }
    /// @notice Relayers can pay gas, but proceeds always go to the credited recipient.
    function withdrawCreditsFor(address recipient) external nonReentrant {
        uint256 value=credits[recipient];if(value==0)revert Invalid();credits[recipient]=0;token.safeTransfer(recipient,value);emit CreditWithdrawn(recipient,value);
    }
}
