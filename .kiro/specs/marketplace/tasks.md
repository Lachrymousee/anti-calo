# Tasks: Marketplace Contract (Member 2)

Spec-level checklist. The step-by-step working guide with commands, test IDs and acceptance criteria is `docs/TODO-marketplace.md`.
Legend: `[x]` done, `[ ]` to do. Requirement references point to `requirements.md`.

## Provided with the spec

- [x] `.kiro/specs/marketplace/requirements.md`, `design.md`, `tasks.md`
- [x] `blockchain/contracts/IMarketplace.sol` (struct, events, errors, function signatures) (R8, R9)
- [x] `blockchain/scripts/export-abi.js` exports `TicketNFT` and `Marketplace` (R9.5)
- [x] `docs/contracts-marketplace.md` (integration doc, to be completed with real test and Slither results) (R9.6)
- [x] `docs/TODO-marketplace.md` (working guide)

## Implementation

- [ ] 1. Baseline: `npm ci`, existing tests green (R9.7)
- [ ] 2. `Marketplace.sol` skeleton: `is IMarketplace, ReentrancyGuard`, constants, immutables, storage, constructor (R1)
- [ ] 3. `listTicket` with the check order of design §4.1 (R2)
- [ ] 4. `cancelListing` without external calls (R3)
- [ ] 5. `quoteSale`, `getListing`, `pendingProceeds` (R6)
- [ ] 6. `buyListing` with the order of design §4.3, CEI, `nonReentrant` (R4, R7)
- [ ] 7. `withdrawProceeds` with zero-before-send, `nonReentrant` (R5)
- [ ] 8. NatSpec on every external function, including rounding and kill-switch notes (R9.2)
- [ ] 9. No `receive`/`fallback`, no owner or setters (R1.2, R1.4)

## Testing

- [ ] 10. `contracts/test/ProceedsAttacker.sol` (reentrancy and rejecting-seller helper) (R5.3, R9.4)
- [ ] 11. Fixture: TicketNFT + Marketplace(feeBps 500), role granted, `rogue` role holder, event with `resaleCapBps = 11000`
- [ ] 12. Test groups A to H from design §10 (R1 to R8)
- [ ] 13. Money invariant asserted after mixed sequences (design §6, R7.4)
- [ ] 14. Coverage: 100% lines and branches of `Marketplace.sol` (R9.3)
- [ ] 15. Existing `TicketNFT.test.js` untouched and green (R9.7)

## Quality, integration, delivery

- [ ] 16. Slither run, findings triaged and recorded in the integration doc (R9.6)
- [ ] 17. `npm run export-abi` produces `shared/abi/Marketplace.json` (R9.5)
- [ ] 18. Complete `docs/contracts-marketplace.md` with real test counts and Slither result (R9.6)
- [ ] 19. Hand-off note for frontend/backend/indexer: purchasable-listing rule, `quoteSale`, per-event cap, merged-ABI error decoding (design §5, §8)
- [ ] 20. Deployment hand-off: deploy with `feeBps = 500`, Admin grants `MARKETPLACE_ROLE`, record address in `shared/deployments/<network>.json` (R1.3)
- [ ] 21. Pull request from `feature/marketplace`, review checklist passed
