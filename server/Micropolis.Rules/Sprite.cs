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
    /// A sprite's kind, as <c>src/spriteConstants.ts</c> numbers them.
    /// </summary>
    public enum SpriteType
    {
        Train = 1,
        Helicopter = 2,
        Airplane = 3,
        Ship = 4,
        Monster = 5,
        Tornado = 6,
        Explosion = 7,
    }

    /// <summary>
    /// A sprite's saved state. Its size and drawing offset are fixed by its type, and not saved.
    /// </summary>
    /// <remarks>
    /// The positions and counters have no range the simulation keeps them within, such as a sprite's pixels while it
    /// flies off the map, so they are <see langword="long"/>.
    /// </remarks>
    public sealed class Sprite
    {
        public SpriteType Type { get; internal set; }

        /// <summary>
        /// The frame drawn, 0 for a sprite that has died this pass.
        /// </summary>
        public long Frame { get; internal set; }

        // Pixels
        public long X { get; internal set; }

        public long Y { get; internal set; }

        public long OrigX { get; internal set; }

        public long OrigY { get; internal set; }

        public long DestX { get; internal set; }

        public long DestY { get; internal set; }

        public long Count { get; internal set; }

        public long SoundCount { get; internal set; }

        public long Dir { get; internal set; }

        public long NewDir { get; internal set; }

        public long Step { get; internal set; }

        public long Flag { get; internal set; }

        /// <summary>
        /// The pixels across from <see cref="X"/> to the point where the sprite collides, crashes and leaves the map.
        /// </summary>
        public long XHot => HotSpot.X;

        /// <summary>
        /// The pixels down from <see cref="Y"/> to the sprite's hot spot.
        /// </summary>
        public long YHot => HotSpot.Y;

        // The hot spot as the original's initSprite gives each type
        private (long X, long Y) HotSpot => Type switch
        {
            SpriteType.Train => (40, -8),
            SpriteType.Helicopter => (40, -8),
            SpriteType.Airplane => (48, 16),
            SpriteType.Ship => (48, 0),
            SpriteType.Monster => (40, 16),
            SpriteType.Tornado => (40, 36),
            SpriteType.Explosion => (40, 16),
            _ => throw new InvalidOperationException($"No sprite type {Type}."),
        };

        internal JsonObject Save()
        {
            return new JsonObject
            {
                ["type"] = (int)Type,
                ["frame"] = Frame,
                ["x"] = X,
                ["y"] = Y,
                ["origX"] = OrigX,
                ["origY"] = OrigY,
                ["destX"] = DestX,
                ["destY"] = DestY,
                ["count"] = Count,
                ["soundCount"] = SoundCount,
                ["dir"] = Dir,
                ["newDir"] = NewDir,
                ["step"] = Step,
                ["flag"] = Flag,
            };
        }

        internal static Sprite Load(SavedObject data)
        {
            return new Sprite
            {
                Type = data.ReadEnum<SpriteType>("type"),
                Frame = data.ReadSafeInteger("frame"),
                X = data.ReadSafeInteger("x"),
                Y = data.ReadSafeInteger("y"),
                OrigX = data.ReadSafeInteger("origX"),
                OrigY = data.ReadSafeInteger("origY"),
                DestX = data.ReadSafeInteger("destX"),
                DestY = data.ReadSafeInteger("destY"),
                Count = data.ReadSafeInteger("count"),
                SoundCount = data.ReadSafeInteger("soundCount"),
                Dir = data.ReadSafeInteger("dir"),
                NewDir = data.ReadSafeInteger("newDir"),
                Step = data.ReadSafeInteger("step"),
                Flag = data.ReadSafeInteger("flag"),
            };
        }
    }
}
