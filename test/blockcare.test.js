const BlockCare = artifacts.require("BlockCare");
const assert = require("assert");

async function shouldFail(promise, text) {
  try {
    await promise;
  } catch (e) {
    assert(e.message.includes(text), "Wrong error: " + e.message);
    return;
  }
  assert.fail("Expected a failure containing: " + text);
}

contract("BlockCare", (accounts) => {
  const [admin, patient, doctor, lab, stranger] = accounts;
  const DOCTOR = 2, LAB = 3;
  let c;

  before(async () => {
    c = await BlockCare.new({ from: admin });
    await c.registerAsPatient({ from: patient });
    await c.approveProvider(doctor, DOCTOR, { from: admin });
    await c.approveProvider(lab, LAB, { from: admin });
  });

  it("only admin can approve providers", async () => {
    await shouldFail(c.approveProvider(stranger, DOCTOR, { from: stranger }), "Only admin");
  });

  it("stranger cannot add a record", async () => {
    await shouldFail(c.addRecord("QmX", "x", { from: stranger }), "Not a patient");
  });

  it("patient can add and read own record", async () => {
    await c.addRecord("QmPatientFile", "lab report|a.txt", { from: patient });
    const n = await c.getRecordCount(patient, { from: patient });
    assert.equal(n.toString(), "1");
  });

  it("doctor cannot read before permission", async () => {
    await shouldFail(c.getRecordCount(patient, { from: doctor }), "No access");
  });

  it("doctor can read after grant, not after revoke", async () => {
    await c.requestAccess(patient, { from: doctor });
    await c.grantAccess(doctor, { from: patient });
    const n = await c.getRecordCount(patient, { from: doctor });
    assert.equal(n.toString(), "1");
    await c.revokeAccess(doctor, { from: patient });
    await shouldFail(c.getRecordCount(patient, { from: doctor }), "No access");
  });

  it("lab cannot upload before permission", async () => {
    await shouldFail(c.addRecordFor(patient, "QmLab", "blood test|b.txt", { from: lab }), "not allowed");
  });

  it("lab can upload after grant, but cannot read records", async () => {
    await c.grantAccess(lab, { from: patient });
    await c.addRecordFor(patient, "QmLab", "blood test|b.txt", { from: lab });
    const n = await c.getRecordCount(patient, { from: patient });
    assert.equal(n.toString(), "2");
    await shouldFail(c.getRecordCount(patient, { from: lab }), "No access");
  });
});