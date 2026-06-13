#!/usr/bin/env python3
"""Generate Sundial's toolbar icons (sun = light/off, moon = dark/on).

Toolbar action icons must be raster PNGs, so we draw simple, reproducible glyphs
at 16/32/48/128 px. Uses only the Python standard library (no Pillow) — run from
anywhere:

    python3 scripts/gen-icons.py

Anti-aliasing comes from 4x4 supersampled coverage; PNGs are written by hand
(zlib + CRC), so there are no dependencies to install.
"""

import math
import os
import struct
import zlib

SIZES = [16, 32, 48, 128]
SUN = (251, 177, 60)    # warm gold — reads on light and dark toolbars
MOON = (220, 224, 232)  # pale slate
SS = 4                  # supersample factor per axis
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")


def _dist_to_segment(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    seg_len2 = vx * vx + vy * vy
    t = 0.0 if seg_len2 == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / seg_len2))
    return math.hypot(px - (ax + t * vx), py - (ay + t * vy))


def _sun_tester(size):
    c = size / 2
    core = size * 0.22
    half_w = max(size * 0.04, 0.6)
    inner, outer = core * 1.3, size * 0.46
    rays = []
    for i in range(8):
        a = 2 * math.pi * i / 8
        rays.append((c + math.cos(a) * inner, c + math.sin(a) * inner,
                     c + math.cos(a) * outer, c + math.sin(a) * outer))

    def inside(x, y):
        if (x - c) ** 2 + (y - c) ** 2 <= core * core:
            return True
        for ax, ay, bx, by in rays:
            if _dist_to_segment(x, y, ax, ay, bx, by) <= half_w:
                return True
        return False

    return inside


def _moon_tester(size):
    c = size / 2
    r = size * 0.36
    cx2, cy2, rc = c + r * 0.55, c - r * 0.18, r * 0.95

    def inside(x, y):
        in_full = (x - c) ** 2 + (y - c) ** 2 <= r * r
        in_carve = (x - cx2) ** 2 + (y - cy2) ** 2 <= rc * rc
        return in_full and not in_carve

    return inside


def _render(size, tester, color):
    r, g, b = color
    rows = []
    step = 1.0 / SS
    samples = SS * SS
    for y in range(size):
        row = bytearray()
        for x in range(size):
            hits = 0
            for sy in range(SS):
                py = y + (sy + 0.5) * step
                for sx in range(SS):
                    if tester(x + (sx + 0.5) * step, py):
                        hits += 1
            row += bytes((r, g, b, round(255 * hits / samples)))
        rows.append(bytes(row))
    return rows


def _write_png(path, size, rows):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    raw = bytearray()
    for row in rows:
        raw.append(0)  # filter type 0 (None)
        raw.extend(row)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        f.write(chunk(b"IEND", b""))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        _write_png(os.path.join(OUT_DIR, f"sun-{size}.png"), size, _render(size, _sun_tester(size), SUN))
        _write_png(os.path.join(OUT_DIR, f"moon-{size}.png"), size, _render(size, _moon_tester(size), MOON))
    print(f"Wrote sun/moon icons ({', '.join(map(str, SIZES))} px) to {OUT_DIR}")


if __name__ == "__main__":
    main()
