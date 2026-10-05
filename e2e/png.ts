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

import { Page } from "@playwright/test";
import { crc32, deflateSync } from "zlib";

// Writing PNGs for the page to draw, and reading the pixels of PNGs the page or the runner makes

// A PNG of RGBA pixels, row by row
export function png(width: number, height: number, pixels: number[]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  // 8 bits a channel, RGBA, no interlacing
  header.set([8, 6, 0, 0, 0], 8);
  const rows: number[] = [];
  for (let y = 0; y < height; y++) {
    // Each row starts with its filter: none
    rows.push(0, ...pixels.slice(y * width * 4, (y + 1) * width * 4));
  }

  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header),
                        chunk("IDAT", deflateSync(Buffer.from(rows))), chunk("IEND", Buffer.alloc(0))]);
}

// An image's size, and the RGBA of the pixels sampled from it
export interface Sampled {
  width: number;
  height: number;
  pixels: number[][];
}

// The pixels at the points of an image, a PNG's bytes or a data URI, decoded by the page
export async function samplePixels(page: Page, image: Buffer | string,
                                   points: {x: number, y: number}[]): Promise<Sampled> {
  const uri = typeof image === "string" ? image : `data:image/png;base64,${image.toString("base64")}`;

  return page.evaluate(async ({source, at}) => {
    const base64 = source.slice(source.indexOf(",") + 1);
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], {type: "image/png"}));
    const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    return {
      width: bitmap.width,
      height: bitmap.height,
      pixels: at.map(({x, y}) => Array.from(data.slice((y * bitmap.width + x) * 4, (y * bitmap.width + x + 1) * 4))),
    };
  }, {source: uri, at: points});
}
