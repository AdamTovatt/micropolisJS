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

/* Writes random.json, the random stream's reference vectors:
 *
 *     cc -O2 -o random conformance/random.c && ./random > conformance/random.json
 *
 * next, jump and splitmix_next are the reference implementations of xoshiro128** 1.1 and SplitMix64 by David
 * Blackman and Sebastiano Vigna (https://prng.di.unimi.it/, public domain), unchanged but for their names. The seeding
 * and the 16-bit draws follow the specification in src/random.ts. */

#include <stdint.h>
#include <stdio.h>

static inline uint32_t rotl(const uint32_t x, int k) {
	return (x << k) | (x >> (32 - k));
}

static uint32_t s[4];

static uint32_t next(void) {
	const uint32_t result = rotl(s[1] * 5, 7) * 9;

	const uint32_t t = s[1] << 9;

	s[2] ^= s[0];
	s[3] ^= s[1];
	s[1] ^= s[2];
	s[0] ^= s[3];

	s[2] ^= t;

	s[3] = rotl(s[3], 11);

	return result;
}

static void jump(void) {
	static const uint32_t JUMP[] = { 0x8764000b, 0xf542d2d3, 0x6fa035c3, 0x77f2db5b };

	uint32_t s0 = 0;
	uint32_t s1 = 0;
	uint32_t s2 = 0;
	uint32_t s3 = 0;
	for(int i = 0; i < sizeof JUMP / sizeof *JUMP; i++)
		for(int b = 0; b < 32; b++) {
			if (JUMP[i] & UINT32_C(1) << b) {
				s0 ^= s[0];
				s1 ^= s[1];
				s2 ^= s[2];
				s3 ^= s[3];
			}
			next();
		}

	s[0] = s0;
	s[1] = s1;
	s[2] = s2;
	s[3] = s3;
}

static uint64_t x;

static uint64_t splitmix_next(void) {
	uint64_t z = (x += 0x9e3779b97f4a7c15);
	z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9;
	z = (z ^ (z >> 27)) * 0x94d049bb133111eb;
	return z ^ (z >> 31);
}

/* SplitMix64 starts at the seed, and its first two outputs fill the state, each low word first */
static void seed(uint32_t game_seed) {
	x = game_seed;
	uint64_t a = splitmix_next();
	uint64_t b = splitmix_next();
	s[0] = (uint32_t)a;
	s[1] = (uint32_t)(a >> 32);
	s[2] = (uint32_t)b;
	s[3] = (uint32_t)(b >> 32);
}

static int get_random16(void) {
	return next() >> 16;
}

static int get_random16_signed(void) {
	return (int16_t)(uint16_t)get_random16();
}

/* Rejects draws at or above the largest multiple of the range not above 0xffff, as the original's getRandom does */
static int get_random(int max) {
	int range = max + 1;
	int max_multiple = 0xffff / range * range;
	int value;

	do {
		value = get_random16();
	} while (value >= max_multiple);

	return value % range;
}

static int get_e_random(int max) {
	int first = get_random(max);
	int second = get_random(max);
	return first < second ? first : second;
}

static int get_chance(int mask) {
	return (get_random16() & mask) == 0;
}

static void print_words(const uint32_t *words, int count) {
	for (int i = 0; i < count; i++) {
		printf("%s\"0x%08x\"", i == 0 ? "" : ", ", words[i]);
	}
}

static void print_state(void) {
	printf("[");
	print_words(s, 4);
	printf("]");
}

int main(void) {
	static const uint32_t SEEDS[] = { 0, 1, 42, 0xffffffff };
	static const int SEED_OUTPUTS = 20;
	static const int MAXIMA[] = { 0, 1, 2, 5, 100, 1919, 30000, 65534, 32767 };
	static const int CALLS_PER_MAXIMUM = 4;
	static const int CALLS = 16;
	const int seed_count = sizeof SEEDS / sizeof *SEEDS;
	const int maxima_count = sizeof MAXIMA / sizeof *MAXIMA;

	printf("{\n  \"seeds\": [\n");
	for (int i = 0; i < seed_count; i++) {
		uint32_t outputs[SEED_OUTPUTS];

		seed(SEEDS[i]);
		printf("    {\n      \"seed\": \"0x%08x\",\n      \"seeded\": ", SEEDS[i]);
		print_state();
		for (int j = 0; j < SEED_OUTPUTS; j++) {
			outputs[j] = next();
		}
		printf(",\n      \"outputs\": [");
		print_words(outputs, SEED_OUTPUTS);
		seed(SEEDS[i]);
		jump();
		printf("],\n      \"jumped\": ");
		print_state();
		printf("\n    }%s\n", i == seed_count - 1 ? "" : ",");
	}
	printf("  ],\n");

	/* Some of these draws are rejected, and 32767's range divides 65536, which pins the original's 0xffff bound */
	seed(42);
	printf("  \"getRandom\": {\n    \"seed\": \"0x0000002a\",\n    \"callsPerMaximum\": %d,\n    \"maxima\": [", CALLS_PER_MAXIMUM);
	for (int i = 0; i < maxima_count; i++) {
		printf("%s%d", i == 0 ? "" : ", ", MAXIMA[i]);
	}
	printf("],\n    \"outputs\": [");
	for (int i = 0; i < maxima_count; i++) {
		for (int j = 0; j < CALLS_PER_MAXIMUM; j++) {
			printf("%s%d", i == 0 && j == 0 ? "" : ", ", get_random(MAXIMA[i]));
		}
	}
	printf("]\n  },\n");

	/* Seed 0's first 16-bit draw, 57033, is exactly the largest multiple of the range, so it is rejected */
	seed(0);
	printf("  \"getRandomAtTheBoundary\": {\n    \"seed\": \"0x00000000\",\n    \"maximum\": 57032,\n    \"outputs\": [");
	for (int j = 0; j < 8; j++) {
		printf("%s%d", j == 0 ? "" : ", ", get_random(57032));
	}
	printf("]\n  },\n");

	seed(42);
	printf("  \"getRandom16Signed\": {\n    \"seed\": \"0x0000002a\",\n    \"outputs\": [");
	for (int j = 0; j < CALLS; j++) {
		printf("%s%d", j == 0 ? "" : ", ", get_random16_signed());
	}
	printf("]\n  },\n");

	seed(42);
	printf("  \"getERandom\": {\n    \"seed\": \"0x0000002a\",\n    \"maximum\": 100,\n    \"outputs\": [");
	for (int j = 0; j < CALLS; j++) {
		printf("%s%d", j == 0 ? "" : ", ", get_e_random(100));
	}
	printf("]\n  },\n");

	seed(42);
	printf("  \"getChance\": {\n    \"seed\": \"0x0000002a\",\n    \"mask\": 3,\n    \"outputs\": [");
	for (int j = 0; j < CALLS; j++) {
		printf("%s%s", j == 0 ? "" : ", ", get_chance(3) ? "true" : "false");
	}
	printf("]\n  }\n}\n");

	return 0;
}
