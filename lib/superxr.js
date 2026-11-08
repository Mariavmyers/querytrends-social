// AdSuperXR — connect "the needing" (people looking) to "the willing" (your client's offer).
// First template: REAL ESTATE BUYERS for an investor who is selling properties.
//
// Privacy: buyer data stays on THIS computer in data/superxr.json (never uploaded to GitHub).
// Consent: only buyers who agreed to be contacted are ever matched or put in a report.
const fs = require('fs');
const path = require('path');
const log = require('./log');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'superxr.json');

// ---------- Storage ----------
function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return { leads: [], properties: [] }; }
}
function save(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}
const newId = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------- Form template (EN / ES / PT) ----------
const TEMPLATE = {
  id: 'realestate-buyers',
  title: { en: 'Looking for a home?', es: '¿Busca casa?', pt: 'Procurando uma casa?' },
  intro: {
    en: 'Tell us what you\'re looking for and we\'ll send you homes that match. Free, no obligation.',
    es: 'Díganos qué busca y le enviaremos casas que coincidan. Gratis y sin compromiso.',
    pt: 'Conte o que você procura e enviaremos casas que combinam. Grátis e sem compromisso.',
  },
  questions: [
    { key: 'name', en: 'Your name', es: 'Su nombre', pt: 'Seu nome' },
    { key: 'phone', en: 'Phone', es: 'Teléfono', pt: 'Telefone' },
    { key: 'email', en: 'Email', es: 'Correo electrónico', pt: 'E-mail' },
    { key: 'language', en: 'Preferred language (English / Español / Português)', es: 'Idioma preferido (English / Español / Português)', pt: 'Idioma preferido (English / Español / Português)' },
    { key: 'areas', en: 'Areas or cities you want (e.g., Liberty, Kearney, Northland)', es: 'Zonas o ciudades que busca (ej.: Liberty, Kearney, Northland)', pt: 'Regiões ou cidades que procura (ex.: Liberty, Kearney, Northland)' },
    { key: 'budget', en: 'Maximum budget ($)', es: 'Presupuesto máximo ($)', pt: 'Orçamento máximo ($)' },
    { key: 'beds', en: 'Minimum bedrooms', es: 'Mínimo de recámaras', pt: 'Mínimo de quartos' },
    { key: 'baths', en: 'Minimum bathrooms', es: 'Mínimo de baños', pt: 'Mínimo de banheiros' },
    { key: 'timeline', en: 'When do you want to buy? (Now / 1–3 months / 3–6 months / Just looking)', es: '¿Cuándo quiere comprar? (Ya / 1–3 meses / 3–6 meses / Solo mirando)', pt: 'Quando quer comprar? (Agora / 1–3 meses / 3–6 meses / Só olhando)' },
    { key: 'financing', en: 'How will you pay? (Cash / Pre-approved loan / Need help with a loan / Not sure)', es: '¿Cómo pagará? (Contado / Préstamo preaprobado / Necesito ayuda con el préstamo / No sé)', pt: 'Como vai pagar? (À vista / Financiamento pré-aprovado / Preciso de ajuda com financiamento / Não sei)' },
    { key: 'consent', type: 'checkbox', en: 'I agree to be contacted', es: 'Acepto ser contactado', pt: 'Aceito ser contatado' },
  ],
  // Contact consent. Required before anyone calls, texts or emails a lead.
  consentText: {
    en: 'By submitting, I agree that {business} may contact me about homes by phone call, text message or email at the number and email I provided, including by automated means. Consent is not a condition of purchase. Message and data rates may apply. Reply STOP to opt out.',
    es: 'Al enviar este formulario, acepto que {business} me contacte sobre casas por llamada, mensaje de texto o correo electrónico al número y correo que proporcioné, incluso por medios automatizados. El consentimiento no es condición de compra. Pueden aplicarse tarifas de mensajes y datos. Responda STOP para cancelar.',
    pt: 'Ao enviar, autorizo que {business} entre em contato comigo sobre imóveis por ligação, mensagem de texto ou e-mail, no número e e-mail informados, inclusive por meios automatizados. O consentimento não é condição de compra. Podem ser cobradas tarifas de mensagens e dados. Responda STOP para cancelar.',
  },
};

// ---------- CSV import (Google Forms / Tally / Excel export) ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === ';' || c === '\t') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  if (rows.length < 2) throw new Error('The file needs a header row and at least one data row.');
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])));
}

// Match messy column names (in any of the 3 languages) to our fields.
const ALIASES = {
  name: /^(name|full name|your name|nombre|su nombre|nome|seu nome)/i,
  phone: /(phone|tel[eé]fono|telefone|celular|whatsapp)/i,
  email: /(e-?mail|correo)/i,
  language: /(language|idioma)/i,
  areas: /(area|areas|zona|zonas|city|cities|ciudad|cidade|regi[oõ]|neighbo)/i,
  budget: /(budget|presupuesto|or[cç]amento|max.*price|precio|pre[cç]o)/i,
  beds: /(bed|rec[aá]mara|habitaci|quarto|dormit)/i,
  baths: /(bath|ba[nñ]o|banheiro)/i,
  timeline: /(when|timeline|cu[aá]ndo|quando|timeframe)/i,
  financing: /(pay|financ|pago|pagar|loan|pr[eé]stamo|financiamento)/i,
  consent: /(consent|agree|acepto|aceito|autorizo|contact)/i,
  timestamp: /(timestamp|marca temporal|carimbo|submitted|date)/i,
  // property list
  label: /(label|address|direcci[oó]n|endere[cç]o|property|propiedad|im[oó]vel)/i,
  area: /^(area|zona|city|ciudad|cidade|neighborhood|regi[aã]o)$/i,
  price: /(price|precio|pre[cç]o|asking)/i,
  type: /(type|tipo)/i,
  link: /(link|url|listing)/i,
};

function mapRow(row, keys) {
  const out = {};
  for (const [header, value] of Object.entries(row)) {
    for (const k of keys) {
      if (out[k] == null && ALIASES[k].test(header)) { out[k] = value; break; }
    }
  }
  return out;
}

const num = (v) => {
  const m = String(v || '').replace(/[, ]/g, '').match(/(\d+(\.\d+)?)\s*(k)?/i);
  if (!m) return null;
  return parseFloat(m[1]) * (m[3] ? 1000 : 1);
};
const yes = (v) => /^(y|yes|s[ií]|sim|true|1|x|✓|checked|acepto|aceito|i agree|agree)/i.test(String(v || '').trim()) || /agree|acepto|aceito|autorizo/i.test(String(v || ''));
const listOf = (v) => String(v || '').split(/[,;/]| or | o | ou /i).map((s) => s.trim().toLowerCase()).filter(Boolean);

function timelineScore(v) {
  const s = String(v || '').toLowerCase();
  if (/now|ya|agora|asap|immediat|inmediat|imediat/.test(s)) return 1;
  if (/1.?-?.?3|1 a 3/.test(s)) return 0.8;
  if (/3.?-?.?6|3 a 6/.test(s)) return 0.5;
  return 0.2; // just looking / unknown
}
function financingScore(v) {
  const s = String(v || '').toLowerCase();
  if (/cash|contado|vista|efectivo/.test(s)) return 1;
  if (/pre-?approved|preaprobado|pr[eé]-?aprovado/.test(s)) return 0.9;
  if (/help|ayuda|ajuda/.test(s)) return 0.5;
  return 0.3;
}

function normalizeLead(raw) {
  const m = mapRow(raw, ['name', 'phone', 'email', 'language', 'areas', 'budget', 'beds', 'baths', 'timeline', 'financing', 'consent', 'timestamp']);
  return {
    id: newId('lead'),
    name: m.name || '',
    phone: m.phone || '',
    email: m.email || '',
    language: m.language || '',
    areas: listOf(m.areas),
    budget: num(m.budget),
    beds: num(m.beds),
    baths: num(m.baths),
    timeline: m.timeline || '',
    financing: m.financing || '',
    consent: yes(m.consent),
    consentAt: m.timestamp || new Date().toISOString(),
  };
}

function normalizeProperty(raw) {
  const m = mapRow(raw, ['label', 'area', 'price', 'beds', 'baths', 'type', 'link']);
  return {
    id: newId('prop'),
    label: m.label || 'Property',
    area: String(m.area || '').trim(),
    price: num(m.price),
    beds: num(m.beds),
    baths: num(m.baths),
    type: m.type || '',
    link: m.link || '',
  };
}

function importLeads(csv) {
  const db = load();
  const rows = parseCSV(csv).map(normalizeLead);
  const seen = new Set(db.leads.map((l) => (l.email || l.phone).toLowerCase()));
  let added = 0, dupes = 0, noConsent = 0;
  for (const l of rows) {
    const key = (l.email || l.phone).toLowerCase();
    if (key && seen.has(key)) { dupes++; continue; }
    if (!l.consent) noConsent++;
    db.leads.push(l); seen.add(key); added++;
  }
  save(db);
  log.info('superxr.leads_imported', { added, dupes, noConsent }); // counts only — no personal data in logs
  return { added, dupes, noConsent, total: db.leads.length };
}

function importProperties(csv) {
  const db = load();
  const rows = parseCSV(csv).map(normalizeProperty);
  db.properties.push(...rows);
  save(db);
  log.info('superxr.properties_imported', { added: rows.length });
  return { added: rows.length, total: db.properties.length };
}


// ---------- Needs found in public posts (no sign-up form) ----------
// Log what someone publicly said they need. No phone/email is stored. The person's
// details are only shared with your client after THEY agree to an introduction.
const STATUSES = ['found', 'replied', 'interested', 'introduced', 'closed', 'not interested'];
const SHAREABLE = new Set(['interested', 'introduced', 'closed']);

function addNeed(input = {}) {
  const db = load();
  const need = {
    id: newId('need'),
    origin: 'post',
    platform: String(input.platform || '').trim(),
    link: String(input.link || '').trim(),
    handle: String(input.handle || '').trim(),   // public username only
    note: String(input.note || '').trim().slice(0, 500),
    language: String(input.language || '').trim(),
    areas: listOf(input.areas),
    budget: num(input.budget),
    beds: num(input.beds),
    baths: num(input.baths),
    timeline: String(input.timeline || '').trim(),
    financing: String(input.financing || '').trim(),
    postedAt: String(input.postedAt || '').trim() || new Date().toISOString().slice(0, 10),
    status: 'found',
    consent: false,
  };
  if (!need.areas.length && need.budget == null && need.beds == null) throw new Error('Add at least the area, budget or bedrooms they asked for.');
  db.leads.push(need);
  save(db);
  log.info('superxr.need_added', { platform: need.platform }); // no personal details in logs
  return need;
}

function setStatus(id, status) {
  if (!STATUSES.includes(status)) throw new Error('Unknown status.');
  const db = load();
  const lead = db.leads.find((l) => l.id === id);
  if (!lead) throw new Error('Not found.');
  lead.status = status;
  if (SHAREABLE.has(status)) { lead.consent = true; lead.consentAt = lead.consentAt || new Date().toISOString(); }
  if (status === 'not interested') lead.consent = false;
  save(db);
  return lead;
}

const canShare = (lead) => lead.origin === 'post' ? SHAREABLE.has(lead.status) : lead.consent;

// ---------- Matching ----------
// Each buyer vs. each property: 0–100 with plain-language reasons.
function scoreMatch(lead, prop) {
  const reasons = [], misses = [];
  let pts = 0, max = 0;

  max += 30;
  if (!lead.areas.length || !prop.area) { pts += 15; reasons.push('Area not specified'); }
  else if (lead.areas.some((a) => prop.area.toLowerCase().includes(a) || a.includes(prop.area.toLowerCase()))) { pts += 30; reasons.push(`Wants ${prop.area}`); }
  else misses.push(`Wants ${lead.areas.join(', ')}, not ${prop.area}`);

  max += 30;
  if (lead.budget == null || prop.price == null) { pts += 15; reasons.push('Budget not given'); }
  else if (prop.price <= lead.budget) { pts += 30; reasons.push(`In budget ($${fmt(prop.price)} ≤ $${fmt(lead.budget)})`); }
  else if (prop.price <= lead.budget * 1.1) { pts += 15; reasons.push(`Slightly over budget (+${Math.round((prop.price / lead.budget - 1) * 100)}%)`); }
  else misses.push(`Over budget ($${fmt(prop.price)} > $${fmt(lead.budget)})`);

  for (const [key, label] of [['beds', 'bedrooms'], ['baths', 'bathrooms']]) {
    max += 10;
    if (lead[key] == null || prop[key] == null) pts += 5;
    else if (prop[key] >= lead[key]) { pts += 10; reasons.push(`${prop[key]} ${label} (needs ${lead[key]}+)`); }
    else misses.push(`Only ${prop[key]} ${label} (needs ${lead[key]}+)`);
  }

  max += 10; const t = timelineScore(lead.timeline); pts += 10 * t;
  if (t >= 0.8) reasons.push(`Ready soon (${lead.timeline})`);
  max += 10; const f = financingScore(lead.financing); pts += 10 * f;
  if (f >= 0.9) reasons.push(`Strong buyer (${lead.financing})`);

  // A hard miss on area or budget caps the score: those are deal-breakers.
  let score = Math.round((pts / max) * 100);
  if (misses.some((m) => /^Wants|^Over budget/.test(m))) score = Math.min(score, 40);
  return { score, reasons, misses };
}
const fmt = (n) => Number(n).toLocaleString('en-US');

function matchAll({ minScore = 60 } = {}) {
  const db = load();
  // Needs from posts are matched while you're still talking to the person (shown
  // anonymously). Form leads without consent and "not interested" people are excluded.
  const eligible = db.leads.filter((l) => (l.origin === 'post' ? l.status !== 'not interested' : l.consent));
  const results = db.properties.map((p) => ({
    property: p,
    buyers: eligible
      .map((l) => ({ lead: l, shareable: canShare(l), ...scoreMatch(l, p) }))
      .filter((m) => m.score >= minScore)
      .sort((a, b) => b.score - a.score),
  }));
  return { results, excludedNoConsent: db.leads.length - eligible.length, leads: db.leads.length, properties: db.properties.length };
}

// ---------- Fair-housing wording check for ads ----------
// Housing ads must not show a preference based on protected traits.
const FAIR_HOUSING_FLAGS = [
  [/\b(perfect|ideal|great) for (a )?(family|families|couples?|singles?|retirees|young professionals|students)\b/i, 'Describes who the home is "for" (describe the home instead)'],
  [/\b(no (kids|children)|adults only|adult community|empty nesters?)\b/i, 'Excludes families with children'],
  [/\b(christian|catholic|muslim|jewish|church|mosque|synagogue)\b/i, 'Mentions religion'],
  [/\b(english only|no section 8|american(s)? only|hispanic|latino|white|black|asian)\b/i, 'Mentions national origin, race, or source of income'],
  [/\b(able[- ]bodied|no wheelchairs?|handicap)\b/i, 'Mentions disability'],
  [/\b(familias? ideal|ideal para (familias?|parejas|solteros))\b/i, 'Describe la casa, no a quién es "ideal" (ES)'],
  [/\b(ideal para (fam[ií]lias?|casais|solteiros))\b/i, 'Descreva o imóvel, não para quem é "ideal" (PT)'],
];
function fairHousingCheck(text) {
  return FAIR_HOUSING_FLAGS.filter(([rx]) => rx.test(text)).map(([, why]) => why);
}


// ---------- Find "the needing": where people post that they're looking ----------
// Search links only (you browse and reply yourself) — no scraping. People enter
// AdSuperXR only by filling YOUR form, which records their consent.
const LISTEN_KEYWORDS = {
  en: ['looking for a house', 'looking to buy a home', 'first time home buyer', 'house for sale', 'need a place to live'],
  es: ['busco casa', 'busco casa en venta', 'quiero comprar casa', 'casa en venta'],
  pt: ['procuro casa', 'quero comprar casa', 'casa à venda', 'procurando casa'],
};
function listenLinks(city = 'Kansas City') {
  const c = String(city || '').trim();
  const out = [];
  for (const [lang, kws] of Object.entries(LISTEN_KEYWORDS)) {
    for (const kw of kws) {
      const q = encodeURIComponent(`${kw} ${c}`.trim());
      out.push({
        lang, keyword: kw,
        facebook: `https://www.facebook.com/search/posts/?q=${q}`,
        reddit: `https://www.reddit.com/search/?q=${q}&sort=new`,
        google: `https://www.google.com/search?q=${q}&tbs=qdr:w`,
      });
    }
  }
  return {
    searches: out,
    craigslistHousingWanted: 'https://kansascity.craigslist.org/search/hsw',
    f5bot: 'https://f5bot.com/',
  };
}
const REPLY_TEMPLATES = {
  en: 'Hi! I saw you\'re looking for a home in {area}. I work with a local investor who has homes for sale there, and one may fit what you described. Would you like me to connect you? No cost, no obligation.',
  es: '¡Hola! Vi que busca casa en {area}. Trabajo con un inversionista local que tiene casas en venta ahí, y una podría ser lo que usted describió. ¿Quiere que los ponga en contacto? Sin costo y sin compromiso.',
  pt: 'Oi! Vi que você procura casa em {area}. Trabalho com um investidor local que tem casas à venda aí, e uma pode ser o que você descreveu. Quer que eu faça a apresentação? Sem custo e sem compromisso.',
};

function getData() { return load(); }
function clearData() { save({ leads: [], properties: [] }); log.info('superxr.cleared'); }
function deleteItem(kind, id) {
  const db = load();
  const key = kind === 'lead' ? 'leads' : 'properties';
  db[key] = db[key].filter((x) => x.id !== id);
  save(db);
}

module.exports = {
  TEMPLATE, parseCSV, normalizeLead, normalizeProperty, importLeads, importProperties,
  scoreMatch, matchAll, fairHousingCheck, getData, clearData, deleteItem, DATA_FILE,
  listenLinks, REPLY_TEMPLATES, addNeed, setStatus, STATUSES,
};
