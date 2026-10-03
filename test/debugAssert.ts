import { assert } from "../src/debugAssert";

describe("the debug asserter", () => {

    it("should throw when the assertion fails", () => {
        const message = "foo";

        expect(() => assert(false, message)).toThrow(message);
    });

    it("should not throw when the assertion succeeds", () => {
        const message = "foo";

        expect(() => assert(true, message)).not.toThrow();
    });
});
