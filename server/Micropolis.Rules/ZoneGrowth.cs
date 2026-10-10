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
    /// What a zone handler reads of a zone it assesses, were the zone's trip to find a route: the demand for its kind and
    /// its location score, the two terms of its zone score (<see cref="ZoneUtils.ZoneScore"/>), with the blocker that
    /// names a location score below zero, if its kind has one; whether its centre has power; whether it is assessed only
    /// now and then; whether it has people for a decline to take away; and what its grow step would refuse it for.
    /// </summary>
    internal sealed record ZoneFacts(
        long Demand, int LocationScore, GrowthBlocker? LocationBlocker, bool Powered, bool AssessedNowAndThen,
        bool CanDegrade, IReadOnlyList<GrowthBlocker> GrowStepBlockers);

    /// <summary>
    /// The query tool's report on how the zone holding a tile grows.
    /// </summary>
    public static class ZoneGrowth
    {
        /// <summary>
        /// The growth of the residential, commercial or industrial zone whose footprint holds the tile at (x, y), as the
        /// rules assess it at its centre, or <see langword="null"/> for a tile of no such zone.
        /// </summary>
        public static ZoneGrowthReport? Report(Simulation city, int x, int y)
        {
            if (ZoneUtils.ZoneCentre(city.Map, x, y) is not Position centre)
            {
                return null;
            }

            Tile tile = city.Map.GetTile(centre.X, centre.Y);
            ZoneFacts? facts = null;

            if (TileUtils.IsResidentialZone(tile))
            {
                facts = Residential.Facts(city.Map, centre.X, centre.Y, city.BlockMaps, city.Valves);
            }
            else if (TileUtils.IsCommercialZone(tile))
            {
                facts = Commercial.Facts(city.Map, centre.X, centre.Y, city.BlockMaps, city.Valves);
            }
            else if (TileUtils.IsIndustrialZone(tile))
            {
                facts = Industrial.Facts(city.Map, centre.X, centre.Y, city.Valves);
            }

            if (facts is null)
            {
                return null;
            }

            long score = Score(facts, facts.Powered);

            // A trip from a zone with no way out at its edge finds no road, which declines the zone, unless it walks
            bool wayAtEdge = city.TrafficManager.HasWayAtEdge(centre);

            return new ZoneGrowthReport(
                Queries.ZoneCategory(tile.GetValue()), centre.X, centre.Y, score, Outlook(facts, score),
                facts.AssessedNowAndThen, wayAtEdge, Blockers(facts));
        }

        // The zone score the handler would assess the zone by, with power or without
        private static long Score(ZoneFacts facts, bool powered, long? demand = null, int? locationScore = null)
        {
            return ZoneUtils.ZoneScore(demand ?? facts.Demand, locationScore ?? facts.LocationScore, TrafficResult.RouteFound, powered);
        }

        // What the handler can do with the zone at the score: grow it only where the score lets it and its grow step
        // refuses it for nothing, and decline it only where the score lets it and it has people to lose
        private static GrowthOutlook Outlook(ZoneFacts facts, long score)
        {
            return ZoneUtils.Outlook(ZoneUtils.CanGrow(score) && facts.GrowStepBlockers.Count == 0,
                                     ZoneUtils.CanDecline(score) && facts.CanDegrade);
        }

        // Every condition that stops the zone growing, and each term of its score below zero that, at zero, would better
        // where it stands once powered. Where none would on its own and still nothing is named, though the zone isn't
        // likely to grow, the term furthest below zero is named, so a zone held back never shows no reason.
        private static List<GrowthBlocker> Blockers(ZoneFacts facts)
        {
            List<GrowthBlocker> blockers = [.. facts.GrowStepBlockers];

            if (!facts.Powered)
            {
                blockers.Add(GrowthBlocker.NoPower);
            }

            GrowthOutlook powered = Outlook(facts, Score(facts, true));
            List<(GrowthBlocker Blocker, long Term, GrowthOutlook AtZero)> terms = [];

            if (facts.Demand < 0)
            {
                terms.Add((GrowthBlocker.LowDemand, facts.Demand, Outlook(facts, Score(facts, true, demand: 0))));
            }

            if (facts.LocationBlocker is GrowthBlocker location && facts.LocationScore < 0)
            {
                terms.Add((location, facts.LocationScore, Outlook(facts, Score(facts, true, locationScore: 0))));
            }

            // The outlooks run best first
            List<GrowthBlocker> worsening = terms.Where(term => term.AtZero < powered).Select(term => term.Blocker).ToList();
            blockers.AddRange(worsening);

            // With nothing named, the zone has power, so its outlook is the powered one
            if (blockers.Count == 0 && terms.Count > 0 && powered != GrowthOutlook.LikelyToGrow)
            {
                blockers.Add(terms.MinBy(term => term.Term).Blocker);
            }

            return blockers.Order().ToList();
        }
    }
}
