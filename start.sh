#!/usr/bin/env bash
# Sirve el proyecto en http://localhost:8080 y abre el navegador.
cd "$(dirname "$0")"
(command -v python3 >/dev/null && python3 -m http.server 8080 || python -m http.server 8080) &
sleep 1
(command -v xdg-open >/dev/null && xdg-open http://localhost:8080) || open http://localhost:8080
wait
