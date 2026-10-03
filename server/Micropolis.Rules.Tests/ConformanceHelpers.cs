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

using System.Text.Json.Nodes;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// <c>conformance/helpers.json</c>: what the helpers the tile handlers share answered in the TypeScript, over every
    /// tile value and over the fixtures' saves.
    /// </summary>
    public sealed record ConformanceHelpers(
        IReadOnlyDictionary<string, string> ValuePredicates,
        IReadOnlyDictionary<string, string> ZonePredicates,
        IReadOnlyList<int> CheckZoneSize,
        IReadOnlyList<IReadOnlyList<int>> CheckBigZone,
        IReadOnlyList<HelperZone> Zones,
        IReadOnlyList<HelperFireZone> FireZones,
        IReadOnlyList<HelperGrowth> RateOfGrowth,
        IReadOnlyList<HelperPutZone> PutZones,
        string RepairFixture,
        IReadOnlyList<TileOverwrite> RepairDamage,
        IReadOnlyList<HelperRepair> Repairs,
        HelperSprites Sprites)
    {
        public static ConformanceHelpers Load()
        {
            return Parse(ConformanceFile.Read("helpers.json"));
        }

        public static ConformanceHelpers Parse(string json)
        {
            ConformanceHelpers helpers = ConformanceFile.Parse<ConformanceHelpers>(json);
            ConformanceFile.NonEmpty("valuePredicates", helpers.ValuePredicates);
            ConformanceFile.NonEmpty("zonePredicates", helpers.ZonePredicates);
            ConformanceFile.NonEmpty("zones", helpers.Zones);
            ConformanceFile.NonEmpty("fireZones", helpers.FireZones);
            ConformanceFile.NonEmpty("rateOfGrowth", helpers.RateOfGrowth);
            ConformanceFile.NonEmpty("putZones", helpers.PutZones);
            ConformanceFile.NonEmpty("repairDamage", helpers.RepairDamage);
            ConformanceFile.NonEmpty("repairs", helpers.Repairs);
            ConformanceFile.NonEmpty("firstOfType", helpers.Sprites.FirstOfType);
            ConformanceFile.NonEmpty("boatDistances", helpers.Sprites.BoatDistances);

            if (helpers.CheckZoneSize.Count != TileValues.TILE_COUNT || helpers.CheckBigZone.Count != TileValues.TILE_COUNT ||
                helpers.CheckBigZone.Any(zone => zone.Count != 3))
            {
                throw new InvalidDataException($"checkZoneSize and checkBigZone must hold an answer for each of the {TileValues.TILE_COUNT} tile values.");
            }

            foreach ((string name, string line) in helpers.ValuePredicates.Concat(helpers.ZonePredicates))
            {
                if (line.Length != TileValues.TILE_COUNT || line.Any(c => c != '0' && c != '1'))
                {
                    throw new InvalidDataException($"{name} must hold a 0 or 1 for each of the {TileValues.TILE_COUNT} tile values.");
                }
            }

            return helpers;
        }
    }

    /// <summary>
    /// A zone centre in a fixture's save: its population as its kind of zone counts it, when it is a residential,
    /// commercial or industrial zone, the road on its perimeter, if there is one, and its land value less its pollution
    /// as a category.
    /// </summary>
    public sealed record HelperZone(
        string Fixture, string Point, int X, int Y, int Value, string? Kind, int? Population, HelperPosition? PerimeterRoad,
        int LandPollutionValue)
    {
        public override string ToString()
        {
            return $"{Fixture} {Point}: the zone at ({X}, {Y})";
        }
    }

    public sealed record HelperPosition(int X, int Y);

    /// <summary>
    /// A zone centre of a fixture's built save set on fire, or a zone of <see cref="Laid"/> tiles a side laid there
    /// first: its block's rate of growth after, and the <see cref="AreaSize"/> by <see cref="AreaSize"/> tiles from
    /// its upper left neighbour after, as raw values row by row.
    /// </summary>
    public sealed record HelperFireZone(
        string Fixture, int X, int Y, int Value, int? Laid, int RateOfGrowth, int AreaSize, IReadOnlyList<int> Area);

    /// <summary>
    /// A block's rate of growth before and after a change of it.
    /// </summary>
    public sealed record HelperGrowth(int Start, int Delta, int Result);

    /// <summary>
    /// A zone laid around (x, y) on a fixture's built map, after any tile of its area was overwritten: whether it was
    /// laid, and the five by five tiles around the centre after, as raw values row by row.
    /// </summary>
    public sealed record HelperPutZone(
        string Fixture, int X, int Y, int CentreTile, bool IsPowered, TileOverwrite? Blocker, bool Laid, IReadOnlyList<int> Area);

    /// <summary>
    /// A tile overwritten before a helper runs, relative to the zone's centre: before a repair is tried, or a zone laid.
    /// </summary>
    public sealed record TileOverwrite(int Dx, int Dy, int Value);

    /// <summary>
    /// The repair manager's check of the zone centred at (x, y) at a city time, after the damage: whether it repaired
    /// anything, and the six by six tiles from the centre's upper left neighbour after it, as raw values row by row.
    /// </summary>
    public sealed record HelperRepair(int X, int Y, long CityTime, bool Repaired, IReadOnlyList<int> Area);

    /// <summary>
    /// A fixture's save with sprites added to its list: the index of the sprite the manager finds of each type, the
    /// type's one sprite while it is alive, or none, and the distance from tiles to the nearest live ship.
    /// </summary>
    public sealed record HelperSprites(
        string Fixture, string Point, JsonArray Added, IReadOnlyList<FirstOfType> FirstOfType,
        IReadOnlyList<BoatDistance> BoatDistances);

    public sealed record FirstOfType(int Type, int? Index);

    public sealed record BoatDistance(int X, int Y, long Distance);
}
