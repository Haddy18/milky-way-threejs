#!/usr/bin/env bash
# scripts/deploy.sh — sube el sitio estático al VPS (http://…/milky-way/).
#
# Espejo local de lo que haría CI: lee .env (gitignored; ver .env.example),
# valida la config, y solo envía lo que necesita el navegador. El despliegue
# es atómico: se extrae en <ruta>.tmp y se intercambia, así que el sitio
# nunca queda a medias y un fallo de subida no toca lo que ya está en pie.
#
# Las credenciales NO viven en este repo: las aporta VPS_SSH (en local, el
# helper del escritorio); con VPS_SSH vacío se usa ssh con clave (CI).
#
# Uso:
#   scripts/deploy.sh            despliega
#   scripts/deploy.sh --dry-run  qué se enviaría, sin tocar nada
set -euo pipefail
cd "$(dirname "$0")/.."

# .env alimenta solo a este script; quitamos CR por si alguien lo editó en Windows.
if [ -f .env ]; then set -a; . <(tr -d '\r' < .env); set +a; fi

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

missing=""
for var in VPS_HOST VPS_USER VPS_SSH_PORT VPS_DEPLOY_PATH; do
  [ -n "${!var:-}" ] || missing="$missing $var"
done
if [ -n "$missing" ]; then
  echo "ERROR: faltan variables:$missing" >&2
  echo "       cp .env.example .env   # y rellena" >&2
  exit 1
fi

case "$VPS_DEPLOY_PATH" in
  /*) ;;
  *) echo "ERROR: VPS_DEPLOY_PATH debe ser una ruta absoluta del VPS" >&2; exit 1 ;;
esac
case "$VPS_DEPLOY_PATH" in
  "/"|"/root"|"/var" |"/var/www"|"/var/www/html")
    echo "ERROR: ruta de despliegue no permitida: $VPS_DEPLOY_PATH" >&2; exit 1 ;;
esac

# Acceso al VPS: helper local (con credenciales) o ssh con clave (CI).
# En modo CI la clave la aporta VPS_SSH_KEY (por defecto la de despliegues de
# GitHub Actions) y el host key está fijado en .github/known_hosts: una clave
# cambiante en el servidor rompe el despliegue, no lo acepta a ciegas.
run_remote() {
  local cmd=$1
  if [ -n "${VPS_SSH:-}" ]; then
    bash -c "$VPS_SSH \"\$@\"" _ "$cmd"
  else
    ssh -i "${VPS_SSH_KEY:-$HOME/.ssh/github-actions-deploy}" \
        -o BatchMode=yes -o StrictHostKeyChecking=yes \
        -o UserKnownHostsFile=.github/known_hosts \
        -p "$VPS_SSH_PORT" "$VPS_USER@$VPS_HOST" "$cmd"
  fi
}

# Solo lo que el navegador necesita; .git, .env, scripts, README y los
# catálogos crudos (data/raw/, que pesan cientos de MB) no viajan.
SHIP=(index.html css js vendor data)

# tar no lee .gitignore: sin --exclude, data/raw/ viajaría entero.
tar_ship() { tar -czf - --exclude='data/raw' "${SHIP[@]}"; }

echo "▸ destino  $VPS_USER@$VPS_HOST:$VPS_SSH_PORT → $VPS_DEPLOY_PATH"
echo "▸ acceso   ${VPS_SSH:-ssh (clave)}"

if $DRY_RUN; then
  echo "▸ dry-run: nada se envía, esto es lo que viajaría:"
  tar_ship | tar -tzvf - | sed 's/^/    /'
  exit 0
fi

P="$VPS_DEPLOY_PATH"

echo "▸ subiendo…"
tar_ship | run_remote \
  "rm -rf '$P.tmp' && mkdir -p '$P.tmp' && tar -xzf - -C '$P.tmp' && chmod -R a+rX '$P.tmp' && echo '  recibido OK'"

echo "▸ intercambiando…"
run_remote \
  "rm -rf '$P.old'; if [ -d '$P' ]; then mv '$P' '$P.old'; fi; mv '$P.tmp' '$P'; rm -rf '$P.old'; ls '$P'"

# Verificación real: la URL pública tiene que responder, también los datos
# (stars.bin pesa 3,3 MB, así que comprobamos un fichero pequeño de data/).
if [ -n "${SITE_URL:-}" ]; then
  ok=true
  for u in "$SITE_URL" "${SITE_URL}js/main.js" "${SITE_URL}vendor/three/build/three.module.js" "${SITE_URL}data/names.txt"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$u" || echo 000)
    printf '  %-64s %s\n' "$u" "$code"
    [ "$code" = "200" ] || ok=false
  done
  if $ok; then
    echo "✓ desplegado y verificado: $SITE_URL"
  else
    echo "ERROR: el sitio no responde como debe; mira nginx (alias /milky-way/)" >&2
    exit 1
  fi
else
  echo "✓ desplegado (sin SITE_URL configurada, verificación omitida)"
fi
