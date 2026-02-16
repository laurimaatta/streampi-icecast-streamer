/**
 * Application config (streaming mode, optional auth) stored in JSON.
 */
const fs = require('fs');
const path = require('path');
const { APP_CONFIG_FILE, APP_DATA_DIR, defaultAppConfig } = require('./config');
const logger = require('./logger');

function ensureDir() {
  try {
    fs.mkdirSync(APP_DATA_DIR, { recursive: true });
  } catch (_) {}
}

function read() {
  try {
    const raw = fs.readFileSync(APP_CONFIG_FILE, 'utf8');
    return { ...defaultAppConfig, ...JSON.parse(raw) };
  } catch (_) {
    return { ...defaultAppConfig };
  }
}

function write(config) {
  ensureDir();
  const current = read();
  const merged = { ...current, ...config };
  fs.writeFileSync(APP_CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
  logger.info('App config saved', { streamingMode: merged.streamingMode });
  return merged;
}

function getStreamingMode() {
  return read().streamingMode;
}

const VALID_STREAMING_MODES = ['ON', 'OFF', 'SWITCH', 'WEBUI'];
function setStreamingMode(mode) {
  const m = mode != null ? String(mode).trim().toUpperCase().replace(/\s+/g, '') : '';
  const normalized = m === 'WEBUI' ? 'WEBUI' : (VALID_STREAMING_MODES.includes(m) ? m : null);
  if (!normalized) {
    throw new Error('Invalid streaming mode; use SWITCH or WEBUI');
  }
  return write({ streamingMode: normalized });
}

function setAuth(username, password) {
  const crypto = require('crypto');
  const hash = password ? crypto.createHash('sha256').update(password).digest('hex') : null;
  return write({
    auth: username && hash ? { username, passwordHash: hash } : null,
  });
}

module.exports = {
  read,
  write,
  getStreamingMode,
  setStreamingMode,
  setAuth,
};
