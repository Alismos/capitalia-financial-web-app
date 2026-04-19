#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: ./update.sh \"/ruta/al/Capitalia v3.html\""
  exit 1
fi

SRC="$1"

if [ ! -f "$SRC" ]; then
  echo "Error: archivo no encontrado: $SRC"
  exit 1
fi

cd "$(dirname "$0")"

cp "$SRC" index.html
git add index.html
git commit -m "update $(date +%Y-%m-%d)"
git push
