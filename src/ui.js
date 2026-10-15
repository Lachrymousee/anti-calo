export function el(tag,attrs={},...children){
 const node=document.createElement(tag);
 for(const [key,val] of Object.entries(attrs??{})){
  if(val===false||val==null)continue;
  if(key.startsWith('on')&&typeof val==='function')node.addEventListener(key.slice(2).toLowerCase(),val);
  else if(key==='class')node.className=val;
  else if(key==='value')node.value=val;
  else if(key==='checked')node.checked=!!val;
  else if(key==='disabled')node.disabled=!!val;
  else node.setAttribute(key,val===true?'':String(val));
 }
 function append(c){if(c==null||c===false)return;if(Array.isArray(c))c.forEach(append);else node.append(c instanceof Node?c:document.createTextNode(String(c)));}
 children.forEach(append);return node;
}
const PATHS={
 arrow:'M4 12h15m-6-6 6 6-6 6',arrowUp:'M6 18 18 6M6 6h12v12',chevron:'m9 5 7 7-7 7',down:'m6 9 6 6 6-6',
 search:'m21 21-4.4-4.4M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
 pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2',
 ticket:'M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Zm13 2v2m0 2v2m0 2v2',
 shield:'m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6l9-4Zm-4 10 3 3 5-6',
 wallet:'M4 5h15v3M3 8h18v13H3V5l15-3v6M21 12h-6v5h6m-4-2.5h.01',
 heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8',
 close:'m6 6 12 12M6 18 18 6',check:'m5 12 4 4L19 6',clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
 grid:'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
 users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0m4-3.9a4 4 0 0 1 0 7.8',
 qr:'M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h3v3h3v3h-6v-6zm6-3v3m-9 6v-3m0-6h3',
 plus:'M12 5v14M5 12h14',copy:'M9 9h12v12H9zM15 3H3v12',refresh:'M20 7a8 8 0 1 0 1 8M20 2v5h-5',
 external:'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',info:'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
 camera:'M3 6h5l2-3h4l2 3h5v15H3V6Zm13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
 chart:'M3 3v18h18M7 15v2m5-7v7m5-12v12',coins:'M20 6c0 2-4 4-8 4s-8-2-8-4 4-4 8-4 8 2 8 4Zm0 0v6c0 2-4 4-8 4s-8-2-8-4V6m16 6v6c0 2-4 4-8 4s-8-2-8-4v-6',book:'M12 5c-3-2-6-2-10-1v16c4-1 7-1 10 1m0-16c3-2 6-2 10-1v16c-4-1-7-1-10 1V5',
 logout:'M9 4H3v16h6m7-13 5 5-5 5M9 12h12',spark:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7',
};
export function icon(name,size=20){const n=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const [k,v]of Object.entries({viewBox:'0 0 24 24',width:size,height:size,fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))n.setAttribute(k,v);const p=document.createElementNS(n.namespaceURI,'path');p.setAttribute('d',PATHS[name]??PATHS.info);n.append(p);n.classList.add('icon');return n;}
export function toast(message,type='success'){const container=document.getElementById('toasts');const n=el('div',{class:`toast ${type}`},icon(type==='error'?'info':'check'),el('span',{},message));container.append(n);setTimeout(()=>n.remove(),5000);}
export function button(label,action,{kind='primary',iconName,...attrs}={}){
 return el('button',{type:'button',class:`btn btn-${kind}`,...attrs,onclick:async e=>{const b=e.currentTarget;if(b.disabled)return;b.disabled=true;try{await action?.(e);}catch(err){toast(err.message??'Tindakan belum berhasil.','error');}finally{if(b.isConnected)b.disabled=false;}}},iconName?icon(iconName):null,label);
}
export function link(label,href,{kind='',iconName,...attrs}={}){return el('a',{href,class:kind?`btn btn-${kind}`:'',...attrs},iconName?icon(iconName):null,label);}
export function badge(text,kind='neutral'){return el('span',{class:`badge badge-${kind}`},text);}
let modalCleanup=null;
export function openModal(title,content,{wide=false,onClose}={}){
 const d=document.getElementById('modal');modalCleanup?.();if(d.open)d.close();d.replaceChildren();d.className=wide?'modal wide':'modal';
 d.append(el('div',{class:'modal-head'},el('h2',{id:'modal-title'},title),button('',()=>d.close(),{kind:'icon',iconName:'close','aria-label':'Tutup dialog'})),el('div',{class:'modal-body'},content));
 const cleanup=()=>{document.body.classList.remove('dialog-open');d.removeEventListener('close',onClosed);onClose?.();if(modalCleanup===cleanup)modalCleanup=null;};const onClosed=()=>{if(!d.open)cleanup();};modalCleanup=cleanup;d.addEventListener('close',onClosed);
 d.onclick=e=>{if(e.target===d)d.close();};if(d.showModal)d.showModal();else d.setAttribute('open','');document.body.classList.add('dialog-open');return d;
}
export function shortAddress(a){return a?a.slice(0,6)+'…'+a.slice(-4):'—';}
export function dateText(value,full=false){return new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:full?'long':'short',year:full?'numeric':undefined}).format(new Date(value));}
export function timeText(value){return new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)).replace('.',':')+' WIB';}
export function money(value){return `${value} ETH`;}
export const STATUS={live:['Aktif','green'],draft:['Draft','neutral'],suspended:['Ditangguhkan','amber'],cancelled:['Dibatalkan','red'],active:['Aktif','green'],listed:['Dijual kembali','amber'],used:['Sudah digunakan','neutral']};
export function statusBadge(status){return badge(...(STATUS[status]??[status,'neutral']));}
export function field(label,input,hint){const id=input.id||('field-'+crypto.randomUUID());input.id=id;return el('div',{class:'form-field'},el('label',{for:id},label),input,hint?el('p',{class:'field-hint'},hint):null);}
export function emptyState(title,description,action){return el('div',{class:'empty-state'},el('span',{class:'empty-icon'},icon('ticket',30)),el('h3',{},title),el('p',{},description),action);}
