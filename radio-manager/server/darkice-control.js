/**
 * DarkIce service control via systemctl.
 * Safe start/stop/restart and status.
 */
const { execSync } = require('child_process');
const { DARKICE_SERVICE, GPIO_SERVICE } = require('./config');
const logger = require('./logger');

function systemctl(action, service = DARKICE_SERVICE) {
  try {
    execSync(`sudo systemctl ${action} ${service}`, {
      encoding: 'utf8',
      timeout: 15000,
    });
    return { ok: true };
  } catch (e) {
    const msg = e.stderr || e.message || String(e);
    logger.error(`systemctl ${action} ${service} failed`, { error: msg });
    return { ok: false, error: msg };
  }
}

function isActive(service = DARKICE_SERVICE) {
  try {
    const out = execSync(`systemctl is-active ${service}`, { encoding: 'utf8', timeout: 5000 });
    return out.trim() === 'active';
  } catch (_) {
    return false;
  }
}

function start() {
  const r = systemctl('start');
  if (r.ok) logger.darkice('DarkIce started');
  return r;
}

function stop() {
  const r = systemctl('stop');
  if (r.ok) logger.darkice('DarkIce stopped');
  return r;
}

function restart() {
  const r = systemctl('restart');
  if (r.ok) logger.darkice('DarkIce restarted');
  return r;
}

function status() {
  const active = isActive();
  let loadState = 'unknown';
  try {
    loadState = execSync(`systemctl is-enabled ${DARKICE_SERVICE}`, { encoding: 'utf8' }).trim();
  } catch (_) {}
  return { active, enabled: loadState === 'enabled' };
}

/** GPIO service: only running when streaming mode is SWITCH */
function gpioServiceStart() {
  return systemctl('start', GPIO_SERVICE);
}

function gpioServiceStop() {
  return systemctl('stop', GPIO_SERVICE);
}

function gpioServiceIsActive() {
  return isActive(GPIO_SERVICE);
}

module.exports = {
  start,
  stop,
  restart,
  status,
  isActive,
  gpioServiceStart,
  gpioServiceStop,
  gpioServiceIsActive,
};
