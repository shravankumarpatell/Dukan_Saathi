"""Talk to Stitch official MCP with ADC. Do not print tokens."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

GCLOUD = os.path.expandvars(
    r"%LOCALAPPDATA%\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
)
MCP = "https://stitch.googleapis.com/mcp"


def project_id() -> str:
    meta = Path("metadata.json")
    if meta.exists():
        return json.loads(meta.read_text(encoding="utf-8"))["projectId"]
    return "8295205211696409944"


def token() -> str:
    out = subprocess.check_output(
        [GCLOUD, "auth", "application-default", "print-access-token"],
        text=True,
    )
    return out.strip()


def mcp(method: str, params: dict | None = None, id_: int = 1) -> dict:
    body = {"jsonrpc": "2.0", "id": id_, "method": method, "params": params or {}}
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        MCP,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {token()}",
            "x-goog-user-project": "dukansaathi-4752",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read().decode())


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"
    if cmd == "list":
        r = mcp("tools/call", {"name": "list_projects", "arguments": {}})
        print(json.dumps(r, indent=2)[:8000])
        return
    if cmd == "schema":
        r = mcp("tools/list", {})
        wanted = set(sys.argv[2].split(",")) if len(sys.argv) > 2 else None
        tools = r.get("result", {}).get("tools", [])
        for t in tools:
            if wanted and t["name"] not in wanted:
                continue
            print("===", t["name"], "===")
            print(json.dumps(t.get("inputSchema"), indent=2)[:6000])
        return
    if cmd == "create":
        title = sys.argv[2] if len(sys.argv) > 2 else "DukanSaathi"
        r = mcp("tools/call", {"name": "create_project", "arguments": {"title": title}})
        print(json.dumps(r)[:8000])
        return
    if cmd == "delete":
        name = sys.argv[2]
        r = mcp("tools/call", {"name": "delete_project", "arguments": {"name": name}})
        print(json.dumps(r)[:4000])
        return
    if cmd == "screens":
        r = mcp("tools/call", {"name": "list_screens", "arguments": {"projectId": project_id()}})
        Path("_screens.json").write_text(json.dumps(r), encoding="utf-8")
        sc = r.get("result", {}).get("structuredContent") or {}
        print("keys", list(sc.keys()))
        screens = sc.get("screens") or sc.get("screen") or []
        if isinstance(screens, dict):
            screens = [screens]
        for s in screens:
            if isinstance(s, dict):
                print(s.get("title"), s.get("name") or s.get("id"))
            else:
                print(s)
        print("COUNT", len(screens) if hasattr(screens, "__len__") else screens)
        return
    if cmd == "upload-md":
        import base64

        md = Path("DESIGN.md").read_bytes()
        args = {
            "projectId": project_id(),
            "designMdBase64": base64.b64encode(md).decode("ascii"),
        }
        r = mcp("tools/call", {"name": "upload_design_md", "arguments": args})
        print(json.dumps(r)[:8000])
        return
    if cmd == "edit-one":
        sid = sys.argv[2]
        prompt_path = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("EDIT_SCREENS.txt")
        prompt = prompt_path.read_text(encoding="utf-8")
        args = {
            "projectId": project_id(),
            "deviceType": "DESKTOP",
            "selectedScreenIds": [sid],
            "prompt": prompt,
        }
        r = mcp("tools/call", {"name": "edit_screens", "arguments": args})
        print(json.dumps(r)[:4000])
        return
    if cmd == "gen":
        prompt = Path(sys.argv[2]).read_text(encoding="utf-8")
        args = {
            "projectId": project_id(),
            "deviceType": "DESKTOP",
            "modelId": "GEMINI_3_FLASH",
            "prompt": prompt,
        }
        ds = json.loads(Path("metadata.json").read_text(encoding="utf-8")).get("designSystem")
        if ds:
            args["designSystem"] = ds
        r = mcp("tools/call", {"name": "generate_screen_from_text", "arguments": args})
        out_path = Path(sys.argv[2]).with_suffix(".out.json")
        out_path.write_text(json.dumps(r), encoding="utf-8")
        sc = (r.get("result") or {}).get("structuredContent") or {}
        comps = sc.get("outputComponents") or []
        blob = json.dumps(r)
        for token in blob.split('"'):
            if "/screens/" in token:
                print("FOUND", token)
        print("sessionId", sc.get("sessionId"))
        print("sc_keys", list(sc.keys()))
        for c in comps:
            print("SCREEN", c.get("title"), c.get("name") or c.get("screenId") or list(c.keys())[:12])
        if not comps:
            print("no outputComponents; result keys", list((r.get("result") or {}).keys()))
        return
    if cmd == "call":
        name = sys.argv[2]
        raw = sys.argv[3] if len(sys.argv) > 3 else "{}"
        if raw.startswith("@"):
            args = json.loads(Path(raw[1:]).read_text(encoding="utf-8"))
        else:
            args = json.loads(raw)
        r = mcp("tools/call", {"name": name, "arguments": args})
        Path("_last.json").write_text(json.dumps(r), encoding="utf-8")
        print(json.dumps(r)[:4000])
        print("WROTE _last.json bytes", Path("_last.json").stat().st_size)
        return
    print("usage: list | schema names | call tool json-args | upload-md | edit-app | gen file")


if __name__ == "__main__":
    main()
