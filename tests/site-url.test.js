import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DEFAULT_SITE_URL, renderSiteHtml, siteUrl } from '../scripts/site-url.mjs';

test('site URLs support project paths and custom domains with a trailing slash', () => {
  assert.equal(siteUrl(), DEFAULT_SITE_URL);
  assert.equal(siteUrl('https://owner.github.io/project'), 'https://owner.github.io/project/');
  assert.equal(siteUrl('https://tools.test/'), 'https://tools.test/');
  assert.equal(
    siteUrl('https://private-site.pages.github.io'),
    'https://private-site.pages.github.io/'
  );
});

test('site URLs reject invalid deployment locations', () => {
  for (const value of [
    '',
    '/project',
    'javascript:alert(1)',
    'https://user:pass@tools.test',
    'https://tools.test/?query=1',
    'https://tools.test/#fragment',
  ]) {
    assert.throws(() => siteUrl(value));
  }
});

test('deployment replaces all metadata URLs and preserves relative assets and repository links', async () => {
  const source = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
  const html = renderSiteHtml(source, 'https://owner.github.io/project');
  assert.equal((html.match(/https:\/\/owner.github.io\/project\//g) || []).length, 3);
  assert.ok(!html.includes(DEFAULT_SITE_URL));
  assert.ok(!html.includes('example.com'));
  assert.ok(html.includes('href="https://github.com/danielhaim1/waf-tools"'));
  assert.ok(html.includes('src="./assets/js/app.js"'));
  assert.ok(html.includes('href="./assets/css/styles.css"'));
  assert.equal(renderSiteHtml(source), source);
});

test('site URL attributes escape HTML characters', () => {
  assert.equal(
    renderSiteHtml(`<link href="${DEFAULT_SITE_URL}">`, "https://tools.test/a&b'c"),
    '<link href="https://tools.test/a&amp;b&#39;c/">'
  );
});
