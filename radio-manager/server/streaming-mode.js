/**
 * Apply streaming mode: ON / OFF / SWITCH.
 * - SWITCH: start GPIO service (button controls DarkIce), ensure DarkIce service can be toggled by GPIO.
 * - ON: stop GPIO service, start DarkIce.
 * - OFF: stop GPIO service, stop DarkIce.
 */
const darkiceControl = require('./darkice-control');
const appConfig = require('./app-config');
const logger = require('./logger');

function applyStreamingMode(mode) {
  const prevMode = appConfig.getStreamingMode();
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
