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
    /// Jams hold a town's growth back. A column of six housing zones on the west and one of six commerce and industry
    /// zones on the east, each side powered by a coal plant of its own and served by a road down its inner edge, the two
    /// roads joined across a gap of 40 tiles: by one road in the middle, which every trip between the sides takes, or by
    /// one at each zone's row. Either way a trip runs nearly straight, so what makes it slow is the one road's traffic:
    /// the one road jams, its trips are slow, and their zones lose the slow trip's penalty from their growth scores, and
    /// its traffic pollutes the land about it. Rubble, which no one walks across, keeps every trip on the roads. Over ten
    /// years from twenty seeds, the town on one road grows slower than the town on a road at each row by more than twice
    /// the standard error of the difference. The slow trip's penalty is only part of what a jam costs, so the town on one
    /// road grows slower with no penalty too: <see cref="SlowTripTests"/> holds each zone to the penalty a slow trip
    /// takes; this holds a whole town to the growth a jam costs.
    /// </summary>
    [TestClass]
    public sealed class JammedTownTests
    {
        private const int Rows = 6;
        private const int Top = 40;
        private const int WestRoad = 33;
        private const int EastRoad = WestRoad + 41;
        private const int Seeds = 20;

        // Ten years at fast speed: long enough for the one road to jam, five years being too short to tell the towns apart
        // from twenty seeds
        private const int Steps = 10 * 768;

        [TestMethod]
        public void Step_TownFedByOneRoad_GrowsSlowerThanOnARoadAtEachRow()
        {
            (double oneRoad, double oneRoadError) = Growth(Town(Enumerable.Range(Top + 3 * Rows / 2, 1)));
            (double grid, double gridError) = Growth(Town(Enumerable.Range(0, Rows).Select(row => Top + 1 + 3 * row)));

            double errorOfDifference = Math.Sqrt(oneRoadError * oneRoadError + gridError * gridError);
            Assert.IsGreaterThan(2 * errorOfDifference, grid - oneRoad,
                                 $"one road {oneRoad:F0} ± {oneRoadError:F0}, a road at each row {grid:F0} ± {gridError:F0}");
        }

        // The mean population after the steps from each seed, and its standard error
        private static (double Mean, double Error) Growth(Func<GameMap> town)
        {
            double[] populations = new double[Seeds];

            Parallel.For(0, Seeds, seed =>
            {
                Simulation city = Simulation.NewCity(town(), (uint)seed, Level.Easy, Speed.Fast);
                city.DisasterManager.DisastersEnabled = false;

                for (int step = 0; step < Steps; step++)
                {
                    city.Step();
                }

                populations[seed] = city.Evaluation.CityPop;
            });

            double mean = populations.Average();
            double variance = populations.Sum(population => (population - mean) * (population - mean)) / (Seeds - 1);
            return (mean, Math.Sqrt(variance / Seeds));
        }

        // The town, its two sides' roads joined across the gap at the rows given
        private static Func<GameMap> Town(IEnumerable<int> links)
        {
            List<int> rows = links.ToList();

            return () =>
            {
                GameMap map = new GameMap(120, 100);

                for (int row = 0; row < Rows; row++)
                {
                    int y = Top + 1 + 3 * row;
                    ZoneUtils.PutZone(map, WestRoad - 2, y, RZB, false);
                    ZoneUtils.PutZone(map, EastRoad + 2, y, row % 2 == 0 ? IZB : CZB, false);
                }

                // Each plant touches its side's first zone, and no road, so no trip ends at it
                map.PutZone(WestRoad - 5, Top - 3, POWERPLANT, 4);
                map.PutZone(EastRoad + 3, Top - 3, POWERPLANT, 4);

                // Rubble, which no one walks across, along each side's outer edge and on the first zones' edges beside
                // the plants, so no trip walks to a zone beside its own or to a plant, and every trip drives
                map.SetTile(WestRoad - 2, Top - 1, RUBBLE, TileFlags.BULLBIT);
                map.SetTile(WestRoad - 1, Top - 1, RUBBLE, TileFlags.BULLBIT);
                map.SetTile(EastRoad + 1, Top - 1, RUBBLE, TileFlags.BULLBIT);

                for (int y = Top; y < Top + 3 * Rows; y++)
                {
                    map.SetTile(WestRoad, y, ROADS, TileFlags.BULLBIT);
                    map.SetTile(EastRoad, y, ROADS, TileFlags.BULLBIT);
                    map.SetTile(WestRoad - 4, y, RUBBLE, TileFlags.BULLBIT);
                    map.SetTile(EastRoad + 4, y, RUBBLE, TileFlags.BULLBIT);
                }

                foreach (int y in rows)
                {
                    for (int x = WestRoad + 1; x < EastRoad; x++)
                    {
                        map.SetTile(x, y, ROADS, TileFlags.BULLBIT);
                    }
                }

                return map;
            };
        }
    }
}
