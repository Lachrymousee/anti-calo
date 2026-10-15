import { seedState, ACCOUNTS, sameAddress } from './model.js';
const KEY='tiketra-demo-v1';
export class DemoStore {
 constructor(storage=globalThis.localStorage){this.storage=storage;this.canPersist=true;this.state=this.load();}
 load(){try{const raw=this.storage?.getItem(KEY);if(raw){const s=JSON.parse(raw);if(s.version===1&&Array.isArray(s.events)&&Array.isArray(s.accounts)&&Array.isArray(s.tickets)&&s.proofs&&Array.isArray(s.activities)){const admin=s.accounts.find(a=>sameAddress(a.address,ACCOUNTS.admin.address));if(admin?.name==='Admin Tiketra')admin.name=ACCOUNTS.admin.name;return s;}}}catch{this.canPersist=false;}return seedState();}
 save(){try{this.storage?.setItem(KEY,JSON.stringify(this.state));}catch{this.canPersist=false;}}
 update(fn){const next=structuredClone(this.state);const result=fn(next);this.state=next;this.save();return result;}
 reset(){this.state=seedState();this.save();}
 refresh(){this.state=this.load();}
}
export const DEMO_STORAGE_KEY=KEY;
export function activeAccount(state,session='buyer') {const base=ACCOUNTS[session]??ACCOUNTS.buyer;return state.accounts.find(a=>sameAddress(a.address,base.address))??base;}
