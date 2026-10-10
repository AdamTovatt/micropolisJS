/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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
    /// The walkways on a tile: a layer of ninths beside the tile map, which <see cref="GameMap"/> keeps a value a tile
    /// of. A tile is a grid of <see cref="Side"/> by <see cref="Side"/> ninths, numbered row by row from the north-west
    /// corner, so ninth <c>n</c> lies in row <c>n / 3</c> and column <c>n % 3</c>; a tile's value holds each ninth's
    /// <see cref="WalkwayKind"/> in two bits, ninth <c>n</c>'s at bit <c>2n</c>, and 0 where it holds none. A walkway is
    /// laid on a tile that <see cref="Takes"/> one. On a tile that no longer does it is no longer usable
    /// (<see cref="Usable"/>): the router walks none of it (<see cref="TripRouter"/>) and the client draws none, and
    /// the map scan clears it (<see cref="Cleared"/>), but where an opening drawbridge leaves it dormant.
    /// </summary>
    /// <remarks>
    /// The ninths of a tile that share a side form its pieces, each a place of its own to someone walking: two pieces of
    /// one tile join only through the tiles about it. A ninth on a tile's edge touches the ninth across the edge in the
    /// tile beside, in the same row for an east or west edge and the same column for a north or south one, so walkways
    /// join across tiles where their ninths touch.
    /// </remarks>
    public static class Walkways
    {
        /// <summary>
        /// The ninths along each side of a tile.
        /// </summary>
        public const int Side = 3;

        /// <summary>
        /// The ninths a tile holds.
        /// </summary>
        public const int Ninths = Side * Side;

        /// <summary>
        /// The mask of every ninth of a tile.
        /// </summary>
        public const int AllNinths = (1 << Ninths) - 1;

        /// <summary>
        /// The bits a ninth's kind takes in a tile's value.
        /// </summary>
        public const int BitsPerNinth = 2;

        /// <summary>
        /// The most pieces the ninths of one tile form (<see cref="Pieces"/>): the four corners and the middle, none
        /// sharing a side.
        /// </summary>
        public const int MostPieces = 5;

        /// <summary>
        /// The highest kind a ninth holds.
        /// </summary>
        public const int MostKind = (int)WalkwayKind.Underpass;

        /// <summary>
        /// The greatest walkway value a tile holds: every ninth of the highest kind.
        /// </summary>
        public static readonly int MostValue = Enumerable.Range(0, Ninths).Sum(ninth => MostKind << (BitsPerNinth * ninth));

        private const int KindMask = (1 << BitsPerNinth) - 1;

        // By a mask of ninths, the pieces they form, each a mask of its ninths, in the order of their first ninth: those
        // of mask m from PieceStart[m] up to PieceStart[m + 1] in PieceList
        private static readonly int[] PieceStart = new int[(1 << Ninths) + 1];
        private static readonly ushort[] PieceList = BuildPieces();

        // By a mask of ninths and a side, numbered as TileUtils.NorthSide says, which of the three places along that side
        // its ninths take: from the west for a north or south side, and from the north for an east or west one
        private static readonly byte[] EdgeTable = BuildEdges();

        /// <summary>
        /// Whether a tile of the value takes walkway of the kind given: a path open land (<see cref="IsOpenLand"/>), a
        /// road, its bridges and crossings, or rail, its bridges and crossings, but no station; a footbridge a road or
        /// rail as a path does, or water, which it carries walkers over as ships pass under it; and an underpass a road
        /// or rail as a path does but for a bridge (<see cref="TileUtils.IsBridge"/>), since it goes under the way, never
        /// under water. Zones and every other building take none, nor the wild woods, rubble, fire or a power line on its
        /// own.
        /// </summary>
        public static bool Takes(int tileValue, WalkwayKind kind)
        {
            bool way = TileUtils.CarriesCars(tileValue) ||
                       (TileUtils.CarriesTrains(tileValue) && !TileUtils.IsRailStation(tileValue));

            return kind switch
            {
                WalkwayKind.Path => way || IsOpenLand(tileValue),
                WalkwayKind.Footbridge => way || TileUtils.IsWater(tileValue),
                _ => way && !TileUtils.IsBridge(tileValue),
            };
        }

        /// <summary>
        /// The usable ninths of a tile's walkway value, those whose kind a tile of the value given takes
        /// (<see cref="Takes"/>), the others cleared: what the router walks, what the client is sent and draws, and what a
        /// tool laying the tile keeps. A ninth that isn't usable lies dormant until the map scan clears it
        /// (<see cref="Cleared"/>), or its tile takes its kind again.
        /// </summary>
        public static int Usable(int walkway, int tileValue)
        {
            int usable = walkway;
            for (int ninth = 0; ninth < Ninths && usable != 0; ninth++)
            {
                int kind = KindAt(walkway, ninth);
                if (kind != 0 && !Takes(tileValue, (WalkwayKind)kind))
                {
                    usable = With(usable, ninth, 0);
                }
            }

            return usable;
        }

        /// <summary>
        /// A tile's walkway value as the map scan leaves it: cleared of every ninth that isn't usable (<see cref="Usable"/>)
        /// once the tile under it has burnt, flooded or been wrecked, but whole on water or a drawbridge's raised end
        /// (<see cref="TileUtils.IsRaisedBridgeEnd"/>), the tiles an opening drawbridge writes over its road, where its
        /// walkway lies dormant until the bridge closes. A rule that makes a bridge water for good, its decay or a
        /// monster's or a tornado's wrecking, clears its walkway itself (<see cref="GameMap.ClearUnusableWalkway"/>), as a
        /// tool laying a tile keeps only what is usable.
        /// </summary>
        public static int Cleared(int walkway, int tileValue)
        {
            return TileUtils.IsWater(tileValue) || TileUtils.IsRaisedBridgeEnd(tileValue)
                ? walkway
                : Usable(walkway, tileValue);
        }

        /// <summary>
        /// Whether a tile of the value is open land, which people walk across without a path: bare land or a park, its
        /// trees or its fountain, as the park tool lays them. The wild woods are not, nor anything else.
        /// </summary>
        public static bool IsOpenLand(int tileValue)
        {
            return tileValue == TileValues.DIRT || TileUtils.IsPark(tileValue);
        }

        /// <summary>
        /// The kind the ninth holds in a tile's walkway value, or 0 for none.
        /// </summary>
        public static int KindAt(int walkway, int ninth)
        {
            return (walkway >> (BitsPerNinth * ninth)) & KindMask;
        }

        /// <summary>
        /// The tile a ninth of the map's grid of ninths, <see cref="Side"/> across and down each tile, lies in, and the
        /// ninth of that tile it is.
        /// </summary>
        public static (int X, int Y, int Ninth) Locate(int ninthX, int ninthY)
        {
            return (ninthX / Side, ninthY / Side, ninthY % Side * Side + ninthX % Side);
        }

        /// <summary>
        /// The tile's walkway value with the ninth holding the kind given, or none for 0.
        /// </summary>
        public static int With(int walkway, int ninth, int kind)
        {
            int shift = BitsPerNinth * ninth;
            return (walkway & ~(KindMask << shift)) | (kind << shift);
        }

        /// <summary>
        /// The ninths of a tile's walkway value that hold walkway, a bit <c>1 &lt;&lt; n</c> for each ninth <c>n</c>.
        /// </summary>
        public static int Mask(int walkway)
        {
            int mask = 0;

            for (int ninth = 0; ninth < Ninths; ninth++)
            {
                if (KindAt(walkway, ninth) != 0)
                {
                    mask |= 1 << ninth;
                }
            }

            return mask;
        }

        /// <summary>
        /// The ninths of a tile's walkway value that hold the kind given, a bit <c>1 &lt;&lt; n</c> for each ninth
        /// <c>n</c>.
        /// </summary>
        public static int NinthsOf(int walkway, WalkwayKind kind)
        {
            int ninths = 0;

            for (int ninth = 0; ninth < Ninths; ninth++)
            {
                if (KindAt(walkway, ninth) == (int)kind)
                {
                    ninths |= 1 << ninth;
                }
            }

            return ninths;
        }

        /// <summary>
        /// The ninths of a tile of the value that are a road's carriageway, a bit for each, where a path is a crossing:
        /// the middle ninth and the middle of each side the road leaves by (<see cref="TileUtils.RoadEnds"/>), or none
        /// where no car drives.
        /// </summary>
        public static int Carriageway(int tileValue)
        {
            return MiddleAndSides(TileUtils.RoadEnds(tileValue));
        }

        /// <summary>
        /// The ninths of a tile of the value its rail's track takes, a bit for each, as a road's carriageway does: the
        /// middle ninth and the middle of each side the track leaves by (<see cref="TileUtils.RailEnds"/>), or none off
        /// rail.
        /// </summary>
        public static int Track(int tileValue)
        {
            return MiddleAndSides(TileUtils.RailEnds(tileValue));
        }

        /// <summary>
        /// The middle ninth and the middle ninth of each side given, a bit <c>1 &lt;&lt; d</c> for each side d, numbered
        /// as <see cref="TileUtils.NorthSide"/> says: the ninths a road or a track leaving a tile by those sides takes, or
        /// none for no side.
        /// </summary>
        public static int MiddleAndSides(int sides)
        {
            if (sides == 0)
            {
                return 0;
            }

            int ninths = 1 << (Ninths / 2);
            for (int side = 0; side < 4; side++)
            {
                if ((sides & (1 << side)) != 0)
                {
                    ninths |= 1 << NinthAlong(side, Side / 2);
                }
            }

            return ninths;
        }

        /// <summary>
        /// The crossings of a tile of the value with the walkway value given: the ninths of its carriageway
        /// (<see cref="Carriageway"/>) holding a path, which a car gives way to a walker on. A footbridge or an underpass
        /// on the carriageway is none, and stops no car.
        /// </summary>
        public static int Crossings(int walkway, int tileValue)
        {
            return Carriageway(tileValue) & NinthsOf(walkway, WalkwayKind.Path);
        }

        /// <summary>
        /// The ninths of a tile's walkway value a walker may use, as <see cref="Mask"/> gives them: its usable ninths
        /// (<see cref="Usable"/>).
        /// </summary>
        public static int UsableMask(int walkway, int tileValue)
        {
            return walkway != 0 ? Mask(Usable(walkway, tileValue)) : 0;
        }

        /// <summary>
        /// What a tile's walkway value costs a year, in ninths of path, <see cref="Budget.WalkwayNinthsPerRoad"/> of which
        /// cost what a tile of road does: a ninth of path one, and a tile holding a footbridge
        /// <see cref="FootbridgeUpkeep"/> and one holding an underpass <see cref="UnderpassUpkeep"/>, however many of its
        /// ninths each takes, as each is built a tile at a time (<see cref="WalkwayTool"/>).
        /// </summary>
        public static int Upkeep(int walkway)
        {
            return int.PopCount(NinthsOf(walkway, WalkwayKind.Path)) +
                (NinthsOf(walkway, WalkwayKind.Footbridge) != 0 ? FootbridgeUpkeep : 0) +
                (NinthsOf(walkway, WalkwayKind.Underpass) != 0 ? UnderpassUpkeep : 0);
        }

        /// <summary>
        /// What a tile holding a footbridge costs a year, in ninths of path: two tiles of road.
        /// </summary>
        public const int FootbridgeUpkeep = 2 * Side;

        /// <summary>
        /// What a tile holding an underpass costs a year, in ninths of path: three tiles of road, dearer than a
        /// footbridge as it costs more to build.
        /// </summary>
        public const int UnderpassUpkeep = 3 * Side;

        /// <summary>
        /// Whether a tile's walkway value is one: a kind or none on each ninth, which its two bits a ninth always hold.
        /// </summary>
        public static bool IsValid(int walkway)
        {
            return walkway >= 0 && walkway <= MostValue;
        }

        /// <summary>
        /// The pieces a mask of ninths forms, each a mask of the ninths that join it, in the order of their first ninth.
        /// </summary>
        public static ReadOnlySpan<ushort> Pieces(int mask)
        {
            return PieceList.AsSpan(PieceStart[mask], PieceStart[mask + 1] - PieceStart[mask]);
        }

        /// <summary>
        /// Which of the three places along the side given, numbered as <see cref="TileUtils.NorthSide"/> says, a mask of
        /// ninths takes, a bit for each: from the west along a north or south side, and from the north along an east or
        /// west one. A ninth of one tile touches the ninth across its side where the two sides' places share a bit.
        /// </summary>
        public static int Edge(int mask, int side)
        {
            return EdgeTable[(mask << 2) | side];
        }

        /// <summary>
        /// The ninth at the place along the side given, numbered as <see cref="Edge"/> numbers them.
        /// </summary>
        public static int NinthAlong(int side, int place)
        {
            return side switch
            {
                TileUtils.NorthSide => place,
                TileUtils.SouthSide => (Side - 1) * Side + place,
                TileUtils.WestSide => place * Side,
                _ => place * Side + Side - 1,
            };
        }

        private static ushort[] BuildPieces()
        {
            List<ushort> pieces = new List<ushort>();

            for (int mask = 0; mask < 1 << Ninths; mask++)
            {
                PieceStart[mask] = pieces.Count;
                int left = mask;

                while (left != 0)
                {
                    int piece = left & -left;
                    int grown;

                    do
                    {
                        grown = piece;
                        piece |= Neighbours(piece) & mask;
                    }
                    while (piece != grown);

                    pieces.Add((ushort)piece);
                    left &= ~piece;
                }
            }

            PieceStart[1 << Ninths] = pieces.Count;
            return pieces.ToArray();
        }

        /// <summary>
        /// The ninths that share a side with any of those given.
        /// </summary>
        public static int Neighbours(int mask)
        {
            int neighbours = 0;

            for (int ninth = 0; ninth < Ninths; ninth++)
            {
                if ((mask & (1 << ninth)) == 0)
                {
                    continue;
                }

                int row = ninth / Side;
                int column = ninth % Side;

                if (row > 0)
                {
                    neighbours |= 1 << (ninth - Side);
                }

                if (row < Side - 1)
                {
                    neighbours |= 1 << (ninth + Side);
                }

                if (column > 0)
                {
                    neighbours |= 1 << (ninth - 1);
                }

                if (column < Side - 1)
                {
                    neighbours |= 1 << (ninth + 1);
                }
            }

            return neighbours;
        }

        private static byte[] BuildEdges()
        {
            byte[] edges = new byte[(1 << Ninths) * 4];

            for (int mask = 0; mask < 1 << Ninths; mask++)
            {
                for (int side = 0; side < 4; side++)
                {
                    for (int place = 0; place < Side; place++)
                    {
                        edges[(mask << 2) | side] |= (byte)(((mask >> NinthAlong(side, place)) & 1) << place);
                    }
                }
            }

            return edges;
        }
    }
}
