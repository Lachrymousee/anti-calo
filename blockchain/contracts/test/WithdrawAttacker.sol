// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TicketNFT} from "../TicketNFT.sol";
import {ITicketNFT} from "../ITicketNFT.sol";


contract WithdrawAttacker {
    TicketNFT public immutable ticket;
    uint256 public reentryEventId;
    bool public reentryAttempted;
    bool public reentrySucceeded;

    constructor(TicketNFT ticket_) {
        ticket = ticket_;
    }

    function createEvent(ITicketNFT.EventParams calldata p) external returns (uint256) {
        return ticket.createEvent(p);
    }



    function attack(uint256 eventId, uint256 reentryEventId_) external {
        reentryEventId = reentryEventId_;
        ticket.withdraw(eventId);
    }

    receive() external payable {
        if (reentryAttempted) return;
        reentryAttempted = true;
        try ticket.withdraw(reentryEventId) {
            reentrySucceeded = true;
        } catch {
            reentrySucceeded = false;
        }
    }
}
