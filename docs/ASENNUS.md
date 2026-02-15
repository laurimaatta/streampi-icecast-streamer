# StreamPi – Asennus puhtaalle Raspbianille

Ohjeessa asennetaan StreamPi (lähetysohjaus) ja WiFi-provisioning puhtaalle Raspberry Pi OS -asennukselle. Kohde: **Raspberry Pi Zero 2 W**, äänikortti **IQAudio Codec Zero**.

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

Skripti kopioi ohjelman Pi:lle ja ajaa koko asennuksen etänä (apt, install.sh, WiFi-provisioning, käynnistys).

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

**Lähetyksen asetukset** (palvelin, salasana jne.): täytä web-käyttöliittymän **Lähetys**-välilehdeltä. Skriptissä ei kysytä näitä – kaikki annetaan käyttöliittymän kautta.

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

## 6. WiFi-provisioning (AP-tila)

WiFi-provisioning **asennetaan normaalin asennuksen yhteydessä** (asenna-pi.sh / setup-pi.sh). Erillistä asennusta ei tarvita.

- **Normaali:** Laite yhdistää SD-kortille / aiemmin lisättyyn verkkoon.
- **Ei verkkoa:** Noin 3 minuutin jälkeen laite käynnistää AP-verkon (SSID: RaspberryStream-Setup, salasana: setup1234). Yhdistä puhelimella ja avaa **http://10.42.0.1:8080** (portti 8080, jotta nginx voi pitää portin 80).
- **Nappi:** Painallus (GPIO27, äänikortin nappi) käynnistää AP-tilan heti.
- **Provisioning-osoite:** http://10.42.0.1:8080

---

## 7. Asennus yhdellä kertaa (SSH-etäajo)

```bash
./scripts/asenna-pi.sh pi@raspberrypi.local
```

Tai IP:llä: `./scripts/asenna-pi.sh pi@10.118.235.92`

Skripti kopioi ohjelman Pi:lle ja ajaa koko asennuksen etänä (apt, install.sh, WiFi-provisioning). Tämän jälkeen avaa selaimessa https://\<Pi-IP\> (tai https://\<Pi-IP\>:8443) ja täytä lähetyksen asetukset Lähetys-välilehdeltä.

---

## 8. Minne asetukset tallentuvat

| Asetus | Tiedosto / sijainti |
|--------|----------------------|
| Lähetyksen asetukset (palvelin, bittinopeus jne.) | `/etc/darkice.cfg` – StreamPi kirjoittaa sinne |
| Oletusarvot ja salasanat | `~/.radio-manager/.env` |
| Lähetyksen tila (päällä / pois / nappi) | `~/.radio-manager/app-config.json` |
| Varmuuskopiot, lokit, sertifikaatit | `~/.radio-manager/` |

---

## 9. Lähetyksen ohjaus (web ja GPIO)

- **Päällä / Pois:** Ohjaa web-napilla.
- **Laitteen nappi (SWITCH):** Lähetys seuraa fyysistä kytkintä (GPIO 17). Kytkin suljettu = lähetys päällä, kytkin auki = pois.

Kytkentä: [KYTKENTA.md](KYTKENTA.md).

---

## 10. Vianetsintä

| Ongelma | Tarkista |
|---------|----------|
| **En pääse kirjautumaan** | Käytä **https://** (ei http) ja oletus **admin** / **streamPi**. Jos tulee "Authentication required" tai kirjautuminen ei tallennu, kokeile: 1) Selaimessa https://\<Pi-IP\>:8443 (tai https://\<Pi-IP\> nginxin kautta). 2) Jos ei toimi, palauta kirjautuminen Pi:llä: `cd ~/radio-manager && node scripts/reset-web-login.js`. Käynnistä sivu uudelleen ja kirjaudu admin/streamPi, vaihda salasana Järjestelmä-välilehdeltä. |
| Lähetys katkeaa heti | Tila ei saa olla "Laitteen nappi" jos kytkintä ei ole. Valitse "Päällä". |
| darkice.cfg ei päivity | `journalctl -u radio-manager -n 50` – etsi "darkice.cfg write failed". Tarkista sudoers: `sudo cat /etc/sudoers.d/radio-manager`. |
| Yhteys Icecastiin | `curl http://<palvelin>:<portti>/status-json.xsl` – tarkista onko stream aktiivinen. |
| Logit | `journalctl -u radio-manager -f`, `journalctl -u darkice.service -f`, `journalctl -u darkice-gpio.service -f` |

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
| WiFi-provisioning (AP-tilassa) | http://10.42.0.1:8080 |
| Logit | `journalctl -u radio-manager -f` |
| CA-sertifikaatti | `~/.radio-manager/certs/ca/ca.pem` |
