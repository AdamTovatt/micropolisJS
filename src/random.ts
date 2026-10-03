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

// The simulation's random stream. The C# port reproduces it bit for bit, so its specification is part of the game
// rules, and test/random.ts holds vectors computed by the reference C implementation:
//
// - xoshiro128** 1.1 (Blackman & Vigna, https://prng.di.unimi.it/), four uint32 words of state.
// - Seeded from a uint32 game seed with SplitMix64: the generator starts at the seed, and its first two outputs
//   fill the state, each low word first: [low(a), high(a), low(b), high(b)].
// - getRandom16 is the top 16 bits of one draw; getRandom(max) rejects 16-bit draws as the original's getRandom
//   does, with no floating-point scaling.
//
// One game seed reproduces the map and the city: the map generator draws from mapStream(seed), and the simulation
// from simulationStream(seed), which is the same seeded state after one jump().

type RandomState = [number, number, number, number];

const UINT32_MAX = 0xffffffff;
const RANDOM16_MAX = 0xffff;

const MASK64 = BigInt("0xffffffffffffffff");
const SPLITMIX64_GAMMA = BigInt("0x9e3779b97f4a7c15");
const SPLITMIX64_MUL1 = BigInt("0xbf58476d1ce4e5b9");
const SPLITMIX64_MUL2 = BigInt("0x94d049bb133111eb");

const JUMP = [0x8764000b, 0xf542d2d3, 0x6fa035c3, 0x77f2db5b];

function isUint32(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= UINT32_MAX;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

class Random {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  private constructor(state: readonly number[]) {
    this.s0 = state[0];
    this.s1 = state[1];
    this.s2 = state[2];
    this.s3 = state[3];
  }

  static fromSeed(seed: number): Random {
    if (!isUint32(seed)) {
      throw new Error(`A seed must be a uint32, got ${seed}`);
    }

    let x = BigInt(seed);
    const words: number[] = [];

    for (let i = 0; i < 2; i++) {
      x = (x + SPLITMIX64_GAMMA) & MASK64;
      let z = x;
      z = ((z ^ (z >> BigInt(30))) * SPLITMIX64_MUL1) & MASK64;
      z = ((z ^ (z >> BigInt(27))) * SPLITMIX64_MUL2) & MASK64;
      z = z ^ (z >> BigInt(31));
      words.push(Number(z & BigInt(UINT32_MAX)), Number(z >> BigInt(32)));
    }

    return new Random(words);
  }

  static mapStream(seed: number): Random {
    return Random.fromSeed(seed);
  }

  static simulationStream(seed: number): Random {
    const random = Random.fromSeed(seed);
    random.jump();
    return random;
  }

  getState(): RandomState {
    return [this.s0, this.s1, this.s2, this.s3];
  }

  // Restores a state from getState in place, so everything holding this stream continues from it
  setState(state: readonly number[]): void {
    if (state.length !== 4 || !state.every(isUint32)) {
      throw new Error(`A random state must be four uint32 words, got ${JSON.stringify(state)}`);
    }

    if (state.every((word) => word === 0)) {
      throw new Error("A random state must not be all zero");
    }

    this.s0 = state[0];
    this.s1 = state[1];
    this.s2 = state[2];
    this.s3 = state[3];
  }

  // One raw draw: a uint32
  next(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;

    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);

    return result;
  }

  // Advances the state by 2^64 draws, giving a stream that does not overlap this one's next 2^64 draws
  jump(): void {
    let j0 = 0;
    let j1 = 0;
    let j2 = 0;
    let j3 = 0;

    for (const word of JUMP) {
      for (let bit = 0; bit < 32; bit++) {
        if ((word >>> bit) & 1) {
          j0 ^= this.s0;
          j1 ^= this.s1;
          j2 ^= this.s2;
          j3 ^= this.s3;
        }

        this.next();
      }
    }

    this.s0 = j0 >>> 0;
    this.s1 = j1 >>> 0;
    this.s2 = j2 >>> 0;
    this.s3 = j3 >>> 0;
  }

  // An integer in [0, 65535]
  getRandom16(): number {
    return this.next() >>> 16;
  }

  // An integer in [-32768, 32767]
  getRandom16Signed(): number {
    const value = this.getRandom16();

    if (value < 32768) {
      return value;
    } else {
      return value - 65536;
    }
  }

  // An integer in [0, max], uniformly distributed
  getRandom(max: number): number {
    if (!Number.isInteger(max) || max < 0 || max >= RANDOM16_MAX) {
      throw new Error(`getRandom needs an integer maximum in [0, ${RANDOM16_MAX - 1}], got ${max}`);
    }

    const range = max + 1;
    const maxMultiple = Math.floor(RANDOM16_MAX / range) * range;
    let value;

    do {
      value = this.getRandom16();
    } while (value >= maxMultiple);

    return value % range;
  }

  // True when a 16-bit draw has none of the mask's bits set: a 1 in 2^n chance for an n-bit mask
  getChance(mask: number): boolean {
    return (this.getRandom16() & mask) === 0;
  }

  // An integer in [0, max], biased towards smaller numbers: the lesser of two draws
  getERandom(max: number): number {
    const firstCandidate = this.getRandom(max);
    const secondCandidate = this.getRandom(max);
    return Math.min(firstCandidate, secondCandidate);
  }
}

export { Random };
export type { RandomState };
