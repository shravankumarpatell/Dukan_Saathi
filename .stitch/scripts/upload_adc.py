#!/usr/bin/env python3
"""Upload HTML/MD/PNG to Stitch via BatchCreateScreens using ADC (no API key)."""
from __future__ import annotations

import argparse
import base64
import json
import os
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request

GCLOUD = os.path.expandvars(
    r"%LOCALAPPDATA%\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
)
USER_PROJECT = "dukansaathi-4752"
MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".html": "text/html",
    ".htm": "text/html",
    ".md": "text/markdown",
}


def token() -> str:
    return subprocess.check_output(
        [GCLOUD, "auth", "application-default", "print-access-token"],
        text=True,
    ).strip()


def upload(project_id: str, path: pathlib.Path, title: str | None, generated_by: str | None) -> dict:
    mime = MIME[path.suffix.lower()]
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    file_obj = {"fileContentBase64": b64, "mimeType": mime}
    if mime in ("text/html", "text/markdown"):
        screen = {
            "htmlCode": file_obj,
            "screenType": "DOCUMENT",
            "isCreatedByClient": True,
            "generatedBy": generated_by
            or ("UserUploadedDesignMd" if mime == "text/markdown" else "stitch::extract-static-html"),
        }
    else:
        screen = {"screenshot": file_obj, "screenType": "IMAGE", "isCreatedByClient": True}
    if title:
        screen["title"] = title
    payload = {
        "parent": f"projects/{project_id}",
        "requests": [{"screen": screen}],
        "createScreenInstances": True,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"https://stitch.googleapis.com/v1/projects/{project_id}/screens:batchCreate",
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {token()}",
            "x-goog-user-project": USER_PROJECT,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {e.code} {path.name}: {err[:2000]}") from e


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--project-id", required=True)
    p.add_argument("--file", type=pathlib.Path)
    p.add_argument("--dir", type=pathlib.Path)
    p.add_argument("--manifest", type=pathlib.Path, help="JSON list of {file, title}")
    p.add_argument("--generated-by", default="stitch::extract-static-html")
    args = p.parse_args()

    jobs: list[tuple[pathlib.Path, str | None]] = []
    if args.manifest:
        items = json.loads(args.manifest.read_text(encoding="utf-8"))
        for it in items:
            jobs.append((pathlib.Path(it["file"]), it.get("title")))
    elif args.dir:
        for f in sorted(args.dir.glob("*.html")):
            jobs.append((f, f.stem.replace("__", " / ").replace("_", " ")))
    elif args.file:
        jobs.append((args.file, args.file.stem))
    else:
        raise SystemExit("Need --file, --dir, or --manifest")

    out = []
    for i, (path, title) in enumerate(jobs, 1):
        print(f"[{i}/{len(jobs)}] {title or path.name} ({path.stat().st_size} bytes)", flush=True)
        result = upload(args.project_id, path, title, args.generated_by)
        out.append({"title": title, "file": str(path), "result": result})
        print(json.dumps(result)[:500], flush=True)
    pathlib.Path("_upload_log.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"WROTE _upload_log.json ({len(out)} screens)")


if __name__ == "__main__":
    main()
