# Design: TicketNFT Contract

Status: CONFIRMED (25 Oct 2026). All defaults in §11 accepted.

## 1. Overview

```
Admin ──grantRole──► Organizer ──createEvent/updateEvent/cancelEvent──┐
  │                     │ assignGateChecker                            ▼
  │                     ▼                                   ┌────────────────────┐
  │                Gate Checker ──checkIn──────────────────►│     TicketNFT      │
  └─grantRole(MARKETPLACE_ROLE)─► Marketplace (Member 2) ──►│ ERC721 + AccessCtl │
                                   transferByMarketplace    │ + ReentrancyGuard  │
                                   receiveResaleFee{value}  └────────────────────┘
Buyer ──buyTicket{value}/claimRefund──────────────────────────────▲
```

Single contract, no proxy, no upgradeability. `TicketNFT is ITicketNFT, ERC721, AccessControl, ReentrancyGuard`. `ITicketNFT` declares the shared enums/structs and the functions Member 2 needs, so the compiler enforces compatibility.

## 2. Files and tooling

```
blockchain/
├── package.json            # exact pins, own lockfile (separate from frontend root)
├── hardhat.config.js       # solidity 0.8.28, optimizer 200 runs
├── .gitignore              # node_modules, artifacts, cache, coverage
├── contracts/
│   ├── ITicketNFT.sol
│   ├── TicketNFT.sol
│   └── test/               # test-only helpers, never deployed
│       ├── RefundAttacker.sol
│       └── WithdrawAttacker.sol
├── scripts/
│   └── export-abi.js       # artifacts → ../shared/abi/TicketNFT.json
└── test/
    └── TicketNFT.test.js
shared/abi/TicketNFT.json
docs/contracts.md
```

Pins (checked on npm, 25 Oct 2026): `@openzeppelin/contracts 5.6.1`, `hardhat 2.29.1`, and only the plugins the tests need instead of the full toolbox (toolbox 6.1.2 pulls in TypeChain/TypeScript/Ignition peers): `@nomicfoundation/hardhat-ethers 3.1.3`, `hardhat-chai-matchers 2.1.2`, `hardhat-network-helpers 1.1.2`, `chai 4.5.0`, `ethers 6.17.0` (same as frontend), `solidity-coverage 0.8.17`. Member 2 can add Ignition/verify for deployment. EVM target `cancun` (OZ 5.6 uses `mcopy`).

Remix: imports are plain `@openzeppelin/contracts/...`, which Remix resolves from npm. Compiler 0.8.24+ in Remix.

## 3. Data model

```solidity
enum EventStatus  { Active, Canceled }
enum TicketStatus { Valid, Used, Revoked }

struct EventInfo {          // packed into 4 slots
    address organizer;      // slot 0
    uint64  saleStart;      // slot 0
    uint16  resaleCapBps;   // slot 0
    EventStatus status;     // slot 0
    uint64  saleEnd;        // slot 1
    uint64  eventTime;      // slot 1
    uint32  maxSupply;      // slot 1
    uint32  sold;           // slot 1
    uint32  maxPerWallet;   // slot 1
    uint256 ticketPrice;    // slot 2 (wei)
    bytes32 detailsHash;    // slot 3 (optional, 0x0 allowed)
}

struct EventParams {        // input for createEvent/updateEvent
    uint256 ticketPrice;
    uint32  maxSupply;
    uint32  maxPerWallet;
    uint64  saleStart;
    uint64  saleEnd;
    uint64  eventTime;
    uint16  resaleCapBps;
    bytes32 detailsHash;
}

struct TicketInfo {
    uint256 eventId;
    TicketStatus status;
    uint256 originalPrice;
}
```

A struct input (`EventParams`) is used instead of 8–9 loose arguments to avoid "stack too deep" without `viaIR` and to share one validation function. In Remix it is entered as a tuple: `["10000000000000000",100,4,1730000000,1730600000,1731000000,11000,"0x00…00"]`.

Storage:

| Variable | Type | Purpose |
| --- | --- | --- |
| `_nextEventId` | `uint256` (starts 1) | sequential event IDs; 0 = "not found" |
| `_nextTokenId` | `uint256` (starts 1) | sequential token IDs, global across events |
| `_events` | `mapping(uint256 => EventInfo)` | core event data |
| `_tickets` | `mapping(uint256 => TicketInfo)` | ticket data, kept after burn for history |
| `_gateCheckers` | `mapping(uint256 => mapping(address => bool))` | per-event checkers |
| `_purchased` | `mapping(uint256 => mapping(address => uint256))` | primary purchases per wallet per event |
| `_revenue` | `mapping(uint256 => uint256)` | primary sale escrow per event |
| `_resaleFees` | `mapping(uint256 => uint256)` | fees from marketplace per event |
| `_reservedRefund` | `mapping(uint256 => uint256)` | per token, set on revoke [OD-4] |

Constants: `ORGANIZER_ROLE`, `MARKETPLACE_ROLE` (`keccak256` of their names), `BPS_DENOMINATOR = 10_000`, `MIN_RESALE_CAP_BPS = 10_000`, `MAX_RESALE_CAP_BPS = 15_000` [OD-8], `MAX_PER_WALLET = 10` [OD-9].

## 4. Functions

Modifier-like internal checks: `_requireEvent(id)` (exists), `_requireEventOrganizer(id)` (`msg.sender == organizer` **and** has `ORGANIZER_ROLE`), `_requireOrganizerOrAdmin(id)`.

### 4.1 Event CRUD

| Function | Caller | Checks | Effects / Event |
| --- | --- | --- | --- |
| `createEvent(EventParams p) returns (uint256 eventId)` | `ORGANIZER_ROLE` | `_validate(p)`, `saleEnd > now` | store, `EventCreated` |
| `getEvent(uint256 id) view returns (EventInfo)` | anyone | exists | — |
| `updateEvent(uint256 id, EventParams p)` | event organizer | exists, Active, `now < eventTime`, `_validate(p)`, `p.maxSupply >= sold`; if `sold > 0`: price/maxSupply/resaleCapBps unchanged and `p.eventTime >= eventTime` | overwrite, `EventUpdated` |
| `cancelEvent(uint256 id)` | event organizer or Admin | exists, Active, `now < eventTime` | `status = Canceled`, `EventCanceled` |
| `totalEvents() view returns (uint256)` | anyone | — | — |

`_validate(p)`: `ticketPrice > 0` [OD-12]; `maxSupply > 0`; `0 < maxPerWallet <= MAX_PER_WALLET` and `<= maxSupply`; `saleStart < saleEnd <= eventTime`; `MIN_RESALE_CAP_BPS <= resaleCapBps <= MAX_RESALE_CAP_BPS`.

### 4.2 Tickets

| Function | Caller | Checks | Effects / Event |
| --- | --- | --- | --- |
| `buyTicket(uint256 eventId, uint256 qty) payable nonReentrant` | anyone | Active; `saleStart <= now < saleEnd`; `qty > 0`; `sold + qty <= maxSupply`; `_purchased + qty <= maxPerWallet`; `msg.value == price * qty` | update counters + `_revenue`, then `_mint` × qty, `TicketPurchased(eventId, buyer, firstTokenId, qty, msg.value)` |
| `getTicket(uint256 tokenId) view returns (TicketInfo)` | anyone | minted | — |
| `checkIn(uint256 eventId, uint256 tokenId)` [OD-2] | assigned checker of `eventId` | token exists (not burned); `ticket.eventId == eventId` else `WrongEvent`; event Active; checker assigned; status Valid | `status = Used`, `TicketCheckedIn` |
| `revokeTicket(uint256 tokenId)` | event organizer or Admin | exists; event Active; `now < eventTime`; status Valid | `status = Revoked`; move `originalPrice` from `_revenue` to `_reservedRefund[tokenId]`; `TicketRevoked` |
| `purchasedCount(uint256 eventId, address wallet) view` | anyone | — | — |

`_mint` (not `_safeMint`) is used on purpose: no external call to the buyer during minting, so there is no callback reentrancy surface. Tokens are non-transferable anyway, so a contract buyer cannot "lose" a ticket by sending it to a non-receiver.

### 4.3 Gate checkers

| Function | Caller | Checks | Event |
| --- | --- | --- | --- |
| `assignGateChecker(uint256 eventId, address checker)` | event organizer or Admin | exists, Active, `checker != 0`, not yet assigned | `GateCheckerAssigned(eventId, checker, by)` |
| `removeGateChecker(uint256 eventId, address checker)` | event organizer or Admin | exists, currently assigned | `GateCheckerRemoved(eventId, checker, by)` |
| `isGateChecker(uint256 eventId, address account) view` | anyone | — | — |

### 4.4 Money

| Function | Caller | Checks | Effects |
| --- | --- | --- | --- |
| `withdraw(uint256 eventId) nonReentrant` | event organizer (role **not** required) [OD-13] | Active: `now >= eventTime`, pays revenue + fees. Canceled: pays fees only [OD-7]. `amount > 0` | zero balances → `call{value}` → `RevenueWithdrawn` |
| `claimRefund(uint256 tokenId) nonReentrant` | Holder | status Revoked (pays `_reservedRefund`), or event Canceled and status Valid/Used [OD-6] (pays `originalPrice` from `_revenue`) | update storage, `_burn`, `call{value}`, `RefundClaimed` |
| `eventBalances(uint256 eventId) view returns (uint256 revenue, uint256 resaleFees)` | anyone | — | — |

All ETH calls use `(bool ok, ) = payable(msg.sender).call{value: amount}("")` with `if (!ok) revert EthTransferFailed();`. No `receive`/`fallback`: plain ETH sent to the contract reverts.

### 4.5 Marketplace hooks

| Function | Caller | Checks / Effects |
| --- | --- | --- |
| `transferByMarketplace(address from, address to, uint256 tokenId)` | `MARKETPLACE_ROLE` | `to != 0`, `isTransferable`, then `_transfer(from, to, tokenId)` (OZ reverts if `from` is not the owner) |
| `receiveResaleFee(uint256 eventId) payable nonReentrant` | `MARKETPLACE_ROLE` | exists, Active, `msg.value > 0`; `_resaleFees += msg.value`; `ResaleFeeReceived` |
| `getResaleCap(uint256 tokenId) view returns (uint256)` | anyone | minted; `originalPrice * resaleCapBps / 10_000` (floor, favors buyer) |
| `isTransferable(uint256 tokenId) view returns (bool)` | anyone | returns false (no revert) if not existing/burned, not Valid, event Canceled, or `now >= eventTime` [OD-11] |

The marketplace is trusted to have the seller's consent (listing created by `from`). TicketNFT does not re-check it; this is documented as a trust assumption.

### 4.6 Transfer and approval lock

```solidity
function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
    address from = _ownerOf(tokenId);
    if (from != address(0) && to != address(0)) {           // a real transfer
        if (!hasRole(MARKETPLACE_ROLE, _msgSender())) revert TransferNotAllowed();
        if (!isTransferable(tokenId)) revert TicketNotTransferable(tokenId);
    }
    return super._update(to, tokenId, auth);
}
function approve(address, uint256) public pure override { revert ApprovalsDisabled(); }
function setApprovalForAll(address, bool) public pure override { revert ApprovalsDisabled(); }
```

`transferFrom`/`safeTransferFrom` by holders fail at `TransferNotAllowed`. Even the marketplace calling `transferFrom` directly fails the ERC-721 auth check (no approvals can exist), so `transferByMarketplace` is the only path. `supportsInterface` is overridden for `ERC721` + `AccessControl`.

## 5. Lifecycles

Event: `Active ──cancelEvent (before eventTime)──► Canceled` (terminal). Time phases of an Active event: `pre-sale → sale [saleStart, saleEnd) → wait → after eventTime (withdraw)`.

Ticket:

```
mint ─► Valid ──checkIn──► Used
          │                  │ (event canceled) claimRefund ─► burned
          ├─revokeTicket─► Revoked ──claimRefund──► burned
          └─(event canceled) claimRefund ─► burned
```

Burned tickets keep their `TicketInfo` (status set to Revoked) for history; `ownerOf` reverts.

## 6. Money invariant

For every event `e`: `_revenue[e] + Σ _reservedRefund[t ∈ e] == ticketPrice × (sold − refunded tickets) − withdrawn`, and contract balance `== Σ_e (_revenue[e] + _resaleFees[e]) + Σ_t _reservedRefund[t]`.

Why it stays solvent:
- `cancelEvent` and `revokeTicket` require `now < eventTime`; primary `withdraw` requires `now >= eventTime`. These windows never overlap, so refunds are never owed after revenue left.
- A revoke reserves the refund immediately, so later withdrawal cannot spend it.
- Per-event mappings with checked arithmetic: one event's shortfall reverts instead of draining another event.

## 7. Custom errors

`ZeroAddress()`, `EventNotFound(uint256 eventId)`, `TicketNotFound(uint256 tokenId)`, `NotEventOrganizer(uint256 eventId, address caller)`, `NotOrganizerOrAdmin(uint256 eventId, address caller)`, `NotGateChecker(uint256 eventId, address caller)`, `NotTicketHolder(uint256 tokenId, address caller)`, `InvalidEventParams(uint8 reason)`, `EventNotActive(uint256 eventId)`, `EventAlreadyStarted(uint256 eventId)`, `FieldLocked()`, `SaleNotOpen(uint256 eventId)`, `InvalidQuantity()`, `SoldOut(uint256 eventId)`, `WalletLimitExceeded(uint256 eventId, address buyer)`, `IncorrectPayment(uint256 expected, uint256 sent)`, `TicketNotValid(uint256 tokenId)`, `WrongEvent(uint256 tokenId, uint256 eventId)` [OD-2], `GateCheckerAlreadyAssigned(...)`, `GateCheckerNotAssigned(...)`, `WithdrawNotAllowed(uint256 eventId)`, `NothingToWithdraw(uint256 eventId)`, `RefundNotAllowed(uint256 tokenId)`, `EthTransferFailed()`, `TransferNotAllowed()`, `TicketNotTransferable(uint256 tokenId)`, `ApprovalsDisabled()`, `ZeroValue()`.

`InvalidEventParams` carries a reason code (1 price, 2 supply, 3 maxPerWallet, 4 sale window, 5 eventTime, 6 resale cap) so the frontend can show a precise message without many error types.

## 8. Events (logs)

| Event | Indexed | Data |
| --- | --- | --- |
| `EventCreated` | eventId, organizer | ticketPrice, maxSupply, maxPerWallet, saleStart, saleEnd, eventTime, resaleCapBps, detailsHash |
| `EventUpdated` | eventId, organizer | same fields (indexer can overwrite its copy) |
| `EventCanceled` | eventId, by | — |
| `TicketPurchased` | eventId, buyer | firstTokenId, quantity, totalPaid |
| `TicketCheckedIn` | tokenId, eventId, checker | holder |
| `TicketRevoked` | tokenId, eventId, by | — |
| `RefundClaimed` | tokenId, eventId, holder | amount |
| `GateCheckerAssigned` / `GateCheckerRemoved` | eventId, checker, by | — |
| `RevenueWithdrawn` | eventId, organizer | amount |
| `ResaleFeeReceived` | eventId, marketplace | amount |

Plus inherited `Transfer`, `RoleGranted`, `RoleRevoked`. Token IDs in one purchase are consecutive: `firstTokenId … firstTokenId + quantity − 1`.

## 9. Security notes

- CEI everywhere; `nonReentrant` on all four ETH-moving functions. Only external call is the final `call{value}` to `msg.sender`.
- Timestamps: `block.timestamp` is used for sale window, `eventTime`, withdraw/cancel gates. Post-Merge validators can only shift it by a slot (~12 s) within protocol rules; all windows are minutes/hours, so this is acceptable. Documented in NatSpec.
- bps math: `originalPrice * resaleCapBps` cannot overflow for realistic prices (`uint256`, bps ≤ 15000); floor rounding favors the resale buyer by < 1 wei.
- `price * qty` overflow reverts (0.8 checked math).
- Admin is a single key with large power (cancel, revoke, grant marketplace). A malicious `MARKETPLACE_ROLE` holder could move any transferable ticket. Both are trust assumptions listed for the audit.

## 10. Testing strategy

Hardhat + Mocha/Chai + `hardhat-network-helpers` (`time.increaseTo`, `loadFixture`). One fixture deploys TicketNFT, grants Organizer to two accounts, grants `MARKETPLACE_ROLE` to an EOA acting as the marketplace (Member 2's contract is not needed), and creates one event. Reentrancy tests use the two attacker contracts in `contracts/test/` that try to re-enter `claimRefund` / `withdraw` from `receive()`; tests assert the re-entry failed and funds were paid exactly once. Coverage via `npx hardhat coverage`.

## 11. Open decisions (need your confirmation)

| ID | Question | Proposed default | Why |
| --- | --- | --- | --- |
| OD-1 | Gate Checker model. The frontend demo requires Admin to grant a global Gate Checker role first, then the organizer assigns. | Per-event mapping only, no global role. | Your spec; simpler; frontend Admin page drops the grant step. |
| OD-2 | `checkIn(tokenId)` or `checkIn(eventId, tokenId)`? Should the contract verify the holder's EIP-712 QR signature (frontend already has domain `AntiCaloCheckIn`)? | `checkIn(eventId, tokenId)`, reverts `WrongEvent` if mismatched. No on-chain signature; gate app verifies the QR signature + `ownerOf` off-chain. | Clear error for the "other event" case. On-chain signatures need nonce storage and more scope; listed as a known risk instead. |
| OD-3 | Check-in time window? | None besides Active (same as demo). | Simple; Gate Checkers are trusted per event. |
| OD-4 | Is a revoked ticket refunded? | Yes: revoke reserves `originalPrice`, holder calls `claimRefund`. Revoke only Valid tickets, before `eventTime`. | Otherwise an organizer could sell, revoke and keep the money. |
| OD-5 | Who can cancel, and until when? | Event organizer or Admin, only before `eventTime`. | Keeps refund and withdraw windows disjoint (§6). |
| OD-6 | Refund for Used tickets of a canceled event? | Yes (Valid or Used). | Event did not happen as planned. |
| OD-7 | Resale fees of a canceled event. | Organizer may withdraw them anytime after cancel. | Avoids permanently stuck ETH. Alternative: lock them. |
| OD-8 | `resaleCapBps` bounds. Demo uses 100%. | 10000–15000 (100%–150%), set per event. | Prevents absurd caps; 11000 is just an example value. Member 2 must check `price <= getResaleCap()` and decide if fee is inside the cap. |
| OD-9 | `maxPerWallet`: count primary purchases only? Hard cap? | Primary purchases only; `MAX_PER_WALLET = 10`. | Bounds the mint loop; tracking resale receipts adds complexity and multi-wallet scalpers bypass it anyway. |
| OD-10 | `eventTime` changes after sales. | Only postpone (never earlier); no updates after `eventTime`. | Moving it earlier would let an organizer withdraw early and block cancel/refund. |
| OD-11 | Block resale once `eventTime` has passed? | Yes. | Past tickets have no use; avoids post-event trading. |
| OD-12 | Free tickets (`ticketPrice = 0`)? | Not allowed. | Free tickets make the resale cap 0 and bypass refund logic. |
| OD-13 | Organizer whose role was revoked. | Cannot create/update/assign, can still `withdraw` own events; Admin can still cancel. | Prevents revenue being locked by a role change. |
| OD-14 | `tokenURI` / metadata. | Not implemented (empty string). | Off-chain details are served by backend via `eventId`. Alternative: Admin-set base URI. |
| OD-15 | Hardhat 2.29.1 + toolbox 6.1.2 (CommonJS) vs Hardhat 3.21.0. Member 2's deploy scripts share this project. | Hardhat 2. | Most tutorials, `.js` tests work as-is. Needs Member 2's agreement. |
| OD-16 | One special role per wallet (demo rule). | Not enforced on-chain. | AccessControl allows multiple roles; enforcing it adds code without clear security value. |
| OD-17 | Spec location. | `.kiro/specs/ticket-nft/` (Kiro's folder, outside other members' folders). | Can move to `blockchain/spec/` if you prefer. |
