/**
 * Apply streaming mode: SWITCH / WEBUI / (legacy: ON / OFF).
 * - SWITCH: start GPIO service (switch controls DarkIce).
 * - WEBUI: stop GPIO, DarkIce controlled via web start/stop.
 * - ON: stop GPIO, start DarkIce (legacy).
 * - OFF: stop GPIO, stop DarkIce (legacy).
 */
const darkiceControl = require('./darkice-control');
const appConfig = require('./app-config');
const logger = require('./logger');

function applyStreamingMode(mode) {
  if (mode === 'SWITCH') {
    darkiceControl.gpioServiceStart();
    logger.darkice('Streaming mode SWITCH: GPIO service started');
    return { ok: true, mode: 'SWITCH' };
  }
  darkiceControl.gpioServiceStop();
  if (mode === 'ON') {
    const r = darkiceControl.start();
    logger.darkice('Streaming mode ON: DarkIce started');
    return r;
  }
  if (mode === 'OFF') {
    const r = darkiceControl.stop();
    logger.darkice('Streaming mode OFF: DarkIce stopped');
    return r;
  }
  if (mode === 'WEBUI') {
    logger.darkice('Streaming mode WEBUI: control via web UI');
    return { ok: true, mode: 'WEBUI' };
  }
  return { ok: true, mode };
}

function applyCurrentMode() {
  const mode = appConfig.getStreamingMode();
  return applyStreamingMode(mode);
}

module.exports = {
  applyStreamingMode,
  applyCurrentMode,
};
