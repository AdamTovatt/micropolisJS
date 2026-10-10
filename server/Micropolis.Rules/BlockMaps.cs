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
        /// <summary>
        /// The tiles along each side of a block of the police and fire station maps and of the coverage their analyses
        /// spread from them.
        /// </summary>
        public const int StationMapBlockSize = 8;

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
            FireStationMap = Of(StationMapBlockSize, 0, MaxFireStationMap);
            FireStationEffectMap = Of(StationMapBlockSize, 0, MaxFireStationMap);
            FootLoadMap = Of(1, 0, Traffic.MaxFootLoad);
            LandValueMap = Of(2, 0, 250);
            PoliceStationMap = Of(StationMapBlockSize, 0, MaxPoliceStationMap);
            PoliceStationEffectMap = Of(StationMapBlockSize, 0, MaxPoliceStationMap);
            PollutionDensityMap = Of(2, 0, 255);
            PopulationDensityMap = Of(2, 0, 510);
            RailLoadFromNorthOrWestMap = Of(1, 0, Traffic.MaxRailLoad);
            RailLoadFromSouthOrEastMap = Of(1, 0, Traffic.MaxRailLoad);
            RateOfGrowthMap = Of(8, -200, 200);
            TerrainDensityMap = Of(4, 0, 240);
            TrafficDensityMap = Of(2, 0, 240);

            _saved =
            [
                ("cityCentreDistScoreMap", CityCentreDistScoreMap),
                ("crimeRateMap", CrimeRateMap),
                ("fireStationMap", FireStationMap),
                ("fireStationEffectMap", FireStationEffectMap),
                ("footLoadMap", FootLoadMap),
                ("landValueMap", LandValueMap),
                ("policeStationMap", PoliceStationMap),
                ("policeStationEffectMap", PoliceStationEffectMap),
                ("pollutionDensityMap", PollutionDensityMap),
                ("populationDensityMap", PopulationDensityMap),
                ("railLoadFromNorthOrWestMap", RailLoadFromNorthOrWestMap),
                ("railLoadFromSouthOrEastMap", RailLoadFromSouthOrEastMap),
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
        /// The walkers on each crossing, a block a tile: what the walks the traffic rule routes over a crossing
        /// (<see cref="Walkways.Crossings"/>) add to its tile, decayed as the traffic density is. A busy crossing makes
        /// its road dearer to drive (<see cref="TripRouter.FootLoadPerCost"/>), as a car gives way to the walkers on it.
        /// </summary>
        public BlockMap FootLoadMap { get; }

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
        /// The riders on each tile of rail going one way, those that entered it from the north or west:
        /// <see cref="RailLoad"/> says what it holds.
        /// </summary>
        public BlockMap RailLoadFromNorthOrWestMap { get; }

        /// <summary>
        /// The riders on each tile of rail going the other way, those that entered it from the south or east:
        /// <see cref="RailLoad"/> says what it holds.
        /// </summary>
        public BlockMap RailLoadFromSouthOrEastMap { get; }

        /// <summary>
        /// The riders on each tile of rail going one way, each tile carrying a track each way: those that entered it
        /// from the north or west where <paramref name="fromNorthOrWest"/>, and those that entered it from the south or
        /// east otherwise, as <see cref="TileUtils.EntersFromNorthOrWest"/> counts each end of its track. A block a tile,
        /// so that lines side by side keep their loads apart: what the rides the traffic rule routes add to it, which no
        /// road's traffic does, decayed as the traffic density is. A tile at <see cref="Traffic.MaxRailLoad"/> one way
        /// is full that way, and no ride enters it going that way, so a line used both ways carries twice what one used
        /// one way does.
        /// </summary>
        public BlockMap RailLoad(bool fromNorthOrWest)
        {
            return fromNorthOrWest ? RailLoadFromNorthOrWestMap : RailLoadFromSouthOrEastMap;
        }

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
