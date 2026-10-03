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
    /// The guards in the reader of <c>conformance/saves/checkpoints.json</c>, so the save tests cannot pass over saves
    /// the file lost.
    /// </summary>
    [TestClass]
    public sealed class ConformanceSavesTests
    {
        [TestMethod]
        public void Parse_SharedFile_ReadsIt()
        {
            Assert.IsNotEmpty(ConformanceSaves.Parse(ConformanceFile.Read("saves/checkpoints.json")));
        }

        [TestMethod]
        [DataRow("no fixtures", "{}", "saves is empty")]
        [DataRow("a fixture without its run", "{\"town\":{\"built\":0}}", "run")]
        [DataRow("a checkpoint that is not a step", "{\"town\":{\"built\":0,\"run\":\"end\"}}", "run")]
        public void Parse_BrokenFile_Throws(string description, string json, string message)
        {
            ConformanceAssert.Broken(() => ConformanceSaves.Parse(json), description, message);
        }
    }
}
