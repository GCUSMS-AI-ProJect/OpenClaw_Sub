#!/bin/bash
set -euo pipefail
OPENCLAW_BUNDLE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v python3 >/dev/null; then
    echo '请先安装 Python 3：sudo apt install python3' >&2
    exit 1
fi
exec python3 "$OPENCLAW_BUNDLE_DIR/install.py" "$@"
