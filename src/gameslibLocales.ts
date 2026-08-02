import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** createRequire avoids ESM JSON import assertions when @abstractplay/gameslib is an esbuild external. */
export const enApgames = require("@abstractplay/gameslib/locales/en/apgames.json");
export const enApresults = require("@abstractplay/gameslib/locales/en/apresults.json");
