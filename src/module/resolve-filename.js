// Based on Node's lib/module.js `_resolveFilename` method.
// Copyright Node.js contributors. Released under MIT license:
// https://github.com/nodejs/node/blob/master/lib/module.js

import findPath from "./find-path.js"
import resolveLookupPaths from "./resolve-lookup-paths.js"

function resolveFilename(request, parent, isMain) {
  if (request in builtinModules) {
    return request
  }

  const paths = resolveLookupPaths(request, parent)
  const filename = findPath(request, paths, isMain)

  if (! filename) {
    const error = new Error(`Cannot find module "${request}"`)
    error.code = "MODULE_NOT_FOUND"
    throw error
  }

  return filename
}
