// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TicketNFT} from "../TicketNFT.sol";
import {ITicketNFT} from "../ITicketNFT.sol";

/// @dev TEST ONLY. Acts as an organizer and tries to re-enter withdraw from receive().
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

    /// @param eventId Event to withdraw first.
    /// @param reentryEventId_ Event to try withdrawing again during the ETH callback.
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
