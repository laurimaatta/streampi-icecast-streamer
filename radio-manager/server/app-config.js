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

function setStreamingMode(mode) {
  if (!['ON', 'OFF', 'SWITCH'].includes(mode)) {
    throw new Error('Invalid streaming mode');
  }
  return write({ streamingMode: mode });
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
