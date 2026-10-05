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

using Micropolis.Conformance;
using Micropolis.Rules;
using static Micropolis.Headless.ConformanceText;

namespace Micropolis.Headless
{
    /// <summary>
    /// <c>conformance/events/</c>: every event the city emits as each log the tool writes is replayed, from its start
    /// to its last step, in the order emitted, each with the index of the step it came in, its name and its payload,
    /// unless it was emitted without one. A state hash never sees an event, so these pin what the players are told:
    /// the news, the advisors' messages, the command results and every record the city publishes.
    /// </summary>
    internal static class FixtureEvents
    {
        public const string FileExtension = ".events.json";

        public static string FilePath(ConformanceDirectories directories, string log)
        {
            return Path.Combine(directories.Events, $"{log}{FileExtension}");
        }

        /// <summary>
        /// The text of the events the log's replay emits.
        /// </summary>
        public static string Write(CommandLog log)
        {
            List<string> events = new List<string>();

            LogReplay.Run(log.Start, log.Entries, [], log.LastStep, (step, name, payload) =>
                events.Add(payload is null
                    ? $"{{\"step\":{step},\"name\":{Stringify(name)}}}"
                    : $"{{\"step\":{step},\"name\":{Stringify(name)},\"payload\":{Stringify(payload)}}}"));

            return JsonLines.FileOf(["{", .. JsonLines.ListMemberOfText("events", events, true), "}"]);
        }
    }
}
