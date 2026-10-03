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
    /// A value per block of tiles: each entry covers a square of <see cref="BlockSize"/> tiles a side. Entries are held
    /// row by row: block (x, y) is at index <c>Width * y + x</c>.
    /// </summary>
    public sealed class BlockMap
    {
        private int[] _data;

        /// <summary>
        /// A map of zeros over a game map of the given size in tiles.
        /// </summary>
        public BlockMap(int gameMapWidth, int gameMapHeight, int blockSize)
        {
            BlockSize = blockSize;
            Width = (gameMapWidth + blockSize - 1) / blockSize;
            Height = (gameMapHeight + blockSize - 1) / blockSize;
            _data = new int[Width * Height];
        }

        public int BlockSize { get; }

        /// <summary>
        /// The width in blocks.
        /// </summary>
        public int Width { get; }

        /// <summary>
        /// The height in blocks.
        /// </summary>
        public int Height { get; }

        public int Get(int blockX, int blockY)
        {
            return _data[Width * blockY + blockX];
        }

        public JsonArray Save()
        {
            return SavedList.Of(_data);
        }

        /// <summary>
        /// Reads the entries under <paramref name="key"/> of <paramref name="parent"/>: one per block, each from
        /// <paramref name="min"/> to <paramref name="max"/>.
        /// </summary>
        public void Load(SavedObject parent, string key, int min, int max)
        {
            _data = parent.ReadIntList(key, Width * Height, min, max);
        }
    }
}
