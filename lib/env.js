// Loads settings from the .env file (no extra packages needed).
// The .env file holds your private keys and is never uploaded to GitHub.
const fs = require('fs');
const path = require('path');

// Windows Notepad often saves ".env" as ".env.txt", so accept both.
const ENV_FILE = ['.env', '.env.txt']
  .map((name) => path.join(__dirname, '..', name))
  .find((file) => fs.existsSync(file));

if (ENV_FILE) {
  for (const raw of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

module.exports = {
  BLOTATO_API_KEY: process.env.BLOTATO_API_KEY || '',
  BLOTATO_BASE_URL: process.env.BLOTATO_BASE_URL || 'https://backend.blotato.com/v2',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
  PORT: Number(process.env.PORT || 3000),
  // Protects the /api/run endpoint that n8n calls. Leave empty to disable that endpoint.
  RUN_TOKEN: process.env.RUN_TOKEN || '',
};
