#!/usr/bin/env node

import { main } from './lib/queryCli.mjs';
import { getClientErrorMessage } from '../src/core/clientErrorMessages.js';

main().catch(error => {
  console.error(getClientErrorMessage(error, {
    fallback: 'The command could not be completed. Check the options and try again.'
  }));
  process.exitCode = 1;
});
