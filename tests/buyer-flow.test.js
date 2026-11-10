import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from 'ethers';
import {
  createNonce,
  buildSiweMessage,
  verifySiwe,
  saveSession,
  loadSession,
  logout,
  isLoggedIn,
  SESSION_KEY,
} from '../src/auth.js';
import { describeTxError, TX_STATES } from '../src/tx.js';
import {
  statusFromCode,
  EVENT_STATUS,
  TICKET_STATUS,
  setNftContract,
  configuredNftContract,
  setMarketplaceContract,
  configuredMarketplaceContract,
  isLiveMode,
  TICKET_NFT_ABI,
  MARKETPLACE_ABI,
} from '../src/contract.js';

test('auth.js: createNonce generates a 32-character hex string', () => {
  const nonce = createNonce();
  assert.equal(typeof nonce, 'string');
  assert.equal(nonce.length, 32);
  assert.match(nonce, /^[0-9a-f]{32}$/);
});

test('auth.js: SIWE message build and verification round-trip with real ethers wallet', async () => {
  const wallet = Wallet.createRandom();
  const nonce = createNonce();
  const message = buildSiweMessage({
    address: wallet.address,
    nonce,
  });

  assert.match(message, new RegExp(wallet.address));
  assert.match(message, new RegExp(nonce));

  const signature = await wallet.signMessage(message);
  const verifiedAddress = verifySiwe({ message, signature, address: wallet.address });
  assert.equal(verifiedAddress.toLowerCase(), wallet.address.toLowerCase());

  // Tampered message should fail
  assert.throws(
    () => verifySiwe({ message: message + 'tampered', signature, address: wallet.address }),
    /Tanda tangan/
  );
});

test('auth.js: session storage save, load, and logout', () => {
  const mockStorage = {
    data: {},
    setItem(k, v) { this.data[k] = String(v); },
    getItem(k) { return this.data[k] ?? null; },
    removeItem(k) { delete this.data[k]; },
  };

  assert.equal(isLoggedIn(mockStorage), false);

  const sampleSession = {
    address: '0x1111111111111111111111111111111111111111',
    chainId: 11155111,
    nonce: 'abc',
  };

  saveSession(sampleSession, mockStorage);
  assert.equal(isLoggedIn(mockStorage), true);

  const loaded = loadSession(mockStorage);
  assert.equal(loaded.address.toLowerCase(), sampleSession.address.toLowerCase());

  logout(mockStorage);
  assert.equal(isLoggedIn(mockStorage), false);
  assert.equal(loadSession(mockStorage), null);
});

test('tx.js: describeTxError converts common wallet errors to friendly messages', () => {
  assert.match(describeTxError({ code: 4001 }), /dibatalkan/);
  assert.match(describeTxError({ code: 'ACTION_REJECTED' }), /dibatalkan/);
  assert.match(describeTxError({ code: 'INSUFFICIENT_FUNDS' }), /Saldo ETH tidak cukup/);
  assert.equal(describeTxError({ reason: 'Ticket sold out' }), 'Ticket sold out');
});

test('contract.js: ABI structures and configuration storage work as expected', () => {
  assert.ok(Array.isArray(TICKET_NFT_ABI));
  assert.ok(TICKET_NFT_ABI.length > 0);
  assert.ok(Array.isArray(MARKETPLACE_ABI));
  assert.ok(MARKETPLACE_ABI.length > 0);

  assert.equal(statusFromCode(EVENT_STATUS, 0), 'active');
  assert.equal(statusFromCode(EVENT_STATUS, 1), 'canceled');
  assert.equal(statusFromCode(TICKET_STATUS, 0), 'valid');
  assert.equal(statusFromCode(TICKET_STATUS, 1), 'used');
  assert.equal(statusFromCode(TICKET_STATUS, 2), 'revoked');

  const mockStorage = {
    data: {},
    setItem(k, v) { this.data[k] = String(v); },
    getItem(k) { return this.data[k] ?? null; },
    removeItem(k) { delete this.data[k]; },
  };

  const testAddr = '0x1234567890123456789012345678901234567890';
  setNftContract(testAddr, mockStorage);
  assert.equal(configuredNftContract(mockStorage)?.toLowerCase(), testAddr.toLowerCase());
  assert.equal(isLiveMode(mockStorage), true);

  setMarketplaceContract(testAddr, mockStorage);
  assert.equal(configuredMarketplaceContract(mockStorage)?.toLowerCase(), testAddr.toLowerCase());
});
