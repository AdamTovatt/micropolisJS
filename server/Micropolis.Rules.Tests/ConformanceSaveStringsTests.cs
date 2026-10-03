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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The guards in the reader of <c>conformance/saveStrings.json</c>, so the save strings' tests cannot pass over
    /// strings the file lost.
    /// </summary>
    [TestClass]
    public sealed class ConformanceSaveStringsTests
    {
        [TestMethod]
        public void Parse_SharedFile_ReadsIt()
        {
            Assert.IsNotEmpty(ConformanceSaveStrings.Parse(ConformanceFile.Read("saveStrings.json")).ScoreReasons);
        }

        [TestMethod]
        [DataRow("no city classes", "{\"cityClasses\":[],\"scoreReasons\":[\"A\"],\"cityClassMessages\":[\"B\"]}", "cityClasses is empty")]
        [DataRow("no score reasons", "{\"cityClasses\":[\"A\"],\"scoreReasons\":[],\"cityClassMessages\":[\"B\"]}", "scoreReasons is empty")]
        [DataRow("no messages", "{\"cityClasses\":[\"A\"],\"scoreReasons\":[\"B\"]}", "cityClassMessages")]
        public void Parse_BrokenFile_Throws(string description, string json, string message)
        {
            ConformanceAssert.Broken(() => ConformanceSaveStrings.Parse(json), description, message);
        }
    }
}
