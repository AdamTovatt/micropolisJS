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

using System.Globalization;
using Micropolis.Rules;

namespace Micropolis.Benchmarks.Tests
{
    [TestClass]
    public sealed class BenchmarkRunnerTests
    {
        private static readonly BenchmarkSettings Brief = new BenchmarkSettings(Warmup: 16, Steps: 16, Repeats: 1);

        private static readonly IReadOnlyList<BenchmarkCase> Cases = BenchmarkCases.All();

        private static readonly FixtureCase Suburb = new FixtureCase("suburb", Speed.Medium, false);

        // One run to standard output, which the tests of what it writes share, since each run takes every case
        private static string _report = "";
        private static string _progress = "";

        [ClassInitialize]
        public static void RunOnce(TestContext _)
        {
            StringWriter output = new StringWriter();
            StringWriter progress = new StringWriter();
            BenchmarkRunner.Run(new BenchmarkCommandLine(Brief, null), output, progress);
            _report = output.ToString();
            _progress = progress.ToString();
        }

        [TestMethod]
        public void Run_Report_TablesEachCaseInOrder()
        {
            CollectionAssert.AreEqual(Cases.Select(c => (c.Name, c.SpeedName)).ToList(),
                                      TableRows(_report).Select(row => (row[0], row[1])).ToList());
        }

        [TestMethod]
        public void Run_Report_TablesACasesMessageBytes()
        {
            string bytes = MessageBytes.Measure(Cases[0], Brief).BytesPerStep.ToString("N1", CultureInfo.InvariantCulture);

            Assert.AreEqual(bytes, TableRows(_report)[0][4]);
        }

        [TestMethod]
        public void Run_Report_NamesEachCaseOnProgressAsItStarts()
        {
            CollectionAssert.AreEqual(Cases.Select(c => $"Timing {c.Name} at {c.SpeedName}").ToList(),
                                      _progress.Split('\n', StringSplitOptions.RemoveEmptyEntries).ToList());
        }

        [TestMethod]
        public void Run_ReportToAFile_WritesItThere()
        {
            string path = Path.Combine(Path.GetTempPath(), $"benchmarks-{Guid.NewGuid()}.md");
            StringWriter output = new StringWriter();

            try
            {
                BenchmarkRunner.Run(new BenchmarkCommandLine(Brief, path), output, TextWriter.Null);

                Assert.AreEqual("", output.ToString());
                StringAssert.StartsWith(File.ReadAllText(path), "# Benchmarks\n");
            }
            finally
            {
                File.Delete(path);
            }
        }

        [TestMethod]
        public void CheckOneCity_BothEndingAlike_Passes()
        {
            BenchmarkRunner.CheckOneCity(Suburb, new CaseMeasurement(new StepTiming(1, 1), "a hash"), new CaseBytes(1, "a hash"));
        }

        [TestMethod]
        public void CheckOneCity_BytesOfAnotherCity_FailsNamingTheCase()
        {
            InvalidDataException exception = Assert.ThrowsExactly<InvalidDataException>(
                () => BenchmarkRunner.CheckOneCity(Suburb, new CaseMeasurement(new StepTiming(1, 1), "a hash"),
                                                   new CaseBytes(1, "another hash")));

            StringAssert.Contains(exception.Message, "suburb at medium ends at the state hash a hash where it was timed");
        }

        // The table's rows below its header, each as its cells
        private static List<string[]> TableRows(string report)
        {
            return report.Split('\n')
                .Where(line => line.StartsWith("| ", StringComparison.Ordinal))
                .Skip(1)
                .Select(line => line.Trim('|').Split(" | ").Select(cell => cell.Trim()).ToArray())
                .ToList();
        }
    }
}
