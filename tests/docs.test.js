import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createDocsPage, renderMarkdown } from '../src/docs.js';
let last;
function setup(url='https://example.test/docs.html') {
  last?.window.close();
  const dom=new JSDOM('<!doctype html><body></body>',{url});last=dom;
  Object.defineProperties(globalThis,{window:{value:dom.window,configurable:true},document:{value:dom.window.document,configurable:true},Node:{value:dom.window.Node,configurable:true}});return dom;
}
test('Docs preserves every README section, table, and code block and exposes working contents anchors',async()=>{
  setup('https://example.test/docs.html#docs-yang-dibutuhkan-dari-tim-smart-contract');
  const source=await readFile(new URL('../README.md',import.meta.url),'utf8'),page=createDocsPage();document.body.append(page.main);
  const sections=[...source.matchAll(/^## (.+)$/gm)].map(m=>m[1]);
  assert.equal(document.querySelectorAll('.docs-content h2').length,sections.length);
  assert.equal(document.querySelectorAll('.docs-toc nav a').length,sections.length);
  for(const a of document.querySelectorAll('.docs-toc nav a'))assert(document.getElementById(a.getAttribute('href').slice(1)));
  assert(document.querySelector('.docs-toc a[aria-current=location]').href.endsWith('#docs-yang-dibutuhkan-dari-tim-smart-contract'));
  assert(document.querySelectorAll('.docs-content table').length>=4);
  assert.equal(document.querySelectorAll('.docs-content pre').length,[...source.matchAll(/^```/gm)].length/2);
  assert(document.querySelector('.docs-content').textContent.includes('0x1111111111111111111111111111111111111111'));
  assert(document.querySelector('.docs-content').textContent.includes('npm run dev'));
  assert(document.querySelector('.docs-content code').textContent.length>0);
  page.cleanup();
});
test('Markdown is rendered as text and dangerous links or HTML cannot execute',()=>{
  setup();
  const {article}=renderMarkdown('# Test\n\n<img src=x onerror="window.injected=true">\n\n[Klik](javascript:alert) [Data](data:text/html,<svg>) [File](file:///etc/passwd) [Aman](https://example.org/)\n\n```html\n<script>alert(1)</script>\n```');
  document.body.append(article);
  assert.equal(document.querySelector('img'),null);assert.equal(document.querySelector('script'),null);assert.equal(document.querySelector('svg'),null);
  assert(article.textContent.includes('<img src=x'));assert(article.textContent.includes('<script>alert(1)</script>'));
  assert.equal(document.querySelectorAll('a').length,1);assert.equal(document.querySelector('a').getAttribute('href'),'https://example.org/');
  assert.equal(document.querySelector('a').getAttribute('rel'),'noopener noreferrer');assert.equal(window.injected,undefined);last.window.close();
});
