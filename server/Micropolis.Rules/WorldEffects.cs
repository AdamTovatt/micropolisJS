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
    /// The tiles a tool means to change, staged over the map until the tool knows the city can pay, as
    /// <c>src/worldEffects.js</c> and the original's <c>ToolEffects</c> stage them: a staged tile is read in place of
    /// the map's, and applying them writes each to the map.
    /// </summary>
    internal sealed class WorldEffects
    {
        private readonly GameMap _map;
        private readonly Dictionary<Position, Tile> _staged = new Dictionary<Position, Tile>();

        public WorldEffects(GameMap map)
        {
            _map = map;
        }

        public void Clear()
        {
            _staged.Clear();
        }

        /// <summary>
        /// The tile staged at (x, y), or the map's own tile there, which the caller only reads.
        /// </summary>
        // A tool reads only tiles on the map: the TypeScript's map warns of a read off it, which no tool makes
        public Tile GetTile(int x, int y)
        {
            if (!_map.TestBounds(x, y))
            {
                throw new ArgumentOutOfRangeException(null, $"WorldEffects getTile called with invalid bounds {x}, {y}.");
            }

            return _staged.TryGetValue(new Position(x, y), out Tile? tile) ? tile : _map.GetTile(x, y);
        }

        public int GetTileValue(int x, int y)
        {
            return GetTile(x, y).GetValue();
        }

        public void SetTile(int x, int y, int value, int flags = TileFlags.NOFLAGS)
        {
            if (!_map.TestBounds(x, y))
            {
                throw new ArgumentOutOfRangeException(null, $"WorldEffects setTile called with invalid bounds {x}, {y}.");
            }

            _staged[new Position(x, y)] = new Tile(value, flags);
        }

        /// <summary>
        /// Writes every staged tile to the map. Each position is staged once, so the order they are written in changes
        /// nothing.
        /// </summary>
        public void Apply()
        {
            foreach ((Position position, Tile tile) in _staged)
            {
                _map.SetTile(position, tile.GetValue(), tile.GetFlags());
            }
        }
    }
}
