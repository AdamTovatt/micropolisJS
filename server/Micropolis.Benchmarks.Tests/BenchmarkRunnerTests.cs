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

using System.Text.Json;
using Micropolis.Rules;

namespace Micropolis.Benchmarks.Tests
{
    [TestClass]
    public sealed class BenchmarkRunnerTests
    {
        private static readonly BenchmarkSettings Brief = new BenchmarkSettings(Warmup: 16, Steps: 16, Repeats: 1);

        private static readonly IReadOnlyList<BenchmarkCase> Cases = BenchmarkCases.All();

        [TestMethod]
        public void Run_Cases_WritesTheCaseList()
        {
            StringWriter output = new StringWriter();

            BenchmarkRunner.Run(new BenchmarkCommandLine(BenchmarkCommand.Cases, Brief, null, null), TextReader.Null, output,
                                TextWriter.Null);

            Assert.AreEqual(BenchmarkCases.ToJson(Cases, Brief), output.ToString().TrimEnd());
        }

        [TestMethod]
        public void Run_Report_TablesARowEachCaseInOrder()
        {
            string report = Report(null, TextReader.Null);

            CollectionAssert.AreEqual(Cases.Select(c => (c.Name, c.SpeedName)).ToList(),
                                      TableRows(report).Select(row => (row[0], row[1])).ToList());
        }

        [TestMethod]
        public void Run_Report_NamesEachCaseOnProgressAsItStarts()
        {
            StringWriter progress = new StringWriter();

            BenchmarkRunner.Run(new BenchmarkCommandLine(BenchmarkCommand.Report, Brief, null, null), TextReader.Null,
                                TextWriter.Null, progress);

            CollectionAssert.AreEqual(Cases.Select(c => $"Timing {c.Name} at {c.SpeedName}").ToList(),
                                      progress.ToString().Split('\n', StringSplitOptions.RemoveEmptyEntries).ToList());
        }

        [TestMethod]
        public void Run_ReportWithBytes_TablesEachCasesBytes()
        {
            string report = Report("-", new StringReader(Measured(Cases.Select(c => StateHashAfter(c, Brief)).ToList())));

            CollectionAssert.AreEqual(Cases.Select((_, i) => (10.0 + i).ToString("N1", System.Globalization.CultureInfo.InvariantCulture)).ToList(),
                                      TableRows(report).Select(row => row[4]).ToList());
        }

        [TestMethod]
        public void Run_ReportWithBytesFromAFile_ReadsThem()
        {
            string path = Path.Combine(Path.GetTempPath(), $"message-bytes-{Guid.NewGuid()}.json");
            File.WriteAllText(path, Measured(Cases.Select(c => StateHashAfter(c, Brief)).ToList()));

            try
            {
                Assert.AreEqual("10.0", TableRows(Report(path, TextReader.Null))[0][4]);
            }
            finally
            {
                File.Delete(path);
            }
        }

        [TestMethod]
        public void Run_ReportWithBytesOfAnotherCity_FailsNamingTheCase()
        {
            string measured = Measured(Cases.Select(_ => new string('0', 64)).ToList());

            InvalidDataException exception = Assert.ThrowsExactly<InvalidDataException>(
                () => Report("-", new StringReader(measured)));

            StringAssert.Contains(exception.Message, $"{Cases[0].Name} at {Cases[0].SpeedName} ends at the state hash");
        }

        [TestMethod]
        public void Run_ReportToAFile_WritesItThere()
        {
            string path = Path.Combine(Path.GetTempPath(), $"benchmarks-{Guid.NewGuid()}.md");
            StringWriter output = new StringWriter();

            try
            {
                BenchmarkRunner.Run(new BenchmarkCommandLine(BenchmarkCommand.Report, Brief, null, path), TextReader.Null, output,
                                    TextWriter.Null);

                Assert.AreEqual("", output.ToString());
                StringAssert.StartsWith(File.ReadAllText(path), "# Benchmarks\n");
            }
            finally
            {
                File.Delete(path);
            }
        }

        // The report written to standard output, with the message bytes read from the path given
        private static string Report(string? messageBytesPath, TextReader input)
        {
            StringWriter output = new StringWriter();
            BenchmarkRunner.Run(new BenchmarkCommandLine(BenchmarkCommand.Report, Brief, messageBytesPath, null), input, output,
                                TextWriter.Null);
            return output.ToString();
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

        // Message bytes for every case, the first measuring 10 bytes a step and each next one more, ending at the hashes given
        private static string Measured(IReadOnlyList<string> hashes)
        {
            return JsonSerializer.Serialize(new
            {
                warmup = Brief.Warmup,
                steps = Brief.Steps,
                cases = Cases.Select((c, i) => new { name = c.Name, speed = c.SpeedName, bytesPerStep = 10.0 + i, hash = hashes[i] }),
            });
        }

        private static string StateHashAfter(BenchmarkCase benchmarkCase, BenchmarkSettings settings)
        {
            Simulation city = benchmarkCase.Start();
            for (int step = 0; step < settings.Warmup + settings.Steps; step++)
            {
                city.Step();
            }

            return StateHash.HashSavedState(city.Save());
        }
    }
}
