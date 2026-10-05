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

namespace Micropolis.Headless.Tests
{
    /// <summary>
    /// A directory of its own for a test's files, deleted with everything in it when the test disposes of it.
    /// </summary>
    internal sealed class TemporaryDirectory : IDisposable
    {
        public TemporaryDirectory()
        {
            Path = Directory.CreateTempSubdirectory("micropolis-headless-").FullName;
        }

        public string Path { get; }

        /// <summary>
        /// The directory as a root of conformance files.
        /// </summary>
        public ConformanceDirectories Conformance => new ConformanceDirectories(Path);

        /// <summary>
        /// A conformance root holding a copy of what the fixture tool reads and no tool writes, the committed logs and
        /// sample saves, and nothing else, for the tool to write to.
        /// </summary>
        public static TemporaryDirectory WithTheToolsInputs()
        {
            TemporaryDirectory directory = new TemporaryDirectory();
            ConformanceDirectories committed = ConformanceDirectories.Committed;
            ConformanceDirectories copy = directory.Conformance;

            CopyFiles(committed.Logs, copy.Logs);
            CopyFiles(committed.SaveVersions, copy.SaveVersions);
            return directory;
        }

        /// <summary>
        /// Every file under the directory, by its path from the directory, but the sample saves copied in.
        /// </summary>
        public IReadOnlyList<string> FilesBut(string excluded)
        {
            return Directory.GetFiles(Path, "*", SearchOption.AllDirectories)
                .Where(file => System.IO.Path.GetDirectoryName(file) != excluded)
                .Select(file => System.IO.Path.GetRelativePath(Path, file))
                .ToList();
        }

        /// <summary>
        /// Writes the text to the file at that path from here, making its directory, and returns its path.
        /// </summary>
        public string Write(string name, string text)
        {
            string path = System.IO.Path.Combine(Path, name);
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path)!);
            File.WriteAllText(path, text);
            return path;
        }

        public void Dispose()
        {
            Directory.Delete(Path, true);
        }

        private static void CopyFiles(string from, string to)
        {
            Directory.CreateDirectory(to);

            foreach (string file in Directory.GetFiles(from))
            {
                File.Copy(file, System.IO.Path.Combine(to, System.IO.Path.GetFileName(file)));
            }
        }
    }
}
