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

using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The tile predicates no golden holds: <c>conformance/helpers.json</c> holds the rules' own.
    /// </summary>
    [TestClass]
    public sealed class TileUtilsTests
    {
        [TestMethod]
        [DataRow(HBRIDGE, true)]
        [DataRow(VBRIDGE, true)]
        [DataRow(ROADS, true)]
        [DataRow(INTERSECTION, true)]
        [DataRow(HROADPOWER, true)]
        [DataRow(VROADPOWER, true)]
        [DataRow(BRWH, true)]
        [DataRow(LTRFBASE, true)]
        [DataRow(HTRFBASE, true)]
        [DataRow(LASTROAD, true)]
        [DataRow(HRAILROAD, true)]
        [DataRow(VRAILROAD, true)]
        [DataRow(ROADBASE - 1, false)]
        [DataRow(LASTROAD + 1, false)]
        [DataRow(HPOWER, false)]
        [DataRow(RAILHPOWERV, false)]
        [DataRow(RAILVPOWERH, false)]
        [DataRow(HRAIL, false)]
        [DataRow(VRAIL, false)]
        [DataRow(LVRAIL10, false)]
        [DataRow(DIRT, false)]
        public void CarriesCars_TileValue_HoldsForRoadAloneAndItsCrossings(int tileValue, bool carries)
        {
            Assert.AreEqual(carries, TileUtils.CarriesCars(tileValue));
        }

        // Rail laid at (50, 50) with rail beside it on the sides the mask names, a bit 1 << d for each, d being 0 north,
        // 1 east, 2 south and 3 west: the piece the rail tool draws there leaves by those sides and no other. A single
        // side draws a straight piece, which leaves by the side opposite too, so the masks name two sides or more.
        [TestMethod]
        [DataRow(0b0011)]
        [DataRow(0b0101)]
        [DataRow(0b0110)]
        [DataRow(0b0111)]
        [DataRow(0b1001)]
        [DataRow(0b1010)]
        [DataRow(0b1011)]
        [DataRow(0b1100)]
        [DataRow(0b1101)]
        [DataRow(0b1110)]
        [DataRow(0b1111)]
        public void RailEnds_PieceTheRailToolDraws_LeavesBySidesItJoins(int sides)
        {
            int[] deltaX = [0, 1, 0, -1];
            int[] deltaY = [-1, 0, 1, 0];
            GameMap map = new GameMap(120, 100);
            CityTool rail = CityTools.Create(map)[ToolName.Rail];
            for (int side = 0; side < 4; side++)
            {
                if ((sides & (1 << side)) != 0)
                {
                    Assert.AreEqual(Outcome.Ok, ToolUse.Apply(rail, 50 + deltaX[side], 50 + deltaY[side]));
                }
            }

            Assert.AreEqual(Outcome.Ok, ToolUse.Apply(rail, 50, 50));

            Assert.AreEqual(sides, TileUtils.RailEnds(map.GetTileValue(50, 50)), $"Tile {map.GetTileValue(50, 50)}");
        }

        // The road tool's piece with neighbours on the sides given leaves by them, and so does each level of traffic and
        // each frame of it on that piece: north 1, east 2, south 4 and west 8
        [TestMethod]
        [DataRow(0b0011)]
        [DataRow(0b0101)]
        [DataRow(0b0110)]
        [DataRow(0b0111)]
        [DataRow(0b1001)]
        [DataRow(0b1010)]
        [DataRow(0b1011)]
        [DataRow(0b1100)]
        [DataRow(0b1101)]
        [DataRow(0b1110)]
        [DataRow(0b1111)]
        public void RoadEnds_PieceTheRoadToolDraws_LeavesBySidesItJoins(int sides)
        {
            int[] deltaX = [0, 1, 0, -1];
            int[] deltaY = [-1, 0, 1, 0];
            GameMap map = new GameMap(120, 100);
            CityTool road = CityTools.Create(map)[ToolName.Road];
            for (int side = 0; side < 4; side++)
            {
                if ((sides & (1 << side)) != 0)
                {
                    Assert.AreEqual(Outcome.Ok, ToolUse.Apply(road, 50 + deltaX[side], 50 + deltaY[side]));
                }
            }

            Assert.AreEqual(Outcome.Ok, ToolUse.Apply(road, 50, 50));

            int piece = map.GetTileValue(50, 50);
            for (int traffic = piece; traffic <= LASTROAD; traffic += 16)
            {
                Assert.AreEqual(sides, TileUtils.RoadEnds(traffic), $"Tile {traffic}");
            }
        }

        // A bridge, a road over a power line or over rail, and a drawbridge leave by the sides the road runs along, and
        // no tile a car drives on by none
        [TestMethod]
        [DataRow(HBRIDGE, 0b1010)]
        [DataRow(VBRIDGE, 0b0101)]
        [DataRow(HROADPOWER, 0b1010)]
        [DataRow(VROADPOWER, 0b0101)]
        [DataRow(HRAILROAD, 0b0101)]
        [DataRow(VRAILROAD, 0b1010)]
        [DataRow(BRWH, 0b1010)]
        [DataRow(BRWV, 0b0101)]
        [DataRow(BRWV + 16, 0b0101)]
        [DataRow(LHRAIL, 0)]
        [DataRow(DIRT, 0)]
        [DataRow(HBRDG0, 0)]
        public void RoadEnds_EveryOtherTile_IsTheSidesItsRoadRunsAlong(int tile, int sides)
        {
            Assert.AreEqual(sides, TileUtils.RoadEnds(tile));
            Assert.AreEqual(sides != 0, TileUtils.CarriesCars(tile));
        }

        // A station leaves by the sides of the straight rail it stands on
        [TestMethod]
        [DataRow(HRAILSTATION, LHRAIL)]
        [DataRow(VRAILSTATION, LVRAIL)]
        public void RailEnds_Station_IsItsTracks(int station, int straight)
        {
            Assert.AreEqual((station, straight), (TileUtils.StationOn(straight), TileUtils.TrackUnder(station)));
            Assert.AreEqual(TileUtils.RailEnds(straight), TileUtils.RailEnds(station));
        }

        // Entering by the north or the west end counts as from the north or west, but on the north-west curve by its
        // north end alone and on the south-east curve by its east end: north 1, east 2, south 4 and west 8
        [TestMethod]
        [DataRow(LVRAIL, 1)]
        [DataRow(LHRAIL, 8)]
        [DataRow(VRAILROAD, 1)]
        [DataRow(HRAILSTATION, 8)]
        [DataRow(LVRAIL2, 1)]
        [DataRow(LVRAIL3, 2)]
        [DataRow(LVRAIL4, 8)]
        [DataRow(LVRAIL5, 1)]
        [DataRow(LVRAIL6, 1 | 8)]
        [DataRow(LVRAIL7, 1)]
        [DataRow(LVRAIL8, 8)]
        [DataRow(LVRAIL9, 1 | 8)]
        [DataRow(LVRAIL10, 1 | 8)]
        public void RailEntriesFromNorthOrWest_EachKindOfPiece_AreItsNorthAndWestEndsButOnTwoCurves(int piece, int entries)
        {
            Assert.AreEqual(entries, TileUtils.RailEntriesFromNorthOrWest(TileUtils.RailEnds(piece)));
        }

        // Each way a ride goes along a piece, round a curve or straight through a junction or the cross, counts apart
        // from the way back, so the two never share a track
        [TestMethod]
        public void EntersFromNorthOrWest_TheTwoWaysAlongAPiece_CountApart()
        {
            int[] pieces = [LHRAIL, LVRAIL, HRAILSTATION, VRAILSTATION, HRAILROAD, VRAILROAD, RAILHPOWERV, RAILVPOWERH,
                            LVRAIL2, LVRAIL3, LVRAIL4, LVRAIL5, LVRAIL6, LVRAIL7, LVRAIL8, LVRAIL9, LVRAIL10];
            List<string> shared = new List<string>();

            foreach (int piece in pieces)
            {
                int ends = TileUtils.RailEnds(piece);
                bool curve = ends is 3 or 6 or 12 or 9;

                for (int side = 0; side < 4; side++)
                {
                    int other = curve ? ends & ~(1 << side) : 1 << TileUtils.OppositeSide(side);
                    if ((ends & (1 << side)) == 0 || (ends & other) == 0)
                    {
                        continue;
                    }

                    int otherSide = System.Numerics.BitOperations.Log2((uint)other);
                    if (TileUtils.EntersFromNorthOrWest(ends, side) == TileUtils.EntersFromNorthOrWest(ends, otherSide))
                    {
                        shared.Add($"{piece} entered by {side} and by {otherSide}");
                    }
                }
            }

            CollectionAssert.AreEqual(Array.Empty<string>(), shared);
        }

        [TestMethod]
        [DataRow(10, 10, 10, 9, TileUtils.SouthSide)]
        [DataRow(10, 10, 11, 10, TileUtils.WestSide)]
        [DataRow(10, 10, 10, 11, TileUtils.NorthSide)]
        [DataRow(10, 10, 9, 10, TileUtils.EastSide)]
        public void SideEnteredBy_AStepEachWay_IsTheSideFacingWhereItCameFrom(int fromX, int fromY, int toX, int toY, int side)
        {
            Assert.AreEqual(side, TileUtils.SideEnteredBy(new Position(fromX, fromY), new Position(toX, toY)));
        }

        // A tile's sides are numbered as the cardinal directions are ordered, each the way a step out by it goes
        [TestMethod]
        public void Sides_AreNumberedAsTheCardinalDirections()
        {
            Assert.AreEqual((Direction.North, Direction.East, Direction.South, Direction.West),
                            (Direction.CardinalDirections[TileUtils.NorthSide], Direction.CardinalDirections[TileUtils.EastSide],
                             Direction.CardinalDirections[TileUtils.SouthSide], Direction.CardinalDirections[TileUtils.WestSide]));
            Assert.AreEqual((TileUtils.SouthSide, TileUtils.WestSide, TileUtils.NorthSide, TileUtils.EastSide),
                            (TileUtils.OppositeSide(TileUtils.NorthSide), TileUtils.OppositeSide(TileUtils.EastSide),
                             TileUtils.OppositeSide(TileUtils.SouthSide), TileUtils.OppositeSide(TileUtils.WestSide)));
        }
    }
}
