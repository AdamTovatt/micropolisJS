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
    /// Rail, the seaport and the airport, as <c>src/transport.js</c> runs them and sends out their sprites.
    /// </summary>
    public static class Transport
    {
        public static void RailFound(GameMap map, int x, int y, SimData simData)
        {
            throw new NotPortedException("transport.railFound");
        }

        public static void PortFound(GameMap map, int x, int y, SimData simData)
        {
            throw new NotPortedException("transport.portFound");
        }

        public static void AirportFound(GameMap map, int x, int y, SimData simData)
        {
            throw new NotPortedException("transport.airportFound");
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
