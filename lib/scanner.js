// Discovery scan: checks a public website for the signals that help
// Google and AI assistants find, understand and recommend a business.
// Every check is evidence-based: if a check can't run, it is marked
// "not checked" instead of guessing.
const dns = require('dns').promises;
const net = require('net');
const log = require('./log');

const UA = 'QueryTrendsSocialAutopilot/1.0 (+https://querytrends.ai)';
const TIMEOUT_MS = 15000;
const MAX_BYTES = 3 * 1024 * 1024;
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended'];

// ---------- safety: only scan real public websites ----------
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('::ffff:127.');
}

async function normalizeUrl(input) {
  let raw = String(input || '').trim();
  if (!raw) throw new Error('Please enter a website address.');
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  let url;
  try { url = new URL(raw); } catch { throw new Error('That does not look like a website address.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http and https websites can be scanned.');
  const { address } = await dns.lookup(url.hostname).catch(() => {
    throw new Error(`Could not find the website "${url.hostname}". Check the spelling.`);
  });
  if (isPrivateIp(address)) throw new Error('Only public websites can be scanned.');
  return new URL(url.origin + '/');
}

// ---------- fetching ----------
async function get(url, { redirect = 'follow' } = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect,
      headers: { 'user-agent': UA, accept: 'text/html,text/plain,application/xml;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let body = '';
    if (redirect === 'follow') {
      const buf = Buffer.from(await res.arrayBuffer());
      body = buf.subarray(0, MAX_BYTES).toString('utf8');
    }
    return {
      ok: true,
      status: res.status,
      finalUrl: res.url || String(url),
      type: (res.headers.get('content-type') || '').toLowerCase(),
      location: res.headers.get('location'),
      body,
      ms: Date.now() - started,
    };
  } catch (err) {
    return { ok: false, error: err.name === 'TimeoutError' ? 'timed out' : err.message, ms: Date.now() - started };
  }
}

// ---------- tiny HTML helpers (no extra packages) ----------
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

function metaContent(html, attr, name) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const n = tag.match(new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, 'i'));
    if (n && n[1].toLowerCase() === name) {
      const c = tag.match(/content\s*=\s*["']([^"']*)["']/i);
      return c ? decode(c[1]) : '';
    }
  }
  return null;
}

function linkHref(html, rel) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const r = tag.match(/rel\s*=\s*["']([^"']+)["']/i);
    if (r && r[1].toLowerCase().split(/\s+/).includes(rel)) {
      const h = tag.match(/href\s*=\s*["']([^"']*)["']/i);
      return h ? h[1] : '';
    }
  }
  return null;
}

function schemaTypes(html) {
  const types = new Set();
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const t = node['@type'];
    (Array.isArray(t) ? t : t ? [t] : []).forEach((x) => types.add(String(x)));
    Object.values(node).forEach(walk);
  };
  let broken = 0;
  for (const block of blocks) {
    const json = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try { walk(JSON.parse(json)); } catch { broken++; }
  }
  return { count: blocks.length, types: [...types], broken };
}

// Does robots.txt block a given bot from the whole site?
function robotsBlocks(robots, bot) {
  const groups = [];
  let current = null;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^(user-agent|disallow|allow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === 'user-agent') {
      if (!current || current.rules.length) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(m[2].toLowerCase());
    } else if (current) {
      current.rules.push({ type: key, path: m[2] });
    }
  }
  const pick = groups.find((g) => g.agents.includes(bot.toLowerCase())) || groups.find((g) => g.agents.includes('*'));
  if (!pick) return false;
  const fullBlock = pick.rules.some((r) => r.type === 'disallow' && r.path === '/');
  const fullAllow = pick.rules.some((r) => r.type === 'allow' && r.path === '/');
  return fullBlock && !fullAllow;
}

// ---------- the scan ----------
async function scan(input) {
  const base = await normalizeUrl(input);
  log.info('scan.start', { url: base.href });

  const findings = [];
  const passed = [];
  const notChecked = [];
  const add = (f) => findings.push(f);

  const home = await get(base.href);
  if (!home.ok || home.status >= 400) {
    const reason = home.ok ? `returned error ${home.status}` : home.error;
    log.warn('scan.home_unreachable', { url: base.href, reason });
    throw new Error(`The homepage could not be loaded (${reason}).`);
  }
  const html = home.body;
  const finalUrl = new URL(home.finalUrl);
  const host = finalUrl.hostname;
  const brand = host.replace(/^www\./, '');

  // 1. HTTPS
  if (finalUrl.protocol !== 'https:') {
    add({ id: 'https', severity: 'high', title: 'The site is not secure (no HTTPS)', why: 'Browsers warn visitors and search engines trust it less.', fix: 'Turn on HTTPS (free with most hosts) and redirect http to https.' });
  } else passed.push('Secure connection (HTTPS)');

  // 2. Speed (server response only — a rough signal, not a full speed test)
  if (home.ms > 3000) add({ id: 'slow', severity: 'medium', title: `The homepage took ${(home.ms / 1000).toFixed(1)} seconds to load`, why: 'Slow pages lose visitors and get crawled less.', fix: 'Compress images and remove heavy scripts; run Google PageSpeed for details.' });
  else passed.push(`Homepage responded in ${(home.ms / 1000).toFixed(1)}s`);

  // 3. Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decode(titleMatch[1].replace(/\s+/g, ' ')) : '';
  if (!title) add({ id: 'title', severity: 'high', title: 'The homepage has no title', why: 'The title is the headline Google and AI show for your business.', fix: 'Add a title that says what you do and where, e.g. "Family Dentist in Austin | Smile Co".' });
  else if (title.length < 25) add({ id: 'title_short', severity: 'medium', title: `The homepage title is too vague: "${title}"`, why: 'A name alone does not tell Google or AI what you do.', fix: 'Add your service and location to the title.' });
  else passed.push('Descriptive page title');

  // 4. Meta description
  const desc = metaContent(html, 'name', 'description');
  if (!desc) add({ id: 'description', severity: 'medium', title: 'No page description', why: 'Without one, Google and AI guess your summary from random text.', fix: 'Add a 1–2 sentence description of who you serve and what you offer.' });
  else passed.push('Page description');

  // 5. Canonical
  if (linkHref(html, 'canonical') === null) add({ id: 'canonical', severity: 'medium', title: 'No canonical tag on the homepage', why: 'It tells search engines which address is the official one, so credit is not split.', fix: 'Add <link rel="canonical"> pointing to your main homepage address.' });
  else passed.push('Canonical tag');

  // 6. Share image
  const ogImage = metaContent(html, 'property', 'og:image');
  if (!ogImage) add({ id: 'og_image', severity: 'medium', title: 'No share image', why: 'Links to your site look blank on Facebook, LinkedIn and X, so fewer people click.', fix: 'Add a 1200×630 og:image to every page.' });
  else passed.push('Share image for social links');

  // 7. H1 heading
  if (!/<h1\b/i.test(html)) add({ id: 'h1', severity: 'low', title: 'No main heading (H1)', why: 'The main heading tells machines the topic of the page.', fix: 'Add one clear H1 that states what you do.' });
  else passed.push('Main heading (H1)');

  // 8. Structured data
  const schema = schemaTypes(html);
  const entityTypes = schema.types.filter((t) => /Organization|LocalBusiness|Corporation|Store|Restaurant|Dentist|Physician|LegalService|ProfessionalService|Person/i.test(t));
  if (schema.count === 0) add({ id: 'schema', severity: 'high', title: 'No structured data (schema)', why: 'Schema is the hidden label that tells AI exactly who you are, where you are, and what you sell.', fix: 'Add Organization or LocalBusiness schema with name, address, phone, services and social profiles.' });
  else if (schema.broken) add({ id: 'schema_broken', severity: 'high', title: `${schema.broken} structured data block(s) are broken`, why: 'Broken schema is ignored by Google and AI.', fix: 'Validate it at validator.schema.org and fix the errors.' });
  else if (!entityTypes.length) add({ id: 'schema_entity', severity: 'medium', title: 'Structured data does not say who the business is', why: `Found ${schema.types.join(', ') || 'schema'} but no Organization or LocalBusiness label.`, fix: 'Add Organization or LocalBusiness schema.' });
  else passed.push(`Structured data (${entityTypes.join(', ')})`);

  // 9. robots.txt + AI crawler access
  const robots = await get(new URL('/robots.txt', finalUrl).href);
  if (!robots.ok) notChecked.push('robots.txt (could not load)');
  else if (robots.status !== 200 || robots.type.includes('html')) add({ id: 'robots', severity: 'low', title: 'No robots.txt file', why: 'It is the first file crawlers read to learn the rules of your site.', fix: 'Add a robots.txt that allows crawling and lists your sitemap.' });
  else {
    const blocked = AI_BOTS.filter((b) => robotsBlocks(robots.body, b));
    if (blocked.length) add({ id: 'ai_blocked', severity: 'high', title: `AI assistants are blocked: ${blocked.join(', ')}`, why: 'Blocked AI crawlers cannot read your site, so they cannot recommend you.', fix: 'Remove the Disallow rules for these bots in robots.txt (unless you blocked them on purpose).' });
    else passed.push('AI crawlers allowed in robots.txt');
  }

  // 10. Sitemap
  const sitemap = await get(new URL('/sitemap.xml', finalUrl).href);
  if (!sitemap.ok) notChecked.push('sitemap.xml (could not load)');
  else if (sitemap.status !== 200 || !/<(urlset|sitemapindex)/i.test(sitemap.body)) add({ id: 'sitemap', severity: 'medium', title: 'No sitemap found at /sitemap.xml', why: 'A sitemap is the list of pages you want found.', fix: 'Generate a sitemap.xml and submit it in Google Search Console and Bing Webmaster Tools.' });
  else passed.push('Sitemap');

  // 11. llms.txt
  const llms = await get(new URL('/llms.txt', finalUrl).href);
  if (!llms.ok) notChecked.push('llms.txt (could not load)');
  else if (llms.status !== 200 || llms.type.includes('html') || /^\s*<!doctype|^\s*<html/i.test(llms.body)) add({ id: 'llms', severity: 'medium', title: 'No llms.txt file', why: 'llms.txt is a plain-text summary of your site written for AI assistants.', fix: 'Add /llms.txt listing who you are, your services and your key pages.' });
  else passed.push('llms.txt for AI assistants');

  // 12. Real "not found" pages (soft 404)
  const probe = await get(new URL(`/qt-check-${Date.now()}`, finalUrl).href);
  if (!probe.ok) notChecked.push('Not-found page behavior (could not load)');
  else if (probe.status === 200) add({ id: 'soft404', severity: 'medium', title: 'Fake addresses show a normal page (soft 404)', why: 'Crawlers waste time on pages that do not exist and may index junk.', fix: 'Make unknown addresses return a real 404 "not found" status.' });
  else passed.push('Real 404 for missing pages');

  // 13. www vs non-www duplicate
  const twinHost = host.startsWith('www.') ? host.slice(4) : 'www.' + host;
  try {
    await dns.lookup(twinHost);
    const twin = await get(`https://${twinHost}/`, { redirect: 'manual' });
    if (twin.ok && twin.status === 200) add({ id: 'duplicate_host', severity: 'medium', title: `${twinHost} is a full copy of the site`, why: 'Search engines see two sites and split your credit between them.', fix: `Redirect ${twinHost} to ${host} with a permanent (301/308) redirect.` });
    else if (twin.ok) passed.push(`${twinHost} redirects to the main address`);
    else notChecked.push(`${twinHost} (could not load)`);
  } catch {
    passed.push(`No duplicate ${twinHost} address`);
  }

  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const checks = findings.length + passed.length;
  const score = checks ? Math.round((passed.length / checks) * 100) : 0;

  const result = { url: finalUrl.href, brand, title, score, findings, passed, notChecked, scannedAt: new Date().toISOString() };
  log.info('scan.done', { url: result.url, score, findings: findings.map((f) => f.id), notChecked });
  return result;
}

module.exports = { scan, normalizeUrl, robotsBlocks };
