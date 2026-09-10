"""Package pinned corresponding media sources for the same GitHub release as the APK."""
import hashlib
import json
from pathlib import Path
import shutil
import sys
import subprocess
import tempfile
import urllib.request
import zipfile

root = Path(__file__).resolve().parents[1]
output = Path(sys.argv[1]).resolve()
output.mkdir(parents=True, exist_ok=True)
manifest = root / 'scripts/media-source-manifest.json'
entries = json.loads(manifest.read_text(encoding='utf-8'))
for entry in entries:
    destination = output / entry['name']
    if 'git' in entry:
        with tempfile.TemporaryDirectory() as checkout:
            subprocess.run(['git', 'init', '-q', checkout], check=True)
            subprocess.run(['git', '-C', checkout, 'fetch', '--depth=1', entry['git'], entry['commit']], check=True)
            commit = subprocess.check_output(['git', '-C', checkout, 'rev-parse', 'FETCH_HEAD'], text=True).strip()
            if commit != entry['commit']:
                raise RuntimeError('Source commit mismatch: ' + entry['name'])
            subprocess.run(['git', '-C', checkout, 'archive', '--format=tar.gz', '--prefix=' + entry['directory'] + '/',
                            '--output=' + str(destination), commit], check=True)
        continue
    if not destination.exists():
        with urllib.request.urlopen(entry['url'], timeout=180) as response, destination.open('wb') as file:
            shutil.copyfileobj(response, file)
    if hashlib.sha256(destination.read_bytes()).hexdigest() != entry['sha256']:
        raise RuntimeError('Source archive hash mismatch: ' + entry['name'])

with zipfile.ZipFile(output / 'AutoDL-media-sources.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for entry in entries:
        archive.write(output / entry['name'], entry['name'])
    archive.write(manifest, 'source-manifest.json')
    archive.write(root / 'mobile/android/VIDEO_COMPATIBILITY.md', 'BUILD-AND-PROVENANCE.md')
    archive.write(root / 'mobile/android/LIBVLC.md', 'LIBVLC-BUILD-AND-PROVENANCE.md')
    for file in (root / 'mobile/android/app/src/main/assets/licenses').iterdir():
        archive.write(file, 'licenses/' + file.name)
print(output / 'AutoDL-media-sources.zip')
