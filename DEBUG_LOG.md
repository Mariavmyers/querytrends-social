# Debug log

Real problems found while building this app, and how each was fixed.
Found by reading logs, running tests, and clicking through the app in a headless browser.

## 1. A missing file looked like it existed (soft 404)
**Symptom:** The first version of the `llms.txt` check said querytrends.ai *had* an llms.txt file.
**Cause:** The site answers *every* address with status 200 and a normal HTML page, even for files that don't exist. Checking "status = 200" wasn't enough.
**Fix:** The check now also looks at the content type and the first characters of the file. An HTML page is not an llms.txt. The same discovery became its own check: "fake addresses show a normal page (soft 404)."

## 2. Scheduled posts would have published immediately
**Symptom (caught in the docs, before it happened):** Blotato silently ignores `scheduledTime` if it is placed *inside* the `post` object, and publishes right away.
**Fix:** `buildPayload()` always puts `scheduledTime` next to `post`. An automated test (`test/core.test.js`) fails if this ever changes.

## 3. The X/Twitter version lost the most useful line
**Symptom:** The 280-character version kept the hook and the problem, but cut off the fix.
**Cause:** It trimmed lines from the bottom until it fit.
**Fix:** For problem/fix posts, the short version now keeps the problem, the fix and the question, and drops the hook. Covered by a test.

## 4. A misleading "wrong API key" error during testing
**Symptom:** Dry-run mode (no API key) returned "Your Blotato API key is wrong."
**Cause:** Not an app bug. The test started a new server on a port that an older test server still held. The new server crashed, and the request reached the old one, which had a bad key.
**Lesson:** When an error doesn't make sense, check *which process* answered. Re-tested on a clean port, and dry run worked.

## 5. Blotato's account list format isn't fully documented
**Risk:** The docs don't show the exact JSON shape returned by `/users/me/accounts`.
**Fix:** `asList()` accepts the common shapes (`[...]`, `{items}`, `{accounts}`, `{data}`), and every Blotato response status is logged to `logs/app.log`, so a mismatch is easy to spot. Tested against a mock Blotato server.

## 6. You had to scroll past every post to pick an account
**Symptom:** Found in a headless-browser screenshot: the "Where to post" picker sat below all 8 posts.
**Fix:** Moved it to step 2, so you choose the account before the posts are written.

## 7. `npm test` crashed on Node 22
**Symptom:** `Cannot find module '.../test'`.
**Cause:** `node --test test/` with a folder path isn't supported the way I expected.
**Fix:** Changed it to `node --test`, which finds `*.test.js` files automatically. 8/8 tests pass.

## Safety checks
- API keys are redacted from logs. Verified: 0 occurrences of test keys in `logs/app.log`.
- `.env` and `logs/` are in `.gitignore`.
- The scanner refuses private and internal addresses (localhost, 10.x, 192.168.x…), so it can't be used to probe a home network.
- Path-traversal attempts on the web server (`/../server.js`) return 404.
