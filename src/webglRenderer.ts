/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

// Draws a map frame with WebGL2. The map is drawn into a layer of its own, a framebuffer the size of the canvas's
// drawing buffer, in three passes: every tile's ground; every shadow, merged by the darkest value into a shadow buffer
// with blendEquation(MAX), which then darkens the ground once; every tile's objects; then the overlay's tints. The layer
// is kept from frame to frame, so a frame draws it again only where the map changed. Each frame then composites the
// canvas: the layer copied over the areas the painter names, or over all of it, then the cars and the sprites over
// that, in one pass. Colours are premultiplied throughout.

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

// A texture drawn into through a framebuffer, width by height device pixels
interface Drawable {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

// What the context holds, built again when a lost context is restored
interface Resources {
  textured: Program;
  shadow: Program;
  composite: Program;
  vertexArray: WebGLVertexArrayObject;
  corners: WebGLBuffer;
  instances: WebGLBuffer;
  textures: Map<string, Texture>;
  // The shadow buffer, kept at the size of the target it was last drawn for
  shadowBuffer: Drawable | null;
  // The map's layer, at the size of the canvas's drawing buffer, or null before it is first drawn
  layer: Drawable | null;
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
    // The drawing buffer is kept from frame to frame, since a frame copies the map's layer over only part of it, and
    // the Screenshot window reads it
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

  // Lets go of the context and everything it holds, the atlases' textures and all, so the browser can free them at
  // once rather than when the canvas is collected. The renderer draws nothing after: a context lost this way is
  // restored only when asked, which nothing in the page does.
  release(): void {
    const gl = this.gl;
    const resources = this.resources;
    this.resources = null;
    if (resources !== null) {
      for (const program of [resources.textured, resources.shadow, resources.composite]) {
        gl.deleteProgram(program.program);
      }
      gl.deleteVertexArray(resources.vertexArray);
      gl.deleteBuffer(resources.corners);
      gl.deleteBuffer(resources.instances);
      resources.textures.forEach(({texture}) => gl.deleteTexture(texture));
      for (const drawable of [resources.shadowBuffer, resources.layer]) {
        if (drawable !== null) {
          gl.deleteFramebuffer(drawable.framebuffer);
          gl.deleteTexture(drawable.texture);
        }
      }
    }

    if (this.drawing !== null) {
      gl.deleteSync(this.drawing);
      this.drawing = null;
    }

    // A page may hold only a few contexts: losing this one gives its place back
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  // Whether the next frame must draw the map's layer whole: there is none yet at the size of the canvas's drawing
  // buffer, since the canvas was sized again or a lost context was restored, which made everything it held again.
  // While the context is lost nothing is drawn, so nothing is needed.
  get needsWholeLayer(): boolean {
    const layer = this.drawableResources()?.layer;
    return layer === null || (layer !== undefined && (layer.width !== this.gl.drawingBufferWidth ||
                                                      layer.height !== this.gl.drawingBufferHeight));
  }

  // Draws the frame's map into the map's layer within each of the layer's areas, in device pixels from its top-left,
  // leaving the rest of the layer as it was drawn last, or over the whole of it for none; then composites the canvas:
  // the layer copied over each of the composite's areas, or over all of the canvas for none, and the frame's cars and
  // sprites over that, which must reach no further than those areas. A layer made again, as needsWholeLayer tells, must
  // be drawn whole.
  draw(frame: MapFrame, layerAreas: readonly Rect[] | null, compositeAreas: readonly Rect[] | null): void {
    const resources = this.drawableResources();
    if (resources === null) {
      return;
    }

    const gl = this.gl;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    // The map's layer at the drawing buffer's size, made again when that changes
    const layer = this.drawableFor(resources.layer, width, height, gl.RGBA8);
    resources.layer = layer;
    const firsts = this.upload(resources, frame, layer);
    this.drawMap(resources, frame, layer, layerAreas, firsts);

    // The layer is copied pixel for pixel: the canvas and the layer share their size and their orientation, and a
    // framebuffer's rows count from the bottom
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, layer.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    for (const {x, y, width: areaWidth, height: areaHeight} of compositeAreas ?? [{x: 0, y: 0, width, height}]) {
      const bottom = height - y - areaHeight;
      gl.blitFramebuffer(x, bottom, x + areaWidth, bottom + areaHeight, x, bottom, x + areaWidth, bottom + areaHeight,
                         gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }
    this.drawSprites(resources, frame, {framebuffer: null, width, height}, firsts);
    this.fence();
  }

  // Draws the whole frame straight on the whole canvas, keeping no layer: for a picture drawn once, such as the splash
  // screen's preview
  drawWhole(frame: MapFrame): void {
    const resources = this.drawableResources();
    if (resources === null) {
      return;
    }

    this.drawAll(resources, frame, {framebuffer: null, width: this.gl.drawingBufferWidth,
                                    height: this.gl.drawingBufferHeight});
    this.fence();
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
    const resources = this.drawableResources();
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
      this.drawAll(resources, frame, {framebuffer, width, height});
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
    }

    return flipRows(pixels, width, height);
  }

  // Draws all of the frame on the target: the map, then the cars and the sprites over it
  private drawAll(resources: Resources, frame: MapFrame, target: Target): void {
    const firsts = this.upload(resources, frame, target);
    this.drawMap(resources, frame, target, null, firsts);
    this.drawSprites(resources, frame, target, firsts);
  }

  // Draws the frame's map on the target within each area, or over the whole of it for none, from the quads upload put
  // in the instance buffer. Every pass of the map is drawn within one area after another: areas that share pixels draw
  // them whole each time, the later over the earlier, as each starts by clearing its own.
  private drawMap(resources: Resources, frame: MapFrame, target: Target, areas: readonly Rect[] | null,
                  firsts: ReadonlyMap<QuadRun, number>): void {
    const gl = this.gl;
    if (areas === null) {
      this.drawMapPasses(resources, frame, target, firsts);
      return;
    }

    gl.enable(gl.SCISSOR_TEST);
    try {
      for (const area of areas) {
        // The scissor's rows count from the bottom
        gl.scissor(area.x, target.height - area.y - area.height, area.width, area.height);
        this.drawMapPasses(resources, frame, target, firsts);
      }
    } finally {
      gl.disable(gl.SCISSOR_TEST);
    }
  }

  // What the context holds, or null while it is lost. The context is lost before the browser tells the page so, and in
  // between it draws nothing, and its drawing buffer reads as no pixels.
  private drawableResources(): Resources | null {
    return this.gl.isContextLost() ? null : this.resources;
  }

  // Fences the frame just drawn on the canvas, for busy
  private fence(): void {
    const gl = this.gl;
    // The last frame's fence, signalled or not, is let go as this one's replaces it
    if (this.drawing !== null) {
      gl.deleteSync(this.drawing);
    }
    this.drawing = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  }

  // The drawable kept, if it is the size given, or one made in its place, of the texture format given, and so with
  // nothing drawn on it, letting go of the one kept
  private drawableFor(kept: Drawable | null, width: number, height: number, format: GLenum): Drawable {
    if (kept !== null && kept.width === width && kept.height === height) {
      return kept;
    }

    if (kept !== null) {
      this.gl.deleteFramebuffer(kept.framebuffer);
      this.gl.deleteTexture(kept.texture);
    }

    const texture = this.createTexture(width, height, format);
    return {framebuffer: this.createFramebuffer(texture), texture, width, height};
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

  private drawMapPasses(resources: Resources, frame: MapFrame, target: Target,
                        firsts: ReadonlyMap<QuadRun, number>): void {
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
      // The shadow buffer at the target's size
      const shadowBuffer = this.drawableFor(resources.shadowBuffer, target.width, target.height, gl.R8);
      resources.shadowBuffer = shadowBuffer;
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
  }

  // Draws the frame's cars and sprites over what the target shows
  private drawSprites(resources: Resources, frame: MapFrame, target: Target,
                      firsts: ReadonlyMap<QuadRun, number>): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.bindVertexArray(resources.vertexArray);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
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

  private createResources(): Resources {
    const gl = this.gl;

    const vertexArray = gl.createVertexArray()!;
    gl.bindVertexArray(vertexArray);

    const corners = gl.createBuffer()!;
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
      corners,
      instances,
      textures,
      shadowBuffer: null,
      layer: null,
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
