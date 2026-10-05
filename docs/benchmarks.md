# Benchmarks

How fast the C# simulation steps a city, and how many bytes of state messages each player in a city on the server receives per step, on the committed fixtures and on new cities. `npm run benchmark` writes this file, with `server/Micropolis.Benchmarks`.

- Commit: 71a6e93913cd
- Machine: Ubuntu 24.04.4 LTS, Arm64, 16 logical processors
- Load average over 1, 5 and 15 minutes: 3.18, 3.99, 5.25 as the timing started, 2.40, 3.69, 5.09 as it ended
- Runtime: .NET 10.0.11, Release build
- Each fixture's city is its save after its golden run, at its saved speed; random disasters are on for disasters and forestFire and harbourWithDisasters. A new city is the seed's map at the easy level.
- Steps/s and ms/step: the city is loaded, steps 4800 times to warm up, then 24000 steps are timed; the median of 5 repeats, each from a fresh load.
- Bytes/step: the server's state messages (`CityStateMessages` in `server/Micropolis.Rules`), taking one step a turn of the server's loop, as it does on average at 60 steps a second: a batch after each step unless nothing a player is sent changed, each counted as the UTF-8 bytes of the batch's JSON text, the payload of the WebSocket text frame every player in the city is sent, over the same steps as the timing.

| Fixture | Speed | Steps/s | ms/step | Bytes/step |
|---------|-------|--------:|--------:|-----------:|
| broke | medium | 214,228 | 0.0047 | 199.9 |
| disasters | medium | 294,589 | 0.0034 | 22.4 |
| forestFire | medium | 422,505 | 0.0024 | 11.0 |
| harbour | medium | 171,393 | 0.0058 | 250.9 |
| harbourWithDisasters | medium | 341,774 | 0.0029 | 95.8 |
| hazyWoods | medium | 402,893 | 0.0025 | 12.2 |
| hospitalTown | fast | 126,038 | 0.0079 | 77.3 |
| overloaded | medium | 268,141 | 0.0037 | 11.3 |
| roadlessTown | medium | 359,670 | 0.0028 | 18.5 |
| smokyWoods | medium | 408,295 | 0.0024 | 12.4 |
| suburb | medium | 334,583 | 0.0030 | 20.4 |
| suburbBroke | medium | 322,611 | 0.0031 | 18.8 |
| suburbFast | fast | 136,380 | 0.0073 | 54.4 |
| suburbSlow | slow | 238,909 | 0.0042 | 16.4 |
| suburbUnderfunded | medium | 341,686 | 0.0029 | 18.9 |
| taxCap | medium | 322,144 | 0.0031 | 141.1 |
| town | medium | 313,401 | 0.0032 | 192.2 |
| twinPlants | medium | 408,002 | 0.0025 | 13.4 |
| underfunded | medium | 313,339 | 0.0032 | 199.9 |
| wilderness | medium | 417,864 | 0.0024 | 10.8 |
| new city (seed 0) | slow | 253,974 | 0.0039 | 10.0 |
| new city (seed 0) | medium | 418,441 | 0.0024 | 10.8 |
| new city (seed 0) | fast | 178,541 | 0.0056 | 30.4 |
