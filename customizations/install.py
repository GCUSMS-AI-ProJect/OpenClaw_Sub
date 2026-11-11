"""Install the local UI extension without changing vendor JavaScript bundles."""
from pathlib import Path
import hashlib
import re
import shutil

SOURCE = Path(__file__).resolve().parent
import argparse
parser = argparse.ArgumentParser()
parser.add_argument('--ui-dir', type=Path, required=True)
UI = parser.parse_args().ui_dir.resolve()
index = UI / 'index.html'
revision = hashlib.sha256((SOURCE / 'clear-chat-view.js').read_bytes()).hexdigest()[:12]
tag = f'<script data-cfasync="false" src="./assets/local-clear-chat-view.js?v={revision}"></script>'
text = index.read_text()
existing = re.compile(r'<script data-cfasync="false" src="\./assets/local-clear-chat-view\.js(?:\?v=[a-f0-9]+)?"></script>')
if existing.search(text):
    index.write_text(existing.sub(lambda _: tag, text))
else:
    backup = SOURCE / 'index.html.original'
    if not backup.exists():
        shutil.copy2(index, backup)
    text = text.replace('</head>', f'  {tag}\n  </head>', 1)
    index.write_text(text)
shutil.copy2(SOURCE / 'clear-chat-view.js', UI / 'assets/local-clear-chat-view.js')
print('Installed Ctrl+L clear view / Ctrl+Shift+L restore view extension.')

revision = hashlib.sha256((SOURCE / 'scripted-chat.js').read_bytes()).hexdigest()[:12]
tag = f'<script data-cfasync="false" src="./assets/local-scripted-chat.js?v={revision}"></script>'
text = index.read_text()
existing = re.compile(r'<script data-cfasync="false" src="\./assets/local-scripted-chat\.js(?:\?v=[a-f0-9]+)?"></script>')
if existing.search(text):
    text = existing.sub(lambda _: tag, text)
else:
    text = text.replace('</head>', f'  {tag}\n  </head>', 1)
index.write_text(text)
shutil.copy2(SOURCE / 'scripted-chat.js', UI / 'assets/local-scripted-chat.js')
print('Installed local scripted conversation mode.')

shutil.copy2(SOURCE / "default-user.png", UI / "assets/local-default-user.png")

revision = hashlib.sha256((SOURCE / 'default-user-avatar.js').read_bytes()).hexdigest()[:12]
tag = f'<script data-cfasync="false" src="./assets/local-default-user-avatar.js?v={revision}"></script>'
text = index.read_text()
existing = re.compile(r'<script data-cfasync="false" src="\./assets/local-default-user-avatar\.js(?:\?v=[a-f0-9]+)?"></script>')
if existing.search(text):
    text = existing.sub(lambda _: tag, text)
else:
    text = text.replace('</head>', f'  {tag}\n  </head>', 1)
index.write_text(text)
shutil.copy2(SOURCE / 'default-user-avatar.js', UI / 'assets/local-default-user-avatar.js')
