/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details. Alternatively,
 * consult http://micropolisjs.graememcc.co.uk/LICENSE and
 * http://micropolisjs.graememcc.co.uk/COPYING
 *
 * The name/term "MICROPOLIS" is a registered trademark of Micropolis (https://www.micropolis.com) GmbH
 * (Micropolis Corporation, the "licensor") and is licensed here to the authors/publishers of the "Micropolis"
 * city simulation game and its source code (the project or "licensee(s)") as a courtesy of the owner.
 *
 */

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The maps the TypeScript generator makes, from <c>conformance/maps.json</c>: the hash of each seed's map
    /// object, and every tile of a few, so a mismatch can be located.
    /// </summary>
    public sealed record ConformanceMaps(IReadOnlyList<MapSeed> Seeds, IReadOnlyList<ListedMap> Maps)
    {
        public static ConformanceMaps Load()
        {
            return Parse(ConformanceFile.Read("maps.json"));
        }

        public static ConformanceMaps Parse(string json)
        {
            ConformanceMaps maps = ConformanceFile.Parse<ConformanceMaps>(json);

            ConformanceFile.NonEmpty("seeds", maps.Seeds);
            ConformanceFile.NonEmpty("maps", maps.Maps);

            foreach (ListedMap listed in maps.Maps)
            {
                if (listed.Map.Tiles.Length != listed.Map.Width * listed.Map.Height)
                {
                    throw new InvalidDataException($"The listed map of seed {listed.Seed} has {listed.Map.Tiles.Length} tiles, not {listed.Map.Width} × {listed.Map.Height}.");
                }

                if (!maps.Seeds.Any(seed => seed.Seed == listed.Seed))
                {
                    throw new InvalidDataException($"The listed map of seed {listed.Seed} has no hash.");
                }
            }

            return maps;
        }
    }

    /// <summary>
    /// A seed, which way the generator went for it, and the SHA-256 of the canonical text of its map object.
    /// </summary>
    public sealed record MapSeed(uint Seed, string Kind, int Lakes, string Hash)
    {
        public override string ToString()
        {
            return $"seed {Seed} ({Kind}, {Lakes} lakes)";
        }
    }

    public sealed record ListedMap(uint Seed, SavedMap Map)
    {
        public override string ToString()
        {
            return $"seed {Seed}";
        }
    }

    /// <summary>
    /// A map object as <c>GameMap.save</c> writes it.
    /// </summary>
    public sealed record SavedMap(int CityCentreX, int CityCentreY, int PollutionMaxX, int PollutionMaxY, int Width, int Height, int[] Tiles);
}
