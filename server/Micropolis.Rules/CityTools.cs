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
            [ToolName.Wire] = 1,
        };

        public static IReadOnlyDictionary<ToolName, CityTool> Create(GameMap map)
        {
            return new Dictionary<ToolName, CityTool>
            {
                [ToolName.Airport] = Building(10000, TileValues.AIRPORT, map, ToolName.Airport, animated: false),
                [ToolName.Bulldozer] = new BulldozerTool(map),
                [ToolName.Coal] = Building(3000, TileValues.POWERPLANT, map, ToolName.Coal, animated: false),
                [ToolName.Commercial] = Building(100, TileValues.COMCLR, map, ToolName.Commercial, animated: false),
                [ToolName.Fire] = Building(500, TileValues.FIRESTATION, map, ToolName.Fire, animated: false),
                [ToolName.Industrial] = Building(100, TileValues.INDCLR, map, ToolName.Industrial, animated: false),
                [ToolName.Nuclear] = Building(5000, TileValues.NUCLEAR, map, ToolName.Nuclear, animated: true),
                [ToolName.Park] = new ParkTool(map),
                [ToolName.Police] = Building(500, TileValues.POLICESTATION, map, ToolName.Police, animated: false),
                [ToolName.Port] = Building(3000, TileValues.PORT, map, ToolName.Port, animated: false),
                [ToolName.Rail] = new RailTool(map),
                [ToolName.Residential] = Building(100, TileValues.FREEZ, map, ToolName.Residential, animated: false),
                [ToolName.Road] = new RoadTool(map),
                [ToolName.Stadium] = Building(5000, TileValues.STADIUM, map, ToolName.Stadium, animated: false),
                [ToolName.Wire] = new WireTool(map),
            };
        }

        private static BuildingTool Building(long cost, int centreTile, GameMap map, ToolName tool, bool animated)
        {
            return new BuildingTool(cost, centreTile, map, Sizes[tool], animated);
        }
    }
}
