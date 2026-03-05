/**
 * Particle System — GPU-rendered, CPU-simulated fluid particles
 * confined inside a cube with heatmap coloring.
 *
 * Inspired by Three.js WebGPU fluid particles demo:
 * https://github.com/mrdoob/three.js/blob/master/examples/webgpu_compute_particles_fluid.html
 */

import * as THREE from 'three'

/* ── Shaders ─────────────────────────────────────────── */

const particleVertexShader = /* glsl */ `
  attribute float aSpeed;

  uniform float uPointSize;
  uniform float uSizeAttenuation;

  varying float vSpeed;

  void main() {
    vSpeed = aSpeed;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    /* Attenuate size by distance */
    gl_PointSize = uPointSize * (uSizeAttenuation / -mvPosition.z);

    /* Clamp minimum size so distant particles remain visible */
    gl_PointSize = max(gl_PointSize, 1.0);
  }
`

const particleFragmentShader = /* glsl */ `
  varying float vSpeed;

  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uColor4;
  uniform float uBrightness;

  vec3 heatmap(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.33) {
      return mix(uColor1, uColor2, t / 0.33);
    } else if (t < 0.66) {
      return mix(uColor2, uColor3, (t - 0.33) / 0.33);
    } else {
      return mix(uColor3, uColor4, (t - 0.66) / 0.34);
    }
  }

  void main() {
    /* Circular soft particle */
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;

    float alpha = smoothstep(0.5, 0.05, dist);
    vec3 color = heatmap(vSpeed) * uBrightness;

    gl_FragColor = vec4(color * alpha, alpha);
  }
`

/* ── Constants ───────────────────────────────────────── */

const MAX_PARTICLES = 150000
const CUBE_HALF = 0.98 // slightly inside the cube (half-size = 1.0)

/* ── Public API ──────────────────────────────────────── */

export class ParticleSystem {
  /**
   * @param {THREE.Object3D} parent — group to add points to
   * @param {object} params — shared params object (mutated by GUI)
   */
  constructor(parent, params) {
    this.params = params
    this.parent = parent
    this.time = 0
    this.activeCount = params.particleCount

    /* ── Allocate buffers for maximum capacity ────── */
    this.posArr = new Float32Array(MAX_PARTICLES * 3)
    this.velArr = new Float32Array(MAX_PARTICLES * 3)
    this.spdArr = new Float32Array(MAX_PARTICLES)

    this._initRange(0, this.activeCount)

    /* ── Geometry ────────────────────────────────── */
    this.geometry = new THREE.BufferGeometry()
    this.posAttr = new THREE.BufferAttribute(this.posArr, 3)
    this.spdAttr = new THREE.BufferAttribute(this.spdArr, 1)

    // Mark as dynamic for frequent updates
    this.posAttr.setUsage(THREE.DynamicDrawUsage)
    this.spdAttr.setUsage(THREE.DynamicDrawUsage)

    this.geometry.setAttribute('position', this.posAttr)
    this.geometry.setAttribute('aSpeed', this.spdAttr)
    this.geometry.setDrawRange(0, this.activeCount)

    /* ── Material ────────────────────────────────── */
    this.material = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: {
        uPointSize: { value: params.pointSize },
        uSizeAttenuation: { value: 300 },
        uColor1: { value: new THREE.Color(params.color1) },
        uColor2: { value: new THREE.Color(params.color2) },
        uColor3: { value: new THREE.Color(params.color3) },
        uColor4: { value: new THREE.Color(params.color4) },
        uBrightness: { value: params.brightness },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    })

    /* ── Points mesh ─────────────────────────────── */
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 0 // render before cube
    parent.add(this.points)
  }

  /* ── Private helpers ───────────────────────────────── */

  /** Initialize particle positions & velocities in [start, end). */
  _initRange(start, end) {
    for (let i = start; i < end; i++) {
      const i3 = i * 3
      this.posArr[i3]     = (Math.random() - 0.5) * 2 * CUBE_HALF
      this.posArr[i3 + 1] = (Math.random() - 0.5) * 2 * CUBE_HALF
      this.posArr[i3 + 2] = (Math.random() - 0.5) * 2 * CUBE_HALF
      this.velArr[i3]     = (Math.random() - 0.5) * 0.4
      this.velArr[i3 + 1] = (Math.random() - 0.5) * 0.4
      this.velArr[i3 + 2] = (Math.random() - 0.5) * 0.4
      this.spdArr[i]      = 0
    }
  }

  /* ── Public update — call once per frame ───────────── */

  update(deltaTime) {
    const p = this.params
    const dt = Math.min(deltaTime, 0.04) // cap at ~25 fps equivalent
    this.time += dt

    /* Handle count changes */
    const desired = Math.min(p.particleCount, MAX_PARTICLES)
    if (desired > this.activeCount) {
      this._initRange(this.activeCount, desired)
    }
    this.activeCount = desired
    this.geometry.setDrawRange(0, this.activeCount)

    /* ── Physics constants (read once) ───────────── */
    const gravity  = p.gravity
    const turbStr  = p.turbulence
    const turbFreq = p.turbulenceFrequency
    const damping  = p.damping
    const bounce   = p.bounce
    const t        = this.time

    const pos = this.posArr
    const vel = this.velArr
    const spd = this.spdArr

    let maxSpeed = 0.0001 // avoid div-by-zero

    /* ── Per-particle update ─────────────────────── */
    for (let i = 0, n = this.activeCount; i < n; i++) {
      const i3 = i * 3

      const px = pos[i3]
      const py = pos[i3 + 1]
      const pz = pos[i3 + 2]

      /* Curl-noise-like turbulence */
      const tx = Math.sin(py * turbFreq + t * 1.3) * Math.cos(pz * turbFreq + t * 0.7)
      const ty = Math.sin(pz * turbFreq + t * 0.8) * Math.cos(px * turbFreq + t * 1.1)
      const tz = Math.sin(px * turbFreq + t * 0.9) * Math.cos(py * turbFreq + t * 0.5)

      /* Apply forces */
      vel[i3]     += tx * turbStr * dt
      vel[i3 + 1] += (ty * turbStr - gravity) * dt
      vel[i3 + 2] += tz * turbStr * dt

      /* Damping */
      vel[i3]     *= damping
      vel[i3 + 1] *= damping
      vel[i3 + 2] *= damping

      /* Integrate position */
      pos[i3]     += vel[i3]     * dt
      pos[i3 + 1] += vel[i3 + 1] * dt
      pos[i3 + 2] += vel[i3 + 2] * dt

      /* Containment — bounce off cube walls */
      for (let j = 0; j < 3; j++) {
        const idx = i3 + j
        if (pos[idx] > CUBE_HALF) {
          pos[idx] = CUBE_HALF
          vel[idx] *= -bounce
        } else if (pos[idx] < -CUBE_HALF) {
          pos[idx] = -CUBE_HALF
          vel[idx] *= -bounce
        }
      }

      /* Speed for heatmap coloring */
      const vx = vel[i3]
      const vy = vel[i3 + 1]
      const vz = vel[i3 + 2]
      const s = Math.sqrt(vx * vx + vy * vy + vz * vz)
      spd[i] = s
      if (s > maxSpeed) maxSpeed = s
    }

    /* Normalize speeds (0–1) with a power curve for contrast */
    const inv = 1.0 / maxSpeed
    for (let i = 0, n = this.activeCount; i < n; i++) {
      spd[i] = Math.pow(spd[i] * inv, 0.55)
    }

    /* ── Push updates to GPU ─────────────────────── */
    this.posAttr.needsUpdate = true
    this.spdAttr.needsUpdate = true

    /* ── Sync uniforms ───────────────────────────── */
    const u = this.material.uniforms
    u.uPointSize.value  = p.pointSize
    u.uBrightness.value = p.brightness
    u.uColor1.value.set(p.color1)
    u.uColor2.value.set(p.color2)
    u.uColor3.value.set(p.color3)
    u.uColor4.value.set(p.color4)

    /* Toggle blending mode */
    const wantAdditive = p.additiveBlending
    const currentAdditive = this.material.blending === THREE.AdditiveBlending
    if (wantAdditive !== currentAdditive) {
      this.material.blending = wantAdditive ? THREE.AdditiveBlending : THREE.NormalBlending
      this.material.needsUpdate = true
    }
  }

  /** Reset all particles (e.g. after changing count). */
  reset() {
    this._initRange(0, this.activeCount)
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}
