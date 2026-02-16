# Icecast Nettiradiopalvelin

Tämä on Icecast-streaming-palvelin paikallista nettiradion testausta varten.

## Vaatimukset

- Docker
- Docker Compose

## Asennus ja käynnistys

### 1. Anna logihakemiston oikeudet Icecast-käyttäjälle

Kontissa Icecast käyttää käyttäjää icecast (uid 100, gid 101). Jotta se voi kirjoittaa logeja, anna hakemistolle oikeudet:

```bash
sudo chown -R 100:101 ./logs
```

### 2. Käynnistä palvelin

```bash
docker-compose up -d
```

### 3. Pysäytä palvelin

```bash
docker-compose down
```

### 4. Katso logeja

```bash
docker-compose logs -f
```

## Käyttö

### Web-käyttöliittymä

Avaa selaimessa: `http://localhost:8000`

**Admin-paneeli:** `http://localhost:8000/admin/`
- Käyttäjä: `admin`
- Salasana: `hackme`

### Striimin lähettäminen

Palvelimen source-salasana on: **LIVE**

Voit lähettää äänistriimin Icecastiin käyttäen esimerkiksi seuraavia työkaluja. Voit vapaasti määritellä mountpointin ja lähetyksen nimen haluamaksesi.

#### DarkIce (suositeltu)

Käytä mukana tulevaa `darkice.cfg` -tiedostoa:

1. Asenna DarkIce:
```bash
sudo apt-get install darkice
```

2. Muokkaa `darkice.cfg` -tiedostoa tarpeen mukaan:
   - `device`: Äänilaite (katso laitteet: `arecord -l`)
   - `mountPoint`: Haluamasi mountpoint (esim. `live.mp3`, `testi.mp3`)
   - `name`: Lähetyksen nimi
   - `bitrate`: Laatu (128 on hyvä)

3. Käynnistä lähetys:
```bash
darkice -c darkice.cfg
```

#### OBS Studio
1. Aseta Server: `icecast://localhost:8000/live`
2. Stream Key: `source:LIVE`

#### Butt (Broadcast Using This Tool)
- Server: `localhost`
- Port: `8000`
- Password: `LIVE`
- Mountpoint: `/live` (voit muuttaa haluamaksesi, esim. `/etesti.mp3`)
- Name: Anna lähetykselle nimie
e
#### FFmpeg (komentorivi)
e
MP3-striimi:
```bashe
ffmpeg -re -i musiikki.mp3 -codec:a libmp3lame -b:a 128k \
  -content_type audio/mpeg -f mp3 \e
  icecast://source:LIVE@localhost:8000/live.mp3
```

Ogg Vorbis -striimi:
```bash
ffmpeg -re -i musiikki.mp3 -codec:a libvorbis -b:a 128k \
  -content_type application/ogg -f ogg \
  icecast://source:LIVE@localhost:8000/live.ogg
```

### Striimin kuuntelu

Kun striimi on käynnissä, voit kuunnella sitä:

**Suora linkki:**
- MP3: `http://localhost:8000/live.mp3`
- Ogg: `http://localhost:8000/live.ogg`

**VLC Player:**
```bash
vlc http://localhost:8000/live.mp3
```

**mpv:**
```bash
mpv http://localhost:8000/live.mp3
```

**Selain:**
Avaa `http://localhost:8000` ja klikkaa aktiivista mountpointia.

## Lähiverkkokäyttö

Jos haluat testata nettiradioasi muilla laitteilla lähiverkossa:

### 1. Avaa palomuurissa portti 8000

**Tärkein askel** – useimmiten tämä on esteenä.

```bash
# Suositus: käytä mukana tulevaa skriptiä
sudo ./allow-icecast-firewall.sh

# Tai manuaalisesti (UFW):
sudo ufw allow 8000/tcp comment 'Icecast'
sudo ufw status   # tarkista
```

Jos UFW on pois päältä (`inactive`), yhteydet toimivat jo ilman sääntöä. Jos UFW on päällä, sääntö tarvitaan.

### 2. Selvitä koneesi IP-osoite

```bash
ip -4 addr show | grep "inet " | grep -v 127.0.0.1
```

Esim. `192.168.1.107` – käytä tätä toisella laitteella.

### 3. Yhdistä toiselta laitteelta

- Web: `http://192.168.1.107:8000`
- Striimi: `http://192.168.1.107:8000/live.mp3` (tai oma mountpoint)

### 4. Vianmääritys jos ei toimi

| Ongelma | Tarkista |
|--------|----------|
| Ei yhteyttä | Palomuuri: `sudo ufw allow 8000/tcp` |
| | Icecast käynnissä: `docker-compose ps` |
| | Portti auki: `ss -tlnp \| grep 8000` (näkyy 0.0.0.0:8000) |
| Oikea verkko | Toinen laite samassa WiFi:ssa/verkossa |
| Oikea IP | IP muuttuu; tarkista aina `ip addr` |

## Konfiguraatio

### Lähetysasetukset

**Source-salasana:** `LIVE`

Lähetysohjelma (DarkIce, Butt, FFmpeg, OBS) voi vapaasti määritellä:
- **Mountpoint**: Esim. `/live.mp3`, `/testi.mp3`, `/radio.mp3`
- **Lähetyksen nimi**: Näkyy kuuntelijoille
- **Kuvaus ja metadata**: Genre, URL, jne.

### Salasanojen vaihto

Muokkaa `icecast.xml` -tiedostoa:
- `admin-password`: Admin-paneelin salasana (oletus: `hackme`)
- `source-password`: Striimin lähettämisen salasana (nykyinen: `LIVE`)
- `relay-password`: Relay-palvelimen salasana (oletus: `hackme`)

Jos vaihdat `source-password`:ia, muista päivittää myös `darkice.cfg` -tiedosto!

**TÄRKEÄÄ:** Vaihda oletussalasanat tuotantokäytössä!

### Portin vaihto

Jos portti 8000 on käytössä, muuta sekä `docker-compose.yml` että `icecast.xml` -tiedostoissa.

## Yleisiä ongelmia

### Palvelin ei käynnisty
```bash
# Tarkista Docker-logit
docker-compose logs

# Tarkista onko portti 8000 jo käytössä
sudo netstat -tlnp | grep 8000
```

### "Permission denied" – ei voi kirjoittaa logeja
Jos logissa lukee `could not open error logging ... Permission denied`, anna logihakemistolle oikeudet Icecast-käyttäjälle (uid 100, gid 101):

```bash
sudo chown -R 100:101 ./logs
```

Sitten käynnistä palvelin uudelleen: `docker-compose up -d`

### Ei saa yhteyttä lähiverkosta
- Tarkista palomuuri
- Varmista että käytät oikeaa IP-osoitetta
- Tarkista että palvelin kuuntelee osoitteessa 0.0.0.0 (ei 127.0.0.1)

### Striimi katkeilee
- Tarkista verkkoyhteys
- Nosta bitrate-arvoa (128k -> 96k)
- Tarkista Icecast-logit: `docker-compose logs -f`

## Tekniset tiedot

- **Portti:** 8000
- **Max asiakkaita:** 100
- **Max lähettimiä:** 2
- **Admin-käyttäjä:** admin
- **Admin-salasana:** hackme
- **Source-salasana:** LIVE

## Lisätietoja

- [Icecast virallinen dokumentaatio](https://icecast.org/docs/)
- [DarkIce dokumentaatio](http://www.darkice.org/documentation/)
- [Supported formats](https://icecast.org/docs/icecast-trunk/config-file.html)
