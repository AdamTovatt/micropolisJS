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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// A trip read back into the tiles it stands on, as the client reads it.
    /// </summary>
    internal static class TripRoutes
    {
        /// <summary>
        /// Every tile the trip stands on, in order: its start, then the tile each step takes it to.
        /// </summary>
        public static List<TilePosition> Tiles(Trip trip)
        {
            Position tile = new Position(trip.X, trip.Y);
            List<TilePosition> tiles = [new TilePosition(tile.X, tile.Y)];
            foreach (char step in trip.Steps)
            {
                tile = Position.Move(tile, Direction.CardinalDirections[Trip.StepLetters.IndexOf(step)]);
                tiles.Add(new TilePosition(tile.X, tile.Y));
            }

            return tiles;
        }

        /// <summary>
        /// Every tile the ride stands on, in order: the station it gets on at, then the tile each step takes it to.
        /// </summary>
        public static List<TilePosition> Tiles(Ride ride)
        {
            return Tiles(ride.Path);
        }
    }
}
