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
    /// A trip read back into the tiles it stands on, as the client reads it, and routes built by hand.
    /// </summary>
    internal static class TripRoutes
    {
        /// <summary>
        /// The mask of the ninths given, numbered row by row from a tile's north-west corner.
        /// </summary>
        public static int Mask(params int[] ninths)
        {
            return ninths.Aggregate(0, (mask, ninth) => mask | (1 << ninth));
        }

        /// <summary>
        /// Steps over the tiles given in turn, every one the way given: by road or rail on no ninths, and on foot across
        /// open land, on every ninth.
        /// </summary>
        public static List<RouteStep> By(TravelMode mode, params (int X, int Y)[] tiles)
        {
            int ninths = mode == TravelMode.Walk ? Walkways.AllNinths : 0;
            return tiles.Select(tile => new RouteStep(new Position(tile.X, tile.Y), mode, ninths)).ToList();
        }

        /// <summary>
        /// Steps on foot over the tiles given in turn, along the ninths given of each.
        /// </summary>
        public static List<RouteStep> Walking(int[] ninths, params (int X, int Y)[] tiles)
        {
            return tiles.Select(tile => new RouteStep(new Position(tile.X, tile.Y), TravelMode.Walk, Mask(ninths))).ToList();
        }

        /// <summary>
        /// The route of the legs given in turn, from a zone across the side given of its first tile to one across the
        /// side given of its last.
        /// </summary>
        public static TripRoute Route(int fromSide, int toSide, params List<RouteStep>[] legs)
        {
            TripRoute route = new TripRoute { FromSide = fromSide, ToSide = toSide };
            route.Steps.AddRange(legs.SelectMany(leg => leg));
            return route;
        }

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
