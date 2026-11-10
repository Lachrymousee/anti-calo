// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IMarketplace} from "../IMarketplace.sol";
import {TicketNFT} from "../TicketNFT.sol";

/// @dev TEST ONLY. Can reject proceeds or attempt to re-enter withdrawal from receive().
contract ProceedsAttacker {
    TicketNFT public immutable ticket;
    IMarketplace public immutable marketplace;
    bool public rejectEth;
    bool public reentryAttempted;
    bool public reentrySucceeded;

    constructor(TicketNFT ticket_, IMarketplace marketplace_) {
        ticket = ticket_;
        marketplace = marketplace_;
    }

    /// @notice Buys primary tickets so this contract can act as a marketplace seller.
    function buyPrimary(uint256 eventId, uint256 qty) external payable {
        ticket.buyTicket{value: msg.value}(eventId, qty);
    }

    /// @notice Creates a marketplace listing for a ticket owned by this contract.
    function list(uint256 tokenId, uint256 price) external {
        marketplace.listTicket(tokenId, price);
    }

    /// @notice Buys another seller's marketplace listing.
    function buy(uint256 tokenId) external payable {
        marketplace.buyListing{value: msg.value}(tokenId);
    }

    /// @notice Attempts to withdraw this contract's marketplace proceeds.
    function withdraw() external {
        marketplace.withdrawProceeds();
    }

    /// @notice Controls whether this contract rejects incoming ETH.
    function setRejectEth(bool reject) external {
        rejectEth = reject;
    }

    receive() external payable {
        if (rejectEth) revert();
        if (reentryAttempted) return;

        reentryAttempted = true;
        try marketplace.withdrawProceeds() {
            reentrySucceeded = true;
        } catch {}
    }
}
