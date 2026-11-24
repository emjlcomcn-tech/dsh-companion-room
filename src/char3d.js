// 3D 大肥鱼：卡通材质 + 描边 + 表情贴图切换 + 程序化姿势和动作
// 大肥鱼模型由不想待在银河系制作，经授权随项目发布。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const D2R = Math.PI / 180;
const AX = { X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) };
// 模型空间：她面朝 +X，头顶 +Y，她的右手边是 +Z
export const R = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(AX[axis], deg * D2R);
const mul = (...qs) => qs.reduce((a, q) => a.multiply(q), new THREE.Quaternion());

export const RIM = { value: new THREE.Color(0, 0, 0) };
export const SOLE = 0.54;     // 模型原点到鞋底
export const HIP = 0.413;      // 站立时髋部离地（模型单位）

// 保留原画贴图，用不同的高光宽度和强度区分皮肤、头发、织物和鞋。
function finishFor(name) {
  if (name === 'dfy_hair' || name === 'dfy_tail') return [12, .018, .13];
  if (name.startsWith('dfy_body')) return [17, .013, .11];
  if (name.startsWith('dfy_shoe')) return [19, .038, .12];
  if (name === 'dfy_deco') return [17, .025, .14];
  return [12, .016, .12];
}

// Eye contours measured on the front projection of the original face mesh.
// Each row is lateral position, upper lid, and lower lid.
const EYE = [
  [.027, .280, .260],
  [.042, .296, .247],
  [.057, .298, .215],
  [.082, .301, .211],
  [.104, .300, .216],
  [.120, .291, .232],
  [.133, .286, .242],
  [.149, .279, .250],
];
const SEAM = [.235, 8.2, .077];
const smooth = THREE.MathUtils.smoothstep;
function eyeProfile(z) {
  const i = EYE.findIndex(([x]) => z <= x);
  if (i < 1) return null;
  const [a, b] = [EYE[i - 1], EYE[i]];
  const t = (z - a[0]) / (b[0] - a[0]);
  return a.slice(1).map((value, j) => THREE.MathUtils.lerp(value, b[j + 1], t));
}

function closedFace(geometry) {
  const { position, normal } = geometry.attributes;
  const positions = new Float32Array(position.count * 3);
  const normals = new Float32Array(normal.count * 3);
  const smooth = THREE.MathUtils.smoothstep;
  const n = new THREE.Vector3(), target = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i), side = Math.abs(z);
    const profile = eyeProfile(side);
    if (!profile || x < .060) continue;
    const [upper, lower] = profile;
    const seam = SEAM[0] + SEAM[1] * (side - SEAM[2]) ** 2;
    const mask = smooth(x, .060, .096)
      * smooth(y, lower - .015, lower + .013)
      * (1 - smooth(y, upper - .012, upper + .014))
      * smooth(side, .027, .049) * (1 - smooth(side, .116, .149));
    if (!mask) continue;
    // A closed lid gently follows the eye's convex surface. Keep the nose,
    // mouth, and cheek geometry from the original model.
    const orbit = .166 - 2.7 * z * z - 1.18 * (y - .296) ** 2;
    const lid = orbit + .003 * Math.exp(-(((y - seam - .011) / .024) ** 2));
    // Leave some of the original depth ordering where the socket folds over itself.
    positions[i * 3] = Math.max(0, lid - x) * mask * .92;
    n.fromBufferAttribute(normal, i);
    target.set(1, 2.36 * (y - .296), 5.4 * z).normalize()
      .lerp(n, 1 - mask * .94).normalize().sub(n).toArray(normals, i * 3);
  }
  return { positions, normals };
}

function reshapeHead(out, x, y, z) {
  const head = smooth(y, .105, .205);
  const cheek = smooth(x, .042, .136) * smooth(y, .114, .166) * (1 - smooth(y, .215, .306));
  out.set(x + .007 * cheek, y - .036 * (y - .22) * head, z * (1 + .053 * head + .09 * cheek));
}

function reshapeHeadMesh(geometry, material, lidMorph) {
  const { position } = geometry.attributes;
  const point = new THREE.Vector3(), closed = new THREE.Vector3();
  if (lidMorph) geometry.setAttribute('faceRestPosition', position.clone());
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i), k = i * 3;
    reshapeHead(point, x, y, z);
    if (material === 'dfy_hair') {
      const front = smooth(x, .117, .191);
      const fringe = front * (1 - smooth(Math.abs(z), .063, .127))
        * smooth(y, .177, .242) * (1 - smooth(y, .281, .422));
      point.y += .012 * fringe;
      // Bring the outer curls in below the face, leaving the bangs and roots in place.
      point.z *= 1 - .105 * (1 - smooth(y, -.052, .169)) * smooth(Math.abs(z), .190, .376);
    } else if (material === 'dfy_deco') {
      point.y += .008 * smooth(y, .409, .547);
    }
    position.setXYZ(i, point.x, point.y, point.z);
    if (lidMorph) {
      reshapeHead(closed, x + lidMorph.positions[k], y, z);
      closed.sub(point).toArray(lidMorph.positions, k);
    }
  }
  position.needsUpdate = true;
  geometry.computeBoundingSphere();
  if (lidMorph) {
    geometry.morphTargetsRelative = true;
    geometry.morphAttributes.position = [new THREE.BufferAttribute(lidMorph.positions, 3)];
    geometry.morphAttributes.normal = [new THREE.BufferAttribute(lidMorph.normals, 3)];
  }
}

function roundTail(geometry) {
  const { position } = geometry.attributes;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const fin = (1 - smooth(x, -.36, -.20)) * smooth(Math.abs(z), .045, .19);
    position.setXYZ(i, x - .014 * fin, y, z * (1 + .11 * fin));
  }
  position.needsUpdate = true;
  geometry.computeBoundingSphere();
}

const EYE_GLSL = EYE.slice(1).map((row, i) => {
  const a = EYE[i];
  return `profile = mix(profile, vec2(${row.slice(1).join(',')}), clamp((side - ${a[0]}) / ${(row[0] - a[0]).toFixed(4)}, 0., 1.));`;
}).join('\n');

const EYELIDS = `
  float side = abs(facePosition.z);
  vec2 profile = vec2(${EYE[0].slice(1).join(',')});
  ${EYE_GLSL}
  float front = smoothstep(.050, .082, facePosition.x)
    * smoothstep(.017, .027, side) * (1. - smoothstep(.147, .166, side));
  float closeEyes = smoothstep(.16, .89, sleeping);
  float lower = mix(profile.x, profile.y - .017, closeEyes);
  float frontLid = front * smoothstep(lower - .008, lower + .005, facePosition.y)
    * (1. - smoothstep(profile.x + .015, profile.x + .027, facePosition.y));
  float fromCenter = side - ${SEAM[2]};
  float seam = mix(${SEAM[0]} + ${SEAM[1]} * fromCenter * fromCenter,
    .270 - 11.0 * fromCenter * fromCenter, happy);
  float lidDistance = facePosition.y - seam;
  float eyeLength = smoothstep(.031, .051, side) * (1. - smoothstep(.112, .135, side));
  float crease = exp(-pow(abs(lidDistance - .012) / .009, 2.)) * eyeLength;
  float cheek = exp(-pow(abs(facePosition.y - .211) / .021, 2.)) * smoothstep(.040, .095, side);
  vec3 skin = mix(vec3(.969, .867, .799), vec3(.957, .637, .53), cheek * .66);
  skin = mix(skin, vec3(.76, .54, .47), crease * .19);
  float lidWidth = .0004 + .0013 * eyeLength + .0005 * smoothstep(.06, .115, side);
  float lid = (1. - smoothstep(lidWidth, lidWidth + .0013, abs(lidDistance))) * eyeLength;
  vec3 faceColor = mix(skin, vec3(.14, .062, .065), lid * mix(.72, .95, happy));
  // The original brow lines extend into the fringe above the eyes.
  float brow = front * smoothstep(profile.x - .02, profile.x, facePosition.y)
    * (1. - smoothstep(.367, .389, facePosition.y));
  float closedArea = max(frontLid, brow) * closeEyes;
  diffuseColor.rgb = mix(diffuseColor.rgb, faceColor, closedArea);
  float mouthArea = smoothstep(.075, .118, facePosition.x)
    * (1. - smoothstep(.033, .060, side))
    * smoothstep(.181, .194, facePosition.y)
    * (1. - smoothstep(.211, .224, facePosition.y));
  diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(smileMap, vMapUv).rgb, mouthArea * smile);
`;

const FACE_TONES = `
  float faceLight = smoothstep(.064, .114, facePosition.x)
    * smoothstep(.118, .166, facePosition.y) * (1. - smoothstep(.32, .37, facePosition.y));
  vec3 albedo = diffuseColor.rgb;
  float iris = (1. - sleeping) * faceLight * smoothstep(.024, .113, albedo.b - albedo.r)
    * smoothstep(.031, .056, side) * (1. - smoothstep(.108, .135, side));
  float lowerIris = 1. - smoothstep(.213, .280, facePosition.y);
  float irisValue = dot(albedo, vec3(.213, .715, .072));
  vec3 irisTone = mix(albedo * vec3(.84, .91, .98), albedo * vec3(.91, 1.04, 1.00), lowerIris);
  irisTone = mix(irisTone, irisValue * vec3(.84, 1.08, 1.46), .19);
  diffuseColor.rgb = mix(albedo, irisTone, iris);
  float skinMask = smoothstep(.18, .48, albedo.r) * smoothstep(.03, .16, albedo.r - albedo.b);
  float blush = exp(-pow(abs(side - .116) / .034, 2.) - pow(abs(facePosition.y - .207) / .022, 2.));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.83, .48, .44), skinMask * faceLight * blush * (.15 + .28 * smile));
`;

// ---------- 姿势库 ----------
// 四肢用「指向」描述：给出骨骼在模型空间里应该指向的方向（x 向前，y 向上，z 向她的右边）。
// 左右对称的姿势只写左手（l），右手自动把 z 取反。躯干和头用旋转描述。
const L = (x, y, z) => ({ dir: [x, y, z] });
const mir = (o) => { const r = {}; for (const k in o) r[k.replace(/l$/, 'r')] = o[k].dir ? { dir: [o[k].dir[0], o[k].dir[1], -o[k].dir[2]] } : o[k]; return r; };
const both = (o) => ({ ...o, ...mir(o) });
const ARM = {
  relax: { arm_fkl: L(0.06, -0.94, -0.33), forearm_fkl: L(0.22, -0.95, -0.2) },
  type: { arm_fkl: L(.79, -.52, -.25), forearm_fkl: L(.98, .12, .13) },
  hold: { arm_fkl: L(0.3, -0.88, -0.35), forearm_fkl: L(0.8, 0.38, 0.46) },
  lap: { arm_fkl: L(0.3, -0.9, -0.3), forearm_fkl: L(0.88, -0.35, 0.32) },
  mouth: { arm_fkl: L(0.45, -0.8, -0.38), forearm_fkl: L(0.15, 0.88, 0.45) },
  up: { arm_fkl: L(0.05, 0.96, -0.28), forearm_fkl: L(0.05, 0.98, -0.18) },
  behind: { arm_fkl: L(-0.35, -0.9, -0.25), forearm_fkl: L(-0.45, -0.1, 0.88) },
  front: { arm_fkl: L(0.6, -0.65, -0.35), forearm_fkl: L(0.95, 0.15, 0.25) },
  reach: { arm_fkl: L(0.8, -0.2, -0.45), forearm_fkl: L(0.95, 0.15, -0.1) },
  side: { arm_fkl: L(0.1, -0.55, -0.83), forearm_fkl: L(0.3, -0.45, -0.84) },
  cheek: { arm_fkl: L(0.35, -0.85, -0.4), forearm_fkl: L(0.2, 0.75, 0.62) },
};
const left = (a) => ({ ...a }); const right = (a) => mir(a);
const LEGS = {
  sit: both({ thigh_fkl: L(0.99, -0.06, -0.1), leg_fkl: L(0.18, -0.98, -0.06), footl: L(0.85, -0.5, 0) }),
  sitWide: both({ thigh_fkl: L(0.97, -0.06, -0.22), leg_fkl: L(0.3, -0.95, -0.12), footl: L(0.85, -0.5, 0) }),
  perch: both({ thigh_fkl: L(.98, .04, -.17), leg_fkl: L(.99, -.07, -.10), footl: L(.61, -.78, -.12) }),
  sofa: both({ thigh_fkl: L(.91, -.40, -.12), leg_fkl: L(.23, -.97, -.07), footl: L(.88, -.46, 0) }),
};
export const POSES = {
  stand: { bones: both(ARM.relax) },
  sit: { bones: { ...LEGS.sit, ...both(ARM.lap), spine_01x: R('Z', 4) }, seat: true },
  type: { bones: { ...LEGS.sit, ...both(ARM.type), spine_01x: R('Z', -16), headx: R('Z', -8), Tail_Spring_1: R('Z', 17) }, seat: true },
  game: { bones: { ...LEGS.sit, ...both(ARM.hold), spine_01x: R('Z', -6), headx: R('Z', -4) }, seat: true },
  read: { bones: { ...LEGS.sit, ...both(ARM.hold), spine_01x: R('Z', 6), headx: R('Z', -20) }, seat: true },
  phone: { bones: { ...LEGS.sit, ...left(ARM.lap), ...right(ARM.hold), spine_01x: R('Z', 2), headx: mul(R('Y', -12), R('Z', -22)) }, seat: true },
  eat: { bones: { ...LEGS.sit, ...left(ARM.lap), ...right(ARM.mouth), spine_01x: R('Z', -6) }, seat: true },
  lounge: { bones: { ...LEGS.sitWide, ...both(ARM.lap), spine_01x: R('Z', 16), headx: R('Z', 8) }, seat: true },
  listen: { bones: { ...LEGS.sit, ...both(ARM.lap), spine_01x: R('Z', 3), headx: R('Z', 2) }, seat: true },
  petcat: { bones: { ...LEGS.sit, ...both(ARM.lap), spine_01x: R('Z', -3), headx: R('Z', -10) }, seat: true },
  perch: { bones: { ...LEGS.perch, ...both(ARM.lap), spine_01x: R('Z', 8), headx: R('Z', 5) }, seat: true },
  unwell: { bones: { ...both(ARM.relax), ...left(ARM.cheek), spine_01x: R('Z', -11), headx: mul(R('Z', -14), R('X', -7)) } },
  awaitingCare: { bones: { ...LEGS.sitWide, ...left(ARM.cheek), ...right(ARM.lap), spine_01x: R('Z', -14), headx: mul(R('Z', -17), R('X', -8)) }, seat: true },
  foldedIn: { bones: { ...LEGS.perch, ...both(ARM.lap), spine_01x: R('Z', -19), headx: mul(R('Y', -25), R('Z', -24)) }, seat: true },
  lookingAway: { bones: { ...LEGS.perch, ...left(ARM.lap), ...right(ARM.cheek), spine_01x: R('Z', -7), headx: mul(R('Y', 27), R('Z', -16)) }, seat: true },
  askingForHelp: { bones: { ...LEGS.perch, ...left(ARM.lap), ...right(ARM.front), spine_01x: R('Z', -5), headx: R('Z', 2) }, seat: true },
  tiredSmile: { bones: { ...LEGS.perch, ...both(ARM.lap), spine_01x: R('Z', -5), headx: mul(R('Y', 13), R('X', -8)) }, seat: true },
  shaky: { bones: { ...LEGS.perch, ...both(ARM.lap), spine_01x: R('Z', -20), headx: mul(R('Z', -24), R('X', 12)) }, seat: true },
  toilet: { bones: { ...LEGS.sit, ...left(ARM.lap), ...right(ARM.cheek), spine_01x: R('Z', -6), headx: R('X', 8) }, seat: true },
  cook: { bones: { ...both(ARM.front), spine_01x: R('Z', -6), headx: R('Z', -16) } },
  wash: { bones: { ...left(ARM.front), ...right(ARM.mouth), spine_01x: R('Z', -10), headx: R('Z', -6) } },
  window: { bones: { ...both(ARM.behind), headx: R('Z', 6) } },
  stargaze: { bones: { ...left(ARM.reach), ...right(ARM.front), spine_01x: R('Z', -14), headx: R('Z', -4) } },
  music: { bones: { ...both(ARM.behind) } },
  dress: { bones: { ...left(ARM.side), ...right(ARM.cheek), headx: R('Y', 10) } },
  tidy: { bones: { ...both(ARM.front), spine_01x: R('Z', -18), headx: R('Z', -10) } },
  plant: { bones: { ...left(ARM.relax), ...right(ARM.reach), spine_01x: R('Z', -10), headx: R('Z', -12) } },
  stretch: { bones: { ...both(ARM.up), spine_01x: R('Z', 8), headx: R('Z', 12) } },
  wave: { bones: { ...left(ARM.relax), ...right(ARM.up) } },
  noticeFriend: { bones: { ...both(ARM.relax), headx: mul(R('Z', -10), R('X', 7)) } },
  greetFriend: { bones: { ...left(ARM.relax), arm_fkr: L(.22, .25, .94), forearm_fkr: L(.21, .94, .24), headx: R('X', -7) } },
  swim: { bones: { headx: R('Z', 27), spine_01x: R('Z', 7) } },
  sleep: { bones: {
    ...left(ARM.lap), ...right(ARM.relax),
    headx: mul(R('Y', 8), R('Z', -4)),
    thigh_fkl: L(.08, -.99, -.10), thigh_fkr: L(.16, -.98, .11),
    leg_fkl: L(-.04, -.99, -.06), leg_fkr: L(-.15, -.98, .06),
  }, lie: true, face: 'closed' },
  woken: { bones: { ...both(ARM.hold), spine_01x: R('Z', -6), headx: R('Z', -24) }, lie: true, prone: true },
};
export class DFY {
  constructor(scene, { base = '/r3d/', height = 1.25, anisotropy = 4 } = {}) {
    this.scene = scene; this.base = base; this.scale = height / 1.17; this.anisotropy = anisotropy;
    this.root = new THREE.Group(); scene.add(this.root);
    this.model = null; this.bones = {}; this.rest = {}; this.order = [];
    this.pose = 'stand'; this.from = null; this.blend = 1; this.walking = 0; this.t = 0; this.face = 'open'; this.nextBlink = 2;
    this.sleeping = { value: 0 };
    this.smile = { value: 0 };
    this.happy = { value: 0 };
    this.smileMap = { value: null };
    this.faceMeshes = [];
  }
  async load() {
    const gltf = await new GLTFLoader().loadAsync(this.base + 'dfy.glb');
    const m = gltf.scene; m.scale.setScalar(this.scale); m.position.y = SOLE * this.scale;
    this.root.add(m); this.model = m;
    m.updateMatrixWorld(true);
    this.mats = []; const outlines = [];
    m.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.frustumCulled = false; o.castShadow = true; o.receiveShadow = false;
      const src = Array.isArray(o.material) ? o.material : [o.material];
      const toon = src.map((s) => {
        this.filterTexture(s.map);
        const t = new THREE.MeshToonMaterial({ map: s.map, color: s.color, side: s.side });
        const [gloss, strength, rim] = finishFor(s.name);
        const face = s.name === 'dfy_body0';
        const blue = /^dfy_(hair|tail|cloth|deco|shoe)$/.test(s.name);
        const cloth = s.name === 'dfy_cloth';
        t.customProgramCacheKey = () => s.name;
        t.onBeforeCompile = (sh) => {
          sh.uniforms.rimColor = RIM;
          sh.uniforms.finish = { value: new THREE.Vector3(gloss, strength, rim) };
          sh.fragmentShader = 'uniform vec3 rimColor;\nuniform vec3 finish;\n' + sh.fragmentShader
            .replace('#include <lights_toon_pars_fragment>', THREE.ShaderChunk.lights_toon_pars_fragment.replace(
              'vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;',
              `float facing = dot(geometryNormal, directLight.direction);
               float softLight = mix(0.42, 0.88, smoothstep(-0.19, 0.48, facing));
               vec3 light = directLight.color / (1.0 + 0.34 * max(max(directLight.color.r, directLight.color.g), directLight.color.b));
               vec3 irradiance = softLight * light;
               vec3 halfVector = normalize(directLight.direction + geometryViewDir);
               float shine = pow(saturate(dot(geometryNormal, halfVector)), finish.x);
               reflectedLight.directSpecular += light * mix(vec3(1.0), material.diffuseColor, 0.48)
                 * (shine * finish.y * smoothstep(0.0, 0.5, facing));`))
            .replace('#include <opaque_fragment>',
              `float edge = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
               outgoingLight += reflectedLight.directSpecular + diffuseColor.rgb * 0.21;
               outgoingLight += rimColor * mix(vec3(1.0), diffuseColor.rgb, 0.62) * finish.z * smoothstep(0.53, 0.98, edge);
               #include <opaque_fragment>`);
          if (blue) {
            sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
              vec3 baseColor = diffuseColor.rgb;
              float blueInk = smoothstep(.025, .115, baseColor.b - baseColor.r);
              float shade = smoothstep(.012, .58, baseColor.b);
              vec3 denim = mix(vec3(.042, .062, .117), vec3(.226, .345, .515), shade);
              diffuseColor.rgb = mix(baseColor, denim, blueInk * .62);
              ${cloth ? `float gold = smoothstep(.055, .21, baseColor.r - baseColor.b)
                * smoothstep(.03, .13, baseColor.r - baseColor.g);
              float luminance = dot(baseColor, vec3(.213, .715, .072));
              vec3 thread = luminance * vec3(1.19, .99, .85);
              diffuseColor.rgb = mix(diffuseColor.rgb, thread, gold * .61);` : ''}
            `);
          }
          if (face) {
            sh.uniforms.sleeping = this.sleeping;
            sh.uniforms.smile = this.smile;
            sh.uniforms.happy = this.happy;
            sh.uniforms.smileMap = this.smileMap;
            sh.vertexShader = 'attribute vec3 faceRestPosition;\nvarying vec3 facePosition;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nfacePosition = faceRestPosition;');
            sh.fragmentShader = 'varying vec3 facePosition;\nuniform float sleeping;\nuniform float smile;\nuniform float happy;\nuniform sampler2D smileMap;\n' + sh.fragmentShader
              .replace('#include <map_fragment>', '#include <map_fragment>\n' + EYELIDS + FACE_TONES)
              .replace('#include <opaque_fragment>', `vec3 fill = diffuseColor.rgb * (.69 + rimColor * .36);
              outgoingLight = mix(outgoingLight, fill, max(faceLight * .34, closedArea * .63));
              #include <opaque_fragment>`)
              .replace('shine * finish.y', 'shine * finish.y * (1. - sleeping)');
          }
        };
        t.name = s.name; this.mats.push(t); return t;
      });
      o.material = Array.isArray(o.material) ? toon : toon[0];
      if (src.length === 1 && src[0].name === 'dfy_body0') {
        reshapeHeadMesh(o.geometry, src[0].name, closedFace(o.geometry));
        o.updateMorphTargets();
        this.faceMeshes.push(o);
      } else if (src.some(s => /^dfy_(hair|deco)$/.test(s.name))) {
        reshapeHeadMesh(o.geometry, src[0].name);
      } else if (src.some(s => s.name === 'dfy_tail')) {
        roundTail(o.geometry);
      }
      if (src.some((s) => /^dfy_(hair|tail)/.test(s.name))) outlines.push(o);
    });
    // 描边：同一套骨骼的反面外扩网格
    const olMat = new THREE.MeshBasicMaterial({ color: 0x222838, side: THREE.BackSide });
    olMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(objectNormal) * 0.0017;'); };
    for (const o of outlines) {
      const ol = new THREE.SkinnedMesh(o.geometry, olMat); ol.frustumCulled = false; ol.bind(o.skeleton, o.bindMatrix); o.parent.add(ol);
      ol.userData.noAO = true;
      ol.position.copy(o.position); ol.quaternion.copy(o.quaternion); ol.scale.copy(o.scale);
    }
    const sk = this.bindRig(m);
    // 头发链：用来做轻微摆动
    this.hair = sk.bones.filter((b) => /^(Back|Bang|Side)/.test(b.name));
    this.tail = sk.bones.filter((b) => /^Tail_Spring_[23]$/.test(b.name));
    this.skirtPanels = sk.bones.filter(b => /^Skirt_\d+_1$/.test(b.name)).map(bone => {
      const radial = this.restDir[bone.name].clone();
      radial.y = 0;
      radial.normalize();
      return { name: bone.name, forward: radial.x, axis: new THREE.Vector3(-radial.z, 0, radial.x) };
    });
    // 表情贴图
    this.faceMat = this.mats.find((x) => x.name === 'dfy_body0');
    this.faces = { open: this.faceMat.map };
    this.smileMap.value = this.faces.open;
    this.setPose('stand', true);
    const tl = new THREE.TextureLoader();
    await Promise.all(['smile', 'talk'].map(async (k) => {
      try {
        const t = await tl.loadAsync(this.base + `face_${k}.webp`);
        t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.channel = this.faces.open.channel;
        this.filterTexture(t); this.faces[k] = t;
      } catch (error) { console.warn('表情贴图加载失败', k, error); }
    }));
    this.smileMap.value = this.faces.smile || this.faces.open;
    return this;
  }
  bindRig(model, aliases = new Map()) {
    let skeleton;
    model.traverse((mesh) => { if (mesh.isSkinnedMesh && !skeleton) skeleton = mesh.skeleton; });
    if (!skeleton) throw new Error('找不到角色骨骼');
    this.skeleton = skeleton;
    const inverse = model.getWorldQuaternion(new THREE.Quaternion()).invert();
    const names = this.boneNames = new Map(skeleton.bones.map(b => [b, aliases.get(b) || b.name]));
    this.restDir = {};
    for (const [bone, name] of names) {
      const world = inverse.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
      this.bones[name] = bone;
      this.rest[name] = { pos: bone.position.clone(), world };
      this.restDir[name] = new THREE.Vector3(0, 1, 0).applyQuaternion(world).normalize();
    }
    const visit = (bone) => {
      this.order.push(bone);
      for (const child of bone.children) if (names.has(child)) visit(child);
    };
    for (const [bone, name] of names) {
      if (names.has(bone.parent)) continue;
      this.rest[name].parentWorld = inverse.clone().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion()));
      visit(bone);
    }
    this.hipBone = this.bones.rootx;
    if (!this.hipBone || !this.bones.headx) throw new Error('角色缺少髋部或头部骨骼');
    return skeleton;
  }
  filterTexture(texture) {
    if (!texture) return;
    texture.anisotropy = this.anisotropy;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  }
  setFace(k) {
    this.face = k;
    const map = k === 'talk' ? this.faces.talk || this.faces.open : this.faces.open;
    if (this.faceMat.map !== map) { this.faceMat.map = map; this.faceMat.needsUpdate = true; }
  }
  setPose(name, instant = false) {
    if (!POSES[name]) name = 'stand';
    if (name === this.pose && !instant) return;
    this.from = !instant && this.cur ? { ...this.cur } : null; this.pose = name; this.blend = instant ? 1 : 0;
    if (instant) this._off = null;
  }
  // 当前目标姿势（含呼吸、走路等叠加），返回 { bone: quaternion(模型空间) }
  target(t) {
    const P = POSES[this.pose]; const q = {};
    for (const k in P.bones) { const v = P.bones[k]; q[k] = v.dir ? this.aim(k, v.dir) : v.clone(); }
    const breath = Math.sin(t * 1.6);
    const sp = q.spine_02x || new THREE.Quaternion(); q.spine_02x = mul(R('Z', breath * 1.2), sp);
    if (this.walking > 0.01) {
      const w = this.walking, ph = this.walkPhase;
      const s = Math.sin(ph), c = Math.cos(ph);
      const legsQ = { thigh_fkl: R('Z', 24 * s * w), thigh_fkr: R('Z', -24 * s * w), leg_fkl: R('Z', (24 * s - 26 * Math.max(0, c)) * w), leg_fkr: R('Z', (-24 * s - 26 * Math.max(0, -c)) * w) };
      // 只在站着走时摆腿。原来对没定义腿部骨骼的姿势（比如睡觉）会塞进 undefined，刚走到床上那几帧 slerp 报错、整个动画循环停掉
      if (this.pose === 'stand') for (const k in legsQ) q[k] = legsQ[k];
      if (this.pose === 'stand') {
        q.arm_fkl = this.aim('arm_fkl', [0.06 - 0.32 * s * w, -0.94, -0.3]); q.forearm_fkl = this.aim('forearm_fkl', [0.22 - 0.3 * s * w + 0.2 * w, -0.95, -0.18]);
        q.arm_fkr = this.aim('arm_fkr', [0.06 + 0.32 * s * w, -0.94, 0.3]); q.forearm_fkr = this.aim('forearm_fkr', [0.22 + 0.3 * s * w + 0.2 * w, -0.95, 0.18]);
        q.spine_01x = mul(R('Y', 5 * s * w), R('Z', -4 * w));
      }
    }
    // 只是站着：偶尔歪头、轻轻晃
    if (this.pose === 'stand' && this.walking < 0.5) {
      q.headx = mul(R('X', 4 * Math.sin(t * 0.37)), R('Y', 7 * Math.sin(t * 0.23)), q.headx || new THREE.Quaternion());
      q.spine_01x = mul(R('X', 1.5 * Math.sin(t * 0.5)), q.spine_01x || new THREE.Quaternion());
    }
    if (this.pose === 'type') { const k = Math.sin(t * 14) * 3; q.forearm_fkl = mul(R('Z', k), q.forearm_fkl); q.forearm_fkr = mul(R('Z', -k), q.forearm_fkr); }
    if (this.pose === 'greetFriend') q.forearm_fkr = mul(R('X', 15 * Math.sin(t * 9)), q.forearm_fkr);
    if (this.pose === 'cook') { const k = t * 2.4; q.forearm_fkr = mul(R('Y', 14 * Math.sin(k)), R('X', 10 * Math.cos(k)), q.forearm_fkr); }
    if (this.pose === 'eat') { const k = (Math.sin(t * 1.3) + 1) / 2; q.forearm_fkr = q.forearm_fkr.clone().slerp(this.aim('forearm_fkr', [0.9, 0.1, -0.35]), 1 - k); }
    if (this.pose === 'petcat' && this.catLook) {
      const stroke = Math.sin(t * 2.9);
      q.arm_fkr = this.aim('arm_fkr', [.15 + .11 * stroke, -.77, .55]);
      q.forearm_fkr = this.aim('forearm_fkr', [.20 + .18 * stroke, -.25, .90]);
      q.headx = mul(R('X', 4 + 1.7 * stroke), q.headx);
    }
    if (this.pose === 'read') {
      const turn = Math.max(0, Math.sin(t * .86)) ** 14;
      q.forearm_fkr = mul(R('Z', 12 * turn), R('Y', 17 * turn), q.forearm_fkr);
      q.headx = mul(R('Y', 3.5 * Math.sin(t * 1.05)), q.headx);
    }
    if (this.pose === 'listen') {
      q.spine_01x = mul(R('X', 2.5 * Math.sin(t * 1.8)), q.spine_01x);
      q.headx = mul(R('X', 5 * Math.sin(t * 1.8 + .6)), q.headx);
    }
    if (this.pose === 'tidy') { q.spine_01x = mul(R('Y', 18 * Math.sin(t * 2.0)), q.spine_01x); }
    if (this.pose === 'wash') { q.forearm_fkr = mul(R('Y', 10 * Math.sin(t * 9)), q.forearm_fkr); }
    if (this.pose === 'swim') {
      const phase = Math.sin(t * 5), sweep = (1 + phase) * .5;
      const kick = Math.sin(t * 10);
      for (const [suffix, side] of [['l', -1], ['r', 1]]) {
        q[`arm_fk${suffix}`] = this.aim(`arm_fk${suffix}`, [.17 + .53 * sweep, .33 + .49 * sweep, side * (.94 - .77 * sweep)]);
        q[`forearm_fk${suffix}`] = this.aim(`forearm_fk${suffix}`, [.21 + .59 * sweep, .69, side * (.64 - .54 * sweep)]);
        q[`thigh_fk${suffix}`] = this.aim(`thigh_fk${suffix}`, [.08 + kick * side * .21, -.97, side * .14]);
        q[`leg_fk${suffix}`] = this.aim(`leg_fk${suffix}`, [-.10 + kick * side * .23, -.96, side * .13]);
      }
      q.spine_02x = R('Z', breath + phase * 3);
    }
    if (this.pose === 'sleep') { q.spine_02x = mul(R('Z', breath * 0.6), P.bones.spine_02x || new THREE.Quaternion()); }
    if (P.seat && this.sofaSeat) {
      for (const [name, { dir }] of Object.entries(LEGS.sofa)) q[name] = this.aim(name, dir);
      if (this.skirtPanels) {
        q.Tail_Spring_1 = mul(R('Y', 27), R('Z', -55));
        for (const { name, forward, axis } of this.skirtPanels) {
          q[name] = new THREE.Quaternion().setFromAxisAngle(axis, (17 + 31 * Math.max(0, forward)) * D2R);
        }
      }
    }
    if (this.friendLook) q.headx = mul(R('Y', this.friendLook / D2R), q.headx || new THREE.Quaternion());
    if (this.chatNod) q.headx = mul(R('Z', -this.chatNod), q.headx || new THREE.Quaternion());
    return q;
  }
  aim(bone, dir) {
    const r = this.restDir[bone]; if (!r) return new THREE.Quaternion();
    return new THREE.Quaternion().setFromUnitVectors(r, new THREE.Vector3(...dir).normalize());
  }
  hipOffset() {
    const P = POSES[this.pose]; const o = new THREE.Vector3();
    if (P.seat) o.set(-0.07, -(HIP - (this.seatH ?? 0.45) / this.scale) - 0.02, 0);
    if (P.seat && this.sofaSeat) o.set(-.015, (this.seatH + .086) / this.scale - HIP, 0);
    if (this.walking > 0.01 && this.pose === 'stand') o.y += Math.abs(Math.sin(this.walkPhase)) * 0.012 * this.walking;
    return o;
  }
  update(dt) {
    if (!this.model) return;
    this.t += dt; const t = this.t;
    this.blend = Math.min(1, this.blend + dt * 2.2); const k = this.blend * this.blend * (3 - 2 * this.blend);
    const tgt = this.target(t); const cur = {};
    for (const n in tgt) cur[n] = this.from && this.from[n] ? this.from[n].clone().slerp(tgt[n], k) : (this.from ? new THREE.Quaternion().slerp(tgt[n], k) : tgt[n]);
    if (this.from) for (const n in this.from) if (!tgt[n]) cur[n] = this.from[n].clone().slerp(new THREE.Quaternion(), k);
    this.cur = cur;
    // 写回骨骼：world_b = D_b * rest_b；没指定的骨骼跟随父骨骼的 D
    const Dw = new Map(); const tmp = new THREE.Quaternion(), tmp2 = new THREE.Quaternion();
    for (const b of this.order) {
      const name = this.boneNames.get(b), parent = this.boneNames.get(b.parent), r = this.rest[name];
      const pD = Dw.get(b.parent);
      const D = cur[name] || pD || new THREE.Quaternion(); Dw.set(b, D);
      const pW = parent ? tmp2.copy(pD).multiply(this.rest[parent].world) : tmp2.copy(r.parentWorld);
      tmp.copy(D).multiply(r.world); b.quaternion.copy(pW.clone().invert().multiply(tmp));
    }
    this.moveAccessories(t, tmp);
    // 髋部位移
    const off = this.hipOffset(); this._off = this._off ? this._off.lerp(off, Math.min(1, dt * 5)) : off.clone();
    const r = this.rest['rootx']; const pm = new THREE.Matrix4().extractRotation(this.hipBone.parent.matrixWorld).invert();
    const v = this._off.clone().multiplyScalar(this.scale).applyQuaternion(this.model.getWorldQuaternion(new THREE.Quaternion())).applyMatrix4(pm);
    const ps = this.hipBone.parent.getWorldScale(new THREE.Vector3());
    this.hipBone.position.copy(r.pos).add(v.divide(ps));
    this.updateFace(t, dt);
  }
  moveAccessories(t, tmp) {
    for (const h of this.hair) {
      const lvl = +(h.name.match(/_(\d+)$/) || [0, 1])[1];
      const amp = (this.pose === 'sleep' ? .07 : this.walking * 1.25 + .45) * lvl * D2R;
      h.quaternion.multiply(tmp.setFromAxisAngle(AX.Z, Math.sin(t * (this.walking > .1 ? 7 : 1.7) - lvl * 0.6) * amp));
    }
    if (this.pose === 'stand' || this.pose === 'swim') {
      const swimming = this.pose === 'swim';
      const phase = t * (swimming ? 5 : 1.65 + this.walking * 4);
      const swing = (swimming ? 6.0 : 1.6 + this.walking * 2.6) * D2R;
      for (const [i, bone] of this.tail.entries()) {
        bone.quaternion.multiply(tmp.setFromAxisAngle(AX.X, Math.sin(phase - i * .65) * swing));
      }
    }
  }
  blink(t) {
    if (t > this.nextBlink + .18) this.nextBlink = t + 2.5 + Math.random() * 3.5;
    return Math.max(0, 1 - Math.abs(t - this.nextBlink - .085) / .085);
  }
  updateFace(t, dt) {
    const asleep = this.pose === 'sleep' || this.workRest;
    const smiling = !asleep && this.mood === 'smile';
    const amount = Number(smiling) * (this.pose === 'tiredSmile' ? .45 : this.pose === 'petcat' ? .78 : 1);
    const relaxed = this.sofaSeat && (this.pose === 'sit' || this.pose === 'listen') ? .26 : 0;
    const mix = dt ? 1 - Math.exp(-dt * 12) : 1;
    this.happy.value = asleep ? 0 : THREE.MathUtils.lerp(this.happy.value, Number(smiling), mix);
    this.smile.value = asleep ? 0 : THREE.MathUtils.lerp(this.smile.value, amount, mix);
    this.sleeping.value = asleep ? 1 : Math.max(this.blink(t), this.happy.value * .99, relaxed);
    for (const mesh of this.faceMeshes) mesh.morphTargetInfluences[0] = smooth(this.sleeping.value, .26, .94);
    const talking = this.sleeping.value < .5 && (this.chatTalking ? Math.sin(t * 15) > .25 : this.pose === 'eat' && Math.sin(t * 1.3) > .6);
    this.setFace(talking ? 'talk' : smiling ? 'smile' : this.sleeping.value > .7 ? 'closed' : 'open');
  }
  // 放到房间里：pos 是脚底位置（三维），yaw 是朝向（弧度，0 = 朝 +X）
  place(pos, yaw) { this.root.position.copy(pos); this.root.rotation.set(0, yaw, 0); }
}
