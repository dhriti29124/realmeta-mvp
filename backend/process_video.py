"""
RealMeta video-to-3D pipeline
-----------------------------
This turns the manual steps we ran by hand in Colab into one automated
script. Given an input .mp4, it produces a .ply Gaussian Splat file
ready to drop into the Three.js viewer (../public/models/).

Usage (inside the Docker container):
    python3 process_video.py --input /app/input/my_video.mp4 --output /app/output

Pipeline steps (same order as the Colab notebook):
    0. Compress/downscale the video first (ffmpeg) — a cheap, fast step that
       can meaningfully cut how much work every later step has to do
    1. Extract frames from the video (ffmpeg)
    2. Estimate camera positions for each frame (COLMAP)
    3. Train the Gaussian Splat model from the frames + camera positions
    4. Export the trained model as a .ply file
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path


def run(cmd, **kwargs):
    """Run a shell command, stream its output, and stop on failure."""
    print(f"\n$ {' '.join(cmd)}\n")
    result = subprocess.run(cmd, **kwargs)
    if result.returncode != 0:
        print(f"\n[ERROR] Command failed with exit code {result.returncode}: {' '.join(cmd)}")
        sys.exit(result.returncode)


def compress_video(video_path: Path, compressed_path: Path, max_width: int = 1280):
    """Step 0: shrink the video before doing anything else with it."""
    compressed_path.parent.mkdir(parents=True, exist_ok=True)
    run([
        "ffmpeg", "-y", "-i", str(video_path),
        "-vf", f"scale='min({max_width},iw)':-2",
        "-c:v", "libx264", "-crf", "28", "-preset", "fast",
        "-an",
        str(compressed_path),
    ])
    original_mb = video_path.stat().st_size / (1024 * 1024)
    compressed_mb = compressed_path.stat().st_size / (1024 * 1024)
    print(f"Compressed video: {original_mb:.1f} MB -> {compressed_mb:.1f} MB")


def extract_frames(video_path: Path, frames_dir: Path, fps: int = 2):
    """Step 1: pull still frames out of the walkthrough video."""
    frames_dir.mkdir(parents=True, exist_ok=True)
    run([
        "ffmpeg", "-i", str(video_path),
        "-qscale:v", "1", "-qmin", "1", "-vf", f"fps={fps}",
        str(frames_dir / "frame_%04d.jpg"),
    ])
    frame_count = len(list(frames_dir.glob("*.jpg")))
    print(f"Extracted {frame_count} frames to {frames_dir}")
    if frame_count < 20:
        print("[WARNING] Fewer than 20 frames extracted. Camera pose estimation "
              "(the next step) works much better with more overlapping views. "
              "Consider a longer or slower walkthrough video.")


def run_colmap(project_dir: Path, frames_dir: Path):
    """Step 2: figure out where the camera was for every frame.

    Uses sequential_matcher (not exhaustive_matcher) since video frames
    are naturally ordered — this compares each frame mainly to nearby
    neighbours instead of every frame to every other frame, which is
    the single biggest speed win for this step.
    """
    database_path = project_dir / "database.db"
    sparse_dir = project_dir / "sparse"
    sparse_dir.mkdir(parents=True, exist_ok=True)

    run([
        "colmap", "feature_extractor",
        "--database_path", str(database_path),
        "--image_path", str(frames_dir),
    ])
    run([
        "colmap", "sequential_matcher",
        "--database_path", str(database_path),
        "--SequentialMatching.overlap", "10",
    ])
    run([
        "colmap", "mapper",
        "--database_path", str(database_path),
        "--image_path", str(frames_dir),
        "--output_path", str(sparse_dir),
    ])
    print(f"COLMAP reconstruction written to {sparse_dir}")


def train_splat(project_dir: Path, frames_dir: Path, output_dir: Path, iterations: int = 7000):
    """Step 3: train the Gaussian Splat model."""
    run([
        "python3", "/app/gaussian-splatting/train.py",
        "-s", str(project_dir),
        "-m", str(output_dir),
        "--iterations", str(iterations),
    ])


def export_ply(output_dir: Path, final_output: Path):
    """Step 4: locate the trained model and copy it to the final output path."""
    point_cloud_dir = output_dir / "point_cloud"
    candidates = sorted(point_cloud_dir.glob("iteration_*/point_cloud.ply"))
    if not candidates:
        print(f"[ERROR] No point_cloud.ply found under {point_cloud_dir}")
        sys.exit(1)
    latest = candidates[-1]
    final_output.parent.mkdir(parents=True, exist_ok=True)
    run(["cp", str(latest), str(final_output)])
    print(f"\nDone. Final splat file: {final_output}")


def main():
    parser = argparse.ArgumentParser(description="RealMeta video-to-3D pipeline")
    parser.add_argument("--input", required=True, help="Path to the input .mp4 video")
    parser.add_argument("--output", required=True, help="Directory to write results into")
    parser.add_argument("--fps", type=int, default=2, help="Frames per second to extract (default: 2)")
    parser.add_argument("--iterations", type=int, default=7000, help="Training iterations (default: 7000)")
    parser.add_argument(
        "--max-width", type=int, default=1280,
        help="Downscale video to this max width before processing (default: 1280). Use 0 to skip compression.",
    )
    args = parser.parse_args()

    video_path = Path(args.input)
    output_root = Path(args.output)
    compressed_path = output_root / "compressed_input.mp4"
    project_dir = output_root / "project"
    frames_dir = project_dir / "images"
    training_dir = output_root / "training"
    final_output = output_root / "result.ply"

    if not video_path.exists():
        print(f"[ERROR] Input video not found: {video_path}")
        sys.exit(1)

    print("=" * 70)
    print("RealMeta video-to-3D pipeline")
    print("=" * 70)

    if args.max_width > 0:
        compress_video(video_path, compressed_path, max_width=args.max_width)
        video_to_process = compressed_path
    else:
        print("Skipping compression step (--max-width 0)")
        video_to_process = video_path

    extract_frames(video_to_process, frames_dir, fps=args.fps)
    run_colmap(project_dir, frames_dir)
    train_splat(project_dir, frames_dir, training_dir, iterations=args.iterations)
    export_ply(training_dir, final_output)


if __name__ == "__main__":
    main()