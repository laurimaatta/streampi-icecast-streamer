/**
 * REST API routes for radio-manager.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');
const darkiceConfig = require('./darkice-config');
const darkiceControl = require('./darkice-control');
const appConfig = require('./app-config');
const config = require('./config');
const streamingMode = require('./streaming-mode');
const muteControl = require('./mute-control');
const alsa = require('./alsa');
const backup = require('./backup');
const { validate: validateDarkice } = require('./validate-darkice');
const logger = require('./logger');

const router = express.Router();

/** Check if string looks like IPv4 or IPv6. */
function isIp(host) {
  if (!host || typeof host !== 'string') return false;
  const trimmed = host.trim();
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) return true;
  if (trimmed.includes(':')) return true; // simplistic IPv6
  return false;
}

/** Get primary non-internal IPv4 from server. */
function getPrimaryIpv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '';
}

/**
 * Copy server certs to nginx ssl dir and reload nginx.
 * Errors are logged but not thrown – cert download should still succeed
 * even if nginx is not installed.
 */
function reloadNginxCerts(certDir) {
  const NGINX_SSL_DIR = '/etc/nginx/ssl';
  const serverPem = path.join(certDir, 'server.pem');
  const serverKey = path.join(certDir, 'server.key');

  // Use the pre-installed helper script when available (from install.sh)
  const helperScript = '/usr/local/bin/streampi-reload-nginx-certs';
  if (fs.existsSync(helperScript)) {
    const r = spawnSync('sudo', [helperScript], { stdio: 'ignore' });
    if (r.status === 0) { logger.info('nginx reloaded via helper script'); return; }
    logger.warn('nginx helper script failed, falling back to direct commands');
  }

  // Fallback: direct sudo commands (requires matching sudoers rules)
  spawnSync('sudo', ['mkdir', '-p', NGINX_SSL_DIR], { stdio: 'ignore' });
  const cp = spawnSync('sudo', ['cp', serverPem, serverKey, NGINX_SSL_DIR + '/'], { stdio: 'ignore' });
  if (cp.status !== 0) {
    logger.warn('Could not copy certs to nginx ssl dir – nginx may need manual update');
    return;
  }
  const reload = spawnSync('sudo', ['systemctl', 'reload', 'nginx'], { stdio: 'ignore' });
  if (reload.status === 0) {
    logger.info('nginx reloaded with new certs');
  } else {
    logger.warn('nginx reload failed or nginx not running');
  }
}

/** Read server cert and return { hostname, hostnames, ips } for display. */
function getCertInfo() {
  const certDir = path.join(config.APP_DATA_DIR, 'certs');
  const serverPem = path.join(certDir, 'server.pem');
  if (!fs.existsSync(serverPem)) return { hasCert: false };
  try {
    const pem = fs.readFileSync(serverPem, 'utf8');
    const cert = new crypto.X509Certificate(pem);
    const subject = cert.subject || '';
    const cnMatch = subject.match(/CN\s*=\s*([^,/]+)/);
    const hostname = cnMatch ? cnMatch[1].trim() : '';
    const hostnames = [];
    const ips = [];
    const san = cert.subjectAltName || '';
    san.split(',').forEach((part) => {
      const p = part.trim();
      const colon = p.indexOf(':');
      if (colon === -1) return;
      const type = p.slice(0, colon).trim();
      const value = p.slice(colon + 1).trim();
      if (type === 'DNS') hostnames.push(value);
      else if (type === 'IP Address' || type === 'IP') ips.push(value);
    });
    return { hasCert: true, hostname, hostnames, ips };
  } catch (e) {
    logger.warn('Could not read cert info', { error: e.message });
    return { hasCert: false };
  }
}

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

// ---------- Mute (vaimennus) ----------
router.get('/api/mute/status', (req, res) => {
  try {
    res.json(muteControl.getMuteStatus());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Toggle web mute (only when hasMuteSwitch=false)
router.put('/api/mute/set', async (req, res) => {
  try {
    if (appConfig.getHasMuteSwitch()) {
      return res.status(400).json({ error: 'Vaimennuskytkin on käytössä – tila ohjataan kytkimellä.' });
    }
    const muted = req.body?.muted === true || req.body?.muted === 'true';
    const r = await muteControl.setWebMute(muted);
    if (r.ok) res.json({ ok: true, muted }); else res.status(500).json({ error: r.error });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save hasMuteSwitch setting (from system tab)
router.put('/api/mute/switch-setting', async (req, res) => {
  try {
    const hasMuteSwitch = Boolean(req.body?.hasMuteSwitch);
    appConfig.setHasMuteSwitch(hasMuteSwitch);
    const r = await muteControl.applyMuteSwitch(hasMuteSwitch);
    res.json({ ok: r.ok !== false, hasMuteSwitch });
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
  const { value } = req.body;
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

/** True if restore only had non-fatal errors (e.g. ALSA failed but darkice/app ok). */
function isPartialRestoreSuccess(result) {
  if (result.ok || !result.errors || result.errors.length === 0) return false;
  return result.errors.every((e) => e.step === 'alsa');
}

router.post('/api/backup/import', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Invalid JSON backup' });
    }
    const result = backup.restoreFromPayload(payload);
    if (result.ok || isPartialRestoreSuccess(result)) {
      streamingMode.applyCurrentMode();
      await muteControl.applyMuteSwitch(appConfig.getHasMuteSwitch());
      return res.json(result.ok ? { ok: true } : { ok: true, warnings: result.errors });
    }
    return res.status(400).json({
      error: result.errors?.map((e) => e.error).join(' ') || 'Restore failed',
      errors: result.errors,
    });
  } catch (e) {
    logger.error('Backup import failed', { error: e.message });
    res.status(500).json({ error: e.message });
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
    const status = e.code === 'BACKUP_LIMIT' ? 400 : 500;
    res.status(status).json({ error: e.message });
  }
});

router.delete('/api/backup/:name', (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name || '');
    const result = backup.deleteLocalBackup(name);
    if (!result.ok) return res.status(404).json({ error: result.error });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/api/backup/restore', async (req, res) => {
  try {
    const { path: filePath, name: backupName } = req.body || {};
    const pathToUse = filePath || (backupName ? path.join(backup.BACKUP_DIR, backupName) : null);
    if (!pathToUse || typeof pathToUse !== 'string') {
      return res.status(400).json({ error: 'Missing path or name' });
    }
    const result = backup.restoreFromLocalFile(pathToUse);
    if (result.ok || isPartialRestoreSuccess(result)) {
      streamingMode.applyCurrentMode();
      await muteControl.applyMuteSwitch(appConfig.getHasMuteSwitch());
      return res.json(result.ok ? { ok: true } : { ok: true, warnings: result.errors });
    }
    const errMsg = result.errors?.length
      ? result.errors.map((e) => e.error).join(' ')
      : (result.error || 'Restore failed');
    return res.status(400).json({ error: errMsg, errors: result.errors });
  } catch (e) {
    logger.error('Backup restore failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ---------- HTTPS certificate: info, download existing, or regenerate and download ----------
router.get('/api/certs/info', (req, res) => {
  try {
    const info = getCertInfo();
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/certs/ca', (req, res) => {
  try {
    const certDir = path.join(config.APP_DATA_DIR, 'certs');
    const caPath = path.join(certDir, 'ca', 'ca.pem');
    if (!fs.existsSync(caPath)) {
      return res.status(404).json({ error: 'Varmenteetta ei ole. Luo uusi varmenne ensin.' });
    }
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', 'attachment; filename="StreamPi-varmenne.pem"');
    res.sendFile(caPath);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/certs/download-ca', (req, res) => {
  try {
    // Always include both hostname.local (mDNS) and primary IP so both URLs work.
    // If system hostname is an IP (misconfigured), use a fixed .local name so cert still has a DNS entry.
    const rawHost = (os.hostname() || 'raspberrypi').trim();
    const certHostname = isIp(rawHost)
      ? 'streampi.local'
      : (rawHost.endsWith('.local') ? rawHost : rawHost + '.local');
    const certIp = getPrimaryIpv4();
    const certDir = path.join(config.APP_DATA_DIR, 'certs');
    const scriptPath = path.join(__dirname, '..', 'scripts', 'generate-certs.js');
    const env = {
      ...process.env,
      REGENERATE_CA: '1',
      CERT_HOSTNAME: certHostname,
      CERT_IP: certIp,
      RADIO_MANAGER_DATA: config.APP_DATA_DIR,
    };
    const out = spawnSync(process.execPath, [scriptPath, certDir], {
      env,
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      timeout: 60000,
    });
    if (out.status !== 0) {
      logger.error('Certificate generation failed', { stderr: out.stderr, stdout: out.stdout });
      return res.status(500).json({ error: 'Varmennegenerointi epäonnistui. Tarkista lokit.' });
    }
    const caPath = path.join(certDir, 'ca', 'ca.pem');
    if (!fs.existsSync(caPath)) {
      return res.status(500).json({ error: 'Varmennetiedostoa ei luotu.' });
    }
    const filename = 'StreamPi-varmenne.pem';
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // Copy new certs to nginx and reload nginx BEFORE restarting ourselves.
    // (systemctl restart kills the current process, so nginx reload must come first.)
    reloadNginxCerts(certDir);

    res.sendFile(caPath, (err) => {
      if (err) logger.error('Send ca.pem failed', { error: err.message });
      // Restart radio-manager after file is sent, in a detached process with a small
      // delay so the HTTP response fully flushes before this process dies.
      const child = spawn('sudo', ['systemctl', 'restart', 'radio-manager.service'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    });
  } catch (e) {
    logger.error('Download CA failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ---------- App config ----------
router.get('/api/config', (req, res) => {
  try {
    const c = appConfig.read();
    const auth = c.auth
      ? { enabled: true, username: c.auth.username }
      : { enabled: false };
    res.json({
      streamingMode: c.streamingMode,
      hasMuteSwitch: Boolean(c.hasMuteSwitch),
      auth,
    });
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
