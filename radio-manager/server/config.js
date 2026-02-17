/**
 * Application configuration.
 * Paths and defaults for Raspberry Pi; overridable via environment.
 * Data dir defaults to ~/.radio-manager (uses HOME so it works with any systemd User=).
 */
const path = require('path');

// Load .env from current directory and from data directory (so .env in ~/.radio-manager works)
require('dotenv').config();
const HOME = process.env.HOME || process.env.USERPROFILE || '/home/user';
const APP_DATA_DIR_DEFAULT = path.join(HOME, '.radio-manager');
try {
  require('dotenv').config({ path: path.join(process.env.RADIO_MANAGER_DATA || APP_DATA_DIR_DEFAULT, '.env') });
} catch (_) {}

const DARKICE_CFG = process.env.DARKICE_CFG || '/etc/darkice.cfg';
const DARKICE_SERVICE = process.env.DARKICE_SERVICE || 'darkice.service';
const GPIO_SERVICE = process.env.GPIO_STREAMING_SERVICE || 'darkice-gpio.service';
const MUTE_GPIO_SERVICE = process.env.MUTE_GPIO_SERVICE || 'mute-gpio.service';
const APP_DATA_DIR = process.env.RADIO_MANAGER_DATA || path.join(process.env.HOME || process.env.USERPROFILE || '/home/user', '.radio-manager');
const BACKUP_DIR = path.join(APP_DATA_DIR, 'backups');
const APP_CONFIG_FILE = path.join(APP_DATA_DIR, 'app-config.json');
const ALSA_STATE_FILE = process.env.ALSA_STATE_FILE || path.join(APP_DATA_DIR, 'asound.state');
const ALSA_CARD = process.env.ALSA_CARD || '0';
const LOG_DIR = path.join(APP_DATA_DIR, 'logs');
const PORT = parseInt(process.env.PORT || '8443', 10);
const BIND = process.env.BIND || '0.0.0.0';

module.exports = {
  DARKICE_CFG,
  DARKICE_SERVICE,
  GPIO_SERVICE,
  MUTE_GPIO_SERVICE,
  APP_DATA_DIR,
  BACKUP_DIR,
  APP_CONFIG_FILE,
  ALSA_STATE_FILE,
  ALSA_CARD,
  LOG_DIR,
  PORT,
  BIND,
  /** Default app config (streaming mode, optional auth) */
  defaultAppConfig: {
    streamingMode: 'SWITCH', // 'SWITCH' | 'WEBUI' | (legacy: 'ON' | 'OFF')
    hasMuteSwitch: false,   // true = fyysinen vaimennuskytkin käytössä (GPIO 22)
    auth: null, // { username, passwordHash } or null
  },
};
