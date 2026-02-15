"""
WiFi provisioning web UI. Served when device is in AP mode; form to add a new WiFi network.
"""
import os
import re
import subprocess
import threading
import time

from flask import Flask, render_template_string, request

app = Flask(__name__)
STATE_DIR = os.environ.get("WIFI_PROVISIONING_STATE", "/run/wifi-provisioning")
SCRIPT_DIR = os.environ.get("WIFI_PROVISIONING_SCRIPT_DIR", "/opt/wifi-provisioning")

HTML = """
<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WiFi-asetukset</title>
  <style>
    :root { --bg: #1a1b26; --surface: #24283b; --text: #c0caf5; --accent: #7aa2f7; --muted: #565f89; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 1rem; min-height: 100vh; }
    .container { max-width: 360px; margin: 0 auto; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p.sub { color: var(--muted); font-size: 0.9rem; margin-bottom: 1.5rem; }
    label { display: block; margin-bottom: 0.25rem; font-size: 0.9rem; }
    input { width: 100%; padding: 0.6rem; margin-bottom: 1rem; border: 1px solid var(--muted); border-radius: 6px; background: var(--surface); color: var(--text); font-size: 1rem; }
    input:focus { outline: none; border-color: var(--accent); }
    button { width: 100%; padding: 0.75rem; background: var(--accent); color: var(--bg); border: none; border-radius: 6px; font-size: 1rem; font-weight: 600; cursor: pointer; }
    button:hover { opacity: 0.9; }
    .msg { margin-top: 1rem; padding: 0.75rem; border-radius: 6px; font-size: 0.9rem; }
    .msg.ok { background: #1e3329; color: #9ece6a; }
    .msg.err { background: #3d2a2a; color: #f7768e; }
    .hint { font-size: 0.8rem; color: var(--muted); margin-top: 0.25rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>WiFi-asetukset</h1>
    <p class="sub">Laite ei löytänyt tunnettua verkkoa. Valitse verkko ja syötä salasana.</p>
    <form method="post" action="/">
      <label for="ssid">Verkon nimi (SSID)</label>
      <input id="ssid" name="ssid" type="text" required autocomplete="off" placeholder="Esim. KotiWiFi"
             {% if suggested %} list="suggested" {% endif %}>
      {% if scan_lines %}
      <datalist id="suggested">
        {% for line in scan_lines %}
        <option value="{{ line }}">
        {% endfor %}
      </datalist>
      {% endif %}
      <label for="password">Salasana</label>
      <input id="password" name="password" type="text" autocomplete="off" placeholder="Verkon salasana">
      <p class="hint">Salasana näkyy, jotta voit tarkistaa sen. Avoin verkko: jätä tyhjäksi.</p>
      <button type="submit">Liitä verkkoon</button>
    </form>
    {% if message %}
    <div class="msg {{ msg_class }}">{{ message }}</div>
    {% endif %}
  </div>
</body>
</html>
"""


def get_suggested_ssids():
    """Read last scan from watchdog (one SSID per line)."""
    path = os.path.join(STATE_DIR, "last-scan.txt")
    if not os.path.isfile(path):
        return None, []
    try:
        with open(path) as f:
            lines = [ln.strip() for ln in f if ln.strip()]
    except OSError:
        return None, []
    # Filter out placeholder (nmcli uses '--' when SSID is hidden)
    ssids = [s for s in lines if s and s != "--"][:20]
    return bool(ssids), ssids


@app.route("/", methods=["GET", "POST"])
def index():
    message = None
    msg_class = "ok"
    suggested, scan_lines = get_suggested_ssids()

    if request.method == "POST":
        ssid = (request.form.get("ssid") or "").strip()
        password = (request.form.get("password") or "").strip()
        if not ssid:
            message = "Syötä verkon nimi (SSID)."
            msg_class = "err"
        else:
            ok, err = add_wifi_connection(ssid, password)
            if ok:
                message = "Verkko lisätty. Yhdistetään… Voit sulkea sivun. Jos yhteys ei tule, laita laite uudelleen."
                msg_class = "ok"
            else:
                message = f"Virhe: {err}"
                msg_class = "err"

    return render_template_string(
        HTML,
        suggested=suggested,
        scan_lines=scan_lines or [],
        message=message,
        msg_class=msg_class or "ok",
    )


def add_wifi_connection(ssid: str, password: str):
    """Add WiFi connection profile with nmcli, then schedule AP shutdown."""
    # Sanitize SSID for shell (avoid injection)
    if not re.match(r"^[\x20-\x7e]{1,32}$", ssid):
        return False, "Virheellinen SSID"
    conn_name = re.sub(r"[^a-zA-Z0-9_-]", "_", ssid)[:32] or "wifi"

    try:
        cmd = [
            "nmcli", "connection", "add",
            "type", "wifi",
            "con-name", conn_name,
            "wifi.ssid", ssid,
        ]
        if password:
            cmd += ["wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", password]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if r.returncode != 0:
            return False, (r.stderr or r.stdout or "nmcli failed")[:200]
    except Exception as e:
        return False, str(e)

    # Schedule AP shutdown + reconnect in 3 seconds (so the success page is delivered)
    def _delayed_stop():
        time.sleep(3)
        stop_ap = os.path.join(SCRIPT_DIR, "stop-ap.sh")
        try:
            subprocess.run([stop_ap], timeout=15, capture_output=True)
        except Exception:
            pass
        # NM auto-connects after stop-ap returns wlan0. As extra safety:
        try:
            subprocess.run(
                ["nmcli", "connection", "up", conn_name],
                timeout=30, capture_output=True,
            )
        except Exception:
            pass
        # Stop this web service
        try:
            subprocess.run(
                ["systemctl", "stop", "wifi-provisioning-web.service"],
                timeout=5, capture_output=True,
            )
        except Exception:
            pass

    threading.Thread(target=_delayed_stop, daemon=True).start()
    return True, None


if __name__ == "__main__":
    port = int(os.environ.get("WIFI_PROVISIONING_PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=False)
