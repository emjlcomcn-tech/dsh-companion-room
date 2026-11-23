import * as THREE from 'three';
import * as TX from './tex.js';
import { addVenueLighting, buildVenueShell, venueLamp } from './place-finish.js';

export const OFFICE_Y = 23;
const POSITIONS = {
  desk: [-1.5, .48, .68, 'type'],
  meeting: [1.55, .48, -.15, 'read'],
  interview: [1.55, .48, -.15, 'read'],
  lunch: [1.55, .48, -.15, 'eat'],
  break: [-1.5, .48, .68, 'phone'],
  nap: [1.35, .36, 1.82, 'sit'],
  commute: [-1.9, 0, 1.85, 'phone'],
  washroom: [-1.9, 0, 1.85, 'stand'],
  office: [1.35, .36, 1.82, 'sit'],
};

export function buildOffice(K, M) {
  const root = K.group(0, OFFICE_Y, 0);
  root.name = 'work studio';
  root.visible = false;
  root.userData.noNav = true;
  const { oak, paper, steel: dark, rubber: metal } = M;
  const linen = M.cloth(0x577781), mugMat = M.ceramic;
  let screen, bowl, updateCutaway;
  K.in(root, () => {
    const shell = buildVenueShell(K, M, { width: 6.8, depth: 5, back: -2.1 });
    const { rear } = shell;
    updateCutaway = shell.updateCutaway;
    const rug = M.cloth(0x7b8580);
    K.box(-2.70, .008, -.87, 2.48, .022, 2.22, rug, { r: .01 });
    K.box(.60, .008, -1.49, 2.53, .022, 1.99, rug, { r: .01 });
    K.box(-2.45, .68, -.63, 1.95, .065, .92, oak, { r: .018 });
    for (const x of [-2.37, -.66]) K.box(x, 0, -.53, .05, .68, .72, dark);
    K.box(-1.91, .746, -.51, .86, .43, .035, metal, { r: .012 });
    screen = K.box(-1.88, .769, -.47, .8, .38, .004, new THREE.MeshBasicMaterial({ color: 0xe7f1f1, map: TX.codeScreen(42, 194) }), { cast: false });
    K.box(-1.53, .746, -.42, .08, .17, .05, dark);
    K.box(-1.98, .747, .02, .76, .013, .22, paper, { r: .004 });
    for (let row = 0; row < 3; row++) for (let col = 0; col < 11; col++) {
      K.box(-1.95 + col * .065, .761, .043 + row * .061, .047, .007, .041, dark);
    }
    K.box(-.78, .756, -.25, .15, .045, .065, M.char, { r: .019 });
    K.box(-2.43, 0, -1.00, 1.80, .66, .35, M.walnut, { r: .022 });
    K.box(-2.48, .66, -1.02, 1.90, .060, .41, M.counter, { r: .015 });
    for (let i = 0; i < 4; i++) K.box(-2.36 + i * .385, .32, -.647, .17, .024, .022, M.brass, { r: .004 });
    const chair = (x, z) => {
      K.cyl(x, .04, z, .036, .038, .35, dark);
      K.box(x - .30, .385, z - .27, .6, .10, .54, linen, { r: .04 });
      K.box(x - .30, .48, z + .25, .6, .44, .08, linen, { r: .04 });
      K.box(x - .26, .02, z - .22, .52, .04, .44, metal, { r: .014 });
    };
    chair(-1.5, .68); chair(1.55, -.15); chair(2.38, -.15);
    K.box(.82, .68, -1.37, 2.12, .065, .82, oak, { r: .025 });
    for (const x of [1.0, 2.7]) K.box(x, 0, -1.24, .06, .68, .55, dark);
    K.box(1.2, .749, -1.1, .35, .009, .26, paper);
    K.box(1.75, .749, -1.12, .25, .013, .31, paper);
    bowl = K.group(1.65, .75, -.77);
    K.in(bowl, () => {
      K.cyl(0, 0, 0, .105, .075, .07, paper);
      K.sph(0, .055, 0, .087, M.standard(0xf2dbb0), { scale: [1, .28, 1] });
    });
    for (const [x, z] of [[-2.17, -.14], [2.33, -.8]]) K.cyl(x, .748, z, .042, .036, .09, mugMat);
    K.box(.65, .05, 1.58, 1.9, .17, .92, dark, { r: .035 });
    K.cushion(.65, .22, 1.58, 1.9, .15, .92, linen, { puff: .2 });
    K.box(.65, .22, 2.4, 1.9, .52, .12, linen, { r: .04 });
    K.box(.65, .23, 1.58, .12, .35, .9, linen, { r: .04 });
    K.box(2.43, .23, 1.58, .12, .35, .9, linen, { r: .04 });
    K.cushion(.84, .39, 2.16, .31, .25, .20, M.sheet, { puff: .22 });
    K.cushion(1.98, .39, 2.17, .31, .25, .20, M.mustard, { puff: .22 });
    K.box(.66, 1.19, -1.949, 2.45, 1.04, .047, M.walnut, { r: .015, parent: rear });
    const planning = TX.draw(512, 240, (g, w, h) => {
      g.fillStyle = '#deddd5'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#a6ada9'; g.lineWidth = 1;
      for (let i = 0; i < 7; i++) g.strokeRect(24 + i * 55, 51, 51, 155);
      for (let i = 0; i < 6; i++) g.strokeRect(24, 51 + i * 25, 381, 25);
      for (const [x, y, c] of [[39, 78, '#bd8e68'], [139, 105, '#759490'], [219, 133, '#a37f7e'], [419, 68, '#c2a76b'], [434, 136, '#7d9b9a']]) {
        g.fillStyle = c; g.fillRect(x, y, 38, 22);
      }
    });
    K.mesh(new THREE.PlaneGeometry(2.38, .97), new THREE.MeshStandardMaterial({ map: planning, roughness: .72 }), 1.885, 1.71, -1.898, { cast: false, parent: rear });
    K.box(-2.80, 1.34, -1.981, 2.15, .056, .28, oak, { r: .009, parent: rear });
    for (let i = 0; i < 7; i++) {
      K.box(-2.65 + .14 * i, 1.397, -1.90, .107, .19 + .043 * (i % 3), .161,
        [M.sheet, linen, M.mustard][i % 3], { r: .006, parent: rear });
    }
    K.plant(-2.87, 0, 1.88, { pot: .23, potH: .34, n: 8, h: .85, leaf: [.34, .18], potMat: M.pot, leafMats: M.leaf, stemMat: M.stem, spread: .31, seed: 312 });
    venueLamp(K, M, -1.50, 2.09, -.05, { radius: .21, intensity: 5.4, anchor: -1.96, mount: rear });
    venueLamp(K, M, 1.90, 2.09, -.88, { radius: .25, intensity: 6.7, anchor: -1.96, mount: rear });
    addVenueLighting(K, root);
  });
  return {
    root, updateCutaway, azimuth: 31,
    placement(activity) {
      const [x, seat, z, pose] = POSITIONS[activity.area] || POSITIONS.desk;
      bowl.visible = activity.area === 'lunch';
      screen.material.color.set(activity.area === 'break' ? 0x91adc2 : 0xe7f1f1);
      return { position: new THREE.Vector3(x, OFFICE_Y, z), seat, pose: activity.pose || pose, yaw: Math.PI / 2 };
    },
    target: [0, OFFICE_Y + 1, .35],
  };
}
