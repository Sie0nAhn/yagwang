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
  for (const f of list.files) {
    if (await cache.match(f.url)) done += f.size;
    else todo.push(f);
  }

  if (todo.length) {
    const pct = () => Math.floor((done / total) * 100);
    show(`오프라인 저장 중 · ${pct()}%`);
    try {
      for (const f of todo) {
        const res = await fetch(f.url, { headers: { "x-yk-precache": "1" }, cache: "no-cache" });
        if (!res.ok || res.status !== 200) throw new Error(f.url + " " + res.status);
        await cache.put(f.url, res);
        done += f.size;
        show(`오프라인 저장 중 · ${pct()}%`);
      }
    } catch (e) {
      console.warn("[오프라인] 저장 실패", e);
      show("오프라인 저장이 중간에 끊겼어요 · 다시 열면 이어서 저장합니다", { warn: true });
      return;
    }
    show("오프라인 준비 완료 · 이제 인터넷 없이도 열립니다", { hideAfter: 6000 });
  }

  // 예전 버전 저장분은 지운다
  for (const n of await caches.keys()) {
    if (n.startsWith("yagwang-") && n !== name) await caches.delete(n);
  }
}

run();
