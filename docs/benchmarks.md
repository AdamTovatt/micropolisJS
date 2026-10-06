# Benchmarks

How fast the C# simulation steps a city, and how many bytes of state messages each player in a city on the server receives per step, on the committed fixtures and on new cities. `npm run benchmark` writes this file, with `server/Micropolis.Benchmarks`.

- Commit: 8ac800fc3e8f, with uncommitted changes
- Machine: Ubuntu 24.04.4 LTS, Arm64, 16 logical processors
- Load average over 1, 5 and 15 minutes: 26.39, 27.23, 17.31 as the timing started, 47.71, 34.63, 21.59 as it ended
- Runtime: .NET 10.0.11, Release build
- Each fixture's city is its save after its golden run, at its saved speed; random disasters are on for disasters and forestFire and harbourWithDisasters. A new city is the seed's map at the easy level.
- Steps/s and ms/step: the city is loaded, steps 4800 times to warm up, then 24000 steps are timed; the median of 5 repeats, each from a fresh load.
- Bytes/step: the server's state messages (`CityStateMessages` in `server/Micropolis.Rules`), taking one step a turn of the server's loop, as it does on average at 60 steps a second: a batch after each step unless nothing a player is sent changed, each counted as the UTF-8 bytes of the batch's JSON text, the payload of the WebSocket text frame every player in the city is sent, over the same steps as the timing.
- The fully zoned map is a new city at the easy level on a blank map built up from edge to edge: a road on every fourth row and column, a power line along each road between two junctions, a built zone in every lot between the roads, residential, commercial and industrial in turn, and twelve nuclear plants, which power them all. Its zones empty within a few years, so it warms up 480 steps at most and times 1680 at most, while they stand full.

| Fixture | Speed | Steps/s | ms/step | Bytes/step |
|---------|-------|--------:|--------:|-----------:|
| broke | medium | 148,625 | 0.0067 | 52.8 |
| commuters | medium | 147,066 | 0.0068 | 27.7 |
| disasters | medium | 203,551 | 0.0049 | 24.0 |
| forestFire | medium | 371,083 | 0.0027 | 12.0 |
| harbour | medium | 60,887 | 0.0164 | 89.0 |
| harbourWithDisasters | medium | 319,109 | 0.0031 | 16.2 |
| hazyWoods | medium | 345,944 | 0.0029 | 13.2 |
| hospitalTown | fast | 43,532 | 0.0230 | 80.8 |
| overloaded | medium | 243,598 | 0.0041 | 12.2 |
| roadlessTown | medium | 232,711 | 0.0043 | 18.0 |
| smokyWoods | medium | 359,081 | 0.0028 | 13.3 |
| suburb | medium | 149,726 | 0.0067 | 22.3 |
| suburbBroke | medium | 215,056 | 0.0046 | 19.3 |
| suburbFast | fast | 52,175 | 0.0192 | 65.3 |
| suburbSlow | slow | 171,165 | 0.0058 | 15.3 |
| suburbUnderfunded | medium | 198,007 | 0.0051 | 19.9 |
| taxCap | medium | 223,850 | 0.0045 | 49.5 |
| town | medium | 125,183 | 0.0080 | 60.1 |
| twinPlants | medium | 353,247 | 0.0028 | 14.3 |
| underfunded | medium | 107,784 | 0.0093 | 54.4 |
| wilderness | medium | 354,866 | 0.0028 | 11.7 |
| new city (seed 0) | slow | 232,346 | 0.0043 | 10.6 |
| new city (seed 0) | medium | 341,125 | 0.0029 | 11.7 |
| new city (seed 0) | fast | 50,138 | 0.0199 | 33.2 |
| fully zoned map | fast | 154 | 6.5089 | 1,052.3 |
