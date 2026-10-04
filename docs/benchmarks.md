# Benchmarks

How fast the C# simulation steps a city, and how many bytes of state messages a client would receive per step, on the committed fixtures and on new cities. `npm run benchmark` writes this file, with `server/Micropolis.Benchmarks`.

- Commit: 5304c7440e57
- Machine: Ubuntu 24.04.4 LTS, Arm64, 16 logical processors
- Load average over 1, 5 and 15 minutes: 5.03, 8.75, 18.63 as the timing started, 4.14, 8.37, 18.35 as it ended
- Runtime: .NET 10.0.11, Release build
- Each fixture's city is its save after its golden run, at its saved speed; random disasters are on for disasters and forestFire and harbourWithDisasters. A new city is the seed's map at the easy level.
- Steps/s and ms/step: the city is loaded, steps 4800 times to warm up, then 24000 steps are timed; the median of 5 repeats, each from a fresh load.
- Bytes/step: the TypeScript city host's state messages (`src/cityHost.ts`), run headless with one batch after each step, each message counted as the UTF-8 bytes of its JSON text, the payload of one WebSocket text frame, over the same steps as the timing.

| Fixture | Speed | Steps/s | ms/step | Bytes/step |
|---------|-------|--------:|--------:|-----------:|
| broke | medium | 240,406 | 0.0042 | 168.1 |
| disasters | medium | 270,200 | 0.0037 | 16.0 |
| forestFire | medium | 402,296 | 0.0025 | 9.0 |
| harbour | medium | 281,413 | 0.0036 | 215.2 |
| harbourWithDisasters | medium | 277,363 | 0.0036 | 214.8 |
| hospitalTown | fast | 122,513 | 0.0082 | 53.3 |
| overloaded | medium | 263,468 | 0.0038 | 9.3 |
| roadlessTown | medium | 343,958 | 0.0029 | 11.6 |
| smokyWoods | medium | 390,722 | 0.0026 | 10.1 |
| suburb | medium | 323,433 | 0.0031 | 13.3 |
| suburbBroke | medium | 311,210 | 0.0032 | 13.0 |
| suburbFast | fast | 134,066 | 0.0075 | 36.2 |
| suburbSlow | slow | 231,969 | 0.0043 | 10.9 |
| suburbUnderfunded | medium | 330,865 | 0.0030 | 12.5 |
| town | medium | 304,586 | 0.0033 | 158.8 |
| twinPlants | medium | 399,259 | 0.0025 | 11.1 |
| underfunded | medium | 307,787 | 0.0032 | 168.0 |
| wilderness | medium | 417,696 | 0.0024 | 8.8 |
| new city (seed 0) | slow | 252,825 | 0.0040 | 7.9 |
| new city (seed 0) | medium | 406,337 | 0.0025 | 8.8 |
| new city (seed 0) | fast | 173,749 | 0.0058 | 24.9 |
