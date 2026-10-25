// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ITicketNFT
/// @notice Shared types and the functions the anti-calo Marketplace (Member 2) needs from TicketNFT.
/// @dev Ownership lookups use the standard ERC-721 interface: `IERC721(ticketNft).ownerOf(tokenId)`.
///      Approvals are disabled on TicketNFT, so the marketplace must move tickets with
///      `transferByMarketplace`, never with `transferFrom`/`safeTransferFrom`.
interface ITicketNFT {
    /// @notice Lifecycle of an event. `Canceled` is terminal (soft delete).
    enum EventStatus {
        Active,
        Canceled
    }

    /// @notice Lifecycle of a ticket.
    enum TicketStatus {
        Valid,
        Used,
        Revoked
    }

    /// @notice Core on-chain event data. Description/poster live off-chain, keyed by eventId.
    struct EventInfo {
        address organizer;
        uint64 saleStart;
        uint16 resaleCapBps;
        EventStatus status;
        uint64 saleEnd;
        uint64 eventTime;
        uint32 maxSupply;
        uint32 sold;
        uint32 maxPerWallet;
        uint256 ticketPrice;
        bytes32 detailsHash;
    }

    /// @notice Input for createEvent/updateEvent.
    struct EventParams {
        uint256 ticketPrice;
        uint32 maxSupply;
        uint32 maxPerWallet;
        uint64 saleStart;
        uint64 saleEnd;
        uint64 eventTime;
        uint16 resaleCapBps;
        bytes32 detailsHash;
    }

    /// @notice Per-ticket data. Kept after burn for history.
    struct TicketInfo {
        uint256 eventId;
        TicketStatus status;
        uint256 originalPrice;
    }

    /// @notice Returns the core data of an event. Reverts if it does not exist.
    function getEvent(uint256 eventId) external view returns (EventInfo memory);

    /// @notice Returns the data of a minted ticket. Reverts if never minted.
    function getTicket(uint256 tokenId) external view returns (TicketInfo memory);

    /// @notice Maximum allowed resale price in wei: originalPrice * resaleCapBps / 10000, rounded down.
    function getResaleCap(uint256 tokenId) external view returns (uint256);

    /// @notice True if the ticket exists, is Valid, its event is Active and has not started.
    function isTransferable(uint256 tokenId) external view returns (bool);

    /// @notice Moves a ticket for a completed resale. Only MARKETPLACE_ROLE.
    /// @dev The marketplace is responsible for the seller's consent (listing) and price cap check.
    function transferByMarketplace(address from, address to, uint256 tokenId) external;

    /// @notice Credits a resale fee (msg.value) to the event organizer's balance. Only MARKETPLACE_ROLE.
    function receiveResaleFee(uint256 eventId) external payable;
}
