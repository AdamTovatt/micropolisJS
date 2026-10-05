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

namespace Micropolis.Rules
{
    /// <summary>
    /// Rail, the seaport and the airport, as the original runs them and sends out their sprites: <c>doRail</c> in
    /// simulate.cpp, and <c>doSpecialZone</c> in zone.cpp for the port and the airport.
    /// </summary>
    public static class Transport
    {
        /// <summary>
        /// A rail tile, as the original's doRail: it counts, may send out a train, and with roads underfunded may
        /// decay, a rail bridge to the river and other rail to rubble, unless it carries a wire.
        /// </summary>
        private static void RailFound(GameMap map, int x, int y, SimData simData)
        {
            simData.Census.RailTotal += 1;
            simData.SpriteManager.GenerateTrain(simData.Census, x, y);

            if (!simData.Budget.ShouldDegradeRoad() || !simData.Random.GetChance(511))
            {
                return;
            }

            Tile currentTile = map.GetTile(x, y);

            // Don't degrade tiles with power lines
            if (currentTile.IsConductive())
            {
                return;
            }

            if (simData.Budget.RoadEffect < (simData.Random.GetRandom16() & 31))
            {
                if (currentTile.GetValue() < TileValues.RAILBASE + 2)
                {
                    map.SetTile(x, y, TileValues.RIVER, TileFlags.NOFLAGS);
                }
                else
                {
                    map.SetTo(x, y, TileUtils.RandomRubble(simData.Random));
                }
            }
        }

        /// <summary>
        /// A seaport's centre: it counts, and powered, sends out a ship when none sails.
        /// </summary>
        private static void PortFound(GameMap map, int x, int y, SimData simData)
        {
            simData.Census.SeaportPop += 1;

            if (map.GetTile(x, y).IsPowered() && simData.SpriteManager.GetSprite(SpriteType.Ship) is null)
            {
                simData.SpriteManager.GenerateShip();
            }
        }

        /// <summary>
        /// An airport's centre: it counts, and powered, turns its radar and may send out a plane, or failing that a
        /// helicopter; unpowered, its radar stands still.
        /// </summary>
        private static void AirportFound(GameMap map, int x, int y, SimData simData)
        {
            simData.Census.AirportPop += 1;

            if (!map.GetTile(x, y).IsPowered())
            {
                map.SetTile(x + 1, y - 1, TileValues.RADAR, TileFlags.CONDBIT | TileFlags.BURNBIT);
                return;
            }

            if (map.GetTileValue(x + 1, y - 1) == TileValues.RADAR)
            {
                map.SetTile(x + 1, y - 1, TileValues.RADAR0, TileFlags.CONDBIT | TileFlags.ANIMBIT | TileFlags.BURNBIT);
            }

            if (simData.Random.GetRandom(5) == 0)
            {
                simData.SpriteManager.GeneratePlane(x, y);
                return;
            }

            if (simData.Random.GetRandom(12) == 0)
            {
                simData.SpriteManager.GenerateCopter(x, y);
            }
        }

        public static void RegisterHandlers(MapScanner mapScanner, RepairManager repairManager)
        {
            mapScanner.AddAction(TileUtils.IsRail, RailFound);
            mapScanner.AddAction(TileValues.PORT, PortFound);
            mapScanner.AddAction(TileValues.AIRPORT, AirportFound);

            repairManager.AddAction(TileValues.PORT, 15, 4);
            repairManager.AddAction(TileValues.AIRPORT, 7, 6);
        }
    }
}
