micropolisJS
============

This is a modified version of Graeme McCutcheon's [micropolisJS](https://github.com/graememcc/micropolisJS), continued from it since October 2026, and not the original program. It aims to grow the faithful single-player port into a multiplayer city builder: a deterministic simulation on a C# server, which owns each city and runs it for every player in it, with the browser as the client.

To run it, with the Node version that `engines` in `package.json` asks for and the .NET SDK that `global.json` pins:

```bash
npm install
(cd server/Micropolis.Server && dotnet run)
```

then open http://localhost:5180. The server needs three settings, `JWT_SECRET`, `TRUSTED_PROXIES` and `CITY_DATABASE`, which `dotnet run` takes from the development profile in `server/Micropolis.Server/Properties/launchSettings.json`. [`CLAUDE.md`](CLAUDE.md) describes them, the tests and the other tools, the architecture and where the project is heading.

---

The rest of this file is upstream's README.

https://www.graememcc.co.uk/micropolisJS

A port of Micropolis to JS/HTML5. The code is licensed under the GPLv3, with some additional terms - please be mindful of these. Likewise, be aware that the code is additionally governed by the Micropolis Public Name License as detailed in the next paragraph; this too must be complied with.

## [Micropolis Public Name License](MicropolisPublicNameLicense.md) ##
The name/term "MICROPOLIS" is a registered trademark of [Micropolis](https://www.micropolis.com) GmbH (Micropolis Corporation, the "licensor") and is licensed here to the authors/publishers of the "Micropolis" city simulation game and its source code (the project or "licensee(s)") as a courtesy of the owner.
