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

namespace Micropolis.Rules
{
    /// <summary>
    /// What each tool costs a tile it is applied at, before any bulldozing it does first, as <see cref="CityTools"/>
    /// builds the tools.
    /// </summary>
    public static class ToolCosts
    {
        public static IReadOnlyDictionary<ToolName, long> All =>
            CityTools.Create(new GameMap(1, 1)).ToDictionary(tool => tool.Key, tool => tool.Value.ToolCost);
    }

    /// <summary>
    /// The tools that change the city, with their costs, by the names tool commands give them.
    /// </summary>
    internal static class CityTools
    {
        /// <summary>
        /// The side in tiles of what each tool puts down, the side of its hover box too: a building's, and one tile
        /// for the rest.
        /// </summary>
        public static readonly IReadOnlyDictionary<ToolName, int> Sizes = new Dictionary<ToolName, int>
        {
            [ToolName.Airport] = 6,
            [ToolName.Bulldozer] = 1,
            [ToolName.Coal] = 4,
            [ToolName.Commercial] = 3,
            [ToolName.Fire] = 3,
            [ToolName.Industrial] = 3,
            [ToolName.Nuclear] = 4,
            [ToolName.Park] = 1,
            [ToolName.Police] = 3,
            [ToolName.Port] = 4,
            [ToolName.Rail] = 1,
            [ToolName.Residential] = 3,
            [ToolName.Road] = 1,
            [ToolName.Stadium] = 4,
            [ToolName.Station] = 1,
            [ToolName.Wire] = 1,
        };

        public static IReadOnlyDictionary<ToolName, CityTool> Create(GameMap map)
        {
            return new Dictionary<ToolName, CityTool>
            {
                [ToolName.Airport] = Building(10000, TileValues.AIRPORT, map, ToolName.Airport, animated: false),
                [ToolName.Bulldozer] = new BulldozerTool(map),
                [ToolName.Coal] = Building(3000, TileValues.POWERPLANT, map, ToolName.Coal, animated: false),
                [ToolName.Commercial] = Building(100, TileValues.COMCLR, map, ToolName.Commercial, animated: false, TileUtils.IsCommercial),
                [ToolName.Fire] = Building(500, TileValues.FIRESTATION, map, ToolName.Fire, animated: false),
                [ToolName.Industrial] = Building(100, TileValues.INDCLR, map, ToolName.Industrial, animated: false, TileUtils.IsIndustrial),
                [ToolName.Nuclear] = Building(5000, TileValues.NUCLEAR, map, ToolName.Nuclear, animated: true),
                [ToolName.Park] = new ParkTool(map),
                [ToolName.Police] = Building(500, TileValues.POLICESTATION, map, ToolName.Police, animated: false),
                [ToolName.Port] = Building(3000, TileValues.PORT, map, ToolName.Port, animated: false),
                [ToolName.Rail] = new RailTool(map),
                // An empty residential zone may become a hospital, which may empty back into the zone
                [ToolName.Residential] = Building(100, TileValues.FREEZ, map, ToolName.Residential, animated: false,
                                                  centre => TileUtils.IsResidential(centre) || centre == TileValues.HOSPITAL),
                [ToolName.Road] = new RoadTool(map),
                // A stadium fills for a game and empties after it
                [ToolName.Stadium] = Building(5000, TileValues.STADIUM, map, ToolName.Stadium, animated: false,
                                              centre => centre is TileValues.STADIUM or TileValues.FULLSTADIUM),
                [ToolName.Station] = new StationTool(map),
                [ToolName.Wire] = new WireTool(map),
            };
        }

        /// <summary>
        /// The erasers of the tools that put something down (<see cref="IErasable"/>), every tool but the bulldozer, each
        /// over the tool given: what a player holding Shift with the tool applies.
        /// </summary>
        public static IReadOnlyDictionary<ToolName, CityTool> Erasers(GameMap map, IReadOnlyDictionary<ToolName, CityTool> tools)
        {
            Dictionary<ToolName, CityTool> erasers = new Dictionary<ToolName, CityTool>();

            foreach ((ToolName name, CityTool tool) in tools)
            {
                if (tool is IErasable erasable)
                {
                    erasers[name] = erasable.Eraser(map);
                }
            }

            return erasers;
        }

        // A building, which is of the kind its tool puts down where its centre holds the tool's centre tile, unless the
        // test given says otherwise
        private static BuildingTool Building(long cost, int centreTile, GameMap map, ToolName tool, bool animated,
                                             Func<int, bool>? builds = null)
        {
            return new BuildingTool(cost, centreTile, map, Sizes[tool], animated, builds ?? (centre => centre == centreTile));
        }
    }
}
