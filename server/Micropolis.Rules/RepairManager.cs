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
    /// Restores the tiles of the zones it is given, as <c>src/repairManager.js</c> does: the map scan checks each zone
    /// centre, and a zone whose criterion matches is repaired every time the city time clears its period's bits.
    /// </summary>
    public sealed class RepairManager
    {
        private readonly GameMap _map;
        private readonly List<RepairAction> _actions = new List<RepairAction>();

        public RepairManager(GameMap map)
        {
            _map = map;
        }

        /// <summary>
        /// Repairs a zone of <paramref name="zoneSize"/> tiles a side whose centre has the tile value, each time
        /// <c>cityTime &amp; period</c> is 0.
        /// </summary>
        public void AddAction(int tileValue, int period, int zoneSize)
        {
            AddAction(tile => tile.GetValue() == tileValue, period, zoneSize);
        }

        /// <summary>
        /// Repairs a zone whose centre tile meets the criterion, as <see cref="AddAction(int, int, int)"/> does.
        /// </summary>
        public void AddAction(Func<Tile, bool> criterion, int period, int zoneSize)
        {
            _actions.Add(new RepairAction(criterion, period, zoneSize));
        }

        /// <summary>
        /// Forgets every action, so the simulation can register handler families anew.
        /// </summary>
        internal void ClearActions()
        {
            _actions.Clear();
        }

        public void RepairZone(int x, int y, int zoneSize)
        {
            int centre = _map.GetTileValue(x, y);
            int tileValue = centre - zoneSize - 2;

            for (int yy = -1; yy < zoneSize - 1; yy++)
            {
                for (int xx = -1; xx < zoneSize - 1; xx++)
                {
                    tileValue++;

                    Tile current = _map.GetTile(x + xx, y + yy);
                    if (current.IsZone() || current.IsAnimated())
                    {
                        continue;
                    }

                    int currentValue = current.GetValue();
                    if (currentValue < TileValues.RUBBLE || currentValue >= TileValues.ROADBASE)
                    {
                        _map.SetTile(x + xx, y + yy, tileValue, TileFlags.CONDBIT | TileFlags.BURNBIT);
                    }
                }
            }
        }

        /// <summary>
        /// Repairs the zone centred at (x, y) once for each action that matches it and is due at the city time.
        /// </summary>
        public void CheckTile(int x, int y, long cityTime)
        {
            foreach (RepairAction current in _actions)
            {
                // The period's bits are the low bits, which a JavaScript number's int32 conversion keeps
                if ((cityTime & current.Period) != 0)
                {
                    continue;
                }

                if (current.Criterion(_map.GetTile(x, y)))
                {
                    RepairZone(x, y, current.ZoneSize);
                }
            }
        }

        private sealed record RepairAction(Func<Tile, bool> Criterion, int Period, int ZoneSize);
    }
}
