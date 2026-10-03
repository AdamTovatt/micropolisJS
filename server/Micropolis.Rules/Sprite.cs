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
    /// A sprite's saved state. Its size and drawing offset are fixed by its type, and not saved.
    /// </summary>
    public sealed class Sprite
    {
        public const int Train = 1;
        public const int Helicopter = 2;
        public const int Airplane = 3;
        public const int Ship = 4;
        public const int Monster = 5;
        public const int Tornado = 6;
        public const int Explosion = 7;

        public int Type { get; set; }

        /// <summary>
        /// The frame drawn, 0 for a sprite that has died this pass.
        /// </summary>
        public long Frame { get; set; }

        // Pixels
        public long X { get; set; }

        public long Y { get; set; }

        public long OrigX { get; set; }

        public long OrigY { get; set; }

        public long DestX { get; set; }

        public long DestY { get; set; }

        public long Count { get; set; }

        public long SoundCount { get; set; }

        public long Dir { get; set; }

        public long NewDir { get; set; }

        public long Step { get; set; }

        public long Flag { get; set; }

        /// <summary>
        /// For a monster only: whether it has reached land. Saved only for a monster.
        /// </summary>
        public bool SeenLand { get; set; }

        public JsonObject Save()
        {
            JsonObject sprite = new JsonObject
            {
                ["type"] = Type,
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

            if (Type == Monster)
            {
                sprite["_seenLand"] = SeenLand;
            }

            return sprite;
        }

        public static Sprite Load(SavedObject data)
        {
            Sprite sprite = new Sprite
            {
                Type = data.ReadInt("type", Train, Explosion),
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

            // Read only for a monster, so another sprite holding it fails as an unknown key
            if (sprite.Type == Monster)
            {
                sprite.SeenLand = data.ReadBool("_seenLand");
            }

            return sprite;
        }
    }
}
