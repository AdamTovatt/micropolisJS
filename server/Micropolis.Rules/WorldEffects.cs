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

namespace Micropolis.Rules
{
    /// <summary>
    /// The tiles and walkways a tool means to change, staged over the map until the tool knows the city can pay, as the
    /// original's <c>ToolEffects</c> stage tiles: a staged tile or walkway is read in place of the map's, and applying
    /// them writes each to the map.
    /// </summary>
    internal sealed class WorldEffects
    {
        private readonly GameMap _map;
        private readonly Dictionary<Position, Tile> _staged = new Dictionary<Position, Tile>();
        private readonly Dictionary<Position, int> _stagedWalkways = new Dictionary<Position, int>();

        public WorldEffects(GameMap map)
        {
            _map = map;
        }

        /// <summary>
        /// The positions of the tiles staged, walkways apart.
        /// </summary>
        public IEnumerable<Position> StagedTiles => _staged.Keys;

        public void Clear()
        {
            _staged.Clear();
            _stagedWalkways.Clear();
        }

        /// <summary>
        /// The walkway staged at (x, y), or the map's there (<see cref="Walkways"/>).
        /// </summary>
        public int GetWalkway(int x, int y)
        {
            return _stagedWalkways.TryGetValue(new Position(x, y), out int walkway) ? walkway : _map.GetWalkway(x, y);
        }

        /// <summary>
        /// Stages the walkway value given at (x, y), which must be one (<see cref="Walkways"/>).
        /// </summary>
        public void SetWalkway(int x, int y, int walkway)
        {
            if (!_map.TestBounds(x, y))
            {
                throw new ArgumentOutOfRangeException(null, $"WorldEffects {nameof(SetWalkway)} called with invalid bounds {x}, {y}.");
            }

            if (!Walkways.IsValid(walkway))
            {
                throw new ArgumentOutOfRangeException(nameof(walkway), walkway, $"WorldEffects {nameof(SetWalkway)} called with no walkway value.");
            }

            _stagedWalkways[new Position(x, y)] = walkway;
        }

        /// <summary>
        /// The tile staged at (x, y), or the map's own tile there, which the caller only reads.
        /// </summary>
        // A tool reads only tiles on the map, so a read off it is a defect, which throws
        public Tile GetTile(int x, int y)
        {
            if (!_map.TestBounds(x, y))
            {
                throw new ArgumentOutOfRangeException(null, $"WorldEffects {nameof(GetTile)} called with invalid bounds {x}, {y}.");
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
                throw new ArgumentOutOfRangeException(null, $"WorldEffects {nameof(SetTile)} called with invalid bounds {x}, {y}.");
            }

            _staged[new Position(x, y)] = new Tile(value, flags);
        }

        /// <summary>
        /// Writes every staged tile and walkway to the map. Each position is staged once, so the order they are written
        /// in changes nothing.
        /// </summary>
        public void Apply()
        {
            foreach ((Position position, Tile tile) in _staged)
            {
                _map.SetTile(position, tile.GetValue(), tile.GetFlags());
            }

            foreach ((Position position, int walkway) in _stagedWalkways)
            {
                _map.SetWalkway(position.X, position.Y, walkway);
            }
        }
    }
}
