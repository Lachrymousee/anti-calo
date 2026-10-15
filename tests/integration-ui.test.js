import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createIntegrationPage, CHAIN_CONFIG_KEY } from '../src/integration.js';
import { CHAIN_ID, QR_TTL } from '../src/model.js';
const contract='0x6666666666666666666666666666666666666666',address='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222';
const configuration={contract,eventId:'1',tokenId:'2'},wallet={address,chainId:CHAIN_ID};
let current;
function setup(options={}){
 current?.lab.cleanup();current?.dom.window.close();
 const dom=new JSDOM('<!doctype html><div id="app"></div><div id="toasts"></div>',{url:'https://example.test/integration.html'});
 Object.defineProperties(globalThis,{window:{value:dom.window,configurable:true},document:{value:dom.window.document,configurable:true},Node:{value:dom.window.Node,configurable:true},localStorage:{value:dom.window.localStorage,configurable:true},navigator:{value:dom.window.navigator,configurable:true}});
 const listeners=new Map(),injected={on:(event,handler)=>listeners.set(event,handler),removeListener:(event,handler)=>{if(listeners.get(event)===handler)listeners.delete(event);}};
 const calls=[];const now=Math.floor(Date.now()/1000),payload={v:1,mode:'onchain',chainId:CHAIN_ID,contract,message:{eventId:'1',tokenId:'2',owner:address,issuedAt:now,expiresAt:now+QR_TTL,nonce:'0x'+'a'.repeat(64)},signature:'0x'+'b'.repeat(130)};
 const api={connectInjectedWallet:async()=>wallet,readOnchainTicket:async c=>{calls.push('read');return {...c,owner:address,blockNumber:16};},signOnchainQR:async c=>{calls.push('sign');return payload;},verifyOnchainQR:async c=>{calls.push('verify');return {...c,owner:address,signer:address,blockNumber:17};},...options.api};
 const lab=createIntegrationPage({initialConfig:configuration,injected,qrEncoder:{toCanvas:async(canvas,raw)=>canvas.dataset.payload=raw},...options,api});
 document.getElementById('app').append(lab.main);current={dom,lab,listeners,calls,payload};return current;
}
async function click(id){const btn=document.querySelector(`[data-testid=${id}]`);assert(btn);btn.click();await new Promise(r=>setTimeout(r,10));}
function input(id,value){const n=document.querySelector(`[data-testid=${id}]`);n.value=value;n.dispatchEvent(new window.Event('input',{bubbles:true}));}
test('integration connects, reads an NFT, generates QR, and verifies without any check-in action',async()=>{
 const s=setup();assert(document.querySelector('[data-testid=integration-inspect]').disabled);assert(document.querySelector('[data-testid=integration-sign]').disabled);
 await click('integration-connect');assert.match(document.querySelector('[data-testid=integration-wallet-status]').textContent,/Sepolia terhubung/);
 await click('integration-inspect');assert.match(document.querySelector('[data-testid=integration-owner]').textContent,/NFT ditemukan/);
 await click('integration-sign');assert.equal(document.querySelector('[data-testid=signed-payload]').value,JSON.stringify(s.payload));assert.equal(document.querySelector('canvas').hidden,false);
 await click('integration-verify');assert.match(document.querySelector('[data-testid=integration-verification]').textContent,/Signature dan pemilik NFT cocok/);
 assert.match(document.querySelector('[data-testid=integration-verification]').textContent,/belum memberi izin check-in/);assert.equal(document.querySelector('[data-testid=confirm-checkin]'),null);
});
test('initial account notification during connection does not cancel network detection',async()=>{let s;s=setup({api:{connectInjectedWallet:async()=>{s.listeners.get('accountsChanged')([address]);return wallet;}}});await click('integration-connect');assert.match(document.querySelector('[data-testid=integration-wallet-status]').textContent,/Sepolia terhubung/);assert.equal(document.querySelector('[data-testid=integration-inspect]').disabled,false);});
test('a different NFT owner keeps signing disabled',async()=>{
 setup({initialWallet:wallet,api:{readOnchainTicket:async c=>({...c,owner:other,blockNumber:16})}});await click('integration-inspect');
 assert.match(document.querySelector('[data-testid=integration-owner]').textContent,/bukan pemilik/);assert(document.querySelector('[data-testid=integration-sign]').disabled);
});
test('configuration changes clear inspection and QR results before another request',async()=>{
 setup({initialWallet:wallet});await click('integration-inspect');await click('integration-sign');
 input('integration-token','3');assert.equal(document.querySelector('[data-testid=integration-owner]').textContent,'');assert.equal(document.querySelector('canvas').hidden,true);assert(document.querySelector('[data-testid=integration-sign]').disabled);
});
test('wallet or network changes clear pending results and stale promises never show a QR',async()=>{
 let resolveSignature;const s=setup({initialWallet:wallet,api:{signOnchainQR:()=>new Promise(r=>resolveSignature=r)}});
 await click('integration-inspect');await click('integration-sign');s.listeners.get('accountsChanged')([other]);resolveSignature(s.payload);await new Promise(r=>setTimeout(r,10));
 assert.equal(document.querySelector('canvas').hidden,true);assert.equal(document.querySelector('[data-testid=integration-owner]').textContent,'');assert(document.querySelector('[data-testid=integration-sign]').disabled);
 s.listeners.get('chainChanged')('0x1');assert(document.querySelector('[data-testid=integration-inspect]').disabled);assert.equal(document.querySelector('[data-testid=integration-switch]').hidden,false);
 s.lab.cleanup();assert.equal(s.listeners.size,0);
});
test('invalid configuration never calls RPC; saved settings contain only public identifiers',async()=>{
 const s=setup({initialWallet:wallet});input('integration-contract','0x0000000000000000000000000000000000000000');await click('integration-inspect');assert.match(document.querySelector('[data-testid=integration-error]').textContent,/zero address/);assert.equal(s.calls.length,0);
 input('integration-contract',contract);await click('integration-save');const data=JSON.parse(localStorage.getItem(CHAIN_CONFIG_KEY));assert.deepEqual(Object.keys(data).sort(),['contract','eventId','tokenId','version']);assert.equal(data.contract,contract);s.lab.cleanup();s.dom.window.close();
});
