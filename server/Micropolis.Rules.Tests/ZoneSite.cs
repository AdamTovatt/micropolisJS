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

using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// A site on open land east of the suburb where a test lays a powered zone of a kind that makes trips: a road at the
    /// first tile of its perimeter, one west and two north of its centre, which goes on west a tile, beside a destination
    /// of the zone's kind whose footprint's south-east corner is north of the road's second tile, and not of its first,
    /// so a trip from the zone finds a route to it.
    /// </summary>
    internal static class ZoneSite
    {
        public const int ZoneX = 110;
        public const int ZoneY = 20;
        public const int RoadX = ZoneX - 1;
        public const int RoadY = ZoneY - 2;
        public const int DestinationX = RoadX - 2;
        public const int DestinationY = RoadY - 2;

        // The site's bounds, from the destination's footprint to three tiles east of the zone's centre, where the suburb
        // must have built nothing, no road, rail or zone, for the site to mean what the tests take it to. Its land and
        // water are what the zones and the road are laid over.
        private const int Left = DestinationX - 1;
        private const int Top = DestinationY - 1;
        private const int Right = ZoneX + 3;
        private const int Bottom = ZoneY + 1;

        /// <summary>
        /// Demand strong enough that a zone at a good location grows, and is never declined by its score.
        /// </summary>
        public const long StrongDemand = 1500;

        public static readonly IReadOnlyDictionary<string, ZoneKind> Kinds = new Dictionary<string, ZoneKind>
        {
            ["residential"] = new ZoneKind(
                FREEZ, RZB, 35, TrafficDestination.Commercial, COMCLR, Residential.ResidentialFound, Residential.GetZonePopulation,
                (valves, demand) => valves.ResValve = demand),
            ["commercial"] = new ZoneKind(
                COMCLR, CZB, 5, TrafficDestination.Industrial, IZB, Commercial.CommercialFound, Commercial.GetZonePopulation,
                (valves, demand) => valves.ComValve = demand),
            ["industrial"] = new ZoneKind(
                INDCLR, IZB, 5, TrafficDestination.Residential, RZB, Industrial.IndustrialFound, Industrial.GetZonePopulation,
                (valves, demand) => valves.IndValve = demand),
        };

        /// <summary>
        /// The suburb as built, with a powered zone of the kind whose centre is given laid on the site, its destination
        /// and its road, whose second tile's block carries the traffic given.
        /// </summary>
        public static Simulation City(ZoneKind kind, int centre, int roadTraffic = 0)
        {
            Simulation city = FixtureCities.City("suburb", "built");

            for (int y = Top; y <= Bottom; y++)
            {
                for (int x = Left; x <= Right; x++)
                {
                    Assert.IsTrue(city.Map.GetTileValue(x, y) < ROADBASE, $"the suburb has built at ({x}, {y}), on the zone site");
                }
            }

            ZoneUtils.PutZone(city.Map, ZoneX, ZoneY, centre, true);
            ZoneUtils.PutZone(city.Map, DestinationX, DestinationY, kind.DestinationCentre, true);
            city.Map.SetTile(RoadX, RoadY, ROADS, 0);
            city.Map.SetTile(RoadX - 1, RoadY, ROADS, 0);
            city.BlockMaps.TrafficDensityMap.WorldSet(RoadX - 1, RoadY, roadTraffic);
            return city;
        }

        /// <summary>
        /// The population of the zone on the site, as its kind counts it.
        /// </summary>
        public static int Population(Simulation city, ZoneKind kind)
        {
            return kind.Population(city.Map, ZoneX, ZoneY, city.Map.GetTileValue(ZoneX, ZoneY));
        }
    }

    /// <summary>
    /// A kind of zone that makes trips: its empty centre and the centre of its lowest built density, the draw its
    /// population must pass to make a trip, the destination its trips go to and a centre of that kind, its handler, its
    /// population, and how to set the demand for it.
    /// </summary>
    internal sealed record ZoneKind(
        int EmptyCentre, int BuiltCentre, int TripChance, TrafficDestination Destination, int DestinationCentre,
        Action<GameMap, int, int, SimData> Found, Func<GameMap, int, int, int, int> Population, Action<Valves, long> SetDemand);
}
