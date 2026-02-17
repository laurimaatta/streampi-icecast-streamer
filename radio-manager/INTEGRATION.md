# Integration with existing scripts

## DarkIce

- **Config file**: `/etc/darkice.cfg` (unchanged). Radio Manager edits it via `sudo tee` when you save from the Streaming tab.
- **Service**: The install script installs `darkice.service` (the Debian darkice package does not ship one). Radio Manager starts/stops/restarts it via `systemctl`. The unit runs `darkice -c /etc/darkice.cfg` as the same user as radio-manager.
- The install script also adds `radio-manager.service` and `darkice-gpio.service`.

## GPIO (kytkin)

- **Script**: `scripts/darkice_gpio.py` uses **RPi.GPIO** with a **switch (kytkin)** on GPIO 17. Polling loop: checks switch state every second. Switch closed (LOW, to GND) = stream ON, switch open (HIGH) = stream OFF. Lähetys on päällä niin kauan kuin kytkin on on-asennossa. Matches original `darkice_manager.py` behaviour.
- **Behaviour**:
  - **SWITCH (Kytkin)**: Radio Manager starts `darkice-gpio.service`, which runs `darkice_gpio.py`. The switch controls DarkIce (on = stream on, off = stream off).
  - **WEBUI**: Radio Manager stops `darkice-gpio.service`. The web UI controls the stream via Käynnistä/Lopeta button.
- **Pin**: GPIO 17 (BCM). Pull-up: switch closed (to GND) = stream on, open = stream off. To change pin, edit `scripts/darkice_gpio.py` (BUTTON_PIN) and restart `darkice-gpio.service` when in SWITCH mode.

## Mute (vaimennus)

- **Ohjaus:** Järjestelmä-välilehdeltä "Vaimennuskytkin käytössä" (tallennetaan `hasMuteSwitch`). Jos päällä: fyysinen kytkin (GPIO 22) ohjaa. Jos pois: Lähetys-välilehden nappi ohjaa; tila on muistissa eikä tallennu käynnistyksen yli.
- **Script**: `scripts/aux_mute_gpio.py` – kytkin GPIO 22. Suljettu (LOW) = hiljennetty, auki (HIGH) = ääni. Tallentaa ja palauttaa ALSA "Aux" ja "Aux Volume" -tasot. Tila: `~/.radio-manager/mute-state.json`.
- **Service**: `mute-gpio.service` käynnistetään kun hasMuteSwitch=true.
- **API**: `GET /api/mute/status` → `{ muted, hasMuteSwitch, hardwareMuted, gpioActive }`. `PUT /api/mute/set` (vain ilman kytkintä) → `{ muted }`. `PUT /api/mute/switch-setting` → `{ hasMuteSwitch }`.
- **Pin**: GPIO 22 (BCM, pin 15). Älä käytä GPIO 23 (varattu äänikortin LED D2:lle).

## ALSA

- Radio Manager uses `amixer -c 1` (card 1) and `alsactl` for store/restore. Stored state path: `~/.radio-manager/asound.state`.
- Your existing `asound.conf` / `.asoundrc` are not modified. The UI only reads/writes mixer values and optional state file.

## WiFi / network

- No changes to WiFi or network config. Use your existing setup (e.g. WiFi hotspot / AP-tila). Access the UI at `https://raspberrypizero.local:8443` or `https://<IP>:8443`.
