import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

// ---------------------------------------------------------------------------
// RealMeta MVP — Upload + Viewer
//
// Flow:
//   1. User uploads an .mp4/.mov (or picks a .ply directly as a fallback).
//   2. If a video was uploaded, we POST it to the backend API (see
//      /backend/api.py) which runs process_video.py and returns a job_id.
//   3. We poll /status/{job_id} every few seconds until it's "done".
//   4. We fetch /result/{job_id} to get the finished .ply and hand it to
//      the Three.js-based Gaussian Splat viewer.
//
// IMPORTANT: This only works once a backend server is actually reachable.
// Two ways to get one running:
//   1. A real deployed GPU server (see /backend) — paste its address into
//      the "Backend URL" field on the page.
//   2. A free Google Colab GPU running the same code (see
//      /colab/RealMeta_Backend_Server.ipynb) — it prints a temporary public
//      address each time you run it; paste that into the same field.
// Until a backend is reachable, use the "Load .ply directly" fallback link
// instead to test the viewer on its own.
// ---------------------------------------------------------------------------

// The backend address is entered on the page itself (see the "Backend URL"
// field on the upload screen) rather than hardcoded here, because a free
// Colab + ngrok setup gives you a NEW address every time you restart the
// notebook — editing this file each time would get old fast. Defaults to
// localhost:8000 for a developer running the backend on their own machine.
function getBackendUrl() {
  const value = backendUrlInput.value.trim();
  return value || 'http://localhost:8000';
}

const uploadScreen = document.getElementById('upload-screen');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadStatus = document.getElementById('upload-status');
const progressTrack = document.getElementById('progress-bar-track');
const progressFill = document.getElementById('progress-bar-fill');
const skipToManualLink = document.getElementById('skip-to-manual');
const backendUrlInput = document.getElementById('backend-url-input');

// Remember the last-used backend URL across page reloads, purely as a
// convenience (this is a real browser localStorage call in the actual
// deployed website, not a Claude-artifact preview, so it's fine here).
const savedBackendUrl = localStorage.getItem('realmeta-backend-url');
if (savedBackendUrl) backendUrlInput.value = savedBackendUrl;
backendUrlInput.addEventListener('change', () => {
  localStorage.setItem('realmeta-backend-url', backendUrlInput.value.trim());
});

const viewerContainer = document.getElementById('viewer-container');
const loadingOverlay = document.getElementById('loading-overlay');
const instructions = document.getElementById('instructions');

function setStatus(message, isError = false) {
  uploadStatus.textContent = message;
  uploadStatus.classList.toggle('error', isError);
}

function setProgress(fraction) {
  progressTrack.style.display = 'block';
  progressFill.style.width = `${Math.min(100, Math.max(0, fraction * 100))}%`;
}

// ---------------------------------------------------------------------------
// Step: hand a .ply URL (or File) to the Gaussian Splat viewer
//
// sourceFormat should be 'ply' or 'splat'. This matters because blob: URLs
// (created from a locally-picked file) have no file extension for the
// library to detect the format from automatically — without telling it
// explicitly, it can hang indefinitely instead of showing an error.
//
// flipped: every scan file bakes in its own "which way is up" from how it
// was captured, so a fixed default won't suit every file. Rather than try
// to rotate an already-loaded scene live (this library expects rotation to
// be set at load time, as a quaternion), the "Flip up/down" button below
// just reloads the same file with a 180° rotation applied.
// ---------------------------------------------------------------------------
let currentViewer = null;

function launchViewer(splatSource, sourceFormat, flipped = false) {
  uploadScreen.style.display = 'none';
  viewerContainer.style.display = 'block';
  loadingOverlay.style.display = 'flex';
  loadingOverlay.style.opacity = '1';
  instructions.style.display = 'block';

  // Tear down any previous viewer instance before creating a new one
  // (used when the flip button reloads the scene).
  if (currentViewer) {
    currentViewer.stop?.();
    currentViewer.dispose?.();
  }
  viewerContainer.innerHTML = '';

  const viewer = new GaussianSplats3D.Viewer({
    // Many research-dataset scenes (bonsai/garden/truck/etc., including the
    // official library demos) were captured with the camera's "up" pointing
    // this way rather than plain [0,1,0] — using their convention here fixes
    // the "everything is upside down" look for those files.
    cameraUp: [0, -1, -0.6],
    initialCameraPosition: [-1, -4, 6],
    initialCameraLookAt: [0, 4, 0],
    rootElement: viewerContainer,
    webXRMode: GaussianSplats3D.WebXRMode.None,
    sharedMemoryForWorkers: false,
  });
  currentViewer = viewer;

  const format =
    sourceFormat === 'ply'
      ? GaussianSplats3D.SceneFormat.Ply
      : GaussianSplats3D.SceneFormat.Splat;

  // Quaternion for a 180° rotation around the X axis — flips the scene
  // upside-down/right-side-up. [x, y, z, w] format.
  const rotation = flipped ? [1, 0, 0, 0] : [0, 0, 0, 1];

  // Safety net: if loading hasn't resolved or failed within 60 seconds,
  // stop showing "Loading..." forever and tell the person something's wrong.
  const hangTimeout = setTimeout(() => {
    loadingOverlay.innerHTML =
      '<h2 style="color:#ff8080">This is taking much longer than expected.<br/>' +
      'The file may be too large, corrupted, or an unsupported format.</h2>';
  }, 60000);

  try {
    viewer
      .addSplatScene(splatSource, {
        format,
        rotation,
        splatAlphaRemovalThreshold: 5,
        showLoadingUI: false,
        progressiveLoad: true,
      })
      .then(() => {
        clearTimeout(hangTimeout);
        loadingOverlay.style.opacity = '0';
        setTimeout(() => (loadingOverlay.style.display = 'none'), 400);
        viewer.start();
        showFlipButton(splatSource, sourceFormat, flipped);
      })
      .catch((err) => {
        clearTimeout(hangTimeout);
        loadingOverlay.innerHTML =
          '<h2 style="color:#ff8080">Could not load the 3D scan.<br/>The file may be corrupted or in an unsupported format.</h2>';
        console.error('Failed to load splat scene:', err);
      });
  } catch (err) {
    // addSplatScene can throw synchronously (before returning a promise) if
    // it can't determine the file format — catch that case here too.
    clearTimeout(hangTimeout);
    loadingOverlay.innerHTML =
      '<h2 style="color:#ff8080">Could not load the 3D scan.<br/>The file may be corrupted or in an unsupported format.</h2>';
    console.error('Failed to load splat scene (synchronous error):', err);
  }
}

// ---------------------------------------------------------------------------
// A small on-screen button that reloads the current scene with the opposite
// up/down orientation. Since flipping means reloading, this only works
// smoothly for scenes that load quickly (a local file or a small download);
// for a huge file, expect a brief re-loading pause when clicked.
// ---------------------------------------------------------------------------
function showFlipButton(splatSource, sourceFormat, currentlyFlipped) {
  let flipButton = document.getElementById('flip-button');
  if (!flipButton) {
    flipButton = document.createElement('button');
    flipButton.id = 'flip-button';
    Object.assign(flipButton.style, {
      position: 'fixed',
      bottom: '12px',
      right: '12px',
      zIndex: '15',
      padding: '10px 14px',
      background: '#1a1a1aee',
      color: '#fff',
      border: '1px solid #444',
      borderRadius: '8px',
      fontSize: '13px',
      cursor: 'pointer',
    });
    document.body.appendChild(flipButton);
  }
  flipButton.textContent = '↕ Flip up/down';
  flipButton.style.display = 'block';
  flipButton.onclick = () => {
    launchViewer(splatSource, sourceFormat, !currentlyFlipped);
  };
}

// ---------------------------------------------------------------------------
// Step: upload a video to the backend, poll until done, then launch viewer
// ---------------------------------------------------------------------------
async function uploadVideo(file) {
  setStatus(`Uploading ${file.name}…`);
  setProgress(0.05);
  const backendUrl = getBackendUrl();

  const formData = new FormData();
  formData.append('file', file);

  let uploadResponse;
  try {
    uploadResponse = await fetch(`${backendUrl}/upload`, {
      method: 'POST',
      body: formData,
    });
  } catch (err) {
    setStatus(
      "Couldn't reach the processing server. It may not be deployed yet — " +
        'ask Acadia\'s team about the backend server status, or use "Load .ply directly" below.',
      true
    );
    progressTrack.style.display = 'none';
    return;
  }

  if (!uploadResponse.ok) {
    if (uploadResponse.status === 429) {
      setStatus(
        'Another video is already processing on this server — this free demo setup can ' +
          'only handle one at a time. Wait for the current one to finish before uploading again.',
        true
      );
    } else {
      const detail = await uploadResponse.text();
      setStatus(`Upload rejected by server: ${detail}`, true);
    }
    progressTrack.style.display = 'none';
    return;
  }

  const { job_id } = await uploadResponse.json();
  setStatus('Uploaded. Processing has started — this can take 15–40 minutes.');
  setProgress(0.15);
  pollJobStatus(job_id, backendUrl);
}

function pollJobStatus(jobId, backendUrl) {
  const pollIntervalMs = 5000;
  let elapsedPolls = 0;
  let consecutiveFailures = 0;
  // Some pipeline steps (especially camera-position estimation) are so
  // CPU-heavy they can leave a free-tier machine unable to even answer a
  // simple "are you done?" check for several minutes at a stretch — that's
  // normal, not a real disconnect. So we stay patient for a long time
  // (~10 minutes of continuous failures) before actually giving up.
  const MAX_CONSECUTIVE_FAILURES = 120;

  const interval = setInterval(async () => {
    elapsedPolls += 1;
    let statusResponse;
    try {
      statusResponse = await fetch(`${backendUrl}/status/${jobId}`);
      consecutiveFailures = 0; // request succeeded, reset the counter
    } catch (err) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        clearInterval(interval);
        setStatus(
          'Lost connection to the processing server for too long. ' +
            'If the Colab notebook is still running, refresh this page, re-paste the ' +
            'Backend URL, and try uploading again.',
          true
        );
      } else if (consecutiveFailures === 1) {
        // Only announce the first hiccup — repeating this every 5 seconds
        // for several minutes would look alarming even though it's expected.
        setStatus(
          "Server isn't responding right now — this is normal during the heavier " +
            'processing steps (camera-position estimation is very CPU-intensive). ' +
            'Still waiting…',
          true
        );
      }
      return;
    }

    if (!statusResponse.ok) {
      // A clean 404 means the server genuinely doesn't know this job
      // (e.g. it restarted) — that's worth stopping for, unlike a
      // network blip above.
      clearInterval(interval);
      setStatus('Server lost track of this job (it may have restarted). Please try uploading again.', true);
      return;
    }

    const data = await statusResponse.json();

    if (data.status === 'processing') {
      setStatus('Still processing your video… (this step takes a while, feel free to leave the tab open)');
      // Nudge the progress bar slowly so it doesn't look frozen, without
      // pretending we know exact progress (the backend doesn't report that yet).
      setProgress(Math.min(0.9, 0.2 + elapsedPolls * 0.01));
    } else if (data.status === 'done') {
      clearInterval(interval);
      setProgress(1);
      setStatus('Done! Loading your 3D scene…');
      launchViewer(`${backendUrl}/result/${jobId}`, 'ply'); // process_video.py always outputs a .ply
    } else if (data.status === 'failed') {
      clearInterval(interval);
      setStatus(`Processing failed: ${data.error || 'unknown error'}`, true);
    }
  }, pollIntervalMs);
}

// ---------------------------------------------------------------------------
// Step: wire up the drop zone / file picker
// ---------------------------------------------------------------------------
function handleFile(file) {
  if (!file) return;

  const isVideo = file.type.startsWith('video/') || /\.(mp4|mov)$/i.test(file.name);
  const isSplat = /\.(ply|splat)$/i.test(file.name);

  if (isVideo) {
    uploadVideo(file);
  } else if (isSplat) {
    setStatus(`Loading ${file.name} directly (skipping video processing)…`);
    const extension = /\.splat$/i.test(file.name) ? 'splat' : 'ply';
    // Blob addresses generated by the browser (blob:http://localhost:5173/xxxx)
    // have no file ending, but the viewer library decides how to read a file
    // purely from the ending in its address. Appending a fake filename after
    // "#" fixes this — browsers ignore everything after "#" when actually
    // fetching the file, but the library still "sees" it when checking the
    // ending, so it correctly reads it as a .ply or .splat file.
    const addressWithExtension = `${URL.createObjectURL(file)}#/scan.${extension}`;
    launchViewer(addressWithExtension, extension);
  } else {
    setStatus('Please choose an .mp4, .mov, .ply, or .splat file.', true);
  }
}

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  handleFile(e.dataTransfer.files[0]);
});

// Fallback link: let the user pick a .ply directly, bypassing upload entirely.
skipToManualLink.addEventListener('click', () => {
  const manualInput = document.createElement('input');
  manualInput.type = 'file';
  manualInput.accept = '.ply,.splat';
  manualInput.onchange = (e) => handleFile(e.target.files[0]);
  manualInput.click();
});
