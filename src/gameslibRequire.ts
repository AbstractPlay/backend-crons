import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** createRequire resolves @abstractplay/gameslib from the Lambda layer at runtime. */
export const { gameinfo } = require("@abstractplay/gameslib");
export const { replacer } = require("@abstractplay/gameslib/build/common/serialization.js");
