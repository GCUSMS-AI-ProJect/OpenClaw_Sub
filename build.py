#!/usr/bin/env python3
"""Build a release from the explicitly bundled files, never from personal state."""
from pathlib import Path
import hashlib, json, tarfile
ROOT = Path(__file__).resolve().parent
NAME = 'OpenClaw-Personal-2026.10.5-Linux-amd64'
files = []
for name in ['install.sh', 'install.py', 'README.md', '安装说明.txt', 'build.py', 'GITEA.md', 'INSPECTION.md']:
    files.append(ROOT / name)
for name in ['customizations', 'avatars', 'docs', 'licenses', 'packages']:
    files += [p for p in (ROOT / name).rglob('*') if p.is_file() and p.suffix not in ('.pyc',) and p.name != 'index.html.original']
files.append(ROOT / 'runtime.tar.gz')
for p in files:
    if not p.is_file():
        raise SystemExit('Missing release input: ' + str(p))
def sha(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda: f.read(1024*1024), b''): h.update(chunk)
    return h.hexdigest()
manifest = ROOT / 'checksums.json'
manifest.write_text(json.dumps({str(p.relative_to(ROOT)): sha(p) for p in sorted(files)}, indent=2, ensure_ascii=False) + '\n')
output = ROOT / 'dist'
output.mkdir(exist_ok=True)
archive = output / (NAME + '.tar.gz')
with tarfile.open(archive, 'w:gz') as tar:
    for p in sorted(files + [manifest]):
        tar.add(p, arcname=NAME + '/' + str(p.relative_to(ROOT)), recursive=False)
(output / (archive.name + '.sha256')).write_text(sha(archive) + '  ' + archive.name + '\n')
print(archive)
