/* ============================================================
   야광 — 오프라인용 서비스 워커
   offline.js 가 처음 열 때 모든 파일을 'yagwang-버전' 캐시에 저장해 둔다.
   이 워커는 같은 사이트의 요청을 저장해 둔 파일로 먼저 답하고, 없으면 인터넷에서 받는다.
   (그래서 인터넷이 끊겨도 아이패드 홈 화면 앱으로 그대로 돌아간다)

   영상은 브라우저가 조각(Range)으로 나눠 달라고 하므로 저장된 파일을 잘라서 준다.
   ============================================================ */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;              // 다른 곳(글꼴 서비스 등)은 손대지 않는다
  if (url.pathname.endsWith("/offline-files.json")) return;     // 저장 목록은 늘 새로 받는다
  if (req.headers.get("x-yk-precache")) return;                 // 저장하려고 받는 중이면 인터넷에서 바로
  if (req.method !== "GET" && req.method !== "HEAD") return;
  event.respondWith(answer(req));
});

async function answer(req) {
  let hit;
  try {
    hit = req.mode === "navigate"
      ? await caches.match(req, { ignoreSearch: true })           // 페이지는 ?뒤 꼬리표가 달라도 같은 것으로
      : await caches.match(req, { ignoreMethod: true, ignoreVary: true });
  } catch { hit = null; }
  if (!hit) return fetch(req);

  if (req.method === "HEAD") return new Response(null, { status: 200, headers: hit.headers });
  const range = req.headers.get("range");
  return range ? slice(hit, range) : hit;
}

/* 영상 조각 — bytes=시작-끝 만큼 잘라서 206 으로 준다 */
async function slice(res, range) {
  const blob = await res.blob();
  const size = blob.size;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = 0, end = size - 1;
  if (m) {
    if (m[1] === "" && m[2] !== "") { start = Math.max(0, size - Number(m[2])); }   // 끝에서부터 n 바이트
    else {
      start = Number(m[1] || 0);
      if (m[2] !== "") end = Math.min(Number(m[2]), size - 1);
    }
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "video/mp4",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}
