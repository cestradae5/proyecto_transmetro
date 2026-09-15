import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { DataSource } from "typeorm";

import { createDataSourceOptions } from "./typeorm.options.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));

config({
  path: resolve(currentDirectory, "..", "..", "..", "..", "..", ".env"),
  quiet: true,
});

export default new DataSource(createDataSourceOptions());
