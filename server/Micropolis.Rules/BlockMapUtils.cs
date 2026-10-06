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

namespace Micropolis.Rules
{
    /// <summary>
    /// The map-wide scans of the original's scan.cpp, which phases 10–15 run over the block maps.
    /// </summary>
    public static class BlockMapUtils
    {
        /// <summary>
        /// The land value of a block with no developed tile, which the land value scan gives no value: a developed block's
        /// is at least one more.
        /// </summary>
        public const int UndevelopedLandValue = 0;

        // A map a scan works in, all zeros, which the scans rely on: some add to entries or write only some of them
        // before they read the whole map. Each scan makes its own and never saves it, so no state passes through it
        // from one scan to the next, and its range is never checked.
        private static BlockMap WorkingMap(GameMap map, int blockSize)
        {
            return new BlockMap(map.Width, map.Height, blockSize, int.MinValue, int.MaxValue);
        }

        // How smoothMap smooths
        private enum SmoothStyle
        {
            // The mean of a block's neighbours, then the mean of that and the block
            NeighboursThenBlock,

            // The block and its neighbours summed, a quarter of that, at most 255
            AllThenClamp,
        }

        // Smooths src into dest, which have the same size. Each block's neighbours are the four beside it on the map.
        private static void SmoothMap(BlockMap src, BlockMap dest, SmoothStyle smoothStyle)
        {
            for (int x = 0; x < src.Width; x++)
            {
                for (int y = 0; y < src.Height; y++)
                {
                    int edges = 0;

                    if (x > 0)
                    {
                        edges += src.Get(x - 1, y);
                    }

                    if (x < src.Width - 1)
                    {
                        edges += src.Get(x + 1, y);
                    }

                    if (y > 0)
                    {
                        edges += src.Get(x, y - 1);
                    }

                    if (y < src.Height - 1)
                    {
                        edges += src.Get(x, y + 1);
                    }

                    if (smoothStyle == SmoothStyle.NeighboursThenBlock)
                    {
                        edges = src.Get(x, y) + JsMath.FloorDiv(edges, 4);
                        dest.Set(x, y, JsMath.FloorDiv(edges, 2));
                    }
                    else
                    {
                        // A quarter of the sum, rounding down
                        edges = (edges + src.Get(x, y)) >> 2;
                        if (edges > 255)
                        {
                            edges = 255;
                        }

                        dest.Set(x, y, edges);
                    }
                }
            }
        }

        // Spreads the stations a map notes into the blocks around them: three passes of smoothing, from the station map
        // to the effect map, back, and to the effect map again. The station map keeps the second pass, which the crime
        // scan reads for the police.
        private static void SpreadStationCover(BlockMap stationMap, BlockMap effectMap)
        {
            SmoothMap(stationMap, effectMap, SmoothStyle.NeighboursThenBlock);
            SmoothMap(effectMap, stationMap, SmoothStyle.NeighboursThenBlock);
            SmoothMap(stationMap, effectMap, SmoothStyle.NeighboursThenBlock);
        }

        /// <summary>
        /// Moves each block's rate of growth one toward zero.
        /// </summary>
        public static void NeutraliseRateOfGrowthMap(BlockMaps blockMaps)
        {
            BlockMap rateOfGrowthMap = blockMaps.RateOfGrowthMap;

            for (int x = 0; x < rateOfGrowthMap.Width; x++)
            {
                for (int y = 0; y < rateOfGrowthMap.Height; y++)
                {
                    int rate = rateOfGrowthMap.Get(x, y);
                    if (rate == 0)
                    {
                        continue;
                    }

                    if (rate > 0)
                    {
                        rate--;
                    }
                    else
                    {
                        rate++;
                    }

                    rate = Math.Clamp(rate, -200, 200);
                    rateOfGrowthMap.Set(x, y, rate);
                }
            }
        }

        /// <summary>
        /// Eases each block's traffic: light traffic clears, and heavy traffic falls faster than moderate.
        /// </summary>
        public static void NeutraliseTrafficMap(BlockMaps blockMaps)
        {
            BlockMap trafficDensityMap = blockMaps.TrafficDensityMap;

            for (int x = 0; x < trafficDensityMap.Width; x++)
            {
                for (int y = 0; y < trafficDensityMap.Height; y++)
                {
                    int trafficDensity = trafficDensityMap.Get(x, y);
                    if (trafficDensity == 0)
                    {
                        continue;
                    }

                    if (trafficDensity <= 24)
                    {
                        trafficDensity = 0;
                    }
                    else if (trafficDensity > 200)
                    {
                        trafficDensity -= 34;
                    }
                    else
                    {
                        trafficDensity -= 24;
                    }

                    trafficDensityMap.Set(x, y, trafficDensity);
                }
            }
        }

        // The pollution a tile of the value gives off, 0–255
        private static int GetPollutionValue(int tileValue)
        {
            if (tileValue < TileValues.POWERBASE)
            {
                // Roads, fires and radiation lie below POWERBASE
                if (tileValue >= TileValues.HTRFBASE)
                {
                    return 75;
                }

                if (tileValue >= TileValues.LTRFBASE)
                {
                    return 50;
                }

                if (tileValue < TileValues.ROADBASE)
                {
                    if (tileValue > TileValues.FIREBASE)
                    {
                        return 90;
                    }

                    if (tileValue >= TileValues.RADTILE)
                    {
                        return 255;
                    }
                }

                return 0;
            }

            // A zone's tile: residential and commercial zones and empty industrial ones give off none
            if (tileValue <= TileValues.LASTIND)
            {
                return 0;
            }

            if (tileValue < TileValues.PORTBASE)
            {
                return 50;
            }

            if (tileValue <= TileValues.LASTPOWERPLANT)
            {
                return 100;
            }

            return 0;
        }

        // The Manhattan distance of (x, y) from the city centre, at most 64
        private static int GetCityCentreDistance(GameMap map, int x, int y)
        {
            return Math.Min(Math.Abs(x - map.CityCentreX) + Math.Abs(y - map.CityCentreY), 64);
        }

        /// <summary>
        /// Scores each block of land value, pollution and undeveloped terrain from the tiles in it, with the averages
        /// the census keeps, and notes the most polluted block, drawing from the stream to break a tie.
        /// </summary>
        public static void PollutionTerrainLandValueScan(GameMap map, Census census, BlockMaps blockMaps, RandomStream random)
        {
            BlockMap landValueMap = blockMaps.LandValueMap;
            BlockMap terrainDensityMap = blockMaps.TerrainDensityMap;
            BlockMap pollutionDensityMap = blockMaps.PollutionDensityMap;
            BlockMap crimeRateMap = blockMaps.CrimeRateMap;

            // Each block's raw pollution, smoothed through the second map and back
            BlockMap tempMap1 = WorkingMap(map, 2);
            BlockMap tempMap2 = WorkingMap(map, 2);

            // The undeveloped tiles, 15 each, smoothed into the terrain density map
            BlockMap tempMap3 = WorkingMap(map, 4);

            long totalLandValue = 0;
            long developedTileCount = 0;

            for (int x = 0; x < landValueMap.Width; x++)
            {
                for (int y = 0; y < landValueMap.Height; y++)
                {
                    int pollutionLevel = 0;
                    bool developed = false;

                    // The land value map's blocks are 2 tiles a side
                    int worldX = x * 2;
                    int worldY = y * 2;

                    for (int mapX = worldX; mapX <= worldX + 1; mapX++)
                    {
                        for (int mapY = worldY; mapY <= worldY + 1; mapY++)
                        {
                            int tileValue = map.GetTileValue(mapX, mapY);

                            if (tileValue == TileValues.DIRT)
                            {
                                continue;
                            }

                            if (tileValue < TileValues.RUBBLE)
                            {
                                tempMap3.WorldSet(mapX, mapY, tempMap3.WorldGet(mapX, mapY) + 15);
                                continue;
                            }

                            pollutionLevel += GetPollutionValue(tileValue);
                            if (tileValue >= TileValues.ROADBASE)
                            {
                                developed = true;
                            }
                        }
                    }

                    pollutionLevel = Math.Min(pollutionLevel, 255);
                    tempMap1.Set(x, y, pollutionLevel);

                    if (developed)
                    {
                        // 8–136 from the distance, before the neighbourhood's terrain, pollution and crime
                        int landValue = 34 - JsMath.FloorDiv(GetCityCentreDistance(map, worldX, worldY), 2);
                        landValue <<= 2;
                        landValue += terrainDensityMap.Get(x >> 1, y >> 1);
                        landValue -= pollutionDensityMap.Get(x, y);

                        if (crimeRateMap.Get(x, y) > 190)
                        {
                            landValue -= 20;
                        }

                        // UndevelopedLandValue is undeveloped land
                        landValue = Math.Clamp(landValue, UndevelopedLandValue + 1, 250);
                        landValueMap.Set(x, y, landValue);

                        totalLandValue += landValue;
                        developedTileCount++;
                    }
                    else
                    {
                        landValueMap.Set(x, y, UndevelopedLandValue);
                    }
                }
            }

            census.LandValueAverage = developedTileCount > 0 ? JsMath.FloorDiv(totalLandValue, developedTileCount) : 0;

            SmoothMap(tempMap1, tempMap2, SmoothStyle.AllThenClamp);
            SmoothMap(tempMap2, tempMap1, SmoothStyle.AllThenClamp);

            int maxPollution = 0;
            long pollutedTileCount = 0;
            long totalPollution = 0;

            for (int x = 0; x < map.Width; x += pollutionDensityMap.BlockSize)
            {
                for (int y = 0; y < map.Height; y += pollutionDensityMap.BlockSize)
                {
                    int pollution = tempMap1.WorldGet(x, y);
                    pollutionDensityMap.WorldSet(x, y, pollution);

                    if (pollution != 0)
                    {
                        pollutedTileCount++;
                        totalPollution += pollution;

                        // The most polluted block, where a monster heads: a tie draws from the stream, and only a tie
                        if (pollution > maxPollution || (pollution == maxPollution && random.GetChance(3)))
                        {
                            maxPollution = pollution;
                            map.PollutionMaxX = x;
                            map.PollutionMaxY = y;
                        }
                    }
                }
            }

            census.PollutionAverage = pollutedTileCount > 0 ? JsMath.FloorDiv(totalPollution, pollutedTileCount) : 0;

            SmoothMap(tempMap3, terrainDensityMap, SmoothStyle.NeighboursThenBlock);
        }

        /// <summary>
        /// Spreads the police stations' cover, and scores each block of developed land on its crime: low land value,
        /// dense population and no police nearby attract it.
        /// </summary>
        public static void CrimeScan(Census census, BlockMaps blockMaps)
        {
            BlockMap policeStationMap = blockMaps.PoliceStationMap;
            BlockMap policeStationEffectMap = blockMaps.PoliceStationEffectMap;
            BlockMap crimeRateMap = blockMaps.CrimeRateMap;
            BlockMap landValueMap = blockMaps.LandValueMap;
            BlockMap populationDensityMap = blockMaps.PopulationDensityMap;

            SpreadStationCover(policeStationMap, policeStationEffectMap);

            long totalCrime = 0;
            long crimeZoneCount = 0;

            // Each block of the crime map, read from the other maps at its top left tile
            for (int blockX = 0; blockX < crimeRateMap.Width; blockX++)
            {
                for (int blockY = 0; blockY < crimeRateMap.Height; blockY++)
                {
                    int x = blockX * crimeRateMap.BlockSize;
                    int y = blockY * crimeRateMap.BlockSize;
                    int value = landValueMap.WorldGet(x, y);

                    if (value > 0)
                    {
                        crimeZoneCount += 1;

                        value = 128 - value;
                        value += populationDensityMap.WorldGet(x, y);
                        value = Math.Min(value, 300);
                        value -= policeStationMap.WorldGet(x, y);
                        value = Math.Clamp(value, 0, 250);

                        crimeRateMap.Set(blockX, blockY, value);
                        totalCrime += value;
                    }
                    else
                    {
                        crimeRateMap.Set(blockX, blockY, 0);
                    }
                }
            }

            census.CrimeAverage = crimeZoneCount > 0 ? JsMath.FloorDiv(totalCrime, crimeZoneCount) : 0;
        }

        // Scores each block on its top left tile's distance from the city centre, -64 to 64, nearer higher
        private static void FillCityCentreDistScoreMap(GameMap map, BlockMaps blockMaps)
        {
            BlockMap cityCentreDistScoreMap = blockMaps.CityCentreDistScoreMap;

            for (int x = 0; x < cityCentreDistScoreMap.Width; x++)
            {
                for (int y = 0; y < cityCentreDistScoreMap.Height; y++)
                {
                    int value = JsMath.FloorDiv(GetCityCentreDistance(map, x * 8, y * 8), 2);
                    value *= 4;
                    value = 64 - value;
                    cityCentreDistScoreMap.Set(x, y, value);
                }
            }
        }

        // The population of the zone centred at (x, y), weighted by its kind
        private static int GetPopulationDensity(GameMap map, int x, int y, int tileValue)
        {
            if (tileValue < TileValues.COMBASE)
            {
                return Residential.GetZonePopulation(map, x, y, tileValue);
            }

            if (tileValue < TileValues.INDBASE)
            {
                return Commercial.GetZonePopulation(map, x, y, tileValue) * 8;
            }

            if (tileValue < TileValues.PORTBASE)
            {
                return Industrial.GetZonePopulation(map, x, y, tileValue) * 8;
            }

            return 0;
        }

        /// <summary>
        /// Smooths each zone's population into the population density map, scores each block on its distance from the
        /// city centre, then moves the city centre to the mean position of the zones, or the map's middle with none.
        /// </summary>
        public static void PopulationDensityScan(GameMap map, BlockMaps blockMaps)
        {
            // Each zone's population, smoothed through the second map and back, three passes in all
            BlockMap tempMap1 = WorkingMap(map, 2);
            BlockMap tempMap2 = WorkingMap(map, 2);
            BlockMap populationDensityMap = blockMaps.PopulationDensityMap;

            long xTot = 0;
            long yTot = 0;
            long zoneTotal = 0;

            for (int x = 0; x < map.Width; x++)
            {
                for (int y = 0; y < map.Height; y++)
                {
                    Tile tile = map.GetTile(x, y);
                    if (tile.IsZone())
                    {
                        int population = GetPopulationDensity(map, x, y, tile.GetValue()) * 8;
                        population = Math.Min(population, 254);

                        // A block of 2 tiles a side holds one zone centre at most
                        tempMap1.WorldSet(x, y, population);

                        xTot += x;
                        yTot += y;
                        zoneTotal++;
                    }
                }
            }

            SmoothMap(tempMap1, tempMap2, SmoothStyle.AllThenClamp);
            SmoothMap(tempMap2, tempMap1, SmoothStyle.AllThenClamp);
            SmoothMap(tempMap1, tempMap2, SmoothStyle.AllThenClamp);

            for (int x = 0; x < populationDensityMap.Width; x++)
            {
                for (int y = 0; y < populationDensityMap.Height; y++)
                {
                    populationDensityMap.Set(x, y, tempMap2.Get(x, y) * 2);
                }
            }

            // As the original does, the distances are scored from the centre before it moves
            FillCityCentreDistScoreMap(map, blockMaps);

            if (zoneTotal > 0)
            {
                map.CityCentreX = (int)JsMath.FloorDiv(xTot, zoneTotal);
                map.CityCentreY = (int)JsMath.FloorDiv(yTot, zoneTotal);
            }
            else
            {
                map.CityCentreX = JsMath.FloorDiv(map.Width, 2);
                map.CityCentreY = JsMath.FloorDiv(map.Height, 2);
            }
        }

        /// <summary>
        /// Spreads the fire stations the map scan noted into each block's fire cover.
        /// </summary>
        public static void FireAnalysis(BlockMaps blockMaps)
        {
            BlockMap fireStationMap = blockMaps.FireStationMap;
            BlockMap fireStationEffectMap = blockMaps.FireStationEffectMap;

            SpreadStationCover(fireStationMap, fireStationEffectMap);
        }
    }
}
