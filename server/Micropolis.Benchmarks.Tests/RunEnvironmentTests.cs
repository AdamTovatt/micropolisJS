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

namespace Micropolis.Benchmarks.Tests
{
    [TestClass]
    public sealed class RunEnvironmentTests
    {
        private static readonly string Root = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "repository"));

        [TestMethod]
        [DataRow(null, "unknown", DisplayName = "outside a git checkout")]
        [DataRow("", "0123456789ab", DisplayName = "a clean tree")]
        [DataRow(" M CLAUDE.md", "0123456789ab, with uncommitted changes", DisplayName = "a changed tree")]
        public void DescribeCommit_Tree_SaysWhetherItDiffers(string? status, string expected)
        {
            string? commit = status is null ? null : "0123456789ab";

            string described = RunEnvironment.DescribeCommit(
                arguments => arguments[0] == "rev-parse" ? commit : status, Root, null);

            Assert.AreEqual(expected, described);
        }

        [TestMethod]
        public void DescribeCommit_StatusFailing_SaysItsUnknown()
        {
            string described = RunEnvironment.DescribeCommit(
                arguments => arguments[0] == "rev-parse" ? "0123456789ab" : null, Root, null);

            Assert.AreEqual("0123456789ab, whether the tree differs from it unknown", described);
        }

        [TestMethod]
        public void DescribeLoad_BothKnown_SaysEach()
        {
            Assert.AreEqual("1.00, 2.00, 3.00 as the timing started, 4.00, 5.00, 6.00 as it ended",
                            RunEnvironment.DescribeLoad("1.00, 2.00, 3.00", "4.00, 5.00, 6.00"));
        }

        [TestMethod]
        [DataRow(null, "4.00, 5.00, 6.00", DisplayName = "not before")]
        [DataRow("1.00, 2.00, 3.00", null, DisplayName = "not after")]
        public void DescribeLoad_EitherUnknown_SaysSo(string? before, string? after)
        {
            Assert.AreEqual("not known on this platform", RunEnvironment.DescribeLoad(before, after));
        }

        [TestMethod]
        public void StatusArguments_ReportInsideTheRepository_LeaveItOut()
        {
            CollectionAssert.AreEqual(
                new[] { "status", "--porcelain", "--", ".", ":(exclude)docs/benchmarks.md" },
                RunEnvironment.StatusArguments(Root, Path.Combine(Root, "docs", "benchmarks.md")).ToList());
        }

        [TestMethod]
        [DataRow(null, DisplayName = "standard output")]
        [DataRow("..", DisplayName = "the repository's parent")]
        [DataRow("../benchmarks.md", DisplayName = "a file beside the repository")]
        [DataRow("../repository-other/benchmarks.md", DisplayName = "a sibling sharing the repository's name as a prefix")]
        public void StatusArguments_ReportOutsideTheRepository_ExcludeNothing(string? relativePath)
        {
            string? reportPath = relativePath is null ? null : Path.Combine(Root, relativePath);

            CollectionAssert.AreEqual(new[] { "status", "--porcelain", "--", "." },
                                      RunEnvironment.StatusArguments(Root, reportPath).ToList());
        }
    }
}
