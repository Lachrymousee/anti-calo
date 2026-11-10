const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const PRICE = ethers.parseEther("0.01");
const CAP = (PRICE * 11_000n) / 10_000n;
const FEE = (CAP * 500n) / 10_000n;
const SELLER_AMOUNT = CAP - FEE;

describe("Marketplace", function () {
  async function makeParams(overrides = {}) {
    const now = BigInt(await time.latest());
    return {
      ticketPrice: PRICE,
      maxSupply: 5,
      maxPerWallet: 2,
      saleStart: now + 100n,
      saleEnd: now + 1_000n,
      eventTime: now + 2_000n,
      resaleCapBps: 11_000,
      detailsHash: ethers.id("marketplace test event"),
      ...overrides,
    };
  }

  async function deployFixture() {
    const [admin, org1, org2, seller, buyer, other, rogue, checker] = await ethers.getSigners();
    const nft = await ethers.deployContract("TicketNFT", [admin.address]);
    const marketplace = await ethers.deployContract("Marketplace", [nft.target, 500]);
    const ORGANIZER_ROLE = await nft.ORGANIZER_ROLE();
    const MARKETPLACE_ROLE = await nft.MARKETPLACE_ROLE();

    await nft.connect(admin).grantRole(ORGANIZER_ROLE, org1.address);
    await nft.connect(admin).grantRole(ORGANIZER_ROLE, org2.address);
    await nft.connect(admin).grantRole(MARKETPLACE_ROLE, marketplace.target);
    await nft.connect(admin).grantRole(MARKETPLACE_ROLE, rogue.address);

    const params = await makeParams();
    const smallParams = await makeParams({ ticketPrice: 1n });
    const roundingParams = await makeParams({ ticketPrice: 10_000n });
    await nft.connect(org1).createEvent(params);
    await nft.connect(org2).createEvent(params);
    await nft.connect(org1).createEvent(smallParams);
    await nft.connect(org1).createEvent(roundingParams);

    return {
      nft, marketplace, params, ORGANIZER_ROLE, MARKETPLACE_ROLE,
      admin, org1, org2, seller, buyer, other, rogue, checker,
    };
  }

  async function soldFixture() {
    const f = await deployFixture();
    await time.increaseTo(f.params.saleStart);
    await f.nft.connect(f.seller).buyTicket(1, 1, { value: PRICE });
    await f.nft.connect(f.other).buyTicket(2, 1, { value: PRICE });
    return f;
  }

  async function listAt(marketplace, signer, tokenId = 1n, price = PRICE) {
    return marketplace.connect(signer).listTicket(tokenId, price);
  }

  async function setTicketNonTransferable(f, state) {
    if (state === "used") {
      await f.nft.connect(f.org1).assignGateChecker(1, f.checker.address);
      await f.nft.connect(f.checker).checkIn(1, 1);
    } else if (state === "revoked" || state === "burned") {
      await f.nft.connect(f.org1).revokeTicket(1);
      if (state === "burned") await f.nft.connect(f.seller).claimRefund(1);
    } else if (state === "canceled") {
      await f.nft.connect(f.org1).cancelEvent(1);
    } else if (state === "ended") {
      await time.increaseTo(f.params.eventTime);
    }
  }

  describe("constructor and configuration", function () {
    it("stores the TicketNFT, immutable fee and maximum fee", async function () {
      const { nft, marketplace } = await loadFixture(deployFixture);
      expect(await marketplace.ticketNft()).to.equal(nft.target);
      expect(await marketplace.feeBps()).to.equal(500n);
      expect(await marketplace.MAX_FEE_BPS()).to.equal(1_000n);

      const factory = await ethers.getContractFactory("Marketplace");
      await expect(factory.deploy(nft.target, 0)).not.to.be.reverted;
      await expect(factory.deploy(nft.target, 1_000)).not.to.be.reverted;
    });

    it("rejects a zero TicketNFT address", async function () {
      const factory = await ethers.getContractFactory("Marketplace");
      await expect(factory.deploy(ethers.ZeroAddress, 500))
        .to.be.revertedWithCustomError(factory, "ZeroAddress");
    });

    it("rejects fees above the maximum", async function () {
      const { nft } = await loadFixture(deployFixture);
      const factory = await ethers.getContractFactory("Marketplace");
      await expect(factory.deploy(nft.target, 1_001))
        .to.be.revertedWithCustomError(factory, "InvalidFee");
    });

    it("rejects ETH sent without calling a payable function", async function () {
      const { marketplace, buyer } = await loadFixture(deployFixture);
      await expect(buyer.sendTransaction({ to: marketplace.target, value: 1n })).to.be.reverted;
    });
  });

  describe("listTicket", function () {
    it("lists at the cap, emits Listed, and leaves the NFT with its seller", async function () {
      const { nft, marketplace, seller } = await loadFixture(soldFixture);
      await expect(listAt(marketplace, seller, 1n, CAP))
        .to.emit(marketplace, "Listed").withArgs(1n, 1n, seller.address, CAP);
      expect(await nft.ownerOf(1)).to.equal(seller.address);
      expect((await marketplace.getListing(1)).seller).to.equal(seller.address);
      expect((await marketplace.getListing(1)).price).to.equal(CAP);
    });

    it("enforces validation order for zero price, non-transferable ticket, holder, cap, and duplicate", async function () {
      const { nft, marketplace, seller, other } = await loadFixture(soldFixture);
      await expect(marketplace.connect(seller).listTicket(999, 0))
        .to.be.revertedWithCustomError(marketplace, "ZeroPrice");
      await expect(marketplace.connect(seller).listTicket(999, PRICE))
        .to.be.revertedWithCustomError(marketplace, "TicketNotTransferable").withArgs(999);
      await expect(marketplace.connect(other).listTicket(1, CAP + 1n))
        .to.be.revertedWithCustomError(marketplace, "NotTicketHolder").withArgs(1, other.address);

      await listAt(marketplace, seller, 1n, PRICE);
      await expect(marketplace.connect(seller).listTicket(1, CAP + 1n))
        .to.be.revertedWithCustomError(marketplace, "PriceAboveCap").withArgs(1, CAP + 1n, CAP);
      await expect(marketplace.connect(seller).listTicket(1, PRICE))
        .to.be.revertedWithCustomError(marketplace, "AlreadyListed").withArgs(1);
      expect(await nft.ownerOf(1)).to.equal(seller.address);
    });

    it("rejects listing a used, revoked, cancelled-event, ended-event, or burned ticket", async function () {
      for (const state of ["used", "revoked", "canceled", "ended", "burned"]) {
        const f = await loadFixture(soldFixture);
        await setTicketNonTransferable(f, state);
        await expect(listAt(f.marketplace, f.seller))
          .to.be.revertedWithCustomError(f.marketplace, "TicketNotTransferable").withArgs(1);
      }
    });

    it("allows organizer, admin and gate checker holders to list", async function () {
      const f = await loadFixture(soldFixture);
      await f.nft.connect(f.org1).assignGateChecker(1, f.checker.address);
      for (const holder of [f.org1, f.admin, f.checker]) {
        const currentOwner = await f.nft.ownerOf(1);
        await f.nft.connect(f.rogue).transferByMarketplace(currentOwner, holder.address, 1);
        await expect(listAt(f.marketplace, holder)).to.emit(f.marketplace, "Listed");
      }
      expect((await f.marketplace.getListing(1)).seller).to.equal(f.checker.address);
    });

    it("overwrites a stale listing when the current holder lists", async function () {
      const { marketplace, nft, seller, other, rogue } = await loadFixture(soldFixture);
      await listAt(marketplace, seller, 1n, PRICE);
      await nft.connect(rogue).transferByMarketplace(seller.address, other.address, 1);
      await expect(listAt(marketplace, other, 1n, PRICE + 1n))
        .to.emit(marketplace, "Listed").withArgs(1n, 1n, other.address, PRICE + 1n);
      expect((await marketplace.getListing(1)).seller).to.equal(other.address);
      expect((await marketplace.getListing(1)).price).to.equal(PRICE + 1n);
    });

    it("prevents a previous seller from listing again while their old listing remains", async function () {
      const { marketplace, nft, seller, other, rogue } = await loadFixture(soldFixture);
      await listAt(marketplace, seller);
      await nft.connect(rogue).transferByMarketplace(seller.address, other.address, 1);
      await nft.connect(rogue).transferByMarketplace(other.address, seller.address, 1);
      await expect(listAt(marketplace, seller, 1n, PRICE + 1n))
        .to.be.revertedWithCustomError(marketplace, "AlreadyListed");
    });

    it("allows a buyer to list the ticket again after purchase at the original cap", async function () {
      const { marketplace, seller, buyer } = await loadFixture(soldFixture);
      await listAt(marketplace, seller, 1n, CAP);
      await marketplace.connect(buyer).buyListing(1, { value: CAP });
      await expect(listAt(marketplace, buyer, 1n, CAP)).to.emit(marketplace, "Listed");
    });
  });

  describe("cancelListing", function () {
    it("allows only the seller to cancel and clears the listing", async function () {
      const { marketplace, seller, other, org1, admin } = await loadFixture(soldFixture);
      await listAt(marketplace, seller);
      for (const caller of [other, org1, admin]) {
        await expect(marketplace.connect(caller).cancelListing(1))
          .to.be.revertedWithCustomError(marketplace, "NotSeller").withArgs(1, caller.address);
      }
      await expect(marketplace.connect(seller).cancelListing(1))
        .to.emit(marketplace, "ListingCanceled").withArgs(1, seller.address);
      expect((await marketplace.getListing(1)).seller).to.equal(ethers.ZeroAddress);
      expect((await marketplace.getListing(1)).price).to.equal(0n);
    });

    it("reverts when no listing exists or after cancellation", async function () {
      const { marketplace, seller } = await loadFixture(soldFixture);
      await expect(marketplace.connect(seller).cancelListing(1))
        .to.be.revertedWithCustomError(marketplace, "NotListed").withArgs(1);
      await listAt(marketplace, seller);
      await marketplace.connect(seller).cancelListing(1);
      await expect(marketplace.connect(seller).cancelListing(1))
        .to.be.revertedWithCustomError(marketplace, "NotListed").withArgs(1);
    });

    it("works after ticket status changes, burn, event end, and marketplace role revocation", async function () {
      for (const state of ["used", "revoked", "canceled", "ended", "burned", "role-revoked"]) {
        const f = await loadFixture(soldFixture);
        await listAt(f.marketplace, f.seller);
        if (state === "role-revoked") {
          await f.nft.connect(f.admin).revokeRole(f.MARKETPLACE_ROLE, f.marketplace.target);
        } else {
          await setTicketNonTransferable(f, state);
        }
        await expect(f.marketplace.connect(f.seller).cancelListing(1))
          .to.emit(f.marketplace, "ListingCanceled");
      }
    });

    it("allows relisting at a changed price after cancellation", async function () {
      const { marketplace, seller } = await loadFixture(soldFixture);
      await listAt(marketplace, seller, 1n, PRICE);
      await marketplace.connect(seller).cancelListing(1);
      await expect(listAt(marketplace, seller, 1n, PRICE + 1n)).to.emit(marketplace, "Listed");
      expect((await marketplace.getListing(1)).price).to.equal(PRICE + 1n);
    });
  });

  describe("buyListing", function () {
    it("splits a cap-price sale, transfers the ticket and emits Sold", async function () {
      const { nft, marketplace, seller, buyer } = await loadFixture(soldFixture);
      await listAt(marketplace, seller, 1n, CAP);
      await expect(marketplace.connect(buyer).buyListing(1, { value: CAP }))
        .to.emit(marketplace, "Sold").withArgs(1n, 1n, buyer.address, seller.address, CAP, FEE);
      expect(await nft.ownerOf(1)).to.equal(buyer.address);
      expect(await marketplace.pendingProceeds(seller.address)).to.equal(SELLER_AMOUNT);
      expect((await nft.eventBalances(1)).resaleFees).to.equal(FEE);
      expect(await ethers.provider.getBalance(marketplace.target)).to.equal(SELLER_AMOUNT);
      expect((await marketplace.getListing(1)).seller).to.equal(ethers.ZeroAddress);
    });

    it("checks listing, self-purchase, exact payment, transferability and current ownership in order", async function () {
      const f = await loadFixture(soldFixture);
      const { marketplace, nft, seller, buyer, other, rogue } = f;
      await expect(marketplace.connect(seller).buyListing(1, { value: PRICE }))
        .to.be.revertedWithCustomError(marketplace, "NotListed");
      await listAt(marketplace, seller, 1n, PRICE);
      await expect(marketplace.connect(seller).buyListing(1, { value: PRICE }))
        .to.be.revertedWithCustomError(marketplace, "CannotBuyOwnListing");
      await expect(marketplace.connect(buyer).buyListing(1, { value: PRICE - 1n }))
        .to.be.revertedWithCustomError(marketplace, "IncorrectPayment").withArgs(PRICE, PRICE - 1n);
      await expect(marketplace.connect(buyer).buyListing(1, { value: PRICE + 1n }))
        .to.be.revertedWithCustomError(marketplace, "IncorrectPayment").withArgs(PRICE, PRICE + 1n);

      await setTicketNonTransferable(f, "used");
      await expect(marketplace.connect(buyer).buyListing(1, { value: PRICE }))
        .to.be.revertedWithCustomError(marketplace, "TicketNotTransferable").withArgs(1);
      expect(await nft.ownerOf(1)).to.equal(seller.address);
      expect((await marketplace.getListing(1)).seller).to.equal(seller.address);

      const f2 = await loadFixture(soldFixture);
      await listAt(f2.marketplace, f2.seller, 1n, PRICE);
      await f2.nft.connect(f2.rogue).transferByMarketplace(f2.seller.address, f2.other.address, 1);
      await expect(f2.marketplace.connect(f2.buyer).buyListing(1, { value: PRICE }))
        .to.be.revertedWithCustomError(f2.marketplace, "StaleListing").withArgs(1);
    });

    it("rejects a sale after cancellation and when the listing is stale after ticket state changes", async function () {
      const f = await loadFixture(soldFixture);
      await listAt(f.marketplace, f.seller);
      await f.marketplace.connect(f.seller).cancelListing(1);
      await expect(f.marketplace.connect(f.buyer).buyListing(1, { value: PRICE }))
        .to.be.revertedWithCustomError(f.marketplace, "NotListed");

      for (const state of ["used", "revoked", "canceled", "ended", "burned"]) {
        const g = await loadFixture(soldFixture);
        await listAt(g.marketplace, g.seller);
        await setTicketNonTransferable(g, state);
        await expect(g.marketplace.connect(g.buyer).buyListing(1, { value: PRICE }))
          .to.be.revertedWithCustomError(g.marketplace, "TicketNotTransferable").withArgs(1);
      }
    });

    it("skips a zero fee and correctly rounds a nonzero fee down", async function () {
      const { nft, marketplace, seller, buyer } = await loadFixture(soldFixture);
      await nft.connect(seller).buyTicket(3, 1, { value: 1n });
      await listAt(marketplace, seller, 3n, 1n);
      await expect(marketplace.connect(buyer).buyListing(3, { value: 1n }))
        .not.to.emit(nft, "ResaleFeeReceived");
      expect(await marketplace.pendingProceeds(seller.address)).to.equal(1n);
      expect((await nft.eventBalances(3)).resaleFees).to.equal(0n);

      await nft.connect(seller).buyTicket(4, 1, { value: 10_000n });
      await listAt(marketplace, seller, 4n, 10_001n);
      await expect(marketplace.connect(buyer).buyListing(4, { value: 10_001n }))
        .to.emit(marketplace, "Sold").withArgs(4n, 4n, buyer.address, seller.address, 10_001n, 500n);
      expect(await marketplace.pendingProceeds(seller.address)).to.equal(1n + 9_501n);
      expect((await nft.eventBalances(4)).resaleFees).to.equal(500n);
    });

    it("reverts atomically if TicketNFT marketplace permission has been revoked", async function () {
      const f = await loadFixture(soldFixture);
      await listAt(f.marketplace, f.seller, 1n, CAP);
      await f.nft.connect(f.admin).revokeRole(f.MARKETPLACE_ROLE, f.marketplace.target);
      await expect(f.marketplace.connect(f.buyer).buyListing(1, { value: CAP }))
        .to.be.revertedWithCustomError(f.nft, "AccessControlUnauthorizedAccount");
      expect((await f.marketplace.getListing(1)).seller).to.equal(f.seller.address);
      expect(await f.marketplace.pendingProceeds(f.seller.address)).to.equal(0n);
      expect(await f.nft.ownerOf(1)).to.equal(f.seller.address);
      expect((await f.nft.eventBalances(1)).resaleFees).to.equal(0n);
    });

    it("blocks reentrant buyListing calls from the TicketNFT transfer interaction", async function () {
      const [seller, buyer] = await ethers.getSigners();
      const ticket = await ethers.deployContract("ReentrantTicketNFT", [seller.address]);
      const marketplace = await ethers.deployContract("Marketplace", [ticket.target, 500]);
      await ticket.setMarketplace(marketplace.target);
      await marketplace.connect(seller).listTicket(1, 10_000n);

      await marketplace.connect(buyer).buyListing(1, { value: 10_000n });
      expect(await ticket.callbackAttempted()).to.equal(true);
      expect(await ticket.callbackSucceeded()).to.equal(false);
      expect(ethers.dataSlice(await ticket.callbackData(), 0, 4))
        .to.equal(ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10));
    });

    it("supports contract buyers without affecting primary per-wallet purchase counts", async function () {
      const f = await loadFixture(soldFixture);
      const attacker = await ethers.deployContract("ProceedsAttacker", [f.nft.target, f.marketplace.target]);
      await listAt(f.marketplace, f.seller, 1n, PRICE);
      await expect(attacker.connect(f.buyer).buy(1, { value: PRICE }))
        .not.to.be.reverted;
      expect(await f.nft.ownerOf(1)).to.equal(attacker.target);
      expect(await f.nft.purchasedCount(1, f.buyer.address)).to.equal(0n);
    });

    it("keeps TicketNFT approvals and direct transfers disabled after listing", async function () {
      const f = await loadFixture(soldFixture);
      await listAt(f.marketplace, f.seller);
      await expect(f.nft.connect(f.seller).approve(f.buyer.address, 1))
        .to.be.revertedWithCustomError(f.nft, "ApprovalsDisabled");
      await expect(f.nft.connect(f.seller).transferFrom(f.seller.address, f.buyer.address, 1))
        .to.be.revertedWithCustomError(f.nft, "TransferNotAllowed");
    });

    it("accepts a sale below the cap and charges the fee on the sale price", async function () {
      const f = await loadFixture(soldFixture);
      const price = PRICE;
      await listAt(f.marketplace, f.seller, 1n, price);
      await f.marketplace.connect(f.buyer).buyListing(1, { value: price });
      expect(await f.marketplace.pendingProceeds(f.seller.address)).to.equal(price - (price * 500n) / 10_000n);
      expect((await f.nft.eventBalances(1)).resaleFees).to.equal((price * 500n) / 10_000n);
    });
  });

  describe("withdrawProceeds", function () {
    it("withdraws proceeds, clears the balance and emits ProceedsWithdrawn", async function () {
      const f = await loadFixture(soldFixture);
      await listAt(f.marketplace, f.seller, 1n, CAP);
      await f.marketplace.connect(f.buyer).buyListing(1, { value: CAP });
      await expect(f.marketplace.connect(f.seller).withdrawProceeds())
        .to.emit(f.marketplace, "ProceedsWithdrawn").withArgs(f.seller.address, SELLER_AMOUNT);
      expect(await f.marketplace.pendingProceeds(f.seller.address)).to.equal(0n);
    });

    it("rejects a withdrawal with no proceeds, including a second withdrawal", async function () {
      const f = await loadFixture(soldFixture);
      await expect(f.marketplace.connect(f.seller).withdrawProceeds())
        .to.be.revertedWithCustomError(f.marketplace, "NoProceeds");
      await listAt(f.marketplace, f.seller);
      await f.marketplace.connect(f.buyer).buyListing(1, { value: PRICE });
      await f.marketplace.connect(f.seller).withdrawProceeds();
      await expect(f.marketplace.connect(f.seller).withdrawProceeds())
        .to.be.revertedWithCustomError(f.marketplace, "NoProceeds");
    });

    it("accumulates proceeds from multiple sales for the same seller", async function () {
      const f = await loadFixture(soldFixture);
      await f.nft.connect(f.rogue).transferByMarketplace(f.other.address, f.seller.address, 2);
      await listAt(f.marketplace, f.seller, 1n, PRICE);
      await listAt(f.marketplace, f.seller, 2n, PRICE);
      await f.marketplace.connect(f.buyer).buyListing(1, { value: PRICE });
      await f.marketplace.connect(f.buyer).buyListing(2, { value: PRICE });
      expect(await f.marketplace.pendingProceeds(f.seller.address)).to.equal(2n * (PRICE - (PRICE * 500n) / 10_000n));
      await f.marketplace.connect(f.seller).withdrawProceeds();
      expect(await f.marketplace.pendingProceeds(f.seller.address)).to.equal(0n);
    });

    it("blocks reentrant withdrawal by a proceeds receiver", async function () {
      const f = await loadFixture(soldFixture);
      const attacker = await ethers.deployContract("ProceedsAttacker", [f.nft.target, f.marketplace.target]);
      await attacker.buyPrimary(1, 1, { value: PRICE });
      await attacker.list(3, PRICE);
      await f.marketplace.connect(f.buyer).buyListing(3, { value: PRICE });
      await attacker.withdraw();
      expect(await attacker.reentryAttempted()).to.equal(true);
      expect(await attacker.reentrySucceeded()).to.equal(false);
      expect(await ethers.provider.getBalance(attacker.target)).to.equal(PRICE - (PRICE * 500n) / 10_000n);
    });

    it("does not block a purchase when a seller rejects ETH and preserves the failed withdrawal", async function () {
      const f = await loadFixture(soldFixture);
      const sellerContract = await ethers.deployContract("ProceedsAttacker", [f.nft.target, f.marketplace.target]);
      await sellerContract.buyPrimary(1, 1, { value: PRICE });
      await sellerContract.list(3, PRICE);
      await sellerContract.setRejectEth(true);
      await expect(f.marketplace.connect(f.buyer).buyListing(3, { value: PRICE })).not.to.be.reverted;
      const proceeds = PRICE - (PRICE * 500n) / 10_000n;
      await expect(sellerContract.withdraw())
        .to.be.revertedWithCustomError(f.marketplace, "EthTransferFailed");
      expect(await f.marketplace.pendingProceeds(sellerContract.target)).to.equal(proceeds);
    });

    it("allows withdrawal after the marketplace role is revoked", async function () {
      const f = await loadFixture(soldFixture);
      await listAt(f.marketplace, f.seller, 1n, CAP);
      await f.marketplace.connect(f.buyer).buyListing(1, { value: CAP });
      await f.nft.connect(f.admin).revokeRole(f.MARKETPLACE_ROLE, f.marketplace.target);
      await expect(f.marketplace.connect(f.seller).withdrawProceeds()).not.to.be.reverted;
      expect(await f.marketplace.pendingProceeds(f.seller.address)).to.equal(0n);
    });
  });

  describe("views and money invariant", function () {
    it("returns a zero listing when none exists", async function () {
      const { marketplace } = await loadFixture(soldFixture);
      const listing = await marketplace.getListing(1);
      expect(listing.seller).to.equal(ethers.ZeroAddress);
      expect(listing.price).to.equal(0n);
    });

    it("quotes zero, tiny, ordinary and maximum uint256 prices without overflow", async function () {
      const { marketplace } = await loadFixture(deployFixture);
      for (const price of [0n, 1n, CAP, (1n << 256n) - 1n]) {
        const [fee, sellerAmount] = await marketplace.quoteSale(price);
        expect(fee + sellerAmount).to.equal(price);
        expect(fee).to.equal((price / 10_000n) * 500n + ((price % 10_000n) * 500n) / 10_000n);
      }
      const [fee, sellerAmount] = await marketplace.quoteSale(CAP);
      expect(fee).to.equal(FEE);
      expect(sellerAmount).to.equal(SELLER_AMOUNT);
    });

    it("maintains balance >= pending proceeds after mixed sales, cancellation and withdrawal", async function () {
      const f = await loadFixture(soldFixture);
      await listAt(f.marketplace, f.seller, 1n, PRICE);
      await listAt(f.marketplace, f.other, 2n, PRICE);
      await f.marketplace.connect(f.buyer).buyListing(1, { value: PRICE });
      await f.marketplace.connect(f.other).cancelListing(2);
      const expectedPending = await f.marketplace.pendingProceeds(f.seller.address)
        + await f.marketplace.pendingProceeds(f.other.address);
      expect(await ethers.provider.getBalance(f.marketplace.target)).to.be.gte(expectedPending);
      expect(expectedPending).to.equal(await f.marketplace.pendingProceeds(f.seller.address));

      const [fee, sellerAmount] = await f.marketplace.quoteSale(PRICE);
      expect(fee + sellerAmount).to.equal(PRICE);
      await f.marketplace.connect(f.seller).withdrawProceeds();
      expect(await ethers.provider.getBalance(f.marketplace.target)).to.be.gte(
        await f.marketplace.pendingProceeds(f.seller.address) + await f.marketplace.pendingProceeds(f.other.address),
      );
    });
  });

  describe("organizer integration", function () {
    it("lets the organizer withdraw primary revenue plus resale fees after the event", async function () {
      const f = await loadFixture(soldFixture);
      await listAt(f.marketplace, f.seller, 1n, CAP);
      await f.marketplace.connect(f.buyer).buyListing(1, { value: CAP });
      await time.increaseTo(f.params.eventTime);
      await expect(f.nft.connect(f.org1).withdraw(1))
        .to.emit(f.nft, "RevenueWithdrawn").withArgs(1n, f.org1.address, PRICE + FEE);
    });

    it("pays resale fees after event cancellation while buyer refund stays at original price", async function () {
      const f = await loadFixture(soldFixture);
      await listAt(f.marketplace, f.seller, 1n, CAP);
      await f.marketplace.connect(f.buyer).buyListing(1, { value: CAP });
      await f.nft.connect(f.org1).cancelEvent(1);
      await expect(f.nft.connect(f.org1).withdraw(1))
        .to.emit(f.nft, "RevenueWithdrawn").withArgs(1n, f.org1.address, FEE);
      await expect(f.nft.connect(f.buyer).claimRefund(1))
        .to.emit(f.nft, "RefundClaimed").withArgs(1n, 1n, f.buyer.address, PRICE);
    });
  });
});
