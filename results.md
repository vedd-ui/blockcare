# BlockCare measurements

- Samples per action: 500
- Network: local Ganache (single node, instant mining)
- Ganache gas price this run: 2.50 gwei (cost column uses a fixed 20 gwei)
- Contract deployment gas: 2399204 (0.047984 ETH at 20 gwei)
- Date: 2026-10-07T11:23:30.908Z

| Action | Type | Mean ms | Median ms | p95 ms | Min ms | Max ms | Mean gas | Mean cost (ETH) |
|---|---|---|---|---|---|---|---|---|
| Patient adds record (addRecord) | transaction | 251.76 | 226.65 | 434.56 | 102.55 | 878.58 | 125776 | 0.002516 |
| Patient grants access (grantAccess) | transaction | 439.72 | 414.43 | 694.76 | 216.43 | 1437.77 | 52887 | 0.001058 |
| Patient revokes access (revokeAccess) | transaction | 95.43 | 90.60 | 158.70 | 41.98 | 280.81 | 26266 | 0.000525 |
| Lab uploads result for patient (addRecordFor) | transaction | 206.16 | 181.88 | 339.15 | 100.94 | 649.63 | 130984 | 0.002620 |
| Doctor reads patient record (getRecord) | read call | 35.30 | 33.72 | 50.06 | 21.90 | 103.47 | 0 (read-only) | 0 |
| Patient reads own record (getRecord) | read call | 31.93 | 30.78 | 43.07 | 21.79 | 83.60 | 0 (read-only) | 0 |
| Patient reads record count (getRecordCount) | read call | 13.57 | 13.21 | 17.98 | 8.66 | 33.37 | 0 (read-only) | 0 |

Note: read calls are free (no gas). Times are from a local test network and are not comparable to a cloud or public network.