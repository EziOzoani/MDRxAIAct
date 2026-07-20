"""
Purpose:
    Re-review the pen_drawn images with the class DEFINITION stated on screen,
    after a first pass produced an ambiguous result.

    In the initial adjudication 8 of 11 pen_drawn images were confirmed, giving
    72.7% correct — but a visual audit of the same class had estimated ~2%.
    Inspection showed the gap is definitional, not a disagreement about the
    images: two of the confirmed files are marker pens on a whiteboard ledge and
    markers on a desk. They genuinely are pens, so "pen_drawn" reads as correct;
    they are not ink drawn on a person, so for this classifier they are useless.

    The class the demo needs is "pen or marker drawn on human SKIN" — a visitor
    points a camera at their arm and the model must judge the marks on it. A
    photo of stationery teaches nothing about that, and is why the served model
    returns pen_drawn at 0.99 for a blank wall.

    This tool therefore shows the full-size image with one explicit question and
    two answers, so the definition cannot be misread. It writes to the same
    decisions file as the other curation tools.

Dependencies:
    - stdlib only (http.server)

Usage:
    python recheck_pen.py [--port 8091]

Changes:
    2026-07-16: Initial.
"""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"

PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>Re-check: pen on skin?</title>
<style>
 :root{--bg:#0f1115;--fg:#e8eaed;--mut:#9aa0a6;--ok:#0F766E;--no:#b91c1c}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
 .wrap{max-width:1150px;margin:0 auto;padding:20px}
 h1{font-size:18px;margin:0 0 4px}
 .q{background:#171a21;border:1px solid #2b3140;border-left:4px solid var(--ok);
    border-radius:8px;padding:12px 14px;margin:12px 0 18px}
 .q b{color:#fff}
 .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
 .cell{background:#171a21;border:2px solid #262b36;border-radius:10px;overflow:hidden}
 .cell.yes{border-color:var(--ok)} .cell.no{border-color:var(--no)}
 .cell img{width:100%;aspect-ratio:1;object-fit:contain;background:#000;display:block}
 .row{display:flex}
 .row button{flex:1;border:0;padding:10px;font-size:13px;font-weight:700;cursor:pointer;
             background:#222734;color:var(--fg)}
 .row button.y:hover,.cell.yes .y{background:var(--ok);color:#fff}
 .row button.n:hover,.cell.no  .n{background:var(--no);color:#fff}
 .fn{padding:6px 8px;font-size:11px;color:var(--mut);word-break:break-all}
 .done{margin-top:16px;color:var(--mut);font-size:13px}
</style></head><body><div class="wrap">
<h1>Re-check &mdash; is this pen/marker on SKIN?</h1>
<div class="q"><b>The question:</b> does this image show <b>a person's skin with pen or
 marker drawn on it</b>?<br>
 A photo of pens, paper, notebooks or a desk is <b>NO</b> &mdash; even though it contains a pen.
 The classifier has to judge marks on a body, so stationery photos actively mislead it.</div>
<div class="grid" id="grid"></div>
<div class="done" id="done"></div></div>
<script>
let items=[],dec={};
fetch('/items').then(r=>r.json()).then(d=>{items=d.items;dec=d.decisions||{};render()});
function render(){
 const g=document.getElementById('grid');g.innerHTML='';
 items.forEach(it=>{
  const d=dec[it.path];
  const el=document.createElement('div');
  el.className='cell'+(d==='pen_drawn'?' yes':(d==='delete'?' no':''));
  el.innerHTML=`<img src="/img?p=${encodeURIComponent(it.path)}">
   <div class="fn">${it.path.split('/').pop()}</div>
   <div class="row"><button class="y" onclick="set('${it.path}','pen_drawn')">YES &mdash; on skin</button>
   <button class="n" onclick="set('${it.path}','delete')">NO &mdash; not on skin</button></div>`;
  g.appendChild(el);
 });
 const y=Object.values(dec).filter(v=>v==='pen_drawn').length;
 const n=Object.values(dec).filter(v=>v==='delete').length;
 document.getElementById('done').textContent=
  `${y+n} of ${items.length} decided · ${y} on skin · ${n} not on skin`;
}
function set(p,v){dec[p]=v;
 fetch('/decide',{method:'POST',body:JSON.stringify({path:p,decision:v})});render();}
</script></body></html>"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8091)
    ap.add_argument("--decisions", default=str(BASE / "curation_decisions.json"))
    args = ap.parse_args()

    queue = json.loads((BASE / "gold_adjudication_queue.json").read_text())
    items = [{"path": r["path"]} for r in queue if r["label"] == "pen_drawn"]
    dpath = Path(args.decisions)

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code, body, ctype="application/json"):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            u = urlparse(self.path)
            if u.path == "/":
                return self._send(200, PAGE.encode(), "text/html; charset=utf-8")
            if u.path == "/items":
                d = json.loads(dpath.read_text()) if dpath.exists() else {}
                return self._send(200, json.dumps({"items": items, "decisions": d}).encode())
            if u.path == "/img":
                rel = parse_qs(u.query).get("p", [""])[0]
                t = (DATA / rel).resolve()
                if not str(t).startswith(str(DATA.resolve())) or not t.exists():
                    return self._send(404, b"not found", "text/plain")
                return self._send(200, t.read_bytes(), "image/png")
            return self._send(404, b"not found", "text/plain")

        def do_POST(self):
            n = int(self.headers.get("Content-Length", 0))
            b = json.loads(self.rfile.read(n) or b"{}")
            d = json.loads(dpath.read_text()) if dpath.exists() else {}
            if b.get("path"):
                d[b["path"]] = b.get("decision")
                dpath.write_text(json.dumps(d, indent=1))
            return self._send(200, b'{"ok":true}')

    print(f"{len(items)} pen_drawn images to re-check")
    print(f"Open http://localhost:{args.port}/")
    HTTPServer(("localhost", args.port), H).serve_forever()


if __name__ == "__main__":
    main()
