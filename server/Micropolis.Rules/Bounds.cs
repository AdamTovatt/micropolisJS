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

namespace Micropolis.Rules
{
    /// <summary>
    /// A rectangle of tiles.
    /// </summary>
    public sealed class Bounds
    {
        private readonly int _inclusiveStartX;
        private readonly int _inclusiveStartY;
        private readonly int _exclusiveEndX;
        private readonly int _exclusiveEndY;

        public Bounds(int inclusiveStartX, int inclusiveStartY, int widthCount, int heightCount)
        {
            if (widthCount <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(widthCount), widthCount, "A bounded region must have a width.");
            }

            if (heightCount <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(heightCount), heightCount, "A bounded region must have a height.");
            }

            _inclusiveStartX = inclusiveStartX;
            _inclusiveStartY = inclusiveStartY;
            _exclusiveEndX = inclusiveStartX + widthCount;
            _exclusiveEndY = inclusiveStartY + heightCount;
        }

        public static Bounds FromOrigin(int width, int height)
        {
            return new Bounds(0, 0, width, height);
        }

        public bool Contains(Position position)
        {
            return position.X >= _inclusiveStartX && position.X < _exclusiveEndX
                && position.Y >= _inclusiveStartY && position.Y < _exclusiveEndY;
        }
    }
}
