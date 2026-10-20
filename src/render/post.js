// Post-processing chain, rebuilt whenever the preset changes:
// render -> ambient occlusion (GTAO) -> bloom -> tone map + sRGB (OutputPass) -> grade/vignette -> anti-aliasing.
// Low skips the composer entirely and renders straight to the screen.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

// Gentle film grade: lift blacks a touch, vignette, very fine grain so gradients don't band.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.32 }, grain: { value: 0.012 }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vignette, grain, time; varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5; float v = 1.0 - vignette * dot(d, d) * 2.2;
      c.rgb = c.rgb * v + (h(vUv * 911.0) - 0.5) * grain;
      gl_FragColor = c;
    }`,
};

export class Pipeline {
  constructor(renderer, scene, camera) { this.renderer = renderer; this.scene = scene; this.camera = camera; this.composer = null; this.dof = null; }
  build(preset, w, h) {
    this.dispose();
    this.preset = preset;
    const r = this.renderer;
    r.toneMapping = THREE.AgXToneMapping;
    if (preset.aa === 'none' && !preset.bloom && !preset.ao) { this.composer = null; return; }
    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
    const c = new EffectComposer(r, target);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (preset.ao) {
      const ao = new GTAOPass(this.scene, this.camera, w * preset.ao, h * preset.ao);
      ao.output = GTAOPass.OUTPUT.Default; ao.blendIntensity = 0.85;
      ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1.5, scale: 1.1, samples: preset.ao < 1 ? 8 : 16 });
      c.addPass(ao); this.ao = ao;
    }
    if (preset.bloom) {
      const b = new UnrealBloomPass(new THREE.Vector2(w * preset.bloom, h * preset.bloom), 0.4, 0.45, this.bloomThreshold ?? 1.2);
      c.addPass(b); this.bloom = b;
    }
    this.dof = new BokehPass(this.scene, this.camera, { focus: 8, aperture: 0.004, maxblur: 0.008 }); this.dof.enabled = false; c.addPass(this.dof);
    c.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader); c.addPass(this.grade);
    if (preset.aa === 'smaa') c.addPass(new SMAAPass());
    if (preset.aa === 'fxaa') { const f = new ShaderPass(FXAAShader); f.uniforms.resolution.value.set(1 / w, 1 / h); this.fxaa = f; c.addPass(f); }
    this.composer = c;
    this.setSize(w, h);
  }
  setBloom(threshold) { this.bloomThreshold = threshold; if (this.bloom) this.bloom.threshold = threshold; }
  setSize(w, h) {
    if (!this.composer) return;
    this.composer.setSize(w, h);
    if (this.fxaa) this.fxaa.uniforms.resolution.value.set(1 / (w * this.renderer.getPixelRatio()), 1 / (h * this.renderer.getPixelRatio()));
  }
  render(dt) {
    if (!this.composer) { this.renderer.render(this.scene, this.camera); return; }
    if (this.grade) this.grade.uniforms.time.value = (this.grade.uniforms.time.value + dt) % 100;
    this.composer.render(dt);
  }
  dispose() { if (this.composer) { this.composer.passes.forEach((p) => p.dispose && p.dispose()); this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); } this.composer = null; this.ao = this.bloom = this.fxaa = this.grade = null; }
}
