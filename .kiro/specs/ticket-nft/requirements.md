# Requirements: TicketNFT Contract (Member 1)

Status: CONFIRMED (25 Oct 2026). Items tagged `[OD-n]` follow the accepted defaults in `design.md` §11.

## Introduction

`TicketNFT` is the core contract of the anti-calo dApp. It stores the core event data, mints ERC-721 tickets on primary sale, restricts transfers to the marketplace contract (Member 2), handles check-in by per-event Gate Checkers, and holds sale money in escrow using pull payments. Event descriptions, posters and profiles live off-chain (Members 3/6), keyed by `eventId`.

Scope: `blockchain/contracts/TicketNFT.sol`, `blockchain/contracts/ITicketNFT.sol`, tests, ABI export, `docs/contracts.md`. Out of scope: marketplace listing logic, deployment scripts, SIWE, backend, indexer, frontend.

## Glossary

- Admin: holder of `DEFAULT_ADMIN_ROLE`.
- Organizer: holder of `ORGANIZER_ROLE`. "Event organizer" means the address stored in `EventInfo.organizer`.
- Gate Checker: address assigned to a specific event in `_gateCheckers[eventId]`.
- Marketplace: contract holding `MARKETPLACE_ROLE`.
- Holder: current `ownerOf(tokenId)`.
- bps: basis points, 10000 = 100%.

## Requirement 1: Roles and access control

User story: As the Admin, I want to control who can organize events and which contract is the marketplace, so that only trusted parties can create events or move tickets.

1. The contract SHALL grant `DEFAULT_ADMIN_ROLE` to a non-zero `admin` address passed to the constructor.
2. WHEN the Admin calls `grantRole`/`revokeRole` for `ORGANIZER_ROLE` or `MARKETPLACE_ROLE`, THE contract SHALL update the role and emit the OpenZeppelin `RoleGranted`/`RoleRevoked` event.
3. IF a non-Admin calls `grantRole`/`revokeRole`, THEN the contract SHALL revert.
4. Every state-changing external function SHALL enforce an explicit caller check, listed in `docs/contracts.md`.
5. The contract SHALL NOT use `tx.origin` for authorization.

## Requirement 2: Event CRUD (on-chain)

User story: As an Organizer, I want to create, view, update and cancel my events on-chain, so that the core sale rules are public and tamper-resistant.

1. WHEN an Organizer calls `createEvent` with valid parameters, THE contract SHALL store a new `EventInfo` with `organizer = msg.sender`, `sold = 0`, `status = Active`, assign the next sequential `eventId` (starting at 1), and emit `EventCreated`.
2. IF `createEvent` parameters are invalid (see design §4.1), THEN the contract SHALL revert with a specific custom error.
3. WHEN anyone calls `getEvent(eventId)` for an existing event, THE contract SHALL return the full `EventInfo`. IF the event does not exist, THEN it SHALL revert `EventNotFound`.
4. WHEN the event organizer calls `updateEvent` on an Active event before `eventTime`, THE contract SHALL apply the new values and emit `EventUpdated`.
5. IF anyone other than the event organizer calls `updateEvent` (including other Organizers and the Admin), THEN the contract SHALL revert `NotEventOrganizer`.
6. WHILE `sold > 0`, IF `updateEvent` changes `ticketPrice`, `maxSupply` or `resaleCapBps`, THEN the contract SHALL revert `FieldLocked`.
7. WHILE `sold > 0`, IF `updateEvent` sets an `eventTime` earlier than the current one, THEN the contract SHALL revert `FieldLocked`. [OD-10]
8. WHEN the event organizer or Admin calls `cancelEvent` on an Active event before `eventTime`, THE contract SHALL set `status = Canceled` (soft delete, data stays readable) and emit `EventCanceled`. [OD-5]
9. A Canceled event SHALL NOT be updated, re-activated, sold, or checked in.

## Requirement 3: Primary sale

User story: As a Buyer, I want to buy tickets directly from the organizer at the fixed price, so that I get a valid NFT ticket without scalper markup.

1. WHEN a Buyer calls `buyTicket(eventId, qty)` with `msg.value == ticketPrice * qty` inside the sale window, THE contract SHALL mint `qty` sequential tokens to the Buyer, store `TicketInfo{eventId, Valid, ticketPrice}` per token, increase `sold` and the Buyer's purchase count, credit the event escrow, and emit `TicketPurchased`.
2. IF `block.timestamp < saleStart` or `block.timestamp >= saleEnd`, THEN revert `SaleNotOpen`.
3. IF `sold + qty > maxSupply`, THEN revert `SoldOut`.
4. IF the Buyer's purchased count for the event plus `qty` exceeds `maxPerWallet`, THEN revert `WalletLimitExceeded`. Only primary purchases are counted. [OD-9]
5. IF `msg.value != ticketPrice * qty`, THEN revert `IncorrectPayment` (no overpayment kept, no change returned).
6. IF `qty == 0` or the event is not Active, THEN revert with the matching error.
7. The number of loop iterations in `buyTicket` SHALL be bounded by the constant `MAX_PER_WALLET`.

## Requirement 4: Ticket view, check-in and revoke

User story: As a Gate Checker, I want to mark a ticket as used exactly once, so that one ticket admits one person to the right event.

1. WHEN anyone calls `getTicket(tokenId)` for a minted token (including burned ones), THE contract SHALL return `TicketInfo`. IF never minted, THEN revert `TicketNotFound`.
2. WHEN an event organizer or Admin calls `assignGateChecker(eventId, addr)` / `removeGateChecker(eventId, addr)`, THE contract SHALL update the per-event mapping and emit `GateCheckerAssigned` / `GateCheckerRemoved`. [OD-1]
3. WHEN an assigned Gate Checker of the ticket's event calls `checkIn` for a Valid ticket of an Active event, THE contract SHALL set `status = Used` and emit `TicketCheckedIn`.
4. The function signature SHALL be `checkIn(eventId, tokenId)`. IF the ticket belongs to another event, THEN revert `WrongEvent`. IF the caller is not assigned to `eventId`, THEN revert `NotGateChecker`. A checker of event A SHALL NOT check in a ticket of event B. [OD-2]
5. IF the ticket is Used, THEN revert `TicketNotValid` (second check-in rejected).
6. WHEN the event organizer or Admin calls `revokeTicket(tokenId)` for a Valid ticket of an Active event before `eventTime`, THE contract SHALL set `status = Revoked`, reserve the ticket's `originalPrice` for refund, and emit `TicketRevoked`. [OD-4]

## Requirement 5: Money flows (pull payments)

User story: As a Buyer, I want my money held safely until the event happens, so that I can get a refund if it is canceled; as an Organizer, I want to withdraw revenue after the event.

1. The contract SHALL NOT push ETH to any address except to `msg.sender` inside `withdraw` and `claimRefund`.
2. WHEN the event organizer calls `withdraw(eventId)` after `eventTime` on an Active event, THE contract SHALL send the event's primary revenue plus resale fees, zero both before the external call, and emit `RevenueWithdrawn`.
3. IF `withdraw` is called before `eventTime` on an Active event, THEN revert `WithdrawNotAllowed`.
4. WHEN `withdraw` is called on a Canceled event, THE contract SHALL pay only resale fees, never primary revenue. [OD-7]
5. WHEN the Holder calls `claimRefund(tokenId)` and the ticket is Revoked, or its event is Canceled and the ticket is Valid or Used [OD-6], THE contract SHALL burn the token, send `originalPrice` to the Holder, and emit `RefundClaimed`.
6. A ticket SHALL be refundable at most once (burn makes the second call revert).
7. `buyTicket`, `withdraw`, `claimRefund` and `receiveResaleFee` SHALL be `nonReentrant` and follow checks-effects-interactions.
8. IF an ETH transfer fails, THEN the call SHALL revert `EthTransferFailed`.
9. Escrow accounting SHALL be per event, so a shortfall in one event can never be paid from another event's funds.

## Requirement 6: Anti-scalping transfer rules

User story: As the platform, I want tickets to move only through our capped marketplace, so that scalpers cannot resell above the cap.

1. The contract SHALL override `_update` so that only mint, burn, and transfers initiated by `MARKETPLACE_ROLE` succeed. Direct `transferFrom`/`safeTransferFrom` SHALL revert `TransferNotAllowed`.
2. `approve` and `setApprovalForAll` SHALL always revert `ApprovalsDisabled`.
3. WHEN the Marketplace calls `transferByMarketplace(from, to, tokenId)` for a transferable ticket owned by `from`, THE contract SHALL move it to `to` and emit ERC-721 `Transfer`.
4. `isTransferable(tokenId)` SHALL return true only if the token exists, status is Valid, the event is Active, and `block.timestamp < eventTime`. [OD-11]
5. `getResaleCap(tokenId)` SHALL return `originalPrice * resaleCapBps / 10000`, rounded down.
6. WHEN the Marketplace calls `receiveResaleFee(eventId)` with `msg.value > 0` for an Active event, THE contract SHALL credit the event's resale fees and emit `ResaleFeeReceived`.
7. IF a non-Marketplace calls `transferByMarketplace` or `receiveResaleFee`, THEN revert (AccessControl).

## Requirement 7: Code quality and deliverables

1. Solidity `^0.8.24`, OpenZeppelin Contracts pinned to an exact v5 version, plain `@openzeppelin/contracts/...` imports, compiles in Remix without changes.
2. Custom errors only (no revert strings), an event for every state change, NatSpec on all public/external items.
3. No unbounded loops over user-controlled arrays; no secrets in source.
4. Timestamp assumptions and bps rounding documented in NatSpec and `docs/contracts.md`.
5. Hardhat tests in `blockchain/test/TicketNFT.test.js` cover the list in `tasks.md`.
6. ABI exported to `shared/abi/TicketNFT.json`.
7. `docs/contracts.md` (Indonesian) lists every function: name, params, caller, events, errors.
8. A known risks/assumptions list and Slither command are delivered for the audit group.
