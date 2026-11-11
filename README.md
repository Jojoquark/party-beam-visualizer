# BEAM // Party Audio Visualiser

Echtzeit-Audio-Visualiser auf reinem Tiefschwarz (`#000000`) mit minimaler Latenz fuer Beamer, iPad, iPhone und Desktop.

## Funktionen

- **Minimales Delay**: `AudioContext({ latencyHint: 'interactive' })`, `fftSize = 1024`, Roh-PCM-Transientenanalyse und deaktivierte Browser-Sprachfilter (`echoCancellation`, `noiseSuppression`, `autoGainControl` aus).
- **8 Beamer-optimierte Szenen**:
  - *Laser / Nebel*: Scanner-Faecher, Laser-Tunnel, Radial-Kegel, Horizont & Matrix
  - *Wand / Raum*: Bass-Schockwellen, Kaleidoskop-Prism, Hyperraum-Vortex, Frequenz-Geometrie
- **Party-Autopilot & Auto-Gain**: Passt sich automatisch an leise und laute Musik an, unterscheidet Vocals/Pausen von Bass-Drops und wechselt taktsynchron Szenen und Farbpaletten.
- **00:00 Uhr Countdown & Happy Birthday**: Zielzeit (Standard `00:00`) + Vorlaufzeit (Standard `30s`) scharfstellen oder sofort starten; zeigt um Null Uhr beat-reaktiven Text mit Partikel-Explosion an.
- **Beamer-Werkzeuge**: Master-Dimmer, Blackout, X/Y-Spiegelung (Rueckprojektion/Decke), Zoom, Rand-Masken (Vignette/Kreis/Rahmen), Safe Mode (ohne Strobe), Screen-Wake-Lock und eingebauter 126-BPM-Test-Beat.

## Starten auf iPad, iPhone & Beamer

iOS Safari erlaubt Mikrofonzugriff nur ueber **HTTPS** (oder `localhost`).

### Option 1: Lokal im Heim-WLAN testen (Windows)
1. `start-party.bat` doppelklicken (oder `node server.mjs` im Ordner ausfuehren).
2. Am iPad/iPhone die angezeigte `https://<DEINE-WLAN-IP>:8443` Adresse in Safari oeffnen.
3. Bei der lokalen Zertifikats-Meldung einmal auf **Details anzeigen → Diese Website besuchen** tippen.
4. In Safari ueber **Teilen → Zum Home-Bildschirm** installieren (startet danach als offline-faehige Vollbild-App ohne Adressleiste!).

### Option 2: Dauerhaftes kostenloses HTTPS-Hosting
Den kompletten Ordner einfach auf **GitHub Pages**, **Cloudflare Pages** oder **Netlify** hochladen. Nach dem ersten Oeffnen ist die App ueber den Service Worker (`sw.js`) auch komplett ohne Internet nutzbar.

## Tastenkuerzel (Desktop / iPad mit Tastatur)

- `Leertaste`: Blackout an/aus
- `Pfeil Links / Rechts`: Vorherige / Naechste Szene
- `C`: Farbpalette wechseln
- `A`: Autopilot an/aus
- `S` (halten): Manueller Strobe (wenn Safe Mode aus)
- `F`: Vollbild
- `H`: Steuerleiste ein-/ausblenden
