// Talks to the Blotato API (https://backend.blotato.com/v2).
// If no BLOTATO_API_KEY is set, the app runs in DRY RUN mode:
// it shows exactly what it WOULD send, without posting anything.
const env = require('./env');
const log = require('./log');

// Text-only platforms this app supports (Instagram, TikTok, YouTube, Pinterest need media).
const SUPPORTED = ['facebook', 'linkedin', 'twitter', 'threads', 'bluesky'];
const SHORT_PLATFORMS = ['twitter', 'threads', 'bluesky'];

const isDryRun = () => !env.BLOTATO_API_KEY;

async function call(method, path, body, attempt = 1) {
  const url = env.BLOTATO_BASE_URL.replace(/\/$/, '') + path;
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'blotato-api-key': env.BLOTATO_API_KEY, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    log.error('blotato.network_error', { method, path, error: err.message });
    throw new Error(`Could not reach Blotato (${err.message}).`);
  }
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
  log.info('blotato.response', { method, path, status: res.status, ms: Date.now() - started, body: res.ok ? undefined : data });

  // Rate limit is 30 requests/minute: wait and retry once.
  if (res.status === 429 && attempt === 1) {
    const wait = Math.min(Number(res.headers.get('retry-after') || 5), 60) * 1000;
    log.warn('blotato.rate_limited', { path, waitMs: wait });
    await new Promise((r) => setTimeout(r, wait));
    return call(method, path, body, 2);
  }
  if (!res.ok) {
    const hint = {
      401: 'Your Blotato API key is wrong or expired. Check BLOTATO_API_KEY in .env.',
      403: 'Blotato refused this request. Your plan may not include API access.',
      404: 'Blotato could not find that account or post.',
      422: 'Blotato rejected the post format. Check the account, page and text.',
    }[res.status];
    const detail = data?.message || data?.error?.message || data?.error || '';
    throw new Error(`${hint || `Blotato error ${res.status}.`}${detail ? ` (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`);
  }
  return data;
}

// Blotato's docs don't fully show the response shape, so accept the common shapes.
function asList(data) {
  if (Array.isArray(data)) return data;
  for (const key of ['items', 'accounts', 'subaccounts', 'data', 'results']) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

async function listAccounts() {
  if (isDryRun()) {
    return [
      { id: 'demo-fb', platform: 'facebook', name: 'Demo Facebook (dry run)' },
      { id: 'demo-li', platform: 'linkedin', name: 'Demo LinkedIn (dry run)' },
      { id: 'demo-x', platform: 'twitter', name: 'Demo X (dry run)' },
    ];
  }
  const items = asList(await call('GET', '/users/me/accounts'));
  if (!items.length) log.warn('blotato.no_accounts', { hint: 'Connect social accounts at my.blotato.com first.' });
  return items
    .map((a) => ({
      id: String(a.id ?? a.accountId ?? ''),
      platform: String(a.platform ?? a.type ?? a.provider ?? '').toLowerCase(),
      name: a.fullname || a.name || a.username || a.displayName || String(a.id ?? ''),
    }))
    .filter((a) => a.id && SUPPORTED.includes(a.platform));
}

async function listPages(accountId) {
  if (isDryRun()) return [{ id: 'demo-page', name: 'Demo Page (dry run)' }];
  const items = asList(await call('GET', `/users/me/accounts/${encodeURIComponent(accountId)}/subaccounts`));
  return items
    .map((p) => ({ id: String(p.id ?? p.pageId ?? ''), name: p.name || p.title || p.username || String(p.id ?? '') }))
    .filter((p) => p.id);
}

// Builds the exact JSON Blotato expects. Scheduling fields sit NEXT TO "post", not inside it
// (if nested, Blotato ignores them and publishes immediately).
function buildPayload({ accountId, platform, pageId, post, scheduledTime }) {
  if (!SUPPORTED.includes(platform)) throw new Error(`Platform "${platform}" is not supported (text-only: ${SUPPORTED.join(', ')}).`);
  if (!accountId) throw new Error('Pick an account to post to.');
  if (platform === 'facebook' && !pageId) throw new Error('Facebook posts need a Page. Pick your Facebook Page.');

  let text = SHORT_PLATFORMS.includes(platform) ? post.shortText || post.text : post.text;
  const target = { targetType: platform };
  if (pageId) target.pageId = String(pageId);
  if (platform === 'facebook' && post.firstComment) {
    target.firstComment = post.firstComment; // link in first comment = better reach
  } else if (platform === 'linkedin' && post.firstComment) {
    text = `${text}\n\n${post.firstComment}`;
  }

  const payload = {
    post: { accountId: String(accountId), content: { text, mediaUrls: [], platform }, target },
  };
  if (scheduledTime) {
    const when = new Date(scheduledTime);
    if (Number.isNaN(when.getTime())) throw new Error('The schedule time is not a valid date.');
    if (when.getTime() < Date.now() + 60_000) throw new Error('The schedule time must be in the future.');
    payload.scheduledTime = when.toISOString();
  }
  return payload;
}

async function schedulePost(args) {
  const payload = buildPayload(args);
  if (isDryRun()) {
    log.info('blotato.dry_run', { payload });
    return { dryRun: true, postSubmissionId: `dry-run-${Date.now()}`, scheduledTime: payload.scheduledTime, payload };
  }
  const data = await call('POST', '/posts', payload);
  log.info('blotato.scheduled', { postSubmissionId: data.postSubmissionId, scheduledTime: data.scheduledTime, platform: args.platform });
  return { dryRun: false, ...data };
}

async function postStatus(id) {
  if (isDryRun() || String(id).startsWith('dry-run-')) return { status: 'dry-run' };
  return call('GET', `/posts/${encodeURIComponent(id)}`);
}

module.exports = { listAccounts, listPages, schedulePost, postStatus, buildPayload, isDryRun, SUPPORTED, asList };
