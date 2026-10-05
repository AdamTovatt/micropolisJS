# Benchmarks

How fast the C# simulation steps a city, and how many bytes of state messages each player in a city on the server receives per step, on the committed fixtures and on new cities. `npm run benchmark` writes this file, with `server/Micropolis.Benchmarks`.

- Commit: 45b401ef820f
- Machine: Ubuntu 24.04.4 LTS, Arm64, 16 logical processors
- Load average over 1, 5 and 15 minutes: 5.07, 4.79, 3.05 as the timing started, 3.02, 4.29, 2.96 as it ended
- Runtime: .NET 10.0.11, Release build
- Each fixture's city is its save after its golden run, at its saved speed; random disasters are on for disasters and forestFire and harbourWithDisasters. A new city is the seed's map at the easy level.
- Steps/s and ms/step: the city is loaded, steps 4800 times to warm up, then 24000 steps are timed; the median of 5 repeats, each from a fresh load.
- Bytes/step: the server's state messages (`CityStateMessages` in `server/Micropolis.Rules`), taking one step a turn of the server's loop, as it does on average at 60 steps a second: a batch after each step unless nothing a player is sent changed, each counted as the UTF-8 bytes of the batch's JSON text, the payload of the WebSocket text frame every player in the city is sent, over the same steps as the timing.

| Fixture | Speed | Steps/s | ms/step | Bytes/step |
|---------|-------|--------:|--------:|-----------:|
| broke | medium | 210,338 | 0.0048 | 201.4 |
| disasters | medium | 294,108 | 0.0034 | 22.6 |
| forestFire | medium | 421,822 | 0.0024 | 11.0 |
| harbour | medium | 167,290 | 0.0060 | 251.4 |
| harbourWithDisasters | medium | 340,559 | 0.0029 | 95.5 |
| hazyWoods | medium | 402,509 | 0.0025 | 12.2 |
| hospitalTown | fast | 124,709 | 0.0080 | 77.5 |
| overloaded | medium | 262,596 | 0.0038 | 11.3 |
| roadlessTown | medium | 358,923 | 0.0028 | 17.4 |
| smokyWoods | medium | 406,773 | 0.0025 | 12.4 |
| suburb | medium | 335,966 | 0.0030 | 20.5 |
| suburbBroke | medium | 318,974 | 0.0031 | 19.1 |
| suburbFast | fast | 136,750 | 0.0073 | 58.9 |
| suburbSlow | slow | 237,232 | 0.0042 | 15.8 |
| suburbUnderfunded | medium | 341,617 | 0.0029 | 19.2 |
| taxCap | medium | 325,118 | 0.0031 | 140.5 |
| town | medium | 314,213 | 0.0032 | 192.4 |
| twinPlants | medium | 415,099 | 0.0024 | 13.4 |
| underfunded | medium | 313,665 | 0.0032 | 199.8 |
| wilderness | medium | 424,553 | 0.0024 | 10.8 |
| new city (seed 0) | slow | 258,336 | 0.0039 | 10.0 |
| new city (seed 0) | medium | 420,412 | 0.0024 | 10.8 |
| new city (seed 0) | fast | 179,976 | 0.0056 | 30.4 |
