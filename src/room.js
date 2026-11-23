// 小屋本体：墙、窗、夹层、楼梯和所有家具。坐标沿用 life.js 的 LAYOUT（x 向右、z 即 LAYOUT 的 y、y 向上）
import * as THREE from 'three';
import * as TX from './tex.js';
import { buildTerrace, TERRACE } from './terrace.js';

export const W = 15.6, D = 10, WH = 5.65, LY = 2.6, T = 0.25;
export const LOFT = { x: 6, z: 4.58, end: 6.72 };
export const STAIR = { x: 14.14, width: 1.04, start: 1.47, end: LOFT.z, steps: 14 };
export const DESK_CHAIR = { x: 3.98, z: 1.51 };
const PINK = 0xff3d9a, CYAN = 0x2de2ff, VIOLET = 0x8a5cff, RED = 0xff2a3d, WARM = 0xffb070, WARM2 = 0xffd2a0;

export function buildRoom(K) {
  const std = (o) => new THREE.MeshStandardMaterial(o), phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const R = TX.mulberry(2026), rnd = (a = 0, b = 1) => a + R() * (b - a), pick = (a) => a[Math.floor(R() * a.length)];
  K.onMode = K.onMode || [];

  // ---------- 材质 ----------
  const weave = TX.weave(), fuzz = TX.fuzz();
  const fab = (color, rp = 6, o = {}) => {
    const n = weave.clone(); n.repeat.set(rp, rp); n.needsUpdate = true;
    return phys({ color, roughness: .94, normalMap: n, normalScale: new THREE.Vector2(.36, .36), sheen: .44, sheenRoughness: .73, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), .36), ...o });
  };
  const plush = (color, rp = 3) => { const n = fuzz.clone(); n.repeat.set(rp, rp); n.needsUpdate = true; return phys({ color, roughness: 1, normalMap: n, normalScale: new THREE.Vector2(.9, .9), sheen: 1, sheenRoughness: .8, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), .6) }); };
  const floorSet = TX.wood({ tone: [.47, .347, .251], rows: 10, seed: 3, gap: 1, vary: .16, gloss: .42, grainStrength: .64 });
  const walnutSet = TX.wood({ tone: [.39, .276, .202], rows: 2, seed: 7, size: 512, gap: 0, vary: .06, gloss: .46, grainStrength: .60 });
  const oakSet = TX.wood({ tone: [.66, .527, .393], rows: 2, seed: 9, size: 512, gap: 0, vary: .06, gloss: .46, grainStrength: .57 });
  // 墙：暖一点、亮一点的灰泥（原来是偏蓝的冷灰混凝土，白天整屋看着发灰）
  const concSet = TX.concrete({ tone: [.69, .668, .628], contrast: .12 });
  const plasterNormal = new THREE.Vector2(.47, .47);
  const M = {
    // 地板：上了清漆的木地板，能映出窗光和灯（半写实场景里最出效果的一块）
    floor: phys({ ...floorSet, roughness: 1, envMapIntensity: .86, clearcoat: .27, clearcoatRoughness: .28 }),
    walnut: std({ ...walnutSet, roughness: 1, normalScale: new THREE.Vector2(.62, .62) }),
    oak: std({ ...oakSet, roughness: 1, normalScale: new THREE.Vector2(.54, .54) }),
    wall: std({ ...TX.rep(concSet, 1 / 2.4), roughness: 1, normalScale: plasterNormal }),
    conc: std({ ...concSet, roughness: 1, normalScale: plasterNormal }),
    slab: std({ ...TX.rep(TX.concrete({ tone: [.3, .3, .32], seed: 5 }), 2, .3), roughness: 1 }),
    steel: std({ color: 0x16171b, metalness: .75, roughness: .42 }),
    steelB: std({ color: 0x8d939e, metalness: 1, roughness: .32 }),
    chrome: std({ color: 0xe6e9ee, metalness: 1, roughness: .1 }),
    brass: std({ color: 0xc9a063, metalness: 1, roughness: .26 }),
    char: std({ color: 0x18191d, roughness: .55, metalness: .1 }),
    rubber: std({ color: 0x1d1e24, roughness: .9 }),
    white: std({ color: 0xeef0f2, roughness: .35 }),
    ceramic: phys({ color: 0xece9e3, roughness: .27, clearcoat: .43, clearcoatRoughness: .21 }),
    glass: std({ color: 0xa9c8e8, transparent: true, opacity: .13, roughness: .03, metalness: .1, envMapIntensity: 3, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }),
    frost: std({ color: 0xdcebf2, transparent: true, opacity: .6, roughness: .85, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }),
    mirror: std({ color: 0xffffff, metalness: 1, roughness: .03, envMapIntensity: 1.6 }),
    blackGlass: std({ color: 0x050506, roughness: .06, metalness: .2 }),
    water: std({ color: 0x79bdd8, transparent: true, opacity: .72, roughness: .04, depthWrite: false }),
    counter: phys({ ...TX.terrazzo({ base: [.77, .745, .70], chips: 1400, fleck: .49 }), roughness: .52, clearcoat: .19, clearcoatRoughness: .32 }),
    cabinet: std({ color: 0x34383b, roughness: .57, metalness: .12 }),
    fridge: std({ color: 0xc9ced6, metalness: .85, roughness: .34 }),
    sheet: fab(0xe7e3dc, 11), duvet: fab(0x687e8f, 17, { normalScale: new THREE.Vector2(.27, .27), sheen: .34 }), pillow: fab(0xf4efe7, 11),
    mustard: fab(0xc9973f, 5), pink: fab(0xd98aa2, 5), teal: fab(0x2f6f78, 5), charF: fab(0x24262d, 6),
    head: fab(0x33475f, 6),
    soil: std({ color: 0x2a1f18, roughness: 1 }),
    pot: std({ color: 0xe6e0d6, roughness: .55 }), pot2: std({ color: 0x3a3d46, roughness: .5 }), potT: std({ color: 0xb5674a, roughness: .7 }),
    leaf: [0x58b06f, 0x3f9a5c, 0x6cbf7c, 0x378a52].map((c) => std({ color: c, roughness: .5, side: THREE.DoubleSide, emissive: c, emissiveIntensity: .1 })),
    stem: std({ color: 0x3d6b3a, roughness: .7 }),
    paper: std({ color: 0xf3efe6, roughness: .9 }),
  };
  M.duvet.side = THREE.DoubleSide;
  const screen = (tex, night, day = night * .8) => { const m = std({ color: 0x050505, roughness: .15, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: night }); m.userData.I = { night, day }; K.glows.push(m); return m; };
  const neonPlane = (tex, w, h, pos, rotY, night = 2.4, day = .5) => {
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    K.onMode.push((mode) => m.color.setScalar(mode === 'night' ? night : day));
    return K.mesh(new THREE.PlaneGeometry(w, h), m, pos[0], pos[1], pos[2], { rot: [0, rotY, 0], order: 4 });
  };
  const floorRect = (x0, z0, w, d, mat, tile = 4, y = 0) => {
    const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + x0 + w / 2) / tile, (p.getZ(i) + z0 + d / 2) / tile);
    const floor = K.mesh(g, mat, x0 + w / 2, y, z0 + d / 2, { cast: false });
    floor.userData.walkLevel = Number(y > 1.4);
    return floor;
  };
  const rr = (w, h, r) => { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; };
  const bookPal = [0x8c3b3b, 0x2f4b6e, 0xd9c7a3, 0x3f6b57, 0xc98a3d, 0x4a3f6b, 0xe8e2d6, 0x23262d, 0xb5607a, 0x5c7f9c];
  const bookMats = bookPal.map((c) => std({ color: c, roughness: .7 }));
  const books = (x0, x1, y, z, { d = .2, lean = true } = {}) => {
    let x = x0;
    while (x < x1 - .05) {
      const w = rnd(.028, .065), h = rnd(.2, .3);
      if (lean && R() < .12 && x + .14 < x1) { K.box(x, y, z, w, h, d, pick(bookMats), { rot: [0, 0, -.22] }); x += w + .07; continue; }
      K.box(x, y, z + rnd(0, .02), w, h, d - rnd(0, .03), pick(bookMats)); x += w + .003;
    }
  };
  const mug = (x, y, z, mat, ry = 0) => { K.lathe(x, y, z, [[0, 0], [.036, 0], [.04, .005], [.042, .09], [.036, .09], [.034, .012], [0, .012]], mat, { seg: 20 }); K.torus(x + Math.cos(ry) * .05, y + .048, z - Math.sin(ry) * .05, .026, .007, mat, { rot: [0, ry, 0], seg: 16 }); };
  const bottle = (x, y, z, mat, s = 1) => K.lathe(x, y, z, [[0, 0], [.035 * s, 0], [.04 * s, .01], [.04 * s, .16 * s], [.015 * s, .22 * s], [.014 * s, .29 * s], [.018 * s, .3 * s], [0, .3 * s]], mat, { seg: 16 });

  // ---------- 楼板 ----------
  const indoorSlabs = [[-T, -T, W + 2 * T, TERRACE.z + T], [-T, TERRACE.z, TERRACE.x + T, D - TERRACE.z]];
  for (const [x, z, w, d] of indoorSlabs) {
    K.box(x, -.55, z, w, .52, d, M.slab);
    K.box(x, -.03, z, w, .029, d, M.char, { cast: false });
  }
  // 卧室、餐厨还是木地板；客厅换成深色抛光石材，能映出幕墙外的城市灯光
  const basalt = TX.marble({ base: [.132, .153, .169], veins: .38, rough: .35 });
  const stone = phys({ ...basalt, roughness: 1, clearcoat: .67, clearcoatRoughness: .115, envMapIntensity: 1.35 });
  const atriumWood = phys({ ...TX.wood({ tone: [.43, .325, .232], rows: 17, seed: 173, gap: 1, vary: .14, gloss: .42, grainStrength: .60 }), roughness: 1, normalScale: new THREE.Vector2(.52, .52), clearcoat: .28, clearcoatRoughness: .24 });
  floorRect(0, 0, 6, 6, M.floor); floorRect(5, 6, TERRACE.x - 5, 4, M.floor);
  floorRect(TERRACE.x, 6, W - TERRACE.x, TERRACE.z - 6, M.floor);
  floorRect(6, 0, W - 6, 6, stone, 3);
  floorRect(6.81, .86, 6.95, 5.14, atriumWood, 3.5, .001);
  const bathTile = std({ ...TX.tiles({ n: 8, a: [.82, .9, .9], b: [.62, .78, .8], grout: [.3, .36, .38] }), roughness: 1 });
  floorRect(0, 6, 5, 4, bathTile, 1.6, .003);
  const kitTile = std({ ...TX.tiles({ n: 3, a: [.3, .31, .34], b: [.24, .25, .28], grout: [.1, .1, .11], seed: 4, rough: .22 }), roughness: 1 });
  floorRect(5.07, 6.07, 4.13, 1.6, kitTile, 1.8, .004);
  K.box(5.07, 0, 7.66, 4.13, .008, .025, M.brass, { cast: false });

  // ---------- 外墙（带窗洞）----------
  const wallGeo = (len, holes) => {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(len, 0); s.lineTo(len, WH); s.lineTo(0, WH); s.closePath();
    for (const o of holes) { const p = new THREE.Path(); p.moveTo(o[0], o[2]); p.lineTo(o[0], o[3]); p.lineTo(o[1], o[3]); p.lineTo(o[1], o[2]); p.closePath(); s.holes.push(p); }
    return new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false });
  };
  const WEST = [[1.15, 2.35, .45, 4.6], [3.3, 9.3, 3.0, 4.7], [6.35, 7.15, 1.45, 2.25]];       // [z0,z1,y0,y1]
  // 客厅北面：整面落地玻璃幕墙（从地面到顶，夹层楼板从玻璃后面横穿过去），照着“高层公寓 + 整面夜景”的感觉
  const NORTH = [[1.4, 5.4, 3.0, 4.7], [6.15, W - .05, .04, WH - .14]];
  const west = K.group(), north = K.group(), east = K.group(), corner = K.group();
  west.name = 'west facade'; north.name = 'north facade'; east.name = 'east facade'; corner.name = 'facade corner';
  for (const edge of [west, north, east, corner]) edge.userData.viewCutaway = true;
  K.in(west, () => {
    K.mesh(wallGeo(D, WEST), M.wall, 0, 0, 0, { rot: [0, -Math.PI / 2, 0] });
    K.box(0, 0, 0, .03, .1, D, M.char, { cast: false });
    K.box(-T - .02, WH, -T - .02, T + .04, .05, D + T + .02, M.steel);
  });
  K.in(north, () => {
    K.mesh(wallGeo(W + T, NORTH.map((h) => [h[0] + T, h[1] + T, h[2], h[3]])), M.wall, -T, 0, -T);
    K.box(0, 0, 0, W, .1, .03, M.char, { cast: false });
    K.box(-T, WH, -T - .02, W + T, .05, T + .04, M.steel);
  });

  const rainMats = [];
  const sunWindows = [];
  const rainBase = TX.rainStreaks();
  const facadeGlass = M.glass.clone();
  facadeGlass.opacity = .075; facadeGlass.roughness = .12; facadeGlass.envMapIntensity = 1.9;
  const win = (g, a0, a1, y0, y1, zmid, sIn, { mv = [], mh = [], glazing = M.glass, frost = false, rain = true } = {}) => K.in(g, () => {
    const depth = T + .08, z0 = zmid - depth / 2;
    const trim = .032, reveal = .028, bar = .044, inset = .002;
    const left = a0 + reveal, right = a1 - reveal, bottom = y0 + reveal, top = y1 - reveal;
    K.box(a0 - trim, y0 - trim, z0, a1 - a0 + 2 * trim, trim + reveal, depth, M.steel);
    K.box(a0 - trim, top, z0, a1 - a0 + 2 * trim, trim + reveal, depth, M.steel);
    K.box(a0 - trim, bottom, z0, trim + reveal, top - bottom, depth, M.steel);
    K.box(right, bottom, z0, trim + reveal, top - bottom, depth, M.steel);
    for (const a of mv) K.box(a - bar / 2, bottom, zmid - .05, bar, top - bottom, .1, M.steel);
    for (const y of mh) K.box(left, y - bar / 2, zmid - .046, right - left, bar, .092, M.steel);
    const columns = [left, ...mv, right], rows = [bottom, ...mh, top];
    for (let j = 1; j < rows.length; j++) {
      const low = rows[j - 1] + (j > 1 ? bar / 2 : 0) + inset;
      const high = rows[j] - (j < rows.length - 1 ? bar / 2 : 0) - inset;
      for (let i = 1; i < columns.length; i++) {
        const from = columns[i - 1] + (i > 1 ? bar / 2 : 0) + inset;
        const to = columns[i] - (i < columns.length - 1 ? bar / 2 : 0) - inset;
        K.glassPane(from, to, low, high, zmid, frost ? M.frost : glazing);
        if (frost || !rain) continue;
        const t = rainBase.clone(); t.repeat.set((to - from) / 1.2, (high - low) / 2.4); t.needsUpdate = true;
        const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: .45, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true });
        rainMats.push(m);
        K.mesh(new THREE.PlaneGeometry(to - from, high - low), m, (from + to) / 2, (low + high) / 2, zmid - sIn * .008, { noNav: true });
      }
    }
    if (frost) return;
    g.updateWorldMatrix(true, false);
    const inside = zmid + sIn * (T / 2 + .04);
    sunWindows.push({
      corners: [[left, bottom], [right, bottom], [right, top], [left, top]].map(([a, y]) => g.localToWorld(new THREE.Vector3(a, y, inside))),
      inward: new THREE.Vector3(0, 0, sIn).transformDirection(g.matrixWorld),
    });
  });
  K.tickers.push((dt) => { for (const m of rainMats) m.map.offset.y += dt * .22; });
  K.onMode.push((mode) => { for (const m of rainMats) m.visible = mode === 'night'; });
  const gN = north;
  const gW = K.group(0, 0, 0, -Math.PI / 2), gE = K.group(W, 0, 0, -Math.PI / 2);
  west.add(gW); east.add(gE);
  win(gW, ...WEST[0], T / 2, -1, { mh: [1.6, 2.6, 3.6] });
  win(gW, ...WEST[1], T / 2, -1, { mv: [4.8, 6.3, 7.8] });
  win(gW, ...WEST[2], T / 2, -1, { frost: true });
  win(gN, ...NORTH[0], -T / 2, 1, { mv: [2.4, 3.4, 4.4] });
  win(gN, ...NORTH[1], -T / 2, 1, { mv: [7.69, 9.27, 10.85, 12.42, 13.99], glazing: facadeGlass, rain: false });
  win(gE, .02, 5.99, .04, WH - .14, -T / 2, 1, { mv: [1.53, 3.03, 4.53], mh: [LY], glazing: facadeGlass, rain: false });
  K.in(corner, () => K.box(W - .055, 0, -.06, .23, WH, .24, M.steel));
  K.in(east, () => K.box(W - .015, 0, 6.01, .22, WH, .17, M.steel));
  const perimeter = K.glow(0x83bdd9, 1.25, .05);
  K.box(6.28, .012, .147, W - 6.49, .004, .012, perimeter, { cast: false });
  K.box(W - .155, .012, .18, .012, .004, 5.68, perimeter, { cast: false });
  // 窗外的城市光打进来（面光源）
  K.rect(0x5f7dff, 5, 1.2, 4.1, [.06, 2.5, 1.75], [3, 1.5, 1.75], { day: 0 });
  K.rect(0x8298ba, 2.0, 6, 1.7, [.06, 3.85, 6.3], [4, 1, 6.3], { day: 0 });
  K.rect(0x8cbbeb, 2.0, 3.8, 1.6, [8.9, 3.9, .06], [8.9, 2.4, 3], { day: 0 });
  // 幕墙透进来的城市冷光：一大片蓝，屋里的暖灯只做点缀
  K.rect(0x91bddb, 2.8, 8.6, 3.4, [10.8, 1.78, .08], [10.8, .48, 4.6], { day: .46 });
  K.rect(0x83b4dc, 2.2, 5.8, 4.4, [W - .08, 2.56, 3.11], [10, .72, 3.11], { day: .47 });

  // 窗帘（卧室竖窗两侧的纱帘）
  const curtain = (z0, z1) => {
    const g = new THREE.PlaneGeometry(z1 - z0, 4.35, 28, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) + z0) * 34) * .035 + Math.sin(p.getX(i) * 13) * .02);
    g.computeVertexNormals();
    K.mesh(g, phys({ color: 0xe9e4dc, roughness: .9, side: THREE.DoubleSide, transparent: true, opacity: .82, sheen: .5 }), .11, 2.45, (z0 + z1) / 2, { rot: [0, Math.PI / 2, 0], cast: true, order: 3, parent: west });
  };
  curtain(.86, 1.2); curtain(2.3, 2.44);
  K.cyl(.11, 4.66 - .875, 1.65, .014, .014, 1.75, M.steel, { rot: [Math.PI / 2, 0, 0], parent: west });

  // ---------- 室内隔断 ----------
  const glassZ = (x, z0, z1, h, n) => { // 沿 z 方向的黑钢框玻璃
    for (let i = 0; i <= n; i++) K.box(x - .022, 0, z0 + (z1 - z0) * i / n - .022, .044, h, .044, M.steel);
    K.box(x - .022, h - .044, z0, .044, .044, z1 - z0, M.steel); K.box(x - .03, 0, z0, .06, .09, z1 - z0, M.steel); K.box(x - .018, 1.15, z0, .036, .036, z1 - z0, M.steel);
    for (let i = 0; i < n; i++) {
      const from = z0 + (z1 - z0) * i / n + .024, to = z0 + (z1 - z0) * (i + 1) / n - .024;
      K.glassPane(from, to, .092, 1.148, x, M.glass, { alongZ: true });
      K.glassPane(from, to, 1.188, h - .046, x, M.glass, { alongZ: true });
    }
  };
  glassZ(6, 0, 2.2, 2.36, 3); glassZ(6, 3.6, 6.0, 2.36, 3);
  const subway = std({ ...TX.rep(TX.tiles({ n: 8, a: [.93, .94, .93], b: [.86, .9, .9], grout: [.55, .57, .58], brick: true, seed: 8 }), 2, 1), roughness: 1 });
  const subwayZ = std({ ...TX.rep(TX.tiles({ n: 8, a: [.93, .94, .93], b: [.86, .9, .9], grout: [.55, .57, .58], brick: true, seed: 8, size: 256 }), 3, 1), roughness: 1 });
  // 卫生间北侧半墙（背后是卧室）
  K.box(0, 0, 5.93, 3.0, 1.15, .14, M.conc); K.box(0, 0, 6.07, 3.0, 1.15, .012, subway); K.box(-.0, 1.15, 5.9, 3.03, .04, .2, M.counter);
  K.box(4.2, 0, 5.93, .8, 1.15, .14, M.conc); K.box(4.2, 0, 6.07, .73, 1.15, .012, subway); K.box(4.17, 1.15, 5.9, .9, .04, .2, M.counter);
  // 卫生间东侧：半墙 + 上面一截清玻璃
  K.box(4.93, 0, 6.07, .14, 1.15, 3.93, M.conc); K.box(4.918, 0, 6.07, .012, 1.15, 3.93, subwayZ); K.box(4.9, 1.15, 6.05, .2, .04, 3.95, M.counter);
  for (const z of [6.08, 8.0, 9.94]) K.box(4.98, 1.19, z - .02, .04, 1.03, .04, M.steel);
  K.glassPane(6.102, 7.978, 1.192, 2.188, 5, M.glass, { alongZ: true });
  K.glassPane(8.022, 9.918, 1.192, 2.188, 5, M.glass, { alongZ: true });
  K.box(4.975, 2.19, 6.06, .05, .04, 3.92, M.steel);
  // 厨房背墙（背后是客厅）
  K.box(5.0, 0, 5.93, 4.2, 1.32, .14, M.conc); K.box(4.98, 1.32, 5.88, 4.24, .045, .24, M.walnut);
  K.box(6.2, .91, 6.07, 2.6, .41, .012, std({ ...TX.rep(TX.tiles({ n: 8, a: [.31, .43, .41], b: [.25, .35, .33], grout: [.55, .55, .50], brick: true, seed: 14, rough: .27 }), 3, .5), roughness: 1, normalScale: new THREE.Vector2(.47, .47) }));
  K.box(6.25, 1.283, 6.09, 2.5, .016, .016, K.glow(WARM2, 2.4, .25), { cast: false });
  K.point(WARM2, 1.65, 3.3, [7.5, 1.2, 6.45]);
  // 朝客厅那一面贴竖向胡桃木格栅（暖木，和夹层底面的格栅呼应）
  for (const [x0, x1, h] of [[5.04, 9.16, 1.3]]) {
    const n = Math.floor((x1 - x0) / .07), im = new THREE.InstancedMesh(new THREE.BoxGeometry(.04, h, .035), M.walnut, n), mm = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { mm.setPosition(x0 + .02 + i * .07, h / 2, 5.91); im.setMatrixAt(i, mm); } im.castShadow = false; im.receiveShadow = true; K.parent.add(im);
    K.box(x0, 0, 5.925, x1 - x0, h, .004, std({ color: 0x120d09, roughness: 1 }), { cast: false });
  }

  // ---------- 卧室 ----------
  // 床（床头朝北）
  K.box(.15, .1, 2.6, 2.3, .2, 3.2, M.walnut, { r: .02 });
  for (const [x, z] of [[.22, 2.68], [2.3, 2.68], [.22, 5.66], [2.3, 5.66]]) K.cyl(x + .04, 0, z + .04, .035, .028, .1, M.steel);
  K.box(.1, .1, 2.46, 2.4, 1.02, .14, M.walnut, { r: .03 });
  for (let i = 0; i < 3; i++) K.box(.17 + i * .765, .46, 2.575, .74, .6, .07, M.head, { r: .035, seg: 5 });
  K.box(.2, .3, 2.68, 2.2, .26, 3.08, M.sheet, { r: .1, seg: 6 });
  const pillows = [
    K.cushion(.3, .64, 2.66, .92, .2, .56, M.pillow, { rot: [.95, 0, 0], seed: 2 }),
    K.cushion(1.36, .64, 2.66, .92, .2, .56, M.pillow, { rot: [.95, 0, 0], seed: 5 }),
  ];
  const sleepPillow = K.cushion(.78, .562, 2.76, 1.04, .135, .71, M.pillow, { puff: .34, seed: 15 });
  sleepPillow.visible = false;
  const accentPillow = K.cushion(.95, .62, 3.0, .5, .16, .36, M.pink, { rot: [.7, .2, 0], seed: 8, puff: .7 });
  const duvetFlat = K.duvet(.2, 3.42, 2.2, 2.36, .585, M.duvet, { hw: .03 });
  // 睡觉时的被子拉到胸口；真正的形状在 main.js 的 fitDuvet 里按她身体的高度场“盖”上去，这里的鼓包只是模型没加载时的兜底
  const duvetSleep = K.duvet(.2, 3.58, 2.2, 2.20, .598, M.duvet, { hw: .03, mound: { h: .12, x: 1.1, z: .40, sx: .55, sz: .72 } }); duvetSleep.visible = false;
  const bedFold = K.cushion(.20, .584, 3.35, 2.20, .050, .18, M.sheet, { puff: .24, seed: 5 });
  const runnerTop = K.cushion(.17, .620, 5.02, 2.27, .038, .52, M.teal, { puff: .15, seed: 11 });
  const runnerSide = K.box(2.385, .22, 5.02, .05, .44, .52, M.teal, { r: .02 });
  // 鲸鱼玩偶（床尾）
  { const m = plush(0x6f9fe0), g = K.group(.72, .72, 5.3, .5); K.in(g, () => { K.sph(0, 0, 0, .19, m, { scale: [1.5, .92, 1] }); K.sph(.02, -.05, 0, .17, plush(0xe9f1fb), { scale: [1.35, .75, .92] }); K.mesh(new THREE.ConeGeometry(.09, .2, 12), m, -.33, .03, 0, { rot: [0, 0, -1.2] }); K.mesh(new THREE.ConeGeometry(.07, .13, 10), m, -.44, .08, .07, { rot: [.6, 0, -.3] }); K.mesh(new THREE.ConeGeometry(.07, .13, 10), m, -.44, .08, -.07, { rot: [-.6, 0, -.3] }); K.sph(.2, .05, .13, .016, M.char); K.sph(.2, .05, -.13, .016, M.char); }); }
  const bedLight = K.glow(0x957de9, 1.75, .14);
  K.box(.22, .085, 5.79, 2.16, .012, .012, bedLight, { cast: false }); K.box(2.44, .085, 2.8, .012, .012, 2.9, bedLight, { cast: false });
  // Keep the original fill light on the sleeping character.
  K.point(0x8f6cff, 1.6, 2.6, [2.75, .1, 4.6]);
  // 床头柜 + 台灯
  K.box(2.56, .1, 2.62, .56, .46, .54, M.walnut, { r: .02 }); for (const [x, z] of [[2.6, 2.66], [3.04, 2.66], [2.6, 3.08], [3.04, 3.08]]) K.cyl(x, 0, z, .018, .014, .1, M.brass);
  K.box(2.585, .33, 3.158, .51, .006, .004, M.char, { cast: false }); K.sph(2.84, .44, 3.17, .016, M.brass); K.sph(2.84, .22, 3.17, .016, M.brass);
  K.lathe(2.76, .56, 2.84, [[0, 0], [.085, 0], [.095, .015], [.05, .07], [.075, .17], [.07, .22], [.022, .3], [.02, .36], [0, .36]], std({ color: 0x3f5f74, roughness: .25 }));
  K.cyl(2.76, .86, 2.84, .12, .17, .2, K.glow(WARM, 2.6, .12, 0xfff0dc), { open: true, cast: false }).material.side = THREE.DoubleSide;
  K.point(WARM, 2.9, 5.0, [2.76, 1.0, 2.86], { shadow: 512 });
  K.box(2.9, .56, 2.95, .16, .025, .22, pick(bookMats), { rot: [0, .2, 0] }); K.box(2.95, .585, 3.0, .075, .008, .15, M.blackGlass, { rot: [0, -.3, 0] });
  // 圆地毯 + 懒人沙发
  { const n = fuzz.clone(); n.repeat.set(5, 5); n.needsUpdate = true; const rug = K.cyl(3.9, 0, 3.6, 1.25, 1.25, .022, phys({ map: TX.roundRugTex(), roughness: 1, normalMap: n, sheen: 1, sheenRoughness: .9, sheenColor: new THREE.Color(0xffffff) }), { seg: 72, cast: false }); rug.userData.walkLevel = 0; }
  K.sph(4.72, .3, 4.72, .52, fab(0x8a93b8, 5), { scale: [1.06, .6, 1] }); K.sph(4.66, .5, 4.78, .34, fab(0x8a93b8, 4), { scale: [1.1, .5, .9] });
  // 衣柜
  K.box(.15, .06, .15, 1.2, 1.94, .7, M.oak, { r: .012 }); K.box(.17, 0, .18, 1.16, .06, .62, M.char);
  K.box(.165, .09, .85, .58, 1.89, .02, M.oak, { r: .006 }); K.box(.755, .09, .85, .58, 1.89, .02, M.oak, { r: .006 });
  K.box(.7, .85, .87, .016, .42, .02, M.brass); K.box(.784, .85, .87, .016, .42, .02, M.brass);
  K.box(.22, 2.0, .22, .5, .26, .5, fab(0xbfb39c, 3), { r: .03 }); K.box(.8, 2.0, .26, .44, .2, .44, fab(0x6c7a8f, 3), { r: .03 });
  // 墙上的画
  const frame = (z0, y0, w, h, tex) => { K.box(0, y0, z0, .035, h, w, M.char, { r: .006 }); K.box(.035, y0 + .04, z0 + .04, .004, h - .08, w - .08, M.paper, { cast: false }); K.mesh(new THREE.PlaneGeometry(w - .2, h - .22), std({ map: tex, roughness: .8 }), .041, y0 + h / 2, z0 + w / 2, { rot: [0, Math.PI / 2, 0], cast: false }); };
  K.in(west, () => {
    frame(3.3, 1.35, .8, 1.02, TX.artTex(5, ['#f1e6d3', '#c4567f', '#2f4b6e', '#e3a36a', '#1f2233']));
    frame(4.22, 1.62, .52, .66, TX.artTex(9, ['#1f2a44', '#7cf2c4', '#ffd166', '#e8e2d6']));
    frame(4.22, 2.36, .52, .4, TX.artTex(13, ['#e8dfd0', '#2f6f78', '#c9973f']));
  });
  // 书桌
  K.box(2.8, .76, .15, 2.4, .05, 1.0, M.walnut, { r: .012 });
  for (const x of [2.86, 5.09]) { K.box(x, 0, .22, .05, .76, .05, M.steel); K.box(x, 0, 1.05, .05, .76, .05, M.steel); K.box(x, .7, .22, .05, .05, .88, M.steel); }
  K.box(4.52, .12, .22, .56, .62, .84, M.cabinet, { r: .012 }); for (let i = 0; i < 3; i++) { K.box(4.54, .135 + i * .2, 1.06, .52, .19, .012, M.cabinet, { r: .004 }); K.box(4.72, .22 + i * .2, 1.072, .16, .012, .012, M.brass); }
  K.box(3.2, .811, .5, 1.55, .006, .56, M.rubber, { cast: false });
  // 显示器
  K.cyl(3.95, .81, .33, .11, .12, .012, M.steel); K.cyl(3.95, .82, .33, .02, .02, .36, M.steel);
  K.box(3.3, .98, .345, 1.3, .56, .035, M.char, { r: .012 }); K.mesh(new THREE.PlaneGeometry(1.26, .52), screen(TX.codeScreen(1, 190), 1.25), 3.95, 1.26, .382, { cast: false });
  { const g = K.group(4.86, 0, .5, -.5); K.in(g, () => { K.cyl(0, .81, 0, .08, .09, .012, M.steel); K.cyl(0, .82, 0, .016, .016, .2, M.steel); K.box(-.2, .93, -.015, .4, .7, .03, M.char, { r: .01 }); K.mesh(new THREE.PlaneGeometry(.37, .67), screen(TX.codeScreen(4, 300), 1.2), 0, 1.28, .017, { cast: false }); }); }
  K.rect(0x9fd0ff, 7, 1.5, .6, [3.95, 1.3, .45], [3.95, .9, 2.5], { day: 2 });
  // 键盘（带一颗颗键帽）和鼠标
  K.box(3.6, .817, .72, .62, .02, .21, M.char, { r: .008 }); K.box(3.61, .836, .73, .6, .003, .19, K.glow(0xff5fd0, 2.2, .6), { cast: false });
  { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(.034, .013, .03), std({ color: 0x23242b, roughness: .5 }), 75), mm = new THREE.Matrix4(); let k = 0; for (let r = 0; r < 5; r++) for (let c = 0; c < 15; c++) { mm.setPosition(3.63 + c * .04, .845, .745 + r * .037); im.setMatrixAt(k++, mm); } im.castShadow = false; K.parent.add(im); }
  K.sph(4.38, .83, .82, .035, M.char, { scale: [.85, .55, 1.3] });
  // 主机（侧透 + 风扇灯）
  K.box(2.9, .81, .24, .3, .58, .62, M.char, { r: .015 }); K.box(3.2, .83, .27, .004, .54, .56, std({ color: 0x0a0c12, transparent: true, opacity: .55, roughness: .05, depthWrite: false }));
  for (const [y, c] of [[1.22, CYAN], [1.0, PINK]]) K.torus(3.185, y, .55, .085, .012, K.glow(c, 4, 1), { rot: [0, Math.PI / 2, 0], cast: false });
  K.box(3.0, .84, .28, .12, .5, .1, K.glow(VIOLET, 1.2, .3), { cast: false });
  // 台灯、马克杯、耳机、小绿植
  K.cyl(5.0, .81, .4, .07, .08, .015, M.brass); K.tube([[5.0, .82, .4], [5.02, 1.15, .42], [4.9, 1.38, .55], [4.72, 1.4, .68]], .012, M.brass, { seg: 24 });
  K.mesh(new THREE.ConeGeometry(.1, .14, 24, 1, true), std({ color: 0x1a1b20, metalness: .5, roughness: .4, side: THREE.DoubleSide }), 4.7, 1.36, .7, { rot: [.6, 0, .5] }); K.sph(4.69, 1.33, .71, .03, K.glow(WARM2, 5, .2), { cast: false });
  K.spot(WARM2, 16, 4, [4.7, 1.34, .7], [4.3, .8, .95], .85, { pen: .9 });
  mug(3.42, .812, .98, M.ceramic, 2.2); K.cyl(3.42, .888, .98, .034, .034, .002, std({ color: 0x3a2416, roughness: .3 }), { cast: false });
  K.cyl(4.38, .81, .45, .05, .06, .01, M.char); K.cyl(4.38, .82, .45, .012, .012, .26, M.char); K.torus(4.38, 1.13, .45, .085, .012, M.char, { arc: Math.PI }); for (const s of [-1, 1]) K.cyl(4.38 + s * .085, 1.07, .45, .045, .045, .035, M.char, { rot: [0, 0, Math.PI / 2] });
  K.plant(3.12, .81, 1.0, { pot: .055, potH: .09, n: 7, h: .2, leaf: [.12, .07], potMat: M.potT, leafMats: M.leaf, stemMat: M.stem, spread: .16, seed: 3 });
  // 洞洞板 + 小搁板 + 灯带 + 霓虹字
  K.box(2.95, 1.5, 0, 2.1, .86, .03, M.char, { r: .008 });
  K.box(3.05, 1.82, .03, 1.0, .028, .17, M.oak); books(3.08, 3.6, 1.848, .04, { d: .13 });
  for (const [x, c] of [[3.7, 0x7cf2c4], [3.84, 0xffb0d0], [3.97, 0xffd166]]) { K.sph(x, 1.89, .11, .042, std({ color: c, roughness: .5 })); K.sph(x, 1.955, .11, .03, std({ color: c, roughness: .5 })); }
  for (const [x, y, a] of [[4.3, 2.08, .06], [4.52, 2.02, -.08], [4.72, 2.1, .04], [4.4, 1.78, -.05], [4.66, 1.76, .07]]) { K.box(x, y, .031, .16, .2, .004, M.paper, { rot: [0, 0, a], cast: false }); K.box(x + .015, y + .045, .034, .13, .135, .002, std({ color: pick([0x5f7fb8, 0xc4567f, 0x2f6f78, 0xe3a36a, 0x33475f]), roughness: .6 }), { rot: [0, 0, a], cast: false }); }
  K.box(2.95, 2.37, .03, 2.1, .016, .016, K.glow(0xb6a3d2, 2.8, .32), { cast: false });
  neonPlane(TX.neonText('鱼', '#d0b8e4', { w: 256, h: 256, fs: 170 }), .54, .54, [5.52, 2.25, .02], 0, 1.35, .34);
  K.point(0xad90cb, 1.3, 3.6, [4.4, 2.5, .5]);
  // 短靠背留出长发和尾巴的空间，前缘给裙摆留出空间。
  { const g = K.group(DESK_CHAIR.x, 0, DESK_CHAIR.z, Math.PI); g.name = 'deskChair'; K.in(g, () => {
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; K.box(-.02, .05, 0, .04, .03, .3, M.char, { rot: [0, a, 0] }).position.set(Math.sin(a) * .15, .065, Math.cos(a) * .15); K.sph(Math.sin(a) * .3, .03, Math.cos(a) * .3, .03, M.rubber); }
    K.cyl(0, .06, 0, .025, .03, .36, M.chrome);
    K.box(-.19, .39, .085, .38, .045, .132, M.char, { r: .015 });
    // 后缘中央留槽，让尾巴从坐垫后方垂下。
    const seat = new THREE.Shape();
    seat.moveTo(-.224, .22); seat.lineTo(.224, .22);
    seat.quadraticCurveTo(.24, .22, .24, .20); seat.lineTo(.24, -.107);
    seat.quadraticCurveTo(.24, -.127, .22, -.127); seat.lineTo(.119, -.127);
    seat.quadraticCurveTo(.099, -.127, .099, -.105); seat.lineTo(.099, .10);
    seat.quadraticCurveTo(.099, .12, .079, .12); seat.lineTo(-.079, .12);
    seat.quadraticCurveTo(-.099, .12, -.099, .10); seat.lineTo(-.099, -.105);
    seat.quadraticCurveTo(-.099, -.127, -.119, -.127); seat.lineTo(-.22, -.127);
    seat.quadraticCurveTo(-.24, -.127, -.24, -.107); seat.lineTo(-.24, .20);
    seat.quadraticCurveTo(-.24, .22, -.224, .22);
    const upholstery = new THREE.ExtrudeGeometry(seat, { depth: .063, bevelSize: .012, bevelThickness: .012, bevelSegments: 4, curveSegments: 6 });
    const cushion = K.mesh(upholstery, M.charF, 0, .513, 0, { rot: [Math.PI / 2, 0, 0] });
    cushion.name = 'deskSeat';
    const back = K.box(-.22, .62, -.56, .44, .39, .075, M.charF, { r: .035, seg: 5, rot: [-.14, 0, 0] });
    back.name = 'deskBack';
    for (const side of [-1, 1]) {
      const x = side * .205;
      K.tube([[x * .85, .416, .15], [x, .416, -.09], [x, .417, -.43], [x, .59, -.53], [x, .68, -.53]], .023, M.char, { seg: 20 });
    }
  }); }
  // 北墙的小串灯
  K.in(north, () => { const pts = []; for (let i = 0; i <= 18; i++) { const t = i / 18; pts.push([.3 + t * 5.5, 2.82 - Math.sin((t * 4 % 1) * Math.PI) * .13, .05]); } K.tube(pts, .005, M.char, { seg: 90, rs: 4, cast: false }); const gm = K.glow(0xffd8a0, 7, .3); for (const p of pts) K.sph(p[0], p[1] - .035, p[2] + .01, .024, gm, { cast: false, seg: 10, seg2: 8 }); });
  K.point(0xffc890, 2.4, 4.5, [1.6, 2.6, .5]);
  // 鲸鱼霓虹（原创线条）
  K.in(north, () => { const ox = 4.78, oy = 2.88, z = .04, s = .42, P = (a) => a.map(([x, y]) => [ox + x * s, oy + y * s, z]), nm = K.glow(0x83c9e3, 2.6, .28);
    K.tube(P([[0, 0], [.35, .34], [1.0, .46], [1.6, .28], [1.86, 0], [1.6, -.26], [.9, -.34], [.3, -.22]]), .02, nm, { closed: true, cast: false });
    K.tube(P([[.02, 0], [-.3, .3], [-.44, .12], [-.3, 0], [-.44, -.14], [-.26, -.26], [.02, 0]]), .02, nm, { cast: false });
    K.sph(ox + 1.42 * s, oy + .1 * s, z, .028, nm, { cast: false });
    const sp = K.glow(0xbff6ff, 1.8, .25); K.tube(P([[1.15, .5], [1.1, .78], [.94, .92]]), .013, sp, { cast: false }); K.tube(P([[1.2, .52], [1.3, .8], [1.46, .9]]), .013, sp, { cast: false });
  });
  K.point(0x84c9df, .60, 2.6, [5.0, 3.05, .5]);


  // ---------- 挑高客厅 ----------
  const upholstery = fab(0xabaaa4, 13, { normalScale: new THREE.Vector2(.28, .28), sheen: .27 });
  const seatLinen = fab(0xd3ccbd, 15, { normalScale: new THREE.Vector2(.29, .29), sheen: .32 });
  const piping = fab(0xaaa497, 12, { sheen: .11 });
  const blackened = std({ color: 0x292c30, metalness: .63, roughness: .38 });
  const smokedBronze = std({ color: 0x766653, metalness: .72, roughness: .42 });
  const charcoalStone = phys({ ...TX.rep(basalt, .47, .62), roughness: 1, clearcoat: .34, clearcoatRoughness: .22 });
  const walnutFront = M.walnut.clone();
  walnutFront.color.set(0xddd1c0);

  // 把屏幕从整面矮柜里独立出来，窗前左右留空。
  K.box(10.22, .034, .49, 2.18, .061, .59, blackened, { r: .014 });
  K.box(10.10, .079, .41, 2.42, .26, .75, walnutFront, { r: .016 });
  K.box(10.065, .322, .387, 2.49, .034, .795, charcoalStone, { r: .009 });
  for (let i = 0; i < 3; i++) {
    const x = 10.126 + i * .795;
    K.box(x, .112, 1.15, .775, .196, .022, M.walnut, { r: .004, noNav: true });
    K.box(x + .237, .28, 1.168, .291, .009, .009, smokedBronze, { cast: false, noNav: true });
  }
  const tvGlass = phys({ color: 0x18212c, metalness: .23, roughness: .24, clearcoat: .65, clearcoatRoughness: .19, emissive: 0x9fb3cc, emissiveMap: TX.tvScreen() });
  tvGlass.userData.I = { night: .085, day: .13 }; K.glows.push(tvGlass);
  K.box(10.91, .355, .584, .79, .023, .27, blackened, { r: .008 });
  K.box(11.266, .371, .638, .08, .125, .06, blackened, { r: .008 });
  K.box(10.43, .47, .612, 1.73, .861, .045, blackened, { r: .008 });
  K.mesh(new THREE.PlaneGeometry(1.707, .837), tvGlass, 11.295, .90, .658, { cast: false });
  K.box(10.82, .355, .921, .95, .042, .099, M.char, { r: .014 });
  for (const x of [9.79, 12.62]) {
    K.box(x, 0, .475, .24, .79, .25, blackened, { r: .013 });
    K.box(x + .019, .06, .722, .202, .67, .012, fab(0x2a2b2c, 8, { sheen: .08 }), { r: .004 });
  }

  // 一整张浅色地毯与低矮座位留出横向视线。
  const rugX = 7.68, rugZ = 1.44, rugW = 5.79, rugD = 3.79;
  const n = fuzz.clone(); n.repeat.set(22, 16); n.needsUpdate = true;
  const wool = phys({ color: 0xb8b2a5, roughness: .98, normalMap: n, normalScale: new THREE.Vector2(.34, .34), sheen: .41, sheenRoughness: .9, sheenColor: new THREE.Color(0xc0b9a9) });
  const rug = K.box(rugX, .002, rugZ, rugW, .013, rugD, wool, { cast: false, r: .005 });
  rug.userData.walkLevel = 0;
  const rugBinding = fab(0xa49e92, 16, { normalScale: new THREE.Vector2(.26, .26), sheen: .27 });
  for (const z of [rugZ + .045, rugZ + rugD - .05]) K.box(rugX + .04, .015, z, rugW - .08, .0025, .011, rugBinding, { cast: false, noNav: true });
  for (const x of [rugX + .04, rugX + rugW - .05]) K.box(x, .015, rugZ + .05, .011, .0025, rugD - .10, rugBinding, { cast: false, noNav: true });

  // 沙发是有底座、布包和嵌入式坐垫的低背分段结构。
  const sx = 9.02, sz = 4.10;
  K.box(sx + .13, .036, sz + .08, 3.19, .074, 1.00, blackened, { r: .019 });
  K.box(sx, .094, sz, 3.46, .225, 1.21, upholstery, { r: .056, seg: 5 });
  K.box(sx, .12, sz + .995, 3.46, .464, .216, upholstery, { r: .064, seg: 5 });
  for (const x of [sx, sx + 3.28]) K.box(x, .14, sz + .12, .18, .32, .96, upholstery, { r: .063 });
  for (let i = 0; i < 3; i++) {
    const x = sx + .19 + i * 1.028;
    K.cushion(x, .312, sz + .025, 1.015, .164, .973, seatLinen, { puff: .23, seed: i + 7 });
    K.cushion(x + .006, .448, sz + .847, 1.005, .2, .225, seatLinen, { puff: .33, seed: i + 21, rot: [-.17, 0, 0] });
    K.tube([[x + .025, .367, sz + .046], [x + .075, .365, sz + .032], [x + .51, .364, sz + .03], [x + .96, .365, sz + .034], [x + .989, .367, sz + .05]], .0027, piping, { seg: 20, rs: 5, cast: false, noNav: true });
  }
  const ochre = fab(0x8e523b, 10, { sheen: .27 });
  K.cushion(sx + .26, .49, sz + .67, .385, .119, .36, ochre, { puff: .54, seed: 16, rot: [.9, .29, .13] });
  K.cushion(sx + 2.82, .49, sz + .66, .34, .12, .38, fab(0x5c686b, 10, { sheen: .32 }), { puff: .64, seed: 18, rot: [.96, -.30, 0] });
  const throwMat = fab(0x555657, 15);
  K.cushion(sx + 2.70, .572, sz + 1.01, .39, .023, .215, throwMat, { puff: .16, seed: 25 });
  K.cushion(sx + 2.70, .344, sz + 1.209, .39, .242, .022, throwMat, { puff: .19, seed: 25 });

  // 两张圆几错开，桌面用浅色石灰岩与烟棕胡桃木。
  const limestone = phys({ ...TX.marble({ base: [.56, .534, .482], veins: .046, rough: .47, size: 512, seed: 335, slabs: 1 }), roughness: 1, normalScale: new THREE.Vector2(.24, .24), clearcoat: .18, clearcoatRoughness: .30 });
  K.cyl(10.63, .031, 2.89, .225, .255, .285, blackened);
  K.cyl(10.63, .307, 2.89, .548, .53, .044, limestone, { seg: 64 });
  K.cyl(11.39, .023, 2.64, .124, .16, .213, blackened);
  K.cyl(11.39, .224, 2.64, .332, .31, .040, M.walnut, { seg: 48 });
  mug(10.49, .351, 2.94, M.ceramic, .55);
  K.box(10.68, .351, 2.70, .207, .025, .157, M.paper, { r: .005, rot: [0, -.17, 0] });
  K.box(10.67, .373, 2.695, .228, .006, .166, bookMats[1], { r: .003, rot: [0, -.17, 0] });
  K.lathe(11.45, .264, 2.64, [[0, 0], [.097, 0], [.106, .018], [.103, .027], [.074, .026], [.067, .01], [0, .01]], M.ceramic);

  // 靠书房一侧的低柜和蓝色玻璃灯。
  K.box(6.18, .08, .68, .42, .29, 1.32, walnutFront, { r: .014 });
  K.box(6.146, .346, .647, .505, .034, 1.39, charcoalStone, { r: .008 });
  for (let i = 0; i < 3; i++) K.box(6.36, .38 + i * .021, 1.48, .20, .021, .325, [M.paper, M.char, bookMats[4]][i], { r: .004 });
  K.box(6.25, .38, .82, .25, .069, .44, blackened, { r: .012 });
  K.box(6.272, .427, .84, .21, .147, .4, K.glow(0x5ca8cf, 1.75, .11, 0x477d94), { r: .036, cast: false });
  K.point(0x83c7ea, .57, 1.9, [6.63, .61, 1.08]);
  K.plant(7.11, 0, .49, { pot: .206, potH: .33, n: 9, h: 1.02, leaf: [.37, .19], potMat: M.pot2, leafMats: M.leaf, stemMat: M.stem, spread: .34, seed: 7 });
  K.plant(13.91, 0, 5.49, { pot: .235, potH: .46, n: 8, h: 1.11, leaf: [.35, .20], potMat: M.pot2, leafMats: M.leaf, stemMat: M.stem, spread: .36, seed: 21 });

  // 上层退到餐厅侧，幕墙前留下通高的客厅。
  const loftDepth = LOFT.end - LOFT.z, loftWidth = W - LOFT.x - .08;
  K.box(LOFT.x, LY - .24, LOFT.z, loftWidth, .236, loftDepth, M.conc);
  floorRect(LOFT.x, LOFT.z, loftWidth, loftDepth, M.floor, 3.5, LY);
  K.box(LOFT.x, LY - .278, LOFT.z, loftWidth, .045, loftDepth, M.walnut, { cast: false });
  K.box(LOFT.x, LY - .286, LOFT.z - .032, loftWidth, .287, .095, blackened, { r: .009 });
  K.box(LOFT.x + .04, LY - .285, LOFT.z + .097, loftWidth - .13, .007, .028, K.glow(0xffcb99, 1.98, .14), { cast: false });
  K.rect(0xffcc9c, 2.55, 5.9, .45, [8.96, LY - .31, 5.40], [8.96, .5, 4.4], { day: .31 });
  K.spot(0xffd2a7, 12, 5.2, [7.70, LY - .27, 5.31], [7.86, .65, 4.83], .72, { day: 1.5 });
  for (const x of [6.15, 13.22]) K.box(x, 0, 6.05, .14, LY - .24, .15, blackened);

  // 双挑高窗的梁、吊索和窄光槽。
  const pendantY = 4.46;
  K.box(8.17, WH - .22, .02, .115, .19, 4.62, blackened);
  K.box(13.26, WH - .22, .02, .115, .19, 4.62, blackened);
  const diffuser = K.glow(0xffdfb8, 2.35, .21, 0xe1cab0);
  for (const [z, x, length] of [[2.63, 8.98, 3.89], [3.14, 9.57, 3.43]]) {
    K.box(x, pendantY, z, length, .065, .096, blackened, { r: .017 });
    K.box(x + .04, pendantY - .008, z + .025, length - .08, .011, .047, diffuser, { cast: false });
    for (const xx of [x + .35, x + length - .35]) K.cyl(xx, pendantY + .055, z + .047, .005, .005, WH - pendantY - .085, blackened, { seg: 8, cast: false });
  }
  K.rect(0xffdcba, 2.9, 3.6, .44, [10.96, pendantY - .04, 2.95], [10.96, .2, 2.95], { day: .65 });
  K.spot(0xffd8b9, 29, 8, [10.74, pendantY - .07, 2.87], [10.82, .16, 3.03], .69, { day: 2.1, shadow: 1024 });
  K.spot(0xb2d5f3, 15, 8, [12.72, 4.90, .72], [10.22, .15, 3.42], .62, { day: 1.9 });

  // 夹层沿挑空侧设玻璃栏杆，右端开口通向楼梯。
  const glassRail = facadeGlass.clone(); glassRail.opacity = .11;
  const loftRail = (supports, center, alongZ, trimStart = 0, trimEnd = 0) => {
    const box = (from, to, y, height, width) => alongZ
      ? K.box(center - width / 2, y, from, width, height, to - from, blackened)
      : K.box(from, y, center - width / 2, to - from, height, width, blackened);
    const start = supports[0] - .018 + trimStart, end = supports.at(-1) + .018 - trimEnd;
    box(start, end, LY + .053, .020, .038);
    box(start, end, LY + .929, .047, .052);
    for (let i = 0; i < supports.length; i++) {
      const s = supports[i];
      if ((i > 0 || !trimStart) && (i < supports.length - 1 || !trimEnd)) box(s - .018, s + .018, LY, .929, .036);
      if (i) K.glassPane(supports[i - 1] + .020, s - .020, LY + .075, LY + .927, center, glassRail, { alongZ });
    }
  };
  const lx = LOFT.x + .036, rx = W - .127, front = LOFT.z + .047, rear = LOFT.end - .053;
  loftRail([lx, 7.39, 8.72, 10.06, 11.40, 12.73, STAIR.x - .077], front, false);
  loftRail([lx, 8.38, 10.77, 13.16, rx], rear, false);
  loftRail([front, (front + rear) / 2, rear], lx, true, .044, .044);
  loftRail([front, (front + rear) / 2, rear], rx, true, 0, .044);

  const { x: stairX, width: stairW, start, end, steps } = STAIR;
  const run = (end - start) / steps, rise = LY / steps;
  const treadLED = K.glow(0xffbb86, 1.56, .13);
  for (let i = 0; i < steps; i++) {
    const y = i * rise, z = start + i * run;
    K.box(stairX, y + .025, z, stairW, rise - .025, run + .008, charcoalStone, { r: .008 });
    K.box(stairX + .019, y + rise - .031, z + .009, stairW - .038, .031, run - .002, M.walnut, { r: .007 });
    if (i % 2 === 0) K.box(stairX + .095, y + rise - .052, z - .002, stairW - .17, .009, .012, treadLED, { cast: false, noNav: true });
  }
  for (const x of [stairX - .028, stairX + stairW + .001]) {
    K.tube([[x, .96, start], [x, LY + .96, end]], .023, blackened, { seg: 7, noNav: true });
    for (const t of [.03, .35, .66, .99]) K.box(x - .013, LY * t + .02, start + (end - start) * t, .026, .97, .032, blackened);
  }

  // 楼上观景座位和望远镜。
  const loftSeatX = 7.34, loftSeatZ = 5.745;
  K.box(loftSeatX, LY + .024, loftSeatZ, 2.04, .12, .77, M.walnut, { r: .017 });
  K.cushion(loftSeatX + .025, LY + .136, loftSeatZ + .015, 1.99, .201, .724, upholstery, { puff: .21, seed: 31 });
  K.cushion(loftSeatX + .05, LY + .295, loftSeatZ + .571, 1.94, .27, .17, seatLinen, { puff: .31, seed: 41, rot: [-.14, 0, 0] });
  K.cushion(loftSeatX + 1.52, LY + .34, loftSeatZ + .37, .37, .115, .367, ochre, { puff: .54, seed: 42, rot: [.96, -.35, 0] });
  K.cyl(9.75, LY, 6.18, .16, .17, .066, blackened);
  K.lathe(9.75, LY + .057, 6.18, [[0, 0], [.11, 0], [.132, .06], [.126, .238], [.095, .286], [0, .289]], K.glow(0xffd8ad, .81, .09, 0xd0baa0), { cast: false });
  K.point(0xffcb9b, 1.1, 2.5, [9.75, LY + .26, 6.15]);

  { const ax = [12.57, LY + .91, 5.11];
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2 + .3;
      K.tube([[ax[0] + Math.cos(a) * .27, LY, ax[2] + Math.sin(a) * .27], ax], .014, smokedBronze, { seg: 3 });
    }
    K.sph(ax[0], ax[1] + .02, ax[2], .045, blackened);
    const g = K.group(ax[0], ax[1] + .09, ax[2]); K.in(g, () => {
      K.cyl(0, -.33, 0, .075, .059, .66, M.steelB);
      K.cyl(0, .31, 0, .083, .083, .047, blackened);
      K.cyl(0, .356, 0, .068, .068, .005, M.blackGlass);
      K.cyl(0, -.42, 0, .027, .027, .09, blackened);
    });
    g.rotation.set(-1.12, 0, .075);
  }
  K.plant(10.72, LY, 6.35, { pot: .15, potH: .29, n: 8, h: .62, leaf: [.25, .16], potMat: M.pot2, leafMats: M.leaf, stemMat: M.stem, spread: .21, seed: 33 });

  // ---------- 厨房 + 餐厅 ----------
  K.box(5.2, .04, 6.15, .9, 1.96, .8, M.fridge, { r: .035, seg: 4 }); K.box(5.2, 1.26, 6.945, .9, .008, .008, M.char, { cast: false });
  K.box(5.98, 1.34, 6.955, .022, .5, .03, M.steelB, { r: .01 }); K.box(5.98, .66, 6.955, .022, .5, .03, M.steelB, { r: .01 });
  for (const [x, y, c] of [[5.35, 1.6, 0xff6fb5], [5.5, 1.72, 0x7cf2c4], [5.62, 1.55, 0xffd166]]) K.box(x, y, 6.952, .07, .07, .006, std({ color: c, roughness: .5 }), { cast: false });
  K.box(5.42, 1.42, 6.952, .2, .26, .003, M.paper, { cast: false, rot: [0, 0, .05] });
  K.box(6.32, 0, 6.22, 2.36, .1, .64, M.char); K.box(6.3, .1, 6.17, 2.4, .76, .74, M.cabinet, { r: .008 });
  for (let i = 0; i < 4; i++) { K.box(6.31 + i * .598, .115, 6.91, .586, .73, .018, M.cabinet, { r: .006 }); K.box(6.33 + i * .598 + (i % 2 ? 0 : .45), .79, 6.93, .1, .014, .014, M.brass); }
  K.box(6.27, .86, 6.13, 2.46, .045, .84, M.counter, { r: .012 });
  K.box(6.32, .02, 6.9, 2.36, .012, .012, K.glow(WARM, 5, .3), { cast: false }); K.point(WARM, 1.2, 2, [7.5, .1, 7.2]);
  // 灶台 + 锅
  K.box(6.5, .905, 6.28, .72, .006, .5, M.blackGlass, { cast: false });
  const burner = K.glow(0xff5a1e, 0, 0); for (const x of [6.69, 7.03]) K.torus(x, .912, 6.55, .1, .008, burner, { rot: [Math.PI / 2, 0, 0], cast: false });
  K.lathe(6.69, .912, 6.55, [[0, 0], [.13, 0], [.14, .012], [.14, .13], [.146, .136], [.132, .136], [.13, .016], [0, .016]], M.steelB); K.cyl(6.69, 1.045, 6.55, .14, .14, .012, M.steelB); K.sph(6.69, 1.07, 6.55, .02, M.char);
  for (const s of [-1, 1]) K.box(6.69 + s * .16 - .02, 1.01, 6.535, .04, .014, .03, M.char);
  // 水槽 + 龙头
  K.box(7.5, .9, 6.3, .56, .008, .42, M.steelB, { r: .003 }); K.box(7.53, .9, 6.33, .5, .009, .36, std({ color: 0x3b3f46, metalness: 1, roughness: .35 }), { cast: false });
  K.tube([[7.78, .905, 6.25], [7.78, 1.2, 6.25], [7.78, 1.27, 6.32], [7.78, 1.2, 6.42], [7.78, 1.14, 6.43]], .014, M.chrome, { seg: 24 }); K.cyl(7.86, .905, 6.25, .012, .012, .06, M.chrome);
  // 水壶、刀架、厨具、瓶罐、菜板、厨房纸
  { const km = std({ color: 0x8fae9a, roughness: .35 }); K.lathe(8.25, .905, 6.5, [[0, 0], [.1, 0], [.115, .03], [.105, .13], [.06, .18], [.03, .19], [0, .19]], km); K.sph(8.25, 1.105, 6.5, .016, M.char); K.torus(8.25, 1.07, 6.5, .08, .008, M.char, { arc: Math.PI, rot: [0, .4, 0] }); K.mesh(new THREE.ConeGeometry(.02, .1, 10), km, 8.36, 1.03, 6.46, { rot: [0, 0, -1.0] }); }
  K.cyl(8.52, .905, 6.3, .06, .05, .13, M.ceramic); for (let i = 0; i < 4; i++) K.cyl(8.5 + i * .014, .97, 6.29 + (i % 2) * .02, .006, .006, .22, [M.oak, M.steelB, M.oak, M.char][i], { rot: [rnd(-.2, .2), 0, rnd(-.2, .2)] });
  K.box(6.32, .905, 6.2, .14, .2, .1, M.walnut, { r: .01, rot: [-.2, 0, 0] }); for (let i = 0; i < 3; i++) K.box(6.34 + i * .04, 1.09, 6.2, .016, .07, .02, M.char);
  bottle(7.22, .905, 6.24, std({ color: 0x2f5a3a, roughness: .1, transparent: true, opacity: .85 })); bottle(7.33, .905, 6.26, std({ color: 0x8a4a1f, roughness: .1, transparent: true, opacity: .85 }), .85); bottle(7.13, .905, 6.28, M.ceramic, .7);
  K.box(8.05, .905, 6.17, .34, .44, .022, M.oak, { r: .01, rot: [-.12, 0, 0] }); K.cyl(8.6, .905, 6.72, .055, .055, .24, M.paper); K.cyl(8.6, .905, 6.72, .07, .07, .012, M.walnut);
  K.box(6.5, 0, 7.05, 2.0, .014, .58, fab(0x8f8474, 10), { cast: false, r: .005 });
  K.spot(WARM2, 14, 6, [7.5, 2.9, 7.7], [7.5, .9, 6.6], .7, { pen: 1, day: 0 });
  // 矮墙搁板上的小物
  K.plant(5.4, 1.365, 6.0, { pot: .08, potH: .12, n: 8, h: .24, leaf: [.15, .09], potMat: M.pot, leafMats: M.leaf, stemMat: M.stem, spread: .18, seed: 51 });
  for (const [x, c] of [[6.5, 0xd9c7a3], [6.66, 0xb5674a], [6.8, 0xe8e2d6]]) { K.cyl(x, 1.365, 6.0, .05, .05, .13 + (x % .1), std({ color: c, roughness: .4, transparent: true, opacity: .9 })); K.cyl(x, 1.495 + (x % .1), 6.0, .052, .052, .02, M.oak); }
  books(8.2, 8.75, 1.365, 5.92, { d: .15 }); K.plant(9.0, 1.365, 6.0, { pot: .07, potH: .1, n: 7, h: .2, leaf: [.12, .07], potMat: M.potT, leafMats: M.leaf, stemMat: M.stem, spread: .15, seed: 55 });
  // 餐桌
  K.mesh(new THREE.ExtrudeGeometry(rr(1.8, 1.2, .1), { depth: .045, bevelEnabled: true, bevelSize: .008, bevelThickness: .008, bevelSegments: 2 }).rotateX(-Math.PI / 2), M.oak, 9.8, .71, 8.0);
  for (const x of [9.12, 10.44]) { K.box(x, 0, 7.55, .045, .71, .045, M.steel); K.box(x, 0, 8.4, .045, .71, .045, M.steel); K.box(x, .66, 7.55, .045, .045, .9, M.steel); K.box(x, .03, 7.55, .045, .03, .9, M.steel); }
  const chair = (x, z, ry, mat) => { const g = K.group(x, 0, z, ry); K.in(g, () => { for (const [a, b] of [[-.17, -.17], [.17, -.17], [-.17, .17], [.17, .17]]) K.tube([[a * 1.15, 0, b * 1.15], [a * .8, .44, b * .8]], .016, M.oak, { seg: 3 }); K.box(-.22, .44, -.21, .44, .05, .42, mat, { r: .024, seg: 4 }); K.box(-.22, .5, -.24, .44, .4, .05, mat, { r: .024, seg: 4, rot: [-.16, 0, 0] }); }); };
  chair(9.35, 7.44, 0, std({ color: 0xe6e0d6, roughness: .5 })); chair(10.25, 7.44, 0, std({ color: 0x2f6f78, roughness: .5 }));
  K.box(9.05, .4, 8.86, 1.5, .05, .34, M.oak, { r: .015 }); for (const x of [9.15, 10.4]) { K.box(x, 0, 8.9, .04, .4, .04, M.steel); K.box(x, 0, 9.12, .04, .4, .04, M.steel); } K.box(9.08, .45, 8.88, 1.44, .035, .3, M.charF, { r: .016 });
  // 水果、餐具、花瓶
  K.lathe(9.8, .758, 8.0, [[0, 0], [.08, 0], [.17, .07], [.19, .1], [.18, .1], [.16, .075], [.075, .012], [0, .012]], M.ceramic);
  for (const [dx, dz, c, r] of [[0, 0, 0xe8862e, .055], [.08, .03, 0xc0392b, .05], [-.07, .05, 0x8fbf4a, .05], [.02, -.08, 0xe8c12e, .048], [.0, .02, 0xc0392b, .045]]) K.sph(9.8 + dx, .84 + (dx === 0 && dz === .02 ? .07 : 0), 8.0 + dz, r, std({ color: c, roughness: .45 }));
  for (const [x, z] of [[9.35, 7.62], [10.25, 7.62], [9.8, 8.42]]) { K.cyl(x, .758, z, .2, .2, .004, fab(0x6c7a8f, 3), { cast: false }); K.lathe(x, .763, z, [[0, 0], [.09, 0], [.14, .016], [.135, .02], [.085, .008], [0, .008]], M.ceramic); K.cyl(x + .2, .758, z - .1, .028, .024, .1, std({ color: 0xcfe6f2, transparent: true, opacity: .4, roughness: .05 })); }
  K.lathe(10.42, .758, 8.3, [[0, 0], [.05, 0], [.07, .1], [.03, .2], [.035, .26], [0, .26]], std({ color: 0x33475f, roughness: .3 })); for (let i = 0; i < 7; i++) K.tube([[10.42, 1.0, 8.3], [10.42 + rnd(-.12, .12), 1.3 + rnd(0, .2), 8.3 + rnd(-.12, .12)]], .004, std({ color: 0xc9a063, roughness: .8 }), { seg: 2, rs: 4 });
  // 吊灯
  K.cyl(11.55, 0, 7.25, .15, .17, .04, M.steel);
  K.cyl(11.55, .04, 7.25, .016, .016, 1.86, M.brass);
  K.tube([[11.55, 1.90, 7.25], [11.27, 2.51, 7.45], [10.45, 2.62, 7.75], [9.8, 2.3, 8.0]], .016, M.brass, { seg: 32 });
  K.cyl(9.8, 2.03, 8.0, .004, .004, .27, M.char, { cast: false });
  K.lathe(9.8, 1.78, 8.0, [[.025, .26], [.05, .25], [.13, .2], [.25, .07], [.28, 0]], std({ color: 0x1a1b20, metalness: .5, roughness: .4, side: THREE.DoubleSide }));
  K.lathe(9.8, 1.781, 8.0, [[.03, .25], [.12, .2], [.24, .07], [.275, .002]], K.glow(WARM, .9, .05, 0xc9a063), { cast: false }).material.side = THREE.BackSide;
  K.sph(9.8, 1.85, 8.0, .045, K.glow(WARM2, 4, .3), { cast: false });
  K.spot(WARM, 24, 8, [9.8, 1.86, 8.0], [9.8, 0, 8.0], 1.05, { shadow: 1024, pen: .7, day: 4 });
  K.cyl(5.5, 0, 7.4, .14, .12, .4, M.steelB); K.cyl(5.5, .4, 7.4, .145, .145, .02, M.char);

  buildTerrace(K, M, floorRect, atriumWood, W, D);

  // ---------- 卫生间 ----------
  K.box(.32, .42, 6.1, .56, .44, .2, M.ceramic, { r: .045, seg: 4 }); K.cyl(.6, .862, 6.2, .03, .03, .012, M.chrome);
  K.lathe(.6, 0, 6.68, [[0, 0], [.13, 0], [.15, .04], [.14, .22], [.2, .36], [.215, .41], [0, .41]], M.ceramic, { scale: [1, 1, 1.32] }); K.cyl(.6, .41, 6.68, .22, .22, .03, M.ceramic, { scale: [1, 1, 1.32], seg: 36 });
  K.box(1.6, .22, 6.1, 1.1, .56, .6, M.oak, { r: .012 }); K.box(1.62, .5, 6.7, 1.06, .006, .006, M.char, { cast: false }); K.box(1.57, .78, 6.08, 1.16, .05, .66, M.counter, { r: .012 });
  K.lathe(2.15, .83, 6.42, [[0, 0], [.1, 0], [.19, .1], [.2, .13], [.185, .13], [.17, .1], [.09, .014], [0, .014]], M.ceramic);
  K.tube([[2.15, .83, 6.18], [2.15, 1.1, 6.18], [2.15, 1.14, 6.25], [2.15, 1.1, 6.33]], .012, M.brass, { seg: 20 });
  bottle(1.75, .83, 6.3, std({ color: 0xd9a3b3, roughness: .3 }), .6); K.cyl(2.52, .83, 6.3, .035, .03, .09, M.ceramic); K.cyl(2.52, .86, 6.3, .004, .004, .14, std({ color: 0x5f7fb8 }), { rot: [.2, 0, .2] });
  K.plant(1.72, .83, 6.56, { pot: .05, potH: .08, n: 7, h: .16, leaf: [.1, .06], potMat: M.pot2, leafMats: M.leaf, stemMat: M.stem, spread: .12, seed: 61 });
  // 圆镜（灯圈）
  K.cyl(2.15, 1.19, 6.0, .016, .016, .2, M.steel); K.cyl(2.15, 1.76, 6.02, .37, .37, .02, M.steel, { rot: [Math.PI / 2, 0, 0], seg: 48 }); K.cyl(2.15, 1.76, 6.034, .34, .34, .006, M.mirror, { rot: [Math.PI / 2, 0, 0], seg: 48 });
  K.torus(2.15, 1.76, 6.04, .355, .012, K.glow(0xeaf4ff, 5, 1), { cast: false });
  K.point(0xe6f1ff, 6.5, 6, [2.15, 1.76, 6.45], { day: 1 });
  // 浴缸
  { const outer = rr(2.4, 1.8, .55), inner = rr(2.2, 1.6, .47); outer.holes.push(new THREE.Path(inner.getPoints(24).reverse()));
    K.mesh(new THREE.ExtrudeGeometry(outer, { depth: .54, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 3, curveSegments: 20 }).rotateX(-Math.PI / 2), M.ceramic, 1.4, .05, 8.8);
    K.mesh(new THREE.ShapeGeometry(inner, 20).rotateX(-Math.PI / 2), M.ceramic, 1.4, .09, 8.8); K.mesh(new THREE.ShapeGeometry(inner, 20).rotateX(-Math.PI / 2), M.water, 1.4, .47, 8.8, { order: 2 });
    const fm = std({ color: 0xffffff, roughness: 1 }); for (let i = 0; i < 46; i++) { const a = rnd(0, 6.3), r2 = Math.sqrt(R()); K.sph(1.4 + Math.cos(a) * r2 * .95 - .1, .47 + rnd(0, .04), 8.8 + Math.sin(a) * r2 * .6, rnd(.04, .1), fm, { seg: 10, seg2: 8, cast: false }); }
    K.tube([[2.78, 0, 8.2], [2.78, .95, 8.2], [2.72, 1.02, 8.2], [2.5, 1.0, 8.2], [2.44, .92, 8.2]], .018, M.chrome, { seg: 28 }); K.cyl(2.78, 0, 8.2, .05, .06, .02, M.chrome); }
  K.box(2.85, 0, 8.6, .62, .028, .95, plush(0xf2efe9, 4), { r: .012, cast: false });
  // 洗衣机 + 脏衣篮
  K.box(3.58, .02, 8.58, .66, .86, .64, M.white, { r: .03, seg: 4 }); K.torus(3.91, .44, 9.225, .2, .028, M.chrome); K.cyl(3.91, .44, 9.222, .19, .19, .01, std({ color: 0x10141c, roughness: .05, metalness: .3 }), { rot: [Math.PI / 2, 0, 0] });
  K.box(3.62, .78, 9.222, .58, .07, .006, M.char, { cast: false }); K.box(4.0, .8, 9.228, .12, .03, .002, K.glow(CYAN, 3, 1.5), { cast: false }); K.cyl(3.72, .815, 9.225, .025, .025, .012, M.chrome, { rot: [Math.PI / 2, 0, 0] });
  K.cyl(3.9, .88, 8.9, .22, .19, .26, std({ color: 0xc9b79c, roughness: .9 }), { seg: 24 }); K.sph(3.86, 1.15, 8.9, .15, M.pink, { scale: [1.2, .5, 1] }); K.sph(3.98, 1.17, 8.86, .11, M.sheet, { scale: [1.2, .6, 1] });
  // 毛巾架、壁灯、小凳和蜡烛、虎尾兰
  K.in(west, () => {
    K.cyl(.09, 1.5 - .6, 8.7, .012, .012, 1.2, M.chrome, { rot: [Math.PI / 2, 0, 0] }); for (const z of [8.12, 9.28]) K.cyl(.045, 1.5, z, .01, .01, .09, M.chrome, { rot: [0, 0, Math.PI / 2] });
    K.box(.062, .98, 8.2, .055, .54, .44, M.teal, { r: .024 }); K.box(.062, 1.08, 8.74, .055, .44, .4, M.pink, { r: .024 });
    K.cyl(.1, 2.5, 7.75, .05, .05, .04, M.brass, { rot: [0, 0, Math.PI / 2] }); K.sph(.2, 2.5, 7.75, .1, K.glow(WARM, 3, .15, 0xfff4e2), { cast: false });
  });
  K.point(WARM, 3, 6, [.4, 2.45, 7.75]);
  K.cyl(3.15, 0, 9.55, .15, .13, .36, M.oak, { seg: 24 }); K.cyl(3.15, .36, 9.55, .035, .035, .08, M.paper); K.sph(3.15, .465, 9.55, .014, K.glow(0xffb040, 9, 2), { cast: false });
  const candle = K.point(0xffa040, 1.0, 2.4, [3.15, .5, 9.55]); K.tickers.push((dt, t) => { if (K.mode === 'night') candle.intensity = 1.0 + Math.sin(t * 13) * .12 + Math.sin(t * 7.3) * .1; });
  { K.lathe(4.5, 0, 9.55, [[0, 0], [.15, 0], [.19, .34], [.17, .34], [0, .3]], M.pot2); for (let i = 0; i < 9; i++) { const m = K.mesh(K.leafGeo(rnd(.5, .95), .09, rnd(-.04, .08)), pick(M.leaf), 4.5 + rnd(-.07, .07), .3, 9.55 + rnd(-.07, .07)); m.rotation.order = 'YXZ'; m.rotation.y = rnd(0, 6.3); m.rotation.x = rnd(-.12, .12); } }
  K.box(1.0, 0, 7.35, .5, .02, .34, plush(0x8fae9a, 3), { r: .008, cast: false });

  // ---------- 猫的东西（坐标和 life.js 的 LAYOUT.catSpots 一致）----------
  {
    // 猫窝：照着境辰家那个——麻绳一圈圈编的椭圆篮子，两边皮提手，里面铺灰色毛毯
    const rope = TX.draw(64, 256, (g, w, h) => {
      g.fillStyle = '#c5ab88'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 6) { g.fillStyle = 'rgba(90,70,45,.35)'; g.fillRect(0, y, w, 1.5); g.fillStyle = 'rgba(255,245,225,.25)'; g.fillRect(0, y + 2, w, 1.5); }
      g.fillStyle = '#ece4d4'; g.fillRect(0, h * .05, w, h * .16); for (let y = h * .05; y < h * .21; y += 6) { g.fillStyle = 'rgba(120,100,70,.25)'; g.fillRect(0, y, w, 1.5); }
    });
    rope.wrapS = rope.wrapT = THREE.RepeatWrapping; rope.repeat.set(10, 1);
    const ropeM = std({ map: rope, roughness: .95 });
    // 放在卧室北墙下、衣柜和书桌之间的凹角（原来放餐厅东南角，把进餐厅唯一那条贴东墙的过道堵死了）
    const bx = 2.1, bz = .55;
    const basket = K.lathe(bx, 0, bz, [[0, 0], [.27, 0], [.3, .02], [.315, .1], [.31, .2], [.29, .21], [.28, .19], [.275, .1], [.25, .045], [0, .045]], ropeM, { seg: 40 });
    basket.scale.set(1.18, 1, 1);
    const blanket = K.lathe(bx, 0, bz, [[0, .05], [.16, .055], [.22, .07], [.26, .11], [.275, .17], [.29, .2]], plush(0x8c9096, 2), { seg: 36 });
    blanket.scale.set(1.16, 1, 1); blanket.material.side = THREE.DoubleSide;
    const leather = std({ color: 0x8a5634, roughness: .55 });
    for (const s of [-1, 1]) { K.box(bx + s * .37 - .02, .17, bz - .06, .04, .06, .12, leather, { r: .01 }); K.cyl(bx + s * .375, .2, bz - .035, .008, .008, .005, M.brass, { rot: [0, 0, Math.PI / 2] }); }
    // 猫碗：木托盘上一只粮碗一只水碗
    const cx = 5.45, cz = 9.6; // 厨房西南角的空地（放餐桌南边会把餐厅东西两半切断）
    K.box(cx - .22, 0, cz - .11, .44, .02, .22, M.oak, { r: .008 });
    const bowl = [[0, 0], [.055, 0], [.075, .05], [.068, .05], [.052, .012], [0, .012]];
    K.lathe(cx - .1, .02, cz, bowl, M.ceramic, { seg: 28 });
    K.lathe(cx + .1, .02, cz, bowl, phys({ color: 0x9cc4d8, roughness: .12, clearcoat: 1, clearcoatRoughness: .05 }), { seg: 28 });
    K.sph(cx - .1, .05, cz, .05, std({ color: 0x8a5a32, roughness: .9 }), { scale: [1, .28, 1], seg: 16 });
    K.cyl(cx + .1, .048, cz, .058, .058, .002, std({ color: 0xa8d8ee, transparent: true, opacity: .6, roughness: .02 }), { cast: false });
    // 猫砂盆（卫生间门边的东北角；东南角已经有盆绿植）
    const lm = std({ color: 0x9fb3c2, roughness: .45 }), lx = 4.32, lz = 6.27, lw = .38, ld = .5, lh = .14, th = .015;
    K.box(lx, 0, lz, lw, .02, ld, lm); K.box(lx, 0, lz, th, lh, ld, lm); K.box(lx + lw - th, 0, lz, th, lh, ld, lm); K.box(lx, 0, lz, lw, lh, th, lm); K.box(lx, 0, lz + ld - th, lw, lh, th, lm);
    K.box(lx + th, .02, lz + th, lw - 2 * th, .07, ld - 2 * th, std({ color: 0xd8ccb2, roughness: 1 }), { cast: false });
  }

  return {
    materials: M,
    sunWindows,
    updateCutaway(eye) {
      west.visible = eye.x >= -.04;
      north.visible = eye.z >= -.04;
      east.visible = eye.x <= W + .10;
      corner.visible = north.visible || east.visible;
    },
    setSleep(b) {
      duvetFlat.visible = bedFold.visible = runnerTop.visible = runnerSide.visible = accentPillow.visible = !b;
      for (const pillow of pillows) pillow.visible = !b;
      duvetSleep.visible = sleepPillow.visible = b;
    },
    duvetSleep,
    setCooking(b) { burner.userData.I.night = burner.userData.I.day = b ? 5 : 0; burner.emissiveIntensity = b ? 5 : 0; },
  };
}

// ---------- 窗外的城市 ----------
export function buildCity(K, scene) {
  const R = TX.mulberry(77), rnd = (a, b) => a + R() * (b - a), pick = (a) => a[Math.floor(R() * a.length)];
  const g = new THREE.Group(); scene.add(g);
  const cladding = ['#8497a1', '#9aabae', '#768b9a', '#a3a7a8'];
  const mats = cladding.map((color, i) => {
    const windows = TX.cityWindows(i + 1, .07 + i * .026);
    const facade = TX.cityWindows(i + 1, 0, color);
    const m = new THREE.MeshStandardMaterial({ map: facade, color: 0x657898, roughness: .67, metalness: .16, emissive: 0xffffff, emissiveMap: windows, emissiveIntensity: .78 });
    m.userData.I = { night: .78, day: 0 };
    K.glows.push(m);
    return m;
  });
  K.onMode.push((mode) => { for (const m of mats) m.color.setHex(mode === 'night' ? 0x657898 : 0xe0e4e6); });
  const rooftop = new THREE.MeshStandardMaterial({ color: 0x53616d, roughness: .89 });
  const signs = ['夜', '酒', '光', '海', '空', '宿', '湯', '星', 'OPEN', '24h', 'BAR', 'RAMEN', 'HOTEL', 'ゆ'];
  const signCols = ['#ff3d9a', '#2de2ff', '#ffb36b', '#8a5cff', '#7cf2c4', '#ff5a5a'];
  const towers = [];
  const build = (x, z, w, d, h, top) => {
    const tower = new THREE.Group(); g.add(tower); towers.push(tower);
    const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv, nrm = geo.attributes.normal;
    for (let i = 0; i < uv.count; i++) { const side = Math.abs(nrm.getX(i)) > .5 ? d : w; if (Math.abs(nrm.getY(i)) > .5) uv.setXY(i, 0, 0); else uv.setXY(i, uv.getX(i) * side / 10, uv.getY(i) * h / 22); }
    const m = new THREE.Mesh(geo, pick(mats)); m.position.set(x, top - h / 2, z); tower.add(m);
    if (top < 1 && Math.hypot(x - 8, z) < 38) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w + .12, .20, d + .12), rooftop);
      slab.position.set(x, top + .02, z); tower.add(slab);
    }
    if (R() < .3) { const c = pick([0xff3d9a, 0x2de2ff, 0x8a5cff, 0xff5a5a, 0xffb36b]); const s = new THREE.Mesh(new THREE.BoxGeometry(w + .1, .25, d + .1), K.glow(c, 3.5, .1)); s.position.set(x, top - rnd(.5, 6), z); tower.add(s); }
    if (R() < .35) { const a = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 4), new THREE.MeshStandardMaterial({ color: 0x222233 })); a.position.set(x + rnd(-w / 3, w / 3), top + 2, z); tower.add(a); const b = new THREE.Mesh(new THREE.SphereGeometry(.16), K.glow(0xff2a3d, 8, .5)); b.position.set(a.position.x, top + 4, z); tower.add(b); }
    return tower;
  };
  const addSign = (tower, x, y, z, ry) => {
    const txt = pick(signs), col = pick(signCols);
    const t = TX.neonText(txt, col, { w: txt.length > 2 ? 512 : 256, h: 256, fs: txt.length > 2 ? 120 : 180, weight: 700 });
    const w = txt.length > 2 ? rnd(3, 5) : rnd(2, 3.2), h = txt.length > 2 ? w / 2 : w;
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    K.onMode.push((mode) => m.color.setScalar(mode === 'night' ? 1.5 : .25));
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.y = ry; p.userData.noAO = true; tower.add(p);
    const bk = new THREE.Mesh(new THREE.PlaneGeometry(w + .4, h + .2), new THREE.MeshStandardMaterial({ color: 0x07080f, roughness: .5 })); bk.position.copy(p.position); bk.rotation.y = ry; bk.translateZ(-.08); tower.add(bk);
  };
  // 西面（x<0）和北面（z<0）两片楼群：近处矮一些，远处高低错落
  // 北面（幕墙正对的方向）更密更高：像住在高层，脚下一片楼顶，远处一排摩天楼
  for (let i = 0; i < 170; i++) {
    const west = i % 3 === 0, dist = 6 + Math.pow(R(), 1.3) * 90, along = rnd(-55, west ? 6 : 30);
    const x = west ? -dist : along, z = west ? along - 12 : -dist;
    // 幕墙正前方 45m 以内的楼都比地板矮：从屋里看出去是“越过一片楼顶看远处的摩天楼”
    const front = !west && x > -18 && x < 36 && dist < 45;
    const near = dist < 16, w = near ? rnd(3, 7) : rnd(4, 10), d = near ? rnd(3, 8) : rnd(4, 10);
    const top = front ? rnd(-17, near ? -5.5 : -1.5) : near ? rnd(-11, 1.5) : dist < 35 ? rnd(-8, 22) : rnd(5, 55);
    const tower = build(x, z, w, d, 110, top);
    if (dist < 45 && R() < .55 && (west ? z < 4 : x < 22)) { if (west) addSign(tower, x + w / 2 + .12, top - rnd(2, 9), z + rnd(-d / 4, d / 4), Math.PI / 2); else addSign(tower, x + rnd(-w / 4, w / 4), top - rnd(2, 9), z + d / 2 + .12, 0); }
  }
  // The second wall of glazing looks out over a different part of the city.
  for (let i = 0; i < 36; i++) {
    const dist = rnd(9, 78), x = TERRACE.right + dist, z = rnd(-28, 36);
    const top = dist < 26 ? rnd(-13, -3.9) : rnd(4, 38);
    const w = rnd(4, 9), d = rnd(3.4, 10);
    const tower = build(x, z, w, d, 108, top);
    if (dist > 22 && dist < 48 && R() < .26) addSign(tower, x - w / 2 - .12, top - rnd(2, 8), z, -Math.PI / 2);
  }
  // 最远处一层天际线（不受雾影响），让整面玻璃外面始终是一片密密的城市
  {
    const tex = { night: TX.skylineTex('night', 5), day: TX.skylineTex('day', 5) }, tex2 = { night: TX.skylineTex('night', 9), day: TX.skylineTex('day', 9) };
    const mk = (t, w, h, pos, ry) => { const m = new THREE.MeshBasicMaterial({ map: t.night, transparent: true, depthWrite: false, fog: false }); const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(...pos); p.rotation.y = ry; p.renderOrder = -1; p.userData.noAO = true; g.add(p); K.onMode.push((mode) => { m.map = t[mode]; m.needsUpdate = true; }); };
    mk(tex, 340, 85, [10, 22, -125], 0);
    mk(tex2, 300, 85, [-125, 22, -10], Math.PI / 2);
    mk(tex2, 260, 85, [142, 20, -8], -Math.PI / 2);
  }
  // 远处楼面上的几块全息广告屏：抽象的流动渐变 + 扫描线（不放任何真实品牌）
  {
    const holo = (w, h, pos, c1, c2, seed) => {
      const m = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 }, a: { value: new THREE.Color(c1) }, b: { value: new THREE.Color(c2) }, I: { value: 1 }, s: { value: seed } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `uniform float t, I, s; uniform vec3 a, b; varying vec2 vUv;
          void main(){ vec2 u=vUv; float band=.5+.5*sin(u.y*9.+t*1.3+s+sin(u.x*4.+t*.7)*1.5);
            float blob=1.-smoothstep(0.,.35,length((u-vec2(.5+.25*sin(t*.4+s),.55+.2*cos(t*.33+s)))*vec2(1.,.6)));
            vec3 c=mix(a,b,band)*(.45+.55*band)+b*blob*1.2; float scan=.82+.18*sin(u.y*220.+t*6.);
            // 注意 smoothstep 的两个边界必须从小到大，反过来写在部分显卡上会算出 NaN，经泛光扩散成大块黑
            float edge=smoothstep(0.,.03,u.x)*(1.-smoothstep(.97,1.,u.x))*smoothstep(0.,.02,u.y)*(1.-smoothstep(.98,1.,u.y));
            gl_FragColor=vec4(c*scan*edge*I,1.); }`, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(...pos); p.userData.noAO = true; g.add(p);
      K.tickers.push((dt) => { m.uniforms.t.value += dt; }); K.onMode.push((mode) => { m.uniforms.I.value = mode === 'night' ? 1.6 : .35; });
    };
    holo(7, 14, [4, 24, -38], 0x2de2ff, 0xff3d9a, 1); holo(9, 5, [-14, 15, -30], 0x8a5cff, 0x2de2ff, 3); holo(6, 11, [22, 30, -52], 0xff5a3a, 0xffd166, 5); holo(5, 9, [-30, 20, -60], 0x7cf2c4, 0x8a5cff, 7);
  }
  // 飞车：几条高低不同的航道，一串串车灯来回飞（前白后红）
  {
    const lanes = [[-15, 2.8, 1], [-21, 6, -1], [-29, 4, 1], [-35, 11, -1], [-49, 16, 1], [-60, 24, -1]], N = 48;
    const geo = new THREE.BoxGeometry(.43, .093, .18), front = K.glow(0xdceeff, 3.35, .42), back = K.glow(0xff5260, 3.0, .38);
    const imF = new THREE.InstancedMesh(geo, front, N), imB = new THREE.InstancedMesh(geo, back, N), cars = [], mm = new THREE.Matrix4();
    for (let i = 0; i < N; i++) { const L = lanes[i % lanes.length]; cars.push({ z: L[0] + rnd(-1, 1), y: L[1] + rnd(-.4, .4), dir: L[2], x: rnd(-60, 40), v: rnd(5, 11) }); }
    for (const im of [imF, imB]) { im.frustumCulled = false; im.userData.noAO = true; g.add(im); }
    K.tickers.push((dt) => {
      for (let i = 0; i < N; i++) { const c = cars[i]; c.x += c.dir * c.v * dt; if (c.x > 45) c.x = -65; if (c.x < -65) c.x = 45;
        mm.makeTranslation(c.x + c.dir * .3, c.y, c.z); imF.setMatrixAt(i, mm); mm.makeTranslation(c.x - c.dir * .3, c.y, c.z); imB.setMatrixAt(i, mm); }
      imF.instanceMatrix.needsUpdate = imB.instanceMatrix.needsUpdate = true;
    });
  }
  // 远处的雾霭光晕
  const haze = (w, h, pos, ry, c0, c1) => { const t = TX.draw(8, 256, (gg, ww, hh) => { const gr = gg.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.55, c0); gr.addColorStop(1, c1); gg.fillStyle = gr; gg.fillRect(0, 0, ww, hh); }); const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }); const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(...pos); p.rotation.y = ry; p.userData.noAO = true; g.add(p); K.onMode.push((mode) => { p.visible = mode === 'night'; }); };
  haze(260, 90, [-70, 0, 0], Math.PI / 2, 'rgba(110,40,120,.5)', 'rgba(255,90,150,.55)');
  haze(260, 90, [0, 0, -70], 0, 'rgba(60,50,140,.5)', 'rgba(255,120,110,.5)');
  // 雨（只在屋外下）
  const n = 2400, pos = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) { let x, z; do { x = rnd(-26, TERRACE.right + 20); z = rnd(-26, 15); } while (x > -.4 && z > -.4 && ((x < W + .35 && z < D + .1) || (x > TERRACE.x && x < TERRACE.right && z > TERRACE.z && z < TERRACE.back))); const y = rnd(-10, 16), L = rnd(.3, .7); pos.set([x, y, z, x + .05, y - L, z + .02], i * 6); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xa9c8ff, transparent: true, opacity: .28, fog: false })); rain.frustumCulled = false; g.add(rain);
  K.tickers.push((dt) => { if (!rain.visible) return; const p = rg.attributes.position.array; for (let i = 1; i < p.length; i += 3) { p[i] -= dt * 16; if (p[i] < -11) p[i] += 26; } rg.attributes.position.needsUpdate = true; });
  K.onMode.push((mode) => { rain.visible = mode === 'night'; });
  // Keep the skyline behind the apartment, even when orbiting through it.
  const bounds = towers.map(tower => new THREE.Box3().setFromObject(tower));
  const lastEye = new THREE.Vector3(Infinity, Infinity, Infinity);
  const apartment = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(TERRACE.right, WH, TERRACE.back));
  const sightlines = [];
  for (const x of [.1, W / 2, TERRACE.right - .1]) {
    for (const z of [.1, D / 2, TERRACE.back - .1]) {
      for (const y of [.35, LY + .65, WH - .10]) {
        sightlines.push({ point: new THREE.Vector3(x, y, z), ray: new THREE.Ray(), length: 0 });
      }
    }
  }
  const intersection = new THREE.Vector3();
  return {
    updateCutaway(eye) {
      if (lastEye.distanceToSquared(eye) < 1e-6) return;
      lastEye.copy(eye);
      const inside = apartment.containsPoint(eye);
      if (!inside) for (const line of sightlines) {
        line.ray.set(eye, line.ray.direction.subVectors(line.point, eye).normalize());
        line.length = line.point.distanceToSquared(eye);
      }
      for (let i = 0; i < towers.length; i++) {
        const bound = bounds[i];
        const inFront = !inside && (bound.containsPoint(eye) || sightlines.some(({ ray, length }) => (
          ray.intersectBox(bound, intersection) && intersection.distanceToSquared(eye) < length
        )));
        towers[i].visible = !inFront;
      }
    },
  };
}
