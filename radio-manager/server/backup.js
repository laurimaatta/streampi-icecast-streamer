/**
 * Export/import configuration backup (JSON).
 * Includes: darkice.cfg (as API shape), ALSA state path, app config (streaming mode, etc.).
 */
const fs = require('fs');
const path = require('path');
const { BACKUP_DIR, APP_CONFIG_FILE, ALSA_STATE_FILE, DARKICE_CFG } = require('./config');
const darkiceConfig = require('./darkice-config');
const appConfig = require('./app-config');
const logger = require('./logger');

function ensureBackupDir() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  } catch (_) {}
}

/**
 * Build backup object (no binary; ALSA state is stored as path reference or we include base64).
 */
function buildBackupPayload() {
  const darkice = darkiceConfig.getForApi();
  const app = appConfig.read();
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    darkice: darkice || {},
    app: {
      streamingMode: app.streamingMode,
    },
    alsa: null,
  };
  if (fs.existsSync(ALSA_STATE_FILE)) {
    try {
      payload.alsa = fs.readFileSync(ALSA_STATE_FILE, 'utf8');
    } catch (_) {
      payload.alsaNote = 'ALSA state file could not be read';
    }
  }
  return payload;
}

/**
 * Save backup to local file on the Pi. Returns path.
 */
function saveLocalBackup() {
  ensureBackupDir();
  const name = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const filePath = path.join(BACKUP_DIR, name);
  const payload = buildBackupPayload();
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  logger.info('Local backup saved', { path: filePath });
  return filePath;
}

/**
 * List local backup files (name, path, mtime).
 */
function listLocalBackups() {
  ensureBackupDir();
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const p = path.join(BACKUP_DIR, f);
      const stat = fs.statSync(p);
      return { name: f, path: p, mtime: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
  return files;
}

/**
 * Restore from backup payload (from upload or local file).
 * Writes darkice.cfg (requires sudo), app config, and ALSA state file; does not run alsactl restore.
 */
function restoreFromPayload(payload) {
  const errors = [];
  if (payload.darkice && Object.keys(payload.darkice).length) {
    try {
      darkiceConfig.saveFromApi(payload.darkice);
    } catch (e) {
      errors.push({ step: 'darkice', error: e.message });
    }
  }
  if (payload.app) {
    try {
      appConfig.write({
        streamingMode: payload.app.streamingMode || 'SWITCH',
      });
    } catch (e) {
      errors.push({ step: 'app', error: e.message });
    }
  }
  if (payload.alsa && typeof payload.alsa === 'string') {
    try {
      const tempFile = path.join(require('os').tmpdir(), 'backup-alsa-restore.state');
      fs.writeFileSync(tempFile, payload.alsa, 'utf8');
      // Use alsa module's restoreState which uses sudo
      const alsa = require('./alsa');
      const r = alsa.restoreState(tempFile);
      if (!r.ok) throw new Error(r.error || 'ALSA restore failed');
      // Clean up temp file
      try { fs.unlinkSync(tempFile); } catch (_) {}
    } catch (e) {
      errors.push({ step: 'alsa', error: e.message });
    }
  }
  if (errors.length) {
    logger.warn('Restore had errors', { errors });
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Restore from a local backup file path.
 */
function restoreFromLocalFile(filePath) {
  if (!fs.existsSync(filePath)) return { ok: false, error: 'File not found' };
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const payload = JSON.parse(raw);
    return restoreFromPayload(payload);
  } catch (e) {
    logger.error('Restore from file failed', { path: filePath, error: e.message });
    return { ok: false, error: e.message };
  }
}

module.exports = {
  buildBackupPayload,
  saveLocalBackup,
  listLocalBackups,
  restoreFromPayload,
  restoreFromLocalFile,
  BACKUP_DIR,
};
