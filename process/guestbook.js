/* 방명록 — 남긴 메모가 파스텔 구슬이 되어 병에 떨어지고 쌓여요 */
(() => {
  const root = document.getElementById('guestbook');
  if (!root) return;

  // 본 사이트의 감각 9가지. 카드 색은 벽에서 또렷하게 보이도록 채도를 높였어요.
  // 본 사이트 아카이브와 같은 감각 색 — 구슬은 사이트의 marble 이미지를 이 색으로 물들여요
  // 부드러운 감각 색 — 영상의 라벤더빛 해 질 녘 톤에 맞춰 채도를 낮췄어요. 구슬은 사이트의 marble 이미지를 이 색으로 물들여요
  // 감각 색 — 피그마 팔레트(1132:87). 구슬은 사이트의 marble 이미지를 이 색으로 물들여요
  const SENSES = [
    ['서늘한 새벽공기', '#6541f2'], ['오후 4시의 햇살', '#f7fc71'], ['윤슬의 빤짝임', '#00bdde'],
    ['계절의 경계면', '#85ec3b'], ['고요한 정적의 소리', '#c648ff'], ['낯선 타인의 온기', '#ff7627'],
    ['비 오는 날의 흙냄새', '#b98f53'], ['이유없는 설렘', '#f553da'], ['첫눈을 보던 감각', '#00aeff']
  ];
  const $ = s => root.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = t => { const d = new Date(t); return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967295; };

  /* ---------- 저장소: Firebase가 있으면 공유, 없으면 이 기기에만 ---------- */
  const LS = 'yagwang-guestbook';
  const store = {
    shared: false,
    async init(onData) {
      const cfg = window.GB_FIREBASE;
      if (cfg && cfg.apiKey && !location.search.includes('gblocal')) {
        try {
          const V = '10.12.2';
          const app = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
          const fs = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
          const db = fs.initializeFirestore(app.initializeApp(cfg), { localCache: fs.persistentLocalCache() });
          const col = fs.collection(db, 'guestbook');
          this.add = e => fs.addDoc(col, { name: e.name, msg: e.msg, sense: e.sense, t: fs.serverTimestamp() });
          fs.onSnapshot(fs.query(col, fs.orderBy('t', 'desc'), fs.limit(300)), snap => {
            onData(snap.docs.map(d => { const x = d.data(); return { id: d.id, name: x.name, msg: x.msg, sense: x.sense, t: x.t ? x.t.toMillis() : Date.now() }; }));
          });
          this.shared = true;
          return;
        } catch (err) { console.warn('방명록: Firebase 연결 실패, 이 기기에 저장해요.', err); }
      }
      const read = () => { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch { return []; } };
      this.add = async e => { const all = read(); all.unshift({ ...e, id: 'l' + Date.now(), t: Date.now() }); try { localStorage.setItem(LS, JSON.stringify(all.slice(0, 300))); } catch {} onData(read()); };
      onData(read());
    }
  };

  /* ---------- 구슬 병: 남긴 메모가 구슬이 되어 떨어지고, 쌓이고, 굴러다녀요 ---------- */
  const board = $('.gb__board'), jar = $('.gb__jar'), grid = $('.gb__grid');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let entries = [], known = null;
  const bodies = new Map();           // id → { e, no, el, x, y, vx, vy, r, base }
  let W = 0, H = 0, scale = 1, awake = false, raf = 0, still = 0, seen = false, drag = null, pointer = null;
  const short = t => { const one = t.replace(/\s+/g, ' ').trim(); return one.length > 24 ? one.slice(0, 23) + '…' : one; };
  // 글이 길수록 큰 구슬 (짧은 한마디는 작고, 긴 글은 크게)
  const baseR = e => 28 + Math.sqrt(Math.min(e.msg.length, 140) / 140) * 56;
  const light = h => { const n = parseInt(h.slice(1), 16); return (.299 * (n >> 16) + .587 * (n >> 8 & 255) + .114 * (n & 255)) / 255 > .68; };

  function orbEl(e) {
    const [name, col] = SENSES[e.sense] || SENSES[0];
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'gb__orb' + (light(col) ? ' is-light' : ''); el.style.setProperty('--c', col);
    el.setAttribute('aria-label', `${name} — ${e.msg} (${e.name || '익명의 관객'})`);
    el.innerHTML = `<span>${esc(short(e.msg))}</span>`;
    el.dataset.id = e.id; jar.appendChild(el); return el;
  }
  function measure() {
    W = jar.clientWidth; H = jar.clientHeight;
    // 구슬이 많아지면 조금씩 작아져서 병에 다 들어가게
    let area = 0; bodies.forEach(b => { area += Math.PI * b.base * b.base; });
    scale = area ? Math.min(1, Math.sqrt(W * H * .5 / area)) : 1;
    bodies.forEach(b => { b.r = Math.max(16, b.base * scale); b.el.style.width = b.el.style.height = b.r * 2 + 'px'; b.el.style.setProperty('--fs', Math.max(9, b.r * .26) + 'px'); });
  }
  function place(b) { b.el.style.transform = `translate(${b.x - b.r}px, ${b.y - b.r}px)`; }

  function sync(list) {
    const ids = new Set(list.map(e => e.id));
    for (const [id, b] of bodies) if (!ids.has(id)) { b.el.remove(); bodies.delete(id); }
    const first = !known; let fresh = 0;
    list.slice().reverse().forEach((e, k) => {
      if (bodies.has(e.id)) return;
      const b = { e, el: orbEl(e), vx: 0, vy: 0, base: baseR(e), r: 0, x: 0, y: 0 };
      bodies.set(e.id, b);
      if (first) { b.x = 60 + Math.random() * Math.max(1, (jar.clientWidth || 600) - 120); b.y = -60 - k * 46 - Math.random() * 40; }
      else { b.x = (jar.clientWidth || 600) * (.35 + Math.random() * .3); b.y = -70 - fresh * 80; b.vx = (Math.random() - .5) * 2; b.el.classList.add('is-new'); fresh++; }
    });
    measure();
    bodies.forEach(b => { if (b.r && !b.placed) { b.x = Math.min(Math.max(b.x, b.r), W - b.r); b.placed = true; } place(b); });
    if (reduce) settle(); else if (seen) wake();
  }
  // 동작 줄이기: 떨어지는 모습 없이 바로 쌓인 상태로
  function settle() { bodies.forEach(b => { b.y = Math.min(b.y, H - b.r); }); for (let i = 0; i < 400; i++) step(1); bodies.forEach(place); }

  function step(k) {
    const list = [...bodies.values()], G = .42 * k;
    for (const b of list) {
      if (b === drag?.b) continue;
      b.vy += G; b.vx *= .996; b.vy *= .996;
      // 마우스가 지나가는 방향으로만 살짝 쓸려 가요 (멈춘 커서는 밀지 않아 잡을 수 있어요)
      if (pointer && pointer.sp > 2.5) { const dx = b.x - pointer.x, dy = b.y - pointer.y; if (dx * dx + dy * dy < (b.r + 14) ** 2) { b.vx += pointer.vx * .12; b.vy += pointer.vy * .12 - .4; } }
      b.x += b.vx * k; b.y += b.vy * k;
      if (b.y > H - b.r) { b.y = H - b.r; b.vy *= -.28; b.vx *= .965; if (Math.abs(b.vy) < .35) b.vy = 0; }
      if (b.x < b.r) { b.x = b.r; b.vx *= -.45; } if (b.x > W - b.r) { b.x = W - b.r; b.vx *= -.45; }
    }
    for (let it = 0; it < 4; it++) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], c = list[j], dx = c.x - a.x, dy = c.y - a.y, m = a.r + c.r, d2 = dx * dx + dy * dy;
      if (d2 >= m * m || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, over = m - d;
      const ma = a === drag?.b ? 0 : a.r * a.r, mc = c === drag?.b ? 0 : c.r * c.r, tot = ma + mc || 1;
      a.x -= nx * over * mc / tot; a.y -= ny * over * mc / tot; c.x += nx * over * ma / tot; c.y += ny * over * ma / tot;
      const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
      if (rv < 0) { const j2 = -(1.2) * rv / 2; a.vx -= j2 * nx * (mc / tot) * 2; a.vy -= j2 * ny * (mc / tot) * 2; c.vx += j2 * nx * (ma / tot) * 2; c.vy += j2 * ny * (ma / tot) * 2; }
      // 위에 얹힌 구슬은 옆으로 살짝 굴러 내려가게
      if (Math.abs(nx) < .25 && ny !== 0) { const top = ny > 0 ? a : c; top.vx += (Math.random() - .5) * .08; }
    }
  }
  function frame(t) {
    const dt = Math.min(2, (t - (frame.t || t)) / 16.67 || 1); frame.t = t;
    step(dt / 2); step(dt / 2);
    if (pointer) { pointer.sp *= .6; pointer.vx *= .6; pointer.vy *= .6; }
    let e = 0; bodies.forEach(b => { place(b); e += Math.abs(b.vx) + Math.abs(b.vy); });
    still = e / Math.max(1, bodies.size) < .03 && !drag && !pointer ? still + 1 : 0;
    if (still > 90) { awake = false; raf = 0; frame.t = 0; return; }
    raf = requestAnimationFrame(frame);
  }
  function wake() { if (reduce) return; still = 0; if (!awake) { awake = true; raf = requestAnimationFrame(frame); } }
  new IntersectionObserver(([en]) => { if (en.isIntersecting && !seen) { seen = true; wake(); } }, { threshold: .25 }).observe(jar);
  new ResizeObserver(() => { const w = W; measure(); if (w && w !== W) bodies.forEach(b => { b.x = Math.min(b.x, W - b.r); }); wake(); }).observe(jar);

  // 집어서 던지기 · 누르면 크게 보기 · 손을 대면 살짝 밀려나기
  const local = ev => { const r = jar.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  jar.addEventListener('pointerdown', ev => {
    const el = ev.target.closest('.gb__orb'); if (!el) return;
    const b = bodies.get(el.dataset.id), p = local(ev);
    drag = { b, dx: b.x - p.x, dy: b.y - p.y, px: p.x, py: p.y, moved: 0 }; el.setPointerCapture(ev.pointerId); el.classList.add('is-held'); wake();
  });
  jar.addEventListener('pointermove', ev => {
    const p = local(ev);
    if (!drag) { if (ev.pointerType === 'mouse') { const q = pointer || p; pointer = { x: p.x, y: p.y, vx: p.x - q.x, vy: p.y - q.y, sp: Math.hypot(p.x - q.x, p.y - q.y) }; if (pointer.sp > 2.5) wake(); } return; }
    const b = drag.b; drag.moved += Math.abs(p.x - drag.px) + Math.abs(p.y - drag.py);
    b.vx = (p.x - drag.px) * .9; b.vy = (p.y - drag.py) * .9; drag.px = p.x; drag.py = p.y;
    b.x = Math.min(Math.max(p.x + drag.dx, b.r), W - b.r); b.y = Math.min(p.y + drag.dy, H - b.r);
  });
  jar.addEventListener('pointerleave', () => { pointer = null; });
  const release = ev => {
    if (!drag) return; const { b, moved } = drag; b.el.classList.remove('is-held'); drag = null;
    if (moved < 6) { b.vx = b.vy = 0; openNote(b); } wake();
  };
  jar.addEventListener('pointerup', release); jar.addEventListener('pointercancel', release);
  jar.addEventListener('keydown', ev => { const el = ev.target.closest('.gb__orb'); if (el && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openNote(bodies.get(el.dataset.id)); } });

  // 크게 보기
  const dlg = $('.gb__dlg');
  function openNote(b) {
    const e = b.e, [name, col] = SENSES[e.sense] || SENSES[0];
    dlg.style.setProperty('--c', col); dlg.classList.toggle('is-light', light(col));
    dlg.querySelector('.gb__dlg-orb').innerHTML = `<span class="gb__note-sense">No.${String(b.no).padStart(4, '0')} · ${esc(name)}</span><p>${esc(e.msg)}</p><span class="gb__note-by">${esc(e.name || '익명의 관객')} · ${fmt(e.t)}</span>`;
    dlg.showModal();
  }
  dlg.addEventListener('click', ev => { if (ev.target === dlg || ev.target.closest('.gb__dlg-close')) dlg.close(); });

  // 모두 펼쳐 보기: 글을 다 읽을 수 있는 목록
  function drawGrid() {
    const n = entries.length;
    grid.innerHTML = entries.map((e, i) => { const [name, col] = SENSES[e.sense] || SENSES[0];
      return `<article class="gb__card" style="--c:${col}"><div class="gb__card-top"><span>No.${String(n - i).padStart(4, '0')}</span><span>${esc(name)}</span></div><p>${esc(e.msg)}</p><div class="gb__card-by"><span>${esc(e.name || '익명의 관객')}</span><span>${fmt(e.t)}</span></div></article>`; }).join('');
  }
  function render(list) {
    entries = list; const n = list.length;
    sync(list);
    list.forEach((e, i) => { const b = bodies.get(e.id); if (b) b.no = n - i; });
    drawGrid();
    known = new Set(list.map(e => e.id));
    $('.gb__num').textContent = n;
    root.classList.toggle('is-empty', !n);
  }
  const toggle = $('.gb__toggle');
  const setView = all => { board.classList.toggle('is-all', all); toggle.textContent = all ? '구슬로 보기' : '모두 펼쳐 보기'; if (!all) { measure(); wake(); } };
  toggle.addEventListener('click', () => setView(!board.classList.contains('is-all')));

  /* ---------- 쓰기 ---------- */
  const form = $('.gb__form'), msg = $('#gb-msg'), name = $('#gb-name'), count = $('.gb__count'), status = $('.gb__status');
  let sense = Math.floor(Math.random() * SENSES.length);
  $('.gb__senses').innerHTML = SENSES.map(([n, c], i) => `<button type="button" class="gb__sense" role="radio" data-i="${i}" style="--c:${c}" title="${n}" aria-label="${n}" aria-checked="false"></button>`).join('');
  const setSense = i => {
    sense = i;
    root.querySelectorAll('.gb__sense').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.i === i)));
    form.style.setProperty('--c', SENSES[i][1]); form.classList.toggle('is-light', light(SENSES[i][1])); $('.gb__sense-name').textContent = SENSES[i][0];
  };
  $('.gb__senses').addEventListener('click', ev => { const b = ev.target.closest('.gb__sense'); if (b) setSense(+b.dataset.i); });
  setSense(sense);
  const preview = $('.gb__preview');
  const grow = () => { preview.textContent = msg.value.trim() || '여기에 쓴 메모가 구슬에 비쳐요'; preview.classList.toggle('is-empty', !msg.value.trim()); const n = msg.value.length; count.textContent = `${n} / 140`; form.classList.toggle('is-ready', n > 0); };
  msg.addEventListener('input', grow); grow();
  msg.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); form.requestSubmit(); } });

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const text = msg.value.trim().slice(0, 140); if (!text) { msg.focus(); return; }
    const last = +(sessionStorage.getItem('gb-last') || 0);
    if (Date.now() - last < 15000) { status.textContent = '잠시 뒤에 다시 남겨 주세요.'; return; }
    form.classList.add('is-sending');
    try {
      await store.add({ name: name.value.trim().slice(0, 16), msg: text, sense });
      sessionStorage.setItem('gb-last', String(Date.now()));
      msg.value = ''; grow();
      status.textContent = '구슬이 병 속으로 떨어졌어요. 고마워요.';
    } catch (err) { console.warn(err); status.textContent = '지금은 저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요.'; }
    setTimeout(() => form.classList.remove('is-sending'), 600);
  });

  store.init(render).then(() => { $('.gb__where').textContent = store.shared ? '모든 관객의 메모가 한곳에 모여요' : '지금은 이 기기에만 저장돼요'; });
})();
