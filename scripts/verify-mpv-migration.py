"""Recheck a built migration APK/AAR and emit machine-readable evidence."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("apk", type=Path)
parser.add_argument("aar", type=Path, help="Relocated libmpv AAR")
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()

def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()

alignment = subprocess.check_output([sys.executable, str(Path(__file__).with_name("verify-apk-native-alignment.py")), str(args.apk)], text=True).strip()
forbidden = [b"Lorg/videolan/", b"Lexpo/modules/video/", b"LibVlcView", b"HardwareVideoView", b"Media3PlayerActivity"]
with zipfile.ZipFile(args.apk) as archive:
    native = sorted(n for n in archive.namelist() if n.startswith("lib/") and n.endswith(".so"))
    obsolete_entries = [n for n in archive.namelist() if "vlc" in n.lower()]
    if obsolete_entries:
        raise ValueError("Obsolete VLC archive entries: " + ", ".join(obsolete_entries))
    for name in archive.namelist():
        if name.endswith(".dex"):
            data = archive.read(name)
            obsolete_symbols = [symbol.decode("ascii") for symbol in forbidden if symbol in data]
            if obsolete_symbols:
                raise ValueError("Obsolete classes in " + name + ": " + ", ".join(obsolete_symbols))
report = {"artifactScope": "Android debug APK; relocated AAR identity is hash-only", "apkSha256": digest(args.apk), "relocatedAarSha256": digest(args.aar),
          "obsoleteClassesAbsent": True, "alignment": alignment,
          "nativeLibraryCount": len(native), "nativeLibraries": native}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(args.output)
