---
name: city-cli
description: Use when playing or inspecting a city on a game server from the terminal — reading its status, map, overlays or budget, building, bulldozing or changing settings in a city someone links, or diagnosing why a city grows, shrinks or loses money.
---

# Playing a city from the command line

`cli/` is a player as a page is: it sends the commands a page sends, so other players see everything it does, and everything it builds costs the city's funds. `npm run --silent micropolis -- help` lists the commands; CLAUDE.md's Command line entry says how it works.

## Setup

- Give the city as its link, the game's address with `?city=<id>`, which names the server too: `export MICROPOLIS_CITY='<link>'`, then every run reaches that city with no `--city`.
- Sign in once a server with `sign-in <name>`. The session lives in `~/.config/micropolis/sessions.json` (`MICROPOLIS_SESSIONS` moves it). Signing in again with a session the server accepts reuses it, under its old name.
- The CLI's player shows in the city's online list while each run lasts, beside any browser signed in under the same name, which is a player of its own.

## Reading the city

- `status` first: date, funds, demand, power, the advisor's conditions, the evaluation's worst problems.
- `map <x,y> <x,y>` prints an area a character a tile, with x rulers above and y beside; `--legend` explains the characters. A zone's centre is upper case: that is the tile a building tool is applied at.
- `overlay <layer> [<x,y> <x,y>]` prints a layer a digit a block, 0 at the layer's low end and 9 at its high. Land value is 0 on undeveloped land, so it shows where development sits, not where it would do well.
- `tile <x,y>` gives what the query tool knows of one tile, including its city centre score: positive near the centre the zones average out to, negative far from it.

## Building

- `build road|rail|wire|bulldozer|park <x,y> ...` runs along each row and then each column between the points. Every other tool is applied once at each point, a building's centre.
- A line's outcome is its first tile that didn't succeed: "failed at a tile" usually means the line started on a tile already built, and the rest was built. Check with `map`.
- Each command costs at once: check `status`'s funds before a batch. A building past the funds says so and builds nothing; the rest of a batch is still sent.
- `budget` shows the forecast; `budget --tax n --road n --fire n --police n` sets the parts given.

## Traps

- The city runs while you work: a game year passes in a few real minutes at medium speed, and other players act between your runs. Read `status` again before acting on figures more than a minute old.
- A city's save in the dev server's database (`.cities/cities.db`) is only as fresh as its last autosave; the live city is what the CLI reads.
- Don't act on a shared city beyond what the person asked for; settings like speed, auto-budget and disasters apply to every player.

## Why zones grow or empty

From `server/Micropolis.Rules/Residential.cs` and `BlockMapUtils.cs`: a residential zone's score is the residential demand plus its land value less pollution, scaled; below a threshold it can only shrink. Land value falls with distance from the city centre, which is the average position of every zone, so far-off industry or an airport drags the centre away from the homes. It rises near water and trees and falls with pollution and heavy crime. Pollution's evaluation figure averages only the polluted blocks, so moving industry away doesn't lower it; it does keep pollution off homes.
