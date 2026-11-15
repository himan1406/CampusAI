"""
Scrapability probe for https://lms.bennett.edu.in (Moodle).
Only makes a handful of plain GET requests. Does NOT attempt login.

Run:  pip install requests beautifulsoup4
      python probe_lms.py
"""
import re
import requests
from bs4 import BeautifulSoup

BASE = "https://lms.bennett.edu.in"
LOGIN = f"{BASE}/login/index.php"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"}

s = requests.Session()
s.headers.update(UA)


def show(label, value):
    print(f"{label:<28} {value}")


# 1. robots.txt
try:
    r = s.get(f"{BASE}/robots.txt", timeout=15)
    show("robots.txt status", r.status_code)
    if r.ok:
        print("--- robots.txt ---")
        print(r.text[:800])
        print("------------------")
except Exception as e:
    show("robots.txt", f"error: {e}")

# 2. Login page
try:
    r = s.get(LOGIN, timeout=15)
except Exception as e:
    raise SystemExit(f"Login page request failed: {e}")

show("login status", r.status_code)
show("final URL", r.url)
show("server header", r.headers.get("Server"))
show("cf-ray (Cloudflare)", r.headers.get("CF-RAY"))
show("cookies set", list(s.cookies.keys()))
show("content length", len(r.text))

html = r.text
soup = BeautifulSoup(html, "html.parser")

# 3. Is it Moodle?
show("looks like Moodle", bool(re.search(r"moodle|M\.cfg", html, re.I)))
m = re.search(r'"version":"(\d+)"', html)
show("Moodle build (if exposed)", m.group(1) if m else "not exposed")

# 4. Is the form in the raw HTML (no JS needed)?
form = soup.find("form", id="login") or soup.find("form", action=re.compile("login"))
show("login form in raw HTML", bool(form))
if form:
    names = [i.get("name") for i in form.find_all("input") if i.get("name")]
    show("form fields", names)
    show("logintoken (CSRF) present", "logintoken" in names)

# 5. Bot protection / captcha / SSO signals
signals = {
    "recaptcha": r"recaptcha|g-recaptcha",
    "hcaptcha": r"hcaptcha",
    "cloudflare challenge": r"cf-challenge|Just a moment|cf_chl",
    "SSO (Microsoft/Google)": r"microsoftonline|accounts\.google|saml|oauth2",
    "JS required notice": r"enable javascript",
}
for name, pat in signals.items():
    show(name, bool(re.search(pat, html, re.I)))

# 6. Moodle Mobile web service token endpoint (cleaner than scraping if enabled)
try:
    t = s.get(f"{BASE}/login/token.php", params={"service": "moodle_mobile_app"}, timeout=15)
    show("/login/token.php status", t.status_code)
    show("token endpoint reply", t.text[:150].replace("\n", " "))
except Exception as e:
    show("/login/token.php", f"error: {e}")

try:
    w = s.get(f"{BASE}/webservice/rest/server.php", timeout=15)
    show("/webservice/rest status", w.status_code)
    show("webservice reply", w.text[:150].replace("\n", " "))
except Exception as e:
    show("/webservice/rest", f"error: {e}")
