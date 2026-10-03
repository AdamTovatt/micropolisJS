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

namespace Micropolis.Rules
{
    /// <summary>
    /// The simulation's random stream, ported bit for bit from <c>src/random.ts</c>, whose header specifies it:
    /// xoshiro128** 1.1 seeded from a uint32 game seed with SplitMix64, and 16-bit draws with rejection sampling in
    /// <see cref="GetRandom"/>. <c>conformance/random.json</c> holds the reference vectors both ports test against.
    /// </summary>
    public sealed class RandomStream
    {
        private const int Random16Max = 0xffff;

        private const ulong SplitMix64Gamma = 0x9e3779b97f4a7c15;
        private const ulong SplitMix64Multiplier1 = 0xbf58476d1ce4e5b9;
        private const ulong SplitMix64Multiplier2 = 0x94d049bb133111eb;

        private static readonly uint[] JumpPolynomial = [0x8764000b, 0xf542d2d3, 0x6fa035c3, 0x77f2db5b];

        private uint _s0;
        private uint _s1;
        private uint _s2;
        private uint _s3;

        private RandomStream(uint s0, uint s1, uint s2, uint s3)
        {
            _s0 = s0;
            _s1 = s1;
            _s2 = s2;
            _s3 = s3;
        }

        /// <summary>
        /// A stream whose state SplitMix64 fills from the seed: its first two outputs, each low word first.
        /// </summary>
        public static RandomStream FromSeed(uint seed)
        {
            ulong splitMixState = seed;
            ulong first = NextSplitMix64(ref splitMixState);
            ulong second = NextSplitMix64(ref splitMixState);

            return new RandomStream((uint)first, (uint)(first >> 32), (uint)second, (uint)(second >> 32));
        }

        /// <summary>
        /// The stream the map generator draws from.
        /// </summary>
        public static RandomStream MapStream(uint seed)
        {
            return FromSeed(seed);
        }

        /// <summary>
        /// The stream the simulation draws from: the map stream's seeded state after one <see cref="Jump"/>.
        /// </summary>
        public static RandomStream SimulationStream(uint seed)
        {
            RandomStream random = FromSeed(seed);
            random.Jump();
            return random;
        }

        /// <summary>
        /// The four state words, in the order a save holds them.
        /// </summary>
        public uint[] GetState()
        {
            return [_s0, _s1, _s2, _s3];
        }

        /// <summary>
        /// Restores a state from <see cref="GetState"/> in place, so everything holding this stream continues from it.
        /// </summary>
        public void SetState(IReadOnlyList<uint> state)
        {
            if (state.Count != 4)
            {
                throw new ArgumentException($"A random state must be four uint32 words, got {state.Count}.", nameof(state));
            }

            if (state.All(word => word == 0))
            {
                throw new ArgumentException("A random state must not be all zero.", nameof(state));
            }

            _s0 = state[0];
            _s1 = state[1];
            _s2 = state[2];
            _s3 = state[3];
        }

        /// <summary>
        /// One raw draw.
        /// </summary>
        public uint Next()
        {
            unchecked
            {
                uint result = uint.RotateLeft(_s1 * 5, 7) * 9;
                uint t = _s1 << 9;

                _s2 ^= _s0;
                _s3 ^= _s1;
                _s1 ^= _s2;
                _s0 ^= _s3;
                _s2 ^= t;
                _s3 = uint.RotateLeft(_s3, 11);

                return result;
            }
        }

        /// <summary>
        /// Advances the state by 2^64 draws, giving a stream that does not overlap this one's next 2^64 draws.
        /// </summary>
        public void Jump()
        {
            uint j0 = 0;
            uint j1 = 0;
            uint j2 = 0;
            uint j3 = 0;

            foreach (uint word in JumpPolynomial)
            {
                for (int bit = 0; bit < 32; bit++)
                {
                    if (((word >> bit) & 1) != 0)
                    {
                        j0 ^= _s0;
                        j1 ^= _s1;
                        j2 ^= _s2;
                        j3 ^= _s3;
                    }

                    Next();
                }
            }

            _s0 = j0;
            _s1 = j1;
            _s2 = j2;
            _s3 = j3;
        }

        /// <summary>
        /// An integer in [0, 65535]: the top 16 bits of one draw.
        /// </summary>
        public int GetRandom16()
        {
            return (int)(Next() >> 16);
        }

        /// <summary>
        /// An integer in [-32768, 32767].
        /// </summary>
        public int GetRandom16Signed()
        {
            int value = GetRandom16();

            if (value < 32768)
            {
                return value;
            }
            else
            {
                return value - 65536;
            }
        }

        /// <summary>
        /// An integer in [0, max], uniformly distributed: 16-bit draws at or above the largest multiple of the range
        /// not above 0xffff are rejected, as the original's getRandom does.
        /// </summary>
        public int GetRandom(int max)
        {
            if (max < 0 || max >= Random16Max)
            {
                throw new ArgumentOutOfRangeException(nameof(max), max, $"getRandom needs a maximum in [0, {Random16Max - 1}].");
            }

            int range = max + 1;
            int maxMultiple = Random16Max / range * range;
            int value;

            do
            {
                value = GetRandom16();
            } while (value >= maxMultiple);

            return value % range;
        }

        /// <summary>
        /// True when a 16-bit draw has none of the mask's bits set: a 1 in 2^n chance for an n-bit mask.
        /// </summary>
        public bool GetChance(int mask)
        {
            return (GetRandom16() & mask) == 0;
        }

        /// <summary>
        /// An integer in [0, max], biased towards smaller numbers: the lesser of two draws.
        /// </summary>
        public int GetERandom(int max)
        {
            int firstCandidate = GetRandom(max);
            int secondCandidate = GetRandom(max);
            return Math.Min(firstCandidate, secondCandidate);
        }

        private static ulong NextSplitMix64(ref ulong state)
        {
            unchecked
            {
                state += SplitMix64Gamma;
                ulong z = state;
                z = (z ^ (z >> 30)) * SplitMix64Multiplier1;
                z = (z ^ (z >> 27)) * SplitMix64Multiplier2;
                return z ^ (z >> 31);
            }
        }
    }
}
