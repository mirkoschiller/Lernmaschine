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

### Option A: Open directly

1. Clone or download the repository  
2. Open `index.html` in your browser  

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
- Create and name your classes  
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

### Tips for better results:
- Use a balanced number of images per class  
- Include varied perspectives  
- Ensure consistent lighting conditions  

---

## 📄 License

This project is licensed under the terms specified in the `LICENSE` file.
