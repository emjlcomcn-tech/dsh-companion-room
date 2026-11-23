// 白天从窗户斜射进来的光柱 + 光里飘的浮尘（只是加法混合的半透明棱柱，不做真体积光，便宜）
import * as THREE from 'three';

// wins: [{ corners: [Vector3 x4，窗洞四角，按顺序], stopY: 光柱落到哪个高度（地板 0 / 夹层 2.6）}]
export function buildShafts(scene, wins, sunDir, bounds) {
  const g = new THREE.Group(); g.visible = false; scene.add(g);
  const tag = (o) => { o.userData.noAO = true; o.userData.noNav = true; }; // 光柱不是障碍
  const d = sunDir.clone().normalize();
  const ray = new THREE.Ray(new THREE.Vector3(), d);
  const exit = new THREE.Vector3();
  const maxTravel = (p, stopY) => {
    const floor = (p.y - stopY) / -d.y;
    const outside = bounds && ray.set(p, d).intersectBox(bounds, exit);
    return Math.max(0, outside ? Math.min(floor, p.distanceTo(exit)) : floor);
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1.0, .86, .62) }, uI: { value: .13 } },
    vertexShader: `attribute float aV; varying float vV; varying vec3 vN, vW; varying vec3 vVw;
      void main(){ vV=aV; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); vVw=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI; varying float vV; varying vec3 vN, vW, vVw;
      void main(){ float edge=pow(abs(dot(normalize(vN),vVw)),2.6);
        float fade=smoothstep(0.,.08,vV)*pow(clamp(1.-vV,0.,1.),1.3); // clamp：插值后 vV 可能略大于 1，pow(负数) 会出 NaN
        gl_FragColor=vec4(uColor*uI*edge*fade,1.); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const pts = [];
  for (const w of wins) {
    const a = w.corners, far = a.map((p) => p.clone().addScaledVector(d, maxTravel(p, w.stopY || 0)));
    const pos = [], v = [], idx = [];
    // 四个侧面：近端 v=0，远端 v=1
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, b = pos.length / 3;
      pos.push(...a[i].toArray(), ...a[j].toArray(), ...far[j].toArray(), ...far[i].toArray()); v.push(0, 0, 1, 1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('aV', new THREE.Float32BufferAttribute(v, 1)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); tag(m); m.renderOrder = 6; m.frustumCulled = false; g.add(m);
    // 浮尘：在光柱里随机撒点
    const n = Math.round(22 * a[0].distanceTo(a[2]));
    for (let k = 0; k < n; k++) {
      const s = Math.random(), t = Math.random(), L = Math.random() * .85;
      const p0 = a[0].clone().lerp(a[1], s), p1 = a[3].clone().lerp(a[2], s), p = p0.lerp(p1, t);
      pts.push(p.addScaledVector(d, maxTravel(p, w.stopY || 0) * L));
    }
  }
  const base = new Float32Array(pts.length * 3); pts.forEach((p, i) => p.toArray(base, i * 3));
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(base.slice(), 3));
  const ph = new Float32Array(pts.length); for (let i = 0; i < ph.length; i++) ph[i] = Math.random() * 100; pg.setAttribute('aPh', new THREE.Float32BufferAttribute(ph, 1));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uI: { value: .55 } },
    vertexShader: `attribute float aPh; uniform float uT; varying float vA;
      void main(){ vec3 p=position+vec3(sin(uT*.21+aPh)*.06, sin(uT*.13+aPh*1.7)*.05, cos(uT*.17+aPh)*.06);
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; vA=.5+.5*sin(uT*.7+aPh*3.);
        gl_PointSize=(.8+fract(aPh)*1.)*(20./-mv.z); }`,
    fragmentShader: `uniform float uI; varying float vA; void main(){ float r=length(gl_PointCoord-.5); if(r>.5) discard; gl_FragColor=vec4(vec3(1.,.9,.72)*uI*vA*(1.-r*2.),1.); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const dust = new THREE.Points(pg, dustMat); dust.frustumCulled = false; dust.userData.noAO = true; g.add(dust);
  return { group: g, mat, dustMat, tick(t) { dustMat.uniforms.uT.value = t; } };
}
