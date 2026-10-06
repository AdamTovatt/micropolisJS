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

using System.Text.Json.Serialization;

// The answers to the queries a player sends the simulation, as QueryAnswer in src/protocol.ts defines them.
// protocol/README.md describes them. The simulation reads a query as it arrived with Queries, which validates it, and
// writes each answer field by field in the protocol's order, its type first.

namespace Micropolis.Rules
{
    /// <summary>
    /// The answer to a query, or its rejection, named by its <c>type</c> field, which comes first.
    /// </summary>
    public abstract record QueryAnswer
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public abstract string Type { get; }
    }

    /// <summary>
    /// A layer's values over the map in square blocks of <paramref name="BlockSize"/> tiles a side,
    /// <paramref name="Width"/> blocks across and <paramref name="Height"/> down, row by row, top row first.
    /// <paramref name="Low"/> and <paramref name="High"/> are the ends of the layer's range.
    /// </summary>
    public sealed record OverlayAnswer(
        [property: JsonPropertyName("layer")] string Layer,
        [property: JsonPropertyName("blockSize")] int BlockSize,
        [property: JsonPropertyName("width")] int Width,
        [property: JsonPropertyName("height")] int Height,
        [property: JsonPropertyName("low")] int Low,
        [property: JsonPropertyName("high")] int High,
        [property: JsonPropertyName("values")] IReadOnlyList<int> Values) : QueryAnswer
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "overlay";
    }

    /// <summary>
    /// What the query tool reports about a tile, as raw values: <c>TileReportAnswer</c> in <c>src/protocol.ts</c>,
    /// which says what each value is.
    /// </summary>
    /// <param name="Tile">The tile's value without its flags.</param>
    /// <param name="Category">What the query tool calls the tile, one of <c>ZONE_CATEGORIES</c>.</param>
    public sealed record TileReportAnswer(
        [property: JsonPropertyName("x")] int X,
        [property: JsonPropertyName("y")] int Y,
        [property: JsonPropertyName("tile")] int Tile,
        [property: JsonPropertyName("category")] string Category,
        [property: JsonPropertyName("populationDensity")] int PopulationDensity,
        [property: JsonPropertyName("landValue")] int LandValue,
        [property: JsonPropertyName("crime")] int Crime,
        [property: JsonPropertyName("pollution")] int Pollution,
        [property: JsonPropertyName("rateOfGrowth")] int RateOfGrowth,
        [property: JsonPropertyName("burnable")] bool Burnable,
        [property: JsonPropertyName("bulldozable")] bool Bulldozable,
        [property: JsonPropertyName("conductive")] bool Conductive,
        [property: JsonPropertyName("animated")] bool Animated,
        [property: JsonPropertyName("powered")] bool Powered,
        [property: JsonPropertyName("zoneCentre")] bool ZoneCentre,
        [property: JsonPropertyName("fireStationMap")] int FireStationMap,
        [property: JsonPropertyName("fireCoverage")] int FireCoverage,
        [property: JsonPropertyName("policeStationMap")] int PoliceStationMap,
        [property: JsonPropertyName("policeCoverage")] int PoliceCoverage,
        [property: JsonPropertyName("terrainDensity")] int TerrainDensity,
        [property: JsonPropertyName("trafficDensity")] int TrafficDensity,
        [property: JsonPropertyName("cityCentreScore")] int CityCentreScore,
        [property: JsonPropertyName("growth")] ZoneGrowthReport? Growth) : QueryAnswer
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "tileReport";
    }

    /// <summary>
    /// How the residential, commercial or industrial zone holding a reported tile grows, as the rules assess it at its
    /// centre were its trip to find a route: <c>ZoneGrowthReport</c> in <c>src/protocol.ts</c>, which says what each
    /// value is.
    /// </summary>
    /// <param name="Zone">The zone's category, <c>RESIDENTIAL</c>, <c>COMMERCIAL</c> or <c>INDUSTRIAL</c>.</param>
    /// <param name="X">The zone centre's x.</param>
    /// <param name="Y">The zone centre's y.</param>
    /// <param name="Score">The zone score the handler would assess it by.</param>
    /// <param name="Outlook">Where it stands: what its handler can do with it at that score and as it is.</param>
    /// <param name="AssessedNowAndThen">Whether the handler assesses it only now and then.</param>
    /// <param name="RoadAtEdge">Whether a road or rail lies on its perimeter, without which the next trip its people make
    /// declines it, though a zone with no people makes none.</param>
    /// <param name="Blockers">What holds back its growth, in the order of <see cref="GrowthBlocker"/>.</param>
    public sealed record ZoneGrowthReport(
        [property: JsonPropertyName("zone")] string Zone,
        [property: JsonPropertyName("x")] int X,
        [property: JsonPropertyName("y")] int Y,
        [property: JsonPropertyName("score")] long Score,
        [property: JsonPropertyName("outlook")] GrowthOutlook Outlook,
        [property: JsonPropertyName("assessedNowAndThen")] bool AssessedNowAndThen,
        [property: JsonPropertyName("roadAtEdge")] bool RoadAtEdge,
        [property: JsonPropertyName("blockers")] IReadOnlyList<GrowthBlocker> Blockers);

    /// <summary>
    /// The budget now, and what the year end would do with the funding and tax rate asked about: what each service would
    /// cost, the taxes it would take in, the change in funds, and the funds it would leave.
    /// </summary>
    public sealed record BudgetForecastAnswer(
        [property: JsonPropertyName("budget")] BudgetRecord Budget,
        [property: JsonPropertyName("costs")] ServiceAmounts<long> Costs,
        [property: JsonPropertyName("taxes")] long Taxes,
        [property: JsonPropertyName("fundsChange")] long FundsChange,
        [property: JsonPropertyName("fundsAfterYear")] long FundsAfterYear) : QueryAnswer
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "budgetForecast";
    }

    /// <summary>
    /// The map a game seed generates, as each tile's raw value, with its flags, row by row, top row first.
    /// </summary>
    public sealed record MapPreviewAnswer(
        [property: JsonPropertyName("seed")] uint Seed,
        [property: JsonPropertyName("width")] int Width,
        [property: JsonPropertyName("height")] int Height,
        [property: JsonPropertyName("tiles")] IReadOnlyList<int> Tiles) : QueryAnswer
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "mapPreview";
    }

    /// <summary>
    /// A query the simulation could not answer, and why.
    /// </summary>
    public sealed record QueryRejection(
        [property: JsonPropertyName("reason")] string Reason) : QueryAnswer
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "rejected";
    }
}
