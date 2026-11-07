// Tiny logger: writes every event to the console AND to logs/app.log
// so problems can be debugged after the fact. API keys are never logged.
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
fs.mkdirSync(LOG_DIR, { recursive: true });

const SECRET_KEYS = /api[-_]?key|authorization|token|secret/i;

function redact(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEYS.test(k) ? '[REDACTED]' : redact(v);
  }
  return out;
}

function write(level, event, details = {}) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...redact(details),
  });
  fs.appendFileSync(LOG_FILE, line + '\n');
  const print = level === 'error' ? console.error : console.log;
  print(`[${level}] ${event}`, Object.keys(details).length ? redact(details) : '');
}

module.exports = {
  info: (event, details) => write('info', event, details),
  warn: (event, details) => write('warn', event, details),
  error: (event, details) => write('error', event, details),
  LOG_FILE,
};
