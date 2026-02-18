/**
 * ALSA control: get/set mixer values via amixer, list controls, persist state.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ALSA_CARD, ALSA_STATE_FILE, APP_DATA_DIR } = require('./config');
const logger = require('./logger');

const CARD = ALSA_CARD;

function amixerWithCard(card, ...args) {
  const argv = ['-c', String(card), ...args];
  try {
    const result = spawnSync('amixer', argv, { encoding: 'utf8', timeout: 10000 });
    const out = (result.stdout || '').trim();
    if (result.status !== 0) {
      const msg = (result.stderr || result.error || '').trim();
      logger.error('amixer failed', { cmd: ['amixer', ...argv].join(' '), error: msg });
      return { ok: false, error: msg };
    }
    return { ok: true, out };
  } catch (e) {
    const msg = (e.stderr || e.message || '').trim();
    logger.error('amixer failed', { cmd: ['amixer', ...argv].join(' '), error: msg });
    return { ok: false, error: msg };
  }
}

function amixer(...args) {
  return amixerWithCard(CARD, ...args);
}

/**
 * List simple mixer controls (names only). Optional card override.
 */
function listControlsWithCard(card) {
  const r = amixerWithCard(card, 'scontrols');
  if (!r.ok) return [];
  const names = [];
  const re = /Simple mixer control '([^']+)'/g;
  let m;
  while ((m = re.exec(r.out)) !== null) names.push(m[1]);
  return names;
}

function listControls() {
  return listControlsWithCard(CARD);
}

/**
 * Get current value(s) for a simple mixer control.
 * Handles volume (with optional switch), enum, and pure switch types.
 */
function getControlWithCard(card, name) {
  const r = amixerWithCard(card, 'get', name);
  if (!r.ok) return null;
  const caps = (r.out.match(/Capabilities:\s*(.+)/i) || ['', ''])[1].trim();

  // Enum control: Items list + current Item0
  if (caps.includes('enum')) {
    const items = [];
    // sget format: Items: '44/fs' '88/fs' ...
    const itemsLineMatch = r.out.match(/Items:\s*(.+)/);
    if (itemsLineMatch) {
      const reQuoted = /'([^']+)'/g;
      let m;
      while ((m = reQuoted.exec(itemsLineMatch[1])) !== null) items.push(m[1]);
    }
    const currentMatch = r.out.match(/Item0:\s*'([^']+)'/);
    const current = currentMatch ? currentMatch[1] : (items[0] || '');
    const idx = items.indexOf(current);
    return { name, type: 'enum', values: [Math.max(0, idx)], items, min: 0, max: items.length - 1, current };
  }

  // Volume control (may also have pswitch)
  const hasVolume = caps.includes('volume');
  const hasSwitch = caps.includes('pswitch') || caps.includes('cswitch');

  if (hasVolume) {
    const values = [];
    const dB = [];
    const limitsMatch = r.out.match(/Limits:\s*(\d+)\s*-\s*(\d+)/);
    const minVal = limitsMatch ? parseInt(limitsMatch[1], 10) : 0;
    const maxVal = limitsMatch ? parseInt(limitsMatch[2], 10) : 127;
    const reChannel = /:\s*(\d+)\s*\[/g;
    let m;
    while ((m = reChannel.exec(r.out)) !== null) values.push(parseInt(m[1], 10));
    const reDb = /dB ([-+]?\d+\.\d+)/g;
    while ((m = reDb.exec(r.out)) !== null) dB.push(parseFloat(m[1]));
    const result = { name, values, dB: dB.length ? dB : undefined, min: minVal, max: maxVal };
    if (hasSwitch) {
      result.hasSwitch = true;
      result.switchOn = /\[on\]/i.test(r.out);
    }
    return result;
  }

  // Pure switch control (no volume)
  if (hasSwitch) {
    const isOn = /\[on\]/i.test(r.out);
    return { name, type: 'switch', values: [isOn ? 1 : 0], min: 0, max: 1 };
  }

  return null;
}

function getControl(name) {
  return getControlWithCard(CARD, name);
}

/**
 * Set control value. For enums, value can be an index or the item string.
 */
function setControl(name, value) {
  const v = Array.isArray(value) ? value.join(',') : String(value);
  return amixer('set', name, v);
}

/**
 * List sound cards from /proc/asound/cards. Returns [{ id, name }, ...].
 */
function listCards() {
  try {
    const raw = fs.readFileSync('/proc/asound/cards', 'utf8');
    const cards = [];
    const re = /^\s*(\d+)\s+\[([^\]]*)\]/gm;
    let m;
    while ((m = re.exec(raw)) !== null) {
      cards.push({ id: m[1], name: (m[2] || '').trim() || `Card ${m[1]}` });
    }
    return cards;
  } catch (e) {
    logger.error('listCards failed', { error: e.message });
    return [];
  }
}

/**
 * Get all simple mixer controls for the configured card (comprehensive list).
 * Returns same shape as before: { controlName: { name, values, min, max, ... } }.
 */
/**
 * Get relevant ALSA controls for a given card.
 * Returns { controlName: { name, type?, values, min, max, items?, ... } }.
 */
function getRelevantControlsForCard(card) {
  const names = listControlsWithCard(card);
  const relevantPatterns = [
    /^Aux/i, /^ADC/i, /^ALC/i, /^Input/i, /^Capture/i, /^PGA/i,
    /^Mic/i, /^Mixin/i, /^DAC/i, /^Headphone/i, /^Lineout/i,
  ];
  const out = {};
  for (const n of names) {
    if (!relevantPatterns.some((p) => p.test(n))) continue;
    const c = getControlWithCard(card, n);
    if (c && c.values && c.values.length > 0) out[n] = c;
  }
  return out;
}

/**
 * Get relevant ALSA controls. Uses configured card; if none found (e.g. IQaudIO on card 1), tries card 1.
 */
function getRelevantControls() {
  let out = getRelevantControlsForCard(CARD);
  if (Object.keys(out).length === 0 && CARD !== '1') {
    out = getRelevantControlsForCard('1');
    if (Object.keys(out).length > 0) {
      logger.info('ALSA: no controls on card ' + CARD + ', using card 1 (set ALSA_CARD=1 if needed)');
    }
  }
  if (Object.keys(out).length === 0) {
    // Last resort: show all controls on configured card so UI is not empty
    const names = listControls();
    for (const n of names) {
      const c = getControl(n);
      if (c && c.values && c.values.length > 0) out[n] = c;
    }
  }
  return out;
}

/**
 * Restore ALSA state from file (alsactl restore).
 */
function restoreState(filePath = ALSA_STATE_FILE) {
  if (!fs.existsSync(filePath)) return { ok: false, error: 'File not found' };
  try {
    // alsactl -f FILE restore CARD
    const r = spawnSync('sudo', ['alsactl', '-f', filePath, 'restore', CARD], { encoding: 'utf8', timeout: 10000 });
    if (r.status !== 0) throw new Error(r.stderr || r.error || 'alsactl restore failed');
    logger.info('ALSA state restored', { file: filePath });
    return { ok: true };
  } catch (e) {
    const msg = (e.stderr || e.message || '').trim();
    logger.error('alsactl restore failed', { file: filePath, error: msg });
    return { ok: false, error: msg };
  }
}

/**
 * Store current ALSA state to file (alsactl store).
 */
function storeState(filePath = ALSA_STATE_FILE) {
  const dir = path.dirname(filePath);
  try {
    require('fs').mkdirSync(dir, { recursive: true });
  } catch (_) {}
  try {
    // alsactl -f FILE store CARD
    const r = spawnSync('sudo', ['alsactl', '-f', filePath, 'store', CARD], { encoding: 'utf8', timeout: 10000 });
    if (r.status !== 0) throw new Error(r.stderr || r.error || 'alsactl store failed');
    logger.info('ALSA state stored', { file: filePath });
    return { ok: true };
  } catch (e) {
    const msg = (e.stderr || e.message || '').trim();
    logger.error('alsactl store failed', { file: filePath, error: msg });
    return { ok: false, error: msg };
  }
}

/**
 * List capture devices (arecord -l) for device dropdown.
 * Returns plughw, id, card, device and a friendly label for UI.
 */
function listCaptureDevices() {
  try {
    const r = spawnSync('arecord', ['-l'], { encoding: 'utf8', timeout: 5000 });
    const out = (r.stdout || '').trim();
    if (r.status !== 0) return [];
    const devices = [];
    // card N: Name [ShortName], device M: ...
    const cardRe = /card\s+(\d+):\s*(.+?),\s*device\s+(\d+):/g;
    let m;
    while ((m = cardRe.exec(out)) !== null) {
      const cardNum = m[1];
      const rawName = m[2].trim().replace(/\s*\[[^\]]*\]\s*$/, '').trim();
      const devNum = m[3];
      const plughw = `plughw:${cardNum},${devNum}`;
      const label = rawName
        ? `Kortti ${cardNum}: ${rawName} (${plughw})`
        : `Kortti ${cardNum}, laite ${devNum} (${plughw})`;
      devices.push({
        card: cardNum,
        device: devNum,
        id: `hw:${cardNum},${devNum}`,
        plughw,
        label,
      });
    }
    if (devices.length === 0) {
      devices.push({ card: '0', device: '0', id: 'plughw:0,0', plughw: 'plughw:0,0', label: 'plughw:0,0' });
    }
    return devices;
  } catch (_) {
    return [{ id: 'plughw:0,0', plughw: 'plughw:0,0', card: '0', device: '0', label: 'plughw:0,0' }];
  }
}

/**
 * Whether a saved ALSA state file exists (for UI "saved" indicator).
 */
function hasStoredState(filePath = ALSA_STATE_FILE) {
  return fs.existsSync(filePath);
}

/**
 * Apply AUX-focused IQaudIO Codec Zero defaults for speech/sermon recording.
 * Focuses on AUX input (line-in), disables/minimizes unused inputs (Mic).
 * Conservative levels to maintain good audio quality with low noise.
 */
function applyIqaudioDefaults() {
  const defaults = [
    // AUX (Line-In) - primary input, set volume (switch is part of volume control)
    { name: 'Aux', value: '70%' },
    { name: 'Aux ZC', value: 'off' },  // Zero-cross off for faster response
    { name: 'Aux Gain Ramping', value: 'on' },
    
    // ADC (Analog-to-Digital Converter)
    { name: 'ADC', value: '85%' },
    { name: 'ADC HPF', value: 'on' },  // High-pass filter on (reduce low-freq noise)
    { name: 'ADC Gain Ramping', value: 'off' },
    
    // ALC (Automatic Level Control) - puheelle/laululle, taustakohinan suodatus
    { name: 'ALC', value: 'on' },
    { name: 'ALC Anticlip Level', value: 110 },   // Vääristymän esto, riittävä headroom
    { name: 'ALC Anticlip Mode', value: 1 },     // Anticlip päällä
    { name: 'ALC Attack Rate', value: 2 },       // Nopea reagointi äänen nousuun
    { name: 'ALC Hold Time', value: 0 },         // Pitoaika lyhyt
    { name: 'ALC Integ Attack Rate', value: 3 },
    { name: 'ALC Integ Release Rate', value: 4 },
    { name: 'ALC Max Analog Gain', value: 7 },
    { name: 'ALC Max Attenuation', value: 12 }, // Enimmäisvaimennus
    { name: 'ALC Max Gain', value: 7 },
    { name: 'ALC Max Threshold', value: 127 },
    { name: 'ALC Min Analog Gain', value: 0 },
    { name: 'ALC Min Threshold', value: 17 },   // Alle tämän kohinaa vaiennetaan
    { name: 'ALC Noise Threshold', value: 3 },  // Kohinan kynnys: pieni = enemmän suodatusta
    { name: 'ALC Release Rate', value: 3 },    // Vapautusnopeus

    // Mic inputs - mute/minimize (not used with AUX-only setup)
    { name: 'Mic 1', value: 'mute' },
    { name: 'Mic 2', value: 'mute' },
    
    // Headphone/Lineout - mute (no playback needed)
    { name: 'Headphone', value: 'mute' },
    { name: 'Lineout', value: 'mute' },
  ];
  const results = [];
  for (const d of defaults) {
    const r = setControl(d.name, d.value);
    if (r.ok) results.push(d.name);
  }
  return { ok: true, applied: results };
}

module.exports = {
  listControls,
  listCards,
  getControl,
  setControl,
  getRelevantControls,
  restoreState,
  storeState,
  hasStoredState,
  listCaptureDevices,
  applyIqaudioDefaults,
  CARD,
};
