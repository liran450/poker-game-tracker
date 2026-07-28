"""Generate the PWA icon set: a poker chip in the app's accent amber.

No image library is available in this environment, so the PNGs are written by
hand — zlib + the four mandatory chunks. Keeping the generator in the repo means
the icons can be regenerated from the tokens rather than being opaque binaries.
"""
import struct
import zlib
import math
import os

SURFACE = (0x14, 0x11, 0x0D)   # --color-surface-app
ACCENT = (0xE9, 0xA2, 0x3C)    # --color-accent
ON_ACCENT = (0x1A, 0x15, 0x08) # --color-on-accent


def chip_pixel(x, y, size, inset):
    """A poker chip: amber disc, dark ring of edge spots, dark centre dot."""
    cx = cy = size / 2
    r = (size / 2) - inset
    dx, dy = x - cx + 0.5, y - cy + 0.5
    dist = math.hypot(dx, dy)

    if dist > r:
        return None  # transparent outside the disc

    # Six edge spots, evenly spaced, sitting just inside the rim.
    angle = math.atan2(dy, dx)
    spot_r = r * 0.845
    for i in range(6):
        a = (math.tau / 6) * i
        sx, sy = cx + spot_r * math.cos(a), cy + spot_r * math.sin(a)
        if math.hypot(x - sx + 0.5, y - sy + 0.5) < r * 0.115:
            return ON_ACCENT

    if dist > r * 0.93:
        return ON_ACCENT           # outer rim
    if dist < r * 0.30:
        return ON_ACCENT           # centre dot
    if r * 0.30 <= dist < r * 0.36:
        return ACCENT
    _ = angle
    return ACCENT


def build(size, inset_ratio, background=None):
    inset = size * inset_ratio
    rows = []
    for y in range(size):
        row = bytearray([0])  # filter type 0
        for x in range(size):
            px = chip_pixel(x, y, size, inset)
            if px is None:
                if background:
                    row += bytes(background) + b'\xff'
                else:
                    row += b'\x00\x00\x00\x00'
            else:
                row += bytes(px) + b'\xff'
        rows.append(bytes(row))
    return b''.join(rows)


def chunk(tag, data):
    return (struct.pack('>I', len(data)) + tag + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))


def write_png(path, size, inset_ratio, background=None):
    raw = build(size, inset_ratio, background)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as fh:
        fh.write(png)
    print(f'{path}  {size}x{size}  {len(png)} bytes')


out = os.environ['ICON_OUT']
os.makedirs(out, exist_ok=True)
write_png(f'{out}/icon-192.png', 192, 0.06)
write_png(f'{out}/icon-512.png', 512, 0.06)
# Maskable needs the safe zone: art inside the middle 80%, on an opaque field.
write_png(f'{out}/icon-maskable-512.png', 512, 0.20, background=SURFACE)
