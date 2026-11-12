/* 방명록 — 감각 색 메모가 천천히 흘러가요 */
(() => {
  const root = document.getElementById('guestbook');
  if (!root) return;

  // 본 사이트의 감각 9가지. 카드 색은 벽에서 또렷하게 보이도록 채도를 높였어요.
  const SENSES = [
    ['서늘한 새벽공기', '#3d6bff'], ['오후 4시의 햇살', '#ff6a1f'], ['윤슬의 빤짝임', '#14a6d9'],
    ['계절의 경계면', '#16b26a'], ['고요한 정적의 소리', '#b9a2ef'], ['낯선 타인의 온기', '#ff5a4e'],
    ['비 오는 날의 흙냄새', '#8f6a4f'], ['이유없는 설렘', '#ff4fc1'], ['첫눈을 보던 감각', '#e8edf3']
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

  /* ---------- 보드: 색 메모가 여러 줄로 천천히 흘러가요 (전체 보기에서는 격자로) ---------- */
  const board = $('.gb__board'), flow = $('.gb__flow'), grid = $('.gb__grid');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let entries = [], known = null, lastAdded = null;
  const sizeOf = n => n <= 12 ? 's-xl' : n <= 28 ? 's-l' : n <= 60 ? 's-m' : 's-s';

  function card(e, no) {
    const [name, col] = SENSES[e.sense] || SENSES[0];
    return `<article class="gb__note ${sizeOf(e.msg.length)}${e.id === lastAdded ? ' is-new' : ''}" style="--c:${col}">
      <div class="gb__note-top"><span>No.${String(no).padStart(4, '0')}</span><span>${esc(name)}</span></div>
      <p>${esc(e.msg)}</p>
      <div class="gb__note-by"><span>${esc(e.name || '익명의 관객')}</span><span>${fmt(e.t)}</span></div></article>`;
  }

  function draw() {
    const n = entries.length, cards = entries.map((e, i) => card(e, n - i));
    grid.innerHTML = cards.join('');
    // 흐르는 줄: 메모 수에 따라 1~3줄. 줄마다 방향과 속도를 달리해요
    const lanes = n < 5 ? 1 : n < 14 ? 2 : 3;
    const rows = Array.from({ length: lanes }, () => []);
    cards.forEach((c, i) => rows[i % lanes].push(c));
    flow.innerHTML = rows.map((r, i) => {
      let items = r.slice(); while (items.length && items.length < 7) items = items.concat(r); // 화면보다 길게
      const html = items.join('');
      return `<div class="gb__lane${i % 2 ? ' is-rev' : ''}"><div class="gb__track" style="--dur:${Math.round(items.length * (i % 2 ? 11 : 9))}s">${html}${html}</div></div>`;
    }).join('');
    $('.gb__num').textContent = n;
    root.classList.toggle('is-empty', !n);
    lastAdded = null;
  }

  function render(list) {
    if (known) { const fresh = list.find(e => !known.has(e.id)); if (fresh) lastAdded = fresh.id; }
    known = new Set(list.map(e => e.id));
    entries = list; draw();
  }

  // 흐르는 보기 ↔ 모두 펼쳐 보기
  const toggle = $('.gb__toggle');
  const setView = all => { board.classList.toggle('is-all', all); toggle.textContent = all ? '흐르게 보기' : '모두 펼쳐 보기'; };
  toggle.addEventListener('click', () => setView(!board.classList.contains('is-all')));
  if (reduce) setView(true);

  /* ---------- 쓰기 ---------- */
  const form = $('.gb__form'), msg = $('#gb-msg'), name = $('#gb-name'), count = $('.gb__count'), status = $('.gb__status');
  let sense = Math.floor(Math.random() * SENSES.length);
  $('.gb__senses').innerHTML = SENSES.map(([n, c], i) => `<button type="button" class="gb__sense" role="radio" data-i="${i}" style="--c:${c}" title="${n}" aria-label="${n}" aria-checked="false"></button>`).join('');
  const setSense = i => {
    sense = i;
    root.querySelectorAll('.gb__sense').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.i === i)));
    form.style.setProperty('--c', SENSES[i][1]); $('.gb__sense-name').textContent = SENSES[i][0];
  };
  $('.gb__senses').addEventListener('click', ev => { const b = ev.target.closest('.gb__sense'); if (b) setSense(+b.dataset.i); });
  setSense(sense);
  const grow = () => { const n = msg.value.length; count.textContent = `${n} / 140`; form.classList.toggle('is-ready', n > 0); };
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
      status.textContent = '메모가 흘러가기 시작했어요. 고마워요.';
    } catch (err) { console.warn(err); status.textContent = '지금은 저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요.'; }
    setTimeout(() => form.classList.remove('is-sending'), 600);
  });

  store.init(render).then(() => { $('.gb__where').textContent = store.shared ? '모든 관객의 메모가 한곳에 모여요' : '지금은 이 기기에만 저장돼요'; });
})();
