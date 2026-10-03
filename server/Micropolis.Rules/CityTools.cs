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
    /// The tools that change the city, with their costs, by the names tool commands give them, as
    /// <c>src/cityTools.ts</c> builds them.
    /// </summary>
    internal static class CityTools
    {
        public static IReadOnlyDictionary<ToolName, CityTool> Create(GameMap map)
        {
            return new Dictionary<ToolName, CityTool>
            {
                [ToolName.Airport] = new BuildingTool(10000, TileValues.AIRPORT, map, 6, false),
                [ToolName.Bulldozer] = new BulldozerTool(map),
                [ToolName.Coal] = new BuildingTool(3000, TileValues.POWERPLANT, map, 4, false),
                [ToolName.Commercial] = new BuildingTool(100, TileValues.COMCLR, map, 3, false),
                [ToolName.Fire] = new BuildingTool(500, TileValues.FIRESTATION, map, 3, false),
                [ToolName.Industrial] = new BuildingTool(100, TileValues.INDCLR, map, 3, false),
                [ToolName.Nuclear] = new BuildingTool(5000, TileValues.NUCLEAR, map, 4, true),
                [ToolName.Park] = new ParkTool(map),
                [ToolName.Police] = new BuildingTool(500, TileValues.POLICESTATION, map, 3, false),
                [ToolName.Port] = new BuildingTool(3000, TileValues.PORT, map, 4, false),
                [ToolName.Rail] = new RailTool(map),
                [ToolName.Residential] = new BuildingTool(100, TileValues.FREEZ, map, 3, false),
                [ToolName.Road] = new RoadTool(map),
                [ToolName.Stadium] = new BuildingTool(5000, TileValues.STADIUM, map, 4, false),
                [ToolName.Wire] = new WireTool(map),
            };
        }
    }
}
