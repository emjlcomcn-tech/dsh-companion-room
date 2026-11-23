import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildCityScenery } from './city-scenery.js';

const places = {
  home:     { name: '大肥鱼的小屋', icon: '⌂', x: -17, z: 29, h: 16 },
  bakery:   { name: '面包店', icon: '🥐', x: -47, z: 0, h: 4.5, note: '阿棠守着柜台，大肥鱼会来挑面包、聊两句。' },
  garden:   { name: '社区花园', icon: '🌼', x: 17, z: 0, h: 2, note: '小满常来照料花圃，大肥鱼的金盏菊也种在这里。' },
  library:  { name: '图书室', icon: '📚', x: 17, z: -29, h: 6, note: '若宁在这里。窗边可以看书，也能把书借回家。' },
  office:   { name: '工作室', icon: '💼', x: -17, z: -29, h: 10, note: '大肥鱼来这里面试，入职后也会在这儿上班。' },
  park:     { name: '公园步道', icon: '🌳', x: 48, z: 29, h: 2, note: '沿河散散步，走累了就在长椅坐一会儿。' },
  shopping: { name: '街边小店', icon: '🛍️', x: -47, z: 29, h: 5.5, note: '有文具、贴纸和各式各样的小东西。' },
  cafe:     { name: '街角咖啡馆', icon: '☕', x: 17, z: 29, h: 4, note: '找个窗边位置，喝点东西、看几页书。' },
  cinema:   { name: '小电影院', icon: '🎬', x: -17, z: 0, h: 7, note: '适合休息日挑一场电影慢慢看。' },
  gym:      { name: '健身房', icon: '🏃', x: 48, z: -29, h: 6, note: '可以做轻量拉伸，也可以在跑步机上走一会儿。' },
  hospital: { name: '医院', icon: '✚', x: -47, z: -29, h: 9, note: '大肥鱼住院休养时，可以从这里找到她。' },
};

function locate(state) {
  const act = state?.act, leisure = act?.leisure;
  const destination = leisure?.kind || state?.leisure?.plan?.kind || leisure?.area;
  if (leisure && places[destination]) {
    if (act.id === 'outing_travel' || act.id === 'outing_return') {
      return { key: destination, trip: act.id === 'outing_return' ? 'return' : 'out' };
    }
    return { key: destination };
  }
  if (act?.career && act.career.area !== 'home') {
    const trip = act.id !== 'work_commute' ? null : act.label?.startsWith('下班回家') ? 'return' : 'out';
    return { key: 'office', trip };
  }
  return { key: act?.id === 'hospital' ? 'hospital' : 'home' };
}

// A simplified route through the map's streets, used only to display the current outing.
function routeBetween(from, to) {
  const row = (place) => place.z < 0 ? -14.5 : 14.5;
  const streetDoor = (place) => [place.x, place.z > 0 ? place.z - 7 : place.z + 6];
  const start = row(from), end = row(to);
  const route = [streetDoor(from), [from.x, start]];
  if (start !== end) route.push([0, start], [0, end]);
  route.push([to.x, end], streetDoor(to));
  return route;
}

export function createCityMap(root, renderer, { openScene, enterPlace, dispatchPlace, low, reducedMotion }) {
  const { scene, setMode, update } = buildCityScenery(places, { low });
  const camera = new THREE.OrthographicCamera(-75, 75, 48, -48, .1, 480);
  const composer = low ? null : new EffectComposer(renderer);
  if (composer) {
    composer.setPixelRatio(Math.min(renderer.getPixelRatio(), 1.5));
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), .31, .43, .91));
    composer.addPass(new OutputPass());
  }
  const surface = root.querySelector('.citySurface');
  const labels = root.querySelector('.cityLabels');
  const live = root.querySelector('.cityLive');
  const status = root.querySelector('.cityStatus');
  const agendaLine = root.querySelector('.cityAgenda');
  const showScene = root.querySelector('#cityViewScene');
  const enter = root.querySelector('#cityEnter');
  const dispatch = root.querySelector('#cityDispatch');
  const feedback = root.querySelector('#cityDispatchFeedback');
  const controls = new MapControls(camera, surface);
  controls.enableDamping = true;
  controls.minZoom = .8;
  controls.maxZoom = 2.75;
  controls.minPolarAngle = .08;
  controls.maxPolarAngle = .84;
  const reset = () => {
    controls.target.set(4, 0, 1);
    camera.position.set(48, 122, 99);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.update();
  };
  reset();

  let state = null, stateTime = 0, current = locate(null), selected = null, route = [], lengths = [], totalLength = 0, tone;
  let busy = false, report = null;
  const buttons = new Map();
  const residentName = () => state?.displayName || '大肥鱼';
  const placeName = (key) => key === 'home' ? `${residentName()}的小屋` : places[key].name;
  for (const [key, place] of Object.entries(places)) {
    const button = document.createElement('button');
    const name = document.createElement('span');
    const icon = document.createElement('span');
    button.type = 'button';
    button.className = 'cityPin';
    button.setAttribute('aria-label', place.name);
    button.title = place.name;
    icon.textContent = place.icon;
    icon.setAttribute('aria-hidden', 'true');
    name.textContent = place.name;
    name.className = 'cityPinName';
    button.append(icon, name);
    button.addEventListener('click', () => { if (selected !== key) report = null; selected = key; updateDetails(); });
    labels.append(button);
    buttons.set(key, button);
  }
  root.querySelector('#cityReset').addEventListener('click', reset);
  showScene.addEventListener('click', openScene);
  enter.addEventListener('click', () => {
    const key = selected || current.key;
    enterPlace(key, placeName(key));
  });
  dispatch.addEventListener('click', async () => {
    if (busy) return;
    const key = selected || current.key;
    busy = true;
    report = { key, message: '正在安排……' };
    updateDetails();
    try { report = { key, message: await dispatchPlace(key) }; }
    catch { report = { key, message: '暂时连不上小屋，请稍后再试。' }; }
    finally { busy = false; updateDetails(); }
  });

  function updateDetails() {
    const key = selected || current.key;
    const place = places[key];
    const agenda = state?.leisure?.agenda;
    root.querySelector('.cityPlace').textContent = placeName(key);
    const name = residentName();
    const residents = [name, state?.feibi?.name, state?.cat?.name].filter(Boolean);
    root.querySelector('.cityNote').textContent = key === 'home' ? `${residents.join('、')}住在这里。` : place.note.replaceAll('大肥鱼', name);
    const home = buttons.get('home');
    home.title = placeName('home'); home.setAttribute('aria-label', home.title);
    home.lastElementChild.textContent = home.title;
    live.textContent = `🐋 ${name}`;
    showScene.textContent = `看${name}`;
    showScene.hidden = key !== current.key;
    dispatch.hidden = !state?.cityDestinations?.includes(key);
    const arriving = current.trip === 'return' ? key === 'home' : key === current.key;
    const queued = key === agenda?.kind && agenda.pending && state?.leisure?.plan?.by === 'owner';
    dispatch.disabled = busy || !state?.on || arriving || queued;
    dispatch.textContent = key === 'home' ? `让${name}回小屋` : `派${name}去这里`;
    const message = report?.key === key ? report.message : queued ? '已经安排，等她准备好就会出发。' : '';
    if (feedback.textContent !== message) feedback.textContent = message;
    feedback.hidden = !message;
    for (const [id, button] of buttons) {
      button.setAttribute('aria-pressed', String(key === id));
      button.classList.toggle('current', !current.trip && current.key === id);
      button.classList.toggle('planned', !!agenda?.pending && agenda.kind === id);
    }
    const action = state?.act?.label;
    const location = current.trip === 'return' ? '回小屋的路上' : current.trip ? `去${placeName(current.key)}的路上` : placeName(current.key);
    const text = action ? `${location} · ${action}` : `正在读取${name}的位置…`;
    if (status.textContent !== text) status.textContent = text;
    if (agendaLine) {
      agendaLine.hidden = !agenda?.pending;
      agendaLine.textContent = agenda?.pending ? `今天打算 · ${agenda.text}` : '';
    }
    root.querySelector('.cityDetail').hidden = false;
    live.hidden = !current.trip;
  }

  let w = 0, h = 0;
  const point = new THREE.Vector3();
  function project(element, x, y, z) {
    point.set(x, y, z).project(camera);
    const visible = Math.abs(point.x) < .98 && Math.abs(point.y) < .95;
    element.style.visibility = visible ? '' : 'hidden';
    if (visible) {
      element.style.left = `${(point.x + 1) * w / 2}px`;
      element.style.top = `${(1 - point.y) * h / 2}px`;
    }
  }

  return {
    resize(width, height) {
      w = width; h = height;
      const halfHeight = Math.max(54, 81 * height / width);
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.right = halfHeight * width / height;
      camera.left = -camera.right;
      camera.updateProjectionMatrix();
      composer?.setSize(width, height);
    },
    sync(next, mode) {
      state = next;
      stateTime = performance.now();
      current = locate(state);
      if (current.trip) {
        route = current.trip === 'return' ? routeBetween(places[current.key], places.home)
          : routeBetween(places[state.act.leisure?.from] || places.home, places[current.key]);
        lengths = route.slice(1).map(([x, z], i) => Math.hypot(x - route[i][0], z - route[i][1]));
        totalLength = lengths.reduce((sum, length) => sum + length, 0);
      }
      if (mode !== tone) { setMode(mode); root.dataset.tone = mode; tone = mode; }
      updateDetails();
    },
    draw(time) {
      update(time, !reducedMotion.matches);
      controls.update();
      camera.updateMatrixWorld();
      for (const [key, { x, z, h: roof }] of Object.entries(places)) project(buttons.get(key), x, roof + 1.1, z - 1);
      if (current.trip) {
        const { since, until } = state.act;
        const fraction = THREE.MathUtils.clamp((state.now + performance.now() - stateTime - since) / Math.max(1, until - since), 0, 1);
        let distance = totalLength * fraction;
        let i = 0;
        while (i < lengths.length - 1 && distance > lengths[i]) distance -= lengths[i++];
        const along = lengths[i] ? distance / lengths[i] : 0;
        project(live, THREE.MathUtils.lerp(route[i][0], route[i + 1][0], along), 1.9, THREE.MathUtils.lerp(route[i][1], route[i + 1][1], along));
      }
      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
  };
}
