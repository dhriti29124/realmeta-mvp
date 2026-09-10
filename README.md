# RealMeta MVP

A minimal proof-of-concept for RealMeta's Tier 2 idea:
**video walkthrough → AI-generated 3D model → view it in a normal web
browser.** No app install, no Unity, no VR headset required (though it
can support one later).

This project has two parts that plug into each other:

| Folder | What it does | Status |
|---|---|---|
| `/` (root) — the **viewer** | A Three.js webpage that displays a `.ply` 3D scan so anyone can walk through it in a browser | ✅ Working |
| `/colab` — the **live demo pipeline** | A ready-to-run Google Colab notebook that turns a video into a `.ply` file using a free GPU — no server needed | ✅ Working, good for demos |
| `/backend` — the **production pipeline** | The same idea as `/colab`, but packaged to run automatically on a real, always-on GPU server (via the website's upload button) | 🚧 Built, not yet deployed |

**Want to demo the actual video → 3D process today, without deploying
anything?** Open `/colab/RealMeta_Video_to_3D_Demo.ipynb` — it's free
and takes a browser tab, no server required.

The webpage (`index.html` + `src/main.js`) has a real **"Upload Video"**
screen with a **"Backend URL"** field, wired up to call that backend's
`/upload`, `/status`, and `/result` endpoints, poll for completion, and
automatically load the finished `.ply` into the viewer.

### 🎬 Fastest way to make this actually work today: Colab as the backend

You don't need to deploy anything to try the real upload flow. Open
`/colab/RealMeta_Backend_Server.ipynb` in Google Colab (free GPU), run
it, and it prints a temporary public web address. Paste that address
into the "Backend URL" field on this website, and the upload button
will genuinely process videos on that GPU — no server rental needed.

The catch: that address is temporary and changes every time you
restart the notebook, and the server stops when you close the Colab
tab. That's fine for demos; for a real always-on product, see the
"Current limitation" section below about deploying `/backend` properly.

Until you have either a Colab session or a deployed server running,
the page also keeps a **"Load .ply directly"** fallback link, so the
viewer half can still be tested/demoed on its own with a file you
already have from Luma AI, Polycam, or a manual Colab run.

### ⚠️ Current limitation — read this before demoing the upload flow

The backend pipeline needs a real GPU to run (photogrammetry + Gaussian
Splatting training is far too slow on a normal laptop CPU, and won't
finish in any reasonable time). Right now, `src/main.js` points at:

```js
const BACKEND_URL = 'http://localhost:8000';
```

This only works if `backend/api.py` happens to be running on the same
machine you're viewing the page from — fine for a developer testing
locally, but there's no real GPU server behind it yet. **Uploading a
video before that server exists will show a "couldn't reach the
processing server" message** — that's expected, not a bug. Once
Acadia deploys `backend/` (see the Docker instructions below) to an
actual GPU machine, update `BACKEND_URL` to that server's real address
and the upload flow will work end-to-end.

This MVP does **not** yet include AI object recognition, AR-to-VR
linking, or multi-visitor support — those come after both halves above
are solid.

---

## What you need before starting

- A computer (Mac, Windows, or Linux)
- [Node.js](https://nodejs.org) installed (version 18 or newer — the
  "LTS" version on that site is fine). This gives you the `npm` command.
- A code editor is optional but helpful — [VS Code](https://code.visualstudio.com/)
  is free and works well.
- A phone to film a test walkthrough video.
- A free account on [Luma AI](https://lumalabs.ai/) or [Polycam](https://poly.cam/)
  to turn your video into a 3D scan.

You do **not** need to know how to code to run this — just to follow
the steps below.

---

## Step 1 — Get your 3D scan file

1. Film a slow, steady walkthrough video of one small room or exhibit.
   Move slowly, cover the space from multiple angles, avoid fast motion blur.
2. Upload the video to Luma AI (or Polycam).
3. Wait for processing (this can take anywhere from a few minutes to an hour).
4. Download the result. You're looking for a file ending in `.splat` or `.ply`.
5. Rename it to something simple, e.g. `museum-room.splat`.

## Step 2 — Add the file to this project

1. Copy your `museum-room.splat` file into the folder:
   ```
   public/models/
   ```
2. Open `src/main.js` in a text editor.
3. Find this line near the top:
   ```js
   const SPLAT_FILE = '/models/your-scan.splat';
   ```
4. Change `your-scan.splat` to your actual filename, e.g.:
   ```js
   const SPLAT_FILE = '/models/museum-room.splat';
   ```
5. Save the file.

## Step 3 — Install the project's dependencies

Open a terminal (Mac: "Terminal" app, Windows: "Command Prompt" or
"PowerShell"), navigate into this project folder, and run:

```bash
npm install
```

This downloads the Three.js and Gaussian Splat libraries the project
needs. You only need to do this once (or again if you pull new changes).

## Step 4 — Run it locally

Still in the terminal, in this same folder, run:

```bash
npm run dev
```

You'll see output with a local address, usually:

```
Local:   http://localhost:5173/
```

Open that link in your web browser (Chrome or Edge work best for 3D
content). You should see your scanned room, and be able to:
- **Drag** with your mouse to look around
- **Scroll** to zoom in/out
- **WASD keys** to move through the space

If you see an error message on screen instead, double check:
- The file is really inside `public/models/`
- The filename in `src/main.js` matches exactly (including capital
  letters and the `.splat`/`.ply` ending)

## Step 5 — Put it online so others can see it (optional, once it works locally)

The easiest free option is **Vercel**:

1. Create a free account at [vercel.com](https://vercel.com) (you can
   sign up with your GitHub account).
2. Push this project folder to a GitHub repository (see below).
3. In Vercel, click "New Project," pick your GitHub repo, and click Deploy.
4. Vercel will give you a live link like `realmeta-mvp.vercel.app` that
   anyone can open — no installs needed.

### Getting this project onto GitHub (if you haven't already)

```bash
git init
git add .
git commit -m "Initial RealMeta MVP viewer"
```

Then create an empty repository on github.com (click "New repository,"
don't check any boxes for README/license), and it will show you two
commands like these to run next:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git branch -M main
git push -u origin main
```

---

## Project structure

```
realmeta-mvp/
├── index.html          the web page shell
├── package.json        list of libraries the project uses
├── src/
│   └── main.js          the viewer code (loads and displays the 3D scan)
└── public/
    └── models/           put your .splat/.ply file here
```

## The backend pipeline (`/backend`)

This automates the video-to-3D step so nobody has to manually upload
to a third-party website and drag files around.

```
backend/
├── Dockerfile          packages ffmpeg + COLMAP + the Gaussian Splatting
│                        training code into one reproducible environment
├── requirements.txt     Python libraries the pipeline and API need
├── process_video.py     the actual pipeline: video -> frames -> camera
│                        poses -> trained splat -> .ply file
└── api.py                a small web server (FastAPI) that exposes:
                            POST /upload        start processing a video
                            GET  /status/{id}    check progress
                            GET  /result/{id}    download the finished .ply
```

### Speed optimization: video compression

Before doing anything else, the pipeline now compresses/downscales the
video (max width 1280px by default). This is a cheap, fast step, but it
matters a lot: COLMAP's feature-matching step — the slowest, most
CPU-heavy part of the whole pipeline — gets dramatically slower as
image size and count grow, so shrinking every frame it has to compare
can meaningfully cut total processing time without materially hurting
the final 3D result's quality.

To compare speed/quality with vs without this step:
```bash
python3 process_video.py --input video.mp4 --output out/ --max-width 0   # skip compression
python3 process_video.py --input video.mp4 --output out/                 # default: compress to 1280px wide
```

### Running the pipeline locally (requires a machine with an NVIDIA GPU)

```bash
cd backend
docker build -t realmeta-pipeline .
docker run --gpus all \
  -v $(pwd)/input:/app/input \
  -v $(pwd)/output:/app/output \
  realmeta-pipeline --input /app/input/my_video.mp4 --output /app/output
```

The finished file appears at `output/result.ply` — copy that into
`public/models/` and point `src/main.js` at it, exactly like the manual
Luma/Polycam workflow described above.

### Running the API locally (for testing the upload/status/result flow)

```bash
cd backend
pip install -r requirements.txt
uvicorn api:app --reload --port 8000
```

Then `POST` a video file to `http://localhost:8000/upload` (e.g. with
a tool like Postman, or a simple form on the website) to get a `job_id`,
and poll `/status/{job_id}` until it says `"done"`.

### What's still needed before this runs "for real"

- **A GPU server to run it on** — a laptop's CPU is far too slow, and
  this needs an actual GPU (e.g. rented from RunPod or Lambda Labs).
  Docker makes it possible to run the exact same container on any of
  those without reconfiguring anything.
- **A real job queue** — `api.py` currently uses a simple in-memory
  background task, which is fine for one demo at a time but won't
  survive a server restart or handle multiple videos processing at
  once. Swapping in Celery + Redis (already listed in
  `requirements.txt`) is the next step for that.
- **Cloud storage for results** — right now `.ply` files sit on
  whatever server ran the job. For real use, finished files should be
  uploaded to something like AWS S3 so they're not lost if the server
  restarts.

## What to build next (after this MVP works)

- Deploy the backend pipeline to an actual GPU server and connect it
  to a real "Upload Video" button on the viewer page
- Swap in a real museum scan instead of a test room
- Add simple on-screen labels/hotspots (manually placed, no AI yet)
- Bring in the Tier 1 AI object-recognition models to auto-place those
  hotspots instead of manually
- Add multi-visitor support
- Package as an installable PWA
