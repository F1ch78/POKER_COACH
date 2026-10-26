"""content_gen: python generate.py [jobs.json ...] [--prompt "..." --kind image|video ...]

Generates images and videos via Replicate (images + video) or OpenAI (images).
Results go to output/<run>/ together with manifest.json. Stdlib only, no pip install.
Keys come from env: REPLICATE_API_TOKEN, OPENAI_API_KEY. --dry-run skips API calls.
"""
import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

DEFAULT_MODELS = {
    ("replicate", "image"): "black-forest-labs/flux-schnell",
    ("replicate", "video"): "minimax/video-01",
    ("openai", "image"): "gpt-image-1",
}
OPENAI_SIZES = {"1:1": "1024x1024", "16:9": "1536x1024", "3:2": "1536x1024",
                "9:16": "1024x1536", "2:3": "1024x1536"}
POLL_TIMEOUT = 20 * 60


def http(method, url, headers=None, body=None, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return json.loads(raw) if "json" in r.headers.get("Content-Type", "") else raw
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {url} -> {e.code}: {e.read().decode(errors='replace')[:500]}")


def env_key(name):
    key = os.environ.get(name)
    if not key:
        raise RuntimeError(f"нет переменной окружения {name} (секрет репозитория)")
    return key


def replicate(job):
    auth = {"Authorization": f"Bearer {env_key('REPLICATE_API_TOKEN')}"}
    inp = {"prompt": job["prompt"]}
    if job["kind"] == "image":
        inp.update(aspect_ratio=job["aspect_ratio"], num_outputs=job["count"])
    inp.update(job.get("input", {}))
    pred = http("POST", f"https://api.replicate.com/v1/models/{job['model']}/predictions",
                {**auth, "Prefer": "wait=60"}, {"input": inp})
    deadline = time.time() + POLL_TIMEOUT
    while pred["status"] not in ("succeeded", "failed", "canceled"):
        if time.time() > deadline:
            raise RuntimeError(f"таймаут ожидания {pred['urls']['get']}")
        time.sleep(5)
        pred = http("GET", pred["urls"]["get"], auth)
    if pred["status"] != "succeeded":
        raise RuntimeError(f"replicate {pred['status']}: {pred.get('error')}")
    out = pred["output"]
    urls = out if isinstance(out, list) else [out]
    return [http("GET", u, timeout=600) for u in urls if isinstance(u, str)]


def openai(job):
    if job["kind"] != "image":
        raise RuntimeError("openai здесь поддерживает только изображения, для видео используйте replicate")
    body = {"model": job["model"], "prompt": job["prompt"], "n": job["count"],
            "size": OPENAI_SIZES.get(job["aspect_ratio"], "1024x1024")}
    body.update(job.get("input", {}))
    res = http("POST", "https://api.openai.com/v1/images/generations",
               {"Authorization": f"Bearer {env_key('OPENAI_API_KEY')}"}, body, timeout=300)
    return [base64.b64decode(d["b64_json"]) for d in res["data"]]


PROVIDERS = {"replicate": replicate, "openai": openai}


def ext_for(blob, kind):
    if blob[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if blob[:3] == b"\xff\xd8\xff":
        return "jpg"
    if blob[:4] == b"RIFF" and blob[8:12] == b"WEBP":
        return "webp"
    if blob[4:8] == b"ftyp":
        return "mp4"
    return "png" if kind == "image" else "mp4"


def normalize(job, defaults, i):
    job = {**defaults, **job}
    job.setdefault("kind", "image")
    job.setdefault("provider", "replicate")
    job.setdefault("aspect_ratio", "1:1")
    job["count"] = int(job.get("count", 1))
    if not job.get("model"):
        job["model"] = DEFAULT_MODELS.get((job["provider"], job["kind"]))
    if not job.get("prompt"):
        raise ValueError(f"задание {i}: пустой prompt")
    if job["provider"] not in PROVIDERS or not job["model"]:
        raise ValueError(f"задание {i}: {job['provider']} не умеет {job['kind']}")
    name = job.get("name") or job["prompt"][:40]
    job["name"] = re.sub(r"[^\w-]+", "_", name, flags=re.UNICODE).strip("_").lower() or f"job{i}"
    return job


def load_jobs(args):
    jobs = []
    for path in args.jobs:
        spec = json.load(open(path, encoding="utf-8"))
        jobs += [normalize(j, spec.get("defaults", {}), i) for i, j in enumerate(spec["jobs"], 1)]
    if args.prompt:
        cli = {k: v for k, v in dict(kind=args.kind, provider=args.provider, model=args.model,
                                     aspect_ratio=args.aspect_ratio, count=args.count,
                                     prompt=args.prompt, name=args.name).items() if v}
        jobs.append(normalize(cli, {}, len(jobs) + 1))
    return jobs


def main():
    p = argparse.ArgumentParser()
    p.add_argument("jobs", nargs="*", help="JSON-файлы с заданиями (см. jobs/example.json)")
    p.add_argument("--prompt")
    p.add_argument("--kind", choices=["image", "video"])
    p.add_argument("--provider", choices=list(PROVIDERS))
    p.add_argument("--model")
    p.add_argument("--aspect-ratio")
    p.add_argument("--count", type=int)
    p.add_argument("--name")
    p.add_argument("--out", default=os.path.join(os.path.dirname(__file__) or ".", "output"))
    p.add_argument("--run-id", default=time.strftime("%Y%m%d-%H%M%S"))
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    try:
        jobs = load_jobs(args)
    except (ValueError, KeyError, OSError) as e:
        p.error(str(e))
    if not jobs:
        p.error("укажите файл заданий или --prompt")
    out_dir = os.path.join(args.out, args.run_id)
    os.makedirs(out_dir, exist_ok=True)

    manifest, failed = [], 0
    for job in jobs:
        print(f"[{job['kind']}] {job['provider']}:{job['model']} {job['name']} x{job['count']}", flush=True)
        entry = {k: job[k] for k in ("name", "kind", "provider", "model", "prompt", "aspect_ratio", "count")}
        try:
            blobs = [] if args.dry_run else PROVIDERS[job["provider"]](job)
            entry["files"] = []
            for n, blob in enumerate(blobs, 1):
                fname = f"{job['name']}_{n}.{ext_for(blob, job['kind'])}"
                with open(os.path.join(out_dir, fname), "wb") as f:
                    f.write(blob)
                entry["files"].append(fname)
                print(f"  -> {fname}")
        except Exception as e:  # one bad job shouldn't lose the rest
            failed += 1
            entry["error"] = str(e)
            print(f"  ОШИБКА: {e}", file=sys.stderr)
        manifest.append(entry)

    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"готово: {len(jobs) - failed}/{len(jobs)} заданий, папка {out_dir}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
