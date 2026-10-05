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

using System.Text.Json.Nodes;

namespace Micropolis.Rules
{
    /// <summary>
    /// The block maps the scans write and later phases read, saved under <c>scannedState.blockMaps</c>, each with the
    /// block size and the range its values keep to.
    /// </summary>
    public sealed class BlockMaps
    {
        // The most a station map's block holds: each station adds up to its fully funded effect at the road tile on its
        // perimeter, or at its centre when it has none (EmergencyServices). Either is at most two tiles from its
        // centre, so the stations a block of 8 collects from have their centres in a 12×12 square, and stations three
        // tiles a side that don't overlap have at most one centre in each of its sixteen 3×3 squares.
        private const int MaxPoliceStationMap = 16 * (int)Budget.MaxPoliceStationEffect;
        private const int MaxFireStationMap = 16 * (int)Budget.MaxFireStationEffect;

        private readonly IReadOnlyList<(string Key, BlockMap Map)> _saved;

        public BlockMaps(int gameMapWidth, int gameMapHeight)
        {
            BlockMap Of(int blockSize, int min, int max) => new BlockMap(gameMapWidth, gameMapHeight, blockSize, min, max);

            CityCentreDistScoreMap = Of(8, -64, 64);
            CrimeRateMap = Of(2, 0, 250);
            FireStationMap = Of(8, 0, MaxFireStationMap);
            FireStationEffectMap = Of(8, 0, MaxFireStationMap);
            LandValueMap = Of(2, 0, 250);
            PoliceStationMap = Of(8, 0, MaxPoliceStationMap);
            PoliceStationEffectMap = Of(8, 0, MaxPoliceStationMap);
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

        /// <summary>
        /// The map saved under the key, or <see langword="null"/> for a key no map is saved under.
        /// </summary>
        internal BlockMap? Saved(string key)
        {
            return _saved.FirstOrDefault(saved => saved.Key == key).Map;
        }

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
