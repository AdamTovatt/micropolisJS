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
        /// A directory holding a copy of each committed log.
        /// </summary>
        public static TemporaryDirectory WithTheLogs()
        {
            TemporaryDirectory directory = new TemporaryDirectory();

            foreach (string file in Directory.GetFiles(Fixtures.CommittedLogs, $"*{CommandLog.FileExtension}"))
            {
                File.Copy(file, System.IO.Path.Combine(directory.Path, System.IO.Path.GetFileName(file)));
            }

            return directory;
        }

        /// <summary>
        /// Writes the text to the file of that name here, and returns its path.
        /// </summary>
        public string Write(string name, string text)
        {
            string path = System.IO.Path.Combine(Path, name);
            File.WriteAllText(path, text);
            return path;
        }

        public void Dispose()
        {
            Directory.Delete(Path, true);
        }
    }
}
