/**
 * Validate DarkIce config payload for API. Server/password etc. can come from .env.
 */
function validate(d) {
  const err = [];
  const serverFromEnv = !!process.env.DARKICE_SERVER;
  if (!serverFromEnv && d.server !== undefined && (typeof d.server !== 'string' || !d.server.trim())) {
    err.push('Server address is required (or set DARKICE_SERVER in .env)');
  }
  const port = d.port !== undefined ? parseInt(d.port, 10) : NaN;
  if (d.port !== undefined && (isNaN(port) || port < 1 || port > 65535)) {
    err.push('Port must be 1-65535');
  }
  const sampleRate = d.sampleRate !== undefined ? parseInt(d.sampleRate, 10) : NaN;
  if (d.sampleRate !== undefined && (isNaN(sampleRate) || ![8000, 11025, 16000, 22050, 44100, 48000].includes(sampleRate))) {
    err.push('Sample rate should be one of 8000, 11025, 16000, 22050, 44100, 48000');
  }
  const channel = d.channel !== undefined ? parseInt(d.channel, 10) : NaN;
  if (d.channel !== undefined && (isNaN(channel) || channel < 1 || channel > 2)) {
    err.push('Channel must be 1 (mono) or 2 (stereo)');
  }
  const bitrate = d.bitrate !== undefined ? parseInt(d.bitrate, 10) : NaN;
  if (d.bitrate !== undefined && (isNaN(bitrate) || bitrate < 32 || bitrate > 320)) {
    err.push('Bitrate should be 32-320 kbps');
  }
  if (d.device !== undefined && typeof d.device !== 'string') {
    err.push('Device must be a string');
  }
  return err;
}

module.exports = { validate };
