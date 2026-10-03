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

using Micropolis.Rules;

namespace Micropolis.Benchmarks.Tests
{
    [TestClass]
    public sealed class BenchmarkReportTests
    {
        private static readonly RunEnvironment Environment = new RunEnvironment("0123456789ab", "a machine", "a load", "a runtime");

        private static readonly BenchmarkCase Suburb = new FixtureCase("suburb", Speed.Medium, false);

        private static readonly BenchmarkCase NewCity = new NewCityCase(0, Level.Easy, Speed.Fast);

        [TestMethod]
        public void Write_WithBytes_SaysWhatWasMeasuredAndOnWhat()
        {
            string report = BenchmarkReport.Write(Environment, new BenchmarkSettings(48, 96, 5), [], bytesMeasured: true);

            StringAssert.Contains(report, "- Commit: 0123456789ab\n");
            StringAssert.Contains(report, "- Machine: a machine\n");
            StringAssert.Contains(report, "- Load average over 1, 5 and 15 minutes: a load\n");
            StringAssert.Contains(report, "- Runtime: a runtime\n");
            StringAssert.Contains(report, "at its saved speed; random disasters are off.");
            StringAssert.Contains(report, "steps 48 times to warm up, then 96 steps are timed; the median of 5 repeats");
            StringAssert.Contains(report, $"- Bytes/step: {MessageBytes.Source}");
        }

        [TestMethod]
        public void Write_DisasterFixtureRows_NameThemAsRunWithDisasters()
        {
            BenchmarkRow[] rows =
            [
                new BenchmarkRow(Suburb, new StepTiming(1000, 1), null),
                new BenchmarkRow(new FixtureCase("disasters", Speed.Medium, true), new StepTiming(1000, 1), null),
            ];

            string report = BenchmarkReport.Write(Environment, new BenchmarkSettings(48, 96, 5), rows, bytesMeasured: false);

            StringAssert.Contains(report, "at its saved speed; random disasters are on for disasters.");
        }

        [TestMethod]
        public void Write_Rows_TableARowEachInOrder()
        {
            BenchmarkRow[] rows =
            [
                new BenchmarkRow(Suburb, new StepTiming(12345.6, 0.081), 1234.56),
                new BenchmarkRow(NewCity, new StepTiming(500, 2), 7),
            ];

            string report = BenchmarkReport.Write(Environment, new BenchmarkSettings(48, 96, 1), rows, bytesMeasured: true);

            StringAssert.EndsWith(report,
                "| Fixture | Speed | Steps/s | ms/step | Bytes/step |\n" +
                "|---------|-------|--------:|--------:|-----------:|\n" +
                "| suburb | medium | 12,346 | 0.0810 | 1,234.6 |\n" +
                "| new city (seed 0) | fast | 500 | 2.0000 | 7.0 |\n");
            StringAssert.Contains(report, "the median of 1 repeat, ");
        }

        [TestMethod]
        public void Write_WithoutBytes_SaysTheyWerentMeasured()
        {
            BenchmarkRow[] rows = [new BenchmarkRow(Suburb, new StepTiming(1000, 1), null)];

            string report = BenchmarkReport.Write(Environment, new BenchmarkSettings(48, 96, 5), rows, bytesMeasured: false);

            StringAssert.Contains(report, "- Bytes/step: not measured in this run.\n");
            StringAssert.EndsWith(report, "| suburb | medium | 1,000 | 1.0000 | – |\n");
        }
    }
}
