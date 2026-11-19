"""Private, isolated signing engine. Not exposed publicly; deploy only behind an authenticated Worker."""
import os
import subprocess
import tempfile
from pathlib import Path
from flask import Flask, jsonify, request, send_file

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 128 * 1024 * 1024

@app.get("/health")
def health():
    return jsonify(status="ready")

@app.post("/sign")
def sign():
    # The Worker must authenticate the user, decrypt the private credentials and
    # call this endpoint over the internal Container binding only.
    if not all(name in request.files for name in ("ipa", "p12", "profile")):
        return jsonify(error="Missing signing materials"), 400
    password = request.form.get("password")
    if password is None:
        return jsonify(error="Missing certificate password"), 400
    with tempfile.TemporaryDirectory(prefix="ipa-") as directory:
        root = Path(directory)
        ipa = root / "input.ipa"
        p12 = root / "certificate.p12"
        profile = root / "profile.mobileprovision"
        output = root / "signed.ipa"
        for field, target in (("ipa", ipa), ("p12", p12), ("profile", profile)):
            request.files[field].save(target)
        if not ipa.read_bytes()[:4] == b"PK\\x03\\x04":
            return jsonify(error="Invalid IPA archive"), 400
        try:
            # zsign -k password is passed as a process argument; isolate the
            # container, never log arguments, and avoid shared multi-user hosts.
            result = subprocess.run(
                ["zsign", "-k", password, "-p", str(p12), "-m", str(profile),
                 "-o", str(output), str(ipa)],
                capture_output=True, text=True, timeout=240, check=False,
            )
        except subprocess.TimeoutExpired:
            return jsonify(error="Signing timed out"), 504
        if result.returncode != 0 or not output.is_file():
            return jsonify(error="Signing failed"), 422
        return send_file(output, mimetype="application/octet-stream",
                         as_attachment=True, download_name="signed.ipa")
