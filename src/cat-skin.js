import * as THREE from 'three';

const TAU = Math.PI * 2;
const BLEND = .022;
const CELL = .0105;
const JOINTS = 6;
const CHANNELS = ['body', 'leg', 'tail', 'head'];
const CORNERS = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const TETS = [[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];

function smoothUnion(a, b) {
  const overlap = Math.max(0, BLEND - Math.abs(a - b));
  return Math.min(a, b) - overlap * overlap / (4 * BLEND);
}

function distance(part, x, y, z, headWidth, muzzle) {
  const m = part.inverse.elements;
  const a = m[0]*x + m[4]*y + m[8]*z + m[12];
  const b = m[1]*x + m[5]*y + m[9]*z + m[13];
  const c = m[2]*x + m[6]*y + m[10]*z + m[14];
  if (part.channel === 'head') {
    const lx = a * part.localWidth, ly = b * part.localHeight;
    const depth = 1 + (c > 0 ? muzzle(lx, ly) / part.localDepth : 0);
    return (Math.hypot(lx / headWidth(ly), b, c / depth) - 1) * part.radius;
  }
  return (Math.sqrt(a*a + b*b + c*c) - 1) * part.radius;
}

// Extract a single indexed surface from the sculpt volumes in the standing pose.
// The same topology is used for every animation frame.
function extractSurface(parts, field) {
  const bounds = new THREE.Box3();
  const cube = new THREE.Box3(new THREE.Vector3(-1,-1,-1), new THREE.Vector3(1,1,1));
  for (const p of parts) bounds.union(cube.clone().applyMatrix4(p.matrix));
  bounds.expandByScalar(.035);
  const origin = bounds.min;
  const [nx, ny, nz] = bounds.getSize(new THREE.Vector3()).toArray().map(n => Math.ceil(n / CELL) + 1);
  const slab = nx * ny, size = slab * nz;
  const values = new Float32Array(size);
  const xyz = new Float32Array(size * 3);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const n = i + j * nx + k * slab;
    const x = origin.x + i * CELL, y = origin.y + j * CELL, z = origin.z + k * CELL;
    values[n] = field(x, y, z);
    xyz[n*3] = x; xyz[n*3+1] = y; xyz[n*3+2] = z;
  }

  const positions = [], indices = [], edges = new Map();
  const offsets = CORNERS.map(([i,j,k]) => i + j * nx + k * slab);
  function vertex(a, b) {
    const key = Math.min(a,b) * size + Math.max(a,b);
    if (edges.has(key)) return edges.get(key);
    const t = values[a] / (values[a] - values[b]);
    const i = positions.length / 3;
    for (let c = 0; c < 3; c++) positions.push(THREE.MathUtils.lerp(xyz[a*3+c], xyz[b*3+c], t));
    edges.set(key, i);
    return i;
  }
  function triangle(a, b, c, from, towards) {
    const [ax, ay, az] = positions.slice(a*3, a*3+3);
    const ux = positions[b*3]-ax, uy = positions[b*3+1]-ay, uz = positions[b*3+2]-az;
    const vx = positions[c*3]-ax, vy = positions[c*3+1]-ay, vz = positions[c*3+2]-az;
    const x = xyz[towards*3]-xyz[from*3], y = xyz[towards*3+1]-xyz[from*3+1], z = xyz[towards*3+2]-xyz[from*3+2];
    if ((uy*vz-uz*vy)*x + (uz*vx-ux*vz)*y + (ux*vy-uy*vx)*z > 0) indices.push(a,b,c);
    else indices.push(a,c,b);
  }
  for (let k = 0; k < nz-1; k++) for (let j = 0; j < ny-1; j++) for (let i = 0; i < nx-1; i++) {
    const cell = i + j * nx + k * slab;
    const corners = offsets.map(o => cell + o);
    const count = corners.filter(n => values[n] < 0).length;
    if (!count || count === 8) continue;
    for (const tet of TETS) {
      const inside = [], outside = [];
      for (const corner of tet) {
        const n = corners[corner];
        (values[n] < 0 ? inside : outside).push(n);
      }
      if (inside.length === 1) {
        triangle(...outside.map(n => vertex(inside[0], n)), inside[0], outside[0]);
      } else if (outside.length === 1) {
        triangle(...inside.map(n => vertex(n, outside[0])), inside[0], outside[0]);
      } else if (inside.length === 2) {
        const [a,b,c,d] = inside.flatMap(n => outside.map(m => vertex(n,m)));
        triangle(a,b,d,inside[0],outside[0]);
        triangle(a,d,c,inside[0],outside[0]);
      }
    }
  }
  return { positions, indices };
}

function coatShader(material, textures) {
  const original = material.onBeforeCompile;
  for (const t of Object.values(textures)) t.wrapS = THREE.RepeatWrapping;
  material.onBeforeCompile = (shader) => {
    original(shader);
    const varyings = 'varying vec4 vCoat; varying vec3 vBody; varying vec3 vLeg; varying vec3 vTail; varying vec3 vHead;';
    shader.vertexShader = `attribute vec4 coatMix; attribute vec3 coatBody, coatLeg, coatTail, coatHead; ${varyings}\n` + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vCoat=coatMix; vBody=coatBody; vLeg=coatLeg; vTail=coatTail; vHead=coatHead;`);
    shader.fragmentShader = `${varyings}\n` + CHANNELS.map(c => `uniform sampler2D ${c}Coat;`).join('\n') + `
      vec2 coatDerivative(vec3 v, vec3 dv) {
        return vec2((v.x*dv.y-v.y*dv.x)/(6.28318530718*max(dot(v.xy,v.xy),.0001)), dv.z);
      }
      vec3 sampleCoat(sampler2D map, vec3 v) {
        vec2 uv=vec2(atan(v.y,v.x)/6.28318530718, v.z);
        return textureGrad(map,uv,coatDerivative(v,dFdx(v)),coatDerivative(v,dFdy(v))).rgb;
      }
    ` + shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      diffuseColor.rgb *= sampleCoat(bodyCoat,vBody)*vCoat.x + sampleCoat(legCoat,vLeg)*vCoat.y
        + sampleCoat(tailCoat,vTail)*vCoat.z + sampleCoat(headCoat,vHead)*vCoat.w;`);
    for (const c of CHANNELS) shader.uniforms[`${c}Coat`] = { value: textures[c] };
  };
}

function tailUv(point, parts) {
  let bestDistance = Infinity, uv;
  for (const part of parts) {
    const axis = part.end.clone().sub(part.start);
    const length = axis.length();
    axis.divideScalar(length);
    const offset = point.clone().sub(part.start);
    const along = THREE.MathUtils.clamp(offset.dot(axis) / length, 0, 1);
    const radial = offset.addScaledVector(axis, -along * length);
    const d = radial.lengthSq();
    if (d >= bestDistance) continue;
    bestDistance = d;
    const right = new THREE.Vector3(1,0,0).addScaledVector(axis, -axis.x).normalize();
    const up = axis.clone().cross(right);
    uv = [Math.atan2(-radial.dot(right), radial.dot(up)), part.along + (along - .5) / parts.length];
  }
  return uv;
}

export class CatSkin {
  constructor(parts, material, textures, headWidth, muzzle) {
    this.parts = parts.map(p => ({ ...p, inverse: p.matrix.clone().invert(), radius: Math.min(...p.radii.toArray()) }));
    const field = (x,y,z) => {
      let result = Infinity;
      for (const part of this.parts) result = smoothUnion(result, distance(part,x,y,z,headWidth,muzzle));
      return result;
    };
    const {positions, indices} = extractSurface(this.parts, field);
    this.rest = new Float32Array(positions);
    const count = positions.length / 3;
    this.joints = new Uint8Array(count * JOINTS);
    this.weights = new Float32Array(count * JOINTS);
    this.transforms = parts.map(() => new THREE.Matrix4());
    const mix = new Float32Array(count * 4);
    const uvs = CHANNELS.map(() => new Float32Array(count * 3));
    const tailParts = this.parts.filter(p => p.channel === 'tail');
    const point = new THREE.Vector3(), local = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      point.fromArray(positions, i*3);
      const ranked = this.parts.map((p, k) => ({ k, d: distance(p,point.x,point.y,point.z,headWidth,muzzle) })).sort((a,b) => a.d-b.d);
      let total = 0;
      for (let j = 0; j < JOINTS; j++) {
        const {k,d} = ranked[j], w = Math.max(0, 1 - (d - ranked[0].d) / .046) ** 3;
        this.joints[i*JOINTS+j] = k;
        this.weights[i*JOINTS+j] = w;
        total += w;
        mix[i*4+CHANNELS.indexOf(this.parts[k].channel)] += w;
      }
      for (let j = 0; j < JOINTS; j++) this.weights[i*JOINTS+j] /= total;
      for (let j = 0; j < 4; j++) {
        mix[i*4+j] /= total;
        const channel = CHANNELS[j];
        const part = this.parts[ranked.find(({k}) => this.parts[k].channel === channel).k];
        local.copy(point).applyMatrix4(part.inverse);
        let u = Math.atan2(-local.x, local.y), v = part.along;
        if (channel === 'head') {
          u = Math.atan2(local.z, -local.x);
          v = 1 - Math.acos(THREE.MathUtils.clamp(local.y, -1, 1)) / Math.PI;
        } else if (channel === 'body') {
          u = Math.atan2(-point.x, point.y - .205);
          v = (point.z + .25) / .59;
        } else if (channel === 'leg') {
          v = (.16 - point.y) / .16;
        } else if (mix[i*4+j] > 0) {
          [u,v] = tailUv(point, tailParts);
        }
        uvs[j].set([Math.cos(u), Math.sin(u), THREE.MathUtils.clamp(v, 0, 1)], i*3);
      }
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.rest.slice(), 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('coatMix', new THREE.BufferAttribute(mix, 4));
    for (let i = 0; i < CHANNELS.length; i++) {
      const name = CHANNELS[i];
      this.geo.setAttribute('coat' + name[0].toUpperCase() + name.slice(1), new THREE.BufferAttribute(uvs[i], 3));
    }
    this.geo.setIndex(indices);
    const adjacency = Array.from({length: count}, () => new Set());
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i], b = indices[i+1], c = indices[i+2];
      adjacency[a].add(b).add(c);
      adjacency[b].add(a).add(c);
      adjacency[c].add(a).add(b);
    }
    const IndexArray = count <= 65536 ? Uint16Array : Uint32Array;
    this.neighbors = adjacency.map(set => IndexArray.from(set));
    this.smooth = new Float32Array(this.rest.length);
    this.geo.computeVertexNormals();
    coatShader(material, textures);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
  }

  update(parts) {
    const position = this.geo.attributes.position;
    for (let k = 0; k < parts.length; k++) this.transforms[k].multiplyMatrices(parts[k].matrix, this.parts[k].inverse);
    const p = new THREE.Vector3(), out = new THREE.Vector3(), temp = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      p.fromArray(this.rest, i*3);
      out.set(0,0,0);
      for (let j = 0; j < JOINTS; j++) {
        const n = i*JOINTS+j, w = this.weights[n];
        if (w) out.addScaledVector(temp.copy(p).applyMatrix4(this.transforms[this.joints[n]]), w);
      }
      position.setXYZ(i,out.x,out.y,out.z);
    }
    // Relax fine creases caused by bending the shared skin around the joints.
    const values = position.array;
    for (let i = 0; i < position.count; i++) {
      const n = this.neighbors[i];
      let x = 0, y = 0, z = 0;
      for (const j of n) { x += values[j*3]; y += values[j*3+1]; z += values[j*3+2]; }
      this.smooth[i*3] = values[i*3] * .52 + x * .48 / n.length;
      this.smooth[i*3+1] = values[i*3+1] * .52 + y * .48 / n.length;
      this.smooth[i*3+2] = values[i*3+2] * .52 + z * .48 / n.length;
    }
    values.set(this.smooth);
    position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
}
