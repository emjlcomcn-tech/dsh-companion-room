import * as THREE from 'three';
import * as TX from './tex.js';

export const TERRACE = { x: 11.84, z: 6.19, right: 17.22, back: 10.96 };
export const POOL = { x: 13.43, z: 7.63, right: 16.66, back: 10.29 };
export const POOL_STEPS = { z: POOL.z + .32, width: .77, run: .22 };

export function buildTerrace(K, M, floorRect, deck, roomWidth, roomDepth) {
  const { x, z, right, back } = TERRACE;
  const { x: px, z: pz, right: pr, back: pb } = POOL;
  const width = pr - px, length = pb - pz;
  const std = options => new THREE.MeshStandardMaterial(options);
  const hyd = std({ color: 0x3c474a, roughness: .76, metalness: .12 });
  const stone = std({ ...TX.marble({ base: [.43, .43, .39], veins: .10, rough: .55, seed: 101, size: 512 }), roughness: 1, normalScale: new THREE.Vector2(.32, .32) });
  const tileMaps = TX.tiles({ n: 9, a: [.12, .37, .43], b: [.22, .51, .53], grout: [.13, .28, .30], seed: 420, size: 256, rough: .32 });
  const tiles = std({ ...tileMaps, roughness: 1, normalScale: new THREE.Vector2(.36, .36) });
  const wallTile = (repeat, height) => std({ ...TX.rep(tileMaps, repeat, height), roughness: 1, normalScale: new THREE.Vector2(.36, .36) });

  // Separate slabs around the opening leave room for a recessed basin.
  for (const [a, b, w, d] of [
    [x, z, px - x, back - z], [pr, z, right - pr, back - z],
    [px, z, width, pz - z], [px, pb, width, back - pb],
  ]) {
    K.box(a, -.43, b, w, .429, d, M.slab);
    floorRect(a, b, w, d, deck, 2.25);
  }
  K.box(px - .12, -.87, pz - .12, width + .24, .16, length + .24, hyd);
  const liner = new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2);
  const uv = liner.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width / .81, uv.getY(i) * length / .81);
  const causticTime = { value: 0 }, causticPower = { value: .14 };
  tiles.onBeforeCompile = shader => {
    shader.uniforms.poolTime = causticTime;
    shader.uniforms.poolPower = causticPower;
    shader.vertexShader = 'varying vec2 poolPosition;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\npoolPosition = position.xz;');
    shader.fragmentShader = 'uniform float poolTime, poolPower;\nvarying vec2 poolPosition;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec2 pp = poolPosition * 11.;
      float t = poolTime * .72;
      float pattern = sin(pp.x + sin(pp.y * .81 + t) * 1.4) * sin(pp.y - sin(pp.x * .73 - t * .8) * 1.2);
      float caustic = pow(1. - abs(pattern), 12.) * (.44 + .56 * sin(t + pp.x * .29 + pp.y * .25) * .5 + .28);
      outgoingLight += vec3(.21, .65, .74) * caustic * poolPower;
      #include <opaque_fragment>
    `);
  };
  K.mesh(liner, tiles, (px + pr) / 2, -.70, (pz + pb) / 2, { cast: false, noNav: true });

  const shortWall = wallTile(length / .81, .83), longWall = wallTile(width / .81, .83);
  for (const bx of [px - .09, pr]) K.box(bx, -.72, pz, .09, .72, length, [shortWall, shortWall, hyd, hyd, hyd, hyd], { noNav: true });
  for (const bz of [pz - .09, pb]) K.box(px - .09, -.72, bz, width + .18, .72, .09, [hyd, hyd, hyd, hyd, longWall, longWall], { noNav: true });

  const lip = .128;
  for (const bx of [px - lip, pr]) K.box(bx, -.010, pz - lip, lip, .042, length + lip * 2, stone, { r: .008, noNav: true });
  for (const bz of [pz - lip, pb]) K.box(px, -.010, bz, width, .042, lip, stone, { r: .008, noNav: true });
  const { z: stepZ, width: stepW, run } = POOL_STEPS;
  for (let i = 0; i < 3; i++) K.box(px + i * run, -.70, stepZ, run + .003, .61 - i * .19, stepW, longWall, { r: .007, noNav: true });
  for (const bz of [stepZ + .09, stepZ + stepW - .09]) {
    K.tube([[px - .30, .028, bz], [px - .29, .53, bz], [px - .14, .65, bz], [px + .10, .52, bz], [px + .51, -.36, bz]], .023, M.chrome, { seg: 24, rs: 9, noNav: true });
  }

  const ripples = TX.waterRipples(); ripples.repeat.set(2.7, 2.4);
  const water = new THREE.MeshPhysicalMaterial({ color: 0x429baa, roughness: .19, metalness: .10, transparent: true, opacity: .57, depthWrite: false, normalMap: ripples, normalScale: new THREE.Vector2(.40, .40), clearcoat: .92, clearcoatRoughness: .12, envMapIntensity: 1.68, emissive: 0x06576c, emissiveIntensity: .15 });
  K.mesh(new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2), water, (px + pr) / 2, -.073, (pz + pb) / 2, { cast: false, noNav: true });
  const poolLight = K.glow(0x72d9f4, 3.3, .10, 0x236175);
  for (const a of [px + .97, pr - .69]) {
    K.box(a, -.245, pb - .012, .20, .067, .019, hyd, { r: .007, noNav: true });
    K.box(a + .022, -.232, pb - .018, .156, .041, .014, poolLight, { r: .005, cast: false, noNav: true });
  }
  const underwater = K.glow(0x53c0e5, .28, .015);
  K.box(px + .09, -.32, pz + .018, width - .18, .017, .011, underwater, { cast: false, noNav: true });
  K.rect(0x6ac9e4, 1.6, 2.65, .18, [(px + pr) / 2, .12, pb - .26], [(px + pr) / 2, -.6, pz + .35]);
  K.tickers.push((dt, t) => { ripples.offset.set(t * .024, t * -.037); causticTime.value = t; });
  K.onMode.push(mode => { causticPower.value = mode === 'day' ? .16 : .34; water.emissiveIntensity = mode === 'day' ? .08 : .33; });

  const rail = M.glass.clone(); rail.opacity = .19; rail.roughness = .16;
  const edgeLight = K.glow(0xffc999, 1.7, .08);
  const railing = (a, b, center, alongX, { joinStart = false, joinEnd = false } = {}) => {
    const box = (u, y, span, h, d, mat, opts = {}) => alongX
      ? K.box(u, y, center - d / 2, span, h, d, mat, opts)
      : K.box(center - d / 2, y, u, d, h, span, mat, opts);
    const cap = (y, h, width, material, opts) => {
      const from = a + (joinStart ? width / 2 : -.02), to = b - (joinEnd ? width / 2 : -.02);
      box(from, y, to - from, h, width, material, opts);
    };
    cap(0, .092, .108, hyd);
    cap(1.034, .037, .055, hyd);
    cap(.068, .013, .122, edgeLight, { cast: false, noNav: true });
    const posts = Math.ceil((b - a) / 1.28);
    for (let i = 0; i <= posts; i++) {
      const position = a + (b - a) * i / posts;
      if ((i || !joinStart) && (i < posts || !joinEnd)) box(position - .02, .08, .04, .954, .046, hyd);
      if (i) K.glassPane(a + (b - a) * (i - 1) / posts + .024, position - .024, .094, 1.032, center, rail, { alongZ: !alongX });
    }
  };
  const westRail = x + .055, eastRail = right - .05, northRail = z + .044, southRail = back - .049;
  railing(westRail, eastRail, southRail, true, { joinEnd: true });
  railing(northRail, southRail, eastRail, false);
  railing(roomWidth - .025, eastRail, northRail, true, { joinEnd: true });
  railing(roomDepth - .025, southRail, westRail, false, { joinEnd: true });

  // Framed glazing on the dining side leaves a broad opening to the deck.
  const doorGlass = M.glass.clone(); doorGlass.opacity = .10;
  for (const [a, b] of [[z, 7.56], [9.33, roomDepth - .03]]) {
    K.box(x - .033, 0, a, .066, .071, b - a, hyd);
    K.glassPane(a + .038, b - .038, .073, 2.178, x, doorGlass, { alongZ: true });
    K.box(x - .032, 2.18, a, .064, .052, b - a, hyd);
    for (const zz of [a, b - .036]) K.box(x - .033, .07, zz, .066, 2.13, .036, hyd);
  }
  K.box(x - .038, 2.21, z, .076, .057, roomDepth - z - .03, M.steel);

  const cushion = std({ color: 0xc0b6a2, roughness: .92, normalMap: TX.weave(), normalScale: new THREE.Vector2(.29, .29) });
  for (const a of [13.67, 15.18]) {
    K.box(a, .095, 6.67, 1.25, .16, .54, M.walnut, { r: .025 });
    for (const dx of [.06, 1.10]) K.box(a + dx, 0, 6.70, .059, .12, .48, hyd);
    K.cushion(a + .03, .234, 6.69, 1.18, .084, .50, cushion, { puff: .18 });
    K.cushion(a + .04, .317, 6.70, .41, .073, .48, cushion, { puff: .18, rot: [0, 0, -.41] });
  }
  K.plant(12.31, 0, 6.63, { pot: .22, potH: .36, n: 8, h: .71, leaf: [.30, .18], potMat: M.pot2, leafMats: M.leaf, stemMat: M.stem, spread: .24, seed: 92 });
  K.plant(16.8, 0, 6.67, { pot: .18, potH: .27, n: 7, h: .56, leaf: [.24, .14], potMat: M.pot2, leafMats: M.leaf, stemMat: M.stem, spread: .25, seed: 118 });
}
