#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def set_png_dpi(file_path: Path, dpi: float) -> None:
    temporary_path = file_path.with_suffix(file_path.suffix + ".dpi.tmp")
    with Image.open(file_path) as source:
        source.load()
        save_options = {
            "format": "PNG",
            "dpi": (dpi, dpi),
            "optimize": False,
            "compress_level": 6,
        }
        icc_profile = source.info.get("icc_profile")
        if icc_profile:
            save_options["icc_profile"] = icc_profile
        source.save(temporary_path, **save_options)
    os.replace(temporary_path, file_path)


def main() -> int:
    if len(sys.argv) < 3:
        raise SystemExit("Usage: set-png-dpi.py <dpi> <file.png> [file2.png ...]")
    dpi = float(sys.argv[1])
    if dpi <= 0:
        raise SystemExit("DPI must be greater than zero")
    for raw_path in sys.argv[2:]:
        file_path = Path(raw_path)
        if not file_path.exists():
            raise FileNotFoundError(file_path)
        set_png_dpi(file_path, dpi)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

