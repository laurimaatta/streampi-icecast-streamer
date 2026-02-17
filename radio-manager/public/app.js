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

  const T = {
    toastSaved: 'Asetukset tallennettu.',
    toastRestarted: 'Asetukset tallennettu ja lähetys käynnistetty uudelleen.',
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
    error: 'Virhe: ',
    loadError: 'Latausvirhe: ',
    noBackups: 'Ei paikallisia varmuuskopioita',
  };

  const ALSA_LABELS = {
    'Mic 1': 'Mikrofoni 1',
    'Mic 2': 'Mikrofoni 2',
    'Aux': 'Linja-sisääntulo',
    'Mixin PGA': 'Mikserin vahvistus',
    'ADC HPF': 'Kohinan suodatin',
    'ADC Gain Ramping': 'Tasainen vahvistuksen muutos',
    'DAC': 'Toiston voimakkuus',
    'Headphone': 'Kuulokkeet',
    'Lineout': 'Linjaulos',
    'ALC': 'Tasonkorjaus',
    'ALC Anticlip Level': 'Vääristymän eston taso',
    'ALC Anticlip Mode': 'Vääristymän esto',
    'ALC Attack Rate': 'Nousunopeus',
    'ALC Hold Time': 'Pidä-aika',
    'ALC Integ Attack Rate': 'Tasoituksen nousunopeus',
    'ALC Integ Release Rate': 'Tasoituksen laskunopeus',
    'ALC Max Analog Gain': 'Maksimivahvistus (raja)',
    'ALC Max Attenuation': 'Maksimivaimennus',
    'ALC Max Gain': 'Suurin vahvistus',
    'ALC Max Threshold': 'Yläkynnys',
    'ALC Min Analog Gain': 'Minimivahvistus',
    'ALC Min Threshold': 'Alakynnys (kohina)',
    'ALC Noise Threshold': 'Kohinan kynnys',
    'ALC Release Rate': 'Laskunopeus',
    'Mic 1 Volume': 'Mikrofoni 1 – voimakkuus',
    'Mic 2 Volume': 'Mikrofoni 2 – voimakkuus',
    'Aux Volume': 'Linja-sisääntulo – voimakkuus',
    'Mixin PGA Volume': 'Mikserin vahvistus',
    'DAC Volume': 'Toisto – voimakkuus',
    'Headphone Volume': 'Kuulokkeet – voimakkuus',
    'Lineout Volume': 'Linjaulos – voimakkuus',
  };

  const ALSA_CAPTURE = ['Mic 1', 'Mic 2', 'Aux', 'Mixin PGA', 'ADC HPF', 'ADC Gain Ramping', 'Mic 1 Volume', 'Mic 2 Volume', 'Aux Volume', 'Mixin PGA Volume'];
  const ALSA_PLAYBACK = ['DAC', 'Headphone', 'Lineout', 'DAC Volume', 'Headphone Volume', 'Lineout Volume'];
  const ALSA_ALC = ['ALC', 'ALC Anticlip Level', 'ALC Anticlip Mode', 'ALC Attack Rate', 'ALC Hold Time', 'ALC Integ Attack Rate', 'ALC Integ Release Rate', 'ALC Max Analog Gain', 'ALC Max Attenuation', 'ALC Max Gain', 'ALC Max Threshold', 'ALC Min Analog Gain', 'ALC Min Threshold', 'ALC Noise Threshold', 'ALC Release Rate'];

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
    const uiMode = (mode === 'ON' || mode === 'OFF') ? 'WEBUI' : mode;
    document.querySelectorAll('input[name="mode"]').forEach((el) => {
      el.checked = el.value === uiMode;
    });
    const btnToggleStream = document.getElementById('btnToggleStream');
    const btnRestart = document.getElementById('btnRestart');
    const streamSwitchHint = document.getElementById('streamSwitchHint');
    if (mode === 'SWITCH') {
      if (btnToggleStream) {
        btnToggleStream.disabled = true;
        btnToggleStream.textContent = 'Käynnistä';
      }
      if (streamSwitchHint) streamSwitchHint.style.display = 'block';
    } else {
      if (btnToggleStream) {
        btnToggleStream.disabled = false;
        btnToggleStream.textContent = data.active ? 'Lopeta' : 'Käynnistä';
      }
      if (streamSwitchHint) streamSwitchHint.style.display = 'none';
    }
    if (btnRestart) {
      btnRestart.style.display = data.active ? 'inline-block' : 'none';
    }
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
    }
  }

  async function loadAuthConfig() {
    try {
      const cfg = await fetchJson('/api/config');
      const form = document.getElementById('formAuth');
      if (!form) return;
      form.elements.authCurrentPassword.value = '';
      form.elements.authNewPassword.value = '';
      form.elements.authNewPasswordConfirm.value = '';
      const btnRemove = document.getElementById('btnAuthRemove');
      if (btnRemove) btnRemove.style.display = (cfg.auth && cfg.auth.enabled) ? 'inline-block' : 'none';
    } catch (_) {}
  }

  tabStreaming.addEventListener('click', () => switchPanel('streaming'));
  tabAudio.addEventListener('click', () => switchPanel('audio'));
  tabSystem.addEventListener('click', () => switchPanel('system'));

  formDarkice.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(formDarkice));
    try {
      await fetchJson('/api/darkice', { method: 'PUT', body: JSON.stringify(payload) });
      showToast(T.toastSaved);
    } catch (err) {
      showToast(T.error + err.message);
    }
  });

  document.getElementById('btnRestartAfterSave').addEventListener('click', async () => {
    const payload = Object.fromEntries(new FormData(formDarkice));
    try {
      await fetchJson('/api/darkice', { method: 'PUT', body: JSON.stringify(payload) });
      await fetchJson('/api/streaming/restart', { method: 'POST' });
      showToast(T.toastRestarted);
      loadStreamingStatus();
    } catch (err) {
      showToast(T.error + err.message);
    }
  });

  document.querySelectorAll('input[name="mode"]').forEach((el) => {
    el.addEventListener('change', async () => {
      try {
        const mode = el.value;
        await fetchJson('/api/streaming/mode', { method: 'PUT', body: JSON.stringify({ mode }) });
        showToast(T.toastMode + (mode === 'SWITCH' ? 'Kytkin' : 'Tämä sivu'));
        loadStreamingStatus();
      } catch (err) {
        showToast(T.error + err.message);
      }
    });
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
  document.getElementById('btnRestart').addEventListener('click', async () => {
    try {
      await fetchJson('/api/streaming/restart', { method: 'POST' });
      showToast(T.toastStreamRestart);
      loadStreamingStatus();
    } catch (err) {
      showToast(T.error + err.message);
    }
  });

  const ALSA_CONTROL_HINTS = {
    'Mic 1': 'Mikrofonikanavan 1 voimakkuus. Suurempi arvo = kovempi mikrofoniääni. Pienempi = hiljaisempi.',
    'Mic 2': 'Mikrofonikanavan 2 voimakkuus. Suurempi arvo = kovempi mikrofoniääni. Pienempi = hiljaisempi.',
    'Aux': 'Linja-sisääntulon voimakkuus (pääasiallinen säätö lähetykseen). Suurempi arvo = kovempi ääni. Pienempi = hiljaisempi.',
    'Mixin PGA': 'Mikserin vahvistus ennen muunnosta. Suurempi arvo = vahvempi lähtö. Pienempi = heikompi.',
    'ADC HPF': 'Suodattaa matalataajuiset huminat ja kohina pois. Päällä = vähemmän kohinaa (suositeltu). Pois = koko taajuuskaista läpi.',
    'ADC Gain Ramping': 'Päällä = vahvistus muuttuu tasaisesti (ei napsahduksia). Pois = nopeampi vaste.',
    'DAC': 'Toiston (kuuntelun) voimakkuus. Suurempi = kovempi kuuntelu. Pienempi = hiljaisempi.',
    'Headphone': 'Kuulokeulostulon voimakkuus. Suurempi = kovempi. Pienempi = hiljaisempi.',
    'Lineout': 'Linjaulosmenon voimakkuus. Suurempi = kovempi. Pienempi = hiljaisempi.',
    'ALC': 'Tasonkorjaus tasaa äänenvoimakkuuden automaattisesti. Päällä = tasaisempi ääni (puhe, laulu). Pois = raaka taso.',
    'ALC Anticlip Level': 'Vääristymän eston taso. Pienempi arvo = tiukempi raja (ääni pysyy hiljempana, ei leikkaa). Suurempi = kovempi ääni sallitaan ennen rajoitusta.',
    'ALC Anticlip Mode': 'Vääristymän esto. Päällä = estää leikkaantumisen. Pois = ei estoa.',
    'ALC Attack Rate': 'Kuinka nopeasti tasonkorjaus reagoi äänen nousuun. Suurempi arvo = nopeampi nousu (ääni vahvistuu nopeammin). Pienempi = hitaampi.',
    'ALC Hold Time': 'Kuinka kauan vahvistus pidetään ennen laskua. Suurempi = pidempi pito. Pienempi = nopeammin laskee hiljaisuuteen.',
    'ALC Integ Attack Rate': 'Tasonkorjauksen tasoitettu nousunopeus. Suurempi = nopeampi tasoitettu nousu. Pienempi = pehmeämpi nousu.',
    'ALC Integ Release Rate': 'Tasonkorjauksen tasoitettu laskunopeus. Suurempi = nopeammin vahvistus laskee. Pienempi = hitaampi lasku.',
    'ALC Max Analog Gain': 'Suurin sallittu vahvistus. Pienempi arvo = vähemmän kohinaa vahvistuu. Suurempi = enemmän vahvistusvaraa.',
    'ALC Max Attenuation': 'Kuinka paljon tasonkorjaus voi hiljentää kovaa ääntä. Suurempi = voi hiljentää enemmän. Pienempi = vähemmän vaimennusta.',
    'ALC Max Gain': 'Suurin kokonaisvahvistus. Pienempi = tiukempi yläraja. Suurempi = enemmän vahvistusta sallitaan.',
    'ALC Max Threshold': 'Taso, josta ylöspäin tasonkorjaus alkaa vaimentaa. Pienempi = vaimentaa jo hiljaisempaa. Suurempi = vain kovaa ääntä vaimentaa.',
    'ALC Min Analog Gain': 'Minimivahvistus. Suurempi = ääni ei mene tätä hiljaisemmaksi. Pienempi = voi mennä hiljaisemmaksi.',
    'ALC Min Threshold': 'Alakynnys: vaikuttaa siihen, kuinka paljon taustakohinaa päästetään läpi. Pienempi arvo = vähemmän kohinaa pääsee läpi (tiukempi suodatus). Suurempi arvo = enemmän kohinaa pääsee läpi.',
    'ALC Noise Threshold': 'Kynnys, josta alaspäin ääntä pidetään kohinana; suurempi arvo voi tarkoittaa tiukempaa suodatusta.',
    'ALC Release Rate': 'Kuinka nopeasti tasonkorjaus laskee vahvistusta äänen hiljetessä. Suurempi = nopeammin laskee. Pienempi = vahvistus pysyy kauemmin.',
    'Mic 1 Volume': 'Suurempi arvo = kovempi ääni. Pienempi = hiljaisempi.',
    'Mic 2 Volume': 'Suurempi arvo = kovempi ääni. Pienempi = hiljaisempi.',
    'Aux Volume': 'Suurempi arvo = kovempi linjaääni. Pienempi = hiljaisempi.',
    'Mixin PGA Volume': 'Suurempi = vahvempi. Pienempi = heikompi.',
    'DAC Volume': 'Suurempi = kovempi toisto. Pienempi = hiljaisempi.',
    'Headphone Volume': 'Suurempi = kovempi. Pienempi = hiljaisempi.',
    'Lineout Volume': 'Suurempi = kovempi. Pienempi = hiljaisempi.',
  };

  function renderAlsaControl(name, c, container) {
    const label = ALSA_LABELS[name] || name;
    const min = c.min ?? 0;
    const max = c.max ?? 127;
    const div = document.createElement('div');
    div.className = 'audio-control';
    const hint = ALSA_CONTROL_HINTS[name];
    if (hint) div.title = hint;
    const isMono = c.values && c.values.length === 1;
    const vals = c.values || [0];
    let html = `<label>${label}</label>`;
    if (hint) html += `<span class="control-hint">${hint}</span>`;
    if (isMono || vals.length === 1) {
      const v = vals[0];
      const pct = max ? Math.round((v / max) * 100) : 0;
      html += `<span class="control-value">${v} / ${max} (${pct}%)</span>`;
      html += `<input type="range" min="${min}" max="${max}" value="${v}" data-name="${name.replace(/"/g, '&quot;')}" data-index="0">`;
    } else {
      html += `<span class="control-value">L: ${vals[0]} R: ${vals[1]}</span>`;
      html += `<div class="slider-row"><span>L</span><input type="range" min="${min}" max="${max}" value="${vals[0]}" data-name="${name.replace(/"/g, '&quot;')}" data-index="0"></div>`;
      html += `<div class="slider-row"><span>R</span><input type="range" min="${min}" max="${max}" value="${vals[1]}" data-name="${name.replace(/"/g, '&quot;')}" data-index="1"></div>`;
    }
    div.innerHTML = html;
    div.querySelectorAll('input[type="range"]').forEach((input) => {
      input.addEventListener('input', debounce(async () => {
        const controlName = input.dataset.name;
        const all = div.querySelectorAll('input[type="range"]');
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

  async function updateAlsaStateIndicator() {
    if (!alsaStateIndicator) return;
    try {
      const { saved } = await fetchJson('/api/audio/state-saved');
      if (alsaDirty) {
        alsaStateIndicator.textContent = 'Äänitila: tallentamatta (muutoksia ei tallennettu)';
      } else {
        alsaStateIndicator.textContent = saved ? 'Äänitila: tallennettu' : 'Äänitila: tallentamatta';
      }
    } catch (_) {
      alsaStateIndicator.textContent = '—';
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
    const HIDE_CONTROLS = ['ADC', 'ADC Volume']; // Ei vaikuta lähetykseen, ei näytetä
    Object.entries(controls).forEach(([name, c]) => {
      if (!c || HIDE_CONTROLS.includes(name)) return;
      if (ALSA_ALC.some((k) => name === k || name.startsWith(k + ' '))) alc.push([name, c]);
      else if (ALSA_CAPTURE.some((k) => name.includes(k))) capture.push([name, c]);
      else if (ALSA_PLAYBACK.some((k) => name.includes(k))) playback.push([name, c]);
      else capture.push([name, c]);
    });
    capture.forEach(([name, c]) => renderAlsaControl(name, c, audioControlsCapture));
    playback.forEach(([name, c]) => renderAlsaControl(name, c, audioControlsPlayback));
    if (audioControlsALC) alc.forEach(([name, c]) => renderAlsaControl(name, c, audioControlsALC));
    await updateAlsaStateIndicator();
    updateCaptureDisabledState();
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
      loadAudioControls();
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
      await fetchJson('/api/backup/import', { method: 'POST', body: text });
      showToast(T.toastBackupImported);
      loadDarkice();
      loadStreamingStatus();
    } catch (err) {
      showToast(T.error + err.message);
    }
    importFile.value = '';
  });

  async function loadLocalBackups() {
    const list = await fetchJson('/api/backup/list');
    localBackupList.innerHTML = list.length
      ? list.map((b) => `<li>${b.name} <small>${b.mtime}</small></li>`).join('')
      : `<li class="muted">${T.noBackups}</li>`;
    if (list.length) {
      restoreRow.style.display = 'flex';
      restoreSelect.innerHTML = list.map((b) => `<option value="${b.name}">${b.name}</option>`).join('');
    } else {
      restoreRow.style.display = 'none';
    }
  }

  document.getElementById('btnSaveLocal').addEventListener('click', async () => {
    try {
      await fetchJson('/api/backup/save', { method: 'POST' });
      showToast(T.toastBackupLocal);
      loadLocalBackups();
    } catch (err) {
      showToast(T.error + err.message);
    }
  });

  document.getElementById('btnRestoreLocal').addEventListener('click', async () => {
    const name = restoreSelect.value;
    if (!name) return;
    try {
      await fetchJson('/api/backup/restore', { method: 'POST', body: JSON.stringify({ name }) });
      showToast(T.toastRestored);
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
        showToast(T.error + (err.message || (err.error || 'Nykyinen salasana voi olla väärä.')));
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
  setInterval(() => {
    loadStreamingStatus();
    loadMuteStatus();
  }, 5000);

  async function init() {
    try {
      const authStatus = await fetch(API + '/api/auth/status', { credentials: 'include' }).then((r) => r.json());
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
