#!/usr/bin/env python3
import sys
import zipfile
from pathlib import Path

src = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
# archive paths relative to parent of src so root folder is included
base = src.parent
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for p in src.rglob("*"):
        if p.is_file():
            z.write(p, p.relative_to(base).as_posix())
print(out)
