#!/usr/bin/env bash
# Sirve el proyecto en http://localhost:8080 con recarga en vivo y abre el navegador.
cd "$(dirname "$0")"
if command -v node >/dev/null; then
  node scripts/dev-server.mjs --port 8080 &
  SRV=$!
else
  (command -v python3 >/dev/null && python3 -m http.server 8080 || python -m http.server 8080) &
  SRV=$!
fi
sleep 1
(command -v xdg-open >/dev/null && xdg-open http://localhost:8080) || open http://localhost:8080
wait $SRV
