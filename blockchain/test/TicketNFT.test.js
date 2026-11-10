const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const EventStatus = { Active: 0n, Canceled: 1n };
const TicketStatus = { Valid: 0n, Used: 1n, Revoked: 2n };
const PRICE = ethers.parseEther("0.01");
// Note: ethers v6 `Contract` has its own `getEvent()` (for log filters), so the contract's
// getEvent(uint256) must be called as nft.getFunction("getEvent")(id).

describe("TicketNFT", function () {
  // ---------------------------------------------------------------------
  // Fixtures and helpers
  // ---------------------------------------------------------------------

  async function makeParams(overrides = {}) {
    const now = BigInt(await time.latest());
    return {
      ticketPrice: PRICE,
      maxSupply: 5,
      maxPerWallet: 2,
      saleStart: now + 100n,
      saleEnd: now + 1000n,
      eventTime: now + 2000n,
      resaleCapBps: 11000,
      detailsHash: ethers.id("event details v1"),
      ...overrides,
    };
  }

  async function deployFixture() {
    const [admin, org1, org2, buyer1, buyer2, checker1, checker2, market, other] = await ethers.getSigners();
    const nft = await ethers.deployContract("TicketNFT", [admin.address]);
    const ORGANIZER_ROLE = await nft.ORGANIZER_ROLE();
    const MARKETPLACE_ROLE = await nft.MARKETPLACE_ROLE();
    await nft.connect(admin).grantRole(ORGANIZER_ROLE, org1.address);
    await nft.connect(admin).grantRole(ORGANIZER_ROLE, org2.address);
    await nft.connect(admin).grantRole(MARKETPLACE_ROLE, market.address);

    const params = await makeParams();
    await nft.connect(org1).createEvent(params); // event 1 (org1)
    await nft.connect(org2).createEvent(params); // event 2 (org2)

    return {
      nft, params, ORGANIZER_ROLE, MARKETPLACE_ROLE,
      admin, org1, org2, buyer1, buyer2, checker1, checker2, market, other,
    };
  }

  /** Event 1 and 2 on sale; buyer1 owns token 1 (event 1), buyer2 owns token 2 (event 2). */
  async function soldFixture() {
    const f = await deployFixture();
    await time.increaseTo(f.params.saleStart);
    await f.nft.connect(f.buyer1).buyTicket(1, 1, { value: PRICE });
    await f.nft.connect(f.buyer2).buyTicket(2, 1, { value: PRICE });
    await f.nft.connect(f.org1).assignGateChecker(1, f.checker1.address);
    await f.nft.connect(f.org2).assignGateChecker(2, f.checker2.address);
    return f;
  }

  // ---------------------------------------------------------------------
  // Deployment and roles
  // ---------------------------------------------------------------------

  describe("deployment and roles", function () {
    it("grants DEFAULT_ADMIN_ROLE to the constructor admin", async function () {
      const { nft, admin } = await loadFixture(deployFixture);
      expect(await nft.hasRole(await nft.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
    });

    it("rejects a zero admin address", async function () {
      const factory = await ethers.getContractFactory("TicketNFT");
      await expect(factory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(factory, "ZeroAddress");
    });

    it("lets only the admin grant and revoke ORGANIZER_ROLE", async function () {
      const { nft, ORGANIZER_ROLE, admin, org1, other } = await loadFixture(deployFixture);
      await expect(nft.connect(org1).grantRole(ORGANIZER_ROLE, other.address))
        .to.be.revertedWithCustomError(nft, "AccessControlUnauthorizedAccount");
      await expect(nft.connect(admin).grantRole(ORGANIZER_ROLE, other.address))
        .to.emit(nft, "RoleGranted").withArgs(ORGANIZER_ROLE, other.address, admin.address);
      await expect(nft.connect(admin).revokeRole(ORGANIZER_ROLE, other.address))
        .to.emit(nft, "RoleRevoked");
    });

    it("rejects createEvent from a non-organizer", async function () {
      const { nft, other } = await loadFixture(deployFixture);
      await expect(nft.connect(other).createEvent(await makeParams()))
        .to.be.revertedWithCustomError(nft, "AccessControlUnauthorizedAccount");
    });

    it("supports ERC-721 and AccessControl interfaces", async function () {
      const { nft } = await loadFixture(deployFixture);
      expect(await nft.supportsInterface("0x80ac58cd")).to.equal(true); // IERC721
      expect(await nft.supportsInterface("0x7965db0b")).to.equal(true); // IAccessControl
    });
  });

  // ---------------------------------------------------------------------
  // Event CRUD
  // ---------------------------------------------------------------------

  describe("event CRUD", function () {
    it("creates and reads an event", async function () {
      const { nft, params, org1 } = await loadFixture(deployFixture);
      const ev = await nft.getFunction("getEvent")(1);
      expect(ev.organizer).to.equal(org1.address);
      expect(ev.ticketPrice).to.equal(PRICE);
      expect(ev.maxSupply).to.equal(5n);
      expect(ev.sold).to.equal(0n);
      expect(ev.status).to.equal(EventStatus.Active);
      expect(ev.detailsHash).to.equal(params.detailsHash);
      expect(await nft.totalEvents()).to.equal(2n);
    });

    it("emits EventCreated", async function () {
      const { nft, org1 } = await loadFixture(deployFixture);
      await expect(nft.connect(org1).createEvent(await makeParams()))
        .to.emit(nft, "EventCreated");
    });

    it("reverts getEvent for unknown IDs", async function () {
      const { nft } = await loadFixture(deployFixture);
      await expect(nft.getFunction("getEvent")(0)).to.be.revertedWithCustomError(nft, "EventNotFound").withArgs(0);
      await expect(nft.getFunction("getEvent")(99)).to.be.revertedWithCustomError(nft, "EventNotFound").withArgs(99);
    });

    it("validates parameters with reason codes", async function () {
      const { nft, org1 } = await loadFixture(deployFixture);
      const base = await makeParams();
      const cases = [
        [{ ticketPrice: 0n }, 1],
        [{ maxSupply: 0 }, 2],
        [{ maxPerWallet: 0 }, 3],
        [{ maxPerWallet: 11 }, 3],
        [{ maxSupply: 1, maxPerWallet: 2 }, 3],
        [{ saleStart: base.saleEnd }, 4],
        [{ eventTime: base.saleEnd - 1n }, 5],
        [{ resaleCapBps: 9999 }, 6],
        [{ resaleCapBps: 15001 }, 6],
      ];
      for (const [override, reason] of cases) {
        await expect(nft.connect(org1).createEvent({ ...base, ...override }))
          .to.be.revertedWithCustomError(nft, "InvalidEventParams").withArgs(reason);
      }
    });

    it("rejects creating an event whose sale already ended", async function () {
      const { nft, org1 } = await loadFixture(deployFixture);
      const now = BigInt(await time.latest());
      const p = await makeParams({ saleStart: 1n, saleEnd: now, eventTime: now + 100n });
      await expect(nft.connect(org1).createEvent(p))
        .to.be.revertedWithCustomError(nft, "InvalidEventParams").withArgs(4);
    });

    it("lets the organizer update their own event", async function () {
      const { nft, params, org1 } = await loadFixture(deployFixture);
      const updated = { ...params, ticketPrice: PRICE * 2n, maxSupply: 10, detailsHash: ethers.id("v2") };
      await expect(nft.connect(org1).updateEvent(1, updated)).to.emit(nft, "EventUpdated");
      const ev = await nft.getFunction("getEvent")(1);
      expect(ev.ticketPrice).to.equal(PRICE * 2n);
      expect(ev.maxSupply).to.equal(10n);
      expect(ev.detailsHash).to.equal(ethers.id("v2"));
    });

    it("rejects updates from another organizer and from the admin", async function () {
      const { nft, params, admin, org2 } = await loadFixture(deployFixture);
      await expect(nft.connect(org2).updateEvent(1, params))
        .to.be.revertedWithCustomError(nft, "NotEventOrganizer").withArgs(1, org2.address);
      await expect(nft.connect(admin).updateEvent(1, params))
        .to.be.revertedWithCustomError(nft, "NotEventOrganizer").withArgs(1, admin.address);
    });

    it("rejects updates from an organizer whose role was revoked", async function () {
      const { nft, params, ORGANIZER_ROLE, admin, org1 } = await loadFixture(deployFixture);
      await nft.connect(admin).revokeRole(ORGANIZER_ROLE, org1.address);
      await expect(nft.connect(org1).updateEvent(1, params))
        .to.be.revertedWithCustomError(nft, "NotEventOrganizer");
    });

    it("rejects updates after cancel and after eventTime", async function () {
      const { nft, params, org1, org2 } = await loadFixture(deployFixture);
      await nft.connect(org1).cancelEvent(1);
      await expect(nft.connect(org1).updateEvent(1, params))
        .to.be.revertedWithCustomError(nft, "EventNotActive");
      await time.increaseTo(params.eventTime);
      await expect(nft.connect(org2).updateEvent(2, params))
        .to.be.revertedWithCustomError(nft, "EventAlreadyStarted");
    });

    it("lets organizer or admin cancel, others not", async function () {
      const { nft, admin, org1, org2 } = await loadFixture(deployFixture);
      await expect(nft.connect(org2).cancelEvent(1))
        .to.be.revertedWithCustomError(nft, "NotOrganizerOrAdmin").withArgs(1, org2.address);
      await expect(nft.connect(org1).cancelEvent(1)).to.emit(nft, "EventCanceled").withArgs(1, org1.address);
      await expect(nft.connect(admin).cancelEvent(2)).to.emit(nft, "EventCanceled").withArgs(2, admin.address);
      expect((await nft.getFunction("getEvent")(1)).status).to.equal(EventStatus.Canceled);
      await expect(nft.connect(org1).cancelEvent(1)).to.be.revertedWithCustomError(nft, "EventNotActive");
    });

    it("rejects cancel at or after eventTime", async function () {
      const { nft, params, org1 } = await loadFixture(deployFixture);
      await time.increaseTo(params.eventTime);
      await expect(nft.connect(org1).cancelEvent(1)).to.be.revertedWithCustomError(nft, "EventAlreadyStarted");
    });
  });

  // ---------------------------------------------------------------------
  // Locked fields after sales
  // ---------------------------------------------------------------------

  describe("locked fields after the first sale", function () {
    it("locks ticketPrice, maxSupply, resaleCapBps and earlier eventTime", async function () {
      const { nft, params, org1 } = await loadFixture(soldFixture);
      for (const change of [
        { ticketPrice: PRICE + 1n },
        { maxSupply: 6 },
        { resaleCapBps: 12000 },
        { eventTime: params.eventTime - 1n },
      ]) {
        await expect(nft.connect(org1).updateEvent(1, { ...params, ...change }))
          .to.be.revertedWithCustomError(nft, "FieldLocked");
      }
    });

    it("still allows non-financial changes and postponing", async function () {
      const { nft, params, org1 } = await loadFixture(soldFixture);
      const p = {
        ...params,
        maxPerWallet: 3,
        saleEnd: params.saleEnd + 500n,
        eventTime: params.eventTime + 3600n,
        detailsHash: ethers.id("v2"),
      };
      await expect(nft.connect(org1).updateEvent(1, p)).to.emit(nft, "EventUpdated");
      const ev = await nft.getFunction("getEvent")(1);
      expect(ev.maxPerWallet).to.equal(3n);
      expect(ev.eventTime).to.equal(p.eventTime);
    });
  });

  // ---------------------------------------------------------------------
  // Primary sale
  // ---------------------------------------------------------------------

  describe("buyTicket", function () {
    it("mints sequential tickets and tracks revenue", async function () {
      const { nft, params, buyer1 } = await loadFixture(deployFixture);
      await time.increaseTo(params.saleStart);
      await expect(nft.connect(buyer1).buyTicket(1, 2, { value: PRICE * 2n }))
        .to.emit(nft, "TicketPurchased").withArgs(1, buyer1.address, 1, 2, PRICE * 2n);
      expect(await nft.ownerOf(1)).to.equal(buyer1.address);
      expect(await nft.ownerOf(2)).to.equal(buyer1.address);
      const t = await nft.getTicket(2);
      expect(t.eventId).to.equal(1n);
      expect(t.status).to.equal(TicketStatus.Valid);
      expect(t.originalPrice).to.equal(PRICE);
      expect((await nft.getFunction("getEvent")(1)).sold).to.equal(2n);
      expect(await nft.purchasedCount(1, buyer1.address)).to.equal(2n);
      expect((await nft.eventBalances(1)).revenue).to.equal(PRICE * 2n);
      expect(await ethers.provider.getBalance(await nft.getAddress())).to.equal(PRICE * 2n);
    });

    it("enforces maxPerWallet per event across purchases", async function () {
      const { nft, params, buyer1 } = await loadFixture(deployFixture);
      await time.increaseTo(params.saleStart);
      await nft.connect(buyer1).buyTicket(1, 2, { value: PRICE * 2n });
      await expect(nft.connect(buyer1).buyTicket(1, 1, { value: PRICE }))
        .to.be.revertedWithCustomError(nft, "WalletLimitExceeded").withArgs(1, buyer1.address);
      // The limit is per event: buying for event 2 still works.
      await expect(nft.connect(buyer1).buyTicket(2, 2, { value: PRICE * 2n })).to.emit(nft, "TicketPurchased");
    });

    it("enforces maxSupply", async function () {
      const { nft, params, buyer1, buyer2, other } = await loadFixture(deployFixture);
      await time.increaseTo(params.saleStart);
      await nft.connect(buyer1).buyTicket(1, 2, { value: PRICE * 2n });
      await nft.connect(buyer2).buyTicket(1, 2, { value: PRICE * 2n });
      await expect(nft.connect(other).buyTicket(1, 2, { value: PRICE * 2n }))
        .to.be.revertedWithCustomError(nft, "SoldOut").withArgs(1);
      await nft.connect(other).buyTicket(1, 1, { value: PRICE }); // last ticket
      expect((await nft.getFunction("getEvent")(1)).sold).to.equal(5n);
    });

    it("requires exact payment", async function () {
      const { nft, params, buyer1 } = await loadFixture(deployFixture);
      await time.increaseTo(params.saleStart);
      await expect(nft.connect(buyer1).buyTicket(1, 1, { value: PRICE - 1n }))
        .to.be.revertedWithCustomError(nft, "IncorrectPayment").withArgs(PRICE, PRICE - 1n);
      await expect(nft.connect(buyer1).buyTicket(1, 1, { value: PRICE + 1n }))
        .to.be.revertedWithCustomError(nft, "IncorrectPayment").withArgs(PRICE, PRICE + 1n);
    });

    it("rejects purchases outside the sale window", async function () {
      const { nft, params, buyer1 } = await loadFixture(deployFixture);
      await expect(nft.connect(buyer1).buyTicket(1, 1, { value: PRICE }))
        .to.be.revertedWithCustomError(nft, "SaleNotOpen").withArgs(1);
      await time.increaseTo(params.saleEnd);
      await expect(nft.connect(buyer1).buyTicket(1, 1, { value: PRICE }))
        .to.be.revertedWithCustomError(nft, "SaleNotOpen").withArgs(1);
    });

    it("rejects qty 0, unknown and canceled events", async function () {
      const { nft, params, org1, buyer1 } = await loadFixture(deployFixture);
      await time.increaseTo(params.saleStart);
      await expect(nft.connect(buyer1).buyTicket(1, 0, { value: 0 }))
        .to.be.revertedWithCustomError(nft, "InvalidQuantity");
      await expect(nft.connect(buyer1).buyTicket(9, 1, { value: PRICE }))
        .to.be.revertedWithCustomError(nft, "EventNotFound");
      await nft.connect(org1).cancelEvent(1);
      await expect(nft.connect(buyer1).buyTicket(1, 1, { value: PRICE }))
        .to.be.revertedWithCustomError(nft, "EventNotActive");
    });

    it("rejects plain ETH transfers to the contract", async function () {
      const { nft, buyer1 } = await loadFixture(deployFixture);
      await expect(buyer1.sendTransaction({ to: await nft.getAddress(), value: 1n })).to.be.reverted;
    });
  });

  // ---------------------------------------------------------------------
  // Gate checkers and check-in
  // ---------------------------------------------------------------------

  describe("gate checkers", function () {
    it("lets organizer and admin assign/remove, others not", async function () {
      const { nft, admin, org1, org2, checker1, other } = await loadFixture(deployFixture);
      await expect(nft.connect(org2).assignGateChecker(1, checker1.address))
        .to.be.revertedWithCustomError(nft, "NotOrganizerOrAdmin");
      await expect(nft.connect(other).assignGateChecker(1, checker1.address))
        .to.be.revertedWithCustomError(nft, "NotOrganizerOrAdmin");
      await expect(nft.connect(org1).assignGateChecker(1, checker1.address))
        .to.emit(nft, "GateCheckerAssigned").withArgs(1, checker1.address, org1.address);
      expect(await nft.isGateChecker(1, checker1.address)).to.equal(true);
      expect(await nft.isGateChecker(2, checker1.address)).to.equal(false);
      await expect(nft.connect(org1).assignGateChecker(1, checker1.address))
        .to.be.revertedWithCustomError(nft, "GateCheckerAlreadyAssigned");
      await expect(nft.connect(org2).removeGateChecker(1, checker1.address))
        .to.be.revertedWithCustomError(nft, "NotOrganizerOrAdmin");
      await expect(nft.connect(admin).removeGateChecker(1, checker1.address))
        .to.emit(nft, "GateCheckerRemoved").withArgs(1, checker1.address, admin.address);
      await expect(nft.connect(org1).removeGateChecker(1, checker1.address))
        .to.be.revertedWithCustomError(nft, "GateCheckerNotAssigned");
      await expect(nft.connect(admin).assignGateChecker(1, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(nft, "ZeroAddress");
    });
  });

  describe("checkIn", function () {
    it("marks a ticket as used once; second check-in rejected", async function () {
      const { nft, buyer1, checker1 } = await loadFixture(soldFixture);
      await expect(nft.connect(checker1).checkIn(1, 1))
        .to.emit(nft, "TicketCheckedIn").withArgs(1, 1, checker1.address, buyer1.address);
      expect((await nft.getTicket(1)).status).to.equal(TicketStatus.Used);
      await expect(nft.connect(checker1).checkIn(1, 1))
        .to.be.revertedWithCustomError(nft, "TicketNotValid").withArgs(1);
    });

    it("rejects a checker of another event", async function () {
      const { nft, checker2 } = await loadFixture(soldFixture);
      // checker2 works for event 2; token 1 belongs to event 1.
      await expect(nft.connect(checker2).checkIn(2, 1))
        .to.be.revertedWithCustomError(nft, "WrongEvent").withArgs(1, 2);
      await expect(nft.connect(checker2).checkIn(1, 1))
        .to.be.revertedWithCustomError(nft, "NotGateChecker").withArgs(1, checker2.address);
    });

    it("rejects non-checkers, removed checkers, revoked tickets and canceled events", async function () {
      const { nft, org1, org2, other, checker1, checker2 } = await loadFixture(soldFixture);
      await expect(nft.connect(other).checkIn(1, 1)).to.be.revertedWithCustomError(nft, "NotGateChecker");
      await expect(nft.connect(org1).checkIn(1, 1)).to.be.revertedWithCustomError(nft, "NotGateChecker");

      await nft.connect(org1).removeGateChecker(1, checker1.address);
      await expect(nft.connect(checker1).checkIn(1, 1)).to.be.revertedWithCustomError(nft, "NotGateChecker");

      await nft.connect(org1).assignGateChecker(1, checker1.address);
      await nft.connect(org1).revokeTicket(1);
      await expect(nft.connect(checker1).checkIn(1, 1)).to.be.revertedWithCustomError(nft, "TicketNotValid");

      await nft.connect(org2).cancelEvent(2);
      await expect(nft.connect(checker2).checkIn(2, 2)).to.be.revertedWithCustomError(nft, "EventNotActive");
    });

    it("reverts for unknown tokens", async function () {
      const { nft, checker1 } = await loadFixture(soldFixture);
      await expect(nft.connect(checker1).checkIn(1, 99)).to.be.revertedWithCustomError(nft, "TicketNotFound");
    });
  });

  describe("revokeTicket", function () {
    it("lets organizer or admin revoke and reserves the refund", async function () {
      const { nft, admin, org1, org2, buyer1, buyer2 } = await loadFixture(soldFixture);
      await expect(nft.connect(org2).revokeTicket(1)).to.be.revertedWithCustomError(nft, "NotOrganizerOrAdmin");
      await expect(nft.connect(buyer1).revokeTicket(1)).to.be.revertedWithCustomError(nft, "NotOrganizerOrAdmin");
      await expect(nft.connect(org1).revokeTicket(1)).to.emit(nft, "TicketRevoked").withArgs(1, 1, org1.address);
      expect((await nft.getTicket(1)).status).to.equal(TicketStatus.Revoked);
      expect((await nft.eventBalances(1)).revenue).to.equal(0n);
      await expect(nft.connect(org1).revokeTicket(1)).to.be.revertedWithCustomError(nft, "TicketNotValid");
      await expect(nft.connect(admin).revokeTicket(2)).to.emit(nft, "TicketRevoked").withArgs(2, 2, admin.address);

      // Holder gets the reserved refund back.
      await expect(nft.connect(buyer1).claimRefund(1)).to.changeEtherBalance(buyer1, PRICE);
      await expect(nft.connect(buyer2).claimRefund(2)).to.changeEtherBalance(buyer2, PRICE);
    });

    it("rejects revoking used tickets or after eventTime", async function () {
      const { nft, params, org1, checker1, buyer1 } = await loadFixture(soldFixture);
      await nft.connect(checker1).checkIn(1, 1);
      await expect(nft.connect(org1).revokeTicket(1)).to.be.revertedWithCustomError(nft, "TicketNotValid");
      await nft.connect(buyer1).buyTicket(1, 1, { value: PRICE }); // token 3
      await time.increaseTo(params.eventTime);
      await expect(nft.connect(org1).revokeTicket(3)).to.be.revertedWithCustomError(nft, "EventAlreadyStarted");
    });
  });

  // ---------------------------------------------------------------------
  // Transfers and approvals
  // ---------------------------------------------------------------------

  describe("transfer restrictions", function () {
    it("blocks direct transfers by the holder", async function () {
      const { nft, buyer1, other } = await loadFixture(soldFixture);
      await expect(nft.connect(buyer1).transferFrom(buyer1.address, other.address, 1))
        .to.be.revertedWithCustomError(nft, "TransferNotAllowed");
      await expect(
        nft.connect(buyer1)["safeTransferFrom(address,address,uint256)"](buyer1.address, other.address, 1)
      ).to.be.revertedWithCustomError(nft, "TransferNotAllowed");
    });

    it("disables approve and setApprovalForAll", async function () {
      const { nft, buyer1, market } = await loadFixture(soldFixture);
      await expect(nft.connect(buyer1).approve(market.address, 1))
        .to.be.revertedWithCustomError(nft, "ApprovalsDisabled");
      await expect(nft.connect(buyer1).setApprovalForAll(market.address, true))
        .to.be.revertedWithCustomError(nft, "ApprovalsDisabled");
      expect(await nft.getApproved(1)).to.equal(ethers.ZeroAddress);
    });

    it("blocks the marketplace from using transferFrom directly", async function () {
      const { nft, buyer1, market, other } = await loadFixture(soldFixture);
      await expect(nft.connect(market).transferFrom(buyer1.address, other.address, 1))
        .to.be.revertedWithCustomError(nft, "ERC721InsufficientApproval");
    });

    it("allows marketplace transfers of transferable tickets", async function () {
      const { nft, buyer1, buyer2, market } = await loadFixture(soldFixture);
      await expect(nft.connect(market).transferByMarketplace(buyer1.address, buyer2.address, 1))
        .to.emit(nft, "Transfer").withArgs(buyer1.address, buyer2.address, 1);
      expect(await nft.ownerOf(1)).to.equal(buyer2.address);
    });

    it("rejects marketplace transfers from non-marketplace callers", async function () {
      const { nft, buyer1, buyer2, other } = await loadFixture(soldFixture);
      await expect(nft.connect(other).transferByMarketplace(buyer1.address, buyer2.address, 1))
        .to.be.revertedWithCustomError(nft, "AccessControlUnauthorizedAccount");
      await expect(nft.connect(buyer1).transferByMarketplace(buyer1.address, buyer2.address, 1))
        .to.be.revertedWithCustomError(nft, "AccessControlUnauthorizedAccount");
    });

    it("rejects wrong `from`, zero `to`, and unknown tokens", async function () {
      const { nft, buyer1, buyer2, market } = await loadFixture(soldFixture);
      await expect(nft.connect(market).transferByMarketplace(buyer2.address, buyer1.address, 1))
        .to.be.revertedWithCustomError(nft, "ERC721IncorrectOwner");
      await expect(nft.connect(market).transferByMarketplace(buyer1.address, ethers.ZeroAddress, 1))
        .to.be.revertedWithCustomError(nft, "ZeroAddress");
      await expect(nft.connect(market).transferByMarketplace(buyer1.address, buyer2.address, 99))
        .to.be.revertedWithCustomError(nft, "TicketNotTransferable");
    });

    it("rejects marketplace transfers of used, revoked, canceled-event and past-event tickets", async function () {
      const { nft, params, org1, org2, buyer1, buyer2, market, checker1, other } = await loadFixture(soldFixture);
      await nft.connect(buyer1).buyTicket(1, 1, { value: PRICE }); // token 3, event 1

      await nft.connect(checker1).checkIn(1, 1); // token 1 used
      await nft.connect(org1).revokeTicket(3); // token 3 revoked
      await nft.connect(org2).cancelEvent(2); // token 2 canceled event
      for (const [from, id] of [[buyer1, 1], [buyer1, 3], [buyer2, 2]]) {
        expect(await nft.isTransferable(id)).to.equal(false);
        await expect(nft.connect(market).transferByMarketplace(from.address, other.address, id))
          .to.be.revertedWithCustomError(nft, "TicketNotTransferable").withArgs(id);
      }

      const { nft: nft2, params: p2, buyer1: b1, market: m2, other: o2 } = await loadFixture(soldFixture);
      expect(await nft2.isTransferable(1)).to.equal(true);
      await time.increaseTo(p2.eventTime);
      expect(await nft2.isTransferable(1)).to.equal(false);
      await expect(nft2.connect(m2).transferByMarketplace(b1.address, o2.address, 1))
        .to.be.revertedWithCustomError(nft2, "TicketNotTransferable");
      expect(params.eventTime).to.equal(p2.eventTime);
    });

    it("isTransferable returns false (no revert) for unknown and burned tokens", async function () {
      const { nft, org1, buyer1 } = await loadFixture(soldFixture);
      expect(await nft.isTransferable(0)).to.equal(false);
      expect(await nft.isTransferable(99)).to.equal(false);
      await nft.connect(org1).cancelEvent(1);
      await nft.connect(buyer1).claimRefund(1);
      expect(await nft.isTransferable(1)).to.equal(false);
    });
  });

  // ---------------------------------------------------------------------
  // Resale views and fees
  // ---------------------------------------------------------------------

  describe("marketplace helpers", function () {
    it("computes the resale cap and rounds down", async function () {
      const { nft, org1, buyer1 } = await loadFixture(deployFixture);
      const now = BigInt(await time.latest());
      const p = await makeParams({
        ticketPrice: 333n, resaleCapBps: 11000, saleStart: now + 10n,
      });
      await nft.connect(org1).createEvent(p); // event 3
      await time.increaseTo(p.saleStart);
      await nft.connect(buyer1).buyTicket(3, 1, { value: 333n }); // token 1
      // 333 * 11000 / 10000 = 366.3 -> 366
      expect(await nft.getResaleCap(1)).to.equal(366n);
      await expect(nft.getResaleCap(99)).to.be.revertedWithCustomError(nft, "TicketNotFound");
    });

    it("credits resale fees to the right event, marketplace only", async function () {
      const { nft, org1, market, other } = await loadFixture(soldFixture);
      await expect(nft.connect(other).receiveResaleFee(1, { value: 100n }))
        .to.be.revertedWithCustomError(nft, "AccessControlUnauthorizedAccount");
      await expect(nft.connect(market).receiveResaleFee(1, { value: 0n }))
        .to.be.revertedWithCustomError(nft, "ZeroValue");
      await expect(nft.connect(market).receiveResaleFee(9, { value: 1n }))
        .to.be.revertedWithCustomError(nft, "EventNotFound");
      await expect(nft.connect(market).receiveResaleFee(1, { value: 100n }))
        .to.emit(nft, "ResaleFeeReceived").withArgs(1, market.address, 100n);
      const [, fees1] = await nft.eventBalances(1);
      const [, fees2] = await nft.eventBalances(2);
      expect(fees1).to.equal(100n);
      expect(fees2).to.equal(0n);
      await nft.connect(org1).cancelEvent(1);
      await expect(nft.connect(market).receiveResaleFee(1, { value: 1n }))
        .to.be.revertedWithCustomError(nft, "EventNotActive");
    });
  });

  // ---------------------------------------------------------------------
  // Withdraw and refunds
  // ---------------------------------------------------------------------

  describe("withdraw", function () {
    it("is rejected before eventTime and allowed once after", async function () {
      const { nft, params, org1, market } = await loadFixture(soldFixture);
      await nft.connect(market).receiveResaleFee(1, { value: 100n });
      await expect(nft.connect(org1).withdraw(1))
        .to.be.revertedWithCustomError(nft, "WithdrawNotAllowed").withArgs(1);
      await time.increaseTo(params.eventTime);
      await expect(nft.connect(org1).withdraw(1)).to.changeEtherBalance(org1, PRICE + 100n);
      await expect(nft.connect(org1).withdraw(1))
        .to.be.revertedWithCustomError(nft, "NothingToWithdraw").withArgs(1);
      // Event 2 money is untouched.
      expect((await nft.eventBalances(2)).revenue).to.equal(PRICE);
    });

    it("emits RevenueWithdrawn", async function () {
      const { nft, params, org1 } = await loadFixture(soldFixture);
      await time.increaseTo(params.eventTime);
      await expect(nft.connect(org1).withdraw(1)).to.emit(nft, "RevenueWithdrawn").withArgs(1, org1.address, PRICE);
    });

    it("rejects non-organizers, including other organizers and the admin", async function () {
      const { nft, params, admin, org2 } = await loadFixture(soldFixture);
      await time.increaseTo(params.eventTime);
      await expect(nft.connect(org2).withdraw(1)).to.be.revertedWithCustomError(nft, "NotEventOrganizer");
      await expect(nft.connect(admin).withdraw(1)).to.be.revertedWithCustomError(nft, "NotEventOrganizer");
    });

    it("still pays an organizer whose role was revoked", async function () {
      const { nft, params, ORGANIZER_ROLE, admin, org1 } = await loadFixture(soldFixture);
      await nft.connect(admin).revokeRole(ORGANIZER_ROLE, org1.address);
      await time.increaseTo(params.eventTime);
      await expect(nft.connect(org1).withdraw(1)).to.changeEtherBalance(org1, PRICE);
    });

    it("on a canceled event pays only resale fees", async function () {
      const { nft, org1, market } = await loadFixture(soldFixture);
      await nft.connect(market).receiveResaleFee(1, { value: 100n });
      await nft.connect(org1).cancelEvent(1);
      await expect(nft.connect(org1).withdraw(1)).to.changeEtherBalance(org1, 100n);
      expect((await nft.eventBalances(1)).revenue).to.equal(PRICE); // kept for refunds
      await expect(nft.connect(org1).withdraw(1)).to.be.revertedWithCustomError(nft, "NothingToWithdraw");
    });
  });

  describe("cancel + claimRefund", function () {
    it("refunds Valid and Used tickets of a canceled event and burns them", async function () {
      const { nft, org1, buyer1, checker1 } = await loadFixture(soldFixture);
      await nft.connect(buyer1).buyTicket(1, 1, { value: PRICE }); // token 3
      await nft.connect(checker1).checkIn(1, 3); // used
      await nft.connect(org1).cancelEvent(1);

      await expect(nft.connect(buyer1).claimRefund(1))
        .to.emit(nft, "RefundClaimed").withArgs(1, 1, buyer1.address, PRICE);
      await expect(nft.connect(buyer1).claimRefund(3)).to.changeEtherBalance(buyer1, PRICE);

      await expect(nft.ownerOf(1)).to.be.revertedWithCustomError(nft, "ERC721NonexistentToken");
      expect((await nft.getTicket(1)).status).to.equal(TicketStatus.Revoked);
      expect((await nft.eventBalances(1)).revenue).to.equal(0n);
    });

    it("rejects a second refund of the same ticket", async function () {
      const { nft, org1, buyer1 } = await loadFixture(soldFixture);
      await nft.connect(org1).cancelEvent(1);
      await nft.connect(buyer1).claimRefund(1);
      await expect(nft.connect(buyer1).claimRefund(1))
        .to.be.revertedWithCustomError(nft, "NotTicketHolder").withArgs(1, buyer1.address);
    });

    it("rejects refunds by non-holders and for active events", async function () {
      const { nft, org1, buyer1, buyer2 } = await loadFixture(soldFixture);
      await expect(nft.connect(buyer1).claimRefund(1))
        .to.be.revertedWithCustomError(nft, "RefundNotAllowed").withArgs(1);
      await nft.connect(org1).cancelEvent(1);
      await expect(nft.connect(buyer2).claimRefund(1))
        .to.be.revertedWithCustomError(nft, "NotTicketHolder");
      await expect(nft.connect(buyer1).claimRefund(99))
        .to.be.revertedWithCustomError(nft, "TicketNotFound");
    });

    it("refunds the current holder after a marketplace resale (original price only)", async function () {
      const { nft, org1, buyer1, buyer2, market } = await loadFixture(soldFixture);
      await nft.connect(market).transferByMarketplace(buyer1.address, buyer2.address, 1);
      await nft.connect(org1).cancelEvent(1);
      await expect(nft.connect(buyer1).claimRefund(1)).to.be.revertedWithCustomError(nft, "NotTicketHolder");
      await expect(nft.connect(buyer2).claimRefund(1)).to.changeEtherBalance(buyer2, PRICE);
    });

    it("keeps a revoked ticket's reserved refund when the event is later canceled", async function () {
      const { nft, org1, buyer1 } = await loadFixture(soldFixture);
      await nft.connect(buyer1).buyTicket(1, 1, { value: PRICE }); // token 3
      await nft.connect(org1).revokeTicket(1);
      await nft.connect(org1).cancelEvent(1);
      await expect(nft.connect(buyer1).claimRefund(1)).to.changeEtherBalance(buyer1, PRICE);
      await expect(nft.connect(buyer1).claimRefund(3)).to.changeEtherBalance(buyer1, PRICE);
      expect(await ethers.provider.getBalance(await nft.getAddress())).to.equal(PRICE); // event 2 only
    });
  });

  // ---------------------------------------------------------------------
  // Reentrancy
  // ---------------------------------------------------------------------

  describe("reentrancy", function () {
    it("blocks re-entering claimRefund from the refund callback", async function () {
      const { nft, params, org1 } = await loadFixture(deployFixture);
      const attacker = await ethers.deployContract("RefundAttacker", [await nft.getAddress()]);
      await time.increaseTo(params.saleStart);
      await attacker.buy(1, 2, { value: PRICE * 2n }); // tokens 1 and 2
      await nft.connect(org1).cancelEvent(1);

      await expect(attacker.attack(1, 2)).to.changeEtherBalance(attacker, PRICE);
      expect(await attacker.reentryAttempted()).to.equal(true);
      expect(await attacker.reentrySucceeded()).to.equal(false);
      expect(await nft.ownerOf(2)).to.equal(await attacker.getAddress()); // token 2 untouched
      expect((await nft.eventBalances(1)).revenue).to.equal(PRICE);
    });

    it("blocks re-entering withdraw from the payout callback", async function () {
      const { nft, admin, ORGANIZER_ROLE, buyer1 } = await loadFixture(deployFixture);
      const attacker = await ethers.deployContract("WithdrawAttacker", [await nft.getAddress()]);
      await nft.connect(admin).grantRole(ORGANIZER_ROLE, await attacker.getAddress());
      const p = await makeParams();
      await attacker.createEvent(p); // event 3
      await attacker.createEvent(p); // event 4
      await time.increaseTo(p.saleStart);
      await nft.connect(buyer1).buyTicket(3, 1, { value: PRICE });
      await nft.connect(buyer1).buyTicket(4, 1, { value: PRICE });
      await time.increaseTo(p.eventTime);

      await expect(attacker.attack(3, 4)).to.changeEtherBalance(attacker, PRICE);
      expect(await attacker.reentryAttempted()).to.equal(true);
      expect(await attacker.reentrySucceeded()).to.equal(false);
      expect((await nft.eventBalances(4)).revenue).to.equal(PRICE);
    });
  });
});
