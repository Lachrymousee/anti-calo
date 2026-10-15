import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, Interface, ZeroAddress } from 'ethers';
import { CHAIN_ID, QR_TTL } from '../src/model.js';
import { NFT_READ_ABI, QR_TYPES, qrDomain, normalizeUint256, normalizeContract, parseSignedQR, validateSignedQR, readOnchainTicket, signOnchainQR, verifyOnchainQR, switchToSepolia } from '../src/chain.js';

const contract = '0x6666666666666666666666666666666666666666';
const iface = new Interface(NFT_READ_ABI);
function provider({ wallet = Wallet.createRandom(), owner = wallet.address, chainId = CHAIN_ID, code = '0x60006000', erc721 = true, missingToken = false, onSign } = {}) {
  const state = { wallet, owner, chainId, code, erc721, missingToken, requests: [], onSign };
  const injected = { request: async ({ method, params }) => {
    state.requests.push(method);
    if (method === 'eth_chainId') return '0x' + state.chainId.toString(16);
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [state.wallet.address];
    if (method === 'wallet_switchEthereumChain') { state.chainId = Number(params[0].chainId); return null; }
    if (method === 'eth_getCode') return state.code;
    if (method === 'eth_getBlockByNumber') return {
      number: '0x10', hash: '0x' + 'a'.repeat(64), parentHash: '0x' + 'b'.repeat(64), timestamp: '0x' + Math.floor(Date.now()/1000).toString(16),
      nonce: '0x0000000000000000', difficulty: '0x0', gasLimit: '0x1c9c380', gasUsed: '0x0', miner: ZeroAddress,
      extraData: '0x', transactions: [], baseFeePerGas: '0x1', sha3Uncles: '0x' + '0'.repeat(64), logsBloom: '0x' + '0'.repeat(512),
    };
    if (method === 'eth_call') {
      const data = params[0].data, f = iface.parseTransaction({ data });
      if (f.name === 'supportsInterface') return iface.encodeFunctionResult('supportsInterface', [state.erc721]);
      if (f.name === 'ownerOf') {
        if (state.missingToken) throw Object.assign(Error('execution reverted'), { code: 3, data: '0x' });
        return iface.encodeFunctionResult('ownerOf', [state.owner]);
      }
    }
    if (method === 'eth_signTypedData_v4') {
      const typed = JSON.parse(params[1]), types = { ...typed.types }; delete types.EIP712Domain;
      const signature = await state.wallet.signTypedData(typed.domain, types, typed.message);
      await state.onSign?.(state); return signature;
    }
    throw Error('Unexpected mock RPC method ' + method);
  } };
  return { injected, state };
}
const config = { contract, eventId:'1', tokenId:'2' };
test('configuration rejects invalid addresses and uint256 overflow before RPC',async()=>{
 assert.equal(normalizeUint256('0002'),'2');assert.equal(normalizeUint256(((1n<<256n)-1n).toString()),((1n<<256n)-1n).toString());
 for(const id of ['-1','1e3','', '2.5',(1n<<256n).toString()])assert.throws(()=>normalizeUint256(id));
 for(const addr of [ZeroAddress,'test.eth','not-an-address'])assert.throws(()=>normalizeContract(addr));
 const p=provider();await assert.rejects(()=>readOnchainTicket({contract:ZeroAddress,tokenId:'2',injected:p.injected}),/zero address/);assert.equal(p.state.requests.length,0);
});
test('reader checks deployment, ERC-721 support, and owner at one Sepolia block',async()=>{
 const p=provider(),result=await readOnchainTicket({...config,injected:p.injected});
 assert.equal(result.owner,p.state.owner);assert.equal(result.contract,contract);assert.equal(result.tokenId,'2');assert.equal(result.blockNumber,16);
 assert(p.state.requests.includes('eth_getCode'));assert.equal(p.state.requests.filter(m=>m==='eth_call').length,2);
});
test('reader rejects a wrong network, undeployed contract, and non-ERC721 contract',async()=>{
 for(const [options,error] of [[{chainId:1},/Sepolia/],[{code:'0x'},/Tidak ada kontrak/],[{erc721:false},/ERC-721/],[{missingToken:true},/Token mungkin/]]){
  const p=provider(options);await assert.rejects(()=>readOnchainTicket({...config,injected:p.injected}),error);
  if(options.chainId===1)assert(!p.state.requests.includes('eth_call'));
 }
});
test('wallet owner signs a QR, which verifies against a fresh NFT read',async()=>{
 const p=provider(),payload=await signOnchainQR({...config,injected:p.injected});
 assert.equal(payload.mode,'onchain');assert.equal(payload.message.expiresAt-payload.message.issuedAt,QR_TTL);
 const verified=await verifyOnchainQR({input:JSON.stringify(payload),...config,injected:p.injected});
 assert.equal(verified.signer,p.state.wallet.address);assert.equal(verified.tokenId,'2');assert.equal(verified.blockNumber,16);
});
test('a non-owner cannot request a typed-data signature',async()=>{
 const p=provider({owner:Wallet.createRandom().address});await assert.rejects(()=>signOnchainQR({...config,injected:p.injected}),/bukan pemilik/);
 assert(!p.state.requests.includes('eth_signTypedData_v4'));
});
test('signature is discarded if ownership changes while the wallet prompt is open',async()=>{
 const p=provider({onSign:s=>s.owner=Wallet.createRandom().address});
 await assert.rejects(()=>signOnchainQR({...config,injected:p.injected}),/pemilik QR tidak cocok/);
});
test('signature is discarded if account or network changes while signing',async()=>{
 const a=provider({onSign:s=>s.wallet=Wallet.createRandom()});await assert.rejects(()=>signOnchainQR({...config,injected:a.injected}),/Akun wallet berubah/);
 const n=provider({onSign:s=>s.chainId=1});await assert.rejects(()=>signOnchainQR({...config,injected:n.injected}),/Sepolia/);
});
test('signed QR from another token or event is rejected before RPC',async()=>{
 const p=provider(),payload=await signOnchainQR({...config,injected:p.injected});p.state.requests=[];
 await assert.rejects(()=>verifyOnchainQR({input:JSON.stringify(payload),...config,tokenId:'3',injected:p.injected}),/berbeda/);
 await assert.rejects(()=>verifyOnchainQR({input:JSON.stringify(payload),...config,eventId:'9',injected:p.injected}),/berbeda/);
 assert.equal(p.state.requests.length,0);
});
test('ownership transfer invalidates the previous owner signature',async()=>{
 const p=provider(),payload=await signOnchainQR({...config,injected:p.injected});p.state.owner=Wallet.createRandom().address;
 await assert.rejects(()=>verifyOnchainQR({input:JSON.stringify(payload),...config,injected:p.injected}),/pemilik QR tidak cocok/);
});
test('signed QR schema rejects demo mode, malformed nonce/signature, and oversize JSON',async()=>{
 const p=provider(),payload=await signOnchainQR({...config,injected:p.injected});
 for(const changed of [{...payload,mode:'demo'},{...payload,chainId:1},{...payload,signature:'0x123'},{...payload,message:{...payload.message,nonce:'0x'+'1'.repeat(63)}},{...payload,message:{...payload.message,issuedAt:'1000'}}])assert.throws(()=>parseSignedQR(JSON.stringify(changed)));
 assert.throws(()=>parseSignedQR('x'.repeat(8193)));assert.throws(()=>parseSignedQR('not json'));
});
test('a correctly signed expired or future QR still fails validation',async()=>{
 const w=Wallet.createRandom(),message={eventId:'1',tokenId:'2',owner:w.address,issuedAt:1000,expiresAt:1120,nonce:'0x'+'f'.repeat(64)},signature=await w.signTypedData(qrDomain(contract),QR_TYPES,message),payload={v:1,mode:'onchain',chainId:CHAIN_ID,contract,message,signature};
 const options={...config,owner:w.address};assert.throws(()=>validateSignedQR(payload,{...options,now:1120}),/kedaluwarsa/);assert.throws(()=>validateSignedQR(payload,{...options,now:999}),/belum berlaku/);assert.throws(()=>validateSignedQR(payload,{...options,tokenId:'3',now:1001}),/token/);
});
test('network switch checks the resulting chain instead of assuming success',async()=>{
 const p=provider({chainId:1});await switchToSepolia(p.injected);assert.equal(p.state.chainId,CHAIN_ID);
 const bad={request:async({method})=>method==='eth_chainId'?'0x1':null};await assert.rejects(()=>switchToSepolia(bad),/Sepolia/);
});
