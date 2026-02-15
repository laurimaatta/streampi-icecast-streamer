# StreamPi – Kytkentäkaavio ja tarvikeluettelo

## Tarvikeluettelo

| Kappale | Tuote / Huomio |
|--------|----------------|
| 1 | Raspberry Pi Zero 2 W |
| 1 | IQAudio Codec Zero -äänikortti (HAT) |
| 1 | MicroSD-kortti (esim. 16 GB), Raspbian |
| 1 | Virtalähde (USB, 5 V) |
| 1 | Painonappi (valinnainen, lähetyksen käynnistys) |
| 1 | Johdot (micro USB tai USB-C Pi:lle, mahd. nappiin) |

## Kytkentäkaavio (nappi)

Laitteen nappi -tilassa lähetys käynnistyy ja pysähtyy fyysisellä napilla. Nappi kytketään äänikortin ja Pi:n välille.

```
                    Raspberry Pi Zero 2 W
                    ┌─────────────────────┐
                    │  [3V3]  (1) (2)   │
                    │  [GPIO2] (3) (4)   │
                    │  [GPIO3] (5) (6)   │
                    │  ...               │
                    │  [GPIO17] (11)(12) │  ← Nappi toiseen johtoon
                    │  [GND]   (9)(10)   │  ← Nappi toiseen johtoon
                    │  ...               │
                    └─────────────────────┘
                           │
                           │ HAT-pinnit
                           ▼
                    IQAudio Codec Zero
                    (GPIO17 = nappi, jos käytössä)
```

**Nappi:** Toinen johdoista GPIO17 (pin 11) ja toinen GND (pin 9). Nappi on painettaessa oikosulku näiden välillä. Älä käytä virtalähdettä – vain GPIO ja GND.

**Huom:** Jos et käytä nappia, valitse käyttöliittymässä tila "Päällä" tai "Pois" ja ohjaa lähetystä vain verkko-ohjaimella.

## Yhteenveto

- **Pi Zero 2 W** + **IQAudio Codec Zero** pinoon (HAT).
- Valinnainen **nappi**: yksi johdoista GPIO17 (pin 11), toinen GND (pin 9). Painettaessa lähetys käynnistyy tai pysähtyy (riippuu tilasta).
- Ensimmäinen WiFi asetetaan SD-kortille ennen käynnistystä tai AP-tilan web-sivulla.
- Käyttöliittymä: https://\<laite-ip\>:8443 (StreamPi).
