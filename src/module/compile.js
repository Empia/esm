
// Run the file contents in the correct scope or sandbox. Expose
// the correct helper variables (require, module, exports) to
// the file.
// Returns exception, if any.
Module.prototype._compile = function(content, filename) {

    content = internalModule.stripShebang(content);

    // create wrapper function
    var wrapper = Module.wrap(content);

    var compiledWrapper = vm.runInThisContext(wrapper, {
      filename: filename,
      lineOffset: 0,
      displayErrors: true
    });

    var inspectorWrapper = null;
    if (process._breakFirstLine && process._eval == null) {
      if (!resolvedArgv) {
        // we enter the repl if we're not given a filename argument.
        if (process.argv[1]) {
          resolvedArgv = Module._resolveFilename(process.argv[1], null, false);
        } else {
          resolvedArgv = 'repl';
        }
      }

      // Set breakpoint on module start
      if (filename === resolvedArgv) {
        delete process._breakFirstLine;
        inspectorWrapper = process.binding('inspector').callAndPauseOnStart;
        if (!inspectorWrapper) {
          const Debug = vm.runInDebugContext('Debug');
          Debug.setBreakPoint(compiledWrapper, 0, 0);
        }
      }
    }
    var dirname = path.dirname(filename);
    var require = internalModule.makeRequireFunction(this);
    var depth = internalModule.requireDepth;
    if (depth === 0) stat.cache = new Map();
    var result;
    if (inspectorWrapper) {
      result = inspectorWrapper(compiledWrapper, this.exports, this.exports,
                                require, this, filename, dirname);
    } else {
      result = compiledWrapper.call(this.exports, this.exports, require, this,
                                    filename, dirname);
    }
    if (depth === 0) stat.cache = null;
    return result;
  };
