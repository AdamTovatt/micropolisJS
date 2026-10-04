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

using System.Reflection;

namespace Micropolis.SourceTree
{
    /// <summary>
    /// Files of the repository the build was made in, such as those the C# and TypeScript tests share, read in place
    /// from the root the build recorded.
    /// </summary>
    public static class RepositoryFiles
    {
        public static readonly string Root = typeof(RepositoryFiles).Assembly
            .GetCustomAttributes<AssemblyMetadataAttribute>()
            .Single(attribute => attribute.Key == "RepositoryRoot")
            .Value ?? throw new InvalidOperationException("The build recorded no repository root.");

        /// <summary>
        /// The full path of a file or directory, given relative to the repository root.
        /// </summary>
        /// <exception cref="FileNotFoundException">Nothing is at that path.</exception>
        public static string GetPath(string relativePath)
        {
            string path = Path.Combine(Root, relativePath);

            if (!File.Exists(path) && !Directory.Exists(path))
            {
                throw new FileNotFoundException($"No file or directory at {path}.", path);
            }

            return path;
        }
    }
}
