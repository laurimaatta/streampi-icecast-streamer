#!/usr/bin/env python3
"""
DarkIce GPIO control: stream follows a physical switch (kytkin).
Used when Radio Manager streaming mode is SWITCH.
GPIO 17: switch closed (LOW) = stream ON, switch open (HIGH) = stream OFF.
Polling loop checks state every second (matches original darkice_manager.py behaviour).
"""
import subprocess
import time
import sys

try:
    import RPi.GPIO as GPIO
except ImportError:
    print("RPi.GPIO not available; exiting.", file=sys.stderr)
    sys.exit(1)

BUTTON_PIN = 17
DEBUG = False


def debug_print(msg):
    if DEBUG:
        print(msg, flush=True)


def is_darkice_active():
    try:
        out = subprocess.check_output(
            ["systemctl", "is-active", "darkice.service"],
            timeout=5,
        )
        return out.strip() == b"active"
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False


def start_darkice():
    if not is_darkice_active():
        debug_print("Starting DarkIce service (switch on)...")
        subprocess.call(["sudo", "systemctl", "start", "darkice.service"], timeout=10)
    else:
        debug_print("DarkIce service is already running.")


def stop_darkice():
    if is_darkice_active():
        debug_print("Stopping DarkIce service (switch off)...")
        subprocess.call(["sudo", "systemctl", "stop", "darkice.service"], timeout=10)
    else:
        debug_print("DarkIce service is not running.")


def main():
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(BUTTON_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)

    try:
        debug_print("GPIO control active. Switch closed (LOW) = stream on, open (HIGH) = stream off.")
        while True:
            button_state = GPIO.input(BUTTON_PIN)
            if button_state == GPIO.LOW:  # Switch closed
                start_darkice()
            else:  # Switch open
                stop_darkice()
            time.sleep(1)
    except KeyboardInterrupt:
        debug_print("Exiting...")
    finally:
        GPIO.cleanup()


if __name__ == "__main__":
    main()
