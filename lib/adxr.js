// AdXR — "X-Ray" a winning ad's STRUCTURE (never its words), then write new ads
// in that structure for YOUR target lead, in English, Spanish and Portuguese.
//
// Why: advertisers keep paying only for ads that convert, so an ad that has run
// for weeks is a proven structure. Starting from a proven structure means less
// money wasted testing bad ads.
const env = require('./env');
const log = require('./log');

const LANGS = ['en', 'es', 'pt'];
const SECTIONS = ['hook', 'pain', 'proof', 'offer', 'cta'];

// ---------- 1. X-Ray: break a winning ad into its structure ----------
const RX = {
  question: /\?/,
  number: /\b\d+([.,]\d+)?\s*(%|x|k|\+|days?|weeks?|minutes?|steps?|ways?|tips?|clients?|customers?|leads?|calls?|stars?|reviews?|years?)?\b|\$\s?\d/i,
  callout: /\b(attention|calling all|if you('re| are)? an?|for|hey)\b.{0,40}\b(owners?|founders?|moms?|dads?|business(es)?|coaches?|agents?|dentists?|lawyers?|contractors?|restaurants?|realtors?|clinics?)\b/i,
  pain: /\b(tired of|struggl|stop|stuck|losing|lose|waste|wasting|frustrat|hard to|can'?t|cannot|no one|nobody|without|problem|mistake|worried|overwhelm|behind|invisible|ignored)\w*/i,
  proof: /(\b(helped|served|worked with|trusted by|loved by|join(ed)?|testimonial|case study|results?|proven|rated|featured|award|as seen|certified|guarantee[d]?)\b|\d[\d,.]*\s*\+?\s*(k\s+)?[a-z]+s\b|★|⭐)/i,
  offer: /\b(free|bonus|discount|\d+%\s*off|off\b|trial|limited|only \d+|today only|save|get your|claim|no cost|zero cost|risk[- ]free)\b/i,
  cta: /\b(click|tap|book|call|sign up|signup|register|join|download|get started|learn more|shop|order|apply|dm|message|comment|visit|schedule|grab|claim|start)\b/i,
  urgency: /\b(today|now|limited|only \d+|ends|last chance|before|deadline|spots? left|this week)\b/i,
};

function splitLines(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z¿¡"“👉✅❌⚠️🔥])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

function classifyHook(line) {
  if (RX.callout.test(line)) return 'callout';
  if (RX.question.test(line)) return 'question';
  if (RX.number.test(line)) return 'number';
  if (RX.pain.test(line)) return 'pain';
  return 'bold';
}

function analyzeAd(text, { daysRunning } = {}) {
  const raw = String(text || '').trim();
  if (raw.length < 20) throw new Error('Paste the full text of a winning ad (at least one or two sentences).');
  const lines = splitLines(raw);
  const order = ['hook'];
  const found = { hook: [lines[0]] };
  for (const line of lines.slice(1)) {
    let section = null;
    if (RX.cta.test(line) && /\b(link|below|now|today|here|👇|→)/i.test(line + ' ')) section = 'cta';
    else if (RX.offer.test(line)) section = 'offer';
    else if (RX.proof.test(line)) section = 'proof';
    else if (RX.pain.test(line)) section = 'pain';
    else if (/^\W*(click|tap|book|call|sign up|register|join|download|get started|learn more|shop|order|apply|dm|message|comment|visit|grab|claim|start)\b/i.test(line)) section = 'cta';
    if (!section) continue;
    (found[section] = found[section] || []).push(line);
    if (!order.includes(section)) order.push(section);
  }
  // The call to action always closes the ad.
  if (order.includes('cta')) order.splice(order.indexOf('cta'), 1);
  order.push('cta');

  const words = raw.split(/\s+/).length;
  const emoji = (raw.match(/\p{Extended_Pictographic}/gu) || []).length;
  const blueprint = {
    hookType: classifyHook(lines[0]),
    order,
    hasUrgency: RX.urgency.test(raw),
    length: words < 40 ? 'short' : words < 110 ? 'medium' : 'long',
    words,
    emoji: emoji === 0 ? 'none' : emoji <= 3 ? 'light' : 'heavy',
    lineBreaks: (raw.match(/\n/g) || []).length >= 3,
    firstLineChars: lines[0].length,
    daysRunning: Number(daysRunning) || null,
  };
  const why = [];
  why.push(`Opens with a ${HOOK_LABEL[blueprint.hookType]} hook (${blueprint.firstLineChars} characters).`);
  why.push(`Structure: ${blueprint.order.map((s) => SECTION_LABEL[s]).join(' → ')}.`);
  if (blueprint.hasUrgency) why.push('Uses urgency (a reason to act now).');
  why.push(`${cap(blueprint.length)} copy (${words} words), ${{ none: 'no', light: 'a little', heavy: 'lots of' }[blueprint.emoji]} emoji${blueprint.lineBreaks ? ', short lines' : ''}.`);
  if (blueprint.daysRunning >= 30) why.push(`Running ${blueprint.daysRunning}+ days: a strong sign it's profitable.`);
  else if (blueprint.daysRunning) why.push(`Running ${blueprint.daysRunning} days. Ads running 30+ days are safer to model.`);
  log.info('adxr.analyzed', { hookType: blueprint.hookType, order: blueprint.order, words });
  return { blueprint, why };
}

const HOOK_LABEL = { callout: 'call-out', question: 'question', number: 'number', pain: 'pain-point', bold: 'bold-claim' };
const SECTION_LABEL = { hook: 'Hook', pain: 'Pain', proof: 'Proof', offer: 'Offer', cta: 'Call to action' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- 2. Write new ads in that structure ----------
// Phrase banks. {audience} {city} {pain} {outcome} {offer} {proof} {link} come from the target lead.
const BANK = {
  en: {
    hook: {
      callout: ['{Audience} in {city}: this one is for you 👇', 'Calling all {audience} in {city}.'],
      question: ['Why do your customers find your competitors first?', 'Is {pain} costing you customers?'],
      number: ['3 reasons {audience} lose customers to AI search 👇', '60 seconds could show you why {pain}.'],
      pain: ['Tired of {pain}?', 'Most {audience} don\'t know {pain}.'],
      bold: ['Your next customer is asking AI who to call. Is it you?', '{Outcome} starts with one free check.'],
    },
    pain: ['Right now, {pain}. Every day that costs you calls.', 'When {pain}, customers pick someone else.'],
    proof: ['{Proof}.', 'Real results: {proof}.'],
    offer: ['Get a {offer}. No cost, no catch.', 'This week: a {offer} for {audience} in {city}.'],
    cta: ['👉 Get yours: {link}', 'Tap the link and get started: {link}'],
    urgency: 'Only a few spots this week.',
  },
  es: {
    hook: {
      callout: ['{Audience} en {city}: esto es para ustedes 👇', 'Atención, {audience} de {city}.'],
      question: ['¿Por qué sus clientes encuentran primero a la competencia?', '¿{Pain} le está costando clientes?'],
      number: ['3 razones por las que {audience} pierden clientes en la búsqueda con IA 👇', '60 segundos pueden mostrarle por qué {pain}.'],
      pain: ['¿Cansado de que {pain}?', 'La mayoría de {audience} no sabe que {pain}.'],
      bold: ['Su próximo cliente le pregunta a la IA a quién llamar. ¿Es usted?', '{Outcome} empieza con un análisis gratis.'],
    },
    pain: ['Hoy {pain}, y cada día eso le cuesta llamadas.', 'Cuando {pain}, los clientes eligen a otro.'],
    proof: ['{Proof}.', 'Resultados reales: {proof}.'],
    offer: ['Obtenga un {offer}. Sin costo y sin trucos.', 'Esta semana: {offer} para {audience} en {city}.'],
    cta: ['👉 Pídalo aquí: {link}', 'Toque el enlace y empiece: {link}'],
    urgency: 'Solo quedan pocos cupos esta semana.',
  },
  pt: {
    hook: {
      callout: ['{Audience} em {city}: isto é para vocês 👇', 'Atenção, {audience} de {city}.'],
      question: ['Por que seus clientes encontram a concorrência primeiro?', '{Pain} está custando clientes para você?'],
      number: ['3 motivos pelos quais {audience} perdem clientes na busca com IA 👇', '60 segundos podem mostrar por que {pain}.'],
      pain: ['Cansado de ver que {pain}?', 'A maioria dos {audience} não sabe que {pain}.'],
      bold: ['Seu próximo cliente está perguntando para a IA quem chamar. É você?', '{Outcome} começa com uma análise grátis.'],
    },
    pain: ['Hoje {pain}, e todo dia isso custa ligações.', 'Quando {pain}, os clientes escolhem outro.'],
    proof: ['{Proof}.', 'Resultados reais: {proof}.'],
    offer: ['Receba uma {offer}. Sem custo e sem pegadinha.', 'Esta semana: {offer} para {audience} em {city}.'],
    cta: ['👉 Peça a sua: {link}', 'Toque no link e comece: {link}'],
    urgency: 'Poucas vagas esta semana.',
  },
};

const HOOK_TYPES = ['callout', 'question', 'number', 'pain', 'bold'];

function fill(tpl, t) {
  return tpl.replace(/\{(\w+)\}/g, (_, key) => {
    const v = t[key.toLowerCase()] || '';
    return key[0] === key[0].toUpperCase() ? cap(v) : v;
  });
}

function targetFor(lang, target) {
  const base = target[lang] || {};
  const t = { ...base, link: target.link || 'https://querytrends.ai/free-snapshot' };
  const missing = ['audience', 'pain', 'offer'].filter((k) => !String(t[k] || '').trim());
  return { t, missing };
}

// Meta shows ~125 characters of primary text before "See more".
function scoreAd(text, blueprint) {
  const first = text.split('\n')[0];
  const checks = [
    { ok: first.length <= 125, label: `Hook fits before "See more" (${first.length}/125 characters)` },
    { ok: /https?:\/\//.test(text), label: 'Has a link to capture the lead' },
    { ok: /👉|\b(click|tap|book|call|get|pida|pídalo|toque|reserve|llame|peça|toque|clique|agende|ligue)\b/i.test(text), label: 'Has a clear call to action' },
    { ok: !blueprint.order.includes('offer') || RX.offer.test(text) || /grat|free/i.test(text), label: 'Keeps the offer from the winning structure' },
    { ok: text.split(/\s+/).length <= 130, label: 'Short enough to read on a phone' },
  ];
  return { score: Math.round((checks.filter((c) => c.ok).length / checks.length) * 100), checks };
}

function writeVariant(lang, blueprint, t, hookType, idx) {
  const b = BANK[lang];
  const parts = [];
  for (const section of blueprint.order) {
    if (section === 'hook') parts.push(fill(b.hook[hookType][idx % 2], t));
    else if (section === 'proof') { if (t.proof) parts.push(fill(b.proof[idx % 2], t)); }
    else if (section === 'cta') {
      if (blueprint.hasUrgency) parts.push(b.urgency);
      parts.push(fill(b.cta[idx % 2], t));
    } else parts.push(fill(b[section][idx % 2], t));
  }
  return parts.join(blueprint.lineBreaks || blueprint.length !== 'long' ? '\n\n' : ' ');
}

async function polishWithClaude(text, lang, blueprint) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const language = { en: 'English', es: 'Latin American Spanish', pt: 'Brazilian Portuguese' }[lang];
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 500,
        messages: [{ role: 'user', content: `Rewrite this Facebook ad in natural, persuasive ${language}. Keep the same section order (${blueprint.order.join(' → ')}), keep the first line under 125 characters, keep the link exactly, and do not add facts, numbers or claims. Return only the ad.\n\n${text}` }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return (data.content || []).map((c) => c.text || '').join('').trim() || null;
  } catch (err) {
    log.warn('adxr.polish_failed', { lang, error: err.message });
    return null;
  }
}

async function generateAds(blueprint, target = {}, { langs = ['en'], count = 3, polish = false } = {}) {
  if (!blueprint || !Array.isArray(blueprint.order)) throw new Error('X-Ray a winning ad first.');
  const chosen = langs.filter((l) => LANGS.includes(l));
  if (!chosen.length) throw new Error('Pick at least one language.');
  // Variant 1 copies the winner's hook type; the rest test other hook types.
  const hooks = [blueprint.hookType, ...HOOK_TYPES.filter((h) => h !== blueprint.hookType)].slice(0, Math.min(Math.max(count, 1), 5));
  const ads = [];
  const skipped = [];
  for (const lang of chosen) {
    const { t, missing } = targetFor(lang, target);
    if (missing.length) { skipped.push({ lang, missing }); continue; }
    for (let i = 0; i < hooks.length; i++) {
      let text = writeVariant(lang, blueprint, t, hooks[i], i);
      let polished = false;
      if (polish) {
        const better = await polishWithClaude(text, lang, blueprint);
        if (better) { text = better; polished = true; }
      }
      ads.push({
        id: `${lang}-${i + 1}`,
        lang,
        variant: String.fromCharCode(65 + i),
        hookType: hooks[i],
        text,
        shortText: text.length <= 280 ? text : text.split('\n\n').filter((p, k, arr) => k === 0 || k === arr.length - 1).join('\n\n').slice(0, 280),
        firstComment: null,
        polished,
        ...scoreAd(text, blueprint),
      });
    }
  }
  log.info('adxr.generated', { count: ads.length, langs: chosen, skipped });
  return { ads, skipped };
}

// Ready-made target for QueryTrends leads, in all three languages.
const PRESETS = {
  querytrends: {
    link: 'https://querytrends.ai/free-snapshot',
    en: { audience: 'local business owners', city: 'Kansas City', pain: 'ChatGPT and Google can\'t find your business', outcome: 'more calls from local customers', offer: 'free AI-visibility scan', proof: '' },
    es: { audience: 'dueños de negocios locales', city: 'Kansas City', pain: 'ChatGPT y Google no encuentran su negocio', outcome: 'más llamadas de clientes locales', offer: 'análisis gratis de visibilidad en IA', proof: '' },
    pt: { audience: 'donos de negócios locais', city: 'Kansas City', pain: 'o ChatGPT e o Google não encontram seu negócio', outcome: 'mais ligações de clientes locais', offer: 'análise grátis de visibilidade em IA', proof: '' },
  },
};

// Where to find proven ads — free, official pages (no scraping).
function findWinnersLinks(keyword, country = 'US') {
  const q = encodeURIComponent(String(keyword || '').trim());
  return {
    metaAdLibrary: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${encodeURIComponent(country)}&media_type=all&search_type=keyword_unordered&q=${q}`,
    tiktokTopAds: 'https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en',
    linkedinAdLibrary: `https://www.linkedin.com/ad-library/search?keyword=${q}`,
  };
}

module.exports = { analyzeAd, generateAds, scoreAd, findWinnersLinks, PRESETS, LANGS };
