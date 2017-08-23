import Module, { _nodeModulePaths, _resolveFilename } from "module"
import { dirname, extname } from "path"

import Entry from "./entry.js"
import Wrapper from "./wrapper.js"

import assign from "./util/assign.js"
import builtinCompilers from "./builtin-compilers.js"
import builtinModules from "./builtin-modules.js"
import createOptions from "./util/create-options.js"
import getSourceType from "./util/get-source-type.js"
import resolveId from "./path/resolve-id.js"
import setGetter from "./util/set-getter.js"

const queryHashRegExp = /[?#].*$/

class Runtime {
  static enable(mod, exported, options) {
    options = createOptions(options)
    const object = mod.exports

    object.entry = Entry.get(mod, exported, options)
    object.module = mod
    object.options = options

    object.d = object.default = Rp.default
    object.e = object.export = Rp.export
    object.i = object.import = Rp.import
    object.n = object.nsSetter = Rp.nsSetter
    object.r = object.run = Rp.run
    object.u = object.update = Rp.update
    object.w = object.watch = Rp.watch
  }

  // Register a getter function that always returns the given value.
  default(value) {
    return this.export([["default", () => value]])
  }

  // Register getter functions for local variables in the scope of an export
  // statement. Pass true as the second argument to indicate that the getter
  // functions always return the same values.
  export(getterPairs) {
    this.entry.addGetters(getterPairs)
  }

  import(id) {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          this.watch(id, [["*", resolve]])
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  nsSetter() {
    return (childNamespace, childEntry) => this.entry.addGettersFrom(childEntry)
  }

  run(moduleWrapper, req) {
    if (moduleWrapper.length) {
      runCJS(this, moduleWrapper, req)
    } else {
      runESM(this, moduleWrapper)
    }
  }

  // Platform-specific code should find a way to call this method whenever
  // the module system is about to return `module.exports` from `require`.
  // This might happen more than once per module, in case of dependency cycles,
  // so we want `entry.update()` to run each time.
  update(valueToPassThrough) {
    this.entry.update()

    // Returns the `valueToPassThrough` parameter to allow the value of the
    // original expression to pass through. For example,
    //
    //   export let a = 1
    //   console.log(a += 3)
    //
    // becomes
    //
    //   runtime.export("a", () => a)
    //   let a = 1
    //   console.log(runtime.update(a += 3))
    //
    // This ensures `entry.update()` runs immediately after the assignment,
    // and does not interfere with the larger computation.
    return valueToPassThrough
  }

  watch(id, setterPairs) {
    const { entry } = this
    const parent = this.module

    Runtime.requireDepth += 1

    try {
      const childEntry = importModule(id, entry)
      if (setterPairs !== void 0) {
        childEntry.addSetters(setterPairs, Entry.get(parent)).update()
      }
    } finally {
      Runtime.requireDepth -= 1
    }
  }
}

function createModule(filePath, parent) {
  const mod = new Module(filePath, parent)
  mod.filename = filePath
  mod.paths = _nodeModulePaths(dirname(filePath))
  return mod
}

function importModule(id, parentEntry) {
  if (id in builtinModules) {
    return builtinModules[id]
  }

  const { module:parent, options } = parentEntry
  const resId = resolveId(id, parent, options)

  let oldChild
  let cacheId = resId
  let queryHash = queryHashRegExp.exec(id)

  // Each id with a query+hash is given a new cache entry.
  if (queryHash !== null) {
    cacheId = resId + queryHash[0]

    if (cacheId in Module._cache) {
      return loadEntry(cacheId, parentEntry)
    }

    if (resId in Module._cache) {
      // Backup the existing `resId` module. The child module will be stored
      // at `resId` because Node sees the file path without query+hash.
      oldChild = Module._cache[resId]
      delete Module._cache[resId]
    }
  }

  let error

  try {
    loadModule(resId, parent, tryESMLoad)
  } catch (e) {
    error = e
  }

  if (queryHash !== null) {
    Module._cache[cacheId] = Module._cache[resId]

    if (oldChild) {
      Module._cache[resId] = oldChild
    } else {
      delete Module._cache[resId]
    }
  }

  if (error) {
    // Unlike CJS, ESM errors are preserved for subsequent loads.
    setGetter(Module._cache, cacheId, () => {
      throw error
    })
  }

  return loadEntry(cacheId, parentEntry)
}

function loadEntry(cacheId, parentEntry) {
  const childEntry = Entry.get(Module._cache[cacheId])
  childEntry.loaded()
  return parentEntry.children[cacheId] = childEntry
}

function loadModule(filePath, parent, tryModuleLoad) {
  let child

  if (filePath in Module._cache) {
    child = Module._cache[filePath]
  } else {
    child = createModule(filePath, parent)
    tryModuleLoad(child, filePath)
  }

  return child.exports
}

function requireWrapper(func, id) {
  Runtime.requireDepth += 1

  try {
    if (id in builtinModules) {
      return func(id)
    }

    const parent = this.module
    const filePath = _resolveFilename(id, parent)
    return loadModule(filePath, parent, tryCJSLoad)
  } finally {
    Runtime.requireDepth -= 1
  }
}

function runCJS(runtime, moduleWrapper, req) {
  const mod = runtime.module
  const { entry } = runtime
  const exported = mod.exports = entry.exports
  const filePath = mod.filename
  const { options } = runtime

  if (! options.cjs) {
    req = wrapRequire(runtime, req, requireWrapper)
  }

  moduleWrapper.call(exported, exported, req, mod, filePath, dirname(filePath))
  mod.loaded = true

  entry.merge(Entry.get(mod, mod.exports, options))
  entry.exports = mod.exports
  entry.sourceType = getSourceType(entry.exports)

  Entry.set(mod.exports, entry)
  entry.update().loaded()
}

function runESM(runtime, moduleWrapper) {
  const mod = runtime.module
  const { entry } = runtime
  const exported = mod.exports = entry.exports
  const { options } = runtime

  moduleWrapper.call(options.cjs ? exported : void 0)
  mod.loaded = true

  entry.update().loaded()
  assign(exported, entry._namespace)
}

function tryCJSLoad(mod, filePath) {
  let ext = extname(filePath)

  if (! ext || typeof Module._extensions[ext] !== "function") {
    ext = ".js"
  }

  const compiler = Wrapper.unwrap(Module._extensions, ext)

  let threw = true
  Module._cache[filePath] = mod

  try {
    compiler.call(Module._extensions, mod, filePath)
    mod.loaded = true
    threw = false
  } finally {
    if (threw) {
      delete Module._cache[filePath]
    }
  }
}

function tryESMLoad(mod, filePath) {
  const ext = extname(filePath)
  const compiler = builtinCompilers[ext]

  let threw = true
  Module._cache[filePath] = mod

  try {
    if (typeof compiler === "function") {
      compiler(mod, filePath)
    } else {
      mod.load(filePath)
    }

    mod.loaded = true
    threw = false
  } finally {
    if (threw) {
      delete Module._cache[filePath]
    }
  }
}

function wrapRequire(runtime, req, wrapper) {
  const wrapped = (id) => wrapper.call(runtime, req, id)
  return assign(wrapped, req)
}

Runtime.requireDepth = 0

const Rp = Object.setPrototypeOf(Runtime.prototype, null)

Rp.d = Rp.default
Rp.e = Rp.export
Rp.i = Rp.import
Rp.n = Rp.nsSetter
Rp.r = Rp.run
Rp.u = Rp.update
Rp.w = Rp.watch

export default Runtime
