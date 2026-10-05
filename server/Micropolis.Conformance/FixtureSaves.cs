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

using Micropolis.Rules;

namespace Micropolis.Conformance
{
    /// <summary>
    /// A checkpoint of a fixture at which the fixture tool writes its saved state under <c>saves/</c>:
    /// <see cref="FixtureSaves.Built"/> at its first, the city as its commands build it, or
    /// <see cref="FixtureSaves.Run"/> at its last, after its run.
    /// </summary>
    public sealed record FixtureSavePoint(string Fixture, string Point, long Step)
    {
        /// <summary>
        /// The save's name, such as <c>town.built</c>, which the conformance files that name a save use.
        /// </summary>
        public string Name => $"{Fixture}.{Point}";

        public string FilePath(ConformanceDirectories directories)
        {
            return Path.Combine(directories.Saves, $"{Name}.json");
        }

        /// <summary>
        /// The committed file's text: the canonical text of the saved state alone, whose SHA-256 is the state hash.
        /// </summary>
        public string ReadCommitted()
        {
            return File.ReadAllText(FilePath(ConformanceDirectories.Committed));
        }

        public override string ToString()
        {
            return $"{Fixture} {Point} (step {Step})";
        }
    }

    /// <summary>
    /// A fixture's saved state at one of its checkpoints, as canonical text, so the file's SHA-256 is the checkpoint's
    /// hash.
    /// </summary>
    public sealed record FixtureSave(FixtureSavePoint At, string Text)
    {
        public override string ToString()
        {
            return At.ToString();
        }
    }

    /// <summary>
    /// The saves the fixture tool writes under <c>saves/</c> beside the logs, which the rules' tests, the benchmark,
    /// the headless runner and the tool's runs and speed gates start cities from: each fixture's state as built and
    /// after its run, at the steps of its first and last checkpoints.
    /// </summary>
    public static class FixtureSaves
    {
        public const string Built = "built";
        public const string Run = "run";

        /// <summary>
        /// Every fixture's save points, in the order of <see cref="Fixtures.All"/>, as built then after its run.
        /// </summary>
        public static IReadOnlyList<FixtureSavePoint> All => Fixtures.All.SelectMany(PointsOf).ToList();

        public static IReadOnlyList<FixtureSavePoint> PointsOf(Fixture fixture)
        {
            return [new FixtureSavePoint(fixture.Name, Built, fixture.CheckpointSteps[0]),
                    new FixtureSavePoint(fixture.Name, Run, fixture.CheckpointSteps[^1])];
        }

        /// <summary>
        /// The named fixture's save point, <see cref="Built"/> or <see cref="Run"/>.
        /// </summary>
        public static FixtureSavePoint At(string fixture, string point)
        {
            return PointsOf(Fixtures.Named(fixture)).SingleOrDefault(candidate => candidate.Point == point)
                   ?? throw new ArgumentException($"No save point {point}: a fixture's are {Built} and {Run}");
        }

        /// <summary>
        /// The fixture's saves, a fixture that starts from a save reading it from its log in
        /// <paramref name="directories"/>.
        /// </summary>
        public static IReadOnlyList<FixtureSave> Build(Fixture fixture, ConformanceDirectories directories)
        {
            LogStart start = fixture.Start(directories);

            return PointsOf(fixture)
                .Select(point => new FixtureSave(point, CanonicalJson.Write(LogReplay.Run(start, fixture.Entries, [], point.Step).City.Save())))
                .ToList();
        }

        /// <summary>
        /// Every fixture's saves, in the order of <see cref="All"/>.
        /// </summary>
        public static IReadOnlyList<FixtureSave> BuildAll(ConformanceDirectories directories)
        {
            return Fixtures.All.SelectMany(fixture => Build(fixture, directories)).ToList();
        }

        /// <summary>
        /// The city a fixture's save holds, from the save's <paramref name="text"/>, running at
        /// <paramref name="speed"/> in place of the speed it was saved at, or at the saved speed when none is given.
        /// </summary>
        // It lives here, beside the saves it starts, for the runner and the tool's runs and speed gates alike, as #126
        // decided, rather than in the headless runner
        public static Simulation StartCity(string text, Speed? speed)
        {
            Simulation city = Simulation.FromSave(text);

            if (speed is Speed running)
            {
                city.SetSpeed(running);
            }

            return city;
        }

        /// <summary>
        /// The text of the named fixture's save at the point among <paramref name="saves"/>.
        /// </summary>
        public static string TextOf(IReadOnlyList<FixtureSave> saves, string fixture, string point)
        {
            string name = $"{fixture}.{point}";
            return saves.SingleOrDefault(save => save.At.Name == name)?.Text
                   ?? throw new InvalidDataException($"No save {name} among the fixtures' saves.");
        }
    }
}
