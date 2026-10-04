# Benchmarks

How fast the C# simulation steps a city, and how many bytes of state messages each player in a city on the server receives per step, on the committed fixtures and on new cities. `npm run benchmark` writes this file, with `server/Micropolis.Benchmarks`.

- Commit: 6b4d30e78f54
- Machine: Ubuntu 24.04.4 LTS, Arm64, 16 logical processors
- Load average over 1, 5 and 15 minutes: 37.68, 15.69, 23.55 as the timing started, 20.25, 14.21, 22.68 as it ended
- Runtime: .NET 10.0.11, Release build
- Each fixture's city is its save after its golden run, at its saved speed; random disasters are on for disasters and forestFire and harbourWithDisasters. A new city is the seed's map at the easy level.
- Steps/s and ms/step: the city is loaded, steps 4800 times to warm up, then 24000 steps are timed; the median of 5 repeats, each from a fresh load.
- Bytes/step: the server's state messages (`CityStateMessages` in `server/Micropolis.Rules`), taking one step a turn of the server's loop, as it does on average at 60 steps a second: a batch after each step unless nothing a player is sent changed, each counted as the UTF-8 bytes of the batch's JSON text, the payload of the WebSocket text frame every player in the city is sent, over the same steps as the timing.

| Fixture | Speed | Steps/s | ms/step | Bytes/step |
|---------|-------|--------:|--------:|-----------:|
| broke | medium | 247,653 | 0.0040 | 197.6 |
| disasters | medium | 287,282 | 0.0035 | 19.3 |
| forestFire | medium | 416,170 | 0.0024 | 11.0 |
| harbour | medium | 290,471 | 0.0034 | 245.3 |
| harbourWithDisasters | medium | 290,367 | 0.0034 | 244.8 |
| hazyWoods | medium | 376,422 | 0.0027 | 12.2 |
| hospitalTown | fast | 120,742 | 0.0083 | 64.2 |
| overloaded | medium | 263,206 | 0.0038 | 11.3 |
| roadlessTown | medium | 348,115 | 0.0029 | 14.5 |
| smokyWoods | medium | 397,715 | 0.0025 | 12.4 |
| suburb | medium | 328,744 | 0.0030 | 16.4 |
| suburbBroke | medium | 313,446 | 0.0032 | 15.8 |
| suburbFast | fast | 134,412 | 0.0074 | 44.9 |
| suburbSlow | slow | 230,829 | 0.0043 | 13.7 |
| suburbUnderfunded | medium | 330,049 | 0.0030 | 15.2 |
| town | medium | 306,488 | 0.0033 | 188.9 |
| twinPlants | medium | 384,615 | 0.0026 | 13.4 |
| underfunded | medium | 306,827 | 0.0033 | 198.0 |
| wilderness | medium | 413,554 | 0.0024 | 10.8 |
| new city (seed 0) | slow | 246,113 | 0.0041 | 10.0 |
| new city (seed 0) | medium | 398,983 | 0.0025 | 10.8 |
| new city (seed 0) | fast | 173,103 | 0.0058 | 30.4 |
