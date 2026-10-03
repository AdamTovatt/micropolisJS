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
    /// The infrastructure and service handlers: roads and bridges, the power plants, stadiums, fire, flood, radiation
    /// and explosion tiles, and the police and fire stations.
    /// </summary>
    [TestClass]
    public sealed class InfrastructureHandlersTests
    {
        // The families and the handlers each registers with the map scanner
        private static readonly Dictionary<string, string[]> FamilyHandlers = new Dictionary<string, string[]>
        {
            ["emergencyServices"] = ["policeStationFound", "fireStationFound"],
            ["miscTiles"] = ["fireFound", "radiationFound", "floodFound", "explosionFound"],
            ["powerManager"] = ["coalPowerFound", "nuclearPowerFound"],
            ["road"] = ["roadFound"],
            ["stadia"] = ["emptyStadiumFound", "fullStadiumFound"],
        };

        private static readonly string[] Families = FamilyHandlers.Keys.ToArray();

        // IZB is the centre of the first industrial zone with buildings, which a fire leaves standing, since only a centre
        // past it explodes; the next building's centre is the first that does
        private const int ExplodingIndustrialCentre = IZB + 9;

        // A fire on the west tile of a zone, beside its centre, on open land east of the suburb
        private const int FireX = 110;
        private const int FireY = 20;
        private const int CentreX = FireX + 1;
        private const int CentreY = FireY;

        // The zone's tiles no fire spreads to from the fire: those not beside it
        private static readonly (int X, int Y)[] Unreached = [(111, 19), (112, 19), (112, 20), (111, 21), (112, 21)];

        // The simulation stream of this seed spreads the fire east, into the zone's centre, on the first call
        private const uint SpreadingEastSeed = 20;

        // The simulation stream of this seed melts a nuclear plant down on its first draw at the easy level
        private const uint MeltdownSeed = 6572;

        private const int FloodCycles = 30;

        // Every map scan the TypeScript recorded with one of the family's modules alone registered matches, in every
        // fixture whose map scans are recorded a family at a time, the rare branches' points included, and none stops at
        // a stub. Between them they reach every handler the families register.
        [TestMethod]
        public void MapScan_InfrastructureFamilyAlone_MatchesTypeScript()
        {
            List<UnitSnapshot> familyScans = UnitSnapshots.Load()
                .Where(snapshot => snapshot.Unit == "mapScanner.mapScan" && snapshot.Handlers.Count == 1)
                .ToList();
            List<UnitSnapshot> records = familyScans.Where(snapshot => Families.Contains(snapshot.Handlers[0])).ToList();

            CollectionAssert.AreEquivalent(Families, records.Select(snapshot => snapshot.Handlers[0]).Distinct().ToList());
            CollectionAssert.AreEquivalent(
                FamilyHandlers.SelectMany(family => family.Value.Select(handler => $"{family.Key}.{handler}")).ToList(),
                records.SelectMany(snapshot => snapshot.Reached).Distinct().ToList());
            CollectionAssert.AreEquivalent(familyScans.Select(snapshot => snapshot.Fixture).Distinct().ToList(),
                                           records.Select(snapshot => snapshot.Fixture).Distinct().ToList());

            foreach (UnitSnapshot snapshot in records)
            {
                Assert.AreEqual(new UnitRun(null, null), UnitSnapshotRunner.Run(UnitSnapshots.ReadRecord(snapshot)), snapshot.ToString());
            }
        }

        // An industrial zone with buildings in it sets off an explosion when it catches, whose hot spot is the middle of
        // the zone's centre
        [TestMethod]
        public void FireFound_SpreadingIntoAnIndustrialZone_SetsOffAnExplosionOverItsCentre()
        {
            Simulation city = CityWithAFireBesideAZone(ExplodingIndustrialCentre);

            MiscTiles.FireFound(city.Map, FireX, FireY, city.ConstructSimData());

            List<Sprite> explosions = city.SpriteManager.GetLiveSprites().Where(sprite => sprite.Type == SpriteType.Explosion).ToList();
            Assert.HasCount(1, explosions, $"The stream of seed {SpreadingEastSeed} no longer spreads the fire east into the zone's centre");
            Assert.AreEqual((CentreX * 16 + 8, CentreY * 16 + 8), (explosions[0].X + explosions[0].XHot, explosions[0].Y + explosions[0].YHot));
        }

        // The same fire, drawing from the same stream, sets an empty residential zone on fire, which doesn't explode: its
        // centre burns, its rate of growth falls by 20, and its tiles become bulldozable
        [TestMethod]
        public void FireFound_SpreadingIntoAResidentialZone_SetsItOnFire()
        {
            Simulation city = CityWithAFireBesideAZone(FREEZ);
            int growthBefore = city.BlockMaps.RateOfGrowthMap.WorldGet(CentreX, CentreY);
            Assert.IsFalse(Unreached.Any(tile => city.Map.GetTile(tile.X, tile.Y).IsBulldozable()));

            MiscTiles.FireFound(city.Map, FireX, FireY, city.ConstructSimData());

            Assert.IsTrue(TileUtils.IsFire(city.Map.GetTileValue(CentreX, CentreY)));
            Assert.AreEqual(growthBefore - 20, city.BlockMaps.RateOfGrowthMap.WorldGet(CentreX, CentreY));
            Assert.IsTrue(Unreached.All(tile => city.Map.GetTile(tile.X, tile.Y).IsBulldozable()));
        }

        // A nuclear plant melting down explodes at its four corners and burns from end to end
        [TestMethod]
        public void NuclearPowerFound_MeltingDown_ExplodesAndBurnsThePlant()
        {
            Simulation city = FixtureCities.City("suburb", "built");
            city.Map.PutZone(CentreX, CentreY, NUCLEAR, 4);
            city.DisasterManager.DisastersEnabled = true;
            city.Random.SetState(RandomStream.SimulationStream(MeltdownSeed).GetState());

            city.PowerManager.NuclearPowerFound(city.Map, CentreX, CentreY, city.ConstructSimData());

            Assert.HasCount(4, city.SpriteManager.GetLiveSprites().Where(sprite => sprite.Type == SpriteType.Explosion).ToList());
            for (int x = CentreX - 1; x < CentreX + 3; x++)
            {
                for (int y = CentreY - 1; y < CentreY + 3; y++)
                {
                    Assert.IsTrue(TileUtils.IsFire(city.Map.GetTileValue(x, y)), $"The plant's tile at ({x}, {y})");
                }
            }
        }

        // Phase 15 counts a flood down, and with disasters disabled draws no disaster
        [TestMethod]
        public void DoDisasters_FloodRunningWithDisastersDisabled_CountsItDown()
        {
            Simulation city = CityWithAFlood(disastersEnabled: false);

            city.DisasterManager.DoDisasters(city.GameLevel, city.Census);

            Assert.AreEqual(FloodCycles - 1, city.DisasterManager.FloodCount);
        }

        // With disasters enabled it counts the flood down, then draws for a random disaster
        [TestMethod]
        public void DoDisasters_FloodRunningWithDisastersEnabled_CountsItDownThenDrawsForADisaster()
        {
            Simulation city = CityWithAFlood(disastersEnabled: true);
            uint[] before = city.Random.GetState();

            city.DisasterManager.DoDisasters(city.GameLevel, city.Census);

            Assert.AreEqual(FloodCycles - 1, city.DisasterManager.FloodCount);
            CollectionAssert.AreNotEqual(before, city.Random.GetState());
        }

        private static Simulation CityWithAFireBesideAZone(int zoneCentre)
        {
            Simulation city = FixtureCities.City("suburb", "built");
            city.Map.PutZone(CentreX, CentreY, zoneCentre, 3);
            city.Map.SetTile(FireX, FireY, FIRE, ANIMBIT);
            city.Random.SetState(RandomStream.SimulationStream(SpreadingEastSeed).GetState());

            return city;
        }

        private static Simulation CityWithAFlood(bool disastersEnabled)
        {
            Simulation city = FixtureCities.City("suburb", "built");
            city.DisasterManager.FloodCount = FloodCycles;
            city.DisasterManager.DisastersEnabled = disastersEnabled;

            return city;
        }
    }
}
