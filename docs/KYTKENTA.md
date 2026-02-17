# StreamPi – Kytkentäkaavio ja tarvikeluettelo

## Tarvikeluettelo

| Kappale | Tuote / Huomio |
|--------|----------------|
| 1 | Raspberry Pi Zero 2 W |
| 1 | IQAudio Codec Zero -äänikortti (HAT) |
| 1 | MicroSD-kortti (esim. 16 GB), Raspbian |
| 1 | Virtalähde (USB, 5 V) |
| 1 | Kytkin (valinnainen, lähetyksen käynnistys) |
| 1 | Kytkin (valinnainen, vaimennus / linja hiljennys) |
| 1 | Johdot (micro USB tai USB-C Pi:lle, mahd. kytkimiin) |

## Kytkentäkaavio (kytkin)

Kytkin-tilassa lähetys käynnistyy ja pysähtyy fyysisellä kytkimellä. Kytkin kytketään äänikortin ja Pi:n välille.

```
                    Raspberry Pi Zero 2 W
                    ┌─────────────────────┐
                    │  [3V3]  (1) (2)   │
                    │  [GPIO2] (3) (4)   │
                    │  [GPIO3] (5) (6)   │
                    │  ...               │
                    │  [GPIO17] (11)(12) │  ← Lähetyskytkin toiseen johtoon
                    │  [GPIO22] (15)(16) │  ← Vaimennuskytkin toiseen johtoon (valinnainen)
                    │  [GND]   (9)(10)   │  ← Kytkimet toiseen johtoon (yhteinen GND)
                    │  ...               │
                    └─────────────────────┘
                           │
                           │ HAT-pinnit
                           ▼
                    IQAudio Codec Zero
                    (GPIO17 = lähetyskytkin, GPIO22 = vaimennus, jos käytössä)
```

**Lähetyskytkin:** Toinen johdoista GPIO17 (pin 11) ja toinen GND (pin 9). Kytkin suljettaessa oikosulku näiden välillä. Älä käytä virtalähdettä – vain GPIO ja GND.

**Vaimennuskytkin (valinnainen):** Toinen johdoista GPIO22 (pin 15) ja toinen GND (pin 9 tai 14). Kytkin suljettu = linja-sisääntulo hiljennetty, kytkin auki = ääni menee lähetykseen. Järjestelmä-välilehden Laiteasetuksista valitaan "Vaimennuskytkin käytössä". Älä käytä GPIO23 (pin 16) – se on varattu IQaudIO Codec Zero -kortin vihreälle LED D2:lle.

**Huom:** Jos et käytä kytkintä, valitse käyttöliittymässä ohjaus "Web UI" ja ohjaa lähetystä vain verkko-ohjaimella.

## Yhteenveto

- **Pi Zero 2 W** + **IQAudio Codec Zero** pinoon (HAT).
- Valinnainen **lähetyskytkin**: GPIO17 (pin 11) ja GND (pin 9). Kytkin suljettuna = lähetys päällä, auki = pois.
- Valinnainen **vaimennuskytkin**: GPIO22 (pin 15) ja GND. Kytkin suljettuna = hiljennetty, auki = ääni lähetykseen.
- Ensimmäinen WiFi asetetaan SD-kortille ennen käynnistystä tai AP-tilan web-sivulla.
- Käyttöliittymä: https://\<laite-ip\>:8443 (StreamPi).
