/** WebGL2 layer-chain compositor: ping-pong FBOs, per-layer feedback buffers
 * for stateful effects (flow smear, datamosh preview), CPU pixel-sort results
 * injected as textures. */
import type { RenderLayer } from "../types";
import { compileProgram, createTarget, createTexture, hexToRgb, uploadImage, type Target } from "./gl";
import { getFieldBitmap, getFlowFrame, getMaskBitmap } from "./passData";
import { buildGlyphAtlas, SHADERS } from "./shaders";
import { PixelSortManager } from "./pixelsort";

const BLEND_MODES: Record<string, number> = { normal: 0, add: 1, screen: 2, multiply: 3 };

export class Compositor {
  gl: WebGL2RenderingContext;
  width: number;
  height: number;
  private programs = new Map<string, WebGLProgram>();
  private ping: Target;
  private pong: Target;
  private feedback = new Map<string, Target>();
  private srcTex: WebGLTexture;
  private origTex: WebGLTexture;
  private maskTex: WebGLTexture;
  private flowTex: WebGLTexture;
  private sortedTex: WebGLTexture;
  private fieldTex: WebGLTexture;
  private atlasTex: WebGLTexture;
  private nGlyphs: number;
  private blackTex: WebGLTexture;
  private lastFrame = -10;
  pixelSort = new PixelSortManager();

  constructor(public canvas: HTMLCanvasElement, width: number, height: number) {
    canvas.width = width;
    canvas.height = height;
    this.width = width;
    this.height = height;
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 not available");
    this.gl = gl;
    for (const [name, src] of Object.entries(SHADERS)) {
      this.programs.set(name, compileProgram(gl, src));
    }
    this.ping = createTarget(gl, width, height);
    this.pong = createTarget(gl, width, height);
    this.srcTex = createTexture(gl, width, height);
    this.origTex = createTexture(gl, width, height);
    this.maskTex = createTexture(gl, width, height);
    this.flowTex = createTexture(gl, width, height);
    this.sortedTex = createTexture(gl, width, height);
    this.fieldTex = createTexture(gl, width, height);
    this.blackTex = createTexture(gl, 2, 2);
    const atlas = buildGlyphAtlas();
    this.nGlyphs = atlas.nGlyphs;
    this.atlasTex = createTexture(gl, atlas.canvas.width, atlas.canvas.height);
    uploadImage(gl, this.atlasTex, atlas.canvas);
  }

  private bindTex(prog: WebGLProgram, name: string, unit: number, tex: WebGLTexture) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const loc = gl.getUniformLocation(prog, name);
    if (loc) gl.uniform1i(loc, unit);
  }

  private u1f(prog: WebGLProgram, name: string, v: number) {
    const loc = this.gl.getUniformLocation(prog, name);
    if (loc) this.gl.uniform1f(loc, v);
  }
  private u1i(prog: WebGLProgram, name: string, v: number) {
    const loc = this.gl.getUniformLocation(prog, name);
    if (loc) this.gl.uniform1i(loc, v);
  }
  private u3f(prog: WebGLProgram, name: string, v: [number, number, number]) {
    const loc = this.gl.getUniformLocation(prog, name);
    if (loc) this.gl.uniform3f(loc, v[0], v[1], v[2]);
  }

  /** Renders the layer stack for the current frame. */
  render(source: TexImageSource, layers: RenderLayer[], frame: number, videoEl?: HTMLVideoElement) {
    const gl = this.gl;
    uploadImage(gl, this.srcTex, source);
    uploadImage(gl, this.origTex, source);

    const seek = Math.abs(frame - this.lastFrame) > 4 || frame < this.lastFrame;
    this.lastFrame = frame;

    let input = this.srcTex;
    let target = this.ping;
    let other = this.pong;
    gl.viewport(0, 0, this.width, this.height);

    const active = layers.filter((l) => l.enabled && SHADERS[l.type]);
    for (const layer of active) {
      const prog = this.programs.get(layer.type)!;
      gl.useProgram(prog);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);

      this.bindTex(prog, "u_src", 0, input);
      this.bindTex(prog, "u_orig", 1, this.origTex);

      // mask routing
      const maskPassId = layer.sources.mask ?? null;
      let hasMask = 0;
      if (maskPassId) {
        const bmp = getMaskBitmap(maskPassId, frame);
        if (bmp) {
          uploadImage(gl, this.maskTex, bmp);
          hasMask = 1;
        }
      }
      this.bindTex(prog, "u_mask", 2, hasMask ? this.maskTex : this.blackTex);
      this.u1i(prog, "u_hasMask", hasMask);

      // flow routing
      const flowPassId = layer.sources.flow ?? null;
      let flowScale = 0;
      if (flowPassId) {
        const flow = getFlowFrame(flowPassId, frame);
        if (flow) {
          uploadImage(gl, this.flowTex, flow.bitmap);
          flowScale = flow.scale;
        }
      }
      this.bindTex(prog, "u_flow", 3, this.flowTex);
      this.u1f(prog, "u_flowScale", flowScale);

      // feedback buffer for stateful layers
      if (layer.type === "flow_smear" || layer.type === "datamosh_preview") {
        let fb = this.feedback.get(layer.id);
        if (!fb) {
          fb = createTarget(gl, this.width, this.height);
          this.feedback.set(layer.id, fb);
        }
        if (seek) {
          // reset feedback to current source on seek so scrubbing stays sane
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fbo);
          const copy = this.programs.get("copy")!;
          gl.useProgram(copy);
          this.bindTex(copy, "u_src", 0, this.srcTex);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.useProgram(prog);
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
          this.bindTex(prog, "u_src", 0, input);
        }
        this.bindTex(prog, "u_prev", 4, fb.tex);
      }

      // CPU pixel sort result
      if (layer.type === "pixel_sort") {
        const result = this.pixelSort.result(layer, frame);
        if (result) uploadImage(gl, this.sortedTex, result);
        this.bindTex(prog, "u_sorted", 5, this.sortedTex);
        this.u1i(prog, "u_hasSorted", result ? 1 : 0);
        if (videoEl ?? source) {
          this.pixelSort.request(layer, source, maskPassId, frame, this.width, this.height);
        }
      }

      // Sapiens field routing (body_parts / depth / normals)
      const fieldPassId = layer.sources.field ?? null;
      let hasField = 0;
      if (fieldPassId) {
        const bmp = getFieldBitmap(fieldPassId, frame);
        if (bmp) {
          uploadImage(gl, this.fieldTex, bmp);
          hasField = 1;
        }
      }
      this.bindTex(prog, "u_field", 7, hasField ? this.fieldTex : this.blackTex);
      this.u1i(prog, "u_hasField", hasField);

      this.bindTex(prog, "u_atlas", 6, this.atlasTex);
      this.u1f(prog, "u_nGlyphs", this.nGlyphs);

      // common + per-type params
      const glres = gl.getUniformLocation(prog, "u_res");
      if (glres) gl.uniform2f(glres, this.width, this.height);
      this.u1f(prog, "u_frame", frame);
      this.u1f(prog, "u_seed", Number(layer.params.seed ?? 0));
      this.u1f(prog, "u_opacity", layer.blend.opacity);
      this.u1i(prog, "u_blend", BLEND_MODES[layer.blend.mode] ?? 0);
      this.setLayerParams(prog, layer);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // persist feedback: copy this layer's output into its feedback buffer
      if (layer.type === "flow_smear" || layer.type === "datamosh_preview") {
        const fb = this.feedback.get(layer.id)!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fbo);
        const copy = this.programs.get("copy")!;
        gl.useProgram(copy);
        this.bindTex(copy, "u_src", 0, target.tex);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      input = target.tex;
      [target, other] = [other, target];
    }

    // blit final to canvas (flipped: FBO chain is bottom-up, display is top-down)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    const blit = this.programs.get("copy_flip")!;
    gl.useProgram(blit);
    this.bindTex(blit, "u_src", 0, input);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private setLayerParams(prog: WebGLProgram, layer: RenderLayer) {
    const p = layer.params;
    const select = (key: string, options: string[]) =>
      Math.max(options.indexOf(String(p[key] ?? options[0])), 0);
    switch (layer.type) {
      case "matte_view":
        this.u3f(prog, "u_color", hexToRgb(String(p.color ?? "#FF5A00")));
        this.u1f(prog, "u_amount", Number(p.amount ?? 0.5));
        this.u1i(prog, "u_mode", select("mode", ["tint", "matte", "cutout"]));
        this.u1i(prog, "u_invert", p.invert ? 1 : 0);
        break;
      case "mask_edge_decay":
        this.u3f(prog, "u_color", hexToRgb(String(p.color ?? "#FF5A00")));
        this.u1f(prog, "u_edgeWidth", Number(p.edgeWidth ?? 0.02));
        this.u1f(prog, "u_jitter", Number(p.jitter ?? 0.4));
        this.u1i(prog, "u_mode", select("mode", ["halo", "rot", "holes"]));
        break;
      case "ascii_shader":
        this.u1f(prog, "u_cellSize", Number(p.cellSize ?? 10));
        this.u1i(prog, "u_region", select("region", ["all", "inside", "outside"]));
        this.u1i(prog, "u_colorMode", select("colorMode", ["mono", "source"]));
        this.u3f(prog, "u_color", hexToRgb(String(p.color ?? "#9BA0A3")));
        this.u1f(prog, "u_contrast", Number(p.contrast ?? 1.2));
        this.u1f(prog, "u_flicker", Number(p.flicker ?? 0.05));
        break;
      case "flow_smear":
        this.u1f(prog, "u_strength", Number(p.strength ?? 3));
        this.u1f(prog, "u_decay", Number(p.decay ?? 0.94));
        this.u1i(prog, "u_region", select("region", ["all", "inside", "outside"]));
        break;
      case "body_parts":
        this.u1i(prog, "u_mode", select("mode", ["colorize", "isolate"]));
        this.u1f(prog, "u_selectId", parseInt(String(p.partId ?? "3"), 10) || 0);
        this.u3f(prog, "u_color", hexToRgb(String(p.color ?? "#FF5A00")));
        this.u1f(prog, "u_saturation", Number(p.saturation ?? 0.6));
        break;
      case "sapiens_depth":
        this.u1i(prog, "u_mode", select("mode", ["colormap", "tint", "fog"]));
        this.u3f(prog, "u_color", hexToRgb(String(p.color ?? "#2962FF")));
        break;
      case "sapiens_normals":
        this.u1i(prog, "u_mode", select("mode", ["rgb", "relief"]));
        break;
      case "datamosh_preview":
        this.u1f(prog, "u_strength", Number(p.strength ?? 0.85));
        this.u1f(prog, "u_decay", Number(p.decay ?? 0.96));
        this.u1f(prog, "u_blockSize", Number(p.blockSize ?? 12));
        this.u1f(prog, "u_edgeLeak", Number(p.edgeLeak ?? 0.3));
        this.u1i(prog, "u_mode", select("mode", ["subject", "background"]));
        break;
    }
  }

  resetFeedback() {
    this.lastFrame = -10;
  }

  dispose() {
    this.pixelSort.dispose();
  }
}
