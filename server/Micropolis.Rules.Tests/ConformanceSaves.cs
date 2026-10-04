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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The saved states the TypeScript reference writes under <c>conformance/saves/</c>: each fixture's as built and
    /// after its golden run, as canonical text, at the steps <c>checkpoints.json</c> lists.
    /// </summary>
    public static class ConformanceSaves
    {
        public static IEnumerable<object[]> AllSaves => Load().Select(save => new object[] { save });

        public static IReadOnlyList<ConformanceSave> Load()
        {
            return Parse(ConformanceFile.Read("saves/checkpoints.json"));
        }

        public static IReadOnlyList<ConformanceSave> Parse(string json)
        {
            Dictionary<string, SavePoints> checkpoints = ConformanceFile.Parse<Dictionary<string, SavePoints>>(json);
            ConformanceFile.NonEmpty("saves", checkpoints);

            return checkpoints.SelectMany(fixture => new[]
            {
                new ConformanceSave(fixture.Key, "built", fixture.Value.Built),
                new ConformanceSave(fixture.Key, "run", fixture.Value.Run),
            }).ToList();
        }

        private sealed record SavePoints(int Built, int Run);
    }

    /// <summary>
    /// One fixture's saved state at one checkpoint.
    /// </summary>
    public sealed record ConformanceSave(string Fixture, string Point, int Step)
    {
        /// <summary>
        /// The canonical text of the saved state, exactly as the file holds it, whose SHA-256 is the state hash.
        /// </summary>
        public string ReadText()
        {
            return ConformanceFile.Read($"saves/{Fixture}.{Point}.json");
        }

        public override string ToString()
        {
            return $"{Fixture} {Point} (step {Step})";
        }
    }
}
