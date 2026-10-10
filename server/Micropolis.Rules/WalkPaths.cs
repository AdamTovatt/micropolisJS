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
    /// The way a walk of a route goes over the ninths of its tiles: what the client draws its walker along, and so the
    /// crossings the traffic rule adds the walk's walkers to (<see cref="BlockMaps.FootLoadMap"/>), those the client's
    /// cars give way to it on. On each tile the walk keeps to the ninths the route may walk there
    /// (<see cref="RouteStep.Ninths"/>), a piece of walkway's or, across open land, all of them. It goes in by the ninth
    /// across from the one it left the tile before by, or where it starts, by the ninth along the side facing the zone
    /// or the station it comes from nearest that side's middle, and leaves by the nearest ninth along the side facing
    /// the next tile that touches one of the next tile's, or where it ends, along the side facing the zone or the
    /// station it goes to, going the shortest way between, so it crosses a road only where the route took a crossing.
    /// </summary>
    /// <remarks>
    /// Every way the router hands one step of a walk on to the next leaves the two tiles' ninths touching across their
    /// sides, and every way it starts or ends one leaves the ninths along the side facing the zone or the station, so
    /// each tile has a ninth to go in by and one to leave by, joined within the tile's ninths, which a piece always is.
    /// </remarks>
    internal static class WalkPaths
    {
        /// <summary>
        /// Fills <paramref name="ninths"/>, on the map's grid of ninths, with each ninth the walk over the route's tiles
        /// from <paramref name="start"/> up to <paramref name="end"/> goes through, in order, each beside the one before.
        /// </summary>
        public static void Fill(TripRoute route, int start, int end, List<Position> ninths)
        {
            ninths.Clear();
            List<RouteStep> steps = route.Steps;
            Span<int> trail = stackalloc int[Walkways.Ninths];

            for (int i = start; i < end; i++)
            {
                RouteStep step = steps[i];
                int inSide = i > 0 ? SideToward(step.Tile, steps[i - 1].Tile) : route.FromSide;
                int outSide = i + 1 < steps.Count ? SideToward(step.Tile, steps[i + 1].Tile) : route.ToSide;

                int from = i > start
                    ? 1 << Across(ninths[^1], step.Tile)
                    : 1 << Walkways.NinthAlong(inSide, NearestMiddle(Walkways.Edge(step.Ninths, inSide)));

                int places = Walkways.Edge(step.Ninths, outSide);
                if (i + 1 < end)
                {
                    places &= Walkways.Edge(steps[i + 1].Ninths, TileUtils.OppositeSide(outSide));
                }

                int length = Shortest(step.Ninths, from, NinthsAt(places, outSide), trail);
                for (int n = 0; n < length; n++)
                {
                    ninths.Add(new Position(step.Tile.X * Walkways.Side + trail[n] % Walkways.Side,
                                            step.Tile.Y * Walkways.Side + trail[n] / Walkways.Side));
                }
            }
        }

        // The side of a tile facing the tile beside it given
        private static int SideToward(Position tile, Position beside)
        {
            return TileUtils.OppositeSide(TileUtils.SideEnteredBy(tile, beside));
        }

        // Of the places along a side given, a bit for each, the one nearest its middle, the first of those as near
        private static int NearestMiddle(int places)
        {
            return (places & 2) != 0 ? 1 : (places & 1) != 0 ? 0 : 2;
        }

        // The ninths along the side given at the places along it given, a bit for each, numbered as Walkways.Edge says
        private static int NinthsAt(int places, int side)
        {
            int ninths = 0;
            for (int place = 0; place < Walkways.Side; place++)
            {
                if ((places & (1 << place)) != 0)
                {
                    ninths |= 1 << Walkways.NinthAlong(side, place);
                }
            }

            return ninths;
        }

        // The ninth of the tile given across its edge from the ninth given, on the map's grid of ninths, of the tile
        // beside
        private static int Across(Position ninth, Position tile)
        {
            int x = Math.Clamp(ninth.X - tile.X * Walkways.Side, 0, Walkways.Side - 1);
            int y = Math.Clamp(ninth.Y - tile.Y * Walkways.Side, 0, Walkways.Side - 1);
            return y * Walkways.Side + x;
        }

        // Fills trail with the shortest way within the mask from a ninth of from to one of to, both ends included, and
        // gives its length: by breadth first, each ninth's neighbours taken in their order, so ties go the same way every
        // time
        private static int Shortest(int mask, int from, int to, Span<int> trail)
        {
            Span<int> cameFrom = stackalloc int[Walkways.Ninths];
            Span<int> queue = stackalloc int[Walkways.Ninths];
            cameFrom.Fill(-2);
            int head = 0;
            int tail = 0;
            for (int ninth = 0; ninth < Walkways.Ninths; ninth++)
            {
                if ((from & mask & (1 << ninth)) != 0)
                {
                    cameFrom[ninth] = -1;
                    queue[tail++] = ninth;
                }
            }

            int reached = -1;
            while (head < tail)
            {
                int at = queue[head++];
                if ((to & (1 << at)) != 0)
                {
                    reached = at;
                    break;
                }

                int beside = Walkways.Neighbours(1 << at) & mask;
                for (int next = 0; next < Walkways.Ninths; next++)
                {
                    if ((beside & (1 << next)) != 0 && cameFrom[next] == -2)
                    {
                        cameFrom[next] = at;
                        queue[tail++] = next;
                    }
                }
            }

            if (reached < 0)
            {
                throw new InvalidOperationException($"A walk's ninths {mask} join no ninth of {from} to one of {to}.");
            }

            int length = 0;
            for (int ninth = reached; ninth >= 0; ninth = cameFrom[ninth])
            {
                trail[length++] = ninth;
            }

            trail[..length].Reverse();
            return length;
        }
    }
}
