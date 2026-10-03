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
        private readonly GameMap _map;

        public PowerManager(GameMap map)
        {
            _map = map;
            PowerGridMap = new BlockMap(map.Width, map.Height, 1, 0, 1);
        }

        /// <summary>
        /// Raises <see cref="Messages.NOT_ENOUGH_POWER"/> when a power scan finds the load above the capacity.
        /// </summary>
        internal EventEmitter Events { get; } = new EventEmitter();

        /// <summary>
        /// One entry per tile: 1 where the last power scan delivered power.
        /// </summary>
        public BlockMap PowerGridMap { get; }

        /// <summary>
        /// The power sources the map scan has found for the next power scan, in push order: each a tile of the map.
        /// </summary>
        public IReadOnlyList<Position> PowerStack => _powerStack;

        private List<Position> _powerStack = new List<Position>();

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
            _powerStack = scanData.ReadObjectList("powerStack",
                source => new Position(source.ReadInt("x", 0, _map.Width - 1), source.ReadInt("y", 0, _map.Height - 1)));
            PowerCapacity = scanData.ReadSafeInteger("powerCapacity");
            PowerLoad = scanData.ReadSafeInteger("powerLoad");
        }

        /// <summary>
        /// Powers a conductive tile the map scan reaches when it is a plant or the last power scan reached it, and
        /// unpowers it otherwise.
        /// </summary>
        public void SetTilePower(int x, int y)
        {
            Tile tile = _map.GetTile(x, y);
            int tileValue = tile.GetValue();

            if (tileValue == TileValues.NUCLEAR || tileValue == TileValues.POWERPLANT ||
                PowerGridMap.WorldGet(x, y) > 0)
            {
                tile.AddFlags(TileFlags.POWERBIT);
                return;
            }

            tile.RemoveFlags(TileFlags.POWERBIT);
        }

        public void ClearPowerStack()
        {
            _powerStack = new List<Position>();
        }

        public void DoPowerScan(Census census)
        {
            throw new NotPortedException("powerManager.doPowerScan");
        }

        public void CoalPowerFound(GameMap map, int x, int y, SimData simData)
        {
            throw new NotPortedException("powerManager.coalPowerFound");
        }

        public void NuclearPowerFound(GameMap map, int x, int y, SimData simData)
        {
            throw new NotPortedException("powerManager.nuclearPowerFound");
        }

        public void RegisterHandlers(MapScanner mapScanner, RepairManager repairManager)
        {
            mapScanner.AddAction(TileValues.POWERPLANT, CoalPowerFound);
            mapScanner.AddAction(TileValues.NUCLEAR, NuclearPowerFound);
            repairManager.AddAction(TileValues.POWERPLANT, 7, 4);
            repairManager.AddAction(TileValues.NUCLEAR, 7, 4);
        }
    }
}
