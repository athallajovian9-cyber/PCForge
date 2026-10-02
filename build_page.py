#!/usr/bin/env python3
"""Inline the scripts into one self-contained PCForge.html.

The ship format is a single .html with no dependencies - that is what the
launcher copies and points a browser at, so the page cannot reference a sibling
file that might not have been copied. This keeps ONE source of truth (sim_core.js
and ui.js, which the node tests also load) and produces a page that needs
nothing beside it.

    python3 build_page.py
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "index.html"
OUT = HERE / "PCForge.html"


def inline(html: str, filename: str) -> str:
    script = (HERE / filename).read_text(encoding="utf-8")
    if "</script" in script:
        raise SystemExit("  " + filename + " contains a closing script tag - it would break the page")
    tag = re.compile(r'\s*<script src="' + re.escape(filename) + r'"></script>')
    if not tag.search(html):
        raise SystemExit("  " + filename + " is not referenced by index.html")
    replacement = "\n\t<script>\n" + script + "\n\t</script>"
    return tag.sub(lambda m: replacement, html, count=1)


def main() -> int:
    html = SRC.read_text(encoding="utf-8")
    for name in ("sim_core.js", "ui.js"):
        html = inline(html, name)

    OUT.write_text(html, encoding="utf-8")

    # verify the artefact, not the intent: nothing may still point at a sibling
    external = re.findall(r'<script src="([^"]+)"', html)
    print("  wrote " + OUT.name + "  " + str(len(html)) + " chars")
    print("  external script references left: " + (str(external) if external else "none"))
    if external:
        print("  FAIL: the page is not self-contained")
        return 1
    for marker in ("SimCore", "PCFORGE", "vrambar"):
        if marker not in html:
            print("  FAIL: " + marker + " missing from the built page")
            return 1
    print("  self-contained: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
