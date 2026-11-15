// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMarketplace} from "./IMarketplace.sol";
import {ITicketNFT} from "./ITicketNFT.sol";






contract Marketplace is IMarketplace, ReentrancyGuard {

    uint16 public constant override MAX_FEE_BPS = 1_000;
    uint256 private constant BPS_DENOMINATOR = 10_000;


    address public immutable override ticketNft;

    uint16 public immutable override feeBps;

    mapping(uint256 tokenId => Listing) private _listings;
    mapping(address seller => uint256) private _pendingProceeds;




    constructor(address ticketNft_, uint16 feeBps_) {
        if (ticketNft_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert InvalidFee();

        ticketNft = ticketNft_;
        feeBps = feeBps_;
    }




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




    function cancelListing(uint256 tokenId) external override {
        address seller = _listings[tokenId].seller;
        if (seller == address(0)) revert NotListed(tokenId);
        if (seller != msg.sender) revert NotSeller(tokenId, msg.sender);

        delete _listings[tokenId];
        emit ListingCanceled(tokenId, seller);
    }





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



    function withdrawProceeds() external override nonReentrant {
        uint256 amount = _pendingProceeds[msg.sender];
        if (amount == 0) revert NoProceeds();

        _pendingProceeds[msg.sender] = 0;
        (bool success,) = payable(msg.sender).call{value: amount}("");
        if (!success) revert EthTransferFailed();

        emit ProceedsWithdrawn(msg.sender, amount);
    }



    function getListing(uint256 tokenId) external view override returns (Listing memory) {
        return _listings[tokenId];
    }



    function pendingProceeds(address seller) external view override returns (uint256) {
        return _pendingProceeds[seller];
    }






    function quoteSale(uint256 price) external view override returns (uint256 fee, uint256 sellerAmount) {
        return _quoteSale(price);
    }

    function _quoteSale(uint256 price) private view returns (uint256 fee, uint256 sellerAmount) {
        fee = (price / BPS_DENOMINATOR) * feeBps
            + ((price % BPS_DENOMINATOR) * feeBps) / BPS_DENOMINATOR;
        sellerAmount = price - fee;
    }
}
