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

using System.Text.Json;
using Micropolis.Rules;
using Micropolis.SourceTree;

namespace Micropolis.Headless
{
    /// <summary>
    /// The fixture tool: builds each fixture's log, its checkpoints the state hashes its replay in C# reaches, and
    /// writes every log. While the TypeScript simulation exists, <c>npm run conformance</c> writes the committed logs
    /// and this tool must write the same, which <c>FixtureLogsTests</c> checks; once it is deleted, writing them here is
    /// how every fixture's checkpoints are regenerated after a deliberate rule change. The playthrough's come from its
    /// golden file, which the end-to-end run rewrites.
    /// </summary>
    internal static class FixtureLogs
    {
        /// <summary>
        /// The end-to-end playthrough's log, which no script builds: the browser recorded it, and the tool copies it from
        /// the golden playthrough, as the generator does.
        /// </summary>
        public const string Playthrough = "playthrough";

        /// <summary>
        /// The committed golden playthrough, which <c>npm run e2e:golden</c> rewrites.
        /// </summary>
        public static string CommittedGoldenPlaythrough => RepositoryFiles.GetPath("e2e/goldenPlaythrough.json");

        /// <summary>
        /// Every log the tool writes: each fixture's and mid-run log, then the playthrough's.
        /// </summary>
        public static IReadOnlyList<string> Names => [.. Fixtures.Logs.Select(fixture => fixture.Name), Playthrough];

        /// <summary>
        /// The playthrough's log, as the golden playthrough at <paramref name="goldenPlaythrough"/> holds it, once its
        /// replay has matched every checkpoint, as the generator checks it. An <see cref="InvalidDataException"/> names
        /// the file when it holds no log, and a <see cref="ReplayDiffersException"/> asks for the playthrough to be
        /// pinned again when its log no longer replays.
        /// </summary>
        public static CommandLog CopyPlaythrough(string goldenPlaythrough)
        {
            CommandLog log;

            try
            {
                log = CommandLog.Read(JsonText.Parse(File.ReadAllText(goldenPlaythrough))?["log"]);
            }
            catch (JsonException exception)
            {
                throw new InvalidDataException($"The golden playthrough {goldenPlaythrough} is not JSON: {exception.Message}");
            }
            catch (InvalidDataException exception)
            {
                throw new InvalidDataException($"The golden playthrough {goldenPlaythrough} holds no log: {exception.Message}");
            }

            try
            {
                LogReplay.Verify(log);
            }
            catch (Exception exception) when (exception is ReplayDiffersException or StepsFailedException)
            {
                throw new ReplayDiffersException(
                    $"The golden playthrough's log does not replay: re-pin the playthrough with npm run e2e:golden first. {exception.Message}");
            }

            return log;
        }

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
        /// Builds every log, the playthrough's copied from <paramref name="goldenPlaythrough"/>, then writes each to its
        /// file in <paramref name="directory"/>, and returns the paths written. Every log is built before any is
        /// written, since a fixture that starts from a save reads it from its log there, and a log that fails to build
        /// leaves every file as it was.
        /// </summary>
        public static IReadOnlyList<string> WriteAll(string directory, string goldenPlaythrough)
        {
            List<(string Path, string Text)> logs = Fixtures.Logs
                .Select(fixture => (Fixtures.LogPath(directory, fixture.Name), Build(fixture, directory).Write()))
                .Append((Fixtures.LogPath(directory, Playthrough), CopyPlaythrough(goldenPlaythrough).Write()))
                .ToList();

            foreach ((string path, string text) in logs)
            {
                File.WriteAllText(path, text);
            }

            return logs.Select(log => log.Path).ToList();
        }
    }
}
