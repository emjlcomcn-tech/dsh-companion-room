// 可可：银虎斑美短。+z 朝前，+y 朝上，原点在腹部下方的地面。
import * as THREE from 'three';
import { RIM } from './char3d.js';
import { buttonEye, silverBody, silverFace, silverRings } from './cat-coat.js';
import { CatSkin } from './cat-skin.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FORWARD = V(0, 0, 1);

// ---------- 姿势：脊柱 5 点（屁股→脖子）、头的位置和朝向、四只脚的落点、尾巴 5 点（从屁股往后）----------
const P = (o) => o;
const POSES = {
  stand: P({ spine: [[0, .157, -.17], [0, .166, -.07], [0, .171, .034], [0, .185, .129], [0, .225, .193]], head: [0, .288, .236], hp: -.06, hy: 0, roll: 0, eyes: 0,
    feet: { fl: [.069, .023, .148], fr: [-.069, .023, .148], hl: [.081, .023, -.137], hr: [-.081, .023, -.137] }, tail: [[0, .17, -.20], [.045, .223, -.285], [.096, .312, -.325], [.105, .389, -.304], [.081, .427, -.275]] }),
  sit: P({ spine: [[0, .112, -.135], [0, .144, -.072], [0, .175, -.013], [0, .217, .038], [0, .254, .082]], head: [0, .309, .128], hp: -.025, hy: 0, roll: 0, eyes: 0,
    feet: { fl: [.069, .024, .133], fr: [-.069, .024, .133], hl: [.112, .024, .012], hr: [-.112, .024, .012] }, tail: [[0, .101, -.175], [.092, .145, -.226], [.148, .215, -.251], [.156, .286, -.233], [.143, .325, -.196]] }),
  loaf: P({ spine: [[0, .1, -.18], [0, .118, -.07], [0, .122, .04], [0, .115, .13], [0, .16, .2]], head: [0, .21, .24], hp: .05, hy: 0, roll: 0, eyes: 0,
    feet: { fl: [.04, .03, .15], fr: [-.04, .03, .15], hl: [.06, .03, -.12], hr: [-.06, .03, -.12] }, tail: [[0, .05, -.21], [-.09, .03, -.21], [-.15, .03, -.11], [-.15, .03, .01], [-.1, .03, .1]] }),
  curl: P({ curl: true, head: [0, 0, 0], hp: .45, hy: 0, roll: 0, eyes: 1,
    feet: { fl: [.03, .03, .1], fr: [-.03, .03, .1], hl: [.04, .03, -.1], hr: [-.04, .03, -.1] }, tail: null }),
  // 晒太阳时侧卧，肚子朝 +x，两对爪子分别收在脸边和腹侧。
  side: P({ spine: [[-.012, .108, -.188], [-.066, .115, -.107], [-.075, .115, -.018], [-.047, .098, .073], [.012, .093, .143]], head: [.079, .126, .171], hp: .14, hy: .42, roll: -1.02, eyes: 1,
    feet: { fl: [.154, .025, .104], fr: [.165, .066, .071], hl: [.135, .025, -.091], hr: [.103, .058, -.069] },
    tail: [[.011, .061, -.200], [.051, .034, -.245], [.127, .028, -.241], [.174, .026, -.193], [.181, .027, -.141]] }),
  eat: P({ spine: [[0, .2, -.19], [0, .19, -.07], [0, .175, .05], [0, .155, .14], [0, .13, .21]], head: [0, .11, .27], hp: .7, hy: 0, roll: 0, eyes: .3,
    feet: { fl: [.055, .02, .14], fr: [-.055, .02, .14], hl: [.06, .02, -.16], hr: [-.06, .02, -.16] }, tail: [[0, .2, -.22], [0, .22, -.31], [0, .22, -.4], [0, .2, -.48], [0, .17, -.54]] }),
  crouch: P({ spine: [[0, .16, -.2], [0, .13, -.08], [0, .11, .04], [0, .11, .13], [0, .14, .2]], head: [0, .17, .25], hp: -.05, hy: 0, roll: 0, eyes: 0,
    feet: { fl: [.055, .02, .16], fr: [-.055, .02, .16], hl: [.07, .02, -.12], hr: [-.07, .02, -.12] }, tail: [[0, .15, -.23], [0, .13, -.33], [0, .1, -.43], [0, .07, -.52], [0, .05, -.6]] }),
};
POSES.groom = { ...POSES.sit, head: [.03, .33, .12], hp: .55, hy: .7, feet: { ...POSES.sit.feet, fl: [.025, .22, .14] } };
POSES.beg = { ...POSES.sit, hp: -.35 };
POSES.petted = { ...POSES.loaf, eyes: 1, hp: .15 };
const SIDE_ELBOWS = {
  fl: [.075, .027, .085], fr: [.108, .075, .050],
  hl: [.085, .030, -.149], hr: [.071, .071, -.132],
};
// 团成一圈：脊柱在水平面上绕一个圆，头靠在屁股旁边
function curlRig(rig) {
  const R = .12, y = .095, a0 = 2.1, a1 = -2.25, sp = [];
  for (let i = 0; i < 5; i++) { const a = a0 + (a1 - a0) * i / 4; sp.push([Math.cos(a) * R, y + (i === 4 ? .015 : 0), Math.sin(a) * R]); }
  rig.spine = sp;
  const ah = a1 - .45; rig.head = [Math.cos(ah) * R * 1.05, .105, Math.sin(ah) * R * 1.05];
  rig.hy = -.35; rig.hp = -.15; rig.roll = 0; // 脸朝外、稍微仰一点，从上面看得到闭着眼的脸
  const t = []; for (let i = 0; i < 5; i++) { const a = a0 + .25 + i * .5; t.push([Math.cos(a) * (R + .1), .04, Math.sin(a) * (R + .1)]); } rig.tail = t;
}
function rigOf(name) {
  const p = POSES[name] || POSES.stand, r = { ...p, spine: p.spine?.map((x) => [...x]), head: [...p.head], feet: Object.fromEntries(Object.entries(p.feet).map(([k, v]) => [k, [...v]])), tail: p.tail?.map((x) => [...x]), lift: p.lift || 0, curlAmount: Number(!!p.curl),
    sideAmount: Number(name === 'side'),
    flat: ['curl', 'side', 'loaf', 'petted'].includes(name) ? 1 : 0 }; // 趴着 / 团着的时候身体被压扁一点，不像一根圆木头
  if (p.curl) curlRig(r);
  return r;
}
function lerpRig(a, b, k) {
  const L = (x, y) => x + (y - x) * k, LA = (x, y) => x.map((v, i) => L(v, y[i]));
  return { spine: a.spine.map((p, i) => LA(p, b.spine[i])), head: LA(a.head, b.head), hp: L(a.hp, b.hp), hy: L(a.hy, b.hy), roll: L(a.roll, b.roll), eyes: L(a.eyes, b.eyes), lift: L(a.lift, b.lift), flat: L(a.flat || 0, b.flat || 0), curlAmount: L(a.curlAmount, b.curlAmount), sideAmount: L(a.sideAmount, b.sideAmount),
    feet: Object.fromEntries(Object.keys(a.feet).map((f) => [f, LA(a.feet[f], b.feet[f])])), tail: a.tail.map((p, i) => LA(p, b.tail[i])) };
}

const HEAD_Y = .103, HEAD_DEPTH = .096;
const headWidth = (y) => .114 * (1 + .12 * Math.exp(-(((y + .026) / .047) ** 2)));
function muzzle(x, y) {
  const lobe = Math.exp(-(((Math.abs(x) - .018) / .028) ** 2 + ((y + .035) / .022) ** 2));
  return .012 * lobe;
}
function faceDepth(x, y) {
  const z = Math.sqrt(Math.max(0, 1 - (x / headWidth(y)) ** 2 - (y / HEAD_Y) ** 2));
  return HEAD_DEPTH * z + muzzle(x, y) * z;
}

function eyeGeometry(side) {
  const geo = new THREE.PlaneGeometry(.055, .054, 18, 16);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getY(i);
    const x = side * (.046 + u), y = -.005 + v;
    p.setXYZ(i, x, y, faceDepth(x, y) + .0016 + .0024 * Math.max(0, 1 - (u / .027) ** 2 - (v / .024) ** 2));
  }
  if (side === -1) {
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  }
  geo.computeVertexNormals();
  return geo;
}

function earGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-.041, -.020);
  shape.bezierCurveTo(-.029, -.005, -.004, .023, .018, .035);
  shape.bezierCurveTo(.029, .043, .038, .042, .041, .030);
  shape.bezierCurveTo(.046, .008, .039, -.016, .026, -.029);
  shape.quadraticCurveTo(.002, -.034, -.039, -.014);
  const ear = new THREE.ExtrudeGeometry(shape, { depth: .011, bevelEnabled: true, bevelThickness: .009, bevelSize: .007, bevelSegments: 5, curveSegments: 16 });
  // ExtrudeGeometry 给边和正面分开法线。合并同位置的法线后，圆耳缘没有折痕。
  const p = ear.attributes.position, n = ear.attributes.normal, sums = new Map();
  const key = (i) => [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v * 1e6)).join(',');
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    if (!sums.has(k)) sums.set(k, V(0, 0, 0));
    sums.get(k).add(V(n.getX(i), n.getY(i), n.getZ(i)));
  }
  for (let i = 0; i < n.count; i++) {
    const v = sums.get(key(i)).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return ear;
}

function sculptPose(r, breath) {
  const parts = [];
  const add = (channel, center, rotation, radii, along = 0) => {
    parts.push({ channel, radii, along, matrix: new THREE.Matrix4().compose(center, rotation, radii) });
  };
  const between = (channel, a, b, width, height, round, along = 0, roll = 0) => {
    const axis = b.clone().sub(a);
    const length = axis.length();
    const rotation = new THREE.Quaternion().setFromUnitVectors(FORWARD, axis.normalize());
    if (roll) rotation.multiply(new THREE.Quaternion().setFromAxisAngle(FORWARD, roll));
    add(channel, a.clone().lerp(b, .5), rotation, V(width, height, length * .54 + round), along);
    if (channel === 'tail') Object.assign(parts.at(-1), { start: a, end: b });
  };

  const spine = r.spine.map(p => V(...p));
  const head = V(...r.head);
  const neck = head.clone().lerp(spine[4], .35);
  const back = new THREE.CatmullRomCurve3([...spine, neck], false, 'centripetal');
  const yaw = head.clone().sub(back.getPointAt(.84));
  const headRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(r.hp, Math.atan2(yaw.x, yaw.z) + r.hy, r.roll, 'YXZ'));
  const sideways = r.sideAmount;
  const width = 1.09 + .04 * r.flat - .33 * r.curlAmount - .29 * sideways;
  const height = 1 - .18 * r.flat + .13 * sideways;
  const backRoll = 1.26 * sideways;
  // Shape the rump, waist, rib cage and neck independently before joining them into one surface.
  for (const [start, end, w, h, round] of [[.03,.28,.119,.096,.040],[.20,.48,.114,.099,.036],[.41,.67,.126,.105,.039],[.60,.81,.116,.101,.030],[.77,.97,.078,.073,.031]]) {
    between('body', back.getPointAt(start), back.getPointAt(end), w * width * breath, h * height * breath, round, 0, backRoll);
  }
  const headScale = 1.23;
  add('head', head, headRotation, V(.128, HEAD_Y, HEAD_DEPTH).multiplyScalar(headScale));
  Object.assign(parts.at(-1), { localWidth: .128, localHeight: HEAD_Y, localDepth: HEAD_DEPTH });

  for (const f of ['fl', 'fr', 'hl', 'hr']) {
    const front = f[0] === 'f', sign = f[1] === 'l' ? 1 : -1;
    const socket = back.getPointAt(front ? .70 : .19);
    const offset = V(sign * (front ? .070 : .078), -.044, 0).lerp(V(front ? .047 : .056, -.012 - sign * .031, 0), sideways);
    const top = socket.add(offset);
    const foot = V(...r.feet[f]);
    const elbow = top.clone().lerp(foot, .49);
    const bend = Math.max(0, .23 - top.distanceTo(foot)) * .64;
    elbow.add(V(sign * .008, 0, front ? -bend : bend)).lerp(V(...SIDE_ELBOWS[f]), sideways);
    const tucked = top.clone().lerp(back.getPointAt(front ? .80 : .26), .67);
    foot.lerp(tucked, r.curlAmount);
    elbow.lerp(tucked, r.curlAmount);
    const scale = 1 - .50 * r.curlAmount;
    between('leg', top, elbow, (front ? .037 : .053) * scale, (front ? .038 : .053) * scale, .018 * scale);
    between('leg', elbow, foot, .025 * scale, .026 * scale, .010 * scale);
    const paw = foot.clone().add(V(.014 * sideways, 0, .013 * (1 - sideways) * scale));
    const pawRotation = new THREE.Quaternion().setFromAxisAngle(V(0,1,0), sideways * 1.16);
    add('leg', paw, pawRotation, V(.033, .023, .040).multiplyScalar(scale));
  }

  const tail = new THREE.CatmullRomCurve3([back.getPointAt(.10), ...r.tail.map(p => V(...p))], false, 'centripetal');
  const links = 9;
  for (let i = 0; i < links; i++) {
    const fraction = i / links;
    const radius = .033 - .011 * fraction;
    between('tail', tail.getPointAt(fraction), tail.getPointAt((i + 1) / links), radius, radius, radius * .57, (i + .5) / links);
  }
  return { parts, head, headRotation };
}

export class Cat {
  constructor(scene) {
    this.root = new THREE.Group(); scene.add(this.root);
    this.body = new THREE.Group(); this.root.add(this.body);
    const coat = (o) => {
      const m = new THREE.MeshPhysicalMaterial({ roughness: .92, sheen: .28, sheenRoughness: .75, sheenColor: new THREE.Color(0xe0dce2), envMapIntensity: .51, ...o });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.rimColor = RIM;
        sh.fragmentShader = 'uniform vec3 rimColor;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
          outgoingLight = mix(outgoingLight, diffuseColor.rgb * 0.68, 0.60);
          outgoingLight += rimColor * 0.085 * smoothstep(.48, .93, 1.0 - saturate(dot(normal, normalize(vViewPosition))));
          #include <opaque_fragment>`);
      };
      return m;
    };
    this.skin = new CatSkin(sculptPose(rigOf('stand'), 1).parts, coat({}), {
      body: silverBody(), leg: silverRings(false), tail: silverRings(true), head: silverFace(),
    }, headWidth, muzzle);
    this.body.add(this.skin.mesh);
    const head = this.head = new THREE.Group();
    this.body.add(head);
    const add = (geo, mat, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      head.add(mesh);
      return mesh;
    };
    const ear = earGeometry();
    const earCoat = coat({ color: 0xb5b2b6 });
    const innerCoat = coat({ color: 0xe3b0b1, sheen: .16 });
    for (const side of [-1, 1]) {
      const outer = add(ear, earCoat, side * .068, .077, -.013);
      outer.scale.x = side;
      outer.rotation.y = side * .14;
      const inset = add(ear, innerCoat, side * .076, .080, .003);
      inset.scale.set(side * .61, .65, .22);
      inset.rotation.y = outer.rotation.y;
    }

    const noseShape = new THREE.Shape();
    noseShape.moveTo(-.010, .003);
    noseShape.quadraticCurveTo(-.010, .0065, 0, .005);
    noseShape.quadraticCurveTo(.010, .0065, .010, .003);
    noseShape.quadraticCurveTo(.008, -.001, .002, -.006);
    noseShape.quadraticCurveTo(0, -.0075, -.002, -.006);
    noseShape.quadraticCurveTo(-.008, -.001, -.010, .003);
    const nose = new THREE.ExtrudeGeometry(noseShape, { depth: .001, bevelEnabled: true, bevelThickness: .0015, bevelSize: .0014, bevelSegments: 3, curveSegments: 12 });
    add(nose, coat({ color: 0xd88f90, roughness: .65, sheen: 0 }), 0, -.032, faceDepth(0, -.032) + .001).scale.setScalar(.76);

    const mouth = new THREE.MeshBasicMaterial({ color: 0x685563 });
    const detail = (pts, radius, mat) => {
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, radius, 5, false);
      add(tube, mat).castShadow = false;
    };
    const surface = (x, y) => V(x, y, faceDepth(x, y) + .0011);
    detail([surface(0, -.036), surface(0, -.040), surface(0, -.044)], .00066, mouth);
    for (const side of [-1, 1]) {
      detail([surface(0, -.044), surface(side * .003, -.047), surface(side * .007, -.049)], .00063, mouth);
      const whisker = new THREE.MeshBasicMaterial({ color: 0xa7a0a4, transparent: true, opacity: .55, depthWrite: false });
      for (let i = 0; i < 3; i++) {
        const y = -.039 - i * .005, start = surface(side * (.026 + i * .003), y);
        detail([start, surface(side * .056, y + .003), V(side * .093, y + .013 - i * .006, .067), V(side * (.123 - i * .006), y + .018 - i * .010, .037)], .00060, whisker);
      }
    }

    this.eyeOpen = buttonEye(false);
    this.eyeClosed = buttonEye(true);
    this.eyeMat = new THREE.MeshBasicMaterial({ map: this.eyeOpen, transparent: true, alphaTest: .035, depthWrite: false });
    for (const side of [-1, 1]) add(eyeGeometry(side), this.eyeMat).castShadow = false;
    head.scale.setScalar(1.23);
    this.root.traverse((o) => { o.userData.noNav = true; o.userData.noAO = true; });
    // 状态
    this.pose = 'stand'; this.from = rigOf('stand'); this.to = rigOf('stand'); this.blend = 1; this.t = 0; this.moving = 0; this.phase = 0; this.blinkAt = 2;
    this.update(0);
  }
  setPose(name, instant = false) {
    if (name === this.pose && !instant) return;
    this.from = this.cur ? this.cur : rigOf(name); this.to = rigOf(name); this.pose = name; this.blend = instant ? 1 : 0;
  }
  update(dt) {
    this.t += dt; const t = this.t;
    this.blend = Math.min(1, this.blend + dt * 2.6); const k = this.blend * this.blend * (3 - 2 * this.blend);
    const r = lerpRig(this.from, this.to, k); this.cur = r;
    const mv = this.moving, run = Math.min(1, mv / 1.2);
    // 走路：对角步态，身体一点点起伏，尾巴摆
    if (mv > .02) {
      this.phase += dt * (5 + mv * 6);
      const ph = this.phase, sw = .038 + run * .046, lift = .024 + run * .033;
      const off = { fl: 0, hr: 0, fr: Math.PI, hl: Math.PI };
      for (const f in r.feet) { const s = Math.sin(ph + off[f]); r.feet[f][2] += s * sw; r.feet[f][1] += Math.max(0, Math.cos(ph + off[f])) * lift; }
      const bob = Math.abs(Math.sin(ph)) * .006; for (const p of r.spine) p[1] += bob; r.head[1] += bob;
      for (let i = 1; i < 5; i++) r.tail[i][0] += Math.sin(ph * .5 + i * .6) * .02 * i;
    } else if (this.pose !== 'curl' && this.pose !== 'side') {
      // 不动的时候尾巴尖慢慢甩
      for (let i = 2; i < 5; i++) r.tail[i][0] += Math.sin(t * 1.3 + i * .7) * .012 * i;
    }
    if (this.pose === 'groom') { r.head[1] += Math.sin(t * 7) * .006; r.hp += Math.sin(t * 7) * .08; }
    if (this.pose === 'crouch') { r.tail[4][0] += Math.sin(t * 9) * .04; r.tail[3][0] += Math.sin(t * 9 - .6) * .025; const hop = Math.max(0, Math.sin(t * 2.2)) ** 6; this.root.position.y += 0; r.lift += hop * .12; for (const f in r.feet) r.feet[f][2] += hop * .05; }
    // 呼吸
    const breath = 1 + Math.sin(t * (this.pose === 'curl' || this.pose === 'side' ? 1.6 : 2.6)) * .025;
    const pose = sculptPose(r, breath);
    this.skin.update(pose.parts);
    this.head.position.copy(pose.head);
    this.head.quaternion.copy(pose.headRotation);
    this.body.position.y = r.lift;
    // 眼睛：睡着闭眼，醒着偶尔眨
    if (t > this.blinkAt + .14) this.blinkAt = t + 2.5 + Math.random() * 4;
    const blink = t >= this.blinkAt && r.eyes < .5;
    const closed = r.eyes > .5 || blink; const tex = closed ? this.eyeClosed : this.eyeOpen;
    if (this.eyeMat.map !== tex) { this.eyeMat.map = tex; this.eyeMat.needsUpdate = true; }
  }
}
