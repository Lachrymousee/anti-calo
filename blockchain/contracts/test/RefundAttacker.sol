// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TicketNFT} from "../TicketNFT.sol";


contract RefundAttacker {
    TicketNFT public immutable ticket;
    uint256 public reentryTokenId;
    bool public reentryAttempted;
    bool public reentrySucceeded;

    constructor(TicketNFT ticket_) {
        ticket = ticket_;
    }

    function buy(uint256 eventId, uint256 qty) external payable {
        ticket.buyTicket{value: msg.value}(eventId, qty);
    }



    function attack(uint256 tokenId, uint256 reentryTokenId_) external {
        reentryTokenId = reentryTokenId_;
        ticket.claimRefund(tokenId);
    }

    receive() external payable {
        if (reentryAttempted) return;
        reentryAttempted = true;
        try ticket.claimRefund(reentryTokenId) {
            reentrySucceeded = true;
        } catch {
            reentrySucceeded = false;
        }
    }
}
