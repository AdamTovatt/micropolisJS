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
    /// The sprites, after the original's sprite.cpp: the list, newest first, which is the order they move in, the
    /// counter that paces them, how each type is made, and what the moves share. Each type's move is its own class, as
    /// each is its own <c>do*Sprite</c> function in the original.
    /// </summary>
    /// <remarks>
    /// A sprite that dies stays in the list, at frame 0, until the next pass of <see cref="MoveObjects"/> reaches it,
    /// and a new sprite of its type takes its place rather than joining the list. Explosions are the one type the list
    /// holds any number of. The sounds the sprites make in the original aren't raised, since nothing plays them.
    /// </remarks>
    public sealed class SpriteManager
    {
        private static readonly int[] DirectionTable = [0, 3, 2, 1, 3, 4, 5, 7, 6, 5, 7, 8, 1];

        private List<Sprite> _spriteList = [];

        public SpriteManager(GameMap map, RandomStream random)
        {
            Map = map;
            Random = random;
        }

        public long SpriteCycle { get; internal set; }

        /// <summary>
        /// The distance getDir last found, in pixels across and down, which every sprite shares: a sprite that reads it
        /// without calling getDir first reads whatever distance getDir last found.
        /// </summary>
        public long AbsDist { get; internal set; }

        public IReadOnlyList<Sprite> SpriteList => _spriteList;

        /// <summary>
        /// Raises the <see cref="Messages.DISASTER_MESSAGES"/>, the <see cref="Messages.CRASHES"/> and
        /// <see cref="Messages.HEAVY_TRAFFIC"/>, its own and those it passes on from its sprites.
        /// </summary>
        internal EventEmitter Events { get; } = new EventEmitter();

        internal GameMap Map { get; }

        internal RandomStream Random { get; }

        /// <summary>
        /// The sprite of the type the list holds, if it is alive, or <see langword="null"/>: the original keeps one
        /// sprite of each type but explosions, and finds none while that one is dead.
        /// </summary>
        public Sprite? GetSprite(SpriteType type)
        {
            Sprite? sprite = SpriteOfType(type);

            return sprite is null || sprite.Frame == 0 ? null : sprite;
        }

        /// <summary>
        /// The sprites on the map: those the list holds but the dead.
        /// </summary>
        public IReadOnlyList<Sprite> GetLiveSprites()
        {
            return _spriteList.Where(sprite => sprite.Frame != 0).ToList();
        }

        /// <summary>
        /// The distance in pixels, across and down, from the middle of the tile at (x, y) to the nearest live ship's
        /// hot spot: 99999 with none.
        /// </summary>
        public long GetBoatDistance(int x, int y)
        {
            long dist = 99999;
            long pixelX = SpriteUtils.WorldToPix(x) + 8;
            long pixelY = SpriteUtils.WorldToPix(y) + 8;

            foreach (Sprite sprite in _spriteList)
            {
                if (sprite.Type == SpriteType.Ship && sprite.Frame != 0)
                {
                    long sprDist = Math.Abs(sprite.X + sprite.XHot - pixelX) + Math.Abs(sprite.Y + sprite.YHot - pixelY);

                    dist = Math.Min(dist, sprDist);
                }
            }

            return dist;
        }

        /// <summary>
        /// The direction from the origin to the destination, as a sprite's frame numbers it, leaving the distance
        /// between them in <see cref="AbsDist"/>.
        /// </summary>
        public int GetDir(long orgX, long orgY, long destX, long destY)
        {
            long deltaX = destX - orgX;
            long deltaY = destY - orgY;
            int i;

            if (deltaX < 0)
            {
                i = deltaY < 0 ? 11 : 8;
            }
            else
            {
                i = deltaY < 0 ? 2 : 5;
            }

            deltaX = Math.Abs(deltaX);
            deltaY = Math.Abs(deltaY);
            AbsDist = deltaX + deltaY;

            // The original's other branch tests deltaY * 2 < deltaY, which never holds, so a destination mostly across
            // never turns the direction toward the horizontal
            if (deltaX * 2 < deltaY)
            {
                i++;
            }

            if (i < 0 || i > 12)
            {
                i = 0;
            }

            return DirectionTable[i];
        }

        /// <summary>
        /// Advances the sprite counter, then each sprite still in the list when the pass reaches it moves if it is
        /// alive, and leaves the list if it is not. A sprite created during the pass joins at the front, so it first
        /// moves next pass, and one that dies after the pass has passed it stays, dead, until the next.
        /// </summary>
        public void MoveObjects(SimData simData)
        {
            SpriteCycle += 1;

            foreach (Sprite sprite in _spriteList.ToList())
            {
                if (sprite.Frame > 0)
                {
                    Move(sprite, simData.DisasterManager.DisastersEnabled, simData.BlockMaps);
                }
                else
                {
                    _spriteList.Remove(sprite);
                }
            }
        }

        /// <summary>
        /// A sprite of the type at (x, y): the sprite of the type the list holds, started afresh where it stands in the
        /// list, or a new sprite at the front.
        /// </summary>
        internal Sprite MakeSprite(SpriteType type, long x, long y)
        {
            Sprite? sprite = SpriteOfType(type);

            if (sprite is null)
            {
                return NewSprite(type, x, y);
            }

            InitSprite(sprite, x, y);
            return sprite;
        }

        /// <summary>
        /// A tornado somewhere away from the map's edges, or more time for the one already blowing.
        /// </summary>
        public void MakeTornado()
        {
            Sprite? sprite = GetSprite(SpriteType.Tornado);
            if (sprite is not null)
            {
                sprite.Count = 200;
                return;
            }

            long x = Random.GetRandom((int)SpriteUtils.WorldToPix(Map.Width) - 800) + 400;
            long y = Random.GetRandom((int)SpriteUtils.WorldToPix(Map.Height) - 200) + 100;

            MakeSprite(SpriteType.Tornado, x, y);
            Events.Emit(Messages.TORNADO_SIGHTED,
                        NewsPlaces.Trackable(SpriteUtils.PixToWorld(x) + 3, SpriteUtils.PixToWorld(y) + 2, SpriteType.Tornado));
        }

        /// <summary>
        /// An explosion over the middle of the tile at (x, y), or nothing off the map.
        /// </summary>
        public void MakeExplosion(int x, int y)
        {
            if (Map.TestBounds(x, y))
            {
                MakeExplosionAt(SpriteUtils.WorldToPix(x) + 8, SpriteUtils.WorldToPix(y) + 8);
            }
        }

        /// <summary>
        /// A new explosion whose hot spot is the pixel (x, y), however many the list holds.
        /// </summary>
        public void MakeExplosionAt(long x, long y)
        {
            NewSprite(SpriteType.Explosion, x - 40, y - 16);
        }

        public void GeneratePlane(int x, int y)
        {
            if (GetSprite(SpriteType.Airplane) is not null)
            {
                return;
            }

            MakeSprite(SpriteType.Airplane, SpriteUtils.WorldToPix(x) + 48, SpriteUtils.WorldToPix(y) + 12);
        }

        public void GenerateTrain(Census census, int x, int y)
        {
            if (census.TotalPop > 20 && GetSprite(SpriteType.Train) is null && Random.GetRandom(25) == 0)
            {
                MakeSprite(SpriteType.Train, SpriteUtils.WorldToPix(x) - 39, SpriteUtils.WorldToPix(y) + 6);
            }
        }

        /// <summary>
        /// A ship from the first channel tile, without flags, along an edge of the map, each edge with a chance in four.
        /// </summary>
        public void GenerateShip()
        {
            if (Random.GetChance(3))
            {
                for (int x = 4; x < Map.Width - 2; x++)
                {
                    if (Map.GetTile(x, 0).GetRawValue() == TileValues.CHANNEL)
                    {
                        MakeShipHere(x, 0);
                        return;
                    }
                }
            }

            if (Random.GetChance(3))
            {
                for (int y = 1; y < Map.Height - 2; y++)
                {
                    if (Map.GetTile(0, y).GetRawValue() == TileValues.CHANNEL)
                    {
                        MakeShipHere(0, y);
                        return;
                    }
                }
            }

            if (Random.GetChance(3))
            {
                for (int x = 4; x < Map.Width - 2; x++)
                {
                    if (Map.GetTile(x, Map.Height - 1).GetRawValue() == TileValues.CHANNEL)
                    {
                        MakeShipHere(x, Map.Height - 1);
                        return;
                    }
                }
            }

            if (Random.GetChance(3))
            {
                for (int y = 1; y < Map.Height - 2; y++)
                {
                    if (Map.GetTile(Map.Width - 1, y).GetRawValue() == TileValues.CHANNEL)
                    {
                        MakeShipHere(Map.Width - 1, y);
                        return;
                    }
                }
            }
        }

        public void MakeShipHere(int x, int y)
        {
            MakeSprite(SpriteType.Ship, SpriteUtils.WorldToPix(x) - 47, SpriteUtils.WorldToPix(y));
        }

        public void GenerateCopter(int x, int y)
        {
            if (GetSprite(SpriteType.Helicopter) is not null)
            {
                return;
            }

            MakeSprite(SpriteType.Helicopter, SpriteUtils.WorldToPix(x), SpriteUtils.WorldToPix(y) + 30);
        }

        /// <summary>
        /// The monster rises from the river tile at (x, y), which places its hot spot five tiles east and one south. A
        /// sighting names the sprite to follow by its type.
        /// </summary>
        private void MakeMonsterAt(int x, int y)
        {
            MakeSprite(SpriteType.Monster, SpriteUtils.WorldToPix(x) + 48, SpriteUtils.WorldToPix(y));
            Events.Emit(Messages.MONSTER_SIGHTED, NewsPlaces.Trackable(x + 5, y, SpriteType.Monster));
        }

        /// <summary>
        /// A monster from a river tile, without flags but the bulldozable one, or a live monster sent back to the most
        /// polluted place.
        /// </summary>
        public void MakeMonster()
        {
            Sprite? sprite = GetSprite(SpriteType.Monster);
            if (sprite is not null)
            {
                sprite.SoundCount = 1;
                sprite.Count = 1000;
                sprite.DestX = SpriteUtils.WorldToPix(Map.PollutionMaxX);
                sprite.DestY = SpriteUtils.WorldToPix(Map.PollutionMaxY);
                return;
            }

            for (int i = 0; i < 300; i++)
            {
                int x = Random.GetRandom(Map.Width - 20) + 10;
                int y = Random.GetRandom(Map.Height - 10) + 5;

                int rawValue = Map.GetTile(x, y).GetRawValue();
                if (rawValue == TileValues.RIVER || rawValue == (TileValues.RIVER | TileFlags.BULLBIT))
                {
                    MakeMonsterAt(x, y);
                    return;
                }
            }

            MakeMonsterAt(60, 50);
        }

        /// <summary>
        /// The sprite dies in an explosion at its hot spot, and a type that can crash reports it.
        /// </summary>
        internal void ExplodeSprite(Sprite sprite)
        {
            sprite.Frame = 0;

            long x = sprite.X + sprite.XHot;
            long y = sprite.Y + sprite.YHot;
            MakeExplosionAt(x, y);

            string? crash = sprite.Traits.CrashMessage;

            if (crash is not null)
            {
                Events.Emit(crash, NewsPlaces.Showable(SpriteUtils.PixToWorld(x), SpriteUtils.PixToWorld(y)));
            }
        }

        // A monster or a tornado blows up the aircraft, ships and trains it touches
        internal void ExplodeVulnerableSprites(Sprite sprite)
        {
            foreach (Sprite s in _spriteList.ToList())
            {
                if (s.Frame != 0 &&
                    (s.Type == SpriteType.Airplane || s.Type == SpriteType.Helicopter || s.Type == SpriteType.Ship ||
                     s.Type == SpriteType.Train) &&
                    SpriteUtils.CheckSpriteCollision(sprite, s))
                {
                    ExplodeSprite(s);
                }
            }
        }

        // Whether the hot spot is off the map
        internal bool SpriteNotInBounds(Sprite sprite)
        {
            long x = sprite.X + sprite.XHot;
            long y = sprite.Y + sprite.YHot;

            return x < 0 || y < 0 || x >= SpriteUtils.WorldToPix(Map.Width) || y >= SpriteUtils.WorldToPix(Map.Height);
        }

        // The sprite of the type the list holds, alive or not: the original's globalSprites entry
        private Sprite? SpriteOfType(SpriteType type)
        {
            return _spriteList.FirstOrDefault(sprite => sprite.Type == type);
        }

        private Sprite NewSprite(SpriteType type, long x, long y)
        {
            Sprite sprite = new Sprite(type);
            InitSprite(sprite, x, y);
            _spriteList.Insert(0, sprite);
            return sprite;
        }

        // A sprite's starting state, as the original's initSprite sets it: every field cleared, then the type's own
        private void InitSprite(Sprite sprite, long x, long y)
        {
            sprite.X = x;
            sprite.Y = y;
            sprite.Frame = 0;
            sprite.OrigX = 0;
            sprite.OrigY = 0;
            sprite.DestX = 0;
            sprite.DestY = 0;
            sprite.Count = 0;
            sprite.SoundCount = 0;
            sprite.Dir = 0;
            sprite.NewDir = 0;
            sprite.Step = 0;
            sprite.Flag = 0;

            switch (sprite.Type)
            {
                case SpriteType.Train:
                    TrainSprite.Init(sprite);
                    break;

                case SpriteType.Helicopter:
                    CopterSprite.Init(this, sprite);
                    break;

                case SpriteType.Airplane:
                    AirplaneSprite.Init(this, sprite);
                    break;

                case SpriteType.Ship:
                    ShipSprite.Init(this, sprite);
                    break;

                case SpriteType.Monster:
                    MonsterSprite.Init(this, sprite);
                    break;

                case SpriteType.Tornado:
                    TornadoSprite.Init(sprite);
                    break;

                case SpriteType.Explosion:
                    ExplosionSprite.Init(sprite);
                    break;
            }
        }

        private void Move(Sprite sprite, bool disastersEnabled, BlockMaps blockMaps)
        {
            switch (sprite.Type)
            {
                case SpriteType.Train:
                    TrainSprite.Move(this, sprite);
                    break;

                case SpriteType.Helicopter:
                    CopterSprite.Move(this, sprite, blockMaps);
                    break;

                case SpriteType.Airplane:
                    AirplaneSprite.Move(this, sprite, disastersEnabled);
                    break;

                case SpriteType.Ship:
                    ShipSprite.Move(this, sprite, blockMaps);
                    break;

                case SpriteType.Monster:
                    MonsterSprite.Move(this, sprite, blockMaps);
                    break;

                case SpriteType.Tornado:
                    TornadoSprite.Move(this, sprite, blockMaps);
                    break;

                case SpriteType.Explosion:
                    ExplosionSprite.Move(this, sprite);
                    break;
            }
        }

        internal void Save(JsonObject saveData)
        {
            saveData["sprites"] = new JsonObject
            {
                ["spriteCycle"] = SpriteCycle,
                ["absDist"] = AbsDist,
                ["list"] = new JsonArray(_spriteList.Select(sprite => (JsonNode?)sprite.Save()).ToArray()),
            };
        }

        internal void Load(SavedObject saveData)
        {
            saveData.ReadObject("sprites", sprites =>
            {
                SpriteCycle = sprites.ReadSafeInteger("spriteCycle");
                AbsDist = sprites.ReadSafeInteger("absDist");
                _spriteList = sprites.ReadObjectList("list", Sprite.Load).ToList();
            });
        }
    }
}
