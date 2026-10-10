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
    /// A value per block of tiles: each entry covers a square of <see cref="BlockSize"/> tiles a side. Entries are held
    /// row by row: block (x, y) is at index <c>Width * y + x</c>.
    /// </summary>
    public sealed class BlockMap
    {
        private int[] _data;

        // The power of two a block's side is, by which a tile's coordinates shift to its block's
        private readonly int _shift;

        /// <summary>
        /// A map of zeros over a game map of the given size in tiles, whose entries the simulation keeps from
        /// <paramref name="min"/> to <paramref name="max"/>.
        /// </summary>
        public BlockMap(int gameMapWidth, int gameMapHeight, int blockSize, int min, int max)
        {
            _shift = System.Numerics.BitOperations.Log2((uint)blockSize);
            if (blockSize <= 0 || 1 << _shift != blockSize)
            {
                throw new ArgumentOutOfRangeException(nameof(blockSize), blockSize, "A block's side must be a power of two.");
            }

            BlockSize = blockSize;
            Min = min;
            Max = max;
            Width = (gameMapWidth + blockSize - 1) / blockSize;
            Height = (gameMapHeight + blockSize - 1) / blockSize;
            _data = new int[Width * Height];
        }

        public int BlockSize { get; }

        /// <summary>
        /// The least value an entry can hold.
        /// </summary>
        public int Min { get; }

        /// <summary>
        /// The greatest value an entry can hold.
        /// </summary>
        public int Max { get; }

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

        public void Set(int blockX, int blockY, int value)
        {
            _data[Width * blockY + blockX] = value;
        }

        /// <summary>
        /// The entry of the block holding the tile at (<paramref name="tileX"/>, <paramref name="tileY"/>) of the map,
        /// as <see cref="WorldGet"/> gives it, for a tile on the map, whose coordinates are never negative: its block
        /// found by a shift, a block's side being a power of two, with none of the flooring of a negative coordinate
        /// <see cref="WorldGet"/> does. The trip router reads the blocks of the tiles it searches by it.
        /// </summary>
        public int TileGet(int tileX, int tileY)
        {
            return _data[Width * (tileY >> _shift) + (tileX >> _shift)];
        }

        /// <summary>
        /// The entry of the block holding the tile at (worldX, worldY).
        /// </summary>
        public int WorldGet(int worldX, int worldY)
        {
            return Get(JsMath.FloorDiv(worldX, BlockSize), JsMath.FloorDiv(worldY, BlockSize));
        }

        /// <summary>
        /// Sets the entry of the block holding the tile at (worldX, worldY).
        /// </summary>
        public void WorldSet(int worldX, int worldY, int value)
        {
            Set(JsMath.FloorDiv(worldX, BlockSize), JsMath.FloorDiv(worldY, BlockSize), value);
        }

        /// <summary>
        /// Sets every entry to zero.
        /// </summary>
        public void Clear()
        {
            Array.Clear(_data);
        }

        /// <summary>
        /// A copy of the entries, row by row.
        /// </summary>
        public int[] CopyValues()
        {
            return (int[])_data.Clone();
        }

        internal JsonArray Save()
        {
            return SavedList.Of(_data);
        }

        /// <summary>
        /// Reads the entries under <paramref name="key"/> of <paramref name="parent"/>: one per block, each from
        /// <see cref="Min"/> to <see cref="Max"/>.
        /// </summary>
        internal void Load(SavedObject parent, string key)
        {
            _data = parent.ReadIntList(key, Width * Height, Min, Max);
        }
    }
}
