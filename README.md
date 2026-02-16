# StreamPi

Internet-radiolähetyksen web-ohjaus Raspberry Pi Zero 2 W -laitteelle (IQAudio Codec Zero). Yleiskäyttöinen ohjelma: lähetyksen käynnistys ja pysäytys, äänen säätö, varmuuskopiot. WiFi-hotspot (AP-tila): laite käynnistää oman verkkonsa (access point), jos tunnettua verkkoa ei löydy, ja verkko voidaan lisätä selaimella.

- **Koodi:** englanti
- **Dokumentaatio:** suomi

## Sisältö

| Kansio | Kuvaus |
|--------|--------|
| `radio-manager/` | StreamPi-webohjaus (Node.js, HTTPS) |
| `wifi-provisioning/` | WiFi-hotspot: AP-tila ja verkkojen lisäys (Python, Flask) |
| `icecast-testserver/` | Paikallinen Icecast-testipalvelin (Docker) – lähetyksen testaamiseen |
| `docs/` | [Asennus](docs/ASENNUS.md), [kytkentä ja tarvikkeet](docs/KYTKENTA.md) |

## Teknologia

- **Web:** Node.js (Express), HTTPS (oma CA)
- **Välityspalvelin:** nginx (HTTPS → Node)
- **Ääni:** ALSA (IQaudIO Codec Zero / DA7213), Darkice (MP3/Ogg → Icecast)
- **WiFi-hotspot:** Python, Flask (AP-tila, verkkojen lisäys selaimella)
- **Testipalvelin:** `icecast-testserver/` – Docker-pohjainen Icecast (portti 8000), ohje: [icecast-testserver/README.md](icecast-testserver/README.md)

## Nopea käynnistys

1. Asenna Raspbian ja aseta ensimmäinen WiFi SD-kortille (tai lisää myöhemmin AP-tilassa).
2. **Paikalliselta koneelta:** `./scripts/asenna-pi.sh käyttäjä@<Pi-IP>` – kopioi ja asenna kerralla (vain kopio: `--copy-only`).
3. Täytä `~/.radio-manager/.env` (palvelin, salasana) ja avaa selaimessa https://\<Pi-IP\>:8443.

Yksityiskohtainen asennus: **[docs/ASENNUS.md](docs/ASENNUS.md)**.

## Turvallisuus

- Salasanat ja palvelinasetukset säilytetään paikallisesti `.env`-tiedostossa (ks. `.env.example`).
- Selain voi varoittaa HTTPS-yhteydestä, kunnes asennat CA-sertifikaatin (ohje asennusdokumentissa).

## Lisenssi

MIT – käyttö, muokkaus ja jakelu vapaata. Ei takuuta eikä vastuuta. Katso [LICENSE](LICENSE).
