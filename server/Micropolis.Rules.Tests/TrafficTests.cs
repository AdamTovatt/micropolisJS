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

using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The traffic helicopter, which the unit snapshots cannot reach, since they are recorded from cities with no
    /// sprites: as <c>test/traffic.ts</c> has it, a drive that takes a block to its heaviest traffic and then draws 0
    /// from five points the helicopter at the block.
    /// </summary>
    [TestClass]
    public sealed class TrafficTests
    {
        // The zone the drive starts from. The first tile of its perimeter, one west and two north of its centre, is the
        // foot of a road running north for three tiles, the last beside a commercial tile: a drive with no junction,
        // which draws nothing on the way, and arrives on its second move, counting the tile it arrives on.
        private const int ZoneX = 10;
        private const int ZoneY = 10;
        private const int RoadX = ZoneX - 1;
        private const int ArrivalY = ZoneY - 4;

        // Traffic one drive takes past the heaviest a block holds, 240
        private const int HeavyTraffic = 200;

        [TestMethod]
        public void MakeTraffic_TrafficCappedAndADrawOfZero_PointsTheHelicopterAtTheBlock()
        {
            Sprite helicopter = Drive(SeedWhoseFirstDraw(draw => draw == 0));

            Assert.AreEqual(((long)RoadX << 4, (long)ArrivalY << 4), (helicopter.DestX, helicopter.DestY));
        }

        [TestMethod]
        public void MakeTraffic_TrafficCappedAndADrawOfMoreThanZero_LeavesTheHelicopterAlone()
        {
            Sprite helicopter = Drive(SeedWhoseFirstDraw(draw => draw != 0));

            Assert.AreEqual((0L, 0L), (helicopter.DestX, helicopter.DestY));
        }

        // The helicopter after the drive, from a city whose stream is seeded with the seed
        private static Sprite Drive(uint seed)
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(RoadX, ZoneY - 2, ROADS, 0);
            map.SetTile(RoadX, ZoneY - 3, ROADS, 0);
            map.SetTile(RoadX, ArrivalY, ROADS, 0);
            map.SetTile(RoadX, ArrivalY - 1, COMBASE, 0);

            // A live helicopter: frame 0 is a sprite that has died
            Sprite helicopter = new Sprite { Type = SpriteType.Helicopter, Frame = 1 };
            SpriteManager spriteManager = new SpriteManager(map) { SpriteList = [helicopter] };
            BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);
            blockMaps.TrafficDensityMap.WorldSet(RoadX, ArrivalY, HeavyTraffic);

            TrafficResult result = new Traffic(map, spriteManager, RandomStream.FromSeed(seed))
                .MakeTraffic(ZoneX, ZoneY, blockMaps, TrafficDestination.Industrial);

            Assert.AreEqual(TrafficResult.RouteFound, result);
            Assert.AreEqual(240, blockMaps.TrafficDensityMap.WorldGet(RoadX, ArrivalY));
            return helicopter;
        }

        // The first seed whose stream's first draw from five passes the test
        private static uint SeedWhoseFirstDraw(Func<int, bool> test)
        {
            uint seed = 1;
            while (!test(RandomStream.FromSeed(seed).GetRandom(5)))
            {
                seed++;
            }

            return seed;
        }
    }
}
