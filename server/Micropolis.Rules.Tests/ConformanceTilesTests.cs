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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The guards in the reader of <c>conformance/tiles.json</c>, so the tile names' tests cannot pass over names the
    /// file lost.
    /// </summary>
    [TestClass]
    public sealed class ConformanceTilesTests
    {
        [TestMethod]
        public void Parse_SharedFile_ReadsIt()
        {
            Assert.IsNotEmpty(ConformanceTiles.Parse(ConformanceFile.Read("tiles.json")).Values);
        }

        [TestMethod]
        [DataRow("no values", "{\"values\":{},\"flags\":{\"POWERBIT\":32768}}", "values is empty")]
        [DataRow("no flags", "{\"values\":{\"DIRT\":0},\"flags\":{}}", "flags is empty")]
        [DataRow("a list it doesn't know", "{\"values\":{\"DIRT\":0},\"flags\":{\"POWERBIT\":32768},\"extra\":{}}", "extra")]
        public void Parse_BrokenFile_Throws(string description, string json, string message)
        {
            ConformanceAssert.Broken(() => ConformanceTiles.Parse(json), description, message);
        }
    }
}
