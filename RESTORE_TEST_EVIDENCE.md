# RDS Restore Test Evidence

**Date:** 2026-08-03 13:38:03 -07:00
**Production DB:** patient-vault-db (untouched)
**Snapshot:** rds:patient-vault-db-2026-08-03-10-04
**Temp instance:** patient-vault-db-restore-test-20260803
**Region:** us-east-1

**Temp endpoint:** patient-vault-db-restore-test-20260803.cj9hnwn91exe.us-east-1.rds.amazonaws.com:5432
**Became available after:** 5.9 minutes

## Connectivity / readability check
```
node : node:internal/modules/cjs/loader:1459
At C:\Users\Firas\AppData\Local\Temp\ps-script-ba988fd0-1e3c-482f-b3e8-a4a493987765.ps1:180 char:11
+ $result = node $tmpJs 2>&1
+           ~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (node:internal/modules/cjs/loader:1459:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
  throw err;
  ^

Error: Cannot find module '@prisma/client'
Require stack:
- C:\Users\Firas\AppData\Local\Temp\pv-restore-test.js
    at Module._resolveFilename (node:internal/modules/cjs/loader:1456:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:1066:19)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1071:22)
    at Module._load (node:internal/modules/cjs/loader:1242:25)
    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
    at Module.require (node:internal/modules/cjs/loader:1556:12)
    at require (node:internal/modules/helpers:152:16)
    at Object.<anonymous> (C:\Users\Firas\AppData\Local\Temp\pv-restore-test.js:1:27)
    at Module._compile (node:internal/modules/cjs/loader:1812:14)
    at Object..js (node:internal/modules/cjs/loader:1943:10) {
  code: 'MODULE_NOT_FOUND',
  requireStack: [ 'C:\\Users\\Firas\\AppData\\Local\\Temp\\pv-restore-test.js' ]
}

Node.js v24.14.0

```
**Result:** FAILED connectivity

## Connectivity / readability check (retry from project dir)
```
{"ok":true,"users":8,"patients":6,"select1":[{"ok":1}]}
```
**Result:** PASSED — restored DB readable (user/patient counts returned)

**Cleanup:** delete-db-instance issued for patient-vault-db-restore-test-20260803 (skip-final-snapshot)

**Overall:** RESTORE TEST PASSED
**Production:** patient-vault-db was not modified.
