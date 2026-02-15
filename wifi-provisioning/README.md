# WiFi-provisioning (AP-tila)

Kun laite ei löydä tunnettua WiFi-verkkoa, se käynnistää access pointin (SSID: **RaspberryStream-Setup**, salasana: **setup1234**). Verkko voidaan lisätä selaimella osoitteessa **http://10.42.0.1:8080**.

**Asennus:** WiFi-provisioning asennetaan normaalin StreamPi-asennuksen yhteydessä. Käytä [docs/ASENNUS.md](../docs/ASENNUS.md) – joko `./scripts/asenna-pi.sh pi@<Pi-IP>` tai Pi:llä `./scripts/setup-pi.sh`. Erillistä asennusta ei tarvita.

Käyttö, nappi (GPIO27) ja vianetsintä: **docs/ASENNUS.md** §6 ja §10.

---

*Vain viittausta varten:* manuaalinen AP-käynnistys/sammutus `sudo /opt/wifi-provisioning/start-ap.sh` ja `stop-ap.sh`. Tunnetut verkot pois (testaus): `sudo /opt/wifi-provisioning/remove-known-networks.sh` – tämän jälkeen AP ilmestyy noin 3 minuutin päästä, osoite http://10.42.0.1:8080.
