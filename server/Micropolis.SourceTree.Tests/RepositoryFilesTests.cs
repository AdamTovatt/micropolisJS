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

namespace Micropolis.SourceTree.Tests
{
    [TestClass]
    public sealed class RepositoryFilesTests
    {
        [TestMethod]
        public void Root_Always_IsTheDirectoryHoldingTheSolution()
        {
            Assert.IsTrue(File.Exists(Path.Combine(RepositoryFiles.Root, "server", "Micropolis.slnx")));
        }

        [TestMethod]
        public void GetPath_File_ReturnsItsFullPath()
        {
            Assert.AreEqual(Path.Combine(RepositoryFiles.Root, "package.json"), RepositoryFiles.GetPath("package.json"));
        }

        [TestMethod]
        public void GetPath_Directory_ReturnsItsFullPath()
        {
            Assert.AreEqual(Path.Combine(RepositoryFiles.Root, "conformance"), RepositoryFiles.GetPath("conformance"));
        }

        [TestMethod]
        public void GetPath_NothingThere_Throws()
        {
            FileNotFoundException exception = Assert.ThrowsExactly<FileNotFoundException>(() => RepositoryFiles.GetPath("no-such-file"));

            Assert.AreEqual(Path.Combine(RepositoryFiles.Root, "no-such-file"), exception.FileName);
        }
    }
}
