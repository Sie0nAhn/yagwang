/* ============================================================
   야광 — 오프라인용 서비스 워커
   offline.js 가 처음 열 때 모든 파일을 'yagwang-버전' 캐시에 저장해 둔다.
   이 워커는 같은 사이트의 요청을 저장해 둔 파일로 먼저 답하고, 없으면 인터넷에서 받는다.
   (그래서 인터넷이 끊겨도 아이패드 홈 화면 앱으로 그대로 돌아간다)

   영상은 브라우저가 조각(Range)으로 나눠 달라고 하므로 저장된 파일을 잘라서 준다.

   페이지·스크립트(html · js · css · json)는 인터넷에서 먼저 받는다 — 고친 게 바로 보이게.
   (저장분부터 쓰면, 고쳐 올린 뒤에도 저장이 다 끝날 때까지 예전 작품이 떠 있었다.
    아이패드 조작판은 새것인데 작품은 예전 것이라 서로 말이 안 통한 적이 있다)
   3초 안에 안 오면 저장분으로 답하고, 그 뒤 1분은 곧장 저장분을 쓴다 (와이파이가 약할 때 매번 기다리지 않게).
   영상·손 모델·그림처럼 큰 파일은 지금처럼 저장분을 먼저 쓴다.
   ============================================================ */

const COMPLETE = new URL("__yk_complete", self.location.href).href;   // offline.js 가 다 저장하면 남기는 표시

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;              // 다른 곳(글꼴 서비스 등)은 손대지 않는다
  if (url.pathname.endsWith("/offline-files.json")) return;     // 저장 목록은 늘 새로 받는다
  if (req.headers.get("x-yk-precache")) return;                 // 저장하려고 받는 중이면 인터넷에서 바로
  if (req.method !== "GET" && req.method !== "HEAD") return;
  const code = req.mode === "navigate" ||
    (/\.(html|js|css|json|webmanifest)$/.test(url.pathname) && !url.pathname.includes("/vendor/"));
  event.respondWith(code ? fresh(req) : answer(req));
});

let slowUntil = 0;                      // 이 시각까지는 인터넷을 기다리지 않는다
async function fresh(req) {
  if (Date.now() < slowUntil || self.navigator.onLine === false) return answer(req);   // 인터넷이 없으면 기다리지 않는다
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(req.url, { signal: ctrl.signal, cache: "no-cache", credentials: "same-origin" });
    clearTimeout(timer);
    if (res.ok) return res;
  } catch {
    clearTimeout(timer);
    slowUntil = Date.now() + 60000;
  }
  return answer(req);
}

async function answer(req) {
  let hit = null;
  try {
    const opts = req.mode === "navigate"
      ? { ignoreSearch: true }                                     // 페이지는 ?뒤 꼬리표가 달라도 같은 것으로
      : { ignoreMethod: true, ignoreVary: true };
    // 다 저장된 것 중 가장 새것부터 찾는다 — 예전 버전 페이지가 먼저 걸려 고친 게 안 보이는 일이 없게.
    // 저장이 덜 된 새 버전은 뒤로 미룬다 (새 페이지만 있고 새 스크립트가 없으면 인터넷 없이 깨진다)
    for (const c of await cacheOrder()) {
      hit = await c.match(req, opts);
      if (hit) break;
    }
  } catch { hit = null; }
  if (!hit) return fetch(req);

  if (req.method === "HEAD") return new Response(null, { status: 200, headers: hit.headers });
  const range = req.headers.get("range");
  return range ? slice(hit, range, req.url.split("?")[0]) : hit;
}

/* 저장분 찾는 순서 — 요청마다 저장소를 다 열어 보지 않게 10초 동안 기억한다 */
let order = null, orderAt = 0, orderNames = "";
async function cacheOrder() {
  if (order && Date.now() - orderAt < 10000) return order;
  const names = (await caches.keys()).filter((n) => n.startsWith("yagwang-"));
  if (names.join() !== orderNames) { orderNames = names.join(); memo.clear(); }   // 새 버전이 저장됐으면 기억해 둔 영상도 비운다
  const done = [], partial = [];
  for (const n of names) {
    const c = await caches.open(n);
    ((await c.match(COMPLETE)) ? done : partial).push(c);
  }
  order = [...done.reverse(), ...partial];
  orderAt = Date.now();
  return order;
}

/* 영상 파일 통째 — 한 번 읽으면 기억해 둔다.
   예전엔 영상이 조각을 달라고 할 때마다 저장소에서 60MB 파일을 통째로 다시 읽어서 영상이 끊겼다.
   최근에 쓴 것부터 남기고, 합이 170MB 를 넘으면 오래된 것부터 내려놓는다 (본편 둘 + 파편 몇 개) */
const memo = new Map();
const MEMO_MAX = 170e6;
async function blobOf(res, key) {
  const had = memo.get(key);
  if (had) { memo.delete(key); memo.set(key, had); return had; }   // 최근 쓴 것으로 옮긴다
  const blob = await res.blob();
  memo.set(key, blob);
  let total = 0;
  for (const b of memo.values()) total += b.size;
  while (total > MEMO_MAX && memo.size > 1) {
    const [k, b] = memo.entries().next().value;
    memo.delete(k);
    total -= b.size;
  }
  return blob;
}

/* 영상 조각 — bytes=시작-끝 만큼 잘라서 206 으로 준다 */
async function slice(res, range, key) {
  const blob = await blobOf(res, key);
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
