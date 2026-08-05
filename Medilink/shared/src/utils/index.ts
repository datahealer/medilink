// Web-leaning utils (cn uses tailwind-merge). Not re-exported from ./mobile.
export * from "./cn";
export * from "./routes";
// Dependency-free, so ./mobile re-exports it directly rather than through this barrel.
export * from "./normalize";
