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
    /// The disasters, after the original's disasters.cpp, and their state:
    /// how long a flood has left, and whether random disasters happen.
    /// </summary>
    public sealed class DisasterManager
    {
        // A tile's neighbours: north, east, south and west
        private static readonly int[] Dx = [0, 1, 0, -1];
        private static readonly int[] Dy = [-1, 0, 1, 0];

        // The maximum of the draw a disaster needs a 0 from, at each level: getRandom includes its maximum, so the
        // chance is one in one more than these
        private static readonly int[] DisChance = [10 * 48, 5 * 48, 60];

        private readonly GameMap _map;
        private readonly SpriteManager _spriteManager;
        private readonly RandomStream _random;

        public DisasterManager(GameMap map, SpriteManager spriteManager, RandomStream random)
        {
            _map = map;
            _spriteManager = spriteManager;
            _random = random;
        }

        /// <summary>
        /// How many more times phase 15 runs before a flood stops spreading and starts to recede.
        /// </summary>
        public long FloodCount { get; internal set; }

        public bool DisastersEnabled { get; internal set; }

        /// <summary>
        /// Raises the <see cref="Messages.DISASTER_MESSAGES"/>.
        /// </summary>
        internal EventEmitter Events { get; } = new EventEmitter();

        /// <summary>
        /// Phase 15's disasters: a flood runs down, and with disasters enabled one may strike: of the nine draws, two
        /// a fire, two a flood, one a tornado, one an earthquake, two a monster if the city is polluted, and one none.
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

            if (_random.GetRandom(DisChance[(int)gameLevel]) != 0)
            {
                return;
            }

            switch (_random.GetRandom(8))
            {
                case 0:
                case 1:
                    SetFire();
                    break;

                case 2:
                case 3:
                    MakeFlood();
                    break;

                case 5:
                    _spriteManager.MakeTornado();
                    break;

                case 6:
                    MakeEarthquake();
                    break;

                case 7:
                case 8:
                    if (census.PollutionAverage > 60)
                    {
                        _spriteManager.MakeMonster();
                    }

                    break;
            }
        }

        /// <summary>
        /// The random fire: one tile drawn at random, which burns if it is a building, but no zone's centre.
        /// </summary>
        private void SetFire()
        {
            int x = _random.GetRandom(_map.Width - 1);
            int y = _random.GetRandom(_map.Height - 1);
            Tile tile = _map.GetTile(x, y);

            if (!tile.IsZone())
            {
                int tileValue = tile.GetValue();
                if (tileValue > TileValues.LHTHR && tileValue < TileValues.LASTZONE)
                {
                    _map.SetTo(x, y, TileUtils.RandomFire(_random));
                    Events.Emit(Messages.FIRE_REPORTED, NewsPlaces.Showable(x, y));
                }
            }
        }

        /// <summary>
        /// The fire the player sets: up to 40 tiles drawn at random until one burns, which must be flammable, past the
        /// trees, and no zone's centre. The original reports it without a picture.
        /// </summary>
        public void MakeFire()
        {
            for (int i = 0; i < 40; i++)
            {
                int x = _random.GetRandom(_map.Width - 1);
                int y = _random.GetRandom(_map.Height - 1);
                Tile tile = _map.GetTile(x, y);

                if (!tile.IsZone() && tile.IsCombustible())
                {
                    int tileValue = tile.GetValue();
                    if (tileValue > TileValues.TREEBASE && tileValue < TileValues.LASTZONE)
                    {
                        _map.SetTo(x, y, TileUtils.RandomFire(_random));
                        Events.Emit(Messages.FIRE_REPORTED, new JsonObject { ["x"] = x, ["y"] = y });
                        return;
                    }
                }
            }
        }

        /// <summary>
        /// The plane crash the player sets off: the plane in the air, or a new one over the land away from the map's
        /// edges, crashes. The original's engine has no crash; this is MakeAirCrash from its older C version.
        /// </summary>
        public void MakeCrash()
        {
            if (_spriteManager.GetSprite(SpriteType.Airplane) is null)
            {
                int x = _random.GetRandom(_map.Width - 20) + 10;
                int y = _random.GetRandom(_map.Height - 10) + 5;
                _spriteManager.GeneratePlane(x, y);
            }

            _spriteManager.ExplodeSprite(_spriteManager.GetSprite(SpriteType.Airplane)!);
        }

        /// <summary>
        /// The meltdown the player sets off, of the first nuclear plant found, column by column.
        /// </summary>
        public void MakeMeltdown()
        {
            for (int x = 0; x < _map.Width - 1; x++)
            {
                for (int y = 0; y < _map.Height - 1; y++)
                {
                    if (_map.GetTileValue(x, y) == TileValues.NUCLEAR)
                    {
                        DoMeltdown(x, y);
                        return;
                    }
                }
            }
        }

        /// <summary>
        /// An earthquake, of a strength drawn first: each of that many tiles drawn at random, if a building but no
        /// zone's centre, falls to rubble three times in four, and catches fire the fourth. The original's doEarthquake,
        /// which shakes the screen, is the client's to do on the news.
        /// </summary>
        public void MakeEarthquake()
        {
            int strength = _random.GetRandom(700) + 300;

            Events.Emit(Messages.EARTHQUAKE, NewsPlaces.Showable(_map.CityCentreX, _map.CityCentreY));

            for (int i = 0; i < strength; i++)
            {
                int x = _random.GetRandom(_map.Width - 1);
                int y = _random.GetRandom(_map.Height - 1);

                if (Vulnerable(_map.GetTile(x, y)))
                {
                    _map.SetTo(x, y, (i & 3) != 0 ? TileUtils.RandomRubble(_random) : TileUtils.RandomFire(_random));
                }
            }
        }

        /// <summary>
        /// A flood from up to 300 tiles drawn at random: the first river edge drawn floods the first neighbour that is
        /// bare dirt, or bulldozable and flammable, and the flood lasts 30 passes of phase 15.
        /// </summary>
        public void MakeFlood()
        {
            for (int i = 0; i < 300; i++)
            {
                int x = _random.GetRandom(_map.Width - 1);
                int y = _random.GetRandom(_map.Height - 1);
                int tileValue = _map.GetTileValue(x, y);

                if (tileValue > TileValues.CHANNEL && tileValue <= TileValues.WATER_HIGH)
                {
                    for (int j = 0; j < 4; j++)
                    {
                        int xx = x + Dx[j];
                        int yy = y + Dy[j];

                        if (!_map.TestBounds(xx, yy))
                        {
                            continue;
                        }

                        Tile tile = _map.GetTile(xx, yy);

                        // As in the original, only dirt without flags counts as dirt
                        if (tile.GetRawValue() == TileValues.DIRT || (tile.IsBulldozable() && tile.IsCombustible()))
                        {
                            _map.SetTile(xx, yy, TileValues.FLOOD, TileFlags.NOFLAGS);
                            FloodCount = 30;
                            Events.Emit(Messages.FLOODING_REPORTED, NewsPlaces.Showable(xx, yy));
                            return;
                        }
                    }
                }
            }
        }

        // A building, but no zone's centre
        private static bool Vulnerable(Tile tile)
        {
            int tileValue = tile.GetValue();

            return tileValue >= TileValues.RESBASE && tileValue <= TileValues.LASTZONE && !tile.IsZone();
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
        /// The meltdown of the nuclear plant centred at (x, y): an explosion at each corner, the whole plant on fire,
        /// and radiation on flammable tiles and bare dirt among 200 drawn around it, but on no zone's centre.
        /// </summary>
        public void DoMeltdown(int x, int y)
        {
            _spriteManager.MakeExplosion(x - 1, y - 1);
            _spriteManager.MakeExplosion(x - 1, y + 2);
            _spriteManager.MakeExplosion(x + 2, y - 1);
            _spriteManager.MakeExplosion(x + 2, y + 2);

            for (int dX = x - 1; dX < x + 3; dX++)
            {
                for (int dY = y - 1; dY < y + 3; dY++)
                {
                    _map.SetTo(dX, dY, TileUtils.RandomFire(_random));
                }
            }

            for (int i = 0; i < 200; i++)
            {
                int dX = x - 20 + _random.GetRandom(40);
                int dY = y - 15 + _random.GetRandom(30);

                if (!_map.TestBounds(dX, dY))
                {
                    continue;
                }

                Tile tile = _map.GetTile(dX, dY);

                if (tile.IsZone())
                {
                    continue;
                }

                // As in the original, only dirt without flags counts as dirt
                if (tile.IsCombustible() || tile.GetRawValue() == TileValues.DIRT)
                {
                    _map.SetTile(dX, dY, TileValues.RADTILE, TileFlags.NOFLAGS);
                }
            }

            Events.Emit(Messages.NUCLEAR_MELTDOWN, NewsPlaces.Showable(x, y));
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
