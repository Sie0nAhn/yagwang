/* ============================================================
   야광 — 배경 소리
   소리 파일 없이 웹 오디오로 직접 만든다 (받을 것도, 저작권도 없다).

   두 인터랙션은 서로 다른 공간처럼 들려야 한다.
   archive  : 인터랙션 1 — 바람 소리만. 마르고 텅 빈 바깥, 울림 없이 바로 귀 앞에서.
              (음이 있는 소리는 넣지 않는다 — 정원과 같은 음이 이어지는 것처럼 들리지 않게)
   orb      : 구슬 화면 — 바람이 잦아든다
   crossing : 영상 1 이 끝나고 정원이 뜨기 전 — 소리가 위로 빨려 올라간다
   garden   : 인터랙션 2 — 꿈속처럼 감싸는 넓고 젖은 공간. 잡음이 아니라 음으로 채운다.
              긴 울림, 크게 숨쉬는 화음, 오르골처럼 느리게 떨어지는 맑은 음,
              물방울, 구슬끼리 부딪는 소리. (물줄기는 아주 옅게만 — 바람과 겹쳐 들리지 않게)
              crossing 에서 넘어오면 '풍덩' 잠기고, 먹먹하던 소리가 천천히 열린다
   film / silent : 조용히 (영상 소리만)

   브라우저는 사람이 화면을 한 번 누르기 전엔 소리를 막는다.
   그래서 시작 화면에서 누를 때 unlockSound() 를 부른다.
   ============================================================ */

const LEVEL = {
  master: 0.9,
  archive: 0.3,     // 인터랙션 1 전체
  orb: 0.13,        // 구슬 화면에서 잦아든 바람
  garden: 0.55,     // 인터랙션 2 전체
  crossing: 0.3,    // 넘어가는 순간의 빨려 올라가는 소리
  plunge: 0.5,      // 정원에 잠기는 소리
};
const FADE = 1.6;   // 장면이 바뀔 때 소리가 바뀌는 시간(초)
const OPEN = 5;     // 정원에 들어가 먹먹하던 소리가 다 열리기까지(초)

let ctx = null;
let out = null;       // 모든 소리가 모이는 곳
let hall = null;      // 정원의 긴 울림
let gardenSend = null; // 정원에 늘 깔리는 소리(화음·반짝임·물줄기)의 울림 — 정원 볼륨을 따라야 한다.
                       // (울림으로 바로 보내면 정원 볼륨을 0 으로 내려도 화음의 울림이 인터랙션 1 에서도 계속 났다)
let gardenTone = null; // 정원 소리 전체의 밝기 — 들어갈 때 막혔다가 열린다
const bed = {};       // 장면별 소리 묶음의 볼륨
const gate = {};      // 장면별 스위치 — 볼륨을 내린 뒤 직접 끈다 (볼륨 예약이 무시되는 기기에서도 소리가 남지 않게)
const gateTimer = {};
let scene = "silent";
let gardenTimers = [];

const rand = (a, b) => a + Math.random() * (b - a);

// 디버그용 — 지금 장면과 묶음별 볼륨
window.__ykSound = () => ({ ctx: ctx && ctx.state, scene, out: out && out.gain.value, archive: bed.archive && +bed.archive.gain.value.toFixed(3), garden: bed.garden && +bed.garden.gain.value.toFixed(3), gardenWet: gardenSend && +gardenSend.gain.value.toFixed(3), gates: Object.fromEntries(Object.entries(gate).map(([k, g]) => [k, g.gain.value])) });

export function unlockSound() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      build();
    }
    if (ctx.state !== "running") ctx.resume();
  } catch (e) { console.warn("[소리] 시작 실패", e); }
}

/* 소리가 이미 허락돼 있는지 (브라우저 설정에서 자동 재생을 허용했거나, 한 번 눌렀거나) */
export function soundAllowed() {
  return !!ctx && ctx.state === "running";
}

let sleepTimer = 0;
export function setScene(name) {
  const prev = scene;
  scene = name;
  if (!ctx) return;
  // 영상이 나오는 동안은 페이드가 끝나면 출력 자체를 0 으로 막는다 (볼륨 예약만 믿으면 기기에 따라 계속 들리기도 한다)
  clearTimeout(sleepTimer);
  if (name === "film" || name === "silent") {
    sleepTimer = setTimeout(() => { if (scene === name) out.gain.value = 0; }, FADE * 1500);
  } else {
    out.gain.value = LEVEL.master;
  }
  const t = ctx.currentTime;
  // 지금 볼륨을 기준점으로 먼저 찍는다 — 사파리는 예약을 지운 뒤 기준점 없이 바꾸면 무시하기도 한다
  const to = (g, v, tau = FADE / 3) => {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.setTargetAtTime(v, t, tau);
  };
  // 켜질 묶음은 스위치를 바로 켜고, 꺼질 묶음은 페이드가 끝난 뒤 스위치를 내린다
  const sw = (key, on) => {
    clearTimeout(gateTimer[key]);
    if (on) gate[key].gain.value = 1;
    else gateTimer[key] = setTimeout(() => { gate[key].gain.value = 0; }, FADE * 1500);
  };
  sw("archive", name === "archive" || name === "orb");
  sw("garden", name === "garden");
  sw("gardenWet", name === "garden");
  to(gardenSend, name === "garden" ? 1 : 0, name === "garden" ? 0.25 : FADE / 3);
  to(bed.archive, name === "archive" ? LEVEL.archive : name === "orb" ? LEVEL.orb : 0,
     name === "crossing" ? 0.08 : FADE / 3);
  if (name === "garden" && prev === "crossing") {
    arrive();
    to(bed.garden, LEVEL.garden, 0.25);
  } else {
    to(bed.garden, name === "garden" ? LEVEL.garden : 0);
    if (name === "garden") open(1.2);
  }
  if (name === "crossing") rise();
  if (name === "garden") startGardenEvents(); else stopGardenEvents();
}

/* 구슬을 열 때 — 맑은 구슬 소리가 차례로 울린다 */
export function chime() {
  if (!ctx || scene !== "garden") return;
  const base = rand(1500, 2100);
  [1, 1.25, 1.5, 2].forEach((m, i) => setTimeout(() => clink(base * m, 0.09, rand(-0.4, 0.4), 1.6), i * 90));
}

/* ── 만들기 ─────────────────────────────────────── */

function build() {
  out = ctx.createGain();
  out.gain.value = LEVEL.master;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  out.connect(comp).connect(ctx.destination);

  // 정원의 울림 — 아주 길고 넓게. 인터랙션 1 에는 울림을 아예 쓰지 않는다
  hall = ctx.createConvolver();
  hall.buffer = impulse(7, 2.2);
  const wet = ctx.createGain();
  wet.gain.value = 0.75;
  hall.connect(wet).connect(out);

  bed.archive = ctx.createGain();
  bed.archive.gain.value = 0;
  gate.archive = ctx.createGain();
  gate.archive.gain.value = 0;
  bed.archive.connect(gate.archive).connect(out);
  buildArchive(bed.archive);

  gardenSend = ctx.createGain();
  gardenSend.gain.value = 0;
  gate.gardenWet = ctx.createGain();
  gate.gardenWet.gain.value = 0;
  gardenSend.connect(gate.gardenWet).connect(hall);

  gardenTone = ctx.createBiquadFilter();
  gardenTone.type = "lowpass";
  gardenTone.frequency.value = 16000;
  gardenTone.Q.value = 0.7;
  bed.garden = ctx.createGain();
  bed.garden.gain.value = 0;
  gate.garden = ctx.createGain();
  gate.garden.gain.value = 0;
  gardenTone.connect(bed.garden).connect(gate.garden).connect(out);
  buildGarden(gardenTone);

  setScene(scene);
}

/* 잡음 — 'brown' 은 낮고 둥글게(바람·물), 'white' 는 거칠게.
   mono 면 두 귀에 같은 소리 (좁고 가까이), 아니면 귀마다 달라 넓게 퍼진다 */
function noiseBuffer(seconds, color, mono) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    if (mono && ch === 1) { d.set(buf.getChannelData(0)); continue; }
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (color === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else d[i] = w;
    }
  }
  return buf;
}
function noise(seconds, color, mono = false) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(seconds, color, mono);
  src.loop = true;
  src.start(0, Math.random() * seconds);
  return src;
}

/* 울림 — 길게 사그라드는 잡음을 울림 모양으로 쓴다. 앞부분은 살짝 늦게 차올라 더 멀게 들린다 */
function impulse(seconds, decay) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const pre = Math.floor(ctx.sampleRate * 0.03);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      const attack = i < pre ? i / pre : 1;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * attack;
    }
  }
  return buf;
}

/* 인터랙션 1 — 바람만. 마르고 텅 빈 바깥 */
function buildArchive(dest) {
  // 바람 — 낮은 숨소리. 귀 앞에 좁게
  const low = noise(7, "brown", true);
  const lowBand = ctx.createBiquadFilter();
  lowBand.type = "bandpass"; lowBand.frequency.value = 380; lowBand.Q.value = 0.7;
  const lowGain = ctx.createGain(); lowGain.gain.value = 0.7;
  low.connect(lowBand).connect(lowGain).connect(dest);

  // 높은 바람결 — 대역을 넓게 둬서 음(휘파람)으로 들리지 않게
  const high = noise(5, "white", true);
  const whistle = ctx.createBiquadFilter();
  whistle.type = "bandpass"; whistle.frequency.value = 1200; whistle.Q.value = 2.5;
  const highGain = ctx.createGain(); highGain.gain.value = 0.02;   // 대역이 넓어진 만큼 작게
  high.connect(whistle).connect(highGain).connect(dest);

  // 차가운 공기 — 아주 높고 얇은 쉭 소리
  const air = noise(4, "white", true);
  const airHp = ctx.createBiquadFilter(); airHp.type = "highpass"; airHp.frequency.value = 7000;
  const airGain = ctx.createGain(); airGain.gain.value = 0.012;
  air.connect(airHp).connect(airGain).connect(dest);

  // 돌풍 — 무작위로 세졌다 약해지고, 휘파람 높이가 미끄러진다
  (function gust() {
    const t = ctx.currentTime;
    const len = rand(2.5, 6);
    lowGain.gain.setTargetAtTime(rand(0.3, 1.0), t, len / 3);
    lowBand.frequency.setTargetAtTime(rand(260, 650), t, len / 3);
    highGain.gain.setTargetAtTime(rand(0.003, 0.03), t, len / 2);
    whistle.frequency.setTargetAtTime(rand(850, 1700), t, len / 2);
    setTimeout(gust, len * 1000);
  })();
}

/* 인터랙션 2 — 꿈속처럼 감싸는 넓은 공간.
   몽환적인 화음과 옅은 물소리가 깔리고, 오르골·물방울·구슬 소리는 이따금 */
function buildGarden(dest) {
  // 물줄기 — 낮게 흐르는 소리 + 그 위에서 자글거리는 소리
  const stream = noise(6, "brown");
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 120;
  const sg = ctx.createGain(); sg.gain.value = 0.06;    // 아주 옅게 — 잡음이 크면 인터랙션 1 의 바람처럼 들린다
  stream.connect(lp).connect(hp).connect(sg).connect(dest);
  const ss = ctx.createGain(); ss.gain.value = 0.1; sg.connect(ss).connect(gardenSend);

  const babble = noise(4, "white");
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1200; bp.Q.value = 3;
  const bg = ctx.createGain(); bg.gain.value = 0.008;
  babble.connect(bp).connect(bg).connect(dest);
  (function ripple() {
    const t = ctx.currentTime;
    bp.frequency.setTargetAtTime(rand(600, 1900), t, 0.05);
    bg.gain.setTargetAtTime(rand(0.003, 0.012), t, 0.08);
    setTimeout(ripple, rand(80, 220));
  })();

  // 화음 — D 장9화음을 아주 느리게 숨쉬듯. 음마다 두 개를 살짝 어긋나게 겹쳐 흔들린다
  const padOut = ctx.createGain(); padOut.gain.value = 1;
  const padLp = ctx.createBiquadFilter(); padLp.type = "lowpass"; padLp.frequency.value = 1500; padLp.Q.value = 0.4;
  padOut.connect(padLp);
  padLp.connect(dest);
  const send = ctx.createGain(); send.gain.value = 1;
  padLp.connect(send).connect(gardenSend);
  [146.83, 220.0, 329.63, 369.99, 554.37].forEach((f, i) => {
    const g = ctx.createGain();
    [-7, 7].forEach((cents, k) => {
      const o = ctx.createOscillator();
      o.type = k ? "triangle" : "sine";
      o.frequency.value = f;
      o.detune.value = cents;
      const p = ctx.createStereoPanner(); p.pan.value = k ? 0.6 : -0.6;   // 두 겹을 양쪽으로 벌린다
      o.connect(p).connect(g);
      o.start();
    });
    g.connect(padOut);
    // 음마다 다른 빠르기로 커졌다 작아진다
    const lfo = ctx.createOscillator(); lfo.frequency.value = rand(0.04, 0.11);
    const depth = ctx.createGain(); depth.gain.value = 0.02;
    lfo.connect(depth).connect(g.gain);
    g.gain.value = 0.03 - i * 0.003;
    lfo.start(ctx.currentTime + rand(0, 4));
  });
  // 화음 전체의 밝기도 천천히 오르내린다
  const sweep = ctx.createOscillator(); sweep.frequency.value = 0.03;
  const sweepDepth = ctx.createGain(); sweepDepth.gain.value = 800;
  sweep.connect(sweepDepth).connect(padLp.frequency);
  sweep.start();

  // 반짝임 — 높은 두 음이 울림 속에서만 아른거린다
  [1108.73, 1479.98].forEach((f) => {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = rand(0.05, 0.09);
    const depth = ctx.createGain(); depth.gain.value = 0.014;
    lfo.connect(depth).connect(g.gain);
    o.connect(g).connect(gardenSend); o.start(); lfo.start(ctx.currentTime + rand(0, 6));
  });
}

/* 정원의 막힌 소리를 연다 — 물속에서 고개를 드는 것처럼 */
function open(seconds) {
  const t = ctx.currentTime;
  gardenTone.frequency.cancelScheduledValues(t);
  gardenTone.frequency.setValueAtTime(260, t);
  gardenTone.frequency.exponentialRampToValueAtTime(16000, t + seconds);
}

/* 넘어가는 순간 — 잡음이 위로 쓸려 올라가며 커진다 */
function rise() {
  const t = ctx.currentTime;
  const len = 2.2;
  const src = noise(3, "white");
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(240, t);
  bp.frequency.exponentialRampToValueAtTime(5200, t + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(LEVEL.crossing, t + len);
  g.gain.setTargetAtTime(0.0001, t + len, 0.12);
  src.connect(bp).connect(g);
  g.connect(out);
  const s = ctx.createGain(); s.gain.value = 0.6; g.connect(s).connect(hall);
  src.stop(t + len + 1);
}

/* 정원에 닿는 순간 — 깊게 '풍덩' 잠기고, 기포가 올라오고, 소리가 천천히 열린다 */
function arrive() {
  const t = ctx.currentTime;
  // 가라앉는 낮은 울림
  const o = ctx.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(30, t + 1.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(LEVEL.plunge, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
  o.connect(g).connect(out);
  const s = ctx.createGain(); s.gain.value = 0.5; g.connect(s).connect(hall);
  o.start(t); o.stop(t + 3);
  // 물이 덮치는 소리
  const n = noise(2, "brown");
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
  lp.frequency.setValueAtTime(1400, t);
  lp.frequency.exponentialRampToValueAtTime(180, t + 1.6);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(LEVEL.plunge * 0.9, t + 0.03);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
  n.connect(lp).connect(ng).connect(out);
  ng.connect(hall);
  n.stop(t + 2);
  // 기포 — 작은 물방울들이 점점 높아지며 올라온다
  for (let k = 0; k < 16; k++) {
    setTimeout(() => drip(rand(500, 900) * (1 + k * 0.08), rand(0.03, 0.07)), 250 + k * rand(60, 120));
  }
  open(OPEN);
}

/* 물방울 — 짧게 '똑' 하고 음이 올라간다 */
function drip(f = rand(650, 1400), level = rand(0.04, 0.09)) {
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * rand(1.4, 1.9), t + 0.07);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  const pan = ctx.createStereoPanner(); pan.pan.value = rand(-0.8, 0.8);
  o.connect(g).connect(pan);
  pan.connect(gardenTone);
  const s = ctx.createGain(); s.gain.value = 0.6; pan.connect(s).connect(hall);
  o.start(t); o.stop(t + 0.2);
}

/* 구슬끼리 부딪는 소리 — 유리처럼 맞지 않는 배음들이 빠르게 울리고 길게 사라진다 */
function clink(base, level = 0.05, panv = rand(-0.7, 0.7), decay = rand(0.6, 1.3)) {
  const t = ctx.currentTime;
  const pan = ctx.createStereoPanner(); pan.pan.value = panv;
  pan.connect(gardenTone);
  const s = ctx.createGain(); s.gain.value = 0.8; pan.connect(s).connect(hall);
  [[1, 1], [2.32, 0.5], [4.25, 0.28], [6.63, 0.15]].forEach(([m, a]) => {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = base * m;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level * a, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay / m ** 0.3);
    o.connect(g).connect(pan);
    o.start(t); o.stop(t + decay + 0.1);
  });
}

/* 오르골 음 — D 장조 5음 (레 미 파# 라 시), 두 옥타브 */
const BELL = [587.33, 659.25, 739.99, 880, 987.77, 1174.66, 1318.51, 1479.98, 1760];
function bell(f, level = 0.045) {
  const t = ctx.currentTime;
  const pan = ctx.createStereoPanner(); pan.pan.value = rand(-0.75, 0.75);
  pan.connect(gardenTone);
  const s = ctx.createGain(); s.gain.value = 1.1; pan.connect(s).connect(hall);   // 울림을 더 크게 — 멀리서 번지듯
  [[1, 1, "sine"], [2, 0.22, "sine"], [3.01, 0.07, "triangle"]].forEach(([m, a, type]) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * m;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level * a, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8 / m);
    o.connect(g).connect(pan);
    o.start(t); o.stop(t + 3);
  });
}

function startGardenEvents() {
  if (gardenTimers.length) return;
  const loop = (fn, min, max) => {
    const id = { t: 0 };
    const tick = () => { fn(); id.t = setTimeout(tick, rand(min, max)); };
    id.t = setTimeout(tick, rand(min, max));
    gardenTimers.push(id);
  };
  loop(() => drip(), 900, 2800);
  // 오르골 — 맑은 음이 느리게, 아무렇게나 떨어진다. 가끔은 두 음이 함께
  loop(() => {
    const f = BELL[(Math.random() * BELL.length) | 0];
    bell(f);
    if (Math.random() < 0.3) setTimeout(() => bell(BELL[(Math.random() * BELL.length) | 0], 0.03), rand(120, 260));
  }, 650, 2100);
  loop(() => {
    // 둘이 가볍게 '딸깍' — 가끔은 한 번 더 튄다
    const b = rand(1800, 3200);
    clink(b);
    if (Math.random() < 0.5) setTimeout(() => clink(b * rand(0.92, 1.08), 0.03), rand(90, 180));
  }, 2200, 6000);
  // 이따금 기포 몇 개가 줄지어 올라온다
  loop(() => {
    const f = rand(450, 700), n = 3 + ((Math.random() * 4) | 0);
    for (let k = 0; k < n; k++) setTimeout(() => drip(f * (1 + k * 0.15), 0.035), k * rand(70, 130));
  }, 7000, 15000);
}

function stopGardenEvents() {
  gardenTimers.forEach((id) => clearTimeout(id.t));
  gardenTimers = [];
}
