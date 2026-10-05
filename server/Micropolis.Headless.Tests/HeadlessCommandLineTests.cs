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

namespace Micropolis.Headless.Tests
{
    [TestClass]
    public sealed class HeadlessCommandLineTests
    {
        [TestMethod]
        public void Parse_SeedSpeedAndSteps_RunsTheCity()
        {
            HeadlessCommand command = HeadlessCommandLine.Parse(["--seed", "4294967295", "--speed", "fast", "--steps", "3000"]);

            Assert.AreEqual(new RunCity(new RunStart(uint.MaxValue, null, Speed.Fast), 3000), command);
        }

        [TestMethod]
        public void Parse_Fixture_RunsTheFixture()
        {
            HeadlessCommand command = HeadlessCommandLine.Parse(["--steps", "0", "--fixture", "town"]);

            Assert.AreEqual(new RunCity(new RunStart(null, "town", null), 0), command);
        }

        [TestMethod]
        public void Parse_LogAlone_ReplaysIt()
        {
            Assert.AreEqual(new ReplayLog("session.json"), HeadlessCommandLine.Parse(["--log", "session.json"]));
        }

        [TestMethod]
        public void Parse_WriteFixturesAlone_WritesThem()
        {
            Assert.AreEqual(new WriteFixtures(), HeadlessCommandLine.Parse(["--write-fixtures"]));
        }

        [TestMethod]
        [DataRow(new[] { "--seed", "1" }, "--steps is required", DisplayName = "no steps")]
        [DataRow(new[] { "--seed", "1", "--steps", "1.5" }, "--steps takes a whole number, got 1.5", DisplayName = "a fraction")]
        [DataRow(new[] { "--seed", "-1", "--steps", "1" }, "--seed takes a whole number, got -1", DisplayName = "a negative seed")]
        [DataRow(new[] { "--seed", "4294967296", "--steps", "1" }, "--seed takes a whole number up to 4294967295", DisplayName = "a seed past uint32")]
        [DataRow(new[] { "--seed", "1", "--steps", "9223372036854775808" }, "--steps takes a whole number up to 9223372036854775807", DisplayName = "steps past long")]
        [DataRow(new[] { "--seed", "1", "--steps", "1", "--speed", "paused" }, "--speed is one of slow, medium, fast, got paused", DisplayName = "paused")]
        [DataRow(new[] { "--log", "a.json", "--steps", "1" }, "--log takes no other option, got --steps", DisplayName = "a log with steps")]
        [DataRow(new[] { "--write-fixtures", "--seed", "1" }, "--write-fixtures takes no other option, got --seed", DisplayName = "writing with a seed")]
        [DataRow(new[] { "--seed" }, "--seed needs a value", DisplayName = "an option without its value")]
        [DataRow(new[] { "--seed", "1", "--seed", "2" }, "--seed is given twice", DisplayName = "an option twice")]
        [DataRow(new[] { "--level", "2" }, "No option --level", DisplayName = "an unknown option")]
        public void Parse_WrongArguments_FailsNamingTheProblem(string[] args, string problem)
        {
            ArgumentException exception = Assert.ThrowsExactly<ArgumentException>(() => HeadlessCommandLine.Parse(args));

            StringAssert.Contains(exception.Message, problem);
        }
    }
}
