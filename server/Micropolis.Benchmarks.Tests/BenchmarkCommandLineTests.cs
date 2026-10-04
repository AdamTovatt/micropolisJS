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
    public sealed class BenchmarkCommandLineTests
    {
        [TestMethod]
        public void Parse_CasesAlone_TakesTheDefaults()
        {
            BenchmarkCommandLine commandLine = BenchmarkCommandLine.Parse(["cases"]);

            Assert.AreEqual(new BenchmarkCommandLine(BenchmarkCommand.Cases, BenchmarkSettings.Default, null, null), commandLine);
        }

        [TestMethod]
        public void Parse_ReportWithEveryOption_ReadsEach()
        {
            BenchmarkCommandLine commandLine = BenchmarkCommandLine.Parse(
                ["report", "--warmup", "0", "--steps", "16", "--repeats", "1", "--message-bytes", "-", "--output", "out.md"]);

            Assert.AreEqual(new BenchmarkCommandLine(BenchmarkCommand.Report, new BenchmarkSettings(0, 16, 1), "-", "out.md"),
                            commandLine);
        }

        [TestMethod]
        [DataRow(new string[0], "No command", DisplayName = "no command")]
        [DataRow(new[] { "time" }, "No command named time", DisplayName = "an unknown command")]
        [DataRow(new[] { "cases", "--repeats", "3" }, "cases takes no option --repeats", DisplayName = "a report option to cases")]
        [DataRow(new[] { "report", "--seed", "3" }, "report takes no option --seed", DisplayName = "an unknown option")]
        [DataRow(new[] { "report", "--steps" }, "--steps needs a value", DisplayName = "an option without its value")]
        [DataRow(new[] { "report", "--steps", "1", "--steps", "2" }, "--steps is given twice", DisplayName = "an option twice")]
        [DataRow(new[] { "report", "--steps", "0" }, "--steps takes a whole number of at least 1", DisplayName = "no steps")]
        [DataRow(new[] { "report", "--repeats", "0" }, "--repeats takes a whole number of at least 1", DisplayName = "no repeats")]
        [DataRow(new[] { "report", "--warmup", "-1" }, "--warmup takes a whole number of at least 0", DisplayName = "a negative warmup")]
        [DataRow(new[] { "report", "--steps", "1.5" }, "--steps takes a whole number", DisplayName = "a fraction")]
        public void Parse_WrongArguments_FailsNamingTheProblem(string[] args, string problem)
        {
            ArgumentException exception = Assert.ThrowsExactly<ArgumentException>(() => BenchmarkCommandLine.Parse(args));

            StringAssert.Contains(exception.Message, problem);
        }
    }
}
