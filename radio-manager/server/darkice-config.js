/**
 * Parse and generate darkice.cfg (INI-style).
 * Server, port, mountPoint, password, name can come from .env (not stored in repo).
 */
const fs = require('fs');
const { DARKICE_CFG } = require('./config');
const logger = require('./logger');

/** Values from .env override config file for these keys. */
function getEnvOverrides() {
  return {
    server: process.env.DARKICE_SERVER,
    port: process.env.DARKICE_PORT,
    mountPoint: process.env.DARKICE_MOUNT_POINT,
    password: process.env.DARKICE_PASSWORD,
    name: process.env.DARKICE_NAME,
  };
}

/** Which icecast fields are set via .env (so UI can show placeholder). */
function getFromEnv() {
  const o = getEnvOverrides();
  return {
    server: !!o.server,
    port: !!o.port,
    mountPoint: !!o.mountPoint,
    password: !!o.password,
    name: !!o.name,
  };
}

const SECTION = /^\s*\[([^\]]+)\]\s*$/;
const KEY_VALUE = /^\s*([^#=]+)=(.*)$/;

/** Strip inline comment (# to EOL) and trim. */
function cleanValue(s) {
  if (s == null || typeof s !== 'string') return '';
  return s.replace(/\s*#.*$/, '').replace(/^["']|["']$/g, '').trim();
}

function parse(content) {
  const sections = {};
  let current = null;
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const sectionMatch = line.match(SECTION);
    if (sectionMatch) {
      current = sectionMatch[1].trim();
      sections[current] = sections[current] || {};
      continue;
    }
    const kv = line.match(KEY_VALUE);
    if (kv && current) {
      const key = kv[1].trim();
      const value = cleanValue(kv[2]);
      sections[current][key] = value;
    }
  }
  return sections;
}

function serialize(sections) {
  const out = [];
  for (const [name, keys] of Object.entries(sections)) {
    out.push(`[${name}]`);
    for (const [k, v] of Object.entries(keys)) {
      out.push(`${k} = ${v}`);
    }
    out.push('');
  }
  return out.join('\n');
}

/**
 * Read current darkice.cfg from disk.
 */
function read() {
  try {
    let content = fs.readFileSync(DARKICE_CFG, 'utf8');
    content = content.replace(/\uFEFF/g, ''); // strip BOM
    return parse(content);
  } catch (e) {
    logger.error('darkice config read failed', { path: DARKICE_CFG, error: e.message });
    return null;
  }
}

/**
 * Map parsed INI to a flat structure for the API. 
 * Fields in .env are shown but marked as fromEnv (UI can display as read-only placeholders).
 * Web saves go to darkice.cfg; .env values are used when writing config if field is not changed.
 */
function toApi(parsed) {
  if (!parsed) return null;
  const input = parsed.input || {};
  const general = parsed.general || {};
  const icecastKey = Object.keys(parsed).find((k) => /^icecast2?-?\d*$/i.test(k.trim()));
  const icecastSection = icecastKey ? parsed[icecastKey] : (parsed['icecast2-0'] || parsed['icecast2'] || {});
  const ice = icecastSection || {};
  const env = getEnvOverrides();

  // Use cfg values; fall back to .env only if cfg is missing
  return {
    duration: general.duration !== undefined ? general.duration : '0',
    bufferSecs: general.bufferSecs !== undefined ? general.bufferSecs : '5',
    reconnect: general.reconnect !== undefined ? general.reconnect : 'yes',
    device: input.device !== undefined ? input.device : 'plughw:0,0',
    sampleRate: input.sampleRate !== undefined ? input.sampleRate : '44100',
    bitsPerSample: input.bitsPerSample !== undefined ? input.bitsPerSample : '16',
    channel: input.channel !== undefined ? input.channel : '1',
    bitrateMode: ice.bitrateMode !== undefined ? ice.bitrateMode : 'cbr',
    format: ice.format !== undefined ? ice.format : 'mp3',
    bitrate: ice.bitrate !== undefined ? ice.bitrate : '128',
    quality: ice.quality !== undefined ? ice.quality : '0.8',
    // Server, port, mountPoint, password, name: use cfg value; fall back to .env if cfg is empty
    server: ice.server || env.server || '',
    port: ice.port || env.port || '8000',
    mountPoint: ice.mountPoint || env.mountPoint || 'live.mp3',
    password: ice.password ? ice.password : (env.password ? '********' : ''),
    name: ice.name || env.name || 'Stream',
  };
}

/**
 * Map API payload back to INI sections. 
 * .env values are used as fallback when saving (e.g., if password is masked and .env has password, use .env).
 * Otherwise, use the API payload values (web edits are saved to darkice.cfg).
 */
function fromApi(api) {
  const env = getEnvOverrides();
  const parsed = read();
  const icecastKey = parsed && Object.keys(parsed).find((k) => /^icecast2?-?\d*$/i.test(k.trim()));
  const currentIce = (parsed && icecastKey && parsed[icecastKey]) || {};
  
  // Password: if masked (********) keep current cfg value, or use .env if cfg is empty
  const keepPassword = api.password === '********' || api.password === undefined;
  const password = keepPassword
    ? (currentIce.password || env.password || '')
    : (api.password || '');
  
  const sections = {
    general: {
      duration: String(api.duration ?? '0'),
      bufferSecs: String(api.bufferSecs ?? '5'),
      reconnect: api.reconnect !== false && api.reconnect !== 'no' ? 'yes' : 'no',
    },
    input: {
      device: String(api.device ?? 'plughw:0,0'),
      sampleRate: String(api.sampleRate ?? '44100'),
      bitsPerSample: String(api.bitsPerSample ?? '16'),
      channel: String(api.channel ?? '1'),
    },
    'icecast2-0': {
      bitrateMode: String(api.bitrateMode ?? 'cbr'),
      format: String(api.format ?? 'mp3'),
      bitrate: String(api.bitrate ?? '128'),
      quality: String(api.quality ?? '0.8'),
      // Use API values; fall back to .env only if API value is empty
      server: String(api.server || env.server || ''),
      port: String(api.port || env.port || '8000'),
      password: String(password),
      mountPoint: String(api.mountPoint || env.mountPoint || 'live.mp3'),
      name: String(api.name || env.name || 'Stream'),
    },
  };
  return serialize(sections);
}

/** Full path to tee (sudoers allows /usr/bin/tee or /bin/tee). */
const TEE_PATH = fs.existsSync('/usr/bin/tee') ? '/usr/bin/tee' : '/bin/tee';

/**
 * Write config to path. For /etc/darkice.cfg uses sudo tee (requires sudoers).
 * Uses full path to tee so sudoers rule matches.
 */
function writeContent(content) {
  if (DARKICE_CFG.startsWith('/etc/')) {
    const { spawnSync } = require('child_process');
    const r = spawnSync('sudo', [TEE_PATH, DARKICE_CFG], {
      input: content,
      encoding: 'utf8',
      timeout: 5000,
    });
    if (r.error || r.status !== 0) {
      const msg = (r.stderr || r.error || r.stdout || 'Unknown error').toString().trim();
      logger.error('darkice.cfg write failed', { error: msg, path: DARKICE_CFG });
      throw new Error(msg || 'Failed to write config');
    }
  } else {
    fs.writeFileSync(DARKICE_CFG, content, 'utf8');
  }
  logger.darkice('darkice.cfg written', { path: DARKICE_CFG });
}

function getForApi() {
  const parsed = read();
  const api = toApi(parsed);
  if (!api) return null;
  return { ...api, fromEnv: getFromEnv() };
}

function saveFromApi(api) {
  const content = fromApi(api);
  writeContent(content);
}

module.exports = {
  read,
  parse,
  serialize,
  toApi,
  fromApi,
  getForApi,
  saveFromApi,
  writeContent,
  getEnvOverrides,
  getFromEnv,
  DARKICE_CFG,
};
