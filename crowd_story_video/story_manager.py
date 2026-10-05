"""Pick the best-tracked people and assign captions to them."""


def score_track(rows, fps):
    n = len(rows)
    frames = rows[-1][0] - rows[0][0] + 1
    continuity = n / frames
    mean_h = sum(r[4] - r[2] for r in rows) / n
    mean_conf = sum(r[5] for r in rows) / n
    return (n / fps) * continuity * mean_conf * (mean_h ** 0.5)


def select_people(tracks, cfg, fps, size):
    cands = []
    for tid, rows in tracks.items():
        if len(rows) < cfg["min_track_frames"]:
            continue
        mid = rows[len(rows) // 2]
        cands.append((score_track(rows, fps), tid, ((mid[1] + mid[3]) / 2, mid[4], mid[0])))
    cands.sort(reverse=True)

    chosen = []
    for score, tid, (cx, cy, f) in cands:
        # reject if too close to an already chosen person at an overlapping time
        ok = True
        for _, other_tid, _ in chosen:
            o = tracks[other_tid]
            for r in tracks[tid][::10]:
                match = next((q for q in o if q[0] == r[0]), None)
                if match is None:
                    continue
                dx = (r[1] + r[3]) / 2 - (match[1] + match[3]) / 2
                dy = r[4] - match[4]
                if (dx * dx + dy * dy) ** 0.5 < cfg["min_spacing_px"]:
                    ok = False
                    break
            if not ok:
                break
        if ok:
            chosen.append((score, tid, (cx, cy, f)))
        if len(chosen) >= cfg["max_people"]:
            break
    return chosen


def assign_stories(chosen, tracks, stories, cfg, fps):
    """Best-scored people get the first stories; appearance times spread over the clip."""
    n = min(len(chosen), len(stories))
    t0, t1 = cfg["first_caption_sec"], cfg["last_caption_start_sec"]
    end = int(cfg["captions_fade_out_sec"] * fps)
    plan = {}
    # appear in order of story index, staggered; start no earlier than the person's track
    for i in range(n):
        _, tid, _ = chosen[i]
        rows = tracks[tid]
        sched = int((t0 + (t1 - t0) * i / max(n - 1, 1)) * fps)
        start = max(sched, rows[0][0])
        stop = min(end, rows[-1][0])
        if stop - start < fps:  # not on screen long enough after scheduling: show from track start
            start = rows[0][0]
        plan[tid] = {"text": stories[i], "start": start, "stop": stop}
    return plan
