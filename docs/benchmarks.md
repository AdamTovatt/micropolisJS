# Benchmarks

How fast the C# simulation steps a city, and how many bytes of state messages each player in a city on the server receives per step, on the committed fixtures and on new cities. `npm run benchmark` writes this file, with `server/Micropolis.Benchmarks`.

- Commit: a2b316e8c8c1, with uncommitted changes
- Machine: Ubuntu 24.04.4 LTS, Arm64, 16 logical processors
- Load average over 1, 5 and 15 minutes: 21.77, 16.69, 12.55 as the timing started, 17.92, 17.24, 13.23 as it ended
- Runtime: .NET 10.0.11, Release build
- Each fixture's city is its save after its golden run, at its saved speed; random disasters are on for disasters and forestFire and harbourWithDisasters. A new city is the seed's map at the easy level.
- Steps/s and ms/step: the city is loaded, steps 4800 times to warm up, then 24000 steps are timed; the median of 5 repeats, each from a fresh load.
- Bytes/step: the server's state messages (`CityStateMessages` in `server/Micropolis.Rules`), taking one step a turn of the server's loop, as it does on average at 60 steps a second: a batch after each step unless nothing a player is sent changed, each counted as the UTF-8 bytes of the batch's JSON text, the payload of the WebSocket text frame every player in the city is sent, over the same steps as the timing.
- The fully zoned map is a new city at the easy level on a blank map built up from edge to edge: a road on every fourth row and column, a power line along each road between two junctions, a built zone in every lot between the roads, residential, commercial and industrial in turn, and twelve nuclear plants, which power them all. Its zones empty within a few years, so it warms up 480 steps at most and times 1680 at most, while they stand full.

| Fixture | Speed | Steps/s | ms/step | Bytes/step |
|---------|-------|--------:|--------:|-----------:|
| broke | medium | 160,096 | 0.0062 | 64.8 |
| commuters | medium | 144,256 | 0.0069 | 32.3 |
| disasters | medium | 219,009 | 0.0046 | 28.1 |
| forestFire | medium | 333,697 | 0.0030 | 14.2 |
| harbour | medium | 111,457 | 0.0090 | 105.2 |
| harbourWithDisasters | medium | 292,711 | 0.0034 | 19.8 |
| hazyWoods | medium | 323,529 | 0.0031 | 15.7 |
| hospitalTown | fast | 54,540 | 0.0183 | 93.0 |
| overloaded | medium | 220,170 | 0.0045 | 14.4 |
| roadlessTown | medium | 226,148 | 0.0044 | 21.6 |
| smokyWoods | medium | 265,706 | 0.0038 | 15.7 |
| suburb | medium | 158,563 | 0.0063 | 25.9 |
| suburbBroke | medium | 233,392 | 0.0043 | 22.9 |
| suburbFast | fast | 56,873 | 0.0176 | 75.4 |
| suburbSlow | slow | 173,100 | 0.0058 | 18.6 |
| suburbUnderfunded | medium | 219,350 | 0.0046 | 23.5 |
| taxCap | medium | 229,059 | 0.0044 | 61.5 |
| town | medium | 155,652 | 0.0064 | 73.2 |
| twinPlants | medium | 328,765 | 0.0030 | 16.8 |
| underfunded | medium | 212,276 | 0.0047 | 66.2 |
| wilderness | medium | 327,437 | 0.0031 | 13.9 |
| new city (seed 0) | slow | 207,931 | 0.0048 | 13.0 |
| new city (seed 0) | medium | 326,509 | 0.0031 | 13.9 |
| new city (seed 0) | fast | 131,224 | 0.0076 | 38.9 |
| fully zoned map | fast | 319 | 3.1325 | 1,072.7 |
