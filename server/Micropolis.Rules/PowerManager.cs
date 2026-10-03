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
        // The tiles a coal and a nuclear plant can power
        private const long CoalPowerStrength = 700;
        private const long NuclearPowerStrength = 2000;

        // The coal plant's smokestacks, relative to its centre, and their smoke tiles
        private static readonly int[] SmokeDeltaX = [1, 2, 1, 2];
        private static readonly int[] SmokeDeltaY = [-1, -1, 0, 0];
        private static readonly int[] SmokeTiles = [TileValues.COALSMOKE1, TileValues.COALSMOKE2, TileValues.COALSMOKE3, TileValues.COALSMOKE4];

        // At each level, easy, medium and hard, the odds against a nuclear plant melting down at its scan
        private static readonly int[] MeltdownTable = [30000, 20000, 10000];

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

        // Whether the tile one step from the position is on the map, conductive and not yet reached by the scan
        private bool TestForConductive(BlockMap visitedMap, Position position, Direction testDir)
        {
            Position movedPos = Position.Move(position, testDir);

            return _map.IsPositionInBounds(movedPos) && _map.GetTile(movedPos.X, movedPos.Y).IsConductive() &&
                   visitedMap.WorldGet(movedPos.X, movedPos.Y) == 0;
        }

        /// <summary>
        /// Walks the conductive tiles from each power source on the stack, powering them in the grid until the walk
        /// passes what the plants deliver, and raises <see cref="Messages.NOT_ENOUGH_POWER"/> when it does.
        /// </summary>
        /// <remarks>
        /// As in the original, a plant beside another is walked as a load of the first rather than as a source. The
        /// original stops at the first step past the capacity; this walk goes on to measure the whole load, and powers
        /// exactly the tiles the original does.
        /// </remarks>
        public void DoPowerScan(Census census)
        {
            PowerGridMap.Clear();

            // Every tile the walk has reached, powered or not. Each scan starts it afresh, so no save holds it.
            BlockMap visitedMap = new BlockMap(_map.Width, _map.Height, 1, 0, 1);

            long maxPower = census.CoalPowerPop * CoalPowerStrength + census.NuclearPowerPop * NuclearPowerStrength;
            long powerConsumption = 0;

            while (_powerStack.Count > 0)
            {
                Position position = _powerStack[^1];
                _powerStack.RemoveAt(_powerStack.Count - 1);
                Direction? anyDir = null;
                int conNum;

                do
                {
                    powerConsumption++;

                    if (anyDir is not null)
                    {
                        position = Position.Move(position, anyDir);
                    }

                    visitedMap.WorldSet(position.X, position.Y, 1);
                    if (powerConsumption <= maxPower)
                    {
                        PowerGridMap.WorldSet(position.X, position.Y, 1);
                    }

                    // Counts up to two ways on, looking north, east, south then west. The walk goes on the last way
                    // counted, and a tile with two is stacked to walk from again.
                    conNum = 0;

                    // By index, so the walk's innermost loop takes no enumerator
                    for (int i = 0; i < Direction.CardinalDirections.Count && conNum < 2; i++)
                    {
                        Direction dir = Direction.CardinalDirections[i];

                        if (TestForConductive(visitedMap, position, dir))
                        {
                            conNum++;
                            anyDir = dir;
                        }
                    }

                    if (conNum > 1)
                    {
                        _powerStack.Add(position);
                    }
                } while (conNum > 0);
            }

            PowerCapacity = maxPower;
            PowerLoad = powerConsumption;

            if (powerConsumption > maxPower)
            {
                Events.Emit(Messages.NOT_ENOUGH_POWER);
            }
        }

        /// <summary>
        /// Counts a coal plant, pushes it as a power source for the next power scan, and sets its smokestacks to
        /// their animated smoke, as coalSmoke in the original does.
        /// </summary>
        public void CoalPowerFound(GameMap map, int x, int y, SimData simData)
        {
            simData.Census.CoalPowerPop += 1;

            _powerStack.Add(new Position(x, y));

            for (int i = 0; i < 4; i++)
            {
                map.SetTile(x + SmokeDeltaX[i], y + SmokeDeltaY[i], SmokeTiles[i],
                            TileFlags.ANIMBIT | TileFlags.CONDBIT | TileFlags.POWERBIT | TileFlags.BURNBIT);
            }
        }

        /// <summary>
        /// Counts a nuclear plant and pushes it as a power source, leaving its tiles as they are, unless disasters are
        /// enabled and it melts down, a disaster that isn't ported.
        /// </summary>
        public void NuclearPowerFound(GameMap map, int x, int y, SimData simData)
        {
            // With the auto repair system, the zone is repaired before a meltdown; the original bails before repairing
            if (simData.DisasterManager.DisastersEnabled &&
                simData.Random.GetRandom(MeltdownTable[(int)simData.GameLevel]) == 0)
            {
                simData.DisasterManager.DoMeltdown(x, y);
                return;
            }

            simData.Census.NuclearPowerPop += 1;
            _powerStack.Add(new Position(x, y));
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
