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
    /// <summary>
    /// The end-to-end playthrough's command log, as the game server recorded it and <c>e2e/goldenPlaythrough.json</c>
    /// holds it, replayed headless to each stage's checkpoint: the city the log alone rebuilds is the city each stage of
    /// the playthrough ended on. The log's own checkpoints are replayed with every other log's
    /// (<see cref="FixtureLogsTests"/> and <c>LogReplayTests</c>); a stage's checkpoint is not one of them, since a
    /// stage may end partway through the commands stamped with a step. Only C# checks the stage checkpoints, as #65
    /// decided when the playthrough moved onto the server.
    /// </summary>
    [TestClass]
    public sealed class GoldenPlaythroughTests
    {
        private static GoldenPlaythrough Committed()
        {
            return GoldenPlaythrough.Read(FixtureLogs.CommittedGoldenPlaythrough);
        }

        /// <summary>
        /// Replays the golden playthrough's log stage after stage, each from the city the stage before it reached, saved
        /// and loaded, as a load is transparent, and says where the first stage whose hash the replay doesn't reach
        /// differs, or null when every stage's does.
        /// </summary>
        private static string? FirstStageThatDiffers(GoldenPlaythrough golden)
        {
            LogStart start = golden.Log.Start;
            int step = 0;
            int commands = 0;

            foreach (StageCheckpoint stage in golden.Checkpoints)
            {
                List<LoggedCommand> entries = golden.Log.Entries.Skip(commands).Take(stage.Commands - commands)
                    .Select(entry => entry with { Step = entry.Step - step })
                    .ToList();
                Simulation city = LogReplay.Run(start, entries, [], stage.Step - step).City;
                string hash = StateHash.HashSavedState(city.Save());

                if (hash != stage.Hash)
                {
                    return $"Stage \"{stage.Stage}\" replays to state hash {hash}, but its checkpoint is {stage.Hash}";
                }

                start = new SaveStart(city.Save());
                step = stage.Step;
                commands = stage.Commands;
            }

            return null;
        }

        // The golden playthrough with one stage's checkpoint changed
        private static GoldenPlaythrough WithStage(GoldenPlaythrough golden, int index, Func<StageCheckpoint, StageCheckpoint> change)
        {
            return golden with { Checkpoints = golden.Checkpoints.Select((stage, i) => i == index ? change(stage) : stage).ToList() };
        }

        [TestMethod]
        public void Replay_GoldenPlaythrough_ReachesEveryStagesCheckpoint()
        {
            GoldenPlaythrough golden = Committed();

            Assert.IsNotEmpty(golden.Checkpoints);
            Assert.IsNull(FirstStageThatDiffers(golden));
        }

        // A stage pinned one command short, as a log that left a command out of the stage would be, names that stage
        [TestMethod]
        public void Replay_FirstStageOneCommandShort_NamesTheStage()
        {
            GoldenPlaythrough golden = WithStage(Committed(), 0, stage => stage with { Commands = stage.Commands - 1 });

            StringAssert.StartsWith(FirstStageThatDiffers(golden), $"Stage \"{golden.Checkpoints[0].Stage}\" replays to state hash ");
        }

        // Every stage is compared, the last as much as the first
        [TestMethod]
        public void Replay_LastStageHashChanged_NamesTheStage()
        {
            GoldenPlaythrough committed = Committed();
            int last = committed.Checkpoints.Count - 1;
            GoldenPlaythrough golden = WithStage(committed, last, stage => stage with { Hash = new string('0', 64) });

            StringAssert.StartsWith(FirstStageThatDiffers(golden), $"Stage \"{golden.Checkpoints[last].Stage}\" replays to state hash ");
        }

        [TestMethod]
        public void Read_GoldenPlaythroughWithAStageThatIsNone_ThrowsNamingTheFile()
        {
            using TemporaryDirectory directory = new TemporaryDirectory();
            string text = File.ReadAllText(FixtureLogs.CommittedGoldenPlaythrough);
            string path = directory.Write("goldenPlaythrough.json", text.Replace("\"commands\":4,", "\"commands\":-4,"));

            InvalidDataException exception = Assert.ThrowsExactly<InvalidDataException>(() => GoldenPlaythrough.Read(path));

            StringAssert.StartsWith(exception.Message, $"The golden playthrough {path} holds a stage checkpoint that isn't one");
        }
    }
}
