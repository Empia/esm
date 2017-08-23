import FastObject from "../fast-object.js"

import decodeURIComponent from "../util/decode-uri-component.js"
import { dirname } from "path"
import encodedSlash from "../util/encoded-slash.js"
import errors from "../errors.js"
import isPath from "./is-path.js"
import nodeModulePaths from "../module/node-module-paths.js"
import parseURL from "../util/parse-url.js"
import resolveFilePath from "./resolve-file-path.js"
import urlToPath from "../util/url-to-path.js"

const codeOfSlash = "/".charCodeAt(0)

const { cwd } = process
const pathMode = process.platform === "win32" ? "win32" : "posix"

const localhostRegExp = /^\/\/localhost\b/
const queryHashRegExp = /[?#].*$/

function resolveId(id, parent, options) {
  if (typeof id !== "string") {
    throw new errors.TypeError("ERR_INVALID_ARG_TYPE", "id", "string")
  }

  const { isMain } = options
  const filename = parent && typeof parent.filename === "string"
    ? parent.filename
    : "."

  const fromPath = dirname(filename)

  if (! encodedSlash(id, pathMode)) {
    if (! isPath(id) &&
        (id.charCodeAt(0) === codeOfSlash || id.includes(":"))) {
      const parsed = parseURL(id)
      let foundPath = urlToPath(parsed, pathMode)

      if (! foundPath &&
          parsed.protocol !== "file:" &&
          ! localhostRegExp.test(id)) {
        throw new errors.Error("ERR_INVALID_PROTOCOL", parsed.protocol, "file:")
      }

      if (foundPath) {
        foundPath = resolveFilePath(foundPath, parent, isMain)
      }

      if (foundPath) {
        return foundPath
      }
    } else {
      let fromParent = parent

      if (! options.cjs)  {
        // Prevent resolving non-local dependencies:
        // https://github.com/bmeck/node-eps/blob/rewrite-esm/002-es-modules.md#432-removal-of-non-local-dependencies
        const paths = nodeModulePaths(fromPath)

        // Hack: Overwrite `path.concat()` to prevent global paths from being
        // concatenated.
        paths.concat = () => paths

        // Ensure a parent id and filename are provided to avoid going down the
        // --eval branch of `Module._resolveLookupPaths()`.
        fromParent = { filename, id: "<mock>", paths }
      }

      const decodedId = decodeURIComponent(id.replace(queryHashRegExp, ""))
      const foundPath = resolveFilePath(decodedId, fromParent, isMain)

      if (foundPath) {
        return foundPath
      }
    }
  }

  const foundPath = resolveFilePath(id, parent, isMain)

  if (foundPath) {
    throw new errors.Error("ERR_MODULE_RESOLUTION_DEPRECATED", id, fromPath, foundPath)
  } else {
    throw new errors.Error("ERR_MISSING_MODULE", id)
  }
}

export default resolveId
