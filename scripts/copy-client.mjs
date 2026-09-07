import { cp, mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
await mkdir(new URL("lib/", root), { recursive: true });
await cp(new URL("src/client.js", root), new URL("lib/client.js", root));
