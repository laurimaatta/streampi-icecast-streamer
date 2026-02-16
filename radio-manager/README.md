# StreamPi (radio-manager)

Web-käyttöliittymä internet-radiolähetyksen ohjaukseen Raspberry Pi Zero 2 W -laitteella (DarkIce, IQAudio Codec Zero). Käyttöliittymän nimi: **StreamPi**.

## Ominaisuudet

- **Lähetys:** Lähetyksen ohjaus kytkimellä tai Web UI -napilla
- **Lähetyksen asetukset:** Bittinopeus, näytteenottotaajuus, kanavat, äänilähde. Palvelin ja salasana asetetaan .env-tiedostoon
- **Ääni:** Mikseriasetukset, tallenna ja palauta äänitila
- **Järjestelmä:** Varmuuskopio ja palautus (JSON, paikalliset)
- **HTTPS** paikallisilla sertifikaateilla (asenna CA selaimessa varoitusten poistamiseksi)

## Vaatimukset

- Raspberry Pi Zero 2 W (tai yhteensopiva)
- Node.js 18+
- DarkIce, ALSA, systemd
- IQAudio Codec Zero (tai yhteensopiva HAT)

## Nopea käynnistys Pi:llä

1. Kopioi `radio-manager` -kansio Pi:lle (esim. `/home/user/radio-manager`).
2. Pi:llä:
   ```bash
   cd ~/radio-manager
   chmod +x scripts/install.sh scripts/generate-certs.js
   ./scripts/install.sh
   ```
3. Luo .env (palvelin ja salasana): `cp .env.example ~/.radio-manager/.env` ja täytä arvot.
4. Käynnistä: `sudo systemctl start radio-manager`
5. Avaa selaimessa: **https://raspberrypizero.local:8443** (tai https://\<Pi-IP\>:8443)
6. Selainvaroituksen poistamiseksi: asenna CA-sertifikaatti (ohje projektin juuren docs/ASENNUS.md)

## Konfiguraatio

- **Data-hakemisto:** `RADIO_MANAGER_DATA` (oletus: `/home/user/.radio-manager`)
- **Portti:** `PORT` (oletus: 8443)
- **.env:** Palvelin, salasana, mount-piste, lähetyksen nimi – ks. `.env.example`.

## Kytkin

Kun ohjaus on "Kytkin", lähetys käynnistyy ja pysähtyy fyysisellä kytkimellä (GPIO17). Web UI -tilassa ohjataan Käynnistä/Lopeta -napilla.

Yksityiskohtainen asennus ja kytkentä: projektin juuren **[docs/ASENNUS.md](../docs/ASENNUS.md)** ja **[docs/KYTKENTA.md](../docs/KYTKENTA.md)**.
