#!/usr/bin/env node

import { main } from './lib/queryCli.mjs';

main().catch(error => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
