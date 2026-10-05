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

using static Micropolis.Rules.TileFlags;
using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The drawbridge as doBridge in the original's simulate.cpp opens and closes it, with no ship near and roads funded
    /// in full, on a stream whose first draw is the one chance in 8 that opens a bridge or in 4 that closes one.
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
