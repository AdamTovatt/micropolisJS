/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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
using static Micropolis.Rules.Validation;

namespace Micropolis.Rules
{
    /// <summary>
    /// How the simulation answers the queries a player sends it. They arrive untrusted, like commands: each is
    /// validated before it is answered, and anything else is rejected with the reason it fails. Answering reads the
    /// city and changes nothing.
    /// </summary>
    public static class Queries
    {
        /// <summary>
        /// The layers an overlay shows, in the order of <c>OVERLAY_LAYERS</c> in <c>src/protocol.ts</c>, each with the
        /// block map it reads, its range and the phase that recomputes it.
        /// </summary>
        public static readonly IReadOnlyList<OverlayLayer> Layers =
        [
            new OverlayLayer("landValue", city => city.BlockMaps.LandValueMap, 0, 250, 12),
            // The residential location score of each block, from its land value and pollution, which phase 12 computes
            // both of
            new OverlayLayer("housingAppeal", city => Residential.HousingAppealMap(city.BlockMaps),
                             Residential.LeastLocationScore, Residential.GreatestLocationScore, 12),
            new OverlayLayer("pollution", city => city.BlockMaps.PollutionDensityMap, 0, 255, 12),
            new OverlayLayer("crime", city => city.BlockMaps.CrimeRateMap, 0, 250, 13),
            // The map scan of phases 1 to 8 adds to the traffic and growth maps tile by tile, and phase 10 decays them,
            // which completes them for the cycle
            new OverlayLayer("trafficDensity", city => city.BlockMaps.TrafficDensityMap, 0, 240, 10),
            new OverlayLayer("populationDensity", city => city.BlockMaps.PopulationDensityMap, 0, 510, 14),
            new OverlayLayer("policeCoverage", city => city.BlockMaps.PoliceStationEffectMap, 0, 1000, 13),
            new OverlayLayer("fireCoverage", city => city.BlockMaps.FireStationEffectMap, 0, 1000, 15),
            new OverlayLayer("rateOfGrowth", city => city.BlockMaps.RateOfGrowthMap, -200, 200, 10),
            // Each tile, 1 where the last power scan powered it and 0 where it didn't
            new OverlayLayer("powerGrid", city => city.PowerManager.PowerGridMap, 0, 1, 11),
            // Each tile's riders, which the map scan adds to and phase 10 decays, as the traffic
            new OverlayLayer("railLoad", city => city.BlockMaps.RailLoadMap, 0, Traffic.MaxRailLoad, 10),
        ];

        // Each query's fields but its type, required or optional
        private static readonly IReadOnlyDictionary<string, IReadOnlyDictionary<string, bool>> QueryFields =
            new Dictionary<string, IReadOnlyDictionary<string, bool>>(StringComparer.Ordinal)
            {
                ["overlay"] = Fields(required: ["layer"]),
                ["tileReport"] = Fields(required: ["x", "y"]),
                ["budgetForecast"] = Fields(optional: ["fire", "police", "road", "tax"]),
                ["mapPreview"] = Fields(required: ["seed"]),
            };

        // The first tile of each category, in order: a tile belongs to the last category whose first tile it reaches.
        // This is idArray in tool.cpp of the original's MicropolisCore, which doZoneStatus searches. The original also
        // ends the table at 956, the first tile it has no category for, which it reports past the end of its list of
        // names; the rules' tiles from 956 to 1019 are churches it never builds, and fall in the category before.
        private static readonly IReadOnlyList<(int Start, string Category)> CategoryStarts =
        [
            (TileValues.DIRT, "CLEAR"), (TileValues.RIVER, "WATER"), (TileValues.TREEBASE, "TREES"),
            (TileValues.RUBBLE, "RUBBLE"), (TileValues.FLOOD, "FLOOD"), (TileValues.RADTILE, "RADIOACTIVE_WASTE"),
            (TileValues.FIRE, "FIRE"), (TileValues.ROADBASE, "ROAD"), (TileValues.POWERBASE, "POWER"),
            (TileValues.RAILBASE, "RAIL"), (TileValues.RESBASE, "RESIDENTIAL"), (TileValues.COMBASE, "COMMERCIAL"),
            (TileValues.INDBASE, "INDUSTRIAL"), (TileValues.PORTBASE, "SEAPORT"), (TileValues.AIRPORTBASE, "AIRPORT"),
            (TileValues.COALBASE, "COAL_POWER"), (TileValues.FIRESTBASE, "FIRE_STATION"),
            (TileValues.POLICESTBASE, "POLICE_STATION"), (TileValues.STADIUMBASE, "STADIUM"),
            (TileValues.NUCLEARBASE, "NUCLEAR_POWER"), (TileValues.HBRDG0, "DRAWBRIDGE"), (TileValues.RADAR0, "RADAR"),
            (TileValues.FOUNTAIN, "FOUNTAIN"), (TileValues.INDBASE2, "INDUSTRIAL"),
            (TileValues.FOOTBALLGAME1, "FOOTBALL_GAME"), (TileValues.VBRDG0, "DRAWBRIDGE"),
            (TileValues.NUKESWIRL1, "URANIUM"),

            // The rail stations, which the original never had, and the unused tiles after them
            (TileValues.HRAILSTATION, "RAIL"),
        ];

        // Declared after CategoryStarts, since static fields are initialised in the order they are declared
        /// <summary>
        /// What the query tool calls a tile, as <c>ZONE_CATEGORIES</c> in <c>src/protocol.ts</c> lists them: each
        /// category once, in the order of the first tile it names.
        /// </summary>
        public static readonly IReadOnlyList<string> ZoneCategories = CategoryStarts.Select(start => start.Category).Distinct().ToList();

        /// <summary>
        /// Why the simulation rejects this query on a map of this size, or null when it is valid: exactly its type's
        /// fields, each one the protocol allows. A reason quotes no value from the query, so a hostile query can't make
        /// it long.
        /// </summary>
        public static string? Rejection(JsonNode? query, int width, int height)
        {
            if (query is not JsonObject fields || !TryGetString(fields["type"], out string? type) ||
                !QueryFields.TryGetValue(type!, out IReadOnlyDictionary<string, bool>? rules))
            {
                return "not a query";
            }

            if (!HasFields(fields, rules, "type"))
            {
                return FieldsReason($"the {type} query", rules);
            }

            return type switch
            {
                "overlay" => TryGetString(fields["layer"], out string? layer) && Layers.Any(known => known.Name == layer)
                    ? null
                    : $"the layer is one of {string.Join(", ", Layers.Select(known => known.Name))}",
                "tileReport" => TryGetWholeNumberIn(fields["x"], 0, width - 1, out _) && TryGetWholeNumberIn(fields["y"], 0, height - 1, out _)
                    ? null
                    : $"the tile is an x from 0 to {width - 1} and a y from 0 to {height - 1}, in whole numbers",
                "budgetForecast" => CommandReader.FundingRejection(fields) ?? CommandReader.TaxRejection(fields),
                "mapPreview" => TryGetSeed(fields["seed"], out _) ? null : "the seed is a uint32",
                _ => throw new InvalidOperationException($"The {type} query has fields but no check."),
            };
        }

        /// <summary>
        /// The answer to a query asked before any city has started, as <c>answerQueryWithoutCity</c>: the only query
        /// that needs no city is a map preview.
        /// </summary>
        public static QueryAnswer AnswerWithoutCity(JsonNode? query)
        {
            if (!NeedsNoCity(query))
            {
                return new QueryRejection("no city has started");
            }

            // No map is needed to check a preview: only a tile report's checks read its size
            string? reason = Rejection(query, 0, 0);
            return reason is null ? MapPreview(SeedOf(query!.AsObject())) : new QueryRejection(reason);
        }

        /// <summary>
        /// Whether the query is one a city answers as <see cref="AnswerWithoutCity"/> does, a map preview, which reads
        /// nothing of the city.
        /// </summary>
        public static bool NeedsNoCity(JsonNode? query)
        {
            return query is JsonObject fields && TryGetString(fields["type"], out string? type) && type == "mapPreview";
        }

        /// <summary>
        /// The category of a tile value without its flags, as doZoneStatus in the original's tool.cpp finds it. The
        /// coal plant's smoke lies among the industrial tiles, so it is first taken for the plant. MicropolisCore's
        /// doZoneStatus reports dirt past the end of its list of names (its comment says "This breaks the program");
        /// the older C version, doZoneStatus in micropolis-activity's w_tool.c, reports it as clear, and so does the
        /// port.
        /// </summary>
        public static string ZoneCategory(int tile)
        {
            int value = tile >= TileValues.COALSMOKE1 && tile < TileValues.FOOTBALLGAME1 ? TileValues.COALBASE : tile;

            int i = 0;
            while (i + 1 < CategoryStarts.Count && value >= CategoryStarts[i + 1].Start)
            {
                i++;
            }

            return CategoryStarts[i].Category;
        }

        /// <summary>
        /// The answer to a query of the city, or its rejection. The values are a copy, so nothing done with an answer
        /// reaches the city.
        /// </summary>
        internal static QueryAnswer Answer(JsonNode? query, Simulation city)
        {
            string? reason = Rejection(query, city.Map.Width, city.Map.Height);

            if (reason is not null)
            {
                return new QueryRejection(reason);
            }

            JsonObject fields = query!.AsObject();

            return (string)fields["type"]! switch
            {
                "overlay" => Overlay((string)fields["layer"]!, city),
                "tileReport" => TileReport(WholeNumber(fields["x"]), WholeNumber(fields["y"]), city),
                "budgetForecast" => BudgetForecast(fields, city),
                "mapPreview" => MapPreview(SeedOf(fields)),
                string type => throw new InvalidOperationException($"The {type} query has a check but no answer."),
            };
        }

        // The map a new city on the seed starts on, which the generator draws from the seed's map stream alone
        private static MapPreviewAnswer MapPreview(uint seed)
        {
            GameMap map = MapGenerator.Generate(RandomStream.MapStream(seed));
            return new MapPreviewAnswer(seed, map.Width, map.Height, map.RawValues());
        }

        private static OverlayAnswer Overlay(string name, Simulation city)
        {
            OverlayLayer layer = Layers.Single(known => known.Name == name);
            BlockMap map = layer.Map(city);

            return new OverlayAnswer(name, map.BlockSize, map.Width, map.Height, layer.Low, layer.High, map.CopyValues());
        }

        private static TileReportAnswer TileReport(int x, int y, Simulation city)
        {
            Tile tile = city.Map.GetTile(x, y);
            int value = tile.GetValue();
            BlockMaps maps = city.BlockMaps;

            return new TileReportAnswer(
                x, y, value, ZoneCategory(value),
                maps.PopulationDensityMap.WorldGet(x, y), maps.LandValueMap.WorldGet(x, y), maps.CrimeRateMap.WorldGet(x, y),
                maps.PollutionDensityMap.WorldGet(x, y), maps.RateOfGrowthMap.WorldGet(x, y),
                tile.IsCombustible(), tile.IsBulldozable(), tile.IsConductive(), tile.IsAnimated(), tile.IsPowered(), tile.IsZone(),
                maps.FireStationMap.WorldGet(x, y), maps.FireStationEffectMap.WorldGet(x, y),
                maps.PoliceStationMap.WorldGet(x, y), maps.PoliceStationEffectMap.WorldGet(x, y),
                maps.TerrainDensityMap.WorldGet(x, y), maps.TrafficDensityMap.WorldGet(x, y),
                maps.CityCentreDistScoreMap.WorldGet(x, y),
                ZoneGrowth.Report(city, x, y));
        }

        private static BudgetForecastAnswer BudgetForecast(JsonObject fields, Simulation city)
        {
            Budget budget = city.Budget;
            YearForecast forecast = budget.Forecast(CheckedWholeNumber(fields, "road"), CheckedWholeNumber(fields, "fire"),
                CheckedWholeNumber(fields, "police"), CheckedWholeNumber(fields, "tax"), city.GameLevel, city.Census);
            return new BudgetForecastAnswer(Records.Budget(budget), forecast.Wanted, forecast.Taxes, forecast.FundsChange, forecast.FundsAfterYear);
        }

        // A whole number already checked to be in range
        private static int WholeNumber(JsonNode? value)
        {
            return TryGetWholeNumber(value, out double number) ? (int)number : throw new InvalidOperationException("A checked number is whole.");
        }

        private static uint SeedOf(JsonObject fields)
        {
            return TryGetSeed(fields["seed"], out uint seed) ? seed : throw new InvalidOperationException("A checked seed is a uint32.");
        }
    }

    /// <summary>
    /// A layer an overlay shows: its name; the block map of the city it reads, which an answer copies; the ends of its
    /// range, the range its block map keeps its values to; and the phase whose scan recomputes it, after which the
    /// simulation emits <see cref="RulesEvents.OverlayUpdated"/> for it.
    /// </summary>
    public sealed record OverlayLayer(string Name, Func<Simulation, BlockMap> Map, int Low, int High, int Phase);
}
