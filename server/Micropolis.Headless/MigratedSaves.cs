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

using System.Text.Json.Nodes;
using Micropolis.Conformance;
using Micropolis.Rules;
using static Micropolis.Headless.ConformanceText;

namespace Micropolis.Headless
{
    /// <summary>
    /// <c>conformance/migrated/</c>: each sample save of <c>conformance/saveVersions/</c>, one or more of each version
    /// from <see cref="SavedGame.OldestVersion"/> on, migrated to the current version and loaded, as the canonical
    /// text of the state the city saves, under the sample's own file name.
    /// </summary>
    internal static class MigratedSaves
    {
        /// <summary>
        /// The sample saves in <paramref name="directories"/>' <c>saveVersions/</c>, by file name, in ordinal order.
        /// </summary>
        public static IReadOnlyList<string> Samples(ConformanceDirectories directories)
        {
            return Directory.GetFiles(directories.SaveVersions, "*.json")
                .Select(path => Path.GetFileName(path))
                .Order(StringComparer.Ordinal)
                .ToList();
        }

        /// <summary>
        /// The state the sample save of that file name migrates and loads to.
        /// </summary>
        public static string Migrate(ConformanceDirectories directories, string sample)
        {
            string text = File.ReadAllText(Path.Combine(directories.SaveVersions, sample));
            return CanonicalJson.Write(SavedGame.Load(text, out string _).Save());
        }

        /// <summary>
        /// Every sample's migrated state, by the path in <paramref name="directories"/>' <c>migrated/</c> it is written
        /// to. It fails unless the samples hold a save of every version migrated.
        /// </summary>
        public static IReadOnlyList<(string Path, string Text)> Files(ConformanceDirectories directories)
        {
            IReadOnlyList<string> samples = Samples(directories);
            HashSet<int> versions = samples.Select(sample => VersionOf(directories, sample)).ToHashSet();

            for (int version = SavedGame.OldestVersion; version <= SavedGame.CurrentVersion; version++)
            {
                EnsureCovers(versions.Contains(version), $"a sample save of version {version}");
            }

            return samples.Select(sample => (Path.Combine(directories.Migrated, sample), Migrate(directories, sample))).ToList();
        }

        // The version a sample save holds, which is a whole number
        private static int VersionOf(ConformanceDirectories directories, string sample)
        {
            if (JsonText.Parse(File.ReadAllText(Path.Combine(directories.SaveVersions, sample)))?["version"] is JsonValue value
                && value.TryGetValue(out double number) && number == Math.Floor(number))
            {
                return (int)number;
            }

            throw new InvalidDataException($"The sample save {sample} holds no whole version.");
        }
    }
}
