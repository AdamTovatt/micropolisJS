# Conformance data

Data that the TypeScript and C# implementations of the game rules both test against, read from here by each side
rather than copied.

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
