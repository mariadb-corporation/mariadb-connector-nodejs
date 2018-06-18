"use strict";

const base = require("../base.js");
const { assert } = require("chai");
const ConnOptions = require("../../lib/config/connection-options");

describe("test connection options", () => {
  it("permitLocalInfile/pipelining combination ", () => {
    let opt = new ConnOptions();
    assert.isFalse(opt.permitLocalInfile);
    assert.isTrue(opt.pipelining);

    opt = new ConnOptions({ permitLocalInfile: false });
    assert.isFalse(opt.permitLocalInfile);
    assert.isTrue(opt.pipelining);

    opt = new ConnOptions({ permitLocalInfile: true });
    assert.isTrue(opt.permitLocalInfile);
    assert.isFalse(opt.pipelining);

    opt = new ConnOptions({ pipelining: false, permitLocalInfile: true });
    assert.isTrue(opt.permitLocalInfile);
    assert.isFalse(opt.pipelining);

    opt = new ConnOptions({ pipelining: true, permitLocalInfile: true });
    assert.isFalse(opt.permitLocalInfile);
    assert.isTrue(opt.pipelining);
  });
});
