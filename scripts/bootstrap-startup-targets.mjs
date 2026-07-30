#!/usr/bin/env node
console.error(`
This pipeline runs entirely in n8n now.

  1. Import workflow-startup-targets.json
  2. Create the Google Sheet via google-sheets-startup-targets-setup.js
  3. Set Config.forceImportSeed = true and Execute once

See STARTUP_TARGETS.md
`);
process.exit(1);
