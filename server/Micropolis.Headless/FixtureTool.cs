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

using Micropolis.Conformance;
using Micropolis.Rules;

namespace Micropolis.Headless
{
    /// <summary>
    /// The fixture tool, <c>--write-fixtures</c>: regenerates everything the rules compute that the tests compare
    /// against, after a deliberate change to a fixture, to saved state or to a rule. It writes every log
    /// (<see cref="FixtureLogs"/>), every fixture's saves (<see cref="FixtureSaves"/>), the events of each log's replay
    /// (<see cref="FixtureEvents"/>), the conformance files the saves give (<see cref="ConformanceFiles"/>) and the
    /// sample saves migrated (<see cref="MigratedSaves"/>).
    /// </summary>
    internal static class FixtureTool
    {
        private const string Unfinished = ".writing";

        /// <summary>
        /// Every file the tool writes, by its path in <paramref name="files"/>' conformance directories. Each is built
        /// from what the directories hold before any is written, since a fixture that starts from a save reads it from
        /// its log there. The tool's inputs that no fixture builds, the golden playthrough's log and the sample saves,
        /// are read first, so one it refuses fails the run before it builds any fixture.
        /// </summary>
        public static IReadOnlyList<(string Path, string Text)> Build(HeadlessFiles files)
        {
            ConformanceDirectories directories = files.Conformance;
            CommandLog playthrough = FixtureLogs.CopyPlaythrough(files.GoldenPlaythrough);
            IReadOnlyList<(string Path, string Text)> migrated = MigratedSaves.Files(directories);
            IReadOnlyList<(string Name, CommandLog Log)> logs =
            [
                .. Fixtures.Logs.Select(fixture => (fixture.Name, FixtureLogs.Build(fixture, directories))),
                (FixtureLogs.Playthrough, playthrough),
            ];
            IReadOnlyList<FixtureSave> saves = FixtureSaves.BuildAll(directories);

            return
            [
                .. logs.Select(log => (Fixtures.LogPath(directories, log.Name), log.Log.Write())),
                .. saves.Select(save => (save.At.FilePath(directories), save.Text)),
                .. logs.Select(log => (FixtureEvents.FilePath(directories, log.Name), FixtureEvents.Write(log.Log))),
                .. ConformanceFiles.Files(directories, saves),
                .. migrated,
            ];
        }

        /// <summary>
        /// Builds every file, writes each beside its own and then moves it into place, so a file that fails to build
        /// or to write leaves every file as it was, and returns the paths written. Then it deletes any other file from
        /// the directories it alone writes, the logs, saves, events and migrated states, so a file it no longer writes,
        /// such as a renamed fixture's, goes.
        /// </summary>
        public static IReadOnlyList<string> WriteAll(HeadlessFiles files)
        {
            IReadOnlyList<(string Path, string Text)> built = Build(files);
            List<string> unfinished = new List<string>();

            try
            {
                foreach ((string path, string text) in built)
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                    unfinished.Add(path + Unfinished);
                    File.WriteAllText(path + Unfinished, text);
                }
            }
            catch
            {
                unfinished.ForEach(File.Delete);
                throw;
            }

            foreach ((string path, string _) in built)
            {
                File.Move(path + Unfinished, path, true);
            }

            HashSet<string> written = built.Select(file => Path.GetFullPath(file.Path)).ToHashSet(StringComparer.Ordinal);
            ConformanceDirectories directories = files.Conformance;

            foreach (string owned in new[] { directories.Logs, directories.Saves, directories.Events, directories.Migrated })
            {
                foreach (string stale in Directory.GetFiles(owned).Where(path => !written.Contains(Path.GetFullPath(path))))
                {
                    File.Delete(stale);
                }
            }

            return built.Select(file => file.Path).ToList();
        }
    }
}
