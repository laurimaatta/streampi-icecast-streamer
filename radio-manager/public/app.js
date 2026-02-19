(function () {
  const API = '';
  const streamStatus = document.getElementById('streamStatus');
  const muteStatus = document.getElementById('muteStatus');
  const tabStreaming = document.getElementById('tab-streaming');
  const tabAudio = document.getElementById('tab-audio');
  const tabSystem = document.getElementById('tab-system');
  const panelStreaming = document.getElementById('panel-streaming');
  const panelAudio = document.getElementById('panel-audio');
  const panelSystem = document.getElementById('panel-system');
  const formDarkice = document.getElementById('formDarkice');
  const audioControlsCapture = document.getElementById('audioControlsCapture');
  const audioControlsPlayback = document.getElementById('audioControlsPlayback');
  const audioControlsALC = document.getElementById('audioControlsALC');
  const localBackupList = document.getElementById('localBackupList');
  const restoreRow = document.getElementById('restoreRow');
  const restoreSelect = document.getElementById('restoreSelect');
  const importFile = document.getElementById('importFile');
  const alsaStateIndicator = document.getElementById('alsaStateIndicator');
  let alsaDirty = false;
  let lastMuteStatus = { muted: false, mode: 'OFF' };

  let lastStreamActive = false;
  let lastDarkiceSnapshot = null;

  const T = {
    toastSaved: 'Asetukset tallennettu.',
    toastMode: 'Tila: ',
    toastStreamStart: 'Lähetys käynnistetty.',
    toastStreamStop: 'Lähetys pysäytetty.',
    toastStreamRestart: 'Lähetys käynnistetty uudelleen.',
    toastAlsaStored: 'Äänitila tallennettu.',
    toastAlsaRestored: 'Äänitila palautettu.',
    toastBackupDownload: 'Varmuuskopio ladattu.',
    toastBackupImported: 'Varmuuskopio tuotu.',
    toastBackupLocal: 'Varmuuskopio luotu.',
    toastRestored: 'Palautettu.',
    toastRestoreAlsaWarning: 'Äänitilan palautus ei onnistunut (asetukset ja lähetys palautettu).',
    error: 'Virhe: ',
    loadError: 'Latausvirhe: ',
    noBackups: 'Ei paikallisia varmuuskopioita',
    toastBackupDeleted: 'Varmuuskopio poistettu.',
  };

  const ALSA_LABELS = {
    'Aux': 'Linja-sisääntulo',
    'Aux Volume': 'Linja-sisääntulo – voimakkuus',
    'ADC HPF': 'Kohinan suodatin',
    'ALC': 'Tasonkorjaus',
    'ALC Anticlip Level': 'Huippujen rajoituksen taso',
    'ALC Attack Rate': 'Nousunopeus',
    'ALC Release Rate': 'Laskunopeus',
    'ALC Hold Time': 'Pitoaika',
    'ALC Max Gain': 'Suurin vahvistus',
    'ALC Max Threshold': 'Yläkynnys',
    'ALC Min Threshold': 'Alakynnys (kohina)',
    'ALC Noise Threshold': 'Kohinan kynnys',
  };

  const ALSA_CAPTURE = ['Aux', 'Aux Volume'];
  const ALSA_PLAYBACK = [];
  const ALSA_ALC = [
    'ALC', 'ADC HPF', 'ALC Anticlip Level',
    'ALC Attack Rate', 'ALC Release Rate', 'ALC Hold Time',
    'ALC Max Gain', 'ALC Max Threshold', 'ALC Min Threshold', 'ALC Noise Threshold',
  ];

  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }

  function setStreamStatus(data) {
    if (data.mode === 'SWITCH') {
      if (data.active) {
        streamStatus.textContent = 'LIVE';
        streamStatus.className = 'status-pill active';
      } else {
        streamStatus.textContent = 'Pysäytetty';
        streamStatus.className = 'status-pill inactive';
      }
    } else if (data.active) {
      streamStatus.textContent = 'LIVE';
      streamStatus.className = 'status-pill active';
    } else {
      streamStatus.textContent = 'Pysäytetty';
      streamStatus.className = 'status-pill inactive';
    }
  }

  async function fetchJson(url, opts = {}) {
    const r = await fetch(API + url, {
      ...opts,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...opts.headers },
    });
    if (r.status === 401) {
      showLoginOverlay();
      throw new Error('Kirjautuminen vaaditaan');
    }
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(err.error || r.statusText);
    }
    return r.json();
  }

  function showLoginOverlay() {
    const overlay = document.getElementById('loginOverlay');
    const appContent = document.getElementById('appContent');
    if (overlay) overlay.hidden = false;
    if (appContent) appContent.style.display = 'none';
  }

  function hideLoginOverlay() {
    const overlay = document.getElementById('loginOverlay');
    const appContent = document.getElementById('appContent');
    if (overlay) overlay.hidden = true;
    if (appContent) appContent.style.display = '';
  }

  async function loadMuteStatus() {
    try {
      const data = await fetchJson('/api/mute/status');
      const effective = data.effectiveMuted ?? data.muted;
      const wasMuted = lastMuteStatus.muted;
      lastMuteStatus = { muted: effective, hasMuteSwitch: data.hasMuteSwitch };

      // Ääni-välilehdellä: päivitä linjatulon sliderit vastaamaan todellista tilaa (nolla kun hiljennetty, palautus kun ääni päällä)
      if (panelAudio && !panelAudio.hidden && (wasMuted !== effective)) {
        loadAudioControls();
      }

      // Yläpalkin pill – näkyy aina kaikilla välilehdillä
      if (muteStatus) {
        muteStatus.hidden = false;
        muteStatus.textContent = effective ? 'Hiljennetty' : 'Ääni';
        muteStatus.className = 'status-pill ' + (effective ? 'status-pill-mute' : 'status-pill-mute-unmuted');
      }

      // Lähetys-välilehden vaimennus-kortti: kaksi tilaa
      const noSwitchPanel = document.getElementById('muteNoSwitchPanel');
      const switchPanel = document.getElementById('muteSwitchPanel');
      if (noSwitchPanel) noSwitchPanel.hidden = data.hasMuteSwitch;
      if (switchPanel) switchPanel.hidden = !data.hasMuteSwitch;

      if (!data.hasMuteSwitch) {
        // Web-nappi
        const btn = document.getElementById('btnMuteToggle');
        if (btn) btn.textContent = effective ? 'Poista vaimennus' : 'Vaimenna';
        const lbl = document.getElementById('muteStateLabel');
        if (lbl) {
          lbl.textContent = effective ? 'Hiljennetty' : 'Ääni päällä';
          lbl.className = 'mute-state-label' + (effective ? ' is-muted' : '');
        }
      } else {
        // Kytkin: näytetään tila yhdellä lauseella
        const lbl = document.getElementById('muteStateLabelSwitch');
        if (lbl) {
          const hw = data.hardwareMuted;
          lbl.textContent = (hw ? 'Hiljennetty' : 'Ääni päällä') + ' – kytkin';
          lbl.className = 'mute-state-label' + (hw ? ' is-muted' : '');
        }
      }

      // Järjestelmä-välilehden checkbox
      const chk = document.getElementById('chkMuteSwitch');
      if (chk && chk !== document.activeElement) chk.checked = Boolean(data.hasMuteSwitch);

      updateCaptureDisabledState();
    } catch (_) {
      lastMuteStatus = { muted: false, hasMuteSwitch: false };
      if (muteStatus) {
        muteStatus.hidden = false;
        muteStatus.textContent = '—';
        muteStatus.className = 'status-pill status-pill-mute-unmuted';
      }
      updateCaptureDisabledState();
    }
  }

  function updateCaptureDisabledState() {
    const group = document.getElementById('alsaGroupCapture');
    const hint = document.getElementById('muteDisabledHint');
    const disabled = lastMuteStatus.muted;
    if (group) {
      group.querySelectorAll('.audio-control').forEach((el) => {
        el.classList.toggle('disabled-by-mute', disabled);
        el.querySelectorAll('input[type="range"]').forEach((input) => {
          input.disabled = disabled;
        });
      });
    }
    if (hint) hint.style.display = disabled ? 'block' : 'none';
  }

  async function loadStreamingStatus() {
    const data = await fetchJson('/api/streaming/status');
    setStreamStatus(data);
    const mode = data.mode || 'SWITCH';
    const useSwitch = (mode === 'ON' || mode === 'OFF') ? false : mode === 'SWITCH';

    const noSwitchPanel = document.getElementById('streamNoSwitchPanel');
    const switchPanel = document.getElementById('streamSwitchPanel');
    if (noSwitchPanel) noSwitchPanel.hidden = useSwitch;
    if (switchPanel) switchPanel.hidden = !useSwitch;

    if (!useSwitch) {
      const btnToggleStream = document.getElementById('btnToggleStream');
      const btnRestart = document.getElementById('btnRestart');
      if (btnToggleStream) btnToggleStream.textContent = data.active ? 'Lopeta' : 'Käynnistä';
      if (btnRestart) btnRestart.style.display = data.active ? 'inline-block' : 'none';
    } else {
      const lbl = document.getElementById('streamStateLabelSwitch');
      const btnRestartWhenSwitch = document.getElementById('btnRestartWhenSwitch');
      if (lbl) {
        lbl.textContent = data.active ? 'Lähetys päällä – kytkin' : 'Pysäytetty – kytkin';
        lbl.className = 'mute-state-label' + (data.active ? '' : '');
      }
      if (btnRestartWhenSwitch) btnRestartWhenSwitch.style.display = data.active ? 'inline-block' : 'none';
    }

    const chkStream = document.getElementById('chkStreamSwitch');
    if (chkStream && chkStream !== document.activeElement) chkStream.checked = useSwitch;

    lastStreamActive = !!(data && data.active);
    updateDarkiceFormDisabled(lastStreamActive);

    return data;
  }

  document.getElementById('btnMuteToggle')?.addEventListener('click', async () => {
    try {
      const muted = !lastMuteStatus.muted;
      await fetchJson('/api/mute/set', { method: 'PUT', body: JSON.stringify({ muted }) });
      showToast(muted ? 'Vaimennettu' : 'Vaimennus poistettu');
      loadMuteStatus();
    } catch (err) {
      showToast(T.error + err.message);
    }
  });

  document.getElementById('chkMuteSwitch')?.addEventListener('change', async (e) => {
    try {
      const hasMuteSwitch = e.target.checked;
      await fetchJson('/api/mute/switch-setting', { method: 'PUT', body: JSON.stringify({ hasMuteSwitch }) });
      showToast(hasMuteSwitch ? 'Vaimennuskytkin käytössä' : 'Vaimennuskytkin pois');
      loadMuteStatus();
    } catch (err) {
      e.target.checked = !e.target.checked; // peruuta muutos virhetilanteessa
      showToast(T.error + err.message);
    }
  });

  function getDarkiceFormSnapshot() {
    const form = formDarkice;
    const keys = ['server', 'port', 'mountPoint', 'password', 'name', 'bitrate', 'sampleRate', 'channel', 'device'];
    const o = {};
    keys.forEach((k) => {
      const el = form.elements[k];
      if (el) o[k] = (el.value || '').trim();
    });
    return JSON.stringify(o);
  }

  function isDarkiceDirty() {
    if (!lastDarkiceSnapshot) return false;
    return getDarkiceFormSnapshot() !== lastDarkiceSnapshot;
  }

  function updateDarkiceSaveButton() {
    const btn = document.getElementById('btnSaveDarkice');
    if (!btn) return;
    const dirty = isDarkiceDirty();
    btn.disabled = !dirty || lastStreamActive;
  }

  function updateDarkiceFormDisabled(streamActive) {
    lastStreamActive = streamActive;
    const inputs = formDarkice.querySelectorAll('input, select, button');
    inputs.forEach((el) => {
      if (el.type === 'submit') {
        el.disabled = streamActive || !isDarkiceDirty();
      } else {
        el.disabled = streamActive;
      }
    });
  }

  async function loadDarkice() {
    const data = await fetchJson('/api/darkice');
    const fromEnv = data.fromEnv || {};
    const cfg = { ...data };
    delete cfg.fromEnv;
    const form = formDarkice;
    Object.keys(cfg).forEach((k) => {
      const el = form.elements[k];
      if (el) el.value = cfg[k] ?? '';
    });
    lastDarkiceSnapshot = getDarkiceFormSnapshot();
    updateDarkiceSaveButton();
    updateDarkiceFormDisabled(lastStreamActive);
    const envNote = document.getElementById('envNote');
    if (envNote) envNote.style.display = (fromEnv.server || fromEnv.password) ? 'block' : 'none';
    return data;
  }

  function deviceLabelForUser(d) {
    const raw = d.label || d.plughw || d.id || '';
    if (/IQaudIO|IQ\s*Audio|Pi\s*Codec/i.test(raw)) return 'Äänikortti';
    return raw;
  }

  async function loadAudioDevices() {
    const devices = await fetchJson('/api/audio/devices');
    const sel = formDarkice.elements.device;
    sel.innerHTML = devices.map((d) => {
      const value = (d.plughw || d.id || '').replace(/"/g, '&quot;');
      const label = deviceLabelForUser(d);
      return `<option value="${value}">${label.replace(/</g, '&lt;')}</option>`;
    }).join('');
    const cfg = await fetchJson('/api/darkice');
    // Normalize saved device so it matches an option (e.g. hw:1,0 -> plughw:1,0)
    const want = (cfg.device || '').trim();
    const normalized = want.replace(/^hw:/, 'plughw:');
    const opts = Array.from(sel.options);
    const match = opts.find((o) => o.value === want || o.value === normalized);
    sel.value = (match ? match.value : opts[0]?.value) || '';
    // If only one device, hide the dropdown (selection is automatic)
    const deviceRow = document.getElementById('deviceRow');
    if (deviceRow) deviceRow.style.display = devices.length <= 1 ? 'none' : '';
    // Resync snapshot after device normalization so form does not appear dirty
    if (lastDarkiceSnapshot !== null) {
      lastDarkiceSnapshot = getDarkiceFormSnapshot();
      updateDarkiceSaveButton();
      updateDarkiceFormDisabled(lastStreamActive);
    }
  }

  function switchPanel(id) {
    [panelStreaming, panelAudio, panelSystem].forEach((p) => {
      p.classList.remove('active');
      p.hidden = true;
    });
    [tabStreaming, tabAudio, tabSystem].forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    const panel = document.getElementById('panel-' + id);
    const tab = document.getElementById('tab-' + id);
    if (panel) { panel.classList.add('active'); panel.hidden = false; }
    if (tab) { tab.classList.add('active'); tab.setAttribute('aria-selected', 'true'); }
    if (id === 'audio') loadAudioControls();
    if (id === 'system') {
      loadLocalBackups();
      loadAuthConfig();
      loadCertInfo();
    }
  }

  function getCertDownloadStatus() {
    return document.getElementById('certDownloadStatus');
  }

  function looksLikeIp(s) {
    return s && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(String(s).trim());
  }

  async function loadCertInfo() {
    const el = document.getElementById('certInfoText');
    const hintEl = document.getElementById('certInfoHint');
    const btnExisting = document.getElementById('btnDownloadCaExisting');
    if (!el) return;
    if (hintEl) hintEl.style.display = 'none';
    try {
      const info = await fetchJson('/api/certs/info');
      if (!info.hasCert) {
        el.textContent = 'Varmenteetta ei ole. Luo uusi varmenne ja lataa.';
        if (btnExisting) btnExisting.disabled = true;
        return;
      }
      const parts = [];
      if (info.hostname) parts.push('isäntänimi ' + info.hostname);
      if (info.ips && info.ips.length) {
        const skipLocal = info.ips.filter((ip) => ip !== '127.0.0.1');
        if (skipLocal.length) parts.push('osoitteet ' + skipLocal.join(', '));
      }
      if (info.hostnames && info.hostnames.length) {
        const dns = info.hostnames.filter((h) => h !== 'localhost' && h !== info.hostname);
        if (dns.length) parts.push('nimet ' + dns.join(', '));
      }
      el.textContent = parts.length ? 'Nykyinen varmenne: ' + parts.join(', ') + '.' : 'Nykyinen varmenne olemassa.';
      if (btnExisting) btnExisting.disabled = false;
      if (hintEl && looksLikeIp(info.hostname)) {
        hintEl.textContent = 'Varmenne on luotu vain IP:lle. Jotta nimi (esim. raspberrypi.local) toimii: aseta laitteelle isäntänimi (esim. ssh:lla sudo hostnamectl set-hostname raspberrypi) ja paina sitten "Luo uusi varmenne ja lataa".';
        hintEl.style.display = 'block';
      }
    } catch (_) {
      el.textContent = '';
      if (btnExisting) btnExisting.disabled = true;
    }
  }

  function triggerDownload(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  document.getElementById('btnDownloadCaExisting')?.addEventListener('click', async () => {
    const statusEl = getCertDownloadStatus();
    if (statusEl) { statusEl.style.display = 'inline'; statusEl.textContent = 'Ladataan…'; }
    try {
      const r = await fetch(API + '/api/certs/ca', { credentials: 'include' });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error(err.error || r.statusText);
      }
      const blob = await r.blob();
      triggerDownload(blob, 'StreamPi-varmenne.pem');
      if (statusEl) statusEl.textContent = 'Ladattu. Asenna varmenne selaimeen.';
      showToast('Varmenne ladattu. Asenna se selaimeen.');
    } catch (err) {
      showToast(T.error + (err.message || 'Lataus epäonnistui'));
      if (statusEl) statusEl.textContent = '';
    }
  });

  document.getElementById('btnDownloadCaRegenerate')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnDownloadCaRegenerate');
    const statusEl = getCertDownloadStatus();
    const confirmMsg = "Luo uusi varmenne? Aiemmat varmenteet mitätöityvät (muilla koneilla täytyy asentaa uusi).\n\nAsenna ladattu varmenne selaimeen.";
    if (!confirm(confirmMsg)) return;
    if (btn) btn.disabled = true;
    if (statusEl) { statusEl.style.display = 'inline'; statusEl.textContent = 'Luodaan varmennetta…'; }
    try {
      const r = await fetch(API + '/api/certs/download-ca', {
        method: 'POST',
        credentials: 'include',
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error(err.error || r.statusText);
      }
      const blob = await r.blob();
      triggerDownload(blob, 'StreamPi-varmenne.pem');
      if (statusEl) statusEl.textContent = 'Varmenne ladattu. Asenna varmenne selaimeen.';
      showToast('Varmenne ladattu. Asenna se selaimeen.');
      loadCertInfo();
    } catch (err) {
      showToast(T.error + (err.message || 'Lataus epäonnistui'));
      if (statusEl) statusEl.textContent = '';
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  async function loadAuthConfig() {
    try {
      const cfg = await fetchJson('/api/config');
      const form = document.getElementById('formAuth');
      if (!form) return;
      form.elements.authCurrentPassword.value = '';
      form.elements.authNewPassword.value = '';
      form.elements.authNewPasswordConfirm.value = '';
      const authEnabled = cfg.auth && cfg.auth.enabled;
      const btnRemove = document.getElementById('btnAuthRemove');
      const btnSubmit = document.getElementById('btnAuthSubmit');
      const titleEl = document.getElementById('authCardTitle');
      const descEl = document.getElementById('authCardDesc');
      const currentRow = document.getElementById('authCurrentPasswordRow');
      if (btnRemove) btnRemove.style.display = authEnabled ? 'inline-block' : 'none';
      if (btnSubmit) btnSubmit.textContent = authEnabled ? 'Vaihda kirjautumistiedot' : 'Palauta kirjautuminen';
      if (titleEl) titleEl.textContent = authEnabled ? 'Web-kirjautuminen' : 'Palauta kirjautuminen';
      if (descEl) {
        if (authEnabled) {
          descEl.innerHTML = 'Käyttäjätunnus on aina <strong>admin</strong>. Oletussalasana <strong>streamPi</strong> – vaihda heti omaan.';
        } else {
          descEl.textContent = 'Kirjautuminen on pois käytöstä. Aseta salasana ottaaksesi kirjautumisen uudelleen käyttöön.';
        }
      }
      if (currentRow) currentRow.style.display = authEnabled ? '' : 'none';
    } catch (_) {}
  }

  tabStreaming.addEventListener('click', () => switchPanel('streaming'));
  tabAudio.addEventListener('click', () => switchPanel('audio'));
  tabSystem.addEventListener('click', () => switchPanel('system'));

  formDarkice.addEventListener('input', () => {
    updateDarkiceSaveButton();
  });
  formDarkice.addEventListener('change', () => {
    updateDarkiceSaveButton();
  });

  formDarkice.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(formDarkice));
    try {
      await fetchJson('/api/darkice', { method: 'PUT', body: JSON.stringify(payload) });
      lastDarkiceSnapshot = getDarkiceFormSnapshot();
      updateDarkiceSaveButton();
      updateDarkiceFormDisabled(lastStreamActive);
      showToast(T.toastSaved);
    } catch (err) {
      showToast(T.error + err.message);
    }
  });

  document.getElementById('chkStreamSwitch')?.addEventListener('change', async (e) => {
    try {
      const useSwitch = e.target.checked;
      const mode = useSwitch ? 'SWITCH' : 'WEBUI';
      await fetchJson('/api/streaming/mode', { method: 'PUT', body: JSON.stringify({ mode }) });
      showToast(useSwitch ? 'Lähetyskytkin käytössä' : 'Lähetyskytkin pois');
      loadStreamingStatus();
    } catch (err) {
      e.target.checked = !e.target.checked;
      showToast(T.error + err.message);
    }
  });

  document.getElementById('btnToggleStream').addEventListener('click', async () => {
    const btn = document.getElementById('btnToggleStream');
    const isStart = btn.textContent === 'Käynnistä';
    try {
      if (isStart) {
        await fetchJson('/api/streaming/start', { method: 'POST' });
        showToast(T.toastStreamStart);
      } else {
        await fetchJson('/api/streaming/stop', { method: 'POST' });
        showToast(T.toastStreamStop);
      }
      loadStreamingStatus();
    } catch (err) {
      showToast(T.error + err.message);
    }
  });
  function onRestartStream() {
    return fetchJson('/api/streaming/restart', { method: 'POST' }).then(() => {
      showToast(T.toastStreamRestart);
      loadStreamingStatus();
    }).catch((err) => showToast(T.error + err.message));
  }
  document.getElementById('btnRestart').addEventListener('click', onRestartStream);
  document.getElementById('btnRestartWhenSwitch')?.addEventListener('click', onRestartStream);

  const ALSA_CONTROL_HINTS = {
    'Aux': 'Linja-sisääntulon voimakkuus (pääasiallinen säätö lähetykseen). Suurempi arvo = kovempi ääni.',
    'Aux Volume': 'Suurempi arvo = kovempi linjaääni. Pienempi = hiljaisempi.',
    'ADC HPF': 'Suodattaa matalataajuiset huminat ja kohina pois. Päällä = vähemmän kohinaa (suositeltu). Pois = koko taajuuskaista läpi.',
    'ALC': 'Tasonkorjaus tasaa äänenvoimakkuuden automaattisesti. Päällä = tasaisempi ääni (puhe, laulu). Pois = raaka taso.',
    'ALC Anticlip Level': 'Määrittää tason, jossa voimakkaat äänihuiput vaimennetaan automaattisesti. Pienempi arvo → rajoitus aktivoituu herkemmin. Suurempi arvo → kovempi ääni sallitaan ennen rajoitusta.',
    'ALC Attack Rate': 'Kuinka nopeasti tasonkorjaus reagoi äänen nousuun. Suurempi arvo = nopeampi reagointi. Pienempi = hitaampi.',
    'ALC Release Rate': 'Kuinka nopeasti tasonkorjaus laskee vahvistusta äänen hiljetessä. Suurempi = nopeammin laskee. Pienempi = vahvistus pysyy kauemmin.',
    'ALC Hold Time': 'Kuinka kauan vahvistus pidetään ennen laskua. Suurempi = pidempi pito. Pienempi = nopeammin laskee.',
    'ALC Max Gain': 'Suurin kokonaisvahvistus hiljaista ääntä vahvistettaessa. Suurempi = enemmän vahvistusta.',
    'ALC Max Threshold': 'Taso, josta ylöspäin tasonkorjaus alkaa vaimentaa. Pienempi = vaimentaa jo hiljaisempaa. Suurempi = vain kovaa ääntä vaimentaa.',
    'ALC Min Threshold': 'Alakynnys: vaikuttaa siihen, kuinka paljon taustakohinaa päästetään läpi. Pienempi arvo = tiukempi suodatus. Suurempi arvo = enemmän kohinaa pääsee läpi.',
    'ALC Noise Threshold': 'Kynnys, josta alaspäin ääntä pidetään kohinana. Suurempi arvo = tiukempi suodatus.',
  };

  function renderAlsaControl(name, c, container) {
    const label = ALSA_LABELS[name] || name;
    const min = c.min ?? 0;
    const max = c.max ?? 127;
    const div = document.createElement('div');
    div.className = 'audio-control';
    div.dataset.controlName = name;
    const hint = ALSA_CONTROL_HINTS[name];
    if (hint) div.title = hint;
    const eName = name.replace(/"/g, '&quot;');
    let html = `<label>${label}</label>`;
    if (hint) html += `<span class="control-hint">${hint}</span>`;

    if (c.type === 'enum') {
      // Enum as slider (items are technical values like '44/fs')
      const idx = c.values ? c.values[0] : 0;
      const itemCount = c.items ? c.items.length : (max + 1);
      const pct = itemCount > 1 ? Math.round((idx / (itemCount - 1)) * 100) : 0;
      html += `<span class="control-value">${idx + 1} / ${itemCount} (${pct}%)</span>`;
      html += `<input type="range" min="0" max="${itemCount - 1}" value="${idx}" data-name="${eName}" data-type="enum">`;
    } else if (c.type === 'switch') {
      const isOn = c.values[0] === 1;
      html += `<label class="toggle-label"><input type="checkbox" data-name="${eName}" ${isOn ? 'checked' : ''}><span>${isOn ? 'Päällä' : 'Pois'}</span></label>`;
    } else {
      const vals = c.values || [0];
      if (vals.length === 1) {
        const v = vals[0];
        const pct = max ? Math.round((v / max) * 100) : 0;
        html += `<span class="control-value">${v} / ${max} (${pct}%)</span>`;
        html += `<input type="range" min="${min}" max="${max}" value="${v}" data-name="${eName}" data-index="0">`;
      } else {
        html += `<span class="control-value">L: ${vals[0]} R: ${vals[1]}</span>`;
        html += `<div class="slider-row"><span>L</span><input type="range" min="${min}" max="${max}" value="${vals[0]}" data-name="${eName}" data-index="0"></div>`;
        html += `<div class="slider-row"><span>R</span><input type="range" min="${min}" max="${max}" value="${vals[1]}" data-name="${eName}" data-index="1"></div>`;
      }
    }

    div.innerHTML = html;

    // Enum slider: send the item string value to amixer
    div.querySelectorAll('input[type="range"][data-type="enum"]').forEach((input) => {
      input.addEventListener('input', debounce(async () => {
        const idx = parseInt(input.value, 10);
        const items = c.items || [];
        const itemVal = items[idx] || String(idx);
        const itemCount = items.length || (max + 1);
        const pct = itemCount > 1 ? Math.round((idx / (itemCount - 1)) * 100) : 0;
        const valueSpan = div.querySelector('.control-value');
        if (valueSpan) valueSpan.textContent = `${idx + 1} / ${itemCount} (${pct}%)`;
        await fetchJson(`/api/audio/control/${encodeURIComponent(input.dataset.name)}`, {
          method: 'PUT',
          body: JSON.stringify({ value: itemVal }),
        });
        alsaDirty = true;
        updateAlsaStateIndicator();
      }, 300));
    });

    // Switch: checkbox change
    div.querySelectorAll('input[type="checkbox"][data-name]').forEach((chk) => {
      chk.addEventListener('change', async () => {
        const span = chk.parentElement.querySelector('span');
        if (span) span.textContent = chk.checked ? 'Päällä' : 'Pois';
        await fetchJson(`/api/audio/control/${encodeURIComponent(chk.dataset.name)}`, {
          method: 'PUT',
          body: JSON.stringify({ value: chk.checked ? 'on' : 'off' }),
        });
        alsaDirty = true;
        updateAlsaStateIndicator();
        if (chk.dataset.name === 'ALC' || chk.dataset.name === 'ADC HPF') updateAlcDisabledState();
      });
    });

    // Volume: range sliders
    div.querySelectorAll('input[type="range"]:not([data-type="enum"])').forEach((input) => {
      input.addEventListener('input', debounce(async () => {
        const controlName = input.dataset.name;
        const all = div.querySelectorAll('input[type="range"]:not([data-type="enum"])');
        const values = Array.from(all).map((i) => parseInt(i.value, 10));
        const valueSpan = div.querySelector('.control-value');
        if (values.length === 1) {
          valueSpan.textContent = `${values[0]} / ${max} (${Math.round((values[0] / max) * 100)}%)`;
        } else {
          valueSpan.textContent = `L: ${values[0]} R: ${values[1]}`;
        }
        await fetchJson(`/api/audio/control/${encodeURIComponent(controlName)}`, {
          method: 'PUT',
          body: JSON.stringify({ value: values.length === 1 ? values[0] : values }),
        });
        alsaDirty = true;
        updateAlsaStateIndicator();
      }, 300));
    });

    container.appendChild(div);
  }

  function updateAlcDisabledState() {
    const alcGroup = document.getElementById('audioControlsALC');
    if (!alcGroup) return;
    alcGroup.querySelectorAll('.audio-control').forEach((ctrl) => {
      const cname = ctrl.dataset.controlName;
      if (cname === 'ALC' || cname === 'ADC HPF') return;
      const alcSwitch = alcGroup.querySelector('.audio-control[data-control-name="ALC"] input[type="checkbox"]');
      const alcOn = alcSwitch ? alcSwitch.checked : true;
      const disabled = !alcOn;
      ctrl.classList.toggle('disabled-by-mute', disabled);
      ctrl.querySelectorAll('input[type="range"], input[type="checkbox"], select').forEach((el) => {
        el.disabled = disabled;
      });
    });
  }

  async function updateAlsaStateIndicator() {
    const btnStore = document.getElementById('btnStoreAlsa');
    const btnRestore = document.getElementById('btnRestoreAlsa');
    if (btnStore) btnStore.disabled = !alsaDirty;
    if (!alsaStateIndicator) return;
    try {
      const { saved } = await fetchJson('/api/audio/state-saved');
      if (btnRestore) btnRestore.disabled = !alsaDirty || !saved;
      if (alsaDirty) {
        alsaStateIndicator.textContent = 'Äänitila: tallentamatta (muutoksia ei tallennettu)';
      } else {
        alsaStateIndicator.textContent = saved ? 'Äänitila: tallennettu' : 'Äänitila: tallentamatta';
      }
    } catch (_) {
      alsaStateIndicator.textContent = '—';
      if (btnRestore) btnRestore.disabled = true;
    }
  }

  async function loadAudioControls() {
    const controls = await fetchJson('/api/audio/controls');
    alsaDirty = false;
    audioControlsCapture.innerHTML = '';
    audioControlsPlayback.innerHTML = '';
    if (audioControlsALC) audioControlsALC.innerHTML = '';
    const capture = [];
    const playback = [];
    const alc = [];
    const allowedSet = new Set([...ALSA_CAPTURE, ...ALSA_PLAYBACK, ...ALSA_ALC]);
    Object.entries(controls).forEach(([name, c]) => {
      if (!c || !allowedSet.has(name)) return;
      if (ALSA_ALC.includes(name)) alc.push([name, c]);
      else if (ALSA_CAPTURE.includes(name)) capture.push([name, c]);
      else if (ALSA_PLAYBACK.includes(name)) playback.push([name, c]);
    });
    capture.forEach(([name, c]) => renderAlsaControl(name, c, audioControlsCapture));
    playback.forEach(([name, c]) => renderAlsaControl(name, c, audioControlsPlayback));
    if (audioControlsALC) alc.forEach(([name, c]) => renderAlsaControl(name, c, audioControlsALC));
    const captureGroup = document.getElementById('alsaGroupCapture');
    const pbAlcGroup = document.getElementById('alsaGroupPlaybackAndALC');
    if (captureGroup) captureGroup.style.display = capture.length ? '' : 'none';
    if (pbAlcGroup) pbAlcGroup.style.display = (playback.length || alc.length) ? '' : 'none';
    await updateAlsaStateIndicator();
    updateCaptureDisabledState();
    updateAlcDisabledState();
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, arguments), ms);
    };
  }

  document.getElementById('btnApplyAlsaDefaults').addEventListener('click', async () => {
    try {
      await fetchJson('/api/audio/apply-defaults', { method: 'POST' });
      showToast('Suositellut asetukset asetettu. Tallenna äänitila alta, jotta ne säilyvät.');
      await loadAudioControls();
      alsaDirty = true;
      await updateAlsaStateIndicator();
    } catch (err) {
      showToast(T.error + err.message);
    }
  });
  document.getElementById('btnStoreAlsa').addEventListener('click', async () => {
    try {
      await fetchJson('/api/audio/store', { method: 'POST' });
      alsaDirty = false;
      await updateAlsaStateIndicator();
      showToast(T.toastAlsaStored);
    } catch (err) {
      showToast(T.error + err.message);
    }
  });
  document.getElementById('btnRestoreAlsa').addEventListener('click', async () => {
    try {
      await fetchJson('/api/audio/restore', { method: 'POST' });
      showToast(T.toastAlsaRestored);
      loadAudioControls();
    } catch (err) {
      showToast(T.error + err.message);
    }
  });

  document.getElementById('btnExport').addEventListener('click', async () => {
    try {
      const r = await fetch(API + '/api/backup/export');
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'radio-manager-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      showToast(T.toastBackupDownload);
    } catch (err) {
      showToast(T.error + err.message);
    }
  });

  importFile.addEventListener('change', async () => {
    const file = importFile.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      JSON.parse(text);
      const data = await fetchJson('/api/backup/import', { method: 'POST', body: text });
      showToast(T.toastBackupImported);
      if (data.warnings && data.warnings.length) showToast(T.toastRestoreAlsaWarning);
      loadDarkice();
      loadStreamingStatus();
    } catch (err) {
      showToast(T.error + err.message);
    }
    importFile.value = '';
  });

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  const btnSaveLocal = document.getElementById('btnSaveLocal');
  const backupLimitHint = document.getElementById('backupLimitHint');

  async function loadLocalBackups() {
    const list = await fetchJson('/api/backup/list');
    localBackupList.innerHTML = list.length
      ? list.map((b) => `<li><span>${escapeHtml(b.name)}</span> <small>${escapeHtml(b.mtime)}</small> <button type="button" class="btn-delete-backup" data-name="${escapeHtml(b.name)}" title="Poista varmuuskopio">Poista</button></li>`).join('')
      : `<li class="muted">${T.noBackups}</li>`;
    if (list.length) {
      restoreRow.style.display = 'flex';
      restoreSelect.innerHTML = list.map((b) => `<option value="${escapeHtml(b.name)}">${b.name}</option>`).join('');
    } else {
      restoreRow.style.display = 'none';
    }
    const atLimit = list.length >= 5;
    btnSaveLocal.disabled = atLimit;
    backupLimitHint.style.display = atLimit ? 'inline' : 'none';
  }

  localBackupList.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-delete-backup');
    if (!btn) return;
    const name = btn.getAttribute('data-name');
    if (!name) return;
    try {
      await fetchJson(`/api/backup/${encodeURIComponent(name)}`, { method: 'DELETE' });
      showToast(T.toastBackupDeleted);
      loadLocalBackups();
    } catch (err) {
      showToast(T.error + err.message);
    }
  });

  btnSaveLocal.addEventListener('click', async () => {
    try {
      await fetchJson('/api/backup/save', { method: 'POST' });
      showToast(T.toastBackupLocal);
      loadLocalBackups();
    } catch (err) {
      if (!err.message || !err.message.includes('Enintään 5')) showToast(T.error + err.message);
      loadLocalBackups();
    }
  });

  document.getElementById('btnRestoreLocal').addEventListener('click', async () => {
    const name = restoreSelect.value;
    if (!name) return;
    try {
      const data = await fetchJson('/api/backup/restore', { method: 'POST', body: JSON.stringify({ name }) });
      showToast(T.toastRestored);
      if (data.warnings && data.warnings.length) showToast(T.toastRestoreAlsaWarning);
      loadDarkice();
      loadStreamingStatus();
    } catch (err) {
      showToast(T.error + err.message);
    }
  });

  const formAuth = document.getElementById('formAuth');
  if (formAuth) {
    formAuth.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = formAuth.elements.authCurrentPassword.value;
      const newPassword = formAuth.elements.authNewPassword.value;
      const newPasswordConfirm = formAuth.elements.authNewPasswordConfirm.value;
      if (newPassword !== newPasswordConfirm) {
        showToast('Uusi salasana ja vahvistus eivät täsmää.');
        return;
      }
      try {
        await fetchJson('/api/config/auth', {
          method: 'PUT',
          body: JSON.stringify({
            currentPassword: currentPassword || null,
            newPassword: newPassword || null,
          }),
        });
        showToast('Salasana päivitetty.');
        loadAuthConfig();
      } catch (err) {
        showToast(T.error + (err.message || (err.error || 'Nykyinen salasana on väärä.')));
      }
    });
  }
  document.getElementById('btnAuthRemove')?.addEventListener('click', async () => {
    const form = document.getElementById('formAuth');
    const currentPassword = form?.elements.authCurrentPassword?.value ?? '';
    try {
      await fetchJson('/api/config/auth', {
        method: 'PUT',
        body: JSON.stringify({ newPassword: '', currentPassword: currentPassword || null }),
      });
      showToast('Kirjautuminen poistettu.');
      loadAuthConfig();
    } catch (err) {
      showToast(T.error + (err.message || (err.error || 'Syötä nykyinen salasana.')));
    }
  });
  let pollFailCount = 0;
  const POLL_CERT_HINT_AFTER = 2;
  setInterval(() => {
    loadStreamingStatus().catch(() => {
      pollFailCount += 1;
      if (pollFailCount === POLL_CERT_HINT_AFTER) {
        showToast('Yhteys ei luotettu. Jos juuri asensit varmenteen: käynnistä selain uudelleen.');
      }
    });
    loadMuteStatus().catch(() => {});
  }, 5000);

  async function init() {
    try {
      const authStatus = await fetch(API + '/api/auth/status', { credentials: 'include' }).then((r) => r.json());
      const btnLogout = document.getElementById('btnLogout');
      if (btnLogout) btnLogout.style.display = authStatus.authEnabled ? '' : 'none';
      if (authStatus.authEnabled && !authStatus.loggedIn) {
        showLoginOverlay();
        return;
      }
      hideLoginOverlay();
    } catch (_) {
      showLoginOverlay();
      return;
    }
    Promise.all([loadStreamingStatus(), loadMuteStatus(), loadDarkice(), loadAudioDevices()]).catch((err) => {
      showToast(T.loadError + err.message);
    });
  }

  document.getElementById('formLogin')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = e.target.elements.username?.value?.trim() || '';
    const password = e.target.elements.password?.value || '';
    const errEl = document.getElementById('loginError');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    try {
      const r = await fetch(API + '/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (errEl) { errEl.textContent = data.error || 'Kirjautuminen epäonnistui'; errEl.style.display = 'block'; }
        return;
      }
      window.location.reload();
    } catch (err) {
      if (errEl) { errEl.textContent = err.message || 'Kirjautuminen epäonnistui'; errEl.style.display = 'block'; }
    }
  });

  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    try {
      await fetch(API + '/api/auth/logout', { method: 'POST', credentials: 'include' });
      window.location.reload();
    } catch (_) {
      window.location.reload();
    }
  });

  init();
})();
