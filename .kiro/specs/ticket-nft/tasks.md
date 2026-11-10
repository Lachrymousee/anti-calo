# Tasks: TicketNFT Contract

Status: CONFIRMED (25 Oct 2026).

- [x] 1. Set up `blockchain/` Hardhat project
  - `package.json` with exact pins (OZ 5.6.1, Hardhat + toolbox per OD-15), own lockfile
  - `hardhat.config.js` (solc 0.8.28, optimizer 200), `blockchain/.gitignore`
  - _Requirements: 7.1_

- [x] 2. Write `contracts/ITicketNFT.sol`
  - Enums, structs, marketplace hooks, `getTicket`, `getEvent`
  - _Requirements: 6.3–6.6_

- [x] 3. Write `contracts/TicketNFT.sol`
  - [x] 3.1 Roles, constants, storage, errors, events, constructor, `supportsInterface`
  - [x] 3.2 Event CRUD + `_validate` + locked fields after sales (Req 2)
  - [x] 3.3 `buyTicket`, `getTicket`, `purchasedCount` (Req 3)
  - [x] 3.4 Gate checker assign/remove, `checkIn`, `revokeTicket` (Req 4)
  - [x] 3.5 `withdraw`, `claimRefund`, `eventBalances` (Req 5)
  - [x] 3.6 `_update` lock, approvals disabled, marketplace hooks, views (Req 6)
  - [x] 3.7 NatSpec on every public item, timestamp and rounding notes (Req 7.2, 7.4)
  - Verify: `npx hardhat compile` and compile once in Remix

- [x] 4. Test helpers in `contracts/test/`: `RefundAttacker.sol`, `WithdrawAttacker.sol`

- [x] 5. Write `test/TicketNFT.test.js`
  - [x] 5.1 Roles: non-admin cannot grant; non-organizer cannot create; organizer B cannot update/cancel organizer A's event; Admin cannot update
  - [x] 5.2 Event CRUD: create/get/update/cancel happy paths, invalid params, update after cancel rejected
  - [x] 5.3 Locked fields after first sale (price, maxSupply, resaleCapBps, earlier eventTime); non-financial fields still editable
  - [x] 5.4 Buy limits: maxPerWallet, supply, wrong payment (under/over), before saleStart, at/after saleEnd, qty 0, canceled event
  - [x] 5.5 Per-event gate checker: assign/remove by organizer and Admin, by others rejected; checker of event A cannot check in event B ticket
  - [x] 5.6 Check-in: success, second check-in rejected, revoked ticket rejected, canceled event rejected
  - [x] 5.7 Transfers: `transferFrom`/`safeTransferFrom` blocked, `approve`/`setApprovalForAll` revert, marketplace transfer allowed, marketplace transfer of Used/Revoked/canceled/post-event ticket rejected, non-marketplace caller rejected
  - [x] 5.8 Views: `getResaleCap` rounding, `isTransferable` all branches
  - [x] 5.9 Money: withdraw before eventTime rejected, after succeeds once, non-organizer rejected, canceled event pays fees only; cancel + refund (Valid and Used), double refund rejected, revoke + refund
  - [x] 5.10 Reentrancy on `claimRefund` and `withdraw` fails, paid exactly once
  - [x] 5.11 Resale fee: marketplace only, credited to the right event
  - Verify: `npx hardhat test` all green, `npx hardhat coverage`

- [x] 6. `scripts/export-abi.js` → `shared/abi/TicketNFT.json`; run it
  - _Requirements: 7.6_

- [x] 7. `docs/contracts.md` (Indonesian): function table, events, errors, Remix tuple example, integration notes for Members 2–6
  - _Requirements: 7.7_

- [x] 8. Audit handoff: known risks/assumptions list and Slither command (in `docs/contracts.md`); run Slither if installed and record real output only
  - _Requirements: 7.8_
  - Note: Slither is not installed on this machine, so it has not been run yet.
