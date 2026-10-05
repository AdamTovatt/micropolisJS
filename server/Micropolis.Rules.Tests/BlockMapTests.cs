/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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

namespace Micropolis.Rules.Tests
{
    [TestClass]
    public sealed class BlockMapTests
    {
        [TestMethod]
        [DataRow(1, 1, 1, 1)]
        [DataRow(120, 100, 2, 3000)]
        [DataRow(120, 100, 8, 195)]
        public void Constructor_GameMapSize_CoversItWithWholeBlocks(int gameMapWidth, int gameMapHeight, int blockSize, int entries)
        {
            BlockMap map = new BlockMap(gameMapWidth, gameMapHeight, blockSize, 0, 1);

            Assert.AreEqual(entries, map.Width * map.Height);
        }

        [TestMethod]
        public void Get_LoadedEntries_ReadsThemRowByRow()
        {
            // Three blocks wide and two high, each entry its own index
            BlockMap map = new BlockMap(3, 2, 1, 0, 5);
            SavedObject.ReadRoot("{\"entries\":[0,1,2,3,4,5]}", saved =>
            {
                map.Load(saved, "entries");
                return map;
            });

            Assert.AreEqual(1, map.Get(1, 0));
            Assert.AreEqual(map.Width, map.Get(0, 1));
            Assert.AreEqual(5, map.Get(2, 1));
        }

        // Set and got by world coordinates, on a map of three by three blocks of four tiles
        [TestMethod]
        public void WorldSet_TileInABlock_SetsTheBlock()
        {
            BlockMap map = new BlockMap(12, 12, 4, 0, 255);

            map.WorldSet(5, 1, 234);

            Assert.AreEqual(234, map.Get(1, 0));
        }

        [TestMethod]
        public void WorldGet_TileInABlock_ReadsTheBlock()
        {
            BlockMap map = new BlockMap(12, 12, 4, 0, 255);

            map.Set(0, 1, 234);

            Assert.AreEqual(234, map.WorldGet(2, 6));
        }

        [TestMethod]
        public void Clear_EntriesSet_SetsEveryEntryToZero()
        {
            BlockMap map = new BlockMap(12, 12, 4, 0, 255);
            map.Set(0, 1, 234);
            map.WorldSet(11, 11, 12);

            map.Clear();

            Assert.AreEqual(0, map.Get(0, 1));
            Assert.AreEqual(0, map.Get(2, 2));
        }
    }
}
