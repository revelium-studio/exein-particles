/**
 * Exein Particles
 *
 * Glass cube (Apple Fifth Avenue style) with GPU-computed fluid particles
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
  Fire:     { color1: '#1a0000', color2: '#cc3300', color3: '#ff9900', color4: '#ffff66' },
  Ocean:    { color1: '#000033', color2: '#0066cc', color3: '#00cccc', color4: '#ccffff' },
  Emerald:  { color1: '#001a00', color2: '#009933', color3: '#66ff66', color4: '#eeffee' },
  Neon:     { color1: '#0a001a', color2: '#6600ff', color3: '#ff00aa', color4: '#ffccff' },
  Exein:    { color1: '#0a0a2e', color2: '#00b4d8', color3: '#90e0ef', color4: '#caf0f8' },
}

/* ══════════════════════════════════════════════════════════
   Shared params object — GUI binds directly to this
   ══════════════════════════════════════════════════════════ */

const params = {
  /* Particles */
  particleCount: 150000,
  pointSize: 0.5,
  opacity: 0.06,
  brightness: 1.0,
  speedScale: 5.0,
  additiveBlending: true,

  /* Physics */
  gravity: -0.4,
  turbulence: 3.4,
  turbulenceFrequency: 3.5,
  damping: 0.922,
  bounce: 0.65,

  /* Wave */
  waveAmplitude: 2.0,
  waveFrequency: 2.0,
  waveSpeed: 1.0,

  /* Colors */
  preset: 'Neon',
  color1: '#0a001a',
  color2: '#6600ff',
  color3: '#ff00aa',
  color4: '#ffccff',

  /* Cube */
  borderWidth: 0.031,
  borderOpacity: 0.85,
  faceOpacity: 0.0,
  rotationSpeed: 0.5,
  cubeScale: 1.0,
  autoRotate: true,

  /* Scene */
  backgroundColor: '#080810',
}

/* ══════════════════════════════════════════════════════════
   Scene setup
   ══════════════════════════════════════════════════════════ */

let renderer, scene, camera, controls, clock
let cubeGroup, glassCube, particles
let gui

function init() {
  /* ── Renderer ── */
  const canvas = document.getElementById('webgl-canvas')
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2

  /* ── Scene & Camera ── */
  scene  = new THREE.Scene()
  scene.background = new THREE.Color(params.backgroundColor)

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.set(0, 0, 5.7)

  /* ── Controls ── */
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping  = true
  controls.dampingFactor  = 0.07
  controls.minDistance     = 2
  controls.maxDistance     = 15

  /* ── Clock ── */
  clock = new THREE.Clock()

  /* ── Cube group (rotation target) ── */
  cubeGroup = new THREE.Group()
  scene.add(cubeGroup)

  /* Start with a gentle 3/4 view so it always reads as a cube */
  cubeGroup.rotation.x = 0.35
  cubeGroup.rotation.y = -0.45

  /* ── Glass cube mesh ── */
  glassCube = new GlassCube()
  cubeGroup.add(glassCube)

  /* ── Particle system (GPU computed) ── */
  particles = new ParticleSystem(cubeGroup, params, renderer)

  /* ── Lights ── */
  scene.add(new THREE.AmbientLight(0xffffff, 0.5))
  const dir = new THREE.DirectionalLight(0xffffff, 1)
  dir.position.set(2, 3, 4)
  scene.add(dir)

  /* ── GUI ── */
  buildGUI()

  /* ── Events ── */
  window.addEventListener('resize', onResize)
}

/* ══════════════════════════════════════════════════════════
   GUI
   ══════════════════════════════════════════════════════════ */

function buildGUI() {
  gui = new GUI({ container: document.getElementById('gui-container') })
  gui.title('EXEIN PARTICLES')

  /* ── Particles ── */
  const pf = gui.addFolder('Particles')
  pf.add(params, 'particleCount', 1000, 260000, 1000).name('Count')
  pf.add(params, 'pointSize', 0.02, 4.0, 0.01).name('Size')
  pf.add(params, 'opacity', 0.005, 0.5, 0.005).name('Opacity')
  pf.add(params, 'brightness', 0.1, 3.0, 0.05).name('Brightness')
  pf.add(params, 'speedScale', 0.5, 30.0, 0.5).name('Speed Scale')
  pf.add(params, 'additiveBlending').name('Additive Blend')
  pf.add({ reset: () => particles.reset() }, 'reset').name('⟳ Reset Particles')
  pf.open()

  /* ── Physics ── */
  const phys = gui.addFolder('Physics')
  phys.add(params, 'gravity', -20, 20, 0.1).name('Gravity')
  phys.add(params, 'turbulence', 0, 10, 0.1).name('Turbulence')
  phys.add(params, 'turbulenceFrequency', 0.1, 10, 0.1).name('Turb. Frequency')
  phys.add(params, 'damping', 0.8, 0.999, 0.001).name('Damping')
  phys.add(params, 'bounce', 0, 1, 0.01).name('Bounce')
  phys.open()

  /* ── Wave ── */
  const wave = gui.addFolder('Wave Motion')
  wave.add(params, 'waveAmplitude', 0, 10, 0.1).name('Amplitude')
  wave.add(params, 'waveFrequency', 0.1, 10, 0.1).name('Frequency')
  wave.add(params, 'waveSpeed', 0, 5, 0.1).name('Speed')
  wave.open()

  /* ── Colors ── */
  const cf = gui.addFolder('Colors')
  cf.add(params, 'preset', Object.keys(COLOR_PRESETS)).name('Preset').onChange(v => {
    const c = COLOR_PRESETS[v]
    Object.assign(params, c)
    gui.controllersRecursive().forEach(ctrl => ctrl.updateDisplay())
  })
  cf.addColor(params, 'color1').name('Cold')
  cf.addColor(params, 'color2').name('Warm')
  cf.addColor(params, 'color3').name('Hot')
  cf.addColor(params, 'color4').name('Peak')

  /* ── Cube ── */
  const cb = gui.addFolder('Cube')
  cb.add(params, 'borderWidth', 0, 0.15, 0.001).name('Border Width').onChange(v => {
    glassCube.material.uniforms.uBorderWidth.value = v
  })
  cb.add(params, 'borderOpacity', 0, 1, 0.01).name('Border Opacity').onChange(v => {
    glassCube.material.uniforms.uBorderOpacity.value = v
  })
  cb.add(params, 'faceOpacity', 0, 0.3, 0.005).name('Face Opacity').onChange(v => {
    glassCube.material.uniforms.uFaceOpacity.value = v
  })
  cb.add(params, 'rotationSpeed', 0, 3, 0.01).name('Rotation Speed')
  cb.add(params, 'cubeScale', 0.3, 3, 0.01).name('Scale').onChange(v => {
    cubeGroup.scale.setScalar(v)
  })
  cb.add(params, 'autoRotate').name('Auto Rotate')
  cb.close()

  /* ── Scene ── */
  const sf = gui.addFolder('Scene')
  sf.addColor(params, 'backgroundColor').name('Background').onChange(v => {
    scene.background.set(v)
  })
  sf.close()

  /* ── Export / Import ── */
  const ef = gui.addFolder('Export / Import')
  ef.add({
    copy() {
      const json = JSON.stringify(params, null, 2)
      navigator.clipboard.writeText(json).then(() => alert('Params JSON copied!'))
    }
  }, 'copy').name('📋 Copy Params JSON')
  ef.add({
    paste() {
      const raw = prompt('Paste params JSON:')
      if (!raw) return
      try {
        const obj = JSON.parse(raw)
        Object.assign(params, obj)
        gui.controllersRecursive().forEach(c => c.updateDisplay())
        /* Propagate cube uniforms */
        glassCube.material.uniforms.uBorderWidth.value  = params.borderWidth
        glassCube.material.uniforms.uBorderOpacity.value = params.borderOpacity
        glassCube.material.uniforms.uFaceOpacity.value  = params.faceOpacity
        cubeGroup.scale.setScalar(params.cubeScale)
        scene.background.set(params.backgroundColor)
      } catch (e) { alert('Invalid JSON: ' + e.message) }
    }
  }, 'paste').name('📥 Paste Params JSON')
  ef.close()
}

/* ══════════════════════════════════════════════════════════
   Resize
   ══════════════════════════════════════════════════════════ */

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

/* ══════════════════════════════════════════════════════════
   Animation loop
   ══════════════════════════════════════════════════════════ */

function animate() {
  requestAnimationFrame(animate)

  const dt = clock.getDelta()

  /* Cube auto-rotation — always a gentle spin so shape is clear */
  if (params.autoRotate) {
    cubeGroup.rotation.y += params.rotationSpeed * dt * 0.5
  }

  /* Update particles (GPU compute + render uniform sync) */
  particles.update(dt)

  controls.update()
  renderer.render(scene, camera)
}

/* ── Bootstrap ── */
init()
animate()
