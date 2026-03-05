/**
 * Glass Cube — inspired by Apple Fifth Avenue WebGL demo
 * https://github.com/lorenzocadamuro/apple-fifth-avenue
 *
 * Transparent cube with animated rainbow-colored borders
 * and Fresnel-based glass reflection.
 */

import * as THREE from 'three'

/* ── Vertex Shader ───────────────────────────────────── */

const cubeVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vDepth;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    vDepth = -mvPosition.z;

    gl_Position = projectionMatrix * mvPosition;
  }
`

/* ── Fragment Shader ─────────────────────────────────── */

const cubeFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uBorderWidth;
  uniform float uBorderOpacity;
  uniform float uFaceOpacity;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vDepth;

  const float PI2 = 6.283185307179586;

  /* Border detection — from Apple Fifth Avenue */
  float borders(vec2 uv, float strokeWidth) {
    vec2 bl = smoothstep(vec2(0.0), vec2(strokeWidth), uv);
    vec2 tr = smoothstep(vec2(0.0), vec2(strokeWidth), 1.0 - uv);
    return 1.0 - bl.x * bl.y * tr.x * tr.y;
  }

  /* Animated radial rainbow — from Apple Fifth Avenue */
  vec3 radialRainbow(vec2 st, float tick) {
    vec2 toCenter = vec2(0.5) - st;
    float angle = mod(
      (atan(toCenter.y, toCenter.x) / PI2) + 0.5 + sin(tick * 0.5),
      1.0
    );

    vec3 a = vec3(0.15, 0.58, 0.96);
    vec3 b = vec3(0.29, 1.00, 0.55);
    vec3 c = vec3(1.00, 0.00, 0.85);
    vec3 d = vec3(0.92, 0.20, 0.14);
    vec3 e = vec3(1.00, 0.96, 0.32);

    float s = 0.1; // 1/10

    vec3 col = a;
    col = mix(col, b, smoothstep(s * 1.0, s * 2.0, angle));
    col = mix(col, a, smoothstep(s * 2.0, s * 3.0, angle));
    col = mix(col, b, smoothstep(s * 3.0, s * 4.0, angle));
    col = mix(col, c, smoothstep(s * 4.0, s * 5.0, angle));
    col = mix(col, d, smoothstep(s * 5.0, s * 6.0, angle));
    col = mix(col, c, smoothstep(s * 6.0, s * 7.0, angle));
    col = mix(col, d, smoothstep(s * 7.0, s * 8.0, angle));
    col = mix(col, e, smoothstep(s * 8.0, s * 9.0, angle));
    col = mix(col, a, smoothstep(s * 9.0, s * 10.0, angle));

    return col;
  }

  void main() {
    /* ── border glow ────────────────────────────────── */
    float border      = borders(vUv, uBorderWidth);
    float borderOuter = borders(vUv, uBorderWidth * 3.0);

    vec3 rainbow = radialRainbow(vUv, uTime);

    /* depth fade — further faces are dimmer */
    float depthFade = clamp(smoothstep(2.0, 8.0, vDepth), 0.45, 1.0);

    vec3 edgeColor   = rainbow * border * depthFade;
    float edgeAlpha  = border * uBorderOpacity * depthFade;

    vec3 outerColor  = rainbow * 0.25 * borderOuter * depthFade;
    float outerAlpha = borderOuter * uBorderOpacity * 0.25 * depthFade;

    /* ── fresnel glass tint ─────────────────────────── */
    vec3 normal   = gl_FrontFacing ? vNormal : -vNormal;
    float fresnel = pow(1.0 - abs(dot(normalize(vViewDir), normal)), 3.0);

    vec3 fresnelCol   = rainbow * fresnel * 0.2;
    float fresnelAlph = fresnel * uFaceOpacity;

    /* ── combine ────────────────────────────────────── */
    vec3  finalColor = edgeColor + outerColor + fresnelCol;
    float finalAlpha = max(max(edgeAlpha, outerAlpha), fresnelAlph);

    gl_FragColor = vec4(finalColor, finalAlpha);
  }
`

/* ── Public API ──────────────────────────────────────── */

export class GlassCube {
  /**
   * @param {THREE.Object3D} parent  — group to add the mesh to
   * @param {object} params          — shared params object (mutated by GUI)
   */
  constructor(parent, params) {
    this.params = params

    const geometry = new THREE.BoxGeometry(2, 2, 2)

    this.material = new THREE.ShaderMaterial({
      vertexShader: cubeVertexShader,
      fragmentShader: cubeFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uBorderWidth: { value: params.borderWidth },
        uBorderOpacity: { value: params.borderOpacity },
        uFaceOpacity: { value: params.faceOpacity },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    })

    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.renderOrder = 10 // render after particles
    parent.add(this.mesh)
  }

  /** Call every frame with elapsed seconds. */
  update(elapsed) {
    const u = this.material.uniforms
    u.uTime.value = elapsed
    u.uBorderWidth.value = this.params.borderWidth
    u.uBorderOpacity.value = this.params.borderOpacity
    u.uFaceOpacity.value = this.params.faceOpacity
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
