// Builds browser-only copies of AdXR and AdSuperXR for the GitHub Pages portfolio.
// Usage: node tools/build-web.js <output folder>
// The logic in lib/ runs inside the page; AdSuperXR data is saved in the visitor's
// own browser (localStorage) and never leaves their computer. Blotato scheduling
// needs the API key, so it stays in the desktop app.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'web-build'));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function bundle(mods) {
  const defs = mods.map((m) => `defs[${JSON.stringify('./' + m)}] = function (module, exports, require, __dirname) {\n${read('lib/' + m + '.js')}\n};`).join('\n');
  return `<script>
(function () {
  const KEY = 'adsuperxr-data';
  const shims = {
    fs: {
      readFileSync() { let v = null; try { v = localStorage.getItem(KEY); } catch (e) {} if (v == null) throw new Error('empty'); return v; },
      writeFileSync(_f, d) { try { localStorage.setItem(KEY, d); } catch (e) {} },
      mkdirSync() {}, existsSync() { try { return localStorage.getItem(KEY) != null; } catch (e) { return false; } },
    },
    path: { join: (...a) => a.join('/') },
    './log': { info() {}, warn() {}, error() {} },
    './env': {},
  };
  const defs = {}, cache = {};
  ${defs}
  function req(n) {
    if (n in shims) return shims[n];
    if (cache[n]) return cache[n].exports;
    const module = { exports: {} }; cache[n] = module;
    defs[n](module, module.exports, req, '.');
    return module.exports;
  }
  window.__req = req;
})();
</script>`;
}

const API = {
  adxr: `async function api(path, body) {
  const adxr = window.__req('./adxr'); const b = body || {};
  if (path === '/api/adxr/presets') return { presets: adxr.PRESETS, polishAvailable: false };
  if (path === '/api/adxr/find') return adxr.findWinnersLinks(b.keyword, b.country);
  if (path === '/api/adxr/analyze') return adxr.analyzeAd(b.text, { daysRunning: b.daysRunning });
  if (path === '/api/adxr/generate') return adxr.generateAds(b.blueprint, b.target, { langs: b.langs, count: b.count, combine: b.combine });
  if (path.startsWith('/api/accounts') || path === '/api/schedule') throw new Error('Web version: copy the ad text and post it yourself, or schedule it free from the desktop app (QueryTrends X-Ray icon).');
  throw new Error('Not available in the web version.');
}`,
  superxr: `async function api(path, body) {
  const s = window.__req('./superxr'); const b = body || {};
  if (path === '/api/superxr/template') return { template: s.TEMPLATE, replies: s.REPLY_TEMPLATES, statuses: s.STATUSES };
  if (path === '/api/superxr/listen') return s.listenLinks(b.city);
  if (path === '/api/superxr/data') return s.getData();
  if (path === '/api/superxr/leads') return s.importLeads(b.csv);
  if (path === '/api/superxr/properties') return s.importProperties(b.csv);
  if (path === '/api/superxr/need') return s.addNeed(b);
  if (path === '/api/superxr/status') return s.setStatus(b.id, b.status);
  if (path === '/api/superxr/match') return s.matchAll(b);
  if (path === '/api/superxr/check-ad') return { issues: s.fairHousingCheck(b.text) };
  if (path === '/api/superxr/delete') { if (b.all) s.clearData(); else s.deleteItem(b.kind, b.id); return { ok: true }; }
  throw new Error('Not available in the web version.');
}`,
};

const NOTE = `<div style="background:#fff7e0;border:1px solid #e8c766;color:#5a4500;border-radius:10px;padding:10px 14px;margin:0 0 16px;font-size:14px">🌐 <b>Web version.</b> Everything you enter is saved only in this browser on this computer. Nothing is uploaded.</div>`;

function build(name, mods, file) {
  let html = read('public/' + file);
  const start = html.indexOf('async function api(path, body) {');
  const end = html.indexOf('\n}\n', start) + 2;
  if (start < 0 || end < 2) throw new Error('api() not found in ' + file);
  html = html.slice(0, start) + API[name] + html.slice(end);
  html = html.replace('<script>', bundle(mods) + '\n<script>');
  html = html.replace(/<main>/, '<main>\n' + NOTE);
  if (name === 'adxr') {
    // No Blotato key on the web: hide the account picker and turn "Schedule" into "Copy text".
    html = html.replace(/Schedule free test post/g, 'Copy text')
      .replace('</style>', '#account,#page{display:none}</style>')
      .replace('</body>', `<script>
async function loadAccounts() {}
async function schedule(ad, textEl, whenEl, btn, msg) {
  try { await navigator.clipboard.writeText(textEl.value); } catch (e) { textEl.select(); document.execCommand('copy'); }
  msg.textContent = 'Copied ✓ Paste it into your post. To schedule it automatically, use the desktop app.'; msg.className = 'msg ok';
}
</script>
</body>`);
  }
  html = html
    .replace(/href="\/"/g, 'href="../"').replace(/>← QueryTrends X-Ray</g, '>← Portfolio<')
    .replace(/href="\/adxr\.html/g, 'href="../adxr/').replace(/href="\/superxr\.html"/g, 'href="../adsuperxr/"');
  const dir = path.join(out, name === 'superxr' ? 'adsuperxr' : 'adxr');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  console.log('built', path.join(dir, 'index.html'));
}

build('adxr', ['adxr'], 'adxr.html');
build('superxr', ['superxr'], 'superxr.html');
