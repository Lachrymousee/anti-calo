// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IMarketplace
/// @notice Public API, events and errors of the anti-calo resale Marketplace (Member 2).
/// @dev Spec: `.kiro/specs/marketplace/`. Integration doc: `docs/contracts-marketplace.md`.
///      The Marketplace never escrows the NFT: a listing is only a record `{seller, price}`.
///      Tickets move with `ITicketNFT.transferByMarketplace`, which needs `MARKETPLACE_ROLE`
///      granted by the TicketNFT admin. Payment is native ETH only.
///      Error names shared with TicketNFT keep the same signature so both ABIs can be merged.
interface IMarketplace {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice Active resale offer for one ticket. `seller == address(0)` means "no listing".
    struct Listing {
        address seller;
        uint256 price; // wei, always <= resale cap of the ticket at listing time
    }

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// @notice A holder offered a ticket for resale.
    event Listed(uint256 indexed tokenId, uint256 indexed eventId, address indexed seller, uint256 price);

    /// @notice A listing was cancelled by its seller.
    event ListingCanceled(uint256 indexed tokenId, address indexed seller);

    /// @notice A listing was bought. `fee` went to the organizer, `price - fee` to the seller's proceeds.
    event Sold(
        uint256 indexed tokenId,
        uint256 indexed eventId,
        address indexed buyer,
        address seller,
        uint256 price,
        uint256 fee
    );

    /// @notice A seller withdrew accumulated proceeds.
    event ProceedsWithdrawn(address indexed seller, uint256 amount);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ZeroAddress();
    error InvalidFee();
    error ZeroPrice();
    error NotTicketHolder(uint256 tokenId, address caller);
    error TicketNotTransferable(uint256 tokenId);
    error PriceAboveCap(uint256 tokenId, uint256 price, uint256 cap);
    error AlreadyListed(uint256 tokenId);
    error NotListed(uint256 tokenId);
    error NotSeller(uint256 tokenId, address caller);
    error CannotBuyOwnListing();
    error IncorrectPayment(uint256 expected, uint256 sent);
    error StaleListing(uint256 tokenId);
    error NoProceeds();
    error EthTransferFailed();

    // ---------------------------------------------------------------------
    // Configuration (read-only)
    // ---------------------------------------------------------------------

    /// @notice Address of the TicketNFT contract this marketplace trades.
    function ticketNft() external view returns (address);

    /// @notice Resale fee in basis points of the sale price (paid to the event organizer).
    function feeBps() external view returns (uint16);

    /// @notice Upper bound accepted for `feeBps` at deployment (1000 = 10%).
    function MAX_FEE_BPS() external view returns (uint16);

    // ---------------------------------------------------------------------
    // Seller actions
    // ---------------------------------------------------------------------

    /// @notice List a ticket you own for resale at `price` wei (must be > 0 and <= the ticket's resale cap).
    function listTicket(uint256 tokenId, uint256 price) external;

    /// @notice Cancel your own listing. Works even if the ticket is no longer transferable.
    function cancelListing(uint256 tokenId) external;

    /// @notice Withdraw all accumulated sale proceeds (pull payment).
    function withdrawProceeds() external;

    // ---------------------------------------------------------------------
    // Buyer action
    // ---------------------------------------------------------------------

    /// @notice Buy a listed ticket. `msg.value` must equal the listing price exactly.
    function buyListing(uint256 tokenId) external payable;

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Listing of `tokenId` (all zero if none). A listing is purchasable only while
    ///         `isTransferable(tokenId)` is true and `ownerOf(tokenId) == listing.seller`.
    function getListing(uint256 tokenId) external view returns (Listing memory);

    /// @notice Proceeds credited to `seller` and not yet withdrawn.
    function pendingProceeds(address seller) external view returns (uint256);

    /// @notice Split of a sale at `price`: `fee` for the organizer and `sellerAmount` for the seller.
    function quoteSale(uint256 price) external view returns (uint256 fee, uint256 sellerAmount);
}
