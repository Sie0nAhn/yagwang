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
    return `<article class="gb__note ${sizeOf(e.msg.length)}${e.id === lastAdded ? ' is-new' : ''}" style="--c:${col}" tabindex="0" data-no="${no}" data-i="${entries.indexOf(e)}">
      <span class="gb__note-sense">${esc(name)}</span>
      <p>${esc(e.msg)}</p>
      <span class="gb__note-by">${esc(e.name || '익명의 관객')}</span></article>`;
  }

  function draw() {
    const n = entries.length, cards = entries.map((e, i) => card(e, n - i));
    grid.innerHTML = cards.join('');
    // 흐르는 줄: 한 줄에 서로 다른 메모가 6장 이상일 때만 흐르게 해요.
    // 메모가 적으면 같은 메모를 반복하지 않고 한 줄에 가만히 놓아요.
    const lanes = Math.min(3, Math.floor(n / 6));
    if (!lanes) {
      flow.innerHTML = `<div class="gb__lane is-still"><div class="gb__track">${cards.join('')}</div></div>`;
    } else {
      const rows = Array.from({ length: lanes }, () => []);
      cards.forEach((c, i) => rows[i % lanes].push(c));
      flow.innerHTML = rows.map((r, i) => {
        const html = r.join('');
        return `<div class="gb__lane${i % 2 ? ' is-rev' : ''}"><div class="gb__track" style="--dur:${Math.round(r.length * (i % 2 ? 11 : 9))}s">${html}${html}</div></div>`;
      }).join('');
    }
    flow.classList.toggle('is-still', !lanes);
    $('.gb__num').textContent = n;
    root.classList.toggle('is-empty', !n);
    lastAdded = null;
  }

  function render(list) {
    if (known) { const fresh = list.find(e => !known.has(e.id)); if (fresh) lastAdded = fresh.id; }
    known = new Set(list.map(e => e.id));
    entries = list; draw();
  }

  // 구슬을 누르면 크게 펼쳐서 전체 글을 보여줘요
  const dlg = $('.gb__dlg');
  const openNote = el => {
    const e = entries[+el.dataset.i]; if (!e) return;
    const [name, col] = SENSES[e.sense] || SENSES[0];
    dlg.style.setProperty('--c', col);
    dlg.querySelector('.gb__dlg-orb').innerHTML = `<span class="gb__note-sense">No.${String(el.dataset.no).padStart(4, '0')} · ${esc(name)}</span><p>${esc(e.msg)}</p><span class="gb__note-by">${esc(e.name || '익명의 관객')} · ${fmt(e.t)}</span>`;
    dlg.showModal();
  };
  board.addEventListener('click', ev => { const el = ev.target.closest('.gb__note'); if (el) openNote(el); });
  board.addEventListener('keydown', ev => { const el = ev.target.closest('.gb__note'); if (el && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openNote(el); } });
  dlg.addEventListener('click', ev => { if (ev.target === dlg || ev.target.closest('.gb__dlg-close')) dlg.close(); });

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
