# Benchmarks

How fast the C# simulation steps a city, and how many bytes of state messages each player in a city on the server receives per step, on the committed fixtures and on new cities. `npm run benchmark` writes this file, with `server/Micropolis.Benchmarks`.

- Commit: 2ce7157b781d, with uncommitted changes
- Machine: Ubuntu 24.04.4 LTS, Arm64, 16 logical processors
- Load average over 1, 5 and 15 minutes: 10.02, 13.31, 17.47 as the timing started, 4.57, 10.24, 15.82 as it ended
- Runtime: .NET 10.0.11, Release build
- Each fixture's city is its save after its golden run, at its saved speed; random disasters are on for disasters and forestFire and harbourWithDisasters. A new city is the seed's map at the easy level.
- Steps/s and ms/step: the city is loaded, steps 4800 times to warm up, then 24000 steps are timed; the median of 5 repeats, each from a fresh load.
- Bytes/step: the server's state messages (`CityStateMessages` in `server/Micropolis.Rules`), taking one step a turn of the server's loop, as it does on average at 60 steps a second: a batch after each step unless nothing a player is sent changed, each counted as the UTF-8 bytes of the batch's JSON text, the payload of the WebSocket text frame every player in the city is sent, over the same steps as the timing.
- The fully zoned map is a new city at the easy level on a blank map built up from edge to edge: a road on every fourth row and column, a power line along each road between two junctions, a built zone in every lot between the roads, residential, commercial and industrial in turn, and twelve nuclear plants, which power them all. Its zones empty within a few years, so it warms up 480 steps at most and times 1680 at most, while they stand full.

| Fixture | Speed | Steps/s | ms/step | Bytes/step |
|---------|-------|--------:|--------:|-----------:|
| broke | medium | 167,074 | 0.0060 | 72.8 |
| commuters | medium | 129,866 | 0.0077 | 32.3 |
| disasters | medium | 213,766 | 0.0047 | 22.2 |
| forestFire | medium | 304,817 | 0.0033 | 14.2 |
| harbour | medium | 99,117 | 0.0101 | 100.5 |
| harbourWithDisasters | medium | 258,780 | 0.0039 | 20.7 |
| hazyWoods | medium | 297,214 | 0.0034 | 15.7 |
| hospitalTown | fast | 50,900 | 0.0196 | 91.2 |
| overloaded | medium | 212,439 | 0.0047 | 14.4 |
| roadlessTown | medium | 190,849 | 0.0052 | 21.4 |
| smokyWoods | medium | 295,707 | 0.0034 | 15.7 |
| suburb | medium | 139,827 | 0.0072 | 24.8 |
| suburbBroke | medium | 173,869 | 0.0058 | 21.0 |
| suburbFast | fast | 47,238 | 0.0212 | 75.0 |
| suburbSlow | slow | 161,126 | 0.0062 | 18.7 |
| suburbUnderfunded | medium | 179,367 | 0.0056 | 22.9 |
| taxCap | medium | 245,736 | 0.0041 | 61.5 |
| town | medium | 130,172 | 0.0077 | 79.1 |
| twinPlants | medium | 299,891 | 0.0033 | 16.8 |
| underfunded | medium | 176,787 | 0.0057 | 67.3 |
| walkers | medium | 171,066 | 0.0058 | 18.1 |
| wilderness | medium | 309,604 | 0.0032 | 13.9 |
| new city (seed 0) | slow | 217,501 | 0.0046 | 13.0 |
| new city (seed 0) | medium | 306,183 | 0.0033 | 13.9 |
| new city (seed 0) | fast | 123,518 | 0.0081 | 38.9 |
| fully zoned map | fast | 307 | 3.2602 | 1,072.7 |
