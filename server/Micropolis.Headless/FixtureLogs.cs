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
using Micropolis.SourceTree;

namespace Micropolis.Headless
{
    /// <summary>
    /// The logs the fixture tool writes: each fixture's and mid-run log, its checkpoints the state hashes its replay
    /// reaches, which is how every checkpoint is regenerated after a deliberate rule change, and the playthrough's,
    /// from its golden file, which the end-to-end run rewrites. The tool must write the committed logs byte for byte,
    /// which <c>FixtureLogsTests</c> checks.
    /// </summary>
    internal static class FixtureLogs
    {
        /// <summary>
        /// The end-to-end playthrough's log, which no script builds: the game server recorded it as the browser played,
        /// and the tool copies it from the golden playthrough.
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
        /// replay has matched every checkpoint. An <see cref="InvalidDataException"/> names the file when it is no
        /// golden playthrough (<see cref="GoldenPlaythrough.Read"/>), and a <see cref="ReplayDiffersException"/> asks
        /// for the playthrough to be pinned again when its log no longer replays.
        /// </summary>
        public static CommandLog CopyPlaythrough(string goldenPlaythrough)
        {
            CommandLog log = GoldenPlaythrough.Read(goldenPlaythrough).Log;

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
        /// starts from a save reading it from its log in <paramref name="directories"/>.
        /// </summary>
        public static CommandLog Build(Fixture fixture, ConformanceDirectories directories)
        {
            LogStart start = fixture.Start(directories);
            Replay replay = LogReplay.Run(start, fixture.Entries, fixture.CheckpointSteps, fixture.CheckpointSteps[^1]);
            return new CommandLog(fixture.Description, start, fixture.Entries, replay.Hashed);
        }
    }
}
