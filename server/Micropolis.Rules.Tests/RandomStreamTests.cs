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

namespace Micropolis.Rules.Tests
{
    [TestClass]
    public sealed class RandomStreamTests
    {
        private static readonly RandomVectors Vectors = RandomVectors.Load();

        public static IEnumerable<object[]> SeedVectors => Vectors.Seeds.Select(vector => new object[] { vector });

        [TestMethod]
        [DynamicData(nameof(SeedVectors))]
        public void FromSeed_ReferenceSeed_FillsStateWithSplitMix64(SeedVector vector)
        {
            CollectionAssert.AreEqual(vector.Seeded, RandomStream.FromSeed(vector.Seed).GetState());
        }

        [TestMethod]
        [DynamicData(nameof(SeedVectors))]
        public void Next_ReferenceSeed_DrawsReferenceOutputs(SeedVector vector)
        {
            RandomStream random = RandomStream.FromSeed(vector.Seed);

            CollectionAssert.AreEqual(vector.Outputs, Draws(vector.Outputs.Length, random.Next));
        }

        [TestMethod]
        [DynamicData(nameof(SeedVectors))]
        public void Jump_ReferenceSeed_ReachesReferenceState(SeedVector vector)
        {
            RandomStream random = RandomStream.FromSeed(vector.Seed);
            random.Jump();

            CollectionAssert.AreEqual(vector.Jumped, random.GetState());
        }

        [TestMethod]
        [DynamicData(nameof(SeedVectors))]
        public void SimulationStream_ReferenceSeed_StartsFromJumpedState(SeedVector vector)
        {
            CollectionAssert.AreEqual(vector.Jumped, RandomStream.SimulationStream(vector.Seed).GetState());
        }

        [TestMethod]
        [DynamicData(nameof(SeedVectors))]
        public void MapStream_ReferenceSeed_StartsFromSeededState(SeedVector vector)
        {
            CollectionAssert.AreEqual(vector.Seeded, RandomStream.MapStream(vector.Seed).GetState());
        }

        [TestMethod]
        public void GetRandom_ReferenceSeed_DrawsReferenceOutputs()
        {
            GetRandomVector vector = Vectors.GetRandom;
            RandomStream random = RandomStream.FromSeed(vector.Seed);
            int[] results = vector.Maxima
                .SelectMany(max => Draws(vector.CallsPerMaximum, () => random.GetRandom(max)))
                .ToArray();

            CollectionAssert.AreEqual(vector.Outputs, results);
        }

        [TestMethod]
        public void GetRandom_DrawEqualToLargestMultipleOfRange_RejectsIt()
        {
            MaximumVector vector = Vectors.GetRandomAtTheBoundary;
            RandomStream random = RandomStream.FromSeed(vector.Seed);
            int range = vector.Maximum + 1;

            // The vector is at the boundary only while its seed's first draw is the largest multiple of the range
            Assert.AreEqual(0xffff / range * range, RandomStream.FromSeed(vector.Seed).GetRandom16());
            CollectionAssert.AreEqual(vector.Outputs, Draws(vector.Outputs.Length, () => random.GetRandom(vector.Maximum)));
        }

        [TestMethod]
        public void GetRandom16Signed_ReferenceSeed_DrawsReferenceOutputs()
        {
            DrawVector vector = Vectors.GetRandom16Signed;
            RandomStream random = RandomStream.FromSeed(vector.Seed);

            CollectionAssert.AreEqual(vector.Outputs, Draws(vector.Outputs.Length, random.GetRandom16Signed));
        }

        [TestMethod]
        public void GetERandom_ReferenceSeed_DrawsReferenceOutputs()
        {
            MaximumVector vector = Vectors.GetERandom;
            RandomStream random = RandomStream.FromSeed(vector.Seed);

            CollectionAssert.AreEqual(vector.Outputs, Draws(vector.Outputs.Length, () => random.GetERandom(vector.Maximum)));
        }

        [TestMethod]
        public void GetChance_ReferenceSeed_DrawsReferenceOutputs()
        {
            ChanceVector vector = Vectors.GetChance;
            RandomStream random = RandomStream.FromSeed(vector.Seed);

            CollectionAssert.AreEqual(vector.Outputs, Draws(vector.Outputs.Length, () => random.GetChance(vector.Mask)));
        }

        [TestMethod]
        public void SetState_StateOfAnotherStream_ContinuesExactlyWhereThatStreamIs()
        {
            RandomStream original = RandomStream.FromSeed(42);
            original.Next();
            original.Next();

            RandomStream restored = RandomStream.FromSeed(7);
            restored.SetState(original.GetState());

            Assert.AreEqual(original.Next(), restored.Next());
            CollectionAssert.AreEqual(original.GetState(), restored.GetState());
        }

        [TestMethod]
        public void GetState_ReturnedArrayChanged_LeavesStreamUnchanged()
        {
            RandomStream random = RandomStream.FromSeed(42);
            uint[] state = random.GetState();
            state[0] ^= 1;

            CollectionAssert.AreNotEqual(state, random.GetState());
        }

        [TestMethod]
        [DataRow(new uint[] { 1, 2, 3 })]
        [DataRow(new uint[] { 1, 2, 3, 4, 5 })]
        public void SetState_NotFourWords_Throws(uint[] state)
        {
            ArgumentException exception = Assert.ThrowsExactly<ArgumentException>(() => RandomStream.FromSeed(0).SetState(state));

            StringAssert.Contains(exception.Message, "four uint32 words");
        }

        [TestMethod]
        public void SetState_AllZero_Throws()
        {
            // xoshiro only ever draws zero from the all-zero state
            ArgumentException exception = Assert.ThrowsExactly<ArgumentException>(() => RandomStream.FromSeed(0).SetState([0, 0, 0, 0]));

            StringAssert.Contains(exception.Message, "all zero");
        }

        [TestMethod]
        [DataRow(-1)]
        [DataRow(65535)]
        public void GetRandom_MaximumOutOfRange_Throws(int max)
        {
            Assert.ThrowsExactly<ArgumentOutOfRangeException>(() => RandomStream.FromSeed(0).GetRandom(max));
        }

        [TestMethod]
        public void GetRandom_ManyDraws_DrawsEveryValueAboutEquallyOften()
        {
            RandomStream random = RandomStream.FromSeed(7);
            int[] counts = new int[6];

            for (int i = 0; i < 60000; i++)
            {
                counts[random.GetRandom(5)]++;
            }

            foreach (int count in counts)
            {
                Assert.IsTrue(count > 9500 && count < 10500, $"A value came up {count} times in 60000 draws.");
            }
        }

        private static T[] Draws<T>(int count, Func<T> draw)
        {
            return Enumerable.Range(0, count).Select(_ => draw()).ToArray();
        }
    }
}
