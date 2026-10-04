# Benchmarks

How fast the C# simulation steps a city, and how many bytes of state messages a client would receive per step, on the committed fixtures and on new cities. `npm run benchmark` writes this file, with `server/Micropolis.Benchmarks`.

- Commit: 327094fb90ec
- Machine: Ubuntu 24.04.4 LTS, Arm64, 16 logical processors
- Load average over 1, 5 and 15 minutes: 8.22, 27.36, 46.60 as the timing started, 7.72, 26.63, 46.16 as it ended
- Runtime: .NET 10.0.11, Release build
- Each fixture's city is its save after its golden run, at its saved speed; random disasters are off. A new city is the seed's map at the easy level.
- Steps/s and ms/step: the city is loaded, steps 4800 times to warm up, then 24000 steps are timed; the median of 5 repeats, each from a fresh load.
- Bytes/step: the TypeScript city host's state messages (`src/cityHost.ts`), run headless with one batch after each step, each message counted as the UTF-8 bytes of its JSON text, the payload of one WebSocket text frame, over the same steps as the timing.
- Fixtures not run:
  - broke: its city has sprites, which the C# simulation doesn't move (#27)
  - disasters: it runs with random disasters on, which the C# simulation doesn't strike (#27)
  - forestFire: it runs with random disasters on, which the C# simulation doesn't strike (#27)
  - town: its city has sprites, which the C# simulation doesn't move (#27)
  - underfunded: its city has sprites, which the C# simulation doesn't move (#27)

| Fixture | Speed | Steps/s | ms/step | Bytes/step |
|---------|-------|--------:|--------:|-----------:|
| hospitalTown | fast | 120,070 | 0.0083 | 53.3 |
| overloaded | medium | 260,765 | 0.0038 | 9.3 |
| roadlessTown | medium | 345,101 | 0.0029 | 11.6 |
| smokyWoods | medium | 392,940 | 0.0025 | 10.1 |
| suburb | medium | 333,693 | 0.0030 | 13.3 |
| suburbBroke | medium | 310,682 | 0.0032 | 13.0 |
| suburbFast | fast | 133,548 | 0.0075 | 36.2 |
| suburbSlow | slow | 234,028 | 0.0043 | 10.9 |
| suburbUnderfunded | medium | 330,879 | 0.0030 | 12.5 |
| twinPlants | medium | 399,158 | 0.0025 | 11.1 |
| wilderness | medium | 416,020 | 0.0024 | 8.8 |
| new city (seed 0) | slow | 252,266 | 0.0040 | 7.9 |
| new city (seed 0) | medium | 406,366 | 0.0025 | 8.8 |
| new city (seed 0) | fast | 172,385 | 0.0058 | 24.9 |
