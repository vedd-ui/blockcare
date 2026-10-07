const BlockCare = artifacts.require("BlockCare");
const assert = require("assert");

contract("BlockCare", (accounts) => {
  const patient = accounts[1];
  const doctor = accounts[2];
  let instance;

  before(async () => {
    instance = await BlockCare.new();
  });

  it("patient can add and read own record", async () => {
    await instance.addRecord("QmFakeHash123", "lab report", { from: patient });
    const count = await instance.getRecordCount(patient, { from: patient });
    assert.equal(count.toString(), "1");
    const rec = await instance.getRecord(patient, 0, { from: patient });
    assert.equal(rec[0], "QmFakeHash123");
  });

  it("doctor cannot read before permission", async () => {
    try {
      await instance.getRecordCount(patient, { from: doctor });
      assert.fail("Doctor should not have access");
    } catch (e) {
      assert(e.message.includes("No access"));
    }
  });

  it("doctor can read after patient grants access", async () => {
    await instance.requestAccess(patient, { from: doctor });
    await instance.grantAccess(doctor, { from: patient });
    const count = await instance.getRecordCount(patient, { from: doctor });
    assert.equal(count.toString(), "1");
  });

  it("doctor loses access after revoke", async () => {
    await instance.revokeAccess(doctor, { from: patient });
    try {
      await instance.getRecordCount(patient, { from: doctor });
      assert.fail("Doctor should not have access");
    } catch (e) {
      assert(e.message.includes("No access"));
    }
  });
});