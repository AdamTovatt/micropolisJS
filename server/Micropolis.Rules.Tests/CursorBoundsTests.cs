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

using System.Text.RegularExpressions;
using Micropolis.SourceTree;

namespace Micropolis.Rules.Tests
{
    [TestClass]
    public sealed class CursorBoundsTests
    {
        private const int Width = MapGenerator.MapWidth;
        private const int Height = MapGenerator.MapHeight;

        // The browser sends a box the size its tool's button gives, which a box the server drops would never reach
        // the other players at
        [TestMethod]
        public void SizeOf_EachToolButtonInThePage_IsTheButtonsSize()
        {
            string page = File.ReadAllText(RepositoryFiles.GetPath("index.html"));
            Dictionary<string, int> buttons = Regex.Matches(page, "<button[^>]*\\bdata-tool=\"[^\"]*\"[^>]*>")
                .ToDictionary(button => Attribute(button.Value, "data-tool"), button => int.Parse(Attribute(button.Value, "data-size")));

            CollectionAssert.AreEquivalent(ProtocolJson.Names<CursorTool>().ToList(), buttons.Keys.ToList());

            foreach (CursorTool tool in Enum.GetValues<CursorTool>())
            {
                Assert.AreEqual(buttons[ProtocolJson.Name(tool)], CursorBounds.SizeOf(tool), ProtocolJson.Name(tool));
            }
        }

        [TestMethod]
        [DataRow(CursorTool.Query, 0, 0, 1, DisplayName = "the query tool at the map's first tile")]
        [DataRow(CursorTool.Walkway, 30, 30, 1, DisplayName = "the walkway, round the tile holding its ninth")]
        [DataRow(CursorTool.Airport, Width - 1, Height - 1, 6, DisplayName = "the airport at the map's last tile")]
        [DataRow(CursorTool.Residential, 30, 30, 3, DisplayName = "a zone")]
        public void Fits_BoxItsToolMakesOnTheMap_Fits(CursorTool tool, int x, int y, int size)
        {
            Assert.IsTrue(CursorBounds.Fits(new Cursor(tool, x, y, size), Width, Height));
        }

        [TestMethod]
        [DataRow(-1, 30, 1, DisplayName = "west of the map")]
        [DataRow(Width, 30, 1, DisplayName = "east of the map")]
        [DataRow(30, -1, 1, DisplayName = "north of the map")]
        [DataRow(30, Height, 1, DisplayName = "south of the map")]
        [DataRow(30, 30, 0, DisplayName = "of no tiles")]
        [DataRow(30, 30, 3, DisplayName = "a zone's size for a road")]
        public void Fits_RoadBoxNoRoadMakes_DoesNotFit(int x, int y, int size)
        {
            Assert.IsFalse(CursorBounds.Fits(new Cursor(CursorTool.Road, x, y, size), Width, Height));
        }

        private static string Attribute(string element, string name)
        {
            return Regex.Match(element, $"\\b{name}=\"([^\"]*)\"").Groups[1].Value;
        }
    }
}
