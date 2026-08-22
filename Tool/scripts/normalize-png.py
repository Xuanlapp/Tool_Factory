#!/usr/bin/env python3
"""Create an Illustrator-safe PNG without reducing source resolution."""
from __future__ import annotations

import os
import sys
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def main() -> int:
    if len(sys.argv) != 4:
        raise SystemExit("Usage: normalize-png.py <source.png> <target.png> <max-dimension>")

    source_path = Path(sys.argv[1])
    target_path = Path(sys.argv[2])
    max_dimension = int(float(sys.argv[3]))

    target_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = target_path.with_suffix(target_path.suffix + ".tmp")

    try:
        with Image.open(source_path) as source:
            source.load()
            image = source.convert("RGBA")
            if max_dimension > 0:
                image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
            image.save(temporary_path, format="PNG", optimize=False, compress_level=6)
        os.replace(temporary_path, target_path)
    except Exception:
        try:
            temporary_path.unlink()
        except FileNotFoundError:
            pass
        raise
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

