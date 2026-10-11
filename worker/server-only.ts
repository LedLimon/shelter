// `import "server-only"` keeps server modules out of client bundles; Next.js
// provides the package itself. The worker is a server and runs outside
// Next.js, so tsconfig.worker.json points the import here.
export {};
