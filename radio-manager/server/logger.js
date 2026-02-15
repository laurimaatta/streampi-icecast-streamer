/**
 * Simple file + console logger for DarkIce status, streaming errors, system errors.
 */
const fs = require('fs');
const path = require('path');
const { LOG_DIR } = require('./config');

const LOG_FILE = path.join(LOG_DIR, 'radio-manager.log');
const MAX_LOG_SIZE = 2 * 1024 * 1024; // 2 MB
const ROTATE_SIZE = 1 * 1024 * 1024; // rotate when > 1 MB

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (_) {}
}

function timestamp() {
  return new Date().toISOString();
}

function append(level, message, meta = {}) {
  ensureLogDir();
  const line = `${timestamp()} [${level}] ${message}${Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''}\n`;
  const out = level === 'ERROR' ? process.stderr : process.stdout;
  out.write(line);
  try {
    fs.appendFileSync(LOG_FILE, line);
    const st = fs.statSync(LOG_FILE);
    if (st.size > ROTATE_SIZE) {
      const rotated = LOG_FILE + '.old';
      if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
      fs.renameSync(LOG_FILE, rotated);
    }
  } catch (e) {
    out.write(`[logger] failed to write log file: ${e.message}\n`);
  }
}

module.exports = {
  info(msg, meta) {
    append('INFO', msg, meta);
  },
  warn(msg, meta) {
    append('WARN', msg, meta);
  },
  error(msg, meta) {
    append('ERROR', msg, meta);
  },
  darkice(msg, meta) {
    append('DARKICE', msg, meta);
  },
  stream(msg, meta) {
    append('STREAM', msg, meta);
  },
};
