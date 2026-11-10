// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMarketplace} from "./IMarketplace.sol";
import {ITicketNFT} from "./ITicketNFT.sol";

/// @title Marketplace
/// @notice Fixed-fee ETH resale marketplace for anti-calo TicketNFT tickets.
/// @dev The contract does not escrow tickets. TicketNFT's admin must grant this contract
///      MARKETPLACE_ROLE before a sale can complete; revoking that role stops sales but does
///      not prevent sellers from cancelling listings or withdrawing proceeds.
contract Marketplace is IMarketplace, ReentrancyGuard {
    /// @notice Maximum constructor fee in basis points (10%).
    uint16 public constant override MAX_FEE_BPS = 1_000;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    /// @notice TicketNFT contract traded by this marketplace.
    address public immutable override ticketNft;
    /// @notice Immutable resale fee in basis points.
    uint16 public immutable override feeBps;

    mapping(uint256 tokenId => Listing) private _listings;
    mapping(address seller => uint256) private _pendingProceeds;

    /// @notice Deploys the marketplace with a fixed TicketNFT and resale fee.
    /// @param ticketNft_ TicketNFT contract address.
    /// @param feeBps_ Resale fee in basis points; capped at 1000 (10%).
    constructor(address ticketNft_, uint16 feeBps_) {
        if (ticketNft_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert InvalidFee();

        ticketNft = ticketNft_;
        feeBps = feeBps_;
    }

    /// @notice Creates or replaces a stale listing for a transferable ticket owned by the caller.
    /// @param tokenId Ticket to list.
    /// @param price Sale price in wei, at or below the ticket's resale cap.
    function listTicket(uint256 tokenId, uint256 price) external override {
        if (price == 0) revert ZeroPrice();

        ITicketNFT ticket = ITicketNFT(ticketNft);
        if (!ticket.isTransferable(tokenId)) revert TicketNotTransferable(tokenId);

        address owner = IERC721(ticketNft).ownerOf(tokenId);
        if (owner != msg.sender) revert NotTicketHolder(tokenId, msg.sender);

        uint256 cap = ticket.getResaleCap(tokenId);
        if (price > cap) revert PriceAboveCap(tokenId, price, cap);
        if (_listings[tokenId].seller == msg.sender) revert AlreadyListed(tokenId);

        uint256 eventId = ticket.getTicket(tokenId).eventId;
        _listings[tokenId] = Listing({seller: msg.sender, price: price});
        emit Listed(tokenId, eventId, msg.sender, price);
    }

    /// @notice Cancels the caller's listing without consulting TicketNFT.
    /// @dev Remains available after a ticket becomes non-transferable or MARKETPLACE_ROLE is revoked.
    /// @param tokenId Ticket whose listing should be cancelled.
    function cancelListing(uint256 tokenId) external override {
        address seller = _listings[tokenId].seller;
        if (seller == address(0)) revert NotListed(tokenId);
        if (seller != msg.sender) revert NotSeller(tokenId, msg.sender);

        delete _listings[tokenId];
        emit ListingCanceled(tokenId, seller);
    }

    /// @notice Buys a listed ticket for exactly its listed price.
    /// @dev The fee is rounded down to the nearest wei; all rounding remainder goes to the seller.
    ///      TicketNFT's admin can stop future sales by revoking this contract's MARKETPLACE_ROLE.
    /// @param tokenId Ticket to buy.
    function buyListing(uint256 tokenId) external payable override nonReentrant {
        Listing memory listing = _listings[tokenId];
        if (listing.seller == address(0)) revert NotListed(tokenId);
        if (msg.sender == listing.seller) revert CannotBuyOwnListing();
        if (msg.value != listing.price) revert IncorrectPayment(listing.price, msg.value);

        ITicketNFT ticket = ITicketNFT(ticketNft);
        if (!ticket.isTransferable(tokenId)) revert TicketNotTransferable(tokenId);
        if (IERC721(ticketNft).ownerOf(tokenId) != listing.seller) revert StaleListing(tokenId);

        uint256 eventId = ticket.getTicket(tokenId).eventId;
        (uint256 fee, uint256 sellerAmount) = _quoteSale(listing.price);

        _pendingProceeds[listing.seller] += sellerAmount;
        delete _listings[tokenId];

        ticket.transferByMarketplace(listing.seller, msg.sender, tokenId);
        if (fee > 0) {
            ticket.receiveResaleFee{value: fee}(eventId);
        }

        emit Sold(tokenId, eventId, msg.sender, listing.seller, listing.price, fee);
    }

    /// @notice Withdraws all proceeds credited to the caller.
    /// @dev The balance is cleared before the ETH call; a failed transfer reverts and restores it.
    function withdrawProceeds() external override nonReentrant {
        uint256 amount = _pendingProceeds[msg.sender];
        if (amount == 0) revert NoProceeds();

        _pendingProceeds[msg.sender] = 0;
        (bool success,) = payable(msg.sender).call{value: amount}("");
        if (!success) revert EthTransferFailed();

        emit ProceedsWithdrawn(msg.sender, amount);
    }

    /// @notice Returns the stored listing, or a zero-valued struct when none exists.
    /// @param tokenId Ticket to query.
    function getListing(uint256 tokenId) external view override returns (Listing memory) {
        return _listings[tokenId];
    }

    /// @notice Returns a seller's proceeds that have not yet been withdrawn.
    /// @param seller Wallet whose balance is queried.
    function pendingProceeds(address seller) external view override returns (uint256) {
        return _pendingProceeds[seller];
    }

    /// @notice Quotes the fee and seller proceeds for a sale price.
    /// @dev The calculation is decomposed to avoid intermediate overflow for any uint256 price.
    /// @param price Sale price in wei.
    /// @return fee Fee credited to the event organizer.
    /// @return sellerAmount Amount credited to the seller.
    function quoteSale(uint256 price) external view override returns (uint256 fee, uint256 sellerAmount) {
        return _quoteSale(price);
    }

    function _quoteSale(uint256 price) private view returns (uint256 fee, uint256 sellerAmount) {
        fee = (price / BPS_DENOMINATOR) * feeBps
            + ((price % BPS_DENOMINATOR) * feeBps) / BPS_DENOMINATOR;
        sellerAmount = price - fee;
    }
}
