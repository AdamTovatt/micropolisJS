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

        /// <summary>
        /// The population centre's x, a column of the map.
        /// </summary>
        public int CityCentreX { get; internal set; }

        /// <summary>
        /// The population centre's y, a row of the map.
        /// </summary>
        public int CityCentreY { get; internal set; }

        /// <summary>
        /// The most polluted tile's x, a column of the map.
        /// </summary>
        public int PollutionMaxX { get; internal set; }

        /// <summary>
        /// The most polluted tile's y, a row of the map.
        /// </summary>
        public int PollutionMaxY { get; internal set; }

        /// <summary>
        /// Writes the map under <c>map</c>: its size, its positions, and each tile's raw value row by row.
        /// </summary>
        internal void Save(JsonObject saveData)
        {
            saveData["map"] = new JsonObject
            {
                ["cityCentreX"] = CityCentreX,
                ["cityCentreY"] = CityCentreY,
                ["pollutionMaxX"] = PollutionMaxX,
                ["pollutionMaxY"] = PollutionMaxY,
                ["width"] = Width,
                ["height"] = Height,
                ["tiles"] = SavedList.Of(_data.Select(tile => tile.GetRawValue())),
            };
        }

        /// <summary>
        /// The map a save holds under <c>map</c>: each tile takes its saved value and flags exactly.
        /// </summary>
        internal static GameMap FromSave(SavedObject saveData)
        {
            return saveData.ReadObject("map", saved =>
            {
                // A map holds at least one tile, and its tiles fit in one list
                int width = saved.ReadInt("width", 1, int.MaxValue);
                int height = saved.ReadInt("height", 1, int.MaxValue);

                if ((long)width * height > Array.MaxLength)
                {
                    throw saved.Invalid("height", $"makes a {width}×{height} map too large to hold");
                }

                // The tile value in bits 0–9 and its flags in bits 10–15. Read before the map is made, so a save
                // claiming a larger map than its tiles fill fails before the map is allocated.
                int[] tiles = saved.ReadIntList("tiles", width * height, 0, 0xffff);
                GameMap map = new GameMap(width, height);

                for (int i = 0; i < tiles.Length; i++)
                {
                    map._data[i].Set(tiles[i] & TileFlags.BIT_MASK, tiles[i] & TileFlags.ALLBITS);
                }

                map.CityCentreX = saved.ReadInt("cityCentreX", 0, width - 1);
                map.CityCentreY = saved.ReadInt("cityCentreY", 0, height - 1);
                map.PollutionMaxX = saved.ReadInt("pollutionMaxX", 0, width - 1);
                map.PollutionMaxY = saved.ReadInt("pollutionMaxY", 0, height - 1);

                return map;
            });
        }

        public bool IsPositionInBounds(Position position)
        {
            return Bounds.Contains(position);
        }

        public bool TestBounds(int x, int y)
        {
            return IsPositionInBounds(new Position(x, y));
        }

        /// <summary>
        /// The map's own tile at (x, y), which changes the map as it changes. Off the map, as <c>getTile</c> in
        /// <c>src/gameMap.js</c> does, it is a new tile of <see cref="TileValues.TILE_INVALID"/> belonging to nothing.
        /// </summary>
        public Tile GetTile(int x, int y)
        {
            return TestBounds(x, y) ? _data[x + y * Width] : new Tile(TileValues.TILE_INVALID);
        }

        /// <summary>
        /// Copies the tile at (x, y) into <paramref name="into"/>, and returns the map's own tile, as <c>getTile</c>
        /// does given a tile to fill. Off the map, <paramref name="into"/> is left as it was.
        /// </summary>
        public Tile GetTile(int x, int y, Tile into)
        {
            Tile tile = GetTile(x, y);

            if (TestBounds(x, y))
            {
                into.SetFrom(tile);
            }

            return tile;
        }

        public void AddTileFlags(int x, int y, int flags)
        {
            GetTileAt(x, y, nameof(AddTileFlags)).AddFlags(flags);
        }

        public void RemoveTileFlags(int x, int y, int flags)
        {
            GetTileAt(x, y, nameof(RemoveTileFlags)).RemoveFlags(flags);
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
