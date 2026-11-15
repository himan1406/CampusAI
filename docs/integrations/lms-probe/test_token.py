"""
Try the Moodle mobile web service token flow once.
Run:  python test_token.py
Credentials are typed at runtime and never stored.
"""
import getpass
import requests

BASE = "https://lms.bennett.edu.in"

username = input("LMS username: ").strip()
password = getpass.getpass("LMS password: ")

# 1. Request a token
r = requests.post(
    f"{BASE}/login/token.php",
    data={"username": username, "password": password, "service": "moodle_mobile_app"},
    timeout=20,
)
data = r.json()

if "token" not in data:
    print("No token returned. Server said:")
    print(data)
    raise SystemExit(1)

token = data["token"]
print("Got a token (not printing it).")


def call(fn, **params):
    res = requests.post(
        f"{BASE}/webservice/rest/server.php",
        data={"wstoken": token, "wsfunction": fn, "moodlewsrestformat": "json", **params},
        timeout=20,
    )
    return res.json()


# 2. Who am I?
info = call("core_webservice_get_site_info")
print("Site:", info.get("sitename"))
print("User:", info.get("fullname"), "| userid:", info.get("userid"))

# 3. My courses
if "userid" in info:
    courses = call("core_enrol_get_users_courses", userid=info["userid"])
    if isinstance(courses, list):
        print(f"\n{len(courses)} courses:")
        for c in courses:
            print(f" - [{c['id']}] {c['fullname']}")
    else:
        print("Courses call failed:", courses)
