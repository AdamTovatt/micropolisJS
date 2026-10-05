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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The monster's way out of the river it rises from: the river doesn't kill it until it has been on land, and from
    /// then on does, as in the original.
    /// </summary>
    [TestClass]
    public sealed class MonsterSpriteTests
    {
        // A seed whose monster rises with its hot spot on the river, where the original's rule drowned it on its first
        // step
        private const uint RiverSeed = 8;

        // The damage counted is the tile the monster wrecks, under the pixel 8 east of its hot spot, changed by a step
        // that left its hot spot on land, since it wrecks the shore while its hot spot is still in the water too
        [TestMethod]
        public void Move_MonsterRisenOnTheRiver_ReachesLandAndDamagesATileThere()
        {
            Simulation city = Simulation.NewCity(RiverSeed, Level.Easy, Speed.Slow);
            city.SpriteManager.MakeMonster();
            Sprite monster = city.SpriteManager.GetSprite(SpriteType.Monster)!;
            Assert.IsTrue(SpriteUtils.IsWater(SpriteUtils.GetHotSpotTileValue(city.Map, monster)), "The monster rises with its hot spot on water.");
            bool reachedLand = false;
            bool damagedAshore = false;

            for (int step = 0; step < 3000 && monster.Frame != 0; step++)
            {
                int[] before = Tiles(city.Map);
                city.Step();

                int hotSpot = SpriteUtils.GetHotSpotTileValue(city.Map, monster);
                if (monster.Frame != 0 && hotSpot != -1 && !SpriteUtils.IsWater(hotSpot))
                {
                    reachedLand = true;
                    int x = (int)SpriteUtils.PixToWorld(monster.X + 48);
                    int y = (int)SpriteUtils.PixToWorld(monster.Y + 16);
                    damagedAshore |= city.Map.TestBounds(x, y) && city.Map.GetTileValue(x, y) != before[y * city.Map.Width + x];
                }
            }

            Assert.IsTrue(reachedLand, "The monster's hot spot was never on land while it lived.");
            Assert.IsTrue(monster.ReachedLand);
            Assert.IsTrue(damagedAshore, "The monster damaged no tile while its hot spot was on land.");
        }

        // Land is any tile but the water range, the river, its edges and the channel: one step on it is enough
        [TestMethod]
        [DataRow("the river", TileValues.RIVER, false)]
        [DataRow("a river edge", TileValues.REDGE, false)]
        [DataRow("the channel", TileValues.CHANNEL, false)]
        [DataRow("the last river edge", TileValues.LASTRIVEDGE, false)]
        [DataRow("dirt", TileValues.DIRT, true)]
        [DataRow("the first tree", TileValues.TREEBASE, true)]
        [DataRow("a bridge", TileValues.HBRIDGE, true)]
        public void Move_MonsterWithItsHotSpotOnATile_HasReachedLandIfItIsLand(string description, int tileValue, bool land)
        {
            Sprite monster = MonsterOn(tileValue, out Simulation city, reachedLand: false);

            city.Step();

            Assert.AreEqual(land, monster.ReachedLand, description);
        }

        // The original's rule, once the monster has been on land: back on the river while its count runs, it dies
        [TestMethod]
        public void Move_MonsterThatReachedLandStepsOntoTheRiver_Dies()
        {
            Sprite monster = MonsterInTheRiver(out Simulation city, reachedLand: true);

            city.Step();

            Assert.AreEqual(0, monster.Frame);
        }

        [TestMethod]
        public void Move_MonsterThatNeverReachedLandStepsOntoTheRiver_LivesOn()
        {
            Sprite monster = MonsterInTheRiver(out Simulation city, reachedLand: false);

            city.Step();

            Assert.AreNotEqual(0, monster.Frame);
            Assert.IsFalse(monster.ReachedLand);
        }

        // A monster sent back to the most polluted place by a second trigger is the same monster, still ashore
        [TestMethod]
        public void MakeMonster_MonsterAlreadyAshore_StaysAshore()
        {
            Sprite monster = MonsterInTheRiver(out Simulation city, reachedLand: true);

            city.SpriteManager.MakeMonster();

            Assert.AreSame(monster, city.SpriteManager.GetSprite(SpriteType.Monster));
            Assert.IsTrue(monster.ReachedLand);
        }

        // A monster restarted in the place of a dead one rises afresh, not yet ashore
        [TestMethod]
        public void MakeMonster_InThePlaceOfADeadMonsterAshore_HasNotReachedLand()
        {
            Sprite monster = MonsterInTheRiver(out Simulation city, reachedLand: true);
            monster.Frame = 0;

            city.SpriteManager.MakeMonster();

            Assert.AreSame(monster, city.SpriteManager.GetSprite(SpriteType.Monster));
            Assert.IsFalse(monster.ReachedLand);
        }

        private static Sprite MonsterInTheRiver(out Simulation city, bool reachedLand)
        {
            return MonsterOn(TileValues.RIVER, out city, reachedLand);
        }

        // A monster in the middle of a patch of the tile wide enough that its next step keeps its hot spot on it,
        // whichever way it goes, with its count running
        private static Sprite MonsterOn(int tileValue, out Simulation city, bool reachedLand)
        {
            city = Simulation.NewCity(new GameMap(120, 100), RiverSeed, Level.Easy, Speed.Slow);
            const int Middle = 50;

            for (int x = Middle - 5; x <= Middle + 5; x++)
            {
                for (int y = Middle - 5; y <= Middle + 5; y++)
                {
                    city.Map.SetTile(x, y, tileValue, TileFlags.NOFLAGS);
                }
            }

            SpriteTraits traits = Sprite.TraitsOf(SpriteType.Monster);
            Sprite monster = city.SpriteManager.MakeSprite(SpriteType.Monster, SpriteUtils.WorldToPix(Middle) - traits.XHot,
                SpriteUtils.WorldToPix(Middle) - traits.YHot);
            monster.ReachedLand = reachedLand;
            Assert.AreEqual(tileValue, SpriteUtils.GetHotSpotTileValue(city.Map, monster));
            Assert.AreNotEqual(0, monster.Count);
            return monster;
        }

        private static int[] Tiles(GameMap map)
        {
            return Enumerable.Range(0, map.Width * map.Height).Select(i => map.GetTileValue(i % map.Width, i / map.Width)).ToArray();
        }
    }
}
