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

using static Micropolis.Rules.TileFlags;
using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The drawbridge as doBridge in the original's simulate.cpp opens and closes it, and the walkway across it, which
    /// an opening leaves dormant and a bridge decaying to water clears, with no ship near but where a test
    /// places one, and as a ship opens it, with roads funded in full, on a stream whose first draw is the one chance in 8
    /// that opens a bridge or in 4 that closes one.
    /// </summary>
    [TestClass]
    public sealed class RoadTests
    {
        // The bridge's tile the scan finds, on open land east of the suburb
        private const int X = 110;
        private const int Y = 20;

        // The simulation stream of this seed draws a 16-bit value whose low three bits are 0 first
        private const uint OpeningSeed = 10;

        // A road across a channel running north to south, wider than the bridge, its tiles showing light traffic: the raw
        // value of each tile, value and flags, by its offset from the bridge's tile the scan finds
        private static readonly (int Dx, int Dy, int Raw)[] ClosedHorizontal =
        [
            (-2, -1, CHANNEL), (-1, -1, CHANNEL), (0, -1, CHANNEL), (1, -1, CHANNEL), (2, -1, CHANNEL),
            (-2, 0, LTRFBASE | BULLBIT | ANIMBIT), (-1, 0, LTRFBASE | BULLBIT | ANIMBIT), (0, 0, LTRFBASE | BULLBIT | ANIMBIT),
            (1, 0, LTRFBASE | BULLBIT | ANIMBIT), (2, 0, LTRFBASE | BULLBIT | ANIMBIT),
        ];

        private static readonly (int Dx, int Dy, int Raw)[] OpenHorizontal =
        [
            (-2, -1, HBRDG1 | BULLBIT), (-1, -1, CHANNEL), (0, -1, CHANNEL), (1, -1, CHANNEL), (2, -1, HBRDG3 | BULLBIT),
            (-2, 0, HBRDG0 | BULLBIT), (-1, 0, RIVER), (0, 0, BRWH | BULLBIT), (1, 0, RIVER), (2, 0, HBRDG2 | BULLBIT),
        ];

        // A plain bridge across a river running north to south, with no channel
        private static readonly (int Dx, int Dy, int Raw)[] OverTheRiver =
        [
            (-2, -1, RIVER), (-1, -1, RIVER), (0, -1, RIVER), (1, -1, RIVER), (2, -1, RIVER),
            (-2, 0, HBRIDGE | BULLBIT), (-1, 0, HBRIDGE | BULLBIT), (0, 0, HBRIDGE | BULLBIT), (1, 0, HBRIDGE | BULLBIT),
            (2, 0, HBRIDGE | BULLBIT),
        ];

        // A plain bridge across a channel running east to west, and the same bridge open
        private static readonly (int Dx, int Dy, int Raw)[] ClosedVertical =
        [
            (0, -2, VBRIDGE | BULLBIT), (1, -2, CHANNEL), (0, -1, VBRIDGE | BULLBIT), (0, 0, VBRIDGE | BULLBIT),
            (1, 0, CHANNEL), (0, 1, VBRIDGE | BULLBIT), (0, 2, VBRIDGE | BULLBIT), (1, 2, CHANNEL),
        ];

        private static readonly (int Dx, int Dy, int Raw)[] OpenVertical =
        [
            (0, -2, VBRDG0 | BULLBIT), (1, -2, VBRDG1 | BULLBIT), (0, -1, RIVER), (0, 0, BRWV | BULLBIT),
            (1, 0, CHANNEL), (0, 1, RIVER), (0, 2, VBRDG2 | BULLBIT), (1, 2, VBRDG3 | BULLBIT),
        ];

        [TestMethod]
        public void RoadFound_ClosedHorizontalDrawbridge_OpensOverTheChannelLeavingWaterWithNoFlags()
        {
            Simulation city = CityWith(ClosedHorizontal);

            Scan(city);

            CollectionAssert.AreEqual(OpenHorizontal, RawTiles(city, OpenHorizontal));
        }

        [TestMethod]
        public void RoadFound_ClosedVerticalDrawbridge_OpensOverAChannelRunningEastToWest()
        {
            Simulation city = CityWith(ClosedVertical);

            Scan(city);

            CollectionAssert.AreEqual(OpenVertical, RawTiles(city, OpenVertical));
        }

        [TestMethod]
        public void RoadFound_OpenHorizontalDrawbridge_ClosesIntoAPlainBridgeBetweenRiverBanks()
        {
            Simulation city = CityWith(OpenHorizontal);

            Scan(city);

            (int, int, int)[] expected =
            [
                (-2, -1, RIVER), (-1, -1, CHANNEL), (0, -1, CHANNEL), (1, -1, CHANNEL), (2, -1, RIVER),
                (-2, 0, HBRIDGE | BULLBIT), (-1, 0, HBRIDGE | BULLBIT), (0, 0, HBRIDGE | BULLBIT), (1, 0, HBRIDGE | BULLBIT),
                (2, 0, HBRIDGE | BULLBIT),
            ];
            CollectionAssert.AreEqual(expected, RawTiles(city, OpenHorizontal));
        }

        [TestMethod]
        public void RoadFound_OpenVerticalDrawbridge_ClosesIntoAPlainBridgeBetweenRiverBanks()
        {
            Simulation city = CityWith(OpenVertical);

            Scan(city);

            (int, int, int)[] expected =
            [
                (0, -2, VBRIDGE | BULLBIT), (1, -2, RIVER), (0, -1, VBRIDGE | BULLBIT), (0, 0, VBRIDGE | BULLBIT),
                (1, 0, CHANNEL), (0, 1, VBRIDGE | BULLBIT), (0, 2, VBRIDGE | BULLBIT), (1, 2, RIVER),
            ];
            CollectionAssert.AreEqual(expected, RawTiles(city, OpenVertical));
        }

        [TestMethod]
        public void RoadFound_OpenDrawbridge_ClosesOverOnlyItsOwnTiles()
        {
            Simulation city = CityWith([.. OpenHorizontal.Skip(1), (-2, -1, CHANNEL)]);

            Scan(city);

            Assert.AreEqual(CHANNEL, city.Map.GetTile(X - 2, Y - 1).GetRawValue());
        }

        // Over the river rather than the channel, the draw that opens a bridge over the channel at random opens nothing
        [TestMethod]
        public void RoadFound_ClosedBridgeOverTheRiverWithNoShipNear_StaysClosed()
        {
            Simulation city = CityWith(OverTheRiver);

            Scan(city);

            CollectionAssert.AreEqual(OverTheRiver, RawTiles(city, OverTheRiver));
        }

        // Over the river, the scan of none of a bridge's tiles opens it, though a ship is near: the ship opens the bridge
        // it sails through itself, centred on the tile it sails through
        [TestMethod]
        [DataRow(-2)]
        [DataRow(-1)]
        [DataRow(0)]
        [DataRow(1)]
        [DataRow(2)]
        public void RoadFound_ClosedBridgeOverTheRiverWithAShipNear_StaysClosed(int dx)
        {
            Simulation city = CityWith(OverTheRiver);
            city.SpriteManager.MakeShipHere(X, Y - 1);

            Road.RoadFound(city.Map, X + dx, Y, city.ConstructSimData());

            CollectionAssert.AreEqual(OverTheRiver, RawTiles(city, OverTheRiver));
        }

        // A ship opens a bridge only around the middle tile of a closed bridge's five in a line, with water at the two
        // corners the open bridge's raised ends take, so the bridge writes only itself and that water
        [TestMethod]
        [DataRow(0, RIVER, true)]
        [DataRow(0, REDGE, true)]
        [DataRow(-1, RIVER, false)]
        [DataRow(1, RIVER, false)]
        [DataRow(0, DIRT, false)]
        [DataRow(0, ROADS, false)]
        public void OpensForShip_BridgeTileOverTheRiver_OnlyTheMiddleOfFiveWithWaterAtTheCorners(int dx, int corner, bool opens)
        {
            Simulation city = CityWith(OverTheRiver);
            city.Map.GetTile(X + 2, Y - 1).SetRawValue(corner);

            Assert.AreEqual(opens, Road.OpensForShip(city.Map, X + dx, Y));
        }

        // A bridge a ship opened over the river closes once every ship is more than four tiles' pixels from it, so a ship
        // docked nearby leaves the road whole: a ship 3 tiles north is 63 pixels away, and one 4 tiles north 79
        [TestMethod]
        [DataRow(3, false)]
        [DataRow(4, true)]
        public void RoadFound_BridgeAShipOpenedOverTheRiver_ClosesOnceTheShipIsFourTilesAway(int tilesNorth, bool closes)
        {
            Simulation city = CityWith(OverTheRiver);
            Road.OpenForShip(city.Map, X, Y);
            city.SpriteManager.MakeShipHere(X, Y - tilesNorth);

            Scan(city);

            Assert.AreEqual(closes ? HBRIDGE : BRWH, city.Map.GetTileValue(X, Y));
        }

        // The channel's bridges wait for a ship to be 340 pixels away, as the original's do
        [TestMethod]
        public void RoadFound_OpenBridgeOverTheChannelWithAShipFourTilesAway_StaysOpen()
        {
            Simulation city = CityWith(OpenHorizontal);
            city.SpriteManager.MakeShipHere(X, Y - 4);

            Scan(city);

            Assert.AreEqual(BRWH, city.Map.GetTileValue(X, Y));
        }

        // A path across a bridge a ship opened lies dormant on the water and the raised ends the opening wrote over the
        // bridge's road: the map scan clears none of it, though none of it is usable there, so the city sends none and
        // the router walks none, but on the open bridge's middle, which is road; once the bridge closes, it is whole
        [TestMethod]
        public void MapScan_PathOverABridgeAShipOpened_LiesDormantUntilTheBridgeCloses()
        {
            Simulation city = CityWith(OverTheRiver);
            int path = Ground.Walkway(3, 4, 5);
            for (int dx = -2; dx <= 2; dx++)
            {
                city.Map.SetWalkway(X + dx, Y, path);
            }

            Road.OpenForShip(city.Map, X, Y);
            // Every tile of the bridge but its middle, whose scan would close it
            city.MapScanner.MapScan(X - 2, X, city.ConstructSimData());
            city.MapScanner.MapScan(X + 1, X + 3, city.ConstructSimData());

            CollectionAssert.AreEqual(new[] { path, path, path, path, path }, OnBridge(city.Map.GetWalkway));
            CollectionAssert.AreEqual(new[] { 0, 0, path, 0, 0 }, OnBridge(UsableWalkway(city)));

            Scan(city);

            Assert.AreEqual(HBRIDGE, city.Map.GetTileValue(X, Y));
            CollectionAssert.AreEqual(new[] { path, path, path, path, path }, OnBridge(UsableWalkway(city)));
        }

        // A bridge the roads' decay turns into water is water for good, so the decay clears what walkway water doesn't
        // take, the path, and keeps the footbridge, which water does
        [TestMethod]
        public void RoadFound_BridgeDecayingWithAPathAndAFootbridge_KeepsOnlyTheFootbridge()
        {
            Simulation city = CityWith(OverTheRiver);
            city.Budget.RoadEffect = 0;
            // A stream whose first draw is the one chance in 512 that wears a road, and whose second wears it at no
            // funding
            uint decaying = Enumerable.Range(0, 100_000).Select(seed => (uint)seed).First(seed =>
            {
                RandomStream stream = RandomStream.SimulationStream(seed);
                return stream.GetChance(511) && (stream.GetRandom16() & 31) > 0;
            });
            city.Random.SetState(RandomStream.SimulationStream(decaying).GetState());
            int footbridge = Walkways.With(0, 4, (int)WalkwayKind.Footbridge);
            city.Map.SetWalkway(X, Y, Ground.Walkway(3) | footbridge);

            Scan(city);

            Assert.AreEqual((RIVER, footbridge), (city.Map.GetTileValue(X, Y), city.Map.GetWalkway(X, Y)));
        }

        // The usable walkway of each tile, as the city sends it, by its position
        private static Func<int, int, int> UsableWalkway(Simulation city)
        {
            int[] usable = city.Map.UsableWalkwayValues();
            return (x, y) => usable[x + y * city.Map.Width];
        }

        // The walkway the function given reads on each of the bridge's five tiles, west to east
        private static int[] OnBridge(Func<int, int, int> walkwayAt)
        {
            return Enumerable.Range(-2, 5).Select(dx => walkwayAt(X + dx, Y)).ToArray();
        }

        private static Simulation CityWith((int Dx, int Dy, int Raw)[] tiles)
        {
            Simulation city = FixtureCities.City("suburb", "built");
            city.Budget.RoadEffect = Budget.MaxRoadEffect;
            city.Random.SetState(RandomStream.SimulationStream(OpeningSeed).GetState());

            foreach ((int dx, int dy, int raw) in tiles)
            {
                city.Map.GetTile(X + dx, Y + dy).SetRawValue(raw);
            }

            return city;
        }

        private static void Scan(Simulation city)
        {
            Road.RoadFound(city.Map, X, Y, city.ConstructSimData());
        }

        private static (int, int, int)[] RawTiles(Simulation city, (int Dx, int Dy, int Raw)[] tiles)
        {
            return tiles.Select(tile => (tile.Dx, tile.Dy, city.Map.GetTile(X + tile.Dx, Y + tile.Dy).GetRawValue())).ToArray();
        }
    }
}
