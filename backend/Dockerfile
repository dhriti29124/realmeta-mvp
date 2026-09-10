# ---------------------------------------------------------------------------
# RealMeta video-to-3D pipeline
#
# Packages the pipeline we validated in Colab into one reproducible image:
# ffmpeg (frame extraction), COLMAP (camera pose estimation), and the
# Gaussian Splatting training code. Build once, run identically every time
# on any GPU machine (RunPod, Lambda Labs, AWS, etc.) — no more manual
# cell-by-cell notebook running, and no more "colmap: not found" surprises.
# ---------------------------------------------------------------------------

FROM nvidia/cuda:11.8.0-devel-ubuntu22.04

# Avoid interactive prompts during package installs
ENV DEBIAN_FRONTEND=noninteractive

# ---- System dependencies -----------------------------------------------
RUN apt-get update && apt-get install -y \
    git \
    wget \
    unzip \
    ffmpeg \
    imagemagick \
    colmap \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# ---- Python dependencies -------------------------------------------------
WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# ---- Gaussian Splatting training code ------------------------------------
# Pulls the reference implementation used during the Colab testing.
RUN git clone --recursive https://github.com/graphdeco-inria/gaussian-splatting.git /app/gaussian-splatting

# ---- Our pipeline script -------------------------------------------------
COPY process_video.py .

# Folders for incoming videos and finished .ply results.
# When running the container, mount host folders to these paths so files
# survive after the container stops, e.g.:
#   docker run -v $(pwd)/input:/app/input -v $(pwd)/output:/app/output ...
RUN mkdir -p /app/input /app/output

ENTRYPOINT ["python3", "process_video.py"]
