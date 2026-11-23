import * as THREE from 'three';
import { concrete, draw, mulberry, rep } from './tex.js';

const DAY = {
  sky: 0xd9e6f1, sun: 0xffe3bd, ambient: 0xdceaff, bounce: 0xa89882,
  land: 0xa5afb2, road: 0x66707a, paving: 0xb5afa7, stone: 0x667582,
  roof: 0x737e89, frame: 0x344455, foliage: 0x537b5f, grass: 0x627f65,
  water: 0x436f83, ripple: 0xa8cbd6,
};
const NIGHT = {
  sky: 0x192342, sun: 0xadbbf4, ambient: 0x9eabf6, bounce: 0x644e68,
  land: 0x505b73, road: 0x465466, paving: 0x7e8092, stone: 0x69788c,
  roof: 0x8591a8, frame: 0x4b5b74, foliage: 0x426e68, grass: 0x52736f,
  water: 0x182c4a, ripple: 0x557a9f,
};

const LANDMARKS = {
  home: { width: 10.4, depth: 8.7, face: 0x74879c, light: 'warm' },
  bakery: { width: 11.6, depth: 8.1, face: 0xa18675, light: 'amber', sign: '面包店' },
  library: { width: 14.5, depth: 9, face: 0x9ba9b0, light: 'sky', sign: '图书室' },
  office: { width: 11.8, depth: 9.8, face: 0x5a7289, light: 'sky', sign: '工作室' },
  shopping: { width: 12.4, depth: 8.3, face: 0x777280, light: 'pink', sign: '街边小店' },
  cafe: { width: 11.5, depth: 7.6, face: 0x86766e, light: 'amber', sign: '咖啡馆' },
  cinema: { width: 14, depth: 9.7, face: 0x585d7e, light: 'pink', sign: '小电影院' },
  gym: { width: 13.8, depth: 8.6, face: 0x617c83, light: 'mint', sign: '健身房' },
  hospital: { width: 13.4, depth: 9.6, face: 0xa7abb0, light: 'sky', sign: '医院' },
};
const LIGHT_COLORS = { warm: 0xffd09d, amber: 0xffb469, sky: 0xa4d5ff, pink: 0xff81c9, mint: 0x74e4d7 };

function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }, night: { value: 0 }, base: { value: new THREE.Color() }, light: { value: new THREE.Color() },
    },
    vertexShader: `varying vec2 vMap;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vMap = world.xz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `uniform float time, night;
      uniform vec3 base, light;
      varying vec2 vMap;
      float ripple(vec2 p) {
        return sin(p.x*.49 + p.y*2.15 + time*1.10) * .55
          + sin(p.x*1.21 - p.y*4.2 - time*.72) * .32
          + sin(p.y*8.4 + sin(p.x*.73 + time*.44)*2.2) * .13;
      }
      void main() {
        vec2 p = vMap;
        float crest = ripple(p + vec2(.42*sin(p.y*.29), .31*sin(p.x*.60+p.y*.18)));
        float lines = smoothstep(.32,.92,crest);
        float shore = exp(-min(abs(p.x-68.1),abs(p.x-102.0))*.38);
        vec3 color = base * (.83 + .20*sin(p.x*.10 - p.y*.018));
        color += light * (lines * .14 + shore*.13);
        float footbridge = exp(-abs(p.y-13.1)*.78) * (.13 + lines*.80);
        float harbor = exp(-abs(p.x-72.)*.21) * pow(.5+.5*cos(p.y*.85+crest*.65), 6.0);
        float opposite = exp(-abs(p.x-98.)*.18) * pow(.5+.5*sin(p.y*.53+crest*.61),4.0);
        color += night * (vec3(.23,.78,1.2)*footbridge*.54 + vec3(1.1,.41,.13)*harbor*(.06+lines*.40)
          + vec3(.58,.25,1.0)*opposite*(.09+lines*.33));
        gl_FragColor = vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function buildCityScenery(places, { low = false } = {}) {
  const scene = new THREE.Scene();
  const random = mulberry(138), range = (lo, hi) => lo + (hi-lo)*random();
  const pick = choices => choices[Math.floor(random()*choices.length)];
  const cube = new THREE.BoxGeometry(), leaf = new THREE.IcosahedronGeometry(1, low ? 0 : 1);
  const ground = concrete({ size: 128, tone: [.87,.87,.87], contrast: .23, seed: 571 });
  const roadTexture = rep(ground, 24, 18);
  const standard = options => new THREE.MeshStandardMaterial(options);
  const mats = {
    land: standard({ color: DAY.land, roughness: .96 }),
    road: standard({ roughnessMap: roadTexture.roughnessMap, normalMap: roadTexture.normalMap,
      color: DAY.road, roughness: .88, normalScale: new THREE.Vector2(.11,.11) }),
    paving: standard({ ...rep(ground, 4, 4), color: DAY.paving, roughness: .84, normalScale: new THREE.Vector2(.2,.2) }),
    stone: standard({ color: DAY.stone, roughness: .78 }),
    roof: standard({ ...rep(ground, 3, 3), color: DAY.roof, roughness: .83, normalScale: new THREE.Vector2(.22,.22) }),
    frame: standard({ color: DAY.frame, roughness: .34, metalness: .45 }),
    foliage: standard({ color: DAY.foliage, roughness: .93 }),
    grass: standard({ color: DAY.grass, roughness: .98 }),
  };
  const paint = standard({ color: 0xbdc5c4, roughness: .78 });
  const wood = standard({ color: 0x76604c, roughness: .8 });
  const pool = standard({ color: 0x4789a8, roughness: .2, emissive: 0x246a9b });
  const glass = standard({ color: 0x2e4c68, metalness: .18, roughness: .31 });
  const metal = standard({ color: 0xa3b3c2, metalness: .45, roughness: .42 });
  const walls = [0x788797, 0xa6a59d, 0x7d8497, 0x999291].map(color => standard({ color, roughness: .74 }));
  const dimGlass = standard({ color: 0x34485f, roughness: .43, metalness: .22 });
  const glows = new Map(Object.entries(LIGHT_COLORS).map(([key, color]) => [key,
    standard({ color: 0x83919d, roughness: .44, emissive: color, emissiveIntensity: 0 }),
  ]));
  const windowGlass = [dimGlass,dimGlass,dimGlass,dimGlass,glows.get('warm'),glows.get('sky'),glows.get('amber')];
  const lamps = new THREE.Group(); scene.add(lamps);
  const haloTexture = draw(96,96,(ctx,w,h) => {
    const halo = ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
    halo.addColorStop(0,'rgba(255,255,255,.9)'); halo.addColorStop(.34,'rgba(255,255,255,.32)'); halo.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=halo; ctx.fillRect(0,0,w,h);
  });
  const haloPlane = new THREE.PlaneGeometry().rotateX(-Math.PI/2);
  const haloMaterials = new Map();
  const batches = new Map();
  function instance(geometry, material, shape, shadows = false, target = scene) {
    let group = batches.get(material);
    if (!group) { group = { geometry, material, shapes: [], shadows, target }; batches.set(material,group); }
    group.shapes.push(shape);
    if (shadows) group.shadows = true;
  }
  function box(x,y,z,w,h,d,material,cast = false) {
    // Cast shadows for every object in a structural material batch.
    instance(cube,material,[x,y+h/2,z,w,h,d],cast);
  }
  function halo(x,z,w,d,color,y=-.263) {
    if (!haloMaterials.has(color)) haloMaterials.set(color, new THREE.MeshBasicMaterial({
      map:haloTexture, color, blending:THREE.AdditiveBlending, transparent:true, opacity:.34, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-1,
    }));
    instance(haloPlane,haloMaterials.get(color),[x,y,z,w,1,d],false,lamps);
  }
  function tree(x,z,scale=1) {
    box(x,.01,z,.20*scale,1.82*scale,.20*scale,wood,true);
    for (const [dx,dy,dz,r] of [[0,1.96,0,1.14],[-.56,1.66,.26,.68],[.48,1.78,-.38,.73],[.12,2.55,.22,.70]]) {
      instance(leaf,mats.foliage,[x+dx*scale,dy*scale,z+dz*scale,r*scale,r*1.08*scale,r*scale,range(0,Math.PI)],true);
    }
  }
  function bench(x,z) {
    box(x,.34,z,1.8,.13,.60,wood,true);
    box(x,.50,z-.24,1.8,.32,.13,wood);
    for (const dx of [-.67,.67]) box(x+dx,.02,z,.13,.33,.31,mats.frame);
  }
  function streetLight(x,z,groundY=0,key='warm') {
    box(x,groundY,z,.105,2.9,.105,mats.frame);
    box(x+.20,groundY+2.83,z,.49,.14,.16,mats.frame);
    box(x+.28,groundY+2.81,z,.24,.05,.14,glows.get(key));
    halo(x+.30,z,5.0,4.35,LIGHT_COLORS[key],groundY+.018);
  }
  function planter(x,z) {
    box(x,.02,z,2.18,.34,.82,mats.stone);
    for (const dx of [-.71,0,.71]) instance(leaf,mats.foliage,[x+dx,.45,z,.43,.33,.39,range(0,Math.PI)],true);
  }

  const signMaterials=[];
  function sign(x,y,z,width,text,key) {
    const color=LIGHT_COLORS[key];
    const map=draw(256,96,(ctx,w,h)=>{
      ctx.fillStyle='#141b2b'; ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='#7c8b9d'; ctx.lineWidth=3; ctx.strokeRect(3,3,w-6,h-6);
      ctx.fillStyle=new THREE.Color(color).getStyle();
      ctx.font='600 49px "Microsoft YaHei", "PingFang SC", sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(text,w/2,h/2+2,w-18);
    });
    const material=standard({ map, emissive:0xffffff, emissiveMap:map, emissiveIntensity:.05, roughness:.68 });
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(width,width*.375),material);
    panel.position.set(x,y,z); scene.add(panel); signMaterials.push(material);
  }

  function facade(x,z,w,d,h,face,{groundFloor=false, accent=null}={}) {
    box(x,0,z,w,h,d,face,true);
    box(x,-.31,z,w+.40,.47,d+.40,mats.stone);
    box(x,h-.08,z,w+.20,.24,d+.20,mats.roof,true);
    const cols=Math.max(3,Math.round(w/2.08)), sides=Math.max(3,Math.round(d/2.15));
    const rowStart=groundFloor ? 3.15 : .88;
    for(let y=rowStart;y<h-1.06;y+=2.15) {
      for(let i=0;i<cols;i++) {
        const xx=x-w/2+(i+.5)*w/cols;
        box(xx,y,z+d/2+.008,w/cols*.72,1.20,.052,pick(windowGlass));
        box(xx,y,z-d/2-.008,w/cols*.72,1.20,.052,pick(windowGlass));
      }
      for(let i=0;i<sides;i++) {
        const zz=z-d/2+(i+.5)*d/sides;
        box(x+w/2+.008,y,zz,.052,1.20,d/sides*.69,pick(windowGlass));
        box(x-w/2-.008,y,zz,.052,1.20,d/sides*.69,pick(windowGlass));
      }
      if(accent) box(x,y-.23,z+d/2+.021,w+.04,.12,.06,mats.frame);
    }
    for(const a of [-1,1]) for(const b of [-1,1]) box(x+a*(w/2-.13),.1,z+b*d/2,.21,h-.2,.13,mats.frame);
  }
  function parapet(x,z,w,d,h) {
    for(const sign of [-1,1]) {
      box(x,h,z+sign*d/2,w,.27,.14,mats.frame);
      box(x+sign*w/2,h,z,.14,.27,d,mats.frame);
    }
  }
  function equipment(x,z,y,wide=1.9) {
    box(x,y,z,wide,.66,1.32,metal,true);
    for(const dx of [-.33,.33]) box(x+dx,y+.65,z,.46,.04,.45,mats.frame);
    box(x,y,z+.67,wide*.7,.38,.04,mats.frame);
  }
  function highrise(x,z,w,d,h,face,{trim=false}={}) {
    const setback = h > 16 && trim;
    const roofY = setback ? h*.77 : h;
    facade(x,z,w,d,roofY,face,{accent:trim});
    parapet(x,z,w,d,roofY+.16);
    const topX=x-w*.19, topZ=z-d*.19;
    if (setback) {
      box(x-.53,roofY+.14,z-.60,w*.72,h-roofY,d*.72,glass,true);
      box(x-.53,h+.14,z-.60,w*.75,.23,d*.74,mats.roof);
      for (let offset=-.28;offset<=.29;offset+=.14) {
        const material = random() < .55 ? glows.get('sky') : dimGlass;
        box(x-.53+w*offset,roofY+.53,z-.60+d*.36,.09,h-roofY-.76,.11,material);
      }
    } else {
      box(topX,h+.12,topZ,w*.29,1.18,d*.30,face,true);
      box(topX,h+1.26,topZ,w*.31,.14,d*.32,mats.roof);
      equipment(x+w*.26,z+d*.22,h+.18);
    }
    if(trim) {
      box(x+w*.20,h+.12,z-d*.27,.11,2.3,.11,metal);
      box(x+w*.20,h+2.42,z-d*.27,.18,.17,.18,glows.get('pink'));
      box(x,roofY-.26,z+d/2+.048,w*.94,.083,.08,glows.get('sky'));
    }
  }
  function storefront(x,z,w,d,h,key,name,face,id) {
    const front=z+d/2, lit=glows.get(key);
    const wide=w*.77;
    box(x,.32,front+.052,wide,2.14,.108,lit);
    box(x,.30,front+.124,.88,2.1,.10,glass);
    for(const dx of [-.36,-.22,-.06,.06,.22,.36]) box(x+w*dx,.34,front+.14,.082,2.22,.083,mats.frame);
    box(x,1.32,front+.15,wide,.074,.10,mats.frame);
    box(x,2.52,front+.37,w*.94,.21,1.12,mats.frame,true);
    box(x,2.48,front+.94,w*.86,.075,.06,lit);
    sign(x,Math.min(h-.56,3.43),front+.115,id==='cinema'?4.5:3.15,name,key);
    halo(x,front+1.26,w*.94,4.4,LIGHT_COLORS[key],.017);
    halo(x,front+6.65,w*.85,8.4,LIGHT_COLORS[key]);
    if(id==='bakery'||id==='cafe') {
      for(let i=-3;i<=3;i++) box(x+i*w*.112,2.78,front+.48,w*.112,.13,1.45,i%2?face:metal);
      if(id==='cafe') { bench(x-2.35,front+3.5); bench(x+2.35,front+3.5); }
    }
  }

  // Main streets, tile seams, pedestrian crossings and both river banks.
  box(-105,-2.80,0,342,2.49,560,mats.land);
  box(190,-2.80,0,172,2.49,560,mats.land);
  box(0,-.78,0,130,.50,94,mats.road);
  for(const z of [-44,-14.5,14.5,44]) box(-121,-.79,z,112,.49,6.8,mats.road);
  for(const x of [-64,-32,0,32.5,62]) box(x,-.80,-97,6.1,.49,100,mats.road);
  for(const z of [-69,-97,67,95]) box(0,-.81,z,132,.49,6.6,mats.road);
  box(122,-.8,0,39,.50,220,mats.road);
  for(const z of [-29,0,29]) for(const x of [-47,-17,17,48]) {
    box(x,-.35,z,23.8,.33,21,mats.stone);
    box(x,-.15,z,23.4,.15,20.62,mats.paving);
    for(const dx of [-8,-4,0,4,8]) box(x+dx,.003,z,.047,.009,20.4,mats.stone);
    for(const dz of [-8,-4,0,4,8]) box(x,.004,z+dz,23.2,.009,.043,mats.stone);
  }
  for(const z of [-14.5,14.5]) {
    for(let x=-60;x<=62;x+=4.5) {
      if([-32,0,32.5].some(c=>Math.abs(x-c)<5.2)) continue;
      box(x,-.277,z,1.83,.023,.095,paint);
    }
    for(const x of [-32,0,32.5]) for(const i of [-2,-1,0,1,2]) {
      box(x+4.5,-.277,z+i*.58,1.47,.024,.26,paint);
      box(x+i*.58,-.277,z-4.03,.26,.024,1.47,paint);
    }
  }
  for(const x of [-32,0,32.5]) for(let z=-41;z<=42;z+=4.3) {
    if(Math.abs(Math.abs(z)-14.5)>5) box(x,-.277,z,.095,.024,1.72,paint);
  }
  const water=waterMaterial();
  const river=new THREE.Mesh(new THREE.PlaneGeometry(35.8,550),water);
  river.rotation.x=-Math.PI/2; river.position.set(85,-1.50,0); scene.add(river);
  for(const x of [66.45,103.65]) {
    box(x,-2,0,2.55,1.7,545,mats.stone);
    box(x,-.38,0,2.2,.18,545,mats.paving);
    box(x,-.1,0,.072,.51,540,mats.frame);
    for(let z=-77;z<=77;z+=4) box(x,-.2,z,.15,.68,.13,metal);
    for(let z=-60;z<=65;z+=11) streetLight(x-.31,z,-.20,'amber');
  }
  for(const x of [70,100]) box(x,-2.2,14.5,1.10,2,6.14,mats.stone,true);
  box(85,-.49,14.5,42,.25,6.7,mats.stone);
  box(85,-.235,14.5,42,.09,4.7,mats.road);
  for(const side of [-1,1]) {
    const z=14.5+side*3.19;
    box(85,-.12,z,42,.27,.14,mats.frame);
    box(85,.22,z,41,.07,.082,glows.get('sky'));
    for(let x=66;x<=104;x+=2.45) box(x,-.13,z,.13,.47,.12,metal);
    const archY = x => .27 + 4.16*(1-((x-85)/18)**2);
    const points = Array.from({length:13},(_,i)=>{
      const x=67+i*3;
      return new THREE.Vector3(x,archY(x),z);
    });
    const shape=new THREE.CatmullRomCurve3(points);
    const arch=new THREE.Mesh(new THREE.TubeGeometry(shape,24,.12,7,false),metal);
    arch.castShadow=true; arch.receiveShadow=true; scene.add(arch);
    for(let x=70;x<=100;x+=3) box(x,.26,z,.068,archY(x)-.26,.068,mats.frame);
  }

  for(const [id,{x,z,h}] of Object.entries(places)) {
    if(id==='park'||id==='garden') {
      box(x,.014,z,22.15,.10,18.8,mats.grass);
      box(x,.116,z,19.5,.055,2.05,mats.paving);
      box(x+3,.117,z,2.05,.055,16.9,mats.paving);
      for(const dx of [-8.7,-4.3,6.6,9.0]) for(const dz of [-6.7,7.1]) tree(x+dx,z+dz,range(.6,1.07));
      for(const dx of [-7.7,7.7]) { bench(x+dx,z+2.05); streetLight(x+dx,z-1.76,.14); }
      if(id==='park') {
        box(x-4.35,.126,z-3.85,6.25,.32,3.8,mats.stone);
        box(x-4.35,.446,z-3.85,5.92,.028,3.46,pool);
      } else for(const dx of [-6.65,-2.82,7.35]) for(const dz of [-3.88,3.58]) {
        box(x+dx,.15,z+dz,2.85,.31,1.24,wood);
        for(const bud of [-.81,0,.81]) box(x+dx+bud,.46,z+dz,.35,.23,.38,mats.foliage);
      }
      continue;
    }
    const {width:w,depth:d,face:color,light,sign:name}=LANDMARKS[id];
    const face=standard({color,roughness:.71});
    const centerZ=z-2;
    if(id==='home') {
      highrise(x,centerZ,w,d,h-.14,face,{trim:true});
      box(x+1.9,h+.035,centerZ+.67,4.51,.16,3.34,mats.paving);
      box(x+2.16,h+.20,centerZ+.71,3.56,.11,2.51,pool);
      box(x-2.42,h+.15,centerZ-.89,3.1,2.05,2.79,glass,true);
      box(x-2.42,h+2.20,centerZ-.89,3.28,.14,2.97,mats.frame);
      box(x-2.1,h+.70,centerZ+.525,.76,1.12,.072,glows.get('warm'));
    } else if(id==='office') {
      facade(x,centerZ,w,d,h,face,{groundFloor:true,accent:true});
      for(const dx of [-.44,-.25,0,.25,.44]) box(x+w*dx,2.87,centerZ+d/2+.11,.12,h-3,.13,metal);
      box(x-.35,h+.04,centerZ-.35,w*.66,1.27,d*.65,glass,true);
      box(x-.35,h+1.35,centerZ-.35,w*.70,.12,d*.70,mats.roof);
      storefront(x,centerZ,w,d,h,light,name,face,id);
    } else {
      facade(x,centerZ,w,d,h,face,{groundFloor:true,accent:id==='library'||id==='hospital'});
      parapet(x,centerZ,w,d,h+.14);
      equipment(x+w*.28,centerZ-d*.28,h+.15,id==='hospital'?2.4:1.55);
      storefront(x,centerZ,w,d,h,light,name,face,id);
      if(id==='hospital') {
        const cross=glows.get('pink');
        box(x+3.49,h-2.5,centerZ+d/2+.141,.20,1.37,.11,cross);
        box(x+3.49,h-1.91,centerZ+d/2+.141,1.37,.20,.11,cross);
      } else if(id==='cinema') {
        box(x,h-.34,centerZ+d/2+.083,w*.89,.11,.18,glows.get('pink'));
        box(x-6.16,h-4.1,centerZ+d/2+.10,.30,3.70,.23,glows.get('sky'));
      } else if(id==='library') {
        for(const dx of [-4.8,-3.2,-1.6,0,1.6,3.2,4.8]) box(x+dx,3.08,centerZ+d/2+.16,.11,2.28,.24,metal);
      }
    }
    for(const dx of [-9.45,9.45]) {
      tree(x+dx,z+5.95,range(.59,.87));
      streetLight(x+dx,z-7.7);
      if(id!=='home') planter(x+dx,z+2.90);
    }
  }

  // Keep the near streets low. Taller glass blocks frame the north and far bank.
  for(const x of [-103,-85,-69,-48,-27,-7,13,34,54]) for(const z of [-54,-80,-107]) {
    const h=range(z===-54?7:11,z===-54?21:42);
    highrise(x+range(-2,2),z+range(-2,2),range(7,13),range(8,14),h,pick(walls),{trim:random()<.35});
  }
  for(const x of [-92,-75,112,130,150]) for(const z of [-33,-10,12,35,58]) {
    const max=x>=130?32:16;
    highrise(x,z,range(7,12),range(8,13),range(5,max),pick(walls),{trim:random()<.30});
  }
  for(const x of [-53,-33,-12,10,30,51]) for(const z of [55,78]) {
    box(x,-.305,z,range(12,16),.30,range(12,16),mats.paving);
    highrise(x,z,range(7,10),range(6,11),range(3.0,8.5),pick(walls));
    tree(x-5.8,z+4.6,.73);
  }
  for(let z=-48;z<=48;z+=6.7) tree(62,z,range(.57,.81));

  box(48,.014,0,6.81,.37,5.60,mats.stone);
  box(48,.384,0,6.16,.038,4.98,pool);
  box(48,.386,0,.54,.58,.54,metal);
  for(const x of [40,56]) {
    bench(x,2.25); streetLight(x,-.53);
    for(const z of [-6.50,6.50]) tree(x,z,.81);
  }

  const transform=new THREE.Object3D();
  function matrix(mesh,index,x,y,z,w,h,d,yaw=0) {
    transform.position.set(x,y,z); transform.scale.set(w,h,d); transform.rotation.y=yaw;
    transform.updateMatrix(); mesh.setMatrixAt(index,transform.matrix);
  }
  for(const {geometry,material,shapes,shadows,target} of batches.values()) {
    const mesh=new THREE.InstancedMesh(geometry,material,shapes.length);
    shapes.forEach((shape,index)=>matrix(mesh,index,...shape));
    mesh.castShadow=shadows; mesh.receiveShadow=target!==lamps; target.add(mesh);
  }
  const traffic=[[-14.5,-1,-55,4.6],[-14.5,1,12,4.2],[14.5,1,-45,6.0],[14.5,-1,34,5.5],[14.5,1,9,5.36]];
  const autoBody=new THREE.InstancedMesh(cube,standard({color:0x8797ad,roughness:.32,metalness:.47}),traffic.length);
  const autoGlass=new THREE.InstancedMesh(cube,glass,traffic.length);
  const autoLights=new THREE.InstancedMesh(cube,glows.get('warm'),traffic.length);
  const autoTails=new THREE.InstancedMesh(cube,glows.get('pink'),traffic.length);
  const autos=[autoBody,autoGlass,autoLights,autoTails];
  for(const mesh of autos) { mesh.frustumCulled=false; scene.add(mesh); }

  const raindrops = new Float32Array((low ? 240 : 525)*6);
  const heights = new Float32Array(raindrops.length/3);
  for(let i=0; i<raindrops.length; i+=6) {
    const x=range(-78,107), y=range(1,38), z=range(-70,75);
    raindrops.set([x,y,z, x+.09,y-range(.52,1.03),z+.076],i);
    heights.set([y,y],i/3);
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position',new THREE.BufferAttribute(raindrops,3));
  rainGeometry.setAttribute('dropY',new THREE.BufferAttribute(heights,1));
  const rainMaterial = new THREE.ShaderMaterial({
    uniforms:{ time:{value:0} }, transparent:true, depthWrite:false,
    vertexShader:`uniform float time; attribute float dropY;
      void main(){
        vec3 p = position;
        p.y += mod(dropY - time * 9.0, 38.0) - dropY;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader:`void main(){gl_FragColor=vec4(.28,.47,.68,.16);
      #include <colorspace_fragment>
    }`,
  });
  const rain = new THREE.LineSegments(rainGeometry,rainMaterial);
  rain.frustumCulled=false; scene.add(rain);

  const sky=new THREE.HemisphereLight();
  const sun=new THREE.DirectionalLight();
  sun.position.set(-43,85,43); sun.target.position.set(0,0,8); scene.add(sky,sun,sun.target);
  sun.castShadow=true;
  sun.shadow.mapSize.setScalar(low?1024:2048);
  Object.assign(sun.shadow.camera,{left:-73,right:73,top:62,bottom:-62,near:10,far:205});
  sun.shadow.bias=-.00025; sun.shadow.normalBias=.065; sun.shadow.radius=2;
  sun.shadow.autoUpdate=false;
  let showRain = false;
  function setMode(mode) {
    const night=mode==='night', palette=night?NIGHT:DAY;
    scene.background=new THREE.Color(palette.sky);
    scene.fog=new THREE.Fog(palette.sky,154,326);
    for(const [name,mat] of Object.entries(mats)) mat.color.setHex(palette[name]);
    mats.road.roughness=night?.59:.86;
    sky.color.setHex(palette.ambient); sky.groundColor.setHex(palette.bounce);
    sky.intensity=night?1.27:2.0;
    sun.color.setHex(palette.sun); sun.intensity=night?.67:2.85; sun.shadow.needsUpdate=true;
    for(const [name,glow] of glows) {
      glow.color.setHex(night?LIGHT_COLORS[name]:0x83919d);
      glow.emissiveIntensity=night?(name==='pink'?1.48:1.03):.045;
    }
    for(const material of signMaterials) material.emissiveIntensity=night?1.4:.10;
    pool.emissiveIntensity=night?.7:0;
    lamps.visible=night;
    showRain = night;
    water.uniforms.base.value.setHex(palette.water);
    water.uniforms.light.value.setHex(palette.ripple);
    water.uniforms.night.value=Number(night);
  }
  function update(t, moving) {
    const time=moving?t:0;
    water.uniforms.time.value=time;
    rain.visible = showRain && moving;
    rainMaterial.uniforms.time.value=time;
    traffic.forEach(([lane,direction,offset,speed],i)=>{
      const x=((offset+62+time*speed*direction)%124+124)%124-62;
      const z=lane+direction*.94;
      matrix(autoBody,i,x,-.12,z,1.14,.23,.54);
      matrix(autoGlass,i,x-direction*.09,.067,z,.61,.17,.45);
      matrix(autoLights,i,x+direction*.56,-.087,z,.06,.10,.43);
      matrix(autoTails,i,x-direction*.56,-.091,z,.059,.072,.38);
    });
    for(const mesh of autos) mesh.instanceMatrix.needsUpdate=true;
  }
  return {scene,setMode,update};
}
