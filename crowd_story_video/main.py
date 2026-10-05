"""crowd_story_video: python main.py [config.json]

Detects/tracks people, assigns a caption to the best-tracked ones, renders final.mp4.
Delete output/tracks.json to force re-tracking.
"""
import json
import os
import subprocess
import sys

import cv2

from renderer import Renderer
from story_manager import assign_stories, select_people
from tracker import load_or_run


def main():
    cfg = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "config.json"))
    stories = json.load(open("stories.json", encoding="utf-8"))

    cap = cv2.VideoCapture(cfg["input"])
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    size = (int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))

    tracks = load_or_run(cfg)
    chosen = select_people(tracks, cfg, fps, size)
    plan = assign_stories(chosen, tracks, stories, cfg, fps)
    print(f"people tracked: {len(tracks)}, chosen: {len(chosen)}, captions placed: {len(plan)}")

    by_frame = {}
    for tid in plan:
        for row in tracks[tid]:
            by_frame.setdefault(row[0], {})[tid] = row

    os.makedirs(os.path.dirname(cfg["output"]), exist_ok=True)
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24",
         "-s", f"{size[0]}x{size[1]}", "-r", str(fps), "-i", "-",
         "-i", cfg["input"], "-map", "0:v", "-map", "1:a?",
         "-c:v", "libx264", "-crf", "17", "-pix_fmt", "yuv420p", "-c:a", "copy",
         "-shortest", cfg["output"]],
        stdin=subprocess.PIPE)
    r = Renderer(cfg, fps, size)
    f = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        ff.stdin.write(r.render(frame, f, by_frame.get(f, {}), plan).tobytes())
        f += 1
    ff.stdin.close()
    ff.wait()
    print("done:", cfg["output"])


if __name__ == "__main__":
    main()
