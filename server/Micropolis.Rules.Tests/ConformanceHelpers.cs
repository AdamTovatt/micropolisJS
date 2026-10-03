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
        IReadOnlyList<HelperZone> Zones,
        string RepairFixture,
        IReadOnlyList<RepairDamage> RepairDamage,
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
            ConformanceFile.NonEmpty("repairDamage", helpers.RepairDamage);
            ConformanceFile.NonEmpty("repairs", helpers.Repairs);
            ConformanceFile.NonEmpty("firstOfType", helpers.Sprites.FirstOfType);
            ConformanceFile.NonEmpty("boatDistances", helpers.Sprites.BoatDistances);

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
    /// commercial or industrial zone, and the road on its perimeter, if there is one.
    /// </summary>
    public sealed record HelperZone(
        string Fixture, string Point, int X, int Y, int Value, string? Kind, int? Population, HelperPosition? PerimeterRoad)
    {
        public override string ToString()
        {
            return $"{Fixture} {Point}: the zone at ({X}, {Y})";
        }
    }

    public sealed record HelperPosition(int X, int Y);

    /// <summary>
    /// A tile of a zone overwritten before the repair is tried, relative to the zone's centre.
    /// </summary>
    public sealed record RepairDamage(int Dx, int Dy, int Value);

    /// <summary>
    /// The repair manager's check of the zone centred at (x, y) at a city time, after the damage: whether it repaired
    /// anything, and the six by six tiles from the centre's upper left neighbour after it, as raw values row by row.
    /// </summary>
    public sealed record HelperRepair(int X, int Y, long CityTime, bool Repaired, IReadOnlyList<int> Area);

    /// <summary>
    /// A fixture's save with sprites added to its list: the index of the sprite the manager finds first of each type,
    /// and the distance from tiles to the nearest live ship.
    /// </summary>
    public sealed record HelperSprites(
        string Fixture, string Point, JsonArray Added, IReadOnlyList<FirstOfType> FirstOfType,
        IReadOnlyList<BoatDistance> BoatDistances);

    public sealed record FirstOfType(int Type, int? Index);

    public sealed record BoatDistance(int X, int Y, long Distance);
}
