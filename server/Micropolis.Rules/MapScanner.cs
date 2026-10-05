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
    /// A tile handler, called by the map scan with the map, the tile's position and the simulation's data.
    /// </summary>
    public delegate void TileHandler(GameMap map, int x, int y, SimData simData);

    /// <summary>
    /// The map scan, as <c>mapScan</c> in the original's simulate.cpp, which phases 1–8 run over one eighth of the
    /// map's columns each. For every tile from <see cref="TileValues.FLOOD"/> up it runs the scan's core, then the
    /// first handler whose criterion matches the tile, in the order the handlers were added.
    /// </summary>
    public sealed class MapScanner
    {
        private readonly GameMap _map;
        private readonly List<ScanAction> _actions = new List<ScanAction>();

        // The tile being scanned, a copy of the map's: the core and the criteria read the tile as the scan found it
        private readonly Tile _tile = new Tile();

        public MapScanner(GameMap map)
        {
            _map = map;
        }

        /// <summary>
        /// Calls the handler for a tile of this value, unless a handler added before matches it.
        /// </summary>
        public void AddAction(int tileValue, TileHandler action)
        {
            AddAction(tile => tile.GetValue() == tileValue, action);
        }

        /// <summary>
        /// Calls the handler for a tile that meets the criterion, unless a handler added before matches it.
        /// </summary>
        public void AddAction(Func<Tile, bool> criterion, TileHandler action)
        {
            _actions.Add(new ScanAction(criterion, action));
        }

        /// <summary>
        /// Scans the columns from <paramref name="startX"/> up to but not including <paramref name="maxX"/>, row by
        /// row from the top.
        /// </summary>
        public void MapScan(int startX, int maxX, SimData simData)
        {
            for (int y = 0; y < _map.Height; y++)
            {
                for (int x = startX; x < maxX; x++)
                {
                    _map.GetTile(x, y, _tile);
                    int tileValue = _tile.GetValue();

                    if (tileValue < TileValues.FLOOD)
                    {
                        continue;
                    }

                    if (_tile.IsConductive())
                    {
                        simData.PowerManager.SetTilePower(x, y);
                    }

                    if (_tile.IsZone())
                    {
                        simData.RepairManager.CheckTile(x, y, simData.CityTime);

                        // Read from the copy, so as the tile was before the power was set
                        bool powered = _tile.IsPowered();
                        if (powered)
                        {
                            simData.Census.PoweredZoneCount += 1;
                        }
                        else
                        {
                            simData.Census.UnpoweredZoneCount += 1;
                        }
                    }

                    foreach (ScanAction current in _actions)
                    {
                        if (current.Criterion(_tile))
                        {
                            current.Action(_map, x, y, simData);
                            break;
                        }
                    }
                }
            }
        }

        private sealed record ScanAction(Func<Tile, bool> Criterion, TileHandler Action);
    }
}
