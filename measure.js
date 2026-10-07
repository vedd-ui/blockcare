// measure.js - measures time (ms) and gas for BlockCare actions.
// Run with:  truffle exec measure.js
// Ganache must be open. It deploys a FRESH contract, so your demo data is not touched.

const fs = require("fs");
const BlockCare = artifacts.require("BlockCare");

const N = 500; // number of samples per action

// ---------- small helpers ----------
const now = () => Number(process.hrtime.bigint()) / 1e6; // milliseconds

function stats(values) {
  const v = [...values].sort((a, b) => a - b);
  const sum = v.reduce((a, b) => a + b, 0);
  const pick = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return {
    n: v.length,
    mean: sum / v.length,
    median: pick(0.5),
    p95: pick(0.95),
    min: v[0],
    max: v[v.length - 1],
  };
}

const f = (x, d = 2) => Number(x).toFixed(d);

module.exports = async function (callback) {
  try {
    const accounts = await web3.eth.getAccounts();
    const [admin, patient, doctor, lab] = accounts;
    const DOCTOR = 2, LAB = 3;

    console.log("Deploying a fresh BlockCare contract...");
    const c = await BlockCare.new({ from: admin });
    const deployReceipt = await web3.eth.getTransactionReceipt(c.transactionHash);
    const deployGas = Number(deployReceipt.gasUsed); // may arrive as hex text
    const deployTx = await web3.eth.getTransaction(c.transactionHash);
    const gasPriceWei = BigInt(deployTx.gasPrice);

    const REF_GWEI = 20; // fixed reference price so results are repeatable
    const toEth = (gas) => (gas * REF_GWEI) / 1e9;

    // ---------- setup (also measured, as one-time actions) ----------
    const results = []; // each row: {name, time, gas, kind}

    async function timedTx(sendFn) {
      const t0 = now();
      const tx = await sendFn();
      const ms = now() - t0;
      return { ms, gas: tx.receipt.gasUsed };
    }

    async function runTx(name, kind, count, makeCall, prep) {
      const times = [], gases = [];
      for (let i = 0; i < count; i++) {
        if (prep) await prep(i); // set-up step, NOT timed
        const r = await timedTx(() => makeCall(i));
        times.push(r.ms);
        gases.push(r.gas);
      }
      results.push({ name, kind, time: stats(times), gas: stats(gases) });
      console.log("done: " + name);
    }

    async function runCall(name, kind, count, makeCall) {
      const times = [];
      for (let i = 0; i < count; i++) {
        const t0 = now();
        await makeCall(i);
        times.push(now() - t0);
      }
      results.push({ name, kind, time: stats(times), gas: null });
      console.log("done: " + name);
    }

    // one-time setup
    await c.registerAsPatient({ from: patient });
    await c.approveProvider(doctor, DOCTOR, { from: admin });
    await c.approveProvider(lab, LAB, { from: admin });

    // 1) Smart contract execution (transactions that cost gas)
    await runTx("Patient adds record (addRecord)", "tx", N, (i) =>
      c.addRecord("QmFakeHash" + i, "lab report|file" + i + ".txt", 1, { from: patient })
    );

    // grant / revoke a doctor, N times each (alternating)
    await runTx("Patient grants access (grantAccess)", "tx", N,
      () => c.grantAccess(doctor, { from: patient }),
      async (i) => { if (i > 0) await c.revokeAccess(doctor, { from: patient }); } // so each grant is a real change
    );
    // make sure doctor has access for the next steps
    await c.grantAccess(doctor, { from: patient });

    await runTx("Patient revokes access (revokeAccess)", "tx", N,
      () => c.revokeAccess(doctor, { from: patient }),
      async (i) => { if (i > 0) await c.grantAccess(doctor, { from: patient }); } // so each revoke is a real change
    );
    await c.grantAccess(doctor, { from: patient });

    // 2) Cross-provider data exchange
    //    (a) lab uploads a result into the patient's record
    await c.grantAccess(lab, { from: patient });
    await runTx("Lab uploads result for patient (addRecordFor)", "tx", N, (i) =>
      c.addRecordFor(patient, "QmLabHash" + i, "blood test|lab" + i + ".txt", 1, { from: lab })
    );

    //    (b) doctor reads the patient's records (access is checked on-chain)
    const total = Number((await c.getRecordCount(patient, { from: patient })).toString());
    await runCall("Doctor reads patient record (getRecord)", "call", N, (i) =>
      c.getRecord(patient, i % total, { from: doctor })
    );

    // 3) Patient record retrieval (patient reads own records)
    await runCall("Patient reads own record (getRecord)", "call", N, (i) =>
      c.getRecord(patient, i % total, { from: patient })
    );
    await runCall("Patient reads record count (getRecordCount)", "call", N, () =>
      c.getRecordCount(patient, { from: patient })
    );

    // ---------- print and save ----------
    const lines = [];
    lines.push("# BlockCare measurements");
    lines.push("");
    lines.push("- Samples per action: " + N);
    lines.push("- Network: local Ganache (single node, instant mining)");
    lines.push("- Ganache gas price this run: " + f(Number(gasPriceWei) / 1e9, 2) + " gwei (cost column uses a fixed " + REF_GWEI + " gwei)");
    lines.push("- Contract deployment gas: " + deployGas + " (" + toEth(deployGas).toFixed(6) + " ETH at " + REF_GWEI + " gwei)");
    lines.push("- Date: " + new Date().toISOString());
    lines.push("");
    lines.push("| Action | Type | Mean ms | Median ms | p95 ms | Min ms | Max ms | Mean gas | Mean cost (ETH) |");
    lines.push("|---|---|---|---|---|---|---|---|---|");

    const csv = ["action,type,samples,mean_ms,median_ms,p95_ms,min_ms,max_ms,mean_gas,mean_cost_eth"];

    for (const r of results) {
      const t = r.time;
      const gas = r.gas ? f(r.gas.mean, 0) : "0 (read-only)";
      const eth = r.gas ? toEth(r.gas.mean).toFixed(6) : "0";
      lines.push(
        "| " + r.name + " | " + (r.kind === "tx" ? "transaction" : "read call") + " | " +
        f(t.mean) + " | " + f(t.median) + " | " + f(t.p95) + " | " + f(t.min) + " | " + f(t.max) +
        " | " + gas + " | " + eth + " |"
      );
      csv.push(
        [JSON.stringify(r.name), r.kind, t.n, f(t.mean), f(t.median), f(t.p95), f(t.min), f(t.max),
          r.gas ? f(r.gas.mean, 0) : 0, eth].join(",")
      );
    }

    lines.push("");
    lines.push("Note: read calls are free (no gas). Times are from a local test network and are not comparable to a cloud or public network.");

    fs.writeFileSync("results.md", lines.join("\n"));
    fs.writeFileSync("results.csv", csv.join("\n"));

    console.log("\n" + lines.join("\n"));
    console.log("\nSaved: results.md and results.csv (in the folder where you ran the command)");
    callback();
  } catch (err) {
    console.error("FAILED:", err);
    callback(err);
  }
};