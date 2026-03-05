/**
 * Exein Particles
 *
 * Glass cube (Apple Fifth Avenue style) with wave-driven fluid particles
 * and GPU-computed heatmap coloring.  Modern GUI for full parameter control.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import GUI from 'lil-gui'
import { GlassCube } from './GlassCube'
import { ParticleSystem } from './ParticleSystem'
import './style.css'

/* ══════════════════════════════════════════════════════════
   Color-map presets
   ══════════════════════════════════════════════════════════ */

const COLOR_PRESETS = {
  Inferno:  { color1: '#0d0829', color2: '#b12a90', color3: '#e8632c', color4: '#fcffa4' },
  Magma:    { color1: '#0d0829', color2: '#b73779', color3: '#fb8861', color4: '#fcfdbf' },
  Plasma:   { color1: '#0d0887', color2: '#cc4778', color3: '#f0f921', color4: '#fcffa4' },
  Fire:     { color1: '#1a0000', color2: '#cc3300', color3: '#ff9900', color4: '#ffffcc' },
  Ocean:    { color1: '#001133', color2: '#0055aa', color3: '#00cccc', color4: '#aaffff' },
  Emerald:  { color1: '#001a0d', color2: '#00804d', color3: '#33ff99', color4: '#ccffee' },
  Neon:     { color1: '#0a001a', color2: '#6600ff', color3: '#ff00aa', color4: '#ffccff' },
  Exein:    { color1: '#120638', color2: '#8a2be2', color3: '#e8632c', color4: '#26c6da' },
}

/* ══════════════════════════════════════════════════════════
   Shared params — every value is controlled by the GUI
   ══════════════════════════════════════════════════════════ */

const params = {
  /* Particles */
  particleCount:     120000,
  pointSize:         5.0,
  opacity:           0.07,
  brightness:        1.4,
  additiveBlending:  true,

  /* Wave Motion */
  waveAmplitude:     0.18,
  waveFrequency:     2.5,
  waveSpeed:         0.6,
  waveLayers:        2,

  /* Color Field */
  colorFrequency:    1.5,
  colorSpeed:        0.4,
  colorContrast:     0.85,

  /* Colors */
  preset: 'Inferno',
  color1: '#0d0829',
  color2: '#b12a90',
  color3: '#e8632c',
  color4: '#fcffa4',

  /* Cube */
  borderWidth:    0.015,
  borderOpacity:  0.90,
  faceOpacity:    0.04,
  rotationSpeed:  0.25,
  cubeScale:      1.0,
  autoRotate:     true,

  /* Scene */
  backgroundColor: '#080810',
}

/* ══════════════════════════════════════════════════════════
   Renderer / Scene / Camera
   ══════════════════════════════════════════════════════════ */

const canvas = document.getElementById('canvas')

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
})
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setClearColor(new THREE.Color(params.backgroundColor), 1)
renderer.sortObjects = true

const scene = new THREE.Scene()

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
)
camera.position.set(0, 0, 5.2)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping  = true
controls.dampingFactor  = 0.06
controls.minDistance     = 2
controls.maxDistance     = 20
controls.target.set(0, 0, 0)
controls.update()

/* ══════════════════════════════════════════════════════════
   Scene objects
   ══════════════════════════════════════════════════════════ */

const cubeGroup = new THREE.Group()
scene.add(cubeGroup)

const glassCube = new GlassCube(cubeGroup, params)
const particles = new ParticleSystem(cubeGroup, params)

/* Subtle ambient light */
scene.add(new THREE.AmbientLight(0xffffff, 0.5))

/* ══════════════════════════════════════════════════════════
   GUI
   ══════════════════════════════════════════════════════════ */

const gui = new GUI({ width: 300, title: '✦  EXEIN PARTICLES' })

/* ── Particles ─────────────────────────────────────────── */
const fParticles = gui.addFolder('Particles')
fParticles.add(params, 'particleCount', 5000, 200000, 1000).name('Count')
fParticles.add(params, 'pointSize', 0.5, 20, 0.1).name('Size')
fParticles.add(params, 'opacity', 0.01, 0.5, 0.005).name('Opacity')
fParticles.add(params, 'brightness', 0.1, 5, 0.05).name('Brightness')
fParticles.add(params, 'additiveBlending').name('Additive Blend')
fParticles.add({ reset: () => particles.reset() }, 'reset').name('↻  Reset Particles')

/* ── Waves ─────────────────────────────────────────────── */
const fWaves = gui.addFolder('Wave Motion')
fWaves.add(params, 'waveAmplitude', 0, 0.6, 0.01).name('Amplitude')
fWaves.add(params, 'waveFrequency', 0.5, 8, 0.1).name('Frequency')
fWaves.add(params, 'waveSpeed', 0, 3, 0.05).name('Speed')
fWaves.add(params, 'waveLayers', 1, 3, 1).name('Layers')

/* ── Color Field ───────────────────────────────────────── */
const fColorField = gui.addFolder('Color Field')
fColorField.add(params, 'colorFrequency', 0.3, 5, 0.1).name('Frequency')
fColorField.add(params, 'colorSpeed', 0, 2, 0.05).name('Speed')
fColorField.add(params, 'colorContrast', 0.2, 3, 0.05).name('Contrast')

/* ── Colors ────────────────────────────────────────────── */
const fColors = gui.addFolder('Colors')
const presetCtrl = fColors.add(params, 'preset', Object.keys(COLOR_PRESETS)).name('Preset')
const c1Ctrl = fColors.addColor(params, 'color1').name('Cold')
const c2Ctrl = fColors.addColor(params, 'color2').name('Warm')
const c3Ctrl = fColors.addColor(params, 'color3').name('Hot')
const c4Ctrl = fColors.addColor(params, 'color4').name('Peak')

presetCtrl.onChange((name) => {
  const p = COLOR_PRESETS[name]
  if (p) {
    params.color1 = p.color1
    params.color2 = p.color2
    params.color3 = p.color3
    params.color4 = p.color4
    c1Ctrl.updateDisplay()
    c2Ctrl.updateDisplay()
    c3Ctrl.updateDisplay()
    c4Ctrl.updateDisplay()
  }
})

/* ── Cube ──────────────────────────────────────────────── */
const fCube = gui.addFolder('Cube')
fCube.add(params, 'borderWidth', 0.002, 0.06, 0.001).name('Border Width')
fCube.add(params, 'borderOpacity', 0, 1, 0.01).name('Border Opacity')
fCube.add(params, 'faceOpacity', 0, 0.3, 0.005).name('Face Opacity')
fCube.add(params, 'rotationSpeed', 0, 2, 0.01).name('Rotation Speed')
fCube.add(params, 'cubeScale', 0.3, 3, 0.01).name('Scale')
fCube.add(params, 'autoRotate').name('Auto Rotate')

/* ── Scene ─────────────────────────────────────────────── */
const fScene = gui.addFolder('Scene')
fScene.addColor(params, 'backgroundColor').name('Background').onChange((v) => {
  renderer.setClearColor(new THREE.Color(v), 1)
})

/* Close secondary folders for a clean initial view */
fWaves.close()
fColorField.close()
fCube.close()
fScene.close()

/* ══════════════════════════════════════════════════════════
   Cube rotation — clearly recognisable cube orientation
   ══════════════════════════════════════════════════════════ */

function updateCubeRotation(elapsed) {
  if (!params.autoRotate) return

  /* Gentle 3/4 view: slight X-tilt + slow Y-spin */
  cubeGroup.rotation.x = 0.35                             // fixed tilt
  cubeGroup.rotation.y = elapsed * params.rotationSpeed    // slow spin
  cubeGroup.rotation.z = Math.sin(elapsed * 0.15) * 0.08  // subtle wobble
}

/* ══════════════════════════════════════════════════════════
   Resize
   ══════════════════════════════════════════════════════════ */

function onResize() {
  const w = window.innerWidth
  const h = window.innerHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

window.addEventListener('resize', onResize)

/* ══════════════════════════════════════════════════════════
   Animation loop
   ══════════════════════════════════════════════════════════ */

const clock = new THREE.Clock()

function animate() {
  requestAnimationFrame(animate)

  const delta   = clock.getDelta()
  const elapsed = clock.getElapsedTime()

  /* Cube scale */
  const s = params.cubeScale
  cubeGroup.scale.set(s, s, s)

  /* Rotation */
  updateCubeRotation(elapsed)

  /* Subsystem updates */
  glassCube.update(elapsed)
  particles.update(delta)
  controls.update()

  renderer.render(scene, camera)
}

animate()
