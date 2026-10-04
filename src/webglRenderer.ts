/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details. Alternatively,
 * consult http://micropolisjs.graememcc.co.uk/LICENSE and
 * http://micropolisjs.graememcc.co.uk/COPYING
 *
 * The name/term "MICROPOLIS" is a registered trademark of Micropolis (https://www.micropolis.com) GmbH
 * (Micropolis Corporation, the "licensor") and is licensed here to the authors/publishers of the "Micropolis"
 * city simulation game and its source code (the project or "licensee(s)") as a courtesy of the owner.
 *
 */

import { MapFrame, QUAD_FLOATS, QuadList, QuadRun } from "./mapFrame";
import type { Rect } from "./rect";
import { WHITE } from "./renderManifest";

// Draws a map frame with WebGL2, in three passes: every tile's ground; every shadow, merged by the darkest value into a
// shadow buffer with blendEquation(MAX), which then darkens the ground once; every tile's objects. Then the overlay's
// tints and the sprites. Colours are premultiplied throughout.

// An atlas the renderer draws from: its image, and whether it is a 16 px sheet, scaled up crisp, or rendered art,
// mipmapped and filtered trilinearly
export interface AtlasImage {
  image: TexImageSource & {width: number, height: number};
  crisp: boolean;
}

interface Texture {
  texture: WebGLTexture;
  width: number;
  height: number;
}

// Where a pass draws: the canvas, or an offscreen framebuffer, width by height device pixels
interface Target {
  framebuffer: WebGLFramebuffer | null;
  width: number;
  height: number;
}

// The quad's corners, as a triangle strip over the unit square
const CORNERS = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

// The bytes of a quad in the instance buffer
const QUAD_BYTES = QUAD_FLOATS * Float32Array.BYTES_PER_ELEMENT;

// The composite reads the shadow buffer by its pixels, so its quad comes from no source
const NO_SOURCE: Rect = {x: 0, y: 0, width: 0, height: 0};

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 corner;
// Where the quad lands, in device pixels from the target's top-left: x, y, width, height
layout(location = 1) in vec4 target;
// Where it comes from, in its atlas's pixels
layout(location = 2) in vec4 source;
layout(location = 3) in vec4 colour;
uniform vec2 targetSize;
uniform vec2 atlasSize;
out vec2 uv;
out vec4 tint;

void main() {
  vec2 position = (target.xy + corner * target.zw) / targetSize * 2.0 - 1.0;
  gl_Position = vec4(position.x, -position.y, 0.0, 1.0);
  uv = (source.xy + corner * source.zw) / atlasSize;
  tint = colour;
}`;

// highp: a texel of an atlas thousands of pixels wide is beyond mediump's precision
const TEXTURED_SHADER = `#version 300 es
precision highp float;
uniform sampler2D atlas;
in vec2 uv;
in vec4 tint;
out vec4 colour;

void main() {
  colour = texture(atlas, uv) * tint;
}`;

// A shadow's darkness is its alpha, written to the shadow buffer's one channel
const SHADOW_SHADER = `#version 300 es
precision highp float;
uniform sampler2D atlas;
in vec2 uv;
in vec4 tint;
out vec4 darkness;

void main() {
  darkness = vec4(texture(atlas, uv).a * tint.a, 0.0, 0.0, 0.0);
}`;

// Darkens what is drawn by the shadow buffer's darkness at each pixel. The buffer and the target share their size and
// their orientation, so a fragment reads its own pixel of it.
const COMPOSITE_SHADER = `#version 300 es
precision highp float;
// The shadow buffer
uniform sampler2D atlas;
out vec4 colour;

void main() {
  colour = vec4(0.0, 0.0, 0.0, texelFetch(atlas, ivec2(gl_FragCoord.xy), 0).r);
}`;

// A program, and its uniforms' locations: null for one its shaders don't use, which setting changes nothing
interface Program {
  program: WebGLProgram;
  targetSize: WebGLUniformLocation | null;
  atlasSize: WebGLUniformLocation | null;
}

// What the context holds, built again when a lost context is restored
interface Resources {
  textured: Program;
  shadow: Program;
  composite: Program;
  vertexArray: WebGLVertexArrayObject;
  instances: WebGLBuffer;
  textures: Map<string, Texture>;
  // The shadow buffer, kept at the size of the target it was last drawn for
  shadowBuffer: {framebuffer: WebGLFramebuffer, texture: WebGLTexture, width: number, height: number} | null;
}

// RGBA pixels, width by height, read by WebGL from the bottom row up, from the top row down
export function flipRows(pixels: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const rows = new Uint8ClampedArray(pixels.length);
  const rowBytes = width * 4;
  for (let row = 0; row < height; row++) {
    rows.set(pixels.subarray((height - 1 - row) * rowBytes, (height - row) * rowBytes), row * rowBytes);
  }

  return rows;
}

// The deepest mip level a rendered atlas is sampled at. Its rectangles' 4 pixel gutters (docs/render-assets.md) keep
// their neighbours out of two levels below the art, where a 4 pixel gutter has shrunk to one; past that the art is
// minified from this level instead.
const DEEPEST_MIP_LEVEL = 2;

// The largest texture the browser draws, in pixels a side, or null when it doesn't draw with WebGL2, which the map
// needs
export function webGL2TextureLimit(): number | null {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (gl === null) {
    return null;
  }

  const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  // The context is let go at once: a page may hold only a few
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return limit;
}

export class WebGLRenderer {
  private readonly gl: WebGL2RenderingContext;
  private resources: Resources | null = null;
  // The quad the shadow buffer darkens the target through
  private readonly compositeQuad = new QuadRun("shadow buffer");
  // A frame's quads, every run's one after another, as they are uploaded; kept from frame to frame, so it grows once
  private staged = new Float32Array(0);
  // Signalled once the GPU has drawn the last frame drawn on the canvas, or null before the first
  private drawing: WebGLSync | null = null;

  // Draws on the canvas from the atlases, which loadMapArt has checked fit the browser's texture limit. onRestored is
  // called once a context the browser lost is restored, which leaves the canvas to be drawn again.
  constructor(canvas: HTMLCanvasElement, private readonly atlases: ReadonlyMap<string, AtlasImage>,
              onRestored: () => void) {
    // The drawing buffer is kept from frame to frame, so a frame draws only the part of the map that changed
    const gl = canvas.getContext("webgl2", {alpha: false, antialias: false, depth: false, stencil: false,
                                            premultipliedAlpha: true, preserveDrawingBuffer: true});
    if (gl === null) {
      throw new Error("WebGL2 is not available");
    }
    this.gl = gl;

    // A lost context draws nothing until it is restored, then everything it held is made again
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.resources = null;
      // Lost with the context, as everything it held
      this.drawing = null;
    });
    canvas.addEventListener("webglcontextrestored", () => {
      this.resources = this.createResources();
      onRestored();
    });

    this.resources = this.createResources();
  }

  // Draws the frame on the canvas within each area, in device pixels from its top-left, leaving the rest as it was
  // drawn last, or over the whole of its drawing buffer for none
  draw(frame: MapFrame, areas: readonly Rect[] | null): void {
    const resources = this.resources;
    if (resources === null) {
      return;
    }

    this.drawFrame(resources, frame, {framebuffer: null, width: this.gl.drawingBufferWidth,
                                      height: this.gl.drawingBufferHeight}, areas);
    // The last frame's fence, signalled or not, is let go as this one's replaces it
    if (this.drawing !== null) {
      this.gl.deleteSync(this.drawing);
    }
    this.drawing = this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  }

  // Whether the GPU is still drawing the last frame drawn on the canvas. A frame drawn while it is queues behind it:
  // on a GPU slower than the frames come, software WebGL on a busy machine say, the queue grows, and the page's
  // thread waits on it, holding up the game's ticks and everything else the page does.
  get busy(): boolean {
    // Without waiting: the status changes between the page's tasks, not within one
    return this.drawing !== null && this.gl.clientWaitSync(this.drawing, 0, 0) === this.gl.TIMEOUT_EXPIRED;
  }

  // Draws the frame offscreen, width by height device pixels, and returns its pixels, RGBA, from the top row down, or
  // null while the context is lost
  drawOffscreen(frame: MapFrame, width: number, height: number): Uint8ClampedArray | null {
    const resources = this.resources;
    if (resources === null) {
      return null;
    }

    const gl = this.gl;
    const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if (width > limit || height > limit) {
      throw new Error(`An offscreen picture of ${width} by ${height} pixels is past this browser's ${limit}`);
    }

    const pixels = new Uint8Array(width * height * 4);
    const texture = this.createTexture(width, height, gl.RGBA8);
    let framebuffer: WebGLFramebuffer | null = null;
    try {
      framebuffer = this.createFramebuffer(texture);
      this.drawFrame(resources, frame, {framebuffer, width, height}, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
    }

    return flipRows(pixels, width, height);
  }

  // Draws the frame on the target within each area, or over the whole of it for none. The quads are uploaded once,
  // then every pass is drawn within one area after another: areas that share pixels draw them whole each time, the
  // later over the earlier, as each starts by clearing its own.
  private drawFrame(resources: Resources, frame: MapFrame, target: Target, areas: readonly Rect[] | null): void {
    const gl = this.gl;
    const firsts = this.upload(resources, frame, target);
    if (areas === null) {
      this.drawPasses(resources, frame, target, firsts);
      return;
    }

    gl.enable(gl.SCISSOR_TEST);
    try {
      for (const area of areas) {
        // The scissor's rows count from the bottom
        gl.scissor(area.x, target.height - area.y - area.height, area.width, area.height);
        this.drawPasses(resources, frame, target, firsts);
      }
    } finally {
      gl.disable(gl.SCISSOR_TEST);
    }
  }

  // Uploads every run of the frame's quads, and the composite's over the target if the frame has shadows, into the
  // instance buffer, and returns the quad each run starts at in it
  private upload(resources: Resources, frame: MapFrame, target: Target): Map<QuadRun, number> {
    const gl = this.gl;
    const composite = this.compositeQuad;
    composite.count = 0;
    if (frame.shadows.count > 0) {
      composite.add(0, 0, target.width, target.height, NO_SOURCE, 1, 1, 1, 1);
    }

    const runs = [frame.ground, frame.shadows, frame.objects, frame.tints, frame.sprites]
      .flatMap((list) => list.runs).concat(composite.count > 0 ? [composite] : []);
    const firsts = new Map<QuadRun, number>();
    let quads = 0;
    for (const run of runs) {
      firsts.set(run, quads);
      quads += run.count;
    }

    if (this.staged.length < quads * QUAD_FLOATS) {
      this.staged = new Float32Array(quads * QUAD_FLOATS * 2);
    }
    for (const run of runs) {
      this.staged.set(run.floats, firsts.get(run)! * QUAD_FLOATS);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, resources.instances);
    gl.bufferData(gl.ARRAY_BUFFER, this.staged.subarray(0, quads * QUAD_FLOATS), gl.STREAM_DRAW);
    return firsts;
  }

  private drawPasses(resources: Resources, frame: MapFrame, target: Target, firsts: ReadonlyMap<QuadRun, number>): void {
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindVertexArray(resources.vertexArray);

    // The ground is opaque, so it is written without blending, which software WebGL pays for at every pixel
    gl.disable(gl.BLEND);
    this.drawList(resources, resources.textured, frame.ground, target, firsts);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    if (frame.shadows.count > 0) {
      const shadowBuffer = this.shadowBufferFor(resources, target);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowBuffer.framebuffer);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.blendEquation(gl.MAX);
      this.drawList(resources, resources.shadow, frame.shadows, target, firsts);

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.blendEquation(gl.FUNC_ADD);
      gl.useProgram(resources.composite.program);
      gl.uniform2f(resources.composite.targetSize, target.width, target.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowBuffer.texture);
      // One quad over the whole target
      this.drawInstances(this.compositeQuad, firsts);
    }

    this.drawList(resources, resources.textured, frame.objects, target, firsts);
    this.drawList(resources, resources.textured, frame.tints, target, firsts);
    this.drawList(resources, resources.textured, frame.sprites, target, firsts);
  }

  private drawList(resources: Resources, program: Program, list: QuadList, target: Target,
                   firsts: ReadonlyMap<QuadRun, number>): void {
    const gl = this.gl;
    gl.useProgram(program.program);
    gl.uniform2f(program.targetSize, target.width, target.height);
    gl.activeTexture(gl.TEXTURE0);

    for (const run of list.runs) {
      const texture = resources.textures.get(run.atlas);
      if (texture === undefined) {
        throw new Error(`No atlas ${run.atlas} to draw from`);
      }

      gl.bindTexture(gl.TEXTURE_2D, texture.texture);
      gl.uniform2f(program.atlasSize, texture.width, texture.height);
      this.drawInstances(run, firsts);
    }
  }

  // Draws the run's quads from where upload put them in the instance buffer
  private drawInstances(run: QuadRun, firsts: ReadonlyMap<QuadRun, number>): void {
    const first = firsts.get(run);
    if (first === undefined) {
      throw new Error(`The quads from ${run.atlas} were not uploaded`);
    }

    this.pointInstances(first);
    this.gl.drawArraysInstanced(this.gl.TRIANGLE_STRIP, 0, 4, run.count);
  }

  // Points the quad's attributes, read once per instance, at the instance buffer from its quad first. The vertex array
  // and the instance buffer must be bound.
  private pointInstances(first: number): void {
    const gl = this.gl;
    for (let attribute = 1; attribute <= 3; attribute++) {
      gl.vertexAttribPointer(attribute, 4, gl.FLOAT, false, QUAD_BYTES, first * QUAD_BYTES + (attribute - 1) * 16);
    }
  }

  // The shadow buffer at the target's size, made again when the size changes
  private shadowBufferFor(resources: Resources, target: Target): NonNullable<Resources["shadowBuffer"]> {
    const kept = resources.shadowBuffer;
    if (kept !== null && kept.width === target.width && kept.height === target.height) {
      return kept;
    }

    if (kept !== null) {
      this.gl.deleteFramebuffer(kept.framebuffer);
      this.gl.deleteTexture(kept.texture);
    }

    const texture = this.createTexture(target.width, target.height, this.gl.R8);
    const made = {framebuffer: this.createFramebuffer(texture), texture, width: target.width, height: target.height};
    resources.shadowBuffer = made;
    return made;
  }

  private createResources(): Resources {
    const gl = this.gl;

    const vertexArray = gl.createVertexArray()!;
    gl.bindVertexArray(vertexArray);

    const corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, CORNERS, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const instances = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    for (let attribute = 1; attribute <= 3; attribute++) {
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribDivisor(attribute, 1);
    }
    this.pointInstances(0);
    gl.bindVertexArray(null);

    const textures = new Map<string, Texture>();
    this.atlases.forEach((atlas, name) => textures.set(name, this.uploadAtlas(atlas)));
    textures.set(WHITE, this.uploadWhite());

    return {
      textured: this.createProgram(TEXTURED_SHADER),
      shadow: this.createProgram(SHADOW_SHADER),
      composite: this.createProgram(COMPOSITE_SHADER),
      vertexArray,
      instances,
      textures,
      shadowBuffer: null,
    };
  }

  private uploadAtlas({image, crisp}: AtlasImage): Texture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if (crisp) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, DEEPEST_MIP_LEVEL);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    return {texture, width: image.width, height: image.height};
  }

  private uploadWhite(): Texture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return {texture, width: 1, height: 1};
  }

  // A texture of the format, width by height, to draw into
  private createTexture(width: number, height: number, format: GLenum): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, format, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return texture;
  }

  private createFramebuffer(texture: WebGLTexture): WebGLFramebuffer {
    const gl = this.gl;
    const framebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`An offscreen framebuffer is incomplete: status ${status}`);
    }
    return framebuffer;
  }

  private createProgram(fragmentSource: string): Program {
    const gl = this.gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, this.compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!(gl.getProgramParameter(program, gl.LINK_STATUS) as boolean) && !gl.isContextLost()) {
      throw new Error(`A map shader failed to link: ${gl.getProgramInfoLog(program)}`);
    }

    // Every shader's sampler is named atlas, on unit 0: an atlas, or the composite's shadow buffer
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, "atlas"), 0);

    return {
      program,
      targetSize: gl.getUniformLocation(program, "targetSize"),
      atlasSize: gl.getUniformLocation(program, "atlasSize"),
    };
  }

  private compile(type: GLenum, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!(gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean) && !gl.isContextLost()) {
      throw new Error(`A map shader failed to compile: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  }
}
