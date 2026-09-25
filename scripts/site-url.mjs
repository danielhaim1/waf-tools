export const DEFAULT_SITE_URL = 'https://danielhaim1.github.io/waf-tools/';

export function siteUrl(value = DEFAULT_SITE_URL) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('SITE_URL must be an HTTP(S) URL without credentials.');
  }
  if (url.search || url.hash) throw new Error('SITE_URL must not contain a query or fragment.');
  url.pathname = url.pathname.replace(/\/+$/, '') + '/';
  return url.href;
}

export function renderSiteHtml(html, value) {
  // Escape the deployment URL before inserting it into quoted HTML attributes.
  const escaped = siteUrl(value).replace(/[&"'<>]/g, (character) => {
    return {
      '&': '&amp;',
      '"': '&quot;',
      "'": '&#39;',
      '<': '&lt;',
      '>': '&gt;',
    }[character];
  });
  return html.replaceAll(DEFAULT_SITE_URL, escaped);
}
