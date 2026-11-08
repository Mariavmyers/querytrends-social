// Run with: npm test   (no internet or API key needed)
process.env.BLOTATO_API_KEY = '';
const test = require('node:test');
const assert = require('node:assert');
const { buildPayload, asList } = require('../lib/blotato');
const { robotsBlocks } = require('../lib/scanner');
const { shortVersion, generatePosts } = require('../lib/posts');

const post = { text: 'Long post text', shortText: 'Short', firstComment: 'Free scan: https://querytrends.ai/free-snapshot' };
const future = new Date(Date.now() + 86400000).toISOString();

test('scheduledTime sits next to "post", never inside it', () => {
  const p = buildPayload({ accountId: '1', platform: 'twitter', post, scheduledTime: future });
  assert.ok(p.scheduledTime);
  assert.strictEqual(p.post.scheduledTime, undefined);
});

test('Facebook: requires a Page, link goes in the first comment', () => {
  assert.throws(() => buildPayload({ accountId: '1', platform: 'facebook', post }), /Page/);
  const p = buildPayload({ accountId: '1', platform: 'facebook', pageId: '9', post });
  assert.strictEqual(p.post.target.pageId, '9');
  assert.strictEqual(p.post.target.firstComment, post.firstComment);
  assert.ok(!p.post.content.text.includes('http'));
});

test('X/Twitter uses the short version', () => {
  const p = buildPayload({ accountId: '1', platform: 'twitter', post });
  assert.strictEqual(p.post.content.text, 'Short');
});

test('rejects past times and unsupported platforms', () => {
  assert.throws(() => buildPayload({ accountId: '1', platform: 'twitter', post, scheduledTime: '2020-01-01T00:00:00Z' }), /future/);
  assert.throws(() => buildPayload({ accountId: '1', platform: 'instagram', post }), /not supported/);
});

test('robots.txt: detects blocked AI crawlers', () => {
  const robots = 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /';
  assert.strictEqual(robotsBlocks(robots, 'GPTBot'), true);
  assert.strictEqual(robotsBlocks(robots, 'ClaudeBot'), false);
});

test('short version keeps problem + fix and fits in 280 characters', () => {
  const text = 'Hook 👇\n\n❌ The problem: X\n\n⚠️ Why it matters: Y\n\n✅ The fix: Z\n\nQuestion?\n\n#A #B';
  const s = shortVersion(text);
  assert.ok(s.includes('❌') && s.includes('✅') && s.length <= 280);
});

test('accepts the different list shapes Blotato may return', () => {
  assert.deepStrictEqual(asList([1]), [1]);
  assert.deepStrictEqual(asList({ items: [2] }), [2]);
  assert.deepStrictEqual(asList({ data: [3] }), [3]);
  assert.deepStrictEqual(asList({}), []);
});

test('writes posts in all three languages', async () => {
  const result = { url: 'https://x.com/', score: 50, findings: [{ id: 'llms', severity: 'medium', title: 't', why: 'w', fix: 'f' }] };
  const posts = await generatePosts(result, { langs: ['en', 'es', 'pt'], max: 1 });
  assert.deepStrictEqual([...new Set(posts.map((p) => p.lang))], ['en', 'es', 'pt']);
  assert.ok(posts.find((p) => p.lang === 'pt').text.includes('llms.txt'));
});

test('combine puts all languages of a topic in one post', async () => {
  const result = { url: 'https://x.com/', score: 50, findings: [{ id: 'llms', severity: 'medium', title: 't', why: 'w', fix: 'f' }] };
  const posts = await generatePosts(result, { langs: ['en', 'es', 'pt'], max: 1, combine: true });
  assert.strictEqual(posts.length, 2); // summary + 1 finding
  for (const p of posts) {
    assert.ok(p.text.includes('🇺🇸') && p.text.includes('🇪🇸') && p.text.includes('🇧🇷'));
    assert.strictEqual((p.text.match(/#SEO/g) || []).length, 1, 'hashtags only once');
    assert.ok(p.text.length < 3000, 'fits LinkedIn');
    assert.ok(p.shortText.length <= 280);
  }
});

test('AdXR: X-Rays structure and writes ads in 3 languages without copying words', async () => {
  const adxr = require('../lib/adxr');
  const winner = 'Dentists in Kansas City: are you tired of empty chairs on Mondays?\nWe helped 120+ clinics fill their schedule in 30 days.\nGet a free marketing audit this week. Only 5 spots left.\nBook your call now 👇 link below';
  const { blueprint } = adxr.analyzeAd(winner, { daysRunning: 45 });
  assert.deepStrictEqual(blueprint.order, ['hook', 'proof', 'offer', 'cta']);
  const target = JSON.parse(JSON.stringify(adxr.PRESETS.querytrends));
  target.en.proof = '47 local websites checked';
  const { ads, skipped } = await adxr.generateAds(blueprint, target, { langs: ['en', 'es', 'pt'], count: 3 });
  assert.strictEqual(skipped.length, 0);
  assert.strictEqual(ads.length, 9);
  for (const a of ads) {
    assert.ok(!/clinics|empty chairs|Mondays/i.test(a.text), 'never copies the winner\'s words');
    assert.ok(a.text.includes('https://querytrends.ai/free-snapshot'));
    assert.ok(a.text.split('\n')[0].length <= 125);
  }
  assert.strictEqual(new Set(ads.filter((a) => a.lang === 'en').map((a) => a.hookType)).size, 3, '3 different hooks to test');
});

test('AdXR: skips a language whose target fields are empty', async () => {
  const adxr = require('../lib/adxr');
  const { blueprint } = adxr.analyzeAd('Tired of slow sales? Get a free audit today. Click the link below.');
  const { ads, skipped } = await adxr.generateAds(blueprint, { en: { audience: 'gyms', pain: 'members quit', offer: 'free audit' } }, { langs: ['en', 'es'] });
  assert.ok(ads.length > 0 && ads.every((a) => a.lang === 'en'));
  assert.deepStrictEqual(skipped.map((s) => s.lang), ['es']);
});

test('AdSuperXR: a found need is matched anonymously until the person agrees', () => {
  const fs = require('fs');
  const s = require('../lib/superxr');
  const backup = fs.existsSync(s.DATA_FILE) ? fs.readFileSync(s.DATA_FILE) : null;
  try {
    s.clearData();
    s.importProperties('Address,Area,Price,Beds,Baths\nTest Home,Liberty,265000,3,2\nBig Home,Kearney,410000,5,3');
    const n = s.addNeed({ platform: 'Reddit', areas: 'Liberty', budget: '275k', beds: '3', timeline: 'Now' });
    let m = s.matchAll({ minScore: 60 });
    assert.strictEqual(m.results[0].buyers.length, 1);
    assert.strictEqual(m.results[0].buyers[0].shareable, false, 'anonymous before agreement');
    assert.strictEqual(m.results[1].buyers.length, 0, 'over budget is not a match');
    s.setStatus(n.id, 'interested');
    assert.strictEqual(s.matchAll({ minScore: 60 }).results[0].buyers[0].shareable, true);
    s.setStatus(n.id, 'not interested');
    assert.strictEqual(s.matchAll({ minScore: 60 }).results[0].buyers.length, 0, 'removed after a no');
    assert.ok(!('phone' in n) && !('email' in n), 'no contact details stored for found needs');
  } finally {
    if (backup) fs.writeFileSync(s.DATA_FILE, backup); else s.clearData();
  }
});

test('AdSuperXR: fair-housing wording check in 3 languages', () => {
  const s = require('../lib/superxr');
  assert.ok(s.fairHousingCheck('Perfect for families!').length);
  assert.ok(s.fairHousingCheck('Ideal para familias').length);
  assert.ok(s.fairHousingCheck('Ideal para famílias').length);
  assert.strictEqual(s.fairHousingCheck('3 bedrooms, big yard, near the park.').length, 0);
});
