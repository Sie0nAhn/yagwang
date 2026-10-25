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
import { unlockSound, setScene, chime } from "./sound.js";

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
  cursor: 0.45,    // 커서가 따라오는 시간(초) — 손 떨림은 아래 HAND 필터가 먼저 걸러 준다
  pan: 3.4,        // 목록이 흘러가는 시간(초)
  aura: 4.2,       // 배경이 밀려가는 시간(초)
  dwell: 320,      // 이만큼 머물러야 다른 영상으로 넘어간다(ms)
};

/* 손 인식 — 잠깐 놓치거나 떨려도 끊기지 않게 */
const HAND = {
  lostGrace: 320,  // 이 시간(ms) 동안 손이 안 잡혀도 마지막 손을 그대로 둔다 (한두 프레임 놓침에 커서·게이지가 끊기지 않게)
  pinchIn: 70,     // 이만큼(ms) 계속 꼬집어야 누르기 시작 — 스치듯 오인되는 것을 막는다
  pinchOut: 170,   // 이만큼(ms) 계속 펴야 놓은 것으로 — 한 프레임 흔들림에 게이지가 끊기지 않게
  detect: 0.4,     // 손 찾기 기준 (낮을수록 어두운 전시장에서도 잘 잡힌다)
  // 커서 떨림 거르기 (One Euro 필터) — 가만히 있을 땐 단단하게, 빨리 움직일 땐 바로 따라온다
  calm: 1.0,       // 멈춰 있을 때 걸러 내는 정도 (Hz, 낮을수록 단단)
  agile: 3.0,      // 빨리 움직일수록 얼마나 바로 따라올지
};

/* 꾹 눌러 고르기 */
const HOLD = {
  time: 1.0,       // 게이지가 다 차는 데 걸리는 시간(초) — 손으로 오래 버티기 힘들어 줄였다
  mouse: 1.1,      // 마우스로 누를 때는 잘못 눌릴 일이 없으니 짧게
  // 손을 올려 두기만 해도 눌린다 — 꼬집기가 잘 안 되는 사람도 고를 수 있게
  dwell: 2.0,      // 아카이브 가운데 화면에 손을 올려 두면 이 시간 뒤에 골라진다(초)
  button: 1.0,     // 구슬 화면 버튼에 손을 올려 두면 이 시간 뒤에 눌린다(초)
  dwellDelay: 300, // 자리에 들어온 뒤 이만큼(ms) 머물러야 게이지가 차기 시작한다 (스쳐 지나갈 때 시작하지 않게)
  // 실측: 편 손 0.76 / 반쯤 오므린 손 0.28 / 실제로 꼬집으면 0.03
  pinchOn: 0.28,   // 엄지-검지가 이보다 가까워야 '꼬집었다' — 완전히 붙이지 않아도 되게
  pinchOff: 0.45,  // 이보다 벌어지면 놓은 것
  grace: 500,      // 손이 처음 잡히고 이 시간 동안은 꼬집어도 무시(ms)
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
   자원 아카이브 — 감각의 파편들이 세 겹 고리로 돈다 (k95.it 의 RINGS)

   위·가운데·아래 세 고리가 축(구슬)을 감싸고 저절로 천천히 돈다.
   가운데 고리의 정면에 온 파편이 문자 매트릭스 + 브라운관 화면으로 켜지고,
   손(마우스)을 화면 좌우 끝으로 가져가면 그쪽으로 빨리 돈다.
   ============================================================ */
const FEAT_W = 580;          // 정면 파편의 문자 매트릭스 해상도 — 7:5
const FEAT_H = 414;

/* 파편 한 장 — 7:5. 정면에 왔을 때의 기준 크기이고, 뒤로 갈수록 BACK_SCALE 까지 줄어든다.
   (style.css 의 .card 와 같아야 한다) */
const CARD_W = 280;
const CARD_H = 200;
const BACK_SCALE = 0.42;
const FRONT_BOOST = 1.45;    // 가운데 고리 정면에 오면 이만큼 더 커진다 (문자 화면이 작아 보이지 않게)

/* 고리 — 레퍼런스(1440 화면)를 재서 맞춘 값 */
const PER_RING = N;          // 한 고리에 아홉 장 (영상 아홉 개) → 40° 간격
const RINGS = 3;             // 위 · 가운데 · 아래
const CARDS = PER_RING * RINGS;
const MID = PER_RING;        // 가운데 고리의 첫 파편 번호
const STEP_DEG = 360 / PER_RING;
const RADIUS = 675;          // 고리 반지름(px) — 옆으로 돌아간 파편이 화면 양 끝에 걸린다
const RING_GAP = 400;        // 고리 사이 높이(px) — 위아래 고리는 뒤쪽 반만 아치로 보인다
const RING_SHIFT = [0.5, 0, 0.5];   // 위·아래 고리는 반 칸 엇갈려 선다
const VIEW_TILT = 0;         // 가운데 고리 높이에서 정면으로 본다

const AUTO = 0.22;           // 저절로 도는 빠르기 (초당 장 수) — 한 바퀴 약 40초
const LIFT = 170;            // 손·마우스를 위아래 끝까지 움직였을 때 고리가 따라 오르내리는 거리(px)
                             // (손이 위로 가면 고리도 위로. 반대로 하고 싶으면 음수로)

/* 가운데 구슬 — 레퍼런스의 가운데 조형물 자리. 축에 서서 정면 파편 뒤에 숨고,
   아래쪽만 파편 밑으로 삐져나온다. (가운데 고리 기준 세로 위치, 아래로 +) */
const CORE_Y = 118;

/* 바탕 그리드 — 고리 뒤를 둘러싼 원통 벽 */
const GRID_R = 1600;         // 원통 반지름(px)
const GRID_PANELS = 9;       // 뒤쪽 반원을 이루는 판 수 (보이는 만큼만)
const GRID_STEP = 15;        // 판 하나가 차지하는 각
const GRID_CELL = 105.3;     // 칸 크기(px) — 판 폭의 1/4

/* 손·마우스로 돌리기.
   화면 가운데에서는 저절로 천천히 돌고, 좌우 끝으로 갈수록 그쪽으로 빨리 돈다.
   (가운데를 넓게 비워야 파편을 마우스로 누르러 가도 고리가 도망가지 않는다) */
const SPIN = {
  dead: 0.40,      // 가운데에서 이만큼(화면 폭 비율)은 저절로 도는 구간
  max: 1.8,        // 끝까지 갔을 때 초당 넘어가는 장 수
  ramp: 0.35,      // 속도가 붙는 시간(초)
  settle: 0.5,     // 꾹 누르거나 파편을 눌렀을 때 제자리에 맞춰 서는 시간(초)
};

const PIXEL_BASE = 2.4;      // 썸네일 알갱이 굵기
const PIXEL_BOOT = 30;       // 로딩 중에는 아주 굵게

/* 정면 파편을 이루는 문자 매트릭스 */
const ASCII_CELL = 8;                        // 글자 한 칸(px) — 작을수록 촘촘
const ASCII_RAMP = " .·:~=+*xX%#@@";         // 어두움 → 밝음
const BARREL = 0.11;                         // 화면이 휘는 정도 (0 이면 평평)
const ASCII_SAT = 2.1;                       // 글자 색의 채도 (1 이면 원본)
const ASCII_GAIN = 1.85;                     // 글자 색의 밝기
const ASCII_GAMMA = 0.82;                    // 1 보다 작으면 밝은 쪽이 더 살아난다
const ASCII_FLOOR = 0.035;                   // 이보다 어두운 칸은 아예 비워 검정을 남긴다

/* 영상 원본을 옮겨 담을 작은 캔버스 (프레임당 영상당 한 번만) */
const SRC_W = 288;
const SRC_H = 216;

const rigEl = document.getElementById("spiralRig");
const edgeL = document.getElementById("edgeL");
const edgeR = document.getElementById("edgeR");
const featPix = document.getElementById("featPix");
const featAscii = document.getElementById("featAscii");
const featCtx = featPix.getContext("2d", { alpha: false });
const featAsciiCtx = featAscii.getContext("2d");
const featNameEl = document.getElementById("featName");
const featSlugEl = document.getElementById("featSlug");
const featureEl = document.getElementById("feature");
const featInEl = document.getElementById("featIn");   // 문자 화면 본체 (휜 만큼 서서히 떠오른다)

const tiles = [];            // 고리 위 파편들 (CARDS 장)

/* 실제 영상 요소는 영상 개수만큼만 */
const videoPool = VIDEOS.map((data) => {
  const v = document.createElement("video");
  v.src = data.file;
  v.muted = true;
  v.loop = true;
  v.playsInline = true;
  v.preload = "auto";          // 멈춰 있는 영상도 첫 프레임은 있어야 뒤쪽 파편이 비지 않는다
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

/* 화면 앞쪽에 걸린 영상만 새 프레임을 뜬다. 뒤쪽은 마지막 프레임 그대로. */
const liveVideo = new Array(N).fill(true);

function updateVideoSources() {
  videoPool.forEach((v, i) => {
    const s = videoSrc[i];
    if (!liveVideo[i] && i !== focusIndex && s.ready) return;   // 첫 프레임은 한 번 떠 둔다
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

/* ASCII 샘플링용 스크래치 (워커를 못 쓰는 브라우저에서만) */
const sampleCv = document.createElement("canvas");
const sampleCtx = sampleCv.getContext("2d", { willReadFrequently: true });

/* ── 문자 화면용 픽셀 읽기 — 별도 스레드(워커)에서 ───────────
   영상 픽셀을 읽어 오는 순간(getImageData) 그래픽 처리가 끝나길 기다리느라
   메인 스레드가 15~30ms 씩 멈췄다. 이게 렉의 대부분이었다.
   읽기를 워커로 넘기면 메인은 멈추지 않고, 워커가 돌려준 가장 최근 픽셀로 글자를 찍는다.
   (워커를 못 쓰는 브라우저면 예전처럼 메인에서 읽는다) */
const asciiSample = { data: null, cols: 0, rows: 0, busy: false, since: 0, worker: null };
try {
  if (typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap === "function") {
    const code = `
      let cv = null, g = null;
      onmessage = (e) => {
        const { bmp, cols, rows } = e.data;
        if (!cv || cv.width !== cols || cv.height !== rows) {
          cv = new OffscreenCanvas(cols, rows);
          g = cv.getContext("2d", { willReadFrequently: true });
        }
        g.drawImage(bmp, 0, 0, cols, rows);
        bmp.close();
        const d = g.getImageData(0, 0, cols, rows).data;
        postMessage({ buf: d.buffer, cols, rows }, [d.buffer]);
      };`;
    const w = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
    w.onmessage = (e) => {
      asciiSample.data = new Uint8ClampedArray(e.data.buf);
      asciiSample.cols = e.data.cols;
      asciiSample.rows = e.data.rows;
      asciiSample.busy = false;
    };
    w.onerror = () => { asciiSample.worker = null; asciiSample.busy = false; };
    asciiSample.worker = w;
  }
} catch (e) { asciiSample.worker = null; }

/* 워커에 다음 그림을 보낸다. 한 번에 하나만 — 밀리면 건너뛴다. */
function requestSample(srcCanvas, cols, rows) {
  const now = performance.now();
  if (asciiSample.busy && now - asciiSample.since < 500) return;   // 0.5초 넘게 안 오면 다시 보낸다
  asciiSample.busy = true;
  asciiSample.since = now;
  createImageBitmap(srcCanvas, { resizeWidth: cols, resizeHeight: rows, resizeQuality: "low" })
    .then((bmp) => {
      if (asciiSample.worker) asciiSample.worker.postMessage({ bmp, cols, rows }, [bmp]);
      else { bmp.close(); asciiSample.busy = false; }
    })
    .catch(() => { asciiSample.busy = false; });
}

/* ── 바탕 그리드 ─────────────────────────────────── */
/* 뒤쪽 반원만 판을 세운다. 앞쪽은 카메라 뒤라 보이지 않는다.
   판을 돌리는 대신 무늬를 옆으로 밀어서 원통이 도는 것처럼 보이게 한다. */
const GRID_W = 2 * GRID_R * Math.tan((GRID_STEP / 2) * Math.PI / 180);
const gridPanels = [];
for (let i = 0; i < GRID_PANELS; i++) {
  const a = (i - (GRID_PANELS - 1) / 2) * GRID_STEP;
  const el = document.createElement("div");
  el.className = "grid-panel";
  el.style.width = (GRID_W + 2).toFixed(1) + "px";            // 이음매가 벌어지지 않게 1px 씩 겹친다
  el.style.marginLeft = (-(GRID_W + 2) / 2).toFixed(1) + "px";
  el.style.backgroundSize = `${GRID_CELL}px ${GRID_CELL}px`;
  el.style.transform = `rotateY(${a}deg) translateZ(${-GRID_R}px)`;
  rigEl.appendChild(el);
  gridPanels.push(el);
}

/* ── 가운데 구슬 ─────────────────────────────────── */
/* 고리의 축에 떠 있다. 파편들은 이 구슬을 감고 돌고, 고르면 이 구슬이 된다.
   색은 앞에 나온 파편을 따라 바뀐다 (applyMarbleTheme). */
const coreEl = document.createElement("div");
coreEl.className = "core";
coreEl.innerHTML =
  `<div class="core__glow"></div>` +
  `<div class="marble core__marble">` +
  `<div class="marble__body"></div><div class="marble__swirl"></div>` +
  `<div class="marble__swirl marble__swirl--slow"></div><div class="marble__shade"></div>` +
  `<div class="marble__spec"></div><div class="marble__rim"></div></div>`;
rigEl.appendChild(coreEl);
const core = { bob: 0 };
gsap.to(core, { bob: 1, duration: 2.6, ease: "sine.inOut", repeat: -1, yoyo: true });

/* ── 파편 만들기 ─────────────────────────────────── */
/* 가운데 고리는 영상 순서 그대로, 위·아래 고리는 네 칸씩 밀어서 위아래로 같은 영상이 겹치지 않게 */
for (let k = 0; k < CARDS; k++) {
  const ring = Math.floor(k / PER_RING);
  const i = k % PER_RING;
  const vi = (i + (ring - 1) * 4 + N * 2) % N;
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `<canvas class="card__thumb"></canvas>`;
  const cv = el.querySelector(".card__thumb");
  rigEl.appendChild(el);

  tiles.push({
    el, k, ring, i, vi, data: VIDEOS[vi],
    canvas: cv, ctx: cv.getContext("2d", { alpha: false }),
    bw: 0, bh: 0,
    px: PIXEL_BOOT,
    noise: 1,
    rel: 0,          // 정면에서 몇 칸 돌아가 있는지 (+ 는 오른쪽, − 는 왼쪽)
    bend: 0,         // 얼마나 휘었는지 (0 평평 ~ 1 브라운관) — 정면에 다가올수록 커진다
    clipB: 0,        // 마지막으로 오려 둔 휨 (같으면 테두리를 다시 계산하지 않는다)
    live: true,      // 화면에 걸려 있어 새로 그릴 파편인지
  });
}

const allTiles = tiles.map((t) => t.el);

let focusIndex = 0;        // 정면에 뜬 영상 (0 ~ 8)
let focusCard = MID;       // 정면에 뜬 파편 (가운데 고리 중 하나)
let locked = false;        // 화면 전환 중에는 고리을 건드리지 않는다

/* ── 고리 상태 ───────────────────────────────────── */
const spin = { s: 0, v: 0, drive: 0 };   // s = 연속 위치(장 단위), v = 속도(장/초)
let spinTarget = null;                    // 클릭·키보드로 정한 목적지
let spinLock = false;                     // 꾹 누르는 동안엔 고리을 세워둔다
let pointerIn = false;                    // 손·마우스가 화면 안에 있는지

/* 연출용 — 처음 펼쳐질 때 / 고른 뒤 흩어질 때 */
const rig = { intro: 0, swirl: 0, fade: 1, spread: 1, tilt: 0, lift: 0 };

const mod = (a, n) => ((a % n) + n) % n;
const decay = (dt, seconds) => 1 - Math.pow(0.001, dt / seconds);   // seconds 동안 99.9% 다가간다

function stepSpiral(dt) {
  // 손·마우스가 좌우 끝에 있을수록 그쪽으로 더 빨리 (왼쪽 끝이면 거꾸로)
  let want = 0;
  if (pointerIn && !spinLock && cursorPos.y > 110 && cursorPos.y < STAGE_H - 90) {
    const nx = cursorPos.x / STAGE_W - 0.5;
    const over = Math.abs(nx) - SPIN.dead;
    if (over > 0) want = Math.sign(nx) * Math.min(1, over / (0.5 - SPIN.dead)) * SPIN.max;
  }
  spin.drive = want / SPIN.max;
  if (want !== 0) spinTarget = null;

  // 손이 보이는 동안엔 저절로 돌지 않고 가장 가까운 파편에 멈춰 선다 — 고르려는 파편이 도망가지 않게
  const handHold = handActive && want === 0;
  if (spinLock || spinTarget !== null || handHold) {
    // 꾹 누르는 중이면 정면 파편을 한가운데 세우고, 파편을 눌렀으면 그 파편까지 돈다
    const goal = spinLock || spinTarget === null ? Math.round(spin.s) : spinTarget;
    spin.v = 0;
    spin.s += (goal - spin.s) * decay(dt, SPIN.settle);
    if (!spinLock && Math.abs(goal - spin.s) < 0.003) spinTarget = null;   // 도착하면 다시 저절로
  } else {
    // 평소엔 저절로 천천히 돈다
    spin.v += (AUTO + want - spin.v) * decay(dt, SPIN.ramp);
    spin.s += spin.v * dt;
  }
}

const PERSP = 2500;                          // style.css .spiral 의 perspective
const ORIGIN_Y = STAGE_H * 0.5;              // style.css .card 의 top / perspective-origin

const rad = (d) => d * Math.PI / 180;
const wrap180 = (d) => mod(d + 180, 360) - 180;

/* 파편 하나가 화면 어디에 어떤 크기로 보이는지 — CSS 가 하는 계산을 그대로 따라 한다 */
function projectCard(a, y, R, tilt, sc, lift) {
  const tr = rad(tilt);
  const x = R * Math.sin(rad(a)), z = R * Math.cos(rad(a));
  const y1 = y * Math.cos(tr) - z * Math.sin(tr) + lift;
  const z1 = y * Math.sin(tr) + z * Math.cos(tr);
  const p = PERSP / Math.max(1, PERSP - z1);
  const hw = CARD_W * sc * p * Math.abs(Math.cos(rad(a))) / 2 + 1;   // 옆으로 돌아간 만큼 좁다
  const hh = CARD_H * sc * p / 2;
  const cx = STAGE_W / 2 + x * p, cy = ORIGIN_Y + y1 * p;
  return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
}

const onScreen = (r) => r.x1 > 0 && r.x0 < STAGE_W && r.y1 > 0 && r.y0 < STAGE_H;

/* 한 장 한 장을 고리 위 제자리에 놓는다 */
function layoutSpiral() {
  const R = RADIUS * rig.intro * rig.spread;

  // 손·마우스를 위아래로 움직이면 고리 전체가 따라 오르내리고 살짝 기운다.
  // 꾹 누르는 중엔 제자리로 돌아와 고른 파편이 한가운데 선다.
  const ny = pointerIn && !spinLock ? cursorPos.y / STAGE_H - 0.5 : 0;
  rig.tilt += (ny * -5 - rig.tilt) * 0.04;
  rig.lift += (ny * 2 * LIFT - rig.lift) * 0.05;
  const tilt = VIEW_TILT + rig.tilt;
  rigEl.style.transform = `translateY(${rig.lift.toFixed(1)}px) rotateX(${tilt.toFixed(2)}deg)`;

  tiles.forEach((t) => {
    // 정면(0°)에서 몇 도 돌아가 있는지. 펼쳐지는 동안은 덜 감긴 자리에서 출발한다.
    const a = wrap180((t.i + RING_SHIFT[t.ring] - spin.s - rig.swirl) * STEP_DEG);
    t.rel = a / STEP_DEG;
    const y = (t.ring - 1) * RING_GAP;

    // 뒤로 돌아갈수록 작아진다 (레퍼런스도 뒤쪽 파편이 원근보다 더 작다)
    const front = (1 + Math.cos(rad(a))) / 2;
    let sc = BACK_SCALE + (1 - BACK_SCALE) * Math.pow(front, 1.3);
    // 가운데 고리에서 정면에 다가올수록 점점 커지고, 점점 휜다
    let bend = 0;
    if (t.ring === 1) {
      const n = Math.max(0, 1 - Math.abs(t.rel));
      bend = n * n * (3 - 2 * n);
      sc *= 1 + (FRONT_BOOST - 1) * bend;
    }
    t.bend = bend;
    if (Math.abs(bend - t.clipB) > 0.004) {
      t.clipB = bend;
      t.el.style.clipPath = bend < 0.004 ? "none" : crtPolygon(BARREL * bend);
    }

    const box = projectCard(a, y, R, tilt, sc, rig.lift);
    const isFront = t.k === focusCard;
    const op = rig.intro * (isFront ? 1 : rig.fade);

    t.el.style.transform =
      `translateY(${y}px) rotateY(${a.toFixed(2)}deg) translateZ(${R.toFixed(1)}px) scale(${sc.toFixed(3)})`;
    t.el.style.opacity = op.toFixed(3);
    const show = op > 0.01 && onScreen(box);
    t.el.style.visibility = show ? "visible" : "hidden";
    t.live = show;
  });

  // 문자 화면은 정면 파편이 반쯤 휘었을 때부터 서서히 떠오른다.
  // (정면이 바뀌는 순간엔 투명해서, 썸네일 → 문자 화면이 툭 바뀌지 않는다)
  const on = Math.min(1, Math.max(0, (tiles[focusCard].bend - 0.5) / 0.3));
  featInEl.style.opacity = (on * on * (3 - 2 * on)).toFixed(3);

  // 가운데 구슬 — 축에 서서 천천히 오르내린다. 기울기는 되돌려 늘 똑바로.
  const cy = CORE_Y - 7 + core.bob * 14;
  coreEl.style.transform =
    `translate3d(0,${cy.toFixed(1)}px,0) rotateX(${(-tilt).toFixed(2)}deg) scale(${(0.6 + 0.4 * rig.intro).toFixed(3)})`;
  coreEl.style.opacity = (rig.intro * rig.fade).toFixed(3);

  // 바탕 그리드 — 고리와 같은 빠르기로 원통 벽 무늬가 흐른다
  const arc = (spin.s - rig.swirl) * STEP_DEG * Math.PI / 180 * GRID_R;
  const gx = (mod(arc, GRID_CELL)).toFixed(1) + "px 0";
  const go = (rig.intro * rig.fade).toFixed(3);
  gridPanels.forEach((el) => { el.style.backgroundPosition = gx; el.style.opacity = go; });

  // 좌우 끝 표시 — 손이 그쪽에 가 있으면 밝아진다
  edgeL.style.opacity = Math.max(0, -spin.drive).toFixed(2);
  edgeR.style.opacity = Math.max(0, spin.drive).toFixed(2);
}

/* ── 그리기 ──────────────────────────────────────── */

/* 썸네일 — 낮은 해상도로 그려 알갱이를 남긴다 */
function drawThumb(tile) {
  const px = Math.max(1, tile.px);
  const bw = Math.max(8, Math.round(CARD_W / px / 8) * 8);
  const bh = Math.max(8, Math.round(CARD_H / px / 8) * 8);
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
  if (tile.bend > 0.01) {
    // 정면에 다가오는 만큼 휜다. 휜 바깥은 카드 테두리(clip-path)가 오려 낸다.
    g.fillStyle = "#000";
    g.fillRect(0, 0, bw, bh);
    drawWarped(g, src.canvas, bw, bh, BARREL * tile.bend);
  } else {
    g.drawImage(src.canvas, 0, 0, bw, bh);
  }
  g.globalAlpha = 1;
}

/* 브라운관 휨 — B 가 0 이면 평평, BARREL 이면 다 휜 것.
   네 변의 가운데가 바깥으로 부풀고 모서리는 사각으로 남는다.
   가로는 세로 위치로, 세로는 가로 위치로만 밀어서 네 모서리는 제자리에 둔다.
   (거리로 한꺼번에 밀면 모서리까지 말려들어 알약 모양이 된다)
   부푼 변이 칸 안에 들어오도록 1/(1+B) 로 줄인다. 결과는 -1 ~ 1. */
function warp(nx, ny, B) {
  const fit = 1 / (1 + B);
  return [nx * (1 + B * (1 - ny * ny)) * fit, ny * (1 + B * (1 - nx * nx)) * fit];
}

/* 휜 화면 모양대로 파편을 오리는 테두리 — 글자·썸네일을 찍는 공식과 같은 공식이라 모양이 딱 맞는다.
   % 로 주므로 카드 크기와 상관없다. 바깥 칸 경계에서 아주 조금만(약 2px) 넉넉하게. */
function crtPolygon(B) {
  const pts = [];
  const pad = 1.006;
  const edge = (nx, ny) => {
    const [x, y] = warp(nx, ny, B);
    pts.push(`${((x * pad * 0.5 + 0.5) * 100).toFixed(2)}% ${((y * pad * 0.5 + 0.5) * 100).toFixed(2)}%`);
  };
  const S = 16;
  for (let i = 0; i <= S; i++) edge(-1 + 2 * i / S, -1);   // 위
  for (let i = 1; i <= S; i++) edge(1, -1 + 2 * i / S);    // 오른쪽
  for (let i = 1; i <= S; i++) edge(1 - 2 * i / S, 1);     // 아래
  for (let i = 1; i < S; i++) edge(-1, 1 - 2 * i / S);     // 왼쪽
  return `polygon(${pts.join(",")})`;
}

/* 썸네일을 휜 모양으로 그린다 — 작은 조각으로 잘라 조각마다 휜 자리에 옮겨 찍는다.
   정면에 다가오는 파편만 쓰므로 (한두 장) 가볍다. */
const WARP_GX = 16, WARP_GY = 12;
function drawWarped(g, img, bw, bh, B) {
  const sw = img.width / WARP_GX, sh = img.height / WARP_GY;
  for (let gy = 0; gy < WARP_GY; gy++) {
    const ny0 = (gy / WARP_GY) * 2 - 1, ny1 = ((gy + 1) / WARP_GY) * 2 - 1;
    for (let gx = 0; gx < WARP_GX; gx++) {
      const nx0 = (gx / WARP_GX) * 2 - 1, nx1 = ((gx + 1) / WARP_GX) * 2 - 1;
      const p00 = warp(nx0, ny0, B), p10 = warp(nx1, ny0, B);
      const p01 = warp(nx0, ny1, B), p11 = warp(nx1, ny1, B);
      const x0 = Math.min(p00[0], p01[0]), x1 = Math.max(p10[0], p11[0]);
      const y0 = Math.min(p00[1], p10[1]), y1 = Math.max(p01[1], p11[1]);
      g.drawImage(img, gx * sw, gy * sh, sw, sh,
        (x0 * 0.5 + 0.5) * bw, (y0 * 0.5 + 0.5) * bh,
        (x1 - x0) * 0.5 * bw + 0.6, (y1 - y0) * 0.5 * bh + 0.6);   // 이음매가 벌어지지 않게 살짝 겹친다
    }
  }
}

function drawFeature() {
  const src = videoSrc[focusIndex];
  const B = BARREL * (tiles[focusCard].bend || 0);
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

  let data;
  if (asciiSample.worker) {
    requestSample(src.canvas, cols, rows);                 // 다음 것을 부탁해 두고
    if (!asciiSample.data || asciiSample.cols !== cols) return;
    data = asciiSample.data;                               // 지금은 이미 받아 둔 것으로 그린다
  } else {
    if (sampleCv.width !== cols || sampleCv.height !== rows) {
      sampleCv.width = cols; sampleCv.height = rows;
    }
    sampleCtx.drawImage(src.canvas, 0, 0, cols, rows);
    data = sampleCtx.getImageData(0, 0, cols, rows).data;
  }

  g.font = `500 ${ASCII_CELL + 2}px "Roboto Mono", monospace`;   // 칸을 꽉 채워 글자 사이 검정을 줄인다
  // 글자를 칸 한가운데에 찍는다. 왼쪽 위 기준으로 찍으면 글자 판이 오른쪽 아래로 쏠려서
  // 브라운관 테두리와 어긋난다 (한쪽 테두리만 두꺼워진다).
  g.textAlign = "center";
  g.textBaseline = "middle";
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

      // 정면 파편이 지금 휜 만큼 같이 휜다 (warp 참고)
      const nx = ((x + 0.5) / cols) * 2 - 1;
      const w = warp(nx, ny, B);
      const dx = (w[0] * 0.5 + 0.5) * FEAT_W;
      const dy = (w[1] * 0.5 + 0.5) * FEAT_H;

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
let spinLastT = performance.now();

function renderGrid() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - spinLastT) / 1000);
  spinLastT = now;
  if (current !== "grid") {
    // 영상·정원이 떠 있는 동안 아카이브 영상 9개가 뒤에서 계속 돌면 그만큼 무거워진다
    if (current === "film" || current === "garden") videoPool.forEach((v) => { if (!v.paused) v.pause(); });
    return;
  }

  if (ready && !locked) stepSpiral(dt);
  layoutSpiral();

  // 정면에 가장 가까운 파편이 바뀌면 그 파편이 켜진다
  if (ready && !locked) {
    const k = MID + mod(Math.round(spin.s), PER_RING);
    if (k !== focusCard) setFocus(k);
  }

  // 앞쪽에 걸린 파편의 영상만 재생한다
  liveVideo.fill(false);
  tiles.forEach((t) => { if (t.live) liveVideo[t.vi] = true; });
  if (!ready) liveVideo.fill(true);          // 로딩 중엔 전부 (노이즈가 걷히는 연출)
  videoPool.forEach((v, i) => {
    const want = ready && (liveVideo[i] || i === focusIndex);
    if (want && v.paused) v.play().catch(() => {});
    else if (!want && !v.paused) v.pause();
  });
}
gsap.ticker.add(renderGrid);

/* 그리기는 화면 전환·로딩과 상관없이 계속 돈다.
   정면 파편은 글자 수천 개라 두 프레임에 한 번만 다시 그린다. */
let drawFrame = 0;

function drawTiles() {
  drawFrame++;
  if (current === "film" || current === "garden") return;     // 아카이브가 안 보일 땐 그리지 않는다
  updateVideoSources();
  tiles.forEach((t, i) => {
    if ((t.live || t.noise > 0.01) && drawFrame % 2 === i % 2) drawThumb(t);
    else if (!t.live && t.el.style.visibility !== "hidden" && drawFrame % 30 === i) drawThumb(t);   // 뒤쪽은 가끔만
  });
  if (drawFrame % 2 === 0) drawFeature();
}
gsap.ticker.add(drawTiles);


/* ============================================================
   포커스
   ============================================================ */
const focusNameEl = document.getElementById("focusName");
const cameraHintEl = document.getElementById("cameraHint");
/* 손 인식 상자 위 설명 — 화면마다 할 수 있는 게 달라서 바꿔 띄운다 */
const HINT = {
  grid: "손을 화면 좌우 끝으로 가져가면 그쪽으로 돌아갑니다. 가운데 파편에 손을 올려 두면 골라집니다. 엄지와 검지를 모아 집으면 더 빨리 골라집니다.",
  orb: "'확인하러 가기'에 손을 올려 두면 영상이 시작됩니다. 손이 어디 있든 엄지와 검지를 모아 집어도 넘어갑니다.",
};
cameraHintEl.textContent = HINT.grid;
const hudIndexEl = document.getElementById("hudIndex");
const marbleStage = document.getElementById("marbleStage");
const marbleEl = document.getElementById("marble");
const marbleRing = document.getElementById("marbleRing");
const orbCaptionName = document.querySelector(".orb-caption__name");
const orbIndexEl = document.getElementById("orbIndex");

function applyMarbleTheme(i) {
  const m = VIDEOS[i].marble;
  // 구슬 화면의 구슬과, 아카이브 가운데 구슬을 같은 색으로
  [marbleStage, coreEl].forEach((el) => {
    el.style.setProperty("--hue", m.hue + "deg");
    el.style.setProperty("--sat", m.sat);
    el.style.setProperty("--bri", m.bri);
    el.style.setProperty("--glow", m.glow);
    el.style.setProperty("--glow-soft", m.glow);
  });
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
    { scaleY: 1, scaleX: 1, opacity: 0.9, duration: d, ease: "power4.out" });   // style.css 의 .feature__pix 와 같은 값
}

/* 이름이 바뀔 때 — 새 이름이 아래로 겹겹이 쌓인 잔상에서 제자리로 모인다 */
function echoIn(el, text) {
  const host = el.parentElement;
  for (let i = 1; i <= 6; i++) {
    const c = document.createElement("p");
    c.className = el.className + " echo";
    c.textContent = text;
    host.appendChild(c);
    gsap.fromTo(c,
      { y: i * 16, opacity: 0.5 - i * 0.07 },
      { y: 0, opacity: 0, duration: 0.45 + i * 0.06, ease: "power3.out", onComplete: () => c.remove() });
  }
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

/* 정면 파편이 바뀌었을 때. k 는 파편 번호(0 ~ 17).
   문자 화면(featureEl)을 그 파편 위로 옮겨 얹고, 이름을 갈아 끼운다. */
function setFocus(k) {
  const prev = tiles[focusCard];
  const t = tiles[k];
  prev.el.classList.remove("is-front");
  focusCard = k;
  t.el.classList.add("is-front");
  t.el.appendChild(featureEl);

  const changed = t.vi !== focusIndex;
  focusIndex = t.vi;
  crtOn(false);                                   // 화면이 한 번 꺼졌다 켜진다
  if (!changed) return;                           // 같은 영상의 다음 바퀴면 이름은 그대로

  const vi = t.vi;
  setTint(VIDEOS[vi].tint);
  applyMarbleTheme(vi);
  if (current === "grid") hudIndexEl.textContent = indexLabel(vi);
  orbIndexEl.textContent = String(vi + 1).padStart(2, "0");
  orbCaptionName.textContent = t.data.name;

  // 이름은 잡음에서 다시 잡힌다
  gsap.set([featNameEl, featSlugEl], { y: 0, opacity: 1 });
  echoIn(featNameEl, t.data.name);
  scramble(featNameEl, t.data.name, 0.5);
  scramble(featSlugEl, slugOf(t.data), 0.6);
}

/* 고리을 n 장 돌린다 (키보드·휠). 손으로 돌리는 중이면 무시. */
function nudge(n) {
  if (locked || !ready || spinLock) return;
  spinTarget = (spinTarget !== null ? spinTarget : Math.round(spin.s)) + n;
}

/* 처음 상태 — 효과 없이 첫 파편을 정면에 둔다 */
tiles[MID].el.classList.add("is-front");
tiles[MID].el.appendChild(featureEl);
featNameEl.textContent = VIDEOS[0].name;
featSlugEl.textContent = slugOf(VIDEOS[0]);
applyMarbleTheme(0);
hudIndexEl.textContent = indexLabel(0);
orbIndexEl.textContent = "01";
orbCaptionName.textContent = VIDEOS[0].name;

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

gsap.set(screenGrid, { autoAlpha: 1 });
gsap.set(screenOrb, { autoAlpha: 0 });

const MARBLE_CX = 1085;   // .marble-stage 중심 (stage 좌표)
const MARBLE_CY = 379;

let current = "grid";


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

  locked = true;          // 고리은 멈추지만 자리 잡기(layoutSpiral)는 계속 돈다

  // 응축은 정면 파편에서 시작한다
  const r = featureEl.getBoundingClientRect();
  const p = toStage(r.left, r.top);
  const w = r.width / stageScale;
  const h = r.height / stageScale;

  morph.innerHTML = "";
  morph.appendChild(snapshot(idx));


  const tl = gsap.timeline({
    onComplete: () => { locked = false; current = "orb"; },
  });

  // 1. 정면 파편만 남고, 나머지는 바깥으로 퍼지며 사라진다
  tl.to(featureEl, { scale: 1.08, duration: 0.5, ease: "power2.out" }, 0);
  tl.to(rig, { fade: 0, spread: 1.35, duration: 0.6, ease: "power2.in" }, 0);
  tl.to([edgeL, edgeR, "#cameraHint"], { autoAlpha: 0, duration: 0.3 }, 0);   // 고리 조작 설명은 아카이브에서만

  // 2. 화면 → 구슬로 응축
  //    네모 화면이 그 자리에서 둥글게 말리며 유리구슬처럼 빛을 머금고, 휘어진 길을 따라
  //    구슬 자리로 날아가 구슬과 똑같은 크기로 커진 뒤 진짜 구슬로 녹아든다.
  //    (예전엔 작은 원으로 400° 돌며 날아가 아주 작은 점에서 구슬이 튀어나와 끊겨 보였다)
  //    tween 시작 직전 프레임에 초기값을 심어야 from 값이 제대로 잡힌다
  const MARBLE_D = 470;                       // .marble-stage 크기 — 구슬과 똑같이 맞춘다
  const MID_D = 300;                          // 날아가는 동안의 크기
  const snap = morph.firstElementChild;
  tl.add(() => {
    gsap.set([featureEl, featNameEl, featSlugEl], { autoAlpha: 0 });
    gsap.set(morph, {
      visibility: "visible", opacity: 1, filter: "brightness(1)",
      x: p.x, y: p.y, width: w, height: h,
      borderRadius: 6, rotation: 0, scale: 1, "--glass": 0,
    });
    gsap.set(snap, { rotation: 0, scale: 1, transformOrigin: "50% 50%" });
  }, 0.48);

  // 그 자리에서 둥글게 말린다 — 모서리가 둥글어지고 유리 하이라이트가 떠오른다
  tl.to(morph, {
    x: p.x + (w - h) / 2, width: h, borderRadius: h / 2, "--glass": 1,
    duration: 0.4, ease: "power2.inOut",
  }, 0.5);
  tl.to(snap, { scale: 1.35, rotation: 35, duration: 1.4, ease: "power1.inOut" }, 0.5);
  // 휘어진 길로 날아간다 — 가로와 세로의 가속을 달리 줘서 곡선을 그린다
  tl.to(morph, { x: MARBLE_CX - MID_D / 2, duration: 0.8, ease: "power2.inOut" }, 0.82);
  tl.to(morph, { y: MARBLE_CY - MID_D / 2, duration: 0.8, ease: "back.inOut(1.4)" }, 0.82);
  tl.to(morph, { width: MID_D, height: MID_D, borderRadius: MID_D / 2, duration: 0.8, ease: "power2.inOut" }, 0.82);

  // 3. 구슬 탄생 — 아카이브는 디졸브로 물러난다
  tl.set(screenOrb, { autoAlpha: 1 }, 1.25);
  tl.to(screenGrid, { autoAlpha: 0, duration: 0.45, ease: "power2.inOut" }, 1.25);

  // 구슬 크기로 부풀며 환해지고, 그 안에서 진짜 구슬이 떠올라 자리를 이어받는다
  tl.to(morph, {
    x: MARBLE_CX - MARBLE_D / 2, y: MARBLE_CY - MARBLE_D / 2,
    width: MARBLE_D, height: MARBLE_D, borderRadius: MARBLE_D / 2,
    filter: "brightness(1.35)", duration: 0.45, ease: "power2.out",
  }, 1.62);
  tl.fromTo(marbleEl,
    { scale: 0.94, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.7, ease: "power2.out" }, 1.7);
  tl.to(morph, { opacity: 0, duration: 0.55, ease: "power1.in" }, 1.78);
  tl.fromTo(marbleRing,
    { scale: 0.9, opacity: 0.8, borderWidth: 3 },
    { scale: 1.45, opacity: 0, borderWidth: 1, duration: 1.0, ease: "power2.out" }, 1.85);

  // 4. 글자들이 차례로 올라온다
  tl.fromTo("#orbHead span",
    { y: 26, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.6, stagger: 0.09, ease: "power3.out" }, 1.55);
  tl.fromTo([".orb-body", ".ghost-btn"],
    { y: 20, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.55, stagger: 0.09, ease: "power3.out" }, 1.75);
  // 버튼이 보이기 시작하면 바로 누를 수 있게 — 남은 글자 애니메이션이 끝날 때까지 기다리지 않는다
  // (예전엔 버튼이 다 보이고도 0.5초 넘게 눌러도 무시돼서 '영상이 안 나온다'처럼 보였다)
  tl.add(() => { locked = false; current = "orb"; setScene("orb"); }, 1.8);
  // 손 설명도 구슬 화면에 맞게 바꿔 다시 띄운다
  tl.add(() => { cameraHintEl.textContent = HINT.orb; }, 1.7);
  tl.to("#cameraHint", { autoAlpha: 1, duration: 0.5 }, 1.8);
  tl.fromTo("#orbCaption",
    { y: 16, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }, 1.95);

  // 구슬 화면에서는 질문도 영상 이름도 물러난다
  tl.to(titlebar, { opacity: 0, duration: 0.45, ease: "power2.in" }, 1.1);
  tl.set(focusNameEl, { opacity: 0, y: -10 });
  tl.add(() => { hudIndexEl.textContent = "yk-2087"; }, 1.4);

  tl.set(morph, { visibility: "hidden", filter: "none", "--glass": 0 });
}

/* 아카이브를 원래 상태로 되돌린다 (구슬에서 오든 영상 끝에서 오든 같다) */
function resetArchive() {
  filmEl.pause();
  stopYt();
  if (current === "garden") releaseGardenHand();
  else startCamera();
  gsap.set([screenOrb, screenFilm, screenGarden], { autoAlpha: 0 });
  gsap.set(screenGrid, { autoAlpha: 1 });
  document.body.classList.remove("is-garden");
  hideChrome(false);

  // 고른 타일은 선택할 때 숨겨뒀으므로 반드시 되살려야 한다
  tiles.forEach((t) => { t.px = PIXEL_BASE; });
  gsap.set([edgeL, edgeR, "#cameraHint"], { autoAlpha: 1 });
  cameraHintEl.textContent = HINT.grid;
  spin.v = 0;
  spinTarget = null;
  // 고리가 축에서 다시 풀려 나온다 (검정 페이드가 걷히는 동안 보인다)
  gsap.killTweensOf(rig);
  rig.fade = 1;
  gsap.fromTo(rig, { intro: 0.25, spread: 1, swirl: -2.5 },
    { intro: 1, swirl: 0, duration: 1.6, ease: "power3.out" });
  gsap.set(featureEl, { scale: 1, autoAlpha: 1 });
  gsap.set([featNameEl, featSlugEl], { autoAlpha: 1, opacity: 1, y: 0 });
  // 돌아올 때도 화면이 다시 켜진다
  crtOn(true);
  scramble(featNameEl, VIDEOS[focusIndex].name, 0.7);
  scramble(featSlugEl, slugOf(VIDEOS[focusIndex]), 0.8);
  gsap.set(titlebar, { opacity: 1 });
  gsap.set(marbleEl, { scale: 1, opacity: 1 });
  gsap.set(focusNameEl, { opacity: 1, y: 0 });
  focusNameEl.textContent = VIDEOS[focusIndex].name;
  hudIndexEl.textContent = indexLabel(focusIndex);
  spinLock = false;
  current = "grid";
  setScene("archive");
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
  // cut : 로컬 파일을 이 지점(초)에서 끊고 정원으로 — 문이 닫히고 어두워지는 순간. 끝 1초에 뜨는 것을 안 보이게
  { file: "film1.mp4", yt: "-xtSbOMBKkA", start: 0,  end: 26, cut: 26.5 },   // 유튜브로 틀 땐 26초에서 멈춘다
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
   본편이 아예 없는 저장소(인터랙션만 올린 경우)면 구슬까지만 돌아간다.

   확인은 스크립트가 뜨자마자 시작한다. 아카이브가 다 뜬 뒤에 시작하면
   그 사이 영상 아홉 개와 정원을 받느라 확인이 밀리고, 아직 안 끝난 채로
   관객이 '확인하러 가기' 를 누르면 본편이 없는 줄 알고 아카이브로 되돌아간다.
   두 파일도 나란히 물어본다 (하나씩 기다릴 이유가 없다). */
let hasFilm = false;

const filmProbe = (async () => {
  await Promise.all(FILM.map(async (seg) => {
    try {
      const r = await fetch(seg.file, { method: "HEAD" });
      seg.local = r.ok;
    } catch { seg.local = false; }
    seg.usable = seg.local || (USE_YOUTUBE && !!seg.yt);
  }));
  hasFilm = FILM.every((s) => s.usable);
  if (!hasFilm) {
    btnGo.style.display = "none";
    console.info("[야광] 본편 영상이 없어 구슬까지만 동작합니다.");
  }
  return hasFilm;
})();

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
/* ── 인터랙션 1 → 영상 1 : 자동문 ─────────────────────────
   양옆에서 검은 패널이 닫혀 가운데서 만나고, 그 사이 영상이 시작되면
   자동문처럼 양옆으로 벌어지며 영상이 드러난다. */
const doorL = document.getElementById("doorL");
const doorR = document.getElementById("doorR");
const wipeEl = document.getElementById("pixwipe");
const wipeCtx = wipeEl.getContext("2d");

async function doorTransition(layers, prepare) {
  locked = true;
  endHold(true);
  hideChrome(true);
  gsap.to(cursorEl, { opacity: 0, duration: 0.2 });
  gsap.set([doorL, doorR], { autoAlpha: 1 });
  gsap.set(doorL, { xPercent: -100 });
  gsap.set(doorR, { xPercent: 100 });

  // 1) 닫힌다 — 뒤 화면은 살짝 물러난다
  const close = gsap.timeline();
  close.to(layers, { scale: 0.96, duration: 0.85, ease: "power2.inOut" }, 0);
  close.to([doorL, doorR], { xPercent: 0, duration: 0.85, ease: "power3.inOut" }, 0);
  await close;

  // 2) 닫힌 사이에 영상으로 바꿔 끼운다
  gsap.set([screenGrid, screenOrb, screenGarden], { autoAlpha: 0 });
  gsap.set(layers, { clearProps: "transform" });
  gsap.set(["#aura", "#dust"], { autoAlpha: 1 });
  await Promise.all([prepare(), new Promise((r) => setTimeout(r, 300))]);

  // 3) 자동문처럼 벌어진다 — 처음엔 천천히, 가운데서 빨라졌다가 끝에서 부드럽게 멈춘다
  const open = gsap.timeline();
  open.to(doorL, { xPercent: -100, duration: 1.5, ease: "power2.inOut" }, 0);
  open.to(doorR, { xPercent: 100, duration: 1.5, ease: "power2.inOut" }, 0);
  open.fromTo(filmEl, { scale: 1.06 }, { scale: 1, duration: 1.9, ease: "power2.out" }, 0);
  await open;
  gsap.set([doorL, doorR], { autoAlpha: 0 });
  gsap.set(filmEl, { clearProps: "transform" });
  locked = false;
}

/* ── 정원 → 영상 2 : 필름 릴 ─────────────────────────────
   1) 정원이 작아지며 필름 한 칸이 되고, 양옆에 구멍 뚫린 필름 띠가 나타난다
   2) 필름이 한 칸 감기며 다음 칸에 영상 2 가 올라온다
   3) 그 칸이 커지며 화면 가득 영상이 된다
   필름 띠와 다음 칸의 영상은 캔버스(정원 바로 아래)에 그린다. */
const REEL = {
  k: 0.6,           // 칸 크기 (화면 대비)
  gap: 46,          // 칸 사이
  margin: 66,       // 칸 바깥 띠 폭 (구멍이 뚫리는 자리)
  hole: 30,         // 구멍 간격
};
const REEL_FW = STAGE_W * REEL.k;
const REEL_FH = STAGE_H * REEL.k;
const REEL_STEP = REEL_FH + REEL.gap;

function drawReel(s, withFilm) {
  const g = wipeCtx;
  g.imageSmoothingEnabled = true;            // 픽셀 전환이 꺼 둔 걸 되돌린다
  const cx = STAGE_W / 2, cy = STAGE_H / 2;
  const fl = cx - REEL_FW / 2;
  const sl = fl - REEL.margin, sw = REEL_FW + REEL.margin * 2;
  g.fillStyle = "#000";
  g.fillRect(0, 0, STAGE_W, STAGE_H);
  g.fillStyle = "#151515";
  g.fillRect(sl, 0, sw, STAGE_H);
  // 구멍 — 띠와 같이 흐른다
  g.fillStyle = "#000";
  for (let y = -(s % REEL.hole) - REEL.hole; y < STAGE_H + REEL.hole; y += REEL.hole) {
    g.fillRect(sl + 22, y, 20, 13);
    g.fillRect(sl + sw - 42, y, 20, 13);
  }
  // 칸 — 0 은 정원(위에 정원 화면이 얹힌다), 1 은 영상 2
  g.font = '500 12px "tt-autonomous-mono", "Roboto Mono", monospace';
  for (let i = -2; i <= 3; i++) {
    const fy = cy - REEL_FH / 2 + i * REEL_STEP - s;
    if (fy > STAGE_H || fy + REEL_FH < 0) continue;
    g.fillStyle = "#070707";
    g.fillRect(fl, fy, REEL_FW, REEL_FH);
    g.fillStyle = "#9a5aff";
    g.fillText(`${String(i + 1).padStart(2, "0")}  YK-2087`, fl, fy - REEL.gap / 2 + 4);
    g.fillText("夜光", fl + REEL_FW - 26, fy - REEL.gap / 2 + 4);
    if (i === 1 && withFilm && filmEl.style.visibility !== "hidden" && filmEl.readyState >= 2 && filmEl.videoWidth) {
      const vw = filmEl.videoWidth, vh = filmEl.videoHeight, k = Math.max(REEL_FW / vw, REEL_FH / vh);
      g.save();
      g.beginPath(); g.rect(fl, fy, REEL_FW, REEL_FH); g.clip();
      g.drawImage(filmEl, cx - vw * k / 2, fy + REEL_FH / 2 - vh * k / 2, vw * k, vh * k);
      g.restore();
    }
  }
}

async function reelTransition(prepare) {
  locked = true;
  endHold(true);
  hideChrome(true);
  gsap.to(cursorEl, { opacity: 0, duration: 0.2 });
  const R = { s: 0 };
  const paint = () => drawReel(R.s, true);
  // 필름 띠는 정원 바로 아래에서 그린다
  gsap.set(screenGarden, { zIndex: 7, transformOrigin: "50% 50%" });
  gsap.set(wipeEl, { zIndex: 6 });
  drawReel(0, false);

  // 1) 정원이 필름 한 칸이 된다 — 그 사이 영상을 준비한다
  const shrink = gsap.timeline();
  shrink.to(screenGarden, { scale: REEL.k, duration: 0.85, ease: "power3.inOut" }, 0);
  shrink.fromTo(wipeEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: "power1.out" }, 0.25);
  const ready = prepare();
  gsap.set(screenFilm, { opacity: 0 });      // 칸이 커질 때까지 진짜 영상은 숨겨 둔다
  await Promise.all([shrink, ready]);

  // 2) 한 칸 감긴다
  const roll = gsap.timeline({ onUpdate: paint });
  roll.to(R, { s: REEL_STEP, duration: 0.9, ease: "power3.inOut" }, 0.1);
  roll.to(screenGarden, { y: -REEL_STEP, duration: 0.9, ease: "power3.inOut" }, 0.1);
  await roll;

  // 3) 그 칸이 화면 가득 커진다 — 진짜 영상으로 바꿔 끼우고 띠는 걷어 낸다
  gsap.set(screenGarden, { autoAlpha: 0 });
  gsap.set(screenFilm, { scale: REEL.k, transformOrigin: "50% 50%", opacity: 1 });
  const grow = gsap.timeline();
  grow.to(screenFilm, { scale: 1, duration: 0.9, ease: "power3.inOut" }, 0);
  grow.to(wipeEl, { autoAlpha: 0, duration: 0.35, ease: "power1.in" }, 0);
  await grow;

  gsap.set([screenGrid, screenOrb, screenGarden], { autoAlpha: 0 });
  gsap.set(screenGarden, { clearProps: "transform,transformOrigin,zIndex" });
  gsap.set(screenFilm, { clearProps: "transform,transformOrigin" });
  gsap.set(wipeEl, { clearProps: "zIndex" });
  wipeCtx.clearRect(0, 0, STAGE_W, STAGE_H);
  locked = false;
}

async function transition(prepare) {
  locked = true;
  endHold(true);
  await fadeOut();
  await prepare();
  await fadeIn();
  locked = false;
}

function hideChrome(hidden) {
  gsap.to([".camera-box", ".camera-hint", ".hud"], {
    autoAlpha: hidden ? 0 : 1, duration: 0.5, ease: "power2.out",
  });
  gsap.to(titlebar, { autoAlpha: hidden ? 0 : 1, duration: 0.5 });
}

/* 구슬 → 영상 앞부분 */
async function toFilm(segment) {
  if (locked) return;
  await filmProbe;                      // 확인이 끝난 뒤에 판단한다
  if (locked || current === "film") return;   // 기다리는 사이 이미 넘어갔을 수 있다
  if (!hasFilm) return back();          // 본편이 없는 저장소면 아카이브로
  const from = current;
  if (from === "garden") releaseGardenHand();
  // 인터랙션 1 → 영상 1 은 자동문, 정원 → 영상 2 는 필름 릴
  const run = from === "garden"
    ? reelTransition
    : (prep) => doorTransition([screenGrid, screenOrb, "#aura", "#dust"], prep);
  await run(async () => {
    gsap.set(screenFilm, { autoAlpha: 1 });
    document.body.classList.remove("is-garden");
    hideChrome(true);
    gsap.to(cursorEl, { opacity: 0, duration: 0.3 });
    current = "film";
    filmSegment = segment;
    setScene("film");

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
}

/* 영상 앞부분 → 정원 */
async function toGarden() {
  if (locked) return;
  filmEl.pause();
  stopYt();
  setScene("crossing");       // 소리가 위로 빨려 올라가고, 정원이 뜨면 '풍덩' 잠긴다
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
    setScene("garden");
    try { gardenFrame.contentWindow.focus(); } catch {}
    prepareGarden();          // 커서 모양 맞추기 (이미 돼 있으면 건너뜀)
    enableGardenHand();       // 정원의 손 조작 켜기 (카메라는 같이 쓴다)
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
  locked = true;
  await fadeOut();
  filmEl.pause();
  stopYt();
  gsap.set([screenFilm, screenGarden, screenOrb], { autoAlpha: 0 });
  hideChrome(true);
  gsap.set(cursorEl, { opacity: 0 });
  // 로딩 화면은 검정 바탕이라 검정 막을 바로 걷어도 티가 안 난다
  resetLoader();
  gsap.set(fadeEl, { opacity: 0, visibility: "hidden" });
  await replayBoot();
  locked = false;
}

/* 앞 영상이 끝나면 정원으로, 뒤 영상이 끝나면 아카이브로
   (파일이 이미 나뉘어 있어서 중간에 끊을 필요가 없다) */
filmEl.addEventListener("ended", onFilmEnded);
filmEl.addEventListener("timeupdate", () => {
  const seg = FILM[filmSegment];
  if (seg && seg.cut && filmEl.currentTime >= seg.cut) onFilmEnded();
});

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
  ["btn-next", "btn-go", "panel-next", "float-next"].forEach((id) => {
    const b = doc.getElementById(id);
    if (b) b.addEventListener("click", () => toFilmTail());
  });

  // 구슬을 열면 (기록 창이 뜨면) 맑은 구슬 소리
  const panel = doc.getElementById("orb-panel");
  if (panel) {
    new MutationObserver(() => { if (!panel.hidden) chime(); })
      .observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  }
}

/* 정원의 손 조작을 켠다 — 카메라는 이쪽 것을 그대로 같이 쓴다 */
function enableGardenHand() {
  startCamera();
  let doc;
  try { doc = gardenFrame.contentDocument; } catch { return; }
  const b = doc && doc.getElementById("btn-hand");
  if (b && b.getAttribute("aria-pressed") !== "true") b.click();
}

/* 정원을 나오면 정원의 손 조작을 끈다 */
function releaseGardenHand() {
  let doc;
  try { doc = gardenFrame.contentDocument; } catch { doc = null; }
  const b = doc && doc.getElementById("btn-hand");
  if (b && b.getAttribute("aria-pressed") === "true") b.click();
  sharedHand.on = false;
  startCamera();
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
  else if (current === "orb") toFilm(0);      // 본편이 없으면 toFilm 이 알아서 되돌린다
  else if (current === "film") (filmSegment === 0 ? toGarden() : toArchive());
  else if (current === "garden") toFilmTail();
}

/* 화면이 넘어가는 중(잠김)에 눌린 버튼은 버리지 않고, 풀리자마자 실행한다 */
function whenUnlocked(fn) {
  const t0 = performance.now();
  (function wait() {
    if (!locked) return fn();
    if (performance.now() - t0 < 4000) setTimeout(wait, 50);
  })();
}
btnGo.addEventListener("click", () => whenUnlocked(() => { if (current === "orb") toFilm(0); }));
btnBack.addEventListener("click", back);

window.addEventListener("keydown", (e) => {
  if (locked) return;
  if (e.key === "ArrowRight") nudge(1);
  if (e.key === "ArrowLeft") nudge(-1);
  if (e.key === "Enter" || e.key === " ") advance();
  if (e.key === "Escape") back();
});

window.addEventListener("pointerdown", () => {
  videoPool.forEach((v, i) => { if (liveVideo[i]) v.play().catch(() => {}); });
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
let holdBy = null;              // "hand" · "dwell" · "mouse" — 지금 누가 누르고 있는지
let holdZone = null;            // 누르고 있는 자리 (handZone 참고)
let dwellLatch = false;         // 올려 두기로 한 번 눌렀으면, 손을 뺄 때까지 다시 눌리지 않는다
const dwellAt = { zone: null, since: 0 };


/* 손 커서는 훨씬 빨리 따라온다 — 손 떨림은 One Euro 필터가 이미 걸러 줘서,
   여기서 0.45초를 더 늦추면 손보다 커서가 한참 뒤처져 '렉'처럼 느껴진다 */
const handCursorX = gsap.quickTo(cursorEl, "x", { duration: 0.12, ease: "power2" });
const handCursorY = gsap.quickTo(cursorEl, "y", { duration: 0.12, ease: "power2" });

function moveCursor(sx, sy, byHand) {
  cursorPos.x = sx;
  cursorPos.y = sy;
  (byHand ? handCursorX : cursorX)(sx);
  (byHand ? handCursorY : cursorY)(sy);

  const nx = sx / STAGE_W - 0.5;
  const ny = sy / STAGE_H - 0.5;

  // 고리은 매 프레임 이 위치를 보고 돈다 (stepSpiral)
  pointerIn = true;

  auraX(-nx * 70);
  auraY(-ny * 50);

  gsap.to(cursorEl, { opacity: 1, duration: 0.3, overwrite: "auto" });
}

function drawHold() {
  cursorProg.style.strokeDashoffset = String(RING * (1 - hold.p));
  baselineFill.style.transform = `scaleX(${hold.p})`;
}

/* 손이 지금 '올려 두면 눌리는' 자리에 있는지.
   아카이브에선 가운데 화면, 구슬 화면에선 두 버튼 (손으로 맞추기 쉽게 버튼보다 넉넉히 잡는다). */
const BTN_PAD = 44;
function handZone(sx, sy) {
  if (current === "grid") {
    return Math.abs(sx / STAGE_W - 0.5) < 0.22 && sy > STAGE_H * 0.18 && sy < STAGE_H * 0.86 ? "front" : null;
  }
  if (current === "orb") {
    // 두 버튼이 붙어 있어서 '먼저 검사한 버튼'이 이기면 다시 고르기 쪽 절반이 확인하러 가기로 잡혔다.
    // 손에서 가장 가까운 버튼을 고른다.
    let best = null, bestD = Infinity;
    for (const [zone, el] of [["go", btnGo], ["back", btnBack]]) {
      const r = el.getBoundingClientRect();
      const a = toStage(r.left, r.top), b = toStage(r.right, r.bottom);
      const dx = Math.max(a.x - sx, 0, sx - b.x), dy = Math.max(a.y - sy, 0, sy - b.y);
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = zone; }
    }
    if (bestD <= BTN_PAD) return best;
  }
  return null;
}

/* by : "mouse"(마우스로 꾹) · "hand"(꼬집기) · "dwell"(손을 올려 두기)
   zone : 누르는 자리 — 구슬 화면에서 "back" 이면 다시 고르기, 아니면 확인하러 가기 */
function startHold(by = "hand", zone = null) {
  if (holding || locked || !ready) return;
  holding = true;
  holdBy = by;
  holdZone = zone;
  const wait = by === "mouse" ? HOLD.mouse
    : by === "dwell" ? (current === "grid" ? HOLD.dwell : HOLD.button)
    : HOLD.time;
  gsap.to(cursorEl, { scale: 1.3, duration: 0.3, ease: "back.out(3)" });
  if (current === "orb") (zone === "back" ? btnBack : btnGo).classList.add("is-armed");

  // 누르고 있는 동안에는 목록이 더 넘어가지 않게 세워둔다
  if (current === "grid") {
    spinLock = true;                     // 정면 파편에 맞춰 선다
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
      const z = holdZone;
      endHold(true);
      pinchLatch = true;                  // 손을 펴기 전엔 다시 선택되지 않게
      dwellLatch = true;                  // 손을 그 자리에서 뺐다가 다시 올려야 또 눌린다
      if (current === "orb" && z === "back") back();
      else advance();
    },
  });
}

function endHold(done) {
  if (!holding) return;
  holding = false;
  holdBy = null;
  holdZone = null;
  btnGo.classList.remove("is-armed");
  btnBack.classList.remove("is-armed");
  gsap.to(cursorEl, { scale: 1, duration: 0.4, ease: "power2.out" });

  if (!done) {
    gsap.to(featureEl, { scale: 1, duration: 0.4, ease: "power2.out" });
    // 다시 목록이 넘어갈 수 있게. 손을 놓자마자 튀지 않도록 한 박자 쉰다.
    spinLock = false;
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
// 버튼 위에서 누른 건 그 버튼의 클릭으로 처리한다 — '다시 고르기'를 조금 오래 누르면
// 꾹 누르기로 잡혀 영상으로 넘어가 버리던 것을 막는다
window.addEventListener("mousedown", (e) => { if (!e.target.closest || !e.target.closest("button")) startHold("mouse"); });
window.addEventListener("mouseup", () => { if (holdBy === "mouse") endHold(false); });

/* 큰 화면을 그냥 한 번 눌러도 골라진다.
   손으로는 꾹 눌러야 하지만, 마우스로는 클릭이 자연스럽다. */
document.querySelector(".feature__label").addEventListener("click", () => select());
coreEl.addEventListener("click", () => { if (ready && !locked && current === "grid") select(); });

/* 파편을 누르면 — 정면 파편이면 고르고, 옆 파편이면 그 파편을 정면으로 돌려 온다 */
tiles.forEach((t) => {
  t.el.addEventListener("click", () => {
    if (locked || current !== "grid" || !ready) return;
    if (t.k === focusCard) return select();
    spinTarget = Math.round(spin.s + t.rel);
  });
});

/* 휠(트랙패드)로도 한 장씩 돌린다. 트랙패드는 이벤트가 잘게 쏟아지므로 모아서 넘긴다. */
let wheelAcc = 0;
window.addEventListener("wheel", (e) => {
  if (current !== "grid") return;
  wheelAcc += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
  if (Math.abs(wheelAcc) > 70) { nudge(Math.sign(wheelAcc)); wheelAcc = 0; }
}, { passive: true });

/* 커서가 창 밖으로 나가면 고리을 돌리지 않는다 (가장자리에 걸린 채 계속 돌지 않게) */
document.documentElement.addEventListener("mouseleave", () => { if (!handActive) pointerIn = false; });
window.addEventListener("blur", () => { if (!handActive) pointerIn = false; });

/* ============================================================
   로딩
   ============================================================ */
const loaderEl = document.getElementById("loader");
const loaderPct = document.getElementById("loaderPct");
const titlebar = document.getElementById("titlebar");
const titleBoot = document.getElementById("titleBoot");
const titleAsk = document.getElementById("titleAsk");

// 로딩 화면은 타이핑 글씨가 맡는다 — 기관명 제목은 쓰지 않는다
document.body.classList.add("is-booting");
titleBoot.style.display = "none";
const loaderFrame = document.getElementById("loaderFrame");

/* 글자를 한 자씩 찍는다. 찍는 동안 끝에 ▋ 커서가 붙고, 다 찍으면 사라진다. */
function typeIn(el, text, delay, cps = 24) {
  const chars = [...text];
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let i = 0;
  return new Promise((done) => {
    setTimeout(function tick() {
      el.innerHTML = esc(chars.slice(0, i).join("")) + (i < chars.length ? '<span class="type-cursor"></span>' : "");
      if (i++ < chars.length) setTimeout(tick, (1000 / cps) * (0.5 + Math.random()));   // 손으로 치듯 들쭉날쭉
      else done();
    }, delay);
  });
}

const loaderLogo = document.getElementById("loaderLogo");
const loaderTag = document.getElementById("loaderTag");
const loaderStart = document.getElementById("loaderStart");

/* 로딩 화면 연출 — 처음 켤 때, 그리고 영상 2 가 끝나 처음으로 돌아올 때마다 똑같이 튼다 */
function bootIntro() {
  // 1) 네 귀퉁이 표시가 깜빡이며 들어오고
  gsap.fromTo(".loader__corner", { opacity: 0 },
    { opacity: 1, duration: 0.06, repeat: 3, yoyo: true, repeatDelay: 0.08, stagger: 0.12, delay: 0.25,
      onComplete() { gsap.set(this.targets(), { opacity: 1 }); } });
  // 2) 가운데 타이틀 로고가 브라운관처럼 깜빡이며 켜지고, 도장이 찍힌다
  gsap.set([".logo__line", ".logo__seal"], { opacity: 0 });
  gsap.timeline({ delay: 0.4 })
    .to(".logo__line--1", { opacity: 1, duration: 0.05, repeat: 3, yoyo: true, repeatDelay: 0.06 })
    .set(".logo__line--1", { opacity: 1 })
    .to(".logo__line--2", { opacity: 1, duration: 0.05, repeat: 3, yoyo: true, repeatDelay: 0.06 }, "-=0.12")
    .set(".logo__line--2", { opacity: 1 })
    .add(stampSeal(), "+=0.15");
  typeIn(loaderTag, loaderTag.dataset.text, 1250, 30);
  // 3) 아래 한 줄의 글씨들이 조금씩 어긋나게 타이핑된다
  document.querySelectorAll(".loader__cell[data-text]").forEach((el, i) => {
    typeIn(el, el.dataset.text, 650 + i * 110 + Math.random() * 120).then(() => {
      if (el.classList.contains("loader__cell--1")) loaderPct.textContent = Math.round(shownPct * 100) + "%";
    });
  });
}

/* 한 번 끝난 로딩 화면을 처음 상태로 되돌린다 */
function resetLoader() {
  document.body.classList.add("is-booting");
  gsap.set(loaderEl, { autoAlpha: 1 });
  gsap.set([loaderLogo, ".loader__cell"], { opacity: 1 });
  gsap.set([".loader__corner", loaderFrame, loaderStart], { opacity: 0 });
  document.querySelectorAll(".loader__cell[data-text]").forEach((el) => { el.textContent = ""; });
  loaderTag.textContent = "";
  loaderPct.textContent = "";
}

/* 도장 찍기 — 위에서 크게 기울어진 채 내려와 '쿵' 눌리고, 살짝 튀어 제자리에 앉는다.
   찍히는 순간 인주가 번지듯 빛이 확 퍼졌다 가라앉고, 로고 전체가 한 번 울린다.
   (기준점을 도장 한가운데로 박아 둔다 — 안 그러면 로고 왼쪽 위를 기준으로 커져서 옆에서 날아오는 것처럼 보인다) */
function stampSeal() {
  const SEAL_ORIGIN = "461 107.2";            // 로고.svg 안의 도장 한가운데 (435.6 + 50.75/2, 61 + 92.44/2)
  const GLOW = "drop-shadow(0 0 7px rgba(154,90,255,.75)) brightness(1)";
  // 기준점은 아무것도 바꾸기 전에 먼저 박는다. 커진 뒤에 기준점을 옮기면 GSAP 이 위치를 보정하느라
  // 도장이 제자리에서 10px 가량 밀려 앉는다.
  gsap.set(".logo__seal", { svgOrigin: SEAL_ORIGIN });
  return gsap.timeline()
    // 공중에서 내려온다 — 커 보이고, 비스듬하고, 흐릿하다
    .fromTo(".logo__seal",
      { opacity: 0, scale: 2.1, rotation: -9, svgOrigin: SEAL_ORIGIN, filter: "drop-shadow(0 0 0 rgba(154,90,255,0)) brightness(1)" },
      { opacity: 1, scale: 0.9, rotation: 0, duration: 0.26, ease: "power4.in" })
    // 쿵 — 빛이 번지고, 로고가 한 번 울린다
    .to(".logo__seal", { filter: "drop-shadow(0 0 22px rgba(154,90,255,1)) brightness(1.7)", duration: 0.05 })
    .fromTo(".logo", { y: 0 }, { y: 3, duration: 0.05, repeat: 1, yoyo: true, ease: "power1.out" }, "<")
    // 손을 떼면 살짝 튀어 올라 제자리에 앉고, 빛은 천천히 가라앉는다
    .to(".logo__seal", { scale: 1, duration: 0.35, ease: "back.out(4)" }, "<0.03")
    .to(".logo__seal", { filter: GLOW, duration: 0.7, ease: "power2.out" }, "<");
}
let shownPct = 0;            // 화면에 보이는 퍼센트 (실제 로딩보다 너무 빨리 차지 않게 따라간다)
bootIntro();

let ready = false;
let loaded = 0;
const TOTAL = N + 1;                 // 영상 8 + 구슬 이미지

function bumpLoaded() {
  loaded = Math.min(TOTAL, loaded + 1);
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
  bootOutro(tl);
  setScene("archive");

  // 파편들이 축에서 풀려 나오며 고리로 감기고,
  // 정면 파편이 브라운관처럼 켜지면서 이름이 잡음에서 잡힌다
  tl.fromTo(rig,
    { intro: 0, swirl: -4 },
    { intro: 1, swirl: 0, duration: 2.0, ease: "power3.out" }, "-=0.45");
  tl.fromTo(featureEl,
    { opacity: 0, y: 0 },
    { opacity: 1, duration: 0.9, ease: "power3.out" }, "<0.5");
  tl.add(() => {
    crtOn(true);
    echoIn(featNameEl, VIDEOS[focusIndex].name);
    gsap.set([featNameEl, featSlugEl], { opacity: 1, y: 0 });
    scramble(featNameEl, VIDEOS[focusIndex].name, 0.9);
    scramble(featSlugEl, slugOf(VIDEOS[focusIndex]), 1.05);
  }, "<");

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
    document.body.classList.remove("is-booting");   // 질문은 왼쪽 위 제자리로
    titleAsk.style.display = "block";
  }, ">");
  tl.fromTo(titleAsk,
    { opacity: 0, y: 12 },
    { opacity: 1, y: 0, duration: 0.6, ease: "power3.out", immediateRender: false },
    ">");

  tl.fromTo([".meta--tl", ".meta--tr", ".camera-box", ".camera-hint"],
    { opacity: 0, y: 12 },
    { opacity: 1, y: 0, duration: 0.7, stagger: 0.07, ease: "power3.out" }, "-=0.7");

  // 아카이브가 뜬 뒤부터 본편 영상과 정원을 뒤에서 받아둔다
  tl.add(() => {
    filmProbe.then(() => {
      if (FILM[0].local) loadFilmFile(FILM[0]);   // 앞 영상 미리 받기
    });
    if (!gardenLoaded) { gardenFrame.src = "gooseulbit-garden.html"; gardenLoaded = true; }
  });

  tl.add(() => { focusNameEl.textContent = VIDEOS[focusIndex].name; }, "-=0.5");
  tl.fromTo(focusNameEl, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5 }, "-=0.5");
}

/* 로딩 화면 걷기 — 로고와 글씨가 깜빡이며 꺼지고, 테두리가 번지고,
   바닥 선이 한 번 지나간 뒤 사이트가 몇 단계로 밝아진다 */
function bootOutro(tl) {
  loaderPct.textContent = "100%";
  gsap.to(loaderStart, { opacity: 0, duration: 0.2, overwrite: true });
  tl.to([loaderLogo, ".loader__cell"], { opacity: 0, duration: 0.05, repeat: 3, yoyo: true, stagger: 0.03 }, 0.25);
  tl.set([loaderLogo, ".loader__cell"], { opacity: 0 });
  tl.fromTo(loaderFrame, { opacity: 1, scale: 0.12 }, { scale: 1, duration: 0.35, ease: "power3.out" }, "<");
  tl.to(loaderFrame, { opacity: 0, duration: 0.06, repeat: 1, yoyo: true }, ">0.05");
  tl.set(loaderFrame, { opacity: 0 });
  tl.fromTo(baselineFill, { scaleX: 0, transformOrigin: "0% 50%" },
    { scaleX: 1, duration: 0.32, ease: "power2.inOut" }, ">-0.05");
  tl.to(baselineFill, { scaleX: 0, transformOrigin: "100% 50%", duration: 0.28, ease: "power2.in" });
  tl.set(baselineFill, { transformOrigin: "0% 50%" });
  tl.to(".loader__corner", { opacity: 0, duration: 0.15 }, "<");
  tl.to(loaderEl, { autoAlpha: 0, duration: 0.75, ease: "steps(5)" }, "-=0.1");
  return tl;
}

/* 다 받으면 '화면을 눌러 시작하세요' — 브라우저는 사람이 한 번 누르기 전엔 소리를 막는다.
   손으로만 고르면 '누름'이 없어서 영상 1 이 소리 없이 나왔다 (깃허브에서 특히).
   전시를 열 때 한 번만 누르면 페이지를 닫기 전까지 계속 소리가 난다. */
function askStart() {
  gsap.fromTo(loaderStart, { opacity: 0 }, { opacity: 1, duration: 0.5 });
  const go = (e) => {
    if (e && e.type === "keydown" && e.repeat) return;
    ["pointerdown", "touchstart", "keydown"].forEach((t) => window.removeEventListener(t, go, true));
    unlockSound();
    unlockFilm();
    reveal();
  };
  ["pointerdown", "touchstart", "keydown"].forEach((t) => window.addEventListener(t, go, true));
}

/* 누르는 그 순간에 영상 요소도 한 번 '소리 켜고 재생'을 해 둔다 (아이패드 사파리는 요소마다 허락을 받는다) */
function unlockFilm() {
  try {
    if (!filmEl.getAttribute("src")) filmEl.setAttribute("src", FILM[0].file);
    filmEl.muted = false;
    const p = filmEl.play();
    filmEl.pause();
    if (p && p.catch) p.catch(() => {});
  } catch {}
}

/* 영상 2 가 끝나면 — 처음 켤 때처럼 로고부터 다시 보여 주고 아카이브를 연다.
   (페이지를 새로 고치지 않는다. 그래야 시작할 때 한 번 누른 '소리 허락'이 그대로 남는다) */
const REPLAY_HOLD = 3.6;       // 로고를 보여 주는 시간(초)
async function replayBoot() {
  resetLoader();
  setScene("silent");
  bootIntro();
  const p = { v: 0 };
  gsap.to(p, { v: 1, duration: 2.3, delay: 0.9, ease: "power1.inOut",
    onUpdate() { loaderPct.textContent = Math.round(p.v * 100) + "%"; } });
  await new Promise((r) => setTimeout(r, REPLAY_HOLD * 1000));
  const tl = gsap.timeline();
  bootOutro(tl);
  // 로딩 화면이 걷히는 동안 그 뒤에서 아카이브가 다시 펼쳐진다
  tl.add(() => {
    document.body.classList.remove("is-booting");
    resetArchive();
    setScene("archive");
  }, "-=0.85");
  await tl;
}

// 중앙 레이블은 로딩 화면 위에 먼저 나타난다
gsap.set([".meta--tl", ".meta--tr", ".camera-box", ".camera-hint"], { opacity: 0 });
gsap.from(titlebar, { opacity: 0, duration: 1, ease: "power2.out", delay: 0.15 });

// 퍼센트는 실제 로딩을 따라가되 1초에 40% 넘게는 오르지 않는다 (캐시로 순식간에 끝나도 세는 게 보이게).
// 100% 가 되면 연다. 늦어도 8초 뒤에는 연다.
const startedAt = performance.now();
const readyCheck = setInterval(() => {
  const waited = performance.now() - startedAt;
  const real = waited > 8000 ? 1 : loaded / TOTAL;
  if (waited > 1200) shownPct = Math.min(real, shownPct + 0.048);
  const typed = !document.querySelector(".loader__cell--1 .type-cursor") && document.querySelector(".loader__cell--1").textContent;
  if (typed) loaderPct.textContent = Math.round(shownPct * 100) + "%";
  if (shownPct >= 1) {
    clearInterval(readyCheck);
    setTimeout(askStart, 250);
  }
}, 120);

/* ============================================================
   손 인식
   ============================================================ */
const camVideo = document.getElementById("cam");
const camCanvas = document.getElementById("camCanvas");
const camCtx = camCanvas.getContext("2d");
const camStatus = document.getElementById("camStatus");

/* 카메라와 손 모델은 정원(iframe)과 같이 쓴다.
   정원이 카메라를 따로 열면 허용 창이 한 번 더 뜨고, 손 모델도 두 벌 올라가 무거워진다.
   정원이 on 을 켜면, 이쪽에서 손을 찾아 정원에 넣어 준다 (feedGarden). */
let camStream = null;
const sharedHand = { video: camVideo, on: false };
window.__ykHand = sharedHand;

async function startCamera() {
  if (camStream) return true;
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user", frameRate: { ideal: 30 } },
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
      minHandDetectionConfidence: HAND.detect,
      minHandPresenceConfidence: HAND.detect,
      minTrackingConfidence: HAND.detect,
    });

    camStatus.textContent = "카메라를 허용해 주세요";
    await startCamera();

    camStatus.classList.add("is-hidden");
    gsap.ticker.add(trackTick);       // 그리기(drawTiles) 다음에 돈다 — 순서가 중요하다
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
  // 엄지-검지 — 모으면 초록으로 이어진다 (지금 '집었다'고 읽히는지 바로 보이게)
  {
    const a = toCanvas(lms[4], box), b = toCanvas(lms[8], box);
    const on = pinchSince > 0;
    camCtx.save();
    camCtx.strokeStyle = on ? "#1eff66" : "rgba(255,255,255,0.35)";
    camCtx.lineWidth = on ? 6 : 2;
    if (!on) camCtx.setLineDash([6, 6]);
    if (on) { camCtx.shadowColor = "#1eff66"; camCtx.shadowBlur = 18; }
    camCtx.beginPath(); camCtx.moveTo(a.x, a.y); camCtx.lineTo(b.x, b.y); camCtx.stroke();
    camCtx.restore();
  }

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
  // 깊이(z)까지 넣어 잰다 — 손을 카메라 쪽으로 기울여도 거리가 줄어 보이지 않게
  const d = Math.hypot(lms[4].x - lms[8].x, lms[4].y - lms[8].y, (lms[4].z - lms[8].z) || 0);
  const scale = Math.hypot(lms[0].x - lms[9].x, lms[0].y - lms[9].y, (lms[0].z - lms[9].z) || 0) || 0.2;
  const ratio = d / scale;
  return holding ? ratio < HOLD.pinchOff : ratio < HOLD.pinchOn;
}

/* 커서 떨림 거르기 — One Euro 필터.
   가만히 있을 땐 미세한 떨림을 단단히 누르고, 빨리 움직일 땐 바로 따라온다.
   (예전처럼 매 프레임 7% 씩만 따라가면 떨림은 줄지만 커서가 늘 굼뜨다) */
function oneEuro(minCutoff, beta, dCutoff = 1) {
  let x = null, dx = 0, t = 0;
  const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
  return {
    reset() { x = null; },
    filter(v, now) {
      if (x === null) { x = v; dx = 0; t = now; return v; }
      const dt = Math.max(0.001, (now - t) / 1000);
      t = now;
      dx += alpha(dCutoff, dt) * ((v - x) / dt - dx);
      x += alpha(minCutoff + beta * Math.abs(dx), dt) * (v - x);
      return x;
    },
  };
}
const fx = oneEuro(HAND.calm, HAND.agile);
const fy = oneEuro(HAND.calm, HAND.agile);

let lastSeenAt = 0;        // 손이 마지막으로 잡힌 시각
let pinchSince = 0;        // 꼬집기 시작한 시각 (0 이면 꼬집지 않는 중)
let openSince = 0;         // 손가락을 편 시각 (0 이면 편 상태 아님)

/* 손 하나를 처리한다. lms 가 없으면 이번 프레임엔 손을 못 찾은 것.
   (카메라 없이도 시험할 수 있게 trackLoop 에서 떼어 냈다) */
function processHand(lms, now, box) {
  if (lms) {
    lastSeenAt = now;
    if (!handActive) { handSeenAt = now; fx.reset(); fy.reset(); }   // 손이 새로 들어온 순간
    handActive = true;

    // 엄지와 검지 사이(집는 자리) — 가장자리 여유를 두고 화면 전체에 펼친다.
    // 검지 끝만 따라가면 손가락을 모으는 순간 검지가 엄지 쪽으로 움직여 커서가 튄다.
    const grip = { x: (lms[4].x + lms[8].x) / 2, y: (lms[4].y + lms[8].y) / 2 };
    const p = box ? toCanvas(grip, box) : { x: (1 - grip.x), y: grip.y };
    const cw = box ? box.cw : 1, ch = box ? box.ch : 1;
    const nx = gsap.utils.clamp(0, 1, (p.x / cw - 0.12) / 0.76);
    const ny = gsap.utils.clamp(0, 1, (p.y / ch - 0.15) / 0.7);
    handPos.x = fx.filter(nx, now);
    handPos.y = fy.filter(ny, now);
    moveCursor(handPos.x * STAGE_W, handPos.y * STAGE_H, true);

    // 꼬집기 — 일정 시간 이어져야 인정한다 (한 프레임 흔들림으로 눌리거나 끊기지 않게)
    if (isPinching(lms)) { openSince = 0; if (!pinchSince) pinchSince = now; }
    else { pinchSince = 0; if (!openSince) openSince = now; }
    const pinched = pinchSince && now - pinchSince >= HAND.pinchIn;
    const released = openSince && now - openSince >= HAND.pinchOut;

    // 손이 막 잡힌 직후에는 랜드마크가 흔들려 꼬집음으로 오인되기 쉽다
    const settled = now - handSeenAt > HOLD.grace;
    if (released) pinchLatch = false;            // 한 번 펴야 다음 선택이 가능
    const zone = handZone(handPos.x * STAGE_W, handPos.y * STAGE_H);

    if (settled && pinched && !pinchLatch) {
      // 올려 두기 게이지가 차는 중에 꼬집으면 두 배 빨리 찬다
      if (holding && holdBy === "dwell" && holdTween) holdTween.timeScale(2);
      else startHold("hand", zone);
    }
    // 손가락을 폈으면 놓은 것이다. 단, 마우스로 누르고 있는 건 건드리지 않는다.
    else if (released && holdBy === "hand") endHold(false);

    // 손을 올려 두기만 해도 눌린다 — 자리를 벗어나면 게이지가 풀린다
    if (zone !== dwellAt.zone) {
      dwellAt.zone = zone;
      dwellAt.since = now;
      if (!zone) dwellLatch = false;
      if (holdBy === "dwell") endHold(false);
    }
    if (zone && settled && !holding && !dwellLatch && now - dwellAt.since > HOLD.dwellDelay) {
      startHold("dwell", zone);
    }
    return;
  }

  // 잠깐 놓친 것이면 아무것도 바꾸지 않는다 — 커서도 게이지도 그대로
  if (handActive && now - lastSeenAt < HAND.lostGrace) return;

  if (handActive) gsap.to(cursorEl, { opacity: 0, duration: 0.4 });
  handActive = false;
  pointerIn = false;                  // 손이 사라지면 빨리 돌리기도 멈춘다 (저절로 도는 건 계속)
  handPos.x = null;                   // 손이 사라지면 다음엔 그 자리에서 새로 시작
  pinchSince = 0; openSince = 0;
  dwellAt.zone = null; dwellLatch = false;
  if (holdBy === "hand" || holdBy === "dwell") endHold(false);
}

/* 손 인식은 한 번에 10ms 남짓 화면을 멈춘다. 문자 화면(수천 글자)을 그리는 프레임과 겹치면
   한 프레임이 통째로 밀려 고리가 툭툭 끊긴다. 그래서 문자 화면을 그리지 않는 프레임에만 인식한다.
   (카메라는 초당 30장, 화면은 60번 이상이라 이렇게 해도 카메라 프레임을 놓치지 않는다)
   손이 없을 때는 손이 들어오는지만 보면 되므로 절반만 본다. */
let trackTurn = 0;
function trackTick() {
  if (!handLandmarker) return;
  if (current === "grid" && drawFrame % 2 === 0) return;      // 이번 프레임은 문자 화면 차례
  if (camVideo.readyState >= 2 && camVideo.currentTime !== lastVideoTime) {
    if (current === "garden") {
      lastVideoTime = camVideo.currentTime;
      if (sharedHand.on) feedGarden();
      return;
    }
    if (!handActive && (trackTurn++ & 1)) { lastVideoTime = camVideo.currentTime; return; }
    lastVideoTime = camVideo.currentTime;
    const now = performance.now();
    const box = drawCameraFrame();
    lastHands = handLandmarker.detectForVideo(camVideo, now);
    const lms = lastHands && lastHands.landmarks && lastHands.landmarks[0];
    if (lms) drawHand(lms, box);
    processHand(lms || null, now, box);
  }
}

/* 정원에 손을 넣어 준다. 시각은 정원 쪽 시계로 (창마다 performance.now() 의 기준이 다르다) */
function feedGarden() {
  let gw;
  try { gw = gardenFrame.contentWindow; } catch { return; }
  const g = gw && gw.__gardenHand;
  if (!g) return;
  const res = handLandmarker.detectForVideo(camVideo, performance.now());
  g.ingest((res && res.landmarks && res.landmarks[0]) || null, gw.performance.now());
}

initHands();

// 디버그용
window.__yk = { tiles, spin, rig, nudge, select, back, reveal, moveCursor, processHand, asciiSample, hold, handPos, state: () => ({ focusIndex, focusCard, current, locked, ready, handActive, holding, holdBy, holdZone, dwellLatch }) };
