#!/usr/bin/python3
"""
Kuuntelee äänikortin nappia (GPIO27). Painallus käynnistää AP-tilan ja
provisioning-web-palvelun. Aja root-oikeuksilla (systemd).
"""
import subprocess
import sys
import threading
import time

from gpiozero import Button

SCRIPT_DIR = "/opt/wifi-provisioning"
GPIO_BUTTON = 27
DEBOUNCE_SEC = 2  # Estä useat painallukset peräkkäin


def start_ap_mode():
    """Käynnistä AP ja web-palvelu (blokkaava)."""
    print("button-to-ap: nappi painettu, käynnistetään AP", flush=True, file=sys.stderr)
    try:
        r = subprocess.run(
            [f"{SCRIPT_DIR}/start-ap.sh"],
            timeout=30,
            capture_output=True,
            text=True,
        )
        if r.returncode != 0:
            print(f"button-to-ap: start-ap.sh exit {r.returncode} stderr={r.stderr!r}", flush=True, file=sys.stderr)
        r2 = subprocess.run(
            ["systemctl", "start", "wifi-provisioning-web.service"],
            timeout=5,
            capture_output=True,
            text=True,
        )
        if r2.returncode != 0:
            print(f"button-to-ap: systemctl start exit {r2.returncode}", flush=True, file=sys.stderr)
    except subprocess.TimeoutExpired:
        print("button-to-ap: start-ap.sh timeout", flush=True, file=sys.stderr)
    except Exception as e:
        print(f"button-to-ap: {e!r}", flush=True, file=sys.stderr)


def on_press():
    """Nappi painettu: käynnistä AP taustalla."""
    if not hasattr(on_press, "_running"):
        on_press._running = False
    if on_press._running:
        return
    on_press._running = True
    def run():
        try:
            start_ap_mode()
        finally:
            time.sleep(DEBOUNCE_SEC)
            on_press._running = False
    threading.Thread(target=run, daemon=True).start()


def main():
    button = Button(GPIO_BUTTON, bounce_time=0.2)
    button.when_pressed = on_press
    # Pidä prosessi elossa
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
