import "server-only";

// The ledger's public API (docs/ledger.md). The only code that touches the
// Ledger* tables is this module: the ESLint rule shelter/ledger-boundary keeps
// everyone else out, the triggers of the `ledger` migration guard the rest.
export { createNeedAccount, SYSTEM_ACCOUNT } from "./accounts";
export { balance } from "./balance";
export { LedgerError, type LedgerErrorCode } from "./errors";
export type { LedgerEntryInput, PostInput, PostKind } from "./input";
export { post, reverse, type PostResult } from "./post";
