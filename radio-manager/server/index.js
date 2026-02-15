/**
 * StreamPi (radio-manager) - HTTPS server and entry point.
 * Runs on Raspberry Pi; applies streaming mode on startup.
 * Uses session-based auth (replaces Basic Auth for proper logout).
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const config = require('./config');
const logger = require('./logger');
const routes = require('./routes');
const appConfig = require('./app-config');
const streamingMode = require('./streaming-mode');
const alsa = require('./alsa');

const app = express();

// Trust X-Forwarded-* when behind nginx so session cookie and secure work correctly
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Session secret: from env or generate and store in app data
const SESSION_SECRET_FILE = path.join(config.APP_DATA_DIR, '.session_secret');
function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try {
    if (fs.existsSync(SESSION_SECRET_FILE)) {
      return fs.readFileSync(SESSION_SECRET_FILE, 'utf8').trim();
    }
  } catch (_) {}
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(config.APP_DATA_DIR, { recursive: true });
    fs.writeFileSync(SESSION_SECRET_FILE, secret, 'utf8');
  } catch (_) {}
  return secret;
}

app.use(session({
  secret: getSessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true, // HTTPS only; use https:// when opening the UI
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

function sessionAuth(req, res, next) {
  // Allow UI (/, index.html, static files) so login form can load; only protect API
  if (!req.path.startsWith('/api')) return next();
  if (req.path === '/api/auth/login' || req.path === '/api/auth/status') return next();
  const conf = appConfig.read();
  if (!conf.auth || !conf.auth.username || !conf.auth.passwordHash) return next();
  if (req.session && req.session.user === conf.auth.username) return next();
  return res.status(401).json({ error: 'Authentication required' });
}

app.use(sessionAuth);
app.use(routes);

function getHttpsOptions() {
  const certDir = process.env.RADIO_MANAGER_CERTS || path.join(config.APP_DATA_DIR, 'certs');
  const keyPath = path.join(certDir, 'server.key');
  const certPath = path.join(certDir, 'server.pem');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }
  logger.warn('HTTPS certs not found; run certificate generation script', { certDir });
  return null;
}

function start() {
  logger.info('Data directory', { APP_DATA_DIR: config.APP_DATA_DIR, APP_CONFIG_FILE: config.APP_CONFIG_FILE });
  const opts = getHttpsOptions();
  if (!opts) {
    logger.error('Cannot start: no TLS key/cert. Run scripts/generate-certs.js');
    process.exit(1);
  }

  const server = https.createServer(opts, app);
  server.listen(config.PORT, config.BIND, () => {
    logger.info('StreamPi listening', {
      port: config.PORT,
      bind: config.BIND,
      https: true,
    });
  });

  server.on('error', (err) => {
    logger.error('Server error', { error: err.message });
    process.exit(1);
  });
}

// Apply saved streaming mode on startup (e.g. after reboot)
try {
  streamingMode.applyCurrentMode();
} catch (e) {
  logger.warn('Could not apply streaming mode on startup', { error: e.message });
}

// Restore ALSA state on startup so saved mixer settings persist across reboots
try {
  if (alsa.hasStoredState()) {
    const r = alsa.restoreState();
    if (r.ok) logger.info('ALSA state restored on startup');
    else logger.warn('ALSA restore on startup failed', { error: r.error });
  }
} catch (e) {
  logger.warn('ALSA restore on startup failed', { error: e.message });
}

start();
