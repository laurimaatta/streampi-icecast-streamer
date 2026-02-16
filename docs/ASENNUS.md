# StreamPi – Asennus puhtaalle Raspbianille

Ohjeessa asennetaan StreamPi (lähetysohjaus) ja WiFi-hotspot (AP-tila) puhtaalle Raspberry Pi OS -asennukselle. Kohde: **Raspberry Pi Zero 2 W**, äänikortti **IQAudio Codec Zero**.

Asennus on suunniteltu toimimaan kerralla juuri asennetulla Pi Zero 2W:lla.

---

## 1. Raspbian ja ensimmäinen verkko

1. Lataa [Raspberry Pi Imager](https://www.raspberrypi.com/software/).
2. Kirjoita SD-kortille **Raspberry Pi OS (64-bit, suositeltu)**.
3. Ennen ensimmäistä käynnistystä: Imagerissa **Edit settings** (vaihtoehdot) ja aseta:
   - Käyttäjätunnus ja salasana
   - **WiFi**: SSID ja salasana (kotiverkko) – laite yhdistää heti
   - **SSH**: Enable
4. Tallenna ja kirjoita kuva kortille, asenna kortti Pi:hin ja käynnistä.
5. Löydä Pi:n IP (reitittimen hallintasivu tai `arp -a`) tai käytä `raspberrypi.local` jos mDNS toimii.

---

## 2. Nopea asennus (rutiini)

### Vaihe A: Kopioi ja asenna

**Vaihtoehto 1 – yksi komento (paikalliselta koneelta):**

```bash
./scripts/asenna-pi.sh käyttäjä@<Pi-IP>
```

Esim. `./scripts/asenna-pi.sh pi@10.118.235.92` tai `./scripts/asenna-pi.sh pi@raspberrypi.local`. Vain kopio (asennus ajetaan Pi:llä käsin): `./scripts/asenna-pi.sh pi@<Pi-IP> --copy-only`

Skripti kopioi ohjelman Pi:lle ja ajaa koko asennuksen etänä (apt, install.sh, WiFi-hotspot, käynnistys).

**Vaihtoehto 2 – vain kopioi, asenna sitten Pi:llä käsin:**

```bash
# Paikalliselta koneelta (ei aja asennusta):
./scripts/asenna-pi.sh pi@<Pi-IP> --copy-only

# Pi:llä:
cd ~/radio-manager && chmod +x scripts/setup-pi.sh && ./scripts/setup-pi.sh
```

### Vaihe B: Avaa käyttöliittymä ja täytä asetukset

- **Ilman nginxia:** https://\<Pi-IP\>:8443  
- **Nginx asennettu:** https://\<Pi-IP\> tai http://\<Pi-IP\> (http ohjautuu automaattisesti https:ään)

**Kirjautuminen:** käyttäjätunnus **admin**, salasana **streamPi**. Vaihda salasana heti Järjestelmä-välilehden "Web-kirjautuminen" -osiosta.

**Lähetyksen asetukset** (palvelin, salasana jne.): täytä web-käyttöliittymän **Lähetys**-välilehdeltä. Skriptissä ei kysytä näitä – kaikki annetaan käyttöliittymän kautta. Paikallista testausta varten voit käynnistää repon Icecast-testipalvelimen: [icecast-testserver/README.md](../icecast-testserver/README.md) (Docker, portti 8000).

---

## 3. Konfigurointi (valinnainen)

Ennen `install.sh`-ajoja voit suorittaa interaktiivisen konfiguroinnin:

```bash
cd ~/radio-manager
./scripts/configure.sh
./scripts/install.sh
```

Skripti kysyy: **hostname** (sertifikaattia varten), **IP-osoite(et)** (pilkulla erotettuna), **käyttäjä** (jolla palvelut ajetaan), **web-kirjautuminen** (vapaaehtoinen) ja **ALSA-äänikortti** (0 tai 1; IQaudIO on usein kortti 1). Arvot tallentuvat `install.conf`:iin.

---

## 4. Palvelinasetukset

Lähetyksen palvelin ja salasana täytetään **web-käyttöliittymän Lähetys-välilehdeltä** (tai halutessasi suoraan tiedostossa `~/.radio-manager/.env`). Vähintään:

| Asetus | Kuvaus |
|--------|--------|
| `DARKICE_SERVER` | Icecast-palvelimen osoite (esim. `icecast.example.com`) |
| `DARKICE_PORT` | Yleensä 8000 |
| `DARKICE_MOUNT_POINT` | Mount-piste (esim. `live.mp3`) |
| `DARKICE_PASSWORD` | Lähetyksen salasana |
| `DARKICE_NAME` | Lähetyksen nimi |

**Huom:** Web-käyttöliittymän tallennukset päivittävät `/etc/darkice.cfg`:ää. Jos haluat pakottaa tietyt arvot, pidä ne `.env`:ssä ja älä muokkaa webistä.

---

## 5. HTTPS-sertifikaatti ja CA-ohje

Asennuksen yhteydessä skripti kysyy, haluatko luoda HTTPS-sertifikaatin ja näyttääkö se ohjeet CA-sertifikaatin asentamiseen selaimessa. Ohjeet tulostuvat asennuksen lopuksi.

**Lyhyt ohje:** Kopioi Pi:ltä `~/.radio-manager/certs/ca/ca.pem` omaan koneeseesi ja asenna se selaimen luotettavana juuri-CA:na (Chrome: Asetukset → Turvallisuus → Sertifikaatit → Valtuutetut juurivarmenteen myöntäjät → Tuo). Käynnistä selain uudelleen ja avaa sivun hostnamella tai IP:llä, joka on sertifikaatissa – varoitus katoaa.

---

### 5.1 Nginx (portti 80/443)

**Nginx** mahdollistaa käytön ilman porttia: https://\<Pi-IP\> ja http://\<Pi-IP\> (ohjautuu automaattisesti https:ään). Ilman nginxia tarvitaan aina :8443.

- **Asennus:** `install.sh` asentaa nginxin automaattisesti, jos sitä ei ole. Voit myös asentaa pakettilistassa (kohdan 2B `apt install`).
- **Konfiguraatio:** Skripti luo `/etc/nginx/sites-available/streampi` ja ohjaa portit 80 ja 443 StreamPiin (8443), sekä poistaa nginx-oletussivun käytöstä.
- **"Welcome to nginx" näkyy edelleen:** Oletussivu on vielä käytössä. Aja Pi:llä:  
  `sudo rm -f /etc/nginx/sites-enabled/default && sudo ln -sf /etc/nginx/sites-available/streampi /etc/nginx/sites-enabled/streampi && sudo nginx -t && sudo systemctl reload nginx`  
  Tämän jälkeen https://\<Pi-IP\> ja http://\<Pi-IP\> näyttävät StreamPin.
- **Ongelmat:** Jos nginx ei käynnisty, tarkista `sudo nginx -t` ja `journalctl -u nginx -n 20`.

---

## 6. WiFi-hotspot (AP-tila)

WiFi-hotspot **asennetaan normaalin asennuksen yhteydessä** (asenna-pi.sh / setup-pi.sh). Erillistä asennusta ei tarvita.

- **Normaali:** Laite yhdistää SD-kortille / aiemmin lisättyyn verkkoon.
- **Ei verkkoa:** Noin 2 minuutin jälkeen laite käynnistää access pointin / hotspotin (SSID: RaspberryStream-Setup, salasana: setup1234). Yhdistä puhelimella ja avaa **http://10.42.0.1:8080** (portti 8080, jotta nginx voi pitää portin 80).
- **Nappi:** Painallus (GPIO27, äänikortin nappi) käynnistää AP-tilan heti.
- **Hotspot-osoite (verkkojen lisäys):** http://10.42.0.1:8080

---

## 7. Asennus yhdellä kertaa (SSH-etäajo)

```bash
./scripts/asenna-pi.sh pi@raspberrypi.local
```

Tai IP:llä: `./scripts/asenna-pi.sh pi@10.118.235.92`

Skripti kopioi ohjelman Pi:lle ja ajaa koko asennuksen etänä (apt, install.sh, WiFi-hotspot). Tämän jälkeen avaa selaimessa https://\<Pi-IP\> (tai https://\<Pi-IP\>:8443) ja täytä lähetyksen asetukset Lähetys-välilehdeltä.

---

## 8. Minne asetukset tallentuvat

| Asetus | Tiedosto / sijainti |
|--------|----------------------|
| Lähetyksen asetukset (palvelin, bittinopeus jne.) | `/etc/darkice.cfg` – StreamPi kirjoittaa sinne |
| Oletusarvot ja salasanat | `~/.radio-manager/.env` |
| Lähetyksen ohjaus (kytkin / Web UI) | `~/.radio-manager/app-config.json` |
| Varmuuskopiot, lokit, sertifikaatit | `~/.radio-manager/` |

---

## 9. Lähetyksen ohjaus (web ja GPIO)

- **Kytkin:** Lähetys seuraa fyysistä kytkintä (GPIO 17). Kytkin suljettu = lähetys päällä, kytkin auki = pois.
- **Web UI:** Ohjaa web-napilla (Käynnistä / Lopeta). Käynnistä uudelleen -nappi näkyy kun lähetys on käynnissä, riippumatta siitä miten lähetys on käynnistetty.

Kytkentä: [KYTKENTA.md](KYTKENTA.md).

---

## 10. Vianetsintä

| Ongelma | Tarkista |
|---------|----------|
| **En pääse kirjautumaan** | Käytä https:// ja oletustunnukset (ohjeessa). Jos ei toimi: Pi:llä `cd ~/radio-manager && node scripts/reset-web-login.js`, sitten kirjaudu uudelleen ja vaihda salasana Järjestelmä-välilehdeltä. |
| **Lähetys katkeaa heti / I/O error** | **PipeWire lukitsee äänilaitteen** → Disable PipeWire: `sudo -u user XDG_RUNTIME_DIR=/run/user/1000 systemctl --user mask pipewire pipewire-pulse wireplumber pipewire.socket pipewire-pulse.socket && sudo -u user XDG_RUNTIME_DIR=/run/user/1000 systemctl --user stop pipewire pipewire-pulse wireplumber && sudo systemctl restart darkice`. Asennusskripti tekee tämän automaattisesti. |
| **Lähetys ei käynnisty** | Valitse ohjaus "Web UI" (ei "Kytkin" ilman fyysistä kytkintä). Tarkista `journalctl -u darkice -f`. |
| **Hotspot ei ilmesty** | Tarkista: `systemctl is-enabled wifi-watchdog.timer button-to-ap.service` (pitää olla enabled). Jos masked: `sudo systemctl unmask wifi-watchdog.timer button-to-ap.service && sudo systemctl enable --now wifi-watchdog.timer button-to-ap.service`. Tarkista että skriptit ovat kopioituneet: `wc -c /opt/wifi-provisioning/start-ap.sh` (ei saa olla 0). Älä aja setup-pi.sh:ta suoraan `sudo`lla – aja ilman sudo: `./scripts/setup-pi.sh`. |
| **Hotspot katoaa hetken päästä** | AP-keeper pitää AP-tilan päällä (estää NM:n ottamasta wlan0 takaisin). Tarkista: `systemctl is-active ap-keeper.timer`. Lokit: `sudo cat /run/wifi-provisioning/start-ap.log` ja `sudo cat /run/wifi-provisioning/ap-keeper.log`. |
| **Logit** | `journalctl -u radio-manager -f`, `journalctl -u darkice -f` |

### PipeWire ja ALSA-konflikti

Raspberry Pi OS käyttää PipeWirea, joka lukitsee ALSA-äänilaitteen. DarkIce tarvitsee suoran ALSA-pääsyn.

**Ongelma:** `arecord: audio open error: Device or resource busy` tai `DarkIce: AlsaDspSource.cpp:273: Input/output error`

**Ratkaisu:** Asennusskripti (`install.sh`) disabloi PipeWiren automaattisesti. Jos se on käynnistynyt uudelleen (reboot jne.):

```bash
# Maskaa PipeWire-palvelut (estää käynnistymisen)
sudo -u user XDG_RUNTIME_DIR=/run/user/1000 systemctl --user mask \
  pipewire pipewire-pulse wireplumber pipewire.socket pipewire-pulse.socket

# Pysäytä
sudo -u user XDG_RUNTIME_DIR=/run/user/1000 systemctl --user stop \
  pipewire pipewire-pulse wireplumber

# Jos prosesseja vielä näkyy: ps aux | grep pipewire
sudo killall -9 pipewire wireplumber pipewire-pulse

# Käynnistä DarkIce uudelleen
sudo systemctl restart darkice
```

---

## 11. raspberrypi.local ei vastaa

Jos `raspberrypi.local` tai vastaava ei resolvdu (mDNS/Avahi):

1. **Käytä IP:tä:** `ssh pi@10.118.235.92` (tarkista IP reitittimeltä tai `arp -a`).
2. **SSH-config:** Lisää `~/.ssh/config` rivi `HostName <IP>` jotta alias käyttää IP:tä.
3. **Tyhjennä mDNS-välimuisti** (macOS: `sudo dscacheutil -flush; sudo killall -HUP mDNSResponder`).

---

## 12. Yhteenveto

| Kohde | Osoite / komento |
|-------|-------------------|
| StreamPi (web) | https://\<Pi-IP\>:8443 tai https://\<Pi-IP\> / http://\<Pi-IP\> (nginx) |
| Web-kirjautuminen | **admin** / **streamPi** – vaihda salasana Järjestelmä-välilehdeltä |
| WiFi-hotspot (AP-tilassa, verkkojen lisäys) | http://10.42.0.1:8080 |
| Logit | `journalctl -u radio-manager -f` |
| CA-sertifikaatti | `~/.radio-manager/certs/ca/ca.pem` |
