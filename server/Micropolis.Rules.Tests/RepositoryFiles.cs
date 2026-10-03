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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// Files the C# and TypeScript tests share, read in place from the repository root the build recorded.
    /// </summary>
    internal static class RepositoryFiles
    {
        private static readonly string Root = typeof(RepositoryFiles).Assembly
            .GetCustomAttributes<AssemblyMetadataAttribute>()
            .Single(attribute => attribute.Key == "RepositoryRoot")
            .Value ?? throw new InvalidOperationException("The build recorded no repository root.");

        public static string GetPath(string relativePath)
        {
            string path = Path.Combine(Root, relativePath);

            if (!File.Exists(path) && !Directory.Exists(path))
            {
                throw new FileNotFoundException($"No shared test file at {path}.", path);
            }

            return path;
        }
    }
}
