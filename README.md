# Lernmaschine 🤖

Eine browserbasierte Lern-App, mit der du **ohne Backend** ein eigenes Bildklassifizierungsmodell trainieren kannst.
Die Anwendung nutzt **TensorFlow.js**, **MobileNet** (Feature-Extraktion) und einen **KNN-Classifier** direkt im Browser.

## Funktionen

- Bis zu **5 Klassen** anlegbar.
- Pro Klasse **5 bis 20 Bilder** sammelbar.
- Bilder pro Klasse über
  - Dateiupload oder
  - Webcam-Aufnahme.
- Training direkt im Browser (kein Server nötig).
- Testen per Live-Webcam oder hochgeladenem Bild.
- Modernes, responsives UI.

## Voraussetzungen

- Ein aktueller Browser (Chrome, Edge, Firefox, Safari).
- Für Webcam-Funktionen: Erlaubnis auf Kamerazugriff.
- Internetverbindung für CDN-Imports von:
  - `@tensorflow/tfjs`
  - `@tensorflow-models/mobilenet`
  - `@tensorflow-models/knn-classifier`

## Projekt starten

Da das Projekt eine statische Webanwendung ist, reicht es, die `index.html` zu öffnen.

### Option A: Direkt öffnen

1. Repository lokal klonen/downloaden.
2. `index.html` im Browser öffnen.

### Option B: Lokaler Webserver (empfohlen)

```bash
python3 -m http.server 8000
```

Dann im Browser öffnen:

```text
http://localhost:8000
```

## Nutzung

1. **Daten sammeln**
   - Klassen benennen/anlegen.
   - Pro Klasse mindestens 5 Bilder hochladen oder per Webcam aufnehmen.
2. **Modell trainieren**
   - Button „Modell trainieren“ wird aktiv, sobald genügend Bilder vorhanden sind.
3. **Modell testen**
   - Webcam-Test starten oder ein einzelnes Bild hochladen.
   - Ergebnisse werden mit Wahrscheinlichkeiten angezeigt.

## Hinweise

- Das Modell wird nur im aktuellen Browser-Kontext gehalten.
- Nach Neuladen der Seite gehen Trainingsdaten verloren.
- Für bessere Ergebnisse helfen:
  - ausgewogene Bildanzahl pro Klasse,
  - unterschiedliche Perspektiven,
  - konsistente Beleuchtung.

## Projektstruktur

```text
.
├── index.html   # Komplette App (UI, Logik)
├── style.css   # Design (Styling)
├── README.md
└── LICENSE
```

## Lizenz

Dieses Projekt steht unter der in `LICENSE` enthaltenen Lizenz.
