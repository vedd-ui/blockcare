import { useState } from "react";
import { BrowserProvider, Contract } from "ethers";
import artifact from "./BlockCare.json";

const IPFS_API = "http://127.0.0.1:5001/api/v0";
const IPFS_GATEWAY = "http://127.0.0.1:8080/ipfs";

// Turn a password into an AES key
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

// File -> locked blob (salt + iv + encrypted data)
async function encryptFile(file, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getKey(password, salt);
  const data = await file.arrayBuffer();
  const locked = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return new Blob([salt, iv, locked]);
}

// Locked bytes -> original bytes
async function decryptBytes(buffer, password) {
  const bytes = new Uint8Array(buffer);
  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const data = bytes.slice(28);
  const key = await getKey(password, salt);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
}

export default function App() {
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState("");
  const [file, setFile] = useState(null);
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [records, setRecords] = useState([]);
  const [otherAddr, setOtherAddr] = useState("");

  const fail = (e) => setStatus("Error: " + (e.reason || e.shortMessage || e.message));

  async function connect() {
    try {
      if (!window.ethereum) return setStatus("Please install MetaMask");
      const provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const net = artifact.networks["5777"];
      if (!net) return setStatus("Contract not deployed. Run truffle migrate --reset and copy BlockCare.json again.");
      setContract(new Contract(net.address, artifact.abi, signer));
      setAccount(await signer.getAddress());
      setStatus("Connected");
    } catch (e) { fail(e); }
  }

  async function upload() {
    try {
      if (!file || !password) return setStatus("Choose a file and a password");
      setStatus("Locking the file...");
      const blob = await encryptFile(file, password);
      const form = new FormData();
      form.append("file", blob);
      setStatus("Sending to IPFS...");
      const res = await fetch(`${IPFS_API}/add`, { method: "POST", body: form });
      const { Hash } = await res.json();
      setStatus("Saving on blockchain (confirm in MetaMask)...");
      const tx = await contract.addRecord(Hash, `${label || "record"}|${file.name}`);
      await tx.wait();
      setStatus("Done! Saved with ID " + Hash);
    } catch (e) { fail(e); }
  }

  async function loadRecords(owner) {
    try {
      setStatus("Loading...");
      const n = Number(await contract.getRecordCount(owner));
      const list = [];
      for (let i = 0; i < n; i++) {
        const r = await contract.getRecord(owner, i);
        list.push({ cid: r[0], type: r[1], by: r[2], time: Number(r[3]) });
      }
      setRecords(list);
      setStatus(`Found ${n} record(s)`);
    } catch (e) { fail(e); }
  }

  async function download(rec) {
    try {
      if (!password) return setStatus("Type the password first");
      const res = await fetch(`${IPFS_GATEWAY}/${rec.cid}`);
      const plain = await decryptBytes(await res.arrayBuffer(), password);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([plain]));
      a.download = rec.type.split("|")[1] || "record";
      a.click();
      setStatus("Downloaded");
    } catch (e) { setStatus("Could not open file. Wrong password?"); }
  }

  async function send(method) {
    try {
      setStatus("Confirm in MetaMask...");
      const tx = await contract[method](otherAddr);
      await tx.wait();
      setStatus(method + " done");
    } catch (e) { fail(e); }
  }

  const box = { border: "1px solid #888", borderRadius: 8, padding: 16, margin: "16px 0", textAlign: "left" };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 16 }}>
      <h1>BlockCare</h1>
      <button onClick={connect}>{account ? "Connected" : "Connect MetaMask"}</button>
      <p>{account && "Account: " + account}</p>
      <p><b>{status}</b></p>

      {account && (<>
        <div style={box}>
          <h3>1. Upload a record (patient)</h3>
          <input type="file" onChange={(e) => setFile(e.target.files[0])} /><br /><br />
          <input placeholder="Label (e.g. lab report)" value={label} onChange={(e) => setLabel(e.target.value)} /><br /><br />
          <input type="password" placeholder="Secret password" value={password} onChange={(e) => setPassword(e.target.value)} /><br /><br />
          <button onClick={upload}>Lock and upload</button>
        </div>

        <div style={box}>
          <h3>2. Give or take access (patient)</h3>
          <input placeholder="Doctor's address 0x..." value={otherAddr} onChange={(e) => setOtherAddr(e.target.value)} style={{ width: "100%" }} /><br /><br />
          <button onClick={() => send("grantAccess")}>Grant</button>{" "}
          <button onClick={() => send("revokeAccess")}>Revoke</button>
        </div>

        <div style={box}>
          <h3>3. Doctor: ask for access</h3>
          <p>Uses the address typed above as the patient's address.</p>
          <button onClick={() => send("requestAccess")}>Request access</button>
        </div>

        <div style={box}>
          <h3>4. See records</h3>
          <button onClick={() => loadRecords(account)}>My records</button>{" "}
          <button onClick={() => loadRecords(otherAddr)}>Records of address above</button>
          {records.map((r, i) => (
            <div key={i} style={{ marginTop: 12 }}>
              <b>{r.type.split("|")[0]}</b> ({r.type.split("|")[1]})<br />
              {new Date(r.time * 1000).toLocaleString()}<br />
              <button onClick={() => download(r)}>Unlock and download</button>
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}