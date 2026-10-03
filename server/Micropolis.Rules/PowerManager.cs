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

namespace Micropolis.Rules
{
    /// <summary>
    /// What the power scans leave for the next: the last scan's grid and figures, and the power sources the map scan
    /// has found since, saved under <c>scannedState.power</c>.
    /// </summary>
    public sealed class PowerManager
    {
        private readonly int _gameMapWidth;
        private readonly int _gameMapHeight;

        public PowerManager(int gameMapWidth, int gameMapHeight)
        {
            _gameMapWidth = gameMapWidth;
            _gameMapHeight = gameMapHeight;
            PowerGridMap = new BlockMap(gameMapWidth, gameMapHeight, 1, 0, 1);
        }

        /// <summary>
        /// One entry per tile: 1 where the last power scan delivered power.
        /// </summary>
        public BlockMap PowerGridMap { get; }

        /// <summary>
        /// The power sources the map scan has found for the next power scan, in push order: each a tile of the map.
        /// </summary>
        public IReadOnlyList<Position> PowerStack { get; internal set; } = [];

        public long PowerCapacity { get; internal set; }

        public long PowerLoad { get; internal set; }

        internal void SaveScan(JsonObject scanData)
        {
            scanData["powerGrid"] = PowerGridMap.Save();
            scanData["powerStack"] = new JsonArray(PowerStack.Select(source => (JsonNode?)new JsonObject
            {
                ["x"] = source.X,
                ["y"] = source.Y,
            }).ToArray());
            scanData["powerCapacity"] = PowerCapacity;
            scanData["powerLoad"] = PowerLoad;
        }

        /// <summary>
        /// Reads <c>scannedState.power</c>, given as <paramref name="scanData"/>.
        /// </summary>
        internal void LoadScan(SavedObject scanData)
        {
            PowerGridMap.Load(scanData, "powerGrid");
            PowerStack = scanData.ReadObjectList("powerStack",
                source => new Position(source.ReadInt("x", 0, _gameMapWidth - 1), source.ReadInt("y", 0, _gameMapHeight - 1)));
            PowerCapacity = scanData.ReadSafeInteger("powerCapacity");
            PowerLoad = scanData.ReadSafeInteger("powerLoad");
        }
    }
}
