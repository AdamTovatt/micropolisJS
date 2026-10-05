# Benchmarks

How fast the C# simulation steps a city, and how many bytes of state messages each player in a city on the server receives per step, on the committed fixtures and on new cities. `npm run benchmark` writes this file, with `server/Micropolis.Benchmarks`.

- Commit: 8a31769522a3
- Machine: Ubuntu 24.04.4 LTS, Arm64, 16 logical processors
- Load average over 1, 5 and 15 minutes: 25.35, 23.69, 18.42 as the timing started, 10.09, 19.13, 17.26 as it ended
- Runtime: .NET 10.0.11, Release build
- Each fixture's city is its save after its golden run, at its saved speed; random disasters are on for disasters and forestFire and harbourWithDisasters. A new city is the seed's map at the easy level.
- Steps/s and ms/step: the city is loaded, steps 4800 times to warm up, then 24000 steps are timed; the median of 5 repeats, each from a fresh load.
- Bytes/step: the server's state messages (`CityStateMessages` in `server/Micropolis.Rules`), taking one step a turn of the server's loop, as it does on average at 60 steps a second: a batch after each step unless nothing a player is sent changed, each counted as the UTF-8 bytes of the batch's JSON text, the payload of the WebSocket text frame every player in the city is sent, over the same steps as the timing.
- The fully zoned map is a new city at the easy level on a blank map built up from edge to edge: a road on every fourth row and column, a power line along each road between two junctions, a built zone in every lot between the roads, residential, commercial and industrial in turn, and twelve nuclear plants, which power them all. Its zones empty within a few years, so it warms up 480 steps at most and times 1680 at most, while they stand full.

| Fixture | Speed | Steps/s | ms/step | Bytes/step |
|---------|-------|--------:|--------:|-----------:|
| broke | medium | 228,569 | 0.0044 | 194.0 |
| disasters | medium | 262,731 | 0.0038 | 22.6 |
| forestFire | medium | 420,574 | 0.0024 | 11.0 |
| harbour | medium | 123,708 | 0.0081 | 244.9 |
| harbourWithDisasters | medium | 258,659 | 0.0039 | 198.0 |
| hazyWoods | medium | 403,081 | 0.0025 | 12.2 |
| hospitalTown | fast | 70,244 | 0.0142 | 76.1 |
| overloaded | medium | 265,598 | 0.0038 | 11.3 |
| roadlessTown | medium | 283,583 | 0.0035 | 16.6 |
| smokyWoods | medium | 398,749 | 0.0025 | 12.4 |
| suburb | medium | 194,418 | 0.0051 | 20.6 |
| suburbBroke | medium | 288,682 | 0.0035 | 17.9 |
| suburbFast | fast | 70,331 | 0.0142 | 62.5 |
| suburbSlow | slow | 196,975 | 0.0051 | 14.5 |
| suburbUnderfunded | medium | 289,608 | 0.0035 | 18.1 |
| taxCap | medium | 311,696 | 0.0032 | 141.7 |
| town | medium | 185,802 | 0.0054 | 206.2 |
| twinPlants | medium | 399,191 | 0.0025 | 13.4 |
| underfunded | medium | 277,812 | 0.0036 | 201.8 |
| wilderness | medium | 420,092 | 0.0024 | 10.8 |
| new city (seed 0) | slow | 258,776 | 0.0039 | 10.0 |
| new city (seed 0) | medium | 417,149 | 0.0024 | 10.8 |
| new city (seed 0) | fast | 177,170 | 0.0056 | 30.4 |
| fully zoned map | fast | 438 | 2.2821 | 989.6 |
