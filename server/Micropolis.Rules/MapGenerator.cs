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

using static Micropolis.Rules.TileFlags;
using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules
{
    /// <summary>
    /// Generates a map from a stream, as the original's <c>generate.cpp</c> does: the same stream state always
    /// generates the same map. A city's map is generated from <see cref="RandomStream.MapStream"/> of its seed.
    /// </summary>
    /// <remarks>
    /// The original's terrain settings for trees, lakes and river curves are each -1 here, which leaves each to
    /// chance, so only the branches that setting takes exist.
    /// </remarks>
    public static class MapGenerator
    {
        /// <summary>
        /// The size of every map, in tiles.
        /// </summary>
        public const int MapWidth = 120;
        public const int MapHeight = 100;

        private const int IslandRadius = 18;

        // How often a river keeps to its direction, and turns
        private const int RiverStraightenRate = 100;
        private const int RiverTurnRate = 200;

        private static readonly int[] RiverEdges =
        [
            13 | BULLBIT, 13 | BULLBIT, 17 | BULLBIT, 15 | BULLBIT,
            5 | BULLBIT, RIVER, 19 | BULLBIT, 17 | BULLBIT,
            9 | BULLBIT, 11 | BULLBIT, RIVER, 13 | BULLBIT,
            7 | BULLBIT, 9 | BULLBIT, 5 | BULLBIT, RIVER,
        ];

        private static readonly int[] TreeTable =
        [
            0, 0, 0, 34,
            0, 0, 36, 35,
            0, 32, 0, 33,
            30, 31, 29, 37,
        ];

        // The neighbours smoothing reads, in the order their bits are shifted in: west, south, east, north
        private static readonly int[] SmoothDx = [-1, 0, 1, 0];
        private static readonly int[] SmoothDy = [0, 1, 0, -1];

        private static readonly int[,] BRMatrix =
        {
            { 0, 0, 0, REDGE, REDGE, REDGE, 0, 0, 0 },
            { 0, 0, REDGE, RIVER, RIVER, RIVER, REDGE, 0, 0 },
            { 0, REDGE, RIVER, RIVER, RIVER, RIVER, RIVER, REDGE, 0 },
            { REDGE, RIVER, RIVER, RIVER, RIVER, RIVER, RIVER, RIVER, REDGE },
            { REDGE, RIVER, RIVER, RIVER, CHANNEL, RIVER, RIVER, RIVER, REDGE },
            { REDGE, RIVER, RIVER, RIVER, RIVER, RIVER, RIVER, RIVER, REDGE },
            { 0, REDGE, RIVER, RIVER, RIVER, RIVER, RIVER, REDGE, 0 },
            { 0, 0, REDGE, RIVER, RIVER, RIVER, REDGE, 0, 0 },
            { 0, 0, 0, REDGE, REDGE, REDGE, 0, 0, 0 },
        };

        private static readonly int[,] SRMatrix =
        {
            { 0, 0, REDGE, REDGE, 0, 0 },
            { 0, REDGE, RIVER, RIVER, REDGE, 0 },
            { REDGE, RIVER, RIVER, RIVER, RIVER, REDGE },
            { REDGE, RIVER, RIVER, RIVER, RIVER, REDGE },
            { 0, REDGE, RIVER, RIVER, REDGE, 0 },
            { 0, 0, REDGE, REDGE, 0, 0 },
        };

        public static GameMap Generate(RandomStream random)
        {
            return Lay(random).Map;
        }

        /// <summary>
        /// The map <see cref="Generate"/> generates from the stream, drawing the same, with the land it laid and the
        /// lakes it drew.
        /// </summary>
        public static GeneratedMap Lay(RandomStream random)
        {
            int createIsland = random.GetRandom(2) - 1;

            GameMap map = new GameMap(MapWidth, MapHeight);

            // Construct land.
            if (createIsland < 0)
            {
                if (random.GetRandom(100) < 10)
                {
                    MakeIsland(map, random);
                    return new GeneratedMap(map, MapLand.Island, 0);
                }
            }

            if (createIsland == 1)
            {
                MakeNakedIsland(map, random);
            }
            else
            {
                ClearMap(map);
            }

            // Lay a river.
            int terrainXStart = 40 + random.GetRandom(map.Width - 80);
            int terrainYStart = 33 + random.GetRandom(map.Height - 67);

            Position terrainPos = new Position(terrainXStart, terrainYStart);
            DoRivers(map, terrainPos, random);

            // Lay a few lakes.
            int lakes = MakeLakes(map, random);

            SmoothRiver(map, random);

            // And add trees.
            DoTrees(map, random);

            MapLand land = createIsland switch
            {
                1 => MapLand.NakedIsland,
                0 => MapLand.Land,
                _ => MapLand.LandAfterIslandDraw,
            };

            return new GeneratedMap(map, land, lakes);
        }

        private static void ClearMap(GameMap map)
        {
            for (int x = 0; x < map.Width; x++)
            {
                for (int y = 0; y < map.Height; y++)
                {
                    map.SetTile(x, y, DIRT, 0);
                }
            }
        }

        private static void MakeNakedIsland(GameMap map, RandomStream random)
        {
            int terrainIslandRadius = IslandRadius;

            for (int x = 0; x < map.Width; x++)
            {
                for (int y = 0; y < map.Height; y++)
                {
                    if ((x < 5) || (x >= map.Width - 5) || (y < 5) || (y >= map.Height - 5))
                    {
                        map.SetTile(x, y, RIVER, 0);
                    }
                    else
                    {
                        map.SetTile(x, y, DIRT, 0);
                    }
                }
            }

            for (int x = 0; x < map.Width - 5; x += 2)
            {
                int mapY = random.GetERandom(terrainIslandRadius);
                PlopBRiver(map, new Position(x, mapY));

                mapY = (map.Height - 10) - random.GetERandom(terrainIslandRadius);
                PlopBRiver(map, new Position(x, mapY));

                PlopSRiver(map, new Position(x, 0));
                PlopSRiver(map, new Position(x, map.Height - 6));
            }

            for (int y = 0; y < map.Height - 5; y += 2)
            {
                int mapX = random.GetERandom(terrainIslandRadius);
                PlopBRiver(map, new Position(mapX, y));

                mapX = map.Width - 10 - random.GetERandom(terrainIslandRadius);
                PlopBRiver(map, new Position(mapX, y));

                PlopSRiver(map, new Position(0, y));
                PlopSRiver(map, new Position(map.Width - 6, y));
            }
        }

        private static void MakeIsland(GameMap map, RandomStream random)
        {
            MakeNakedIsland(map, random);
            SmoothRiver(map, random);
            DoTrees(map, random);
        }

        // Lays the lakes, and returns how many it drew
        private static int MakeLakes(GameMap map, RandomStream random)
        {
            int numLakes = random.GetRandom(10);
            int lakes = numLakes;

            while (numLakes > 0)
            {
                int x = random.GetRandom(map.Width - 21) + 10;
                int y = random.GetRandom(map.Height - 20) + 10;

                MakeSingleLake(map, new Position(x, y), random);
                numLakes--;
            }

            return lakes;
        }

        private static void MakeSingleLake(GameMap map, Position pos, RandomStream random)
        {
            int numPlops = random.GetRandom(12) + 2;

            while (numPlops > 0)
            {
                // The original leaves the order of the two draws unspecified: the x offset is drawn first
                int xOffset = random.GetRandom(12) - 6;
                int yOffset = random.GetRandom(12) - 6;
                Position plopPos = new Position(pos.X + xOffset, pos.Y + yOffset);

                if (random.GetRandom(4) != 0)
                {
                    PlopSRiver(map, plopPos);
                }
                else
                {
                    PlopBRiver(map, plopPos);
                }

                numPlops--;
            }
        }

        private static void TreeSplash(GameMap map, int x, int y, RandomStream random)
        {
            int numTrees = random.GetRandom(150) + 50;

            Position treePos = new Position(x, y);

            while (numTrees > 0)
            {
                Direction dir = Direction.GetRandomDirection(random);
                treePos = Position.Move(treePos, dir);

                if (!map.IsPositionInBounds(treePos))
                {
                    return;
                }

                if (map.GetTileValue(treePos) == DIRT)
                {
                    map.SetTile(treePos, WOODS, BLBNBIT);
                }

                numTrees--;
            }
        }

        private static void DoTrees(GameMap map, RandomStream random)
        {
            int amount = random.GetRandom(100) + 50;

            for (int x = 0; x < amount; x++)
            {
                int xloc = random.GetRandom(map.Width - 1);
                int yloc = random.GetRandom(map.Height - 1);
                TreeSplash(map, xloc, yloc, random);
            }

            SmoothTrees(map);
            SmoothTrees(map);
        }

        private static void SmoothRiver(GameMap map, RandomStream random)
        {
            for (int x = 0; x < map.Width; x++)
            {
                for (int y = 0; y < map.Height; y++)
                {
                    if (map.GetTileValue(x, y) == REDGE)
                    {
                        int bitIndex = 0;

                        for (int z = 0; z < 4; z++)
                        {
                            bitIndex = bitIndex << 1;
                            int xTemp = x + SmoothDx[z];
                            int yTemp = y + SmoothDy[z];

                            if (map.TestBounds(xTemp, yTemp) &&
                                map.GetTileValue(xTemp, yTemp) != DIRT &&
                                (map.GetTileValue(xTemp, yTemp) < WOODS_LOW ||
                                 map.GetTileValue(xTemp, yTemp) > WOODS_HIGH))
                            {
                                bitIndex++;
                            }
                        }

                        int temp = RiverEdges[bitIndex & 15];

                        if (temp != RIVER && random.GetRandom(1) != 0)
                        {
                            temp++;
                        }

                        // An edge value carries the bulldozable flag, which replaces the tile's flags. Plain river
                        // carries none, so the tile keeps its own.
                        map.SetTileValue(x, y, temp);
                    }
                }
            }
        }

        private static bool IsTree(int tileValue)
        {
            return tileValue >= WOODS_LOW && tileValue <= WOODS_HIGH;
        }

        private static void SmoothTrees(GameMap map)
        {
            for (int x = 0; x < map.Width; x++)
            {
                for (int y = 0; y < map.Height; y++)
                {
                    if (IsTree(map.GetTileValue(x, y)))
                    {
                        SmoothTreesAt(map, x, y);
                    }
                }
            }
        }

        // The original's smoothTreesAt can keep a lone tree, but the generator never asks it to, so a lone tree is
        // cleared
        private static void SmoothTreesAt(GameMap map, int x, int y)
        {
            if (!IsTree(map.GetTileValue(x, y)))
            {
                return;
            }

            int bitIndex = 0;

            for (int i = 0; i < 4; i++)
            {
                bitIndex = bitIndex << 1;
                int xTemp = x + SmoothDx[i];
                int yTemp = y + SmoothDy[i];

                if (map.TestBounds(xTemp, yTemp) && IsTree(map.GetTileValue(xTemp, yTemp)))
                {
                    bitIndex++;
                }
            }

            int temp = TreeTable[bitIndex & 15];

            if (temp != 0)
            {
                if (temp != WOODS)
                {
                    if (((x + y) & 1) != 0)
                    {
                        temp = temp - 8;
                    }
                }

                map.SetTile(x, y, temp, BLBNBIT);
            }
            else
            {
                // The bare value 0, as the original writes it: dirt with no flags
                map.SetTile(x, y, temp, 0);
            }
        }

        private static void DoRivers(GameMap map, Position terrainPos, RandomStream random)
        {
            Direction riverDir = Direction.GetRandomCardinalDirection(random);
            DoBRiver(map, terrainPos, riverDir, riverDir, random);

            riverDir = riverDir.OppositeDirection();
            Direction terrainDir = DoBRiver(map, terrainPos, riverDir, riverDir, random);

            riverDir = Direction.GetRandomCardinalDirection(random);
            DoSRiver(map, terrainPos, riverDir, terrainDir, random);
        }

        private static Direction DoBRiver(GameMap map, Position pos, Direction riverDir, Direction terrainDir, RandomStream random)
        {
            return LayRiver(map, pos, riverDir, terrainDir, random, 4, PlopBRiver);
        }

        private static Direction DoSRiver(GameMap map, Position pos, Direction riverDir, Direction terrainDir, RandomStream random)
        {
            return LayRiver(map, pos, riverDir, terrainDir, random, 3, PlopSRiver);
        }

        // The original's doBRiver and doSRiver, which differ only in the plop and how far from the edge it stops
        private static Direction LayRiver(GameMap map, Position pos, Direction riverDir, Direction terrainDir, RandomStream random,
            int edgeMargin, Action<GameMap, Position> plop)
        {
            while (map.TestBounds(pos.X + edgeMargin, pos.Y + edgeMargin))
            {
                plop(map, pos);

                if (random.GetRandom(RiverStraightenRate) < 10)
                {
                    terrainDir = riverDir;
                }
                else
                {
                    if (random.GetRandom(RiverTurnRate) > 90)
                    {
                        terrainDir = terrainDir.RotateClockwise();
                    }

                    if (random.GetRandom(RiverTurnRate) > 90)
                    {
                        terrainDir = terrainDir.RotateCounterClockwise();
                    }
                }

                pos = Position.Move(pos, terrainDir);
            }

            return terrainDir;
        }

        private static void PutOnMap(GameMap map, int newVal, int x, int y)
        {
            if (newVal == 0)
            {
                return;
            }

            if (!map.TestBounds(x, y))
            {
                return;
            }

            int tileValue = map.GetTileValue(x, y);

            if (tileValue != DIRT)
            {
                if (tileValue == RIVER)
                {
                    if (newVal != CHANNEL)
                    {
                        return;
                    }
                }

                if (tileValue == CHANNEL)
                {
                    return;
                }
            }

            map.SetTile(x, y, newVal, 0);
        }

        private static void PlopBRiver(GameMap map, Position pos)
        {
            Plop(map, pos, BRMatrix);
        }

        private static void PlopSRiver(GameMap map, Position pos)
        {
            Plop(map, pos, SRMatrix);
        }

        // Each matrix is written row by row, indexed [y, x]. A zero leaves the map's tile as it is.
        private static void Plop(GameMap map, Position pos, int[,] matrix)
        {
            int size = matrix.GetLength(0);

            for (int x = 0; x < size; x++)
            {
                for (int y = 0; y < size; y++)
                {
                    PutOnMap(map, matrix[y, x], pos.X + x, pos.Y + y);
                }
            }
        }
    }
}
