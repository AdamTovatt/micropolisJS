/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

using System.Text.Json;
using System.Text.Json.Nodes;
using Micropolis.Rules;

namespace Micropolis.Headless
{
    /// <summary>
    /// <c>conformance/ruleConstants.json</c>: the rules' numbers the client draws by or its tests count with, which the
    /// client takes from here rather than copying: the steps a unit of city time takes at each running speed
    /// (<see cref="CityTimeModel.StepsPerCityTime"/>), the units of city time in a year, the steps a hosted city takes
    /// a second (<see cref="Simulation.StepsPerSecond"/>) and the steps between a station's departures
    /// (<see cref="Timetable.DepartureInterval"/>), by which the client times its trains, what each tool costs, what each
    /// kind of walkway costs, a path a ninth and a footbridge or an underpass a tile (<see cref="ToolCosts.WalkwayCosts"/>), the
    /// advisor conditions in the order the status record lists them (<see cref="CityStatus.AdvisorConditionNames"/>),
    /// and each sprite type, numbered as the state messages number it, with its frames, counting from 1
    /// (<see cref="SpriteTraits.LastFrame"/>), which the client's sprite sheet must hold, and the block size of the fire
    /// department's cover map (<see cref="BlockMaps.StationMapBlockSize"/>), by which the end-to-end runner reads a
    /// save's cover, the ninths of each tile's carriageway by its value (<see cref="Walkways.Carriageway"/>), where a
    /// path is a crossing, which the client draws stripes on and gives way to walkers on, the ninths of each tile's rail
    /// track by its value (<see cref="Walkways.Track"/>), which the client
    /// draws an underpass going under as it does a carriageway, and the map's size in tiles
    /// (<see cref="MapGenerator.MapWidth"/>), which the world grass's baked field covers.
    /// </summary>
    internal static class RuleConstantsFile
    {
        public const string FileName = "ruleConstants.json";

        public static string Write()
        {
            IReadOnlyDictionary<ToolName, long> tools = ToolCosts.All;

            JsonObject steps = new JsonObject();
            foreach (Speed speed in RunningSpeeds.All)
            {
                steps[RunningSpeeds.Name(speed)] = CityTimeModel.StepsPerCityTime(speed);
            }

            JsonObject costs = new JsonObject();
            foreach (ToolName tool in Enum.GetValues<ToolName>())
            {
                costs[ProtocolJson.Name(tool)] = tools[tool];
            }

            JsonObject walkwayCosts = new JsonObject();
            foreach ((WalkwayKind kind, long cost) in ToolCosts.WalkwayCosts)
            {
                walkwayCosts[ProtocolJson.Name(kind)] = cost;
            }

            JsonObject carriageways = new JsonObject();
            JsonObject tracks = new JsonObject();
            for (int tile = 0; tile <= TileFlags.BIT_MASK; tile++)
            {
                string key = tile.ToString(System.Globalization.CultureInfo.InvariantCulture);
                int ninths = Walkways.Carriageway(tile);
                if (ninths != 0)
                {
                    carriageways[key] = ninths;
                }

                int track = Walkways.Track(tile);
                if (track != 0)
                {
                    tracks[key] = track;
                }
            }

            return JsonLines.FileOf([
                "{",
                JsonLines.Member("stepsPerCityTime", steps, false),
                JsonLines.Member("cityTimesPerYear", Simulation.CityTimesPerYear, false),
                JsonLines.Member("stepsPerSecond", Simulation.StepsPerSecond, false),
                JsonLines.Member("departureInterval", Timetable.DepartureInterval, false),
                JsonLines.Member("toolCosts", costs, false),
                JsonLines.Member("walkwayCosts", walkwayCosts, false),
                .. JsonLines.ListMember("advisorConditions", CityStatus.AdvisorConditionNames.Select(name => (JsonNode?)name).ToList(), false),
                .. JsonLines.ListMember("spriteTypes", Enum.GetValues<SpriteType>().Select(type => (JsonNode?)new JsonObject
                {
                    ["type"] = (int)type,
                    ["name"] = JsonNamingPolicy.CamelCase.ConvertName(type.ToString()),
                    ["frames"] = Sprite.TraitsOf(type).LastFrame,
                }).ToList(), false),
                JsonLines.Member("fireCoverBlockSize", BlockMaps.StationMapBlockSize, false),
                JsonLines.Member("carriageways", carriageways, false),
                JsonLines.Member("tracks", tracks, false),
                JsonLines.Member("mapSize", new JsonObject
                {
                    ["width"] = MapGenerator.MapWidth,
                    ["height"] = MapGenerator.MapHeight,
                }, true),
                "}",
            ]);
        }
    }
}
