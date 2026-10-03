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

using System.Text.Json.Nodes;

namespace Micropolis.Rules
{
    /// <summary>
    /// The block maps the scans write and later phases read, saved under <c>scannedState.blockMaps</c>, each with its
    /// block size and the range of its values.
    /// </summary>
    public sealed class BlockMaps
    {
        private readonly IReadOnlyList<(string Key, BlockMap Map, int Min, int Max)> _saved;

        public BlockMaps(int gameMapWidth, int gameMapHeight)
        {
            BlockMap Of(int blockSize) => new BlockMap(gameMapWidth, gameMapHeight, blockSize);

            CityCentreDistScoreMap = Of(8);
            CrimeRateMap = Of(2);
            FireStationMap = Of(8);
            FireStationEffectMap = Of(8);
            LandValueMap = Of(2);
            PoliceStationMap = Of(8);
            PoliceStationEffectMap = Of(8);
            PollutionDensityMap = Of(2);
            PopulationDensityMap = Of(2);
            RateOfGrowthMap = Of(8);
            TerrainDensityMap = Of(4);
            TrafficDensityMap = Of(2);

            _saved =
            [
                ("cityCentreDistScoreMap", CityCentreDistScoreMap, -64, 64),
                ("crimeRateMap", CrimeRateMap, 0, 250),
                ("fireStationMap", FireStationMap, 0, 1000),
                ("fireStationEffectMap", FireStationEffectMap, 0, 1000),
                ("landValueMap", LandValueMap, 0, 250),
                ("policeStationMap", PoliceStationMap, 0, 1000),
                ("policeStationEffectMap", PoliceStationEffectMap, 0, 1000),
                ("pollutionDensityMap", PollutionDensityMap, 0, 255),
                ("populationDensityMap", PopulationDensityMap, 0, 510),
                ("rateOfGrowthMap", RateOfGrowthMap, -200, 200),
                ("terrainDensityMap", TerrainDensityMap, 0, 240),
                ("trafficDensityMap", TrafficDensityMap, 0, 240),
            ];
        }

        /// <summary>
        /// Each block's distance score from the city centre, -64 to 64.
        /// </summary>
        public BlockMap CityCentreDistScoreMap { get; }

        /// <summary>
        /// How dangerous each block is, 0 to 250, larger worse.
        /// </summary>
        public BlockMap CrimeRateMap { get; }

        /// <summary>
        /// The fire stations the map scan noted, 0 to 1000.
        /// </summary>
        public BlockMap FireStationMap { get; }

        /// <summary>
        /// The fire cover of each block, 0 to 1000.
        /// </summary>
        public BlockMap FireStationEffectMap { get; }

        /// <summary>
        /// Each block's land value, 0 to 250.
        /// </summary>
        public BlockMap LandValueMap { get; }

        /// <summary>
        /// The police stations the map scan noted, 0 to 1000.
        /// </summary>
        public BlockMap PoliceStationMap { get; }

        /// <summary>
        /// How much crime is dampened in each block, 0 to 1000.
        /// </summary>
        public BlockMap PoliceStationEffectMap { get; }

        /// <summary>
        /// Each block's pollution, 0 to 255.
        /// </summary>
        public BlockMap PollutionDensityMap { get; }

        /// <summary>
        /// Each block's population density, 0 to 510.
        /// </summary>
        public BlockMap PopulationDensityMap { get; }

        /// <summary>
        /// Each block's rate of growth, -200 to 200.
        /// </summary>
        public BlockMap RateOfGrowthMap { get; }

        /// <summary>
        /// How undeveloped each block is, 0 to 240.
        /// </summary>
        public BlockMap TerrainDensityMap { get; }

        /// <summary>
        /// Each block's traffic, 0 to 240.
        /// </summary>
        public BlockMap TrafficDensityMap { get; }

        public void SaveScan(JsonObject scanData)
        {
            foreach ((string key, BlockMap map, _, _) in _saved)
            {
                scanData[key] = map.Save();
            }
        }

        /// <summary>
        /// Reads every map from <c>scannedState.blockMaps</c>, given as <paramref name="scanData"/>.
        /// </summary>
        public void LoadScan(SavedObject scanData)
        {
            foreach ((string key, BlockMap map, int min, int max) in _saved)
            {
                map.Load(scanData, key, min, max);
            }
        }
    }
}
