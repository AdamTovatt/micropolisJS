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
    /// The block maps the scans write and later phases read, saved under <c>scannedState.blockMaps</c>, each with the
    /// block size and range the <c>Simulation</c> constructor in <c>src/simulation.js</c> gives it.
    /// </summary>
    public sealed class BlockMaps
    {
        // The most a station map's block holds: each station in the block adds up to 1000, its funded effect
        // (emergencyServices.js), and at most nine stations, three tiles a side, have their centres in one block of 8
        private const int MaxStationMap = 9 * 1000;

        private readonly IReadOnlyList<(string Key, BlockMap Map)> _saved;

        public BlockMaps(int gameMapWidth, int gameMapHeight)
        {
            BlockMap Of(int blockSize, int min, int max) => new BlockMap(gameMapWidth, gameMapHeight, blockSize, min, max);

            CityCentreDistScoreMap = Of(8, -64, 64);
            CrimeRateMap = Of(2, 0, 250);
            FireStationMap = Of(8, 0, MaxStationMap);
            FireStationEffectMap = Of(8, 0, MaxStationMap);
            LandValueMap = Of(2, 0, 250);
            PoliceStationMap = Of(8, 0, MaxStationMap);
            PoliceStationEffectMap = Of(8, 0, MaxStationMap);
            PollutionDensityMap = Of(2, 0, 255);
            PopulationDensityMap = Of(2, 0, 510);
            RateOfGrowthMap = Of(8, -200, 200);
            TerrainDensityMap = Of(4, 0, 240);
            TrafficDensityMap = Of(2, 0, 240);

            _saved =
            [
                ("cityCentreDistScoreMap", CityCentreDistScoreMap),
                ("crimeRateMap", CrimeRateMap),
                ("fireStationMap", FireStationMap),
                ("fireStationEffectMap", FireStationEffectMap),
                ("landValueMap", LandValueMap),
                ("policeStationMap", PoliceStationMap),
                ("policeStationEffectMap", PoliceStationEffectMap),
                ("pollutionDensityMap", PollutionDensityMap),
                ("populationDensityMap", PopulationDensityMap),
                ("rateOfGrowthMap", RateOfGrowthMap),
                ("terrainDensityMap", TerrainDensityMap),
                ("trafficDensityMap", TrafficDensityMap),
            ];
        }

        /// <summary>
        /// Each block's distance score from the city centre.
        /// </summary>
        public BlockMap CityCentreDistScoreMap { get; }

        /// <summary>
        /// How dangerous each block is, larger worse.
        /// </summary>
        public BlockMap CrimeRateMap { get; }

        /// <summary>
        /// The fire stations the map scan noted.
        /// </summary>
        public BlockMap FireStationMap { get; }

        /// <summary>
        /// The fire cover of each block.
        /// </summary>
        public BlockMap FireStationEffectMap { get; }

        /// <summary>
        /// Each block's land value.
        /// </summary>
        public BlockMap LandValueMap { get; }

        /// <summary>
        /// The police stations the map scan noted.
        /// </summary>
        public BlockMap PoliceStationMap { get; }

        /// <summary>
        /// How much crime is dampened in each block.
        /// </summary>
        public BlockMap PoliceStationEffectMap { get; }

        /// <summary>
        /// Each block's pollution.
        /// </summary>
        public BlockMap PollutionDensityMap { get; }

        /// <summary>
        /// Each block's population density.
        /// </summary>
        public BlockMap PopulationDensityMap { get; }

        /// <summary>
        /// Each block's rate of growth.
        /// </summary>
        public BlockMap RateOfGrowthMap { get; }

        /// <summary>
        /// How undeveloped each block is.
        /// </summary>
        public BlockMap TerrainDensityMap { get; }

        /// <summary>
        /// Each block's traffic.
        /// </summary>
        public BlockMap TrafficDensityMap { get; }

        internal void SaveScan(JsonObject scanData)
        {
            foreach ((string key, BlockMap map) in _saved)
            {
                scanData[key] = map.Save();
            }
        }

        /// <summary>
        /// Reads every map from <c>scannedState.blockMaps</c>, given as <paramref name="scanData"/>.
        /// </summary>
        internal void LoadScan(SavedObject scanData)
        {
            foreach ((string key, BlockMap map) in _saved)
            {
                map.Load(scanData, key);
            }
        }
    }
}
