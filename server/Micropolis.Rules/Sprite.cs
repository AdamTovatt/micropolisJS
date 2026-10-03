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
    /// What a type fixes for every sprite of it: its hot spot, where it collides, crashes and leaves the map, in pixels
    /// from the sprite's position, as the original's initSprite gives it, and the message that reports its crash, for a
    /// type that can crash. The size and drawing offset the original also gives are the client's, which draws it.
    /// </summary>
    public readonly record struct SpriteTraits(int XHot, int YHot, string? CrashMessage);

    /// <summary>
    /// A sprite's saved state, at its position in the original's frame. Its traits are its type's, and not saved.
    /// </summary>
    /// <remarks>
    /// The positions and counters have no range the simulation keeps them within, such as a sprite's pixels while it
    /// flies off the map, so they are <see langword="long"/>.
    /// </remarks>
    public sealed class Sprite
    {
        internal Sprite(SpriteType type)
        {
            Type = type;
        }

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

        public SpriteTraits Traits => TraitsOf(Type);

        /// <summary>
        /// The pixels across from <see cref="X"/> to the point where the sprite collides, crashes and leaves the map.
        /// </summary>
        public long XHot => Traits.XHot;

        /// <summary>
        /// The pixels down from <see cref="Y"/> to the sprite's hot spot.
        /// </summary>
        public long YHot => Traits.YHot;

        public static SpriteTraits TraitsOf(SpriteType type)
        {
            return type switch
            {
                SpriteType.Train => new SpriteTraits(40, -8, Messages.TRAIN_CRASHED),
                SpriteType.Helicopter => new SpriteTraits(40, -8, Messages.HELICOPTER_CRASHED),
                SpriteType.Airplane => new SpriteTraits(48, 16, Messages.PLANE_CRASHED),
                SpriteType.Ship => new SpriteTraits(48, 0, Messages.SHIP_CRASHED),
                SpriteType.Monster => new SpriteTraits(40, 16, null),
                SpriteType.Tornado => new SpriteTraits(40, 36, null),
                SpriteType.Explosion => new SpriteTraits(40, 16, null),
                _ => throw new ArgumentOutOfRangeException(nameof(type), type, "No such sprite type."),
            };
        }

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
            return new Sprite(data.ReadEnum<SpriteType>("type"))
            {
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
