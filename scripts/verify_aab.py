"""Checks the merged manifest of a release AAB (run in CI after bundleRelease).

    python3 scripts/verify_aab.py app-release.aab bundletool.jar frontend/app.json

Fails when the target SDK is below Google Play's requirement, the version code
does not match app.json, a removed permission came back, or the AAB is signed
with the debug key.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

MIN_TARGET_SDK = 36
MIN_SDK = 24
FORBIDDEN = {
    "android.permission.RECORD_AUDIO",
    "android.permission.SYSTEM_ALERT_WINDOW",
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
    "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
    "android.permission.USE_BIOMETRIC",
    "android.permission.USE_FINGERPRINT",
}
FORBIDDEN_COMPONENTS = {"expo.modules.audio.service.AudioControlsService"}


def main() -> int:
    aab, jar, app_json = sys.argv[1:4]
    manifest = subprocess.run(
        ["java", "-jar", jar, "dump", "manifest", f"--bundle={aab}"], check=True, capture_output=True, text=True
    ).stdout
    expected_code = json.loads(Path(app_json).read_text(encoding="utf-8"))["expo"]["android"]["versionCode"]

    def attr(name: str) -> str:
        m = re.search(rf'android:{name}="([^"]+)"', manifest)
        return m.group(1) if m else ""

    version_code = int(attr("versionCode") or 0)
    target = int(attr("targetSdkVersion") or 0)
    min_sdk = int(attr("minSdkVersion") or 0)
    perms = set(re.findall(r'<uses-permission[^>]*android:name="([^"]+)"', manifest))
    components = set(re.findall(r'<(?:service|activity|receiver|provider)[^>]*android:name="([^"]+)"', manifest))

    problems = []
    if version_code != expected_code:
        problems.append(f"versionCode {version_code} != app.json {expected_code}")
    if target < MIN_TARGET_SDK:
        problems.append(f"targetSdk {target} < {MIN_TARGET_SDK}")
    if min_sdk < MIN_SDK:
        problems.append(f"minSdk {min_sdk} < {MIN_SDK}")
    bad = sorted(perms & FORBIDDEN)
    if bad:
        problems.append("forbidden permissions: " + ", ".join(bad))
    bad_components = sorted(components & FORBIDDEN_COMPONENTS)
    if bad_components:
        problems.append("forbidden components: " + ", ".join(bad_components))
    signer = subprocess.run(["keytool", "-printcert", "-jarfile", aab], capture_output=True, text=True).stdout
    if "Android Debug" in signer:
        problems.append("AAB is signed with the debug key")

    print(f"versionCode={version_code} versionName={attr('versionName')} minSdk={min_sdk} targetSdk={target}")
    print(f"AAB size: {Path(aab).stat().st_size / 1_048_576:.1f} MiB")
    print("permissions:")
    for p in sorted(perms):
        print("  ", p)
    if problems:
        print("\nPROBLEMS:")
        for p in problems:
            print("  -", p)
        return 1
    print("\nAAB manifest OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
