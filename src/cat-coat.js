import * as THREE from 'three';

export function paintedTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function taperedMark(ctx, curve, width, strength = 1) {
  const sides = [[], []];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48, p = curve(t);
    const a = curve(Math.max(0, t - .005)), b = curve(Math.min(1, t + .005));
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const r = width * .5 * Math.sin(Math.PI * t) ** .62 / (Math.hypot(dx, dy) || 1);
    sides[0].push([p[0] - dy * r, p[1] + dx * r]);
    sides[1].push([p[0] + dy * r, p[1] - dx * r]);
  }
  const edge = sides[0].concat(sides[1].reverse());
  ctx.beginPath();
  ctx.moveTo(...edge[0]);
  for (const p of edge.slice(1)) ctx.lineTo(...p);
  ctx.closePath();
  ctx.fillStyle = '#65656a';
  ctx.globalAlpha = strength * .38;
  ctx.strokeStyle = '#818085';
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.globalAlpha = strength;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function glaze(ctx, x, y, rx, ry, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, color);
  gradient.addColorStop(.6, color);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

function pencilGrain(ctx, w, h) {
  let seed = 197;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < w * h / 22; i++) {
    const x = next() * w, y = next() * h;
    ctx.fillStyle = next() < .63 ? 'rgba(255,255,255,.14)' : 'rgba(54,49,49,.067)';
    ctx.fillRect(x, y, 2 + next() * 4, .6 + next());
  }
}

export function silverBody() {
  return paintedTexture(1024, 1024, (g, w, h) => {
    const base = g.createLinearGradient(0, 0, w, 0);
    for (const [x, color] of [[0, '#a5a5ab'], [.14, '#c4c4c9'], [.34, '#e2e0e0'], [.5, '#f7f4f0'], [.66, '#e2e0e0'], [.86, '#c4c4c9'], [1, '#a5a5ab']]) base.addColorStop(x, color);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (const side of [0, 1]) {
      const x = u => w * (side ? 1 - u : u);
      // 侧腹保留松散的弧纹，肩背和腿上的纹路像几笔软铅笔。
      for (const [radius, width, start] of [[1, 33, -.95], [.71, 25, -1.13]]) {
        taperedMark(g, t => {
          const a = start + t * Math.PI * 1.4;
          const bend = radius * (.94 + .08 * Math.sin(a * 3 + side));
          return [x(.235 + Math.cos(a) * .119 * bend), h * (.55 + Math.sin(a) * .216 * bend)];
        }, width, .79);
      }
      for (const [y, drift, width] of [[.13, .055, 25], [.22, .10, 29], [.30, .09, 22], [.82, -.12, 28], [.91, -.085, 24]]) {
        taperedMark(g, t => [x(.02 + .35 * t), h * (y + drift * t + .036 * Math.sin(t * 6 + y * 9 + side))], width, .78);
      }
    }
    for (const offset of [0, w]) taperedMark(g, t => [offset + 5 * Math.sin(t * 12), h * t], 34, .83);
    pencilGrain(g, w, h);
  });
}

export function silverFace() {
  return paintedTexture(1024, 512, (g, w, h) => {
    const middle = w * .25;
    const base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#a5a5ac');
    base.addColorStop(.49, '#d3d2d4');
    base.addColorStop(1, '#e7e4e3');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    glaze(g, middle, h * .72, w * .19, h * .37, 'rgba(251,246,234,1)');
    for (const side of [-1, 1]) {
      glaze(g, middle + side * w * .055, h * .498, w * .055, h * .12, 'rgba(245,242,235,.68)');
      for (const [from, to, y, end, width] of [[.020,.037,.36,.04,31],[.062,.113,.365,.12,25],[.111,.176,.38,.18,18]]) {
        taperedMark(g, t => [middle + side * w * (from + (to - from) * t + .013 * Math.sin(Math.PI * t)), h * (y + (end - y) * t - .042 * Math.sin(Math.PI * t))], width, .87);
      }
      for (const [x, y, width] of [[.128, .482, 23], [.129, .554, 27], [.151, .616, 12]]) {
        taperedMark(g, t => [middle + side * w * (x + .153 * t), h * (y + .039 * Math.sin(t * 2.45) - .088 * t)], width, .79);
      }
      glaze(g, middle + side * w * .125, h * .617, w * .028, h * .048, 'rgba(225,157,143,.31)');
    }
    for (let i = 0; i < 8; i++) {
      taperedMark(g, t => [w * (.54 + i * .057 + .015 * Math.sin(t * 5 + i)), h * (.12 + .60 * t)], 14, .73);
    }
    pencilGrain(g, w, h);
  });
}

export function silverRings(tail) {
  return paintedTexture(256, 512, (g, w, h) => {
    g.fillStyle = '#cccbd0';
    g.fillRect(0, 0, w, h);
    const rings = tail ? [.19, .32, .46, .61, .74, .87] : [.35, .52, .70, .87];
    for (let i = 0; i < rings.length; i++) {
      const y = rings[i] * h, thickness = (tail ? 28 : 20) + 4 * Math.sin(i * 2);
      const top = x => y + 5 * Math.sin(x / w * Math.PI * 2 + i) + 2 * Math.cos(x / w * Math.PI * 4);
      g.beginPath();
      g.moveTo(0, top(0));
      for (let x = 0; x <= w; x += 4) g.lineTo(x, top(x));
      for (let x = w; x >= 0; x -= 4) g.lineTo(x, top(x) + thickness + 3 * Math.cos(x / w * Math.PI * 2));
      g.closePath();
      g.fillStyle = '#77777e';
      g.fill();
    }
    const end = g.createLinearGradient(0, 0, 0, h * (tail ? .17 : .40));
    const tip = tail ? '#6a6970' : '#f5f2ef';
    end.addColorStop(0, tip);
    end.addColorStop(.69, tip);
    end.addColorStop(1, 'rgba(215,218,224,0)');
    g.fillStyle = end;
    g.fillRect(0, 0, w, h);
    pencilGrain(g, w, h);
  });
}

export function buttonEye(closed) {
  return paintedTexture(256, 256, (g, w) => {
    const c = w / 2;
    if (closed) {
      g.strokeStyle = '#49434c';
      g.lineWidth = 10;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(18, 113);
      g.quadraticCurveTo(c, 181, 236, 110);
      g.stroke();
      return;
    }
    const dark = g.createLinearGradient(0, 40, 0, 230);
    dark.addColorStop(0, '#222124');
    dark.addColorStop(1, '#3a3739');
    for (const [x, y, rx, ry, color] of [[c,c,115,114,'#473d34'], [c,c,108,107,'#e4c88f'], [c,c,99,101,dark], [96,77,26,22,'#fffdf9'], [166,170,8,7,'#d0c8c8']]) {
      g.fillStyle = color;
      g.beginPath();
      g.ellipse(x, y, rx, ry, -.25, 0, Math.PI * 2);
      g.fill();
    }
  });
}
