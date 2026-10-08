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

import { GROUND_ONLY, GROUND_OVER_GRASS, GROUND_QUAD_FLOATS, MapFrame, QUAD_FLOATS, QuadRun } from "./mapFrame";
import type { Run, RunList } from "./mapFrame";
import type { Rect } from "./rect";
import { WHITE } from "./renderManifest";
import type { GrassDraw } from "./renderManifest";

// Draws a map frame with WebGL2. The map is drawn into a layer of its own, a framebuffer the size of the canvas's
// drawing buffer, in three passes: every tile's ground; every shadow, merged by the darkest value into a shadow buffer
// with blendEquation(MAX), which then darkens the ground once; every tile's objects; then the overlay's tints. The layer
// is kept from frame to frame, so a frame draws it again only where the map changed. Each frame then composites the
// canvas: the layer copied over the areas the painter names, or over all of it, then the cars and the sprites over
// that, in one pass. Colours are premultiplied throughout.

// An atlas the renderer draws from: its image, and how it is filtered: crisp, a 16 px sheet scaled up; mipmapped,
// rendered art filtered trilinearly; or field, a field of values, the world grass's, filtered linearly and never
// premultiplied, since its channels are numbers, not a colour
export interface AtlasImage {
  image: TexImageSource & {width: number, height: number};
  filter: "crisp" | "mipmapped" | "field";
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

// The attributes a quad's floats fill, four each, from attribute 1: a quad's target, source and colour, and a ground
// quad's tile in each grass set and its map tile's position
const QUAD_ATTRIBUTES = QUAD_FLOATS / 4;
const GROUND_ATTRIBUTES = GROUND_QUAD_FLOATS / 4;

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

// The ground pass's vertex shader: the textured one's, and from the quad's floats past the colour, the rectangles of
// its tile in each grass set, its map tile's position and what it draws, for the world grass under the ground
const GROUND_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 corner;
layout(location = 1) in vec4 target;
layout(location = 2) in vec4 source;
layout(location = 4) in vec4 lush;
layout(location = 5) in vec4 straw;
layout(location = 6) in vec4 tile;
uniform vec2 targetSize;
uniform vec2 atlasSize;
uniform vec2 grassSize;
uniform vec2 fieldTiles;
out vec2 uv;
out vec2 lushUv;
out vec2 strawUv;
out vec2 fieldUv;
flat out int draws;

void main() {
  vec2 position = (target.xy + corner * target.zw) / targetSize * 2.0 - 1.0;
  gl_Position = vec4(position.x, -position.y, 0.0, 1.0);
  uv = (source.xy + corner * source.zw) / atlasSize;
  lushUv = (lush.xy + corner * lush.zw) / grassSize;
  strawUv = (straw.xy + corner * straw.zw) / grassSize;
  fieldUv = (tile.xy + corner) / fieldTiles;
  draws = int(tile.z + 0.5);
}`;

// Each tile's ground, over the world grass where it lets the grass through (docs/render-assets.md): the two sets'
// texels blended by the share of straw, keeping their contrast, then tinted. What a quad draws is one value over all of
// it, so no tile samples what it doesn't show: an opaque ground only itself, bare land only the grass. Every grass tile
// is one size on screen, so the grass is sampled at the frame's one mip level, which needs no derivatives in the branch
// on the share of straw, whose sides the pixels of a quad may split between.
const GROUND_SHADER = `#version 300 es
precision highp float;
uniform sampler2D atlas;
uniform sampler2D grass;
uniform sampler2D field;
uniform vec3 lushMean;
uniform vec3 strawMean;
uniform vec3 warm;
uniform float brightness;
uniform float warmth;
uniform float level;
in vec2 uv;
in vec2 lushUv;
in vec2 strawUv;
in vec2 fieldUv;
flat in int draws;
out vec4 colour;

void main() {
  if (draws == ${GROUND_ONLY}) {
    colour = texture(atlas, uv);
    return;
  }

  // Over the grass: the ground where it shows any, or none where it lets all the grass through
  vec4 ground = draws == ${GROUND_OVER_GRASS} ? texture(atlas, uv) : vec4(0.0);
  vec2 mixed = textureLod(field, fieldUv, 0.0).rg;
  float share = mixed.r;
  float tint = mixed.g;
  // Most land is all straw or all lush, where the other set weighs nothing and isn't sampled
  vec3 green;
  if (share >= 1.0) {
    green = textureLod(grass, strawUv, level).rgb;
  } else if (share <= 0.0) {
    green = textureLod(grass, lushUv, level).rgb;
  } else {
    vec3 lushTexel = textureLod(grass, lushUv, level).rgb - lushMean;
    vec3 strawTexel = textureLod(grass, strawUv, level).rgb - strawMean;
    green = mix(lushMean, strawMean, share) +
      ((1.0 - share) * lushTexel + share * strawTexel) / sqrt((1.0 - share) * (1.0 - share) + share * share);
  }
  green *= 1.0 + brightness * (tint - 0.5);
  green = mix(green, green * warm, warmth * clamp((tint - 0.45) * 2.0, 0.0, 1.0));
  colour = vec4(ground.rgb + clamp(green, 0.0, 1.0) * (1.0 - ground.a), 1.0);
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

// The ground pass's program, and the further uniforms it draws the world grass with
interface GroundProgram extends Program {
  grassSize: WebGLUniformLocation | null;
  fieldTiles: WebGLUniformLocation | null;
  lushMean: WebGLUniformLocation | null;
  strawMean: WebGLUniformLocation | null;
  warm: WebGLUniformLocation | null;
  brightness: WebGLUniformLocation | null;
  warmth: WebGLUniformLocation | null;
  level: WebGLUniformLocation | null;
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
  ground: GroundProgram;
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
      for (const program of [resources.ground, resources.textured, resources.shadow, resources.composite]) {
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
                  firsts: ReadonlyMap<Run, number>): void {
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
  // instance buffer, one after another, and returns the float each run starts at in it: a ground run's quads are longer
  // than the rest's
  private upload(resources: Resources, frame: MapFrame, target: Target): Map<Run, number> {
    const gl = this.gl;
    const composite = this.compositeQuad;
    composite.count = 0;
    if (frame.shadows.count > 0) {
      composite.add(0, 0, target.width, target.height, NO_SOURCE, 1, 1, 1, 1);
    }

    const runs: Run[] = [...frame.ground.runs, ...[frame.shadows, frame.objects, frame.tints, frame.sprites]
      .flatMap((list) => list.runs), ...(composite.count > 0 ? [composite] : [])];
    const firsts = new Map<Run, number>();
    let floats = 0;
    for (const run of runs) {
      firsts.set(run, floats);
      floats += run.count * run.floatsPerQuad;
    }

    if (this.staged.length < floats) {
      this.staged = new Float32Array(floats * 2);
    }
    for (const run of runs) {
      this.staged.set(run.floats, firsts.get(run)!);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, resources.instances);
    gl.bufferData(gl.ARRAY_BUFFER, this.staged.subarray(0, floats), gl.STREAM_DRAW);
    return firsts;
  }

  private drawMapPasses(resources: Resources, frame: MapFrame, target: Target,
                        firsts: ReadonlyMap<Run, number>): void {
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindVertexArray(resources.vertexArray);

    // The ground is opaque over the world grass, so it is written without blending, which software WebGL pays for at
    // every pixel
    gl.disable(gl.BLEND);
    this.drawGround(resources, frame, target, firsts);
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
                      firsts: ReadonlyMap<Run, number>): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.bindVertexArray(resources.vertexArray);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.drawList(resources, resources.textured, frame.sprites, target, firsts);
  }

  // Draws every tile's ground, each over the world grass where it lets the grass through
  private drawGround(resources: Resources, frame: MapFrame, target: Target,
                     firsts: ReadonlyMap<Run, number>): void {
    if (frame.grass === null) {
      // A frame never built, which has no ground
      return;
    }

    const gl = this.gl;
    const program = resources.ground;
    gl.useProgram(program.program);
    this.bindGrass(resources, program, frame.grass, frame.grassLevel);

    for (let attribute = QUAD_ATTRIBUTES + 1; attribute <= GROUND_ATTRIBUTES; attribute++) {
      gl.enableVertexAttribArray(attribute);
    }
    try {
      this.drawList(resources, program, frame.ground, target, firsts);
    } finally {
      for (let attribute = QUAD_ATTRIBUTES + 1; attribute <= GROUND_ATTRIBUTES; attribute++) {
        gl.disableVertexAttribArray(attribute);
      }
    }
  }

  // Binds the world grass's atlas to texture unit 1 and its baked field to unit 2, and sets the ground program's
  // uniforms from it and the mip level its tiles are sampled at
  private bindGrass(resources: Resources, program: GroundProgram, grass: GrassDraw, level: number): void {
    const gl = this.gl;
    const atlas = resources.textures.get(grass.atlas);
    const field = resources.textures.get(grass.field);
    if (atlas === undefined || field === undefined) {
      throw new Error(`No ${atlas === undefined ? `atlas ${grass.atlas}` : "baked field"} to draw the grass from`);
    }

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, field.texture);
    gl.uniform2f(program.grassSize, atlas.width, atlas.height);
    gl.uniform2f(program.fieldTiles, grass.fieldTiles.width, grass.fieldTiles.height);
    gl.uniform3f(program.lushMean, ...grass.lushMean);
    gl.uniform3f(program.strawMean, ...grass.strawMean);
    gl.uniform3f(program.warm, ...grass.warm);
    gl.uniform1f(program.brightness, grass.brightness);
    gl.uniform1f(program.warmth, grass.warmth);
    gl.uniform1f(program.level, level);
  }

  private drawList(resources: Resources, program: Program, list: RunList<Run>, target: Target,
                   firsts: ReadonlyMap<Run, number>): void {
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
  private drawInstances(run: Run, firsts: ReadonlyMap<Run, number>): void {
    const first = firsts.get(run);
    if (first === undefined) {
      throw new Error(`The quads from ${run.atlas} were not uploaded`);
    }

    this.pointInstances(first, run.floatsPerQuad);
    this.gl.drawArraysInstanced(this.gl.TRIANGLE_STRIP, 0, 4, run.count);
  }

  // Points the quad's attributes, read once per instance, four floats each from attribute 1, at the instance buffer
  // from the float first, a quad every floatsPerQuad floats. The vertex array and the instance buffer must be bound.
  private pointInstances(first: number, floatsPerQuad: number): void {
    const gl = this.gl;
    const bytes = Float32Array.BYTES_PER_ELEMENT;
    for (let attribute = 1; attribute <= floatsPerQuad / 4; attribute++) {
      gl.vertexAttribPointer(attribute, 4, gl.FLOAT, false, floatsPerQuad * bytes,
                             (first + (attribute - 1) * 4) * bytes);
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
    // Every quad's attributes, read once per instance; a ground quad's further ones are enabled only while the ground
    // is drawn, the one pass whose quads hold them
    for (let attribute = 1; attribute <= GROUND_ATTRIBUTES; attribute++) {
      if (attribute <= QUAD_ATTRIBUTES) {
        gl.enableVertexAttribArray(attribute);
      }
      gl.vertexAttribDivisor(attribute, 1);
    }
    this.pointInstances(0, QUAD_FLOATS);
    gl.bindVertexArray(null);

    const textures = new Map<string, Texture>();
    this.atlases.forEach((atlas, name) => textures.set(name, this.uploadAtlas(atlas)));
    textures.set(WHITE, this.uploadWhite());

    return {
      ground: this.createGroundProgram(),
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

  private uploadAtlas({image, filter}: AtlasImage): Texture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, filter !== "field");
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if (filter === "field") {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    } else if (filter === "crisp") {
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

  private createGroundProgram(): GroundProgram {
    const gl = this.gl;
    const created = this.createProgram(GROUND_SHADER, GROUND_VERTEX_SHADER);
    const program = created.program;
    // The grass's atlas on unit 1, its field on unit 2, beside the ground's atlas on 0
    gl.uniform1i(gl.getUniformLocation(program, "grass"), 1);
    gl.uniform1i(gl.getUniformLocation(program, "field"), 2);
    const location = (name: string) => gl.getUniformLocation(program, name);
    return {
      ...created,
      grassSize: location("grassSize"),
      fieldTiles: location("fieldTiles"),
      lushMean: location("lushMean"),
      strawMean: location("strawMean"),
      warm: location("warm"),
      brightness: location("brightness"),
      warmth: location("warmth"),
      level: location("level"),
    };
  }

  private createProgram(fragmentSource: string, vertexSource = VERTEX_SHADER): Program {
    const gl = this.gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, this.compile(gl.VERTEX_SHADER, vertexSource));
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
