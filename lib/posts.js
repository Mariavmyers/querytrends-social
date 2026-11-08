// Turns scan findings into "algorithm-friendly" social posts:
//  - a hook in the first line (what shows before "see more")
//  - short lines, plain words
//  - a question at the end to invite comments
//  - links go in the first comment on Facebook (posts with outside links get less reach)
// Posts are anonymized by default: we never shame a real business in public.
const env = require('./env');
const log = require('./log');

const LANGS = ['en', 'es', 'pt'];

// Plain-language explanation of each finding, in English, Spanish and Brazilian Portuguese.
const COPY = {
  https: {
    en: ['This site still has no padlock (HTTPS).', 'Browsers warn visitors away, and search engines trust it less.', 'Turn on HTTPS. Most hosts do it for free.'],
    es: ['Este sitio todavía no tiene candado (HTTPS).', 'El navegador asusta a los visitantes y los buscadores confían menos.', 'Activa HTTPS. Casi todos los hostings lo dan gratis.'],
    pt: ['Este site ainda não tem cadeado (HTTPS).', 'O navegador assusta o visitante e os buscadores confiam menos.', 'Ative o HTTPS. Quase toda hospedagem oferece de graça.'],
  },
  slow: {
    en: ['The homepage takes too long to load.', 'People leave, and crawlers visit less often.', 'Compress images and cut heavy scripts.'],
    es: ['La página principal tarda demasiado en cargar.', 'La gente se va y los buscadores visitan menos.', 'Comprime las imágenes y quita scripts pesados.'],
    pt: ['A página inicial demora demais para carregar.', 'As pessoas desistem e os buscadores visitam menos.', 'Comprima as imagens e tire scripts pesados.'],
  },
  title: {
    en: ['The homepage has no title at all.', 'The title is the headline Google and AI show for you.', 'Write one: what you do + where you do it.'],
    es: ['La página principal no tiene título.', 'El título es el titular que Google y la IA muestran de ti.', 'Escribe uno: qué haces + dónde lo haces.'],
    pt: ['A página inicial não tem título nenhum.', 'O título é a manchete que o Google e a IA mostram de você.', 'Escreva um: o que você faz + onde você faz.'],
  },
  title_short: {
    en: ['The homepage title is just the business name.', 'A name alone doesn’t tell Google or AI what you do.', 'Add your service and your city to the title.'],
    es: ['El título de la página es solo el nombre del negocio.', 'Un nombre solo no le dice a Google ni a la IA qué haces.', 'Agrega tu servicio y tu ciudad al título.'],
    pt: ['O título da página é só o nome da empresa.', 'Só o nome não diz ao Google nem à IA o que você faz.', 'Coloque seu serviço e sua cidade no título.'],
  },
  description: {
    en: ['The site has no description.', 'So Google and AI guess your summary from random text.', 'Write 1–2 sentences: who you serve and what you offer.'],
    es: ['El sitio no tiene descripción.', 'Google y la IA adivinan tu resumen con texto al azar.', 'Escribe 1–2 frases: a quién sirves y qué ofreces.'],
    pt: ['O site não tem descrição.', 'O Google e a IA adivinham seu resumo com texto aleatório.', 'Escreva 1–2 frases: quem você atende e o que oferece.'],
  },
  canonical: {
    en: ['The homepage doesn’t say which address is the official one.', 'Search engines can split your credit across copies.', 'Add a canonical tag pointing to your main address.'],
    es: ['La página no indica cuál es su dirección oficial.', 'Los buscadores pueden dividir tu crédito entre copias.', 'Agrega una etiqueta canonical con tu dirección principal.'],
    pt: ['A página não diz qual é o endereço oficial.', 'Os buscadores podem dividir seu crédito entre cópias.', 'Adicione uma tag canonical com seu endereço principal.'],
  },
  og_image: {
    en: ['When someone shares this site, the preview is blank.', 'Blank previews get scrolled past. Fewer clicks, fewer customers.', 'Add a 1200×630 share image to every page.'],
    es: ['Cuando alguien comparte este sitio, la vista previa sale vacía.', 'Una vista vacía se ignora. Menos clics, menos clientes.', 'Agrega una imagen de 1200×630 para compartir en cada página.'],
    pt: ['Quando alguém compartilha este site, a prévia aparece vazia.', 'Prévia vazia é ignorada. Menos cliques, menos clientes.', 'Coloque uma imagem de 1200×630 para compartilhamento em cada página.'],
  },
  h1: {
    en: ['The page has no main heading.', 'Machines use it to understand the topic of the page.', 'Add one clear heading that says what you do.'],
    es: ['La página no tiene un encabezado principal.', 'Las máquinas lo usan para entender el tema.', 'Agrega un encabezado claro que diga qué haces.'],
    pt: ['A página não tem um título principal (H1).', 'As máquinas usam isso para entender o assunto.', 'Coloque um título claro dizendo o que você faz.'],
  },
  schema: {
    en: ['AI can’t tell who this business is.', 'There’s no structured data: the hidden label that says name, location and services.', 'Add Organization or LocalBusiness schema.'],
    es: ['La IA no puede saber quién es este negocio.', 'No hay datos estructurados: la etiqueta oculta con nombre, ubicación y servicios.', 'Agrega schema de Organization o LocalBusiness.'],
    pt: ['A IA não consegue saber quem é esta empresa.', 'Não há dados estruturados: a etiqueta escondida com nome, local e serviços.', 'Adicione schema de Organization ou LocalBusiness.'],
  },
  schema_broken: {
    en: ['The site’s hidden business label is broken.', 'Broken structured data is simply ignored by Google and AI.', 'Test it at validator.schema.org and fix the errors.'],
    es: ['La etiqueta oculta del negocio está rota.', 'Google y la IA ignoran los datos estructurados rotos.', 'Revísala en validator.schema.org y corrige los errores.'],
    pt: ['A etiqueta escondida da empresa está quebrada.', 'Dados estruturados quebrados são ignorados pelo Google e pela IA.', 'Teste em validator.schema.org e corrija os erros.'],
  },
  schema_entity: {
    en: ['The site has structured data, but it never says who the business is.', 'AI reads the labels and still can’t name you.', 'Add Organization or LocalBusiness schema.'],
    es: ['El sitio tiene datos estructurados, pero nunca dice quién es el negocio.', 'La IA lee las etiquetas y aun así no sabe tu nombre.', 'Agrega schema de Organization o LocalBusiness.'],
    pt: ['O site tem dados estruturados, mas nunca diz quem é a empresa.', 'A IA lê as etiquetas e mesmo assim não sabe seu nome.', 'Adicione schema de Organization ou LocalBusiness.'],
  },
  robots: {
    en: ['The site has no robots.txt.', 'It’s the first file crawlers read to learn your rules.', 'Add one that allows crawling and lists your sitemap.'],
    es: ['El sitio no tiene robots.txt.', 'Es el primer archivo que leen los rastreadores.', 'Agrega uno que permita rastrear y muestre tu sitemap.'],
    pt: ['O site não tem robots.txt.', 'É o primeiro arquivo que os robôs de busca leem.', 'Crie um que libere o acesso e mostre seu sitemap.'],
  },
  ai_blocked: {
    en: ['This site blocks the AI assistants by accident.', 'If ChatGPT or Claude can’t read you, they can’t recommend you.', 'Remove the AI bot blocks in robots.txt (unless you meant it).'],
    es: ['Este sitio bloquea a los asistentes de IA sin querer.', 'Si ChatGPT o Claude no pueden leerte, no pueden recomendarte.', 'Quita los bloqueos de bots de IA en robots.txt (si no fue a propósito).'],
    pt: ['Este site bloqueia os assistentes de IA sem querer.', 'Se o ChatGPT ou o Claude não conseguem te ler, não podem te recomendar.', 'Tire os bloqueios de robôs de IA no robots.txt (se não foi de propósito).'],
  },
  sitemap: {
    en: ['The site has no sitemap.', 'A sitemap is the list of pages you want found.', 'Create sitemap.xml and submit it to Google and Bing.'],
    es: ['El sitio no tiene sitemap.', 'El sitemap es la lista de páginas que quieres que encuentren.', 'Crea un sitemap.xml y envíalo a Google y Bing.'],
    pt: ['O site não tem sitemap.', 'O sitemap é a lista de páginas que você quer que sejam encontradas.', 'Crie um sitemap.xml e envie para o Google e o Bing.'],
  },
  llms: {
    en: ['The site has no llms.txt.', 'It’s a plain-text summary written for AI assistants.', 'Add /llms.txt with who you are, your services and key pages.'],
    es: ['El sitio no tiene llms.txt.', 'Es un resumen en texto simple escrito para la IA.', 'Agrega /llms.txt con quién eres, tus servicios y páginas clave.'],
    pt: ['O site não tem llms.txt.', 'É um resumo em texto simples feito para a IA.', 'Crie /llms.txt com quem você é, seus serviços e páginas principais.'],
  },
  soft404: {
    en: ['Fake addresses on this site still show a normal page.', 'Crawlers waste time on pages that don’t exist.', 'Make missing pages return a real “not found.”'],
    es: ['Las direcciones falsas en este sitio muestran una página normal.', 'Los rastreadores pierden tiempo en páginas que no existen.', 'Haz que las páginas inexistentes den un “no encontrado” real.'],
    pt: ['Endereços falsos neste site mostram uma página normal.', 'Os robôs perdem tempo com páginas que não existem.', 'Faça páginas inexistentes darem um “não encontrado” de verdade.'],
  },
  duplicate_host: {
    en: ['This site exists twice: with and without “www”.', 'Google sees two sites and splits your credit.', 'Redirect one address to the other, permanently.'],
    es: ['Este sitio existe dos veces: con y sin “www”.', 'Google ve dos sitios y divide tu crédito.', 'Redirige una dirección a la otra de forma permanente.'],
    pt: ['Este site existe duas vezes: com e sem “www”.', 'O Google vê dois sites e divide seu crédito.', 'Redirecione um endereço para o outro, de forma permanente.'],
  },
};

const FRAME = {
  en: {
    hooks: ['I checked a local business website today. 1 problem was hiding in plain sight 👇', 'Your customers ask AI before they call you. Here’s what stops AI from naming you 👇', 'Most small businesses have this problem and don’t know it 👇', '60 seconds. 1 website. 1 fix that costs $0 👇'],
    problem: 'The problem:', why: 'Why it matters:', fix: 'The fix:',
    questions: ['Have you checked yours?', 'Did you know this one?', 'Want me to check your site? Comment “SCAN”.', 'What’s the first thing you’d fix?'],
    summaryHook: (n, s) => `I scanned a business website: ${s}/100 for AI discoverability. ${n} fixable problems 👇`,
    summaryClose: 'None of this needs a new website. Just fixes.',
    cta: 'Free scan of your site:',
  },
  es: {
    hooks: ['Revisé hoy la web de un negocio local. Había 1 problema escondido a simple vista 👇', 'Tus clientes le preguntan a la IA antes de llamarte. Esto impide que la IA te nombre 👇', 'La mayoría de los negocios tiene este problema y no lo sabe 👇', '60 segundos. 1 sitio web. 1 arreglo que cuesta $0 👇'],
    problem: 'El problema:', why: 'Por qué importa:', fix: 'La solución:',
    questions: ['¿Ya revisaste el tuyo?', '¿Sabías esto?', '¿Quieres que revise tu sitio? Comenta “SCAN”.', '¿Qué arreglarías primero?'],
    summaryHook: (n, s) => `Analicé la web de un negocio: ${s}/100 en visibilidad para la IA. ${n} problemas con solución 👇`,
    summaryClose: 'Nada de esto requiere un sitio nuevo. Solo arreglos.',
    cta: 'Análisis gratis de tu sitio:',
  },
  pt: {
    hooks: ['Analisei hoje o site de uma empresa local. Tinha 1 problema escondido bem na frente 👇', 'Seus clientes perguntam para a IA antes de te ligar. Isto impede a IA de citar você 👇', 'A maioria das empresas tem esse problema e nem sabe 👇', '60 segundos. 1 site. 1 correção que custa R$0 👇'],
    problem: 'O problema:', why: 'Por que importa:', fix: 'A correção:',
    questions: ['Você já checou o seu?', 'Você sabia disso?', 'Quer que eu analise seu site? Comente “SCAN”.', 'O que você corrigiria primeiro?'],
    summaryHook: (n, s) => `Analisei o site de uma empresa: ${s}/100 em visibilidade para IA. ${n} problemas com solução 👇`,
    summaryClose: 'Nada disso exige um site novo. Só correções.',
    cta: 'Análise grátis do seu site:',
  },
};

const HASHTAGS = {
  en: '#AIsearch #SmallBusiness #SEO',
  es: '#IA #Negocios #SEO',
  pt: '#IA #Empreendedorismo #SEO',
};

const X_LIMIT = 280;

function pick(arr, i) { return arr[i % arr.length]; }

function buildFindingPost(finding, lang, i) {
  const f = FRAME[lang];
  const c = (COPY[finding.id] || {})[lang];
  const [problem, why, fix] = c || [finding.title, finding.why, finding.fix];
  return [
    pick(f.hooks, i),
    '',
    `❌ ${f.problem} ${problem}`,
    '',
    `⚠️ ${f.why} ${why}`,
    '',
    `✅ ${f.fix} ${fix}`,
    '',
    pick(f.questions, i),
    '',
    HASHTAGS[lang],
  ].join('\n');
}

function buildSummaryPost(result, lang) {
  const f = FRAME[lang];
  const lines = result.findings.slice(0, 5).map((fd) => `• ${((COPY[fd.id] || {})[lang] || [fd.title])[0]}`);
  return [f.summaryHook(result.findings.length, result.score), '', ...lines, '', f.summaryClose, '', pick(f.questions, 3), '', HASHTAGS[lang]].join('\n');
}

// Short version for X/Twitter, which allows 280 characters.
function shortVersion(text) {
  let lines = text.split('\n').filter(Boolean);
  const hashtags = lines[lines.length - 1].startsWith('#') ? lines.pop() : '';
  // For problem/fix posts, keep what matters most: the problem, the fix, the question.
  const problem = lines.find((l) => l.startsWith('❌'));
  const fix = lines.find((l) => l.startsWith('✅'));
  if (problem && fix) lines = [problem, fix, lines[lines.length - 1]];
  let out = '';
  for (const line of lines) {
    const next = out ? `${out}\n${line}` : line;
    if ((next + '\n' + hashtags).length > X_LIMIT) break;
    out = next;
  }
  return hashtags && (out + '\n' + hashtags).length <= X_LIMIT ? `${out}\n${hashtags}` : out.slice(0, X_LIMIT);
}

// Optional: polish posts with Claude if an Anthropic API key is set (costs a few cents).
async function polishWithClaude(text, lang) {
  if (!env.ANTHROPIC_API_KEY) return { text, polished: false };
  const language = { en: 'English', es: 'Spanish (Latin America)', pt: 'Brazilian Portuguese' }[lang];
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `Rewrite this social media post in natural ${language} so it reads like a real person wrote it. Keep the same facts, the same structure (hook first line, problem, why, fix, question at end) and the hashtags. Do not add facts, statistics, names or links. Return only the post.\n\n${text}`,
        }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    const out = (data.content || []).map((b) => b.text || '').join('').trim();
    return out ? { text: out, polished: true } : { text, polished: false };
  } catch (err) {
    log.warn('posts.polish_failed', { lang, error: err.message });
    return { text, polished: false };
  }
}

const FLAG = { en: '🇺🇸', es: '🇪🇸', pt: '🇧🇷' };
const SHORT_CTA = { en: 'Free scan', es: 'Análisis gratis', pt: 'Análise grátis' };

// Merge one topic's language versions into a single post:
// each version under its flag, hashtags once at the end.
function combineVersions(versions, link) {
  const tags = new Set();
  const blocks = versions.map((v) => {
    const lines = v.text.split('\n');
    while (lines.length && (lines[lines.length - 1].trim() === '' || lines[lines.length - 1].trim().startsWith('#'))) {
      const last = lines.pop().trim();
      if (last.startsWith('#')) last.split(/\s+/).forEach((t) => tags.add(t));
    }
    return `${FLAG[v.lang]}\n${lines.join('\n').trim()}`;
  });
  const english = versions.find((v) => v.lang === 'en') || versions[0];
  return {
    lang: versions.map((v) => v.lang).join('+'),
    kind: versions[0].kind,
    text: `${blocks.join('\n\n— — —\n\n')}\n\n${[...tags].join(' ')}`,
    shortText: english.shortText, // X/Threads/Bluesky are too short for 3 languages
    firstComment: `${versions.map((v) => SHORT_CTA[v.lang]).join(' / ')}: ${link}`,
    polished: versions.some((v) => v.polished),
  };
}

async function generatePosts(result, opts = {}) {
  const posts = await generateSeparatePosts(result, opts);
  const { combine = false, link = 'https://querytrends.ai/free-snapshot' } = opts;
  const langsUsed = [...new Set(posts.map((p) => p.lang))];
  if (!combine || langsUsed.length < 2) return posts;
  const kinds = [...new Set(posts.map((p) => p.kind))];
  const combined = kinds.map((kind) => combineVersions(langsUsed.map((l) => posts.find((p) => p.lang === l && p.kind === kind)).filter(Boolean), link));
  log.info('posts.combined', { topics: combined.length, langs: langsUsed });
  return combined;
}

async function generateSeparatePosts(result, { langs = ['en'], max = 3, link = 'https://querytrends.ai/free-snapshot', polish = false } = {}) {
  const chosen = langs.filter((l) => LANGS.includes(l));
  if (!chosen.length) throw new Error('Pick at least one language.');
  const posts = [];
  const top = result.findings.slice(0, max);
  for (const lang of chosen) {
    if (!top.length) continue;
    const drafts = [
      { kind: 'summary', text: buildSummaryPost(result, lang) },
      ...top.map((fd, i) => ({ kind: fd.id, text: buildFindingPost(fd, lang, i) })),
    ];
    for (const d of drafts) {
      const final = polish ? await polishWithClaude(d.text, lang) : { text: d.text, polished: false };
      posts.push({
        lang,
        kind: d.kind,
        text: final.text,
        shortText: shortVersion(final.text),
        firstComment: `${FRAME[lang].cta} ${link}`,
        polished: final.polished,
      });
    }
  }
  log.info('posts.generated', { url: result.url, count: posts.length, langs: chosen, polish });
  return posts;
}

module.exports = { generatePosts, shortVersion, COPY, LANGS };
