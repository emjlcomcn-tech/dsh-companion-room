// 走路用的导航网格：把家具的占地投影到地面格子上，走路时用 A* 绕开，不再穿过沙发、桌子
import * as THREE from 'three';

const CELL = 0.1;

export class Nav {
  // levels: [{ y0, y1, x0, x1, z0, z1 }]，每层一张格子；y0..y1 是这层“会撞到”的高度范围
  constructor(root, { W, D, levels, radius = 0.2, blocked = [] }) {
    this.nx = Math.round(W / CELL); this.nz = Math.round(D / CELL);
    this.grids = levels.map((lv, i) => this.#build(root, lv, radius, blocked[i] || []));
    // 她的头发、裙摆、尾巴实际往外张 0.3~0.4m，但格子只能按 radius 外扩（再大门口就过不去了）。
    // 所以另算一张“离障碍多远”的距离场：寻路时贴着家具走要多花代价，拉直时也不许比原路线更贴边。
    // want：希望离家具外扩边界再多留多少（实测 0.6m 总间距时头发裙摆蹭进家具的帧数从 66% 降到 44%，路只长 3%）
    this.radius = radius; this.want = Math.max(0, .6 - radius);
    this.dist = this.grids.map((g) => this.#distField(g));
  }
  #distField(g) {
    const { nx, nz } = this, d = new Float32Array(nx * nz);
    for (let k = 0; k < d.length; k++) d[k] = g[k] ? 0 : 1e9;
    const pass = (j, i, list) => { const k = j * nx + i; for (const [di, dj, c] of list) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const v = d[b * nx + a] + c; if (v < d[k]) d[k] = v; } };
    const F = [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.414], [1, -1, 1.414]], B = [[1, 0, 1], [0, 1, 1], [1, 1, 1.414], [-1, 1, 1.414]];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) pass(j, i, F);
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) pass(j, i, B);
    for (let k = 0; k < d.length; k++) d[k] *= CELL; // 米；到“外扩后的障碍”的距离，加上 radius 才是到家具本身
    return d;
  }
  clearance(lvl, x, z) { const i = Math.floor(x / CELL), j = Math.floor(z / CELL); return i >= 0 && j >= 0 && i < this.nx && j < this.nz ? this.dist[lvl][j * this.nx + i] : 0; }
  #build(root, lv, radius, blocked) {
    const { nx, nz } = this, g = new Uint8Array(nx * nz), box = new THREE.Box3();
    // 这层以外的区域全部算墙
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = (i + .5) * CELL, z = (j + .5) * CELL;
      if (x < lv.x0 || x > lv.x1 || z < lv.z0 || z > lv.z1 || blocked.some(r => x >= r.x0 - radius && x <= r.x1 + radius && z >= r.z0 - radius && z <= r.z1 + radius)) g[j * nx + i] = 1;
    }
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || o.userData.noNav) return;
      box.setFromObject(o);
      if (box.isEmpty() || box.max.y < lv.y0 || box.min.y > lv.y1) return;
      const i0 = Math.max(0, Math.floor((box.min.x - radius) / CELL)), i1 = Math.min(nx - 1, Math.floor((box.max.x + radius) / CELL));
      const j0 = Math.max(0, Math.floor((box.min.z - radius) / CELL)), j1 = Math.min(nz - 1, Math.floor((box.max.z + radius) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g[j * nx + i] = 1;
    });
    // 贴墙一圈也不让走
    const m = Math.ceil(radius / CELL);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (i < m || j < m || i >= nx - m || j >= nz - m) g[j * nx + i] = 1;
    return g;
  }
  free(lvl, x, z) { const i = Math.floor(x / CELL), j = Math.floor(z / CELL); return i >= 0 && j >= 0 && i < this.nx && j < this.nz && !this.grids[lvl][j * this.nx + i]; }
  // 离 (x,z) 最近的可走格子
  nearest(lvl, x, z) {
    const { nx, nz } = this, g = this.grids[lvl];
    const i0 = Math.min(nx - 1, Math.max(0, Math.floor(x / CELL))), j0 = Math.min(nz - 1, Math.max(0, Math.floor(z / CELL)));
    if (!g[j0 * nx + i0]) return [i0, j0];
    let best = null, bd = Infinity;
    for (let r = 1; r < 40 && !best; r++) {
      for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r || i < 0 || j < 0 || i >= nx || j >= nz || g[j * nx + i]) continue;
        const d = Math.hypot((i + .5) * CELL - x, (j + .5) * CELL - z); if (d < bd) { bd = d; best = [i, j]; }
      }
    }
    return best;
  }
  // 座位（椅子、沙发、马桶）本身在障碍里：找一个“进座位”的落脚点——附近的空格子里，
  // 到座位那一段直线穿过实心家具（solid = 半径 0 的格子）最少的那个，再近一点优先。
  // 原来直接取最近的空格子，常常落在沙发背后 / 桌子另一边，最后一段就直接穿过家具。
  approach(lvl, x, z, solid) {
    if (this.free(lvl, x, z)) return [x, z];
    const { nx, nz } = this, g = this.grids[lvl], i0 = Math.floor(x / CELL), j0 = Math.floor(z / CELL), R = 18;
    let best = null, bs = Infinity;
    for (let j = j0 - R; j <= j0 + R; j++) for (let i = i0 - R; i <= i0 + R; i++) {
      if (i < 0 || j < 0 || i >= nx || j >= nz || g[j * nx + i]) continue;
      const cx = (i + .5) * CELL, cz = (j + .5) * CELL, d = Math.hypot(cx - x, cz - z); if (d > R * CELL) continue;
      const n = Math.max(1, Math.ceil(d / (CELL * .25))); let blocked = 0;
      for (let k = 1; k < n; k++) { const t = k / n; if (!solid.free(lvl, cx + (x - cx) * t, cz + (z - cz) * t)) blocked++; }
      const s = blocked * (d / n) * 4 + d; if (s < bs) { bs = s; best = [cx, cz]; }
    }
    return best || [x, z];
  }
  // 两点之间是不是一路畅通（用来把格子路径拉直）
  clear(lvl, ax, az, bx, bz, minD = 0) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / (CELL * .4));
    // 两头本身可能就贴着家具（比如座位前），要求从两头往中间逐渐放大，不然最后一段永远拉不直
    const ca = minD > 0 ? this.clearance(lvl, ax, az) : 0, cb = minD > 0 ? this.clearance(lvl, bx, bz) : 0;
    for (let k = 0; k <= n; k++) {
      const t = k / Math.max(1, n), x = ax + (bx - ax) * t, z = az + (bz - az) * t; if (!this.free(lvl, x, z)) return false;
      if (minD > 0 && this.clearance(lvl, x, z) < Math.min(minD, ca + t * L, cb + (1 - t) * L)) return false;
    }
    return true;
  }
  // A*：返回 [[x,z], ...]（不含起点），找不到返回 null
  find(lvl, ax, az, bx, bz) {
    const { nx, nz } = this, g = this.grids[lvl];
    const s = this.nearest(lvl, ax, az), e = this.nearest(lvl, bx, bz); if (!s || !e) return null;
    const S = s[1] * nx + s[0], E = e[1] * nx + e[0], N = nx * nz;
    const gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), shut = new Uint8Array(N);
    const heap = [], push = (k, f) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const h = (k) => { const dx = Math.abs(k % nx - e[0]), dz = Math.abs(((k / nx) | 0) - e[1]); return Math.max(dx, dz) + .414 * Math.min(dx, dz); };
    gs[S] = 0; push(S, h(S));
    const D8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false;
    while (heap.length) {
      const [, k] = pop(); if (shut[k]) continue; shut[k] = 1; if (k === E) { found = true; break; }
      const i = k % nx, j = (k / nx) | 0;
      for (const [di, dj, c] of D8) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const q = b * nx + a; if (g[q] || shut[q]) continue;
        if (di && dj && (g[j * nx + a] || g[b * nx + i])) continue; // 不斜着擦过墙角
        // 贴边惩罚：离障碍越近越“贵”，于是路线会自己走到过道中间
        const dq = this.dist[lvl][q], tight = this.want > 0 ? Math.max(0, (this.want - dq) / this.want) : 0;
        const ng = gs[k] + c * (1 + 6 * tight * tight); if (ng < gs[q]) { gs[q] = ng; from[q] = k; push(q, ng + h(q)); }
      }
    }
    if (!found) return null;
    const cells = []; for (let k = E; k !== -1; k = from[k]) cells.unshift([(k % nx + .5) * CELL, (((k / nx) | 0) + .5) * CELL]);
    // 拉直：能直接看到的点就跳过去
    // 拉直时：捷径上每一点离障碍的距离不能低于被跳过那段原路线的最小值（最多要求到 want），不然拉直又贴回家具边上
    const pts = [[ax, az], ...cells, [bx, bz]], out = []; let cur = pts[0], idx = 0;
    const cd = pts.map(([x, z]) => this.clearance(lvl, x, z));
    while (idx < pts.length - 1) {
      let nxt = idx + 1;
      for (let k = pts.length - 1; k > idx + 1; k--) {
        let m = this.want; for (let q = idx + 1; q < k; q++) if (cd[q] < m) m = cd[q];
        if (this.clear(lvl, cur[0], cur[1], pts[k][0], pts[k][1], m - .02)) { nxt = k; break; }
      }
      cur = pts[nxt]; out.push(cur); idx = nxt;
    }
    return out;
  }
}
