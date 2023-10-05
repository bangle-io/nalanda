const fs = require('fs');
const path = require('path');

const IMPORT_STATEMENT =
  "import { expect, jest, test } from '@jest/globals';\n";

function addImportStatementToTestFiles(dir) {
  // Read all items in the directory.
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);

    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      // If the item is a directory, recurse into it.
      addImportStatementToTestFiles(fullPath);
    } else if (stats.isFile() && item.endsWith('.test.ts')) {
      // If the item is a .test.ts file, add the import statement.
      const fileContent = fs.readFileSync(fullPath, 'utf-8');

      if (!fileContent.startsWith(IMPORT_STATEMENT)) {
        const updatedContent = IMPORT_STATEMENT + fileContent;
        fs.writeFileSync(fullPath, updatedContent, 'utf-8');
        console.log(`Updated file: ${fullPath}`);
      }
    }
  }
}

const directoryToStart = './'; // You can modify this path to be the directory you want to start from.
addImportStatementToTestFiles(directoryToStart);

console.log('Processing completed.');
