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
    /// Replays a conformance log through <see cref="LogReplay"/>, the replay the C# headless runner makes
    /// (<c>docs/command-log.md</c>): before each step, the commands stamped with it, in order, then the log's
    /// checkpoints at it, then the step.
    /// </summary>
    internal static class LogReplayer
    {
        /// <summary>
        /// Where the replay first differs from the log, or <see langword="null"/> when every checkpoint's state hash
        /// matches. A paused city never steps, so a log that has one step was not written by the game, and its replay
        /// differs there, as does one whose city time falls behind its steps.
        /// </summary>
        public static string? FirstDifference(ConformanceLog log)
        {
            try
            {
                LogReplay.Verify(log.Log);
                return null;
            }
            catch (Exception exception) when (exception is ReplayDiffersException or StepsFailedException)
            {
                return exception.Message;
            }
        }
    }
}
