// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ITicketNFT} from "../ITicketNFT.sol";

/// @dev TEST ONLY. Calls back into Marketplace during its transfer interaction.
contract ReentrantTicketNFT is ITicketNFT {
    address public marketplace;
    bool public callbackAttempted;
    bool public callbackSucceeded;
    bytes public callbackData;
    mapping(uint256 tokenId => address owner) private _owners;

    constructor(address initialOwner) {
        _owners[1] = initialOwner;
    }

    function setMarketplace(address marketplace_) external {
        marketplace = marketplace_;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _owners[tokenId];
    }

    function getEvent(uint256) external pure override returns (EventInfo memory) {
        revert();
    }

    function getTicket(uint256 tokenId) external view override returns (TicketInfo memory) {
        require(_owners[tokenId] != address(0));
        return TicketInfo({eventId: 1, status: TicketStatus.Valid, originalPrice: 10_000});
    }

    function getResaleCap(uint256) external pure override returns (uint256) {
        return type(uint256).max;
    }

    function isTransferable(uint256) external pure override returns (bool) {
        return true;
    }

    function transferByMarketplace(address from, address to, uint256 tokenId) external override {
        require(msg.sender == marketplace && _owners[tokenId] == from);
        _owners[tokenId] = to;
        callbackAttempted = true;
        (callbackSucceeded, callbackData) =
            marketplace.call(abi.encodeWithSignature("buyListing(uint256)", tokenId));
    }

    function receiveResaleFee(uint256) external payable override {
        require(msg.sender == marketplace);
    }
}
