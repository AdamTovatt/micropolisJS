# Benchmarks

How fast the C# simulation steps a city, and how many bytes of state messages each player in a city on the server receives per step, on the committed fixtures and on new cities. `npm run benchmark` writes this file, with `server/Micropolis.Benchmarks`.

- Commit: c4c1db8cfbe4
- Machine: Ubuntu 24.04.4 LTS, Arm64, 16 logical processors
- Load average over 1, 5 and 15 minutes: 10.98, 10.06, 7.32 as the timing started, 7.35, 9.23, 7.16 as it ended
- Runtime: .NET 10.0.11, Release build
- Each fixture's city is its save after its golden run, at its saved speed; random disasters are on for disasters and forestFire and harbourWithDisasters. A new city is the seed's map at the easy level.
- Steps/s and ms/step: the city is loaded, steps 4800 times to warm up, then 24000 steps are timed; the median of 5 repeats, each from a fresh load.
- Bytes/step: the server's state messages (`CityStateMessages` in `server/Micropolis.Rules`), taking one step a turn of the server's loop, as it does on average at 60 steps a second: a batch after each step unless nothing a player is sent changed, each counted as the UTF-8 bytes of the batch's JSON text, the payload of the WebSocket text frame every player in the city is sent, over the same steps as the timing.

| Fixture | Speed | Steps/s | ms/step | Bytes/step |
|---------|-------|--------:|--------:|-----------:|
| broke | medium | 204,082 | 0.0049 | 197.6 |
| disasters | medium | 283,737 | 0.0035 | 19.3 |
| forestFire | medium | 409,781 | 0.0024 | 11.0 |
| harbour | medium | 289,610 | 0.0035 | 245.3 |
| harbourWithDisasters | medium | 289,890 | 0.0034 | 244.8 |
| hazyWoods | medium | 394,328 | 0.0025 | 12.2 |
| hospitalTown | fast | 121,267 | 0.0082 | 64.2 |
| overloaded | medium | 260,137 | 0.0038 | 11.3 |
| roadlessTown | medium | 347,880 | 0.0029 | 14.5 |
| smokyWoods | medium | 400,014 | 0.0025 | 12.4 |
| suburb | medium | 328,949 | 0.0030 | 16.4 |
| suburbBroke | medium | 313,714 | 0.0032 | 15.8 |
| suburbFast | fast | 134,945 | 0.0074 | 44.9 |
| suburbSlow | slow | 233,948 | 0.0043 | 13.7 |
| suburbUnderfunded | medium | 331,478 | 0.0030 | 15.2 |
| taxCap | medium | 315,856 | 0.0032 | 140.2 |
| town | medium | 304,453 | 0.0033 | 188.9 |
| twinPlants | medium | 395,900 | 0.0025 | 13.4 |
| underfunded | medium | 306,126 | 0.0033 | 198.0 |
| wilderness | medium | 412,495 | 0.0024 | 10.8 |
| new city (seed 0) | slow | 252,258 | 0.0040 | 10.0 |
| new city (seed 0) | medium | 410,080 | 0.0024 | 10.8 |
| new city (seed 0) | fast | 175,594 | 0.0057 | 30.4 |
