"""Image format handling.

Every image is stored once as lossless WebP (no quality loss, ~30% smaller than PNG), and is
converted to the format the user picks when they download it.
"""

from __future__ import annotations

import io
from typing import Literal

from PIL import Image

DownloadFormat = Literal["png", "jpeg", "webp"]

MEDIA_TYPES: dict[str, str] = {"png": "image/png", "jpeg": "image/jpeg", "webp": "image/webp"}
EXTENSIONS: dict[str, str] = {"png": "png", "jpeg": "jpg", "webp": "webp"}

STORAGE_CONTENT_TYPE = "image/webp"
STORAGE_EXTENSION = "webp"


def to_storage(data: bytes) -> bytes:
    """Re-encode a worker image as lossless WebP for storage."""
    with Image.open(io.BytesIO(data)) as img:
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="WEBP", lossless=True, method=4)
        return buf.getvalue()


def convert(data: bytes, fmt: DownloadFormat) -> bytes:
    """Convert a stored image to the requested download format, at maximum quality."""
    with Image.open(io.BytesIO(data)) as img:
        img = img.convert("RGB")
        buf = io.BytesIO()
        if fmt == "png":
            img.save(buf, format="PNG", compress_level=6)
        elif fmt == "jpeg":
            # quality 95 + no colour subsampling: visually lossless, widely compatible.
            img.save(buf, format="JPEG", quality=95, subsampling=0, optimize=True)
        else:
            img.save(buf, format="WEBP", lossless=True, method=4)
        return buf.getvalue()
