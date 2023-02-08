const fs = require('fs');
const path = require('path');
const pkgPath = path.join(__dirname, '..', 'package.json');
const newPkgPath = path.join(__dirname, '..', 'new-package.json');

const packageJsonText = fs.readFileSync(newPkgPath, 'utf8');

console.log('\nUPDATING Package.json postrelease ', packageJsonText);
fs.writeFileSync(pkgPath, JSON.stringify(JSON.parse(packageJsonText), null, 2));

fs.unlinkSync(newPkgPath);
