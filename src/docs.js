import { el, icon, link } from './ui.js';
import documentation from './docs-content.js';

function safeHref(value) {
  try {
    const url = new URL(value, 'https://anti-calo.local/');
    return ['http:', 'https:'].includes(url.protocol) ? value : null;
  } catch { return null; }
}
export function inlineMarkdown(value) {
  const result = [], pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^\s)]+)\)|(https?:\/\/[^\s<>()]+)/g;
  let last = 0;
  for (const m of value.matchAll(pattern)) {
    if (m.index > last) result.push(value.slice(last, m.index));
    if (m[1] !== undefined) result.push(el('code', {}, m[1]));
    else if (m[2] !== undefined) result.push(el('strong', {}, ...inlineMarkdown(m[2])));
    else {
      const label = m[3] ?? m[5], raw = m[4] ?? m[5], href = safeHref(raw);
      result.push(href ? el('a', { href, ...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {}) }, label) : label);
    }
    last = m.index + m[0].length;
  }
  if (last < value.length) result.push(value.slice(last));
  return result;
}
const heading = line => /^(#{1,6})\s+(.+)$/.exec(line);
const list = line => /^\s*([-*+]|\d+\.)\s+(.+)$/.exec(line);
const separator = line => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
function cells(line) { return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()); }
export function renderMarkdown(markdown, { skipTitle = false } = {}) {
  const article = el('article', { class: 'docs-content' }), headings = [], used = new Map();
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let i = 0, skipped = false, currentTitle = 'Dokumentasi';
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*```/.test(line)) {
      const language = line.trim().slice(3).trim(), code = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      article.append(el('div', { class: 'docs-code' }, el('div', { class: 'docs-code-label' }, language || 'code'), el('pre', {}, el('code', {}, code.join('\n')))));
      continue;
    }
    const h = heading(line);
    if (h) {
      i++; const level = h[1].length, title = h[2];
      if (skipTitle && level === 1 && !skipped) { skipped = true; continue; }
      const slug = title.replace(/^\d+\.\s*/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bagian';
      const repeat = used.get(slug) ?? 0; used.set(slug, repeat + 1);
      const id = `docs-${slug}${repeat ? '-' + repeat : ''}`;
      article.append(el('h' + level, { id }, ...inlineMarkdown(title)));
      headings.push({ level, title, id }); currentTitle = title; continue;
    }
    if (i + 1 < lines.length && line.includes('|') && separator(lines[i + 1])) {
      const header = cells(line), rows = []; i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(cells(lines[i++]));
      article.append(el('div', { class: 'docs-table-wrap', tabindex: '0', 'aria-label': currentTitle + ', tabel dapat digeser' }, el('table', {},
        el('thead', {}, el('tr', {}, header.map(c => el('th', { scope: 'col' }, ...inlineMarkdown(c))))),
        el('tbody', {}, rows.map(row => el('tr', {}, header.map((_, index) => el('td', {}, ...inlineMarkdown(row[index] ?? '')))))))));
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quoted = []; while (i < lines.length && /^>\s?/.test(lines[i])) quoted.push(lines[i++].replace(/^>\s?/, ''));
      article.append(el('blockquote', {}, icon('info'), el('p', {}, ...inlineMarkdown(quoted.join(' '))))); continue;
    }
    const item = list(line);
    if (item) {
      const ordered = /^\d/.test(item[1]), listNode = el(ordered ? 'ol' : 'ul', ordered ? { start: parseInt(item[1], 10) } : {});
      while (i < lines.length) {
        const next = list(lines[i]); if (!next || /^\d/.test(next[1]) !== ordered) break;
        listNode.append(el('li', {}, ...inlineMarkdown(next[2]))); i++;
      }
      article.append(listNode); continue;
    }
    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) { article.append(el('hr')); i++; continue; }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !heading(lines[i]) && !list(lines[i]) && !/^\s*(?:```|>)/.test(lines[i]) && !(i + 1 < lines.length && lines[i].includes('|') && separator(lines[i + 1]))) paragraph.push(lines[i++]);
    article.append(el('p', {}, ...inlineMarkdown(paragraph.join(' '))));
  }
  return { article, headings };
}
export function createDocsPage() {
  const rendered = renderMarkdown(documentation, { skipTitle: true }), sections = rendered.headings.filter(h => h.level === 2);
  const media = window.matchMedia?.('(min-width: 851px)');
  const toc = el('details', { class: 'docs-toc', open: media?.matches ?? true }, el('summary', {}, icon('book', 18), 'Daftar isi', icon('down', 16)),
    el('nav', { 'aria-label': 'Daftar isi dokumentasi' }, sections.map(h => link(h.title, '#' + h.id))));
  const layout = el('div', { class: 'docs-layout' }, el('aside', {}, toc), rendered.article);
  const main = el('main', { id: 'main', class: 'container docs-page' },
    el('div', { class: 'docs-heading' }, el('div', { class: 'eyebrow' }, 'DOKUMENTASI ANTI-CALO'), el('h1', {}, 'Semua panduan, di satu tempat.'),
      el('p', { class: 'muted' }, 'Fitur website, aturan akses, cara menjalankan, dan kebutuhan integrasi blockchain.'),
      el('div', { class: 'docs-heading-links' }, link('Cara kerja', 'guide.html', { kind: 'outline', iconName: 'book' }), link('Lab Sepolia', 'integration.html', { kind: 'outline', iconName: 'wallet' }))), layout);
  function markCurrent() {
    const id = window.location.hash || '#' + sections[0]?.id;
    for (const a of toc.querySelectorAll('a')) {
      const active = a.getAttribute('href') === id; a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
    }
  }
  const onMediaChange = e => { toc.open = e.matches; };
  media?.addEventListener?.('change', onMediaChange); window.addEventListener('hashchange', markCurrent); markCurrent();
  return { main, cleanup: () => { media?.removeEventListener?.('change', onMediaChange); window.removeEventListener('hashchange', markCurrent); } };
}
