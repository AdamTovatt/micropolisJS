import { Random } from "../src/random";
import { loadRandomVectors } from "./helpers/randomVectors";
import { streamDrawing } from "./helpers/streams";

// Computed by the reference C implementations, and shared with the C# port: conformance/README.md describes them
const vectors = loadRandomVectors();

describe("the random stream", () => {

    describe.each(vectors.seeds)("seeded with $seed", ({seed, seeded, outputs, jumped}) => {

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
        const {seed, callsPerMaximum, maxima, outputs} = vectors.getRandom;
        const random = Random.fromSeed(seed);
        const calls = Array.from({length: callsPerMaximum});
        const results = maxima.flatMap((max) => calls.map(() => random.getRandom(max)));

        expect(results).toEqual(outputs);
    });

    it("rejects a draw equal to the largest multiple of the range, as the reference does", () => {
        const {seed, maximum, outputs} = vectors.getRandomAtTheBoundary;
        const random = Random.fromSeed(seed);

        expect(outputs.map(() => random.getRandom(maximum))).toEqual(outputs);
    });

    it("draws the reference getRandom16Signed outputs", () => {
        const {seed, outputs} = vectors.getRandom16Signed;
        const random = Random.fromSeed(seed);

        expect(outputs.map(() => random.getRandom16Signed())).toEqual(outputs);
    });

    it("draws the reference getERandom outputs", () => {
        const {seed, maximum, outputs} = vectors.getERandom;
        const random = Random.fromSeed(seed);

        expect(outputs.map(() => random.getERandom(maximum))).toEqual(outputs);
    });

    it("draws the reference getChance outputs", () => {
        const {seed, mask, outputs} = vectors.getChance;
        const random = Random.fromSeed(seed);

        expect(outputs.map(() => random.getChance(mask))).toEqual(outputs);
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
