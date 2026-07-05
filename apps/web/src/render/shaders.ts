/** Fragment shaders for GL render layers. Shared contract:
 *  u_src   = chain input (previous layer output)
 *  u_orig  = untouched source frame
 *  u_mask  = routed mask/edge texture (R channel)
 *  u_flow  = packed flow (RG = uv*0.5+0.5, scaled by u_flowScale px)
 *  u_prev  = layer's own feedback buffer (stateful layers)
 *  u_opacity / u_blend apply the layer onto the chain inside each shader.
 */

const COMMON = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 frag;
uniform sampler2D u_src;
uniform sampler2D u_orig;
uniform sampler2D u_mask;
uniform vec2 u_res;
uniform float u_frame;
uniform float u_seed;
uniform float u_opacity;
uniform int u_blend;
uniform int u_hasMask;
uniform float u_bass;   // 0..1 low band
uniform float u_mid;    // 0..1 mid band
uniform float u_treble; // 0..1 high band
uniform float u_level;  // 0..1 overall energy
uniform float u_beat;   // 0..1 transient envelope

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float maskAt(vec2 uv) { return u_hasMask == 1 ? texture(u_mask, uv).r : 1.0; }
vec3 applyBlend(vec3 base, vec3 fx) {
  if (u_blend == 1) return min(base + fx, 1.0);            // add
  if (u_blend == 2) return 1.0 - (1.0 - base) * (1.0 - fx); // screen
  if (u_blend == 3) return base * fx;                       // multiply
  return fx;                                                // normal
}
vec4 composite(vec3 base, vec3 fx, float w) {
  return vec4(mix(base, applyBlend(base, fx), clamp(w, 0.0, 1.0) * u_opacity), 1.0);
}
`;

export const SHADERS: Record<string, string> = {
  copy: COMMON + `
void main() { frag = texture(u_src, v_uv); }`,

  // final on-screen blit: GL's bottom-left origin vs image top-left needs one flip
  copy_flip: COMMON + `
void main() {
  vec3 c = texture(u_src, vec2(v_uv.x, 1.0 - v_uv.y)).rgb;
  float pulse = u_level * 0.18 + u_beat * 0.20;
  vec2 center = v_uv - 0.5;
  float vignette = 1.0 - smoothstep(0.18, 0.72, length(center));
  c *= 1.0 + pulse * (0.45 + vignette * 0.55);
  c.r += u_bass * 0.035;
  c.b += u_treble * 0.035;
  frag = vec4(clamp(c, 0.0, 1.0), 1.0);
}`,

  matte_view: COMMON + `
uniform vec3 u_color;
uniform float u_amount;
uniform int u_mode;   // 0 tint, 1 matte, 2 cutout
uniform int u_invert;
void main() {
  vec3 src = texture(u_src, v_uv).rgb;
  float m = maskAt(v_uv);
  if (u_invert == 1) m = 1.0 - m;
  vec3 fx;
  if (u_mode == 1) fx = vec3(m);
  else if (u_mode == 2) fx = src * m;
  else fx = mix(src, u_color, m * clamp(u_amount * (1.0 + u_level * 2.5 + u_beat), 0.0, 1.0));
  frag = composite(src, fx, 1.0);
}`,

  mask_edge_decay: COMMON + `
uniform vec3 u_color;
uniform float u_edgeWidth;
uniform float u_jitter;
uniform int u_mode;  // 0 halo, 1 rot, 2 holes
float edgeBand(vec2 uv, float w) {
  float c = maskAt(uv);
  float mn = c, mx = c;
  for (int i = 0; i < 8; i++) {
    float a = 6.2831 * float(i) / 8.0;
    float s = maskAt(uv + vec2(cos(a), sin(a)) * w);
    mn = min(mn, s); mx = max(mx, s);
  }
  return mx - mn;
}
void main() {
  vec3 src = texture(u_src, v_uv).rgb;
  float jitter = u_jitter * (1.0 + u_bass * 4.0 + u_beat * 2.0);
  vec2 juv = v_uv + (vec2(hash(vec3(v_uv * 31.0, u_seed + u_frame)),
                          hash(vec3(v_uv * 47.0, u_seed + u_frame + 9.0))) - 0.5)
                    * jitter * u_edgeWidth * 2.0;
  float e = edgeBand(juv, u_edgeWidth);
  vec3 fx;
  if (u_mode == 1) { // rot: displace source inside the band
    vec2 d = (vec2(hash(vec3(floor(v_uv * u_res / 6.0), u_seed + u_frame)),
                   hash(vec3(floor(v_uv * u_res / 6.0), u_seed + u_frame + 3.0))) - 0.5)
             * e * u_edgeWidth * 14.0;
    fx = mix(src, texture(u_orig, v_uv + d).rgb + u_color * e * 0.25, e);
  } else if (u_mode == 2) { // holes
    float h = step(0.55, hash(vec3(floor(v_uv * u_res / 4.0), u_seed + floor(u_frame / 2.0))));
    fx = mix(src, vec3(0.0), e * h);
  } else {
    fx = src + u_color * e;
  }
  frag = composite(src, fx, 1.0);
}`,

  ascii_shader: COMMON + `
uniform sampler2D u_atlas;
uniform float u_cellSize;
uniform float u_nGlyphs;
uniform int u_region;     // 0 all, 1 inside, 2 outside
uniform int u_colorMode;  // 0 mono, 1 source
uniform vec3 u_color;
uniform float u_contrast;
uniform float u_flicker;
void main() {
  vec3 src = texture(u_src, v_uv).rgb;
  vec2 cells = u_res / u_cellSize;
  vec2 cellId = floor(v_uv * cells);
  vec2 cellUV = (cellId + 0.5) / cells;
  vec3 c = texture(u_src, cellUV).rgb;
  float contrast = u_contrast * (1.0 + u_level * 1.5);
  float flicker = u_flicker + u_treble * 0.9 + u_beat * 0.35;
  float luma = clamp(dot(c, vec3(0.299, 0.587, 0.114)) * contrast, 0.0, 1.0);
  luma += (hash(vec3(cellId, u_seed + u_frame)) - 0.5) * flicker * 2.0;
  float gi = clamp(floor(luma * u_nGlyphs), 0.0, u_nGlyphs - 1.0);
  vec2 inCell = fract(v_uv * cells);
  float g = texture(u_atlas, vec2((gi + inCell.x) / u_nGlyphs, inCell.y)).r;
  vec3 glyphCol = u_colorMode == 1 ? c * 1.4 : u_color;
  vec3 ascii = glyphCol * g;
  float m = maskAt(v_uv);
  float region = u_region == 0 ? 1.0 : (u_region == 1 ? m : 1.0 - m);
  frag = composite(src, mix(src, ascii, region), 1.0);
}`,

  pixel_sort: COMMON + `
uniform sampler2D u_sorted;
uniform int u_hasSorted;
void main() {
  vec3 src = texture(u_src, v_uv).rgb;
  if (u_hasSorted == 0) { frag = vec4(src, 1.0); return; }
  vec3 fx = texture(u_sorted, v_uv).rgb;
  frag = composite(src, fx, 1.0);
}`,

  flow_smear: COMMON + `
uniform sampler2D u_flow;
uniform sampler2D u_prev;
uniform float u_flowScale;
uniform float u_strength;
uniform float u_decay;
uniform int u_region;
void main() {
  vec3 src = texture(u_src, v_uv).rgb;
  vec2 f = (texture(u_flow, v_uv).rg * 2.0 - 1.0) * u_flowScale;
  vec2 disp = f * (u_strength * (1.0 + u_level * 4.0 + u_beat * 1.5)) / u_res;
  vec3 prev = texture(u_prev, clamp(v_uv - disp, 0.0, 1.0)).rgb;
  float m = maskAt(v_uv);
  float region = u_region == 0 ? 1.0 : (u_region == 1 ? m : 1.0 - m);
  vec3 fx = mix(src, prev, u_decay * region);
  frag = composite(src, fx, 1.0);
}`,

  body_parts: COMMON + `
uniform sampler2D u_field;
uniform int u_hasField;
uniform int u_mode;       // 0 colorize, 1 isolate
uniform float u_selectId; // part id to isolate
uniform vec3 u_color;
uniform float u_saturation;
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
void main() {
  vec3 src = texture(u_src, v_uv).rgb;
  if (u_hasField == 0) { frag = vec4(src, 1.0); return; }
  float id = floor(texture(u_field, v_uv).r * 255.0 + 0.5);
  vec3 fx; float w;
  if (u_mode == 1) {
    w = abs(id - u_selectId) < 0.5 ? 1.0 : 0.0;
    fx = mix(src, u_color, w);
    frag = composite(src, fx, w);
    return;
  }
  float on = id > 0.5 ? 1.0 : 0.0;
  vec3 col = hsv2rgb(vec3(fract(id * 0.1396), u_saturation, 1.0));
  frag = composite(src, mix(src, col, on), on);
}`,

  sapiens_depth: COMMON + `
uniform sampler2D u_field;
uniform int u_hasField;
uniform int u_mode;   // 0 colormap, 1 tint, 2 fog
uniform vec3 u_color;
vec3 ramp(float t) {
  vec3 c0 = vec3(0.02, 0.02, 0.09);
  vec3 c1 = vec3(0.35, 0.05, 0.43);
  vec3 c2 = vec3(0.92, 0.36, 0.05);
  vec3 c3 = vec3(1.0, 0.98, 0.78);
  if (t < 0.33) return mix(c0, c1, t / 0.33);
  if (t < 0.66) return mix(c1, c2, (t - 0.33) / 0.33);
  return mix(c2, c3, (t - 0.66) / 0.34);
}
void main() {
  vec3 src = texture(u_src, v_uv).rgb;
  if (u_hasField == 0) { frag = vec4(src, 1.0); return; }
  float d = texture(u_field, v_uv).r;
  float present = d > 0.004 ? 1.0 : 0.0; // background encodes ~0
  vec3 fx;
  if (u_mode == 1) fx = mix(src, u_color, d);
  else if (u_mode == 2) fx = src * mix(0.15, 1.0, d);
  else fx = ramp(d);
  frag = composite(src, fx, present);
}`,

  sapiens_normals: COMMON + `
uniform sampler2D u_field;
uniform int u_hasField;
uniform int u_mode;  // 0 rgb, 1 relief
void main() {
  vec3 src = texture(u_src, v_uv).rgb;
  if (u_hasField == 0) { frag = vec4(src, 1.0); return; }
  vec3 n = texture(u_field, v_uv).rgb;
  float present = length(n - 0.5) > 0.02 ? 1.0 : 0.0;
  vec3 fx;
  if (u_mode == 1) {
    vec3 nv = normalize(n * 2.0 - 1.0);
    float light = clamp(dot(nv, normalize(vec3(0.4, 0.6, 0.7))), 0.0, 1.0);
    fx = src * (0.4 + 0.9 * light);
  } else {
    fx = n;
  }
  frag = composite(src, fx, present);
}`,

  depth_displace: COMMON + `
uniform sampler2D u_field;
uniform int u_hasField;
uniform float u_strength;
uniform int u_mode;   // 0 relief (gradient refraction), 1 parallax (shift by depth)
void main() {
  vec3 src = texture(u_src, v_uv).rgb;
  if (u_hasField == 0) { frag = vec4(src, 1.0); return; }
  vec2 e = 1.5 / u_res;
  float d = texture(u_field, v_uv).r;
  float present = d > 0.004 ? 1.0 : 0.0;
  // audio energy adds a live push to the displacement amount
  float amt = u_strength * (1.0 + u_level * 2.0 + u_beat * 1.5);
  vec2 disp;
  if (u_mode == 1) {
    disp = vec2((d - 0.5) * amt * 0.15, 0.0);
  } else {
    float dx = texture(u_field, v_uv + vec2(e.x, 0.0)).r - texture(u_field, v_uv - vec2(e.x, 0.0)).r;
    float dy = texture(u_field, v_uv + vec2(0.0, e.y)).r - texture(u_field, v_uv - vec2(0.0, e.y)).r;
    disp = vec2(dx, dy) * amt * 0.5;
  }
  vec3 fx = texture(u_src, clamp(v_uv + disp * present, 0.0, 1.0)).rgb;
  frag = composite(src, fx, present);
}`,

  // the donor clip's ACTUAL pixels blended into this clip — the "I can see the
  // other video through it" part of the original cross-clip glitch
  ghost_blend: COMMON + `
uniform sampler2D u_ghost;
uniform int u_hasGhost;
uniform int u_mode;    // 0 screen, 1 difference, 2 subject (donor-mask gated), 3 luma-key
uniform float u_amount;
uniform float u_key;
void main() {
  vec3 src = texture(u_src, v_uv).rgb;
  if (u_hasGhost == 0) { frag = vec4(src, 1.0); return; }
  vec3 g = texture(u_ghost, v_uv).rgb;
  float gate = 1.0;
  if (u_mode == 2) gate = maskAt(v_uv);                     // donor's subject only
  else if (u_mode == 3) {                                   // bright parts only
    float gLuma = dot(g, vec3(0.299, 0.587, 0.114));
    gate = smoothstep(u_key, u_key + 0.18, gLuma);
  }
  vec3 fx;
  if (u_mode == 1) fx = abs(src - g);                       // difference
  else fx = 1.0 - (1.0 - src) * (1.0 - g);                  // screen
  float w = gate * u_amount * (1.0 + u_level * 0.6 + u_beat * 0.5);
  frag = composite(src, mix(src, fx, clamp(w, 0.0, 1.0)), 1.0);
}`,

  datamosh_preview: COMMON + `
uniform sampler2D u_flow;
uniform sampler2D u_prev;
uniform float u_flowScale;
uniform float u_strength;
uniform float u_decay;
uniform float u_blockSize;
uniform float u_edgeLeak;
uniform int u_mode; // 0 subject, 1 background
void main() {
  vec3 src = texture(u_src, v_uv).rgb;
  vec2 blockUV = (floor(v_uv * u_res / u_blockSize) * u_blockSize + u_blockSize * 0.5) / u_res;
  vec2 f = (texture(u_flow, blockUV).rg * 2.0 - 1.0) * u_flowScale;
  f += (vec2(hash(vec3(blockUV, u_seed + u_frame)),
             hash(vec3(blockUV, u_seed + u_frame + 5.0))) - 0.5) * 1.5;
  vec2 disp = f / u_res;
  vec3 prev = texture(u_prev, clamp(v_uv - disp, 0.0, 1.0)).rgb;
  float m = maskAt(v_uv);
  // edge leak: widen the region by sampling a blurred neighborhood
  float leak = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = 6.2831 * float(i) / 4.0;
    leak = max(leak, maskAt(v_uv + vec2(cos(a), sin(a)) * u_edgeLeak * 0.04));
  }
  m = max(m, leak * 0.6);
  if (u_mode == 1) m = 1.0 - m;
  float strength = clamp(u_strength + u_beat * 0.9 + u_bass * 0.25, 0.0, 1.0);
  vec3 fx = mix(src, prev, u_decay * m * strength);
  frag = composite(src, fx, 1.0);
}`,
};

/** Build the glyph atlas for the ASCII shader: density ramp, 1 row. */
export function buildGlyphAtlas(): { canvas: HTMLCanvasElement; nGlyphs: number } {
  const glyphs = " .:-=+*#%@".split("");
  const cell = 32;
  const canvas = document.createElement("canvas");
  canvas.width = cell * glyphs.length;
  canvas.height = cell;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = `${cell * 0.8}px "Consolas", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  glyphs.forEach((g, i) => ctx.fillText(g, i * cell + cell / 2, cell / 2 + 1));
  return { canvas, nGlyphs: glyphs.length };
}
