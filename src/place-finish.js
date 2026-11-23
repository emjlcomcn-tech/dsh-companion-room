import * as THREE from 'three';
import * as TX from './tex.js';

export function buildPlaceFinishes(K, M) {
  const standard = (color, properties = {}) => new THREE.MeshStandardMaterial({ color, roughness: .8, ...properties });
  const cloth = (color) => {
    const material = M.teal.clone();
    material.color.setHex(color);
    material.sheenColor.copy(material.color).lerp(new THREE.Color(0xffffff), .35);
    return material;
  };
  const stone = new THREE.MeshStandardMaterial({ ...TX.rep(TX.concrete({ tone: [.46, .48, .49], size: 256, seed: 17, contrast: .26 }), 2), roughness: .91, normalScale: new THREE.Vector2(.35, .35) });
  const paving = new THREE.MeshStandardMaterial({ ...TX.rep(TX.tiles({ n: 7, a: [.59, .57, .53], b: [.5, .49, .47], grout: [.31, .33, .34], size: 256, rough: .22 }), 2, 1.4), roughness: .87, normalScale: new THREE.Vector2(.24, .24) });
  const grass = new THREE.MeshStandardMaterial({ ...TX.rep(TX.concrete({ tone: [.31, .42, .31], size: 256, seed: 38, contrast: .4 }), 2), roughness: .98, normalScale: new THREE.Vector2(.19, .19) });
  const city = new THREE.MeshBasicMaterial({ color: 0xe4f0ff, toneMapped: false });
  const skylines = {};
  for (const mode of ['day', 'night']) {
    const buildings = TX.skylineTex(mode, 45);
    skylines[mode] = TX.draw(1024, 512, (g, w, h) => {
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, mode === 'day' ? '#82aed7' : '#152447');
      sky.addColorStop(1, mode === 'day' ? '#dde9f1' : '#686383');
      g.fillStyle = sky; g.fillRect(0, 0, w, h);
      g.drawImage(buildings.image, 0, 0, w, h);
    });
    buildings.dispose();
  }
  const amber = K.glow(0xffbd79, 1.95, .55, 0xead5bb);
  const ice = K.glow(0x8cceee, 1.1, .15, 0x8298a1);
  K.onMode.push(mode => {
    city.map = skylines[mode]; city.needsUpdate = true;
    city.color.setHex(mode === 'day' ? 0xdfeafb : 0x6087a1);
  });
  return { ...M, stone, paving, grass, city, amber, ice, standard, cloth };
}

export function buildVenueShell(K, M, { width = 7, depth = 5.5, back = -2.5, height = 2.78, finish = M.floor, wall = M.wall, window = true } = {}) {
  const left = -width / 2;
  K.box(left - .05, -.24, back - .05, width + .1, .20, depth + .1, M.slab, { r: .032, cast: false });
  K.box(left, -.045, back, width, .04, depth, finish, { cast: false });
  const rear = K.group(), west = K.group();
  K.in(rear, () => {
    K.box(left, 0, back, width, height, .14, wall);
    K.box(left + .02, .018, back + .14, width - .04, .085, .027, M.walnut);
    K.box(left, height - .037, back, width, .05, .19, M.steel);
  });
  K.in(west, () => {
    const start = back + .14, end = back + depth - .1;
    const a = start + .49, b = Math.min(start + 3.43, end - .31), bottom = .49, top = height - .35;
    if (window) {
      K.box(left, 0, start, .14, height, a - start, wall);
      K.box(left, 0, b, .14, height, end - b, wall);
      K.box(left, 0, a, .14, bottom, b - a, wall);
      K.box(left, top, a, .14, height - top, b - a, wall);
      K.box(left + .019, bottom, a, .01, top - bottom, b - a, M.city, { cast: false, recv: false });
      K.glassPane(a + .02, b - .02, bottom + .02, top - .02, left + .114, M.glass, { alongZ: true });
      for (let i = 0; i < 4; i++) K.box(left + .107, bottom, a + (b - a - .043) * i / 3, .063, top - bottom, .043, M.steel);
      for (const h of [bottom, top - .038]) K.box(left + .10, h, a, .073, .038, b - a, M.steel);
      K.box(left + .015, bottom - .036, a - .035, .24, .036, b - a + .07, M.counter, { r: .009 });
    } else K.box(left, 0, start, .14, height, end - start, wall);
    K.box(left + .14, .018, start, .026, .085, end - start, M.walnut);
    K.box(left, height - .037, start, .18, .05, end - start, M.steel);
  });
  return {
    rear,
    updateCutaway(eye) {
      rear.visible = eye.z >= back;
      west.visible = eye.x >= left;
    },
  };
}

export function addVenueLighting(K, root, { outside = false, cinema = false } = {}) {
  const key = new THREE.DirectionalLight(), fill = new THREE.HemisphereLight();
  key.position.set(-3.1, 5.4, 2.2); key.target.position.set(.3, .4, -.65);
  key.castShadow = true; key.shadow.mapSize.set(768, 768);
  Object.assign(key.shadow.camera, { left: -5.3, right: 5.3, top: 4.8, bottom: -4.8, near: .55, far: 13 });
  key.shadow.bias = -.00036; key.shadow.normalBias = .026; key.shadow.radius = 3;
  root.add(key, key.target, fill);
  K.onMode.push(mode => {
    const day = mode === 'day';
    key.color.setHex(cinema ? 0x91b5db : day ? 0xffe6c9 : 0xa9c4f4);
    key.intensity = cinema ? .38 : day ? (outside ? 1.75 : 1.35) : .82;
    fill.color.setHex(day ? 0xe3eef8 : 0x9bb5df);
    fill.groundColor.setHex(day ? 0x938174 : 0x695658);
    fill.intensity = cinema ? .72 : day ? 1.06 : .9;
  });
}

export function venueLamp(K, M, x, y, z, { radius = .18, intensity = 5, color = 0xffc18c, reach = 3.6, pendant = true, anchor = -2.36, mount } = {}) {
  if (pendant) {
    K.box(x - .027, y + .653, anchor, .054, .046, z - anchor + .056, M.steel, { r: .007, parent: mount });
    K.box(x - .057, y + .59, anchor + .005, .114, .12, .045, M.steel, { r: .008, parent: mount });
    K.cyl(x, y + .13, z, .011, .011, .54, M.steel, { seg: 10, parent: mount });
    K.cyl(x, y + .026, z, radius * .48, radius, .135, M.steel, { seg: 28, parent: mount });
    K.cyl(x, y, z, radius * .83, radius * .83, .027, M.amber, { seg: 28, cast: false, parent: mount });
  }
  const light = new THREE.PointLight(color, intensity, reach, 2);
  light.position.set(x, y - .10, z); K.parent.add(light);
  K.onMode.push(mode => { light.intensity = mode === 'night' ? intensity : intensity * .36; });
}
