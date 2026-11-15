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
test('Docs preserves README sections, tables, code blocks, and contents anchors',async()=>{
  setup('https://example.test/docs.html#docs-deployment-sepolia');
  const source=await readFile(new URL('../README.md',import.meta.url),'utf8'),page=createDocsPage();document.body.append(page.main);
  const sections=[...source.matchAll(/^## (.+)$/gm)].map(m=>m[1]);
  assert.equal(document.querySelectorAll('.docs-content h2').length,sections.length);
  assert.equal(document.querySelectorAll('.docs-toc nav a').length,sections.length);
  for(const a of document.querySelectorAll('.docs-toc nav a'))assert(document.getElementById(a.getAttribute('href').slice(1)));
  assert(document.querySelector('.docs-toc a[aria-current=location]').href.endsWith('#docs-deployment-sepolia'));
  assert(document.querySelectorAll('.docs-content table').length>=2);
  assert.equal(document.querySelectorAll('.docs-content pre').length,[...source.matchAll(/^\s*```/gm)].length/2);
  assert(document.querySelector('.docs-content').textContent.includes('0x093c1D62871Ecd9b2927155Dfee71a3e87A1cD14'));
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
