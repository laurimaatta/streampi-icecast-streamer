#!/usr/bin/env python3
"""
Aux mute GPIO control: AUX line input is muted by a physical switch.
Used when Radio Manager mute control mode is SWITCH (vaimennus: kytkin).
GPIO 22: switch closed (LOW) = muted (hiljennetty), switch open (HIGH) = sound to stream.
Saves and restores Aux / Aux Volume ALSA levels when unmuting.
(NB: GPIO 23 is reserved by IQaudIO Codec Zero for the green LED D2.)
"""
import json
import os
import re
import subprocess
import time
import sys

try:
    import RPi.GPIO as GPIO
except ImportError:
    print("RPi.GPIO not available; exiting.", file=sys.stderr)
    sys.exit(1)

MUTE_PIN = 22
DEBUG = False
# ALSA controls to mute (set to 0 when muted, restore when unmuted)
AUX_CONTROLS = ["Aux", "Aux Volume"]


def state_file():
    data_dir = os.environ.get("RADIO_MANAGER_DATA") or os.path.join(
        os.environ.get("HOME", "/home/pi"), ".radio-manager"
    )
    return os.path.join(data_dir, "mute-state.json")


def card():
    return os.environ.get("ALSA_CARD", "0")


def debug_print(msg):
    if DEBUG:
        print(msg, flush=True)


def amixer_get(control_name):
    """Get current value(s) for an ALSA control. Returns list of ints or None."""
    try:
        out = subprocess.check_output(
            ["amixer", "-c", card(), "get", control_name],
            timeout=5,
            text=True,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        return None
    values = []
    for m in re.finditer(r"values?=(\d+)", out, re.IGNORECASE):
        values.append(int(m.group(1)))
    if not values:
        for m in re.finditer(r":\s*(\d+)\s*\[", out):
            values.append(int(m.group(1)))
    return values if values else None


def amixer_set(control_name, value):
    """Set ALSA control. value: int or list of ints."""
    v = value if isinstance(value, list) else [value]
    v_str = ",".join(str(x) for x in v)
    try:
        subprocess.run(
            ["amixer", "-c", card(), "set", control_name, v_str],
            check=True,
            timeout=5,
            capture_output=True,
        )
        return True
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        return False


def read_state():
    path = state_file()
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"muted": False, "levels": {}}


def write_state(muted, levels=None):
    path = state_file()
    data = read_state()
    data["muted"] = muted
    if levels is not None:
        data["levels"] = levels
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=0)
    except OSError as e:
        debug_print(f"Write state failed: {e}")


def do_mute():
    levels = {}
    for ctrl in AUX_CONTROLS:
        vals = amixer_get(ctrl)
        if vals is not None:
            levels[ctrl] = vals
            if not amixer_set(ctrl, 0):
                debug_print(f"Failed to set {ctrl} to 0")
    write_state(muted=True, levels=levels)


def do_unmute():
    data = read_state()
    levels = data.get("levels") or {}
    procs = []
    for ctrl in AUX_CONTROLS:
        if ctrl in levels:
            vals = levels[ctrl]
            v_list = vals if isinstance(vals, list) else [vals]
            v_str = ",".join(str(x) for x in v_list)
            procs.append(
                subprocess.Popen(
                    ["amixer", "-c", card(), "set", ctrl, v_str],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            )
    for p in procs:
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            p.kill()
    write_state(muted=False)


def main():
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(MUTE_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)

    try:
        debug_print(
            "Aux mute GPIO active. Switch closed (LOW) = hiljennetty, open (HIGH) = ääni lähetykseen."
        )
        last_muted = None
        while True:
            pin_state = GPIO.input(MUTE_PIN)
            muted = pin_state == GPIO.LOW
            if muted != last_muted:
                if muted:
                    do_mute()
                    debug_print("Muted (switch closed)")
                else:
                    do_unmute()
                    debug_print("Unmuted (switch open)")
                last_muted = muted
            time.sleep(0.15)
    except KeyboardInterrupt:
        debug_print("Exiting...")
    finally:
        GPIO.cleanup()


if __name__ == "__main__":
    main()
