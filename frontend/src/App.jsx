import { useState, useEffect } from "react";
import { BrowserProvider, Contract, isAddress } from "ethers";
import artifact from "./BlockCare.json";

const IPFS_API = "http://127.0.0.1:5001/api/v0";
const IPFS_GATEWAY = "http://127.0.0.1:8080/ipfs";
const ROLE_NAMES = ["No role yet", "Patient", "Doctor", "Diagnostic Lab"];

// ---------- locking and unlocking files ----------
async function getKey(password, salt) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptFile(file, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getKey(password, salt);
  const data = await file.arrayBuffer();
  const locked = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return new Blob([salt, iv, locked]);
}

async function decryptBytes(buffer, password) {
  const bytes = new Uint8Array(buffer);
  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const data = bytes.slice(28);
  const key = await getKey(password, salt);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
}

const short = (a) => (a ? a.slice(0, 6) + "..." + a.slice(-4) : "");
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const errText = (e) => e.reason || e.shortMessage || e.message || "Something went wrong";

export default function App() {
  const [contract, setContract] = useState(null);
  const [provider, setProvider] = useState(null);
  const [account, setAccount] = useState("");
  const [role, setRole] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState(null);
  const [target, setTarget] = useState("");
  const [newRole, setNewRole] = useState("2");
  const [file, setFile] = useState(null);
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [records, setRecords] = useState([]);
  const [recordsOwner, setRecordsOwner] = useState("");
  const [requests, setRequests] = useState([]);
  const [log, setLog] = useState([]);

  const say = (text, kind = "info") => setStatus({ text, kind });

  // reload when MetaMask account or network changes, and reconnect automatically
  useEffect(() => {
    if (!window.ethereum) return;
    const reload = () => window.location.reload();
    window.ethereum.on("accountsChanged", reload);
    window.ethereum.on("chainChanged", reload);
    window.ethereum.request({ method: "eth_accounts" }).then((accs) => {
      if (accs.length > 0) connect();
    });
    return () => {
      window.ethereum.removeListener("accountsChanged", reload);
      window.ethereum.removeListener("chainChanged", reload);
    };
    // eslint-disable-next-line
  }, []);

  // patients see their own data right away
  useEffect(() => {
    if (contract && role === 1) {
      loadRecords(account);
      loadPatientExtras();
    }
    // eslint-disable-next-line
  }, [contract, role]);

  async function connect() {
    try {
      if (!window.ethereum) return say("Please install MetaMask", "error");
      const p = new BrowserProvider(window.ethereum);
      await p.send("eth_requestAccounts", []);
      const signer = await p.getSigner();
      const net = artifact.networks["5777"];
      if (!net) {
        return say("Contract not deployed. Run truffle migrate --reset and copy BlockCare.json again.", "error");
      }
      const c = new Contract(net.address, artifact.abi, signer);
      const addr = await signer.getAddress();
      const r = Number(await c.roles(addr));
      const adminAddr = await c.admin();
      setProvider(p);
      setContract(c);
      setAccount(addr);
      setRole(r);
      setIsAdmin(same(adminAddr, addr));
      say("Connected", "success");
    } catch (e) {
      say("Error: " + errText(e), "error");
    }
  }

  async function act(fn, doneMsg, after) {
    try {
      say("Please confirm in MetaMask...");
      const tx = await fn();
      await tx.wait();
      say(doneMsg, "success");
      if (after) await after();
    } catch (e) {
      say("Error: " + errText(e), "error");
    }
  }

  function needAddress() {
    if (!isAddress(target)) {
      say("Please paste a valid address that starts with 0x", "error");
      return false;
    }
    return true;
  }

  // ---------- roles ----------
  async function registerPatient() {
    await act(() => contract.registerAsPatient(), "You are now a patient!", async () => {
      setRole(1);
    });
  }

  async function approve() {
    if (!needAddress()) return;
    await act(() => contract.approveProvider(target, Number(newRole)), "Approved!");
  }

  async function removeProvider() {
    if (!needAddress()) return;
    await act(() => contract.removeProvider(target), "Removed");
  }

  // ---------- files ----------
  async function pushToIpfs() {
    if (!file || !password) throw new Error("Choose a file and type a password first");
    say("Locking the file...");
    const blob = await encryptFile(file, password);
    const form = new FormData();
    form.append("file", blob);
    say("Sending to IPFS...");
    const res = await fetch(`${IPFS_API}/add`, { method: "POST", body: form });
    if (!res.ok) throw new Error("IPFS upload failed");
    const { Hash } = await res.json();
    return Hash;
  }

  async function patientUpload() {
    try {
      const Hash = await pushToIpfs();
      await act(
        () => contract.addRecord(Hash, `${label || "record"}|${file.name}`),
        "Saved! Your file is locked, stored on IPFS, and logged on the blockchain.",
        async () => {
          await loadRecords(account);
          await loadPatientExtras();
        }
      );
    } catch (e) {
      say("Error: " + errText(e), "error");
    }
  }

  async function labUpload() {
    if (!needAddress()) return;
    try {
      const Hash = await pushToIpfs();
      await act(
        () => contract.addRecordFor(target, Hash, `${label || "lab result"}|${file.name}`),
        "Lab result added to the patient's record."
      );
    } catch (e) {
      say("Error: " + errText(e), "error");
    }
  }

  async function loadRecords(owner) {
    try {
      say("Loading records...");
      const n = Number(await contract.getRecordCount(owner));
      const list = [];
      for (let i = 0; i < n; i++) {
        const r = await contract.getRecord(owner, i);
        list.push({ cid: r[0], type: r[1], by: r[2], time: Number(r[3]) });
      }
      setRecords(list);
      setRecordsOwner(owner);
      say(`Found ${n} record(s)`, "success");
    } catch (e) {
      setRecords([]);
      say("Error: " + errText(e), "error");
    }
  }

  async function viewPatientRecords() {
    if (!needAddress()) return;
    await loadRecords(target);
  }

  async function download(rec) {
    try {
      if (!password) return say("Type the file password first", "error");
      const res = await fetch(`${IPFS_GATEWAY}/${rec.cid}`);
      const plain = await decryptBytes(await res.arrayBuffer(), password);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([plain]));
      a.download = rec.type.split("|")[1] || "record";
      a.click();
      say("Downloaded", "success");
    } catch (e) {
      say("Could not open the file. Is the password right?", "error");
    }
  }

  // ---------- access ----------
  async function requestAccess() {
    if (!needAddress()) return;
    await act(() => contract.requestAccess(target), "Request sent to the patient.");
  }

  async function grant(addr) {
    await act(() => contract.grantAccess(addr), "Access given", loadPatientExtras);
  }

  async function revoke(addr) {
    await act(() => contract.revokeAccess(addr), "Access removed", loadPatientExtras);
  }

  async function loadPatientExtras() {
    try {
      const pending = [];
      const reqLogs = await contract.queryFilter(contract.filters.AccessRequested(account));
      for (const l of reqLogs) {
        const prov = l.args[1];
        if (!pending.includes(prov) && (await contract.requested(account, prov))) pending.push(prov);
      }
      setRequests(pending);

      const kinds = [
        ["AccessRequested", (a) => `${short(a[1])} asked for access`],
        ["AccessGranted", (a) => `You allowed ${short(a[1])}`],
        ["AccessRevoked", (a) => `You removed access for ${short(a[1])}`],
        ["RecordAdded", (a) => `Record "${a[3].split("|")[0]}" added by ${same(a[1], account) ? "you" : short(a[1])}`],
      ];
      const times = {};
      const entries = [];
      for (const [name, describe] of kinds) {
        const logs = await contract.queryFilter(contract.filters[name](account));
        for (const l of logs) {
          if (!times[l.blockNumber]) times[l.blockNumber] = (await provider.getBlock(l.blockNumber)).timestamp;
          entries.push({ text: describe(l.args), time: times[l.blockNumber], order: l.blockNumber * 1000 + l.index });
        }
      }
      entries.sort((x, y) => y.order - x.order);
      setLog(entries);
    } catch (e) {
      say("Error: " + errText(e), "error");
    }
  }

  // ---------- small pieces of screen ----------
  // These are plain functions (not components), so typing keeps focus.
  const addressBox = (title) => (
    <>
      <label>{title}</label>
      <input type="text" placeholder="0x..." value={target} onChange={(e) => setTarget(e.target.value.trim())} />
    </>
  );

  const fileFields = () => (
    <>
      <label>File</label>
      <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      <label>Label (for example: blood test)</label>
      <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
      <label>Secret password for this file</label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
    </>
  );

  const passwordBox = () => (
    <>
      <label>Password to unlock files</label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
    </>
  );

  const recordsList = () => (
    <>
      {records.length === 0 && <p className="empty">No records to show yet.</p>}
      {records.map((r, i) => {
        const [name, fname] = r.type.split("|");
        return (
          <div className="record" key={i}>
            <div>
              <div className="record-title">{name}</div>
              <div className="muted">{fname} · {new Date(r.time * 1000).toLocaleString()}</div>
              <div className="muted">
                Added by {same(r.by, recordsOwner) ? "the patient" : short(r.by) + " (lab)"}
              </div>
            </div>
            <button className="btn-blue btn-small" onClick={() => download(r)}>Unlock and download</button>
          </div>
        );
      })}
    </>
  );

  return (
    <>
      <div className="topbar">
        <div className="brand">
          BlockCare
          <small>Your health records, locked and in your hands</small>
        </div>
        <div className="wallet">
          {account ? (
            <>
              <span className="badge">{isAdmin ? "Admin" : ROLE_NAMES[role]}</span>
              <span className="addr">{short(account)}</span>
            </>
          ) : (
            <button onClick={connect}>Connect MetaMask</button>
          )}
        </div>
      </div>

      <div className="container">
        {!account && (
          <div className="hero">
            <h1>Welcome to BlockCare</h1>
            <p>
              Patients own their health files. Doctors and labs can only get in when the patient says yes,
              and every step is written on the blockchain.
            </p>
            <button className="btn-primary" onClick={connect}>Connect MetaMask</button>
          </div>
        )}

        {status && <div className={"toast " + status.kind}>{status.text}</div>}

        {account && (
          <div className="grid">
            {/* ---------- ADMIN ---------- */}
            {isAdmin && (
              <div className="card wide">
                <h3>Admin: approve doctors and labs</h3>
                <p className="hint">Only real doctors and labs should be approved, like a hospital manager would.</p>
                {addressBox("Address of the doctor or lab")}
                <label>Role</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  <option value="2">Doctor</option>
                  <option value="3">Diagnostic Lab</option>
                </select>
                <div className="row">
                  <button className="btn-primary" onClick={approve}>Approve</button>
                  <button className="btn-danger" onClick={removeProvider}>Remove</button>
                </div>
              </div>
            )}

            {/* ---------- NO ROLE ---------- */}
            {!isAdmin && role === 0 && (
              <div className="card wide">
                <h3>Join BlockCare</h3>
                <p className="hint">
                  If you are a patient, sign up below. Doctors and labs must ask the admin to approve their address.
                </p>
                <div className="row">
                  <button className="btn-primary" onClick={registerPatient}>I am a patient</button>
                </div>
              </div>
            )}

            {/* ---------- PATIENT ---------- */}
            {role === 1 && (
              <>
                <div className="card">
                  <h3>Upload a record</h3>
                  <p className="hint">The file is locked in your browser before it leaves your computer.</p>
                  {fileFields()}
                  <div className="row">
                    <button className="btn-primary" onClick={patientUpload}>Lock and upload</button>
                  </div>
                </div>

                <div className="card">
                  <h3>Who can see my records?</h3>
                  <p className="hint">Doctors can read. Labs can add results. You are in charge.</p>
                  {addressBox("Address of a doctor or lab")}
                  <div className="row">
                    <button className="btn-primary" onClick={() => (isAddress(target) ? grant(target) : needAddress())}>Allow</button>
                    <button className="btn-danger" onClick={() => (isAddress(target) ? revoke(target) : needAddress())}>Remove access</button>
                  </div>
                  {requests.length > 0 && <label>Waiting for your answer</label>}
                  {requests.map((r) => (
                    <div className="request" key={r}>
                      <span className="mono">{r}</span>
                      <button className="btn-primary btn-small" onClick={() => grant(r)}>Allow</button>
                    </div>
                  ))}
                </div>

                <div className="card wide">
                  <h3>My records</h3>
                  {passwordBox()}
                  <div className="row">
                    <button className="btn-outline" onClick={() => loadRecords(account)}>Refresh</button>
                  </div>
                  {recordsList()}
                </div>

                <div className="card wide">
                  <h3>Activity (who did what, and when)</h3>
                  <p className="hint">Read straight from the blockchain, so nobody can change it.</p>
                  {log.length === 0 && <p className="empty">Nothing yet.</p>}
                  <ul className="log">
                    {log.map((l, i) => (
                      <li key={i}>
                        {l.text}
                        <div className="muted">{new Date(l.time * 1000).toLocaleString()}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {/* ---------- DOCTOR ---------- */}
            {role === 2 && (
              <>
                <div className="card wide">
                  <h3>Find a patient</h3>
                  <p className="hint">Ask for access first. You can read only after the patient says yes.</p>
                  {addressBox("Patient's address")}
                  {passwordBox()}
                  <div className="row">
                    <button className="btn-blue" onClick={requestAccess}>Ask for access</button>
                    <button className="btn-primary" onClick={viewPatientRecords}>View records</button>
                  </div>
                </div>
                <div className="card wide">
                  <h3>Patient records</h3>
                  {recordsList()}
                </div>
              </>
            )}

            {/* ---------- LAB ---------- */}
            {role === 3 && (
              <>
                <div className="card">
                  <h3>Choose a patient</h3>
                  <p className="hint">Ask the patient for permission before adding a result.</p>
                  {addressBox("Patient's address")}
                  <div className="row">
                    <button className="btn-blue" onClick={requestAccess}>Ask for permission</button>
                  </div>
                </div>
                <div className="card">
                  <h3>Add a lab result</h3>
                  <p className="hint">Labs can add results but cannot read the patient's other files.</p>
                  {fileFields()}
                  <div className="row">
                    <button className="btn-primary" onClick={labUpload}>Lock and upload</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="footer">BlockCare · Ethereum + IPFS · running on a local test network</div>
      </div>
    </>
  );
}