"""
RealMeta pipeline API
----------------------
A thin web layer in front of process_video.py, so the Three.js frontend
(or anyone) can upload a video over HTTP and get a .ply file back,
instead of running the pipeline by hand on the command line.

Because processing takes 15-40+ minutes, uploads don't wait for the
result inline. Instead:
    1. POST /upload       -> saves the video, starts a background job, returns a job_id
    2. GET  /status/{id}  -> "pending" | "processing" | "done" | "failed"
    3. GET  /result/{id}  -> downloads the finished .ply once status is "done"

Run locally for testing (without Docker):
    pip install -r requirements.txt
    uvicorn api:app --reload --port 8000

In production, this should run inside the Docker container on a GPU
server (see Dockerfile), with a real job queue (Celery + Redis) instead
of the simple in-memory background task used here for the MVP.
"""

import shutil
import subprocess
import uuid
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

app = FastAPI(title="RealMeta Video-to-3D Pipeline API")

# Allows the viewer webpage (running on a different address, e.g.
# localhost:5173 or a deployed Vercel URL) to call this API from the
# browser. For an MVP, "*" (allow any origin) is fine; tighten this to
# your actual site's URL before going to production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).parent
JOBS_DIR = BASE_DIR / "jobs"
JOBS_DIR.mkdir(exist_ok=True)

# Simple in-memory job tracker. Fine for an MVP / single-server demo.
# For real production use with multiple workers, replace this with
# Celery + Redis so job state survives restarts and scales across machines.
JOBS = {}

# A free GPU (like Colab's) can only realistically train one Gaussian
# Splatting scene at a time — running several simultaneously overwhelms
# it and can make the whole server stop responding. This flag makes the
# API refuse a new upload while one is already in progress, rather than
# silently piling jobs on top of each other.
JOB_IN_PROGRESS = {"job_id": None}


def run_pipeline(job_id: str, video_path: Path, output_dir: Path):
    JOBS[job_id]["status"] = "processing"
    try:
        subprocess.run(
            [
                "python3", str(BASE_DIR / "process_video.py"),
                "--input", str(video_path),
                "--output", str(output_dir),
            ],
            check=True,
        )
        JOBS[job_id]["status"] = "done"
        JOBS[job_id]["result_path"] = str(output_dir / "result.ply")
    except subprocess.CalledProcessError as e:
        JOBS[job_id]["status"] = "failed"
        JOBS[job_id]["error"] = str(e)
    finally:
        # Free up the slot so the next upload can start, whether this one
        # succeeded or failed.
        if JOB_IN_PROGRESS["job_id"] == job_id:
            JOB_IN_PROGRESS["job_id"] = None


@app.post("/upload")
async def upload_video(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".mp4", ".mov")):
        raise HTTPException(status_code=400, detail="Please upload an .mp4 or .mov video file")

    if JOB_IN_PROGRESS["job_id"] is not None:
        raise HTTPException(
            status_code=429,
            detail=(
                "Another video is still processing. This demo server can only handle "
                "one at a time — please wait for it to finish before uploading another."
            ),
        )

    job_id = str(uuid.uuid4())
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True)

    video_path = job_dir / file.filename
    with video_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    JOBS[job_id] = {"status": "pending", "result_path": None, "error": None}
    JOB_IN_PROGRESS["job_id"] = job_id
    background_tasks.add_task(run_pipeline, job_id, video_path, job_dir)

    return {"job_id": job_id, "status": "pending"}


@app.get("/status/{job_id}")
async def get_status(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job_id")
    return {"job_id": job_id, "status": job["status"], "error": job.get("error")}


@app.get("/result/{job_id}")
async def get_result(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job_id")
    if job["status"] != "done":
        raise HTTPException(status_code=409, detail=f"Job is not finished yet (status: {job['status']})")
    return FileResponse(job["result_path"], filename="result.ply")
