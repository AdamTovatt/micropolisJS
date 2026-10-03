import { Random } from "../src/random";
import { streamDrawing } from "./helpers/streams";

// Computed by the reference C implementations of xoshiro128** 1.1 and SplitMix64 (https://prng.di.unimi.it/), and of
// the original's getRandom over 16-bit draws. The C# port must reproduce every one.
const vectors = [
    {
        seed: 0,
        seeded: [0x7b1dcdaf, 0xe220a839, 0xa1b965f4, 0x6e789e6a],
        outputs: [
            0xdec9045d, 0x9a089d75, 0xab77d362, 0xc3e16405, 0x5c95a8da, 0x60dea056, 0xc25a5140, 0xa4290614,
            0x9e0525af, 0x953d37b9, 0xca973b77, 0x362c8457, 0x7ef8d208, 0xc98402b2, 0xe77ed1a6, 0xeaa8401b,
            0xd16aa762, 0xeeb6087f, 0x0b68d0f0, 0x35106425,
        ],
        jumped: [0xe8ad2042, 0x2070022f, 0x3528a847, 0xbe31d5d0],
    },
    {
        seed: 1,
        seeded: [0x89025cc1, 0x910a2dec, 0x658eec67, 0xbeeb8da1],
        outputs: [
            0x650941ba, 0x54d30301, 0x25d2f321, 0x3fabdca9, 0x2ab8e0a6, 0xf9890067, 0xe12b0ad9, 0xa193d86a,
            0xaa60a3ad, 0xa0512e90, 0x68158fcc, 0xb46cdf85, 0xd5db5b1e, 0xe9c55a71, 0x62d0cd1f, 0x45180848,
            0x4025b235, 0x1e514604, 0x3a36018c, 0x4f094038,
        ],
        jumped: [0x78d283ee, 0x5d6f623e, 0xcabe44b7, 0x2ce0ca9e],
    },
    {
        seed: 42,
        seeded: [0x2feb6e95, 0xbdd73226, 0xb266f103, 0x28efe333],
        outputs: [
            0x69e85a2a, 0xf843fad0, 0x0105185f, 0x8a1f1ea6, 0xa66be2a9, 0x9844904e, 0xaf4213e7, 0x85c95cd7,
            0xd4a5504a, 0xae8d0101, 0xbc7a4de1, 0x44932982, 0xce49369c, 0x871358fb, 0x2a97f2c4, 0x5f673e85,
            0x8329897f, 0x557ef647, 0x9c7e2e51, 0x5a0f943f,
        ],
        jumped: [0x80cd013d, 0xe411de0c, 0xaa58d032, 0xe1f479f7],
    },
    {
        seed: 0xffffffff,
        seeded: [0xaff181c0, 0x73b13ba2, 0x1340d3b4, 0x61204305],
        outputs: [
            0x13bdbe29, 0x894d4f2d, 0xa2d85227, 0x68a9dbc8, 0x013843e3, 0x19fcb943, 0x06df56e6, 0x981fc82e,
            0x37396a38, 0x244d92d0, 0x6e3ae13c, 0x1916ba58, 0x77045ec1, 0x6533544e, 0xda0a5712, 0xf4514cfb,
            0x3ac5798a, 0xee1a93be, 0xee341b32, 0x722f2dee,
        ],
        jumped: [0xa8c455c7, 0x50e8e194, 0x6dd9d9fa, 0xa20a5530],
    },
];

// Seed 42, four calls to getRandom with each maximum in turn
const getRandomMaxima = [0, 1, 2, 5, 100, 1919, 30000, 65534];
const getRandomOutputs = [
    0, 0, 0, 0, 1, 0, 0, 1, 2, 0, 1, 2, 3, 1, 1, 3, 45, 70, 66, 27, 1652, 1437, 695, 76, 12004, 2245, 9993, 27867,
    29552, 39249, 16616, 16379,
];

describe("the random stream", () => {

    describe.each(vectors)("seeded with $seed", ({seed, seeded, outputs, jumped}) => {

        it("fills its state with SplitMix64", () => {
            expect(Random.fromSeed(seed).getState()).toEqual(seeded);
        });

        it("draws the reference outputs", () => {
            const random = Random.fromSeed(seed);

            expect(outputs.map(() => random.next())).toEqual(outputs);
        });

        it("jumps to the reference state", () => {
            const random = Random.fromSeed(seed);
            random.jump();

            expect(random.getState()).toEqual(jumped);
        });

        it("gives the simulation the jumped state and the map the seeded one", () => {
            expect(Random.simulationStream(seed).getState()).toEqual(jumped);
            expect(Random.mapStream(seed).getState()).toEqual(seeded);
        });
    });

    it("draws the reference getRandom outputs", () => {
        const random = Random.fromSeed(42);
        const results = getRandomMaxima.flatMap((max) => [0, 1, 2, 3].map(() => random.getRandom(max)));

        expect(results).toEqual(getRandomOutputs);
    });

    it("continues from a restored state exactly where the original stream is", () => {
        const original = Random.fromSeed(42);
        original.next();
        original.next();

        const restored = Random.fromSeed(7);
        restored.setState(original.getState());

        expect(restored.next()).toBe(original.next());
        expect(restored.getState()).toEqual(original.getState());
    });

    it.each([-1, 1.5, 2 ** 32, NaN])("rejects the seed %p", (seed) => {
        expect(() => Random.fromSeed(seed)).toThrow("uint32");
    });

    it.each([[[1, 2, 3]], [[1, 2, 3, -4]], [[1, 2, 3, 2 ** 32]]])("rejects the state %p", (state) => {
        expect(() => Random.fromSeed(0).setState(state)).toThrow("four uint32 words");
    });

    it("rejects the all-zero state, from which xoshiro only ever draws zero", () => {
        expect(() => Random.fromSeed(0).setState([0, 0, 0, 0])).toThrow("all zero");
    });
});

describe("the getRandom16 function", () => {

    it("takes the top 16 bits of a draw", () => {
        const random = Random.fromSeed(0);
        random.next = () => 0xabcd1234;

        expect(random.getRandom16()).toBe(0xabcd);
    });
});

describe("the getRandom function", () => {

    it("returns the draw modulo the range", () => {
        expect(streamDrawing([7]).getRandom(4)).toBe(2);
    });

    it("can return 0 and the maximum", () => {
        expect(streamDrawing([0]).getRandom(5)).toBe(0);
        expect(streamDrawing([5]).getRandom(5)).toBe(5);
    });

    it("rejects draws at or above the largest multiple of the range below 0xffff, as the original does", () => {
        // The range is 10000, so its largest multiple not above 0xffff is 60000
        const random = streamDrawing([60000, 65535, 59999]);

        expect(random.getRandom(9999)).toBe(9999);
    });

    it("rejects 0xffff even when the range divides 65536, as the original does", () => {
        // 65535 is odd and 2 even, so accepting 65535 would give 1
        expect(streamDrawing([0xffff, 2]).getRandom(1)).toBe(0);
    });

    it.each([-1, 2.5, 65535, NaN])("rejects the maximum %p", (max) => {
        expect(() => Random.fromSeed(0).getRandom(max)).toThrow("integer maximum");
    });

    it("draws every value in the range about equally often", () => {
        const random = Random.fromSeed(7);
        const counts = [0, 0, 0, 0, 0, 0];

        for (let i = 0; i < 60000; i++) {
            counts[random.getRandom(5)]++;
        }

        counts.forEach((count) => {
            expect(count).toBeGreaterThan(9500);
            expect(count).toBeLessThan(10500);
        });
    });
});

describe("the getRandom16Signed function", () => {

    it("returns draws below 2^15 unchanged", () => {
        expect(streamDrawing([32767]).getRandom16Signed()).toBe(32767);
    });

    it("maps draws from 2^15 up to [-(2^15), -1]", () => {
        const random = streamDrawing([32768, 65535]);

        expect(random.getRandom16Signed()).toBe(-32768);
        expect(random.getRandom16Signed()).toBe(-1);
    });
});

describe("the getERandom function", () => {

    it("returns the lesser of two draws", () => {
        expect(streamDrawing([8, 3]).getERandom(10)).toBe(3);
        expect(streamDrawing([2, 9]).getERandom(10)).toBe(2);
    });
});

describe("the getChance function", () => {

    it("is false if the draw shares all of the mask's bits", () => {
        expect(streamDrawing([0b1101]).getChance(0b101)).toBe(false);
    });

    it("is false if the draw shares some of the mask's bits", () => {
        expect(streamDrawing([0b1101]).getChance(0b11)).toBe(false);
    });

    it("is true if the draw shares none of the mask's bits", () => {
        expect(streamDrawing([0b1010]).getChance(0b101)).toBe(true);
    });
});
