# Requirements: Marketplace Contract (Member 2)

**Status:** CONFIRMED (2 Nov 2026). Items tagged `[OD-Mn]` follow the accepted decisions in `design.md` §11.
**Companion of:** `.kiro/specs/ticket-nft/` (TicketNFT is CONFIRMED and is **not modified** by this spec).

## Introduction

`Marketplace` is the resale contract of the anti-calo dApp. It lets a ticket holder list a `TicketNFT` ticket at a price that does not exceed the event's resale cap, lets another wallet buy it, pays the organizer a resale fee, and lets the seller withdraw the proceeds.

`TicketNFT` disables `approve` and `transferFrom`. The only way a ticket changes hands after the primary sale is `TicketNFT.transferByMarketplace`, which only an address holding `MARKETPLACE_ROLE` can call. `TicketNFT` does **not** verify seller consent, price, or listing state, so all of that is the responsibility of this contract.

**In scope:** `blockchain/contracts/Marketplace.sol`, `blockchain/contracts/IMarketplace.sol`, `blockchain/contracts/test/ProceedsAttacker.sol`, `blockchain/test/Marketplace.test.js`, ABI export, `docs/contracts-marketplace.md`.

**Out of scope:** any change to TicketNFT, deployment scripts and `shared/deployments/`, indexer, backend, frontend, ERC-20 payments, auctions, offers/bids, on-chain listing enumeration.

## Glossary

| Term | Meaning |
|---|---|
| Seller | Address that created a listing and currently holds the ticket |
| Buyer | Address that pays for a listing and receives the ticket |
| Listing | Record `{seller, price}` stored per `tokenId` |
| Cap | `TicketNFT.getResaleCap(tokenId)` in wei (`originalPrice * resaleCapBps / 10_000`) |
| Fee | `price * feeBps / 10_000` (rounded down), paid to the event organizer through `TicketNFT.receiveResaleFee` |
| Proceeds | `price - fee`, credited to the seller in `pendingProceeds` |
| Transferable | `TicketNFT.isTransferable(tokenId)` is true (ticket exists, `Valid`, event `Active`, event not started) |
| Stale listing | A listing whose `seller` is no longer `ownerOf(tokenId)` |

## Requirements

### R1. Configuration and trust model

1. THE constructor `(address ticketNft_, uint16 feeBps_)` SHALL revert with `ZeroAddress` if `ticketNft_ == address(0)` and with `InvalidFee` if `feeBps_ > MAX_FEE_BPS`. `MAX_FEE_BPS` SHALL be `1000` (10%). Both values SHALL be stored as `immutable`. [OD-M3]
2. THE contract SHALL have no owner, admin, pause switch, upgrade path, or fee/address setter. [OD-M12]
3. THE contract SHALL be able to move tickets only after the TicketNFT `DEFAULT_ADMIN_ROLE` holder grants it `MARKETPLACE_ROLE`. THE contract SHALL NOT grant or change roles itself.
4. THE contract SHALL NOT define `receive` or `fallback`; ETH sent without calling a payable function SHALL revert.

### R2. Listing

1. WHEN `listTicket(tokenId, price)` is called, THE contract SHALL store `Listing{msg.sender, price}` and emit `Listed(tokenId, eventId, seller, price)` only if all hold, checked in this order:
   1. `price > 0`, otherwise `ZeroPrice`.
   2. `isTransferable(tokenId)`, otherwise `TicketNotTransferable(tokenId)`.
   3. `ownerOf(tokenId) == msg.sender`, otherwise `NotTicketHolder(tokenId, msg.sender)`.
   4. `price <= getResaleCap(tokenId)`, otherwise `PriceAboveCap(tokenId, price, cap)`.
   5. the existing listing for `tokenId` (if any) was not created by `msg.sender`, otherwise `AlreadyListed(tokenId)`. [OD-M7]
2. THE check order SHALL ensure a burned or non-existent token yields `TicketNotTransferable`, never an `ERC721NonexistentToken` revert from `ownerOf`.
3. ANY ticket holder (Attendee, Organizer, Gate Checker, Admin) MAY list a ticket they own. [OD-M7]
4. THE contract SHALL NOT move, lock, or require approval for the NFT when listing. [OD-M7]
5. A stale listing created by another address SHALL be overwritten by a valid new listing from the current holder.
6. THERE SHALL be at most one listing per `tokenId`; changing the price requires `cancelListing` then `listTicket`. [OD-M7]

### R3. Cancel

1. WHEN `cancelListing(tokenId)` is called by the listing's seller, THE contract SHALL delete the listing and emit `ListingCanceled(tokenId, seller)`.
2. IF no listing exists THEN `NotListed(tokenId)`; IF the caller is not the seller THEN `NotSeller(tokenId, caller)`.
3. `cancelListing` SHALL NOT call TicketNFT, so it works for used, revoked, refunded (burned), cancelled-event, ended-event tickets and after `MARKETPLACE_ROLE` is revoked. [OD-M8, OD-M12]
4. NO other party (including Organizer and Admin) SHALL be able to cancel someone else's listing.

### R4. Buy

1. WHEN `buyListing(tokenId)` is called with ETH, THE contract SHALL perform these checks in order, reverting with the stated error:
   1. listing exists, else `NotListed(tokenId)`.
   2. `msg.sender != seller`, else `CannotBuyOwnListing`.
   3. `msg.value == price`, else `IncorrectPayment(price, msg.value)`.
   4. `isTransferable(tokenId)`, else `TicketNotTransferable(tokenId)`.
   5. `ownerOf(tokenId) == seller`, else `StaleListing(tokenId)`. [OD-M9]
2. ON success THE contract SHALL, in this order (checks-effects-interactions):
   1. compute `fee = price * feeBps / 10_000` rounded down; [OD-M1, OD-M2]
   2. add `price - fee` to `pendingProceeds[seller]`;
   3. delete the listing;
   4. call `TicketNFT.transferByMarketplace(seller, msg.sender, tokenId)`;
   5. IF `fee > 0` THEN call `TicketNFT.receiveResaleFee{value: fee}(eventId)`; [OD-M5]
   6. emit `Sold(tokenId, eventId, buyer, seller, price, fee)`.
3. THE buyer SHALL pay exactly `price`; the fee is taken from `price`, so the buyer never pays above the cap. [OD-M1]
4. THE fee SHALL go only to the organizer's resale-fee balance of the ticket's event inside TicketNFT. There SHALL be no platform fee. [OD-M2]
5. THE operation SHALL be atomic: any revert from TicketNFT (for example a missing `MARKETPLACE_ROLE`) reverts the whole purchase, leaving listing and balances unchanged.
6. `buyListing` SHALL be `nonReentrant`.
7. Resale purchases SHALL NOT be limited per wallet by this contract. [OD-M10]
8. AFTER a sale THE new owner MAY list the ticket again; the cap stays based on the original ticket price.
9. THE listing-time cap check is sufficient: after the first sale `price`, `maxSupply`, and `resaleCapBps` of an event are locked in TicketNFT, so the cap of an existing ticket cannot change. THE contract SHALL NOT repeat the cap check in `buyListing`.

### R5. Proceeds withdrawal

1. WHEN `withdrawProceeds()` is called, THE contract SHALL read `pendingProceeds[msg.sender]`, revert `NoProceeds` if zero, set it to zero **before** sending, send the amount to `msg.sender` with a low-level call, revert `EthTransferFailed` on failure, and emit `ProceedsWithdrawn(seller, amount)`. [OD-M4]
2. `withdrawProceeds` SHALL be `nonReentrant`.
3. A seller that cannot receive ETH SHALL NOT be able to block any purchase; only its own withdrawal fails and its balance is preserved.
4. THE contract SHALL send ETH only in `withdrawProceeds` (to the caller) and in `buyListing` (the fee, to the fixed `ticketNft` address).
5. `withdrawProceeds` SHALL work regardless of whether the contract still holds `MARKETPLACE_ROLE`. [OD-M12]

### R6. Views

1. `getListing(tokenId)` SHALL return the stored `Listing` (all zero if none).
2. `pendingProceeds(seller)`, `ticketNft()`, `feeBps()`, and `MAX_FEE_BPS()` SHALL be public views.
3. `quoteSale(price)` SHALL return `(fee, sellerAmount)` using the same formula as `buyListing`, with no revert for any `price`.
4. THERE SHALL be no on-chain listing enumeration; clients and the indexer rebuild listing lists from events. [OD-M11]

### R7. Anti-scalping integrity

1. THE only way this contract moves a ticket SHALL be `transferByMarketplace(seller, buyer, tokenId)` inside `buyListing`, for a listing the current holder created themselves.
2. THE price paid SHALL never exceed the cap of the ticket.
3. Tickets that are not transferable SHALL never be sold.
4. THE money invariant in `design.md` §6 SHALL hold after every call.
5. KNOWN LIMITATION: resale purchases do not count toward TicketNFT's per-wallet limit, so one wallet can accumulate tickets through resale. THIS SHALL be documented as a risk. [OD-M10]

### R8. Events and errors

1. EVERY state change SHALL emit exactly one event as defined in `design.md` §8, with the `indexed` fields given there.
2. THE contract SHALL use custom errors only (no revert strings), as defined in `design.md` §7.
3. Error names that already exist in TicketNFT SHALL keep the identical signature so one merged ABI decodes both; error names with a different signature SHALL NOT be reused (hence `NoProceeds`, not `NothingToWithdraw`).

### R9. Code quality and deliverables

1. Solidity `^0.8.24` (compiled with 0.8.28 by the project), OpenZeppelin 5.6.1 with plain imports, compiling in Hardhat 2.29.1 and Remix. No new dependencies. [OD-M18]
2. `contract Marketplace is IMarketplace, ReentrancyGuard`; NatSpec on every external function, including the rounding note and the kill-switch note.
3. TESTS in `blockchain/test/Marketplace.test.js` SHALL cover every requirement above; target 100% line and branch coverage of `Marketplace.sol`.
4. THE reentrancy/rejecting-seller helper SHALL live in `blockchain/contracts/test/`.
5. `shared/abi/Marketplace.json` SHALL be generated by `npm run export-abi`. [OD-M17]
6. `docs/contracts-marketplace.md` SHALL be written in Indonesian, following `docs/contracts.md`.
7. TicketNFT source and its existing tests SHALL remain unchanged and green.
