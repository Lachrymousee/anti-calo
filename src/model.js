export const CHAIN_ID = 11155111;
export const QR_TTL = 120;
export const DEMO_CONTRACT = 'demo-only';
export const ACCOUNTS = {
  buyer: { name: 'Alya', address: '0x1111111111111111111111111111111111111111', role: 'buyer' },
  organizer: { name: 'Nusa Collective', address: '0x2222222222222222222222222222222222222222', role: 'organizer' },
  admin: { name: 'Admin anti-calo', address: '0x3333333333333333333333333333333333333333', role: 'admin' },
  gate: { name: 'Raka', address: '0x4444444444444444444444444444444444444444', role: 'gate' },
};
const B = ACCOUNTS.buyer.address, O = ACCOUNTS.organizer.address, G = ACCOUNTS.gate.address;
export const CATEGORIES = ['Semua', 'Musik', 'Seni & budaya', 'Teknologi', 'Lifestyle'];
const specs = [
  ['nusa', 'Nusa Sound Festival', 'Musik', '2026-11-07T16:00:00+07:00', 'Jakarta', 'Gelora Bung Karno', 'Satu panggung, beragam suara. Rayakan musik independen bersama musisi dan komunitas dari seluruh Indonesia.', '0.012', 1500, 842, 142, 'nusa.svg'],
  ['design', 'Jakarta Design Week', 'Seni & budaya', '2026-11-14T10:00:00+07:00', 'Jakarta', 'M Bloc Space', 'Eksplorasi desain, instalasi, dan ide-ide segar. Bertemu kreator, ikuti lokakarya, dan temukan inspirasi baru.', '0.008', 500, 328, 46, 'design.svg'],
  ['web3', 'Web3 Builders Day', 'Teknologi', '2026-11-21T09:00:00+07:00', 'Bandung', 'The Hall, Bandung', 'Sehari untuk membangun, berdiskusi, dan berjejaring. Dari ide smart contract hingga demo dApp pertama kamu.', '0.005', 350, 216, 12, 'web3.svg'],
  ['jazz', 'Midnight Jazz Session', 'Musik', '2026-11-28T19:00:00+07:00', 'Jakarta', 'The Sounds Project Studio', 'Malam yang pelan, musik yang hangat. Nikmati sesi intim jazz bersama talenta lokal dan tamu spesial.', '0.009', 240, 164, 0, 'jazz.svg'],
  ['coffee', 'Coffee Culture Festival', 'Lifestyle', '2026-11-22T10:00:00+07:00', 'Bandung', 'Gudang Selatan', 'Temukan cerita di balik setiap cangkir. Cupping, brewing, dan perjumpaan dengan roaster pilihan.', '0.004', 600, 290, 0, 'coffee.svg'],
  ['film', 'Indie Film Weekend', 'Seni & budaya', '2026-11-29T13:00:00+07:00', 'Yogyakarta', 'Jogja National Museum', 'Cerita berbeda di layar yang sama. Pemutaran film pendek, bincang sutradara, dan ruang untuk perspektif baru.', '0.006', 400, 182, 0, 'film.svg'],
];
export function seedState() {
  return {
    version: 1,
    events: specs.map(([id,title,category,date,city,venue,description,price,capacity,sold,checkedIn,art]) => ({id,title,category,date,city,venue,description,price,capacity,sold,checkedIn,art,status:'live',organizer:O,checkers:[G]})),
    accounts: Object.values(ACCOUNTS).map(a=>({...a})),
    tickets: [
      {id:'1001',eventId:'nusa',owner:B,facePrice:'0.012',status:'active',purchasedAt:'2026-10-12T08:30:00Z'},
      {id:'1002',eventId:'web3',owner:B,facePrice:'0.005',status:'active',purchasedAt:'2026-10-11T08:30:00Z'},
      {id:'1003',eventId:'design',owner:'0x5555555555555555555555555555555555555555',facePrice:'0.008',resalePrice:'0.007',status:'listed',purchasedAt:'2026-10-10T08:30:00Z'},
    ],
    proofs: {}, nextToken:1004,
    activities: [{id:'initial',type:'info',text:'Demo siap digunakan. Dua tiket tersedia di akun Alya.',at:new Date().toISOString()}],
  };
}
export const sameAddress=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export function roleOf(state,address) { return state.accounts.find(a=>sameAddress(a.address,address))?.role ?? 'buyer'; }
function requireRole(s,a,role) { if(roleOf(s,a)!==role) throw Error('Akun ini tidak memiliki izin untuk tindakan tersebut.'); }
export function eventOf(s,id) { const e=s.events.find(e=>e.id===id); if(!e)throw Error('Event tidak ditemukan.'); return e; }
export function ticketOf(s,id) { const t=s.tickets.find(t=>t.id===String(id)); if(!t)throw Error('Token tiket tidak ditemukan.'); return t; }
function liveEvent(s,id) {const e=eventOf(s,id);if(e.status!=='live')throw Error('Event ini tidak aktif. Pembelian dan check-in dihentikan.');return e;}
function owner(s,a,id) {const t=ticketOf(s,id);if(!sameAddress(t.owner,a))throw Error('Tiket ini bukan milik wallet yang sedang digunakan.');return t;}
export function parseEth(value) {
 const str=String(value).trim();
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(str)||str.length>40)throw Error('Harga harus berupa angka ETH positif, maksimal 18 desimal.');
 const [whole,fraction='']=str.split('.');return BigInt(whole)*10n**18n+BigInt(fraction.padEnd(18,'0'));
}
function activity(s,type,text) {s.activities.unshift({id:crypto.randomUUID(),type,text,at:new Date().toISOString()});s.activities=s.activities.slice(0,40);}
export function purchase(s,a,eventId) {
 const e=liveEvent(s,eventId);if(e.sold>=e.capacity)throw Error('Tiket untuk event ini sudah habis.');
 const t={id:String(s.nextToken++),eventId,owner:a,facePrice:e.price,status:'active',purchasedAt:new Date().toISOString()};s.tickets.push(t);e.sold++;
 activity(s,'purchase',`Tiket #${t.id} untuk ${e.title} berhasil dibeli (demo).`);return t;
}
export function listResale(s,a,id,price) {
 const t=owner(s,a,id);liveEvent(s,t.eventId);if(t.status!=='active')throw Error('Hanya tiket aktif yang dapat dijual kembali.');
 const p=parseEth(price);if(p<=0n||p>parseEth(t.facePrice))throw Error(`Harga resale harus lebih dari 0 dan tidak melebihi ${t.facePrice} ETH.`);
 t.status='listed';t.resalePrice=String(price).trim();delete s.proofs[t.id];activity(s,'resale',`Tiket #${id} ditawarkan di pasar resale.`);return t;
}
export function withdrawResale(s,a,id) {const t=owner(s,a,id);if(t.status!=='listed')throw Error('Tiket tidak sedang ditawarkan.');t.status='active';delete t.resalePrice;delete s.proofs[t.id];activity(s,'resale',`Penawaran tiket #${id} dibatalkan.`);}
export function buyResale(s,a,id) {
 const t=ticketOf(s,id);liveEvent(s,t.eventId);if(t.status!=='listed')throw Error('Penawaran sudah tidak tersedia.');if(sameAddress(t.owner,a))throw Error('Kamu tidak dapat membeli tiket milik sendiri.');
 if(parseEth(t.resalePrice)>parseEth(t.facePrice)||parseEth(t.resalePrice)<=0n)throw Error('Harga resale tidak valid.');
 t.owner=a;t.status='active';delete t.resalePrice;delete s.proofs[t.id];t.purchasedAt=new Date().toISOString();activity(s,'purchase',`Kepemilikan tiket #${id} berpindah melalui resale (demo).`);return t;
}
function nonce(){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return [...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function issueProof(s,a,id,now=Math.floor(Date.now()/1000)) {
 const t=owner(s,a,id);liveEvent(s,t.eventId);if(t.status!=='active')throw Error('QR hanya dapat dibuat untuk tiket aktif yang tidak sedang dijual.');
 const p={v:1,mode:'demo',chainId:CHAIN_ID,contract:DEMO_CONTRACT,eventId:t.eventId,tokenId:t.id,owner:t.owner,issuedAt:now,expiresAt:now+QR_TTL,nonce:nonce()};s.proofs[t.id]=p;return {...p};
}
export function parseProof(input) {
 if(typeof input!=='string'||input.length>4096)throw Error('Payload QR terlalu besar atau tidak valid.');
 let p;try{p=JSON.parse(input);}catch{throw Error('Format QR tidak valid. Tempel payload JSON dari halaman tiket.');}
 if(!p||Array.isArray(p)||p.v!==1||p.mode!=='demo'||p.chainId!==CHAIN_ID||p.contract!==DEMO_CONTRACT||typeof p.eventId!=='string'||typeof p.tokenId!=='string'||!/^\d{1,78}$/.test(p.tokenId)||!/^0x[\da-fA-F]{40}$/.test(p.owner??'')||!Number.isSafeInteger(p.issuedAt)||!Number.isSafeInteger(p.expiresAt)||!/^[\da-f]{32}$/.test(p.nonce??''))throw Error('QR tidak cocok dengan format demo anti-calo.');
 return p;
}
export function verifyProof(s,checker,selectedEvent,input,now=Math.floor(Date.now()/1000)) {
 requireRole(s,checker,'gate');const p=parseProof(input),e=liveEvent(s,selectedEvent);
 if(!e.checkers.some(a=>sameAddress(a,checker)))throw Error('Petugas ini tidak ditugaskan ke event yang dipilih.');
 if(p.eventId!==selectedEvent)throw Error('QR berasal dari event lain.');
 if(p.issuedAt>now||p.expiresAt<=now||p.expiresAt-p.issuedAt!==QR_TTL)throw Error('QR sudah kedaluwarsa atau waktunya tidak valid. Minta pemilik membuat ulang.');
 const t=ticketOf(s,p.tokenId);if(t.eventId!==selectedEvent)throw Error('Token tidak cocok dengan event.');
 if(t.status==='used')throw Error('Tiket sudah digunakan untuk check-in.');if(t.status!=='active')throw Error('Tiket sedang dijual dan tidak dapat dipakai masuk.');
 if(!sameAddress(t.owner,p.owner))throw Error('Kepemilikan tiket sudah berubah. QR ini tidak berlaku.');
 const saved=s.proofs[t.id];if(!saved||JSON.stringify(saved)!==JSON.stringify(p))throw Error('QR tidak dikenali atau sudah diganti dengan QR baru.');
 return {ticket:t,event:e,proof:p};
}
export function checkIn(s,checker,eventId,input,now=Math.floor(Date.now()/1000)) {
 const result=verifyProof(s,checker,eventId,input,now);result.ticket.status='used';result.ticket.checkedInAt=new Date().toISOString();result.event.checkedIn++;delete s.proofs[result.ticket.id];
 activity(s,'checkin',`Tiket #${result.ticket.id} berhasil check-in di ${result.event.title}.`);return result.ticket;
}
export function assignRole(s,admin,address,role,name='Wallet baru') {
 requireRole(s,admin,'admin');if(!/^0x[\da-fA-F]{40}$/.test(address)||/^0x0{40}$/i.test(address))throw Error('Masukkan alamat wallet Ethereum yang valid.');
 if(!['organizer','gate'].includes(role))throw Error('Role yang dapat diberikan: Organizer atau Gate Checker.');
 const existing=s.accounts.find(a=>sameAddress(a.address,address));if(existing&&existing.role!=='buyer')throw Error('Wallet sudah memiliki satu role khusus. Cabut role lama terlebih dahulu.');
 if(existing)existing.role=role;else s.accounts.push({address,name:name.trim().slice(0,60)||'Wallet baru',role});activity(s,'role',`Role ${role} diberikan ke ${address.slice(0,8)}…`);
}
export function revokeRole(s,admin,address) {
 requireRole(s,admin,'admin');const account=s.accounts.find(a=>sameAddress(a.address,address));if(!account||!['organizer','gate'].includes(account.role))throw Error('Role ini tidak dapat dicabut melalui demo.');
 if(account.role==='organizer'&&s.events.some(e=>sameAddress(e.organizer,address)&&['live','draft','suspended'].includes(e.status)))throw Error('Organizer masih memiliki event. Selesaikan pengelolaan event terlebih dahulu.');
 account.role='buyer';s.events.forEach(e=>e.checkers=e.checkers.filter(a=>!sameAddress(a,address)));activity(s,'role',`Role khusus ${address.slice(0,8)}… dicabut.`);
}
export function assignChecker(s,organizer,eventId,address,remove=false) {
 requireRole(s,organizer,'organizer');const e=eventOf(s,eventId);if(!sameAddress(e.organizer,organizer))throw Error('Event ini bukan milik Organizer yang sedang digunakan.');
 if(e.status==='cancelled')throw Error('Event yang dibatalkan tidak dapat diubah.');
 if(remove){e.checkers=e.checkers.filter(a=>!sameAddress(a,address));}
 else{if(roleOf(s,address)!=='gate')throw Error('Admin harus memberikan role Gate Checker terlebih dahulu.');if(e.checkers.some(a=>sameAddress(a,address)))throw Error('Petugas sudah ditugaskan.');e.checkers.push(address);}
 activity(s,'assignment',`Penugasan petugas untuk ${e.title} diperbarui.`);
}
export function changeEventStatus(s,actor,id,status) {
 const e=eventOf(s,id),r=roleOf(s,actor);
 if(e.status==='cancelled')throw Error('Event yang dibatalkan tidak dapat diaktifkan kembali.');
 if(r==='admin'){
  const valid=(status==='suspended'&&e.status==='live')||(status==='live'&&e.status==='suspended')||(status==='cancelled'&&['live','suspended','draft'].includes(e.status));
  if(!valid)throw Error('Perubahan status tidak diizinkan. Admin tidak dapat menerbitkan draft.');
 }else if(!(r==='organizer'&&sameAddress(e.organizer,actor)&&e.status==='draft'&&status==='live'))throw Error('Hanya pemilik Organizer yang dapat menerbitkan draft.');
 e.status=status;if(status!=='live')for(const t of s.tickets.filter(t=>t.eventId===id))delete s.proofs[t.id];activity(s,'event',`Status ${e.title} diperbarui menjadi ${status}.`);
}
export function saveEvent(s,organizer,data,id) {
 requireRole(s,organizer,'organizer');let e=id?eventOf(s,id):null;if(e&&(!sameAddress(e.organizer,organizer)||e.status!=='draft'))throw Error('Demo hanya mengizinkan pengeditan draft milik Organizer.');
 const title=String(data.title??'').trim(),venue=String(data.venue??'').trim(),city=String(data.city??'').trim(),description=String(data.description??'').trim();
 if(title.length<3||title.length>100||!venue||!city||description.length>2000||!CATEGORIES.slice(1).includes(data.category))throw Error('Lengkapi nama, kategori, kota, dan lokasi event dengan benar.');
 const date=new Date(data.date),capacity=Number(data.capacity);if(!Number.isFinite(date.getTime())||date.getTime()<=Date.now())throw Error('Tanggal event harus berada di masa depan.');
 if(!Number.isSafeInteger(capacity)||capacity<1||capacity>100000)throw Error('Kapasitas harus antara 1 dan 100.000 tiket.');if(parseEth(data.price)<=0n)throw Error('Harga tiket harus lebih dari 0 ETH.');
 const fields={title,venue,city,description,category:data.category,date:date.toISOString(),capacity,price:String(data.price).trim()};
 if(e)Object.assign(e,fields);else{e={...fields,id:crypto.randomUUID(),organizer,status:'draft',sold:0,checkedIn:0,checkers:[],art:'design.svg'};s.events.unshift(e);}
 activity(s,'event',`Draft ${title} disimpan.`);return e;
}
