/* ============================================================
   야광 — 오프라인 저장
   인터넷이 될 때 한 번 열면, 작품에 필요한 모든 파일(영상 포함)을 기기에 저장한다.
   그 뒤엔 sw.js 가 저장된 파일로 답하므로 인터넷 없이 돌아간다.
   (아이패드는 사파리 → 공유 → '홈 화면에 추가' 한 뒤 그 아이콘으로 열어야 저장분이 지워지지 않는다)

   저장할 파일 목록은 offline-files.json — 파일을 바꾸면 tools/make-offline-list.py 로 다시 만든다.
   로컬(localhost)에서 작업할 땐 꺼 둔다. 예전 파일이 붙잡혀 고친 게 안 보이면 곤란하므로.
   주소에 ?offline 을 붙이면 로컬에서도 켜서 시험할 수 있다.
   ============================================================ */

const statusEl = document.getElementById("offlineStatus");
const ON = location.protocol === "https:" || /[?&]offline\b/.test(location.search);

function show(text, { warn = false, hideAfter = 0 } = {}) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.classList.toggle("is-warn", warn);
  statusEl.hidden = false;
  if (hideAfter) setTimeout(() => { statusEl.hidden = true; }, hideAfter);
}

/* 저장할 때 파일 내용 표(hash)를 붙여 둔다 — 다음 버전에서 같은 파일인지 알아보려고 */
function stamp(res, f) {
  const headers = new Headers(res.headers);
  headers.set("x-yk-size", String(f.size));
  if (f.hash) headers.set("x-yk-hash", f.hash);
  return new Response(res.body, { status: 200, statusText: "OK", headers });
}
function sameFile(res, f) {
  const hash = res.headers.get("x-yk-hash");
  if (hash && f.hash) return hash === f.hash;
  // 표가 없는 예전 저장분 — 영상·라이브러리·그림은 크기가 같으면 같은 파일로 본다 (페이지·스크립트는 다시 받는다)
  const big = /\.(mp4|wasm|task|png|woff2?|mjs)$|^vendor\//.test(f.url);
  const size = Number(res.headers.get("x-yk-size") || res.headers.get("content-length"));
  return big && size === f.size;
}

/* 손 인식이 다 뜬 뒤에 저장을 시작한다 — 약한 와이파이를 손 모델과 나눠 쓰지 않게 (늦어도 20초 뒤) */
function handReady() {
  if (window.__ykHandReady) return Promise.resolve();
  return new Promise((r) => {
    window.addEventListener("yk:hand-ready", r, { once: true });
    setTimeout(r, 20000);
  });
}

async function run() {
  if (!("serviceWorker" in navigator) || !window.caches) return;
  if (!ON) {
    // 로컬 작업 중엔 예전에 깔린 워커를 걷어 낸다
    const regs = await navigator.serviceWorker.getRegistrations();
    regs.forEach((r) => r.unregister());
    return;
  }

  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("[오프라인] 등록 실패", e));
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  await handReady();
  let list;
  try {
    const r = await fetch("offline-files.json", { cache: "no-store" });
    list = await r.json();
  } catch {
    // 인터넷이 없다 — 저장해 둔 게 있으면 그대로 돌아가고, 없으면 알려 준다
    const names = await caches.keys();
    if (!names.some((n) => n.startsWith("yagwang-"))) {
      show("오프라인 저장이 안 되어 있어요 · 인터넷이 될 때 한 번 열어 주세요", { warn: true });
    }
    return;
  }

  const name = "yagwang-" + list.version;
  const cache = await caches.open(name);
  const total = list.files.reduce((s, f) => s + f.size, 0);
  let done = 0;
  const todo = [];
  // 예전 버전 저장분 — 내용이 같은 파일은 다시 받지 않고 옮겨 온다.
  // (예전엔 무엇 하나만 고쳐도 영상까지 207MB 를 통째로 다시 받아서, 와이파이가 약하면 끝나지 않았다)
  const olds = [];
  for (const n of await caches.keys()) if (n.startsWith("yagwang-") && n !== name) olds.push(await caches.open(n));
  for (const f of list.files) {
    if (await cache.match(f.url)) { done += f.size; continue; }
    let moved = false;
    for (const old of olds) {
      const hit = await old.match(f.url);
      if (hit && sameFile(hit, f)) { await cache.put(f.url, hit); moved = true; break; }
    }
    if (moved) done += f.size;
    else todo.push(f);
  }

  if (todo.length) {
    const pct = () => Math.floor((done / total) * 100);
    show(`오프라인 저장 중 · ${pct()}%`);
    try {
      for (const f of todo) {
        const res = await fetch(f.url, { headers: { "x-yk-precache": "1" }, cache: "no-cache" });
        if (!res.ok || res.status !== 200) throw new Error(f.url + " " + res.status);
        await cache.put(f.url, stamp(res, f));
        done += f.size;
        show(`오프라인 저장 중 · ${pct()}%`);
      }
    } catch (e) {
      console.warn("[오프라인] 저장 실패", e);
      show("오프라인 저장이 중간에 끊겼어요 · 30초 뒤 이어서 저장해요", { warn: true, hideAfter: 8000 });
      setTimeout(run, 30000);         // 와이파이가 돌아오면 받은 데까지 두고 이어서
      return;
    }
    show("오프라인 준비 완료 · 이제 인터넷 없이도 열립니다", { hideAfter: 6000 });
  }

  // 다 저장했다는 표시 — sw.js 는 이 표시가 있는 저장분을 먼저 쓴다
  await cache.put(new URL("__yk_complete", location.href).href, new Response("1"));

  // 예전 버전 저장분은 지운다
  for (const n of await caches.keys()) {
    if (n.startsWith("yagwang-") && n !== name) await caches.delete(n);
  }
}

run();
