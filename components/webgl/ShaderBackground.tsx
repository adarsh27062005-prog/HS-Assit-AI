"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uMouse;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv * 3.0;
    float t = uTime * 0.06;

    float n = fbm(p + vec2(t, -t) + uMouse * 0.5);
    float n2 = fbm(p * 1.7 + vec2(-t * 0.7, t * 0.5) + n);

    vec3 c1 = vec3(0.02, 0.03, 0.10);  // deep navy
    vec3 c2 = vec3(0.17, 0.10, 0.46);  // violet
    vec3 c3 = vec3(0.06, 0.42, 0.60);  // teal

    vec3 col = mix(c1, c2, smoothstep(0.2, 0.85, n));
    col = mix(col, c3, smoothstep(0.3, 0.95, n2) * 0.55);

    // vignette
    float d = distance(uv, vec2(0.5));
    col *= 1.0 - d * 0.7;

    // mouse glow
    float m = 1.0 - distance(uv, uMouse);
    col += vec3(0.22, 0.16, 0.38) * pow(max(m, 0.0), 3.0) * 0.55;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export default function ShaderBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      return; // WebGL unavailable — the CSS background remains as fallback.
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms = {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    };

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const clock = new THREE.Clock();
    const target = new THREE.Vector2(0.5, 0.5);
    let raf = 0;

    const render = () => {
      uniforms.uTime.value = clock.getElapsedTime();
      uniforms.uMouse.value.lerp(target, 0.05);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };
    render();

    const onResize = () => renderer.setSize(window.innerWidth, window.innerHeight);
    const onMove = (e: MouseEvent) =>
      target.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);

    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMove);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
    />
  );
}
