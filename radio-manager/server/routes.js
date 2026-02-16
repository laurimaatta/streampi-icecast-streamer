/**
 * REST API routes for radio-manager.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const darkiceConfig = require('./darkice-config');
const darkiceControl = require('./darkice-control');
const appConfig = require('./app-config');
const streamingMode = require('./streaming-mode');
const alsa = require('./alsa');
const backup = require('./backup');
const { validate: validateDarkice } = require('./validate-darkice');
const logger = require('./logger');

const router = express.Router();

// ---------- Auth (session-based) ----------
router.get('/api/auth/status', (req, res) => {
  const conf = appConfig.read();
  if (!conf.auth || !conf.auth.username) {
    return res.json({ loggedIn: false, authEnabled: false });
  }
  const loggedIn = !!(req.session && conf.auth && req.session.user === conf.auth.username);
  res.json({ loggedIn, authEnabled: true });
});

router.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const conf = appConfig.read();
  if (!conf.auth || !conf.auth.username || !conf.auth.passwordHash) {
    return res.json({ ok: true });
  }
  const user = String(username || '').trim();
  const pass = String(password || '').trim();
  if (!user || !pass) {
    return res.status(400).json({ error: 'Syötä käyttäjätunnus ja salasana.' });
  }
  const hash = crypto.createHash('sha256').update(pass).digest('hex');
  if (user !== String(conf.auth.username) || hash !== String(conf.auth.passwordHash)) {
    return res.status(401).json({ error: 'Väärä käyttäjätunnus tai salasana.' });
  }
  req.session.user = conf.auth.username;
  res.json({ ok: true });
});

router.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.clearCookie('connect.sid', { path: '/' });
    res.json({ ok: true });
  });
});

// ---------- DarkIce config ----------
router.get('/api/darkice', (req, res) => {
  try {
    const cfg = darkiceConfig.getForApi();
    if (!cfg) return res.status(500).json({ error: 'Could not read darkice config' });
    res.json(cfg);
  } catch (e) {
    logger.error('GET /api/darkice', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

router.put('/api/darkice', (req, res) => {
  const errs = validateDarkice(req.body);
  if (errs.length) return res.status(400).json({ error: errs.join('; ') });
  try {
    darkiceConfig.saveFromApi(req.body);
    res.json({ ok: true });
  } catch (e) {
    logger.error('PUT /api/darkice', { error: e.message });
    res.status(400).json({ error: e.message });
  }
});

// ---------- Streaming control ----------
router.get('/api/streaming/status', (req, res) => {
  try {
    const status = darkiceControl.status();
    const gpioActive = darkiceControl.gpioServiceIsActive();
    const mode = appConfig.getStreamingMode();
    res.json({
      active: status.active,
      enabled: status.enabled,
      gpioActive,
      mode,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/streaming/start', (req, res) => {
  const mode = appConfig.getStreamingMode();
  if (mode === 'SWITCH') {
    return res.status(400).json({ error: 'Lähetys on kytkimen tilassa; käytä fyysistä kytkintä.' });
  }
  const r = darkiceControl.start();
  if (r.ok) res.json({ ok: true }); else res.status(500).json({ error: r.error || 'Start failed' });
});

router.post('/api/streaming/stop', (req, res) => {
  const mode = appConfig.getStreamingMode();
  if (mode === 'SWITCH') {
    return res.status(400).json({ error: 'Lähetys on kytkimen tilassa; käytä fyysistä kytkintä.' });
  }
  const r = darkiceControl.stop();
  if (r.ok) res.json({ ok: true }); else res.status(500).json({ error: r.error || 'Stop failed' });
});

router.post('/api/streaming/restart', (req, res) => {
  const r = darkiceControl.restart();
  if (r.ok) res.json({ ok: true }); else res.status(500).json({ error: r.error || 'Restart failed' });
});

router.get('/api/streaming/mode', (req, res) => {
  res.json({ mode: appConfig.getStreamingMode() });
});

const VALID_MODES = ['ON', 'OFF', 'SWITCH', 'WEBUI'];
function normalizeMode(m) {
  if (m == null) return null;
  const s = String(m).trim().toUpperCase().replace(/\s+/g, '');
  return s === 'WEBUI' ? 'WEBUI' : (VALID_MODES.includes(s) ? s : null);
}

router.put('/api/streaming/mode', (req, res) => {
  const mode = normalizeMode(req.body?.mode);
  if (!mode) {
    return res.status(400).json({ error: 'Invalid mode: use SWITCH or WEBUI' });
  }
  try {
    appConfig.setStreamingMode(mode);
    const r = streamingMode.applyStreamingMode(mode);
    res.json({ ok: r.ok !== false, mode });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Audio (ALSA) ----------
router.get('/api/audio/cards', (req, res) => {
  try {
    const cards = alsa.listCards();
    const currentCard = alsa.CARD;
    res.json({ cards, currentCard });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/audio/controls', (req, res) => {
  try {
    const controls = alsa.getRelevantControls();
    res.json(controls);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/audio/state-saved', (req, res) => {
  try {
    const saved = alsa.hasStoredState();
    res.json({ saved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/audio/devices', (req, res) => {
  try {
    const devices = alsa.listCaptureDevices();
    res.json(devices);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/audio/control/:name', (req, res) => {
  const c = alsa.getControl(req.params.name);
  if (!c) return res.status(404).json({ error: 'Control not found' });
  res.json(c);
});

router.put('/api/audio/control/:name', (req, res) => {
  const { value } = req.body; // number or [n, m]
  const r = alsa.setControl(req.params.name, value);
  if (r.ok) res.json({ ok: true }); else res.status(500).json({ error: r.error });
});

router.post('/api/audio/store', (req, res) => {
  const r = alsa.storeState();
  if (r.ok) res.json({ ok: true }); else res.status(500).json({ error: r.error });
});

router.post('/api/audio/restore', (req, res) => {
  const r = alsa.restoreState();
  if (r.ok) res.json({ ok: true }); else res.status(500).json({ error: r.error });
});

router.post('/api/audio/apply-defaults', (req, res) => {
  try {
    const r = alsa.applyIqaudioDefaults();
    res.json({ ok: true, applied: r.applied });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- System / Backup ----------
router.get('/api/backup/export', (req, res) => {
  try {
    const payload = backup.buildBackupPayload();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="radio-manager-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/backup/import', (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON backup' });
  }
  const result = backup.restoreFromPayload(payload);
  if (result.ok) {
    streamingMode.applyCurrentMode();
    res.json({ ok: true });
  } else {
    res.status(400).json({ ok: false, errors: result.errors });
  }
});

router.get('/api/backup/list', (req, res) => {
  try {
    const list = backup.listLocalBackups();
    res.json(list.map(({ name, path: backupPath, mtime }) => ({ name, path: backupPath, mtime })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/backup/save', (req, res) => {
  try {
    const filePath = backup.saveLocalBackup();
    res.json({ ok: true, path: filePath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/backup/restore', (req, res) => {
  const { path: filePath, name: backupName } = req.body || {};
  const pathToUse = filePath || (backupName ? path.join(backup.BACKUP_DIR, backupName) : null);
  if (!pathToUse || typeof pathToUse !== 'string') {
    return res.status(400).json({ error: 'Missing path or name' });
  }
  const result = backup.restoreFromLocalFile(pathToUse);
  if (result.ok) {
    streamingMode.applyCurrentMode();
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: result.error });
  }
});

// ---------- App config ----------
router.get('/api/config', (req, res) => {
  try {
    const c = appConfig.read();
    const auth = c.auth
      ? { enabled: true, username: c.auth.username }
      : { enabled: false };
    res.json({ streamingMode: c.streamingMode, auth });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/api/config/auth', (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const crypto = require('crypto');
  const ADMIN_USER = 'admin';
  try {
    const current = appConfig.read();
    const hasAuth = current.auth && current.auth.username && current.auth.passwordHash;

    const verifyCurrent = (pwd) =>
      hasAuth && crypto.createHash('sha256').update(String(pwd)).digest('hex') === String(current.auth.passwordHash);

    if (!newPassword) {
      if (!hasAuth) return res.json({ ok: true });
      if (!verifyCurrent(currentPassword)) {
        return res.status(400).json({ error: 'Nykyinen salasana on väärä.' });
      }
      appConfig.setAuth(null, null);
      return res.json({ ok: true });
    }

    if (hasAuth && (!currentPassword || !verifyCurrent(currentPassword))) {
      return res.status(400).json({ error: 'Nykyinen salasana on väärä.' });
    }

    if (newPassword && String(newPassword).trim() !== '') {
      appConfig.setAuth(ADMIN_USER, newPassword);
    } else {
      appConfig.setAuth(ADMIN_USER, null);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Static UI ----------
const publicDir = path.join(__dirname, '..', 'public');
router.use(express.static(publicDir));

router.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const index = path.join(publicDir, 'index.html');
  if (fs.existsSync(index)) {
    res.sendFile(index);
  } else {
    next();
  }
});

module.exports = router;
