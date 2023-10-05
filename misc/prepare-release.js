const fs = require('fs');
const path = require('path');
const pkgPath = path.join(__dirname, '..', 'package.json');
const newPkgPath = path.join(__dirname, '..', 'new-package.json');

const packageJsonText = fs.readFileSync(pkgPath);
const packageJson = JSON.parse(packageJsonText);

const nextVersion = process.argv[2] || '0.0.0';

function getChildDirectories(directory) {
  const childDirectories = [];

  const files = fs.readdirSync(directory);

  for (const file of files) {
    const filePath = path.join(directory, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      childDirectories.push(file);
    }
  }

  return childDirectories;
}

const topPaths = getChildDirectories(path.join(__dirname, '..', 'src'))
  .filter((dir) => !dir.includes('__tests__'))
  .map((item) => path.basename(item));

const defaultExports = {
  '.': {
    types: './dist/index.d.ts',
    import: './dist/index.mjs',
    require: './dist/index.js',
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
};

fs.writeFileSync(pkgPath, JSON.stringify(publishPkgJson, null, 2));

fs.writeFileSync(
  newPkgPath,
  JSON.stringify({ ...packageJson, version: nextVersion }, null, 2),
);
console.log('\nUPDATING PACKAGE: ', JSON.stringify(publishPkgJson, null, 2));
