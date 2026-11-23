// 3D 小屋：读取实时状态，展示角色移动和活动
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import * as TX from './tex.js';
import { Kit } from './kit.js';
import { DFY, POSES, RIM } from './char3d.js';
import { buildRoom, buildCity, W, D, WH, LY, LOFT, STAIR, DESK_CHAIR } from './room.js';
import { TERRACE, POOL, POOL_STEPS } from './terrace.js';
import { Nav } from './nav.js';
import { buildShafts } from './shafts.js';
import { Cat } from './cat.js';
import { Feibi, FEIBI_CREDIT, FEIBI_SOURCE } from './feibi.js';
import { FEIBI_NAME, roommateTopics, formatRoommateTurn } from '../lib/roommate-chat.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { buildOffice } from './office.js';
import { buildLeisureScene } from './leisure-scene.js';
import { addVenueLighting, buildPlaceFinishes, buildVenueShell, venueLamp } from './place-finish.js';
import { createCityMap } from './city-map.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search), STILL = Q.has('still');
const STORY_PREVIEW = Q.get('preview') === 'health-story';
const WARD_PREVIEW = STORY_PREVIEW || Q.get('preview') === 'hospital';
// 截图模式：把进度和报错告诉插件，卡住时日志里能看到卡在哪一步
const PING = !WARD_PREVIEW && STILL && Q.has('share');
const shotQuery = 'shotId=' + encodeURIComponent(Q.get('shotId') || '');
const ping = (s, fail) => { if (PING) fetch('/api/shot-ping?' + shotQuery + '&s=' + encodeURIComponent(s) + (fail != null ? '&fail=' + encodeURIComponent(String(fail).slice(0, 200)) : ''), { method: 'POST' }).catch(() => {}); };
if (PING) { addEventListener('error', (e) => ping('error', e.message || e.error)); addEventListener('unhandledrejection', (e) => ping('error', e.reason?.message || e.reason)); ping('boot'); }
let saved = null; try { saved = localStorage.getItem('room3d-q'); } catch {}
const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
const LOW = (Q.get('q') || saved || (mobile ? 'low' : 'high')) === 'low';
const stage = $('stage');
let Wd = stage.clientWidth || innerWidth || 1600, Ht = stage.clientHeight || innerHeight || 1000;
let cityMap = null, cityOpen = false, mapVisit = null;

let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: STILL, powerPreference: 'high-performance' }); }
catch (e) { if (PING) { ping('webgl', 'WebGL 开不起来：' + (e?.message || e)); throw e; } location.replace('/classic'); throw e; }
if (PING) { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); ping('gl:' + (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown').slice(0, 50)); }
renderer.setPixelRatio(STILL ? 1 : Math.min(devicePixelRatio, LOW ? 1.25 : 2)); renderer.setSize(Wd, Ht);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Neutral 比 ACES 颜色更干净、不发灰发橙，接近二游那种通透的观感
renderer.toneMapping = THREE.NeutralToneMapping;
stage.appendChild(renderer.domElement);
RectAreaLightUniformsLib.init();

const scene = new THREE.Scene(), K = new Kit(scene);
const room = buildRoom(K);
const finishes = buildPlaceFinishes(K, room.materials);
const office = buildOffice(K, finishes);
const excursion = buildLeisureScene(K, finishes);
let awayScene = null;
const walkPickMeshes = [];
scene.traverse((mesh) => {
  if (mesh.isMesh && !mesh.userData.noNav && !mesh.material.transparent) walkPickMeshes.push(mesh);
});
// 导航格子：一楼按 0.06~1.35m 高度内的东西算障碍，二楼只在夹层范围里
const NAV_LV = [{ y0: .06, y1: 1.35, x0: 0, x1: TERRACE.right, z0: 0, z1: TERRACE.back }, { y0: LY + .15, y1: LY + 1.4, x0: LOFT.x, x1: W - .12, z0: LOFT.z + .20, z1: LOFT.end - .10 }];
const groundVoids = [
  { x0: POOL.x - .13, x1: POOL.right + .13, z0: POOL.z - .13, z1: POOL.back + .13 },
  { x0: W, x1: TERRACE.right, z0: 0, z1: TERRACE.z },
  { x0: 0, x1: TERRACE.x, z0: D, z1: TERRACE.back },
];
const navArea = { W: TERRACE.right, D: TERRACE.back, blocked: [groundVoids] };
const nav = new Nav(scene, { ...navArea, radius: .24, levels: NAV_LV });
const solid = new Nav(scene, { ...navArea, radius: 0, levels: NAV_LV }); // 家具真实占地（不外扩），用来挑进座位的方向
// 猫的格子：只算 0.06~0.3m 高的东西（桌子、椅子底下能钻过去），只在一楼
const CAT_LV = [{ ...NAV_LV[0], y1: .3 }];
const catNav = new Nav(scene, { ...navArea, radius: .12, levels: CAT_LV }), catSolid = new Nav(scene, { ...navArea, radius: 0, levels: CAT_LV });
const city = buildCity(K, scene);
for (const [x, z, w, d] of [[-.4, -.4, W + .8, TERRACE.z + .4], [-.4, TERRACE.z, TERRACE.x + .4, D - TERRACE.z]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, .1, d), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  m.position.set(x + w / 2, WH + .1, z + d / 2); m.castShadow = true; m.userData.noAO = true; scene.add(m);
}

// 客厅石材地面的真实倒影（只在高画质）：镜面再渲染一遍场景，稍微模糊、按视角的菲涅尔衰减，加法叠在石材上
let floorRefl = null;
if (!LOW && !Q.has('norefl')) {
  const pr = Math.min(devicePixelRatio, 2) * .5;
  floorRefl = new Reflector(new THREE.PlaneGeometry(W - 6, 6), { textureWidth: Math.round(Wd * pr), textureHeight: Math.round(Ht * pr), clipBias: .003, shader: {
    name: 'FloorRefl', uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, strength: { value: .4 } },
    vertexShader: 'uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW; void main(){ vUv=textureMatrix*vec4(position,1.); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec4 vUv; varying vec3 vW;
      void main(){ vec2 uv=vUv.xy/vUv.w; vec3 c=texture2D(tDiffuse,uv).rgb*.36; float o=.0035;
        c+=(texture2D(tDiffuse,uv+vec2(o,0.)).rgb+texture2D(tDiffuse,uv-vec2(o,0.)).rgb+texture2D(tDiffuse,uv+vec2(0.,o*1.6)).rgb+texture2D(tDiffuse,uv-vec2(0.,o*1.6)).rgb)*.16;
        vec3 V=normalize(cameraPosition-vW); float fres=.2+.8*pow(clamp(1.-V.y,0.,1.),2.5);
        c=c*strength*fres; if(any(isnan(c))||any(isinf(c))) c=vec3(0.); // 防一手：倒影里任何坏像素都不许漏进泛光
        gl_FragColor=vec4(min(c,vec3(4.)),1.); }` } });
  floorRefl.rotation.x = -Math.PI / 2; floorRefl.position.set((W + 6) / 2, .0007, 3);
  Object.assign(floorRefl.material, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  floorRefl.renderOrder = -1;
  floorRefl.userData.noAO = true; floorRefl.userData.noNav = true; scene.add(floorRefl);
}
const pm = new THREE.PMREMGenerator(renderer), envs = {};
for (const m of ['night', 'day']) { const t = TX.envEquirect(m); t.mapping = THREE.EquirectangularReflectionMapping; envs[m] = pm.fromEquirectangular(t).texture; }
const sky = { night: TX.skyTex('night'), day: TX.skyTex('day') };
const hemi = new THREE.HemisphereLight(0x3a4680, 0x1a1210, .4); scene.add(hemi);
const sun = new THREE.DirectionalLight(0x8fa8ff, 1.5); sun.target.position.set(4, 0, 4);
sun.castShadow = true; sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048); Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = .03; sun.shadow.radius = 4;
scene.add(sun, sun.target);
// 光柱从迎光侧的实际窗洞出发。
const SUN_DAY = new THREE.Vector3(21, 11.6, -17), SUN_NIGHT = new THREE.Vector3(-16, 11, -5);
const sunDirection = sun.target.position.clone().sub(SUN_DAY);
const sunOpenings = room.sunWindows.filter(({ inward }) => inward.dot(sunDirection) > 0);
const interior = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(W, WH, D));
const shafts = buildShafts(scene, sunOpenings, sunDirection, interior);
// 白天屋里的“反弹光”：阳光落在地板上再弹到墙和天花板，用一盏很弱的暖色面光源近似
const bounce = new THREE.RectAreaLight(0xffc996, 0, 9, 7); bounce.position.set(5, .15, 4.5); bounce.lookAt(5, 5, 4.5); scene.add(bounce);

const camera = new THREE.PerspectiveCamera(30, Wd / Ht, .35, 400), target = new THREE.Vector3();
const livingView = { target: [11.40, 1.43, 1.50], azimuth: -38, elevation: 6, distance: 4.93, fov: 58 };
const fitPool = () => frameCamera([13.74, .36, 8.18], 31, 34, 9.8, 44);
const wardY = 46;
const ward = K.group(0, wardY, 0);
ward.visible = false;
ward.userData.noNav = true;
let updateWardCutaway;
K.in(ward, () => {
  const M = finishes;
  const warm = M.paper, frame = M.standard(0x586d7b, { metalness: .24, roughness: .48 });
  const sheet = M.sheet, teal = M.cloth(0x678b93), wood = M.oak;
  const shell = buildVenueShell(K, M, { width: 4.7, depth: 3.85, back: -1.65, height: 2.65, finish: M.counter });
  const { rear } = shell;
  updateWardCutaway = shell.updateCutaway;
  K.box(-2.2, .15, -1.50, 4.39, .25, .055, wood, { r: .013, parent: rear });
  K.box(-1.9, .56, -1.503, 2.43, .48, .073, M.walnut, { r: .014, parent: rear });
  K.box(-1.85, .592, -1.428, 2.33, .408, .014, warm, { parent: rear });
  for (let i = 0; i < 4; i++) K.cyl(-1.68 + i * .22, .79, -1.401, .035, .035, .019, frame, { rot: [Math.PI / 2, 0, 0], seg: 16, parent: rear });
  K.box(-1.88, 1.01, -1.41, 2.36, .025, .036, M.amber, { cast: false, parent: rear });
  K.box(-1.61, .09, -.91, 2.08, .26, 1.01, frame, { r: .04 });
  K.cushion(-1.63, .33, -.93, 2.12, .20, 1.05, sheet, { puff: .23 });
  K.box(-1.68, .11, -.97, .075, .77, 1.11, frame, { r: .02 });
  K.cushion(-1.55, .51, -.82, .56, .115, .77, sheet, { puff: .52 });
  K.cushion(-.89, .49, -.955, 1.35, .075, 1.09, teal, { puff: .38 });
  K.box(-.85, .23, .103, 1.31, .282, .041, teal, { r: .014 });
  for (const side of [-.963, .14]) for (const x of [-1.47, .30]) {
    K.cyl(x, .055, side, .027, .032, .24, M.steelB, { seg: 12 });
    K.cyl(x, .025, side, .045, .045, .032, M.rubber, { seg: 14 });
  }
  K.box(-2.10, 0, -.96, .34, .66, .60, wood, { r: .025 });
  K.box(-2.12, .66, -.98, .38, .040, .64, M.counter, { r: .012 });
  for (const y of [.23, .48]) K.box(-2.038, y, -.359, .18, .027, .018, M.brass, { r: .006 });
  K.cyl(-1.93, .702, -.69, .055, .040, .11, M.ceramic);
  K.torus(-1.874, .763, -.69, .027, .006, M.ceramic, { seg: 16 });
  K.box(.57, .02, -.18, .76, .29, .76, frame, { r: .045 });
  K.cushion(.52, .28, -.19, .86, .17, .79, teal, { puff: .25 });
  K.cushion(.50, .38, -.29, .9, .67, .17, teal, { puff: .30 });
  K.box(1.68, .03, -1.31, .48, .60, .54, wood, { r: .025 });
  K.box(1.647, .627, -1.329, .55, .044, .58, M.counter, { r: .015 });
  K.plant(1.90, .672, -1.078, { pot: .102, potH: .15, n: 6, h: .37, leaf: [.19, .105], potMat: M.pot, leafMats: M.leaf, stemMat: M.stem, spread: .16, seed: 223 });
  K.box(.83, 1.35, -1.505, 1.29, .72, .048, M.walnut, { r: .014, parent: rear });
  K.mesh(new THREE.PlaneGeometry(1.233, .663), new THREE.MeshStandardMaterial({ map: TX.artTex(19, ['#e9dcd0', '#81999d', '#71817d', '#bcaa8e']), roughness: .8 }), 1.475, 1.71, -1.451, { cast: false, parent: rear });
  K.in(rear, () => {
    K.box(-1.51, 2.36, .31, 2.42, .045, .095, M.steelB, { r: .008 });
    for (const x of [-1.51, .863]) K.box(x, 2.37, -1.52, .047, .038, 1.88, M.steelB, { r: .008 });
    for (let i = 0; i < 8; i++) K.cushion(-1.45 + i * .071, .31, .317 - (i % 2) * .018, .082, 2.035, .053, M.sheet, { puff: .14 });
  });
  venueLamp(K, M, -.72, 1.28, -1.26, { intensity: 3.3, reach: 2.6, pendant: false });
  venueLamp(K, M, .60, 2.43, -.23, { intensity: 5.3, color: 0xffe1c7, reach: 3.8, pendant: false });
  addVenueLighting(K, ward);
});
function fitWard() { frameCamera([-.04, wardY + .92, -.04], 22, 25, 5.60, 44); }
const wardVisit = {
  root: ward, label: '医院全景',
  placement: () => ({ position: wardPosition, seat: .46, pose: 'perch', yaw: -Math.PI / 2 }),
};
function fitAway() {
  if (awayScene === wardVisit) fitWard();
  else frameCamera(awayScene.target, awayScene.azimuth ?? 151, 24, 8.5, 48);
}
function fitVisit() {
  const { kind } = mapVisit;
  if (kind === 'home') fitCamera();
  else if (kind === 'hospital') fitWard();
  else if (kind === 'office') frameCamera(office.target, office.azimuth ?? 151, 24, 8.5, 48);
  else frameCamera(excursion.target, excursion.angleForArea(kind), 24, 8.5, 48);
}
function fitCareScene() {
  const shot = careScene?.script.shot;
  if (shot) frameCamera(...shot);
  else frameCamera([10.69, .65, 4.02], 163, 23, 3.25, 45);
}
function frameCamera(look, azimuth, elevation, dist, fov) {
  const az = THREE.MathUtils.degToRad(azimuth), el = THREE.MathUtils.degToRad(elevation);
  target.set(...look);
  camera.fov = fov; camera.updateProjectionMatrix();
  camera.position.set(target.x + Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(az) * Math.cos(el) * dist);
  camera.lookAt(target);
}
function fitLiving() {
  const { target: look, azimuth, elevation, distance, fov } = livingView;
  const verticalFov = Wd < Ht ? 62 : fov;
  frameCamera(look, azimuth, elevation, distance, verticalFov);
}
function fitCamera() {
  const a = Wd > 0 && Ht > 0 ? Wd / Ht : 16 / 9;
  const dist = a >= 1.5 ? 26.6 : Math.min(50, 26.6 * 1.5 / a * .96);
  frameCamera(Q.has('tg') ? Q.get('tg').split(',').map(Number) : [8.8, 1.47, 5.12], +(Q.get('az') ?? 22), +(Q.get('el') ?? 29), +(Q.get('dist') ?? dist), +(Q.get('fov') ?? 30));
}
if (Q.get('view') === 'living') fitLiving(); else fitCamera();
// 视角可绕小屋一整圈；近侧外墙在遮住室内时暂时隐藏。
const controls = new OrbitControls(camera, renderer.domElement); controls.target.copy(target); controls.enableDamping = true;
controls.enablePan = true; controls.screenSpacePanning = false; controls.panSpeed = .9;
controls.minPolarAngle = .2; controls.maxPolarAngle = 1.53;
controls.minDistance = Q.has('dist') ? Math.min(1.5, +Q.get('dist')) : 1.5; controls.maxDistance = 52; controls.update();
// 平移别把视角中心拖出屋子
const _clampT = () => {
  const t = controls.target, clamp = THREE.MathUtils.clamp;
  const visitingWard = mapVisit ? mapVisit.kind === 'hospital' : ward.visible;
  const outside = mapVisit ? (mapVisit.kind === 'office' ? office : ['home', 'hospital'].includes(mapVisit.kind) ? null : excursion) : awayScene;
  const x = outside ? clamp(t.x, -3, 3) : visitingWard ? clamp(t.x, -2, 2) : clamp(t.x, -.5, TERRACE.right + .5);
  const y = outside ? clamp(t.y, outside.root.position.y, outside.root.position.y + 2.7) : visitingWard ? clamp(t.y, wardY, wardY + 2.65) : clamp(t.y, 0, WH);
  const z = outside ? clamp(t.z, -1.8, 2.7) : visitingWard ? clamp(t.z, -1.45, 2) : clamp(t.z, -.5, TERRACE.back + .5);
  if (x !== t.x || y !== t.y || z !== t.z) { camera.position.add(_v.set(x - t.x, y - t.y, z - t.z)); t.set(x, y, z); }
};
const _v = new THREE.Vector3(); controls.addEventListener('change', _clampT);
function updateCutaway() {
  room.updateCutaway(camera.position);
  city.updateCutaway(camera.position);
  office.updateCutaway(camera.position);
  excursion.updateCutaway(camera.position);
  updateWardCutaway(camera.position);
}
controls.addEventListener('change', updateCutaway);
updateCutaway();
// 跟着她：视角中心慢慢挪到她身上（头和脚的中间），镜头拉到 4.5m 以内，之后她走到哪跟到哪；右键平移或点「全景」就退出
let follow = false;
const herPoint = (out) => { if (!char.model) return out.set(pos.x, (pos.z || 0) + .6, pos.y); char.bones.headx.getWorldPosition(out); out.add(char.root.position).multiplyScalar(.5); out.y = Math.max(out.y, (pos.z || 0) + .45); return out; };
const _hp = new THREE.Vector3(), _off = new THREE.Vector3();
function stepFollow(dt) {
  if (!follow) return;
  herPoint(_hp); const k = 1 - Math.exp(-dt * 3.5);
  _v.copy(_hp).sub(controls.target).multiplyScalar(k); controls.target.add(_v); camera.position.add(_v);
  _off.copy(camera.position).sub(controls.target); const L = _off.length(); if (L > 4.5) camera.position.copy(controls.target).addScaledVector(_off, (L + (4.5 - L) * k) / L);
}
const setFollow = (on) => { follow = on && !mapVisit; const b = $('focusBtn'); if (b) b.classList.toggle('on', follow); };
function changeView(fit) {
  if (mapVisit && fit !== fitVisit) return;
  setFollow(false); fit(); controls.target.copy(target); controls.update();
}
const resetView = () => changeView(mapVisit ? fitVisit : awayScene ? fitAway : ward.visible ? fitWard : careScene ? fitCareScene : fitCamera);
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.button === 2 || e.shiftKey || e.ctrlKey || e.metaKey) setFollow(false); });
// 双击她 = 看她；双击别处 = 复位
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
renderer.domElement.addEventListener('dblclick', (e) => {
  if (mapVisit) { resetView(); return; }
  if (pickingWalk) return;
  const r = renderer.domElement.getBoundingClientRect(); _ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); _ray.setFromCamera(_ndc, camera);
  if (feibi.root.visible && _ray.intersectObject(feibi.root, true).length) { greetFeibi(); return; }
  const hit = char.model && _ray.intersectObject(char.root, true).length;
  if (hit) setFollow(true); else resetView();
});

const characterSettings = { base: Q.get('r3dbase') || '/r3d/', height: 1.25, anisotropy: Math.min(LOW ? 4 : 8, renderer.capabilities.getMaxAnisotropy()) };
const char = new DFY(scene, characterSettings);
const characterCredit = '「大肥鱼」by 不想待在银河系';
const settingsButton = $('roomSettings');
settingsButton.hidden = !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
function showCharacter() {
  const name = S?.displayName || '大肥鱼';
  const title = name + '的小屋';
  document.title = title;
  $('houseTitle').textContent = title;
  $('visitWatch').textContent = '看' + name;
  $('dfyModelLabel').textContent = char.model ? (name === '大肥鱼' ? '大肥鱼模型' : name + ' · 大肥鱼模型') : name + ' · 模型待配置';
  $('dfyModelLabel').hidden = false;
  $('dfyCredit').textContent = char.model ? characterCredit + '。' : '模型可在本机按说明配置。';
}
const cat = new Cat(scene); cat.root.visible = false;
const feibi = new Feibi(scene, nav, { base: Q.get('r3dbase') || '/r3d/', anisotropy: Math.min(4, renderer.capabilities.getMaxAnisotropy()) });
feibi.solid = solid;
const feibiButton = $('feibiBtn');
const feibiBubble = $('feibiBubble');
const feibiAnchor = new THREE.Vector3();
let feibiLoading = null, feibiCredit = null;
function greetFeibi() {
  if (!feibi.root.visible) return;
  const { x, z } = feibi.root.position;
  const angle = THREE.MathUtils.radToDeg(feibi.root.rotation.y);
  changeView(() => frameCamera([x, .62, z], angle + 12, 20, 2.35, 45));
  if (!friendPlay) feibi.greet(Math.atan2(camera.position.x - x, camera.position.z - z));
}
feibiButton?.addEventListener('click', greetFeibi);
function updateFeibi(dt) {
  feibi.setActivity(S?.feibi, STILL);
  feibi.catName = S?.cat?.name;
  feibi.update(dt, WARD_PREVIEW || ward.visible || (!!awayScene && mapVisit?.kind !== 'home') || !!careScene || !S?.feibi, cat.root.visible ? cat.root.position : null);
  if (!feibiBubble || !feibiButton) return;
  if (feibiButton.hidden === feibi.root.visible) feibiButton.hidden = !feibi.root.visible;
  const line = feibi.root.visible && feibi.line;
  if (!line || SHARE) { feibiBubble.hidden = true; return; }
  feibiAnchor.copy(feibi.root.position);
  feibiAnchor.y += 1.33;
  feibiAnchor.project(camera);
  feibiBubble.hidden = feibiAnchor.z >= 1 || Math.abs(feibiAnchor.x) > .91 || Math.abs(feibiAnchor.y) > .90;
  if (!feibiBubble.hidden) {
    if (feibiBubble.textContent !== line) feibiBubble.textContent = line;
    const half = feibiBubble.offsetWidth * .5;
    feibiBubble.style.left = THREE.MathUtils.clamp((feibiAnchor.x * .5 + .5) * Wd, half + 8, Wd - half - 8) + 'px';
    feibiBubble.style.top = ((-feibiAnchor.y * .5 + .5) * Ht) + 'px';
  }
}

let friendPlay = null, nextFriendPlay = 0, playedFriendEvent = null, finishedFriendEvent = null, nextFriendAttempt = 0;
const friendButton = $('friendBtn');
const friendIdle = new Set(['idle', 'read', 'music', 'window', 'keptAwake', 'playcat', 'petcat', 'lounge', 'playfeibi']);
const householdTopics = ['snacks', 'cups', 'curtain'];
let nextHouseholdTopic = Math.floor(Math.random() * householdTopics.length), lastRoommateTopic = '';
function chooseRoommateChat() {
  const activity = S.act.id;
  const nearCat = cat.root.visible && feibi.root.position.distanceTo(cat.root.position) < 2.2;
  const context = activity === 'read' ? 'book' : activity === 'music' ? 'music'
    : (nearCat || S.cat && ['petcat', 'playcat'].includes(activity)) ? 'cat' : activity === 'window' ? 'curtain' : '';
  let topic = context;
  if (!topic || topic === lastRoommateTopic) {
    do { topic = householdTopics[nextHouseholdTopic++ % householdTopics.length]; } while (topic === lastRoommateTopic);
  }
  lastRoommateTopic = topic;
  let at = .35;
  const beats = roommateTopics[topic].map((turn, i, turns) => {
    const end = at + THREE.MathUtils.clamp(1.1 + turn.text.length * .12, 2.35, 4.65);
    const beat = { speaker: turn.speaker, line: formatRoommateTurn(turn, S.cat?.name), at, end };
    at = end + (i === turns.length - 1 ? .65 : i % 2 ? .67 : .43);
    return beat;
  });
  return { topic, beats, end: at };
}
function activeFriendEvent() {
  if (!S) return null;
  if (S.roommateRequest && S.now < S.roommateRequest.until) return S.roommateRequest.at;
  const tracked = Object.hasOwn(S, 'roommateRequest') && ['owner', 'self'].includes(S.act.by);
  return !tracked && S.act.id === 'playfeibi' && S.now < S.act.until ? S.act.since : null;
}
let roommateReport = null, reportingRoommateChat = false;
async function flushRoommateReport() {
  if (!roommateReport || reportingRoommateChat) return;
  const report = roommateReport;
  reportingRoommateChat = true;
  try {
    const response = await fetch('/api/roommate-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      keepalive: true,
    });
    if ((response.ok || response.status < 500) && roommateReport === report) roommateReport = null;
  } catch {
    // A polling turn retries the last completed conversation after temporary disconnects.
  } finally {
    reportingRoommateChat = false;
  }
}
function canPlayTogether() {
  return !!(S?.on && !SHARE && !STILL && !WARD_PREVIEW && !ward.visible && !careScene && !awayScene &&
    char.model && feibi.root.visible && !swimming && !poolMotion && !walkDestination &&
    !path.length && activityReached && friendIdle.has(S.act.id) && placeFor(S.act).p[2] === 0);
}
function startFriendPlay(framePair = false) {
  if (friendPlay || !canPlayTogether()) return false;
  const p = char.root.position, f = feibi.root.position;
  const facing = S.act.id === 'playfeibi' ? placeFor(S.act).yaw : char.root.rotation.y;
  const seated = POSES[placeFor(S.act).pose].seat;
  const angles = seated
    ? [.80, -.80, .95, -.95, .63, -.63, .38, -.38, 0] : [.52, -.52, .22, -.22, .88, -.88, 0, 1.15, -1.15];
  const spaceFromWhale = seated ? .64 : .30;
  for (const angle of angles) {
    const dx = Math.cos(facing + angle), dz = -Math.sin(facing + angle);
    const x = p.x + dx * 1.26, z = p.z + dz * 1.26;
    if (!nav.free(0, x, z) || !solid.clear(0, p.x + spaceFromWhale * dx, p.z + spaceFromWhale * dz, x, z)) continue;
    const route = nav.find(0, f.x, f.z, x, z);
    if (!route?.length) continue;
    const event = activeFriendEvent();
    const requestAt = event === S.roommateRequest?.at ? event : null;
    friendPlay = { elapsed: 0, approach: 0, started: false, turn: null, framePair, event, requestAt };
    feibi.joinPlay(route);
    feibi.playmate.yaw = Math.atan2(p.x - x, p.z - z);
    renderPanel();
    return true;
  }
  return false;
}
friendButton?.addEventListener('click', () => { if (!startFriendPlay(true)) updateWalkHint('等大肥鱼在一楼有空时，她们就能聊会儿'); });
function updateFriendPlay(dt) {
  const ready = canPlayTogether();
  const event = activeFriendEvent();
  if (friendButton) {
    friendButton.hidden = !feibi.root.visible;
    friendButton.disabled = !ready || !!friendPlay;
    friendButton.title = ready ? '' : '大肥鱼在一楼有空时可以聊会儿';
  }
  if (!friendPlay) {
    if (event !== null) {
      if (ready && event !== playedFriendEvent && char.t >= nextFriendAttempt) {
        if (!startFriendPlay(true)) nextFriendAttempt = char.t + 2;
      }
      return;
    }
    if (S?.act.id === 'playfeibi') return;
    if (ready && char.t >= nextFriendPlay && char.t >= nextFriendAttempt && !feibi.interaction && S.feibi?.action !== 'rest') {
      const f = feibi.root.position, p = char.root.position;
      nextFriendAttempt = char.t + 4;
      if (S.feibi?.id === 'visit' || !feibi.route.length && feibi.actionTime >= 6 && Math.hypot(f.x - p.x, f.z - p.z) < 2.8) startFriendPlay();
    }
    return;
  }
  const play = friendPlay;
  if (!play.started) play.approach += dt;
  const finished = play.started && play.elapsed >= play.end;
  if (!ready || play.approach > 30 || finished) {
    if (finished) {
      if (play.event !== null) playedFriendEvent = finishedFriendEvent = play.event;
      if (Object.hasOwn(S, 'roommateRequest')) {
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        roommateReport = { id, topic: play.topic, requestAt: play.requestAt };
        void flushRoommateReport();
      }
    } else {
      nextFriendAttempt = char.t + 2;
    }
    feibi.leavePlay();
    friendPlay = null;
    nextFriendPlay = char.t + 90;
    renderPanel();
    return;
  }
  if (feibi.playmate.route.length) return;
  if (!play.started) {
    Object.assign(play, chooseRoommateChat(), { started: true });
    renderPanel();
  }
  const p = char.root.position, f = feibi.root.position;
  if (play.framePair) {
    const side = Math.atan2(f.x - p.x, f.z - p.z) * 180 / Math.PI;
    const x = (p.x + f.x) / 2, z = (p.z + f.z) / 2;
    const cameraAngle = [side + 80, side - 80].sort((a, b) => {
      const clearance = (angle) => nav.clearance(0, x + 2.35 * Math.sin(angle * Math.PI / 180), z + 2.35 * Math.cos(angle * Math.PI / 180));
      return clearance(b) - clearance(a);
    })[0];
    changeView(() => frameCamera([x, .69, z], cameraAngle, 29, 3.25, 45));
    play.framePair = false;
  }
  play.elapsed += dt;
  play.turn = play.beats.find((turn) => play.elapsed >= turn.at && play.elapsed < turn.end);
  const talking = play.turn?.speaker === 'feibi';
  Object.assign(feibi.playmate, { action: talking ? 'converse' : 'listen', time: play.elapsed, line: talking ? play.turn.line : '' });
}
function addFeibiCredit() {
  const credit = document.createElement('a');
  credit.href = FEIBI_SOURCE;
  credit.target = '_blank';
  credit.rel = 'noopener noreferrer';
  credit.textContent = FEIBI_CREDIT;
  feibiCredit = document.createElement('span');
  feibiCredit.append(' · ', credit);
  feibiCredit.hidden = !S?.feibi;
  $('credit').append(feibiCredit);
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
if (!LOW) {
  const gtao = new GTAOPass(scene, camera, Wd, Ht);
  gtao.updateGtaoMaterial({ radius: .55, distanceExponent: 1.4, thickness: 1.2, scale: 1.25, samples: 16, screenSpaceRadius: false });
  const ov = gtao.overrideVisibility.bind(gtao);
  gtao.overrideVisibility = function () { ov(); scene.traverse((o) => { if (o.userData.noAO) o.visible = false; }); };
  composer.addPass(gtao);
}
const bloom = new UnrealBloomPass(new THREE.Vector2(Wd, Ht), .42, .6, 1.0); composer.addPass(bloom);
composer.addPass(new OutputPass());
if (LOW) {
  const fxaa = new ShaderPass(FXAAShader);
  fxaa.setSize = (width, height) => fxaa.uniforms.resolution.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
  composer.addPass(fxaa);
} else composer.addPass(new SMAAPass(Wd, Ht));
const final = new ShaderPass({
  // 调色：暗部 / 亮部分别染色（split toning）、饱和度、对比度、暗角，昼夜各一套
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, grain: { value: .005 }, shTint: { value: new THREE.Vector3(.92, 1, 1.1) }, hiTint: { value: new THREE.Vector3(1.06, 1, .93) }, sat: { value: 1.08 }, con: { value: 1.07 }, vig: { value: .85 }, lift: { value: new THREE.Vector3(0, 0, 0) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, grain, sat, con, vig; uniform vec3 shTint, hiTint, lift; varying vec2 vUv;
    void main(){ vec2 c=vUv-.5; float r2=dot(c,c);
      vec3 col=texture2D(tDiffuse,vUv).rgb;
      float l=dot(col,vec3(.2126,.7152,.0722));
      col=mix(col, col*shTint, (1.-smoothstep(0.,.5,l))*.6);
      col=mix(col, col*hiTint, smoothstep(.4,1.,l)*.5);
      col+=lift*(1.-l);
      col=(col-.5)*con+.5; l=dot(col,vec3(.2126,.7152,.0722)); col=mix(vec3(l),col,sat);
      col*=1.-r2*vig;
      float n=fract(sin(dot(vUv*vec2(1921.,1081.)+fract(time)*17.,vec2(12.9898,78.233)))*43758.5453);
      col+=(n-.5)*grain; gl_FragColor=vec4(col,1.); }` });
composer.addPass(final);

let MODE = null;
function setMode(mode) {
  if (mode === MODE) return; MODE = mode;
  K.setMode(mode); scene.environment = envs[mode]; scene.background = sky[mode];
  const u = final.uniforms, night = mode === 'night';
  shafts.group.visible = !night; bounce.intensity = night ? 0 : 1.1;
  if (floorRefl) floorRefl.material.uniforms.strength.value = night ? .45 : .2;
  if (night) {
    // 夜里：冷色月光 + 城市蓝紫环境光打底，暖灯只做点缀；暗部压青蓝，避免整屋发橙
    scene.environmentIntensity = .34; hemi.color.set(0x6186a6); hemi.groundColor.set(0x302d2e); hemi.intensity = .63; sun.color.set(0x91c5f1); sun.intensity = 1.5; sun.position.copy(SUN_NIGHT);
    scene.fog = new THREE.Fog(0x131b2d, 30, 115); renderer.toneMappingExposure = 1.12; bloom.strength = .25; bloom.threshold = 1.15;
    u.shTint.value.set(.94, .99, 1.10); u.hiTint.value.set(1.04, 1, .94); u.sat.value = .94; u.con.value = 1.06; u.vig.value = .61; u.lift.value.set(.004, .007, .012);
    RIM.value.setRGB(.22, .28, .55);
  } else {
    // 白天：暖色低角度阳光是主角（明暗对比要清楚），天光偏蓝，暗部带一点冷色，亮部偏暖
    scene.environmentIntensity = .55; hemi.color.set(0xb8d2ff); hemi.groundColor.set(0x7a6b5d); hemi.intensity = .78; sun.color.set(0xffe6c7); sun.intensity = 5.9; sun.position.copy(SUN_DAY);
    scene.fog = new THREE.Fog(0xa9c7ee, 22, 150); renderer.toneMappingExposure = 1.05; bloom.strength = .16; bloom.threshold = 1.17;
    shafts.mat.uniforms.uI.value = .069; shafts.dustMat.uniforms.uI.value = .30;
    u.shTint.value.set(.96, 1.0, 1.07); u.hiTint.value.set(1.04, 1.0, .96); u.sat.value = .97; u.con.value = 1.05; u.vig.value = .48; u.lift.value.set(.01, .014, .020);
    RIM.value.setRGB(.35, .3, .22);
  }
  if (LOW) for (const l of K.lights) if (l.shadow && (l.isPointLight || l.isSpotLight)) { l.castShadow = false; l.userData.sh = false; }
  document.body.dataset.mode = mode;
}
const modeFor = (t) => { if (Q.get('tod')) return Q.get('tod') === 'day' ? 'day' : 'night'; const h = new Date(t).getHours(); return h >= 7 && h < 18 ? 'day' : 'night'; };
setMode(modeFor(Date.now()));

function resize() { Wd = stage.clientWidth; Ht = stage.clientHeight; if (!Wd || !Ht) return; camera.aspect = Wd / Ht; camera.updateProjectionMatrix(); renderer.setSize(Wd, Ht); composer.setSize(Wd, Ht); cityMap?.resize(Wd, Ht); }
addEventListener('resize', resize); new ResizeObserver(resize).observe(stage);

// ---------- 状态：她在哪、在干嘛 ----------
const stairCenter = STAIR.x + STAIR.width / 2;
const stairLandings = {
  bottom: { x: stairCenter, y: STAIR.start - .38, z: 0 },
  top: { x: stairCenter, y: STAIR.end + .37, z: LY },
};
const sofaAccess = [10.52, 3.72];
const livingSeat = { p: [10.68, 4.21, 0], seat: .49, access: sofaAccess, sofa: true };
const loftSeat = { p: [8.31, 5.795, LY], seat: .35, access: [8.31, 5.39], sofa: true };
let L = null, S = null, pos = { x: 8.92, y: 3.40, z: 0 }, path = [], lastSpotKey = '';
let pickingWalk = false, walkDestination = null, walkPress = null;
let activityReached = true;
let swimming = false, poolMotion = null;
const poolEntry = { x: POOL.x - .48, y: POOL_STEPS.z + POOL_STEPS.width / 2, z: 0 };
const waterEntry = { x: POOL.x + .85, y: poolEntry.y };
const poolWaypoint = (x, y, pool = 'swim') => ({ x, y, z: 0, pool });
const poolExit = () => [poolWaypoint(waterEntry.x, waterEntry.y), poolWaypoint(poolEntry.x, poolEntry.y, 'stairs')];
const swimLap = () => [
  poolWaypoint(POOL.right - .68, waterEntry.y),
  poolWaypoint(POOL.right - .68, POOL.back - .65),
  poolWaypoint(POOL.x + .78, POOL.back - .65),
  poolWaypoint(POOL.x + .78, waterEntry.y),
];
const walkMarker = new THREE.Mesh(new THREE.RingGeometry(.12, .17, 48), new THREE.MeshBasicMaterial({ color: 0x72ebff, side: THREE.DoubleSide, toneMapped: false }));
walkMarker.rotation.x = -Math.PI / 2;
walkMarker.visible = false;
walkMarker.userData.noAO = true;
scene.add(walkMarker);
// 每个活动：站/坐在哪（x, y=房间纵深, z=地板高度）、朝哪边、用什么姿势、座位多高
const N = Math.PI / 2, S_ = -Math.PI / 2, WEST = Math.PI, E = 0, CAMYAW = -0.88;
const bedroomWindow = { x: .7, y: 1.75, z: 0, yaw: WEST };
const livingWindow = { x: 13.35, y: .77, z: 0, yaw: N };
const telescopeStand = { x: 12.57, y: 5.86, z: LY, yaw: N };
const atComputer = { p: [DESK_CHAIR.x, DESK_CHAIR.z - .15, 0], yaw: N, pose: 'type', seat: .625, access: [DESK_CHAIR.x, 2.5] };
const PLACES = {
  computer: atComputer, gal: atComputer, mc: atComputer,
  read: { ...livingSeat, yaw: N, pose: 'read' },
  music: { ...livingSeat, p: [9.82, livingSeat.p[1], 0], access: [9.82, 3.72], yaw: N, pose: 'listen' },
  keptAwake: { ...livingSeat, yaw: N, pose: 'sit' },
  recover: { ...livingSeat, yaw: N, pose: 'sit' },
  eat: { p: [9.8, 9.0, 0], yaw: N, pose: 'eat', seat: 0.49 }, cook: { p: [6.85, 7.35, 0], yaw: N, pose: 'cook' }, snack: { p: [5.65, 7.4, 0], yaw: N, pose: 'plant' },
  toilet: { p: [0.6, 6.82, 0], yaw: S_, pose: 'toilet', seat: 0.45 }, shower: { p: [1.15, 8.8, 0.06], yaw: E, pose: 'lounge', seat: 0.12, mood: 'smile' },
  wash: { p: [2.15, 6.95, 0], yaw: N, pose: 'wash' }, window: { p: [bedroomWindow.x, bedroomWindow.y, 0], yaw: bedroomWindow.yaw, pose: 'window' }, tidy: { p: [7.12, 1.67, 0], yaw: WEST, pose: 'tidy' },
  dress: { p: [0.75, 1.4, 0], yaw: N, pose: 'dress' }, plant: { p: [7.36, 1.25, 0], yaw: N, pose: 'plant' }, idle: { p: [8.92, 3.40, 0], yaw: CAMYAW, pose: 'stand' },
  playfeibi: { p: [12.84, 2.65, 0], yaw: Math.PI / 2, pose: 'stand' },
  stargaze: { p: [telescopeStand.x, telescopeStand.y, LY], yaw: telescopeStand.yaw, pose: 'stargaze' }, lounge: { ...loftSeat, yaw: N, pose: 'sit' },
  // 养猫
  feedcat: { p: [5.95, 9.2, 0], yaw: WEST, pose: 'plant' }, scoop: { p: [3.95, 6.55, 0], yaw: E, pose: 'plant' },
  petcat: { ...livingSeat, yaw: N, pose: 'petcat' }, playcat: { p: [8.81, 3.06, 0], yaw: E, pose: 'plant', mood: 'smile' },
  sleep: { p: [1.3, 4.3, 0], pose: 'sleep', bed: true, access: [2.84, 4.36] }, nap: { p: [1.3, 4.3, 0], pose: 'sleep', bed: true, access: [2.84, 4.36] },
  woken: { p: [1.3, 3.55, 0], yaw: S_, pose: 'phone', seat: 0.6, bedsit: true, access: [2.84, 4.36] },
};
// 3D placement for the existing QQ landmark identifiers.
const LANDMARKS = {
  living: { x: 12.78, y: 3.75, z: 0 },
  bedWindow: bedroomWindow,
  livingWindow,
  sofa: { x: sofaAccess[0], y: sofaAccess[1], z: 0 },
  rug: { x: 8.82, y: 2.76, z: 0 },
  shelf: { x: 7.12, y: 1.67, z: 0 },
  loft: { x: 13.51, y: 5.76, z: LY },
  telescope: telescopeStand,
  loftsofa: { x: 8.31, y: 5.39, z: LY },
};
const placeFor = (act) => {
  if (act.career?.area === 'home') return { ...atComputer, pose: act.career.pose || 'type' };
  if (act.id === 'window' && act.at === 'livingWindow') return { p: [livingWindow.x, livingWindow.y, 0], yaw: livingWindow.yaw, pose: 'window' };
  const pl = PLACES[act.id]; if (pl) return pl;
  const named = act.id === 'go' && act.at?.startsWith('walk_');
  const sp = (named && LANDMARKS[act.at.slice(5)]) || act.spot || LANDMARKS.rug;
  const level = Number((sp.z || 0) > 1.4);
  const p = named && !nav.free(level, sp.x, sp.y) ? nav.approach(level, sp.x, sp.y, solid) : [sp.x, sp.y];
  return { p: [...p, level ? LY : 0], yaw: sp.yaw ?? CAMYAW, pose: 'stand' };
};
const spotOf = (act) => { const pl = placeFor(act); return { x: pl.p[0], y: pl.p[1], z: pl.p[2], ...(pl.access ? { access: pl.access } : {}) }; };
const roomAt = (x, y, z = 0) => z > 1.4 ? 'loft' : x >= TERRACE.x && y >= TERRACE.z ? 'terrace' : y < 6 ? (x < 6 ? 'bedroom' : 'living') : x < 5 ? 'bath' : 'dining';
// 绕开家具走：同一层直接 A*；上下楼先走到楼梯口，再沿楼梯，再 A* 到目的地
function planPath(from, to, exact = false) {
  const lvOf = (p) => ((p.z || 0) > 1.4 ? 1 : 0), fl = (lv) => (lv ? LY : 0);
  const a = lvOf(from), b = lvOf(to), out = [];
  const add = (lv, pts) => { for (const [x, z] of pts) out.push({ x, y: z, z: fl(lv), floor: fl(lv) }); };
  if (exact && !nav.free(b, to.x, to.y)) return null;
  const approach = (lv, point) => point.access && nav.free(lv, ...point.access)
    ? point.access : nav.approach(lv, point.x, point.y, solid);
  const A = approach(a, from), B = approach(b, to);
  if (!nav.free(a, ...A) || !nav.free(b, ...B)) return null;
  // 从家具上起身和坐下是姿势切换。步行动画只在可走的地面上播放。
  if (Math.hypot(A[0] - from.x, A[1] - from.y) > .015) {
    out.push({ x: A[0], y: A[1], z: fl(a), floor: fl(a), jump: true });
  }
  if (a === b) {
    const p = nav.find(a, ...A, ...B); if (!p) return null;
    add(a, p);
  } else {
    const { bottom, top } = stairLandings;
    const [s0, s1] = b === 1 ? [bottom, top] : [top, bottom];
    if (!nav.free(a, s0.x, s0.y) || !nav.free(b, s1.x, s1.y)) return null;
    const p1 = nav.find(a, ...A, s0.x, s0.y), p2 = nav.find(b, s1.x, s1.y, ...B);
    if (!p1 || !p2) return null;
    add(a, p1); out.push({ ...s1, stair: true }); add(b, p2);
  }
  return out;
}
function routeFromHere(to, exact = false) {
  // 换目的地时若已经在楼梯上，先走到平台再重新寻路。
  if (poolMotion) {
    const route = planPath(poolEntry, to, exact);
    if (!route) return null;
    const exit = poolMotion === 'stairs' ? poolExit().slice(1) : poolExit();
    return [...exit, ...route];
  }
  const landing = path[0]?.stair ? path[0] : null;
  const route = planPath(landing || pos, to, exact);
  return route && (landing ? [landing, ...route] : route);
}

function setWalkMode(on) {
  pickingWalk = on;
  $('walkBtn').classList.toggle('on', on);
  $('walkBtn').setAttribute('aria-pressed', String(on));
  renderer.domElement.style.cursor = on ? 'crosshair' : '';
  if (on) setFollow(false);
  updateWalkHint();
}

function updateWalkHint(message) {
  const hint = $('walkHint');
  const poolHint = swimming ? (poolMotion === 'swim' ? '正在泳池里游泳' : poolMotion === 'stairs' ? '正在沿台阶下水' : '正在走向泳池')
    : poolMotion && '正在回到池边上岸';
  const text = message || poolHint || (walkDestination
    ? (path.length ? `正在走向${walkDestination.room}的标记处` : `已到达${walkDestination.room}的标记处`)
    : (pickingWalk ? '点一处空地作为目的地' : ''));
  hint.hidden = !text;
  hint.textContent = text;
  $('resumeBtn').hidden = !walkDestination;
  const button = $('swimBtn');
  if (button) button.textContent = swimming || poolMotion ? '上岸' : '去游泳';
}

function clearWalkDestination() {
  walkDestination = null;
  walkMarker.visible = false;
  updateWalkHint();
}

function beginSwimming() {
  const route = poolMotion ? [] : routeFromHere(poolEntry, true);
  if (!route) { updateWalkHint('暂时走不到泳池台阶'); return; }
  swimming = true;
  activityReached = false;
  path = [...route, poolWaypoint(waterEntry.x, waterEntry.y, poolMotion === 'swim' ? 'swim' : 'stairs'), ...swimLap()];
  clearWalkDestination();
  setWalkMode(false);
  changeView(fitPool);
}

function walkToPoint(point, level) {
  const spot = { x: point.x, y: point.z, z: level ? LY : 0 };
  const route = routeFromHere(spot, true);
  if (!route) { updateWalkHint('这个位置走不到，试试附近空地'); return false; }
  swimming = false;
  const roomId = roomAt(spot.x, spot.y, spot.z);
  walkDestination = { room: roomId === 'terrace' ? '泳池露台' : L.rooms.find((r) => r.id === roomId)?.name || '房间' };
  path = route;
  activityReached = false;
  walkMarker.position.set(point.x, point.y + .025, point.z);
  walkMarker.visible = true;
  updateWalkHint();
  renderPanel();
  return true;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  walkPress = pickingWalk && e.isPrimary && e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey
    ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (walkPress && Math.hypot(e.clientX - walkPress.x, e.clientY - walkPress.y) > 6) walkPress = null;
});
renderer.domElement.addEventListener('pointercancel', () => { walkPress = null; });
renderer.domElement.addEventListener('pointerup', (e) => {
  const press = walkPress;
  walkPress = null;
  if (!pickingWalk || !press || e.pointerId !== press.id || !S || !L || !char.model) return;
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) return;
  const r = renderer.domElement.getBoundingClientRect();
  if (!r.width || !r.height) return;
  _ndc.set((e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2);
  _ray.setFromCamera(_ndc, camera);
  const hit = _ray.intersectObjects(walkPickMeshes, false).find(({ object }) => {
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    return true;
  });
  const level = hit?.object.userData.walkLevel;
  if (level == null || hit.face?.normal.y < .7) { updateWalkHint('点地板或地毯上的空地'); return; }
  walkToPoint(hit.point, level);
});
let yaw = CAMYAW;
function stairHeight(depth) {
  const { start, end, steps } = STAIR;
  const tread = THREE.MathUtils.clamp((depth - start) / ((end - start) / steps) + .78, 0, steps);
  const fraction = tread % 1;
  return (Math.floor(tread) + THREE.MathUtils.smoothstep(fraction, .22, .78)) * (LY / steps);
}
function stepWalk(dt) {
  if (!path.length) { char.walking = Math.max(0, char.walking - dt * 4); return; }
  if (path[0].jump) {
    const j = path.shift();
    pos = { x: j.x, y: j.y, z: j.z || 0 };
    char.walking = 0;
    return;
  }
  const t = path[0], dx = t.x - pos.x, dy = t.y - pos.y, dist = Math.hypot(dx, dy), sp = (t.pool ? .55 : t.stair ? .92 : 1.20) * dt;
  const floor = t.floor ?? t.z ?? 0;
  if (dist > .01) { const want = Math.atan2(-dy, dx); let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * (t.pool === 'swim' ? 4 : 10)); }
  if (t.pool !== poolMotion && (t.pool || poolMotion)) {
    poolMotion = t.pool || null;
    updateWalkHint();
    renderPanel();
  }
  char.walking = Math.min(1, char.walking + dt * 4); char.walkPhase = (char.walkPhase || 0) + sp / 0.2;
  if (dist <= sp) {
    pos = { x: t.x, y: t.y, z: floor };
    path.shift();
    if (t.pool === 'stairs' && t.x === poolEntry.x) {
      poolMotion = null;
      updateWalkHint();
      renderPanel();
    }
    if (!path.length && swimming) path = swimLap();
    if (!path.length && walkDestination) { updateWalkHint(); renderPanel(); }
    else if (!path.length && activityReached) pos = spotOf(S.act);
  }
  else {
    pos.x += dx / dist * sp;
    pos.y += dy / dist * sp;
    pos.z = t.stair ? stairHeight(pos.y) : floor;
  }
}
// 被子贴身：把躺着的身体（含头发、裙子）投成一张俯视高度场，像布一样往外“垂”开、再模糊一下，
// 被子每个顶点抬到高度场上方一点点。这样不管姿势怎么改，被子都盖得住、不会被身体穿出来。
let sleepFitted = false;
function fitDuvet() {
  if (!char.skeleton) return;
  const mesh = room.duvetSleep, g = mesh.geometry, P = g.attributes.position;
  if (!g.userData.orig) g.userData.orig = P.array.slice();
  const O = g.userData.orig, X0 = 0, Z0 = 3.1, C = .025, nx = Math.ceil(2.7 / C), nz = Math.ceil(3 / C), hf = new Float32Array(nx * nz).fill(-1);
  const v = new THREE.Vector3(); char.root.updateMatrixWorld(true); char.skeleton.update();
  char.model.traverse((o) => {
    if (!o.isSkinnedMesh || o.material?.side === THREE.BackSide) return;
    for (let i = 0, n = o.geometry.attributes.position.count; i < n; i++) {
      o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld);
      const cx = Math.floor((v.x - X0) / C), cz = Math.floor((v.z - Z0) / C);
      if (v.z >= 3.54 && cx >= 0 && cx < nx && cz >= 0 && cz < nz && v.y > hf[cz * nx + cx]) hf[cz * nx + cx] = v.y;
    }
  });
  // 布料往外垂：每个格子把高度按 d² 衰减地分给周围
  const R = 8, out = new Float32Array(hf.length).fill(-1);
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const h = hf[z * nx + x]; if (h < 0) continue;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= nx || Z >= nz) continue;
      const d2 = (dx * dx + dz * dz) * C * C, y = h - d2 * 3.2; if (y > out[Z * nx + X]) out[Z * nx + X] = y;
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    const src = out.slice();
    for (let z = 1; z < nz - 1; z++) for (let x = 1; x < nx - 1; x++) { let s = 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) s += src[(z + dz) * nx + x + dx]; out[z * nx + x] = Math.max(src[z * nx + x] * .5 + s / 9 * .5, -1); }
  }
  const at = (x, z) => { const fx = (x - X0) / C - .5, fz = (z - Z0) / C - .5, ix = Math.max(0, Math.min(nx - 2, Math.floor(fx))), iz = Math.max(0, Math.min(nz - 2, Math.floor(fz))), tx = Math.min(1, Math.max(0, fx - ix)), tz = Math.min(1, Math.max(0, fz - iz));
    const a = out[iz * nx + ix], b = out[iz * nx + ix + 1], c = out[(iz + 1) * nx + ix], d = out[(iz + 1) * nx + ix + 1]; return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz; };
  for (let i = 0; i < P.count; i++) { const x = O[i * 3], y = O[i * 3 + 1], z = O[i * 3 + 2]; P.setXYZ(i, x, Math.max(y, at(x, z) + .03), z); }
  P.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere();
}
const BED = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0));
function syncChar() {
  if (!S || !char.model) return;
  char.friendLook = 0;
  char.catLook = false;
  char.chatTalking = false;
  char.chatNod = 0;
  char.workRest = S.act.id === 'work_nap';
  if ((S.act.leisure || S.act.career)?.lines?.length) char.chatTalking = true;
  char.sofaSeat = false;
  if (awayScene) {
    sleepFitted = false;
    const job = S.act.leisure || S.act.career, pl = awayScene.placement(job, char.t);
    char.walking = pl.walking || 0;
    if (pl.walking) char.walkPhase = char.t * 3;
    char.mood = null;
    char.seatH = pl.seat;
    char.sofaSeat = !!POSES[pl.pose].seat;
    char.setPose(pl.pose);
    char.place(pl.position, pl.yaw);
    if (char.sofaSeat && job.area !== 'nap') char.root.position.z -= .07;
    const line = job.lines?.[Math.floor(char.t / 5) % job.lines.length];
    char.chatTalking = !!line && !char.workRest;
    room.setSleep(false); room.setCooking(false);
    return;
  }
  if (careScene && !ward.visible) {
    const { beat, script } = careScene;
    char.mood = beat.mood ?? null;
    char.seatH = .53;
    room.setSleep(false); room.setCooking(false);
    if (script.shot) {
      char.walking = 0;
      char.setPose(beat.pose);
      char.place(careSofaPosition, Math.PI / 2);
      return;
    }
    const p = careScene.elapsed;
    const step = THREE.MathUtils.smoothstep(p, 1.3, 2.65);
    const turn = THREE.MathUtils.smoothstep(p, 2.42, 3.05);
    const seated = THREE.MathUtils.smoothstep(p, 3.05, 3.48);
    char.walkPhase = step * 4.8;
    char.walking = p >= 1.3 && p < 2.7 ? .7 : 0;
    char.setPose(p >= 3.05 ? 'awaitingCare' : p >= 1.3 && p < 2.7 ? 'stand' : 'unwell');
    char.root.position.set(10.68, 0, 3.62 + .31 * step + .44 * seated);
    char.root.rotation.set(0, -Math.PI / 2 + Math.PI * turn, 0, 'XYZ');
    return;
  }
  if (ward.visible) {
    char.walking = 0;
    char.mood = null;
    char.seatH = .55;
    char.setPose('perch', char.pose !== 'perch');
    char.place(wardPosition, -Math.PI / 2);
    room.setSleep(false); room.setCooking(false);
    return;
  }
  const id = S.act.id, here = !path.length && !walkDestination && activityReached;
  const pl = here ? placeFor(S.act) : null;
  char.mood = here ? pl.mood : null;
  if (poolMotion) {
    const inWater = poolMotion === 'swim';
    const depth = inWater ? 1 : THREE.MathUtils.smoothstep(pos.x, POOL.x - .09, waterEntry.x);
    char.setPose(inWater ? 'swim' : 'stand');
    if (inWater) char.walking = 0;
    const float = inWater ? .024 * Math.sin(char.t * 5) : 0;
    const offset = .46 * depth;
    char.root.position.set(pos.x - Math.cos(yaw) * offset, -.19 * depth + float, pos.y + Math.sin(yaw) * offset);
    char.root.rotation.set(0, yaw, -.51 * Math.PI * depth, 'YXZ');
  } else if (!here) {
    char.setPose('stand', char.pose !== 'stand');
    char.root.position.set(pos.x, pos.z || 0, pos.y); char.root.rotation.set(0, yaw, 0, 'XYZ');
  }
  else if (pl.bed) {
    char.walking = 0;
    char.root.position.set(pl.p[0], .79, 4.18); char.root.quaternion.setFromRotationMatrix(BED);
    if (!sleepFitted) {
      char.setPose('sleep', true);
      char.root.updateMatrixWorld(true);
      char.update(0);
      fitDuvet();
      sleepFitted = true;
    }
  } else {
    char.walking = 0; char.seatH = pl.seat ?? 0.45;
    char.sofaSeat = pl.sofa === true;
    const chatting = friendPlay?.started;
    const turn = friendPlay?.turn;
    const friend = feibi.root.position;
    const wanted = chatting ? Math.atan2(pl.p[1] - friend.z, friend.x - pl.p[0]) : pl.yaw;
    const turnsBody = chatting && pl.pose === 'stand';
    const pose = turnsBody ? 'noticeFriend' : pl.pose;
    char.setPose(pose, !chatting && char.pose !== pose && char.pose !== 'noticeFriend');
    if (chatting) {
      char.mood = null;
      char.chatTalking = turn?.speaker === 'whale';
      if (turn?.speaker === 'feibi') char.chatNod = 5.5 * Math.exp(-(((turn.end - friendPlay.elapsed - .34) / .26) ** 2));
      if (!turnsBody) char.friendLook = THREE.MathUtils.clamp(Math.atan2(Math.sin(wanted - yaw), Math.cos(wanted - yaw)), -.65, .65);
    }
    if (id === 'petcat') {
      const phase = char.t % 21;
      char.catLook = S.cat?.act?.id === 'petted' && C.y > .35 && Math.hypot(C.x - pl.p[0], C.z - pl.p[1]) < .67;
      if (!chatting) {
        char.mood = phase >= 5 && phase < 6 ? 'smile' : null;
        if (char.catLook) char.friendLook = -.29;
      }
    } else if (id === 'music' && !chatting) {
      const phase = char.t % 19;
      char.mood = phase >= 7 && phase < 8 ? 'smile' : null;
    }
    const facing = turnsBody ? wanted : pl.yaw;
    let d = facing - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * 0.15;
    char.root.position.set(pl.p[0], pl.p[2] || 0, pl.p[1] - (char.sofaSeat ? char.sofaDepth ?? 0 : 0)); char.root.rotation.set(0, yaw, 0, 'XYZ');
  }
  if (!pl?.bed) sleepFitted = false;
  room.setSleep(!!pl?.bed); room.setCooking(id === 'cook' && here);
}

// ---------- 猫：按插件给的 cat.act 去对应的地方、摆对应的姿势 ----------
// 各个“猫位”（x, z 是地面坐标；高处的位置到了跳上去，高度用射线现量）
const CAT_AT = {
  catbed: { x: 2.1, z: .55, yaw: 2.4 }, bed: { x: 1.3, z: 5.15, yaw: 1.0 }, sun: { x: 3.0, z: 3.45, yaw: .38 },
  sofa: { x: 11.66, z: 4.57, yaw: Math.PI }, window: { x: .42, z: 1.45, yaw: -Math.PI / 2 }, rug: { x: 9.32, z: 3.17, yaw: -2.2 }, // 地毯东头（中间是茶几）
  catbowl: { x: 5.45, z: 9.29, yaw: 0 }, litter: { x: 4.51, z: 6.52, yaw: -Math.PI / 2 }, stairfoot: { x: stairCenter, z: .84, yaw: Math.PI },
};
const CAT_POSE = { sleep: 'curl', bed: 'curl', sun: 'side', sofa: 'loaf', window: 'sit', groom: 'groom', follow: 'sit', eat: 'eat', beg: 'beg', litter: 'sit', play: 'crouch', petted: 'petted', zoom: 'sit' };
const rc = new THREE.Raycaster(), DOWN = new THREE.Vector3(0, -1, 0), _o = new THREE.Vector3();
const shownSolid = (o) => { if (!o.isMesh || o.material?.transparent) return false; for (let p = o; p; p = p.parent) { if ((!p.visible && !p.userData.viewCutaway) || p.userData.noNav || p === char.root) return false; } return true; };
function surfaceY(x, z) { rc.set(_o.set(x, 1.3, z), DOWN); rc.far = 1.4; for (const h of rc.intersectObjects(scene.children, true)) if (shownSolid(h.object)) return Math.max(0, h.point.y); return 0; }
const C = { x: 11.5, z: 8.95, y: .05, yaw: 2.4, path: [], key: '', tg: null, jump: null, t: 0, zoom: 0, placed: false };
function catTarget() {
  const k = S?.cat?.act || { id: 'sleep', at: 'catbed' }, id = k.id;
  if (id === 'petted') return { x: 11.11, z: 4.32, yaw: Math.PI, pose: 'petted' };
  if (id === 'play') return { x: 9.47, z: 3.21, yaw: -Math.PI / 2, pose: 'crouch' }; // 茶几和沙发之间，冲着她
  if (id === 'follow') {
    if ((pos.z || 0) > 1.4) return { ...CAT_AT.stairfoot, pose: 'sit' };
    // 她身边找一块地面空地（不然会落到沙发靠背、桌子上），优先离猫近的那一侧
    const a0 = Math.atan2(C.z - pos.y, C.x - pos.x); let best = null;
    for (const rad of [.55, .75, .95, 1.2]) { for (let k = 0; k < 16 && !best; k++) { const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 8, x = pos.x + Math.cos(a) * rad, z = pos.y + Math.sin(a) * rad; if (catNav.free(0, x, z)) best = { x, z }; } if (best) break; }
    const { x, z } = best || { x: C.x, z: C.z };
    return { x, z, yaw: Math.atan2(pos.x - x, pos.y - z), pose: 'sit' };
  }
  const p = CAT_AT[k.at] || CAT_AT.catbed;
  return { ...p, yaw: Q.has('catyaw') ? +Q.get('catyaw') : id === 'beg' ? Math.PI : p.yaw, pose: CAT_POSE[id] || 'sit' }; // catyaw：调试时让它转过来看脸
}
function planCat(tg) {
  const out = []; let from = [C.x, C.z];
  // 在窝里 / 床上 / 沙发上：先跳下来
  if (C.y > .03 || !catNav.free(0, C.x, C.z)) { const A = catNav.approach(0, C.x, C.z, catSolid); out.push({ jump: true, x: A[0], z: A[1], y: 0 }); from = A; }
  const B = catNav.approach(0, tg.x, tg.z, catSolid);
  const p = catNav.find(0, from[0], from[1], B[0], B[1]);
  if (!p) return [];
  for (const [x, z] of p) out.push({ x, z, y: 0 });
  // 目标在家具上 / 篮子里：最后一下跳进去
  const ty = surfaceY(tg.x, tg.z);
  out.push({ jump: !catNav.free(0, tg.x, tg.z) || ty > .03, x: tg.x, z: tg.z, y: ty });
  return out;
}
function placeCatNow(tg) { C.x = tg.x; C.z = tg.z; C.y = surfaceY(tg.x, tg.z); C.yaw = tg.yaw; C.path = []; C.jump = null; cat.setPose(tg.pose, true); }
function stepCat(dt) {
  if (awayScene && mapVisit?.kind !== 'home') { cat.root.visible = false; return; }
  if (!S) return;
  cat.root.visible = !!S.cat || !('cat' in S); // 插件关了养猫（cat: null）就不显示
  if (!cat.root.visible) { C.key = ''; C.placed = false; return; }
  const k = S.cat?.act, key = k ? `${k.id}|${k.since}` : 'none';
  if (key !== C.key) {
    C.key = key; C.tg = catTarget(); C.zoom = k?.id === 'zoom' ? 5 : 0;
    if (!C.placed || STILL) { placeCatNow(C.tg); C.placed = true; } else C.path = planCat(C.tg);
  }
  // 跟着她：她走远了就重新规划
  if (k?.id === 'follow' && (C.t += dt) > 1) { C.t = 0; const tg = catTarget(); if (Math.hypot(tg.x - C.tg.x, tg.z - C.tg.z) > .6) { C.tg = tg; C.path = planCat(tg); } }
  // 跑酷：跑完一段再挑一个远处的点
  if (C.zoom > 0 && !C.path.length && !C.jump) {
    C.zoom--; for (let i = 0; i < 30; i++) { const x = .5 + Math.random() * (W - 1), z = .5 + Math.random() * (D - 1); if (catNav.free(0, x, z) && Math.hypot(x - C.x, z - C.z) > 2.5) { C.tg = { x, z, yaw: C.yaw, pose: 'sit' }; C.path = planCat(C.tg); break; } }
  }
  let speed = 0;
  if (C.jump) {
    const j = C.jump; j.t += dt / j.dur; const u = Math.min(1, j.t), e = u * u * (3 - 2 * u);
    C.x = j.x0 + (j.x1 - j.x0) * e; C.z = j.z0 + (j.z1 - j.z0) * e; C.y = j.y0 + (j.y1 - j.y0) * e + Math.sin(Math.PI * u) * j.h;
    if (u >= 1) C.jump = null;
  } else if (C.path.length) {
    const p = C.path[0];
    if (p.jump) { C.path.shift(); const d = Math.hypot(p.x - C.x, p.z - C.z); C.jump = { t: 0, dur: .35 + d * .25, x0: C.x, z0: C.z, y0: C.y, x1: p.x, z1: p.z, y1: p.y, h: .12 + Math.max(0, p.y - C.y) * .5 }; if (d > .02) C.yaw = Math.atan2(p.x - C.x, p.z - C.z); }
    else {
      const run = C.zoom > 0 || (C.path.length > 6) ? (C.zoom > 0 ? 2.2 : .85) : .55, dx = p.x - C.x, dz = p.z - C.z, d = Math.hypot(dx, dz), st = run * dt;
      if (d > .01) { let dy = Math.atan2(dx, dz) - C.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); C.yaw += dy * Math.min(1, dt * 9); }
      if (d <= st) { C.x = p.x; C.z = p.z; C.y = p.y; C.path.shift(); } else { C.x += dx / d * st; C.z += dz / d * st; C.y = 0; }
      speed = run;
    }
  } else if (C.tg) { let dy = C.tg.yaw - C.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); C.yaw += dy * Math.min(1, dt * 3); }
  const busy = !!C.jump || C.path.length > 0;
  cat.moving = C.jump ? 0 : speed; cat.setPose(busy ? 'stand' : (C.tg?.pose || 'sit'));
  cat.root.position.set(C.x, C.y, C.z); cat.root.rotation.y = C.yaw;
  cat.update(dt);
}

// ---------- 面板 ----------
const fmt = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function renderPanel() {
  const a = S.act, mins = Math.round((S.now - a.since) / 60000), th = S.thoughts[0];
  if (cityOpen) cityMap.sync(S, modeFor(S.now));
  $('emo').textContent = a.emoji;
  const label = a.id === 'playfeibi'
    ? (friendPlay?.started ? '和菲比啾比聊天' : S.roommateChatFinished || a.since === finishedFriendEvent ? '刚和菲比啾比聊完' : '在客厅等菲比啾比')
    : a.label;
  $('lbl').textContent = careScene && !ward.visible ? (WARD_PREVIEW ? '剧情预演' : careScene.beat.label) : label;
  $('clock').textContent = fmt(S.now);
  $('sub').textContent = careScene && !ward.visible ? `小屋剧情 · ${careScene.beat.label}` : WARD_PREVIEW ? '可拖动转动视角，点「返回小屋」退出预览' : S.healthStory
    ? `小屋剧情 · ${S.healthStory.summary} · 预计 ${fmt(S.healthStory.until)} 结束当前阶段`
    : `${a.room} · ${fmt(a.since)} 开始，${mins} 分钟了` + (a.id === 'sleep' && a.until ? ` · 大概 ${fmt(a.until)} 醒` : '');
  for (const id of ['walkBtn', 'swimBtn']) $(id).disabled = careActivity(a.id) || !!awayScene;
  $('livingBtn').disabled = (ward.visible || !!awayScene || !!careScene) && !WARD_PREVIEW;
  if (WARD_PREVIEW) $('livingBtn').textContent = '返回小屋';
  $('viewBtn').textContent = awayScene ? awayScene.label || '工作室全景' : ward.visible ? '🏥 病房全景' : careScene ? '客厅镜头' : '🏠 全景';
  if (walkDestination) {
    $('emo').textContent = path.length ? '🚶' : '📍';
    $('lbl').textContent = path.length ? '正在走向标记处' : '在标记处停留';
    $('sub').textContent = walkDestination.room;
  } else if (swimming || poolMotion) {
    $('emo').textContent = poolMotion === 'swim' ? '🏊' : '🚶';
    $('lbl').textContent = swimming && poolMotion === 'swim' ? '正在泳池里游泳' : $('walkHint').textContent || '正在前往泳池台阶';
    $('sub').textContent = '泳池露台';
  }
  $('feel').innerHTML = (S.feel.length || WARD_PREVIEW ? S.feel : ['状态不错']).map((f) => `<span class="chip">${esc(f)}</span>`).join('') + (S.whim ? `<span class="chip">惦记着：${esc(S.whim.label)}</span>` : '')
    + (S.sleepStatus ? `<span class="chip">${esc(S.sleepStatus)}</span>` : '')
    + (S.cat ? `<span class="chip">🐈 ${esc(S.cat.name)}${esc(S.cat.act?.label || '')}${S.cat.feel?.length ? '（' + esc(S.cat.feel.join('、')) + '）' : ''}</span>` : '')
    + (S.feibi ? `<span class="chip">${esc(FEIBI_NAME)}${friendPlay?.started ? '在跟大肥鱼聊天' : friendPlay ? '正往大肥鱼那边走' : esc(S.feibi.label)}</span>` : '');
  $('latest').innerHTML = th ? `<div class="thought">${esc(th.text)}</div><div class="meta"><span class="chip">${fmt(th.at)}</span>${th.mood ? `<span class="chip">${esc(th.mood)}</span>` : ''}${th.dream ? '<span class="chip">梦里</span>' : ''}${th.want ? `<span class="chip">想去：${esc(th.want)}</span>` : ''}${th.tell ? `<span class="chip tell">想跟主人说：${esc(th.tell)}${th.reach ? `（${esc(th.reach)}）` : ''}</span>` : ''}</div>` : '<div class="small">还没想过事情。</div>';
  $('err').textContent = S.lastErr ? '想事情出错：' + S.lastErr : '';
  const btn = $('thinkBtn'); if (!btn.dataset.busy) btn.disabled = !!S.thinking;
  $('needs').innerHTML = S.needDefs.map((n) => { const v = Math.round(S.needs[n.id]), cls = v < 25 ? 'low' : v < 45 ? 'mid' : ''; return `<span>${esc(n.name)}</span><span class="bar"><i class="${cls}" style="width:${v}%"></i></span><span class="num">${v}</span>`; }).join('');
  $('thoughts').innerHTML = S.thoughts.slice(0, 20).map((t) => `<li><span class="t">${fmt(t.at)}</span>${t.dream ? '💭 ' : ''}${esc(t.text)}${t.mood ? ` <span class="chip">${esc(t.mood)}</span>` : ''}${t.tell ? `<div class="small">想跟主人说：「${esc(t.tell)}」${t.reach ? ' · ' + esc(t.reach) : ''}</div>` : ''}</li>`).join('') || '<li class="small">还没有</li>';
  $('log').innerHTML = S.log.map((l) => `<li><span class="t">${fmt(l.at)}</span>${esc(l.label)}${l.by === 'self' ? ' <span class="chip">她自己决定的</span>' : ''}</li>`).join('') || '<li class="small">今天还没开始</li>';
  if ($('neighbors')) {
    const neighborhood = S.neighborhood;
    const contacts = neighborhood?.contacts || [];
    const agenda = S.leisure?.agenda;
    $('neighbors').hidden = !neighborhood && !agenda;
    $('neighborNotes').innerHTML = (agenda ? `<li><strong>今天的外出安排</strong><div class="small">${esc(agenda.text)}</div></li>` : '')
      + contacts.map(person => `<li><strong>${esc(person.name)}</strong> <span class="chip">${esc(person.relationship)}</span><div class="small">${esc(person.place)} · 见过 ${person.visits} 次 · 上次聊${esc(person.topic)}</div></li>`).join('')
      + (neighborhood?.garden ? `<li>🌼 ${esc(neighborhood.garden)}</li>` : '')
      + (neighborhood?.book ? `<li>📚 ${esc(neighborhood.book)}</li>` : '')
      + (neighborhood && !contacts.length ? '<li class="small">附近有面包店、社区花园和图书室。去过以后，认识的人和做过的事会记在这里。</li>' : '');
  }
  $('foot').textContent = (S.lanUrls && S.lanUrls.length ? `手机（同一个 Wi-Fi）打开：${S.lanUrls.join(' 或 ')} · ` : '') + `作息：${S.schedule.bedtime} 睡 · ${S.schedule.wakeup} 起 · 今天想了 ${S.day.thoughts || 0} 次 · 主动找主人 ${S.day.proactive || 0}/${S.schedule.proactivePerDay} · 下次想事约 ${S.nextThinkIn} 分钟后`;
  const b = $('bubble'); const showTh = th && !S.healthStory && (!SHARE || S.shareThought);
  const story = (a.leisure || a.career)?.lines, storyLine = story?.[Math.floor(char.t / 5) % story.length];
  b.querySelector('.tx').textContent = storyLine || (careScene && !ward.visible ? careScene.beat.line : walkDestination || swimming || poolMotion ? $('lbl').textContent : showTh ? (th.text.length > 54 ? th.text.slice(0, 54) + '…' : th.text) : label);
  if ($('ttime')) $('ttime').textContent = fmt(S.now); b.querySelector('.tg').textContent = $('emo').textContent;
}
const head = new THREE.Vector3();
function placeBubble() {
  const b = $('bubble'); if (!S || !char.model) { b.style.display = 'none'; return; }
  if (friendPlay?.started) {
    const turn = friendPlay.turn;
    if (turn?.speaker !== 'whale') { b.style.display = 'none'; return; }
    b.querySelector('.tx').textContent = turn.line;
  }
  if ((S.act.leisure || S.act.career)?.lines?.length) {
    const lines = (S.act.leisure || S.act.career).lines;
    b.querySelector('.tx').textContent = lines[Math.floor(char.t / 5) % lines.length];
  }
  char.bones.headx.getWorldPosition(head); head.y += friendPlay?.started || careScene && !ward.visible ? .58 : .95; head.project(camera);
  if (head.z > 1 || Math.abs(head.x) > 1 || Math.abs(head.y) > 1) { b.style.display = 'none'; return; }
  b.style.display = '';
  const half = b.offsetWidth / 2;
  b.style.left = THREE.MathUtils.clamp((head.x * .5 + .5) * Wd, half + 8, Wd - half - 8) + 'px';
  b.style.top = ((-head.y * .5 + .5) * Ht) + 'px';
}
const wardPosition = new THREE.Vector3(.95, wardY, .35);
const careSofaPosition = new THREE.Vector3(10.68, 0, 4.26);
const careActivity = (id) => id === 'hospital' || id === 'recover';
const CARE_SCRIPTS = {
  fall: { fadeAt: 5, beats: [
    { at: 0, label: '在客厅等人来帮忙', line: '本鱼有点不舒服……先坐一会儿。' },
  ] },
  'self-harm': { fadeAt: 8, shot: [[10.68, .73, 4.3], 170, 20, 2.58, 46], beats: [
    { at: 0, pose: 'foldedIn', label: '低头缩在沙发上', line: '本鱼现在……有点不知道该怎么说。' },
    { at: 2.6, pose: 'lookingAway', label: '把视线移开', line: '可以先别问吗？本鱼想缓一下。' },
    { at: 5.2, pose: 'askingForHelp', label: '抬头开口求助', line: '那个……能陪本鱼一会儿吗？' },
  ] },
  od: { fadeAt: 8, shot: [[10.65, .73, 4.25], 149, 19, 2.70, 45], beats: [
    { at: 0, pose: 'tiredSmile', mood: 'smile', label: '勉强笑了一下', line: '本鱼没事……等一下就好。' },
    { at: 2.4, pose: 'shaky', label: '笑容落了下来', line: '等一下……头晕得厉害。' },
    { at: 4.9, pose: 'askingForHelp', label: '开口请人帮忙', line: '本鱼现在不太好。能帮本鱼叫人吗？' },
  ] },
};
let careScene = null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const careFade = document.createElement('div');
careFade.id = 'careFade';
Object.assign(careFade.style, { position: 'absolute', inset: '0', background: '#10121c', opacity: '0', pointerEvents: 'none', zIndex: 7 });
careFade.setAttribute('aria-hidden', 'true');
stage.append(careFade);
function freezeMovementForCare() {
  path = []; swimming = false; poolMotion = null; clearWalkDestination(); setWalkMode(false);
}
function beginCareScene(kind) {
  const script = Object.hasOwn(CARE_SCRIPTS, kind) ? CARE_SCRIPTS[kind] : CARE_SCRIPTS.fall;
  careScene = { elapsed: 0, script, beat: script.beats[0] };
  ward.visible = false;
  freezeMovementForCare();
  changeView(fitCareScene);
  if (script.shot && char.model) char.setPose(careScene.beat.pose, true);
}
function animateCareScene(dt) {
  if (!careScene) return;
  const time = careScene.elapsed += dt;
  const beat = careScene.script.beats.findLast((b) => time >= b.at);
  if (beat !== careScene.beat) { careScene.beat = beat; renderPanel(); }
  const fade = time - careScene.script.fadeAt;
  if (fade < 0) return;
  careFade.style.opacity = String(THREE.MathUtils.smoothstep(fade, 0, .8)
    * (1 - THREE.MathUtils.smoothstep(fade, 1.1, 2)));
  if (fade >= .8 && !ward.visible) {
    ward.visible = true;
    changeView(fitWard);
    renderPanel();
  }
  if (fade >= 2) careScene = null;
}
function previewWard() {
  const now = Date.now();
  S = {
    now, act: { id: 'hospital', emoji: '🏥', label: '病房预览', since: now },
    feel: [], thoughts: [], log: [], needDefs: [],
    schedule: {}, day: {}, thinking: false,
  };
  if (STORY_PREVIEW && !STILL && !reducedMotion.matches) beginCareScene(Q.get('scene'));
  else { ward.visible = true; changeView(fitWard); }
  setMode(modeFor(now));
  renderPanel();
  $('panel').hidden = true;
  $('toggle').hidden = true;
  $('thinkBtn').disabled = true;
  $('hud').classList.remove('off');
}
async function poll() {
  let s;
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (!response.ok) throw new Error(`状态接口返回 ${response.status}`);
    s = await response.json();
    if (!s?.act?.id) throw new Error('状态数据缺少当前活动');
  } catch (error) {
    console.warn('小屋状态连接失败', error);
    $('lbl').textContent = '暂时连不上小屋，正在重连';
    $('hud').classList.add('off');
    return;
  }
  try {
    const first = !S, wasSwimming = S?.act.id === 'swim', wasInWard = ward.visible, wasAway = awayScene, previousArea = S?.act.leisure?.area;
    S = s;
    showCharacter();
    if (S.feibi && !feibiLoading) feibiLoading = feibi.load().then(addFeibiCredit).catch((e) => console.warn('菲比啾比加载失败', e));
    if (feibiCredit) feibiCredit.hidden = !S.feibi;
    void flushRoommateReport();
    const atOffice = S.act.career && S.act.career.area !== 'home';
    const outingArea = S.act.leisure?.area;
    const atWardVisit = outingArea === 'hospital';
    office.root.visible = !!atOffice || outingArea === 'office';
    excursion.root.visible = !!outingArea && !office.root.visible && !atWardVisit;
    awayScene = atWardVisit ? wardVisit : office.root.visible ? office : excursion.root.visible ? excursion : null;
    if (excursion.root.visible) excursion.show(S.act.leisure);
    if (awayScene) {
      ward.visible = atWardVisit;
      careScene = null; careFade.style.opacity = '0';
      path = []; swimming = false; poolMotion = null; activityReached = true;
      clearWalkDestination(); setWalkMode(false);
      if (wasAway !== awayScene || previousArea !== S.act.leisure?.area || first) { setFollow(false); changeView(fitAway); }
      lastSpotKey = `${S.act.id}|${S.act.since}`;
      setMode(modeFor(S.now)); renderPanel(); $('hud').classList.remove('off');
      return;
    }
    if (wasAway) { char.workRest = false; changeView(fitLiving); }
    const admitted = S.act.id === 'hospital';
    if (!admitted && careScene) { careScene = null; careFade.style.opacity = '0'; }
    const recentAdmission = S.now - S.healthStory?.at < 35000;
    if (admitted && !wasInWard && !careScene && recentAdmission && !STILL && !reducedMotion.matches) beginCareScene(S.healthStory?.kind);
    ward.visible = admitted && (wasInWard || !careScene);
    const spot = spotOf(S.act);
    const key = `${S.act.id}|${S.act.at}|${S.act.since}`;
    if (admitted) {
      if (ward.visible && !wasInWard) { freezeMovementForCare(); changeView(fitWard); }
    } else if (first || wasInWard || wasAway) {
      if (S.act.id === 'swim') {
        swimming = true; poolMotion = 'swim'; activityReached = false;
        pos = { ...waterEntry, z: 0 }; yaw = E;
        path = swimLap(); updateWalkHint(); changeView(fitPool);
      } else if (S.act.id === 'go' && !nav.free(Number(spot.z > 1.4), spot.x, spot.y)) {
        pos = spotOf({ id: 'idle' });
        activityReached = false;
      } else pos = { ...spot };
      if (S.act.id !== 'swim') yaw = placeFor(S.act).yaw ?? CAMYAW;
      if (wasInWard) { activityReached = true; changeView(fitLiving); setFollow(true); }
    }
    else if (key !== lastSpotKey) {
      if (S.act.id === 'swim') {
        if (!swimming) beginSwimming();
      } else {
        if (wasSwimming || careActivity(S.act.id) || S.act.id === 'playfeibi' || (S.act.id === 'go' && (walkDestination || swimming))) { swimming = false; clearWalkDestination(); setWalkMode(false); }
        if (!walkDestination && !swimming) {
          const route = routeFromHere(spot, S.act.id === 'go');
          path = route || [];
          activityReached = route !== null;
          if (activityReached && !path.length) pos = spot;
        }
      }
    }
    lastSpotKey = key; setMode(modeFor(S.now)); renderPanel(); $('hud').classList.remove('off');
  } catch (error) {
    console.error('小屋画面同步失败', error);
    $('lbl').textContent = '小屋在线，画面更新遇到问题';
    $('hud').classList.add('off');
  }
}
$('thinkBtn').addEventListener('click', async () => { if (WARD_PREVIEW) return; const b = $('thinkBtn'); b.disabled = true; b.dataset.busy = '1'; b.textContent = '在想……'; try { await fetch('/api/think', { method: 'POST' }); } catch {} b.textContent = '让她现在想一下'; delete b.dataset.busy; b.disabled = false; poll(); });
$('toggle').addEventListener('click', () => { document.body.classList.toggle('panel-off'); setTimeout(resize, 260); });
$('focusBtn').addEventListener('click', () => setFollow(!follow)); $('viewBtn').addEventListener('click', resetView);
async function dispatchMapPlace(destination) {
  const response = await fetch('/api/city-dispatch', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ destination }),
  });
  const result = await response.json().catch(() => null);
  if (response.ok) await poll();
  return result?.message || '小屋暂时无法接收指令，请稍后再试。';
}
function setCityOpen(on) {
  if (on === cityOpen) return;
  const mapRoot = $('cityMap');
  if (on) {
    cityMap ??= createCityMap(mapRoot, renderer, {
      openScene: () => { setCityOpen(false); resetView(); }, enterPlace: enterMapPlace, dispatchPlace: dispatchMapPlace,
      low: LOW, reducedMotion,
    });
    cityMap.sync(S, modeFor(S?.now ?? Date.now()));
  }
  cityOpen = on;
  controls.enabled = !on;
  mapRoot.hidden = !on;
  document.body.classList.toggle('city-open', on);
  resize();
  (on ? $('cityClose') : $('cityBtn')).focus({ preventScroll: true });
}
function enterMapPlace(kind, name) {
  setCityOpen(false);
  mapVisit = { kind };
  setWalkMode(false);
  $('cityVisitName').textContent = `正在参观 · ${name}`;
  $('cityVisit').hidden = false;
  document.body.classList.add('city-visiting');
  changeView(fitVisit);
  resize();
  $('visitBack').focus({ preventScroll: true });
}
function leaveMapPlace(toMap) {
  mapVisit = null;
  $('cityVisit').hidden = true;
  document.body.classList.remove('city-visiting');
  resize();
  resetView();
  if (toMap) setCityOpen(true);
  else $('cityBtn').focus({ preventScroll: true });
}
function renderMapVisit() {
  const { kind } = mapVisit;
  const liveOuting = S?.act.leisure;
  const showOffice = kind === 'office', showWard = kind === 'hospital', showHome = kind === 'home';
  const showOuting = !showHome && !showWard && !showOffice;
  const isLive = showHome ? !awayScene && !ward.visible : showWard ? ward.visible : showOffice ? awayScene === office : liveOuting?.area === kind;
  if (isLive) { composer.render(); return; }

  // Preview the existing set while leaving live placement, activity, and polling intact.
  const objects = [office.root, ward, excursion.root, char.root, cat.root, feibi.root, walkMarker];
  const visibility = objects.map(object => object.visible);
  office.root.visible = showOffice;
  ward.visible = showWard;
  excursion.root.visible = showOuting;
  char.root.visible = false;
  if (!showHome) { cat.root.visible = false; feibi.root.visible = false; }
  walkMarker.visible = false;
  if (showOuting) excursion.show({ area: kind, gardenStage: S?.neighborhood?.gardenStage });
  try { composer.render(); }
  finally {
    objects.forEach((object, index) => { object.visible = visibility[index]; });
    if (showOuting && liveOuting) excursion.show(liveOuting);
  }
}
$('cityBtn').hidden = STILL || WARD_PREVIEW;
$('cityBtn').addEventListener('click', () => setCityOpen(true));
$('cityClose').addEventListener('click', () => setCityOpen(false));
$('visitBack').addEventListener('click', () => leaveMapPlace(true));
$('visitWatch').addEventListener('click', () => leaveMapPlace(false));
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (mapVisit) { event.preventDefault(); leaveMapPlace(true); }
  else if (cityOpen) { event.preventDefault(); setCityOpen(false); }
});
$('livingBtn')?.addEventListener('click', () => { if (WARD_PREVIEW) location.assign('/'); else if (!careScene) changeView(fitLiving); });
$('walkBtn').addEventListener('click', () => setWalkMode(!pickingWalk));
$('swimBtn')?.addEventListener('click', () => {
  if (!S || !char.model) return;
  if (!swimming && !poolMotion) { beginSwimming(); renderPanel(); return; }
  const commandSwim = S.act.id === 'swim';
  const route = routeFromHere(commandSwim ? poolEntry : spotOf(S.act), commandSwim || S.act.id === 'go');
  if (!route) { updateWalkHint('暂时走不到泳池台阶'); return; }
  swimming = false;
  activityReached = !commandSwim;
  path = route;
  clearWalkDestination();
  if (commandSwim) walkDestination = { room: '泳池露台' };
  setWalkMode(false);
  renderPanel();
});
$('resumeBtn').addEventListener('click', () => {
  if (!S) return;
  const route = routeFromHere(spotOf(S.act), S.act.id === 'go');
  if (!route) { updateWalkHint('还没有通路，先停在这里'); return; }
  path = route;
  activityReached = true;
  clearWalkDestination();
  setWalkMode(false);
  renderPanel();
});
$('qbtn').textContent = LOW ? '画质：省电' : '画质：高'; $('qbtn').addEventListener('click', () => { try { localStorage.setItem('room3d-q', LOW ? 'high' : 'low'); } catch {} const u = new URL(location.href); u.searchParams.delete('q'); location.href = u; });
const SHARE = !WARD_PREVIEW && Q.has('share'); if (SHARE) document.body.classList.add('share', 'panel-off');
if (mobile || innerWidth < 900) document.body.classList.add('panel-off');

// ---------- 分享截图：把画面和状态卡片画到一张图上，交给插件保存 ----------
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
async function uploadShot() {
  try {
    const src = renderer.domElement, W2 = src.width, H2 = src.height, k = W2 / Wd;
    const c = document.createElement('canvas'); c.width = W2; c.height = H2; const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    const F = '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
    const title = $('houseTitle').textContent;
    g.font = `700 ${28 * k}px ${F}`; g.fillStyle = '#f3e9ff'; g.shadowColor = 'rgba(200,120,255,.8)'; g.shadowBlur = 14 * k; g.fillText(title, 22 * k, 46 * k);
    const tw = g.measureText(title).width; g.font = `500 ${18 * k}px ${F}`; g.fillStyle = '#9fe8ff'; g.fillText(fmt(S.now), 22 * k + tw + 12 * k, 46 * k); g.shadowBlur = 0;
    // 头顶气泡
    const bb = $('bubble'); if (bb.style.display !== 'none') {
      const txt = bb.textContent.trim(); g.font = `500 ${15 * k}px ${F}`; const w = Math.min(g.measureText(txt).width + 26 * k, 360 * k);
      const bx = parseFloat(bb.style.left) * k - w / 2, by = parseFloat(bb.style.top) * k - 44 * k;
      g.fillStyle = 'rgba(255,255,255,.94)'; rr(g, bx, by, w, 36 * k, 14 * k); g.fill(); g.fillStyle = '#262838'; g.fillText(txt, bx + 13 * k, by + 24 * k, w - 26 * k);
    }
    // 状态卡片
    const a = S.act, feel = (S.feel || []).filter((f) => !f.includes('主人')).slice(0, 4), cw = 360 * k, ch = 108 * k, cx = 18 * k, cy = H2 - ch - 18 * k;
    g.fillStyle = 'rgba(16,18,30,.84)'; rr(g, cx, cy, cw, ch, 16 * k); g.fill(); g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = k; g.stroke();
    g.font = `700 ${20 * k}px ${F}`; g.fillStyle = '#e8eaf4'; g.fillText(`${a.emoji} ${a.label}`, cx + 16 * k, cy + 34 * k, cw - 32 * k);
    g.font = `400 ${13 * k}px ${F}`; g.fillStyle = '#9aa0b8'; g.fillText(`${a.room} · ${fmt(S.now)} · 已经 ${Math.round((S.now - a.since) / 60000)} 分钟`, cx + 16 * k, cy + 58 * k);
    let fx = cx + 16 * k; g.font = `400 ${12 * k}px ${F}`;
    for (const f of (feel.length ? feel : ['状态不错'])) { const w = g.measureText(f).width + 16 * k; g.fillStyle = 'rgba(255,255,255,.1)'; rr(g, fx, cy + 72 * k, w, 22 * k, 11 * k); g.fill(); g.fillStyle = '#cfd3e6'; g.fillText(f, fx + 8 * k, cy + 87 * k); fx += w + 6 * k; }
    g.font = `400 ${11 * k}px ${F}`; g.fillStyle = 'rgba(200,205,225,.55)'; const cr = [char.model && characterCredit, feibi.root.visible && FEIBI_CREDIT].filter(Boolean).join(' · '); g.fillText(cr, W2 - g.measureText(cr).width - 14 * k, H2 - 12 * k);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    if (!blob) throw new Error('截图画布未生成 PNG');
    const response = await fetch('/api/shot?' + shotQuery, { method: 'POST', headers: { 'content-type': 'image/png' }, body: blob });
    if (!response.ok) throw new Error('截图上传失败：HTTP ' + response.status);
    window.__uploaded = true;
  } catch (e) { window.__err = String(e); ping('upload', e?.message || e); }
}

// ---------- 循环 ----------
const clock = new THREE.Clock(); let nf = 0, running = true, rafId = 0;
document.addEventListener('visibilitychange', () => { if (STILL) return; running = !document.hidden; if (running) { clock.getDelta(); cancelAnimationFrame(rafId); frame(); } });
function frame() {
  if (!running) return;
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
  if (STILL && window.__ready && !window.__warm) { window.__warm = 1; if (!swimming) path = []; for (let i = 0; i < 90; i++) { stepWalk(1 / 30); syncChar(); char.update(1 / 30); stepFollow(1 / 30); controls.update(); } }
  animateCareScene(dt); stepWalk(dt); updateFriendPlay(dt); syncChar(); stepCat(dt); K.tick(dt, t); char.update(dt); stepFollow(dt); controls.update(); final.uniforms.time.value = t; shafts.tick(t);
  updateFeibi(dt);
  if (cityOpen) cityMap.draw(t);
  else if (mapVisit) renderMapVisit();
  else { composer.render(); placeBubble(); }
  if (STILL) { if (window.__ready && ++nf >= 3) { window.__done = true; if (SHARE) { ping('upload'); uploadShot(); } return; } setTimeout(frame, 30); return; }
  rafId = requestAnimationFrame(frame);
}
(async () => {
  L = await (await fetch('/api/layout')).json();
  ping('model');
  try {
    if (L?.avatar === 'dfy') await char.load();
    showCharacter();
  } catch (e) { console.warn('模型没加载到', e); if (PING) throw new Error('角色模型加载失败：' + (e?.message || e)); }
  if (WARD_PREVIEW) previewWard();
  else { await poll(); if (STILL) await feibiLoading; setInterval(poll, 5000); }
  $('loading').remove(); window.__ready = true; resize(); ping('render');
  if (Q.has('follow')) setFollow(true); // ?follow=1：一打开就看着她
  if (Q.has('navdbg')) window.__nav = { nav, solid, planPath, PLACES, spotOf, scene, THREE, get char() { return char; }, feibi, room, startFriendPlay, updateFriendPlay, syncChar, getFriendPlay: () => friendPlay, camera, getPath: () => path, getPos: () => pos, L, controls, camTick: (dt) => { stepFollow(dt); controls.update(); }, cat, catNav, catSolid, C, planCat, catTarget, stepCat, surfaceY, CAT_AT, stairLandings, step: (dt) => { stepWalk(dt); syncChar(); char.update(dt); }, setPath: (p, from) => { path = p; activityReached = false; if (from) pos = { ...from }; } };
})().catch((e) => { $('loading').textContent = '加载失败：' + (e?.message || e); window.__err = String(e); ping('load', e?.message || e); });
frame();
