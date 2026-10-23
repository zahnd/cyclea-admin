// `npm test` -- Node's own runner, types stripped by Node itself.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isFixedInVersion } from "./validation.ts";

describe("isFixedInVersion", () => {
  it("takes the version the app reports, with or without its build", () => {
    assert.equal(isFixedInVersion("1.2.0+33"), true);
    assert.equal(isFixedInVersion("1.2.0"), true);
    assert.equal(isFixedInVersion("10.0.12+1024"), true);
  });

  it("refuses anything else", () => {
    for (const value of ["", "1.2", "v1.2.0", "1.2.0+", "1.2.0 (33)", "1.2.0+33 ", "1.2.0-beta", "1.2.0+33+1"]) {
      assert.equal(isFixedInVersion(value), false, value);
    }
  });
});
