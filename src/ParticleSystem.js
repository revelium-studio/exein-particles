/**
 * GPU-Computed Particle System
 *
 * All physics (turbulence, gravity, wave forces, wall bounce) run entirely
 * on the GPU via GPUComputationRenderer (framebuffer ping-pong).
 * This allows 260k+ particles at 60 fps.
 *
 * Heatmap coloring is speed-based: fast particles are "hot", slow are "cold".
 */

import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'

/* ═══════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════ */

const TEX_SIZE      = 512              // 512² = 262 144 particles max
const MAX_PARTICLES = TEX_SIZE * TEX_SIZE
const CUBE_H        = 0.98             // slightly inside cube half-size

/* ═══════════════════════════════════════════════════════════
   GPU Compute — Velocity Shader
   ═══════════════════════════════════════════════════════════ */

const computeVelocity = /* glsl */ `
  uniform float uDelta;
  uniform float uTime;
  uniform float uGravity;
  uniform float uTurbulence;
  uniform float uTurbFreq;
  uniform float uDamping;
  uniform float uBounce;
  uniform float uWaveAmp;
  uniform float uWaveFreq;
  uniform float uWaveSpeed;
  uniform float uReset;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    /* ── Reset: randomise velocities ── */
    if (uReset > 0.5) {
      gl_FragColor = vec4(
        (hash(uv * 4.17) - 0.5) * 0.3,
        (hash(uv * 5.29) - 0.5) * 0.3,
        (hash(uv * 6.84) - 0.5) * 0.3,
        1.0
      );
      return;
    }

    vec3 p = texture2D(texturePosition, uv).xyz;
    vec3 v = texture2D(textureVelocity, uv).xyz;
    float dt = uDelta;
    float t  = uTime;

    /* ── Curl-noise turbulence ── */
    float tf = uTurbFreq;
    vec3 turb = vec3(
      sin(p.y * tf + t * 1.3) * cos(p.z * tf + t * 0.7),
      sin(p.z * tf + t * 0.8) * cos(p.x * tf + t * 1.1),
      sin(p.x * tf + t * 0.9) * cos(p.y * tf + t * 0.5)
    );
    v += turb * uTurbulence * dt;

    /* ── Gravity ── */
    v.y -= uGravity * dt;

    /* ── Wave forces (coherent flow) ── */
    float wf = uWaveFreq;
    float ws = uWaveSpeed;
    float wa = uWaveAmp;
    v.x += sin(p.y * wf + t * ws) * wa * dt;
    v.y += cos(p.x * wf * 0.8 + t * ws * 0.7) * wa * 0.8 * dt;
    v.z += sin(p.x * wf * 0.6 + p.y * wf * 0.4 + t * ws * 0.5) * wa * 0.6 * dt;

    /* ── Frame-rate-independent damping ── */
    v *= pow(uDamping, dt * 60.0);

    /* ── Wall bounce ── */
    float h = 0.98;
    if (p.x >  h && v.x > 0.0) v.x *= -uBounce;
    if (p.x < -h && v.x < 0.0) v.x *= -uBounce;
    if (p.y >  h && v.y > 0.0) v.y *= -uBounce;
    if (p.y < -h && v.y < 0.0) v.y *= -uBounce;
    if (p.z >  h && v.z > 0.0) v.z *= -uBounce;
    if (p.z < -h && v.z < 0.0) v.z *= -uBounce;

    gl_FragColor = vec4(v, 1.0);
  }
`

/* ═══════════════════════════════════════════════════════════
   GPU Compute — Position Shader
   ═══════════════════════════════════════════════════════════ */

const computePosition = /* glsl */ `
  uniform float uDelta;
  uniform float uReset;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    /* ── Reset: randomise positions ── */
    if (uReset > 0.5) {
      float h = 0.98;
      gl_FragColor = vec4(
        (hash(uv * 1.37) * 2.0 - 1.0) * h,
        (hash(uv * 2.61) * 2.0 - 1.0) * h,
        (hash(uv * 3.79) * 2.0 - 1.0) * h,
        1.0
      );
      return;
    }

    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;

    pos += vel * uDelta;
    pos = clamp(pos, vec3(-0.98), vec3(0.98));

    gl_FragColor = vec4(pos, 1.0);
  }
`

/* ═══════════════════════════════════════════════════════════
   Render — Vertex Shader
   ═══════════════════════════════════════════════════════════ */

const renderVertex = /* glsl */ `
  attribute vec2 reference;

  uniform sampler2D tPosition;
  uniform sampler2D tVelocity;
  uniform float uPointSize;
  uniform float uSizeAtten;
  uniform float uSpeedScale;

  varying float vHeat;

  void main() {
    vec3 pos = texture2D(tPosition, reference).xyz;
    vec3 vel = texture2D(tVelocity, reference).xyz;

    /* Speed → heat (0–1) */
    vHeat = clamp(length(vel) * uSpeedScale, 0.0, 1.0);

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position  = projectionMatrix * mvPos;
    gl_PointSize = uPointSize * (uSizeAtten / -mvPos.z);
    gl_PointSize = max(gl_PointSize, 1.0);
  }
`

/* ═══════════════════════════════════════════════════════════
   Render — Fragment Shader
   ═══════════════════════════════════════════════════════════ */

const renderFragment = /* glsl */ `
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
    float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (r > 1.0) discard;

    float alpha = (1.0 - r * r) * uOpacity;
    vec3  color = heatmap(vHeat) * uBrightness;

    gl_FragColor = vec4(color, alpha);
  }
`

/* ═══════════════════════════════════════════════════════════
   Public API
   ═══════════════════════════════════════════════════════════ */

export class ParticleSystem {
  /**
   * @param {THREE.Object3D}    parent   — group the Points are added to
   * @param {object}            params   — shared GUI-controlled params
   * @param {THREE.WebGLRenderer} renderer — needed by GPUComputationRenderer
   */
  constructor(parent, params, renderer) {
    this.params    = params
    this.parent    = parent
    this.renderer  = renderer
    this.time      = 0
    this._wantReset = false

    /* ── Initialise GPU compute ────────────────────── */
    this._initCompute()

    /* ── Render geometry ──────────────────────────── */
    const geo  = new THREE.BufferGeometry()
    const refs = new Float32Array(MAX_PARTICLES * 2)

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const col = i % TEX_SIZE
      const row = (i / TEX_SIZE) | 0
      refs[i * 2]     = (col + 0.5) / TEX_SIZE
      refs[i * 2 + 1] = (row + 0.5) / TEX_SIZE
    }

    /* Dummy position attribute (Three.js requires it for Points) */
    geo.setAttribute('position',  new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3))
    geo.setAttribute('reference', new THREE.BufferAttribute(refs, 2))
    geo.setDrawRange(0, Math.min(params.particleCount, MAX_PARTICLES))
    this.geometry = geo

    /* ── Render material ──────────────────────────── */
    this.material = new THREE.ShaderMaterial({
      vertexShader:   renderVertex,
      fragmentShader: renderFragment,
      uniforms: {
        tPosition:   { value: null },
        tVelocity:   { value: null },
        uPointSize:  { value: params.pointSize },
        uSizeAtten:  { value: 150 },
        uSpeedScale: { value: params.speedScale },
        uColor1:     { value: new THREE.Color(params.color1) },
        uColor2:     { value: new THREE.Color(params.color2) },
        uColor3:     { value: new THREE.Color(params.color3) },
        uColor4:     { value: new THREE.Color(params.color4) },
        uBrightness: { value: params.brightness },
        uOpacity:    { value: params.opacity },
      },
      transparent: true,
      depthWrite:  false,
      depthTest:   true,
      blending:    THREE.AdditiveBlending,
    })

    /* ── Points mesh ──────────────────────────────── */
    this.points = new THREE.Points(geo, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder   = 0
    parent.add(this.points)
  }

  /* ─── GPU Compute initialisation ───────────────────── */

  _initCompute() {
    const gpu = new GPUComputationRenderer(TEX_SIZE, TEX_SIZE, this.renderer)

    /* Use HalfFloatType on WebGL 1 for compatibility */
    if (this.renderer.capabilities.isWebGL2 === false) {
      gpu.setDataType(THREE.HalfFloatType)
    }

    const dtPos = gpu.createTexture()
    const dtVel = gpu.createTexture()

    /* Random positions inside cube */
    const pa = dtPos.image.data
    for (let i = 0; i < pa.length; i += 4) {
      pa[i]     = (Math.random() - 0.5) * 2 * CUBE_H
      pa[i + 1] = (Math.random() - 0.5) * 2 * CUBE_H
      pa[i + 2] = (Math.random() - 0.5) * 2 * CUBE_H
      pa[i + 3] = 1
    }

    /* Small random initial velocities */
    const va = dtVel.image.data
    for (let i = 0; i < va.length; i += 4) {
      va[i]     = (Math.random() - 0.5) * 0.2
      va[i + 1] = (Math.random() - 0.5) * 0.2
      va[i + 2] = (Math.random() - 0.5) * 0.2
      va[i + 3] = 1
    }

    /* Mark textures for upload after data modification */
    dtPos.needsUpdate = true
    dtVel.needsUpdate = true

    /* Variable names MUST match the sampler names used in the shaders
       (texturePosition, textureVelocity) — GPUComputationRenderer uses
       these names as uniform identifiers. */
    this.velVar = gpu.addVariable('textureVelocity', computeVelocity, dtVel)
    this.posVar = gpu.addVariable('texturePosition', computePosition, dtPos)

    /* Dependencies: both read each other */
    gpu.setVariableDependencies(this.velVar, [this.posVar, this.velVar])
    gpu.setVariableDependencies(this.posVar, [this.posVar, this.velVar])

    /* Custom uniforms — velocity shader */
    const vu = this.velVar.material.uniforms
    vu.uDelta     = { value: 0 }
    vu.uTime      = { value: 0 }
    vu.uGravity   = { value: this.params.gravity }
    vu.uTurbulence = { value: this.params.turbulence }
    vu.uTurbFreq  = { value: this.params.turbulenceFrequency }
    vu.uDamping   = { value: this.params.damping }
    vu.uBounce    = { value: this.params.bounce }
    vu.uWaveAmp   = { value: this.params.waveAmplitude }
    vu.uWaveFreq  = { value: this.params.waveFrequency }
    vu.uWaveSpeed = { value: this.params.waveSpeed }
    vu.uReset     = { value: 0 }

    /* Custom uniforms — position shader */
    const pu = this.posVar.material.uniforms
    pu.uDelta = { value: 0 }
    pu.uReset = { value: 0 }

    /* Init — bail out cleanly if GPU compute isn't supported */
    const err = gpu.init()
    if (err !== null) {
      console.error('GPUComputationRenderer error:', err)
      this.gpuCompute = null
      return
    }

    this.gpuCompute = gpu
  }

  /* ─── Per-frame update ─────────────────────────────── */

  update(deltaTime) {
    if (!this.gpuCompute) return

    const p  = this.params
    const dt = Math.min(deltaTime, 0.05)
    this.time += dt

    /* ── Sync compute uniforms ── */
    const vu = this.velVar.material.uniforms
    vu.uDelta.value      = dt
    vu.uTime.value       = this.time
    vu.uGravity.value    = p.gravity
    vu.uTurbulence.value = p.turbulence
    vu.uTurbFreq.value   = p.turbulenceFrequency
    vu.uDamping.value    = p.damping
    vu.uBounce.value     = p.bounce
    vu.uWaveAmp.value    = p.waveAmplitude
    vu.uWaveFreq.value   = p.waveFrequency
    vu.uWaveSpeed.value  = p.waveSpeed

    const pu = this.posVar.material.uniforms
    pu.uDelta.value = dt

    /* Reset flag (active for one frame) */
    if (this._wantReset) {
      vu.uReset.value = 1
      pu.uReset.value = 1
    }

    /* ── Run GPU compute ── */
    this.gpuCompute.compute()

    /* Clear reset after the frame it was applied */
    if (this._wantReset) {
      vu.uReset.value = 0
      pu.uReset.value = 0
      this._wantReset = false
    }

    /* ── Sync render uniforms ── */
    const u = this.material.uniforms
    u.tPosition.value  = this.gpuCompute.getCurrentRenderTarget(this.posVar).texture
    u.tVelocity.value  = this.gpuCompute.getCurrentRenderTarget(this.velVar).texture
    u.uPointSize.value = p.pointSize
    u.uSpeedScale.value = p.speedScale
    u.uBrightness.value = p.brightness
    u.uOpacity.value    = p.opacity
    u.uColor1.value.set(p.color1)
    u.uColor2.value.set(p.color2)
    u.uColor3.value.set(p.color3)
    u.uColor4.value.set(p.color4)

    /* Blending mode toggle */
    const wantAdd = p.additiveBlending
    const hasAdd  = this.material.blending === THREE.AdditiveBlending
    if (wantAdd !== hasAdd) {
      this.material.blending = wantAdd ? THREE.AdditiveBlending : THREE.NormalBlending
      this.material.needsUpdate = true
    }

    /* Draw range */
    this.geometry.setDrawRange(0, Math.min(p.particleCount, MAX_PARTICLES))
  }

  /** Randomise all particles (positions + velocities). */
  reset() {
    this._wantReset = true
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}
