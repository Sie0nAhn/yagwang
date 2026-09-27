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
    name: "서늘한 새벽공기", file: "01-dawn-air.mp4", tags: ["빛", "온도"], tint: "#6f83e8",
    marble: { hue: 208, sat: 1.2, bri: 0.82, glow: "rgba(74,108,240,.34)" },
    grade: ["#6d7cbe", "#aba4e0", "#fff1f8"],
  },
  {
    name: "오후 4시의 햇살", file: "02-afternoon-light.mp4", tags: ["온도", "시간"], tint: "#ff9b4d",
    marble: { hue: 8, sat: 1.1, bri: 1.03, glow: "rgba(255,140,40,.34)" },
    grade: ["#eb9670", "#ffd6ab", "#fffaee"],
  },
  {
    name: "윤슬의 빤짝임", file: "03-water-glitter.mp4", tags: ["물", "빛"], tint: "#4fd2e6",
    marble: { hue: 169, sat: 0.95, bri: 1.05, glow: "rgba(70,207,230,.32)" },
    grade: ["#6ea7c4", "#abe0e9", "#f8feff"],
  },
  {
    name: "계절의 경계면", file: "04-season-edge.mp4", tags: ["계절", "촉감"], tint: "#7fdc9b",
    marble: { hue: 112, sat: 0.95, bri: 1.0, glow: "rgba(121,220,143,.30)" },
    grade: ["#87ae91", "#c6e8c2", "#fcfff4"],
  },
  {
    name: "고요한 정적의 소리", file: "05-silence.mp4", tags: ["소리", "여백"], tint: "#b9b4e8",
    marble: { hue: 224, sat: 0.62, bri: 1.02, glow: "rgba(169,166,220,.30)" },
    grade: ["#9291aa", "#cbc8db", "#fbfafd"],
  },
  {
    name: "낯선 타인의 온기", file: "06-stranger-warmth.mp4", tags: ["온도", "사람"], tint: "#ff8a70",
    marble: { hue: 352, sat: 1.05, bri: 1.0, glow: "rgba(255,122,92,.34)" },
    grade: ["#d68d7b", "#ffc3b1", "#fff6ef"],
  },
  {
    name: "비 오는 날의 흙냄새", file: "07-petrichor.mp4", tags: ["냄새", "날씨"], tint: "#c9c076",
    marble: { hue: 26, sat: 0.68, bri: 0.93, glow: "rgba(179,154,77,.30)" },
    grade: ["#909b71", "#d0cc9e", "#faf8ea"],
  },
  {
    name: "이유없는 설렘", file: "08-flutter.mp4", tags: ["감정", "심박"], tint: "#ff77b8",
    marble: { hue: 314, sat: 1.05, bri: 1.02, glow: "rgba(255,94,168,.34)" },
    grade: ["#c980ad", "#ffbfdb", "#fff4fa"],
  },
  {
    name: "첫눈을 보던 감각", file: "09-first-snow.mp4", tags: ["눈", "계절"], tint: "#bcd8f5",
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
   영상 그리드
   ============================================================ */
/* 8열 × 4행 = 32칸. 8개 영상을 반복해서 다 채운다.
   실제 <video> 는 8개뿐이고, 같은 영상을 여러 타일이 나눠 그린다. */
const GRID_COLS = 8;
const GRID_ROWS = 4;
const TILE_W = 360;                          // 4:3 가로형
const TILE_MEDIA_H = 270;
const TILE_H = 31 + TILE_MEDIA_H + 30;       // 위 레이블 + 영상 + 아래 태그 = 331
const COL_PITCH = 416;                       // 좌우 간격 56px
/* 행 간격을 타일보다 159px 넉넉하게 잡아, 그 빈 줄의 한가운데가
   화면 세로 중앙과 맞아떨어지게 한다 → 중앙 레이블이 타일 사이에 놓인다 */
const ROW_PITCH = 490;
const COL_X0 = (COL_PITCH - TILE_W) / 2;     // 45
const ROW_Y0 = (ROW_PITCH - TILE_H) / 2;     // 59.5
const PLANE_W = GRID_COLS * COL_PITCH;       // 3200
const PLANE_H = GRID_ROWS * ROW_PITCH;       // 2280

const PAN_X = (PLANE_W - STAGE_W) / 2;       // 좌우로 밀 수 있는 범위
const PAN_Y = (PLANE_H - STAGE_H) / 2;

/* 화면 해상도 — 숫자가 클수록 캔버스가 작아져서 가벼워진다 */
const PIXEL_BASE = 2.8;
const PIXEL_HOLD = 1.6;    // 꾹 누르는 동안은 또렷하게
const PIXEL_BOOT = 30;     // 로딩 중에는 아주 굵게

/* ASCII 레이어 */
const ASCII_CELL = 9;                            // 글자 한 칸(px)
const ASCII_RAMP = "..·:ee//++**==22%%##@@";       // 임계값 위쪽 밝기를 이 문자들로
const ASCII_ALPHA = 0.8;
const ASCII_MIN_LUM = 0.56;                        // 이보다 밝은 데에만 글자가 맺힌다

const planeEl = document.getElementById("plane");
const tiles = [];

// 플레인 실제 크기 = 계산값. CSS 에 박아두면 격자를 바꿀 때마다 어긋난다.
planeEl.style.width = PLANE_W + "px";
planeEl.style.height = PLANE_H + "px";
planeEl.style.marginLeft = -PLANE_W / 2 + "px";
planeEl.style.marginTop = -PLANE_H / 2 + "px";

function placeTile(el, col, row) {
  el.style.left = COL_X0 + col * COL_PITCH + "px";
  el.style.top = ROW_Y0 + row * ROW_PITCH + "px";
}

/* 실제 영상 요소는 8개뿐 — 32칸이 이 8개를 나눠 그린다 */
const videoPool = VIDEOS.map((data) => {
  const v = document.createElement("video");
  // 파일명은 영문. 한글 파일명은 맥(NFD)과 깃허브(요청은 NFC)에서 서로 다른
  // 이름으로 취급돼 배포 후 404 가 난다.
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

for (let row = 0; row < GRID_ROWS; row++) {
  for (let col = 0; col < GRID_COLS; col++) {
    // 줄마다 3칸씩 밀어서 채운다 — 위아래·좌우 어느 쪽도 같은 영상이 붙지 않게
    const vi = (col + row * 3) % N;
    const data = VIDEOS[vi];

    const el = document.createElement("div");
    el.className = "tile";
    placeTile(el, col, row);

    const no = String(vi + 1).padStart(2, "0");
    el.innerHTML =
      `<div class="tile__top">` +
        `<span class="tile__name">${data.name}</span>` +
        `<span class="tile__no">${no}</span>` +
      `</div>` +
      `<div class="tile__media">` +
        `<canvas class="tile__pix"></canvas>` +
        `<canvas class="tile__ascii"></canvas>` +
        `<span class="tile__hatch"></span>` +
      `</div>` +
      `<div class="tile__bottom">` +
        `<span class="tile__tags">${data.tags.map((t) => `<span class="tile__tag">${t}</span>`).join("")}</span>` +
        `<span class="tile__year">2026</span>` +
      `</div>`;

    const media = el.querySelector(".tile__media");
    const pix = el.querySelector(".tile__pix");
    const asc = el.querySelector(".tile__ascii");

    if (VIDEO_FX) el.style.setProperty("--grade", `url(#grade${vi})`);

    const index = tiles.length;
    el.addEventListener("click", () => {
      if (locked) return;
      if (focusIndex === index) select();
      else setFocus(index);
    });

    planeEl.appendChild(el);
    tiles.push({
      el, media, data, vi,
      video: videoPool[vi],
      canvas: pix, ctx: pix.getContext("2d"),      // 휘어서 남는 바깥은 투명하게
      ascii: asc, actx: asc.getContext("2d"),
      bw: 0, bh: 0,                                 // 현재 캔버스 해상도
      aw: 0, ah: 0,                                 // ASCII 격자 크기
      px: PIXEL_BOOT,                               // 화면 알갱이 크기
      noise: 1,                                     // 1 = 완전한 노이즈, 0 = 영상
      blur: 0,                                      // 바깥으로 갈수록 커지는 모션 블러
      bend: 0,                                      // 면이 )( 로 휘는 정도
      asciiOn: 0,                                   // ASCII 레이어 진하기
      holdScale: 1,
      cx: COL_X0 + col * COL_PITCH + TILE_W / 2,    // 플레인 안에서의 중심
      cy: ROW_Y0 + row * ROW_PITCH + TILE_H / 2,
    });
  }
}

/* 영상마다 작은 중간 캔버스를 하나씩 둔다.
   1080p 비디오에서 직접 그리면 호출 한 번마다 텍스처 비용이 붙는데,
   타일 32장이 띠 단위로 수백 번 그려대므로 그게 가장 무겁다.
   프레임당 영상당 딱 한 번만 여기에 옮기고, 타일들은 여기서 가져다 쓴다. */
const SRC_W = 288;
const SRC_H = 216;
const videoSrc = videoPool.map(() => {
  const c = document.createElement("canvas");
  c.width = SRC_W;
  c.height = SRC_H;
  return { canvas: c, ctx: c.getContext("2d", { alpha: false }), ready: false };
});

function updateVideoSources() {
  const wanted = new Set();
  tiles.forEach((t) => { if (t.visible !== false) wanted.add(t.vi); });
  videoPool.forEach((v, i) => {
    const s = videoSrc[i];
    if (!wanted.has(i) || v.readyState < 2 || !v.videoWidth) { s.ready = false; return; }

    // 원본은 세로 영상(9:16)이라 가로 프레임에 맞춰 가운데를 잘라 쓴다.
    // (늘려서 채우면 형태가 뭉개진다)
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const dstAspect = SRC_W / SRC_H;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (vw / vh > dstAspect) { sw = vh * dstAspect; sx = (vw - sw) / 2; }
    else { sh = vw / dstAspect; sy = (vh - sh) / 2; }

    s.ctx.drawImage(v, sx, sy, sw, sh, 0, 0, SRC_W, SRC_H);
    s.ready = true;
  });
}

/* ASCII 샘플링용 스크래치 캔버스 (전 타일 공용) */
const sampleCv = document.createElement("canvas");
const sampleCtx = sampleCv.getContext("2d", { willReadFrequently: true });

/* 해칭 무늬 — 영상 위에만 얹혀야 해서 CSS 가 아니라 캔버스에서 그린다 */
const hatchTile = (() => {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 4;
  const x = c.getContext("2d");
  x.strokeStyle = "rgba(255,255,255,.55)";
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(-1, 3); x.lineTo(3, -1);
  x.stroke();
  return c;
})();
const HATCH_ALPHA = 0.13;

/* ============================================================
   반응 속도 — 클수록 느긋하게 따라온다
   ============================================================ */
const FOLLOW = {
  hand: 0.07,      // 손 좌표를 매 프레임 얼마나 반영할지 (작을수록 손떨림이 죽는다)
  cursor: 0.9,     // 커서가 따라오는 시간(초)
  pan: 3.4,        // 그리드가 밀려가는 시간(초)
  aura: 4.2,       // 배경이 밀려가는 시간(초)
  dwell: 320,      // 이만큼 머물러야 다른 영상으로 포커스가 넘어간다(ms)
};

/* 꾹 눌러 고르기 */
const HOLD = {
  time: 2.4,       // 게이지가 다 차는 데 걸리는 시간(초) = 확대된 영상을 보는 시간
  // 실측: 편 손 0.76 / 반쯤 오므린 손 0.28 / 실제로 꼬집으면 0.03
  pinchOn: 0.22,   // 엄지-검지가 이보다 가까워야 '꼬집었다'
  pinchOff: 0.40,  // 이보다 벌어지면 놓은 것
  grace: 700,      // 손이 처음 잡히고 이 시간 동안은 꼬집어도 무시(ms)
};

/* 플레인 이동 — 커서를 따라 반대로 밀린다.
   꾹 누를 때는 고른 타일을 화면 가운데로 데려와야 해서 목표값·속도를
   그때그때 갈아끼운다. 그래서 tween 대신 직접 감쇠시킨다. */
const pan = { x: 0, y: 0 };
const panTarget = { x: 0, y: 0 };
let panLock = false;                 // true 면 커서를 따라가지 않는다
let panRate = 0.6;                   // 초당 목표에 다가가는 비율
let panLastT = performance.now();

/* 초 단위로 환산한 감쇠 — 주사율이 달라도 같은 속도로 따라온다 */
function rateFor(seconds) {
  return 1 - Math.pow(0.05, 1 / seconds);   // seconds 안에 95% 도달
}
const PAN_RATE_FOLLOW = rateFor(FOLLOW.pan);
const PAN_RATE_SNAP = rateFor(0.8);
panRate = PAN_RATE_FOLLOW;

function stepPan() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - panLastT) / 1000);
  panLastT = now;
  const k = 1 - Math.pow(1 - panRate, dt);
  pan.x += (panTarget.x - pan.x) * k;
  pan.y += (panTarget.y - pan.y) * k;
}

let focusIndex = GRID_COLS + 3;    // 가운데쯤 되는 칸에서 시작
let focusCandidate = -1;           // 넘어가려고 대기 중인 칸
let focusCandidateAt = 0;
let locked = false;

const allTiles = gsap.utils.toArray(".tile");     // 영상 + 빈 슬롯

/* 핀쿠션 왜곡 — 중심에서 멀수록 바깥으로 밀려나며 늘어난다 */
const PIN_R = 900;         // 기준 반경
const PIN_K = 0.17;        // 바깥으로 미는 양
const PIN_Z = 300;         // 뒤로 밀리는 깊이
const BEND_MAX = 0.42;     // 타일 면이 )( 로 휘는 최대치
const BLUR_MAX = 16;       // 가장자리 모션 블러 최대치(저해상 캔버스 기준 px)
const SOFT_MAX = 5;        // 가장자리 흐림(CSS blur) 최대치 px

function pincushion(vx, vy) {
  const t = Math.min(2.4, Math.hypot(vx, vy) / PIN_R);
  const f = 1 + PIN_K * t * t;                 // 1 보다 커진다 = 바깥으로
  return {
    dx: vx * (f - 1),
    dy: vy * (f - 1),
    z: -t * t * PIN_Z,
    rotY: -vx * 0.020,
    rotX: vy * 0.016,
    t,
  };
}

/* 타일 한 장 그리기

   가로 띠로 잘라서 한 줄씩 그린다.
   · 띠마다 폭을 다르게 주면 좌우 면이 )( 로 휜다 (핀쿠션)
   · 띠를 가로로 여러 번 겹쳐 그리면 방향성 모션 블러가 된다     */
function drawTilePixels(tile) {
  const px = Math.max(1, tile.px);
  // 캔버스 크기를 바꾸면 컨텍스트가 통째로 다시 잡힌다.
  // px 가 부드럽게 변하는 동안 매 프레임 갈아엎지 않도록 8칸 단위로 끊는다.
  const bw = Math.max(8, Math.round(TILE_W / px / 8) * 8);
  const bh = Math.max(8, Math.round(TILE_MEDIA_H / px / 8) * 8);

  if (bw !== tile.bw || bh !== tile.bh) {
    tile.canvas.width = bw;
    tile.canvas.height = bh;
    tile.bw = bw;
    tile.bh = bh;
  }

  const g = tile.ctx;
  g.imageSmoothingEnabled = true;
  g.clearRect(0, 0, bw, bh);

  // 로딩 중에는 색 노이즈가 알갱이로 깔린다
  if (tile.noise > 0.01) {
    const img = g.createImageData(bw, bh);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = 18 + Math.random() * 90;
      d[i] = n * 0.86;
      d[i + 1] = n * 0.98;
      d[i + 2] = n;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  const src = videoSrc[tile.vi];
  if (!src.ready) return;
  const v = src.canvas;

  const bend = tile.bend;
  const spread = tile.blur;
  // 많이 휜 타일일수록 잘게 쪼개야 곡선이 계단으로 보이지 않는다
  // (그리는 횟수 = strips × samples 라 상한을 낮게 잡는다)
  const strips = bend > 0.02
    ? Math.min(22, Math.max(10, Math.round(bend * 44 + 10)))
    : (spread > 0.4 ? 6 : 1);
  const samples = spread > 3 ? 2 : 1;

  const sw = SRC_W;
  const sh = SRC_H;
  const stripSrcH = sh / strips;
  const stripDstH = bh / strips;

  g.globalAlpha = (1 - tile.noise) / samples;

  for (let s = 0; s < strips; s++) {
    // 띠의 세로 위치를 -1 ~ 1 로. 가운데(0)에서 가장 잘록해진다
    const p = strips === 1 ? 0 : ((s + 0.5) / strips) * 2 - 1;
    const wScale = 1 - bend * (1 - p * p);
    const dw = bw * wScale;
    const dx = (bw - dw) / 2;
    const dy = s * stripDstH;

    for (let k = 0; k < samples; k++) {
      const off = samples === 1 ? 0 : (k / (samples - 1) - 0.5) * 2 * spread;
      g.drawImage(
        v,
        0, s * stripSrcH, sw, stripSrcH,
        dx + off, dy, dw, stripDstH + 1
      );
    }
  }
  g.globalAlpha = 1;

  // 해칭은 그려진 픽셀 위에만 (source-atop) — 휘어서 빈 바깥은 건드리지 않는다
  if (!tile.hatch) tile.hatch = g.createPattern(hatchTile, "repeat");
  g.globalCompositeOperation = "source-atop";
  g.globalAlpha = HATCH_ALPHA;
  g.fillStyle = tile.hatch;
  g.fillRect(0, 0, bw, bh);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
}

/* ASCII 레이어 — 지금 보고 있는 타일에만 얹는다 */
function drawAscii(tile) {
  const el = tile.ascii;
  const cols = Math.floor(TILE_W / ASCII_CELL);
  const rows = Math.floor(TILE_MEDIA_H / ASCII_CELL);

  if (tile.aw !== cols || tile.ah !== rows) {
    el.width = TILE_W;
    el.height = TILE_MEDIA_H;
    tile.aw = cols;
    tile.ah = rows;
  }

  const g = tile.actx;
  g.clearRect(0, 0, TILE_W, TILE_MEDIA_H);
  if (tile.asciiOn < 0.02 || !videoSrc[tile.vi].ready) return;

  // 격자 크기로 한 번 줄여서 칸마다의 색을 읽는다
  if (sampleCv.width !== cols || sampleCv.height !== rows) {
    sampleCv.width = cols;
    sampleCv.height = rows;
  }
  sampleCtx.drawImage(videoSrc[tile.vi].canvas, 0, 0, cols, rows);
  const data = sampleCtx.getImageData(0, 0, cols, rows).data;

  g.font = `500 ${ASCII_CELL + 2}px "Roboto Mono", monospace`;
  g.textBaseline = "top";
  g.globalAlpha = tile.asciiOn * ASCII_ALPHA;

  const last = ASCII_RAMP.length - 1;
  const bend = tile.bend;

  for (let y = 0; y < rows; y++) {
    // 영상 레이어와 똑같이 휘도록 이 줄의 가로 배율을 맞춘다
    const p = ((y + 0.5) / rows) * 2 - 1;
    const wScale = 1 - bend * (1 - p * p);
    const originX = (TILE_W * (1 - wScale)) / 2;

    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const r = data[i], gg = data[i + 1], b = data[i + 2];
      const lum = (r * 0.299 + gg * 0.587 + b * 0.114) / 255;

      // 밝은 부분에만 글자가 맺힌다
      if (lum < ASCII_MIN_LUM) continue;
      const k = (lum - ASCII_MIN_LUM) / (1 - ASCII_MIN_LUM);
      const ch = ASCII_RAMP[Math.round(k * last)];
      if (ch === " ") continue;

      // 원본보다 한 톤 밝고 옅게 — 레퍼런스의 파스텔 느낌
      g.fillStyle = `rgb(${Math.min(255, r + 32)},${Math.min(255, gg + 32)},${Math.min(255, b + 32)})`;
      g.fillText(ch, originX + x * ASCII_CELL * wScale, y * ASCII_CELL);
    }
  }
  g.globalAlpha = 1;
}

/* 매 프레임 : 플레인을 밀고, 타일을 어안으로 휘고, 픽셀로 다시 그린다 */
function renderGrid() {
  if (locked || !ready || current !== "grid") return;

  stepPan();
  planeEl.style.transform = `translate3d(${pan.x}px, ${pan.y}px, 0)`;

  const t = performance.now() / 1000;
  let best = -1;
  let bestDist = Infinity;

  tiles.forEach((tile, i) => {
    // 화면 중앙 기준으로 이 타일이 얼마나 벗어나 있는지
    const vx = tile.cx - PLANE_W / 2 + pan.x;
    const vy = tile.cy - PLANE_H / 2 + pan.y;
    const w = pincushion(vx, vy);
    const breathe = Math.sin(t * 0.7 + i * 1.6) * 4;

    // preserve-3d 안에서는 z-index 가 아니라 z 좌표가 앞뒤를 정한다.
    // 커지는 타일은 앞으로 끌어와야 다른 타일에 가리지 않는다.
    const holdZ = (tile.holdScale - 1) * 130;

    tile.el.style.transform =
      `translate3d(${w.dx}px, ${w.dy + breathe}px, ${w.z + holdZ}px)` +
      ` rotateY(${w.rotY}deg) rotateX(${w.rotX}deg) scale(${tile.holdScale})`;
    tile.el.style.opacity = String(gsap.utils.clamp(0.08, 1, 1.2 - w.t * 0.72));
    tile.el.style.zIndex = tile.holdScale > 1.02 ? "50" : "auto";

    // 바깥으로 갈수록 : 면이 휘고, 옆으로 흐르고, 뿌옇게 번진다
    tile.bend = gsap.utils.clamp(0, BEND_MAX, (w.t - 0.18) * 0.34);
    tile.blur = Math.min(BLUR_MAX, Math.max(0, w.t - 0.25) * 11);
    tile.el.style.setProperty(
      "--sblur",
      Math.min(SOFT_MAX, Math.max(0, w.t - 0.4) * 4.2).toFixed(2) + "px"
    );

    // 커서와의 거리로 포커스 판정 (왜곡된 실제 위치 기준)
    const sx = STAGE_W / 2 + vx + w.dx;
    const sy = STAGE_H / 2 + vy + w.dy;
    const dist = Math.hypot(sx - cursorPos.x, sy - cursorPos.y);
    // 지금 포커스된 타일에 가산점을 줘서 경계에서 이름이 떨리지 않게
    const weighted = i === focusIndex ? dist * 0.82 : dist;
    if (weighted < bestDist) { bestDist = weighted; best = i; }

    tile.visible = w.t < 1.45;
  });

  // 화면에 걸친 영상만 재생
  const wanted = new Set();
  tiles.forEach((tile) => { if (tile.visible) wanted.add(tile.vi); });
  videoPool.forEach((v, vi) => {
    if (wanted.has(vi)) { if (v.paused) v.play().catch(() => {}); }
    else if (!v.paused) v.pause();
  });

  // 꾹 누르는 동안에는 고른 타일이 바뀌지 않는다.
  // 스쳐 지나갈 때 이름이 딸려 바뀌지 않도록 잠깐 머물러야 넘어간다.
  if (!holding && best >= 0 && best !== focusIndex) {
    if (best !== focusCandidate) {
      focusCandidate = best;
      focusCandidateAt = performance.now();
    } else if (performance.now() - focusCandidateAt > FOLLOW.dwell) {
      setFocus(best);
    }
  } else if (best === focusIndex) {
    focusCandidate = -1;
  }
}
gsap.ticker.add(renderGrid);

/* 그리기는 화면 전환·로딩과 상관없이 계속 돈다.
   32장을 매 프레임 다시 그리면 무거워서, 지금 보고 있는 것 말고는
   프레임을 걸러 그린다. 타일마다 다른 프레임에 걸리도록 흩어 놓는다. */
let drawFrame = 0;

function drawTiles() {
  drawFrame++;
  updateVideoSources();          // 영상 8개를 작은 캔버스로 한 번씩만 옮긴다
  tiles.forEach((tile, i) => {
    const loading = tile.noise > 0.01;
    if (tile.visible === false && !loading) return;

    const isFocus = i === focusIndex || tile.holdScale > 1.02;
    // 거의 안 보이는 타일은 건너뛴다
    if (!isFocus && !loading && parseFloat(tile.el.style.opacity || "1") < 0.07) return;

    const every = isFocus || loading ? 1 : (tile.blur > 6 ? 3 : 2);
    if (drawFrame % every === i % every) drawTilePixels(tile);

    // ASCII 는 비싸서 지금 보고 있는 한 장에만
    if (isFocus || tile.asciiOn > 0.02) drawAscii(tile);
  });
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

function setFocus(i) {
  if (i === focusIndex) return;
  const prev = tiles[focusIndex];
  if (prev) {
    prev.el.classList.remove("is-focus");
    gsap.to(prev, { asciiOn: 0, duration: 0.35, ease: "power2.in" });
  }
  focusIndex = i;
  const tile = tiles[i];
  tile.el.classList.add("is-focus");
  gsap.to(tile, { asciiOn: 1, duration: 0.5, ease: "power2.out" });

  const vi = tile.vi;
  setTint(VIDEOS[vi].tint);
  applyMarbleTheme(vi);
  if (current === "grid") hudIndexEl.textContent = indexLabel(vi);
  orbIndexEl.textContent = String(vi + 1).padStart(2, "0");
  orbCaptionName.textContent = tile.data.name;

  // 가운데 오른쪽 레이블이 현재 영상 이름으로 갈아끼워진다
  gsap.timeline()
    .to(focusNameEl, { y: -12, opacity: 0, duration: 0.18, ease: "power2.in" })
    .add(() => { focusNameEl.textContent = tile.data.name; })
    .fromTo(focusNameEl, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.32, ease: "power3.out" });
}
tiles[focusIndex].el.classList.add("is-focus");
tiles[focusIndex].asciiOn = 1;
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

/* 응축 연출의 재료 — 타일이 보이던 픽셀 그대로 잘라낸다 */
function snapshot(tile) {
  const src = tile.canvas;
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
  const chosen = tiles[idx];

  // 티커가 쓰던 값을 GSAP 이 이어받고, 티커는 멈춘다
  allTiles.forEach((el) => {
    const cs = getComputedStyle(el);
    gsap.set(el, { clearProps: "transform", opacity: cs.opacity });
  });
  locked = true;

  const r = chosen.media.getBoundingClientRect();
  const p = toStage(r.left, r.top);
  const w = r.width / stageScale;
  const h = r.height / stageScale;

  morph.innerHTML = "";
  morph.appendChild(snapshot(chosen));

  setPill("orb");

  const tl = gsap.timeline({
    onComplete: () => { locked = false; current = "orb"; },
  });

  // 1. 고른 타일만 남고 나머지는 흩어진다
  tl.to(chosen.el, { scale: 1.08, duration: 0.5, ease: "power2.out" }, 0);
  allTiles.forEach((el) => {
    if (el === chosen.el) return;
    tl.to(el, {
      opacity: 0, y: 60, scale: 0.9,
      duration: 0.5, ease: "power2.in",
      delay: Math.abs(parseFloat(el.style.left) - chosen.cx) / 4000,
    }, 0);
  });
  tl.to(".grid-fade", { opacity: 0, duration: 0.4 }, 0);

  // 2. 타일 → 구슬로 응축
  //    (tween 시작 직전 프레임에 초기값을 심어야 from 값이 제대로 잡힌다)
  tl.add(() => {
    gsap.set(chosen.el, { visibility: "hidden" });
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
  gsap.set([screenOrb, screenFilm, screenGarden], { autoAlpha: 0 });
  gsap.set(screenGrid, { autoAlpha: 1 });
  document.body.classList.remove("is-garden");
  hideChrome(false);
  setPill("grid");

  // 고른 타일은 선택할 때 숨겨뒀으므로 반드시 되살려야 한다
  allTiles.forEach((el) => gsap.set(el, { clearProps: "transform,opacity", visibility: "visible" }));
  tiles.forEach((t) => { t.holdScale = 1; t.px = PIXEL_BASE; });
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
    if (!gardenLoaded) {
      gardenFrame.src = "gooseulbit-garden.html";
      gardenLoaded = true;
      await new Promise((res) => {
        const t = setTimeout(res, 6000);
        gardenFrame.addEventListener("load", () => { clearTimeout(t); res(); }, { once: true });
      });
    }
    // 정원을 보는 동안 뒤 영상을 미리 받아둔다
    if (FILM[1].local) loadFilmFile(FILM[1]);

    gsap.set(screenFilm, { autoAlpha: 0 });
    gsap.set(screenGarden, { autoAlpha: 1 });
    // 정원은 자체 마우스 조작이 있어서 실제 커서를 돌려준다
    document.body.classList.add("is-garden");
    current = "garden";
    try { gardenFrame.contentWindow.focus(); } catch {}
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
  st.textContent = "#outro{display:none !important}";
  (doc.head || doc.documentElement).appendChild(st);

  // 버튼을 누르면 정원의 2.3초 지연을 기다리지 않고 바로 넘어간다
  ["btn-next", "btn-go"].forEach((id) => {
    const b = doc.getElementById(id);
    if (b) b.addEventListener("click", () => toFilmTail());
  });
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
  if (e.key === "ArrowRight") setFocus(Math.min(tiles.length - 1, focusIndex + 1));
  if (e.key === "ArrowLeft") setFocus(Math.max(0, focusIndex - 1));
  if (e.key === "ArrowDown") setFocus(Math.min(tiles.length - 1, focusIndex + GRID_COLS));
  if (e.key === "ArrowUp") setFocus(Math.max(0, focusIndex - GRID_COLS));
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

function moveCursor(sx, sy) {
  cursorPos.x = sx;
  cursorPos.y = sy;
  cursorX(sx);
  cursorY(sy);

  const nx = sx / STAGE_W - 0.5;
  const ny = sy / STAGE_H - 0.5;
  if (!panLock) {
    panTarget.x = gsap.utils.clamp(-PAN_X, PAN_X, -nx * 2 * PAN_X);
    panTarget.y = gsap.utils.clamp(-PAN_Y, PAN_Y, -ny * 2 * PAN_Y);
  }
  auraX(-nx * 70);
  auraY(-ny * 50);

  gsap.to(cursorEl, { opacity: 1, duration: 0.3, overwrite: "auto" });
}

function drawHold() {
  cursorProg.style.strokeDashoffset = String(RING * (1 - hold.p));
  baselineFill.style.transform = `scaleX(${hold.p})`;
}

function startHold() {
  if (holding || locked || !ready) return;
  holding = true;
  gsap.to(cursorEl, { scale: 1.3, duration: 0.3, ease: "back.out(3)" });
  if (current === "orb") btnBack.classList.add("is-armed");

  // 누르고 있는 동안 그 영상만 커지고 또렷해진다 — 뭘 고르는지 보이도록
  if (current === "grid") {
    const tile = tiles[focusIndex];
    // 커지는 동작 자체도 천천히 — 게이지가 차는 동안 계속 부풀어 오른다
    gsap.to(tile, { holdScale: 1.65, duration: HOLD.time * 0.7, ease: "power2.out" });

    // 가장자리에서 커지면 화면 밖으로 잘린다 → 고른 타일을 가운데로 데려온다
    panLock = true;
    panRate = PAN_RATE_SNAP;
    panTarget.x = PLANE_W / 2 - tile.cx;
    panTarget.y = PLANE_H / 2 - tile.cy;
    // 해상도는 한 번에 올린다 (부드럽게 보간하면 캔버스를 계속 다시 잡느라 끊긴다)
    tile.px = PIXEL_HOLD;
    // 커진 타일 위로 중앙 레이블이 지나가지 않게 잠깐 물러난다
    gsap.to(titlebar, { opacity: 0.12, duration: 0.4, ease: "power2.out" });
  }
  // 게이지는 언제나 빈 상태에서 시작한다.
  // (직전에 남은 진행률을 이어받으면 순식간에 다 찬 것처럼 보인다)
  hold.p = 0;
  drawHold();
  // overwrite: 놓았다 다시 잡을 때 되돌리던 tween 과 겹치지 않게
  holdTween = gsap.to(hold, {
    p: 1, duration: HOLD.time, ease: "none", overwrite: true, onUpdate: drawHold,
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

  const tile = tiles[focusIndex];
  if (!done) {
    gsap.to(tile, { holdScale: 1, duration: 0.35, ease: "power2.out" });
    tile.px = PIXEL_BASE;
    // 다시 커서를 따라가게
    panLock = false;
    panRate = PAN_RATE_FOLLOW;
    // 구슬 화면에서는 질문이 숨어 있어야 하므로 그리드일 때만 되돌린다
    if (current === "grid") gsap.to(titlebar, { opacity: 1, duration: 0.4, ease: "power2.out" });
  }
  if (holdTween) holdTween.kill();
  if (done) { hold.p = 0; drawHold(); }
  else gsap.to(hold, { p: 0, duration: 0.3, ease: "power2.out", overwrite: true, onUpdate: drawHold });
}

/* 마우스 폴백 */
window.addEventListener("mousemove", (e) => {
  if (handActive) return;
  const p = toStage(e.clientX, e.clientY);
  moveCursor(p.x, p.y);
});
window.addEventListener("mousedown", () => { if (!handActive) startHold(); });
window.addEventListener("mouseup", () => { if (!handActive) endHold(false); });

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

  // 타일이 가운데부터 바깥으로 차례차례 솟아오른다
  tl.fromTo(allTiles,
    { opacity: 0, y: 90 },
    {
      opacity: 1, y: 0, duration: 1.1, ease: "power3.out",
      stagger: (i, el) => Math.abs(parseFloat(el.style.left) + TILE_W / 2 - PLANE_W / 2) / 2400,
      clearProps: "opacity,transform",
    }, "-=0.35");

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
    camStatus.textContent = "loading model";

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

    camStatus.textContent = "allow camera";
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
    camVideo.srcObject = stream;
    await camVideo.play();

    camStatus.classList.add("is-hidden");
    requestAnimationFrame(trackLoop);
  } catch (err) {
    console.warn("[hand] 초기화 실패:", err);
    camStatus.classList.remove("is-hidden");
    camStatus.innerHTML = "camera unavailable<br />use mouse — hold to select";
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
