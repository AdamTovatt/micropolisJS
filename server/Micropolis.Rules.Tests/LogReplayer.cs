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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// Replays a command log in C# as <c>replay</c> in <c>headless/runner.ts</c> does (<c>docs/command-log.md</c>):
    /// before each step, the commands stamped with it, in order, then the log's checkpoints at it, then the step.
    /// </summary>
    internal static class LogReplayer
    {
        /// <summary>
        /// Where the replay first differs from the log, or <see langword="null"/> when every checkpoint's state hash
        /// matches. A paused city never steps, so a log that has one step was not written by the game, and its replay
        /// differs there.
        /// </summary>
        public static string? FirstDifference(ConformanceLog log)
        {
            Simulation city = StartCity(log);
            int entry = 0;
            int checkpoint = 0;

            for (int step = 0; ; step++)
            {
                List<ReceivedCommand> received = new List<ReceivedCommand>();
                for (; entry < log.Entries.Count && log.Entries[entry].Step == step; entry++)
                {
                    received.Add(new ReceivedCommand(log.Entries[entry].Player, log.Entries[entry].Command));
                }

                city.ApplyCommands(received);

                for (; checkpoint < log.Checkpoints.Count && log.Checkpoints[checkpoint].Step == step; checkpoint++)
                {
                    string hash = StateHash.HashSavedState(city.Save());

                    if (hash != log.Checkpoints[checkpoint].Hash)
                    {
                        return $"The state hash at step {step} differs: expected {log.Checkpoints[checkpoint].Hash}, was {hash}.";
                    }
                }

                if (step >= log.LastStep)
                {
                    return null;
                }

                if (city.IsPaused)
                {
                    return $"The log steps a paused city at step {step}.";
                }

                city.Step();
            }
        }

        // The city the log starts from: a new city on the seed's map at its level and at medium speed, as a new game
        // starts, or its saved state
        private static Simulation StartCity(ConformanceLog log)
        {
            if (log.Seed is uint seed)
            {
                return Simulation.NewCity(seed, log.GameLevel!.Value, Speed.Medium);
            }

            return Simulation.FromSave(CanonicalJson.Write(log.Save));
        }
    }
}
