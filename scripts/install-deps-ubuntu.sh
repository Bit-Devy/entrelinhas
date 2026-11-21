#!/usr/bin/env bash
set -euo pipefail

# Bibliotecas indicadas pelo Tauri 2 para Ubuntu e ferramentas de compilação.
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev gh \
  xdg-desktop-portal xdg-desktop-portal-gnome zenity

if ! command -v cargo >/dev/null && [ ! -x "$HOME/.cargo/bin/cargo" ]; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/entrelinhas-rustup.sh
  sh /tmp/entrelinhas-rustup.sh -y --profile minimal --default-toolchain stable
fi

printf '\nAmbiente preparado. Abra outro terminal ou execute: source "$HOME/.cargo/env"\n'
