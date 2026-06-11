// Structural Config payload guard for the main process.
// Deep validation logic lives in @shared/config-validate (single source of truth);
// this module is the main-process entry point the IPC layer imports.
export { validateConfig } from '@shared/config-validate';
