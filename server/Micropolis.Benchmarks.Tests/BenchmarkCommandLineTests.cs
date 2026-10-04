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
        public void Parse_NoArguments_TakesTheDefaults()
        {
            BenchmarkCommandLine commandLine = BenchmarkCommandLine.Parse([]);

            Assert.AreEqual(new BenchmarkCommandLine(BenchmarkSettings.Default, null), commandLine);
        }

        [TestMethod]
        public void Parse_EveryOption_ReadsEach()
        {
            BenchmarkCommandLine commandLine = BenchmarkCommandLine.Parse(
                ["--warmup", "0", "--steps", "16", "--repeats", "1", "--output", "out.md"]);

            Assert.AreEqual(new BenchmarkCommandLine(new BenchmarkSettings(0, 16, 1), "out.md"), commandLine);
        }

        [TestMethod]
        [DataRow(new[] { "--seed", "3" }, "No option named --seed", DisplayName = "an unknown option")]
        [DataRow(new[] { "report" }, "No option named report", DisplayName = "a word that isn't an option")]
        [DataRow(new[] { "--steps" }, "--steps needs a value", DisplayName = "an option without its value")]
        [DataRow(new[] { "--steps", "1", "--steps", "2" }, "--steps is given twice", DisplayName = "an option twice")]
        [DataRow(new[] { "--steps", "0" }, "--steps takes a whole number of at least 1", DisplayName = "no steps")]
        [DataRow(new[] { "--repeats", "0" }, "--repeats takes a whole number of at least 1", DisplayName = "no repeats")]
        [DataRow(new[] { "--warmup", "-1" }, "--warmup takes a whole number of at least 0", DisplayName = "a negative warmup")]
        [DataRow(new[] { "--steps", "1.5" }, "--steps takes a whole number", DisplayName = "a fraction")]
        public void Parse_WrongArguments_FailsNamingTheProblem(string[] args, string problem)
        {
            ArgumentException exception = Assert.ThrowsExactly<ArgumentException>(() => BenchmarkCommandLine.Parse(args));

            StringAssert.Contains(exception.Message, problem);
        }
    }
}
