/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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
    /// A tile position. It is not bounds-checked: the map checks it.
    /// </summary>
    public readonly record struct Position(int X, int Y)
    {
        public static Position Move(Position position, Direction direction)
        {
            return new Position(position.X + direction.XDelta, position.Y + direction.YDelta);
        }

        /// <summary>
        /// The position as a save holds a tile: an object of its <c>x</c> and <c>y</c>.
        /// </summary>
        internal JsonObject Save()
        {
            return new JsonObject { ["x"] = X, ["y"] = Y };
        }

        public override string ToString()
        {
            return $"({X}, {Y})";
        }
    }
}
