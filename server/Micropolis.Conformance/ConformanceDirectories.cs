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

using Micropolis.SourceTree;

namespace Micropolis.Conformance
{
    /// <summary>
    /// Where the conformance files are, under a root: the committed <c>conformance/</c> of the repository, or a
    /// directory a test has the fixture tool write to. Every path to a conformance file is built here.
    /// </summary>
    public sealed record ConformanceDirectories(string Root)
    {
        /// <summary>
        /// The committed conformance files' root, from the repository root.
        /// </summary>
        public const string CommittedRoot = "conformance";

        public static ConformanceDirectories Committed => new ConformanceDirectories(RepositoryFiles.GetPath(CommittedRoot));

        /// <summary>
        /// The fixtures' and mid-run command logs.
        /// </summary>
        public string Logs => Path.Combine(Root, "logs");

        /// <summary>
        /// The fixtures' saves as built and after their runs.
        /// </summary>
        public string Saves => Path.Combine(Root, "saves");

        /// <summary>
        /// The events each log's replay emits.
        /// </summary>
        public string Events => Path.Combine(Root, "events");

        /// <summary>
        /// The sample saves of each save version, which no tool writes.
        /// </summary>
        public string SaveVersions => Path.Combine(Root, "saveVersions");

        /// <summary>
        /// The state each sample save migrates and loads to.
        /// </summary>
        public string Migrated => Path.Combine(Root, "migrated");

        /// <summary>
        /// A file at the root, such as <c>commands.json</c>.
        /// </summary>
        public string File(string name)
        {
            return Path.Combine(Root, name);
        }
    }
}
