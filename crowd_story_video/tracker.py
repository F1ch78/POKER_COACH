"""Pass 1: YOLO person detection + ByteTrack, then ID stitching."""
import json
import os

import cv2


def run_tracking(cfg):
    from ultralytics import YOLO

    model = YOLO(cfg["yolo_model"])
    cap = cv2.VideoCapture(cfg["input"])
    tracks = {}
    frame_idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        res = model.track(frame, persist=True, classes=[0], conf=cfg["conf"],
                          imgsz=cfg["imgsz"], tracker=cfg["tracker"], verbose=False)[0]
        if res.boxes is not None and res.boxes.id is not None:
            for box, tid, conf in zip(res.boxes.xyxy.tolist(),
                                      res.boxes.id.int().tolist(),
                                      res.boxes.conf.tolist()):
                if box[3] - box[1] < cfg["min_box_h"]:
                    continue
                tracks.setdefault(tid, []).append([frame_idx, *box, conf])
        frame_idx += 1
        if frame_idx % 30 == 0:
            print(f"tracking: {frame_idx} frames", flush=True)
    cap.release()
    return stitch_ids(tracks, cfg)


def _center(row):
    return (row[1] + row[3]) / 2, (row[2] + row[4]) / 2


def stitch_ids(tracks, cfg):
    """Re-attach a track that starts shortly after, and near, where another ended."""
    gap_max = cfg["reid_max_gap_frames"]
    order = sorted(tracks, key=lambda t: tracks[t][0][0])
    ended = {}  # id -> last row, only for tracks not yet continued
    remap = {}
    for tid in order:
        first = tracks[tid][0]
        best, best_d = None, None
        for other, last in ended.items():
            gap = first[0] - last[0]
            if gap <= 0 or gap > gap_max:
                continue
            (x1, y1), (x2, y2) = _center(last), _center(first)
            d = ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5
            h = max(last[4] - last[2], first[4] - first[2])
            if d <= cfg["reid_max_dist_factor"] * h and (best_d is None or d < best_d):
                best, best_d = other, d
        if best is not None:
            remap[tid] = best
            del ended[best]
            tracks[best] = tracks[best] + tracks[tid]
            ended[best] = tracks[best][-1]
        else:
            ended[tid] = tracks[tid][-1]
    merged = {t: rows for t, rows in tracks.items() if t not in remap}
    print(f"tracks: {len(tracks)} raw -> {len(merged)} after stitching")
    return merged


def load_or_run(cfg):
    path = cfg["tracks_cache"]
    if os.path.exists(path):
        with open(path) as f:
            return {int(k): v for k, v in json.load(f).items()}
    tracks = run_tracking(cfg)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(tracks, f)
    return tracks
