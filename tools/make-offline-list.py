#!/usr/bin/env python3
"""야광 — 오프라인 저장 목록(offline-files.json) 만들기

파일을 바꾸거나 영상을 교체했으면, 올리기 전에 웹 폴더에서 한 번 실행한다:

    python3 tools/make-offline-list.py

- 작품에 필요한 파일과 크기를 적는다. offline.js 가 이 목록대로 기기에 저장한다.
- version 은 파일 내용으로 정해진다. 무엇이든 바뀌면 version 이 바뀌고,
  아이패드는 다음에 인터넷이 될 때 바뀐 것만 새로 저장한다.
- index.html 의 ?v= 꼬리표를 읽어 main.js · style.css · sound.js · offline.js 주소에 붙인다.
"""
import hashlib
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

index = open("index.html", encoding="utf-8").read()
v = re.search(r'main\.js\?v=([\w-]+)', index).group(1)

files = [
    ("./", "index.html"),
    ("index.html", "index.html"),
    (f"style.css?v={v}", "style.css"),
    (f"main.js?v={v}", "main.js"),
    (f"sound.js?v={v}", "sound.js"),
    (f"offline.js?v={v}", "offline.js"),
    ("gooseulbit-garden.html", "gooseulbit-garden.html"),
    ("manifest.webmanifest", "manifest.webmanifest"),
    ("assets/marble.png", "assets/marble.png"),
    ("assets/fonts/Orbit-Regular.woff2", "assets/fonts/Orbit-Regular.woff2"),
    ("assets/icon-180.png", "assets/icon-180.png"),
    ("assets/icon-192.png", "assets/icon-192.png"),
    ("assets/icon-512.png", "assets/icon-512.png"),
]
for d, _, names in sorted(os.walk("vendor")):
    for n in sorted(names):
        if n.startswith(".") or n.endswith(".md"):
            continue
        p = os.path.join(d, n).replace(os.sep, "/")
        files.append((p, p))
# 영상 — 파편 9개와 본편 둘
for n in sorted(os.listdir(".")):
    if n.endswith(".mp4"):
        files.append((n, n))

h = hashlib.sha1()
out = []
for url, path in files:
    data = open(path, "rb").read()
    h.update(url.encode())
    h.update(hashlib.sha1(data).digest())
    out.append({"url": url, "size": len(data)})

manifest = {"version": h.hexdigest()[:10], "files": out}
with open("offline-files.json", "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=1)
total = sum(f["size"] for f in out)
print(f"offline-files.json · {len(out)}개 · {total / 1e6:.1f}MB · version {manifest['version']}")
