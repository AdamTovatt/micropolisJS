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
    /// Police and fire stations, as <c>src/emergencyServices.js</c> notes their cover.
    /// </summary>
    public static class EmergencyServices
    {
        public static void PoliceStationFound(GameMap map, int x, int y, SimData simData)
        {
            throw new NotPortedException("emergencyServices.policeStationFound");
        }

        public static void FireStationFound(GameMap map, int x, int y, SimData simData)
        {
            throw new NotPortedException("emergencyServices.fireStationFound");
        }

        public static void RegisterHandlers(MapScanner mapScanner, RepairManager repairManager)
        {
            mapScanner.AddAction(TileValues.POLICESTATION, PoliceStationFound);
            mapScanner.AddAction(TileValues.FIRESTATION, FireStationFound);
        }
    }
}
