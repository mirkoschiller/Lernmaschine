'use strict';

// Rebuilt from the original Lernmaschine.html; the UI never waits for a CDN.
const MAX_CLASSES = 5;
const MIN_IMAGES_PER_CLASS = 5;
const MAX_IMAGES_PER_CLASS = 20;
const TF_LIBRARIES = [
  ['tf', 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js'],
  ['mobilenet', 'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.0/dist/mobilenet.min.js'],
  ['knnClassifier', 'https://cdn.jsdelivr.net/npm/@tensorflow-models/knn-classifier@1.2.2/dist/knn-classifier.min.js']
];
let nextId = 1;
let classes = [];
let classifier = null;
let mobilenetModel = null;
let modelPromise = null;
let busy = false;
let trained = false;
let liveSession = null;
let captureSession = null;
let predictionTask = Promise.resolve();
let lastConfidences = null;
const $ = id => document.getElementById(id);
const newClass = () => ({id: String(nextId++), name: '', images: []});

function status(message, type = 'info', target = 'app-status') {
  $(target).textContent = message;
  $(target).className = `status-message status-${type}`;
}
function report(error, target = 'app-status') {
  console.error(error);
  status(error.message || 'Die Aktion konnte nicht abgeschlossen werden.', 'error', target);
}
function setProgress(value) {
  $('training-progress').style.width = `${value}%`;
  $('training-progress').parentElement.setAttribute('aria-valuenow', String(value));
}
function validData() {
  return classes.length >= 2 && classes.every(c => c.name.trim() && c.images.length >= MIN_IMAGES_PER_CLASS);
}
function updateControls() {
  const locked = busy || Boolean(captureSession);
  $('add-class-btn').disabled = locked || classes.length >= MAX_CLASSES;
  $('clear-data-btn').disabled = locked;
  $('train-btn').disabled = locked || !validData();
  $('webcam-btn').disabled = locked || !trained;
  $('test-upload-btn').disabled = locked || !trained;
  $('webcam-btn').textContent = liveSession ? 'Live stoppen' : 'Test via Webcam';
  $('webcam-btn').className = liveSession ? 'btn btn-danger' : 'btn btn-primary';
  for (const c of classes) {
    const card = $(`class-${c.id}`);
    if (!card) continue;
    card.querySelector('.class-name').disabled = locked;
    card.querySelector('[data-action="remove"]').disabled = locked || classes.length <= 2;
    for (const button of card.querySelectorAll('[data-action="upload"], [data-action="capture"]')) {
      button.disabled = locked || !c.name.trim() || c.images.length >= MAX_IMAGES_PER_CLASS;
    }
    card.querySelectorAll('.preview-delete').forEach(button => button.disabled = locked);
  }
}
function renderClasses() {
  $('classes-container').replaceChildren();
  classes.forEach((c, index) => {
    const card = document.createElement('div');
    card.className = 'class-container';
    card.id = `class-${c.id}`;
    // Only generated IDs enter markup; user-supplied names use DOM properties.
    card.innerHTML = `<div class="class-header">
      <input class="class-name" maxlength="60" aria-label="Name der Klasse ${index + 1}" placeholder="Klasse ${index + 1} benennen">
      <span class="image-count"></span>
      <button class="btn btn-danger" data-action="remove" aria-label="Klasse ${index + 1} löschen">×</button>
    </div><div class="upload-area">
      <input type="file" accept="image/*" multiple class="hidden" id="upload-${c.id}">
      <button class="btn btn-secondary" data-action="upload">📁 Hochladen</button>
      <button class="btn btn-secondary" data-action="capture">📸 Webcam</button>
    </div><div class="image-preview"></div>`;
    const name = card.querySelector('.class-name');
    name.value = c.name;
    name.addEventListener('input', () => {
      c.name = name.value;
      // Labels are independent of the stable classifier IDs.
      if (!c.name.trim()) invalidate();
      if (lastConfidences) displayResults(lastConfidences);
      updateControls();
    });
    card.querySelector('.image-count').textContent = `${c.images.length} / ${MAX_IMAGES_PER_CLASS} Bilder`;
    card.querySelector('[data-action="remove"]').onclick = () => {
      if (busy || classes.length <= 2) return;
      invalidate();
      classes = classes.filter(item => item !== c);
      renderClasses();
    };
    const input = card.querySelector('input[type="file"]');
    card.querySelector('[data-action="upload"]').onclick = () => input.click();
    input.onchange = () => uploadImages(c, input);
    card.querySelector('[data-action="capture"]').onclick = () => startCapture(c);
    c.images.forEach((sample, i) => {
      const button = document.createElement('button');
      button.className = 'preview-delete';
      button.title = 'Bild löschen';
      button.setAttribute('aria-label', `Bild ${i + 1} aus ${c.name} löschen`);
      const img = document.createElement('img');
      img.src = sample.src;
      img.className = 'preview-img';
      img.alt = '';
      button.append(img);
      button.onclick = () => {
        if (busy) return;
        invalidate();
        c.images.splice(i, 1);
        renderClasses();
      };
      card.querySelector('.image-preview').append(button);
    });
    $('classes-container').append(card);
  });
  updateControls();
}
function stopLive() {
  const session = liveSession;
  liveSession = null;
  if (session) {
    clearTimeout(session.timer);
    session.stream?.getTracks().forEach(track => track.stop());
  }
  $('webcam').srcObject = null;
  updateControls();
}
function invalidate() {
  stopLive();
  trained = false;
  lastConfidences = null;
  setProgress(0);
  $('results').textContent = 'Trainiere das Modell mit den aktuellen Bildern, um Ergebnisse zu sehen.';
  $('training-status').textContent = '';
  $('test-status').textContent = '';
  $('test-image').removeAttribute('src');
  $('test-image').classList.add('hidden');
  $('webcam').classList.remove('hidden');
  updateControls();
}
async function clearAllData() {
  if (busy || captureSession) return;
  busy = true;
  invalidate();
  await predictionTask;
  classifier?.dispose();
  classifier = null;
  classes = [newClass(), newClass()];
  busy = false;
  renderClasses();
  status('Alle Trainingsdaten und das trainierte Modell wurden gelöscht.', 'success');
}
function decodeImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Das Bild ist beschädigt oder sein Format wird nicht unterstützt.'));
    image.src = src;
  });
}
function imageCanvas(source) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 224;
  canvas.getContext('2d').drawImage(source, 0, 0, 224, 224);
  return canvas;
}
async function readImage(file) {
  if (file.type && !file.type.startsWith('image/')) throw new Error('Bitte eine Bilddatei auswählen.');
  const url = URL.createObjectURL(file);
  try {
    const image = await decodeImage(url);
    return imageCanvas(image).toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}
async function uploadImages(c, input) {
  const files = [...input.files];
  input.value = '';
  if (busy || !c.name.trim() || !files.length) return;
  busy = true;
  invalidate();
  const available = MAX_IMAGES_PER_CLASS - c.images.length;
  // Reserve capacity before either worker starts, preserving the hard limit.
  const selected = files.slice(0, available);
  const outcomes = new Array(selected.length);
  let cursor = 0;
  try {
    await Promise.all(Array.from({length: Math.min(2, selected.length)}, async () => {
      while (cursor < selected.length) {
        const i = cursor++;
        try { outcomes[i] = {src: await readImage(selected[i]), features: null}; }
        catch { outcomes[i] = null; }
      }
    }));
    c.images.push(...outcomes.filter(Boolean));
    const failed = outcomes.filter(sample => !sample).length;
    status(`${outcomes.filter(Boolean).length} Bilder hinzugefügt.` +
      (files.length > available ? ` Maximal ${MAX_IMAGES_PER_CLASS} Bilder pro Klasse.` : '') +
      (failed ? ` ${failed} Datei(en) konnten nicht gelesen werden.` : ''), failed ? 'error' : 'success');
  } finally { busy = false; renderClasses(); }
}
function loadScript(globalName, src) {
  if (window[globalName]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => finish(new Error('Die KI-Bibliothek lädt zu lange. Prüfe die Internetverbindung und starte das Training erneut.')), 30000);
    function finish(error) {
      clearTimeout(timer);
      script.onload = script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else resolve();
    }
    script.onload = () => finish(window[globalName] ? null : new Error('Die KI-Bibliothek ist nicht verfügbar. Bitte erneut trainieren.'));
    script.onerror = () => finish(new Error('Die KI-Bibliothek konnte nicht geladen werden. Prüfe die Internetverbindung und starte das Training erneut.'));
    script.src = src;
    document.head.append(script);
  });
}
function ensureModel() {
  if (mobilenetModel) return Promise.resolve(mobilenetModel);
  if (!modelPromise) {
    modelPromise = (async () => {
      for (const [name, url] of TF_LIBRARIES) await loadScript(name, url);
      await tf.ready();
      // Bound network waiting; a late model is disposed rather than installed.
      let expired = false;
      let timer;
      const loading = mobilenet.load({version: 1, alpha: 1.0}).then(model => {
        if (expired) { model.model.dispose(); throw new Error('Ladeversuch abgelaufen.'); }
        return model;
      });
      try {
        mobilenetModel = await Promise.race([loading, new Promise((_, reject) => {
          timer = setTimeout(() => {
            expired = true;
            reject(new Error('Das KI-Modell lädt zu lange. Prüfe die Internetverbindung und starte das Training erneut.'));
          }, 60000);
        })]);
        return mobilenetModel;
      } finally { clearTimeout(timer); }
    })().catch(error => { modelPromise = null; throw error; });
  }
  return modelPromise;
}
async function extractFeatures(source) {
  // MobileNet normalizes pixels internally: no extra division by 255.
  const embedding = tf.tidy(() => mobilenetModel.infer(imageCanvas(source), true));
  try { return Array.from(await embedding.data()); }
  finally { embedding.dispose(); }
}
async function trainModel() {
  if (busy || captureSession || !validData()) return;
  busy = true;
  invalidate();
  status('Lade KI-Modell … Beim ersten Mal kann das etwas dauern.', 'info', 'training-status');
  let candidate = null;
  try {
    await predictionTask;
    await ensureModel();
    candidate = knnClassifier.create();
    const total = classes.reduce((sum, c) => sum + c.images.length, 0);
    let done = 0;
    for (const c of classes) {
      for (const sample of c.images) {
        if (!sample.features) sample.features = await extractFeatures(await decodeImage(sample.src));
        const tensor = tf.tensor2d(sample.features, [1, sample.features.length]);
        try { candidate.addExample(tensor, c.id); }
        finally { tensor.dispose(); }
        done++;
        setProgress(Math.round(done / total * 100));
        status(`Verarbeite Bild ${done} von ${total} …`, 'info', 'training-status');
        await tf.nextFrame();
      }
    }
    classifier?.dispose();
    classifier = candidate;
    candidate = null;
    trained = true;
    status(`Training abgeschlossen: ${total} Bilder in ${classes.length} Klassen.`, 'success', 'training-status');
    $('results').textContent = 'Bereit! Teste jetzt ein Bild oder starte die Webcam.';
  } catch (error) {
    setProgress(0);
    report(error, 'training-status');
  } finally {
    candidate?.dispose();
    busy = false;
    updateControls();
  }
}
async function predict(source) {
  const features = await extractFeatures(source);
  const tensor = tf.tensor2d(features, [1, features.length]);
  try { return (await classifier.predictClass(tensor, 3)).confidences; }
  finally { tensor.dispose(); }
}
function displayResults(confidences) {
  lastConfidences = confidences;
  $('results').replaceChildren();
  for (const c of classes) {
    const percent = Math.max(0, Math.min(100, (confidences[c.id] || 0) * 100));
    const row = document.createElement('div');
    row.className = 'result-item';
    row.innerHTML = '<div class="result-label"></div><div class="result-bar"><div class="result-fill"></div></div><div class="result-percentage"></div>';
    row.querySelector('.result-label').textContent = c.name;
    row.querySelector('.result-fill').style.width = `${percent}%`;
    row.querySelector('.result-percentage').textContent = `${percent.toFixed(1)} %`;
    $('results').append(row);
  }
}
async function openCamera(video, session) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Die Kamera benötigt HTTPS oder localhost und einen Browser mit Kamerazugriff.');
  const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: false});
  if (session.cancelled()) { stream.getTracks().forEach(track => track.stop()); return false; }
  session.stream = stream;
  video.srcObject = stream;
  await video.play();
  if (session.cancelled()) return false;
  if (!video.videoWidth) throw new Error('Die Kamera liefert noch kein Bild. Bitte erneut starten.');
  return true;
}
function cameraError(error) {
  if (error.name === 'NotAllowedError') return new Error('Kamerazugriff verweigert. Erlaube die Kamera in den Browser-Einstellungen und versuche es erneut.');
  if (error.name === 'NotFoundError') return new Error('Es wurde keine Kamera gefunden.');
  if (error.name === 'NotReadableError') return new Error('Die Kamera ist nicht verfügbar. Schließe andere Anwendungen, die sie verwenden.');
  return error;
}
async function toggleWebcam() {
  if (liveSession) { stopLive(); status('Live-Test gestoppt.', 'info', 'test-status'); return; }
  if (busy || captureSession || !trained) return;
  const session = {stream: null, timer: null, cancelled: () => liveSession !== session};
  liveSession = session;
  updateControls();
  status('Warte auf die Kamera …', 'info', 'test-status');
  try {
    await predictionTask;
    if (session.cancelled()) return;
    if (!await openCamera($('webcam'), session)) return;
    $('test-image').classList.add('hidden');
    $('webcam').classList.remove('hidden');
    status('Live-Test läuft.', 'success', 'test-status');
    const tick = async () => {
      if (session.cancelled()) return;
      // Schedule only after completion, so inference never overlaps itself.
      predictionTask = (async () => {
        try {
          const result = await predict($('webcam'));
          if (!session.cancelled()) displayResults(result);
        } catch (error) {
          if (!session.cancelled()) { stopLive(); report(error, 'test-status'); }
        }
      })();
      await predictionTask;
      if (!session.cancelled()) session.timer = setTimeout(tick, 350);
    };
    void tick();
  } catch (error) {
    if (!session.cancelled()) { stopLive(); report(cameraError(error), 'test-status'); }
  }
}
async function testUploadedImage(input) {
  const file = input.files[0];
  input.value = '';
  if (!file || busy || !trained) return;
  busy = true;
  stopLive();
  try {
    await predictionTask;
    const src = await readImage(file);
    const image = await decodeImage(src);
    displayResults(await predict(image));
    $('test-image').src = src;
    $('test-image').classList.remove('hidden');
    $('webcam').classList.add('hidden');
    status('Testbild ausgewertet.', 'success', 'test-status');
  } catch (error) { report(error, 'test-status'); }
  finally { busy = false; updateControls(); }
}
async function startCapture(c) {
  if (busy || captureSession || !c.name.trim() || c.images.length >= MAX_IMAGES_PER_CLASS) return;
  stopLive();
  const dialog = document.createElement('dialog');
  dialog.className = 'capture-dialog';
  dialog.innerHTML = '<h2></h2><video autoplay muted playsinline></video><p role="status">Warte auf die Kamera …</p><div class="controls"><button class="btn btn-success" disabled>📸 Aufnahme</button><button class="btn btn-secondary">Schließen</button></div>';
  dialog.querySelector('h2').textContent = c.name;
  const video = dialog.querySelector('video');
  const [take, close] = dialog.querySelectorAll('button');
  const message = dialog.querySelector('p');
  const session = {stream: null, cancelled: () => captureSession !== session};
  captureSession = session;
  const cleanup = () => {
    session.stream?.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    if (captureSession === session) captureSession = null;
    dialog.remove();
    updateControls();
  };
  session.close = cleanup;
  close.onclick = () => dialog.close();
  dialog.onclose = cleanup;
  take.onclick = () => {
    if (session.cancelled() || video.readyState < 2 || c.images.length >= MAX_IMAGES_PER_CLASS) return;
    try {
      c.images.push({src: imageCanvas(video).toDataURL('image/png'), features: null});
      invalidate();
      renderClasses();
      message.textContent = `${c.images.length} / ${MAX_IMAGES_PER_CLASS} Bilder aufgenommen.`;
      take.disabled = c.images.length >= MAX_IMAGES_PER_CLASS;
    } catch (error) { message.textContent = error.message; }
  };
  document.body.append(dialog);
  dialog.showModal();
  updateControls();
  try {
    if (!await openCamera(video, session)) return;
    message.textContent = 'Verändere Perspektive und Abstand zwischen den Aufnahmen.';
    take.disabled = false;
  } catch (error) {
    if (!session.cancelled()) {
      cleanup();
      report(cameraError(error));
    }
  }
}
function initializeApp() {
  classes = [newClass(), newClass()];
  $('add-class-btn').onclick = () => {
    if (busy || captureSession || classes.length >= MAX_CLASSES) return;
    invalidate();
    classes.push(newClass());
    renderClasses();
  };
  $('clear-data-btn').onclick = clearAllData;
  $('train-btn').onclick = trainModel;
  $('webcam-btn').onclick = toggleWebcam;
  $('test-upload-btn').onclick = () => $('test-upload').click();
  $('test-upload').onchange = event => testUploadedImage(event.target);
  window.addEventListener('pagehide', () => { stopLive(); captureSession?.close(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopLive(); captureSession?.close(); }
  });
  renderClasses();
  status('Bereit. Benenne deine Klassen und sammle mindestens fünf Bilder pro Klasse.', 'success');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeApp, {once: true});
else initializeApp();
