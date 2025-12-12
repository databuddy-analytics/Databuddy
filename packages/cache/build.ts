import { build } from "bun";

await build({
    entrypoints: ["./src/drizzle.ts"],
    outdir: "./dist",
    target: "bun",
    format: "esm",
    splitting: false,
    minify: false,
    sourcemap: "external",
});

console.log("✅ Cache package built successfully!");
