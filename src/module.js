const BuiltinModule = __non_webpack_module__.constructor

class Module extends BuiltinModule {
  constructor(id, parent) {
    super(id, parent)
  }
}

Module._cache = Object.create(null)

export default Module
