#!/usr/bin/env node
/**
 * Reset web UI login to default (admin / streamPi).
 * Run on the Pi when you cannot log in: node scripts/reset-web-login.js
 * Uses RADIO_MANAGER_DATA or ~/.radio-manager for app-config.json.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dataDir = process.env.RADIO_MANAGER_DATA || path.join(process.env.HOME || '/home/pi', '.radio-manager');
const configPath = path.join(dataDir, 'app-config.json');

const username = 'admin';
const password = 'streamPi';
const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

let config = { streamingMode: 'SWITCH', auth: null };
try {
  fs.mkdirSync(dataDir, { recursive: true });
  const raw = fs.readFileSync(configPath, 'utf8');
  config = { ...config, ...JSON.parse(raw) };
} catch (e) {
  fs.mkdirSync(dataDir, { recursive: true });
}
config.auth = { username, passwordHash };
fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
console.log('Web login reset to: username =', username, ', password =', password);
console.log('Open the UI and change it in the System tab.');
