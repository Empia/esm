// Based on Node's lib/module.js `_resolveLookupPaths` method.
// Copyright Node.js contributors. Released under MIT license:
// https://github.com/nodejs/node/blob/master/lib/module.js

import { dirname, resolve } from "path"
import builtinModules from "../builtin-modules.js"
import nodeModulePaths from "./node-module-paths.js"

const codeOfDot = ".".charCodeAt(0)
const codeOfSlash = "/".charCodeAt(0)

const { slice } = Array.prototype

function resolveLookupPaths(request, parent) {
  if (request in builtinModules) {
    return null
  }

  // Check for relative path.
  if (request.length < 2 ||
      request.charCodeAt(0) !== codeOfDot ||
      (request.charCodeAt(1) !== codeOfDot &&
       request.charCodeAt(1) !== codeOfSlash)) {
    const paths = parent && parent.paths ? slice.call(parent.paths) : []

    // Maintain backwards compat with certain broken uses of require(".")
    // by putting the module"s directory in front of the lookup paths.
    if (request === ".") {
      paths.unshift(parent && parent.filename
        ? dirname(parent.filename)
        : resolve(request)
      )
    }

    return paths.length ? paths : null
  }

  // With --eval, parent.id is not set and parent.filename is null.
  if (! parent ||
      ! parent.id ||
      ! parent.filename) {
    // Normally the path is taken from `ealpath(__filename)` but with --eval
    // there is no filename.
    const paths = nodeModulePaths(".")
    paths.unshift(".")
    return paths
  }

  return [dirname(parent.filename)]
}
