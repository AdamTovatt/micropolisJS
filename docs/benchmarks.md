# Benchmarks

How fast the C# simulation steps a city, and how many bytes of state messages a client would receive per step, on the committed fixtures and on new cities. `npm run benchmark` writes this file, with `server/Micropolis.Benchmarks`.

- Commit: f1f4a500abab
- Machine: Ubuntu 24.04.4 LTS, Arm64, 16 logical processors
- Load average over 1, 5 and 15 minutes: 48.90, 46.51, 41.68 as the timing started, 45.01, 45.74, 41.55 as it ended
- Runtime: .NET 10.0.11, Release build
- Each fixture's city is its save after its golden run, at its saved speed; random disasters are on for disasters and forestFire and harbourWithDisasters. A new city is the seed's map at the easy level.
- Steps/s and ms/step: the city is loaded, steps 4800 times to warm up, then 24000 steps are timed; the median of 5 repeats, each from a fresh load.
- Bytes/step: the TypeScript city host's state messages (`src/cityHost.ts`), run headless with one batch after each step, each message counted as the UTF-8 bytes of its JSON text, the payload of one WebSocket text frame, over the same steps as the timing.

| Fixture | Speed | Steps/s | ms/step | Bytes/step |
|---------|-------|--------:|--------:|-----------:|
| broke | medium | 127,848 | 0.0078 | 168.1 |
| disasters | medium | 285,044 | 0.0035 | 16.0 |
| forestFire | medium | 408,776 | 0.0024 | 9.0 |
| harbour | medium | 276,757 | 0.0036 | 215.2 |
| harbourWithDisasters | medium | 148,424 | 0.0067 | 214.8 |
| hazyWoods | medium | 196,898 | 0.0051 | 9.9 |
| hospitalTown | fast | 88,383 | 0.0113 | 53.3 |
| overloaded | medium | 257,229 | 0.0039 | 9.3 |
| roadlessTown | medium | 344,875 | 0.0029 | 11.6 |
| smokyWoods | medium | 388,616 | 0.0026 | 10.1 |
| suburb | medium | 161,226 | 0.0062 | 13.3 |
| suburbBroke | medium | 153,718 | 0.0065 | 13.0 |
| suburbFast | fast | 127,398 | 0.0078 | 36.2 |
| suburbSlow | slow | 202,044 | 0.0049 | 10.9 |
| suburbUnderfunded | medium | 253,654 | 0.0039 | 12.5 |
| town | medium | 142,224 | 0.0070 | 158.8 |
| twinPlants | medium | 201,620 | 0.0050 | 11.1 |
| underfunded | medium | 301,568 | 0.0033 | 168.0 |
| wilderness | medium | 192,447 | 0.0052 | 8.8 |
| new city (seed 0) | slow | 237,215 | 0.0042 | 7.9 |
| new city (seed 0) | medium | 363,343 | 0.0028 | 8.8 |
| new city (seed 0) | fast | 169,052 | 0.0059 | 24.9 |
