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
    /// The tile grid and the positions saved with it. Tiles are held row by row: the tile at (x, y) is at index
    /// <c>x + y * Width</c>.
    /// </summary>
    public sealed class GameMap
    {
        private readonly Tile[] _data;

        /// <summary>
        /// A map of dirt.
        /// </summary>
        public GameMap(int width, int height)
        {
            if (width < 1 || height < 1)
            {
                throw new ArgumentException($"GameMap constructor called with invalid width or height {width} {height}.");
            }

            Width = width;
            Height = height;
            Bounds = Bounds.FromOrigin(width, height);

            _data = new Tile[width * height];

            for (int i = 0; i < _data.Length; i++)
            {
                _data[i] = new Tile();
            }

            // Generally set externally
            CityCentreX = width / 2;
            CityCentreY = height / 2;
            PollutionMaxX = CityCentreX;
            PollutionMaxY = CityCentreY;
        }

        public int Width { get; }

        public int Height { get; }

        public Bounds Bounds { get; }

        public int CityCentreX { get; set; }

        public int CityCentreY { get; set; }

        public int PollutionMaxX { get; set; }

        public int PollutionMaxY { get; set; }

        /// <summary>
        /// Writes the map under <c>map</c>: its size, its positions, and each tile's raw value row by row.
        /// </summary>
        public void Save(JsonObject saveData)
        {
            JsonArray tiles = new JsonArray();

            foreach (Tile tile in _data)
            {
                tiles.Add(tile.GetRawValue());
            }

            saveData["map"] = new JsonObject
            {
                ["cityCentreX"] = CityCentreX,
                ["cityCentreY"] = CityCentreY,
                ["pollutionMaxX"] = PollutionMaxX,
                ["pollutionMaxY"] = PollutionMaxY,
                ["width"] = Width,
                ["height"] = Height,
                ["tiles"] = tiles,
            };
        }

        public bool IsPositionInBounds(Position position)
        {
            return Bounds.Contains(position);
        }

        public bool TestBounds(int x, int y)
        {
            return IsPositionInBounds(new Position(x, y));
        }

        public int GetTileValue(int x, int y)
        {
            return GetTileAt(x, y, nameof(GetTileValue)).GetValue();
        }

        public int GetTileValue(Position position)
        {
            return GetTileValue(position.X, position.Y);
        }

        public int GetTileFlags(int x, int y)
        {
            return GetTileAt(x, y, nameof(GetTileFlags)).GetFlags();
        }

        public int GetTileFlags(Position position)
        {
            return GetTileFlags(position.X, position.Y);
        }

        public void SetTile(int x, int y, int value, int flags)
        {
            GetTileAt(x, y, nameof(SetTile)).Set(value, flags);
        }

        public void SetTile(Position position, int value, int flags)
        {
            SetTile(position.X, position.Y, value, flags);
        }

        /// <summary>
        /// Sets a tile's value as <see cref="Tile.SetValue"/> does: a value with no flag bits keeps the tile's flags.
        /// </summary>
        public void SetTileValue(int x, int y, int value)
        {
            GetTileAt(x, y, nameof(SetTileValue)).SetValue(value);
        }

        public void SetTileValue(Position position, int value)
        {
            SetTileValue(position.X, position.Y, value);
        }

        private Tile GetTileAt(int x, int y, string context)
        {
            if (!TestBounds(x, y))
            {
                throw new ArgumentOutOfRangeException(null, $"GameMap {context} called with invalid bounds {x}, {y}.");
            }

            return _data[x + y * Width];
        }
    }
}
