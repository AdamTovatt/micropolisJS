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

import { SNAPSHOT_POINTS } from "../conformance/snapshotPoints";
import {
    recordSnapshots, replaceMethod, SnapshotPoint, SnapshotRecord, unrecorded,
} from "../conformance/unitSnapshots";
import { cityFromSave, SaveData } from "../headless/city";
import { fixtureNamesOf, spriteFreeFixtureNames } from "../headless/fixtures/index";
import { fixtureLog, replay } from "../headless/runner";
import { BlockMapUtils } from "../src/blockMapUtils.js";
import { plainSavedState } from "../src/stateHash";

const FIXTURE = "suburb";

function built(): Map<string, SaveData> {
    return new Map([[FIXTURE, plainSavedState(replay(fixtureLog(FIXTURE), {to: 0}).city) as SaveData]]);
}

// The map scan's first sweep, recorded with no handlers and with each family alone, which must reach a branch
function sweepReaching(test: (record: SnapshotRecord) => boolean, family?: string): SnapshotPoint {
    return {fixture: FIXTURE, unit: "mapScanner.mapScan", call: 0, handlers: "each",
            reaches: {branch: "the branch", test, family}};
}

// The families the first sweep has a record of, each alone
function sweptFamilies(): string[] {
    return recordSnapshots([sweepReaching(() => true)], built()).flatMap((record) => record.handlers);
}

describe("a snapshot point that names a branch", () => {

    it("is recorded when a record of it reaches the branch, though the record with no handlers does not", () => {
        const records = recordSnapshots([sweepReaching((record) => record.handlers.length > 0)], built());

        expect(records.filter((record) => record.handlers.length === 0)).toHaveLength(1);
        expect(records.filter((record) => record.handlers.length > 0)).not.toEqual([]);
    });

    it("fails the recording when no record of it reaches the branch", () => {
        expect(() => recordSnapshots([sweepReaching(() => false)], built()))
            .toThrow("No record of the point suburb: mapScanner.mapScan call 0 with each family reaches the branch");
    });

    describe("and a family", () => {

        it("is recorded when that family's record reaches the branch", () => {
            const family = sweptFamilies()[0];

            expect(recordSnapshots([sweepReaching((record) => record.handlers[0] === family, family)], built()))
                .not.toEqual([]);
        });

        it("fails the recording when only another family's record reaches the branch", () => {
            const family = sweptFamilies()[0];

            expect(() => recordSnapshots([sweepReaching((record) => record.handlers[0] !== family, family)], built()))
                .toThrow(`The ${family} family's record of the point suburb: mapScanner.mapScan call 0 with each family ` +
                         "does not reach the branch");
        });

        // The suburb's first strip holds no stadium
        it("fails the recording when the call makes no record of that family", () => {
            expect(sweptFamilies()).not.toContain("stadia");

            expect(() => recordSnapshots([sweepReaching(() => true, "stadia")], built()))
                .toThrow("The point suburb: mapScanner.mapScan call 0 with each family has no record of the stadia family alone");
        });

        it("is refused on a point recorded with every family", () => {
            const point: SnapshotPoint = {fixture: FIXTURE, unit: "mapScanner.mapScan", call: 0,
                                          reaches: {branch: "the branch", test: () => true, family: "road"}};

            expect(() => recordSnapshots([point], built())).toThrow("names the family road, which needs \"each\"");
        });
    });
});

describe("a unit called on a copy of the city", () => {

    const crimeScan: SnapshotPoint = {fixture: FIXTURE, unit: "blockMapUtils.crimeScan", call: 0};

    // A point whose `where` runs the crime scan on a copy of the city, as a dry run, before the city's own first one
    function triedFirst(run: <T>(dryRun: () => T) => T): SnapshotPoint {
        return {fixture: FIXTURE, unit: "simulation._simulate", call: 0, where: (simulation) => run(() => {
            const copy = cityFromSave(plainSavedState(simulation as never) as SaveData) as unknown as
                {_census: unknown, blockMaps: unknown};
            BlockMapUtils.crimeScan(copy._census, copy.blockMaps);
            return true;
        })};
    }

    it("in unrecorded is not one of the city's calls", () => {
        const alone = recordSnapshots([crimeScan], built());
        const withDryRun = recordSnapshots([crimeScan, triedFirst(unrecorded)], built());

        expect(withDryRun.filter((record) => record.unit === crimeScan.unit)).toEqual(alone);
    });
});

describe("the fixtures every unit's first calls are recorded from", () => {

    // The fixtures whose map scan's first sweep the points record: each "each" point of the map scan that takes its
    // call by count, not by where
    function swept(points: SnapshotPoint[]): string[] {
        return Array.from(new Set(points.filter((point) => point.unit === "mapScanner.mapScan" &&
                                                           point.handlers === "each" && point.where === undefined)
            .map((point) => point.fixture))).sort();
    }

    it("are those of the kind snapshots", () => {
        expect(swept(SNAPSHOT_POINTS)).toEqual(fixtureNamesOf("snapshots"));
    });

    // A point for a branch, as a lane adds, that finds its map scan by where in a fixture made for the branch
    it("are not counted from a point that finds its call by where", () => {
        const branchPoint: SnapshotPoint = {fixture: "suburbSlow", unit: "mapScanner.mapScan", call: 0, handlers: "each",
                                            where: () => true};

        expect(swept([...SNAPSHOT_POINTS, branchPoint])).toEqual(fixtureNamesOf("snapshots"));
    });

    it("are sprite-free, as are those made for a branch", () => {
        expect(spriteFreeFixtureNames()).toEqual(fixtureNamesOf("snapshots", "branch"));
        expect(fixtureNamesOf("snapshots").filter((name) => fixtureNamesOf("branch").includes(name))).toEqual([]);
    });
});

describe("the snapshot points", () => {

    // A point's fixture is named by a string, so a point could name a fixture of the kind sprites, which the golden
    // run's check that it creates no sprite leaves out
    it("name only sprite-free fixtures", () => {
        const spriteFree = spriteFreeFixtureNames();
        const named = Array.from(new Set(SNAPSHOT_POINTS.map((point) => point.fixture)));

        expect(named.filter((fixture) => !spriteFree.includes(fixture))).toEqual([]);
    });
});

describe("a method replaced to watch it", () => {

    // A method that has been renamed would otherwise go unwatched, and a check that it was never called would pass
    it("fails when the object has no method of that name", () => {
        expect(() => replaceMethod({}, "renamed", (original) => original)).toThrow("No method named renamed to replace");
    });

    it("is restored as the object's own, or as what it inherits", () => {
        const proto = {inherited: () => "inherited"};
        const owner = Object.assign(Object.create(proto), {own: () => "own"});

        const restores = ["own", "inherited"].map((name) => replaceMethod(owner, name, () => () => "replaced"));
        expect([owner.own(), owner.inherited()]).toEqual(["replaced", "replaced"]);

        restores.forEach((restore) => restore());
        expect([owner.own(), owner.inherited()]).toEqual(["own", "inherited"]);
        expect(Object.keys(owner)).toEqual(["own"]);
    });
});
