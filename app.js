const TF_LIBRARIES = [
  "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js",
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.0/dist/mobilenet.min.js",
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/knn-classifier@1.2.2/dist/knn-classifier.min.js"
];

async function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Script konnte nicht geladen werden: ${src}`));
    document.head.appendChild(script);
  });
}

let classes = [];
    let classifier, mobilenetModel;
    let isWebcamActive = false, webcamStream, predictionLoop;
    const MAX_CLASSES = 5;
    const MIN_IMAGES_PER_CLASS = 5;
    const MAX_IMAGES_PER_CLASS = 20;

async function initializeApp() {
      setControlsDisabled(true);
      showStatus('Lade KI-Modelle …', 'info');
      for (const lib of TF_LIBRARIES) {
        await loadExternalScript(lib);
      }
      // Load MobileNet + KNN
      mobilenetModel = await mobilenet.load();
      classifier     = knnClassifier.create();
      // zwei Default-Klassen in einem Render-Schritt
      classes = [
        { name:`Klasse 1`, images:[], features:[] },
        { name:`Klasse 2`, images:[], features:[] }
      ];
      setupEventListeners();
      renderClasses();
      setControlsDisabled(false);
      showStatus('Lernmaschine ist bereit.', 'success');
    }

    function addClass() {
      if (classes.length >= MAX_CLASSES) { showStatus(`Max. ${MAX_CLASSES} Klassen erlaubt.`, 'error'); return; }
      classes.push({ name:`Klasse ${classes.length+1}`, images:[], features:[] });
      renderClasses();
    }

    function renderClasses() {
      const container = document.getElementById('classes-container');
      container.innerHTML = '';
      classes.forEach((c,i) => {
        const div = document.createElement('div'); div.className='class-container';
        div.innerHTML = `
          <div class="class-header">
            <input class="class-name" value="${c.name}" data-action="rename-class" data-class-index="${i}">
            <div class="image-count">${c.images.length} Bilder</div>
            <button class="btn btn-danger" data-action="remove-class" data-class-index="${i}">×</button>
          </div>
          <div class="upload-area">
            <input type="file" id="upload-${i}" accept="image/*" multiple class="hidden"
                   data-action="upload-images" data-class-index="${i}">
            <button class="btn btn-secondary" data-action="open-upload" data-class-index="${i}">📁 Hochladen</button>
            <button class="btn btn-secondary" data-action="webcam-capture" data-class-index="${i}">📸 Webcam</button>
          </div>
          <div class="image-preview" id="preview-${i}"></div>
        `;
        container.appendChild(div);
        renderPreview(i);
      });
      updateTrainButton();
    }

    function updateClassName(i,name){ classes[i].name=name; }
    function removeClass(i){
      if(classes.length<=2){ showStatus('Mind. 2 Klassen nötig.', 'error'); return; }
      classes.splice(i,1); renderClasses();
    }

    function renderPreview(i){
      const p = document.getElementById(`preview-${i}`);
      p.innerHTML='';
      classes[i].images.forEach((src,j)=>{
        const img=document.createElement('img'); img.src=src; img.className='preview-img';
        img.onclick=()=>{ classes[i].images.splice(j,1); classes[i].features.splice(j,1); renderClasses(); };
        p.appendChild(img);
      });
    }

    function showStatus(msg,type){
      const div=document.createElement('div'); 
      div.className=`status-message status-${type}`; div.innerText=msg;
      document.querySelector('.container').prepend(div);
      setTimeout(()=>div.remove(),3000);
    }

    function setControlsDisabled(disabled){
      ['add-class-btn','clear-data-btn','train-btn','webcam-btn','test-upload-btn'].forEach(id=>{
        const el=document.getElementById(id);
        if(el) el.disabled=disabled;
      });
    }

    function setupEventListeners(){
      document.getElementById('add-class-btn').addEventListener('click', addClass);
      document.getElementById('clear-data-btn').addEventListener('click', clearAllData);
      document.getElementById('train-btn').addEventListener('click', trainModel);
      document.getElementById('webcam-btn').addEventListener('click', toggleWebcam);
      document.getElementById('test-upload-btn').addEventListener('click', () => document.getElementById('test-upload').click());
      document.getElementById('test-upload').addEventListener('change', (e) => testUploadedImage(e.target));
      document.getElementById('classes-container').addEventListener('click', async (e) => {
        const target=e.target.closest('[data-action]');
        if(!target) return;
        const i=Number(target.dataset.classIndex);
        if(target.dataset.action==='remove-class') removeClass(i);
        if(target.dataset.action==='open-upload') document.getElementById(`upload-${i}`).click();
        if(target.dataset.action==='webcam-capture') await startWebcamCapture(i);
      });
      document.getElementById('classes-container').addEventListener('change', async (e) => {
        const target=e.target;
        if(target.dataset.action==='rename-class') updateClassName(Number(target.dataset.classIndex),target.value);
        if(target.dataset.action==='upload-images') await uploadImages(Number(target.dataset.classIndex),target);
      });
    }

    async function uploadImages(idx,input){
      const files=[...input.files];
      const queue=files.map((f)=>async()=>{
        if(classes[idx].images.length>=MAX_IMAGES_PER_CLASS){ return; }
        const src=await new Promise(r=>{
          const fr=new FileReader(); fr.onload=e=>r(e.target.result); fr.readAsDataURL(f);
        });
        const feats=await extractFeatures(src);
        classes[idx].images.push(src);
        classes[idx].features.push(feats);
      });
      await runWithConcurrency(queue,2);
      if(classes[idx].images.length>=MAX_IMAGES_PER_CLASS){ showStatus(`Max.${MAX_IMAGES_PER_CLASS} Bilder/Klasse.`, 'error'); }
      input.value='';
      renderPreview(idx);
      updateTrainButton();
    }

    async function runWithConcurrency(tasks, limit){
      const workers=Array.from({length:limit}, async()=>{
        while(tasks.length){
          const task=tasks.shift();
          await task();
        }
      });
      await Promise.all(workers);
    }

    async function startWebcamCapture(idx){
      try{
        const stream=await navigator.mediaDevices.getUserMedia({video:true});
        const vid=document.createElement('video'); vid.srcObject=stream; vid.autoplay=true;
        const overlay=document.createElement('div'); overlay.style=`position:fixed;top:0;left:0;
          width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;
          justify-content:center;flex-direction:column;z-index:1000;`;
        const cap=document.createElement('button'); cap.className='btn btn-success'; cap.innerText='📸 Aufnahme';
        const close=document.createElement('button'); close.className='btn btn-danger'; close.innerText='❌';
        overlay.append(vid,cap,close); document.body.append(overlay);
        cap.onclick=async()=>{
          if(classes[idx].images.length>=MAX_IMAGES_PER_CLASS){
            showStatus(`Max.${MAX_IMAGES_PER_CLASS} Bilder/Klasse.`, 'error');
            return;
          }
          const cvs=document.createElement('canvas'); cvs.width=224; cvs.height=224;
          cvs.getContext('2d').drawImage(vid,0,0,224,224);
          const src=cvs.toDataURL();
          classes[idx].images.push(src);
          classes[idx].features.push(await extractFeatures(src));
          renderClasses(); showStatus('Bild aufgenommen!','success');
        };
        close.onclick=()=>{ stream.getTracks().forEach(t=>t.stop()); overlay.remove(); };
      }catch(e){ showStatus('Webcam-Fehler','error'); }
    }

    async function extractFeatures(src){
      return new Promise(r=>{
        const img=new Image(); img.crossOrigin='anonymous';
        img.onload=()=>{
          const cvs=document.createElement('canvas'); cvs.width=224; cvs.height=224;
          cvs.getContext('2d').drawImage(img,0,0,224,224);
          const t=tf.browser.fromPixels(cvs).expandDims(0).div(255);
          mobilenetModel.infer(t,true).data().then(f=>{
            t.dispose(); r(Array.from(f));
          });
        };
        img.src=src;
      });
    }

    function updateTrainButton(){
      const btn=document.getElementById('train-btn');
      const ready=classes.every(c=>c.images.length>=MIN_IMAGES_PER_CLASS);
      btn.disabled=!ready;
    }

    async function trainModel(){
      const btn=document.getElementById('train-btn'), bar=document.getElementById('training-progress');
      btn.disabled=true; showStatus('Training startet…','info');
      classifier.clearAllClasses();
      for(let p=0;p<=100;p+=10){ bar.style.width=p+'%'; await new Promise(r=>setTimeout(r,200)); }
      // KNN-Daten einfügen
      classes.forEach((c,i)=>{
        c.features.forEach(f=>{
          const tensor=tf.tensor(f,[1,f.length]);
          classifier.addExample(tensor,i);
          tensor.dispose();
        });
      });
      showStatus('Training fertig!','success');
    }

    async function toggleWebcam(){
      const btn=document.getElementById('webcam-btn');
      if(!isWebcamActive){
        if(!classifier || classifier.getNumClasses()===0){ showStatus('Zuerst trainieren','error'); return; }
        webcamStream=await navigator.mediaDevices.getUserMedia({video:true});
        document.getElementById('webcam').srcObject=webcamStream;
        isWebcamActive=true; btn.innerText='Live stoppen'; btn.className='btn btn-danger';
        predictionLoop=setInterval(predictWebcam,500);
      } else {
        clearInterval(predictionLoop); webcamStream.getTracks().forEach(t=>t.stop());
        isWebcamActive=false; btn.innerText='Test via Webcam'; btn.className='btn btn-primary';
      }
    }

    async function predictWebcam(){
      
      
      const vid=document.getElementById('webcam'), cvs=document.getElementById('canvas');
      cvs.width=224; cvs.height=224;
      cvs.getContext('2d').drawImage(vid,0,0,224,224);
      const t=tf.browser.fromPixels(cvs).expandDims(0).div(255);
      const activation=mobilenetModel.infer(t,true);
      const res=await classifier.predictClass(activation);
      displayResults(res.confidences);
      activation.dispose();
      t.dispose();
      
    }

    function displayResults(confidences) {
  const container = document.getElementById('results');
  container.innerHTML = '';
  classes.forEach((cls, i) => {
    const confidence = confidences[i] || 0;
    const div = document.createElement('div');
    div.className = 'result-item';
    div.innerHTML = `
      <div class="result-label">${cls.name}</div>
      <div class="result-bar">
        <div class="result-fill" style="width:${(confidence * 100).toFixed(1)}%"></div>
      </div>
      <div class="result-percentage">${(confidence * 100).toFixed(1)}%</div>
    `;
    container.appendChild(div);
  });
}


    async function testUploadedImage(input){
      if(classifier.getNumClasses()===0){ showStatus('Zuerst trainieren','error'); return; }
      const file=input.files[0]; if(!file) return;
      const src=await new Promise(r=>{ const fr=new FileReader(); fr.onload=e=>r(e.target.result); fr.readAsDataURL(file); });
      const feats=await extractFeatures(src);
      const activation=tf.tensor(feats,[1,feats.length]);
      const res=await classifier.predictClass(activation);
      displayResults(res.confidences);
      activation.dispose();
      
    }


document.addEventListener("DOMContentLoaded", initializeApp);
