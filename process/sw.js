/* 프롬프트 북 — 홈 화면 앱용 서비스 워커
   갤럭시(크롬·삼성 인터넷)가 '앱 설치'로 알아보게 하는 최소한의 워커.
   늘 인터넷에서 받고, 끊겼을 때만 마지막으로 본 페이지를 보여 준다. */
const CACHE = "yk-process-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate") return;                 // 그 밖의 요청은 브라우저에 그대로 맡긴다
  event.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
