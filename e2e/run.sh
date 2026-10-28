#!/bin/sh
# Ejecuta el recorrido de humo contra el contenedor `web` (docker compose up web), todo en Docker.
set -e
cd "$(dirname "$0")/.."
TARGET="${TARGET:-costea-web-1}"
docker run --rm --network "container:$TARGET" -e BASE_URL -e GITHUB_PAGES -v "$PWD/e2e:/e2e" -v "$PWD/e2e/screenshots:/out" \
  -w /tmp/pw mcr.microsoft.com/playwright:v1.64.1-noble \
  sh -c "npm init -y >/dev/null && npm i --no-audit --no-fund playwright@1.64.1 >/dev/null && cp /e2e/smoke.mjs . && node smoke.mjs"
