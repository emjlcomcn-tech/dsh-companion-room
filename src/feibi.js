import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FEIBI_NAME, formatCatText, formatFeibiLine } from '../lib/roommate-chat.js';

export const FEIBI_CREDIT = '菲比啾比 by 木子恶魔';
export const FEIBI_SOURCE = 'https://www.aplaybox.com/details/model/EzPKuchTPaLX';
const SPOTS = [
  { x: 12.86, z: 2.38, yaw: -1.1, action: 'peek', hold: 11 },
  { x: 11.93, z: 1.83, yaw: .2, action: 'hop', hold: 13 },
  { x: 12.84, z: 3.46, yaw: -.65, action: 'innocent', hold: 12 },
];
const GREETING_TIME = 4.2;
const REACTIONS = {
  greet: { punctuation: '！', meaning: '你来啦！', smile: .72 },
  peek: { punctuation: '？', meaning: '外面有什么好玩的？', surprised: .42 },
  hop: { punctuation: '～！', meaning: '再蹦一下！', smile: .79 },
  innocent: { punctuation: '……', meaning: '我可什么都没干哦。', blink: .8, relaxed: .43 },
  giggle: { punctuation: '～', meaning: '嘿嘿，好玩！', smile: .91 },
  curious: { punctuation: '？', meaning: '{cat}，你在干嘛呀？', surprised: .27 },
};
const EXPRESSION_NAMES = ['blink', 'happy', 'aa', 'lookDown', 'lookLeft', 'lookRight'];
const ACTIVE_BREAKS = {
  peek: { after: 15, whenBack: 'peek' },
  hop: { after: 12, whenBack: 'hop' },
  innocent: { after: 17, whenBack: 'peek' },
};
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const TURN = Math.PI / 180;
const wave = (phase, start, end) => phase > start && phase < end ? Math.sin(Math.PI * (phase - start) / (end - start)) : 0;
const clamp = THREE.MathUtils.clamp;
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

function activityProps() {
  const group = new THREE.Group();
  const book = new THREE.Group();
  const snack = new THREE.Group();
  function piece(parent, geometry, color, x, y, z) {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .82 }));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  for (const side of [-1, 1]) {
    const cover = piece(book, new THREE.BoxGeometry(.084, .013, .111), 0x986b44, side * .041, 0, 0);
    cover.rotation.z = side * .26;
    const pages = piece(book, new THREE.BoxGeometry(.077, .011, .102), 0xf5e4bd, side * .04, .010, 0);
    pages.rotation.z = side * .26;
    for (let i = 0; i < 3; i++) {
      const line = piece(book, new THREE.BoxGeometry(.045 - i * .004, .001, .0014), 0xb5a480,
        side * .046, .0185, -.029 + i * .012);
      line.rotation.z = side * .26;
    }
  }
  const cookie = piece(snack, new THREE.CylinderGeometry(.029, .031, .012, 12), 0xc6813f, 0, 0, 0);
  cookie.rotation.x = .5;
  for (const [x, z] of [[-.012, -.013], [.005, .013], [.016, -.006]]) {
    piece(snack, new THREE.SphereGeometry(.004, 6, 5), 0x61381e, x, .008, z);
  }
  const cushion = piece(group, new THREE.SphereGeometry(1, 24, 12), 0x52768a, 0, .047, -.041);
  cushion.scale.set(.205, .058, .172);
  cushion.castShadow = true;
  group.add(book, snack);
  book.scale.x = 1.18;
  book.visible = snack.visible = cushion.visible = false;
  return { group, book, snack, cushion };
}

function roomMaterial(source) {
  const { color, map, side, opacity, transparent, alphaTest, alphaMap, depthWrite } = source;
  const material = new THREE.MeshToonMaterial({ color, map, side, opacity, transparent, alphaTest, alphaMap, depthWrite,
    emissive: color, emissiveMap: map, emissiveIntensity: .30 });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_toon_pars_fragment>',
      THREE.ShaderChunk.lights_toon_pars_fragment.replace(
        'vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;',
        `float wrapLight = smoothstep(-.36, .61, dot(geometryNormal, directLight.direction));
         vec3 light = directLight.color / (1.0 + .42 * max(max(directLight.color.r, directLight.color.g), directLight.color.b));
         vec3 irradiance = mix(.27, .70, wrapLight) * light;`));
  };
  material.customProgramCacheKey = () => 'feibi-room-toon';
  return material;
}

export class Feibi {
  constructor(scene, nav, { base = '/r3d/', anisotropy = 4 } = {}) {
    this.nav = nav;
    this.base = base;
    this.anisotropy = anisotropy;
    this.root = new THREE.Group();
    this.root.name = FEIBI_NAME;
    this.root.visible = false;
    scene.add(this.root);
    this.bones = {};
    this.expressions = {};
    this.motion = new THREE.Quaternion();
    this.index = 0;
    this.route = [];
    this.elapsed = 0;
    this.actionTime = 0;
    this.interaction = 0;
    this.stepPhase = 0;
    this.gait = 0;
    this.restProgress = 0;
    this.blinkAt = 2.2;
    this.breakAt = 0;
    this.shortTrip = false;
    this.catLookUntil = 0;
    this.nextCatLook = 4;
    this.leftHand = new THREE.Vector3();
    this.rightHand = new THREE.Vector3();
    this.hipTarget = new THREE.Vector3();
    this.playmate = null;
    this.activity = null;
  }

  async load() {
    // VRM 1.0 uses a glTF container. Read its own bone and expression bindings
    // and use the embedded unlit color textures supplied by the original model.
    const gltf = await new GLTFLoader().loadAsync(this.base + 'feibi2.vrm');
    const { parser } = gltf;
    const vrm = parser.json.extensions?.VRMC_vrm;
    if (!vrm?.humanoid?.humanBones) throw new Error('找不到菲比啾比的 VRM 骨骼');
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const modelWorld = model.getWorldQuaternion(new THREE.Quaternion());
    const entries = await Promise.all(Object.entries(vrm.humanoid.humanBones).map(async ([name, binding]) => {
      const bone = await parser.getDependency('node', binding.node);
      const toLocal = bone.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(modelWorld);
      return [name, { bone, rest: bone.quaternion.clone(), toLocal, target: new THREE.Quaternion() }];
    }));
    this.bones = Object.fromEntries(entries);
    for (const name of EXPRESSION_NAMES) {
      const expression = vrm.expressions?.preset?.[name];
      this.expressions[name] = [];
      for (const binding of expression?.morphTargetBinds || []) {
        const part = await parser.getDependency('node', binding.node);
        part.traverse((mesh) => {
          if (mesh.morphTargetInfluences?.[binding.index] !== undefined) {
            this.expressions[name].push({ mesh, index: binding.index, weight: binding.weight });
          }
        });
      }
    }
    const bounds = new THREE.Box3().setFromObject(model, true);
    const height = bounds.max.y - bounds.min.y;
    if (!Number.isFinite(height) || height <= 0) throw new Error('菲比啾比模型尺寸无效');
    const scale = 1.10 / height;
    model.scale.multiplyScalar(scale);
    model.position.y -= bounds.min.y * scale;
    model.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      if (mesh.isSkinnedMesh) mesh.frustumCulled = false;
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((mat) => {
        if (mat.map) { mat.map.anisotropy = this.anisotropy; mat.map.needsUpdate = true; }
        return roomMaterial(mat);
      });
      mesh.castShadow = materials.some(mat => !mat.transparent);
      mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
    });
    this.stops = SPOTS.map((spot) => {
      if (this.nav.free(0, spot.x, spot.z)) return spot;
      const [x, z] = this.nav.nearest(0, spot.x, spot.z);
      return { ...spot, x: (x + .5) * .1, z: (z + .5) * .1 };
    });
    this.root.add(model);
    this.props = activityProps();
    this.root.add(this.props.group);
    this.hipRest = this.bones.hips.bone.position.clone();
    this.hipLower = new THREE.Vector3(0, 1, 0).applyQuaternion(
      this.bones.hips.bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
    this.modelScale = scale;
    this.model = model;
    const start = this.stops[0];
    this.root.position.set(start.x, 0, start.z);
    this.root.rotation.y = start.yaw;
    this.update(0, false);
    return this;
  }

  get line() {
    if (this.playmate) return this.playmate.line;
    if (this.catLooking && this.catLookUntil - this.elapsed > 1.25) {
      return formatFeibiLine({ ...REACTIONS.curious, meaning: formatCatText(REACTIONS.curious.meaning, this.catName) });
    }
    const reaction = this.interaction > 0 ? REACTIONS.greet : !this.route.length && this.actionTime < GREETING_TIME
      ? REACTIONS[this.arrivalAction || this.activity?.action || this.stops[this.index].action] : null;
    return formatFeibiLine(reaction);
  }

  greet(yaw = this.root.rotation.y) {
    if (!this.root.visible) return;
    this.greetYaw = yaw;
    this.interaction = GREETING_TIME;
  }

  joinPlay(route) {
    this.playmate = { route, action: 'walk', time: 0, line: '', yaw: this.root.rotation.y };
    this.interaction = 0;
  }

  leavePlay() {
    if (!this.playmate) return;
    this.playmate = null;
    const { x, z } = this.root.position;
    const stop = this.activity || this.stops[this.index];
    this.route = this.routeTo(x, z, stop);
    this.actionTime = GREETING_TIME;
  }

  routeTo(x, z, stop) {
    const [a, b] = this.nav.free(0, stop.x, stop.z)
      ? [stop.x, stop.z] : this.nav.approach(0, stop.x, stop.z, this.solid || this.nav);
    if (Math.hypot(a - x, b - z) < .045) return [];
    return this.nav.find(0, x, z, a, b) || [];
  }

  setActivity(activity, instant = false) {
    if (!activity || !this.model || (activity.id === this.activity?.id && activity.since === this.activity.since)) return;
    this.activity = activity;
    this.shortTrip = false;
    this.arrivalAction = null;
    this.breakAt = 0;
    if (this.playmate) return;
    const { x, z } = this.root.position;
    this.route = this.routeTo(x, z, activity);
    this.actionTime = 0;
    if (instant) {
      const [x, z] = this.route.at(-1) || [this.root.position.x, this.root.position.z];
      this.root.position.set(x, 0, z);
      this.root.rotation.y = activity.yaw;
      this.route = [];
      this.actionTime = 1.25;
      this.poseBlend = 1;
      this.pose(activity.action, this.actionTime);
    }
  }

  walkRoute(route, dt, speedy = false) {
    const waypoint = route[0];
    if (!waypoint) return this.root.rotation.y;
    const { position, rotation } = this.root;
    const dx = waypoint[0] - position.x, dz = waypoint[1] - position.z;
    const distance = Math.hypot(dx, dz);
    const speed = (speedy ? 1.44 : 1.05) * dt;
    if (distance <= speed + .001) {
      position.x = waypoint[0]; position.z = waypoint[1]; route.shift();
    } else {
      position.x += speed * dx / distance; position.z += speed * dz / distance;
    }
    this.stepPhase += dt * (speedy ? 13 : 10);
    return distance > .004 ? Math.atan2(dx, dz) : rotation.y;
  }

  rotate(name, pitch = 0, yaw = 0, roll = 0) {
    const joint = this.bones[name];
    if (!joint) return;
    const { bone, rest, toLocal, target } = joint;
    target.copy(rest);
    for (const [i, degrees] of [pitch, yaw, roll].entries()) {
      if (degrees) target.multiply(this.motion.setFromAxisAngle(this.axis.copy(AXES[i]).applyQuaternion(toLocal), degrees * TURN));
    }
    bone.quaternion.slerp(target, this.poseBlend);
  }

  takeShortTrip(stop) {
    const rule = ACTIVE_BREAKS[stop.action];
    if (!rule || this.actionTime < Math.max(rule.after, this.breakAt)) return;
    const { x, z } = this.root.position;
    const options = SPOTS.filter(sp => Math.hypot(sp.x - x, sp.z - z) > .65 && Math.hypot(sp.x - stop.x, sp.z - stop.z) < 1.8);
    const target = this.shortTrip || !options.length ? stop : options[Math.floor(Math.random() * options.length)];
    const route = this.routeTo(x, z, target);
    this.breakAt = this.actionTime + 7;
    if (!route.length) return;
    this.shortTrip = !this.shortTrip && target !== stop;
    this.arrivalAction = rule.whenBack;
    this.route = route;
    this.actionTime = 0;
    this.breakAt = 0;
  }

  lookForCat(cat) {
    if (this.elapsed < this.nextCatLook || !cat || this.route.length || this.interaction) return;
    this.nextCatLook = this.elapsed + 1;
    const stop = this.activity?.action || this.stops[this.index].action;
    if (!ACTIVE_BREAKS[stop]) return;
    const p = this.root.position;
    const distance = Math.hypot(cat.x - p.x, cat.z - p.z);
    if (distance < .45 || distance > 2.25 || !(this.solid || this.nav).clear(0, p.x, p.z, cat.x, cat.z)) return;
    this.catYaw = Math.atan2(cat.x - p.x, cat.z - p.z);
    this.catLookUntil = this.elapsed + 2.8;
    this.nextCatLook = this.elapsed + 24;
  }

  update(dt, hidden, cat) {
    this.root.visible = !!this.model && !hidden;
    if (!this.root.visible) return;
    this.elapsed += dt;
    this.poseBlend = dt ? 1 - Math.exp(-dt * 19) : 1;
    this.restBlend = dt ? 1 - Math.exp(-dt * 4.5) : 1;
    if (this.playmate) {
      const { route, action, time, yaw } = this.playmate;
      const moving = !!route.length;
      this.turn(moving ? this.walkRoute(route, dt) : yaw, dt);
      this.pose(moving ? 'walk' : action, time);
      return;
    }
    this.lookForCat(cat);
    this.catLooking = this.catLookUntil > this.elapsed && !this.route.length && !this.interaction;
    this.interaction = Math.max(0, this.interaction - dt);
    const { position } = this.root;
    const stop = this.activity || this.stops[this.index];
    let face = stop.yaw;
    if (this.interaction) {
      face = this.greetYaw;
    } else {
      if (this.route.length) {
        face = this.walkRoute(this.route, dt, stop.action === 'hop');
      } else {
        this.actionTime += dt;
        if (this.catLooking) face = this.catYaw;
        else if (this.activity) this.takeShortTrip(stop);
        if (!this.activity && this.actionTime >= stop.hold) {
          const index = (this.index + 1) % this.stops.length;
          const to = this.stops[index];
          const route = this.nav.find(0, position.x, position.z, to.x, to.z);
          if (route?.length) { this.index = index; this.route = route; }
          this.actionTime = 0;
        }
      }
    }
    this.turn(face, dt);
    const walking = !this.interaction && this.route.length > 0;
    const action = this.interaction ? 'greet' : walking ? 'walk' : this.catLooking ? 'curious'
      : this.actionTime < 3 && this.arrivalAction ? this.arrivalAction : stop.action;
    this.pose(action, this.interaction ? GREETING_TIME - this.interaction : this.catLooking ? this.elapsed - this.catLookUntil + 2.8 : this.actionTime);
  }

  turn(yaw, dt) {
    this.root.rotation.y += wrap(yaw - this.root.rotation.y) * Math.min(1, 8 * dt);
  }

  axis = new THREE.Vector3();

  pose(action, time) {
    const walk = action === 'walk';
    this.gait = THREE.MathUtils.lerp(this.gait, Number(walk), this.poseBlend);
    const gait = Math.sin(this.stepPhase) * this.gait;
    const hop = action === 'hop' ? wave(time, .29, .77) + .65 * wave(time, .94, 1.37) : 0;
    const crouch = action === 'hop' ? wave(time, 0, .31) + .75 * wave(time, .76, .99) : 0;
    const greeting = action === 'greet';
    const listening = action === 'listen';
    const chatting = listening || action === 'converse';
    const chatNod = listening ? 5 * Math.max(0, Math.sin(time * 2.8)) ** 14 : 0;
    const peek = action === 'peek' ? wave(time % 16, 0, 3.6) : action === 'curious' ? wave(time, 0, 2.8) : 0;
    const innocent = action === 'innocent' ? wave(time % 19, 0, 3.1) : 0;
    const giggle = action === 'giggle' ? wave(time, 0, 2.2) : 0;
    this.restProgress = THREE.MathUtils.lerp(this.restProgress, Number(action === 'rest'), this.restBlend);
    const rest = this.restProgress;
    const reading = action === 'read';
    const snack = action === 'snack';
    const plant = action === 'plant';
    const page = reading ? wave(time % 9, 4.8, 6.1) : 0;
    const bite = snack ? wave(time % 8, 1.0, 2.8) : 0;
    const reach = plant ? wave(time % 8.5, .6, 3.7) : 0;
    const sway = Math.sin(this.elapsed * (greeting ? 2 : 1.4));
    const scan = walk ? 0 : Math.sin(this.elapsed * .58) * (reading ? 9 : 7);
    const pitch = action === 'curious' ? 19 : 8;
    const bounce = hop * .15 + Math.abs(gait) * .019;
    this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, bounce, this.poseBlend);
    const hips = this.bones.hips.bone;
    this.hipTarget.copy(this.hipRest).addScaledVector(this.hipLower, -(.016 * crouch + .052 * rest) / this.modelScale);
    hips.position.lerp(this.hipTarget, this.poseBlend);
    this.rotate('hips', 11 * crouch - 4 * rest, gait * -4, gait * 4 + sway * 2);
    this.rotate('spine', 2 + 12 * reach + 10 * peek + 8 * rest + 7 * giggle, gait * 5,
      sway * (1.8 + 3 * giggle) + 7 * peek);
    this.rotate('head', (reading ? 22 : snack ? 9 : 0) + 13 * reach + 16 * rest + pitch * peek
      - 8 * innocent + 4 * giggle - sway * 2 + chatNod, scan + (action === 'curious' ? 0 : -22 * peek) + 15 * innocent + page * 9,
      12 * peek - 8 * innocent + 9 * rest + sway * 4 + (chatting ? 3 : 0));
    for (const [side, sign] of [['left', 1], ['right', -1]]) {
      const waving = greeting && sign === 1;
      const usingHand = reading || (snack || plant) && sign === 1;
      const activeWave = waving ? wave(time, 0, 3.1) ** .45 : 0;
      const pageHand = sign === -1 ? page : 0;
      const handUp = usingHand ? 29 + 15 * bite + 21 * reach + 8 * pageHand : 0;
      this.rotate(side + 'UpperArm', gait * -26 * sign - 7 - handUp - 16 * giggle - 14 * rest, sign * pageHand * -9,
        sign * (-76 - (reading ? 7 : 0) - 5 * rest + 57 * activeWave + 19 * hop + 7 * reach));
      this.rotate(side + 'LowerArm', -12 - 29 * Number(usingHand) - 32 * bite * Number(usingHand)
        - 14 * pageHand - 15 * innocent - 53 * giggle - 24 * rest, 0, activeWave * (53 + Math.sin(time * 11) * 22));
      this.rotate(side + 'Hand', pageHand * -17 + bite * 9, 0, activeWave * Math.sin(time * 11) * 20);
      this.rotate(side + 'UpperLeg', gait * 28 * sign + 15 * hop + 20 * crouch - 57 * rest, sign * 7 * rest, sign * 14 * rest);
      const lift = Math.max(0, gait * sign);
      this.rotate(side + 'LowerLeg', -lift * 35 - 23 * hop - 21 * crouch + 51 * rest);
      this.rotate(side + 'Foot', lift * 10 + gait * sign * 7 + 8 * rest);
    }
    const reaction = time < GREETING_TIME ? REACTIONS[action] : null;
    if (this.elapsed > this.blinkAt + .2) this.blinkAt = this.elapsed + 2.8 + 2.6 * Math.random();
    const idleBlink = wave(this.elapsed, this.blinkAt, this.blinkAt + .18);
    const blink = Math.max(idleBlink, (reaction?.blink ?? 0) * wave(time, .2, 1.3), rest * .96);
    const emotion = reaction ? wave(time, 0, GREETING_TIME) ** .55 : 0;
    const speak = action === 'converse' ? Math.max(0, Math.sin(time * 14))
      : reaction && this.line ? Math.max(0, Math.sin(time * 15)) * wave(time, .1, 1.6) : 0;
    const weights = {
      blink,
      happy: (((reaction?.smile || reaction?.relaxed || 0) * emotion) + .30 * giggle) * (1 - blink),
      aa: Math.max(.32 * speak, (reaction?.surprised || 0) * emotion * .68) + .18 * bite,
      lookDown: (reading ? .43 : Math.max(reach * .45, peek * (action === 'curious' ? .53 : .14))) * (1 - blink),
      lookLeft: clamp(scan / 20, 0, .37) * (1 - blink),
      lookRight: clamp(-scan / 20, 0, .37) * (1 - blink),
    };
    for (const [expression, amount] of Object.entries(weights)) {
      for (const { mesh, index, weight } of this.expressions[expression]) mesh.morphTargetInfluences[index] = amount * weight;
    }
    this.placeProps(reading, snack, page);
  }

  placeProps(reading, eating, page) {
    const { book, snack, cushion } = this.props;
    book.visible = reading;
    snack.visible = eating;
    cushion.visible = this.restProgress > .12;
    if (!reading && !eating) return;
    this.root.worldToLocal(this.bones.leftHand.bone.getWorldPosition(this.leftHand));
    if (eating) {
      snack.position.copy(this.leftHand);
      snack.position.z += .027;
      snack.rotation.set(-.18, .2, -.34);
      return;
    }
    this.root.worldToLocal(this.bones.rightHand.bone.getWorldPosition(this.rightHand));
    book.position.copy(this.leftHand).lerp(this.rightHand, .5);
    book.position.z += .032;
    book.rotation.set(.18, -.13 * page, -.08 * page);
  }
}
