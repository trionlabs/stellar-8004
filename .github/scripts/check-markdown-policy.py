#!/usr/bin/env python3
"""Keep internal Markdown documents out of the tracked repository."""

from pathlib import PurePosixPath
import subprocess
import sys


paths = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")
allowed = {"readme.md", "contributing.md"}
unexpected = [
    path
    for path in paths
    if path.lower().endswith(".md")
    and PurePosixPath(path).name.lower() not in allowed
]
if unexpected:
    print("Keep these Markdown files locally, outside the Git index:", file=sys.stderr)
    print("\n".join(unexpected), file=sys.stderr)
    sys.exit(1)

print("Markdown policy passed: only README.md and CONTRIBUTING.md are tracked.")
