// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IMarketplace} from "../IMarketplace.sol";
import {TicketNFT} from "../TicketNFT.sol";


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


    function buyPrimary(uint256 eventId, uint256 qty) external payable {
        ticket.buyTicket{value: msg.value}(eventId, qty);
    }


    function list(uint256 tokenId, uint256 price) external {
        marketplace.listTicket(tokenId, price);
    }


    function buy(uint256 tokenId) external payable {
        marketplace.buyListing{value: msg.value}(tokenId);
    }


    function withdraw() external {
        marketplace.withdrawProceeds();
    }


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
