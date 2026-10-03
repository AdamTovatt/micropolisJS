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
    /// The sprites, in the order they move, and the counter that paces them.
    /// </summary>
    public sealed class SpriteManager
    {
        private readonly GameMap _map;

        public SpriteManager(GameMap map)
        {
            _map = map;
        }

        public long SpriteCycle { get; internal set; }

        /// <summary>
        /// The distance getDir last found, in pixels across and down, which every sprite shares.
        /// </summary>
        public long AbsDist { get; internal set; }

        public IReadOnlyList<Sprite> SpriteList { get; internal set; } = [];

        /// <summary>
        /// Raises the <see cref="Messages.DISASTER_MESSAGES"/>, the <see cref="Messages.CRASHES"/> and
        /// <see cref="Messages.HEAVY_TRAFFIC"/>, as <c>src/spriteManager.js</c> passes them on from its sprites.
        /// </summary>
        internal EventEmitter Events { get; } = new EventEmitter();

        // The sprite seam: the sprites aren't ported, so reading the list answers from the state the city holds, and
        // creating or moving a sprite throws. A sprite-free city's step moves nothing, so it runs as the TypeScript does.

        /// <summary>
        /// The sprite of the type the list holds, if it is alive, or <see langword="null"/>: the original keeps one
        /// sprite of each type but explosions, and finds none while that one is dead.
        /// </summary>
        public Sprite? GetSprite(SpriteType type)
        {
            Sprite? sprite = SpriteList.FirstOrDefault(sprite => sprite.Type == type);

            return sprite is null || sprite.Frame == 0 ? null : sprite;
        }

        /// <summary>
        /// The distance in pixels, across and down, from the middle of the tile at (x, y) to the nearest live ship's
        /// hot spot: 99999 with none.
        /// </summary>
        public long GetBoatDistance(int x, int y)
        {
            long dist = 99999;
            long pixelX = WorldToPix(x) + 8;
            long pixelY = WorldToPix(y) + 8;

            foreach (Sprite sprite in SpriteList)
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
        /// Advances the sprite counter and moves every live sprite, then drops the dead.
        /// </summary>
        public void MoveObjects(SimData simData)
        {
            SpriteCycle += 1;

            if (SpriteList.Count > 0)
            {
                throw new NotPortedException("spriteManager.moveObjects");
            }
        }

        /// <summary>
        /// An explosion over the tile at (x, y), or nothing off the map.
        /// </summary>
        public void MakeExplosion(int x, int y)
        {
            if (_map.TestBounds(x, y))
            {
                throw new NotPortedException("spriteManager.makeExplosion");
            }
        }

        /// <summary>
        /// The pixel coordinate of a tile coordinate, as <c>SpriteUtils.worldToPix</c>.
        /// </summary>
        internal static long WorldToPix(int w)
        {
            // JavaScript's << on an int32
            return w << 4;
        }

        internal void Save(JsonObject saveData)
        {
            saveData["sprites"] = new JsonObject
            {
                ["spriteCycle"] = SpriteCycle,
                ["absDist"] = AbsDist,
                ["list"] = new JsonArray(SpriteList.Select(sprite => (JsonNode?)sprite.Save()).ToArray()),
            };
        }

        internal void Load(SavedObject saveData)
        {
            saveData.ReadObject("sprites", sprites =>
            {
                SpriteCycle = sprites.ReadSafeInteger("spriteCycle");
                AbsDist = sprites.ReadSafeInteger("absDist");
                SpriteList = sprites.ReadObjectList("list", Sprite.Load);
            });
        }
    }
}
