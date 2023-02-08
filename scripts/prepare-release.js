const fs = require('fs');
const path = require('path');
const pkgPath = path.join(__dirname, '..', 'package.json');
const newPkgPath = path.join(__dirname, '..', 'new-package.json');

const packageJsonText = fs.readFileSync(pkgPath);
const packageJson = JSON.parse(packageJsonText);

const nextVersion = process.argv[2] || '0.0.0';

const topPaths = ['vanilla', 'react', 'sync', 'test-helpers'];
const defaultExports = {
  '.': {
    types: './index.d.ts',
    import: './index.mjs',
    require: './index.js',
  },
  './package.json': './package.json',
};

const exportsObj = topPaths.reduce(
  (acc, file) => ({
    ...acc,
    [`./${file}`]: {
      types: `./dist/${file}/index.d.ts`,
      import: `./dist/${file}/index.mjs`,
      require: `./dist/${file}/index.js`,
    },
  }),
  defaultExports,
);

const publishPkgJson = {
  ...packageJson,
  exports: exportsObj,
  main: 'dist/index.js',
  module: 'dist/index.mjs',
  types: 'dist/index.d.ts',
  description: 'update-h',
};

console.log('\nUPDATING EXPORTS: ', publishPkgJson);

fs.writeFileSync(pkgPath, JSON.stringify(publishPkgJson, null, 2));

fs.writeFileSync(
  newPkgPath,
  JSON.stringify({ ...packageJson, version: nextVersion }, null, 2),
);
console.log('\nUPDATING PACKAGE: ', JSON.stringify(publishPkgJson, null, 2));
