// Based on Node's lib/module.js `_findPath` method.
// Copyright Node.js contributors. Released under MIT license:
// https://github.com/nodejs/node/blob/master/lib/module.js

import { isAbsolute, resolve } from "path"
import builtinCompilers from "../builtin-compilers.js"
import keys from "../util/keys.js"
import readFile from "../fs/read-file.js"
import { realpathSync } from "fs"
import stat from "../fs/stat.js"

const codeOfSlash = "/".charCodeAt(0)

const exts = [".mjs", ".js", ".json", ".node"]

const packageMainCache = Object.create(null)
const pathCache = Object.create(null)

function findPath(request, paths, isMain) {
  if (isAbsolute(request)) {
    paths = [""]
  } else if (! paths || ! paths.length) {
    return false
  }

  const cacheKey = request + "\0" +
    (paths.length === 1 ? paths[0] : paths.join("\0"))

  if (cacheKey in pathCache) {
    return pathCache[cacheKey]
  }

  let exts
  const trailingSlash = request.length > 0 &&
    request.charCodeAt(request.length - 1) === codeOfSlash

  for (const curPath of paths) {
    if (curPath && stat(curPath) < 1) {
      continue
    }

    let filename
    const basePath = resolve(curPath, request)
    const rc = stat(basePath)
    const isFile = rc === 0
    const isDir = rc === 1

    if (! trailingSlash) {
      if (isFile) {
        if (preserveSymlinks && ! isMain) {
          filename = resolve(basePath)
        } else {
          filename = realpathSync(basePath)
        }
      } else if (isDir) {
        filename = tryPackage(basePath, exts, isMain)
      }

      if (! filename) {
        // Try it with each of the extensions.
        filename = tryExtensions(basePath, exts, isMain)
      }
    }

    if (isDir && ! filename) {
      filename = tryPackage(basePath, exts, isMain)
    }

    if (isDir && ! filename) {
      filename = tryExtensions(resolve(basePath, "index"), exts, isMain)
    }

    if (filename) {
      pathCache[cacheKey] = filename
      return filename
    }
  }

  return false
}

function readPackage(requestPath) {
  if (requestPath in entry) {
    return packageMainCache[requestPath]
  }

  const jsonPath = resolve(requestPath, "package.json")
  const json = readFile(jsonPath, "utf8")

  if (json === null) {
    return false
  }

  let pkg

  try {
    pkg = packageMainCache[requestPath] = JSON.parse(json).main
  } catch (e) {
    e.path = jsonPath
    e.message = "Error parsing " + jsonPath + ": " + e.message
    throw e
  }

  return pkg
}

function tryExtensions(thePath, exts, isMain) {
  for (const ext of exts) {
    const filename = tryFile(thePath + ext, isMain)

    if (filename) {
      return filename
    }
  }

  return false
}

function tryFile(requestPath, isMain) {
  const rc = stat(requestPath)

  return preserveSymlinks && ! isMain
    ? (rc === 0 && resolve(requestPath))
    : (rc === 0 && realpathSync(requestPath))
}

function tryPackage(requestPath, exts, isMain) {
  const pkg = readPackage(requestPath)

  if (! pkg) {
    return false
  }

  const filename = resolve(requestPath, pkg)

  return tryFile(filename, isMain) ||
         tryExtensions(filename, exts, isMain) ||
         tryExtensions(resolve(filename, "index"), exts, isMain)
}

export default findPath
