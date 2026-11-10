// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ITicketNFT} from "./ITicketNFT.sol";


contract TicketNFT is ITicketNFT, ERC721, AccessControl, ReentrancyGuard {
    /// Role allowed to create events
    bytes32 public constant ORGANIZER_ROLE = keccak256("ORGANIZER_ROLE");
    /// Role of the marketplace contract (resale transfers and fees).
    bytes32 public constant MARKETPLACE_ROLE = keccak256("MARKETPLACE_ROLE");

    ///100% in basis points.
    uint256 public constant BPS_DENOMINATOR = 10_000;
    /// Lowest allowed resale cap (100% of the original price).
    uint16 public constant MIN_RESALE_CAP_BPS = 10_000;
    /// Highest allowed resale cap (150% of the original price).
    uint16 public constant MAX_RESALE_CAP_BPS = 15_000;
 
    uint32 public constant MAX_PER_WALLET = 10;

    // Reason codes for InvalidEventParams.
    uint8 internal constant REASON_PRICE = 1;
    uint8 internal constant REASON_SUPPLY = 2;
    uint8 internal constant REASON_MAX_PER_WALLET = 3;
    uint8 internal constant REASON_SALE_WINDOW = 4;
    uint8 internal constant REASON_EVENT_TIME = 5;
    uint8 internal constant REASON_RESALE_CAP = 6;

    uint256 private _nextEventId = 1;
    uint256 private _nextTokenId = 1;

    mapping(uint256 eventId => EventInfo) private _events;
    mapping(uint256 tokenId => TicketInfo) private _tickets;
    mapping(uint256 eventId => mapping(address account => bool)) private _gateCheckers;
    mapping(uint256 eventId => mapping(address buyer => uint256)) private _purchased;
    ///  Primary sale escrow per event (refund source, withdrawn after eventTime).
    mapping(uint256 eventId => uint256) private _revenue;
    mapping(uint256 eventId => uint256) private _resaleFees;
    mapping(uint256 tokenId => uint256) private _reservedRefund;


    /// Emitted when an organizer creates an event.
    event EventCreated(uint256 indexed eventId, address indexed organizer, EventParams params);
    /// Emitted when the organizer updates an event. `params` holds all new values.
    event EventUpdated(uint256 indexed eventId, address indexed organizer, EventParams params);
    /// Emitted when an event is canceled (soft delete).
    event EventCanceled(uint256 indexed eventId, address indexed by);
    /// Emitted on primary sale. Token IDs are firstTokenId .. firstTokenId + quantity - 1.
    event TicketPurchased(
        uint256 indexed eventId, address indexed buyer, uint256 firstTokenId, uint256 quantity, uint256 totalPaid
    );
    /// Emitted when a gate checker marks a ticket as used.
    event TicketCheckedIn(uint256 indexed tokenId, uint256 indexed eventId, address indexed checker, address holder);
    /// Emitted when the organizer or admin revokes a ticket.
    event TicketRevoked(uint256 indexed tokenId, uint256 indexed eventId, address indexed by);
    /// Emitted when a holder claims a refund (ticket is burned).
    event RefundClaimed(uint256 indexed tokenId, uint256 indexed eventId, address indexed holder, uint256 amount);
    /// Emitted when a gate checker is assigned to an event.
    event GateCheckerAssigned(uint256 indexed eventId, address indexed checker, address indexed by);
    /// Emitted when a gate checker is removed from an event.
    event GateCheckerRemoved(uint256 indexed eventId, address indexed checker, address indexed by);
    /// Emitted when the organizer withdraws an event's balance.
    event RevenueWithdrawn(uint256 indexed eventId, address indexed organizer, uint256 amount);
    /// Emitted when the marketplace sends a resale fee for an event.
    event ResaleFeeReceived(uint256 indexed eventId, address indexed marketplace, uint256 amount);


    error ZeroAddress();
    error ZeroValue();
    error EventNotFound(uint256 eventId);
    error TicketNotFound(uint256 tokenId);
    error NotEventOrganizer(uint256 eventId, address caller);
    error NotOrganizerOrAdmin(uint256 eventId, address caller);
    error NotGateChecker(uint256 eventId, address caller);
    error NotTicketHolder(uint256 tokenId, address caller);
    error InvalidEventParams(uint8 reason);
    error EventNotActive(uint256 eventId);
    error EventAlreadyStarted(uint256 eventId);
    error FieldLocked();
    error SaleNotOpen(uint256 eventId);
    error InvalidQuantity();
    error SoldOut(uint256 eventId);
    error WalletLimitExceeded(uint256 eventId, address buyer);
    error IncorrectPayment(uint256 expected, uint256 sent);
    error TicketNotValid(uint256 tokenId);
    error WrongEvent(uint256 tokenId, uint256 eventId);
    error GateCheckerAlreadyAssigned(uint256 eventId, address checker);
    error GateCheckerNotAssigned(uint256 eventId, address checker);
    error WithdrawNotAllowed(uint256 eventId);
    error NothingToWithdraw(uint256 eventId);
    error RefundNotAllowed(uint256 tokenId);
    error EthTransferFailed();
    error TransferNotAllowed();
    error TicketNotTransferable(uint256 tokenId);
    error ApprovalsDisabled();


    /// admin Address that receives DEFAULT_ADMIN_ROLE 
    constructor(address admin) ERC721("anti-calo Ticket", "ACT") {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }


    function createEvent(EventParams calldata p) external onlyRole(ORGANIZER_ROLE) returns (uint256 eventId) {
        _validateParams(p);
        if (p.saleEnd <= block.timestamp) revert InvalidEventParams(REASON_SALE_WINDOW);

        eventId = _nextEventId++;
        EventInfo storage ev = _events[eventId];
        ev.organizer = msg.sender;
        ev.status = EventStatus.Active;
        _writeParams(ev, p);

        emit EventCreated(eventId, msg.sender, p);
    }

    /// Returns the core data of an event.
    function getEvent(uint256 eventId) external view returns (EventInfo memory) {
        return _requireEvent(eventId);
    }

    /// Number of events created so far (valid IDs are 1..totalEvents()).
    function totalEvents() external view returns (uint256) {
        return _nextEventId - 1;
    }

    function updateEvent(uint256 eventId, EventParams calldata p) external {
        EventInfo storage ev = _requireEvent(eventId);
        _requireEventOrganizer(eventId, ev);
        if (ev.status != EventStatus.Active) revert EventNotActive(eventId);
        if (block.timestamp >= ev.eventTime) revert EventAlreadyStarted(eventId);
        _validateParams(p);
        if (p.maxSupply < ev.sold) revert InvalidEventParams(REASON_SUPPLY);
        if (ev.sold > 0) {
            if (
                p.ticketPrice != ev.ticketPrice || p.maxSupply != ev.maxSupply || p.resaleCapBps != ev.resaleCapBps
                    || p.eventTime < ev.eventTime
            ) revert FieldLocked();
        }

        _writeParams(ev, p);
        emit EventUpdated(eventId, msg.sender, p);
    }

    function cancelEvent(uint256 eventId) external {
        EventInfo storage ev = _requireEvent(eventId);
        _requireOrganizerOrAdmin(eventId, ev);
        if (ev.status != EventStatus.Active) revert EventNotActive(eventId);
        if (block.timestamp >= ev.eventTime) revert EventAlreadyStarted(eventId);

        ev.status = EventStatus.Canceled;
        emit EventCanceled(eventId, msg.sender);
    }

   
    function buyTicket(uint256 eventId, uint256 qty) external payable nonReentrant {
        EventInfo storage ev = _requireEvent(eventId);
        if (ev.status != EventStatus.Active) revert EventNotActive(eventId);
        if (block.timestamp < ev.saleStart || block.timestamp >= ev.saleEnd) revert SaleNotOpen(eventId);
        if (qty == 0) revert InvalidQuantity();
        uint256 bought = _purchased[eventId][msg.sender] + qty;
        if (bought > ev.maxPerWallet) revert WalletLimitExceeded(eventId, msg.sender);
        if (uint256(ev.sold) + qty > ev.maxSupply) revert SoldOut(eventId);
        uint256 price = ev.ticketPrice;
        uint256 cost = price * qty;
        if (msg.value != cost) revert IncorrectPayment(cost, msg.value);

        // Effects. qty <= maxPerWallet <= MAX_PER_WALLET, so the uint32 cast cannot truncate.
        ev.sold += uint32(qty);
        _purchased[eventId][msg.sender] = bought;
        _revenue[eventId] += cost;
        uint256 firstTokenId = _nextTokenId;
        _nextTokenId = firstTokenId + qty;

        for (uint256 i = 0; i < qty; ++i) {
            uint256 tokenId = firstTokenId + i;
            _tickets[tokenId] = TicketInfo({eventId: eventId, status: TicketStatus.Valid, originalPrice: price});
            _mint(msg.sender, tokenId);
        }

        emit TicketPurchased(eventId, msg.sender, firstTokenId, qty, cost);
    }

    function getTicket(uint256 tokenId) external view returns (TicketInfo memory) {
        return _requireTicket(tokenId);
    }

    function purchasedCount(uint256 eventId, address wallet) external view returns (uint256) {
        return _purchased[eventId][wallet];
    }

    function checkIn(uint256 eventId, uint256 tokenId) external {
        TicketInfo storage t = _requireTicket(tokenId);
        if (t.eventId != eventId) revert WrongEvent(tokenId, eventId);
        if (!_gateCheckers[eventId][msg.sender]) revert NotGateChecker(eventId, msg.sender);
        if (_events[eventId].status != EventStatus.Active) revert EventNotActive(eventId);
        if (t.status != TicketStatus.Valid) revert TicketNotValid(tokenId);

        t.status = TicketStatus.Used;
        emit TicketCheckedIn(tokenId, eventId, msg.sender, _ownerOf(tokenId));
    }

    function revokeTicket(uint256 tokenId) external {
        TicketInfo storage t = _requireTicket(tokenId);
        uint256 eventId = t.eventId;
        EventInfo storage ev = _events[eventId];
        _requireOrganizerOrAdmin(eventId, ev);
        if (ev.status != EventStatus.Active) revert EventNotActive(eventId);
        if (block.timestamp >= ev.eventTime) revert EventAlreadyStarted(eventId);
        if (t.status != TicketStatus.Valid) revert TicketNotValid(tokenId);

        t.status = TicketStatus.Revoked;
        uint256 amount = t.originalPrice;
        _revenue[eventId] -= amount;
        _reservedRefund[tokenId] = amount;
        emit TicketRevoked(tokenId, eventId, msg.sender);
    }

   
    function assignGateChecker(uint256 eventId, address checker) external {
        EventInfo storage ev = _requireEvent(eventId);
        _requireOrganizerOrAdmin(eventId, ev);
        if (ev.status != EventStatus.Active) revert EventNotActive(eventId);
        if (checker == address(0)) revert ZeroAddress();
        if (_gateCheckers[eventId][checker]) revert GateCheckerAlreadyAssigned(eventId, checker);

        _gateCheckers[eventId][checker] = true;
        emit GateCheckerAssigned(eventId, checker, msg.sender);
    }

 
    function removeGateChecker(uint256 eventId, address checker) external {
        EventInfo storage ev = _requireEvent(eventId);
        _requireOrganizerOrAdmin(eventId, ev);
        if (!_gateCheckers[eventId][checker]) revert GateCheckerNotAssigned(eventId, checker);

        _gateCheckers[eventId][checker] = false;
        emit GateCheckerRemoved(eventId, checker, msg.sender);
    }

    function isGateChecker(uint256 eventId, address account) external view returns (bool) {
        return _gateCheckers[eventId][account];
    }

    function withdraw(uint256 eventId) external nonReentrant {
        EventInfo storage ev = _requireEvent(eventId);
        if (msg.sender != ev.organizer) revert NotEventOrganizer(eventId, msg.sender);

        uint256 amount = _resaleFees[eventId];
        if (ev.status == EventStatus.Active) {
            if (block.timestamp < ev.eventTime) revert WithdrawNotAllowed(eventId);
            amount += _revenue[eventId];
            _revenue[eventId] = 0;
        }
        if (amount == 0) revert NothingToWithdraw(eventId);
        _resaleFees[eventId] = 0;

        emit RevenueWithdrawn(eventId, msg.sender, amount);
        _sendEth(msg.sender, amount);
    }

    function claimRefund(uint256 tokenId) external nonReentrant {
        TicketInfo storage t = _requireTicket(tokenId);
        if (_ownerOf(tokenId) != msg.sender) revert NotTicketHolder(tokenId, msg.sender);
        uint256 eventId = t.eventId;

        uint256 amount;
        if (t.status == TicketStatus.Revoked) {
            amount = _reservedRefund[tokenId];
            _reservedRefund[tokenId] = 0;
        } else if (_events[eventId].status == EventStatus.Canceled) {
            amount = t.originalPrice;
            _revenue[eventId] -= amount;
            t.status = TicketStatus.Revoked;
        } else {
            revert RefundNotAllowed(tokenId);
        }

        _burn(tokenId);
        emit RefundClaimed(tokenId, eventId, msg.sender, amount);
        _sendEth(msg.sender, amount);
    }

    function eventBalances(uint256 eventId) external view returns (uint256 revenue, uint256 resaleFees) {
        return (_revenue[eventId], _resaleFees[eventId]);
    }

    function transferByMarketplace(address from, address to, uint256 tokenId) external onlyRole(MARKETPLACE_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (!isTransferable(tokenId)) revert TicketNotTransferable(tokenId);
        _transfer(from, to, tokenId);
    }

    function receiveResaleFee(uint256 eventId) external payable onlyRole(MARKETPLACE_ROLE) nonReentrant {
        EventInfo storage ev = _requireEvent(eventId);
        if (ev.status != EventStatus.Active) revert EventNotActive(eventId);
        if (msg.value == 0) revert ZeroValue();

        _resaleFees[eventId] += msg.value;
        emit ResaleFeeReceived(eventId, msg.sender, msg.value);
    }

    function getResaleCap(uint256 tokenId) external view returns (uint256) {
        TicketInfo storage t = _requireTicket(tokenId);
        return (t.originalPrice * _events[t.eventId].resaleCapBps) / BPS_DENOMINATOR;
    }

    function isTransferable(uint256 tokenId) public view returns (bool) {
        if (_ownerOf(tokenId) == address(0)) return false;
        TicketInfo storage t = _tickets[tokenId];
        if (t.status != TicketStatus.Valid) return false;
        EventInfo storage ev = _events[t.eventId];
        return ev.status == EventStatus.Active && block.timestamp < ev.eventTime;
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            if (!hasRole(MARKETPLACE_ROLE, msg.sender)) revert TransferNotAllowed();
            if (!isTransferable(tokenId)) revert TicketNotTransferable(tokenId);
        }
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert ApprovalsDisabled();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert ApprovalsDisabled();
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _requireEvent(uint256 eventId) internal view returns (EventInfo storage) {
        if (eventId == 0 || eventId >= _nextEventId) revert EventNotFound(eventId);
        return _events[eventId];
    }

    function _requireTicket(uint256 tokenId) internal view returns (TicketInfo storage) {
        if (tokenId == 0 || tokenId >= _nextTokenId) revert TicketNotFound(tokenId);
        return _tickets[tokenId];
    }

    function _requireEventOrganizer(uint256 eventId, EventInfo storage ev) internal view {
        if (msg.sender != ev.organizer || !hasRole(ORGANIZER_ROLE, msg.sender)) {
            revert NotEventOrganizer(eventId, msg.sender);
        }
    }

    function _requireOrganizerOrAdmin(uint256 eventId, EventInfo storage ev) internal view {
        bool isOrganizer = msg.sender == ev.organizer && hasRole(ORGANIZER_ROLE, msg.sender);
        if (!isOrganizer && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert NotOrganizerOrAdmin(eventId, msg.sender);
        }
    }

    function _validateParams(EventParams calldata p) internal pure {
        if (p.ticketPrice == 0) revert InvalidEventParams(REASON_PRICE);
        if (p.maxSupply == 0) revert InvalidEventParams(REASON_SUPPLY);
        if (p.maxPerWallet == 0 || p.maxPerWallet > MAX_PER_WALLET || p.maxPerWallet > p.maxSupply) {
            revert InvalidEventParams(REASON_MAX_PER_WALLET);
        }
        if (p.saleStart >= p.saleEnd) revert InvalidEventParams(REASON_SALE_WINDOW);
        if (p.saleEnd > p.eventTime) revert InvalidEventParams(REASON_EVENT_TIME);
        if (p.resaleCapBps < MIN_RESALE_CAP_BPS || p.resaleCapBps > MAX_RESALE_CAP_BPS) {
            revert InvalidEventParams(REASON_RESALE_CAP);
        }
    }

    function _writeParams(EventInfo storage ev, EventParams calldata p) internal {
        ev.ticketPrice = p.ticketPrice;
        ev.maxSupply = p.maxSupply;
        ev.maxPerWallet = p.maxPerWallet;
        ev.saleStart = p.saleStart;
        ev.saleEnd = p.saleEnd;
        ev.eventTime = p.eventTime;
        ev.resaleCapBps = p.resaleCapBps;
        ev.detailsHash = p.detailsHash;
    }

    function _sendEth(address to, uint256 amount) private {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }
}
