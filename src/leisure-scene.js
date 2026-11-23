import * as THREE from 'three';
import * as TX from './tex.js';
import { addVenueLighting, buildVenueShell, venueLamp } from './place-finish.js';

const angleForArea = area => ({ cafe: 34, break: 34, cinema: 13, bakery: 27, garden: 30 }[area] ?? 22);
const outdoor = new Set(['path', 'park', 'garden']);

export function buildLeisureScene(K, M) {
  const y = 34, root = K.group(0, y, 0);
  root.name = 'weekend outing'; root.visible = false; root.userData.noNav = true;
  const mat = M.standard;
  const { stone, oak, glass } = M;
  const green = mat(0x74956d), leaf = mat(0x577d59), trunk = mat(0x756047), cream = mat(0xeee3d0);
  const dark = mat(0x35434a), teal = mat(0x527e81), rose = mat(0xb77b73), blue = mat(0x7d99ac);
  const clay = mat(0xa85542), soil = mat(0x694839), gold = mat(0xe5a948), skin = mat(0xe1b292);
  const upholstery = M.cloth(0x416b70), velvet = M.cloth(0x813f4c), carpet = M.cloth(0x343145);
  const rubber = M.standard(0x3a4346, { normalMap: M.grass.normalMap, normalScale: new THREE.Vector2(.18, .18), roughness: .95 });
  const canopyGeometry = new THREE.IcosahedronGeometry(1, 3);
  const canopyPosition = canopyGeometry.getAttribute('position'), canopyColors = [];
  const canopyGreen = new THREE.Color(0x426640), canopyTip = new THREE.Color(0x86a76b);
  for (let i = 0; i < canopyPosition.count; i++) {
    const x = canopyPosition.getX(i), y = canopyPosition.getY(i), z = canopyPosition.getZ(i);
    const grain = Math.sin(x * 27 + z * 12) * Math.cos(y * 17 - z * 19);
    const form = 1 + .088 * Math.sin(x * 12 + z * 7) * Math.sin(y * 15 - x * 5) + .05 * grain;
    canopyPosition.setXYZ(i, x * form, y * form, z * form);
    canopyGreen.clone().lerp(canopyTip, .47 + .24 * y + .20 * grain).toArray(canopyColors, i * 3);
  }
  canopyGeometry.setAttribute('color', new THREE.Float32BufferAttribute(canopyColors, 3));
  const canopy = M.standard(0xffffff, { vertexColors: true, roughness: .97 });
  const cutaways = [];
  const groups = {};
  const flowerParts = {};
  function bench(x, z, upholstery = null) {
    K.box(x, .35, z, 1.65, .10, .64, M.walnut, { r: .025 });
    for (const dx of [.14, 1.43]) K.box(x + dx, .02, z + .09, .075, .33, .47, M.steel, { r: .011 });
    if (upholstery) {
      K.cushion(x + .015, .438, z + .014, 1.62, .078, .61, upholstery, { puff: .26 });
      K.cushion(x + .035, .469, z + .54, 1.58, .53, .12, upholstery, { puff: .22 });
    } else {
      for (let i = 0; i < 4; i++) K.box(x + .025, .437, z + i * .156, 1.60, .058, .138, oak, { r: .012 });
      for (const y of [.58, .75, .92]) K.box(x + .025, y, z + .58, 1.60, .125, .043, oak, { r: .012 });
      for (const dx of [.14, 1.43]) K.box(x + dx, .40, z + .60, .067, .60, .047, M.steel);
    }
  }
  function plant(x, z, scale = 1) {
    K.plant(x, 0, z, { pot: .18 * scale, potH: .28 * scale, n: 7, h: .64 * scale, leaf: [.28 * scale, .16 * scale],
      potMat: M.pot, leafMats: M.leaf, stemMat: M.stem, spread: .27 * scale, seed: 188 });
  }
  function build(kind, create) {
    const group = K.group(); groups[kind] = group;
    const open = outdoor.has(kind), cinema = kind === 'cinema';
    K.in(group, () => {
      let rear;
      if (open) {
        K.box(-3.56, -.24, -2.56, 7.12, .21, 5.62, M.slab, { r: .036 });
        K.box(-3.5, -.031, -2.5, 7, .031, 5.5, M.grass);
      } else {
        const shell = buildVenueShell(K, M, { window: !cinema, wall: cinema ? M.charF : M.wall,
          finish: cinema ? carpet : kind === 'gym' ? rubber : M.floor });
        cutaways.push(shell.updateCutaway); rear = shell.rear;
      }
      create(rear);
      addVenueLighting(K, group, { outside: open, cinema });
    });
    group.visible = false;
  }
  function plantedTree(x, z, seed) {
    const random = TX.mulberry(seed);
    K.box(x - .46, -.005, z - .41, .92, .16, .82, stone, { r: .055 });
    K.box(x - .398, .151, z - .347, .796, .012, .694, M.soil);
    K.tube([[x, .15, z], [x - .07, .82, z + .045], [x + .08, 1.85, z]], .073, trunk, { seg: 8, rs: 8 });
    for (let i = 0; i < 7; i++) {
      const a = i * 2.399, r = .39 + random() * .28, h = 1.68 + random() * .65;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (i < 4) K.tube([[x, .96, z], [x + Math.cos(a) * .17, 1.37, z + Math.sin(a) * .17], [px, h, pz]], .036, trunk, { seg: 7, rs: 6 });
      const size = .43 + random() * .13;
      K.mesh(canopyGeometry, canopy, px, h, pz, { scale: [size, size * .84, size * .93], rot: [.14, a, 0] });
    }
    K.mesh(canopyGeometry, canopy, x, 2.37, z, { scale: [.56, .44, .49], rot: [0, seed % 7, .15] });
  }
  function pathLamp(x, z) {
    K.cyl(x, 0, z, .095, .13, .066, M.steel, { seg: 16 });
    K.cyl(x, .06, z, .028, .036, 1.64, M.steel, { seg: 12 });
    K.cyl(x, 1.71, z, .105, .105, .14, M.amber, { seg: 16, cast: false });
    K.cyl(x, 1.85, z, .076, .13, .057, M.steel, { seg: 16 });
    venueLamp(K, M, x, 1.77, z, { intensity: 5, reach: 3, pendant: false });
  }
  function boardwalk() {
    K.box(-3.45, -.003, -.44, 6.9, .021, 1.96, M.paving, { r: .014 });
    for (const z of [-.49, 1.52]) K.box(-3.45, .013, z, 6.9, .043, .071, stone, { r: .01 });
  }
  function pathRail() {
    for (let i = 0; i < 6; i++) K.box(-3.37 + i * 1.326, 0, -2.39, .045, .58, .048, M.steel, { r: .006 });
    K.box(-3.40, .56, -2.40, 6.74, .041, .058, M.steel, { r: .009 });
    K.box(-3.38, .24, -2.387, 6.70, .026, .033, M.steel);
  }
  function wildflower(x, z, height, color) {
    K.cyl(x, .008, z, .007, .008, height, M.stem, { seg: 6 });
    const l = K.mesh(K.leafGeo(.134, .066), M.leaf[2], x, .027, z);
    l.rotation.set(.69, x * 2.4, .28);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * .4;
      K.sph(x + Math.cos(a) * .030, height, z + Math.sin(a) * .030, .028, color, { scale: [1, .34, .92], seg: 7, seg2: 6 });
    }
    K.sph(x, height + .012, z, .018, gold, { seg: 8, seg2: 5, scale: [1, .60, 1] });
  }
  function framedArt(rear, x, y, w, h, seed, palette) {
    K.box(x, y, -2.347, w, h, .045, M.walnut, { r: .01, parent: rear });
    K.mesh(new THREE.PlaneGeometry(w - .052, h - .052), new THREE.MeshStandardMaterial({ map: TX.artTex(seed, palette), roughness: .89 }),
      x + w / 2, y + h / 2, -2.299, { cast: false, parent: rear });
  }
  function cup(x, y, z, size = 1) {
    K.cyl(x, y, z, .087 * size, .087 * size, .013, M.ceramic, { seg: 24 });
    K.lathe(x, y + .012, z, [[0, 0], [.041 * size, 0], [.061 * size, .087 * size], [.055 * size, .087 * size], [.043 * size, .013 * size], [0, .013 * size]], M.ceramic, { seg: 24 });
    K.cyl(x, y + .073 * size, z, .051 * size, .051 * size, .005, trunk, { seg: 24 });
    K.torus(x + .061 * size, y + .057 * size, z, .022 * size, .006 * size, M.ceramic, { seg: 18 });
  }
  function neighbor(x, z, clothes, hair) {
    K.sph(x, 1.33, z, .23, hair, { scale: [1.02, 1.04, .96] });
    K.sph(x, 1.3, z + .09, .177, skin, { scale: [1, 1.13, .88] });
    for (const d of [-.061, .061]) K.sph(x + d, 1.32, z + .243, .014, dark);
    K.sph(x, .88, z, .26, clothes, { scale: [1, 1.3, .72] });
    for (const d of [-.26, .26]) {
      K.sph(x + d, .83, z, .085, clothes, { scale: [1, 2.25, 1] });
      K.sph(x + d, .63, z + .018, .068, skin);
    }
    for (const d of [-.12, .05]) {
      K.box(x + d, .09, z - .06, .105, .57, .13, dark, { r: .03 });
      K.box(x + d - .012, .015, z - .06, .13, .1, .23, hair, { r: .03 });
    }
  }
  K.in(root, () => {
    build('path', () => {
      boardwalk(); pathRail();
      plantedTree(-2.75, -1.73, 141); plantedTree(2.7, -1.72, 232);
      bench(.65, -1.29); pathLamp(-1.38, -1.22); pathLamp(2.89, 1.93);
      plant(-2.8, 2.03, .92);
    });
    build('park', () => {
      boardwalk(); pathRail();
      plantedTree(-2.76, -1.75, 187); plantedTree(2.75, -1.74, 397);
      bench(.68, -1.27); bench(-2.30, 1.78);
      pathLamp(-2.73, 1.81); pathLamp(2.75, -1.01);
      K.cyl(-.57, 0, -1.59, .70, .64, .18, stone, { seg: 40 });
      const water = M.water.clone(); water.color.setHex(0x6c9da3); water.roughness = .21;
      K.cyl(-.57, .184, -1.59, .62, .62, .014, water, { cast: false, seg: 40 });
      K.torus(-.57, .193, -1.59, .652, .045, M.counter, { rot: [-Math.PI / 2, 0, 0], seg: 48 });
      K.cyl(-.57, .184, -1.59, .057, .109, .24, M.steelB);
      K.cyl(-.57, .410, -1.59, .139, .045, .039, M.brass, { seg: 32 });
      K.torus(-.57, .204, -1.59, .325, .004, M.ice, { rot: [-Math.PI / 2, 0, 0], seg: 40, cast: false });
      for (let i = 0; i < 12; i++) wildflower(.27 + i * .238, 2.46 + Math.sin(i * 1.9) * .19, .09 + (i % 4) * .025, i % 2 ? rose : cream);
    });
    build('shopping', rear => {
      for (const x of [-1.9, .43, 1.91]) {
        K.box(x, .04, -2.24, 1.26, 1.97, .085, M.walnut, { r: .014 });
        for (const dx of [0, 1.214]) K.box(x + dx, .04, -2.24, .046, 2, .45, M.steel);
        for (let row = 0; row < 4; row++) {
          const y = .15 + row * .445;
          K.box(x, y, -2.16, 1.26, .045, .37, oak, { r: .009 });
          for (let col = 0; col < 5; col++) {
            const color = [teal, rose, blue, cream][(row + col * 3) % 4], px = x + .10 + col * .22;
            if ((row + col) % 4 === 0) K.cyl(px + .071, y + .052, -1.96, .078, .074, .16, color, { seg: 18 });
            else K.box(px, y + .046, -2.06, .15, .15 + (col % 3) * .055, .21, color, { r: .01 });
          }
        }
        K.box(x + .03, 1.955, -2.12, 1.19, .026, .34, M.amber, { cast: false });
      }
      K.box(-2.93, 0, -.08, 1.42, .72, .80, M.walnut, { r: .035 });
      K.box(-3, .72, -.15, 1.56, .062, .94, M.counter, { r: .022 });
      K.box(-2.57, .785, .37, .45, .17, .27, M.blackGlass, { r: .021 });
      for (let i = 0; i < 3; i++) K.box(-2.77 + i * .23, .783, .055, .17, .038, .22, [rose, blue, cream][i], { r: .009 });
      K.box(1.06, .04, .55, 1.75, .075, .83, M.walnut, { r: .021 });
      for (const x of [1.13, 2.68]) K.box(x, .10, .62, .063, .65, .68, M.steel, { r: .01 });
      K.box(1.04, .74, .54, 1.80, .063, .87, oak, { r: .025 });
      for (let i = 0; i < 4; i++) K.box(1.19 + i * .39, .805, .68, .29, .056 + i * .012, .43, [rose, blue, cream, teal][i], { r: .014 });
      venueLamp(K, M, -2.07, 2.04, .29, { mount: rear });
      venueLamp(K, M, 1.92, 2.04, .96, { radius: .22, mount: rear });
      plant(-2.83, 1.83, 1.35);
    });
    build('gym', rear => {
      const reflection = mat(0xa3b6be, { metalness: .7, roughness: .18, envMapIntensity: .85 });
      for (const x of [-1.84, -.60, .64]) {
        K.box(x, .43, -2.35, 1.23, 1.77, .062, M.steel, { r: .01, parent: rear });
        K.box(x + .029, .461, -2.286, 1.17, 1.709, .009, reflection, { cast: false, parent: rear });
      }
      K.box(-.92, .005, -.40, 1.84, .03, 1.62, upholstery, { r: .013 });
      for (const x of [-.78, .75]) K.box(x, .034, -.25, .021, .003, 1.32, M.ice, { cast: false });
      K.box(1.63, .10, -1.38, 1.16, .18, 1.76, M.steel, { r: .051 });
      K.box(1.75, .28, -1.25, .92, .026, 1.54, M.rubber, { r: .014 });
      for (const x of [1.66, 2.72]) {
        K.box(x, .279, -1.25, .055, .031, 1.54, M.steelB);
        K.tube([[x + .023, .26, -1.12], [x + .023, .9, -1.02], [x + .023, 1.13, -.67], [x + .023, 1.13, -.11]], .034, M.steel, { seg: 14 });
      }
      K.box(1.78, 1.13, -1.12, .9, .11, .23, M.blackGlass, { r: .021 });
      K.box(2.03, 1.242, -1.076, .39, .003, .10, M.ice, { cast: false });
      K.box(-2.9, .02, -1.50, 1.34, .37, .59, M.steel, { r: .02 });
      K.box(-2.94, .37, -1.53, 1.43, .06, .65, M.walnut, { r: .017 });
      for (let i = 0; i < 4; i++) {
        const x = -2.75 + i * .31, r = .075 + i * .011;
        K.mesh(new THREE.CylinderGeometry(.022, .022, .28, 12), M.steelB, x, .51, -1.20, { rot: [Math.PI / 2, 0, 0] });
        for (const z of [-1.34, -1.06]) K.mesh(new THREE.CylinderGeometry(r, r, .06, 8), M.rubber, x, .51, z, { rot: [Math.PI / 2, 0, 0] });
      }
      K.cushion(1.64, .32, 1.58, .86, .10, .29, M.sheet, { puff: .12 });
      K.box(1.5, .255, 1.46, 1.16, .065, .54, oak, { r: .02 });
      for (const x of [1.62, 2.48]) K.box(x, 0, 1.53, .063, .25, .34, M.steel);
      for (const x of [-1.5, .55, 2.4]) K.box(x, 2.58, -1.55, .65, .044, .094, M.ice, { cast: false });
      venueLamp(K, M, .30, 2.52, -.15, { color: 0xc5e8ff, intensity: 5, reach: 4, pendant: false });
      plant(2.93, 2.20);
    });
    build('cinema', () => {
      K.box(-3.42, 0, -2.33, 6.84, .18, 1.14, M.walnut, { r: .017 });
      K.box(-3.4, .062, -1.18, 6.8, .026, .024, M.amber, { cast: false });
      K.box(-2.48, .43, -2.28, 4.96, 2.07, .15, M.blackGlass, { r: .027 });
      const projection = new THREE.MeshBasicMaterial({ map: TX.tvScreen(), color: 0xf2e0ee });
      K.mesh(new THREE.PlaneGeometry(4.72, 1.87), projection, 0, 1.46, -2.115, { cast: false, recv: false });
      for (const x of [-3.04, 2.66]) {
        K.box(x, .53, -2.23, .39, 1.69, .16, M.charF, { r: .018 });
        for (let i = 0; i < 3; i++) K.cyl(x + .195, .80 + i * .45, -2.05, .084, .084, .022, M.steel, { rot: [Math.PI / 2, 0, 0], seg: 18 });
      }
      for (const x of [-2.72, -.81, 1.10]) {
        bench(x, .80, velvet);
        K.in(K.group(0, .095, 1.06), () => bench(x, .80, velvet));
        for (const dx of [.002, .789, 1.576]) K.box(x + dx, .50, .865, .074, .17, .44, M.walnut, { r: .023 });
      }
      for (const z of [-.9, -.2, .5, 1.21, 1.94, 2.64]) {
        K.box(-3.29, .021, z, .045, .014, .30, M.amber, { cast: false });
        K.box(3.23, .021, z, .045, .014, .30, M.amber, { cast: false });
      }
      venueLamp(K, M, .10, 1.52, -1.60, { intensity: 6, color: 0xb6d6ff, reach: 5.1, pendant: false });
    });
    for (const kind of ['cafe', 'break']) build(kind, rear => {
      bench(-.90, .8, upholstery); bench(1.38, -.99, M.sheet);
      K.box(-1.24, .009, -.74, 2.47, .023, 2.27, M.cloth(0x8a796c), { r: .011 });
      K.cyl(0, .025, -.25, .22, .29, .048, M.steel);
      K.cyl(0, .07, -.25, .047, .067, .615, M.brass);
      K.cyl(0, .676, -.25, .54, .53, .064, oak);
      cup(.195, .74, -.16);
      K.box(-.37, .742, -.49, .31, .034, .30, blue, { r: .009 });
      K.box(-.357, .752, -.481, .291, .013, .28, M.paper, { r: .003 });
      K.box(-3.17, .04, -2.18, 3.27, .89, .64, M.walnut, { r: .03 });
      for (let i = 0; i < 21; i++) K.box(-3.11 + i * .151, .10, -1.542, .074, .78, .037, oak, { r: .01 });
      K.box(-3.23, .93, -2.23, 3.39, .065, .76, M.counter, { r: .025 });
      K.box(-1.49, .995, -2.13, .91, .39, .49, M.blackGlass, { r: .052 });
      K.box(-1.40, 1.042, -1.624, .73, .195, .035, M.steelB, { r: .015 });
      K.box(-1.20, 1.307, -1.634, .23, .025, .012, M.ice, { cast: false });
      for (const x of [-2.80, -2.56, -.42]) cup(x, .995, -1.84, .85);
      framedArt(rear, .70, 1.27, .88, .94, 72, ['#8f9081', '#2f5957', '#deaa78', '#d4c8aa']);
      framedArt(rear, 1.72, 1.47, .62, .65, 29, ['#d9b698', '#285459', '#977868', '#e6d4bf']);
      venueLamp(K, M, -1.82, 2.12, -1.44, { radius: .18, mount: rear });
      venueLamp(K, M, .04, 2.03, -.28, { radius: .24, intensity: 6.5, mount: rear });
      plant(2.74, -1.48, 1.45); plant(-2.70, 1.91, 1.15);
    });
    build('bakery', rear => {
      const crust = mat(0xca813d, { roughness: .83, bumpMap: M.grass.normalMap, bumpScale: .028 });
      const pastry = (x, y, z, index, scale = 1) => {
        if (index % 3 === 1) {
          for (let k = -2; k <= 2; k++) {
            const radius = (.108 - Math.abs(k) * .024) * scale;
            K.sph(x + k * .051 * scale, y - .025 * Math.abs(k) * scale, z + k * k * .022 * scale,
              radius, k === 0 ? gold : crust, { seg: 12, seg2: 8, scale: [.76, .82, 1.2], rot: [0, k * .26, 0] });
          }
          return;
        }
        const long = index % 3 === 2;
        K.sph(x, y, z, .145 * scale, long ? crust : clay, { seg: 18, seg2: 10, scale: [long ? 1.48 : .94, .66, .82] });
        for (const dx of long ? [-.085, 0, .085] : [-.045, .045]) K.box(x + dx * scale, y + .088 * scale, z - .039 * scale,
          .017 * scale, .003, .075 * scale, cream, { cast: false, rot: [0, -.37, 0] });
      };
      K.box(-3.29, .025, -2.27, 6.58, .66, .48, M.walnut, { r: .019 });
      K.box(-3.31, .685, -2.29, 6.62, .052, .51, M.counter, { r: .016 });
      K.in(rear, () => {
        for (const x of [-2.8, .6]) for (const height of [.92, 1.64]) {
          K.box(x, height, -2.24, 2.2, .065, .48, oak, { r: .011 });
          K.box(x + .075, height - .017, -1.92, 2.05, .022, .034, M.amber, { cast: false });
          for (let n = 0; n < 5; n++) pastry(x + .24 + n * .40, height + .145, -1.99, n, 1.03);
        }
      });
      K.box(-2.90, .03, -.74, 4.30, .78, .75, teal, { r: .045 });
      for (let i = 0; i < 25; i++) K.box(-2.84 + i * .166, .095, .01, .075, .649, .032, M.walnut, { r: .008 });
      K.box(-3, .81, -.84, 4.50, .084, .95, M.counter, { r: .028 });
      for (let n = 0; n < 6; n++) {
        const x = -2.77 + n * .55;
        K.box(x - .045, .897, -.74, .47, .022, .51, M.walnut, { r: .009 });
        pastry(x + .19, .997, -.47, n, 1.18);
        K.box(x + .081, .924, -.241, .21, .043, .017, cream, { r: .004 });
      }
      K.glassPane(-2.93, .66, .90, 1.28, -.12, glass);
      K.glassPane(-.815, -.12, .90, 1.28, -2.93, glass, { alongZ: true });
      K.mesh(new THREE.PlaneGeometry(3.59, .695), glass, -1.135, 1.28, -.468, { rot: [-Math.PI / 2, 0, 0], cast: false });
      for (const x of [-2.95, .642]) K.box(x, .90, -.136, .026, .40, .027, M.brass);
      K.box(-2.95, 1.274, -.133, 3.62, .024, .025, M.brass);
      K.box(-2.92, 1.255, -.805, 3.57, .018, .037, M.amber, { cast: false });
      framedArt(rear, -.48, 1.06, .83, 1.07, 43, ['#be8667', '#aa5f41', '#e1c499', '#f2e2c9']);
      K.box(1.20, .899, -.54, .24, .135, .30, M.blackGlass, { r: .015 });
      K.box(1.251, 1.035, -.485, .145, .004, .12, M.ice, { cast: false });
      K.box(-1.77, .012, 1.85, 2.6, .02, .91, M.cloth(0x627476), { r: .012 });
      venueLamp(K, M, -1.94, 2.09, -.66, { intensity: 5.6, mount: rear });
      venueLamp(K, M, .10, 2.09, -.66, { intensity: 5.6, mount: rear });
      neighbor(1.6, -1.25, rose, trunk);
      plant(2.62, .87, 1.35);
    });
    build('garden', () => {
      boardwalk();
      for (const y of [.29, .76]) K.box(-3.40, y, -2.32, 6.79, .079, .065, M.walnut, { r: .012 });
      for (let i = 0; i < 12; i++) K.box(-3.35 + i * .60, .015, -2.35, .095, .89, .092, M.steel, { r: .013 });
      for (const x of [-2.9, .9]) {
        K.box(x, .04, -1.75, 1.75, .32, 1.3, stone, { r: .029 });
        K.box(x + .08, .36, -1.67, 1.59, .035, 1.14, soil);
        for (const z of [-1.77, -.48]) K.box(x - .012, .32, z, 1.774, .074, .095, oak, { r: .015 });
        for (let i = 0; i < 6; i++) {
          const px = x + .23 + (i % 3) * .5, pz = -1.46 + Math.floor(i / 3) * .5;
          for (let k = 0; k < 4; k++) {
            const l = K.mesh(K.leafGeo(.26 + k * .021, .13), M.leaf[(i + k) % M.leaf.length], px, .386, pz);
            l.rotation.set(.47 + k * .21, k * 1.57, .12);
          }
          K.cyl(px, .38, pz, .009, .013, .24, M.stem, { seg: 8 });
          K.sph(px, .64, pz, .069, i % 2 ? gold : rose, { seg: 12, seg2: 8, scale: [1, .61, 1] });
        }
      }
      K.cyl(0, .04, -1.04, .35, .25, .42, clay);
      K.cyl(0, .44, -1.04, .324, .324, .02, soil);
      flowerParts.stem = K.group();
      K.in(flowerParts.stem, () => {
        K.cyl(0, .46, -1.04, .018, .023, .36, leaf);
        K.sph(.075, .62, -1.04, .108, leaf, { scale: [1, .3, .52] });
        K.sph(-.063, .685, -1.04, .094, green, { scale: [1, .28, .5] });
      });
      flowerParts.bud = K.sph(0, .825, -1.04, .057, gold);
      flowerParts.bloom = K.group();
      K.in(flowerParts.bloom, () => {
        for (let i = 0; i < 8; i++) K.sph(Math.cos(i * Math.PI / 4) * .082, .825, -1.04 + Math.sin(i * Math.PI / 4) * .082, .055, gold);
        K.sph(0, .858, -1.04, .056, clay);
      });
      neighbor(2.73, -1.23, green, dark);
      bench(-2.9, 1.7);
      pathLamp(3.04, 1.69); plant(1.95, 2.21, .85);
    });
    build('library', rear => {
      for (const x of [-2.95, -.9, 1.15]) {
        K.box(x, .03, -2.234, 1.78, 2.25, .063, M.walnut, { r: .01 });
        for (const dx of [0, 1.714]) K.box(x + dx, .037, -2.20, .061, 2.24, .40, oak, { r: .011 });
        K.box(x, 2.27, -2.24, 1.78, .064, .46, oak, { r: .013 });
        for (let row = 0; row < 4; row++) {
          const y = .19 + row * .49;
          K.box(x + .053, y, -2.18, 1.665, .045, .378, oak, { r: .006 });
          for (let col = 0; col < 10; col++) {
            if ((Math.round(x * 2) + row * 2 + col * 3) % 9 === 0) continue;
            const px = x + .10 + col * .157, h = .215 + ((col + row) % 4) * .033;
            K.box(px, y + .046, -2.079 + (col % 3) * .013, .104 + (col % 3) * .014, h, .241, [cream, teal, rose, blue, gold][(row * 2 + col) % 5], { r: .006 });
            if (col % 2 === 0) K.box(px + .017, y + .076, -1.836 + (col % 3) * .013, .066, .009, .0025, cream, { cast: false });
          }
        }
        K.box(x + .055, 2.23, -1.855, 1.67, .026, .029, M.amber, { cast: false });
      }
      K.box(-2.06, .01, -.58, 2.88, .022, 1.98, M.cloth(0x717971), { r: .009 });
      K.box(-1.94, .67, -.61, 1.59, .069, 1.18, oak, { r: .024 });
      for (const x of [-1.84, -.50]) K.box(x, .04, -.49, .06, .63, .89, M.steel, { r: .013 });
      for (let i = 0; i < 3; i++) K.box(-1.52 + i * .29, .743, -.16 + .045 * i, .23, .030 + i * .006, .31, [blue, cream, rose][i], { r: .007 });
      K.box(-.29, .08, .12, .59, .344, .54, M.walnut, { r: .025 });
      K.cushion(-.29, .42, .12, .59, .071, .55, upholstery, { puff: .22 });
      K.cushion(.205, .47, .08, .12, .47, .61, upholstery, { puff: .22 });
      K.cyl(-1.62, .744, -.34, .097, .115, .019, M.brass, { seg: 24 });
      K.cyl(-1.62, .763, -.34, .016, .020, .31, M.brass, { seg: 12 });
      K.cyl(-1.62, 1.05, -.34, .072, .137, .15, M.amber, { seg: 24 });
      venueLamp(K, M, -1.62, 1.06, -.34, { intensity: 3, reach: 2.3, pendant: false });
      venueLamp(K, M, -.5, 2.12, .16, { radius: .235, intensity: 6, mount: rear });
      neighbor(1.44, -.96, blue, trunk);
      bench(.90, 1.40, M.sheet);
      plant(-2.87, 1.27, 1.28);
    });
  });
  return {
    root, target: [0, y + 1, 0], label: '外出全景', azimuth: 22, angleForArea,
    updateCutaway(eye) { for (const update of cutaways) update(eye); },
    show(activity) {
      for (const [key, group] of Object.entries(groups)) group.visible = key === activity.area;
      flowerParts.stem.visible = ['sprout', 'budding', 'bloom'].includes(activity.gardenStage);
      flowerParts.bud.visible = activity.gardenStage === 'budding';
      flowerParts.bloom.visible = activity.gardenStage === 'bloom';
      this.azimuth = angleForArea(activity.area);
    },
    placement(activity, time) {
      if (activity.area === 'gym') {
        const beat = Math.floor(time / 5) % 3;
        return { position: new THREE.Vector3(beat === 1 ? 2.2 : 0, y + (beat === 1 ? .31 : 0), beat === 1 ? -.25 : .4),
          seat: 0, pose: ['stretch', 'stand', 'phone'][beat], yaw: beat === 1 ? Math.PI / 2 : -Math.PI / 2, walking: beat === 1 ? .55 : 0 };
      }
      const walking = activity.pose === 'walk';
      const x = walking ? Math.sin(time * .14) * 1.7 : 0;
      const z = ['cafe', 'break'].includes(activity.area) ? 1.06 : activity.area === 'cinema' ? 1.06 : .4;
      return { position: new THREE.Vector3(x, y, z), seat: activity.pose === 'sit' || activity.pose === 'read' ? .49 : 0,
        pose: walking ? 'stand' : activity.pose, yaw: walking ? Math.cos(time * .14) >= 0 ? 0 : Math.PI : activity.area === 'cinema' ? Math.PI : ['cafe', 'break'].includes(activity.area) ? Math.PI / 2 : -Math.PI / 2,
        walking: walking ? .65 : 0 };
    },
  };
}
