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

using Micropolis.Rules;

namespace Micropolis.Conformance.Tests
{
    /// <summary>
    /// The fixtures by name, and the mid-run logs doing what they are for: each command they send partway through a
    /// run applies and changes the city.
    /// </summary>
    [TestClass]
    public sealed class FixturesTests
    {
        public static IEnumerable<object[]> MidRunLogs => Fixtures.MidRun.Select(log => new object[] { log.Name });

        public static IEnumerable<object[]> MidRunSteps => Fixtures.MidRun.SelectMany(
            log => log.Entries.Select(entry => entry.Step).Where(step => step > 0).Distinct().Select(step => new object[] { log.Name, step }));

        // A mid-run log is there for the commands it sends partway through, so one the city refused would pin nothing
        [TestMethod]
        [DynamicData(nameof(MidRunLogs))]
        public void Replay_MidRunLog_AppliesEveryCommand(string name)
        {
            Fixture log = Fixtures.MidRun.Single(candidate => candidate.Name == name);

            Replay replay = LogReplay.Run(log.Start(ConformanceDirectories.Committed), log.Entries, [], log.CheckpointSteps[^1]);

            CollectionAssert.AreEqual(log.Entries.Select(_ => Outcome.Ok).ToList(), replay.Results.Select(result => result.Outcome).ToList());
        }

        // Its checkpoint at the step is after the step's commands, so it pins them only when they change the city
        [TestMethod]
        [DynamicData(nameof(MidRunSteps))]
        public void Replay_MidRunLogStepsCommands_ChangeTheCity(string name, long step)
        {
            Fixture log = Fixtures.MidRun.Single(candidate => candidate.Name == name);
            LogStart start = log.Start(ConformanceDirectories.Committed);

            Replay before = LogReplay.Run(start, log.Entries.Where(entry => entry.Step < step).ToList(), [step], step);
            Replay after = LogReplay.Run(start, log.Entries.Where(entry => entry.Step <= step).ToList(), [step], step);

            Assert.AreNotEqual(before.Hashed[0].Hash, after.Hashed[0].Hash);
        }

        [TestMethod]
        public void Named_UnknownFixture_ThrowsListingTheFixtures()
        {
            ArgumentException exception = Assert.ThrowsExactly<ArgumentException>(() => Fixtures.Named("metropolis"));

            StringAssert.Contains(exception.Message, "No fixture named metropolis: the fixtures are broke, disasters");
        }
    }
}
