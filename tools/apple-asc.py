#!/usr/bin/env python3
"""App Store Connect checks for #1110. Reads KEY_ID, ISSUER_ID and KEY_P8 from the
environment, never prints them. Exit 0 ok, 1 a request failed, 2 cannot test."""
import base64, json, os, subprocess, sys, time, urllib.request, urllib.error
import jwt

BUNDLE = os.environ.get("IOS_BUNDLE_ID", "io.github.choganhq.chogan.ios")
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


def sign(outdir):
    """Makes a distribution certificate and an App Store profile for the bundle id, because the
    key's role cannot use Xcode's cloud signing (#1110). Writes key.pem, dist.cer and
    app.mobileprovision into outdir and ids.json for cleanup. A run makes its own and removes
    them afterwards, so no private key has to be stored anywhere."""
    os.makedirs(outdir, exist_ok=True)
    key = os.path.join(outdir, "key.pem")
    csr = os.path.join(outdir, "req.csr")
    subprocess.check_call(["openssl", "req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", key,
                           "-out", csr, "-subj", "/CN=Chogan CI/O=Chogan"])
    s, d = call("POST", "/v1/certificates", {"data": {"type": "certificates", "attributes": {
        "certificateType": "IOS_DISTRIBUTION", "csrContent": open(csr).read()}}})
    show("create certificate", s, d)
    if s not in (200, 201):
        sys.exit(1)
    cert_id = d["data"]["id"]
    open(os.path.join(outdir, "dist.cer"), "wb").write(base64.b64decode(d["data"]["attributes"]["certificateContent"]))
    s, d = call("GET", "/v1/bundleIds?filter[identifier]=" + BUNDLE)
    show("find bundle id", s, d)
    bid = next((b["id"] for b in d.get("data", []) if b["attributes"]["identifier"] == BUNDLE), None)
    if not bid:
        call("DELETE", "/v1/certificates/" + cert_id)
        print("bundle id not registered")
        sys.exit(1)
    s, d = call("POST", "/v1/profiles", {"data": {"type": "profiles", "attributes": {
        "name": "Chogan CI " + str(int(time.time())), "profileType": "IOS_APP_STORE"}, "relationships": {
        "bundleId": {"data": {"type": "bundleIds", "id": bid}},
        "certificates": {"data": [{"type": "certificates", "id": cert_id}]}}}})
    show("create profile", s, d)
    if s not in (200, 201):
        call("DELETE", "/v1/certificates/" + cert_id)
        sys.exit(1)
    prof_id = d["data"]["id"]
    open(os.path.join(outdir, "app.mobileprovision"), "wb").write(base64.b64decode(d["data"]["attributes"]["profileContent"]))
    json.dump({"certificate": cert_id, "profile": prof_id, "name": d["data"]["attributes"]["name"]},
              open(os.path.join(outdir, "ids.json"), "w"))
    print("signing assets written")


def unsign(outdir):
    ids = json.load(open(os.path.join(outdir, "ids.json")))
    for kind, path in (("profile", "/v1/profiles/"), ("certificate", "/v1/certificates/")):
        s, d = call("DELETE", path + ids[kind])
        show("delete " + kind, s, d)


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "sign":
        return sign(sys.argv[2])
    if len(sys.argv) > 2 and sys.argv[1] == "unsign":
        return unsign(sys.argv[2])
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
