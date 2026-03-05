/**
 * Particle System — wave-based fluid particles confined inside a cube
 * with GPU-computed 3D heatmap coloring.
 *
 * Particles are displaced from random base positions by overlapping
 * sine waves, creating smooth flowing motion.  The heatmap color is
 * computed entirely on the GPU from a 3D wave-field evaluated at
 * each particle's current position.
 */

import * as THREE from 'three'

/* ═══════════════════════════════════════════════════════════
   Shaders
   ═══════════════════════════════════════════════════════════ */

const vertexShader = /* glsl */ `
  uniform float uPointSize;
  uniform float uSizeAttenuation;
  uniform float uTime;
  uniform float uColorFreq;
  uniform float uColorSpeed;
  uniform float uColorContrast;

  varying float vHeat;

  /* 3-octave sine-based scalar field — smooth & cheap */
  float heatField(vec3 p, float t) {
    float w = 0.0;

    /* large-scale flow */
    w += sin(p.x * 1.7 + t * 0.60) * cos(p.y * 1.3 - t * 0.40) * 1.00;
    w += cos(p.z * 2.1 + t * 0.30) * sin(p.y * 0.9 + t * 0.70) * 1.00;
    w += sin(p.y * 1.5 - t * 0.50) * cos(p.z * 1.8 + t * 0.35) * 0.85;

    /* medium detail */
    w += sin(p.x * 3.1 + p.z * 2.3 + t * 0.50) * 0.50;
    w += cos(p.y * 2.7 - p.x * 1.8 + t * 0.40) * 0.50;

    /* fine detail */
    w += sin(p.z * 4.3 + p.x * 3.7 + t * 0.80) * 0.25;

    return w / 4.1 * 0.5 + 0.5;           /* ≈ 0 … 1 */
  }

  void main() {
    vec3 pos = position;

    /* Evaluate 3-D heat field at particle position */
    float raw = heatField(pos * uColorFreq, uTime * uColorSpeed);
    vHeat = pow(clamp(raw, 0.0, 1.0), uColorContrast);

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;

    /* Size attenuation (perspective) */
    gl_PointSize = uPointSize * (uSizeAttenuation / -mvPos.z);
    gl_PointSize = max(gl_PointSize, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  varying float vHeat;

  uniform vec3  uColor1;
  uniform vec3  uColor2;
  uniform vec3  uColor3;
  uniform vec3  uColor4;
  uniform float uBrightness;
  uniform float uOpacity;

  vec3 heatmap(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.33) return mix(uColor1, uColor2, t / 0.33);
    if (t < 0.66) return mix(uColor2, uColor3, (t - 0.33) / 0.33);
    return mix(uColor3, uColor4, (t - 0.66) / 0.34);
  }

  void main() {
    /* Soft circular particle with quadratic falloff */
    float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (r > 1.0) discard;

    float alpha = (1.0 - r * r) * uOpacity;
    vec3  color = heatmap(vHeat) * uBrightness;

    gl_FragColor = vec4(color, alpha);
  }
`

/* ═══════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════ */

const MAX_PARTICLES = 200000
const CUBE_HALF     = 0.98          // slightly inside cube (half-size = 1.0)

/* ═══════════════════════════════════════════════════════════
   Public API
   ═══════════════════════════════════════════════════════════ */

export class ParticleSystem {
  /**
   * @param {THREE.Object3D} parent — group to add points into
   * @param {object} params — shared params (mutated by GUI)
   */
  constructor(parent, params) {
    this.params  = params
    this.parent  = parent
    this.time    = 0
    this.activeCount = params.particleCount

    /* ── Allocate maximum-capacity buffers ────────── */
    this.basePos = new Float32Array(MAX_PARTICLES * 3)   // fixed origins
    this.posArr  = new Float32Array(MAX_PARTICLES * 3)   // displaced positions

    this._initPositions(0, this.activeCount)

    /* ── Geometry ─────────────────────────────────── */
    this.geometry = new THREE.BufferGeometry()
    this.posAttr  = new THREE.BufferAttribute(this.posArr, 3)
    this.posAttr.setUsage(THREE.DynamicDrawUsage)
    this.geometry.setAttribute('position', this.posAttr)
    this.geometry.setDrawRange(0, this.activeCount)

    /* ── Material ─────────────────────────────────── */
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uPointSize:      { value: params.pointSize },
        uSizeAttenuation:{ value: 400 },
        uTime:           { value: 0 },
        uColorFreq:      { value: params.colorFrequency },
        uColorSpeed:     { value: params.colorSpeed },
        uColorContrast:  { value: params.colorContrast },
        uColor1:         { value: new THREE.Color(params.color1) },
        uColor2:         { value: new THREE.Color(params.color2) },
        uColor3:         { value: new THREE.Color(params.color3) },
        uColor4:         { value: new THREE.Color(params.color4) },
        uBrightness:     { value: params.brightness },
        uOpacity:        { value: params.opacity },
      },
      transparent: true,
      depthWrite:  false,
      depthTest:   true,
      blending:    THREE.AdditiveBlending,
    })

    /* ── Points mesh ──────────────────────────────── */
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder   = 0        // render before cube
    parent.add(this.points)
  }

  /* ─── Private helpers ──────────────────────────────── */

  _initPositions(start, end) {
    for (let i = start; i < end; i++) {
      const i3 = i * 3
      const rx = (Math.random() - 0.5) * 2 * CUBE_HALF
      const ry = (Math.random() - 0.5) * 2 * CUBE_HALF
      const rz = (Math.random() - 0.5) * 2 * CUBE_HALF
      this.basePos[i3]     = rx
      this.basePos[i3 + 1] = ry
      this.basePos[i3 + 2] = rz
      this.posArr[i3]      = rx
      this.posArr[i3 + 1]  = ry
      this.posArr[i3 + 2]  = rz
    }
  }

  /* ─── Public: call once per frame ──────────────────── */

  update(deltaTime) {
    const p  = this.params
    const dt = Math.min(deltaTime, 0.04)
    this.time += dt

    /* Handle count changes */
    const desired = Math.min(p.particleCount, MAX_PARTICLES)
    if (desired > this.activeCount) {
      this._initPositions(this.activeCount, desired)
    }
    this.activeCount = desired
    this.geometry.setDrawRange(0, this.activeCount)

    /* ── Read params once ────────────────────────── */
    const t      = this.time
    const wAmp   = p.waveAmplitude
    const wFreq  = p.waveFrequency
    const wSpeed = p.waveSpeed
    const layers = p.waveLayers
    const pos    = this.posArr
    const base   = this.basePos
    const n      = this.activeCount

    /* Pre-compute time phases (avoid per-particle redundancy) */
    const ts1 = t * wSpeed
    const ts2 = t * wSpeed * 0.618     // golden ratio for irrational phasing
    const ts3 = t * wSpeed * 0.382

    /* ── Per-particle wave displacement ──────────── */
    for (let i = 0; i < n; i++) {
      const i3 = i * 3
      const bx = base[i3]
      const by = base[i3 + 1]
      const bz = base[i3 + 2]

      /* Layer 1 — primary wave */
      let dx = Math.sin(by * wFreq + ts1) * wAmp
      let dy = Math.cos(bx * wFreq + ts2) * wAmp
      let dz = Math.sin((bx + by) * wFreq * 0.5 + ts3) * wAmp * 0.8

      /* Layer 2 — secondary detail */
      if (layers >= 2) {
        dx += Math.sin(bz * wFreq * 1.3 + ts3) * wAmp * 0.35
        dy += Math.cos(bz * wFreq * 1.1 + ts1 * 0.6) * wAmp * 0.30
        dz += Math.cos(bx * wFreq * 0.9 + ts2 * 0.8) * wAmp * 0.25
      }

      /* Layer 3 — fine ripple */
      if (layers >= 3) {
        dx += Math.cos((by * 2.1 + bz * 0.5) * wFreq + ts2 * 1.5) * wAmp * 0.15
        dy += Math.sin((bx * 1.8 + bz * 0.7) * wFreq + ts3 * 1.3) * wAmp * 0.15
        dz += Math.sin((bx * 1.5 + by * 0.8) * wFreq + ts1 * 1.2) * wAmp * 0.15
      }

      /* Integrate and clamp inside cube */
      let nx = bx + dx
      let ny = by + dy
      let nz = bz + dz

      if (nx >  CUBE_HALF) nx =  CUBE_HALF
      if (nx < -CUBE_HALF) nx = -CUBE_HALF
      if (ny >  CUBE_HALF) ny =  CUBE_HALF
      if (ny < -CUBE_HALF) ny = -CUBE_HALF
      if (nz >  CUBE_HALF) nz =  CUBE_HALF
      if (nz < -CUBE_HALF) nz = -CUBE_HALF

      pos[i3]     = nx
      pos[i3 + 1] = ny
      pos[i3 + 2] = nz
    }

    /* ── Upload to GPU ───────────────────────────── */
    this.posAttr.needsUpdate = true

    /* ── Sync uniforms ───────────────────────────── */
    const u = this.material.uniforms
    u.uPointSize.value      = p.pointSize
    u.uBrightness.value     = p.brightness
    u.uOpacity.value        = p.opacity
    u.uTime.value           = this.time
    u.uColorFreq.value      = p.colorFrequency
    u.uColorSpeed.value     = p.colorSpeed
    u.uColorContrast.value  = p.colorContrast
    u.uColor1.value.set(p.color1)
    u.uColor2.value.set(p.color2)
    u.uColor3.value.set(p.color3)
    u.uColor4.value.set(p.color4)

    /* Toggle blending mode */
    const wantAdditive    = p.additiveBlending
    const currentAdditive = this.material.blending === THREE.AdditiveBlending
    if (wantAdditive !== currentAdditive) {
      this.material.blending = wantAdditive ? THREE.AdditiveBlending : THREE.NormalBlending
      this.material.needsUpdate = true
    }
  }

  /** Reset all base positions (randomise). */
  reset() {
    this._initPositions(0, this.activeCount)
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}
