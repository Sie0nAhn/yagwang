/* ============================================================
   야광(夜光) — 당신이 모르는 사이

   로딩 → 자원 아카이브(영상 그리드) → 구슬
   손끝이 커서가 되고, 손가락을 모아 꾹 누르면
   고른 영상이 구슬로 응축된다.
   ============================================================ */

import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

/* 영상 색보정·질감은 잠시 꺼둠. true 로 바꾸면 그대로 되살아난다. */
const VIDEO_FX = false;

/* ============================================================
   영상 데이터
   ============================================================ */
const VIDEOS = [
  {
    name: "서늘한 새벽공기", file: "01-dawn-air.mp4", en: "the cool before dawn", tags: ["빛", "온도"], tint: "#6f83e8",
    marble: { hue: 208, sat: 1.2, bri: 0.82, glow: "rgba(74,108,240,.34)" },
    grade: ["#6d7cbe", "#aba4e0", "#fff1f8"],
  },
  {
    name: "오후 4시의 햇살", file: "02-afternoon-light.mp4", en: "light at four o\u2019clock", tags: ["온도", "시간"], tint: "#ff9b4d",
    marble: { hue: 8, sat: 1.1, bri: 1.03, glow: "rgba(255,140,40,.34)" },
    grade: ["#eb9670", "#ffd6ab", "#fffaee"],
  },
  {
    name: "윤슬의 빤짝임", file: "03-water-glitter.mp4", en: "sunlight broken on water", tags: ["물", "빛"], tint: "#4fd2e6",
    marble: { hue: 169, sat: 0.95, bri: 1.05, glow: "rgba(70,207,230,.32)" },
    grade: ["#6ea7c4", "#abe0e9", "#f8feff"],
  },
  {
    name: "계절의 경계면", file: "04-season-edge.mp4", en: "the seam between seasons", tags: ["계절", "촉감"], tint: "#7fdc9b",
    marble: { hue: 112, sat: 0.95, bri: 1.0, glow: "rgba(121,220,143,.30)" },
    grade: ["#87ae91", "#c6e8c2", "#fcfff4"],
  },
  {
    name: "고요한 정적의 소리", file: "05-silence.mp4", en: "the sound of stillness", tags: ["소리", "여백"], tint: "#b9b4e8",
    marble: { hue: 224, sat: 0.62, bri: 1.02, glow: "rgba(169,166,220,.30)" },
    grade: ["#9291aa", "#cbc8db", "#fbfafd"],
  },
  {
    name: "낯선 타인의 온기", file: "06-stranger-warmth.mp4", en: "warmth from a stranger", tags: ["온도", "사람"], tint: "#ff8a70",
    marble: { hue: 352, sat: 1.05, bri: 1.0, glow: "rgba(255,122,92,.34)" },
    grade: ["#d68d7b", "#ffc3b1", "#fff6ef"],
  },
  {
    name: "비 오는 날의 흙냄새", file: "07-petrichor.mp4", en: "earth after the rain", tags: ["냄새", "날씨"], tint: "#c9c076",
    marble: { hue: 26, sat: 0.68, bri: 0.93, glow: "rgba(179,154,77,.30)" },
    grade: ["#909b71", "#d0cc9e", "#faf8ea"],
  },
  {
    name: "이유없는 설렘", file: "08-flutter.mp4", en: "a flutter without reason", tags: ["감정", "심박"], tint: "#ff77b8",
    marble: { hue: 314, sat: 1.05, bri: 1.02, glow: "rgba(255,94,168,.34)" },
    grade: ["#c980ad", "#ffbfdb", "#fff4fa"],
  },
  {
    name: "첫눈을 보던 감각", file: "09-first-snow.mp4", en: "watching the first snow", tags: ["눈", "계절"], tint: "#bcd8f5",
    marble: { hue: 190, sat: 0.5, bri: 1.1, glow: "rgba(188,216,245,.32)" },
    grade: ["#8fa7c4", "#cfdff2", "#ffffff"],
  },
];

const N = VIDEOS.length;
const root = document.documentElement;

/* "03 / 09" 같은 인덱스 표기 — 영상을 더 넣어도 총 개수가 따라간다 */
const TOTAL_LABEL = String(N).padStart(2, "0");
const indexLabel = (vi) => `${String(vi + 1).padStart(2, "0")} / ${TOTAL_LABEL}`;

/* 프레임이 한 번 밀렸다고 애니메이션이 슬로모션으로 늘어지지 않게 */
gsap.ticker.lagSmoothing(1000, 33);

/* ============================================================
   반응 속도 — 클수록 느긋하게 따라온다
   ============================================================ */
const FOLLOW = {
  hand: 0.07,      // 손 좌표를 매 프레임 얼마나 반영할지 (작을수록 손떨림이 죽는다)
  cursor: 0.9,     // 커서가 따라오는 시간(초)
  pan: 3.4,        // 목록이 흘러가는 시간(초)
  aura: 4.2,       // 배경이 밀려가는 시간(초)
  dwell: 320,      // 이만큼 머물러야 다른 영상으로 넘어간다(ms)
};

/* 꾹 눌러 고르기 */
const HOLD = {
  time: 2.4,       // 게이지가 다 차는 데 걸리는 시간(초)
  mouse: 1.1,      // 마우스로 누를 때는 잘못 눌릴 일이 없으니 짧게
  // 실측: 편 손 0.76 / 반쯤 오므린 손 0.28 / 실제로 꼬집으면 0.03
  pinchOn: 0.22,   // 엄지-검지가 이보다 가까워야 '꼬집었다'
  pinchOff: 0.40,  // 이보다 벌어지면 놓은 것
  grace: 700,      // 손이 처음 잡히고 이 시간 동안은 꼬집어도 무시(ms)
};

/* ============================================================
   스테이지
   ============================================================ */
const STAGE_W = 1440;
const STAGE_H = 805;
const stageEl = document.getElementById("stage");
let stageScale = 1;

function fitStage() {
  stageScale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  root.style.setProperty("--scale", stageScale);
}
fitStage();
window.addEventListener("resize", fitStage);

function toStage(clientX, clientY) {
  const r = stageEl.getBoundingClientRect();
  return { x: (clientX - r.left) / stageScale, y: (clientY - r.top) / stageScale };
}

/* ============================================================
   색
   ============================================================ */
const ACCENT = "#1eff66";
const tint = { from: ACCENT, to: ACCENT, p: 1 };

function rgbaOf(color, alpha) {
  const n = String(color).match(/[\d.]+/g);
  return n ? `rgba(${n[0]},${n[1]},${n[2]},${alpha})` : color;
}
function paintTint(color) {
  root.style.setProperty("--tint", color);
  root.style.setProperty("--tint-soft", rgbaOf(color, 0.35));
}
paintTint(ACCENT);

function setTint(hex) {
  if (hex === tint.to) return;
  tint.from = gsap.utils.interpolate(tint.from, tint.to, tint.p);
  tint.to = hex;
  tint.p = 0;
  gsap.to(tint, {
    p: 1, duration: 0.9, ease: "power2.out",
    onUpdate: () => paintTint(gsap.utils.interpolate(tint.from, tint.to, tint.p)),
  });
}

/* ============================================================
   영상별 파스텔 그라디언트맵 (VIDEO_FX 켤 때만)
   흑백으로 만든 뒤 밝기에 따라 램프 색을 입힌다 = 그라디언트맵
   ============================================================ */
const GRADE_MIX = 0.86;

function buildGradeFilters() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "grade-defs");
  svg.setAttribute("aria-hidden", "true");
  const defs = document.createElementNS(NS, "defs");

  VIDEOS.forEach((v, i) => {
    const rgb = v.grade.map((hex) => [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ]);
    const f = document.createElementNS(NS, "filter");
    f.setAttribute("id", "grade" + i);
    f.setAttribute("color-interpolation-filters", "sRGB");

    const gray = document.createElementNS(NS, "feColorMatrix");
    gray.setAttribute("type", "saturate");
    gray.setAttribute("values", "0");
    gray.setAttribute("result", "gray");
    f.appendChild(gray);

    const ct = document.createElementNS(NS, "feComponentTransfer");
    ct.setAttribute("in", "gray");
    ct.setAttribute("result", "mapped");
    ["feFuncR", "feFuncG", "feFuncB"].forEach((tag, ch) => {
      const fn = document.createElementNS(NS, tag);
      fn.setAttribute("type", "table");
      fn.setAttribute("tableValues", rgb.map((c) => c[ch].toFixed(3)).join(" "));
      ct.appendChild(fn);
    });
    f.appendChild(ct);

    const mix = document.createElementNS(NS, "feComposite");
    mix.setAttribute("in", "mapped");
    mix.setAttribute("in2", "SourceGraphic");
    mix.setAttribute("operator", "arithmetic");
    mix.setAttribute("k1", "0");
    mix.setAttribute("k2", GRADE_MIX.toFixed(2));
    mix.setAttribute("k3", (1 - GRADE_MIX).toFixed(2));
    mix.setAttribute("k4", "0");
    f.appendChild(mix);

    defs.appendChild(f);
  });

  svg.appendChild(defs);
  document.body.appendChild(svg);
}
if (VIDEO_FX) buildGradeFilters();

/* ============================================================
   배경 — 오로라 + 먼지
   ============================================================ */
function initAmbient() {
  gsap.utils.toArray(".aura__blob").forEach((b, i) => {
    gsap.to(b, {
      x: gsap.utils.random(-170, 170),
      y: gsap.utils.random(-130, 130),
      scale: gsap.utils.random(0.85, 1.25),
      duration: gsap.utils.random(9, 16),
      ease: "sine.inOut", repeat: -1, yoyo: true, delay: i * 0.8,
    });
  });

  const dust = document.getElementById("dust");
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 40; i++) {
    const s = document.createElement("span");
    const size = gsap.utils.random(1, 3);
    s.style.width = s.style.height = size + "px";
    s.style.left = gsap.utils.random(0, 100) + "%";
    s.style.top = gsap.utils.random(0, 100) + "%";
    frag.appendChild(s);
  }
  dust.appendChild(frag);

  gsap.utils.toArray(".dust span").forEach((s) => {
    gsap.set(s, { opacity: gsap.utils.random(0.06, 0.35) });
    gsap.to(s, {
      y: gsap.utils.random(-180, -60),
      x: gsap.utils.random(-70, 70),
      duration: gsap.utils.random(14, 28),
      ease: "none", repeat: -1, delay: gsap.utils.random(0, 16),
      modifiers: { y: gsap.utils.unitize((y) => parseFloat(y) % 260) },
    });
    gsap.to(s, {
      opacity: gsap.utils.random(0.2, 0.65),
      duration: gsap.utils.random(1.8, 4.4),
      ease: "sine.inOut", repeat: -1, yoyo: true, delay: gsap.utils.random(0, 3),
    });
  });
}
initAmbient();

/* ============================================================
   자원 아카이브 — 왼쪽 큰 화면 + 오른쪽으로 이어지는 목록
   ============================================================ */
const FEAT_W = 580;          // 큰 화면 — 7:5. style.css 의 .feature 와 같아야 한다
const FEAT_H = 414;
const THUMB_W = 372;         // 목록 썸네일
const THUMB_H = 209;
const STRIP_PITCH = 420;     // 썸네일 + 간격
const STRIP_LEFT = 760;      // 목록 첫 칸의 화면 위치 (style.css 의 .strip-wrap 과 같아야 한다)
const STRIP_TOP = 238;

const HOVER_PAD = 26;        // 첫 칸 판정에 주는 여유
const HOVER_STEP = 1.1;      // 첫 칸에 계속 얹고 있을 때 다음 영상으로 넘어가는 간격(초)
const SLIDE_TIME = 0.55;     // 목록이 한 칸 미끄러지는 시간

const PIXEL_BASE = 2.4;      // 썸네일 알갱이 굵기
const PIXEL_BOOT = 30;       // 로딩 중에는 아주 굵게

/* 큰 화면을 이루는 문자 매트릭스 */
const ASCII_CELL = 8;                        // 글자 한 칸(px) — 작을수록 촘촘
const ASCII_RAMP = " .·:~=+*xX%#@@";         // 어두움 → 밝음
const BARREL = 0.11;                         // 화면이 휘는 정도 (0 이면 평평)
const ASCII_SAT = 2.1;                       // 글자 색의 채도 (1 이면 원본)
const ASCII_GAIN = 1.5;                      // 글자 색의 밝기
const ASCII_GAMMA = 0.82;                    // 1 보다 작으면 밝은 쪽이 더 살아난다
const ASCII_FLOOR = 0.07;                    // 이보다 어두운 칸은 아예 비워 검정을 남긴다

/* 영상 원본을 옮겨 담을 작은 캔버스 (프레임당 영상당 한 번만) */
const SRC_W = 288;
const SRC_H = 216;

const stripEl = document.getElementById("strip");
const featPix = document.getElementById("featPix");
const featAscii = document.getElementById("featAscii");
const featCtx = featPix.getContext("2d", { alpha: false });
const featAsciiCtx = featAscii.getContext("2d");
const featNameEl = document.getElementById("featName");
const featSlugEl = document.getElementById("featSlug");
const featureEl = document.getElementById("feature");

const tiles = [];

/* 실제 영상 요소는 영상 개수만큼만 */
const videoPool = VIDEOS.map((data) => {
  const v = document.createElement("video");
  v.src = data.file;
  v.muted = true;
  v.loop = true;
  v.playsInline = true;
  v.preload = "metadata";
  v.setAttribute("muted", "");
  v.setAttribute("playsinline", "");
  v.className = "video-source";
  document.body.appendChild(v);
  return v;
});

const videoSrc = videoPool.map(() => {
  const c = document.createElement("canvas");
  c.width = SRC_W;
  c.height = SRC_H;
  return { canvas: c, ctx: c.getContext("2d", { alpha: false }), ready: false };
});

function updateVideoSources() {
  videoPool.forEach((v, i) => {
    const s = videoSrc[i];
    if (!tiles[i] || !tiles[i].visible || v.readyState < 2 || !v.videoWidth) {
      if (i !== focusIndex) { s.ready = s.ready && false; return; }
    }
    if (v.readyState < 2 || !v.videoWidth) { s.ready = false; return; }

    // 세로 영상(9:16)이라 가로 프레임에 맞춰 가운데를 잘라 쓴다
    const vw = v.videoWidth, vh = v.videoHeight;
    const aspect = SRC_W / SRC_H;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (vw / vh > aspect) { sw = vh * aspect; sx = (vw - sw) / 2; }
    else { sh = vw / aspect; sy = (vh - sh) / 2; }
    s.ctx.drawImage(v, sx, sy, sw, sh, 0, 0, SRC_W, SRC_H);
    s.ready = true;
  });
}

/* ASCII 샘플링용 스크래치 */
const sampleCv = document.createElement("canvas");
const sampleCtx = sampleCv.getContext("2d", { willReadFrequently: true });

/* ── 목록 만들기 ─────────────────────────────────── */
VIDEOS.forEach((data, i) => {
  const el = document.createElement("div");
  el.className = "strip__item";
  el.innerHTML =
    `<canvas class="strip__thumb"></canvas>` +
    `<p class="strip__name">${data.name}</p>` +
    `<p class="strip__slug">${data.en}</p>`;

  const cv = el.querySelector(".strip__thumb");
  stripEl.appendChild(el);

  tiles.push({
    el, data, vi: i,
    canvas: cv, ctx: cv.getContext("2d", { alpha: false }),
    bw: 0, bh: 0,
    px: PIXEL_BOOT,
    noise: 1,
    visible: true,
  });
});

const allTiles = gsap.utils.toArray(".strip__item");

let focusIndex = 0;        // 지금 큰 화면에 떠 있는 영상
let locked = false;        // 화면 전환 중에는 목록을 건드리지 않는다

/* ── 목록은 큰 화면 다음 순서대로 줄을 선다 ─────────── */
/* 첫 칸은 언제나 "다음 영상". 마지막까지 가면 처음으로 돌아온다.
   (N = 영상 개수, 위에서 이미 선언해 두었다) */

/* pan.x 는 한 칸 미끄러지는 동안에만 0 이 아니다 */
const pan = { x: 0 };
const panTarget = { x: 0 };
let panLock = false;               // 꾹 누르는 동안엔 목록을 세워둔다
let panLastT = performance.now();

function rateFor(seconds) { return 1 - Math.pow(0.05, 1 / seconds); }
const PAN_RATE_FOLLOW = rateFor(SLIDE_TIME);
const PAN_RATE_SNAP = rateFor(0.3);
let panRate = PAN_RATE_FOLLOW;

function stepPan() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - panLastT) / 1000);
  panLastT = now;
  const k = 1 - Math.pow(1 - panRate, dt);
  pan.x += (panTarget.x - pan.x) * k;
}

/* 각 칸이 몇 번째 자리에 서는지 다시 계산한다.
   자리는 left 로 준다 — GSAP 이 transform 을 쓰기 때문에 겹치면 안 된다. */
function layoutStrip() {
  tiles.forEach((t, i) => {
    t.slot = (i - focusIndex - 1 + N) % N;
    t.el.style.left = t.slot * STRIP_PITCH + "px";
  });
}
layoutStrip();

/* 다음 영상으로 한 칸 넘긴다 */
function advanceFocus() { setFocus((focusIndex + 1) % N, 1); }

/* ── 그리기 ──────────────────────────────────────── */

/* 썸네일 — 낮은 해상도로 그려 알갱이를 남긴다 */
function drawThumb(tile) {
  const px = Math.max(1, tile.px);
  const bw = Math.max(8, Math.round(THUMB_W / px / 8) * 8);
  const bh = Math.max(8, Math.round(THUMB_H / px / 8) * 8);
  if (bw !== tile.bw || bh !== tile.bh) {
    tile.canvas.width = bw;
    tile.canvas.height = bh;
    tile.bw = bw; tile.bh = bh;
  }
  const g = tile.ctx;
  g.imageSmoothingEnabled = true;

  if (tile.noise > 0.01) {
    const img = g.createImageData(bw, bh);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = 18 + Math.random() * 90;
      d[i] = n * 0.86; d[i + 1] = n * 0.98; d[i + 2] = n; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  const src = videoSrc[tile.vi];
  if (!src.ready) return;
  g.globalAlpha = 1 - tile.noise;
  g.drawImage(src.canvas, 0, 0, bw, bh);
  g.globalAlpha = 1;
}

/* 큰 화면 — 영상을 문자로 다시 그리고, 브라운관처럼 불룩하게 휘게 한다.
   네 변의 가운데가 바깥으로 부풀고 모서리는 사각으로 남는다. */
const FIT = 1 / (1 + BARREL);                // 부푼 변이 화면에 꽉 차도록

function drawFeature() {
  const src = videoSrc[focusIndex];
  const cols = Math.floor(FEAT_W / ASCII_CELL);
  const rows = Math.floor(FEAT_H / ASCII_CELL);

  if (featAscii.width !== FEAT_W) {
    featAscii.width = FEAT_W; featAscii.height = FEAT_H;
    featPix.width = Math.round(FEAT_W / 6); featPix.height = Math.round(FEAT_H / 6);
  }

  // 뒤에 아주 흐린 바탕을 깔아 글자만 떠 있지 않게
  const bg = featCtx;
  bg.fillStyle = "#000";
  bg.fillRect(0, 0, featPix.width, featPix.height);
  if (src && src.ready) bg.drawImage(src.canvas, 0, 0, featPix.width, featPix.height);

  const g = featAsciiCtx;
  g.clearRect(0, 0, FEAT_W, FEAT_H);
  if (!src || !src.ready) return;

  if (sampleCv.width !== cols || sampleCv.height !== rows) {
    sampleCv.width = cols; sampleCv.height = rows;
  }
  sampleCtx.drawImage(src.canvas, 0, 0, cols, rows);
  const data = sampleCtx.getImageData(0, 0, cols, rows).data;

  g.font = `${ASCII_CELL + 1}px "Roboto Mono", monospace`;
  g.textBaseline = "top";
  const last = ASCII_RAMP.length - 1;

  for (let y = 0; y < rows; y++) {
    const ny = ((y + 0.5) / rows) * 2 - 1;
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const r = data[i], gg = data[i + 1], b = data[i + 2];
      const lum = (r * 0.299 + gg * 0.587 + b * 0.114) / 255;
      // 어두운 칸을 비워 두어야 밝은 쪽이 살아난다. 다 채우면 전체가 잿빛이 된다.
      if (lum < ASCII_FLOOR) continue;
      const ch = ASCII_RAMP[Math.round(Math.pow(lum, ASCII_GAMMA) * last)];
      if (ch === " ") continue;

      // 브라운관 — 변 가운데만 바깥으로 부푼다.
      // 가로는 세로 위치로, 세로는 가로 위치로만 밀어서 네 모서리는 제자리에 둔다.
      // (거리로 한꺼번에 밀면 모서리까지 말려들어 알약 모양이 된다)
      const nx = ((x + 0.5) / cols) * 2 - 1;
      const dx = (nx * (1 + BARREL * (1 - ny * ny)) * FIT * 0.5 + 0.5) * FEAT_W;
      const dy = (ny * (1 + BARREL * (1 - nx * nx)) * FIT * 0.5 + 0.5) * FEAT_H;

      // 회색끼를 걷어내고 색을 세운다.
      // 밝기만 올리면(=전 채널에 같은 값을 더하면) 오히려 색이 바래므로,
      // 밝기에서 벌어진 만큼을 키워 채도를 먼저 살린 뒤 밝기를 곱한다.
      const L = lum * 255;
      const cr = Math.min(255, Math.max(0, (L + (r - L) * ASCII_SAT) * ASCII_GAIN));
      const cg = Math.min(255, Math.max(0, (L + (gg - L) * ASCII_SAT) * ASCII_GAIN));
      const cb = Math.min(255, Math.max(0, (L + (b - L) * ASCII_SAT) * ASCII_GAIN));
      g.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
      g.fillText(ch, dx, dy);
    }
  }
}

/* ── 매 프레임 ───────────────────────────────────── */
function renderGrid() {
  if (locked || !ready || current !== "grid") return;

  stepPan();
  stripEl.style.transform = `translateX(${-pan.x}px)`;

  // 앞쪽 몇 칸과 큰 화면에 뜬 영상만 재생한다
  tiles.forEach((t, i) => {
    t.visible = t.slot <= 2;
    const want = t.visible || i === focusIndex;
    const v = videoPool[i];
    if (want && v.paused) v.play().catch(() => {});
    else if (!want && !v.paused) v.pause();
  });
}
gsap.ticker.add(renderGrid);

/* 그리기는 화면 전환·로딩과 상관없이 계속 돈다.
   큰 화면은 글자 수천 개라 두 프레임에 한 번만 다시 그린다. */
let drawFrame = 0;

function drawTiles() {
  drawFrame++;
  updateVideoSources();
  tiles.forEach((t, i) => {
    if (t.visible || t.noise > 0.01) {
      if (drawFrame % 2 === i % 2) drawThumb(t);
    }
  });
  if (drawFrame % 2 === 0) drawFeature();
}
gsap.ticker.add(drawTiles);


/* ============================================================
   포커스
   ============================================================ */
const focusNameEl = document.getElementById("focusName");
const hudIndexEl = document.getElementById("hudIndex");
const marbleStage = document.getElementById("marbleStage");
const marbleEl = document.getElementById("marble");
const marbleRing = document.getElementById("marbleRing");
const orbCaptionName = document.querySelector(".orb-caption__name");
const orbIndexEl = document.getElementById("orbIndex");

function applyMarbleTheme(i) {
  const m = VIDEOS[i].marble;
  marbleStage.style.setProperty("--hue", m.hue + "deg");
  marbleStage.style.setProperty("--sat", m.sat);
  marbleStage.style.setProperty("--bri", m.bri);
  marbleStage.style.setProperty("--glow", m.glow);
  marbleStage.style.setProperty("--glow-soft", m.glow);
}

/* 영상 이름 밑에 붙는 영문 — 한글 이름의 결을 옮긴 문장 (없으면 파일명에서 뽑는다) */
const slugOf = (data) => data.en || data.file.replace(/^\d+-/, "").replace(/\.mp4$/, "");

/* ── 브라운관이 켜지듯 ───────────────────────────────
   가로 한 줄로 눌렸다가 위아래로 펴지면서 화면이 선다.
   (featureEl 자체는 꾹 누를 때 쓰므로 안쪽 캔버스만 건드린다) */
function crtOn(strong) {
  gsap.killTweensOf([featPix, featAscii]);
  const d = strong ? 0.8 : 0.5;
  gsap.fromTo(featAscii,
    { scaleY: strong ? 0.03 : 0.12, scaleX: strong ? 1.2 : 1.07, opacity: 0.25 },
    { scaleY: 1, scaleX: 1, opacity: 1, duration: d, ease: "power4.out" });
  gsap.fromTo(featPix,
    { scaleY: strong ? 0.03 : 0.12, scaleX: strong ? 1.2 : 1.07, opacity: 0.2 },
    { scaleY: 1, scaleX: 1, opacity: 0.7, duration: d, ease: "power4.out" });   // style.css 의 .feature__pix 와 같은 값
}

/* ── 글자가 잡음에서 자리를 잡는다 ────────────────────
   앞 글자부터 차례로 굳고, 아직 안 굳은 자리는 계속 바뀐다. */
const NOISE_KR = "가갸거겨고교구규그기나냐너녀노뇨누뉴느니다더도두드디라러로루르리마머모무므미바버보부브비사서소수스시아어오우으이자저조주즈지";
const NOISE_EN = "abcdefghijklmnopqrstuvwxyz0123456789#@$%&*+=<>?/";
const isKr = (ch) => ch >= "가" && ch <= "힣";

function scramble(el, text, seconds) {
  const chars = [...text];
  const total = seconds * 1000;
  const t0 = performance.now();
  let frame = 0;

  if (el._scrambleTick) gsap.ticker.remove(el._scrambleTick);

  const tick = () => {
    const p = Math.min(1, (performance.now() - t0) / total);
    const settled = p * chars.length * 1.3;   // 끝 글자도 여유 있게 굳도록
    // 매 프레임 바꾸면 너무 떨려서 두 프레임에 한 번만
    if (frame++ % 2 === 0 || p >= 1) {
      el.textContent = chars.map((ch, i) => {
        if (ch === " " || i < settled) return ch;
        const pool = isKr(ch) ? NOISE_KR : NOISE_EN;
        return pool[(Math.random() * pool.length) | 0];
      }).join("");
    }
    if (p >= 1) {
      el.textContent = text;
      gsap.ticker.remove(tick);
      el._scrambleTick = null;
    }
  };
  el._scrambleTick = tick;
  gsap.ticker.add(tick);
}

function setFocus(i, dir) {
  if (i === focusIndex) return;
  // 어느 쪽으로 넘어가는지 — 한 칸 뒤면 앞으로, 아니면 뒤로
  if (dir === undefined) dir = (i - focusIndex + N) % N === 1 ? 1 : -1;

  focusIndex = i;
  const tile = tiles[i];

  // 자리가 한 칸씩 당겨졌으니 그만큼 되돌려놓고, 제자리로 미끄러지게 한다
  layoutStrip();
  pan.x = -dir * STRIP_PITCH;
  panTarget.x = 0;

  const vi = tile.vi;
  setTint(VIDEOS[vi].tint);
  applyMarbleTheme(vi);
  if (current === "grid") hudIndexEl.textContent = indexLabel(vi);
  orbIndexEl.textContent = String(vi + 1).padStart(2, "0");
  orbCaptionName.textContent = tile.data.name;

  // 화면이 한 번 꺼졌다 켜지고, 이름은 잡음에서 다시 잡힌다
  crtOn(false);
  gsap.set([featNameEl, featSlugEl], { y: 0, opacity: 1 });
  scramble(featNameEl, tile.data.name, 0.5);
  scramble(featSlugEl, slugOf(tile.data), 0.6);
}
featNameEl.textContent = tiles[focusIndex].data.name;
featSlugEl.textContent = slugOf(tiles[focusIndex].data);
applyMarbleTheme(tiles[focusIndex].vi);
hudIndexEl.textContent = indexLabel(tiles[focusIndex].vi);
orbIndexEl.textContent = String(tiles[focusIndex].vi + 1).padStart(2, "0");
orbCaptionName.textContent = tiles[focusIndex].data.name;

/* 구슬 상시 애니메이션 */
gsap.to(marbleEl, {
  y: 15, rotationX: -5, rotationZ: 1.6,
  duration: 2.6, ease: "sine.inOut", repeat: -1, yoyo: true,
});
gsap.to(".marble-shadow", {
  scaleX: 1.08, scaleY: 1.12, opacity: 0.9,
  duration: 2.6, ease: "sine.inOut", repeat: -1, yoyo: true,
});

/* ============================================================
   화면 전환 : 타일 → 구슬
   ============================================================ */
const screenGrid = document.getElementById("screenGrid");
const screenOrb = document.getElementById("screenOrb");
const morph = document.getElementById("morph");
const btnBack = document.getElementById("btnBack");
const pillItems = gsap.utils.toArray(".pillnav__item");

gsap.set(screenGrid, { autoAlpha: 1 });
gsap.set(screenOrb, { autoAlpha: 0 });

const MARBLE_CX = 1085;   // .marble-stage 중심 (stage 좌표)
const MARBLE_CY = 379;

let current = "grid";

function setPill(name) {
  pillItems.forEach((b) => b.classList.toggle("is-active", b.dataset.screen === name));
}

/* 응축 연출의 재료 — 큰 화면에 떠 있던 영상을 정사각으로 잘라낸다 */
function snapshot(vi) {
  const src = videoSrc[vi].canvas;
  const c = document.createElement("canvas");
  const side = Math.min(src.width, src.height);
  c.width = side;
  c.height = side;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#07090c";
  g.fillRect(0, 0, side, side);
  g.drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, side, side);
  c.style.imageRendering = "pixelated";
  return c;
}

function select() {
  if (locked || current !== "grid") return;

  const idx = focusIndex;

  // 티커가 쓰던 값을 GSAP 이 이어받고, 티커는 멈춘다
  allTiles.forEach((el) => {
    const cs = getComputedStyle(el);
    gsap.set(el, { clearProps: "transform", opacity: cs.opacity });
  });
  locked = true;

  // 응축은 큰 화면에서 시작한다
  const r = featureEl.getBoundingClientRect();
  const p = toStage(r.left, r.top);
  const w = r.width / stageScale;
  const h = r.height / stageScale;

  morph.innerHTML = "";
  morph.appendChild(snapshot(idx));

  setPill("orb");

  const tl = gsap.timeline({
    onComplete: () => { locked = false; current = "orb"; },
  });

  // 1. 큰 화면만 남고 목록은 앞쪽부터 차례로 흩어진다
  tl.to(featureEl, { scale: 1.08, duration: 0.5, ease: "power2.out" }, 0);
  tiles.forEach((t) => {
    tl.to(t.el, {
      opacity: 0, y: 60, scale: 0.9,
      duration: 0.5, ease: "power2.in",
      delay: Math.min(3, t.slot) * 0.07,
    }, 0);
  });
  tl.to(".grid-fade", { opacity: 0, duration: 0.4 }, 0);

  // 2. 타일 → 구슬로 응축
  //    (tween 시작 직전 프레임에 초기값을 심어야 from 값이 제대로 잡힌다)
  tl.add(() => {
    gsap.set([featureEl, featNameEl, featSlugEl], { autoAlpha: 0 });
    gsap.set(morph, {
      visibility: "visible", opacity: 1, filter: "none",
      x: p.x, y: p.y, width: w, height: h,
      borderRadius: 0, rotation: 0, scale: 1,
    });
  }, 0.48);

  tl.to(morph, {
    x: MARBLE_CX - 110, y: MARBLE_CY - 110,
    width: 220, height: 220, borderRadius: 110,
    rotation: 400,
    duration: 1.05, ease: "power3.inOut",
  }, 0.5);
  tl.to(morph, { filter: "blur(7px) brightness(1.7)", duration: 0.5, ease: "power2.in" }, 1.1);

  // 3. 구슬 탄생 — 아카이브는 디졸브로 물러난다
  tl.set(screenOrb, { autoAlpha: 1 }, 1.25);
  tl.to(screenGrid, { autoAlpha: 0, duration: 0.45, ease: "power2.inOut" }, 1.25);

  tl.fromTo(marbleEl,
    { scale: 0.05, opacity: 0 },
    { scale: 1, opacity: 1, duration: 1.15, ease: "elastic.out(1, 0.55)" }, 1.4);
  tl.to(morph, { opacity: 0, duration: 0.35, ease: "power2.out" }, 1.4);
  tl.fromTo(marbleRing,
    { scale: 0.15, opacity: 0.9, borderWidth: 3 },
    { scale: 1.5, opacity: 0, borderWidth: 1, duration: 1.1, ease: "power2.out" }, 1.45);

  // 4. 글자들이 차례로 올라온다
  tl.fromTo("#orbHead span",
    { y: 26, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.6, stagger: 0.09, ease: "power3.out" }, 1.55);
  tl.fromTo([".orb-body", ".ghost-btn"],
    { y: 20, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.55, stagger: 0.09, ease: "power3.out" }, 1.75);
  tl.fromTo("#orbCaption",
    { y: 16, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }, 1.95);

  // 구슬 화면에서는 질문도 영상 이름도 물러난다
  tl.to(titlebar, { opacity: 0, duration: 0.45, ease: "power2.in" }, 1.1);
  tl.set(focusNameEl, { opacity: 0, y: -10 });
  tl.add(() => { hudIndexEl.textContent = "yk-2087"; }, 1.4);

  tl.set(morph, { visibility: "hidden", filter: "none" });
}

/* 아카이브를 원래 상태로 되돌린다 (구슬에서 오든 영상 끝에서 오든 같다) */
function resetArchive() {
  filmEl.pause();
  stopYt();
  if (current === "garden") releaseGardenHand();   // 카메라 돌려받기
  else startCamera();
  gsap.set([screenOrb, screenFilm, screenGarden], { autoAlpha: 0 });
  gsap.set(screenGrid, { autoAlpha: 1 });
  document.body.classList.remove("is-garden");
  hideChrome(false);
  setPill("grid");

  // 고른 타일은 선택할 때 숨겨뒀으므로 반드시 되살려야 한다
  allTiles.forEach((el) => gsap.set(el, { clearProps: "transform,opacity", visibility: "visible" }));
  tiles.forEach((t) => { t.px = PIXEL_BASE; });
  layoutStrip();
  pan.x = 0;
  panTarget.x = 0;
  hoverSince = -1;
  gsap.set(featureEl, { scale: 1, autoAlpha: 1 });
  gsap.set([featNameEl, featSlugEl], { autoAlpha: 1, opacity: 1, y: 0 });
  // 돌아올 때도 화면이 다시 켜진다
  crtOn(true);
  scramble(featNameEl, tiles[focusIndex].data.name, 0.7);
  scramble(featSlugEl, slugOf(tiles[focusIndex].data), 0.8);
  gsap.set([".grid-fade", titlebar], { opacity: 1 });
  gsap.set(marbleEl, { scale: 1, opacity: 1 });
  gsap.set(focusNameEl, { opacity: 1, y: 0 });
  focusNameEl.textContent = tiles[focusIndex].data.name;
  hudIndexEl.textContent = indexLabel(tiles[focusIndex].vi);
  panLock = false;
  panRate = PAN_RATE_FOLLOW;
  current = "grid";
}

/* 구슬 → 아카이브. 다른 전환과 똑같이 검정 페이드로 */
async function back() {
  if (locked || current !== "orb") return;
  await transition(async () => resetArchive());
}

/* ============================================================
   구슬 → 영상 → 구슬빛 정원 → 영상(뒷부분)

   중간.mp4 를 26초에서 한 번 끊고, 그 사이에 정원을 끼워 넣는다.
   장면이 바뀔 때는 스크린 도어(세로 살)가 닫혔다 열린다.
   ============================================================ */
/* 본편 영상 — 앞 영상 → 정원 → 뒤 영상
   로컬 파일이 있으면 그걸 쓰고, 없으면 유튜브에서 해당 지점부터 튼다.
   (깃허브 웹 업로드는 파일당 25MB 까지라 큰 영상은 못 올린다) */
const FILM = [
  { file: "film1.mp4", yt: "-xtSbOMBKkA", start: 0,  end: 26 },   // 유튜브로 틀 땐 26초에서 멈춘다
  { file: "film2.mp4", yt: "-xtSbOMBKkA", start: 26, end: null }, // 26초부터 끝까지
];
const USE_YOUTUBE = true;            // 로컬 파일이 없을 때 유튜브로 대신 틀지
const FADE_OUT = 0.55;               // 검정으로 덮는 시간(초)
const FADE_IN = 0.75;                // 검정을 걷어내는 시간(초)

const screenFilm = document.getElementById("screenFilm");
const screenGarden = document.getElementById("screenGarden");
const gardenFrame = document.getElementById("garden");
const filmEl = document.getElementById("film");
const filmHint = document.getElementById("filmHint");
const fadeEl = document.getElementById("fade");
const btnGo = document.getElementById("btnGo");

gsap.set([screenFilm, screenGarden], { autoAlpha: 0 });

const filmYtEl = document.getElementById("filmYt");

let filmSegment = -1;                // 0 = 앞부분, 1 = 뒷부분
let gardenLoaded = false;
let ytPlayer = null;

/* 각 영상을 로컬 파일로 틀 수 있는지 미리 확인한다.
   본편이 아예 없는 저장소(인터랙션만 올린 경우)면 구슬까지만 돌아간다. */
let hasFilm = false;

async function probeFilms() {
  for (const seg of FILM) {
    try {
      const r = await fetch(seg.file, { method: "HEAD" });
      seg.local = r.ok;
    } catch { seg.local = false; }
    seg.usable = seg.local || (USE_YOUTUBE && !!seg.yt);
  }
  hasFilm = FILM.every((s) => s.usable);
  if (!hasFilm) {
    btnGo.style.display = "none";
    console.info("[야광] 본편 영상이 없어 구슬까지만 동작합니다.");
  }
}

/* 검정으로 덮기 / 걷어내기 */
function fadeOut() {
  return gsap.timeline()
    .set(fadeEl, { visibility: "visible" })
    .to(fadeEl, { opacity: 1, duration: FADE_OUT, ease: "power2.inOut" })
    .to({}, { duration: 0.12 });          // 완전히 검은 상태로 한 박자
}

function fadeIn() {
  return gsap.timeline()
    .to(fadeEl, { opacity: 0, duration: FADE_IN, ease: "power2.inOut" })
    .set(fadeEl, { visibility: "hidden" });
}

/* 영상이 그 지점을 그릴 준비가 될 때까지 (오래 걸리면 그냥 넘어간다) */
function filmReady(maxWait = 5000) {
  if (filmEl.readyState >= 3) return Promise.resolve();
  return new Promise((res) => {
    const done = () => { clearTimeout(t); filmEl.removeEventListener("canplay", done); res(); };
    const t = setTimeout(done, maxWait);
    filmEl.addEventListener("canplay", done);
  });
}

/* 소리를 살려서 재생해보고, 막히면 음소거로 되돌린다 */
async function playFilm() {
  filmEl.muted = false;
  try {
    await filmEl.play();
  } catch {
    filmEl.muted = true;
    try { await filmEl.play(); } catch {}
  }
}

/* ── 유튜브로 트는 경우 ─────────────────────────────── */

function loadYtApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (loadYtApi.p) return loadYtApi.p;
  loadYtApi.p = new Promise((res) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); res(); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
    setTimeout(res, 8000);                       // 네트워크가 막히면 그냥 넘어간다
  });
  return loadYtApi.p;
}

function onFilmEnded() {
  if (filmSegment === 0) { filmSegment = -1; toGarden(); }
  else if (filmSegment === 1) { filmSegment = -1; toArchive(); }
}

async function playYt(seg) {
  await loadYtApi();
  if (!window.YT || !window.YT.Player) return;

  filmYtEl.classList.add("is-on");
  const vars = {
    autoplay: 1, mute: 1, controls: 0, rel: 0, modestbranding: 1,
    playsinline: 1, iv_load_policy: 3, disablekb: 1, fs: 0,
    start: seg.start,
  };
  if (seg.end) vars.end = seg.end;

  if (ytPlayer && ytPlayer.loadVideoById) {
    ytPlayer.loadVideoById({ videoId: seg.yt, startSeconds: seg.start, endSeconds: seg.end || undefined });
    try { ytPlayer.unMute(); } catch {}
    return;
  }

  const holder = document.createElement("div");
  filmYtEl.appendChild(holder);
  await new Promise((res) => {
    setTimeout(res, 6000);
    ytPlayer = new YT.Player(holder, {
      videoId: seg.yt,
      playerVars: vars,
      events: {
        onReady: (e) => {
          e.target.playVideo();
          try { e.target.unMute(); } catch {}   // 막히면 음소거 그대로
          res();
        },
        onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) onFilmEnded(); },
      },
    });
  });
}

function stopYt() {
  filmYtEl.classList.remove("is-on");
  try { ytPlayer && ytPlayer.pauseVideo(); } catch {}
}

/* ── 로컬 파일로 트는 경우 ──────────────────────────── */

function loadFilmFile(seg) {
  if (filmEl.getAttribute("src") !== seg.file) {
    filmEl.setAttribute("src", seg.file);
    filmEl.preload = "auto";
    filmEl.load();
  } else {
    try { filmEl.currentTime = 0; } catch {}
  }
}

/* 장면 교체 — 검정으로 덮인 사이에 바꿔치기한다 */
async function transition(prepare) {
  locked = true;
  endHold(true);
  await fadeOut();
  await prepare();
  await fadeIn();
  locked = false;
}

function hideChrome(hidden) {
  gsap.to([".pillnav", ".camera-box", ".hud"], {
    autoAlpha: hidden ? 0 : 1, duration: 0.5, ease: "power2.out",
  });
  gsap.to(titlebar, { autoAlpha: hidden ? 0 : 1, duration: 0.5 });
}

/* 구슬 → 영상 앞부분 */
async function toFilm(segment) {
  if (locked) return;
  if (!hasFilm) return back();          // 본편이 없는 저장소면 아카이브로
  const from = current;
  if (from === "garden") releaseGardenHand();   // 카메라 돌려받기
  await transition(async () => {
    gsap.set([screenGrid, screenOrb, screenGarden], { autoAlpha: 0 });
    gsap.set(screenFilm, { autoAlpha: 1 });
    document.body.classList.remove("is-garden");
    hideChrome(true);
    gsap.to(cursorEl, { opacity: 0, duration: 0.3 });
    current = "film";
    filmSegment = segment;

    const seg = FILM[segment];
    if (seg.local) {
      stopYt();
      gsap.set(filmEl, { autoAlpha: 1 });
      loadFilmFile(seg);
      await filmReady();
      await playFilm();
    } else {
      gsap.set(filmEl, { autoAlpha: 0 });
      filmEl.pause();
      await playYt(seg);
    }
    gsap.fromTo(filmHint, { opacity: 0 }, { opacity: 1, duration: 0.6, delay: 1.2 });
  });
  if (from === "orb") setPill("orb");
}

/* 영상 앞부분 → 정원 */
async function toGarden() {
  if (locked) return;
  filmEl.pause();
  stopYt();
  await transition(async () => {
    // 정원은 아카이브가 뜰 때부터 미리 띄워 둔다. 그래서 들어갈 때쯤이면
    // 이미 한참 돌아가 있고, 앞사람이 열어 본 구슬도 그대로 남아 있다.
    // ("읽은 기억" 이 처음부터 셋 다 차 있고 '기억 셋을 보셨습니다' 가 떠 있는 게 이것 때문)
    // 들어가는 순간 새로 띄워 언제나 첫 상태에서 시작하게 한다.
    await new Promise((res) => {
      const t = setTimeout(res, 6000);
      gardenFrame.addEventListener("load", () => { clearTimeout(t); res(); }, { once: true });
      try {
        if (gardenLoaded && gardenFrame.contentWindow) gardenFrame.contentWindow.location.reload();
        else { gardenFrame.src = "gooseulbit-garden.html"; gardenLoaded = true; }
      } catch {
        gardenFrame.src = "gooseulbit-garden.html";
        gardenLoaded = true;
      }
    });
    // 정원을 보는 동안 뒤 영상을 미리 받아둔다
    if (FILM[1].local) loadFilmFile(FILM[1]);

    gsap.set(screenFilm, { autoAlpha: 0 });
    gsap.set(screenGarden, { autoAlpha: 1 });
    // 정원은 자체 마우스 조작이 있어서 실제 커서를 돌려준다
    document.body.classList.add("is-garden");
    current = "garden";
    try { gardenFrame.contentWindow.focus(); } catch {}
    prepareGarden();          // 커서 모양 맞추기 (이미 돼 있으면 건너뜀)
    enableGardenHand();       // 손 조작 켜고 카메라 넘겨주기
  });
}

/* 정원 → 영상 뒷부분 */
async function toFilmTail() {
  if (locked || current !== "garden") return;
  await toFilm(1);
}

/* 뒷부분까지 끝나면 다시 아카이브로 — 전시가 계속 돌도록 */
async function toArchive() {
  if (locked) return;
  filmEl.pause();
  await transition(async () => resetArchive());
}

/* 앞 영상이 끝나면 정원으로, 뒤 영상이 끝나면 아카이브로
   (파일이 이미 나뉘어 있어서 중간에 끊을 필요가 없다) */
filmEl.addEventListener("ended", onFilmEnded);

/* 정원이 뜰 때마다 손봐 준다.
   정원은 넘어가기 직전에 '다음 이야기로' 화면을 2.3초 띄우고 신호를 보내는데,
   여기서는 검정 페이드로 넘기므로 그 화면이 겹쳐 보인다. 가리고, 기다리지도 않는다. */
function prepareGarden() {
  let doc;
  try { doc = gardenFrame.contentDocument; } catch { return; }
  if (!doc || doc.getElementById("yk-patch")) return;

  const st = doc.createElement("style");
  st.id = "yk-patch";
  st.textContent = `
    #outro{display:none !important}
    /* 손끝 커서를 인터랙션 1 과 같은 모양·색으로 */
    .hand-cursor{width:86px !important;height:86px !important;margin:-43px 0 0 -43px !important}
    .hand-cursor .ring{
      background: conic-gradient(#1eff66 calc(var(--p,0) * 1turn), rgba(255,255,255,.28) 0) !important;
      -webkit-mask: radial-gradient(circle, transparent 64%, #000 66%) !important;
              mask: radial-gradient(circle, transparent 64%, #000 66%) !important;
      filter: drop-shadow(0 0 10px #1eff66);
    }
    .hand-cursor .dot{
      inset:46% !important;
      background:#fff !important;
      box-shadow:0 0 12px #1eff66, 0 0 26px rgba(30,255,102,.35) !important;
    }`;
  (doc.head || doc.documentElement).appendChild(st);

  // 버튼을 누르면 정원의 2.3초 지연을 기다리지 않고 바로 넘어간다
  ["btn-next", "btn-go"].forEach((id) => {
    const b = doc.getElementById(id);
    if (b) b.addEventListener("click", () => toFilmTail());
  });
}

/* 정원의 손 조작을 켠다.
   정원은 자기 카메라를 따로 여므로, 그 전에 이쪽 카메라를 놓아준다. */
function enableGardenHand() {
  stopCamera();
  let doc;
  try { doc = gardenFrame.contentDocument; } catch { return; }
  const b = doc && doc.getElementById("btn-hand");
  if (!b) return;
  if (b.getAttribute("aria-pressed") !== "true") {
    setTimeout(() => b.click(), 300);      // 카메라가 완전히 놓인 뒤에
  }
}

/* 정원을 나오면 손 조작을 끄고 카메라를 돌려받는다 */
function releaseGardenHand() {
  let doc;
  try { doc = gardenFrame.contentDocument; } catch { doc = null; }
  const b = doc && doc.getElementById("btn-hand");
  if (b && b.getAttribute("aria-pressed") === "true") b.click();
  setTimeout(() => startCamera(), 400);
}
gardenFrame.addEventListener("load", prepareGarden);

/* 정원이 보내는 신호 — 위에서 이미 넘어갔으면 무시된다 */
window.addEventListener("message", (e) => {
  if (e.source !== gardenFrame.contentWindow) return;      // 정원에서 온 것만
  if (e.data && e.data.type === "garden:next") toFilmTail();
});

/* 꾹 누르기 / Enter 는 지금 화면에서 '다음'에 해당하는 동작을 한다.
   손으로만 조작할 때 정원의 버튼을 누를 수 없으므로 여기서도 넘어갈 수 있어야 한다. */
function advance() {
  if (locked) return;
  if (current === "grid") select();
  else if (current === "orb") (hasFilm ? toFilm(0) : back());
  else if (current === "film") (filmSegment === 0 ? toGarden() : toArchive());
  else if (current === "garden") toFilmTail();
}

btnGo.addEventListener("click", () => toFilm(0));
btnBack.addEventListener("click", back);
pillItems.forEach((b) => {
  b.addEventListener("click", () => {
    if (b.dataset.screen === "orb") select();
    else back();
  });
});

window.addEventListener("keydown", (e) => {
  if (locked) return;
  if (e.key === "ArrowRight") setFocus((focusIndex + 1) % N, 1);
  if (e.key === "ArrowLeft") setFocus((focusIndex - 1 + N) % N, -1);
  if (e.key === "Enter" || e.key === " ") advance();
  if (e.key === "Escape") back();
});

window.addEventListener("pointerdown", () => {
  tiles.forEach((t) => { if (t.playing) t.video.play().catch(() => {}); });
}, { once: true });

/* ============================================================
   커서 + 꾹 눌러 선택
   ============================================================ */
const cursorEl = document.getElementById("cursor");
const cursorProg = document.getElementById("cursorProg");
const baselineFill = document.getElementById("baselineFill");
const RING = 2 * Math.PI * 44;

const cursorPos = { x: STAGE_W / 2, y: STAGE_H / 2 };
const cursorX = gsap.quickTo(cursorEl, "x", { duration: FOLLOW.cursor, ease: "power2" });
const cursorY = gsap.quickTo(cursorEl, "y", { duration: FOLLOW.cursor, ease: "power2" });
const auraX = gsap.quickTo("#aura", "x", { duration: FOLLOW.aura, ease: "power2" });
const auraY = gsap.quickTo("#aura", "y", { duration: FOLLOW.aura, ease: "power2" });

const hold = { p: 0 };
let holding = false;
let holdTween = null;

/* 목록 첫 칸의 판정 범위 — 썸네일과 그 밑 이름까지 */
let hoverSince = -1;

function overNextTile(sx, sy) {
  return sx > STRIP_LEFT - HOVER_PAD && sx < STRIP_LEFT + THUMB_W + HOVER_PAD
      && sy > STRIP_TOP - HOVER_PAD && sy < STRIP_TOP + THUMB_H + 76;
}

function moveCursor(sx, sy) {
  cursorPos.x = sx;
  cursorPos.y = sy;
  cursorX(sx);
  cursorY(sy);

  const nx = sx / STAGE_W - 0.5;
  const ny = sy / STAGE_H - 0.5;

  // 목록 첫 칸(= 다음 영상) 위에 손을 얹으면 그 영상으로 넘어간다.
  // 그 자리에 계속 두면 HOVER_STEP 마다 한 칸씩 이어서 넘어간다.
  if (current === "grid" && !panLock && !locked && ready) {
    if (overNextTile(sx, sy)) {
      const now = performance.now();
      // 앞 칸이 아직 미끄러지는 중이면 기다린다 (연달아 튀는 걸 막는다)
      const settled = Math.abs(pan.x) < 4;
      if (settled && (hoverSince < 0 || now - hoverSince > HOVER_STEP * 1000)) {
        hoverSince = now;
        advanceFocus();
      }
    } else {
      hoverSince = -1;
    }
  }

  auraX(-nx * 70);
  auraY(-ny * 50);

  gsap.to(cursorEl, { opacity: 1, duration: 0.3, overwrite: "auto" });
}

function drawHold() {
  cursorProg.style.strokeDashoffset = String(RING * (1 - hold.p));
  baselineFill.style.transform = `scaleX(${hold.p})`;
}

/* byMouse : 마우스로 누른 것. 꼬집기는 잘못 잡힐 수 있어 오래 끌지만,
   마우스 클릭은 틀릴 일이 없으니 절반만 기다린다. */
function startHold(byMouse) {
  if (holding || locked || !ready) return;
  holding = true;
  const wait = byMouse ? HOLD.mouse : HOLD.time;
  gsap.to(cursorEl, { scale: 1.3, duration: 0.3, ease: "back.out(3)" });
  if (current === "orb") btnBack.classList.add("is-armed");

  // 누르고 있는 동안에는 목록이 더 넘어가지 않게 세워둔다
  if (current === "grid") {
    panLock = true;
    panRate = PAN_RATE_SNAP;
    panTarget.x = 0;
    // 큰 화면이 천천히 다가온다
    gsap.to(featureEl, { scale: 1.04, duration: wait * 0.8, ease: "power2.out" });
  }
  // 게이지는 언제나 빈 상태에서 시작한다.
  // (직전에 남은 진행률을 이어받으면 순식간에 다 찬 것처럼 보인다)
  hold.p = 0;
  drawHold();
  // overwrite: 놓았다 다시 잡을 때 되돌리던 tween 과 겹치지 않게
  holdTween = gsap.to(hold, {
    p: 1, duration: wait, ease: "none", overwrite: true, onUpdate: drawHold,
    onComplete: () => {
      endHold(true);
      pinchLatch = true;                  // 손을 펴기 전엔 다시 선택되지 않게
      advance();
    },
  });
}

function endHold(done) {
  if (!holding) return;
  holding = false;
  btnBack.classList.remove("is-armed");
  gsap.to(cursorEl, { scale: 1, duration: 0.4, ease: "power2.out" });

  if (!done) {
    gsap.to(featureEl, { scale: 1, duration: 0.4, ease: "power2.out" });
    // 다시 목록이 넘어갈 수 있게. 손을 놓자마자 튀지 않도록 한 박자 쉰다.
    panLock = false;
    panRate = PAN_RATE_FOLLOW;
    hoverSince = performance.now();
    // 구슬 화면에서는 질문이 숨어 있어야 하므로 그리드일 때만 되돌린다
    if (current === "grid") gsap.to(titlebar, { opacity: 1, duration: 0.4, ease: "power2.out" });
  }
  if (holdTween) holdTween.kill();
  if (done) { hold.p = 0; drawHold(); }
  else gsap.to(hold, { p: 0, duration: 0.3, ease: "power2.out", overwrite: true, onUpdate: drawHold });
}

/* 마우스 폴백.
   커서 위치만 손이 있을 때 양보하고, 누르는 건 언제나 받는다.
   (카메라가 켜져 있으면 손이 아닌 것도 잠깐씩 손으로 잡혀서,
    handActive 로 막아두면 마우스로는 영영 못 고르는 수가 있다) */
window.addEventListener("mousemove", (e) => {
  if (handActive) return;
  const p = toStage(e.clientX, e.clientY);
  moveCursor(p.x, p.y);
});
window.addEventListener("mousedown", () => startHold(true));
window.addEventListener("mouseup", () => endHold(false));

/* ============================================================
   로딩
   ============================================================ */
const loaderEl = document.getElementById("loader");
const loaderPct = document.getElementById("loaderPct");
const titlebar = document.getElementById("titlebar");
const titleBoot = document.getElementById("titleBoot");
const titleAsk = document.getElementById("titleAsk");

let ready = false;
const progress = { p: 0 };
let loaded = 0;
const TOTAL = N + 1;                 // 영상 8 + 구슬 이미지

function bumpLoaded() {
  loaded = Math.min(TOTAL, loaded + 1);
  gsap.to(progress, {
    p: loaded / TOTAL, duration: 0.6, ease: "power2.out",
    onUpdate: () => {
      loaderPct.textContent = String(Math.round(progress.p * 100)).padStart(3, "0");
      baselineFill.style.transform = `scaleX(${progress.p})`;
    },
  });
}

videoPool.forEach((v) => {
  let done = false;
  const ok = () => { if (!done) { done = true; bumpLoaded(); } };
  v.addEventListener("loadedmetadata", ok, { once: true });
  v.addEventListener("error", ok, { once: true });
});

const marbleImg = new Image();
marbleImg.onload = marbleImg.onerror = bumpLoaded;
marbleImg.src = "assets/marble.png";

function reveal() {
  if (ready) return;
  ready = true;

  const tl = gsap.timeline();
  tl.to(progress, {
    p: 1, duration: 0.4, ease: "power2.out",
    onUpdate: () => {
      loaderPct.textContent = String(Math.round(progress.p * 100)).padStart(3, "0");
      baselineFill.style.transform = `scaleX(${progress.p})`;
    },
  });
  tl.to(".loader__label", { opacity: 0, duration: 0.3, stagger: 0.05 });
  tl.to(baselineFill, { scaleX: 0, transformOrigin: "100% 50%", duration: 0.5, ease: "power2.inOut" }, "-=0.1");
  tl.set(baselineFill, { transformOrigin: "0% 50%" });
  tl.to(loaderEl, { autoAlpha: 0, duration: 0.6, ease: "power2.inOut" }, "-=0.35");

  // 큰 화면이 브라운관처럼 켜지고, 이름은 잡음에서 잡힌다
  tl.fromTo(featureEl,
    { opacity: 0, y: 0 },
    { opacity: 1, duration: 0.9, ease: "power3.out" }, "-=0.35");
  tl.add(() => {
    crtOn(true);
    gsap.set([featNameEl, featSlugEl], { opacity: 1, y: 0 });
    scramble(featNameEl, tiles[focusIndex].data.name, 0.9);
    scramble(featSlugEl, slugOf(tiles[focusIndex].data), 1.05);
  }, "<");
  tl.fromTo(allTiles,
    { opacity: 0, y: 70 },
    {
      opacity: 1, y: 0, duration: 0.9, ease: "power3.out",
      stagger: 0.06,
      clearProps: "opacity,transform",
    }, "-=0.7");

  // 굵은 픽셀 노이즈가 잘게 부서지면서 영상이 드러난다
  tl.to(tiles, {
    px: PIXEL_BASE,
    duration: 0.85,
    ease: "power2.out",
    stagger: { each: 0.025, from: "center" },
  }, "-=1.0");
  tl.to(tiles, {
    noise: 0,
    duration: 0.5,
    ease: "power2.in",
    stagger: { each: 0.025, from: "center" },
  }, "-=0.85");

  // 기관명이 물러나고 질문이 올라온다
  tl.to(titleBoot, { opacity: 0, y: -10, duration: 0.4, ease: "power2.in" }, "-=0.9");
  tl.add(() => {
    titleBoot.style.display = "none";
    titleAsk.style.display = "block";
  }, ">");
  tl.fromTo(titleAsk,
    { opacity: 0, y: 12 },
    { opacity: 1, y: 0, duration: 0.6, ease: "power3.out", immediateRender: false },
    ">");

  tl.fromTo([".meta--tl", ".meta--tr", ".pillnav", ".camera-box"],
    { opacity: 0, y: 12 },
    { opacity: 1, y: 0, duration: 0.7, stagger: 0.07, ease: "power3.out" }, "-=0.7");

  // 아카이브가 뜬 뒤부터 본편 영상과 정원을 뒤에서 받아둔다
  tl.add(() => {
    probeFilms().then(() => {
      if (FILM[0].local) loadFilmFile(FILM[0]);   // 앞 영상 미리 받기
    });
    if (!gardenLoaded) { gardenFrame.src = "gooseulbit-garden.html"; gardenLoaded = true; }
  });

  tl.add(() => { focusNameEl.textContent = tiles[focusIndex].data.name; }, "-=0.5");
  tl.fromTo(focusNameEl, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5 }, "-=0.5");
}

// 중앙 레이블은 로딩 화면 위에 먼저 나타난다
gsap.set([".meta--tl", ".meta--tr", ".pillnav", ".camera-box"], { opacity: 0 });
gsap.from(titlebar, { opacity: 0, duration: 1, ease: "power2.out", delay: 0.15 });

// 전부 로드되면 / 늦어도 7초 뒤에는 연다
const startedAt = performance.now();
const readyCheck = setInterval(() => {
  const waited = performance.now() - startedAt;
  if ((loaded >= TOTAL && waited > 1600) || waited > 7000) {
    clearInterval(readyCheck);
    reveal();
  }
}, 120);

/* ============================================================
   손 인식
   ============================================================ */
const camVideo = document.getElementById("cam");
const camCanvas = document.getElementById("camCanvas");
const camCtx = camCanvas.getContext("2d");
const camStatus = document.getElementById("camStatus");

/* 카메라는 정원(자체 손 조작)과 번갈아 쓴다. 한쪽이 잡고 있으면
   다른 쪽이 못 여는 기기가 있어서, 넘길 때 확실히 놓아준다. */
let camStream = null;

async function startCamera() {
  if (camStream) return true;
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
    camVideo.srcObject = camStream;
    await camVideo.play();
    return true;
  } catch (e) {
    camStream = null;
    return false;
  }
}

function stopCamera() {
  if (!camStream) return;
  camStream.getTracks().forEach((t) => t.stop());
  camStream = null;
  camVideo.srcObject = null;
  handPos.x = null;
}

let handLandmarker = null;
let handActive = false;
let lastVideoTime = -1;
let lastHands = null;
const handPos = { x: null, y: null };     // 눌러서 넘긴 손 좌표
let handSeenAt = 0;                       // 손이 화면에 들어온 시각
let pinchLatch = false;                   // 선택이 끝난 뒤 손을 펴야 풀린다

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];
const TIPS = [4, 8, 12, 16, 20];

async function initHands() {
  try {
    camStatus.textContent = "인식 준비 중";

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    camStatus.textContent = "카메라를 허용해 주세요";
    await startCamera();

    camStatus.classList.add("is-hidden");
    requestAnimationFrame(trackLoop);
  } catch (err) {
    console.warn("[hand] 초기화 실패:", err);
    camStatus.classList.remove("is-hidden");
    camStatus.innerHTML = "카메라를 쓸 수 없습니다<br />마우스를 움직이고 길게 누르세요";
  }
}

function drawCameraFrame() {
  const vw = camVideo.videoWidth;
  const vh = camVideo.videoHeight;
  const cw = camCanvas.width;
  const ch = camCanvas.height;
  const s = Math.max(cw / vw, ch / vh);
  const dw = vw * s;
  const dh = vh * s;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;

  camCtx.save();
  camCtx.translate(cw, 0);
  camCtx.scale(-1, 1);            // 거울 모드
  camCtx.drawImage(camVideo, dx, dy, dw, dh);
  camCtx.restore();

  camCtx.fillStyle = "rgba(0,0,0,0.4)";
  camCtx.fillRect(0, 0, cw, ch);

  return { dx, dy, dw, dh, cw, ch };
}

function toCanvas(lm, box) {
  return {
    x: box.cw - (box.dx + lm.x * box.dw),   // 거울 반전
    y: box.dy + lm.y * box.dh,
  };
}

function drawHand(lms, box) {
  camCtx.strokeStyle = "rgba(255,255,255,0.5)";
  camCtx.lineWidth = 2;
  CONNECTIONS.forEach(([a, b]) => {
    const p = toCanvas(lms[a], box);
    const q = toCanvas(lms[b], box);
    camCtx.beginPath();
    camCtx.moveTo(p.x, p.y);
    camCtx.lineTo(q.x, q.y);
    camCtx.stroke();
  });

  camCtx.fillStyle = "rgba(255,255,255,0.7)";
  lms.forEach((lm) => {
    const p = toCanvas(lm, box);
    camCtx.beginPath();
    camCtx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    camCtx.fill();
  });

  TIPS.forEach((idx) => {
    const p = toCanvas(lms[idx], box);
    const big = idx === 8;
    const r = big ? 10 : 6;
    camCtx.save();
    camCtx.shadowColor = "rgba(255,32,32,0.95)";
    camCtx.shadowBlur = big ? 24 : 12;
    camCtx.fillStyle = big ? "#ff1e1e" : "#ff4d4d";
    camCtx.beginPath();
    camCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
    camCtx.fill();
    camCtx.restore();
    if (big) {
      camCtx.strokeStyle = "rgba(255,255,255,0.9)";
      camCtx.lineWidth = 2;
      camCtx.beginPath();
      camCtx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
      camCtx.stroke();
    }
  });
}

/* 엄지-검지 거리로 집기 판정 (손 크기로 정규화 + 히스테리시스)
   손을 편 상태의 ratio 는 0.8~1.2, 진짜로 꼬집으면 0.1~0.2 근처다.
   기준이 헐거우면 손을 들자마자 눌린 것으로 잡힌다. */
function isPinching(lms) {
  const d = Math.hypot(lms[4].x - lms[8].x, lms[4].y - lms[8].y);
  const scale = Math.hypot(lms[0].x - lms[9].x, lms[0].y - lms[9].y) || 0.2;
  const ratio = d / scale;
  return holding ? ratio < HOLD.pinchOff : ratio < HOLD.pinchOn;
}

function trackLoop() {
  if (camVideo.readyState >= 2) {
    const box = drawCameraFrame();

    if (camVideo.currentTime !== lastVideoTime) {
      lastVideoTime = camVideo.currentTime;
      lastHands = handLandmarker.detectForVideo(camVideo, performance.now());
    }

    if (lastHands && lastHands.landmarks && lastHands.landmarks.length > 0) {
      const lms = lastHands.landmarks[0];
      if (!handActive) handSeenAt = performance.now();   // 손이 새로 들어온 순간
      handActive = true;
      drawHand(lms, box);

      const p = toCanvas(lms[8], box);
      // 가장자리 15% 는 여유로 두고 화면 전체에 펼친다
      const nx = gsap.utils.clamp(0, 1, (p.x / box.cw - 0.12) / 0.76);
      const ny = gsap.utils.clamp(0, 1, (p.y / box.ch - 0.15) / 0.7);

      // 손 좌표를 그대로 쓰면 미세한 떨림까지 따라간다 — 한 번 눌러서 넘긴다
      if (handPos.x === null) { handPos.x = nx; handPos.y = ny; }
      else {
        handPos.x += (nx - handPos.x) * FOLLOW.hand;
        handPos.y += (ny - handPos.y) * FOLLOW.hand;
      }
      moveCursor(handPos.x * STAGE_W, handPos.y * STAGE_H);

      // 손이 막 잡힌 직후에는 랜드마크가 흔들려 꼬집음으로 오인되기 쉽다
      const settled = performance.now() - handSeenAt > HOLD.grace;
      const pinching = isPinching(lms);
      if (!pinching) pinchLatch = false;          // 한 번 놓아야 다음 선택이 가능
      if (settled && pinching && !pinchLatch) startHold();
      else if (!pinching) endHold(false);
    } else {
      if (handActive) gsap.to(cursorEl, { opacity: 0, duration: 0.4 });
      handActive = false;
      handPos.x = null;                   // 손이 사라지면 다음엔 그 자리에서 새로 시작
      endHold(false);
    }
  }
  requestAnimationFrame(trackLoop);
}

initHands();

// 디버그용
window.__yk = { tiles, select, back, setFocus, reveal, moveCursor, state: () => ({ focusIndex, current, locked, ready }) };
