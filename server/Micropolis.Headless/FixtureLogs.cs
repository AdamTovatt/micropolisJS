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

namespace Micropolis.Headless
{
    /// <summary>
    /// The fixture tool: builds each fixture's log, its checkpoints the state hashes its replay in C# reaches, and
    /// writes every log. While the TypeScript simulation exists, <c>npm run conformance</c> writes the committed logs
    /// and this tool must write the same, which <c>FixtureLogsTests</c> checks; once it is deleted, writing them here is
    /// how every checkpoint is regenerated after a deliberate rule change.
    /// </summary>
    internal static class FixtureLogs
    {
        /// <summary>
        /// The fixture's log, with the state hash its replay reaches at each of its checkpoint steps, a fixture that
        /// starts from a save reading it from its log in <paramref name="directory"/>.
        /// </summary>
        public static CommandLog Build(Fixture fixture, string directory)
        {
            LogStart start = fixture.Start(directory);
            Replay replay = LogReplay.Run(start, fixture.Entries, fixture.CheckpointSteps, fixture.CheckpointSteps[^1]);
            return new CommandLog(fixture.Description, start, fixture.Entries, replay.Hashed);
        }

        /// <summary>
        /// Builds every log, then writes each to its file in <paramref name="directory"/>, and returns the paths
        /// written. Every log is built before any is written, since a fixture that starts from a save reads it from its
        /// log there, and a log that fails to build leaves every file as it was.
        /// </summary>
        public static IReadOnlyList<string> WriteAll(string directory)
        {
            List<(string Path, string Text)> logs = Fixtures.Logs
                .Select(fixture => (Fixtures.LogPath(directory, fixture.Name), Build(fixture, directory).Write()))
                .ToList();

            foreach ((string path, string text) in logs)
            {
                File.WriteAllText(path, text);
            }

            return logs.Select(log => log.Path).ToList();
        }
    }
}
