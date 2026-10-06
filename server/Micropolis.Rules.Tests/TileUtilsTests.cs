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

        // A station leaves by the sides of the straight rail it stands on
        [TestMethod]
        [DataRow(HRAILSTATION, LHRAIL)]
        [DataRow(VRAILSTATION, LVRAIL)]
        public void RailEnds_Station_IsItsTracks(int station, int straight)
        {
            Assert.AreEqual((station, straight), (TileUtils.StationOn(straight), TileUtils.TrackUnder(station)));
            Assert.AreEqual(TileUtils.RailEnds(straight), TileUtils.RailEnds(station));
        }
    }
}
