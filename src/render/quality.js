// Graphics presets and automatic quality. Low keeps a 2016 laptop (Intel HD 520) smooth; Ultra is for
// strong GPUs. Auto starts from a guess based on the GPU name, then holds ~55 fps by nudging resolution.
export const PRESETS = {
  low:    { label: 'Low',    pr: [0.6, 0.85], shadow: 0,    aa: 'none', bloom: 0,   ao: 0,   reflect: false, transmission: false, particles: 0.15, envRes: 0.03 },
  medium: { label: 'Medium', pr: [0.8, 1],    shadow: 1024, aa: 'fxaa', bloom: 0.5, ao: 0,   reflect: false, transmission: false, particles: 0.4,  envRes: 0.04 },
  high:   { label: 'High',   pr: [0.9, 1.25], shadow: 2048, aa: 'smaa', bloom: 1,   ao: 0.5, reflect: false, transmission: false, particles: 1,    envRes: 0.04 },
  ultra:  { label: 'Ultra',  pr: [1, 2],      shadow: 4096, aa: 'smaa', bloom: 1,   ao: 1,   reflect: true,  transmission: true,  particles: 1.5,  envRes: 0.04 },
};
export const ORDER = ['low', 'medium', 'high', 'ultra'];

// GPU name -> starting tier (UNMASKED_RENDERER_WEBGL; Chrome may blur it, so be conservative).
export function guessTier(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '';
  const n = name.toLowerCase();
  let tier = 'medium';
  if (/swiftshader|llvmpipe|software|microsoft basic/.test(n)) tier = 'low';
  else if (/intel.*(hd|uhd)|mali|adreno [1-5]|powervr|9[0-9]{2}m|mx ?[1-3]/.test(n)) tier = 'low';
  else if (/iris|radeon\(tm\) graphics|vega [3-8]|gtx 10|mx ?[45]/.test(n)) tier = 'medium';
  else if (/rtx [2-3]0[5-6]0|gtx 16|rx 5[5-7]|apple m1|arc a3/.test(n)) tier = 'high';
  else if (/rtx|rx [6-9]\d{3}|apple m[2-9]|arc a7/.test(n)) tier = 'ultra';
  return { tier, name };
}

// Dynamic resolution: every 0.5 s compare the frame rate with the target and move the pixel ratio
// inside the preset's range. Drops faster than it rises so it never oscillates.
export class AutoScaler {
  constructor(target = 55) { this.target = target; this.acc = 0; this.n = 0; this.scale = 1; }
  sample(dt, range) {
    this.acc += dt; this.n++;
    if (this.acc < 0.5) return null;
    const fps = this.n / this.acc; this.acc = 0; this.n = 0;
    const [lo, hi] = range;
    if (fps < this.target - 8) this.scale = Math.max(lo, this.scale * 0.85);
    else if (fps > this.target + 4) this.scale = Math.min(hi, this.scale * 1.05);
    return { fps, pr: this.scale };
  }
}
