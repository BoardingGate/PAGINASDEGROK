"use strict";

const POSE = {
  idle:        { w: 531, h: 1001, ax: 0.4945, ay: 0.9900, cy: 0.5144 },
  cuclillas:   { w: 719, h: 964,  ax: 0.4881, ay: 0.9896, cy: 0.5099 },
  salto:       { w: 648, h: 923,  ax: 0.4996, ay: 0.9892, cy: 0.4885 },
  pirueta:     { w: 734, h: 736,  ax: 0.4754, ay: 0.9864, cy: 0.5344 },
  liana:       { w: 709, h: 1029, ax: 0.5200, ay: 0.9903, cy: 0.5466 },
  aterrizaje:  { w: 801, h: 851,  ax: 0.4875, ay: 0.9882, cy: 0.5142 }
};

const HAND = { x: 0.2961, y: 0.0468 };
const DURATION = 2860;
const HOLD_MS = 300;
const FLICK_PX = 36;
const REACTIONS = ["grunido", "risa", "pecho", "saludo", "inclinacion"];
const REACTION_LINE = {
  grunido: "El gorila gruñe.",
  risa: "El gorila se ríe.",
  pecho: "El gorila se golpea el pecho.",
  saludo: "El gorila saluda.",
  inclinacion: "El gorila inclina la cabeza."
};

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
const stage = document.getElementById("stage");
const world = document.getElementById("world");
const actor = document.getElementById("actor");
const shadow = document.getElementById("shadow");
const flash = document.getElementById("flash");
const foot = document.getElementById("foot");
const handPin = document.getElementById("hand");
const hit = document.getElementById("hit");
const hint = document.getElementById("hint");
const card = document.getElementById("card");
const textEl = document.getElementById("tweet-text");
const whenEl = document.getElementById("when");
const mediaEl = document.getElementById("media");
const quoteEl = document.getElementById("quote");
const live = document.getElementById("live");
const muteBtn = document.getElementById("mute");
const vine = document.getElementById("vine");
const vineMain = document.getElementById("vine-main");
const vineMid = document.getElementById("vine-mid");
const vineHl = document.getElementById("vine-hl");
const canvas = document.getElementById("dust");
const ctx = canvas.getContext("2d", { alpha: true });

const img = {};
document.querySelectorAll(".pose").forEach((node) => {
  img[node.dataset.pose] = node;
});

const LEAVES = ["#7d9a45", "#c6a15a", "#3e6b32", "#e7d7a4", "#2c4a22", "#a3b56a"];

let mode = "idle";
let busy = false;
let jumpT0 = 0;
let jumpH = 180;
let trick = "pirueta";
let trickFlip = false;
let reactName = "grunido";
let reactT0 = 0;
let reactDur = 980;
let lastReact = "";
let fx = {};
let tweets = [];
let cursor = 0;
let pendingCard = false;
let muted = false;
let audioCtx = null;
let looping = false;
let last = 0;
const pointer = { x: 0, y: 0 };
const parallax = { x: 0, y: 0 };
const motes = [];
const bits = [];
let shock = null;

function clamp(v, a = 0, b = 1) {
  return Math.max(a, Math.min(b, v));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function smooth(t) {
  t = clamp(t);
  return t * t * (3 - 2 * t);
}
function easeOutExpo(t) {
  t = clamp(t);
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}
function easeInCubic(t) {
  t = clamp(t);
  return t * t * t;
}

function gh() {
  const h = img.idle.offsetHeight;
  return h > 20 ? h : Math.min(window.innerHeight * 0.68, 800);
}

function bodyLift(name) {
  const m = POSE[name];
  return (m.ay - m.cy) * (m.h / POSE.idle.h);
}
const PIRA_NUDGE = bodyLift("salto") - bodyLift("pirueta");

function poseWeights(t, which) {
  const keys = [
    [0, "idle"],
    [210, "cuclillas"],
    [400, "cuclillas"],
    [530, "salto"],
    [900, "salto"],
    [1060, which],
    [2060, which],
    [2180, "aterrizaje"],
    [2520, "aterrizaje"],
    [2760, "idle"]
  ];
  const w = { idle: 0, cuclillas: 0, salto: 0, pirueta: 0, liana: 0, aterrizaje: 0 };
  if (t >= keys[keys.length - 1][0]) {
    w.idle = 1;
    return w;
  }
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i += 1;
  const t0 = keys[i][0];
  const a = keys[i][1];
  const t1 = keys[i + 1][0];
  const b = keys[i + 1][1];
  const k = smooth((t - t0) / (t1 - t0));
  w[a] += 1 - k;
  w[b] += k;
  return w;
}

function cardLimit() {
  if (!card.classList.contains("in")) return 18;
  const rect = card.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 20) return 18;
  const center = window.innerWidth / 2;
  if (rect.left > center + gh() * 0.28) return 18;
  return rect.bottom;
}

function measureJumpHeight() {
  const body = gh();
  const idleTop = img.idle.getBoundingClientRect().top;
  const extra = PIRA_NUDGE * body + Math.min(28, body * 0.07);
  const room = idleTop - cardLimit() - 32 - extra;
  const wanted = Math.max(body * 1.08, window.innerHeight * 0.32);
  if (!Number.isFinite(room)) return Math.min(wanted, body);
  return Math.max(44, Math.min(wanted, Math.max(40, room)));
}

function motionAt(t, which) {
  const H = jumpH;
  const dip = Math.max(16, Math.min(36, gh() * 0.08));
  const floatY = Math.min(26, gh() * 0.06);
  let y = 0;
  let sx = 1;
  let sy = 1;
  let rot = 0;
  let x = 0;

  if (t < 280) {
    const k = easeInCubic(t / 280);
    y = lerp(0, dip, k);
    sx = lerp(1, 1.075, k);
    sy = lerp(1, 0.88, k);
  } else if (t < 390) {
    y = dip;
    sx = 1.075;
    sy = 0.88;
  } else if (t < 860) {
    const k = easeOutExpo((t - 390) / 470);
    y = lerp(dip, -H, k);
    const stretch = Math.sin(clamp((t - 390) / 220) * Math.PI);
    sx = lerp(1.075, 1, clamp((t - 390) / 280)) - stretch * 0.06;
    sy = lerp(0.88, 1.02, clamp((t - 390) / 280)) + stretch * 0.12;
  } else if (t < 1740) {
    if (which === "liana") {
      const k = smooth(clamp((t - 980) / 320));
      y = lerp(-H, -H * 0.64, k);
    } else {
      const u = (t - 860) / 880;
      y = -H - Math.sin(u * Math.PI) * floatY;
    }
    sx = 1;
    sy = 1;
  } else if (t < 2140) {
    const k = easeInCubic((t - 1740) / 400);
    const hang = which === "liana" ? -H * 0.64 : -H;
    y = lerp(hang, 18, k);
    const prep = clamp((t - 1980) / 160);
    sx = lerp(1, 0.97, prep);
    sy = lerp(1, 1.06, prep);
  } else if (t < 2260) {
    const k = (t - 2140) / 120;
    y = lerp(18, -10, k);
    sx = lerp(0.97, 1.1, k);
    sy = lerp(1.06, 0.86, k);
  } else if (t < 2480) {
    const k = smooth((t - 2260) / 220);
    y = lerp(-10, 0, k);
    sx = lerp(1.1, 1, k);
    sy = lerp(0.86, 1, k);
  }

  if (which === "pirueta" && t > 980 && t < 2020) {
    const u = (t - 980) / 900;
    rot = Math.sin(clamp(u) * Math.PI) * -8;
    x += Math.sin(clamp(u) * Math.PI) * 26;
  }
  if (which === "liana" && t > 1020 && t < 1760) {
    const u = (t - 1020) / 680;
    const env = Math.sin(clamp(u) * Math.PI);
    rot = Math.sin(u * Math.PI * 2.3) * 7.5 * env;
  }

  const w = poseWeights(t, which);
  y -= (w.pirueta || 0) * PIRA_NUDGE * gh();

  const camY = y * 0.13;
  let camX = x * 0.15;
  if (t > 2140 && t < 2620) {
    const u = (t - 2140) / 480;
    const mag = (1 - u) * 6.5;
    camX += Math.sin(u * 42) * mag;
    return { x, y, sx, sy, rot, camX, camY: camY + Math.cos(u * 36) * mag * 0.5, w };
  }
  return { x, y, sx, sy, rot, camX, camY, w };
}

function pivotFor(which, rot) {
  if (Math.abs(rot) < 0.05) return { x: 0, y: 0 };
  if (which === "liana") {
    const node = img.liana;
    const m = POSE.liana;
    return {
      x: (HAND.x - m.ax) * node.offsetWidth,
      y: (HAND.y - m.ay) * node.offsetHeight
    };
  }
  const node = img.pirueta;
  const m = POSE.pirueta;
  return { x: 0, y: (m.cy - m.ay) * node.offsetHeight };
}

function applyPose(w) {
  for (const name of Object.keys(img)) {
    const o = w[name] || 0;
    const node = img[name];
    node.style.opacity = o < 0.012 ? "0" : o.toFixed(3);
    node.style.visibility = o < 0.012 ? "hidden" : "visible";
  }
}

function applyTransform(x, y, rot, sx, sy, pivot) {
  actor.style.transform =
    `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) ` +
    `translate(${pivot.x.toFixed(2)}px, ${pivot.y.toFixed(2)}px) ` +
    `rotate(${rot.toFixed(3)}deg) ` +
    `translate(${(-pivot.x).toFixed(2)}px, ${(-pivot.y).toFixed(2)}px) ` +
    `scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
}

function applyShadow(y) {
  const lift = Math.max(0, -y);
  const sink = Math.max(0, y);
  const sx = 1 + sink / 80 - Math.min(0.45, lift / 380);
  const sy = Math.max(0.4, 1 - lift / 260);
  const op = Math.max(0.1, 0.5 - lift / 460);
  shadow.style.transform = `scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
  shadow.style.opacity = op.toFixed(3);
}

function applyWorld(camX, camY) {
  world.style.transform = `translate3d(${(camX + parallax.x).toFixed(2)}px, ${(camY + parallax.y).toFixed(2)}px, 0)`;
}

function idlePose() {
  return { idle: 1, cuclillas: 0, salto: 0, pirueta: 0, liana: 0, aterrizaje: 0 };
}

function applyIdle(now) {
  const t = now / 1000;
  const breath = (Math.sin(t * 1.75) + 1) / 2;
  let rot = Math.sin(t * 0.5) * 0.4;
  let x = Math.sin(t * 0.5) * 2.5;
  const cycle = t % 8.5;
  if (cycle > 5.8 && cycle < 7.6) {
    const g = Math.sin(((cycle - 5.8) / 1.8) * Math.PI);
    rot += g * 1.05;
    x += g * 7;
  }
  applyPose(idlePose());
  applyTransform(x, 0, rot, 1 - breath * 0.008, 1 + breath * 0.02, { x: 0, y: 0 });
  applyShadow(0);
  flash.style.opacity = "0";
  vine.style.opacity = "0";
  applyWorld(0, 0);
}

function placeHand() {
  const node = img.liana;
  const m = POSE.liana;
  handPin.style.left = `${(HAND.x - m.ax) * node.offsetWidth}px`;
  handPin.style.top = `${(HAND.y - m.ay) * node.offsetHeight}px`;
}

function updateVine(weight) {
  vine.style.opacity = String(clamp(weight));
  if (weight < 0.03) return;
  placeHand();
  const hr = handPin.getBoundingClientRect();
  const wr = world.getBoundingClientRect();
  const x1 = hr.left - wr.left;
  const y1 = hr.top - wr.top + 26;
  const time = performance.now();
  const topX = x1 - 54 + Math.sin(time / 520) * 10;
  const topY = -30;
  const bend = Math.sin(time / 280) * 34;
  const mx = (topX + x1) / 2 + bend;
  const my = topY + (y1 - topY) * 0.42;
  const d = `M ${topX.toFixed(1)} ${topY} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  const dhl = `M ${(topX + 4).toFixed(1)} ${topY} Q ${(mx + 7).toFixed(1)} ${my.toFixed(1)} ${(x1 + 2).toFixed(1)} ${y1.toFixed(1)}`;
  vineMain.setAttribute("d", d);
  vineMid.setAttribute("d", d);
  vineHl.setAttribute("d", dhl);
}

function applyJump(t) {
  const m = motionAt(t, trick);
  const pivot = pivotFor(trick, m.rot);
  applyPose(m.w);
  applyTransform(m.x, m.y, m.rot, m.sx, m.sy, pivot);
  applyShadow(m.y);
  applyWorld(m.camX, m.camY);
  updateVine(m.w.liana || 0);
  document.body.classList.toggle("hang", (m.w.liana || 0) > 0.45);

  let glow = 0;
  if (t > 390 && t < 560) glow = (1 - (t - 390) / 170) * 0.2;
  else if (t > 2140 && t < 2320) glow = (1 - (t - 2140) / 180) * 0.16;
  flash.style.opacity = glow.toFixed(3);

  if (!fx.whoosh && t >= 390) {
    fx.whoosh = true;
    playWhoosh();
    burst("takeoff");
  }
  if (!fx.card && t >= 1760) {
    fx.card = true;
    revealTweet();
  }
  if (!fx.impact && t >= 2140) {
    fx.impact = true;
    playThud();
    burst("land");
  }
}

function stepParallax(now) {
  const influence = mode === "jump" ? 0.12 : 1;
  const autoX = Math.sin(now / 5400) * 6;
  const autoY = Math.cos(now / 7200) * 3;
  const tx = (pointer.x * 14 + autoX) * influence;
  const ty = (pointer.y * 8 + autoY) * influence;
  parallax.x += (tx - parallax.x) * 0.05;
  parallax.y += (ty - parallax.y) * 0.05;
}

function frame(now) {
  if (reduce.matches) {
    looping = false;
    return;
  }
  const dt = Math.min(0.045, last ? (now - last) / 1000 : 0.016);
  last = now;
  stepParallax(now);
  if (mode === "jump") {
    const t = now - jumpT0;
    if (t >= DURATION) {
      mode = "idle";
      busy = false;
      hit.removeAttribute("aria-busy");
      document.body.classList.remove("hang");
      applyIdle(now);
    } else {
      applyJump(t);
    }
  } else if (mode === "react") {
    const t = now - reactT0;
    if (t >= reactDur) {
      mode = "idle";
      busy = false;
      applyIdle(now);
    } else {
      applyReact(t);
    }
  } else {
    applyIdle(now);
  }
  stepBits(dt);
  drawBits();
  requestAnimationFrame(frame);
}

function startLoop() {
  if (looping || reduce.matches) return;
  looping = true;
  requestAnimationFrame(frame);
}

function jump() {
  if (busy) return;
  busy = true;
  hint.classList.add("gone");
  ensureAudio();
  if (reduce.matches) {
    revealTweet();
    window.setTimeout(() => {
      busy = false;
    }, 420);
    return;
  }
  jumpH = measureJumpHeight();
  trick = trickFlip ? "liana" : "pirueta";
  trickFlip = !trickFlip;
  fx = { whoosh: false, card: false, impact: false };
  jumpT0 = performance.now();
  mode = "jump";
  hit.setAttribute("aria-busy", "true");
  startLoop();
}

function nextReaction() {
  let pick = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
  if (pick === lastReact) pick = REACTIONS[(REACTIONS.indexOf(pick) + 1) % REACTIONS.length];
  lastReact = pick;
  return pick;
}

function reactionLength(name) {
  if (name === "risa") return 1180;
  if (name === "pecho") return 1080;
  if (name === "grunido") return 860;
  return 960;
}

function reactionMotion(name, t) {
  const u = clamp(t / reactDur);
  const env = Math.sin(u * Math.PI);
  let x = 0;
  let y = 0;
  let rot = 0;
  let sx = 1;
  let sy = 1;
  if (name === "grunido") {
    rot = Math.sin(u * Math.PI * 5) * 1.8 * env;
    x = Math.sin(u * Math.PI * 5) * 5 * env;
    y = 7 * Math.sin(Math.min(1, u * 1.3) * Math.PI);
    sy = 1 - env * 0.035;
    sx = 1 + env * 0.02;
  } else if (name === "risa") {
    const bob = Math.abs(Math.sin(u * Math.PI * 4));
    y = -bob * 12 * env;
    sy = 1 + Math.sin(u * Math.PI * 4) * 0.03;
    rot = Math.sin(u * Math.PI * 2) * 2.2;
  } else if (name === "pecho") {
    const beat = Math.max(0, Math.sin(u * Math.PI * 6));
    sy = 1 - beat * 0.07;
    sx = 1 + beat * 0.045;
    y = beat * 7;
    rot = Math.sin(u * Math.PI * 6) * 0.8;
  } else if (name === "saludo") {
    rot = -7 * env;
    x = -10 * env;
    y = -5 * env;
  } else {
    rot = 8 * env;
    x = 7 * env;
    y = 5 * Math.sin(u * Math.PI);
  }
  const poseW = Math.min(smooth(clamp(u / 0.16)), smooth(clamp((1 - u) / 0.22)));
  return { x, y, rot, sx, sy, poseW };
}

function applyReact(t) {
  const motion = reactionMotion(reactName, t);
  const w = {};
  for (const name of Object.keys(img)) w[name] = 0;
  w.idle = 1 - motion.poseW;
  w[reactName] = motion.poseW;
  applyPose(w);
  applyTransform(motion.x, motion.y, motion.rot, motion.sx, motion.sy, { x: 0, y: 0 });
  applyShadow(motion.y);
  applyWorld(motion.x * 0.35, 0);
  vine.style.opacity = "0";
  flash.style.opacity = "0";
}

function showReducedReaction(name) {
  const w = {};
  for (const key of Object.keys(img)) w[key] = key === name ? 1 : 0;
  applyPose(w);
  window.setTimeout(() => {
    const idle = {};
    for (const key of Object.keys(img)) idle[key] = key === "idle" ? 1 : 0;
    applyPose(idle);
    mode = "idle";
    busy = false;
  }, 680);
}

function react() {
  if (busy) return;
  busy = true;
  hint.classList.add("gone");
  ensureAudio();
  reactName = nextReaction();
  reactDur = reactionLength(reactName);
  reactT0 = performance.now();
  mode = "react";
  live.textContent = REACTION_LINE[reactName] || "El gorila reacciona.";
  playReactionSound(reactName);
  if (reduce.matches) {
    showReducedReaction(reactName);
    return;
  }
  startLoop();
}

function pickStoredMute() {
  try {
    muted = localStorage.getItem("gorila-sonido") === "off";
  } catch (err) {
    muted = false;
  }
  muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
  muteBtn.setAttribute("aria-label", muted ? "Activar sonido" : "Silenciar");
}

function toggleMute() {
  muted = !muted;
  muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
  muteBtn.setAttribute("aria-label", muted ? "Activar sonido" : "Silenciar");
  try {
    localStorage.setItem("gorila-sonido", muted ? "off" : "on");
  } catch (err) { /* preferencia local, no es imprescindible */ }
  if (muted && audioCtx) audioCtx.suspend();
  else if (!muted && audioCtx) audioCtx.resume();
}

function ensureAudio() {
  if (muted) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) {
    try { audioCtx = new AC(); } catch (err) { return null; }
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function noiseBuffer(ac, seconds) {
  const length = Math.floor(ac.sampleRate * seconds);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function playWhoosh() {
  const ac = ensureAudio();
  if (!ac) return;
  const now = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.42);
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.7;
  filter.frequency.setValueAtTime(1400, now);
  filter.frequency.exponentialRampToValueAtTime(240, now + 0.4);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.07, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  src.start(now);
  src.stop(now + 0.44);
}

function playThud() {
  const ac = ensureAudio();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(42, now + 0.18);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.16, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.26);

  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.12);
  const low = ac.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 420;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.09, now);
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  src.connect(low);
  low.connect(ng);
  ng.connect(ac.destination);
  src.start(now);
  src.stop(now + 0.13);
}

function tone(ac, start, dur, f0, f1, gainValue, type) {
  const osc = ac.createOscillator();
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(Math.max(30, f0), start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), start + dur);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + Math.min(0.04, dur * 0.35));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function playReactionSound(name) {
  const ac = ensureAudio();
  if (!ac) return;
  const now = ac.currentTime;
  if (name === "grunido") {
    tone(ac, now, 0.34, 98, 52, 0.055, "triangle");
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 0.28);
    const low = ac.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 180;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    src.connect(low);
    low.connect(gain);
    gain.connect(ac.destination);
    src.start(now);
    src.stop(now + 0.3);
    return;
  }
  if (name === "risa") {
    for (let i = 0; i < 4; i += 1) {
      const t0 = now + i * 0.15;
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(ac, 0.08);
      const filter = ac.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 480 + i * 50;
      filter.Q.value = 0.9;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.04, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ac.destination);
      src.start(t0);
      src.stop(t0 + 0.09);
    }
    return;
  }
  if (name === "pecho") {
    for (let i = 0; i < 3; i += 1) tone(ac, now + i * 0.18, 0.09, 150, 58, 0.07, "sine");
    return;
  }
  if (name === "saludo") {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 0.26);
    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(380, now + 0.26);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    src.start(now);
    src.stop(now + 0.28);
    return;
  }
  tone(ac, now, 0.42, 240, 360, 0.028, "sine");
}

function resizeCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function seedMotes() {
  motes.length = 0;
  const n = Math.round(clamp(window.innerWidth / 70, 10, 22));
  for (let i = 0; i < n; i += 1) motes.push(makeMote(true));
}

function makeMote(anywhere) {
  return {
    x: window.innerWidth * (0.35 + Math.random() * 0.62),
    y: anywhere ? Math.random() * window.innerHeight : window.innerHeight * (0.4 + Math.random() * 0.5),
    r: 0.6 + Math.random() * 1.7,
    speed: 7 + Math.random() * 16,
    drift: (Math.random() - 0.5) * 12,
    a: 0.12 + Math.random() * 0.32,
    phase: Math.random() * Math.PI * 2
  };
}

function footPoint() {
  const r = foot.getBoundingClientRect();
  return { x: r.left, y: r.top };
}

function burst(kind) {
  const p = footPoint();
  const land = kind === "land";
  const count = land ? 28 : 12;
  for (let i = 0; i < count; i += 1) {
    const leaf = i % 3 !== 0;
    const ang = land ? Math.random() * Math.PI * 2 : -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
    const speed = land ? 70 + Math.random() * 260 : 40 + Math.random() * 140;
    bits.push({
      x: p.x + (Math.random() - 0.5) * 24,
      y: p.y + (Math.random() - 0.5) * 8,
      vx: Math.cos(ang) * speed * (leaf ? 1 : 0.45),
      vy: Math.sin(ang) * speed * (land ? 0.55 : 1) - (land ? 40 : 20),
      g: leaf ? 520 : 80,
      life: 0,
      max: leaf ? 0.55 + Math.random() * 0.45 : 0.7 + Math.random() * 0.35,
      size: leaf ? 4 + Math.random() * 6 : 10 + Math.random() * 18,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 9,
      color: LEAVES[i % LEAVES.length],
      leaf
    });
  }
  if (land) {
    shock = { x: p.x, y: p.y + 6, t: 0 };
    for (let i = 0; i < 8; i += 1) {
      bits.push({
        x: p.x + (Math.random() - 0.5) * 70,
        y: p.y,
        vx: (Math.random() - 0.5) * 90,
        vy: -16 - Math.random() * 36,
        g: 40,
        life: 0,
        max: 0.9,
        size: 16 + Math.random() * 22,
        rot: 0,
        vr: 0,
        color: "#e6d2a4",
        leaf: false
      });
    }
  }
}

function stepBits(dt) {
  for (const mote of motes) {
    mote.y -= mote.speed * dt;
    mote.x += (mote.drift + Math.sin(performance.now() / 800 + mote.phase) * 6) * dt;
    if (mote.y < -8) {
      mote.y = window.innerHeight + 6;
      mote.x = window.innerWidth * (0.35 + Math.random() * 0.62);
    }
  }
  for (let i = bits.length - 1; i >= 0; i -= 1) {
    const b = bits[i];
    b.life += dt;
    b.vy += b.g * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.vr * dt;
    if (b.life > b.max) bits.splice(i, 1);
  }
  if (shock) {
    shock.t += dt;
    if (shock.t > 0.6) shock = null;
  }
}

function drawLeaf(b, alpha) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.rot);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.moveTo(0, -b.size);
  ctx.quadraticCurveTo(b.size * 0.7, -b.size * 0.15, 0, b.size);
  ctx.quadraticCurveTo(-b.size * 0.7, -b.size * 0.15, 0, -b.size);
  ctx.fill();
  ctx.restore();
}

function drawBits() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  for (const mote of motes) {
    ctx.globalAlpha = mote.a;
    ctx.fillStyle = "#f3e2b8";
    ctx.beginPath();
    ctx.arc(mote.x, mote.y, mote.r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const b of bits) {
    const fade = 1 - b.life / b.max;
    if (b.leaf) drawLeaf(b, Math.max(0, fade));
    else {
      ctx.globalAlpha = Math.max(0, fade) * 0.55;
      ctx.fillStyle = "#e6d2a4";
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.size, b.size * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (shock) {
    const u = shock.t / 0.6;
    ctx.globalAlpha = 0.55 * (1 - u);
    ctx.strokeStyle = "#f0e2c0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(shock.x, shock.y, 16 + u * 170, 5 + u * 26, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && (u.hostname === "x.com" || u.hostname === "twitter.com" || u.hostname === "www.x.com" || u.hostname === "www.twitter.com")) {
      return u.href;
    }
  } catch (err) { /* url ajena */ }
  return "https://x.com/boardinggate";
}

function safeMedia(path) {
  return typeof path === "string" && /^tuits\/[\w.-]+$/.test(path) ? path : "";
}

function trimWords(value, max) {
  if (value.length <= max) return { text: value, cut: false };
  const slice = value.slice(0, max).replace(/\s+\S*$/, "").replace(/[.,;:¡!¿?\-–—]+$/, "");
  return { text: `${slice}…`, cut: true };
}

function fillParas(el, raw, maxParas, maxChars) {
  el.replaceChildren();
  const parts = String(raw || "").split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const shown = parts.slice(0, maxParas);
  const more = parts.length > shown.length;
  if (!shown.length) {
    const p = document.createElement("p");
    p.textContent = "…";
    el.appendChild(p);
    return "";
  }
  let plain = "";
  shown.forEach((part, i) => {
    let value = part;
    let cut = false;
    if (value.length > maxChars) {
      const trimmed = trimWords(value, maxChars);
      value = trimmed.text;
      cut = trimmed.cut;
    }
    if ((more || cut) && i === shown.length - 1 && !value.endsWith("…")) {
      value = value.replace(/[.!?…]*$/, "") + "…";
    }
    const p = document.createElement("p");
    p.textContent = value;
    el.appendChild(p);
    plain += (plain ? " " : "") + value;
  });
  return plain;
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { label: "", title: "" };
  const clock = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
  const title = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
  const diff = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  let rel;
  if (abs < 45) rel = rtf.format(Math.round(diff), "second");
  else if (abs < 2700) rel = rtf.format(Math.round(diff / 60), "minute");
  else if (abs < 36 * 3600) rel = rtf.format(Math.round(diff / 3600), "hour");
  else if (abs < 26 * 86400) rel = rtf.format(Math.round(diff / 86400), "day");
  else {
    rel = new Intl.DateTimeFormat("es-ES", {
      timeZone: "Europe/Madrid",
      day: "numeric",
      month: "short"
    }).format(date);
  }
  return { label: `${rel} · ${clock}`, title };
}

function showTweet(tweet) {
  const compact = window.innerHeight < 780;
  const media = safeMedia(tweet.media);
  const quoted = tweet.quoted && tweet.quoted.text ? tweet.quoted : null;
  const maxParas = media || quoted ? 2 : (compact ? 2 : 3);
  const plain = fillParas(textEl, tweet.text, maxParas, compact ? 150 : 200);
  const when = formatWhen(tweet.created_at);
  whenEl.textContent = when.label;
  whenEl.dateTime = tweet.created_at || "";
  whenEl.title = when.title;

  if (media) {
    mediaEl.hidden = false;
    mediaEl.src = media;
  } else {
    mediaEl.hidden = true;
    mediaEl.removeAttribute("src");
  }

  quoteEl.replaceChildren();
  if (quoted) {
    const who = document.createElement("div");
    const name = document.createElement("b");
    name.textContent = quoted.author || quoted.username || "En X";
    who.appendChild(name);
    if (quoted.username) {
      const user = document.createElement("span");
      user.className = "quser";
      user.textContent = `@${quoted.username}`;
      who.appendChild(user);
    }
    const body = document.createElement("p");
    body.textContent = trimWords(String(quoted.text).replace(/\s+/g, " ").trim(), 150).text;
    quoteEl.append(who, body);
    quoteEl.hidden = false;
  } else {
    quoteEl.hidden = true;
  }

  const href = safeUrl(tweet.url);
  card.href = href;
  card.setAttribute("aria-label", `Tuit de BoardingGate${when.label ? `, ${when.label}` : ""}. ${plain} Abrir en X`);
  card.scrollTop = 0;
  live.textContent = `Tuit de BoardingGate. ${plain}`;

  card.classList.remove("in");
  void card.offsetWidth;
  card.classList.add("in");
}

function revealTweet() {
  if (!tweets.length) {
    pendingCard = true;
    return;
  }
  pendingCard = false;
  const tweet = tweets[cursor % tweets.length];
  cursor += 1;
  showTweet(tweet);
}

function loadTweets() {
  fetch("tweets.json")
    .then((res) => {
      if (!res.ok) throw new Error("feed");
      return res.json();
    })
    .then((data) => {
      tweets = Array.isArray(data.tweets) ? data.tweets : [];
      if (pendingCard) revealTweet();
    })
    .catch(() => {
      tweets = [];
    });
}

let gesture = null;
let keyHold = null;

function beginGesture(event) {
  if (gesture || busy) return;
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    dy: 0,
    jumped: false,
    timer: window.setTimeout(() => {
      if (!gesture || gesture.jumped) return;
      gesture.jumped = true;
      jump();
    }, HOLD_MS)
  };
}

stage.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (event.target.closest(".card, .mute")) return;
  ensureAudio();
  beginGesture(event);
});

window.addEventListener("pointermove", (event) => {
  pointer.x = event.clientX / window.innerWidth - 0.5;
  pointer.y = event.clientY / window.innerHeight - 0.5;
  if (!gesture || event.pointerId !== gesture.id || gesture.jumped) return;
  gesture.dy = event.clientY - gesture.y;
  if (gesture.dy < -FLICK_PX) {
    gesture.jumped = true;
    window.clearTimeout(gesture.timer);
    jump();
  }
});

window.addEventListener("pointerup", (event) => {
  if (!gesture || event.pointerId !== gesture.id) return;
  window.clearTimeout(gesture.timer);
  const done = gesture;
  gesture = null;
  if (done.jumped || busy) return;
  if (done.dy < -FLICK_PX) jump();
  else react();
});

window.addEventListener("pointercancel", (event) => {
  if (!gesture || event.pointerId !== gesture.id) return;
  window.clearTimeout(gesture.timer);
  gesture = null;
});

hit.addEventListener("click", (event) => {
  event.preventDefault();
});

stage.addEventListener("contextmenu", (event) => {
  if (!event.target.closest(".card")) event.preventDefault();
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.key !== " " && event.key !== "Enter") return;
  const current = document.activeElement;
  if (current && current.closest && current.closest(".card, .mute")) return;
  event.preventDefault();
  if (busy || keyHold) return;
  ensureAudio();
  keyHold = {
    jumped: false,
    timer: window.setTimeout(() => {
      if (!keyHold || keyHold.jumped) return;
      keyHold.jumped = true;
      jump();
    }, HOLD_MS)
  };
});

window.addEventListener("keyup", (event) => {
  if (event.key !== " " && event.key !== "Enter") return;
  if (!keyHold) return;
  window.clearTimeout(keyHold.timer);
  const jumped = keyHold.jumped;
  keyHold = null;
  if (!jumped && !busy) react();
});

muteBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleMute();
});

window.addEventListener("resize", () => {
  resizeCanvas();
  placeHand();
  if (motes.length) seedMotes();
});

pickStoredMute();
resizeCanvas();
seedMotes();
placeHand();
loadTweets();
startLoop();
reduce.addEventListener("change", () => {
  if (!reduce.matches) startLoop();
  else {
    applyIdle(performance.now());
    vine.style.opacity = "0";
    document.body.classList.remove("hang");
  }
});
