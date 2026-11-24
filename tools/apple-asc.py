#!/usr/bin/env python3
"""App Store Connect checks for #1110. Reads KEY_ID, ISSUER_ID and KEY_P8 from the
environment, never prints them. Exit 0 ok, 1 a request failed, 2 cannot test."""
import json, os, sys, time, urllib.request, urllib.error
import jwt

BUNDLE = "io.github.choganhq.chogan"
API = "https://api.appstoreconnect.apple.com"


def token():
    need = [k for k in ("KEY_ID", "ISSUER_ID", "KEY_P8") if not os.environ.get(k)]
    if need:
        print("missing environment: " + ", ".join(need))
        sys.exit(2)
    now = int(time.time())
    return jwt.encode(
        {"iss": os.environ["ISSUER_ID"], "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"},
        os.environ["KEY_P8"],
        algorithm="ES256",
        headers={"kid": os.environ["KEY_ID"], "typ": "JWT"},
    )


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None)
    req.add_header("Authorization", "Bearer " + token())
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def show(label, status, data):
    print(f"{label}: HTTP {status}")
    for err in data.get("errors", []):
        print("  error:", err.get("code"), err.get("title"), "-", err.get("detail"))


def bundles():
    s, d = call("GET", "/v1/bundleIds?limit=200")
    show("bundle ids", s, d)
    return s, [b["attributes"]["identifier"] for b in d.get("data", [])]


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    s, d = call("GET", "/v1/apps?limit=200")
    show("apps", s, d)
    if s != 200:
        sys.exit(1)
    print("apps:", [a["attributes"]["bundleId"] for a in d["data"]])
    s, ids = bundles()
    if s != 200:
        sys.exit(1)
    print("bundle ids:", ids)
    if mode == "register-bundle" and BUNDLE not in ids:
        s, d = call("POST", "/v1/bundleIds", {"data": {"type": "bundleIds", "attributes": {
            "identifier": BUNDLE, "name": "Chogan", "platform": "IOS"}}})
        show("register " + BUNDLE, s, d)
        if s not in (200, 201):
            sys.exit(1)
        s, ids = bundles()
        if BUNDLE not in ids:
            print("registered bundle id not read back")
            sys.exit(1)
    print("bundle id present:", BUNDLE in ids)


main()
