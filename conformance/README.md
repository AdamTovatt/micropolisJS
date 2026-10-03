# Conformance data

Data that the C# implementation of the game rules tests against, read from here rather than copied: the random
stream's vectors, which the TypeScript tests read too, and files the TypeScript reference writes.

## random.json

Reference vectors for the simulation's random stream, specified in `src/random.ts`. `random.c` writes the file: it
runs the reference C implementations of xoshiro128** 1.1 and SplitMix64 (<https://prng.di.unimi.it/>), with
`getRandom`, `getRandom16Signed`, `getERandom` and `getChance` written in C over the same 16-bit draws as
`random.ts` specifies them. To change or extend the vectors, edit `random.c` and regenerate:

```bash
cc -O2 -o conformance/random conformance/random.c && conformance/random > conformance/random.json
```

The program it builds, `conformance/random`, is ignored by git. CI builds and runs it too, and fails unless its output
is the committed file byte for byte, so the vectors cannot drift from the program that computes them.

- `seeds`: for each seed, the state SplitMix64 fills, the first raw draws, and the state after one `jump()`.
- `getRandom`: from the seed, `callsPerMaximum` calls with each maximum in turn. Some of the draws are rejected, and
  the maximum 32767 has a range of 32768, which divides 65536 but not 65535, so the outputs pin the rejection
  sampling and its 0xffff bound.
- `getRandomAtTheBoundary`: consecutive calls with one maximum. The seed's first 16-bit draw, 57033, equals the largest
  multiple of the range, 57033, so it is rejected; accepting it would give 0. Both sides' tests check that first draw,
  so a change of seed or maximum that loses the boundary fails them.
- `getRandom16Signed`, `getERandom`, `getChance`: consecutive calls from the seed.

Seeds and 32-bit words are hex strings, as the C reference prints them.

## Files the TypeScript reference writes

`generate.ts` writes `tiles.json`, `canonicalJson.json` and `maps.json` from the TypeScript game rules, which are
the reference until the C# port replaces them. Regenerate them in the commit that changes what they are computed
from:

```bash
npm run conformance
```

CI runs it too, and fails unless the committed files are what it writes, byte for byte. The server's tests only read
them.

### tiles.json

Every name `src/tileValues.ts` and `src/tileFlags.ts` export, with its value. The C# `TileValues` and `TileFlags`
hold the same names with the same values.

### canonicalJson.json

The canonical text `src/canonicalJson.ts` writes (`docs/state-hash.md`), for:

- `numbers`: doubles, each given by its IEEE 754 bits, so negative zero and every digit are exact. They cover each
  layout of `Number::toString`, the boundaries between them, every funding share the budget can set as a
  single-precision value, and doubles drawn uniformly from their bit patterns.
- `strings`: strings given as UTF-16 code units, so lone surrogates can be written: every code unit below U+0080,
  characters written as themselves, and surrogates alone, paired and out of order.
- `documents`: JSON documents, whose keys are sorted and whose numbers are rewritten.

The generator fails if the numbers stop covering a layout.

### maps.json

What `src/mapGenerator.js` generates from the map stream of each seed (`src/random.ts`):

- `seeds`: each seed, the `kind` of land the generator laid (`island`, an island with no river; `nakedIsland`, an
  island coast with rivers and lakes; `land`, rivers and lakes on open land; `landAfterIslandDraw`, the same after
  the extra draw that decided against an island), how many `lakes` it drew, and the SHA-256 of the canonical text of
  the `map` object `GameMap.save` writes. The seeds are the first, counting from zero, that cover three maps of each
  kind, a map with rivers and no lakes and one with the most lakes, and the largest seed. The generator fails if the
  first 10000 seeds don't cover them.
- `maps`: the whole `map` object of the first seed of the island, naked island and land kinds, with its tiles one row
  per line, so a mismatch can be located.
