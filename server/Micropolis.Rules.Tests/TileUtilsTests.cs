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
    }
}
