import { build } from "bun";

await build({
    entrypoints: ["./src/drizzle.ts"],
    outdir: "./dist",
    target: "bun",
    format: "esm",
    splitting: true,
    minify: true,
    sourcemap: "none",
});

console.log("✅ Cache package built successfully!");
