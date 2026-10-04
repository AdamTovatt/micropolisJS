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

namespace Micropolis.Rules
{
    /// <summary>
    /// A replay's city where it ended, what came of each entry's command, in the log's order, and the state hash at each
    /// checkpoint step it reached.
    /// </summary>
    public sealed record Replay(Simulation City, IReadOnlyList<CommandResult> Results, IReadOnlyList<Checkpoint> Hashed);

    /// <summary>
    /// Replays a command log as the browser played it, as <c>replay</c> in <c>headless/runner.ts</c> does: before each
    /// step, the commands stamped with it, in the order listed, then the step. A checkpoint is taken after its step's
    /// commands, before the step itself. A paused city takes commands but never steps, so a log that steps one is not
    /// a log the game wrote, and fails, as does a city whose city time falls behind its steps
    /// (<see cref="CityTimeModel"/>).
    /// </summary>
    public static class LogReplay
    {
        /// <summary>
        /// Replays the entries from the start to step <paramref name="to"/>, after that step's commands, hashing the
        /// city at each of <paramref name="checkpointSteps"/> it reaches, which ascend.
        /// </summary>
        public static Replay Run(LogStart start, IReadOnlyList<LoggedCommand> entries, IReadOnlyList<int> checkpointSteps, int to)
        {
            Simulation city = StartCity(start);
            List<CommandResult> results = new List<CommandResult>();
            List<Checkpoint> hashed = new List<Checkpoint>();
            int entry = 0;
            int checkpoint = 0;
            int step = 0;

            void CheckpointAt(int at)
            {
                for (; checkpoint < checkpointSteps.Count && checkpointSteps[checkpoint] == at; checkpoint++)
                {
                    hashed.Add(new Checkpoint(at, StateHash.HashSavedState(city.Save())));
                }
            }

            for (; ; )
            {
                List<ReceivedCommand> received = new List<ReceivedCommand>();
                for (; entry < entries.Count && entries[entry].Step == step; entry++)
                {
                    received.Add(new ReceivedCommand(entries[entry].Player, entries[entry].Command?.DeepClone()));
                }

                results.AddRange(city.ApplyCommands(received));

                if (step >= to)
                {
                    CheckpointAt(step);
                    return new Replay(city, results, hashed);
                }

                if (city.IsPaused)
                {
                    throw new StepsFailedException($"The log steps a paused city at step {step}.");
                }

                int next = Math.Min(entry < entries.Count ? entries[entry].Step : int.MaxValue, to);

                CityTimeModel.TakeSteps(city, next - step, () =>
                {
                    CheckpointAt(step);
                    city.Step();
                    step++;
                });
            }
        }

        /// <summary>
        /// Replays the whole log, and the number of its checkpoints, each of which the replay matched, or an
        /// <see cref="InvalidDataException"/> naming the earliest that it didn't.
        /// </summary>
        public static (Replay Replay, int Matched) Verify(CommandLog log)
        {
            Replay replay = Run(log.Start, log.Entries, log.Checkpoints.Select(checkpoint => checkpoint.Step).ToList(), log.LastStep);

            for (int i = 0; i < log.Checkpoints.Count; i++)
            {
                if (replay.Hashed[i].Hash != log.Checkpoints[i].Hash)
                {
                    throw new InvalidDataException(
                        $"The state hash at step {log.Checkpoints[i].Step} differs: expected {log.Checkpoints[i].Hash}, was {replay.Hashed[i].Hash}.");
                }
            }

            return (replay, log.Checkpoints.Count);
        }

        /// <summary>
        /// The city a log starts from: a new city from a seed starts at medium speed, as in the browser.
        /// </summary>
        public static Simulation StartCity(LogStart start)
        {
            return start switch
            {
                SeedStart seed => Simulation.NewCity(seed.Seed, seed.Level, Speed.Medium),
                SaveStart save => Simulation.FromSave(CanonicalJson.Write(save.Save)),
                _ => throw new InvalidOperationException($"No log start {start.GetType().Name}."),
            };
        }
    }
}
