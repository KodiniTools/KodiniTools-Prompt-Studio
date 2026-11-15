#!/usr/bin/env bash
#
# Deployment direkt auf dem VPS, aus einem Git-Klon dieses Repos heraus.
#
#   cd ~/KodiniTools-Prompt-Studio && ./deploy/deploy.sh
#
# Ablauf: git pull -> npm ci -> Tests -> Build -> Installation nach /opt/prompt-studio
# -> PM2 neu laden -> /health und Passwortschutz pruefen.
#
# - Gebaut wird im Klon. Schlaegt Pull, Test oder Build fehl, bleibt die laufende
#   Installation unveraendert.
# - .env und data/ im Zielverzeichnis werden nie angefasst.
# - Nginx wird nicht angefasst (einmalige Einbindung: siehe README).
#
# Optionen:
#   --skip-tests   Tests ueberspringen
#   --no-pull      Stand des Klons unveraendert bauen (kein git pull)

set -euo pipefail

# Muss zu "cwd" in deploy/ecosystem.config.cjs passen. Die Variable dient nur Tests.
APP_DIR="${PROMPT_STUDIO_DIR:-/opt/prompt-studio}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

SKIP_TESTS=false
PULL=true
for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=true ;;
    --no-pull) PULL=false ;;
    -h | --help)
      sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unbekannte Option: $arg (erlaubt: --skip-tests, --no-pull)" >&2
      exit 2
      ;;
  esac
done

step() { printf '\n==> %s\n' "$1"; }
fail() {
  printf 'FEHLER: %s\n' "$1" >&2
  exit 1
}

# --- Vorpruefung: nichts wird veraendert, bevor alles hier bestanden ist -------
for cmd in git node npm pm2 curl; do
  command -v "$cmd" >/dev/null 2>&1 || fail "'$cmd' ist nicht installiert oder nicht im PATH."
done
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || fail "Node >= 20 noetig, gefunden: $(node -v)."
[ -f "$REPO_DIR/package.json" ] || fail "$REPO_DIR ist kein Prompt-Studio-Repo."
[ "$REPO_DIR" != "$(readlink -m "$APP_DIR")" ] ||
  fail "Der Klon darf nicht im Zielverzeichnis $APP_DIR liegen (z. B. nach ~/KodiniTools-Prompt-Studio klonen)."
[ -f "$APP_DIR/.env" ] ||
  fail "$APP_DIR/.env fehlt. Zuerst die Ersteinrichtung aus dem README ausfuehren."

cd "$REPO_DIR"

if [ "$PULL" = true ]; then
  step 'Aktuellen Stand holen (git pull --ff-only)'
  git pull --ff-only
fi
echo "Stand: $(git log -1 --format='%h %s')"

# --- Bauen im Klon: die laufende Installation ist bis hier unberuehrt ----------
step 'Abhaengigkeiten installieren'
npm ci --no-audit --no-fund

if [ "$SKIP_TESTS" = false ]; then
  step 'Tests'
  npm test
fi

step 'Build'
npm run build
[ -f dist/index.html ] && [ -f dist-server/index.js ] || fail 'Build unvollstaendig (dist/ oder dist-server/ fehlt).'

# --- Installation -------------------------------------------------------------
step "Nach $APP_DIR installieren"
mkdir -p "$APP_DIR/deploy/nginx"
rm -rf "$APP_DIR/dist" "$APP_DIR/dist-server"
cp -r dist dist-server "$APP_DIR/"
cp package.json package-lock.json "$APP_DIR/"
cp deploy/ecosystem.config.cjs "$APP_DIR/deploy/"
cp deploy/nginx/promptgenerator.conf "$APP_DIR/deploy/nginx/"

cd "$APP_DIR"
step 'Laufzeit-Abhaengigkeiten installieren'
npm ci --omit=dev --no-audit --no-fund

step 'PM2 neu laden (nur prompt-studio)'
pm2 startOrReload deploy/ecosystem.config.cjs --update-env

# --- Kontrolle ----------------------------------------------------------------
step 'Kontrolle'
PORT="$(grep -E '^PORT=' .env | tail -n 1 | cut -d= -f2 | tr -d "[:space:]'\"" || true)"
PORT="${PORT:-3022}"

health=''
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if health="$(curl -fsS --max-time 3 "http://127.0.0.1:$PORT/health" 2>/dev/null)"; then break; fi
  sleep 1
done
[ -n "$health" ] ||
  fail "Kein /health auf Port $PORT. Ursache ansehen: pm2 logs prompt-studio --lines 20 --nostream"
echo "Health: $health"

code="$(curl -s -o /dev/null --max-time 5 -w '%{http_code}' "http://127.0.0.1:$PORT/api/store" || true)"
[ "$code" = '401' ] || fail "Passwortschutz: 401 erwartet, erhalten: $code."
echo "Ohne Anmeldung: $code"

printf '\nFertig. Nach dem ersten Deployment einmal: pm2 save\n'
