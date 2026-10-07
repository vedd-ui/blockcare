# BlockCare measurements

- Samples per action: 500
- Network: local Ganache (single node, instant mining)
- Ganache gas price this run: 2.50 gwei (cost column uses a fixed 20 gwei)
- Contract deployment gas: 2527323 (0.050546 ETH at 20 gwei)
- Date: 2026-10-07T12:08:17.031Z

| Action | Type | Mean ms | Median ms | p95 ms | Min ms | Max ms | Mean gas | Mean cost (ETH) |
|---|---|---|---|---|---|---|---|---|
| Patient adds record (addRecord) | transaction | 208.26 | 194.11 | 296.84 | 130.14 | 898.67 | 148745 | 0.002975 |
| Patient grants access (grantAccess) | transaction | 268.45 | 247.06 | 388.55 | 180.38 | 505.21 | 52909 | 0.001058 |
| Patient revokes access (revokeAccess) | transaction | 63.29 | 60.81 | 90.71 | 38.06 | 208.35 | 26222 | 0.000524 |
| Lab uploads result for patient (addRecordFor) | transaction | 174.27 | 166.16 | 248.56 | 103.83 | 376.93 | 153895 | 0.003078 |
| Doctor reads patient record (getRecord) | read call | 23.72 | 22.70 | 32.95 | 16.15 | 67.52 | 0 (read-only) | 0 |
| Patient reads own record (getRecord) | read call | 19.79 | 19.34 | 25.61 | 14.45 | 50.40 | 0 (read-only) | 0 |
| Patient reads record count (getRecordCount) | read call | 7.18 | 6.62 | 9.69 | 4.99 | 33.89 | 0 (read-only) | 0 |

Note: read calls are free (no gas). Times are from a local test network and are not comparable to a cloud or public network.