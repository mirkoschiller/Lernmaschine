# Lernmaschine 🤖

A browser-based learning app that allows you to train your own **image classification model** — entirely **client-side, with no backend required**.

The application uses **TensorFlow.js**, **MobileNet** for feature extraction, and a **K-Nearest Neighbors (KNN) classifier** — all running directly in the browser.

---

## 🚀 Features

- Create up to **5 classes**
- Collect **5–20 images per class**
- Add images via:
  - File upload
  - Live webcam capture
- **In-browser training** (no server required)
- Test your model using:
  - Live webcam
  - Uploaded images
- Modern, responsive user interface
- Classes appear immediately; AI libraries and model weights load on the first training run
- Persistent loading/error messages and retry by starting training again
- Real progress based on processed training images
- Editing training images invalidates the previous training
- Test-image preview, camera start/stop, and camera release when leaving the page

## Rebuild from the original (v1.3)

The original `Lernmaschine.html` supplied by the author is the functional baseline:
collect labeled images → train MobileNet/KNN → test an image or webcam stream.
The previously merged improvements are retained in separate `index.html`, `styles.css`,
and `app.js` files: dark theme, responsive layout, configurable limits, deferred AI
loading, two concurrent image-upload workers, and memory cleanup.

The previous initialization referenced an undefined `clearAllData` callback before
rendering classes. This stopped startup. The rebuild implements reset and initializes
the UI independently of network/model loading. It also fixes premature training-button
activation, concurrent upload overflow, stale classifier labels, duplicated examples
on retraining, missing image/camera error handling, and overlapping live predictions.

MobileNet receives unnormalized pixels and handles its own normalization. Temporary
feature/prediction tensors are disposed. A fresh KNN classifier replaces the old one
only after a successful training run. Uploaded pictures are resized locally to 224×224;
feature vectors are cached during training. There is no model import/export or backend.

---

## ⚙️ Requirements

- A modern browser (Chrome, Edge, Firefox, Safari)
- Camera access (for webcam functionality)
- Internet connection (for CDN imports):
  - `@tensorflow/tfjs`
  - `@tensorflow-models/mobilenet`
  - `@tensorflow-models/knn-classifier`

---

## ▶️ Getting Started

This is a static web application — no build step required.

### Option A: Download

1. Clone or download the repository  
2. Keep `index.html`, `styles.css`, and `app.js` together; use the local web server below for reliable camera access.

### Option B: Run a local web server (recommended)

```bash
python3 -m http.server 8000
```

Then open:

```
http://localhost:8000
```

---

## 🧠 Usage

### 1. Collect Data
- Create and name your classes (image buttons are enabled after entering a name)
- Add at least **5 images per class** via upload or webcam  

### 2. Train the Model
- The **“Train Model”** button becomes active once enough data is available  
- Start training directly in the browser  

### 3. Test the Model
- Use the webcam or upload a test image  
- Predictions are displayed with confidence scores  

---

## ⚠️ Notes

- The model exists **only in the current browser session**  
- Reloading the page will **reset all training data**  
- Images are not uploaded to a server. Library/model downloads require internet access.
- Camera access requires HTTPS (for example GitHub Pages) or localhost and browser permission.
- KNN bars show neighbor vote shares, not calibrated probabilities of correctness.

## Browser regression checks

Install Playwright locally (`npm install --no-save playwright`) and its browser
(`npx playwright install chromium`), then run `node tests/browser.cjs`.
The test starts its own local server and uses real TensorFlow.js, MobileNet and KNN,
with a simulated camera. Internet access to the CDN and model host is required.

Coverage includes startup without AI downloads, class/image limits, damaged uploads,
CDN failure and retry, real training and prediction, repeat training, tensor stability,
camera capture/start/stop, data invalidation, reset, safe labels, and a mobile viewport.

Validated on 2026-10-12 with Chromium 133 and the real CPU backend (`TEST_CPU=1`):
25 training images, a correct prediction for the matching synthetic test image,
unchanged tensor count across 12 further predictions, repeat training retaining
exactly 25 examples, simulated camera capture/live testing, and a 390 px viewport.
The physical camera and hardware WebGL backend still need a check on the target device.

### Tips for better results:
- Use a balanced number of images per class  
- Include varied perspectives  
- Ensure consistent lighting conditions  

---

## 📄 License

This project is licensed under the terms specified in the `LICENSE` file.
