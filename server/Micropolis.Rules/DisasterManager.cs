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
    /// The disasters' state: how long a flood has left, and whether random disasters happen.
    /// </summary>
    public sealed class DisasterManager
    {
        // A tile's neighbours: north, east, south and west
        private static readonly int[] Dx = [0, 1, 0, -1];
        private static readonly int[] Dy = [-1, 0, 1, 0];

        private readonly GameMap _map;
        private readonly RandomStream _random;

        public DisasterManager(GameMap map, RandomStream random)
        {
            _map = map;
            _random = random;
        }

        /// <summary>
        /// How many more times phase 15 runs before a flood stops spreading and starts to recede.
        /// </summary>
        public long FloodCount { get; internal set; }

        public bool DisastersEnabled { get; internal set; }

        /// <summary>
        /// Raises the <see cref="Messages.DISASTER_MESSAGES"/>, as <c>src/disasterManager.js</c> does.
        /// </summary>
        internal EventEmitter Events { get; } = new EventEmitter();

        /// <summary>
        /// Phase 15's disasters: a flood runs down, and with disasters enabled one may strike, which needs the sprites
        /// and isn't ported.
        /// </summary>
        public void DoDisasters(Level gameLevel, Census census)
        {
            // A JavaScript number's truthiness: a negative count, which no flood leaves, still counts down
            if (FloodCount != 0)
            {
                FloodCount--;
            }

            if (!DisastersEnabled)
            {
                return;
            }

            throw new NotPortedException("disasterManager.doDisasters");
        }

        /// <summary>
        /// A flood tile's scan, as <c>doFlood</c> in the original's disasters.cpp: while the flood lasts it spreads to
        /// each neighbour that burns, is bare dirt, or is from the last woods tile to the last rubble, on one chance in
        /// 8 each, setting fire to a zone it reaches; after, it recedes to dirt on one chance in 16.
        /// </summary>
        public void DoFlood(int x, int y, BlockMaps blockMaps)
        {
            if (FloodCount > 0)
            {
                // Flood is not over yet
                for (int i = 0; i < 4; i++)
                {
                    if (_random.GetChance(7))
                    {
                        int xx = x + Dx[i];
                        int yy = y + Dy[i];

                        if (_map.TestBounds(xx, yy))
                        {
                            Tile tile = _map.GetTile(xx, yy);
                            int tileValue = tile.GetValue();

                            if (tile.IsCombustible() || tile.GetRawValue() == TileValues.DIRT ||
                                (tileValue >= TileValues.WOODS5 && tileValue < TileValues.FLOOD))
                            {
                                if (tile.IsZone())
                                {
                                    ZoneUtils.FireZone(_map, xx, yy, blockMaps);
                                }

                                _map.SetTile(xx, yy, TileValues.FLOOD + _random.GetRandom(2), TileFlags.NOFLAGS);
                            }
                        }
                    }
                }
            }
            else
            {
                if (_random.GetChance(15))
                {
                    _map.SetTile(x, y, TileValues.DIRT, TileFlags.NOFLAGS);
                }
            }
        }

        /// <summary>
        /// A nuclear plant's meltdown, a disaster, which creates sprites: it isn't ported, so it throws.
        /// </summary>
        public void DoMeltdown(int x, int y)
        {
            throw new NotPortedException("disasterManager.doMeltdown");
        }

        internal void Save(JsonObject saveData)
        {
            saveData["disasters"] = new JsonObject
            {
                ["floodCount"] = FloodCount,
                ["disastersEnabled"] = DisastersEnabled,
            };
        }

        internal void Load(SavedObject saveData)
        {
            saveData.ReadObject("disasters", disasters =>
            {
                FloodCount = disasters.ReadSafeInteger("floodCount");
                DisastersEnabled = disasters.ReadBool("disastersEnabled");
            });
        }
    }
}
