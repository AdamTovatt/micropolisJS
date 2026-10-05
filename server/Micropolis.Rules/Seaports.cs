/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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
    /// The seaports a ship sails to, each named by its centre tile. A port is a ship's destination while it stands,
    /// is powered, and has water a ship sails within two tiles of its footprint, so one ring of shore may lie between:
    /// those tiles are where a ship docks.
    /// </summary>
    internal static class Seaports
    {
        // How far from the port's footprint a ship docks
        private const int DockReach = 2;

        /// <summary>
        /// Whether the port centred at the position is one a ship sails to.
        /// </summary>
        public static bool IsValid(GameMap map, Position port)
        {
            return map.IsPositionInBounds(port) && map.GetTileValue(port) == TileValues.PORT &&
                   map.GetTile(port.X, port.Y).IsPowered() && DockTiles(map, port).Any();
        }

        /// <summary>
        /// The tiles a ship docks at by the port centred at the position, row by row from the north-west: water it
        /// sails, outside the port's footprint and within two tiles of it.
        /// </summary>
        public static IEnumerable<Position> DockTiles(GameMap map, Position port)
        {
            for (int y = port.Y - 1 - DockReach; y <= port.Y + 2 + DockReach; y++)
            {
                for (int x = port.X - 1 - DockReach; x <= port.X + 2 + DockReach; x++)
                {
                    bool onFootprint = x >= port.X - 1 && x <= port.X + 2 && y >= port.Y - 1 && y <= port.Y + 2;

                    if (!onFootprint && map.TestBounds(x, y) && Waterways.IsSailable(map.GetTileValue(x, y)))
                    {
                        yield return new Position(x, y);
                    }
                }
            }
        }

        /// <summary>
        /// The ports a ship sails to, row by row from the north-west.
        /// </summary>
        public static IReadOnlyList<Position> ValidPorts(GameMap map)
        {
            List<Position> ports = [];

            for (int y = 0; y < map.Height; y++)
            {
                for (int x = 0; x < map.Width; x++)
                {
                    Position port = new Position(x, y);

                    if (IsValid(map, port))
                    {
                        ports.Add(port);
                    }
                }
            }

            return ports;
        }
    }
}
