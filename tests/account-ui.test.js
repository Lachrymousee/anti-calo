import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createAccountPage } from '../src/account.js';

test('halaman akun menyediakan alur masuk dan daftar wallet tanpa password', () => {
  const dom = new JSDOM('<!doctype html><div id="toasts"></div><dialog id="modal"></dialog>', { url: 'https://example.test/account.html' });
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true },
    document: { value: dom.window.document, configurable: true },
    Node: { value: dom.window.Node, configurable: true },
  });
  const page = createAccountPage({ injected: null });
  document.body.append(page.main);
  assert.match(document.querySelector('main h1').textContent, /Masuk atau daftar/);
  assert(document.querySelector('[data-testid="account-login"]'));
  assert(document.querySelector('[data-testid="account-register-start"]'));
  assert(document.querySelector('[data-testid="account-register-submit"]'));
  assert.match(document.querySelector('main').textContent, /Tidak ada password/);
  page.cleanup();
  dom.window.close();
});
