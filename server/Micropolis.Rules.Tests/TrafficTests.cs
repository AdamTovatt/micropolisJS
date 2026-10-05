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

using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// What of the traffic the fixtures' cities need not reach: the helicopter, where a drive that takes a block to its
    /// heaviest traffic and then draws 0 from five points the helicopter at the block; the farthest a drive goes; and
    /// the tiles at and just past each end of a destination's range.
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

        // Traffic one drive takes past the heaviest a block holds
        private const int HeavyTraffic = Traffic.MaxTrafficDensity - Traffic.TripTraffic + 10;

        [TestMethod]
        public void MakeTraffic_TrafficCappedAndADrawOfZero_PointsTheHelicopterAtTheBlock()
        {
            (Sprite helicopter, _) = Drive(SeedWhoseFirstDraw(draw => draw == 0));

            Assert.AreEqual(((long)RoadX << 4, (long)ArrivalY << 4), (helicopter.DestX, helicopter.DestY));
        }

        [TestMethod]
        public void MakeTraffic_TrafficCappedAndADrawOfMoreThanZero_LeavesTheHelicopterAlone()
        {
            (Sprite helicopter, (long, long) destination) = Drive(SeedWhoseFirstDraw(draw => draw != 0));

            Assert.AreEqual(destination, (helicopter.DestX, helicopter.DestY));
        }

        // A drive goes thirty moves at most: along a straight road, which draws nothing, it arrives at a destination
        // beside its thirtieth move's tile, and never at one beside its thirty-first
        [TestMethod]
        [DataRow(30, TrafficResult.RouteFound)]
        [DataRow(31, TrafficResult.NoRouteFound)]
        public void MakeTraffic_DestinationBesideTheMoveGiven_ArrivesWithinThirtyMovesOnly(int moves, TrafficResult expected)
        {
            const int zoneY = 50;
            GameMap map = new GameMap(120, 100);
            // From the zone's first perimeter tile north, a tile for each move, then the destination
            for (int i = 0; i <= moves; i++)
            {
                map.SetTile(RoadX, zoneY - 2 - i, ROADS, 0);
            }
            map.SetTile(RoadX, zoneY - 3 - moves, COMBASE, 0);

            TrafficResult result = new Traffic(map, new SpriteManager(map, RandomStream.FromSeed(0)), RandomStream.FromSeed(0))
                .MakeTraffic(ZoneX, zoneY, new BlockMaps(map.Width, map.Height), TrafficDestination.Commercial);

            Assert.AreEqual(expected, result);
        }

        [TestMethod]
        [DataRow("commercial", COMBASE - 1, false)]
        [DataRow("commercial", COMBASE, true)]
        [DataRow("commercial", NUCLEAR, true)]
        [DataRow("commercial", NUCLEAR + 1, false)]
        [DataRow("industrial", LHTHR - 1, false)]
        [DataRow("industrial", LHTHR, true)]
        [DataRow("industrial", PORT, true)]
        [DataRow("industrial", PORT + 1, false)]
        [DataRow("residential", LHTHR - 1, false)]
        [DataRow("residential", LHTHR, true)]
        [DataRow("residential", COMBASE, true)]
        [DataRow("residential", COMBASE + 1, false)]
        public void Contains_TileAtOrJustPastAnEnd_IsInsideOnlyAtTheEnd(string destination, int tileValue, bool inside)
        {
            TrafficDestination range = destination switch
            {
                "commercial" => TrafficDestination.Commercial,
                "industrial" => TrafficDestination.Industrial,
                _ => TrafficDestination.Residential,
            };

            Assert.AreEqual(inside, range.Contains(tileValue));
        }

        // The helicopter after the drive, from a city whose stream is seeded with the seed, and its destination before it
        private static (Sprite Helicopter, (long, long) Destination) Drive(uint seed)
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(RoadX, ZoneY - 2, ROADS, 0);
            map.SetTile(RoadX, ZoneY - 3, ROADS, 0);
            map.SetTile(RoadX, ArrivalY, ROADS, 0);
            map.SetTile(RoadX, ArrivalY - 1, COMBASE, 0);

            // A live helicopter, made from a stream of the sprite manager's own, so the drive's stream is the seed's alone
            SpriteManager spriteManager = new SpriteManager(map, RandomStream.FromSeed(0));
            spriteManager.GenerateCopter(0, 0);
            Sprite helicopter = spriteManager.GetSprite(SpriteType.Helicopter)!;
            (long, long) destination = (helicopter.DestX, helicopter.DestY);
            BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);
            blockMaps.TrafficDensityMap.WorldSet(RoadX, ArrivalY, HeavyTraffic);

            TrafficResult result = new Traffic(map, spriteManager, RandomStream.FromSeed(seed))
                .MakeTraffic(ZoneX, ZoneY, blockMaps, TrafficDestination.Industrial);

            Assert.AreEqual(TrafficResult.RouteFound, result);
            Assert.AreEqual(Traffic.MaxTrafficDensity, blockMaps.TrafficDensityMap.WorldGet(RoadX, ArrivalY));
            return (helicopter, destination);
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
