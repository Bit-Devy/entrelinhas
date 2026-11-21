#!/usr/bin/env bash
set -euo pipefail

entrelinhas_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
entrelinhas_binary="${1:-$entrelinhas_root/src-tauri/target/release/entrelinhas}"
entrelinhas_data="${XDG_DATA_HOME:-$HOME/.local/share}"
entrelinhas_install="$entrelinhas_data/entrelinhas"

if [ ! -x "$entrelinhas_binary" ]; then
  printf 'Compile primeiro com npm run package. Binário ausente: %s\n' "$entrelinhas_binary" >&2
  exit 1
fi
if [ -e "$entrelinhas_install/bin/entrelinhas" ] && [ ! -f "$entrelinhas_install/installed-by-entrelinhas" ]; then
  printf 'Já existe outro programa no destino. Nenhum arquivo foi substituído.\n' >&2
  exit 1
fi

mkdir -p "$entrelinhas_install/bin" "$entrelinhas_data/applications"
install -m 755 "$entrelinhas_binary" "$entrelinhas_install/bin/entrelinhas.new"
python3 - "$entrelinhas_install" "$entrelinhas_data" "$entrelinhas_root/package.json" <<'PY'
import os, sys, json
from pathlib import Path
installation, data = map(Path, sys.argv[1:3])
version = json.loads(Path(sys.argv[3]).read_text())["version"]
executable = installation / 'bin/entrelinhas'
os.replace(executable.with_name('entrelinhas.new'), executable)
quoted = str(executable).replace('%', '%%').replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$')
content = f'''[Desktop Entry]
Type=Application
Name=Entrelinhas
Comment=Um espaço tranquilo para escrever
Exec="{quoted}" %F
Icon=entrelinhas
Terminal=false
Categories=Utility;Office;TextEditor;
MimeType=text/markdown;text/x-markdown;text/plain;
Keywords=texto;notas;markdown;escrita;
StartupWMClass=entrelinhas
StartupNotify=true
'''
(data / 'applications/entrelinhas.desktop').write_text(content)
(installation / 'installed-by-entrelinhas').write_text(version + '\n')
PY

for entrelinhas_size in 32 64 128; do
  install -Dm 644 "$entrelinhas_root/src-tauri/icons/${entrelinhas_size}x${entrelinhas_size}.png" "$entrelinhas_data/icons/hicolor/${entrelinhas_size}x${entrelinhas_size}/apps/entrelinhas.png"
done
install -Dm 644 "$entrelinhas_root/src-tauri/icons/128x128@2x.png" "$entrelinhas_data/icons/hicolor/256x256/apps/entrelinhas.png"
install -Dm 644 "$entrelinhas_root/assets/icon.svg" "$entrelinhas_data/icons/hicolor/scalable/apps/entrelinhas.svg"
if command -v update-desktop-database >/dev/null; then update-desktop-database "$entrelinhas_data/applications"; fi
if command -v gtk-update-icon-cache >/dev/null; then gtk-update-icon-cache -f -t "$entrelinhas_data/icons/hicolor" >/dev/null; fi
printf 'Entrelinhas instalado no menu de aplicativos.\nExecutável: %s\n' "$entrelinhas_install/bin/entrelinhas"
