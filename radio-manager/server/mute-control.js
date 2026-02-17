/**
 * Mute (vaimennus) control.
 *
 * hasMuteSwitch=true  → GPIO 22 -kytkin ohjaa ALSA-vaimennuksen (mute-gpio.service).
 * hasMuteSwitch=false → yksinkertainen web-nappi; tila on pelkässä muistissa,
 *                       ei tallennu – nollautuu palvelimen käynnistyksen yhteydessä.
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { MUTE_GPIO_SERVICE, APP_DATA_DIR, ALSA_CARD } = require('./config');
const appConfig = require('./app-config');
const alsa = require('./alsa');
const logger = require('./logger');

const MUTE_STATE_FILE = path.join(APP_DATA_DIR, 'mute-state.json');
const AUX_CONTROLS = ['Aux', 'Aux Volume'];

// In-memory state – resets to false on every server start (when no hardware switch).
let inMemoryMuted = false;
let inMemoryLevels = {};

// ─── systemd helpers ──────────────────────────────────────────────────────────

function systemctl(action) {
  try {
    execSync(`sudo systemctl ${action} ${MUTE_GPIO_SERVICE}`, { encoding: 'utf8', timeout: 15000 });
    return { ok: true };
  } catch (e) {
    const msg = e.stderr || e.message || String(e);
    logger.error(`systemctl ${action} ${MUTE_GPIO_SERVICE} failed`, { error: msg });
    return { ok: false, error: msg };
  }
}

function isMuteGpioActive() {
  try {
    return execSync(`systemctl is-active ${MUTE_GPIO_SERVICE}`, { encoding: 'utf8', timeout: 5000 }).trim() === 'active';
  } catch (_) { return false; }
}

// ─── Hardware-switch state file (written by aux_mute_gpio.py) ────────────────

function readMuteStateFile() {
  try {
    if (!fs.existsSync(MUTE_STATE_FILE)) return { muted: false, levels: {} };
    const data = JSON.parse(fs.readFileSync(MUTE_STATE_FILE, 'utf8'));
    return { muted: Boolean(data.muted), levels: data.levels || {} };
  } catch (_) { return { muted: false, levels: {} }; }
}

// ─── Web mute (in-memory, no hardware switch) ────────────────────────────────

/**
 * Run one amixer set (async, for parallel unmute).
 */
function amixerSetAsync(name, value) {
  const v = Array.isArray(value) ? value.join(',') : String(value);
  return new Promise((resolve, reject) => {
    const p = spawn('amixer', ['-c', String(ALSA_CARD), 'set', name, v], {
      stdio: 'ignore',
      timeout: 5000,
    });
    p.on('error', (err) => reject(err));
    p.on('close', (code) => (code === 0 ? resolve({ ok: true }) : reject(new Error(`amixer ${name} exit ${code}`))));
  });
}

/**
 * Set or clear software mute via web UI.
 * Levels are kept in process memory only – not written to disk.
 * Unmute runs both ALSA controls in parallel to reduce latency.
 */
function setWebMute(muted) {
  if (muted) {
    inMemoryLevels = {};
    for (const name of AUX_CONTROLS) {
      const c = alsa.getControl(name);
      if (c && c.values && c.values.length) {
        inMemoryLevels[name] = c.values;
        const r = alsa.setControl(name, 0);
        if (!r.ok) logger.error('ALSA mute failed', { control: name, error: r.error });
      }
    }
    inMemoryMuted = true;
    return Promise.resolve({ ok: true });
  }
  const promises = [];
  for (const name of AUX_CONTROLS) {
    if (Array.isArray(inMemoryLevels[name])) {
      promises.push(amixerSetAsync(name, inMemoryLevels[name]).catch((err) => {
        logger.error('ALSA unmute failed', { control: name, error: err.message });
      }));
    }
  }
  return Promise.all(promises).then(() => {
    inMemoryMuted = false;
    return { ok: true };
  });
}

// ─── Status ──────────────────────────────────────────────────────────────────

function getMuteStatus() {
  const hasMuteSwitch = appConfig.getHasMuteSwitch();

  if (hasMuteSwitch) {
    const gpioActive = isMuteGpioActive();
    const { muted: hwMuted } = readMuteStateFile();
    const effectiveMuted = gpioActive ? hwMuted : false;
    return {
      muted: effectiveMuted,
      effectiveMuted,
      hardwareMuted: gpioActive ? hwMuted : null,
      hasMuteSwitch: true,
      gpioActive,
    };
  }

  return {
    muted: inMemoryMuted,
    effectiveMuted: inMemoryMuted,
    hardwareMuted: null,
    hasMuteSwitch: false,
    gpioActive: false,
  };
}

// ─── Apply settings on mode change ───────────────────────────────────────────

async function applyMuteSwitch(hasMuteSwitch) {
  if (hasMuteSwitch) {
    if (inMemoryMuted) await setWebMute(false);
    return systemctl('start');
  }
  systemctl('stop');
  if (inMemoryMuted) await setWebMute(false);
  return { ok: true };
}

// Called on server startup – restore correct ALSA state.
function applyOnStartup() {
  const hasMuteSwitch = appConfig.getHasMuteSwitch();
  // inMemoryMuted is always false on startup regardless of saved config.
  inMemoryMuted = false;
  inMemoryLevels = {};
  if (hasMuteSwitch) {
    return systemctl('start');
  }
  systemctl('stop');
  return { ok: true };
}

module.exports = {
  getMuteStatus,
  setWebMute,
  applyMuteSwitch,
  applyOnStartup,
  isMuteGpioActive,
  // kept for backup/restore compat:
  readMuteStateFile,
};
