import { connectInjectedWallet } from './chain.js';
import { API_URL, browserWallet, createApiClient } from './api.js';
import { el, button, field, badge } from './ui.js';

export function createAccountPage({ injected = globalThis.window?.ethereum, onWalletConnected = () => {}, onLogin = () => {} } = {}) {
  let wallet = null, profile = null;
  const message = el('p', { class: 'form-error', role: 'alert', 'data-testid': 'account-error' });
  const status = el('div', { class: 'backend-wallet', 'data-testid': 'account-status' });
  const name = el('input', { maxlength: 40, autocomplete: 'name', 'data-testid': 'account-name' });

  const clientFor = (current) => createApiClient({ baseUrl: API_URL, wallet: browserWallet(injected, current.address) });
  const showError = (error) => { message.textContent = error?.message ?? 'Permintaan akun gagal.'; };
  const remember = (current) => {
    wallet = current;
    onWalletConnected(current);
    try { sessionStorage.setItem('anti-calo-wallet', JSON.stringify(current)); } catch {}
  };
  const drawStatus = () => {
    status.replaceChildren(...(wallet
      ? [el('code', {}, wallet.address), profile?.admin ? badge('Admin', 'purple') : null,
        profile?.organizer ? badge('Organizer', 'green') : null,
        profile?.gateCheckerEventIds?.length ? badge('Gate Checker', 'amber') : null]
      : [el('span', { class: 'muted' }, 'Belum masuk. Hubungkan wallet untuk masuk atau mendaftar.')]));
  };

  async function connect() {
    wallet = await connectInjectedWallet(injected);
    remember(wallet);
    const config = await clientFor(wallet).config();
    if (Number(wallet.chainId) !== Number(config.chainId)) throw Error(`Pindahkan MetaMask ke jaringan Chain ID ${config.chainId} untuk melanjutkan.`);
    drawStatus();
    return clientFor(wallet);
  }

  const login = button('Masuk dengan MetaMask', async () => {
    message.textContent = '';
    try {
      const client = await connect();
      const challenge = await client.loginChallenge(wallet.address);
      const signature = await browserWallet(injected, wallet.address).signMessage(challenge.message);
      profile = await client.login(wallet.address, signature);
      drawStatus();
      if (!profile.registered) throw Error('Wallet belum terdaftar. Isi nama tampilan lalu pilih Daftar akun.');
      onLogin(profile);
    } catch (error) { showError(error); }
  }, { kind: 'primary', iconName: 'wallet', 'data-testid': 'account-login' });

  const register = button('Hubungkan wallet untuk daftar', async () => {
    message.textContent = '';
    try {
      const client = await connect();
      try { profile = { ...(await client.account(wallet.address)), registered: true }; }
      catch (error) { if (error.status !== 404) throw error; profile = null; }
      drawStatus();
      if (profile?.registered) throw Error('Wallet ini sudah terdaftar. Gunakan tombol Masuk dengan MetaMask.');
      name.focus();
    } catch (error) { showError(error); }
  }, { kind: 'outline', iconName: 'plus', 'data-testid': 'account-register-start' });

  const submit = button('Daftar akun', async () => {
    message.textContent = '';
    try {
      if (!wallet) throw Error('Hubungkan wallet terlebih dahulu.');
      const saved = await clientFor(wallet).saveAccount(wallet.address, name.value);
      const roles = await clientFor(wallet).roles(wallet.address);
      profile = { ...saved, ...roles, registered: true };
      drawStatus();
      onLogin(profile);
    } catch (error) { showError(error); }
  }, { kind: 'primary', 'data-testid': 'account-register-submit' });

  const main = el('main', { id: 'main', class: 'container integration-page' },
    el('div', { class: 'page-top' },     el('div', {}, el('div', { class: 'eyebrow' }, 'DAFTAR / MASUK'),
      el('h1', {}, 'Masuk atau daftar dengan wallet.'),
      el('p', { class: 'muted' }, 'Alamat wallet adalah identitas akun. Tidak ada password atau private key yang disimpan aplikasi.'))),
    el('section', { class: 'panel' }, el('div', { class: 'panel-heading' }, el('h2', {}, 'Masuk'), login),
      el('p', { class: 'field-hint' }, 'Tanda tangan login membuktikan bahwa wallet ini milikmu; transaksi tetap memerlukan persetujuan MetaMask.')),
    el('section', { class: 'panel' }, el('div', { class: 'panel-heading' }, el('h2', {}, 'Daftar akun'), register),
      field('Nama tampilan', name, 'Nama disimpan di backend bersama alamat wallet.'),
      submit, status, message),
    el('p', { class: 'field-hint' }, 'Role Admin, Organizer, dan Gate Checker ditentukan dari role on-chain, bukan dari nama akun.'));

  return { main, cleanup() {} };
}
