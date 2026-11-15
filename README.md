# Prompt-Studio

Privates Power-User-Studio zum Bauen von Prompts. Nicht öffentlich, kein SEO, keine Rechtstexte.

- **Sofort-Modus:** deterministischer Prompt-Builder im Browser, ohne Netzwerk.
- **KI-Turbo:** „Mit Claude verfeinern“ erzeugt Varianten über die Anthropic Messages API
  (`output_config.format` mit JSON-Schema). Der API-Key liegt nur in der `.env` auf dem Server.
- **Persistenz:** Presets, Bausteine, Favoriten und Verlauf liegen in `data/store.json` auf dem
  Server, mit automatischen Backups sowie Export und Import.
- **Passwortschutz:** Basic Auth im Node-Server selbst. Ohne `AUTH_PASSWORD` startet er nicht.

## Kategorien

| Kategorie            | Ausgaben                    | Besonderheit                                                             |
| -------------------- | --------------------------- | ------------------------------------------------------------------------ |
| Stock & KI-Foto      | Prompt, Negative Prompt     | Batch-Modus (5 Varianten), Stock-Seller (Titel + 25 Keywords, nur Turbo) |
| Video & Motion       | Prompt, Negative Prompt     | Start-/End-Frame-Logik, Bewegungsintensität                              |
| Musik & Songwriting  | Style-Prompt, Lyrics, Titel | Lyrics-Gerüst mit Suno-Metatags, Zeichenzähler 200/1000                  |
| Coding & Architektur | Auftrag (XML)               | `<auftrag>`, `<kontext>`, `<anforderungen>`, …                           |
| Universal & Meta     | Prompt                      | Rohe Idee → strukturierter Prompt                                        |

### Neue Kategorie ergänzen

Eine Datei `src/categories/<name>.ts` anlegen, die eine `CategoryDef` als Default exportiert.
Sie wird automatisch geladen (`import.meta.glob`), es ist keine weitere Registrierung nötig.

```ts
import type { CategoryDef } from '../types'
import { str } from './helpers'

const category: CategoryDef = {
  id: 'mein-modul', // a–z, Ziffern, Bindestrich
  label: 'Mein Modul',
  description: 'Wofür es gut ist',
  order: 60, // Position in der Leiste
  fields: [{ id: 'idea', type: 'textarea', label: 'Idee' }],
  outputs: [{ key: 'prompt', label: 'Prompt', primary: true }],
  build: (values) => ({ prompt: str(values, 'idea') }),
  ai: { system: 'You are …' },
}

export default category
```

Feldtypen: `text`, `textarea`, `combo` (Freitext mit Vorschlägen), `chips` (Mehrfachauswahl),
`slider`, `toggle`, `sections` (Liste aus Tag + Text). Die Typen stehen in `src/types.ts`.
`build()` muss rein sein. Ein Test in `tests/client/categories.spec.ts` prüft jede Kategorie
automatisch auf doppelte IDs und fehlende Ausgaben.

## Lokal entwickeln

```bash
npm install
cp .env.example .env      # AUTH_DISABLED=true setzen, optional ANTHROPIC_API_KEY
npm run dev               # Frontend http://127.0.0.1:5177, API auf Port 3022
npm test
npm run lint
npm run build && npm start
```

## Tastenkürzel

| Kürzel       | Aktion                        |
| ------------ | ----------------------------- |
| `Strg+Enter` | Mit Claude verfeinern         |
| `Alt+C`      | Haupt-Prompt kopieren         |
| `Strg+S`     | Preset benennen und speichern |
| `Esc`        | Favoriten/Verlauf schliessen  |

`Alt+C` statt `Strg+Shift+C`, weil der Browser dieses Kürzel für die Entwicklertools belegt.

## Betrieb auf dem VPS

Zielbild: `https://kodinitools.com/promptgenerator/` → Nginx → `127.0.0.1:3022` (PM2, `/opt/prompt-studio`).

### 1. Ersteinrichtung auf dem Server (einmalig)

```bash
# Port frei? Erwartet: "Port frei"
ss -tlnp | grep -q ':3022 ' && echo "PORT BELEGT - anderen Port in .env und Nginx-Snippet waehlen" || echo "Port frei"

mkdir -p /opt/prompt-studio && cd /opt/prompt-studio
umask 077
read -rs -p 'App-Passwort (mind. 12 Zeichen, ohne einfaches Anfuehrungszeichen): ' PW; echo
read -rs -p 'Anthropic-API-Key: ' KEY; echo
printf "AUTH_USER=kodini\nAUTH_PASSWORD='%s'\nANTHROPIC_API_KEY='%s'\nANTHROPIC_MODEL=claude-sonnet-5-5\nPORT=3022\n" "$PW" "$KEY" > .env
unset PW KEY
chmod 600 .env && stat -c '%a %n' .env      # erwartet: 600
```

Die beiden `read`-Zeilen einzeln einfügen, sonst verschluckt die Passwortabfrage die Folgezeile.

### 2. Deployment (bei jeder neuen Version)

**Variante A – direkt auf dem Server** (aus einem Git-Klon, einmalig anlegen):

```bash
cd ~ && git clone https://github.com/KodiniTools/KodiniTools-Prompt-Studio.git   # nur beim ersten Mal
cd ~/KodiniTools-Prompt-Studio && ./deploy/deploy.sh
```

Das Skript holt den aktuellen Stand (`git pull --ff-only`), baut und testet im Klon, installiert
nach `/opt/prompt-studio`, lädt in PM2 nur `prompt-studio` neu und prüft `/health` sowie den
Passwortschutz. Schlägt Pull, Test oder Build fehl, bleibt die laufende Installation unverändert.
Optionen: `--skip-tests`, `--no-pull`. Der Klon darf nicht in `/opt/prompt-studio` liegen.

**Variante B – von Windows:**

```powershell
.\deploy\deploy.ps1 -Server root@kodinitools.com
```

Das Skript baut lokal, lädt ein Archiv hoch, installiert die Laufzeit-Abhängigkeiten, startet
PM2 neu und prüft `/health` sowie den Passwortschutz.

In beiden Varianten bleiben `.env` und `data/` unberührt.

Nach dem ersten Deployment einmal auf dem Server: `pm2 save`

### 3. Nginx einbinden (einmalig)

```bash
cp /opt/prompt-studio/deploy/nginx/promptgenerator.conf /etc/nginx/snippets/promptgenerator.conf

F=$(readlink -f /etc/nginx/sites-enabled/kodinitools.com)
[ "$(grep -c 'PORT: 3018: BILD-STUDIO-APP' "$F")" = "1" ] && ! grep -q 'promptgenerator.conf' "$F" \
  && echo "OK: $F" || echo "STOPP"
```

Nur bei `OK` weiter:

```bash
cp "$F" /root/nginx-kodinitools.com.bak-promptstudio
sed -i '/PORT: 3018: BILD-STUDIO-APP/i\    include /etc/nginx/snippets/promptgenerator.conf;' "$F"
nginx -t && systemctl reload nginx || { cp /root/nginx-kodinitools.com.bak-promptstudio "$F"; echo "FEHLER - ZURUECKGESETZT"; }
```

### 4. Kontrolle

```bash
B=https://kodinitools.com/promptgenerator
echo "--- ohne Anmeldung: erwartet 401, 401, 401"
for p in / /api/store /api/status; do curl -s -o /dev/null -w '%{http_code}\n' "$B$p"; done
echo "--- Health: erwartet 200"
curl -s -o /dev/null -w '%{http_code}\n' "$B/health"
```

Mit Anmeldung im Browser öffnen: Benutzer `kodini`, Passwort aus der `.env`.

## Sicherheit

- **Passwort im Server, nicht in Nginx.** Der Schutz reist mit dem Code und geht nicht verloren,
  wenn eine Nginx-Datei überschrieben wird. Alles ausser `/health` verlangt die Anmeldung.
- **Fehlversuche:** Nach zehn falschen Passwörtern von einer Adresse ist diese 15 Minuten gesperrt.
- **Kein Start ohne Passwort:** `AUTH_PASSWORD` muss mindestens zwölf Zeichen haben.
  `AUTH_DISABLED=true` ist nur für die lokale Entwicklung gedacht.
- **API-Key:** steht nur in `.env` (Rechte 600), nie im Frontend-Bundle, nie in der PM2-Konfiguration.
  Die `.env` überstimmt geerbte Umgebungsvariablen.
- **Empfohlen:** in der Anthropic-Konsole ein eigenes Ausgabenlimit für diesen Key setzen.

## Daten und Backups

- `data/store.json`: aktueller Stand, atomar geschrieben.
- `data/backups/`: höchstens ein Backup pro Stunde, die letzten zehn bleiben. Ein Import legt immer eines an.
- **Export/Import** im Kopf der App: vollständige JSON-Datei, für Sicherungen ausserhalb des Servers.
- Mehrere Geräte: Jede Speicherung trägt eine Revisionsnummer. Bei gleichzeitiger Änderung gewinnt
  das zuerst gespeicherte Gerät, das andere lädt neu und zeigt einen Hinweis.
- Der Arbeitsentwurf (aktuelle Formularwerte) liegt zusätzlich im Browser, pro Gerät.

Wiederherstellen: `cp data/backups/store-<zeit>.json data/store.json && pm2 restart prompt-studio`

## Bekannte Grenzen und Annahmen

- **Der Turbo-Aufruf gegen die echte Anthropic-API ist nicht live getestet**, nur gegen einen
  nachgebildeten Client. Request-Form und Fehlerbehandlung folgen der Dokumentation.
- **`deploy.ps1` ist nicht auf Windows ausgeführt worden.** Es setzt `npm`, `tar`, `ssh` und `scp`
  im Pfad voraus (bei Windows 10/11 vorhanden).
- **Keyword-Anzahl:** Das JSON-Schema kann „genau 25“ nicht erzwingen. Der Server prüft nach,
  fordert einmal eine Korrektur an und zeigt sonst eine Warnung.
- **Suno-Limits:** Style 200 oder 1000 Zeichen (umschaltbar). Das Lyrics-Limit von 5000 Zeichen ist
  eine Annahme und steht als Konstante in `src/categories/suno-music.ts`.
- **Token-Zähler:** Schätzung mit rund vier Zeichen pro Token.

## Aufbau

```
src/categories/   Kategorien (eine Datei pro Modul) + Registry
src/stores/       studio (Arbeitszustand), library (dauerhafte Daten)
src/components/   Formular, Vorschau, Bausteine, Favoriten/Verlauf
shared/           Datenverträge (Zod), von Client und Server genutzt
server/           Express: Auth, Store, Claude-Proxy
deploy/           Nginx-Snippet, PM2-Konfiguration, Deployment (deploy.sh, deploy.ps1)
tests/            Vitest: Kategorien, Stores, Server
```
