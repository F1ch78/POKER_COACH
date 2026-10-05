"""Draw captions over people with Pillow (smoothed, faded, clamped to frame)."""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/inter/Inter-SemiBold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "C:/Windows/Fonts/arialbd.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]
FADE = 10  # frames


def find_font(cfg):
    for p in ([cfg["font_path"]] if cfg.get("font_path") else []) + FONT_CANDIDATES:
        if p and os.path.exists(p):
            return p
    return None


class Renderer:
    def __init__(self, cfg, fps, size):
        self.cfg, self.fps, self.w, self.h = cfg, fps, size[0], size[1]
        self.font_path = find_font(cfg)
        self.fonts = {}
        self.pos = {}  # tid -> smoothed (x, y, boxh)

    def font(self, px):
        px = int(px)
        if px not in self.fonts:
            self.fonts[px] = (ImageFont.truetype(self.font_path, px) if self.font_path
                              else ImageFont.load_default())
        return self.fonts[px]

    def _alpha(self, f, start, stop):
        a = min(1.0, (f - start) / FADE, (stop - f) / FADE)
        return max(0.0, a)

    def _text(self, draw, xy, text, font, alpha):
        a = int(255 * alpha)
        x, y = xy
        draw.text((x + 1, y + 2), text, font=font, fill=(0, 0, 0, int(a * 0.6)))
        draw.text((x, y), text, font=font, fill=(255, 255, 255, a))

    def render(self, frame_bgr, f, rows_at, plan):
        img = Image.fromarray(frame_bgr[:, :, ::-1]).convert("RGBA")
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        c = self.cfg
        for tid, p in plan.items():
            row = rows_at.get(tid)
            if row is None or not (p["start"] <= f <= p["stop"]):
                continue
            x1, y1, x2, y2 = row[1:5]
            cx, top, bh = (x1 + x2) / 2, y1, y2 - y1
            if tid in self.pos:
                px, py, pb = self.pos[tid]
                s = c["smooth"]
                cx, top, bh = px + (cx - px) * s, py + (top - py) * s, pb + (bh - pb) * s
            self.pos[tid] = (cx, top, bh)
            font = self.font(min(c["font_max"], max(c["font_min"], bh * c["font_scale"])))
            l, t, r, b = d.textbbox((0, 0), p["text"], font=font)
            tw, th = r - l, b - t
            x = min(max(cx - tw / 2, 6), self.w - tw - 6)
            y = min(max(top - th - 8, 6), self.h - th - 6)
            self._text(d, (x, y), p["text"], font, self._alpha(f, p["start"], p["stop"]))
        self._finale(d, f)
        return np.array(Image.alpha_composite(img, layer).convert("RGB"))[:, :, ::-1]

    def _finale(self, d, f):
        c = self.cfg
        start = int(c["captions_fade_out_sec"] * self.fps)
        if f < start or not c.get("finale_text"):
            return
        font = self.font(self.w * 0.065)
        l, t, r, b = d.textbbox((0, 0), c["finale_text"], font=font)
        a = min(1.0, (f - start) / (self.fps * 0.4))
        self._text(d, ((self.w - (r - l)) / 2, self.h * 0.5), c["finale_text"], font, a)
