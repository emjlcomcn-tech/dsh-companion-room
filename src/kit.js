// 建模小工具 + 角色立牌
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry } from './tex.js';

const V3 = (p) => new THREE.Vector3(p[0], p[1], p[2]);

export class Kit {
  constructor(scene) { this.scene = scene; this.parent = scene; this.glows = []; this.lights = []; this.tickers = []; this.mode = 'night'; }
  mesh(geo, mat, x = 0, y = 0, z = 0, o = {}) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    if (o.scale) m.scale.set(o.scale[0], o.scale[1], o.scale[2]);
    const tr = Array.isArray(mat) ? mat.some((material) => material.transparent) : !!mat.transparent;
    m.castShadow = o.cast ?? !tr; m.receiveShadow = o.recv ?? !tr;
    if (tr || o.noAO) m.userData.noAO = true;
    if (o.noNav) m.userData.noNav = true;
    if (o.order != null) m.renderOrder = o.order;
    (o.parent || this.parent).add(m); return m;
  }
  // 以最小角 (x,y,z) + 尺寸 (w,h,d) 放一个盒子；r>0 时带圆角
  box(x, y, z, w, h, d, mat, o = {}) {
    const r = o.r ?? 0;
    const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, o.seg ?? 3, Math.max(1e-3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3))) : new THREE.BoxGeometry(w, h, d);
    return this.mesh(geo, mat, x + w / 2, y + h / 2, z + d / 2, o);
  }
  glassPane(from, to, bottom, top, center, material, { alongZ = false } = {}) {
    const middle = (from + to) / 2;
    const pane = this.mesh(new THREE.PlaneGeometry(to - from, top - bottom), material,
      alongZ ? center : middle, (bottom + top) / 2, alongZ ? middle : center,
      { rot: [0, alongZ ? Math.PI / 2 : 0, 0], cast: false, recv: false });
    pane.name = 'glass pane';
    return pane;
  }
  cyl(x, y, z, rt, rb, h, mat, o = {}) { return this.mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 32, 1, o.open ?? false), mat, x, y + h / 2, z, o); }
  sph(x, y, z, r, mat, o = {}) { return this.mesh(new THREE.SphereGeometry(r, o.seg ?? 28, o.seg2 ?? 18), mat, x, y, z, o); }
  torus(x, y, z, R, r, mat, o = {}) { return this.mesh(new THREE.TorusGeometry(R, r, 12, o.seg ?? 48, o.arc ?? Math.PI * 2), mat, x, y, z, o); }
  tube(pts, r, mat, o = {}) {
    const c = new THREE.CatmullRomCurve3(pts.map(V3), o.closed ?? false, 'catmullrom', o.tension ?? 0.5);
    return this.mesh(new THREE.TubeGeometry(c, o.seg ?? 48, r, o.rs ?? 8, o.closed ?? false), mat, 0, 0, 0, o);
  }
  lathe(x, y, z, profile, mat, o = {}) { return this.mesh(new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), o.seg ?? 36), mat, x, y, z, o); }
  group(x = 0, y = 0, z = 0, ry = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; this.parent.add(g); return g; }
  in(g, fn) { const p = this.parent; this.parent = g; try { fn(); } finally { this.parent = p; } return g; }
  // 软垫：鼓起来的圆角盒
  cushion(x, y, z, w, h, d, mat, o = {}) {
    const g = new RoundedBoxGeometry(w, h, d, 8, Math.min(h * .48, w * .22, d * .22)), p = g.attributes.position, r = mulberry(o.seed ?? 1), ph = [r() * 6, r() * 6];
    const puff = o.puff ?? .5;
    for (let i = 0; i < p.count; i++) {
      const X = p.getX(i), Z = p.getZ(i); let Y = p.getY(i);
      const nx = X / (w / 2), nz = Z / (d / 2), b = (1 - nx * nx) * (1 - nz * nz);
      Y += Math.sign(Y) * h * puff * .5 * b + Math.sin(X * 11 + ph[0]) * Math.sin(Z * 9 + ph[1]) * h * .03;
      p.setY(i, Y);
    }
    return this.mesh(g, mat, x + w / 2, y + h / 2, z + d / 2, o);
  }
  // 盖在床上的被子：四周自然垂下，带褶皱；mound = 腿把被子顶起来的鼓包
  duvet(x0, z0, w, d, y, mat, { hw = .1, he = .34, hf = .34, mound = null } = {}) {
    const g = new THREE.PlaneGeometry(1, 1, 60, 76), p = g.attributes.position;
    const fold = (e) => { const r = .08, q = r * Math.PI / 2; if (e < q) { const a = e / r; return [r * Math.sin(a), r * (1 - Math.cos(a))]; } return [r + (e - q) * .07, r + (e - q)]; };
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + .5, v = .5 - p.getY(i), s = -hw + u * (w + hw + he), sz = v * (d + hf);
      let X, Y = y, Z;
      if (s < 0) { const f = fold(-s); X = x0 - f[0]; Y -= f[1]; } else if (s > w) { const f = fold(s - w); X = x0 + w + f[0]; Y -= f[1]; } else X = x0 + s;
      if (sz > d) { const f = fold(sz - d); Z = z0 + d + f[0]; Y -= f[1]; } else Z = z0 + sz;
      const inside = s >= 0 && s <= w && sz <= d;
      const wr = Math.sin(s * 7 + sz * 3 + 1) * .013 + Math.sin(s * 3 - sz * 9 + 2) * .012 + Math.sin((s + sz) * 15) * .005 + Math.sin(s * 21 - sz * 2) * .003;
      if (inside) Y += .045 * Math.sin(Math.PI * Math.min(1, Math.max(0, s / w))) + wr + .035 * Math.exp(-sz * 9);
      else { X += wr * 1.2; Z += wr * .8; }
      if (mound) Y += mound.h * Math.exp(-(((s - mound.x) / mound.sx) ** 2 + ((sz - mound.z) / mound.sz) ** 2)) * (inside ? 1 : .2);
      p.setXYZ(i, X, Y, Z);
    }
    g.computeVertexNormals();
    const m = this.mesh(g, mat, 0, 0, 0); return m;
  }
  // 一片叶子：尖头、中脉微折、往下弯
  leafGeo(len, wid, curl = .35) {
    const g = new THREE.PlaneGeometry(1, 1, 6, 10), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) * 2, v = p.getY(i) + .5;
      const prof = Math.pow(Math.sin(Math.PI * Math.min(1, v * .92 + .04)), .7);
      p.setXYZ(i, u * wid * .5 * prof, v * len, -curl * len * v * v + Math.abs(u) * wid * .18 * prof);
    }
    g.computeVertexNormals(); return g;
  }
  plant(x, y, z, { pot = .2, potH = .34, n = 9, h = .9, leaf = [.34, .2], potMat, leafMats, stemMat, spread = .55, seed = 1 }) {
    const r = mulberry(seed);
    this.lathe(x, y, z, [[0, 0], [pot * .72, 0], [pot * .78, .02], [pot, potH], [pot * .93, potH], [pot * .9, potH - .03], [0, potH - .03]], potMat);
    this.cyl(x, y + potH - .05, z, pot * .9, pot * .9, .02, stemMat, { cast: false });
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + r() * .8, hh = h * (.45 + r() * .55), out = spread * (.35 + r() * .65);
      const tip = [x + Math.cos(a) * out, y + potH + hh, z + Math.sin(a) * out];
      this.tube([[x + Math.cos(a) * .03, y + potH - .04, z + Math.sin(a) * .03], [x + Math.cos(a) * out * .35, y + potH + hh * .6, z + Math.sin(a) * out * .35], tip], .012, stemMat, { seg: 10, rs: 5 });
      const L = leaf[0] * (.7 + r() * .6), Wd = leaf[1] * (.7 + r() * .6);
      const m = this.mesh(this.leafGeo(L, Wd, .3 + r() * .3), leafMats[Math.floor(r() * leafMats.length)], tip[0], tip[1], tip[2]);
      m.rotation.order = 'YXZ'; m.rotation.y = -a + Math.PI / 2; m.rotation.x = .9 + r() * .5;
    }
  }
  // 发光材质 / 灯：登记起来，昼夜切换时统一改亮度
  glow(color, night, day = night * .12, base = 0x000000) {
    const m = new THREE.MeshStandardMaterial({ color: base, emissive: color, emissiveIntensity: night, roughness: .4 });
    m.userData.I = { night, day }; this.glows.push(m); return m;
  }
  light(l, night, day = 0) { l.userData.I = { night, day }; l.intensity = night; this.lights.push(l); this.scene.add(l); if (l.target) this.scene.add(l.target); return l; }
  point(color, night, dist, pos, { day = 0, shadow = false } = {}) {
    const l = new THREE.PointLight(color, night, dist, 2); l.position.set(pos[0], pos[1], pos[2]);
    if (shadow) { l.castShadow = true; l.shadow.mapSize.set(shadow, shadow); l.shadow.bias = -0.003; l.shadow.normalBias = .02; l.shadow.radius = 5; l.shadow.camera.near = .08; }
    return this.light(l, night, day);
  }
  spot(color, night, dist, pos, to, angle, { day = 0, shadow = false, pen = .7 } = {}) {
    const l = new THREE.SpotLight(color, night, dist, angle, pen, 2); l.position.set(pos[0], pos[1], pos[2]); l.target.position.set(to[0], to[1], to[2]);
    if (shadow) { l.castShadow = true; l.shadow.mapSize.set(shadow, shadow); l.shadow.bias = -0.0015; l.shadow.normalBias = .02; l.shadow.radius = 6; l.shadow.camera.near = .1; }
    return this.light(l, night, day);
  }
  rect(color, night, w, h, pos, look, { day = 0 } = {}) {
    const l = new THREE.RectAreaLight(color, night, w, h); l.position.set(pos[0], pos[1], pos[2]); l.lookAt(look[0], look[1], look[2]); return this.light(l, night, day);
  }
  setMode(mode) {
    this.mode = mode;
    for (const m of this.glows) m.emissiveIntensity = m.userData.I[mode];
    for (const f of this.onMode || []) f(mode);
    for (const l of this.lights) { l.intensity = l.userData.I[mode]; if (l.shadow && l.userData.sh == null) l.userData.sh = l.castShadow; if (l.shadow) l.castShadow = l.userData.sh && l.intensity > 0; }
  }
  tick(dt, t) { for (const f of this.tickers) f(dt, t); }
}

// 角色：动作包里的逐帧图，做成一张始终朝向镜头的立牌，能投影子
export class Char {
  constructor(scene, base = './anim/') {
    this.scene = scene; this.base = base; this.meta = null; this.tex = {}; this.name = null; this.frame = 0; this.acc = 0; this.flip = false; this.H = 1.5; this.token = 0; this.lru = []; this.want = null; this.loopFrom = { '原地小憩沉眠': 40 };
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: .35, side: THREE.DoubleSide });
    this.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: .35 });
    this.dist = new THREE.MeshDistanceMaterial({ alphaTest: .35 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.customDepthMaterial = this.depth; this.mesh.customDistanceMaterial = this.dist;
    this.mesh.castShadow = true; this.mesh.userData.noAO = true; this.mesh.visible = false; this.mesh.renderOrder = 5;
    this.root = new THREE.Group(); this.root.add(this.mesh); scene.add(this.root);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(.3, 32), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .38, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = .012; sh.scale.set(1, .62, 1); sh.userData.noAO = true; this.blob = sh; this.root.add(sh);
  }
  async load() { this.meta = await (await fetch(this.base + 'anim.json')).json(); return this; }
  async play(name, frame = null) {
    const a = this.meta.anims[name]; if (!a) return;
    if (this.want === name && frame == null) return;
    this.want = name; const token = ++this.token;
    if (!this.tex[a.file]) {
      const t = await new THREE.TextureLoader().loadAsync(this.base + a.file);
      t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
      this.tex[a.file] = t;
    }
    if (token !== this.token) return;
    // 只留最近用过的几张大图，别把显存占满
    this.lru = [a.file, ...this.lru.filter((f) => f !== a.file)];
    while (this.lru.length > 4) { const f = this.lru.pop(); if (this.tex[f]) { this.tex[f].dispose(); delete this.tex[f]; } }
    this.name = name; this.a = a; this.frame = frame ?? (a.loop ? a.loop[0] : 0); this.acc = 0; this.hold = frame != null;
    const t = this.tex[a.file]; this.mat.map = this.depth.map = this.dist.map = t; this.mat.needsUpdate = this.depth.needsUpdate = this.dist.needsUpdate = true;
    const k = this.H / this.meta.charHeight, s = 1 / a.scale, [ax, ay] = this.meta.anchor;
    const Wp = a.fw * s * k, Hp = a.fh * s * k;
    this.mesh.scale.set(Wp, Hp, 1);
    this.off = [(a.fw * s / 2 - (ax - a.ox)) * k, (ay - a.oy) * k - Hp / 2];
    this.mesh.visible = true; this.apply();
  }
  apply() {
    const a = this.a, t = this.mat.map; if (!a || !t) return;
    const c = this.frame % a.cols, r = Math.floor(this.frame / a.cols);
    t.repeat.set(1 / a.cols, 1 / a.rows); t.offset.set(c / a.cols, 1 - (r + 1) / a.rows);
    const f = (this.flip ? -1 : 1) * (a.facing === 'right' ? -1 : 1);
    this.mesh.scale.x = Math.abs(this.mesh.scale.x) * f; this.mesh.position.set(this.off[0] * f, this.off[1], 0);
  }
  setPos(x, y, z) { this.root.position.set(x, y, z); }
  // 让立牌跟着身边的灯变色：暖灯旁偏暖、霓虹下染色、暗处变暗
  relight(dt, K) {
    const night = K.mode === 'night', c = this._c || (this._c = new THREE.Color()), p = this._p || (this._p = new THREE.Vector3()), q = this._q || (this._q = new THREE.Vector3());
    if (night) c.setRGB(.5, .52, .64); else c.setRGB(.98, .98, .98);
    p.copy(this.root.position); p.y += this.H * .5;
    if (night) for (const l of K.lights) {
      if (!(l.isPointLight || l.isSpotLight) || l.intensity <= 0) continue;
      const d = l.position.distanceTo(p); if (l.distance && d > l.distance) continue;
      let w = l.intensity / (d * d + .35) * .11; if (l.distance) w *= Math.max(0, 1 - (d / l.distance) ** 2);
      if (l.isSpotLight) { q.copy(l.target.position).sub(l.position).normalize(); const cs = q.dot(p.clone().sub(l.position).normalize()); w *= THREE.MathUtils.smoothstep(cs, Math.cos(l.angle), Math.cos(l.angle * (1 - l.penumbra))); }
      c.r += l.color.r * w; c.g += l.color.g * w; c.b += l.color.b * w;
    }
    const m = Math.max(c.r, c.g, c.b); if (m > 1.12) c.multiplyScalar(1.12 / m);
    if (this._lit) this.mat.color.lerp(c, Math.min(1, dt * 4)); else { this.mat.color.copy(c); this._lit = true; }
  }
  tick(dt, camera, K) {
    if (K) this.relight(dt, K);
    this.root.rotation.y = Math.atan2(camera.position.x - this.root.position.x, camera.position.z - this.root.position.z);
    if (!this.a || this.hold) return;
    this.acc += dt * this.a.fps;
    const end = this.a.loop ? this.a.loop[1] : this.a.frames - 1;
    while (this.acc >= 1) { this.acc -= 1; this.frame++; if (this.frame > end) { this.frame = this.a.loop ? this.a.loop[0] : (this.loopFrom[this.name] || 0); if (this.onCycle && this.onCycle(this.name) === true) break; } }
    this.apply();
  }
}
