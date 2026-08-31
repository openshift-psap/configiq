#!/usr/bin/env python3
"""Install a service's runtime dependencies from its own pyproject.toml.

Shared by the service Containerfiles (aiconfigurator, aicostings) so each
service's [project.dependencies] list is the single source of truth. A
hand-copied duplicate in the Containerfile previously drifted from pyproject
and dropped a dependency (ijson), crash-looping the container at runtime.

Two deps are handled specially rather than installed from PyPI:
  - configiq  — the shared library, a path dependency installed separately from
                the source copy at /src/configiq-py. It's filtered out here
                (there is no `configiq` on PyPI to resolve).
  - aiconfigurator / aiconfigurator-core — the SDK + its Rust-compiled core,
                published as wheels by the Red Hat fork and resolved from its
                GitHub Release assets via --find-links (passed by the caller).

Runs under whichever interpreter invokes it (`sys.executable -m pip`), so it
targets the venv in aiconfigurator's image and the system Python in aicostings'.

Usage:
  python install-deps.py <path-to-pyproject.toml> [--find-links URL ...]
"""
import subprocess
import sys
import tomllib


def main() -> int:
    if len(sys.argv) < 2:
        print(f"usage: {sys.argv[0]} <pyproject.toml> [--find-links URL ...]", file=sys.stderr)
        return 2

    pyproject_path = sys.argv[1]
    passthrough = sys.argv[2:]  # e.g. --find-links <url>, forwarded to pip as-is

    with open(pyproject_path, "rb") as f:
        deps = tomllib.load(f)["project"]["dependencies"]

    # configiq is the path-dep installed from source elsewhere in the build.
    deps = [d for d in deps if not d.lower().startswith("configiq")]

    cmd = [sys.executable, "-m", "pip", "install", "--no-cache-dir", *passthrough, *deps]
    print("+ " + " ".join(cmd), file=sys.stderr)
    return subprocess.call(cmd)


if __name__ == "__main__":
    raise SystemExit(main())
