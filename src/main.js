/**
 * Exein Particles
 *
 * Glass cube (Apple Fifth Avenue style) with contained fluid particles
 * and a modern GUI for full parameter control.
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
}

/* ══════════════════════════════════════════════════════════
   Shared params — all values controlled by the GUI
   ══════════════════════════════════════════════════════════ */

const params = {
  /* Particles */
  particleCount: 50000,
  pointSize: 3.5,
  brightness: 1.5,
  additiveBlending: true,

  /* Physics */
  gravity: 1.5,
  turbulence: 2.0,
  turbulenceFrequency: 1.5,
  damping: 0.985,
  bounce: 0.6,

  /* Colors */
  preset: 'Inferno',
  color1: '#0d0829',
  color2: '#b12a90',
  color3: '#e8632c',
  color4: '#fcffa4',

  /* Cube */
  borderWidth: 0.012,
  borderOpacity: 0.85,
  faceOpacity: 0.06,
  rotationSpeed: 0.5,
  cubeScale: 1.0,
  autoRotate: true,

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
camera.position.set(0, 0, 5.7)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.06
controls.minDistance = 2
controls.maxDistance = 20
controls.target.set(0, 0, 0)
controls.update()

/* ══════════════════════════════════════════════════════════
   Scene objects
   ══════════════════════════════════════════════════════════ */

/* Group that rotates the cube + particles together */
const cubeGroup = new THREE.Group()
scene.add(cubeGroup)

const glassCube = new GlassCube(cubeGroup, params)
const particles = new ParticleSystem(cubeGroup, params)

/* Subtle ambient light (helps if we later add mesh-based particles) */
scene.add(new THREE.AmbientLight(0xffffff, 0.5))

/* ══════════════════════════════════════════════════════════
   GUI
   ══════════════════════════════════════════════════════════ */

const gui = new GUI({ width: 300, title: '✦  EXEIN PARTICLES' })

/* ── Particles ──────────────────────────────────────────── */
const fParticles = gui.addFolder('Particles')
fParticles.add(params, 'particleCount', 1000, 150000, 1000).name('Count')
fParticles.add(params, 'pointSize', 0.5, 15, 0.1).name('Size')
fParticles.add(params, 'brightness', 0.1, 5, 0.05).name('Brightness')
fParticles.add(params, 'additiveBlending').name('Additive Blend')
fParticles.add({ reset: () => particles.reset() }, 'reset').name('↻  Reset Particles')

/* ── Physics ────────────────────────────────────────────── */
const fPhysics = gui.addFolder('Physics')
fPhysics.add(params, 'gravity', -5, 10, 0.1).name('Gravity')
fPhysics.add(params, 'turbulence', 0, 10, 0.1).name('Turbulence')
fPhysics.add(params, 'turbulenceFrequency', 0.1, 8, 0.1).name('Turb. Frequency')
fPhysics.add(params, 'damping', 0.9, 0.999, 0.001).name('Damping')
fPhysics.add(params, 'bounce', 0, 1, 0.05).name('Bounce')

/* ── Colors ─────────────────────────────────────────────── */
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

/* ── Cube ───────────────────────────────────────────────── */
const fCube = gui.addFolder('Cube')
fCube.add(params, 'borderWidth', 0.002, 0.06, 0.001).name('Border Width')
fCube.add(params, 'borderOpacity', 0, 1, 0.01).name('Border Opacity')
fCube.add(params, 'faceOpacity', 0, 0.3, 0.005).name('Face Opacity')
fCube.add(params, 'rotationSpeed', 0, 2, 0.01).name('Rotation Speed')
fCube.add(params, 'cubeScale', 0.3, 3, 0.01).name('Scale')
fCube.add(params, 'autoRotate').name('Auto Rotate')

/* ── Scene ──────────────────────────────────────────────── */
const fScene = gui.addFolder('Scene')
fScene.addColor(params, 'backgroundColor').name('Background').onChange((v) => {
  renderer.setClearColor(new THREE.Color(v), 1)
})

/* Close some folders by default for a cleaner initial view */
fPhysics.close()
fCube.close()
fScene.close()

/* ══════════════════════════════════════════════════════════
   Rotation helpers (replicates Apple Fifth Avenue motion)
   ══════════════════════════════════════════════════════════ */

const BASE_ROTATION = 4.8 // radians — from the original
const _axis = new THREE.Vector3()
const _q1 = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()

function updateCubeRotation(elapsed) {
  if (!params.autoRotate) return

  const factor = elapsed * params.rotationSpeed

  /* Fixed base rotation around (1,1,1) */
  _q1.setFromAxisAngle(
    new THREE.Vector3(1, 1, 1).normalize(),
    BASE_ROTATION,
  )

  /* Time-varying tumble — axis rotates in XY plane */
  _axis.set(Math.cos(factor), Math.sin(factor), 0.5).normalize()
  _q2.setFromAxisAngle(_axis, factor)

  cubeGroup.quaternion.copy(_q1).multiply(_q2)
}

/* ══════════════════════════════════════════════════════════
   Resize handler
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

  const delta = clock.getDelta()
  const elapsed = clock.getElapsedTime()

  /* Cube scale */
  const s = params.cubeScale
  cubeGroup.scale.set(s, s, s)

  /* Rotation (Apple Fifth Avenue style) */
  updateCubeRotation(elapsed)

  /* Update subsystems */
  glassCube.update(elapsed)
  particles.update(delta)
  controls.update()

  renderer.render(scene, camera)
}

animate()
