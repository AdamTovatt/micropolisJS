# Benchmarks

How fast the C# simulation steps a city, and how many bytes of state messages each player in a city on the server receives per step, on the committed fixtures and on new cities. `npm run benchmark` writes this file, with `server/Micropolis.Benchmarks`.

- Commit: 04fefdf12fee, with uncommitted changes
- Machine: Ubuntu 24.04.4 LTS, Arm64, 16 logical processors
- Load average over 1, 5 and 15 minutes: 1.32, 2.67, 4.83 as the timing started, 1.43, 2.18, 4.34 as it ended
- Runtime: .NET 10.0.11, Release build
- Each fixture's city is its save after its golden run, at its saved speed; random disasters are on for disasters and forestFire and harbourWithDisasters. A new city is the seed's map at the easy level.
- Steps/s and ms/step: the city is loaded, steps 4800 times to warm up, then 24000 steps are timed; the median of 5 repeats, each from a fresh load.
- Bytes/step: the server's state messages (`CityStateMessages` in `server/Micropolis.Rules`), taking one step a turn of the server's loop, as it does on average at 60 steps a second: a batch after each step unless nothing a player is sent changed, each counted as the UTF-8 bytes of the batch's JSON text, the payload of the WebSocket text frame every player in the city is sent, over the same steps as the timing.
- The fully zoned map is a new city at the easy level on a blank map built up from edge to edge: a road on every fourth row and column, a power line along each road between two junctions, a built zone in every lot between the roads, residential, commercial and industrial in turn, and twelve nuclear plants, which power them all. Its zones empty within a few years, so it warms up 480 steps at most and times 1680 at most, while they stand full.

| Fixture | Speed | Steps/s | ms/step | Bytes/step |
|---------|-------|--------:|--------:|-----------:|
| broke | medium | 149,088 | 0.0067 | 74.6 |
| commuters | medium | 122,062 | 0.0082 | 33.4 |
| disasters | medium | 199,167 | 0.0050 | 23.4 |
| forestFire | medium | 270,074 | 0.0037 | 14.2 |
| harbour | medium | 96,106 | 0.0104 | 101.1 |
| harbourWithDisasters | medium | 239,156 | 0.0042 | 20.7 |
| hazyWoods | medium | 264,529 | 0.0038 | 15.7 |
| hospitalTown | fast | 47,694 | 0.0210 | 93.3 |
| overloaded | medium | 195,774 | 0.0051 | 14.4 |
| roadlessTown | medium | 178,840 | 0.0056 | 22.2 |
| smokyWoods | medium | 269,352 | 0.0037 | 15.7 |
| suburb | medium | 134,812 | 0.0074 | 25.4 |
| suburbBroke | medium | 165,463 | 0.0060 | 24.0 |
| suburbFast | fast | 45,673 | 0.0219 | 76.7 |
| suburbSlow | slow | 155,924 | 0.0064 | 19.0 |
| suburbUnderfunded | medium | 163,733 | 0.0061 | 24.1 |
| taxCap | medium | 226,571 | 0.0044 | 61.6 |
| town | medium | 125,564 | 0.0080 | 79.7 |
| twinPlants | medium | 274,944 | 0.0036 | 16.8 |
| underfunded | medium | 166,573 | 0.0060 | 68.6 |
| walkers | medium | 158,791 | 0.0063 | 25.2 |
| wilderness | medium | 281,239 | 0.0036 | 13.9 |
| new city (seed 0) | slow | 208,554 | 0.0048 | 13.0 |
| new city (seed 0) | medium | 278,388 | 0.0036 | 13.9 |
| new city (seed 0) | fast | 109,023 | 0.0092 | 38.9 |
| fully zoned map | fast | 309 | 3.2367 | 1,078.2 |
