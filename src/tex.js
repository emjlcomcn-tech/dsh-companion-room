// 程序化贴图：全部用代码生成（颜色 / 法线 / 粗糙度），不依赖任何外部图片
import * as THREE from 'three';

export function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function vnoise(w, h, px, py, seed) {
  px = Math.max(1, Math.min(px, w)); py = Math.max(1, Math.min(py, h));
  const r = mulberry(seed * 7919 + 13), g = new Float32Array(px * py);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / h * py, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), ya = (y0 % py) * px, yb = ((y0 + 1) % py) * px;
    for (let x = 0; x < w; x++) {
      const fx = x / w * px, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), xa = x0 % px, xb = (x0 + 1) % px;
      const a = g[ya + xa], b = g[ya + xb], c = g[yb + xa], d = g[yb + xb];
      out[y * w + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}
export function fbm(w, h, px, py, oct = 4, seed = 1, gain = 0.5) {
  const out = new Float32Array(w * h); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const n = vnoise(w, h, px << o, py << o, seed + o * 17);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    tot += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function bake(w, h, fn) {
  const c = mk(w, h), g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data, o = [0, 0, 0];
  let k = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { fn(x, y, y * w + x, o); d[k++] = o[0] * 255; d[k++] = o[1] * 255; d[k++] = o[2] * 255; d[k++] = 255; }
  g.putImageData(im, 0, 0); return c;
}
function normalCanvas(H, w, h, s) {
  return bake(w, h, (x, y, i, o) => {
    const xl = H[y * w + (x + w - 1) % w], xr = H[y * w + (x + 1) % w], yu = H[((y + h - 1) % h) * w + x], yd = H[((y + 1) % h) * w + x];
    const nx = (xl - xr) * s, ny = (yd - yu) * s, l = Math.hypot(nx, ny, 1);
    o[0] = nx / l * .5 + .5; o[1] = ny / l * .5 + .5; o[2] = 1 / l * .5 + .5;
  });
}
function grayCanvas(R, w, h) { return bake(w, h, (x, y, i, o) => { o[0] = o[1] = o[2] = R[i]; }); }
export function T(c, { srgb = false, rep = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
function set(colorC, H, R, w, h, nStr) {
  return { map: T(colorC, { srgb: true }), normalMap: T(normalCanvas(H, w, h, nStr)), roughnessMap: T(grayCanvas(R, w, h)) };
}
// 同一套贴图换个平铺次数（共享图像，不重复上传）
export function rep(s, rx, ry = rx) {
  const o = {};
  for (const k of Object.keys(s)) { o[k] = s[k].clone(); o[k].repeat.set(rx, ry); o[k].needsUpdate = true; }
  return o;
}
export function rot(s) { for (const k of Object.keys(s)) { s[k].rotation = Math.PI / 2; s[k].center.set(0, 0); } return s; }

// ---- 木头（地板 / 家具）----
export function wood({ tone = [0.56, 0.36, 0.22], rows = 8, seed = 3, size = 1024, gap = 2, vary = 0.22, gloss = 0.34, grainStrength = 1 } = {}) {
  const w = size, h = size, rh = h / rows, r = mulberry(seed);
  const grain = fbm(w, h, 2, 96, 4, seed), fine = fbm(w, h, 8, 256, 2, seed + 5), blot = fbm(w, h, 4, 4, 3, seed + 9);
  const pid = new Int32Array(w * h), edge = new Uint8Array(w * h), planks = [];
  for (let row = 0; row < rows; row++) {
    const cuts = []; let x = Math.floor(r() * w * .4);
    const start = x; cuts.push(x);
    while (true) { x += Math.floor(w * (.32 + r() * .4)); if (x - start > w - w * .2) break; cuts.push(x); }
    for (let k = 0; k < cuts.length; k++) {
      const a = cuts[k], b = k + 1 < cuts.length ? cuts[k + 1] : start + w, id = planks.length;
      planks.push({ t: 1 - vary / 2 + r() * vary, off: Math.floor(r() * w), offy: Math.floor(r() * h), hue: (r() - .5) * .06 });
      for (let xx = a; xx < b; xx++) {
        const X = xx % w;
        for (let yy = Math.floor(row * rh); yy < Math.floor((row + 1) * rh); yy++) {
          pid[yy * w + X] = id;
          if (xx - a < gap || yy - Math.floor(row * rh) < gap) edge[yy * w + X] = 1;
        }
      }
    }
  }
  const H = new Float32Array(w * h), R = new Float32Array(w * h);
  const col = bake(w, h, (x, y, i, o) => {
    const p = planks[pid[i]], gi = ((y + p.offy) % h) * w + (x + p.off) % w;
    let g = grain[gi]; g = g * .6 + (.5 + .5 * Math.sin(g * 26)) * .4;
    const v = (.975 + .55 * grainStrength * (g - .5)) * p.t * (.93 + .14 * blot[i]) * (.96 + .08 * fine[gi]);
    const e = edge[i];
    o[0] = (tone[0] + p.hue) * v * (e ? .35 : 1); o[1] = tone[1] * v * (e ? .35 : 1); o[2] = (tone[2] - p.hue) * v * (e ? .35 : 1);
    H[i] = e ? 0 : .75 + g * .25 * grainStrength; R[i] = e ? .9 : gloss + .22 * fine[gi] + .1 * g;
  });
  return set(col, H, R, w, h, 2.2);
}
// ---- 混凝土 / 灰泥 ----
export function concrete({ tone = [0.36, 0.38, 0.42], seed = 11, size = 512, contrast = .32 } = {}) {
  const w = size, h = size, m = fbm(w, h, 3, 3, 5, seed), sp = fbm(w, h, 96, 96, 2, seed + 3), st = fbm(w, h, 2, 24, 3, seed + 6);
  const H = new Float32Array(w * h), R = new Float32Array(w * h);
  const col = bake(w, h, (x, y, i, o) => {
    const v = (1 - contrast / 2 + contrast * m[i]) * (.95 + .1 * sp[i]) * (.96 + .08 * st[i]);
    o[0] = tone[0] * v; o[1] = tone[1] * v; o[2] = tone[2] * v;
    H[i] = m[i] * .4 + sp[i] * .6; R[i] = .62 + .3 * m[i];
  });
  return set(col, H, R, w, h, 1.4);
}
// ---- 布料（只要法线，颜色交给材质）----
export function weave(size = 128) {
  const w = size, h = size, n = fbm(w, h, 32, 32, 2, 77), H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const thread = n[y * w + x] - .5;
    const a = Math.sin(x / w * Math.PI * 2 * 16 + thread * .4);
    const b = Math.sin(y / h * Math.PI * 2 * 16 - thread * .4);
    H[y * w + x] = .5 + .13 * a * b + .21 * thread;
  }
  return T(normalCanvas(H, w, h, 2.2));
}
export function fuzz(size = 256, seed = 5) { // 地毯 / 毛绒
  const w = size, h = size, n = fbm(w, h, 64, 64, 3, seed);
  return T(normalCanvas(n, w, h, 5));
}

export function waterRipples(size = 128) {
  const h = new Float32Array(size * size);
  const tau = Math.PI * 2;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = i * tau / size, z = j * tau / size;
    h[j * size + i] = .45 * Math.sin(2 * x + z + .86 * Math.sin(2 * z))
      + .31 * Math.cos(x - 3 * z + .7 * Math.cos(x + z))
      + .13 * Math.sin(4 * x + 3 * z) + .07 * Math.cos(7 * x - 5 * z);
  }
  return T(normalCanvas(h, size, size, 1.45));
}
// ---- 瓷砖 ----
export function tiles({ n = 6, a = [0.86, 0.9, 0.91], b = [0.7, 0.8, 0.83], grout = [0.32, 0.35, 0.38], seed = 21, size = 512, brick = false, rough = .14 } = {}) {
  const w = size, h = size, r = mulberry(seed), nx = brick ? n / 2 : n, tw = w / nx, th = h / n, gw = Math.max(2, size / 170);
  const tone = []; for (let i = 0; i < nx * n * 2; i++) tone.push(r());
  const sp = fbm(w, h, 64, 64, 2, seed + 1);
  const H = new Float32Array(w * h), R = new Float32Array(w * h);
  const col = bake(w, h, (x, y, i, o) => {
    const row = Math.floor(y / th), xo = brick && row % 2 ? x + tw / 2 : x, cx = Math.floor(xo / tw) % nx, lx = xo % tw, ly = y % th;
    const d = Math.min(lx, tw - lx, ly, th - ly);
    if (d < gw) { o[0] = grout[0]; o[1] = grout[1]; o[2] = grout[2]; H[i] = 0; R[i] = .85; return; }
    const t = tone[row * nx + cx], v = .94 + .06 * sp[i];
    for (let k = 0; k < 3; k++) o[k] = (a[k] + (b[k] - a[k]) * t) * v;
    H[i] = Math.min(1, .6 + (d - gw) / (gw * 2) * .4); R[i] = rough + .06 * sp[i];
  });
  return set(col, H, R, w, h, 2.5);
}
// ---- 水磨石 / 石英台面 ----
export function terrazzo({ base = [0.8, 0.79, 0.77], seed = 31, size = 512, chips = 900, fleck = 1 } = {}) {
  const c = mk(size, size), g = c.getContext('2d'), r = mulberry(seed);
  g.fillStyle = `rgb(${base.map(v => v * 255 | 0)})`; g.fillRect(0, 0, size, size);
  const pal = ['#5d6470', '#b08d6e', '#e8e2d6', '#3c4048', '#c9b8a4', '#8f99a6'];
  for (let i = 0; i < chips; i++) {
    g.fillStyle = pal[Math.floor(r() * pal.length)]; g.globalAlpha = (.35 + r() * .5) * fleck;
    const x = r() * size, y = r() * size, s = 2 + r() * 7 * fleck; g.beginPath();
    g.moveTo(x, y); for (let k = 0; k < 4; k++) g.lineTo(x + (r() - .3) * s * 2, y + (r() - .3) * s * 2); g.fill();
  }
  g.globalAlpha = 1;
  return { map: T(c, { srgb: true }) };
}
// ---- 深色抛光石材（客厅地面）：大块石板 + 细细的浅色纹理 + 板缝 ----
export function marble({ base = [.1, .105, .12], seed = 41, size = 1024, slabs = 2, veins = 1, rough = .12 } = {}) {
  const w = size, h = size, n = fbm(w, h, 3, 3, 5, seed), n2 = fbm(w, h, 9, 9, 4, seed + 4), sw = w / slabs;
  const H = new Float32Array(w * h), R = new Float32Array(w * h);
  const col = bake(w, h, (x, y, i, o) => {
    const seam = Math.min(x % sw, sw - x % sw, y % sw, sw - y % sw) < 1.5;
    // 纹理：两层噪声做出一条条弯曲的浅色细脉
    const v = Math.abs(Math.sin((x * .004 + y * .007 + n[i] * 5.5) * Math.PI)), vein = veins * (Math.pow(1 - v, 18) * .9 + Math.pow(1 - Math.abs(Math.sin((y * .003 - x * .002 + n2[i] * 4) * Math.PI)), 40) * .5);
    const k = .9 + .2 * n2[i] + vein * 1.6;
    for (let c = 0; c < 3; c++) o[c] = seam ? base[c] * .55 : Math.min(1, base[c] * k + vein * .08);
    H[i] = seam ? 0 : .8; R[i] = seam ? .8 : rough + .08 * n2[i];
  });
  return set(col, H, R, w, h, .6);
}
// ---- 小画布工具 ----
export function draw(w, h, fn, o = {}) { const c = mk(w, h); fn(c.getContext('2d'), w, h); return T(c, { srgb: true, ...o }); }

export function rugTex(seed = 4) {
  return draw(1024, 640, (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = '#2b2f45'; g.fillRect(0, 0, w, h);
    const pal = ['#3b4468', '#6b5aa8', '#c4567f', '#e3a36a', '#2f8f98', '#20233a'];
    for (let i = 0; i < 26; i++) {
      g.fillStyle = pal[Math.floor(r() * pal.length)]; g.globalAlpha = .55 + r() * .4;
      const x = r() * w, y = r() * h, s = 60 + r() * 220; g.beginPath();
      if (r() < .5) g.arc(x, y, s * .5, 0, 7); else { g.moveTo(x, y); g.lineTo(x + s, y + s * (r() - .5)); g.lineTo(x + s * (r() - .2), y + s); g.closePath(); }
      g.fill();
    }
    g.globalAlpha = 1; g.strokeStyle = '#d8c9a8'; g.lineWidth = 10; g.strokeRect(26, 26, w - 52, h - 52);
    g.lineWidth = 3; g.strokeRect(46, 46, w - 92, h - 92);
    for (let i = 0; i < 16000; i++) { g.fillStyle = `rgba(${r() < .5 ? 0 : 255},${r() < .5 ? 0 : 255},${r() < .5 ? 0 : 255},.05)`; g.fillRect(r() * w, r() * h, 2, 3); }
  });
}
export function roundRugTex() {
  return draw(768, 768, (g, w) => {
    const c = w / 2, cols = ['#d9cdb8', '#c9b79c', '#e6dcc8', '#8a93b8', '#e6dcc8', '#c4567f', '#d9cdb8', '#3b4468'];
    for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % cols.length]; g.beginPath(); g.arc(c, c, c - i * 22, 0, 7); g.fill(); }
    const r = mulberry(8); for (let i = 0; i < 14000; i++) { g.fillStyle = `rgba(0,0,0,${r() * .07})`; g.fillRect(r() * w, r() * w, 2, 2); }
  });
}
export function codeScreen(seed = 1, hue = 190) {
  return draw(768, 432, (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = '#0c1222'; g.fillRect(0, 0, w, h); g.fillStyle = '#121a30'; g.fillRect(0, 0, 130, h); g.fillStyle = '#18213c'; g.fillRect(0, 0, w, 26);
    for (let i = 0; i < 4; i++) { g.fillStyle = i === 1 ? '#27345c' : '#1c2644'; g.fillRect(136 + i * 112, 4, 104, 20); }
    for (let y = 40; y < h - 12; y += 15) {
      let x = 150 + Math.floor(r() * 5) * 20; const n = 1 + Math.floor(r() * 5);
      g.fillStyle = '#39456e'; g.fillRect(138, y + 1, 8, 5);
      for (let k = 0; k < n; k++) { const len = 18 + r() * 110; g.fillStyle = [`hsl(${hue},85%,66%)`, '#ffd166', '#dfe6fb', '#ff7ab8', '#7cf2c4', '#9aa7d6'][Math.floor(r() * 6)]; g.fillRect(x, y, len, 6); x += len + 9; if (x > w - 60) break; }
    }
    for (let y = 44; y < h; y += 22) { g.fillStyle = r() < .2 ? '#7cf2c4' : '#3a4670'; g.fillRect(14 + Math.floor(r() * 3) * 10, y, 50 + r() * 50, 5); }
  });
}
export function tvScreen() {
  return draw(960, 540, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1b1650'); gr.addColorStop(.5, '#b9477f'); gr.addColorStop(.72, '#ffac6b'); gr.addColorStop(.73, '#2a3a6a'); gr.addColorStop(1, '#0e1530');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe9b8'; g.beginPath(); g.arc(w * .68, h * .64, 62, Math.PI, 0); g.fill();
    const r = mulberry(12); g.fillStyle = 'rgba(255,220,170,.5)';
    for (let i = 0; i < 60; i++) { const y = h * .735 + r() * h * .25; g.fillRect(w * .68 - 90 * (1 + (y - h * .73) / 60) * r(), y, 30 + r() * 120, 2); }
    g.fillStyle = '#131338'; g.beginPath(); g.moveTo(0, h * .73); for (let x = 0; x <= w; x += 40) g.lineTo(x, h * .73 - 20 - 50 * Math.abs(Math.sin(x * .013)) * (x < w * .5 ? 1 : .35)); g.lineTo(w, h * .73); g.fill();
    g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '600 22px sans-serif'; g.fillText('▶  02:14 / 23:40', 28, h - 26);
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(28, h - 16, w - 56, 4); g.fillStyle = '#ff6fb5'; g.fillRect(28, h - 16, (w - 56) * .09, 4);
  });
}
export function artTex(seed, pal) {
  return draw(512, 640, (g, w, h) => {
    const r = mulberry(seed); g.fillStyle = pal[0]; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = pal[1 + Math.floor(r() * (pal.length - 1))]; g.globalAlpha = .75;
      const x = r() * w, y = r() * h, s = 80 + r() * 260; g.beginPath();
      const k = r(); if (k < .4) g.arc(x, y, s * .45, 0, 7); else if (k < .7) g.rect(x - s / 2, y - s / 4, s, s / 2); else { g.moveTo(x, y - s / 2); g.lineTo(x + s / 2, y + s / 2); g.lineTo(x - s / 2, y + s / 2); }
      g.fill();
    }
    g.globalAlpha = 1; for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(255,255,255,${r() * .05})`; g.fillRect(r() * w, r() * h, 2, 2); }
  });
}
export function neonText(text, color, { w = 512, h = 256, fs = 180, font = '"Noto Sans CJK SC","Microsoft YaHei","PingFang SC",sans-serif', weight = 500 } = {}) {
  return draw(w, h, (g) => {
    g.font = `${weight} ${fs}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.shadowColor = color; g.shadowBlur = 36; g.strokeStyle = color; g.lineWidth = 9; g.strokeText(text, w / 2, h / 2); g.strokeText(text, w / 2, h / 2);
    g.shadowBlur = 0; g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeText(text, w / 2, h / 2);
  });
}
// 最远处的一层天际线：一排高低错落的楼影 + 星星点点的窗灯，底下一层城市雾光（夜：紫蓝；昼：淡蓝灰）
export function skylineTex(mode, seed = 5) {
  return draw(2048, 512, (g, w, h) => {
    const r = mulberry(seed), night = mode !== 'day';
    const sky = g.createLinearGradient(0, 0, 0, h);
    if (night) { sky.addColorStop(0, 'rgba(0,0,0,0)'); sky.addColorStop(.55, 'rgba(60,30,110,.25)'); sky.addColorStop(1, 'rgba(255,90,170,.45)'); }
    else { sky.addColorStop(0, 'rgba(0,0,0,0)'); sky.addColorStop(.6, 'rgba(190,210,235,.2)'); sky.addColorStop(1, 'rgba(225,232,240,.6)'); }
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    let x = 0;
    while (x < w) {
      const bw = 18 + r() * 70, bh = h * (.18 + Math.pow(r(), 1.6) * .75);
      g.fillStyle = night ? `rgb(${10 + r() * 12 | 0},${10 + r() * 10 | 0},${28 + r() * 20 | 0})` : `rgb(${150 + r() * 25 | 0},${165 + r() * 25 | 0},${190 + r() * 20 | 0})`;
      g.fillRect(x, h - bh, bw, bh);
      if (r() < .25) g.fillRect(x + bw * .45, h - bh - 18 - r() * 30, 2, 40);
      if (night) for (let yy = h - bh + 6; yy < h - 4; yy += 7) for (let xx = x + 3; xx < x + bw - 3; xx += 5) if (r() < .32) { g.fillStyle = ['#ffd9a0', '#9fd8ff', '#ffb0d8', '#fff2d6'][Math.floor(r() * 4)]; g.globalAlpha = .35 + r() * .6; g.fillRect(xx, yy, 2, 3); g.globalAlpha = 1; }
      x += bw + r() * 6;
    }
  });
}
export function cityWindows(seed, lit, cladding = null) {
  const cols = 24, rows = 48;
  return draw(cols * 10, rows * 14, (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = cladding || '#000'; g.fillRect(0, 0, w, h);
    const pal = ['#ffd9a0', '#ffe9c4', '#ffcf8a', '#9fd8ff', '#fff2d6', '#ffb0d8', '#c9e4ff'];
    for (let j = 0; j < rows; j++) {
      const floorLit = r() < .12;
      for (let i = 0; i < cols; i++) {
        if (cladding) {
          g.fillStyle = j % 8 === 0 ? '#242e38' : '#314555';
          g.globalAlpha = .36 + r() * .31;
          g.fillRect(i * 10 + 2, j * 14 + 2, 7, 9);
          g.fillStyle = '#e1e8ed';
          g.globalAlpha = .09 + r() * .19;
          g.fillRect(i * 10 + 2, j * 14 + 2, 7, 2 + r() * 3);
        } else if (r() < (floorLit ? .8 : lit)) {
          g.fillStyle = pal[Math.floor(r() * pal.length)]; g.globalAlpha = .24 + r() * .65;
          g.fillRect(i * 10 + 2, j * 14 + 3, 6, 8);
        }
      }
    }
  });
}
export function envEquirect(mode) {
  return draw(1024, 512, (g, w, h) => {
    const r = mulberry(99), gr = g.createLinearGradient(0, 0, 0, h);
    if (mode === 'day') { gr.addColorStop(0, '#3f7fd6'); gr.addColorStop(.3, '#7fb3ee'); gr.addColorStop(.47, '#e8f1fb'); gr.addColorStop(.5, '#f3e6d2'); gr.addColorStop(.6, '#a08468'); gr.addColorStop(1, '#4a3a2e'); }
    else { gr.addColorStop(0, '#04050c'); gr.addColorStop(.38, '#141033'); gr.addColorStop(.5, '#5a2463'); gr.addColorStop(.56, '#1a1226'); gr.addColorStop(1, '#0a0808'); }
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (mode !== 'day') for (let i = 0; i < 260; i++) {
      g.fillStyle = ['#ffb36b', '#2de2ff', '#ff3d9a', '#ffe9c4', '#8a5cff'][Math.floor(r() * 5)]; g.globalAlpha = .25 + r() * .6;
      const s = 3 + r() * 16; g.fillRect(r() * w, h * (.36 + r() * .2), s, s * (.6 + r() * 2));
    }
    else {
      // 太阳在西北偏低（和主光同方向），周围一圈暖色光晕
      const sx = w * .82, sy = h * .3, sg = g.createRadialGradient(sx, sy, 0, sx, sy, 220);
      sg.addColorStop(0, 'rgba(255,248,225,1)'); sg.addColorStop(.12, 'rgba(255,226,170,.85)'); sg.addColorStop(1, 'rgba(255,200,140,0)');
      g.fillStyle = sg; g.fillRect(0, 0, w, h * .5);
      for (let i = 0; i < 40; i++) { const x = r() * w, y = h * (.12 + r() * .3), s = 30 + r() * 90; g.globalAlpha = .25 + r() * .35; g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x, y, s, s * .35, 0, 0, 7); g.fill(); }
    }
  });
}
// 背景天空：白天蓝天 + 一层层积云，夜里深紫渐变
export function skyTex(mode) {
  return draw(1024, 1024, (g, w, h) => {
    const r = mulberry(mode === 'day' ? 7 : 8), gr = g.createLinearGradient(0, 0, 0, h);
    if (mode !== 'day') { [[0, '#03040a'], [.5, '#0d0b24'], [.8, '#2a1444'], [1, '#3d1a4a']].forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, w, h); return; }
    [[0, '#2f6fd0'], [.45, '#6fa6ea'], [.78, '#b7d6f5'], [1, '#f4e9da']].forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // 积云：一团团软圆叠出来，底部压一点蓝灰阴影，顶部提亮
    const cloud = (cx, cy, sc) => {
      const blobs = []; for (let i = 0; i < 18; i++) blobs.push([cx + (r() - .5) * 260 * sc, cy - Math.abs(r() - .5) * 70 * sc, (30 + r() * 55) * sc]);
      for (const [x, y, s] of blobs) { const c = g.createRadialGradient(x, y + s * .35, 0, x, y + s * .35, s); c.addColorStop(0, 'rgba(150,175,215,.55)'); c.addColorStop(1, 'rgba(150,175,215,0)'); g.fillStyle = c; g.fillRect(x - s, y - s, s * 2, s * 2.4); }
      for (const [x, y, s] of blobs) { const c = g.createRadialGradient(x, y - s * .15, 0, x, y, s); c.addColorStop(0, 'rgba(255,255,255,.95)'); c.addColorStop(.6, 'rgba(250,252,255,.6)'); c.addColorStop(1, 'rgba(240,246,255,0)'); g.fillStyle = c; g.fillRect(x - s, y - s, s * 2, s * 2); }
    };
    for (let i = 0; i < 9; i++) cloud(r() * w, h * (.42 + r() * .42), .45 + r() * .7);
  });
}
export function rainStreaks(seed = 3) {
  const c = mk(256, 512), g = c.getContext('2d'), r = mulberry(seed);
  for (let i = 0; i < 150; i++) {
    const x = r() * 256, y = r() * 512, l = 20 + r() * 110; const gr = g.createLinearGradient(0, y, 0, y + l);
    gr.addColorStop(0, 'rgba(200,225,255,0)'); gr.addColorStop(.85, `rgba(200,225,255,${.12 + r() * .25})`); gr.addColorStop(1, 'rgba(255,255,255,.75)');
    g.fillStyle = gr; g.fillRect(x, y, 1.6, l); if (y + l > 512) g.fillRect(x, y - 512, 1.6, l);
    g.fillStyle = 'rgba(230,240,255,.5)'; g.beginPath(); g.arc(r() * 256, r() * 512, .8 + r() * 1.6, 0, 7); g.fill();
  }
  return T(c, { srgb: true });
}
