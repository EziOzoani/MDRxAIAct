"""
Purpose:
    Capture real pen/marker-on-skin photographs quickly, using the same camera
    and framing the demo itself uses.

    Why this exists. pen_drawn is the class visitors will actually exercise —
    someone picks up a biro, draws on their hand and points the camera at it —
    and it is the class that does not work. Of 400 images, roughly 25-33 show
    ink on skin (~7%); the rest are a keyword scrape of "pen" that returned
    stationery, notebooks and desks. No public dataset fills the gap: ~30
    queries across HuggingFace, Kaggle and the open web returned nothing for
    pen-on-skin at any Fitzpatrick range.

    So the images have to be taken. Doing it through the demo's own webcam has
    a second benefit beyond speed: training data collected this way is already
    in the deployment distribution — same sensor, same lighting, same framing
    reticle — which every measurement on this project has shown matters more
    than volume. Synthetic and composited substitutes were tried and their
    scores anti-correlated with real-photo performance.

    Captures are written straight to a labelled folder with a provenance record,
    so this class ends up with the documented origin the scraped ones lack.

Dependencies:
    - stdlib only (http.server); the browser does the capture

Usage:
    python collect_pen.py [--port 8092] [--label pen_drawn]
    then open http://localhost:8092/ and allow camera access

Tips for useful variety (the model needs range, not repetition):
    - different pens: biro, fineliner, gel, sharpie, coloured marker
    - different body parts: back of hand, palm, forearm, wrist, ankle
    - different people: skin tone diversity here is real, not simulated
    - different light: window, overhead, dim, direct
    - different framing: fill the reticle, then a little further back
    - a few smudged or half-rubbed-off, since that is what a real one looks like

Changes:
    2026-07-16: Initial.
"""

from __future__ import annotations

import argparse
import base64
import json
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent

PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>Collect pen-on-skin</title>
<style>
 :root{--bg:#0f1115;--fg:#e8eaed;--mut:#9aa0a6;--ac:#0F766E}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
 .wrap{max-width:760px;margin:0 auto;padding:18px}
 h1{font-size:18px;margin:0 0 2px}
 .sub{color:var(--mut);font-size:13px;margin-bottom:12px}
 .stage{position:relative;border-radius:12px;overflow:hidden;background:#000}
 video{width:100%;display:block;transform:scaleX(-1)}
 .reticle{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
          pointer-events:none}
 .box{position:relative;aspect-ratio:1;height:78%;border:2px dashed rgba(255,255,255,.85);
      border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,.35)}
 .hint{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);
       background:rgba(0,0,0,.6);padding:4px 10px;border-radius:99px;font-size:12px}
 .btns{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
 button{background:#222734;color:var(--fg);border:1px solid #333a49;border-radius:8px;
        padding:11px 16px;font-size:15px;cursor:pointer}
 button.go{background:var(--ac);border-color:var(--ac);color:#fff;font-weight:700;flex:1}
 button:hover{border-color:var(--ac)}
 .count{margin-top:12px;font-size:14px;color:var(--mut)}
 .strip{display:grid;grid-template-columns:repeat(8,1fr);gap:6px;margin-top:12px}
 .strip img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px}
 .tips{margin-top:16px;font-size:13px;color:var(--mut);line-height:1.7}
 kbd{background:#222734;border:1px solid #333a49;border-radius:4px;padding:1px 6px;font-size:12px}
</style></head><body><div class="wrap">
<h1>Collect pen-on-skin images</h1>
<div class="sub">Draw on your hand or arm with a pen, fill the square, and press
 <kbd>space</kbd>. Aim for 100+ across different pens, people and lighting.</div>
<div class="stage">
 <video id="v" autoplay playsinline muted></video>
 <div class="reticle"><div class="box"></div></div>
 <div class="hint">fill the square with the drawing</div>
</div>
<div class="btns">
 <button class="go" onclick="snap()">Capture (space)</button>
 <button onclick="flip()">Switch camera</button>
</div>
<div class="count" id="count">0 captured this session</div>
<div class="strip" id="strip"></div>
<div class="tips">
 <b>For a class that actually generalises, vary:</b><br>
 pens (biro / fineliner / gel / sharpie / coloured) &middot;
 body parts (back of hand, palm, forearm, wrist) &middot;
 <b>people — real skin-tone range matters more than anything else here</b> &middot;
 lighting (window, overhead, dim) &middot; a few smudged or half-rubbed-off.
</div></div>
<script>
const GUIDE=0.78; let stream=null, facing='environment', n=0;
async function start(){
 if(stream) stream.getTracks().forEach(t=>t.stop());
 try{ stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing,
        width:{ideal:1280},height:{ideal:720}}});
      document.getElementById('v').srcObject=stream; }
 catch(e){ document.querySelector('.sub').textContent='Camera unavailable: '+e.message; }
}
function flip(){ facing = facing==='environment' ? 'user' : 'environment'; start(); }
function snap(){
 const v=document.getElementById('v'); if(!v.videoWidth) return;
 // Crop exactly the reticle, so captures match what the demo sends to the model.
 const vw=v.videoWidth, vh=v.videoHeight, box=16/9, src=vw/vh;
 const visH = src>box ? vh : vw/box;
 const side = Math.round(GUIDE*visH);
 const sx=Math.round((vw-side)/2), sy=Math.round((vh-side)/2);
 const c=document.createElement('canvas'); c.width=640; c.height=640;
 const x=c.getContext('2d');
 x.drawImage(v, sx, sy, side, side, 0, 0, 640, 640);
 const data=c.toDataURL('image/jpeg',0.92);
 fetch('/save',{method:'POST',body:JSON.stringify({image:data})})
  .then(r=>r.json()).then(()=>{
    n++; document.getElementById('count').textContent=n+' captured this session';
    const im=document.createElement('img'); im.src=data;
    const s=document.getElementById('strip'); s.prepend(im);
    while(s.children.length>16) s.removeChild(s.lastChild);
  });
}
document.addEventListener('keydown',e=>{ if(e.code==='Space'){e.preventDefault();snap();} });
start();
</script></body></html>"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8092)
    ap.add_argument("--label", default="pen_drawn")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    out = Path(args.out) if args.out else BASE / "data" / "collected" / args.label
    out.mkdir(parents=True, exist_ok=True)
    meta = out.parent / f"{args.label}_provenance.json"

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
            if self.path == "/":
                return self._send(200, PAGE.encode(), "text/html; charset=utf-8")
            return self._send(404, b"not found", "text/plain")

        def do_POST(self):
            n = int(self.headers.get("Content-Length", 0))
            d = json.loads(self.rfile.read(n) or b"{}")
            img = d.get("image", "")
            if "," in img:
                raw = base64.b64decode(img.split(",", 1)[1])
                stamp = time.strftime("%Y%m%d-%H%M%S")
                idx = len(list(out.glob("*.jpg")))
                name = f"{args.label}_{stamp}_{idx:04d}.jpg"
                (out / name).write_bytes(raw)
                # Provenance the scraped classes never had: who, when, how.
                rec = json.loads(meta.read_text()) if meta.exists() else {
                    "label": args.label,
                    "method": "captured in-browser via collect_pen.py",
                    "note": "Self-collected. Reticle-cropped 640x640, same framing as the demo.",
                    "images": [],
                }
                rec["images"].append({"file": name, "captured": stamp})
                meta.write_text(json.dumps(rec, indent=1))
            return self._send(200, b'{"ok":true}')

    existing = len(list(out.glob("*.jpg")))
    print(f"saving to {out}  ({existing} already there)")
    print(f"provenance -> {meta}")
    print(f"Open http://localhost:{args.port}/  — press space to capture")
    HTTPServer(("localhost", args.port), H).serve_forever()


if __name__ == "__main__":
    main()
