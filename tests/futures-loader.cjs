const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loader(overrides = {}) {
  const cache = new Map();
  function load(relative) {
    relative = relative.replace(/\\/g, '/');
    const filename = path.resolve(root, relative);
    if (Object.hasOwn(overrides, relative)) return overrides[relative];
    if (cache.has(filename)) return cache.get(filename);
    const module = { exports: {} }; cache.set(filename, module.exports);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const localRequire = name => {
      if (!name.startsWith('@/') && !name.startsWith('.')) return require(name);
      let rel = name.startsWith('@/') ? name.slice(2) : path.relative(root, path.resolve(path.dirname(filename), name));
      if (!rel.endsWith('.ts')) rel += '.ts';
      return load(rel);
    };
    new Function('require', 'module', 'exports', source)(localRequire, module, module.exports);
    cache.set(filename, module.exports); return module.exports;
  }
  return load;
}

module.exports = loader;
