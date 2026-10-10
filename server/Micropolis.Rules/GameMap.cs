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
    /// The tile grid and the positions saved with it. Tiles are held row by row: the tile at (x, y) is at index
    /// <c>x + y * Width</c>.
    /// </summary>
    public sealed class GameMap
    {
        private readonly Tile[] _data;

        // Each tile's walkway, row by row (Walkways), and how many ninths of them hold walkway
        private readonly int[] _walkways;
        private long _walkwayNinths;

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
            _walkways = new int[width * height];

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
        /// Each tile's raw value, with its flags, row by row, top row first.
        /// </summary>
        public int[] RawValues()
        {
            return _data.Select(tile => tile.GetRawValue()).ToArray();
        }

        /// <summary>
        /// How many ninths of the map's tiles hold walkway.
        /// </summary>
        public long WalkwayNinths => _walkwayNinths;

        /// <summary>
        /// Each tile's walkway value (<see cref="Walkways"/>), row by row, top row first.
        /// </summary>
        public int[] WalkwayValues()
        {
            return (int[])_walkways.Clone();
        }

        /// <summary>
        /// The walkway value of the tile at (x, y) (<see cref="Walkways"/>).
        /// </summary>
        public int GetWalkway(int x, int y)
        {
            return _walkways[IndexOf(x, y, nameof(GetWalkway))];
        }

        /// <summary>
        /// The walkway value of the tile at <c>x + y * Width</c>, for a search that reads many tiles by their index.
        /// </summary>
        internal int WalkwayAt(int index)
        {
            return _walkways[index];
        }

        /// <summary>
        /// Gives the tile at (x, y) the walkway value given (<see cref="Walkways"/>), which must be one.
        /// </summary>
        public void SetWalkway(int x, int y, int walkway)
        {
            int index = IndexOf(x, y, nameof(SetWalkway));

            if (!Walkways.IsValid(walkway))
            {
                throw new ArgumentOutOfRangeException(nameof(walkway), walkway, $"{nameof(SetWalkway)} called with no walkway value.");
            }

            _walkwayNinths += Walkways.Count(walkway) - Walkways.Count(_walkways[index]);
            _walkways[index] = walkway;
        }

        /// <summary>
        /// Writes the map under <c>map</c> (<see cref="SavedObject"/>).
        /// </summary>
        internal void Save(JsonObject saveData)
        {
            saveData["map"] = SavedObject();
        }

        /// <summary>
        /// The map as a save holds it: its size, its positions, each tile's raw value row by row, and the walkway of each
        /// tile that holds any, row by row.
        /// </summary>
        public JsonObject SavedObject()
        {
            return new JsonObject
            {
                ["cityCentreX"] = CityCentreX,
                ["cityCentreY"] = CityCentreY,
                ["pollutionMaxX"] = PollutionMaxX,
                ["pollutionMaxY"] = PollutionMaxY,
                ["width"] = Width,
                ["height"] = Height,
                ["tiles"] = SavedList.Of(_data.Select(tile => tile.GetRawValue())),
                ["walkways"] = new JsonArray(WalkwayTiles().Select(tile => (JsonNode)new JsonObject
                {
                    ["x"] = tile.Position.X,
                    ["y"] = tile.Position.Y,
                    ["ninths"] = tile.Walkway,
                }).ToArray()),
            };
        }

        /// <summary>
        /// Each tile that holds walkway, row by row, with its walkway value (<see cref="Walkways"/>).
        /// </summary>
        public IEnumerable<(Position Position, int Walkway)> WalkwayTiles()
        {
            for (int i = 0; i < _walkways.Length; i++)
            {
                if (_walkways[i] != 0)
                {
                    yield return (new Position(i % Width, i / Width), _walkways[i]);
                }
            }
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
                    map._data[i].SetRawValue(tiles[i]);
                }

                // Row by row, so no tile is listed twice, each holding a walkway, of kinds there are
                int last = -1;

                foreach ((Position tile, int walkway) in saved.ReadObjectList("walkways",
                             entry => (entry.AsTile(map), entry.ReadInt("ninths", 1, Walkways.MostValue))))
                {
                    int index = tile.X + tile.Y * width;

                    if (index <= last)
                    {
                        throw saved.Invalid("walkways", "lists its tiles out of order, row by row");
                    }

                    if (!Walkways.IsValid(walkway))
                    {
                        throw saved.Invalid("walkways", $"holds a ninth of no kind at ({tile.X}, {tile.Y})");
                    }

                    map.SetWalkway(tile.X, tile.Y, walkway);
                    last = index;
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
        /// The map's own tile at (x, y), which changes the map as it changes. Off the map it is a new tile of
        /// <see cref="TileValues.TILE_INVALID"/> belonging to nothing.
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

        /// <summary>
        /// The value and flags of the tile at <c>x + y * Width</c>, as <see cref="Tile.GetRawValue"/> gives them, for a
        /// search that reads many tiles by their index.
        /// </summary>
        internal int RawValueAt(int index)
        {
            return _data[index].GetRawValue();
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

        /// <summary>
        /// Gives a tile the value and flags of <paramref name="tile"/>. The map keeps its own tile, so later changes to
        /// <paramref name="tile"/> don't reach it.
        /// </summary>
        public void SetTo(int x, int y, Tile tile)
        {
            GetTileAt(x, y, nameof(SetTo)).SetFrom(tile);
        }

        /// <summary>
        /// Lays a zone of <paramref name="size"/> by <paramref name="size"/> tiles from the centre's upper left
        /// neighbour: the values count up row by row from the centre's less <c>size + 1</c>, each tile burnable and
        /// conductive, and the centre the zone's centre.
        /// </summary>
        /// <remarks>
        /// It checks the centre and the far corner are on the map before it lays a tile; a zone past the near edge
        /// throws as it reaches the first tile off the map.
        /// </remarks>
        public void PutZone(int centreX, int centreY, int centreTile, int size)
        {
            if (!TestBounds(centreX, centreY) || !TestBounds(centreX - 1 + size - 1, centreY - 1 + size - 1))
            {
                throw new ArgumentOutOfRangeException(nameof(centreX), $"GameMap putZone called with invalid bounds {centreX}, {centreY}.");
            }

            int tile = centreTile - 1 - size;
            int startX = centreX - 1;
            int startY = centreY - 1;

            for (int y = startY; y < startY + size; y++)
            {
                for (int x = startX; x < startX + size; x++)
                {
                    SetTile(x, y, tile, x == centreX && y == centreY ? TileFlags.BNCNBIT | TileFlags.ZONEBIT : TileFlags.BNCNBIT);
                    tile += 1;
                }
            }
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

        /// <summary>
        /// The value of the tile next to the position in a cardinal direction, or the default off the map.
        /// </summary>
        public int GetTileFromMapOrDefault(Position position, Direction direction, int defaultTile)
        {
            if (direction == Direction.North)
            {
                return position.Y > 0 ? GetTileValue(position.X, position.Y - 1) : defaultTile;
            }

            if (direction == Direction.East)
            {
                return position.X < Width - 1 ? GetTileValue(position.X + 1, position.Y) : defaultTile;
            }

            if (direction == Direction.South)
            {
                return position.Y < Height - 1 ? GetTileValue(position.X, position.Y + 1) : defaultTile;
            }

            if (direction == Direction.West)
            {
                return position.X > 0 ? GetTileValue(position.X - 1, position.Y) : defaultTile;
            }

            return defaultTile;
        }

        private Tile GetTileAt(int x, int y, string context)
        {
            return _data[IndexOf(x, y, context)];
        }

        // The index of the tile at (x, y), which the method named by the context was called with, and which must be on
        // the map
        private int IndexOf(int x, int y, string context)
        {
            if (!TestBounds(x, y))
            {
                throw new ArgumentOutOfRangeException(null, $"GameMap {context} called with invalid bounds {x}, {y}.");
            }

            return x + y * Width;
        }
    }
}
