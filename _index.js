/**
 * Modules
 *
 * Copyright (c) 2013 Filatov Dmitry (dfilatov@yandex-team.ru)
 * Dual licensed under the MIT and GPL licenses:
 * http://www.opensource.org/licenses/mit-license.php
 * http://www.gnu.org/licenses/gpl.html
 *
 * @version 0.1.0
 */

(function(global) {

var undef,

    DECL_STATES = {
        NOT_RESOLVED : 'NOT_RESOLVED',
        IN_RESOLVING : 'IN_RESOLVING',
        RESOLVED     : 'RESOLVED'
    },

    /**
     * Creates a new instance of modular system
     * @returns {Object}
     */
    create = function() {
        var curOptions = {
                trackCircularDependencies : true,
                allowMultipleDeclarations : true
            },

            modulesStorage = {},
            waitForNextTick = false,
            pendingRequires = [],

            /**
             * Defines module
             * @param {String} name
             * @param {String[]} [deps]
             * @param {Function} declFn
             */
            define = function(name, deps, declFn) {
                if(!declFn) {
                    declFn = deps;
                    deps = [];
                }

                var module = modulesStorage[name];
                if(!module) {
                    module = modulesStorage[name] = {
                        name : name,
                        decl : undef
                    };
                }

                module.decl = {
                    name       : name,
                    prev       : module.decl,
                    fn         : declFn,
                    state      : DECL_STATES.NOT_RESOLVED,
                    deps       : deps,
                    dependents : [],
                    exports    : undef
                };
            },

            /**
             * Requires modules
             * @param {String|String[]} modules
             * @param {Function} cb
             * @param {Function} [errorCb]
             */
            require = function(modules, cb, errorCb) {
                if(typeof modules === 'string') {
                    modules = [modules];
                }

                if(!waitForNextTick) {
                    waitForNextTick = true;
                    nextTick(onNextTick);
                }

                pendingRequires.push({
                    deps : modules,
                    cb   : function(exports, error) {
                        error?
                            (errorCb || onError)(error) :
                            cb.apply(global, exports);
                    }
                });
            },

            /**
             * Returns state of module
             * @param {String} name
             * @returns {String} state, possible values are NOT_DEFINED, NOT_RESOLVED, IN_RESOLVING, RESOLVED
             */
            getState = function(name) {
                var module = modulesStorage[name];
                return module?
                    DECL_STATES[module.decl.state] :
                    'NOT_DEFINED';
            },

            /**
             * Returns whether the module is defined
             * @param {String} name
             * @returns {Boolean}
             */
            isDefined = function(name) {
                return !!modulesStorage[name];
            },

            /**
             * Sets options
             * @param {Object} options
             */
            setOptions = function(options) {
                for(var name in options) {
                    if(options.hasOwnProperty(name)) {
                        curOptions[name] = options[name];
                    }
                }
            },

            onNextTick = function() {
                waitForNextTick = false;
                applyRequires();
            },

            applyRequires = function() {
                var requiresToProcess = pendingRequires,
                    i = 0, require;

                pendingRequires = [];

                while(require = requiresToProcess[i++]) {
                    requireDeps(null, require.deps, [], require.cb);
                }
            },

            requireDeps = function(fromDecl, deps, path, cb) {
                var unresolvedDepsCnt = deps.length;
                if(!unresolvedDepsCnt) {
                    cb([]);
                }

                var decls = [],
                    i = 0, len = unresolvedDepsCnt,
                    dep, decl;

                while(i < len) {
                    dep = deps[i++];
                    if(typeof dep === 'string') {
                        if(!modulesStorage[dep]) {
                            cb(null, buildModuleNotFoundError(dep, fromDecl));
                            return;
                        }

                        decl = modulesStorage[dep].decl;
                    }
                    else {
                        decl = dep;
                    }

                    if(decl.state === DECL_STATES.IN_RESOLVING &&
                            curOptions.trackCircularDependencies &&
                            isDependenceCircular(decl, path)) {
                        cb(null, buildCircularDependenceError(decl, path));
                        return;
                    }

                    decls.push(decl);

                    startDeclResolving(
                        decl,
                        path,
                        function(_, error) {
                            if(error) {
                                cb(null, error);
                                return;
                            }

                            if(!--unresolvedDepsCnt) {
                                var exports = [],
                                    i = 0, decl;
                                while(decl = decls[i++]) {
                                    exports.push(decl.exports);
                                }
                                cb(exports);
                            }
                        });
                }
            },

            startDeclResolving = function(decl, path, cb) {
                if(decl.state === DECL_STATES.RESOLVED) {
                    cb(decl.exports);
                    return;
                }
                else {
                    decl.dependents.push(cb);
                }

                if(decl.state === DECL_STATES.IN_RESOLVING) {
                    return;
                }

                if(decl.prev && !curOptions.allowMultipleDeclarations) {
                    provideError(decl, buildMultipleDeclarationError(decl));
                    return;
                }

                curOptions.trackCircularDependencies && (path = path.slice()).push(decl);

                var isProvided = false,
                    deps = decl.prev? decl.deps.concat([decl.prev]) : decl.deps;

                decl.state = DECL_STATES.IN_RESOLVING;
                requireDeps(
                    decl,
                    deps,
                    path,
                    function(depDeclsExports, error) {
                        if(error) {
                            provideError(decl, error);
                            return;
                        }

                        depDeclsExports.unshift(function(exports, error) {
                            if(isProvided) {
                                cb(null, buildDeclAreadyProvidedError(decl));
                                return;
                            }

                            isProvided = true;
                            error?
                                provideError(decl, error) :
                                provideDecl(decl, exports);
                        });

                        decl.fn.apply(
                            {
                                name   : decl.name,
                                deps   : decl.deps,
                                global : global
                            },
                            depDeclsExports);
                    });
            },

            provideDecl = function(decl, exports) {
                decl.exports = exports;
                decl.state = DECL_STATES.RESOLVED;

                var i = 0, dependent;
                while(dependent = decl.dependents[i++]) {
                    dependent(exports);
                }

                decl.dependents = undef;
            },

            provideError = function(decl, error) {
                decl.state = DECL_STATES.NOT_RESOLVED;

                var i = 0, dependent;
                while(dependent = decl.dependents[i++]) {
                    dependent(null, error);
                }

                decl.dependents = [];
            };

        return {
            create     : create,
            define     : define,
            require    : require,
            getState   : getState,
            isDefined  : isDefined,
            setOptions : setOptions
        };
    },

    onError = function(e) {
        nextTick(function() {
            throw e;
        });
    },

    buildModuleNotFoundError = function(name, decl) {
        return Error(decl?
            'Module "' + decl.name + '": can\'t resolve dependence "' + name + '"' :
            'Required module "' + name + '" can\'t be resolved');
    },

    buildCircularDependenceError = function(decl, path) {
        var strPath = [],
            i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            strPath.push(pathDecl.name);
        }
        strPath.push(decl.name);

        return Error('Circular dependence has been detected: "' + strPath.join(' -> ') + '"');
    },

    buildDeclAreadyProvidedError = function(decl) {
        return Error('Declaration of module "' + decl.name + '" has already been provided');
    },

    buildMultipleDeclarationError = function(decl) {
        return Error('Multiple declarations of module "' + decl.name + '" have been detected');
    },

    isDependenceCircular = function(decl, path) {
        var i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            if(decl === pathDecl) {
                return true;
            }
        }
        return false;
    },

    nextTick = (function() {
        var fns = [],
            enqueueFn = function(fn) {
                return fns.push(fn) === 1;
            },
            callFns = function() {
                var fnsToCall = fns, i = 0, len = fns.length;
                fns = [];
                while(i < len) {
                    fnsToCall[i++]();
                }
            };

        if(typeof process === 'object' && process.nextTick) { // nodejs
            return function(fn) {
                enqueueFn(fn) && process.nextTick(callFns);
            };
        }

        if(global.setImmediate) { // ie10
            return function(fn) {
                enqueueFn(fn) && global.setImmediate(callFns);
            };
        }

        if(global.postMessage && !global.opera) { // modern browsers
            var isPostMessageAsync = true;
            if(global.attachEvent) {
                var checkAsync = function() {
                        isPostMessageAsync = false;
                    };
                global.attachEvent('onmessage', checkAsync);
                global.postMessage('__checkAsync', '*');
                global.detachEvent('onmessage', checkAsync);
            }

            if(isPostMessageAsync) {
                var msg = '__modules' + (+new Date()),
                    onMessage = function(e) {
                        if(e.data === msg) {
                            e.stopPropagation && e.stopPropagation();
                            callFns();
                        }
                    };

                global.addEventListener?
                    global.addEventListener('message', onMessage, true) :
                    global.attachEvent('onmessage', onMessage);

                return function(fn) {
                    enqueueFn(fn) && global.postMessage(msg, '*');
                };
            }
        }

        var doc = global.document;
        if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
            var head = doc.getElementsByTagName('head')[0],
                createScript = function() {
                    var script = doc.createElement('script');
                    script.onreadystatechange = function() {
                        script.parentNode.removeChild(script);
                        script = script.onreadystatechange = null;
                        callFns();
                    };
                    head.appendChild(script);
                };

            return function(fn) {
                enqueueFn(fn) && createScript();
            };
        }

        return function(fn) { // old browsers
            enqueueFn(fn) && setTimeout(callFns, 0);
        };
    })();

if(typeof exports === 'object') {
    module.exports = create();
}
else {
    global.modules = create();
}

})(this);
if(typeof module !== 'undefined') {modules = module.exports;}
/* begin: ../../libs/bem-core/common.blocks/i-bem/i-bem.vanilla.js */
/**
 * @module i-bem
 */

modules.define(
    'i-bem',
    [
        'i-bem__internal',
        'inherit',
        'identify',
        'next-tick',
        'objects',
        'functions',
        'events'
    ],
    function(
        provide,
        INTERNAL,
        inherit,
        identify,
        nextTick,
        objects,
        functions,
        events) {

var undef,

    MOD_DELIM = INTERNAL.MOD_DELIM,
    ELEM_DELIM = INTERNAL.ELEM_DELIM,

    /**
     * Storage for block init functions
     * @private
     * @type Array
     */
    initFns = [],

    /**
     * Storage for block declarations (hash by block name)
     * @private
     * @type Object
     */
    blocks = {};

/**
 * Builds the name of the handler method for setting a modifier
 * @param {String} prefix
 * @param {String} modName Modifier name
 * @param {String} modVal Modifier value
 * @param {String} [elemName] Element name
 * @returns {String}
 */
function buildModFnName(prefix, modName, modVal, elemName) {
    return '__' + prefix +
        (elemName? '__elem_' + elemName : '') +
       '__mod' +
       (modName? '_' + modName : '') +
       (modVal? '_' + modVal : '');
}

/**
 * Transforms a hash of modifier handlers to methods
 * @param {String} prefix
 * @param {Object} modFns
 * @param {Object} props
 * @param {String} [elemName]
 */
function modFnsToProps(prefix, modFns, props, elemName) {
    if(functions.isFunction(modFns)) {
        props[buildModFnName(prefix, '*', '*', elemName)] = modFns;
    } else {
        var modName, modVal, modFn;
        for(modName in modFns) {
            if(modFns.hasOwnProperty(modName)) {
                modFn = modFns[modName];
                if(functions.isFunction(modFn)) {
                    props[buildModFnName(prefix, modName, '*', elemName)] = modFn;
                } else {
                    for(modVal in modFn) {
                        if(modFn.hasOwnProperty(modVal)) {
                            props[buildModFnName(prefix, modName, modVal, elemName)] = modFn[modVal];
                        }
                    }
                }
            }
        }
    }
}

function buildCheckMod(modName, modVal) {
    return modVal?
        Array.isArray(modVal)?
            function(block) {
                var i = 0, len = modVal.length;
                while(i < len)
                    if(block.hasMod(modName, modVal[i++]))
                        return true;
                return false;
            } :
            function(block) {
                return block.hasMod(modName, modVal);
            } :
        function(block) {
            return block.hasMod(modName);
        };
}

function convertModHandlersToMethods(props) {
    if(props.beforeSetMod) {
        modFnsToProps('before', props.beforeSetMod, props);
        delete props.beforeSetMod;
    }

    if(props.onSetMod) {
        modFnsToProps('after', props.onSetMod, props);
        delete props.onSetMod;
    }

    var elemName;
    if(props.beforeElemSetMod) {
        for(elemName in props.beforeElemSetMod) {
            if(props.beforeElemSetMod.hasOwnProperty(elemName)) {
                modFnsToProps('before', props.beforeElemSetMod[elemName], props, elemName);
            }
        }
        delete props.beforeElemSetMod;
    }

    if(props.onElemSetMod) {
        for(elemName in props.onElemSetMod) {
            if(props.onElemSetMod.hasOwnProperty(elemName)) {
                modFnsToProps('after', props.onElemSetMod[elemName], props, elemName);
            }
        }
        delete props.onElemSetMod;
    }
}

/**
 * @class BEM
 * @description Base block for creating BEM blocks
 * @augments events:Emitter
 * @exports
 */
var BEM = inherit(events.Emitter, /** @lends BEM.prototype */ {
    /**
     * @constructor
     * @private
     * @param {Object} mods Block modifiers
     * @param {Object} params Block parameters
     * @param {Boolean} [initImmediately=true]
     */
    __constructor : function(mods, params, initImmediately) {
        /**
         * Cache of block modifiers
         * @member {Object}
         * @private
         */
        this._modCache = mods || {};

        /**
         * Current modifiers in the stack
         * @member {Object}
         * @private
         */
        this._processingMods = {};

        /**
         * Block parameters, taking into account the defaults
         * @member {Object}
         * @readonly
         */
        this.params = objects.extend(this.getDefaultParams(), params);

        initImmediately !== false?
            this._init() :
            initFns.push(this._init, this);
    },

    /**
     * Initializes the block
     * @private
     */
    _init : function() {
        return this.setMod('js', 'inited');
    },

    /**
     * Adds an event handler
     * @param {String|Object} e Event type
     * @param {Object} [data] Additional data that the handler gets as e.data
     * @param {Function} fn Handler
     * @param {Object} [ctx] Handler context
     * @returns {BEM} this
     */
    on : function(e, data, fn, ctx) {
        if(typeof e === 'object' && (functions.isFunction(data) || functions.isFunction(fn))) { // mod change event
            e = this.__self._buildModEventName(e);
        }

        return this.__base.apply(this, arguments);
    },

    /**
     * Removes event handler or handlers
     * @param {String|Object} [e] Event type
     * @param {Function} [fn] Handler
     * @param {Object} [ctx] Handler context
     * @returns {BEM} this
     */
    un : function(e, fn, ctx) {
        if(typeof e === 'object' && functions.isFunction(fn)) { // mod change event
            e = this.__self._buildModEventName(e);
        }

        return this.__base.apply(this, arguments);
    },

    /**
     * Executes the block's event handlers and live event handlers
     * @protected
     * @param {String} e Event name
     * @param {Object} [data] Additional information
     * @returns {BEM} this
     */
    emit : function(e, data) {
        var isModJsEvent = false;
        if(typeof e === 'object' && !(e instanceof events.Event)) {
            isModJsEvent = e.modName === 'js';
            e = this.__self._buildModEventName(e);
        }

        if(isModJsEvent || this.hasMod('js', 'inited')) {
            this.__base(e = this._buildEvent(e), data);
            this._ctxEmit(e, data);
        }

        return this;
    },

    _ctxEmit : function(e, data) {
        this.__self.emit(e, data);
    },

    /**
     * Builds event
     * @private
     * @param {String|events:Event} e
     * @returns {events:Event}
     */
    _buildEvent : function(e) {
        typeof e === 'string'?
            e = new events.Event(e, this) :
            e.target || (e.target = this);

        return e;
    },

    /**
     * Checks whether a block or nested element has a modifier
     * @param {Object} [elem] Nested element
     * @param {String} modName Modifier name
     * @param {String|Boolean} [modVal] Modifier value. If defined and not of type String or Boolean, it is casted to String
     * @returns {Boolean}
     */
    hasMod : function(elem, modName, modVal) {
        var len = arguments.length,
            invert = false;

        if(len === 1) {
            modVal = '';
            modName = elem;
            elem = undef;
            invert = true;
        } else if(len === 2) {
            if(typeof elem === 'string') {
                modVal = modName;
                modName = elem;
                elem = undef;
            } else {
                modVal = '';
                invert = true;
            }
        }

        var typeModVal = typeof modVal;
        typeModVal === 'string' ||
            typeModVal === 'boolean' ||
            typeModVal === 'undefined' || (modVal = modVal.toString());

        var res = this.getMod(elem, modName) === modVal;
        return invert? !res : res;
    },

    /**
     * Returns the value of the modifier of the block/nested element
     * @param {Object} [elem] Nested element
     * @param {String} modName Modifier name
     * @returns {String} Modifier value
     */
    getMod : function(elem, modName) {
        var type = typeof elem;
        if(type === 'string' || type === 'undefined') { // elem either omitted or undefined
            modName = elem || modName;
            var modCache = this._modCache;
            return modName in modCache?
                modCache[modName] || '' :
                modCache[modName] = this._extractModVal(modName);
        }

        return this._getElemMod(modName, elem);
    },

    /**
     * Returns the value of the modifier of the nested element
     * @private
     * @param {String} modName Modifier name
     * @param {Object} elem Nested element
     * @param {Object} [elemName] Nested element name
     * @returns {String} Modifier value
     */
    _getElemMod : function(modName, elem, elemName) {
        return this._extractModVal(modName, elem, elemName);
    },

    /**
     * Returns values of modifiers of the block/nested element
     * @param {Object} [elem] Nested element
     * @param {String} [...modNames] Modifier names
     * @returns {Object} Hash of modifier values
     */
    getMods : function(elem) {
        var hasElem = elem && typeof elem !== 'string',
            modNames = [].slice.call(arguments, hasElem? 1 : 0),
            res = this._extractMods(modNames, hasElem? elem : undef);

        if(!hasElem) { // caching
            modNames.length?
                modNames.forEach(function(name) {
                    this._modCache[name] = res[name];
                }, this) :
                this._modCache = res;
        }

        return res;
    },

    /**
     * Sets the modifier for a block/nested element
     * @param {Object} [elem] Nested element
     * @param {String} modName Modifier name
     * @param {String|Boolean} [modVal=true] Modifier value. If not of type String or Boolean, it is casted to String
     * @returns {BEM} this
     */
    setMod : function(elem, modName, modVal) {
        if(typeof modVal === 'undefined') {
            if(typeof elem === 'string') { // if no elem
                modVal = typeof modName === 'undefined'?
                    true :  // e.g. setMod('focused')
                    modName; // e.g. setMod('js', 'inited')
                modName = elem;
                elem = undef;
            } else { // if elem
                modVal = true; // e.g. setMod(elem, 'focused')
            }
        }

        if(!elem || elem[0]) {
            if(modVal === false) {
                modVal = '';
            } else if(typeof modVal !== 'boolean') {
                modVal = modVal.toString();
            }

            var modId = (elem && elem[0]? identify(elem[0]) : '') + '_' + modName;

            if(this._processingMods[modId])
                return this;

            var elemName,
                curModVal = elem?
                    this._getElemMod(modName, elem, elemName = this.__self._extractElemNameFrom(elem)) :
                    this.getMod(modName);

            if(curModVal === modVal)
                return this;

            this._processingMods[modId] = true;

            var needSetMod = true,
                modFnParams = [modName, modVal, curModVal];

            elem && modFnParams.unshift(elem);

            var modVars = [['*', '*'], [modName, '*'], [modName, modVal]],
                prefixes = ['before', 'after'],
                i = 0, prefix, j, modVar;

            while(prefix = prefixes[i++]) {
                j = 0;
                while(modVar = modVars[j++]) {
                    if(this._callModFn(prefix, elemName, modVar[0], modVar[1], modFnParams) === false) {
                        needSetMod = false;
                        break;
                    }
                }

                if(!needSetMod) break;

                if(prefix === 'before') {
                    elem || (this._modCache[modName] = modVal); // cache only block mods
                    this._onSetMod(modName, modVal, curModVal, elem, elemName);
                }
            }

            this._processingMods[modId] = null;
            needSetMod && this._emitModChangeEvents(modName, modVal, curModVal, elem, elemName);
        }

        return this;
    },

    /**
     * Function after successfully changing the modifier of the block/nested element
     * @protected
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @param {String} oldModVal Old modifier value
     * @param {Object} [elem] Nested element
     * @param {String} [elemName] Element name
     */
    _onSetMod : function(modName, modVal, oldModVal, elem, elemName) {},

    _emitModChangeEvents : function(modName, modVal, oldModVal, elem, elemName) {
        var eventData = { modName : modName, modVal : modVal, oldModVal : oldModVal };
        elem && (eventData.elem = elem);
        this
            .emit({ modName : modName, modVal : '*', elem : elemName }, eventData)
            .emit({ modName : modName, modVal : modVal, elem : elemName }, eventData);
    },

    /**
     * Sets a modifier for a block/nested element, depending on conditions.
     * If the condition parameter is passed: when true, modVal1 is set; when false, modVal2 is set.
     * If the condition parameter is not passed: modVal1 is set if modVal2 was set, or vice versa.
     * @param {Object} [elem] Nested element
     * @param {String} modName Modifier name
     * @param {String} modVal1 First modifier value
     * @param {String} [modVal2] Second modifier value
     * @param {Boolean} [condition] Condition
     * @returns {BEM} this
     */
    toggleMod : function(elem, modName, modVal1, modVal2, condition) {
        if(typeof elem === 'string') { // if this is a block
            condition = modVal2;
            modVal2 = modVal1;
            modVal1 = modName;
            modName = elem;
            elem = undef;
        }

        if(typeof modVal1 === 'undefined') { // boolean mod
            modVal1 = true;
        }

        if(typeof modVal2 === 'undefined') {
            modVal2 = '';
        } else if(typeof modVal2 === 'boolean') {
            condition = modVal2;
            modVal2 = '';
        }

        var modVal = this.getMod(elem, modName);
        (modVal === modVal1 || modVal === modVal2) &&
            this.setMod(
                elem,
                modName,
                typeof condition === 'boolean'?
                    (condition? modVal1 : modVal2) :
                    this.hasMod(elem, modName, modVal1)? modVal2 : modVal1);

        return this;
    },

    /**
     * Removes a modifier from a block/nested element
     * @protected
     * @param {Object} [elem] Nested element
     * @param {String} modName Modifier name
     * @returns {BEM} this
     */
    delMod : function(elem, modName) {
        if(!modName) {
            modName = elem;
            elem = undef;
        }

        return this.setMod(elem, modName, '');
    },

    /**
     * Executes handlers for setting modifiers
     * @private
     * @param {String} prefix
     * @param {String} elemName Element name
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @param {Array} modFnParams Handler parameters
     */
    _callModFn : function(prefix, elemName, modName, modVal, modFnParams) {
        var modFnName = buildModFnName(prefix, modName, modVal, elemName);
        return this[modFnName]?
           this[modFnName].apply(this, modFnParams) :
           undef;
    },

    /**
     * Retrieves the value of the modifier
     * @private
     * @param {String} modName Modifier name
     * @param {Object} [elem] Element
     * @returns {String} Modifier value
     */
    _extractModVal : function(modName, elem) {
        return '';
    },

    /**
     * Retrieves name/value for a list of modifiers
     * @private
     * @param {Array} modNames Names of modifiers
     * @param {Object} [elem] Element
     * @returns {Object} Hash of modifier values by name
     */
    _extractMods : function(modNames, elem) {
        return {};
    },

    /**
     * Returns a block's default parameters
     * @protected
     * @returns {Object}
     */
    getDefaultParams : function() {
        return {};
    },

    /**
     * Deletes a block
     * @private
     */
    _destruct : function() {
        this.delMod('js');
    },

    /**
     * Executes given callback on next turn eventloop in block's context
     * @protected
     * @param {Function} fn callback
     * @returns {BEM} this
     */
    nextTick : function(fn) {
        var _this = this;
        nextTick(function() {
            _this.hasMod('js', 'inited') && fn.call(_this);
        });
        return this;
    }
}, /** @lends BEM */{

    _name : 'i-bem',

    /**
     * Storage for block declarations (hash by block name)
     * @type Object
     */
    blocks : blocks,

    /**
     * Declares blocks and creates a block class
     * @param {String|Object} decl Block name (simple syntax) or description
     * @param {String} decl.block|decl.name Block name
     * @param {String} [decl.baseBlock] Name of the parent block
     * @param {Array} [decl.baseMix] Mixed block names
     * @param {String} [decl.modName] Modifier name
     * @param {String|Array} [decl.modVal] Modifier value
     * @param {Object} [props] Methods
     * @param {Object} [staticProps] Static methods
     * @returns {Function}
     */
    decl : function(decl, props, staticProps) {
        // string as block
        typeof decl === 'string' && (decl = { block : decl });
        // inherit from itself
        if(arguments.length <= 2 &&
                typeof decl === 'object' &&
                (!decl || (typeof decl.block !== 'string' && typeof decl.modName !== 'string'))) {
            staticProps = props;
            props = decl;
            decl = {};
        }
        typeof decl.block === 'undefined' && (decl.block = this.getName());

        var baseBlock;
        if(typeof decl.baseBlock === 'undefined') {
            baseBlock = blocks[decl.block] || this;
        } else if(typeof decl.baseBlock === 'string') {
            baseBlock = blocks[decl.baseBlock];
            if(!baseBlock)
                throw('baseBlock "' + decl.baseBlock + '" for "' + decl.block + '" is undefined');
        } else {
            baseBlock = decl.baseBlock;
        }

        convertModHandlersToMethods(props || (props = {}));

        if(decl.modName) {
            var checkMod = buildCheckMod(decl.modName, decl.modVal);
            objects.each(props, function(prop, name) {
                functions.isFunction(prop) &&
                    (props[name] = function() {
                        var method;
                        if(checkMod(this)) {
                            method = prop;
                        } else {
                            var baseMethod = baseBlock.prototype[name];
                            baseMethod && baseMethod !== prop &&
                                (method = this.__base);
                        }
                        return method?
                            method.apply(this, arguments) :
                            undef;
                    });
            });
        }

        if(staticProps && typeof staticProps.live === 'boolean') {
            var live = staticProps.live;
            staticProps.live = function() {
                return live;
            };
        }

        var block, baseBlocks = baseBlock;
        if(decl.baseMix) {
            baseBlocks = [baseBlocks];
            decl.baseMix.forEach(function(mixedBlock) {
                if(!blocks[mixedBlock]) {
                    throw('mix block "' + mixedBlock + '" for "' + decl.block + '" is undefined');
                }
                baseBlocks.push(blocks[mixedBlock]);
            });
        }

        if(decl.block === baseBlock.getName()) {
            // makes a new "live" if the old one was already executed
            (block = inherit.self(baseBlocks, props, staticProps))._processLive(true);
        } else {
            (block = blocks[decl.block] = inherit(baseBlocks, props, staticProps))._name = decl.block;
            delete block._liveInitable;
        }

        return block;
    },

    declMix : function(block, props, staticProps) {
        convertModHandlersToMethods(props || (props = {}));
        return blocks[block] = inherit(props, staticProps);
    },

    /**
     * Processes a block's live properties
     * @private
     * @param {Boolean} [heedLive=false] Whether to take into account that the block already processed its live properties
     * @returns {Boolean} Whether the block is a live block
     */
    _processLive : function(heedLive) {
        return false;
    },

    /**
     * Factory method for creating an instance of the block named
     * @param {String|Object} block Block name or description
     * @param {Object} [params] Block parameters
     * @returns {BEM}
     */
    create : function(block, params) {
        typeof block === 'string' && (block = { block : block });

        return new blocks[block.block](block.mods, params);
    },

    /**
     * Returns the name of the current block
     * @returns {String}
     */
    getName : function() {
        return this._name;
    },

    /**
     * Adds an event handler
     * @param {String|Object} e Event type
     * @param {Object} [data] Additional data that the handler gets as e.data
     * @param {Function} fn Handler
     * @param {Object} [ctx] Handler context
     * @returns {Function} this
     */
    on : function(e, data, fn, ctx) {
        if(typeof e === 'object' && (functions.isFunction(data) || functions.isFunction(fn))) { // mod change event
            e = this._buildModEventName(e);
        }

        return this.__base.apply(this, arguments);
    },

    /**
     * Removes event handler or handlers
     * @param {String|Object} [e] Event type
     * @param {Function} [fn] Handler
     * @param {Object} [ctx] Handler context
     * @returns {Function} this
     */
    un : function(e, fn, ctx) {
        if(typeof e === 'object' && functions.isFunction(fn)) { // mod change event
            e = this._buildModEventName(e);
        }

        return this.__base.apply(this, arguments);
    },

    _buildModEventName : function(modEvent) {
        var res = MOD_DELIM + modEvent.modName + MOD_DELIM + (modEvent.modVal === false? '' : modEvent.modVal);
        modEvent.elem && (res = ELEM_DELIM + modEvent.elem + res);
        return res;
    },

    /**
     * Retrieves the name of an element nested in a block
     * @private
     * @param {Object} elem Nested element
     * @returns {String|undefined}
     */
    _extractElemNameFrom : function(elem) {},

    /**
     * Executes the block init functions
     * @private
     */
    _runInitFns : function() {
        if(initFns.length) {
            var fns = initFns,
                fn, i = 0;

            initFns = [];
            while(fn = fns[i]) {
                fn.call(fns[i + 1]);
                i += 2;
            }
        }
    }
});

provide(BEM);

});

/* end: ../../libs/bem-core/common.blocks/i-bem/i-bem.vanilla.js */
/* begin: ../../libs/bem-core/common.blocks/i-bem/__internal/i-bem__internal.vanilla.js */
/**
 * @module i-bem__internal
 */

modules.define('i-bem__internal', function(provide) {

var undef,
    /**
     * Separator for modifiers and their values
     * @const
     * @type String
     */
    MOD_DELIM = '_',

    /**
     * Separator between names of a block and a nested element
     * @const
     * @type String
     */
    ELEM_DELIM = '__',

    /**
     * Pattern for acceptable element and modifier names
     * @const
     * @type String
     */
    NAME_PATTERN = '[a-zA-Z0-9-]+';

function isSimple(obj) {
    var typeOf = typeof obj;
    return typeOf === 'string' || typeOf === 'number' || typeOf === 'boolean';
}

function buildModPostfix(modName, modVal) {
    var res = '';
    /* jshint eqnull: true */
    if(modVal != null && modVal !== false) {
        res += MOD_DELIM + modName;
        modVal !== true && (res += MOD_DELIM + modVal);
    }
    return res;
}

function buildBlockClass(name, modName, modVal) {
    return name + buildModPostfix(modName, modVal);
}

function buildElemClass(block, name, modName, modVal) {
    return buildBlockClass(block, undef, undef) +
        ELEM_DELIM + name +
        buildModPostfix(modName, modVal);
}

provide(/** @exports */{
    NAME_PATTERN : NAME_PATTERN,

    MOD_DELIM : MOD_DELIM,
    ELEM_DELIM : ELEM_DELIM,

    buildModPostfix : buildModPostfix,

    /**
     * Builds the class of a block or element with a modifier
     * @param {String} block Block name
     * @param {String} [elem] Element name
     * @param {String} [modName] Modifier name
     * @param {String|Number} [modVal] Modifier value
     * @returns {String} Class
     */
    buildClass : function(block, elem, modName, modVal) {
        if(isSimple(modName)) {
            if(!isSimple(modVal)) {
                modVal = modName;
                modName = elem;
                elem = undef;
            }
        } else if(typeof modName !== 'undefined') {
            modName = undef;
        } else if(elem && typeof elem !== 'string') {
            elem = undef;
        }

        if(!(elem || modName)) { // optimization for simple case
            return block;
        }

        return elem?
            buildElemClass(block, elem, modName, modVal) :
            buildBlockClass(block, modName, modVal);
    },

    /**
     * Builds full classes for a buffer or element with modifiers
     * @param {String} block Block name
     * @param {String} [elem] Element name
     * @param {Object} [mods] Modifiers
     * @returns {String} Class
     */
    buildClasses : function(block, elem, mods) {
        if(elem && typeof elem !== 'string') {
            mods = elem;
            elem = undef;
        }

        var res = elem?
            buildElemClass(block, elem, undef, undef) :
            buildBlockClass(block, undef, undef);

        if(mods) {
            for(var modName in mods) {
                if(mods.hasOwnProperty(modName) && mods[modName]) {
                    res += ' ' + (elem?
                        buildElemClass(block, elem, modName, mods[modName]) :
                        buildBlockClass(block, modName, mods[modName]));
                }
            }
        }

        return res;
    }
});

});

/* end: ../../libs/bem-core/common.blocks/i-bem/__internal/i-bem__internal.vanilla.js */
/* begin: ../../libs/bem-core/common.blocks/inherit/inherit.vanilla.js */
/**
 * @module inherit
 * @version 2.2.1
 * @author Filatov Dmitry <dfilatov@yandex-team.ru>
 * @description This module provides some syntax sugar for "class" declarations, constructors, mixins, "super" calls and static members.
 */

(function(global) {

var hasIntrospection = (function(){'_';}).toString().indexOf('_') > -1,
    emptyBase = function() {},
    hasOwnProperty = Object.prototype.hasOwnProperty,
    objCreate = Object.create || function(ptp) {
        var inheritance = function() {};
        inheritance.prototype = ptp;
        return new inheritance();
    },
    objKeys = Object.keys || function(obj) {
        var res = [];
        for(var i in obj) {
            hasOwnProperty.call(obj, i) && res.push(i);
        }
        return res;
    },
    extend = function(o1, o2) {
        for(var i in o2) {
            hasOwnProperty.call(o2, i) && (o1[i] = o2[i]);
        }

        return o1;
    },
    toStr = Object.prototype.toString,
    isArray = Array.isArray || function(obj) {
        return toStr.call(obj) === '[object Array]';
    },
    isFunction = function(obj) {
        return toStr.call(obj) === '[object Function]';
    },
    noOp = function() {},
    needCheckProps = true,
    testPropObj = { toString : '' };

for(var i in testPropObj) { // fucking ie hasn't toString, valueOf in for
    testPropObj.hasOwnProperty(i) && (needCheckProps = false);
}

var specProps = needCheckProps? ['toString', 'valueOf'] : null;

function getPropList(obj) {
    var res = objKeys(obj);
    if(needCheckProps) {
        var specProp, i = 0;
        while(specProp = specProps[i++]) {
            obj.hasOwnProperty(specProp) && res.push(specProp);
        }
    }

    return res;
}

function override(base, res, add) {
    var addList = getPropList(add),
        j = 0, len = addList.length,
        name, prop;
    while(j < len) {
        if((name = addList[j++]) === '__self') {
            continue;
        }
        prop = add[name];
        if(isFunction(prop) &&
                (!hasIntrospection || prop.toString().indexOf('.__base') > -1)) {
            res[name] = (function(name, prop) {
                var baseMethod = base[name]?
                        base[name] :
                        name === '__constructor'? // case of inheritance from plane function
                            res.__self.__parent :
                            noOp;
                return function() {
                    var baseSaved = this.__base;
                    this.__base = baseMethod;
                    var res = prop.apply(this, arguments);
                    this.__base = baseSaved;
                    return res;
                };
            })(name, prop);
        } else {
            res[name] = prop;
        }
    }
}

function applyMixins(mixins, res) {
    var i = 1, mixin;
    while(mixin = mixins[i++]) {
        res?
            isFunction(mixin)?
                inherit.self(res, mixin.prototype, mixin) :
                inherit.self(res, mixin) :
            res = isFunction(mixin)?
                inherit(mixins[0], mixin.prototype, mixin) :
                inherit(mixins[0], mixin);
    }
    return res || mixins[0];
}

/**
* Creates class
* @exports
* @param {Function|Array} [baseClass|baseClassAndMixins] class (or class and mixins) to inherit from
* @param {Object} prototypeFields
* @param {Object} [staticFields]
* @returns {Function} class
*/
function inherit() {
    var args = arguments,
        withMixins = isArray(args[0]),
        hasBase = withMixins || isFunction(args[0]),
        base = hasBase? withMixins? applyMixins(args[0]) : args[0] : emptyBase,
        props = args[hasBase? 1 : 0] || {},
        staticProps = args[hasBase? 2 : 1],
        res = props.__constructor || (hasBase && base.prototype.__constructor)?
            function() {
                return this.__constructor.apply(this, arguments);
            } :
            hasBase?
                function() {
                    return base.apply(this, arguments);
                } :
                function() {};

    if(!hasBase) {
        res.prototype = props;
        res.prototype.__self = res.prototype.constructor = res;
        return extend(res, staticProps);
    }

    extend(res, base);

    res.__parent = base;

    var basePtp = base.prototype,
        resPtp = res.prototype = objCreate(basePtp);

    resPtp.__self = resPtp.constructor = res;

    props && override(basePtp, resPtp, props);
    staticProps && override(base, res, staticProps);

    return res;
}

inherit.self = function() {
    var args = arguments,
        withMixins = isArray(args[0]),
        base = withMixins? applyMixins(args[0], args[0][0]) : args[0],
        props = args[1],
        staticProps = args[2],
        basePtp = base.prototype;

    props && override(basePtp, basePtp, props);
    staticProps && override(base, base, staticProps);

    return base;
};

var defineAsGlobal = true;
if(typeof exports === 'object') {
    module.exports = inherit;
    defineAsGlobal = false;
}

if(typeof modules === 'object') {
    modules.define('inherit', function(provide) {
        provide(inherit);
    });
    defineAsGlobal = false;
}

if(typeof define === 'function') {
    define(function(require, exports, module) {
        module.exports = inherit;
    });
    defineAsGlobal = false;
}

defineAsGlobal && (global.inherit = inherit);

})(this);

/* end: ../../libs/bem-core/common.blocks/inherit/inherit.vanilla.js */
/* begin: ../../libs/bem-core/common.blocks/identify/identify.vanilla.js */
/**
 * @module identify
 */

modules.define('identify', function(provide) {

var counter = 0,
    expando = '__' + (+new Date),
    get = function() {
        return 'uniq' + (++counter);
    };

provide(
    /**
     * Makes unique ID
     * @exports
     * @param {Object} obj Object that needs to be identified
     * @param {Boolean} [onlyGet=false] Return a unique value only if it had already been assigned before
     * @returns {String} ID
     */
    function(obj, onlyGet) {
        if(!obj) return get();

        var key = 'uniqueID' in obj? 'uniqueID' : expando; // Use when possible native uniqueID for elements in IE

        return onlyGet || key in obj?
            obj[key] :
            obj[key] = get();
    }
);

});

/* end: ../../libs/bem-core/common.blocks/identify/identify.vanilla.js */
/* begin: ../../libs/bem-core/common.blocks/next-tick/next-tick.vanilla.js */
/**
 * @module next-tick
 */

modules.define('next-tick', function(provide) {

/**
 * Executes given function on next tick.
 * @exports
 * @type Function
 * @param {Function} fn
 */

var global = this.global,
    fns = [],
    enqueueFn = function(fn) {
        return fns.push(fn) === 1;
    },
    callFns = function() {
        var fnsToCall = fns, i = 0, len = fns.length;
        fns = [];
        while(i < len) {
            fnsToCall[i++]();
        }
    };

    /* global process */
    if(typeof process === 'object' && process.nextTick) { // nodejs
        return provide(function(fn) {
            enqueueFn(fn) && process.nextTick(callFns);
        });
    }

    if(global.setImmediate) { // ie10
        return provide(function(fn) {
            enqueueFn(fn) && global.setImmediate(callFns);
        });
    }

    if(global.postMessage) { // modern browsers
        var isPostMessageAsync = true;
        if(global.attachEvent) {
            var checkAsync = function() {
                    isPostMessageAsync = false;
                };
            global.attachEvent('onmessage', checkAsync);
            global.postMessage('__checkAsync', '*');
            global.detachEvent('onmessage', checkAsync);
        }

        if(isPostMessageAsync) {
            var msg = '__nextTick' + (+new Date),
                onMessage = function(e) {
                    if(e.data === msg) {
                        e.stopPropagation && e.stopPropagation();
                        callFns();
                    }
                };

            global.addEventListener?
                global.addEventListener('message', onMessage, true) :
                global.attachEvent('onmessage', onMessage);

            return provide(function(fn) {
                enqueueFn(fn) && global.postMessage(msg, '*');
            });
        }
    }

    var doc = global.document;
    if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
        var head = doc.getElementsByTagName('head')[0],
            createScript = function() {
                var script = doc.createElement('script');
                script.onreadystatechange = function() {
                    script.parentNode.removeChild(script);
                    script = script.onreadystatechange = null;
                    callFns();
                };
                head.appendChild(script);
            };

        return provide(function(fn) {
            enqueueFn(fn) && createScript();
        });
    }

    provide(function(fn) { // old browsers
        enqueueFn(fn) && global.setTimeout(callFns, 0);
    });
});

/* end: ../../libs/bem-core/common.blocks/next-tick/next-tick.vanilla.js */
/* begin: ../../libs/bem-core/common.blocks/objects/objects.vanilla.js */
/**
 * @module objects
 * @description A set of helpers to work with JavaScript objects
 */

modules.define('objects', function(provide) {

var hasOwnProp = Object.prototype.hasOwnProperty;

provide(/** @exports */{
    /**
     * Extends a given target by
     * @param {Object} target object to extend
     * @param {Object} source
     * @returns {Object}
     */
    extend : function(target, source) {
        (typeof target !== 'object' || target === null) && (target = {});

        for(var i = 1, len = arguments.length; i < len; i++) {
            var obj = arguments[i];
            if(obj) {
                for(var key in obj) {
                    hasOwnProp.call(obj, key) && (target[key] = obj[key]);
                }
            }
        }

        return target;
    },

    /**
     * Check whether a given object is empty (contains no enumerable properties)
     * @param {Object} obj
     * @returns {Boolean}
     */
    isEmpty : function(obj) {
        for(var key in obj) {
            if(hasOwnProp.call(obj, key)) {
                return false;
            }
        }

        return true;
    },

    /**
     * Generic iterator function over object
     * @param {Object} obj object to iterate
     * @param {Function} fn callback
     * @param {Object} [ctx] callbacks's context
     */
    each : function(obj, fn, ctx) {
        for(var key in obj) {
            if(hasOwnProp.call(obj, key)) {
                ctx? fn.call(ctx, obj[key], key) : fn(obj[key], key);
            }
        }
    }
});

});

/* end: ../../libs/bem-core/common.blocks/objects/objects.vanilla.js */
/* begin: ../../libs/bem-core/common.blocks/functions/functions.vanilla.js */
/**
 * @module functions
 * @description A set of helpers to work with JavaScript functions
 */

modules.define('functions', function(provide) {

var toStr = Object.prototype.toString;

provide(/** @exports */{
    /**
     * Checks whether a given object is function
     * @param {*} obj
     * @returns {Boolean}
     */
    isFunction : function(obj) {
        return toStr.call(obj) === '[object Function]';
    },

    /**
     * Empty function
     */
    noop : function() {}
});

});

/* end: ../../libs/bem-core/common.blocks/functions/functions.vanilla.js */
/* begin: ../../libs/bem-core/common.blocks/events/events.vanilla.js */
/**
 * @module events
 */

modules.define(
    'events',
    ['identify', 'inherit', 'functions'],
    function(provide, identify, inherit, functions) {

var undef,
    storageExpando = '__' + (+new Date) + 'storage',
    getFnId = function(fn, ctx) {
        return identify(fn) + (ctx? identify(ctx) : '');
    },

    /**
     * @class Event
     * @exports events:Event
     */
    Event = inherit(/** @lends Event.prototype */{
        /**
         * @constructor
         * @param {String} type
         * @param {Object} target
         */
        __constructor : function(type, target) {
            /**
             * Type
             * @member {String} Event
             */
            this.type = type;

            /**
             * Target
             * @member {String} Event
             */
            this.target = target;

            /**
             * Result
             * @member {*}
             */
            this.result = undef;

            /**
             * Data
             * @member {*}
             */
            this.data = undef;

            this._isDefaultPrevented = false;
            this._isPropagationStopped = false;
        },

        /**
         * Prevents default action
         */
        preventDefault : function() {
            this._isDefaultPrevented = true;
        },

        /**
         * Returns whether is default action prevented
         * @returns {Boolean}
         */
        isDefaultPrevented : function() {
            return this._isDefaultPrevented;
        },

        /**
         * Stops propagation
         */
        stopPropagation : function() {
            this._isPropagationStopped = true;
        },

        /**
         * Returns whether is propagation stopped
         * @returns {Boolean}
         */
        isPropagationStopped : function() {
            return this._isPropagationStopped;
        }
    }),

    /**
     * @lends Emitter
     * @lends Emitter.prototype
     */
    EmitterProps = {
        /**
         * Adds an event handler
         * @param {String} e Event type
         * @param {Object} [data] Additional data that the handler gets as e.data
         * @param {Function} fn Handler
         * @param {Object} [ctx] Handler context
         * @returns {Emitter} this
         */
        on : function(e, data, fn, ctx, _special) {
            if(typeof e === 'string') {
                if(functions.isFunction(data)) {
                    ctx = fn;
                    fn = data;
                    data = undef;
                }

                var id = getFnId(fn, ctx),
                    storage = this[storageExpando] || (this[storageExpando] = {}),
                    eventTypes = e.split(' '), eventType,
                    i = 0, list, item,
                    eventStorage;

                while(eventType = eventTypes[i++]) {
                    eventStorage = storage[eventType] || (storage[eventType] = { ids : {}, list : {} });
                    if(!(id in eventStorage.ids)) {
                        list = eventStorage.list;
                        item = { fn : fn, data : data, ctx : ctx, special : _special };
                        if(list.last) {
                            list.last.next = item;
                            item.prev = list.last;
                        } else {
                            list.first = item;
                        }
                        eventStorage.ids[id] = list.last = item;
                    }
                }
            } else {
                for(var key in e) {
                    e.hasOwnProperty(key) && this.on(key, e[key], data, _special);
                }
            }

            return this;
        },

        /**
         * Adds a one time handler for the event.
         * Handler is executed only the next time the event is fired, after which it is removed.
         * @param {String} e Event type
         * @param {Object} [data] Additional data that the handler gets as e.data
         * @param {Function} fn Handler
         * @param {Object} [ctx] Handler context
         * @returns {Emitter} this
         */
        once : function(e, data, fn, ctx) {
            return this.on(e, data, fn, ctx, { once : true });
        },

        /**
         * Removes event handler or handlers
         * @param {String} [e] Event type
         * @param {Function} [fn] Handler
         * @param {Object} [ctx] Handler context
         * @returns {Emitter} this
         */
        un : function(e, fn, ctx) {
            if(typeof e === 'string' || typeof e === 'undefined') {
                var storage = this[storageExpando];
                if(storage) {
                    if(e) { // if event type was passed
                        var eventTypes = e.split(' '),
                            i = 0, eventStorage;
                        while(e = eventTypes[i++]) {
                            if(eventStorage = storage[e]) {
                                if(fn) {  // if specific handler was passed
                                    var id = getFnId(fn, ctx),
                                        ids = eventStorage.ids;
                                    if(id in ids) {
                                        var list = eventStorage.list,
                                            item = ids[id],
                                            prev = item.prev,
                                            next = item.next;

                                        if(prev) {
                                            prev.next = next;
                                        } else if(item === list.first) {
                                            list.first = next;
                                        }

                                        if(next) {
                                            next.prev = prev;
                                        } else if(item === list.last) {
                                            list.last = prev;
                                        }

                                        delete ids[id];
                                    }
                                } else {
                                    delete this[storageExpando][e];
                                }
                            }
                        }
                    } else {
                        delete this[storageExpando];
                    }
                }
            } else {
                for(var key in e) {
                    e.hasOwnProperty(key) && this.un(key, e[key], fn);
                }
            }

            return this;
        },

        /**
         * Fires event handlers
         * @param {String|events:Event} e Event
         * @param {Object} [data] Additional data
         * @returns {Emitter} this
         */
        emit : function(e, data) {
            var storage = this[storageExpando],
                eventInstantiated = false;

            if(storage) {
                var eventTypes = [typeof e === 'string'? e : e.type, '*'],
                    i = 0, eventType, eventStorage;
                while(eventType = eventTypes[i++]) {
                    if(eventStorage = storage[eventType]) {
                        var item = eventStorage.list.first,
                            lastItem = eventStorage.list.last,
                            res;
                        while(item) {
                            if(!eventInstantiated) { // instantiate Event only on demand
                                eventInstantiated = true;
                                typeof e === 'string' && (e = new Event(e));
                                e.target || (e.target = this);
                            }

                            e.data = item.data;
                            res = item.fn.apply(item.ctx || this, arguments);
                            if(typeof res !== 'undefined') {
                                e.result = res;
                                if(res === false) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }
                            }

                            item.special && item.special.once &&
                                this.un(e.type, item.fn, item.ctx);

                            if(item === lastItem) {
                                break;
                            }

                            item = item.next;
                        }
                    }
                }
            }

            return this;
        }
    },
    /**
     * @class Emitter
     * @exports events:Emitter
     */
    Emitter = inherit(
        EmitterProps,
        EmitterProps);

provide({
    Emitter : Emitter,
    Event : Event
});

});

/* end: ../../libs/bem-core/common.blocks/events/events.vanilla.js */
/* begin: ../../libs/bem-core/common.blocks/tick/tick.vanilla.js */
/**
 * @module tick
 * @description Helpers for polling anything
 */

modules.define('tick', ['inherit', 'events'], function(provide, inherit, events) {

var TICK_INTERVAL = 50,
    global = this.global,

    /**
     * @class Tick
     * @augments events:Emitter
     */
    Tick = inherit(events.Emitter, /** @lends Tick.prototype */{
        /**
         * @constructor
         */
        __constructor : function() {
            this._timer = null;
            this._isStarted = false;
        },

        /**
         * Starts polling
         */
        start : function() {
            if(!this._isStarted) {
                this._isStarted = true;
                this._scheduleTick();
            }
        },

        /**
         * Stops polling
         */
        stop : function() {
            if(this._isStarted) {
                this._isStarted = false;
                global.clearTimeout(this._timer);
            }
        },

        _scheduleTick : function() {
            var _this = this;
            this._timer = global.setTimeout(
                function() {
                    _this._onTick();
                },
                TICK_INTERVAL);
        },

        _onTick : function() {
            this.emit('tick');

            this._isStarted && this._scheduleTick();
        }
    });

provide(
    /**
     * @exports
     * @type Tick
     */
    new Tick());

});

/* end: ../../libs/bem-core/common.blocks/tick/tick.vanilla.js */
/* begin: ../../libs/bem-core/common.blocks/functions/__throttle/functions__throttle.vanilla.js */
/**
 * @module functions__throttle
 */

modules.define('functions__throttle', function(provide) {

var global = this.global;

provide(
    /**
     * Throttle given function
     * @exports
     * @param {Function} fn function to throttle
     * @param {Number} timeout throttle interval
     * @param {Boolean} [invokeAsap=true] invoke before first interval
     * @param {Object} [ctx] context of function invocation
     * @returns {Function} throttled function
     */
    function(fn, timeout, invokeAsap, ctx) {
        var typeofInvokeAsap = typeof invokeAsap;
        if(typeofInvokeAsap === 'undefined') {
            invokeAsap = true;
        } else if(arguments.length === 3 && typeofInvokeAsap !== 'boolean') {
            ctx = invokeAsap;
            invokeAsap = true;
        }

        var timer, args, needInvoke,
            wrapper = function() {
                if(needInvoke) {
                    fn.apply(ctx, args);
                    needInvoke = false;
                    timer = global.setTimeout(wrapper, timeout);
                } else {
                    timer = null;
                }
            };

        return function() {
            args = arguments;
            ctx || (ctx = this);
            needInvoke = true;

            if(!timer) {
                invokeAsap?
                    wrapper() :
                    timer = global.setTimeout(wrapper, timeout);
            }
        };
    });

});

/* end: ../../libs/bem-core/common.blocks/functions/__throttle/functions__throttle.vanilla.js */
/* begin: ../../libs/bem-core/common.blocks/strings/__escape/strings__escape.vanilla.js */
/**
 * @module strings__escape
 * @description A set of string escaping functions
 */

modules.define('strings__escape', function(provide) {

var symbols = {
        '"' : '&quot;',
        '\'' : '&apos;',
        '&' : '&amp;',
        '<' : '&lt;',
        '>' : '&gt;'
    },
    mapSymbol = function(s) {
        return symbols[s] || s;
    },
    buildEscape = function(regexp) {
        regexp = new RegExp(regexp, 'g');
        return function(str) {
            return ('' + str).replace(regexp, mapSymbol);
        };
    };

provide(/** @exports */{
    /**
     * Escape string to use in XML
     * @type Function
     * @param {String} str
     * @returns {String}
     */
    xml : buildEscape('[&<>]'),

    /**
     * Escape string to use in HTML
     * @type Function
     * @param {String} str
     * @returns {String}
     */
    html : buildEscape('[&<>]'),

    /**
     * Escape string to use in attributes
     * @type Function
     * @param {String} str
     * @returns {String}
     */
    attr : buildEscape('["\'&<>]')
});

});

/* end: ../../libs/bem-core/common.blocks/strings/__escape/strings__escape.vanilla.js */
/* begin: ../../libs/bem-core/common.blocks/i-bem/__dom/i-bem__dom.js */
/**
 * @module i-bem__dom
 */

modules.define(
    'i-bem__dom',
    ['i-bem', 'i-bem__internal', 'identify', 'objects', 'functions', 'jquery', 'dom'],
    function(provide, BEM, INTERNAL, identify, objects, functions, $, dom) {

var undef,
    win = $(window),
    doc = $(document),

    /**
     * Storage for DOM elements by unique key
     * @type Object
     */
    uniqIdToDomElems = {},

    /**
     * Storage for blocks by unique key
     * @type Object
     */
    uniqIdToBlock = {},

    /**
     * Storage for DOM element's parent nodes
     * @type Object
     */
    domNodesToParents = {},

    /**
     * Storage for block parameters
     * @type Object
     */
    domElemToParams = {},

    /**
     * Storage for liveCtx event handlers
     * @type Object
     */
    liveEventCtxStorage = {},

    /**
     * Storage for liveClass event handlers
     * @type Object
     */
    liveClassEventStorage = {},

    blocks = BEM.blocks,

    BEM_CLASS = 'i-bem',
    BEM_SELECTOR = '.' + BEM_CLASS,
    BEM_PARAMS_ATTR = 'data-bem',

    NAME_PATTERN = INTERNAL.NAME_PATTERN,

    MOD_DELIM = INTERNAL.MOD_DELIM,
    ELEM_DELIM = INTERNAL.ELEM_DELIM,

    EXTRACT_MODS_RE = RegExp(
        '[^' + MOD_DELIM + ']' + MOD_DELIM + '(' + NAME_PATTERN + ')' +
        '(?:' + MOD_DELIM + '(' + NAME_PATTERN + '))?$'),

    buildModPostfix = INTERNAL.buildModPostfix,
    buildClass = INTERNAL.buildClass,

    reverse = Array.prototype.reverse;

/**
 * Initializes blocks on a DOM element
 * @param {jQuery} domElem DOM element
 * @param {String} uniqInitId ID of the "initialization wave"
 */
function initBlocks(domElem, uniqInitId) {
    var domNode = domElem[0],
        params = getParams(domNode),
        blockName;

    for(blockName in params)
        initBlock(
            blockName,
            domElem,
            processParams(params[blockName], blockName, uniqInitId));
}

/**
 * Initializes a specific block on a DOM element, or returns the existing block if it was already created
 * @param {String} blockName Block name
 * @param {jQuery} domElem DOM element
 * @param {Object} [params] Initialization parameters
 * @param {Boolean} [forceLive=false] Force live initialization
 * @param {Function} [callback] Handler to call after complete initialization
 */
function initBlock(blockName, domElem, params, forceLive, callback) {
    var domNode = domElem[0];

    params || (params = processParams(getBlockParams(domNode, blockName), blockName));

    var uniqId = params.uniqId,
        block = uniqIdToBlock[uniqId];

    if(block) {
        if(block.domElem.index(domNode) < 0) {
            block.domElem = block.domElem.add(domElem);
            objects.extend(block.params, params);
        }

        return block;
    }

    uniqIdToDomElems[uniqId] = uniqIdToDomElems[uniqId]?
        uniqIdToDomElems[uniqId].add(domElem) :
        domElem;

    var parentDomNode = domNode.parentNode;
    if(!parentDomNode || parentDomNode.nodeType === 11) { // jquery doesn't unique disconnected node
        $.unique(uniqIdToDomElems[uniqId]);
    }

    var blockClass = blocks[blockName] || DOM.decl(blockName, {}, { live : true }, true);
    if(!(blockClass._liveInitable = !!blockClass._processLive()) || forceLive || params.live === false) {
        forceLive && domElem.addClass(BEM_CLASS); // add css class for preventing memory leaks in further destructing

        block = new blockClass(uniqIdToDomElems[uniqId], params, !!forceLive);

        delete uniqIdToDomElems[uniqId];
        callback && callback.apply(block, Array.prototype.slice.call(arguments, 4));
        return block;
    }
}

/**
 * Processes and adds necessary block parameters
 * @param {Object} params Initialization parameters
 * @param {String} blockName Block name
 * @param {String} [uniqInitId] ID of the "initialization wave"
 */
function processParams(params, blockName, uniqInitId) {
    params.uniqId ||
        (params.uniqId = (params.id?
            blockName + '-id-' + params.id :
            identify()) + (uniqInitId || identify()));

    return params;
}

/**
 * Helper for searching for a DOM element using a selector inside the context, including the context itself
 * @param {jQuery} ctx Context
 * @param {String} selector CSS selector
 * @param {Boolean} [excludeSelf=false] Exclude context from search
 * @returns {jQuery}
 */
function findDomElem(ctx, selector, excludeSelf) {
    var res = ctx.find(selector);
    return excludeSelf?
       res :
       res.add(ctx.filter(selector));
}

/**
 * Returns parameters of a block's DOM element
 * @param {HTMLElement} domNode DOM node
 * @returns {Object}
 */
function getParams(domNode, blockName) {
    var uniqId = identify(domNode);
    return domElemToParams[uniqId] ||
        (domElemToParams[uniqId] = extractParams(domNode));
}

/**
 * Returns parameters of a block extracted from DOM node
 * @param {HTMLElement} domNode DOM node
 * @param {String} blockName
 * @returns {Object}
 */

function getBlockParams(domNode, blockName) {
    var params = getParams(domNode);
    return params[blockName] || (params[blockName] = {});
}

/**
 * Retrieves block parameters from a DOM element
 * @param {HTMLElement} domNode DOM node
 * @returns {Object}
 */
function extractParams(domNode) {
    var attrVal = domNode.getAttribute(BEM_PARAMS_ATTR);
    return attrVal? JSON.parse(attrVal) : {};
}

/**
 * Uncouple DOM node from the block. If this is the last node, then destroys the block.
 * @param {BEMDOM} block block
 * @param {HTMLElement} domNode DOM node
 */
function removeDomNodeFromBlock(block, domNode) {
    block.domElem.length === 1?
        block._destruct() :
        block.domElem = block.domElem.not(domNode);
}

/**
 * Fills DOM node's parent nodes to the storage
 * @param {jQuery} domElem
 */
function storeDomNodeParents(domElem) {
    domElem.each(function() {
        domNodesToParents[identify(this)] = this.parentNode;
    });
}

/**
 * Returns jQuery collection for provided HTML
 * @param {jQuery|String} html
 * @returns {jQuery}
 */
function getJqueryCollection(html) {
    return $(typeof html === 'string'? $.parseHTML(html, null, true) : html);
}

var DOM;

$(function() {

/**
 * @class BEMDOM
 * @description Base block for creating BEM blocks that have DOM representation
 * @exports
 */

DOM = BEM.decl('i-bem__dom',/** @lends BEMDOM.prototype */{
    /**
     * @constructor
     * @private
     * @param {jQuery} domElem DOM element that the block is created on
     * @param {Object} params Block parameters
     * @param {Boolean} [initImmediately=true]
     */
    __constructor : function(domElem, params, initImmediately) {
        /**
         * DOM elements of block
         * @member {jQuery}
         * @readonly
         */
        this.domElem = domElem;

        /**
         * Cache for names of events on DOM elements
         * @member {Object}
         * @private
         */
        this._eventNameCache = {};

        /**
         * Cache for elements
         * @member {Object}
         * @private
         */
        this._elemCache = {};

        /**
         * @member {String} Unique block ID
         * @private
         */
        this._uniqId = params.uniqId;

        uniqIdToBlock[this._uniqId] = this;

        /**
         * @member {Boolean} Flag for whether it's necessary to unbind from the document and window when destroying the block
         * @private
         */
        this._needSpecialUnbind = false;

        this.__base(null, params, initImmediately);
    },

    /**
     * Finds blocks inside the current block or its elements (including context)
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEMDOM[]}
     */
    findBlocksInside : function(elem, block) {
        return this._findBlocks('find', elem, block);
    },

    /**
     * Finds the first block inside the current block or its elements (including context)
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEMDOM}
     */
    findBlockInside : function(elem, block) {
        return this._findBlocks('find', elem, block, true);
    },

    /**
     * Finds blocks outside the current block or its elements (including context)
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEMDOM[]}
     */
    findBlocksOutside : function(elem, block) {
        return this._findBlocks('parents', elem, block);
    },

    /**
     * Finds the first block outside the current block or its elements (including context)
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEMDOM}
     */
    findBlockOutside : function(elem, block) {
        return this._findBlocks('closest', elem, block)[0] || null;
    },

    /**
     * Finds blocks on DOM elements of the current block or its elements
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEMDOM[]}
     */
    findBlocksOn : function(elem, block) {
        return this._findBlocks('', elem, block);
    },

    /**
     * Finds the first block on DOM elements of the current block or its elements
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEMDOM}
     */
    findBlockOn : function(elem, block) {
        return this._findBlocks('', elem, block, true);
    },

    _findBlocks : function(select, elem, block, onlyFirst) {
        if(!block) {
            block = elem;
            elem = undef;
        }

        var ctxElem = elem?
                (typeof elem === 'string'? this.findElem(elem) : elem) :
                this.domElem,
            isSimpleBlock = typeof block === 'string',
            blockName = isSimpleBlock? block : (block.block || block.blockName),
            selector = '.' +
                (isSimpleBlock?
                    buildClass(blockName) :
                    buildClass(blockName, block.modName, block.modVal)) +
                (onlyFirst? ':first' : ''),
            domElems = ctxElem.filter(selector);

        select && (domElems = domElems.add(ctxElem[select](selector)));

        if(onlyFirst) {
            return domElems[0]? initBlock(blockName, domElems.eq(0), undef, true)._init() : null;
        }

        var res = [],
            uniqIds = {};

        domElems.each(function(i, domElem) {
            var block = initBlock(blockName, $(domElem), undef, true)._init();
            if(!uniqIds[block._uniqId]) {
                uniqIds[block._uniqId] = true;
                res.push(block);
            }
        });

        return res;
    },

    /**
     * Adds an event handler for any DOM element
     * @protected
     * @param {jQuery} domElem DOM element where the event will be listened for
     * @param {String|Object} event Event name or event object
     * @param {Object} [data] Additional event data
     * @param {Function} fn Handler function, which will be executed in the block's context
     * @returns {BEMDOM} this
     */
    bindToDomElem : function(domElem, event, data, fn) {
        if(functions.isFunction(data)) {
            fn = data;
            data = undef;
        }

        fn?
            domElem.bind(
                this._buildEventName(event),
                data,
                $.proxy(fn, this)) :
            objects.each(event, function(fn, event) {
                this.bindToDomElem(domElem, event, data, fn);
            }, this);

        return this;
    },

    /**
     * Adds an event handler to the document
     * @protected
     * @param {String|Object} event Event name or event object
     * @param {Object} [data] Additional event data
     * @param {Function} fn Handler function, which will be executed in the block's context
     * @returns {BEMDOM} this
     */
    bindToDoc : function(event, data, fn) {
        this._needSpecialUnbind = true;
        return this.bindToDomElem(doc, event, data, fn);
    },

    /**
     * Adds an event handler to the window
     * @protected
     * @param {String|Object} event Event name or event object
     * @param {Object} [data] Additional event data
     * @param {Function} fn Handler function, which will be executed in the block's context
     * @returns {BEMDOM} this
     */
    bindToWin : function(event, data, fn) {
        this._needSpecialUnbind = true;
        return this.bindToDomElem(win, event, data, fn);
    },

    /**
     * Adds an event handler to the block's main DOM elements or its nested elements
     * @protected
     * @param {jQuery|String} [elem] Element
     * @param {String|Object} event Event name or event object
     * @param {Object} [data] Additional event data
     * @param {Function} fn Handler function, which will be executed in the block's context
     * @returns {BEMDOM} this
     */
    bindTo : function(elem, event, data, fn) {
        var len = arguments.length;
        if(len === 3) {
            if(functions.isFunction(data)) {
                fn = data;
                if(typeof event === 'object') {
                    data = event;
                    event = elem;
                    elem = this.domElem;
                }
            }
        } else if(len === 2) {
            if(functions.isFunction(event)) {
                fn = event;
                event = elem;
                elem = this.domElem;
            } else if(!(typeof elem === 'string' || elem instanceof $)) {
                data = event;
                event = elem;
                elem = this.domElem;
            }
        } else if(len === 1) {
            event = elem;
            elem = this.domElem;
        }

        typeof elem === 'string' && (elem = this.elem(elem));

        return this.bindToDomElem(elem, event, data, fn);
    },

    /**
     * Removes event handlers from any DOM element
     * @protected
     * @param {jQuery} domElem DOM element where the event was being listened for
     * @param {String|Object} event Event name or event object
     * @param {Function} [fn] Handler function
     * @returns {BEMDOM} this
     */
    unbindFromDomElem : function(domElem, event, fn) {
        if(typeof event === 'string') {
            event = this._buildEventName(event);
            fn?
                domElem.unbind(event, fn) :
                domElem.unbind(event);
        } else {
            objects.each(event, function(fn, event) {
                this.unbindFromDomElem(domElem, event, fn);
            }, this);
        }

        return this;
    },

    /**
     * Removes event handler from document
     * @protected
     * @param {String|Object} event Event name or event object
     * @param {Function} [fn] Handler function
     * @returns {BEMDOM} this
     */
    unbindFromDoc : function(event, fn) {
        return this.unbindFromDomElem(doc, event, fn);
    },

    /**
     * Removes event handler from window
     * @protected
     * @param {String|Object} event Event name or event object
     * @param {Function} [fn] Handler function
     * @returns {BEMDOM} this
     */
    unbindFromWin : function(event, fn) {
        return this.unbindFromDomElem(win, event, fn);
    },

    /**
     * Removes event handlers from the block's main DOM elements or its nested elements
     * @protected
     * @param {jQuery|String} [elem] Nested element
     * @param {String|Object} event Event name or event object
     * @param {Function} [fn] Handler function
     * @returns {BEMDOM} this
     */
    unbindFrom : function(elem, event, fn) {
        var argLen = arguments.length;
        if(argLen === 1) {
            event = elem;
            elem = this.domElem;
        } else if(argLen === 2 && functions.isFunction(event)) {
            fn = event;
            event = elem;
            elem = this.domElem;
        } else if(typeof elem === 'string') {
            elem = this.elem(elem);
        }

        return this.unbindFromDomElem(elem, event, fn);
    },

    /**
     * Builds a full name for an event
     * @private
     * @param {String} event Event name
     * @returns {String}
     */
    _buildEventName : function(event) {
        return event.indexOf(' ') > 1?
            event.split(' ').map(function(e) {
                return this._buildOneEventName(e);
            }, this).join(' ') :
            this._buildOneEventName(event);
    },

    /**
     * Builds a full name for a single event
     * @private
     * @param {String} event Event name
     * @returns {String}
     */
    _buildOneEventName : function(event) {
        var eventNameCache = this._eventNameCache;

        if(event in eventNameCache) return eventNameCache[event];

        var uniq = '.' + this._uniqId;

        if(event.indexOf('.') < 0) return eventNameCache[event] = event + uniq;

        var lego = '.bem_' + this.__self._name;

        return eventNameCache[event] = event.split('.').map(function(e, i) {
            return i === 0? e + lego : lego + '_' + e;
        }).join('') + uniq;
    },

    _ctxEmit : function(e, data) {
        this.__base.apply(this, arguments);

        var _this = this,
            storage = liveEventCtxStorage[_this.__self._buildCtxEventName(e.type)],
            ctxIds = {};

        storage && _this.domElem.each(function(_, ctx) {
            var counter = storage.counter;
            while(ctx && counter) {
                var ctxId = identify(ctx, true);
                if(ctxId) {
                    if(ctxIds[ctxId]) break;
                    var storageCtx = storage.ctxs[ctxId];
                    if(storageCtx) {
                        objects.each(storageCtx, function(handler) {
                            handler.fn.call(
                                handler.ctx || _this,
                                e,
                                data);
                        });
                        counter--;
                    }
                    ctxIds[ctxId] = true;
                }
                ctx = ctx.parentNode || domNodesToParents[ctxId];
            }
        });
    },

    /**
     * Sets a modifier for a block/nested element
     * @param {jQuery} [elem] Nested element
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @returns {BEMDOM} this
     */
    setMod : function(elem, modName, modVal) {
        if(elem && typeof modVal !== 'undefined' && elem.length > 1) {
            var _this = this;
            elem.each(function() {
                var item = $(this);
                item.__bemElemName = elem.__bemElemName;
                _this.setMod(item, modName, modVal);
            });
            return _this;
        }
        return this.__base(elem, modName, modVal);
    },

    /**
     * Retrieves modifier value from the DOM node's CSS class
     * @private
     * @param {String} modName Modifier name
     * @param {jQuery} [elem] Nested element
     * @param {String} [elemName] Name of the nested element
     * @returns {String} Modifier value
     */
    _extractModVal : function(modName, elem, elemName) {
        var domNode = (elem || this.domElem)[0],
            matches;

        domNode &&
            (matches = domNode.className
                .match(this.__self._buildModValRE(modName, elemName || elem)));

        return matches? matches[2] || true : '';
    },

    /**
     * Retrieves a name/value list of modifiers
     * @private
     * @param {Array} [modNames] Names of modifiers
     * @param {Object} [elem] Element
     * @returns {Object} Hash of modifier values by names
     */
    _extractMods : function(modNames, elem) {
        var res = {},
            extractAll = !modNames.length,
            countMatched = 0;

        ((elem || this.domElem)[0].className
            .match(this.__self._buildModValRE(
                '(' + (extractAll? NAME_PATTERN : modNames.join('|')) + ')',
                elem,
                'g')) || []).forEach(function(className) {
                    var matches = className.match(EXTRACT_MODS_RE);
                    res[matches[1]] = matches[2] || true;
                    ++countMatched;
                });

        // empty modifier values are not reflected in classes; they must be filled with empty values
        countMatched < modNames.length && modNames.forEach(function(modName) {
            modName in res || (res[modName] = '');
        });

        return res;
    },

    /**
     * Sets a modifier's CSS class for a block's DOM element or nested element
     * @private
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @param {String} oldModVal Old modifier value
     * @param {jQuery} [elem] Element
     * @param {String} [elemName] Element name
     */
    _onSetMod : function(modName, modVal, oldModVal, elem, elemName) {
        if(modName !== 'js' || modVal !== '') {
            var _self = this.__self,
                classPrefix = _self._buildModClassPrefix(modName, elemName),
                classRE = _self._buildModValRE(modName, elemName),
                needDel = modVal === '' || modVal === false;

            (elem || this.domElem).each(function() {
                var className = this.className,
                    modClassName = classPrefix;

                modVal !== true && (modClassName += MOD_DELIM + modVal);

                (oldModVal === true?
                    classRE.test(className) :
                    className.indexOf(classPrefix + MOD_DELIM) > -1)?
                        this.className = className.replace(
                            classRE,
                            (needDel? '' : '$1' + modClassName)) :
                        needDel || $(this).addClass(modClassName);
            });

            elemName && this
                .dropElemCache(elemName, modName, oldModVal)
                .dropElemCache(elemName, modName, modVal);
        }

        this.__base.apply(this, arguments);
    },

    /**
     * Finds elements nested in a block
     * @param {jQuery} [ctx=this.domElem] Element where search is being performed
     * @param {String} names Nested element name (or names separated by spaces)
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @param {Boolean} [strictMode=false]
     * @returns {jQuery} DOM elements
     */
    findElem : function(ctx, names, modName, modVal, strictMode) {
        if(typeof ctx === 'string') {
            strictMode = modVal;
            modVal = modName;
            modName = names;
            names = ctx;
            ctx = this.domElem;
        }

        if(typeof modName === 'boolean') {
            strictMode = modName;
            modName = undef;
        }

        var _self = this.__self,
            selector = '.' +
                names.split(' ').map(function(name) {
                    return _self.buildClass(name, modName, modVal);
                }).join(',.'),
            res = findDomElem(ctx, selector);

        return strictMode? this._filterFindElemResults(res) : res;
    },

    /**
     * Filters results of findElem helper execution in strict mode
     * @param {jQuery} res DOM elements
     * @returns {jQuery} DOM elements
     */
    _filterFindElemResults : function(res) {
        var blockSelector = this.buildSelector(),
            domElem = this.domElem;
        return res.filter(function() {
            return domElem.index($(this).closest(blockSelector)) > -1;
        });
    },

    /**
     * Finds elements nested in a block
     * @private
     * @param {String} name Nested element name
     * @param {String} [modName] Modifier name
     * @param {String|Boolean} [modVal] Modifier value
     * @returns {jQuery} DOM elements
     */
    _elem : function(name, modName, modVal) {
        var key = name + buildModPostfix(modName, modVal),
            res;

        if(!(res = this._elemCache[key])) {
            res = this._elemCache[key] = this.findElem(name, modName, modVal);
            res.__bemElemName = name;
        }

        return res;
    },

    /**
     * Lazy search for elements nested in a block (caches results)
     * @param {String} names Nested element name (or names separated by spaces)
     * @param {String} [modName] Modifier name
     * @param {String|Boolean} [modVal=true] Modifier value
     * @returns {jQuery} DOM elements
     */
    elem : function(names, modName, modVal) {
        if(arguments.length === 2) {
            modVal = true;
        }

        if(modName && typeof modName !== 'string') {
            modName.__bemElemName = names;
            return modName;
        }

        if(names.indexOf(' ') < 0) {
            return this._elem(names, modName, modVal);
        }

        var res = $([]);
        names.split(' ').forEach(function(name) {
            res = res.add(this._elem(name, modName, modVal));
        }, this);
        return res;
    },

    /**
     * Finds elements outside the context
     * @param {jQuery} ctx context
     * @param {String} elemName Element name
     * @returns {jQuery} DOM elements
     */
    closestElem : function(ctx, elemName) {
        return ctx.closest(this.buildSelector(elemName));
    },

    /**
     * Clearing the cache for elements
     * @protected
     * @param {String} [names] Nested element name (or names separated by spaces)
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {BEMDOM} this
     */
    dropElemCache : function(names, modName, modVal) {
        if(names) {
            var modPostfix = buildModPostfix(modName, modVal);
            names.indexOf(' ') < 0?
                delete this._elemCache[names + modPostfix] :
                names.split(' ').forEach(function(name) {
                    delete this._elemCache[name + modPostfix];
                }, this);
        } else {
            this._elemCache = {};
        }

        return this;
    },

    /**
     * Retrieves parameters of a block element
     * @param {String|jQuery} elem Element
     * @returns {Object} Parameters
     */
    elemParams : function(elem) {
        var elemName;
        if(typeof elem === 'string') {
            elemName = elem;
            elem = this.elem(elem);
        } else {
            elemName = this.__self._extractElemNameFrom(elem);
        }

        return extractParams(elem[0])[this.__self.buildClass(elemName)] || {};
    },

    /**
     * Elemify given element
     * @param {jQuery} elem Element
     * @param {String} elemName Name
     * @returns {jQuery}
     */
    elemify : function(elem, elemName) {
        (elem = $(elem)).__bemElemName = elemName;
        return elem;
    },

    /**
     * Checks whether a DOM element is in a block
     * @protected
     * @param {jQuery} [ctx=this.domElem] Element where check is being performed
     * @param {jQuery} domElem DOM element
     * @returns {Boolean}
     */
    containsDomElem : function(ctx, domElem) {
        if(arguments.length === 1) {
            domElem = ctx;
            ctx = this.domElem;
        }

        return dom.contains(ctx, domElem);
    },

    /**
     * Builds a CSS selector corresponding to a block/element and modifier
     * @param {String} [elem] Element name
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {String}
     */
    buildSelector : function(elem, modName, modVal) {
        return this.__self.buildSelector(elem, modName, modVal);
    },

    /**
     * Destructs a block
     * @private
     */
    _destruct : function() {
        var _this = this,
            _self = _this.__self;

        _this._needSpecialUnbind && _self.doc.add(_self.win).unbind('.' + _this._uniqId);

        _this.__base();

        delete uniqIdToBlock[_this.un()._uniqId];
    }

}, /** @lends BEMDOM */{

    /**
     * Scope
     * @type jQuery
     */
    scope : $('body'),

    /**
     * Document shortcut
     * @type jQuery
     */
    doc : doc,

    /**
     * Window shortcut
     * @type jQuery
     */
    win : win,

    /**
     * Processes a block's live properties
     * @private
     * @param {Boolean} [heedLive=false] Whether to take into account that the block already processed its live properties
     * @returns {Boolean} Whether the block is a live block
     */
    _processLive : function(heedLive) {
        var res = this._liveInitable;

        if('live' in this) {
            var noLive = typeof res === 'undefined';

            if(noLive ^ heedLive) { // should be opposite to each other
                res = this.live() !== false;

                var blockName = this.getName(),
                    origLive = this.live;

                this.live = function() {
                    return this.getName() === blockName?
                        res :
                        origLive.apply(this, arguments);
                };
            }
        }

        return res;
    },

    /**
     * Initializes blocks on a fragment of the DOM tree
     * @param {jQuery|String} [ctx=scope] Root DOM node
     * @returns {jQuery} ctx Initialization context
     */
    init : function(ctx) {
        if(typeof ctx === 'string') {
            ctx = $(ctx);
        } else if(!ctx) ctx = DOM.scope;

        var uniqInitId = identify();
        findDomElem(ctx, BEM_SELECTOR).each(function() {
            initBlocks($(this), uniqInitId);
        });

        this._runInitFns();

        return ctx;
    },

    /**
     * Destroys blocks on a fragment of the DOM tree
     * @param {jQuery} ctx Root DOM node
     * @param {Boolean} [excludeSelf=false] Exclude the main domElem
     */
    destruct : function(ctx, excludeSelf) {
        var _ctx;
        if(excludeSelf) {
            storeDomNodeParents(_ctx = ctx.children());
            ctx.empty();
        } else {
            storeDomNodeParents(_ctx = ctx);
            ctx.remove();
        }

        reverse.call(findDomElem(_ctx, BEM_SELECTOR)).each(function(_, domNode) {
            var params = getParams(domNode);
            objects.each(params, function(blockParams) {
                if(blockParams.uniqId) {
                    var block = uniqIdToBlock[blockParams.uniqId];
                    block?
                        removeDomNodeFromBlock(block, domNode) :
                        delete uniqIdToDomElems[blockParams.uniqId];
                }
            });
            delete domElemToParams[identify(domNode)];
        });

        // flush parent nodes storage that has been filled above
        domNodesToParents = {};
    },

    /**
     * Replaces a fragment of the DOM tree inside the context, destroying old blocks and intializing new ones
     * @param {jQuery} ctx Root DOM node
     * @param {jQuery|String} content New content
     * @returns {jQuery} Updated root DOM node
     */
    update : function(ctx, content) {
        this.destruct(ctx, true);
        return this.init(ctx.html(content));
    },

    /**
     * Changes a fragment of the DOM tree including the context and initializes blocks.
     * @param {jQuery} ctx Root DOM node
     * @param {jQuery|String} content Content to be added
     * @returns {jQuery} New content
     */
    replace : function(ctx, content) {
        var prev = ctx.prev(),
            parent = ctx.parent();

        content = getJqueryCollection(content);

        this.destruct(ctx);

        return this.init(prev.length?
            content.insertAfter(prev) :
            content.prependTo(parent));
    },

    /**
     * Adds a fragment of the DOM tree at the end of the context and initializes blocks
     * @param {jQuery} ctx Root DOM node
     * @param {jQuery|String} content Content to be added
     * @returns {jQuery} New content
     */
    append : function(ctx, content) {
        return this.init(getJqueryCollection(content).appendTo(ctx));
    },

    /**
     * Adds a fragment of the DOM tree at the beginning of the context and initializes blocks
     * @param {jQuery} ctx Root DOM node
     * @param {jQuery|String} content Content to be added
     * @returns {jQuery} New content
     */
    prepend : function(ctx, content) {
        return this.init(getJqueryCollection(content).prependTo(ctx));
    },

    /**
     * Adds a fragment of the DOM tree before the context and initializes blocks
     * @param {jQuery} ctx Contextual DOM node
     * @param {jQuery|String} content Content to be added
     * @returns {jQuery} New content
     */
    before : function(ctx, content) {
        return this.init(getJqueryCollection(content).insertBefore(ctx));
    },

    /**
     * Adds a fragment of the DOM tree after the context and initializes blocks
     * @param {jQuery} ctx Contextual DOM node
     * @param {jQuery|String} content Content to be added
     * @returns {jQuery} New content
     */
    after : function(ctx, content) {
        return this.init(getJqueryCollection(content).insertAfter(ctx));
    },

    /**
     * Builds a full name for a live event
     * @private
     * @param {String} e Event name
     * @returns {String}
     */
    _buildCtxEventName : function(e) {
        return this._name + ':' + e;
    },

    _liveClassBind : function(className, e, callback, invokeOnInit) {
        if(e.indexOf(' ') > -1) {
            e.split(' ').forEach(function(e) {
                this._liveClassBind(className, e, callback, invokeOnInit);
            }, this);
        } else {
            var storage = liveClassEventStorage[e],
                uniqId = identify(callback);

            if(!storage) {
                storage = liveClassEventStorage[e] = {};
                DOM.scope.bind(e, $.proxy(this._liveClassTrigger, this));
            }

            storage = storage[className] || (storage[className] = { uniqIds : {}, fns : [] });

            if(!(uniqId in storage.uniqIds)) {
                storage.fns.push({ uniqId : uniqId, fn : this._buildLiveEventFn(callback, invokeOnInit) });
                storage.uniqIds[uniqId] = storage.fns.length - 1;
            }
        }

        return this;
    },

    _liveClassUnbind : function(className, e, callback) {
        var storage = liveClassEventStorage[e];
        if(storage) {
            if(callback) {
                if(storage = storage[className]) {
                    var uniqId = identify(callback);
                    if(uniqId in storage.uniqIds) {
                        var i = storage.uniqIds[uniqId],
                            len = storage.fns.length - 1;
                        storage.fns.splice(i, 1);
                        while(i < len) storage.uniqIds[storage.fns[i++].uniqId] = i - 1;
                        delete storage.uniqIds[uniqId];
                    }
                }
            } else {
                delete storage[className];
            }
        }

        return this;
    },

    _liveClassTrigger : function(e) {
        var storage = liveClassEventStorage[e.type];
        if(storage) {
            var node = e.target, classNames = [];
            for(var className in storage) {
                classNames.push(className);
            }
            do {
                var nodeClassName = ' ' + node.className + ' ', i = 0;
                while(className = classNames[i++]) {
                    if(nodeClassName.indexOf(' ' + className + ' ') > -1) {
                        var j = 0, fns = storage[className].fns, fn, stopPropagationAndPreventDefault = false;
                        while(fn = fns[j++])
                            if(fn.fn.call($(node), e) === false) stopPropagationAndPreventDefault = true;

                        stopPropagationAndPreventDefault && e.preventDefault();
                        if(stopPropagationAndPreventDefault || e.isPropagationStopped()) return;

                        classNames.splice(--i, 1);
                    }
                }
            } while(classNames.length && (node = node.parentNode));
        }
    },

    _buildLiveEventFn : function(callback, invokeOnInit) {
        var _this = this;
        return function(e) {
            e.currentTarget = this;
            var args = [
                    _this._name,
                    $(this).closest(_this.buildSelector()),
                    undef,
                    true
                ],
                block = initBlock.apply(null, invokeOnInit? args.concat([callback, e]) : args);

            if(block && !invokeOnInit && callback)
                return callback.apply(block, arguments);
        };
    },

    /**
     * Helper for live initialization for an event on DOM elements of a block or its elements
     * @protected
     * @param {String} [elemName] Element name or names (separated by spaces)
     * @param {String} event Event name
     * @param {Function} [callback] Handler to call after successful initialization
     */
    liveInitOnEvent : function(elemName, event, callback) {
        return this.liveBindTo(elemName, event, callback, true);
    },

    /**
     * Helper for subscribing to live events on DOM elements of a block or its elements
     * @protected
     * @param {String|Object} [to] Description (object with modName, modVal, elem) or name of the element or elements (space-separated)
     * @param {String} event Event name
     * @param {Function} [callback] Handler
     */
    liveBindTo : function(to, event, callback, invokeOnInit) {
        if(!event || functions.isFunction(event)) {
            callback = event;
            event = to;
            to = undef;
        }

        if(!to || typeof to === 'string') {
            to = { elem : to };
        }

        if(to.elem && to.elem.indexOf(' ') > 0) {
            to.elem.split(' ').forEach(function(elem) {
                this._liveClassBind(
                    this.buildClass(elem, to.modName, to.modVal),
                    event,
                    callback,
                    invokeOnInit);
            }, this);
            return this;
        }

        return this._liveClassBind(
            this.buildClass(to.elem, to.modName, to.modVal),
            event,
            callback,
            invokeOnInit);
    },

    /**
     * Helper for unsubscribing from live events on DOM elements of a block or its elements
     * @protected
     * @param {String} [elem] Name of the element or elements (space-separated)
     * @param {String} event Event name
     * @param {Function} [callback] Handler
     */
    liveUnbindFrom : function(elem, event, callback) {

        if(!event || functions.isFunction(event)) {
            callback = event;
            event = elem;
            elem = undef;
        }

        if(elem && elem.indexOf(' ') > 1) {
            elem.split(' ').forEach(function(elem) {
                this._liveClassUnbind(
                    this.buildClass(elem),
                    event,
                    callback);
            }, this);
            return this;
        }

        return this._liveClassUnbind(
            this.buildClass(elem),
            event,
            callback);
    },

    /**
     * Helper for live initialization when a different block is initialized
     * @private
     * @param {String} event Event name
     * @param {String} blockName Name of the block that should trigger a reaction when initialized
     * @param {Function} callback Handler to be called after successful initialization in the new block's context
     * @param {String} findFnName Name of the method for searching
     */
    _liveInitOnBlockEvent : function(event, blockName, callback, findFnName) {
        var name = this._name;
        blocks[blockName].on(event, function(e) {
            var args = arguments,
                blocks = e.target[findFnName](name);

            callback && blocks.forEach(function(block) {
                callback.apply(block, args);
            });
        });
        return this;
    },

    /**
     * Helper for live initialization for a different block's event on the current block's DOM element
     * @protected
     * @param {String} event Event name
     * @param {String} blockName Name of the block that should trigger a reaction when initialized
     * @param {Function} callback Handler to be called after successful initialization in the new block's context
     */
    liveInitOnBlockEvent : function(event, blockName, callback) {
        return this._liveInitOnBlockEvent(event, blockName, callback, 'findBlocksOn');
    },

    /**
     * Helper for live initialization for a different block's event inside the current block
     * @protected
     * @param {String} event Event name
     * @param {String} blockName Name of the block that should trigger a reaction when initialized
     * @param {Function} [callback] Handler to be called after successful initialization in the new block's context
     */
    liveInitOnBlockInsideEvent : function(event, blockName, callback) {
        return this._liveInitOnBlockEvent(event, blockName, callback, 'findBlocksOutside');
    },

    /**
     * Adds a live event handler to a block, based on a specified element where the event will be listened for
     * @param {jQuery} [ctx] The element in which the event will be listened for
     * @param {String} e Event name
     * @param {Object} [data] Additional information that the handler gets as e.data
     * @param {Function} fn Handler
     * @param {Object} [fnCtx] Handler's context
     */
    on : function(ctx, e, data, fn, fnCtx) {
        return typeof ctx === 'object' && ctx.jquery?
            this._liveCtxBind(ctx, e, data, fn, fnCtx) :
            this.__base(ctx, e, data, fn);
    },

    /**
     * Removes the live event handler from a block, based on a specified element where the event was being listened for
     * @param {jQuery} [ctx] The element in which the event was being listened for
     * @param {String} e Event name
     * @param {Function} [fn] Handler
     * @param {Object} [fnCtx] Handler context
     */
    un : function(ctx, e, fn, fnCtx) {
        return typeof ctx === 'object' && ctx.jquery?
            this._liveCtxUnbind(ctx, e, fn, fnCtx) :
            this.__base(ctx, e, fn);
    },

    /**
     * Adds a live event handler to a block, based on a specified element where the event will be listened for
     * @private
     * @param {jQuery} ctx The element in which the event will be listened for
     * @param {String} e  Event name
     * @param {Object} [data] Additional information that the handler gets as e.data
     * @param {Function} fn Handler
     * @param {Object} [fnCtx] Handler context
     * @returns {BEMDOM} this
     */
    _liveCtxBind : function(ctx, e, data, fn, fnCtx) {
        if(typeof e === 'object') {
            if(functions.isFunction(data) || functions.isFunction(fn)) { // mod change event
                e = this._buildModEventName(e);
            } else {
                objects.each(e, function(fn, e) {
                    this._liveCtxBind(ctx, e, fn, data);
                }, this);
                return this;
            }
        }

        if(functions.isFunction(data)) {
            fnCtx = fn;
            fn = data;
            data = undef;
        }

        if(e.indexOf(' ') > -1) {
            e.split(' ').forEach(function(e) {
                this._liveCtxBind(ctx, e, data, fn, fnCtx);
            }, this);
        } else {
            var ctxE = this._buildCtxEventName(e),
                storage = liveEventCtxStorage[ctxE] ||
                    (liveEventCtxStorage[ctxE] = { counter : 0, ctxs : {} });

            ctx.each(function() {
                var ctxId = identify(this),
                    ctxStorage = storage.ctxs[ctxId];
                if(!ctxStorage) {
                    ctxStorage = storage.ctxs[ctxId] = {};
                    ++storage.counter;
                }
                ctxStorage[identify(fn) + (fnCtx? identify(fnCtx) : '')] = {
                    fn : fn,
                    data : data,
                    ctx : fnCtx
                };
            });
        }

        return this;
    },

    /**
     * Removes a live event handler from a block, based on a specified element where the event was being listened for
     * @private
     * @param {jQuery} ctx The element in which the event was being listened for
     * @param {String|Object} e Event name
     * @param {Function} [fn] Handler
     * @param {Object} [fnCtx] Handler context
     */
    _liveCtxUnbind : function(ctx, e, fn, fnCtx) {
        if(typeof e === 'object' && functions.isFunction(fn)) { // mod change event
            e = this._buildModEventName(e);
        }

        var storage = liveEventCtxStorage[e = this._buildCtxEventName(e)];

        if(storage) {
            ctx.each(function() {
                var ctxId = identify(this, true),
                    ctxStorage;
                if(ctxId && (ctxStorage = storage.ctxs[ctxId])) {
                    fn && delete ctxStorage[identify(fn) + (fnCtx? identify(fnCtx) : '')];
                    if(!fn || objects.isEmpty(ctxStorage)) {
                        storage.counter--;
                        delete storage.ctxs[ctxId];
                    }
                }
            });
            storage.counter || delete liveEventCtxStorage[e];
        }

        return this;
    },

    /**
     * Retrieves the name of an element nested in a block
     * @private
     * @param {jQuery} elem Nested element
     * @returns {String|undef}
     */
    _extractElemNameFrom : function(elem) {
        if(elem.__bemElemName) return elem.__bemElemName;

        var matches = elem[0].className.match(this._buildElemNameRE());
        return matches? matches[1] : undef;
    },

    /**
     * Builds a prefix for the CSS class of a DOM element or nested element of the block, based on modifier name
     * @private
     * @param {String} modName Modifier name
     * @param {jQuery|String} [elem] Element
     * @returns {String}
     */
    _buildModClassPrefix : function(modName, elem) {
        return this._name +
               (elem?
                   ELEM_DELIM + (typeof elem === 'string'? elem : this._extractElemNameFrom(elem)) :
                   '') +
               MOD_DELIM + modName;
    },

    /**
     * Builds a regular expression for extracting modifier values from a DOM element or nested element of a block
     * @private
     * @param {String} modName Modifier name
     * @param {jQuery|String} [elem] Element
     * @param {String} [quantifiers] Regular expression quantifiers
     * @returns {RegExp}
     */
    _buildModValRE : function(modName, elem, quantifiers) {
        return new RegExp(
            '(\\s|^)' +
            this._buildModClassPrefix(modName, elem) +
            '(?:' + MOD_DELIM + '(' + NAME_PATTERN + '))?(?=\\s|$)',
            quantifiers);
    },

    /**
     * Builds a regular expression for extracting names of elements nested in a block
     * @private
     * @returns {RegExp}
     */
    _buildElemNameRE : function() {
        return new RegExp(this._name + ELEM_DELIM + '(' + NAME_PATTERN + ')(?:\\s|$)');
    },

    /**
     * Builds a CSS class corresponding to the block/element and modifier
     * @param {String} [elem] Element name
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {String}
     */
    buildClass : function(elem, modName, modVal) {
        return buildClass(this._name, elem, modName, modVal);
    },

    /**
     * Builds a CSS selector corresponding to the block/element and modifier
     * @param {String} [elem] Element name
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {String}
     */
    buildSelector : function(elem, modName, modVal) {
        return '.' + this.buildClass(elem, modName, modVal);
    }
});

/**
 * Returns a block on a DOM element and initializes it if necessary
 * @param {String} blockName Block name
 * @param {Object} params Block parameters
 * @returns {BEMDOM}
 */
$.fn.bem = function(blockName, params) {
    return initBlock(blockName, this, params, true)._init();
};

provide(DOM);

});

});

(function() {

var origDefine = modules.define;

modules.define = function(name, deps, decl) {
    origDefine.apply(modules, arguments);

    name !== 'i-bem__dom_init' && arguments.length > 2 && ~deps.indexOf('i-bem__dom') &&
        modules.define('i-bem__dom_init', [name], function(provide, _, prev) {
            provide(prev);
        });
};

})();

/* end: ../../libs/bem-core/common.blocks/i-bem/__dom/i-bem__dom.js */
/* begin: ../../libs/bem-core/common.blocks/jquery/jquery.js */
/**
 * @module jquery
 * @description Provide jQuery (load if it does not exist).
 */

modules.define(
    'jquery',
    ['loader_type_js', 'jquery__config'],
    function(provide, loader, cfg) {

/* global jQuery */

function doProvide(preserveGlobal) {
    /**
     * @exports
     * @type Function
     */
    provide(preserveGlobal? jQuery : jQuery.noConflict(true));
}

typeof jQuery !== 'undefined'?
    doProvide(true) :
    loader(cfg.url, doProvide);
});

/* end: ../../libs/bem-core/common.blocks/jquery/jquery.js */
/* begin: ../../libs/bem-core/common.blocks/jquery/__config/jquery__config.js */
/**
 * @module jquery__config
 * @description Configuration for jQuery
 */

modules.define('jquery__config', function(provide) {

provide(/** @exports */{
    /**
     * URL for loading jQuery if it does not exist
     */
    url : '//yastatic.net/jquery/2.1.3/jquery.min.js'
});

});

/* end: ../../libs/bem-core/common.blocks/jquery/__config/jquery__config.js */
/* begin: ../../libs/bem-core/desktop.blocks/jquery/__config/jquery__config.js */
/**
 * @module jquery__config
 * @description Configuration for jQuery
 */

modules.define(
    'jquery__config',
    ['ua', 'objects'],
    function(provide, ua, objects, base) {

provide(
    ua.msie && parseInt(ua.version, 10) < 9?
        objects.extend(
            base,
            {
                url : '//yastatic.net/jquery/1.11.2/jquery.min.js'
            }) :
        base);

});

/* end: ../../libs/bem-core/desktop.blocks/jquery/__config/jquery__config.js */
/* begin: ../../libs/bem-core/desktop.blocks/ua/ua.js */
/**
 * @module ua
 * @description Detect some user agent features (works like jQuery.browser in jQuery 1.8)
 * @see http://code.jquery.com/jquery-migrate-1.1.1.js
 */

modules.define('ua', function(provide) {

var ua = navigator.userAgent.toLowerCase(),
    match = /(chrome)[ \/]([\w.]+)/.exec(ua) ||
        /(webkit)[ \/]([\w.]+)/.exec(ua) ||
        /(opera)(?:.*version|)[ \/]([\w.]+)/.exec(ua) ||
        /(msie) ([\w.]+)/.exec(ua) ||
        ua.indexOf('compatible') < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/.exec(ua) ||
        [],
    matched = {
        browser : match[1] || '',
        version : match[2] || '0'
    },
    browser = {};

if(matched.browser) {
    browser[matched.browser] = true;
    browser.version = matched.version;
}

if(browser.chrome) {
    browser.webkit = true;
} else if(browser.webkit) {
    browser.safari = true;
}

/**
 * @exports
 * @type Object
 */
provide(browser);

});

/* end: ../../libs/bem-core/desktop.blocks/ua/ua.js */
/* begin: ../../libs/bem-core/common.blocks/dom/dom.js */
/**
 * @module dom
 * @description some DOM utils
 */

modules.define('dom', ['jquery'], function(provide, $) {

provide(/** @exports */{
    /**
     * Checks whether a DOM elem is in a context
     * @param {jQuery} ctx DOM elem where check is being performed
     * @param {jQuery} domElem DOM elem to check
     * @returns {Boolean}
     */
    contains : function(ctx, domElem) {
        var res = false;

        domElem.each(function() {
            var domNode = this;
            do {
                if(~ctx.index(domNode)) return !(res = true);
            } while(domNode = domNode.parentNode);

            return res;
        });

        return res;
    },

    /**
     * Returns current focused DOM elem in document
     * @returns {jQuery}
     */
    getFocused : function() {
        // "Error: Unspecified error." in iframe in IE9
        try { return $(document.activeElement); } catch(e) {}
    },

    /**
     * Checks whether a DOM element contains focus
     * @param {jQuery} domElem
     * @returns {Boolean}
     */
    containsFocus : function(domElem) {
        return this.contains(domElem, this.getFocused());
    },

    /**
    * Checks whether a browser currently can set focus on DOM elem
    * @param {jQuery} domElem
    * @returns {Boolean}
    */
    isFocusable : function(domElem) {
        var domNode = domElem[0];

        if(!domNode) return false;
        if(domNode.hasAttribute('tabindex')) return true;

        switch(domNode.tagName.toLowerCase()) {
            case 'iframe':
                return true;

            case 'input':
            case 'button':
            case 'textarea':
            case 'select':
                return !domNode.disabled;

            case 'a':
                return !!domNode.href;
        }

        return false;
    },

    /**
    * Checks whether a domElem is intended to edit text
    * @param {jQuery} domElem
    * @returns {Boolean}
    */
    isEditable : function(domElem) {
        var domNode = domElem[0];

        if(!domNode) return false;

        switch(domNode.tagName.toLowerCase()) {
            case 'input':
                var type = domNode.type;
                return (type === 'text' || type === 'password') && !domNode.disabled && !domNode.readOnly;

            case 'textarea':
                return !domNode.disabled && !domNode.readOnly;

            default:
                return domNode.contentEditable === 'true';
        }
    }
});

});

/* end: ../../libs/bem-core/common.blocks/dom/dom.js */
/* begin: ../../libs/bem-core/common.blocks/i-bem/__dom/_init/i-bem__dom_init.js */
/**
 * @module i-bem__dom_init
 */

modules.define('i-bem__dom_init', ['i-bem__dom'], function(provide, BEMDOM) {

provide(
    /**
     * Initializes blocks on a fragment of the DOM tree
     * @exports
     * @param {jQuery} [ctx=scope] Root DOM node
     * @returns {jQuery} ctx Initialization context
     */
    function(ctx) {
        return BEMDOM.init(ctx);
    });
});

/* end: ../../libs/bem-core/common.blocks/i-bem/__dom/_init/i-bem__dom_init.js */
/* begin: ../../libs/bem-components/common.blocks/link/link.js */
/**
 * @module link
 */

modules.define('link', ['i-bem__dom', 'control'], function(provide, BEMDOM, Control) {

/**
 * @exports
 * @class link
 * @augments control
 * @bem
 */
provide(BEMDOM.decl({ block : this.name, baseBlock : Control }, /** @lends link.prototype */{
    onSetMod : {
        'js' : {
            'inited' : function() {
                this._url = this.params.url || this.domElem.attr('href');

                this.hasMod('disabled') && this.domElem.removeAttr('href');
            }
        },

        'disabled' : {
            'true' : function() {
                this.__base.apply(this, arguments);
                this.domElem.removeAttr('href');
            },

            '' : function() {
                this.__base.apply(this, arguments);
                this.domElem.attr('href', this._url);
            }
        }
    },

    /**
     * Returns url
     * @returns {String}
     */
    getUrl : function() {
        return this._url;
    },

    /**
     * Sets url
     * @param {String} url
     * @returns {link} this
     */
    setUrl : function(url) {
        this._url = url;
        this.hasMod('disabled') || this.domElem.attr('href', url);
        return this;
    },

    _onPointerClick : function(e) {
        this.hasMod('disabled')?
            e.preventDefault() :
            this.emit('click');
    }
}, /** @lends link */{
    live : function() {
        this.liveBindTo('control', 'pointerclick', this.prototype._onPointerClick);
        return this.__base.apply(this, arguments);
    }
}));

});

/* end: ../../libs/bem-components/common.blocks/link/link.js */
/* begin: ../../libs/bem-core/common.blocks/jquery/__event/_type/jquery__event_type_pointerclick.js */
/**
 * FastClick to jQuery module wrapper.
 * @see https://github.com/ftlabs/fastclick
 */
modules.define('jquery', function(provide, $) {

/**
 * FastClick: polyfill to remove click delays on browsers with touch UIs.
 *
 * @version 0.6.11
 * @copyright The Financial Times Limited [All Rights Reserved]
 * @license MIT License (see LICENSE.txt)
 */

/**
 * @class FastClick
 */

/**
 * Instantiate fast-clicking listeners on the specificed layer.
 *
 * @constructor
 * @param {Element} layer The layer to listen on
 */
function FastClick(layer) {
    'use strict';
    var oldOnClick, self = this;


    /**
     * Whether a click is currently being tracked.
     *
     * @type boolean
     */
    this.trackingClick = false;


    /**
     * Timestamp for when when click tracking started.
     *
     * @type number
     */
    this.trackingClickStart = 0;


    /**
     * The element being tracked for a click.
     *
     * @type EventTarget
     */
    this.targetElement = null;


    /**
     * X-coordinate of touch start event.
     *
     * @type number
     */
    this.touchStartX = 0;


    /**
     * Y-coordinate of touch start event.
     *
     * @type number
     */
    this.touchStartY = 0;


    /**
     * ID of the last touch, retrieved from Touch.identifier.
     *
     * @type number
     */
    this.lastTouchIdentifier = 0;


    /**
     * Touchmove boundary, beyond which a click will be cancelled.
     *
     * @type number
     */
    this.touchBoundary = 10;


    /**
     * The FastClick layer.
     *
     * @type Element
     */
    this.layer = layer;

    if (!layer || !layer.nodeType) {
        throw new TypeError('Layer must be a document node');
    }

    /** @type function() */
    this.onClick = function() { return FastClick.prototype.onClick.apply(self, arguments); };

    /** @type function() */
    this.onMouse = function() { return FastClick.prototype.onMouse.apply(self, arguments); };

    /** @type function() */
    this.onTouchStart = function() { return FastClick.prototype.onTouchStart.apply(self, arguments); };

    /** @type function() */
    this.onTouchMove = function() { return FastClick.prototype.onTouchMove.apply(self, arguments); };

    /** @type function() */
    this.onTouchEnd = function() { return FastClick.prototype.onTouchEnd.apply(self, arguments); };

    /** @type function() */
    this.onTouchCancel = function() { return FastClick.prototype.onTouchCancel.apply(self, arguments); };

    if (FastClick.notNeeded(layer)) {
        return;
    }

    // Set up event handlers as required
    if (this.deviceIsAndroid) {
        layer.addEventListener('mouseover', this.onMouse, true);
        layer.addEventListener('mousedown', this.onMouse, true);
        layer.addEventListener('mouseup', this.onMouse, true);
    }

    layer.addEventListener('click', this.onClick, true);
    layer.addEventListener('touchstart', this.onTouchStart, false);
    layer.addEventListener('touchmove', this.onTouchMove, false);
    layer.addEventListener('touchend', this.onTouchEnd, false);
    layer.addEventListener('touchcancel', this.onTouchCancel, false);

    // Hack is required for browsers that don't support Event#stopImmediatePropagation (e.g. Android 2)
    // which is how FastClick normally stops click events bubbling to callbacks registered on the FastClick
    // layer when they are cancelled.
    if (!Event.prototype.stopImmediatePropagation) {
        layer.removeEventListener = function(type, callback, capture) {
            var rmv = Node.prototype.removeEventListener;
            if (type === 'click') {
                rmv.call(layer, type, callback.hijacked || callback, capture);
            } else {
                rmv.call(layer, type, callback, capture);
            }
        };

        layer.addEventListener = function(type, callback, capture) {
            var adv = Node.prototype.addEventListener;
            if (type === 'click') {
                adv.call(layer, type, callback.hijacked || (callback.hijacked = function(event) {
                    if (!event.propagationStopped) {
                        callback(event);
                    }
                }), capture);
            } else {
                adv.call(layer, type, callback, capture);
            }
        };
    }

    // If a handler is already declared in the element's onclick attribute, it will be fired before
    // FastClick's onClick handler. Fix this by pulling out the user-defined handler function and
    // adding it as listener.
    if (typeof layer.onclick === 'function') {

        // Android browser on at least 3.2 requires a new reference to the function in layer.onclick
        // - the old one won't work if passed to addEventListener directly.
        oldOnClick = layer.onclick;
        layer.addEventListener('click', function(event) {
            oldOnClick(event);
        }, false);
        layer.onclick = null;
    }
}


/**
 * Android requires exceptions.
 *
 * @type boolean
 */
FastClick.prototype.deviceIsAndroid = navigator.userAgent.indexOf('Android') > 0;


/**
 * iOS requires exceptions.
 *
 * @type boolean
 */
FastClick.prototype.deviceIsIOS = /iP(ad|hone|od)/.test(navigator.userAgent);


/**
 * iOS 4 requires an exception for select elements.
 *
 * @type boolean
 */
FastClick.prototype.deviceIsIOS4 = FastClick.prototype.deviceIsIOS && (/OS 4_\d(_\d)?/).test(navigator.userAgent);


/**
 * iOS 6.0(+?) requires the target element to be manually derived
 *
 * @type boolean
 */
FastClick.prototype.deviceIsIOSWithBadTarget = FastClick.prototype.deviceIsIOS && (/OS ([6-9]|\d{2})_\d/).test(navigator.userAgent);


/**
 * Determine whether a given element requires a native click.
 *
 * @param {EventTarget|Element} target Target DOM element
 * @returns {boolean} Returns true if the element needs a native click
 */
FastClick.prototype.needsClick = function(target) {
    'use strict';
    switch (target.nodeName.toLowerCase()) {

    // Don't send a synthetic click to disabled inputs (issue #62)
    case 'button':
    case 'select':
    case 'textarea':
        if (target.disabled) {
            return true;
        }

        break;
    case 'input':

        // File inputs need real clicks on iOS 6 due to a browser bug (issue #68)
        if ((this.deviceIsIOS && target.type === 'file') || target.disabled) {
            return true;
        }

        break;
    case 'label':
    case 'video':
        return true;
    }

    return (/\bneedsclick\b/).test(target.className);
};


/**
 * Determine whether a given element requires a call to focus to simulate click into element.
 *
 * @param {EventTarget|Element} target Target DOM element
 * @returns {boolean} Returns true if the element requires a call to focus to simulate native click.
 */
FastClick.prototype.needsFocus = function(target) {
    'use strict';
    switch (target.nodeName.toLowerCase()) {
    case 'textarea':
        return true;
    case 'select':
        return !this.deviceIsAndroid;
    case 'input':
        switch (target.type) {
        case 'button':
        case 'checkbox':
        case 'file':
        case 'image':
        case 'radio':
        case 'submit':
            return false;
        }

        // No point in attempting to focus disabled inputs
        return !target.disabled && !target.readOnly;
    default:
        return (/\bneedsfocus\b/).test(target.className);
    }
};


/**
 * Send a click event to the specified element.
 *
 * @param {EventTarget|Element} targetElement
 * @param {Event} event
 */
FastClick.prototype.sendClick = function(targetElement, event) {
    'use strict';
    var clickEvent, touch;

    // On some Android devices activeElement needs to be blurred otherwise the synthetic click will have no effect (#24)
    if (document.activeElement && document.activeElement !== targetElement) {
        document.activeElement.blur();
    }

    touch = event.changedTouches[0];

    // Synthesise a click event, with an extra attribute so it can be tracked
    clickEvent = document.createEvent('MouseEvents');
    clickEvent.initMouseEvent(this.determineEventType(targetElement), true, true, window, 1, touch.screenX, touch.screenY, touch.clientX, touch.clientY, false, false, false, false, 0, null);
    clickEvent.forwardedTouchEvent = true;
    targetElement.dispatchEvent(clickEvent);
};

FastClick.prototype.determineEventType = function(targetElement) {
    'use strict';

    //Issue #159: Android Chrome Select Box does not open with a synthetic click event
    if (this.deviceIsAndroid && targetElement.tagName.toLowerCase() === 'select') {
        return 'mousedown';
    }

    return 'click';
};


/**
 * @param {EventTarget|Element} targetElement
 */
FastClick.prototype.focus = function(targetElement) {
    'use strict';
    var length;

    // Issue #160: on iOS 7, some input elements (e.g. date datetime) throw a vague TypeError on setSelectionRange. These elements don't have an integer value for the selectionStart and selectionEnd properties, but unfortunately that can't be used for detection because accessing the properties also throws a TypeError. Just check the type instead. Filed as Apple bug #15122724.
    if (this.deviceIsIOS && targetElement.setSelectionRange && targetElement.type.indexOf('date') !== 0 && targetElement.type !== 'time') {
        length = targetElement.value.length;
        targetElement.setSelectionRange(length, length);
    } else {
        targetElement.focus();
    }
};


/**
 * Check whether the given target element is a child of a scrollable layer and if so, set a flag on it.
 *
 * @param {EventTarget|Element} targetElement
 */
FastClick.prototype.updateScrollParent = function(targetElement) {
    'use strict';
    var scrollParent, parentElement;

    scrollParent = targetElement.fastClickScrollParent;

    // Attempt to discover whether the target element is contained within a scrollable layer. Re-check if the
    // target element was moved to another parent.
    if (!scrollParent || !scrollParent.contains(targetElement)) {
        parentElement = targetElement;
        do {
            if (parentElement.scrollHeight > parentElement.offsetHeight) {
                scrollParent = parentElement;
                targetElement.fastClickScrollParent = parentElement;
                break;
            }

            parentElement = parentElement.parentElement;
        } while (parentElement);
    }

    // Always update the scroll top tracker if possible.
    if (scrollParent) {
        scrollParent.fastClickLastScrollTop = scrollParent.scrollTop;
    }
};


/**
 * @param {EventTarget} targetElement
 * @returns {Element|EventTarget}
 */
FastClick.prototype.getTargetElementFromEventTarget = function(eventTarget) {
    'use strict';

    // On some older browsers (notably Safari on iOS 4.1 - see issue #56) the event target may be a text node.
    if (eventTarget.nodeType === Node.TEXT_NODE) {
        return eventTarget.parentNode;
    }

    return eventTarget;
};


/**
 * On touch start, record the position and scroll offset.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchStart = function(event) {
    'use strict';
    var targetElement, touch, selection;

    // Ignore multiple touches, otherwise pinch-to-zoom is prevented if both fingers are on the FastClick element (issue #111).
    if (event.targetTouches.length > 1) {
        return true;
    }

    targetElement = this.getTargetElementFromEventTarget(event.target);
    touch = event.targetTouches[0];

    if (this.deviceIsIOS) {

        // Only trusted events will deselect text on iOS (issue #49)
        selection = window.getSelection();
        if (selection.rangeCount && !selection.isCollapsed) {
            return true;
        }

        if (!this.deviceIsIOS4) {

            // Weird things happen on iOS when an alert or confirm dialog is opened from a click event callback (issue #23):
            // when the user next taps anywhere else on the page, new touchstart and touchend events are dispatched
            // with the same identifier as the touch event that previously triggered the click that triggered the alert.
            // Sadly, there is an issue on iOS 4 that causes some normal touch events to have the same identifier as an
            // immediately preceeding touch event (issue #52), so this fix is unavailable on that platform.
            if (touch.identifier === this.lastTouchIdentifier) {
                event.preventDefault();
                return false;
            }

            this.lastTouchIdentifier = touch.identifier;

            // If the target element is a child of a scrollable layer (using -webkit-overflow-scrolling: touch) and:
            // 1) the user does a fling scroll on the scrollable layer
            // 2) the user stops the fling scroll with another tap
            // then the event.target of the last 'touchend' event will be the element that was under the user's finger
            // when the fling scroll was started, causing FastClick to send a click event to that layer - unless a check
            // is made to ensure that a parent layer was not scrolled before sending a synthetic click (issue #42).
            this.updateScrollParent(targetElement);
        }
    }

    this.trackingClick = true;
    this.trackingClickStart = event.timeStamp;
    this.targetElement = targetElement;

    this.touchStartX = touch.pageX;
    this.touchStartY = touch.pageY;

    // Prevent phantom clicks on fast double-tap (issue #36)
    if ((event.timeStamp - this.lastClickTime) < 200) {
        event.preventDefault();
    }

    return true;
};


/**
 * Based on a touchmove event object, check whether the touch has moved past a boundary since it started.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.touchHasMoved = function(event) {
    'use strict';
    var touch = event.changedTouches[0], boundary = this.touchBoundary;

    if (Math.abs(touch.pageX - this.touchStartX) > boundary || Math.abs(touch.pageY - this.touchStartY) > boundary) {
        return true;
    }

    return false;
};


/**
 * Update the last position.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchMove = function(event) {
    'use strict';
    if (!this.trackingClick) {
        return true;
    }

    // If the touch has moved, cancel the click tracking
    if (this.targetElement !== this.getTargetElementFromEventTarget(event.target) || this.touchHasMoved(event)) {
        this.trackingClick = false;
        this.targetElement = null;
    }

    return true;
};


/**
 * Attempt to find the labelled control for the given label element.
 *
 * @param {EventTarget|HTMLLabelElement} labelElement
 * @returns {Element|null}
 */
FastClick.prototype.findControl = function(labelElement) {
    'use strict';

    // Fast path for newer browsers supporting the HTML5 control attribute
    if (labelElement.control !== undefined) {
        return labelElement.control;
    }

    // All browsers under test that support touch events also support the HTML5 htmlFor attribute
    if (labelElement.htmlFor) {
        return document.getElementById(labelElement.htmlFor);
    }

    // If no for attribute exists, attempt to retrieve the first labellable descendant element
    // the list of which is defined here: http://www.w3.org/TR/html5/forms.html#category-label
    return labelElement.querySelector('button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea');
};


/**
 * On touch end, determine whether to send a click event at once.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchEnd = function(event) {
    'use strict';
    var forElement, trackingClickStart, targetTagName, scrollParent, touch, targetElement = this.targetElement;

    if (!this.trackingClick) {
        return true;
    }

    // Prevent phantom clicks on fast double-tap (issue #36)
    if ((event.timeStamp - this.lastClickTime) < 200) {
        this.cancelNextClick = true;
        return true;
    }

    // Reset to prevent wrong click cancel on input (issue #156).
    this.cancelNextClick = false;

    this.lastClickTime = event.timeStamp;

    trackingClickStart = this.trackingClickStart;
    this.trackingClick = false;
    this.trackingClickStart = 0;

    // On some iOS devices, the targetElement supplied with the event is invalid if the layer
    // is performing a transition or scroll, and has to be re-detected manually. Note that
    // for this to function correctly, it must be called *after* the event target is checked!
    // See issue #57; also filed as rdar://13048589 .
    if (this.deviceIsIOSWithBadTarget) {
        touch = event.changedTouches[0];

        // In certain cases arguments of elementFromPoint can be negative, so prevent setting targetElement to null
        targetElement = document.elementFromPoint(touch.pageX - window.pageXOffset, touch.pageY - window.pageYOffset) || targetElement;
        targetElement.fastClickScrollParent = this.targetElement.fastClickScrollParent;
    }

    targetTagName = targetElement.tagName.toLowerCase();
    if (targetTagName === 'label') {
        forElement = this.findControl(targetElement);
        if (forElement) {
            this.focus(targetElement);
            if (this.deviceIsAndroid) {
                return false;
            }

            targetElement = forElement;
        }
    } else if (this.needsFocus(targetElement)) {

        // Case 1: If the touch started a while ago (best guess is 100ms based on tests for issue #36) then focus will be triggered anyway. Return early and unset the target element reference so that the subsequent click will be allowed through.
        // Case 2: Without this exception for input elements tapped when the document is contained in an iframe, then any inputted text won't be visible even though the value attribute is updated as the user types (issue #37).
        if ((event.timeStamp - trackingClickStart) > 100 || (this.deviceIsIOS && window.top !== window && targetTagName === 'input')) {
            this.targetElement = null;
            return false;
        }

        this.focus(targetElement);

        // Select elements need the event to go through on iOS 4, otherwise the selector menu won't open.
        if (!this.deviceIsIOS4 || targetTagName !== 'select') {
            this.targetElement = null;
            event.preventDefault();
        }

        return false;
    }

    if (this.deviceIsIOS && !this.deviceIsIOS4) {

        // Don't send a synthetic click event if the target element is contained within a parent layer that was scrolled
        // and this tap is being used to stop the scrolling (usually initiated by a fling - issue #42).
        scrollParent = targetElement.fastClickScrollParent;
        if (scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop) {
            return true;
        }
    }

    // Prevent the actual click from going though - unless the target node is marked as requiring
    // real clicks or if it is in the whitelist in which case only non-programmatic clicks are permitted.
    if (!this.needsClick(targetElement)) {
        event.preventDefault();
        this.sendClick(targetElement, event);
    }

    return false;
};


/**
 * On touch cancel, stop tracking the click.
 *
 * @returns {void}
 */
FastClick.prototype.onTouchCancel = function() {
    'use strict';
    this.trackingClick = false;
    this.targetElement = null;
};


/**
 * Determine mouse events which should be permitted.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onMouse = function(event) {
    'use strict';

    // If a target element was never set (because a touch event was never fired) allow the event
    if (!this.targetElement) {
        return true;
    }

    if (event.forwardedTouchEvent) {
        return true;
    }

    // Programmatically generated events targeting a specific element should be permitted
    if (!event.cancelable) {
        return true;
    }

    // Derive and check the target element to see whether the mouse event needs to be permitted;
    // unless explicitly enabled, prevent non-touch click events from triggering actions,
    // to prevent ghost/doubleclicks.
    if (!this.needsClick(this.targetElement) || this.cancelNextClick) {

        // Prevent any user-added listeners declared on FastClick element from being fired.
        if (event.stopImmediatePropagation) {
            event.stopImmediatePropagation();
        } else {

            // Part of the hack for browsers that don't support Event#stopImmediatePropagation (e.g. Android 2)
            event.propagationStopped = true;
        }

        // Cancel the event
        event.stopPropagation();
        event.preventDefault();

        return false;
    }

    // If the mouse event is permitted, return true for the action to go through.
    return true;
};


/**
 * On actual clicks, determine whether this is a touch-generated click, a click action occurring
 * naturally after a delay after a touch (which needs to be cancelled to avoid duplication), or
 * an actual click which should be permitted.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onClick = function(event) {
    'use strict';
    var permitted;

    // It's possible for another FastClick-like library delivered with third-party code to fire a click event before FastClick does (issue #44). In that case, set the click-tracking flag back to false and return early. This will cause onTouchEnd to return early.
    if (this.trackingClick) {
        this.targetElement = null;
        this.trackingClick = false;
        return true;
    }

    // Very odd behaviour on iOS (issue #18): if a submit element is present inside a form and the user hits enter in the iOS simulator or clicks the Go button on the pop-up OS keyboard the a kind of 'fake' click event will be triggered with the submit-type input element as the target.
    if (event.target.type === 'submit' && event.detail === 0) {
        return true;
    }

    permitted = this.onMouse(event);

    // Only unset targetElement if the click is not permitted. This will ensure that the check for !targetElement in onMouse fails and the browser's click doesn't go through.
    if (!permitted) {
        this.targetElement = null;
    }

    // If clicks are permitted, return true for the action to go through.
    return permitted;
};


/**
 * Remove all FastClick's event listeners.
 *
 * @returns {void}
 */
FastClick.prototype.destroy = function() {
    'use strict';
    var layer = this.layer;

    if (this.deviceIsAndroid) {
        layer.removeEventListener('mouseover', this.onMouse, true);
        layer.removeEventListener('mousedown', this.onMouse, true);
        layer.removeEventListener('mouseup', this.onMouse, true);
    }

    layer.removeEventListener('click', this.onClick, true);
    layer.removeEventListener('touchstart', this.onTouchStart, false);
    layer.removeEventListener('touchmove', this.onTouchMove, false);
    layer.removeEventListener('touchend', this.onTouchEnd, false);
    layer.removeEventListener('touchcancel', this.onTouchCancel, false);
};


/**
 * Check whether FastClick is needed.
 *
 * @param {Element} layer The layer to listen on
 */
FastClick.notNeeded = function(layer) {
    'use strict';
    var metaViewport;

    // Devices that don't support touch don't need FastClick
    if (typeof window.ontouchstart === 'undefined') {
        return true;
    }

    if ((/Chrome\/[0-9]+/).test(navigator.userAgent)) {

        // Chrome on Android with user-scalable="no" doesn't need FastClick (issue #89)
        if (FastClick.prototype.deviceIsAndroid) {
            metaViewport = document.querySelector('meta[name=viewport]');
            if (metaViewport && metaViewport.content.indexOf('user-scalable=no') !== -1) {
                return true;
            }

        // Chrome desktop doesn't need FastClick (issue #15)
        } else {
            return true;
        }
    }

    // IE10 with -ms-touch-action: none, which disables double-tap-to-zoom (issue #97)
    if (layer.style.msTouchAction === 'none') {
        return true;
    }

    return false;
};


/**
 * Factory method for creating a FastClick object
 *
 * @param {Element} layer The layer to listen on
 */
FastClick.attach = function(layer) {
    'use strict';
    return new FastClick(layer);
};

var event = $.event.special.pointerclick = {
        setup : function() {
            $(this).on('click', event.handler);
        },

        teardown : function() {
            $(this).off('click', event.handler);
        },

        handler : function(e) {
            if(!e.button) {
                e.type = 'pointerclick';
                $.event.dispatch.apply(this, arguments);
                e.type = 'click';
            }
        }
    };

$(function() {
    FastClick.attach(document.body);
    provide($);
});

});

/* end: ../../libs/bem-core/common.blocks/jquery/__event/_type/jquery__event_type_pointerclick.js */
/* begin: ../../libs/bem-core/common.blocks/jquery/__event/_type/jquery__event_type_pointernative.js */
/*!
 * Basic pointer events polyfill
 */
;(function(global, factory) {

if(typeof modules === 'object' && modules.isDefined('jquery')) {
    modules.define('jquery', function(provide, $) {
        factory(this.global, $);
        provide($);
    });
} else if(typeof jQuery === 'function') {
    factory(global, jQuery);
}

}(this, function(window, $) {

// include "jquery-pointerevents.js"
/*!
 * Most of source code is taken from PointerEvents Polyfill
 * written by Polymer Team (https://github.com/Polymer/PointerEvents)
 * and licensed under the BSD License.
 */

var doc = document,
    USE_NATIVE_MAP = window.Map && window.Map.prototype.forEach,
    HAS_BITMAP_TYPE = window.MSPointerEvent && typeof window.MSPointerEvent.MSPOINTER_TYPE_MOUSE === 'number',
    POINTERS_FN = function() { return this.size },
    jqEvent = $.event;

// NOTE: Remove jQuery special fixes for pointerevents – we fix them ourself
delete jqEvent.special.pointerenter;
delete jqEvent.special.pointerleave;

/*!
 * Returns a snapshot of inEvent, with writable properties.
 *
 * @param {Event} event An event that contains properties to copy.
 * @returns {Object} An object containing shallow copies of `inEvent`'s
 *    properties.
 */
function cloneEvent(event) {
    var eventCopy = $.extend(new $.Event(), event);
    if(event.preventDefault) {
        eventCopy.preventDefault = function() {
            event.preventDefault();
        };
    }
    return eventCopy;
}

/*!
 * Dispatches the event to the target, taking event's bubbling into account.
 */
function dispatchEvent(event, target) {
    return event.bubbles?
        jqEvent.trigger(event, null, target) :
        jqEvent.dispatch.call(target, event);
}

var MOUSE_PROPS = {
        bubbles : false,
        cancelable : false,
        view : null,
        detail : null,
        screenX : 0,
        screenY : 0,
        clientX : 0,
        clientY : 0,
        ctrlKey : false,
        altKey : false,
        shiftKey : false,
        metaKey : false,
        button : 0,
        relatedTarget : null,
        pageX : 0,
        pageY : 0
    },
    mouseProps = Object.keys(MOUSE_PROPS),
    mousePropsLen = mouseProps.length,
    mouseDefaults = mouseProps.map(function(prop) { return MOUSE_PROPS[prop] });

/*!
 * Pointer event constructor
 *
 * @param {String} type
 * @param {Object} [params]
 * @returns {Event}
 * @constructor
 */
function PointerEvent(type, params) {
    params || (params = {});

    var e = $.Event(type);

    // define inherited MouseEvent properties
    for(var i = 0, p; i < mousePropsLen; i++) {
        p = mouseProps[i];
        e[p] = params[p] || mouseDefaults[i];
    }

    e.buttons = params.buttons || 0;

    // add x/y properties aliased to clientX/Y
    e.x = e.clientX;
    e.y = e.clientY;

    // Spec requires that pointers without pressure specified use 0.5 for down
    // state and 0 for up state.
    var pressure = 0;
    if(params.pressure) {
        pressure = params.pressure;
    } else {
        pressure = e.buttons? 0.5 : 0;
    }

    // define the properties of the PointerEvent interface
    e.pointerId = params.pointerId || 0;
    e.width = params.width || 0;
    e.height = params.height || 0;
    e.pressure = pressure;
    e.tiltX = params.tiltX || 0;
    e.tiltY = params.tiltY || 0;
    e.pointerType = params.pointerType || '';
    e.hwTimestamp = params.hwTimestamp || 0;
    e.isPrimary = params.isPrimary || false;

    // add some common jQuery properties
    e.which = typeof params.which === 'undefined'? 1 : params.which;

    return e;
}

/*!
 * Implements a map of pointer states
 * @returns {PointerMap}
 * @constructor
 */
function PointerMap() {
    if(USE_NATIVE_MAP) {
        var m = new Map();
        m.pointers = POINTERS_FN;
        return m;
    }

    this.keys = [];
    this.values = [];
}

PointerMap.prototype = {
    set : function(id, event) {
        var i = this.keys.indexOf(id);
        if(i > -1) {
            this.values[i] = event;
        } else {
            this.keys.push(id);
            this.values.push(event);
        }
    },

    has : function(id) {
        return this.keys.indexOf(id) > -1;
    },

    'delete' : function(id) {
        var i = this.keys.indexOf(id);
        if(i > -1) {
            this.keys.splice(i, 1);
            this.values.splice(i, 1);
        }
    },

    get : function(id) {
        var i = this.keys.indexOf(id);
        return this.values[i];
    },

    clear : function() {
        this.keys.length = 0;
        this.values.length = 0;
    },

    forEach : function(callback, ctx) {
        var keys = this.keys;
        this.values.forEach(function(v, i) {
            callback.call(ctx, v, keys[i], this);
        }, this);
    },

    pointers : function() {
        return this.keys.length;
    }
};

var pointermap = new PointerMap();

var dispatcher = {
    eventMap : {},
    eventSourceList : [],

    /*!
     * Add a new event source that will generate pointer events
     */
    registerSource : function(name, source) {
        var newEvents = source.events;
        if(newEvents) {
            newEvents.forEach(function(e) {
                source[e] && (this.eventMap[e] = function() { source[e].apply(source, arguments) });
            }, this);
            this.eventSourceList.push(source);
        }
    },

    register : function(element) {
        var len = this.eventSourceList.length;
        for(var i = 0, es; (i < len) && (es = this.eventSourceList[i]); i++) {
            // call eventsource register
            es.register.call(es, element);
        }
    },

    unregister : function(element) {
        var l = this.eventSourceList.length;
        for(var i = 0, es; (i < l) && (es = this.eventSourceList[i]); i++) {
            // call eventsource register
            es.unregister.call(es, element);
        }
    },

    down : function(event) {
        event.bubbles = true;
        this.fireEvent('pointerdown', event);
    },

    move : function(event) {
        event.bubbles = true;
        this.fireEvent('pointermove', event);
    },

    up : function(event) {
        event.bubbles = true;
        this.fireEvent('pointerup', event);
    },

    enter : function(event) {
        event.bubbles = false;
        this.fireEvent('pointerenter', event);
    },

    leave : function(event) {
        event.bubbles = false;
        this.fireEvent('pointerleave', event);
    },

    over : function(event) {
        event.bubbles = true;
        this.fireEvent('pointerover', event);
    },

    out : function(event) {
        event.bubbles = true;
        this.fireEvent('pointerout', event);
    },

    cancel : function(event) {
        event.bubbles = true;
        this.fireEvent('pointercancel', event);
    },

    leaveOut : function(event) {
        this.out(event);
        this.enterLeave(event, this.leave);
    },

    enterOver : function(event) {
        this.over(event);
        this.enterLeave(event, this.enter);
    },

    enterLeave : function(event, fn) {
        var target = event.target,
            relatedTarget = event.relatedTarget;

        if(!this.contains(target, relatedTarget)) {
            while(target && target !== relatedTarget) {
                event.target = target;
                fn.call(this, event);

                target = target.parentNode;
            }
        }
    },

    contains : function(target, relatedTarget) {
        return target === relatedTarget || $.contains(target, relatedTarget);
    },

    // LISTENER LOGIC
    eventHandler : function(e) {
        // This is used to prevent multiple dispatch of pointerevents from
        // platform events. This can happen when two elements in different scopes
        // are set up to create pointer events, which is relevant to Shadow DOM.
        if(e._handledByPE) {
            return;
        }

        var type = e.type, fn;
        (fn = this.eventMap && this.eventMap[type]) && fn(e);

        e._handledByPE = true;
    },

    /*!
     * Sets up event listeners
     */
    listen : function(target, events) {
        events.forEach(function(e) {
            this.addEvent(target, e);
        }, this);
    },

    /*!
     * Removes event listeners
     */
    unlisten : function(target, events) {
        events.forEach(function(e) {
            this.removeEvent(target, e);
        }, this);
    },

    addEvent : function(target, eventName) {
        $(target).on(eventName, boundHandler);
    },

    removeEvent : function(target, eventName) {
        $(target).off(eventName, boundHandler);
    },

    getTarget : function(event) {
        return event._target;
    },

    /*!
     * Creates a new Event of type `type`, based on the information in `event`
     */
    makeEvent : function(type, event) {
        var e = new PointerEvent(type, event);
        if(event.preventDefault) {
            e.preventDefault = event.preventDefault;
        }

        e._target = e._target || event.target;

        return e;
    },

    /*!
     * Dispatches the event to its target
     */
    dispatchEvent : function(event) {
        var target = this.getTarget(event);
        if(target) {
            if(!event.target) {
                event.target = target;
            }

            return dispatchEvent(event, target);
        }
    },

    /*!
     * Makes and dispatch an event in one call
     */
    fireEvent : function(type, event) {
        var e = this.makeEvent(type, event);
        return this.dispatchEvent(e);
    }
};

function boundHandler() {
    dispatcher.eventHandler.apply(dispatcher, arguments);
}

var CLICK_COUNT_TIMEOUT = 200,
    // Radius around touchend that swallows mouse events
    MOUSE_DEDUP_DIST = 25,
    MOUSE_POINTER_ID = 1,
    // This should be long enough to ignore compat mouse events made by touch
    TOUCH_DEDUP_TIMEOUT = 2500,
    // A distance for which touchmove should fire pointercancel event
    TOUCHMOVE_HYSTERESIS = 20;

// handler block for native mouse events
var mouseEvents = {
    POINTER_TYPE : 'mouse',
    events : [
        'mousedown',
        'mousemove',
        'mouseup',
        'mouseover',
        'mouseout'
    ],

    register : function(target) {
        dispatcher.listen(target, this.events);
    },

    unregister : function(target) {
        dispatcher.unlisten(target, this.events);
    },

    lastTouches : [],

    // collide with the global mouse listener
    isEventSimulatedFromTouch : function(event) {
        var lts = this.lastTouches,
            x = event.clientX,
            y = event.clientY;

        for(var i = 0, l = lts.length, t; i < l && (t = lts[i]); i++) {
            // simulated mouse events will be swallowed near a primary touchend
            var dx = Math.abs(x - t.x), dy = Math.abs(y - t.y);
            if(dx <= MOUSE_DEDUP_DIST && dy <= MOUSE_DEDUP_DIST) {
                return true;
            }
        }
    },

    prepareEvent : function(event) {
        var e = cloneEvent(event);
        e.pointerId = MOUSE_POINTER_ID;
        e.isPrimary = true;
        e.pointerType = this.POINTER_TYPE;
        return e;
    },

    mousedown : function(event) {
        if(!this.isEventSimulatedFromTouch(event)) {
            if(pointermap.has(MOUSE_POINTER_ID)) {
                // http://crbug/149091
                this.cancel(event);
            }

            pointermap.set(MOUSE_POINTER_ID, event);

            var e = this.prepareEvent(event);
            dispatcher.down(e);
        }
    },

    mousemove : function(event) {
        if(!this.isEventSimulatedFromTouch(event)) {
            var e = this.prepareEvent(event);
            dispatcher.move(e);
        }
    },

    mouseup : function(event) {
        if(!this.isEventSimulatedFromTouch(event)) {
            var p = pointermap.get(MOUSE_POINTER_ID);
            if(p && p.button === event.button) {
                var e = this.prepareEvent(event);
                dispatcher.up(e);
                this.cleanupMouse();
            }
        }
    },

    mouseover : function(event) {
        if(!this.isEventSimulatedFromTouch(event)) {
            var e = this.prepareEvent(event);
            dispatcher.enterOver(e);
        }
    },

    mouseout : function(event) {
        if(!this.isEventSimulatedFromTouch(event)) {
            var e = this.prepareEvent(event);
            dispatcher.leaveOut(e);
        }
    },

    cancel : function(inEvent) {
        var e = this.prepareEvent(inEvent);
        dispatcher.cancel(e);
        this.cleanupMouse();
    },

    cleanupMouse : function() {
        pointermap['delete'](MOUSE_POINTER_ID);
    }
};

var touchEvents = {
    events : [
        'touchstart',
        'touchmove',
        'touchend',
        'touchcancel'
    ],

    register : function(target) {
        dispatcher.listen(target, this.events);
    },

    unregister : function(target) {
        dispatcher.unlisten(target, this.events);
    },

    POINTER_TYPE : 'touch',
    clickCount : 0,
    resetId : null,
    firstTouch : null,

    isPrimaryTouch : function(touch) {
        return this.firstTouch === touch.identifier;
    },

    /*!
     * Sets primary touch if there no pointers, or the only pointer is the mouse
     */
    setPrimaryTouch : function(touch) {
        if(pointermap.pointers() === 0 ||
                (pointermap.pointers() === 1 && pointermap.has(MOUSE_POINTER_ID))) {
            this.firstTouch = touch.identifier;
            this.firstXY = { X : touch.clientX, Y : touch.clientY };
            this.scrolling = null;

            this.cancelResetClickCount();
        }
    },

    removePrimaryPointer : function(pointer) {
        if(pointer.isPrimary) {
            this.firstTouch = null;
            // TODO(@narqo): It seems that, flushing `firstXY` flag explicitly in `touchmove` handler is enough.
            // Original code from polymer doing `this.firstXY = null` on every `removePrimaryPointer` call, but looks
            // like it is harmful in some of our usecases.
            this.resetClickCount();
        }
    },

    resetClickCount : function() {
        var _this = this;
        this.resetId = setTimeout(function() {
            _this.clickCount = 0;
            _this.resetId = null;
        }, CLICK_COUNT_TIMEOUT);
    },

    cancelResetClickCount : function() {
        this.resetId && clearTimeout(this.resetId);
    },

    typeToButtons : function(type) {
        return type === 'touchstart' || type === 'touchmove'? 1 : 0;
    },

    findTarget : function(event) {
        // Currently we don't interested in shadow dom handling
        return doc.elementFromPoint(event.clientX, event.clientY);
    },

    touchToPointer : function(touch) {
        var cte = this.currentTouchEvent,
            e = cloneEvent(touch);

        // Spec specifies that pointerId 1 is reserved for Mouse.
        // Touch identifiers can start at 0.
        // Add 2 to the touch identifier for compatibility.
        e.pointerId = touch.identifier + 2;
        e.target = this.findTarget(e);
        e.bubbles = true;
        e.cancelable = true;
        e.detail = this.clickCount;
        e.button = 0;
        e.buttons = this.typeToButtons(cte.type);
        e.width = touch.webkitRadiusX || touch.radiusX || 0;
        e.height = touch.webkitRadiusY || touch.radiusY || 0;
        e.pressure = touch.mozPressure || touch.webkitForce || touch.force || 0.5;
        e.isPrimary = this.isPrimaryTouch(touch);
        e.pointerType = this.POINTER_TYPE;

        // forward touch preventDefaults
        var _this = this;
        e.preventDefault = function() {
            _this.scrolling = false;
            _this.firstXY = null;
            cte.preventDefault();
        };

        return e;
    },

    processTouches : function(event, fn) {
        var tl = event.originalEvent.changedTouches;
        this.currentTouchEvent = event;
        for(var i = 0, t; i < tl.length; i++) {
            t = tl[i];
            fn.call(this, this.touchToPointer(t));
        }
    },

    shouldScroll : function(touchEvent) {
        // return "true" for things to be much easier
        return true;
    },

    findTouch : function(touches, pointerId) {
        for(var i = 0, l = touches.length, t; i < l && (t = touches[i]); i++) {
            if(t.identifier === pointerId) {
                return true;
            }
        }
    },

    /*!
     * In some instances, a touchstart can happen without a touchend.
     * This leaves the pointermap in a broken state.
     * Therefore, on every touchstart, we remove the touches
     * that did not fire a touchend event.
     *
     * To keep state globally consistent, we fire a pointercancel
     * for this "abandoned" touch
     */
    vacuumTouches : function(touchEvent) {
        var touches = touchEvent.touches;
        // pointermap.pointers() should be less than length of touches here, as the touchstart has not
        // been processed yet.
        if(pointermap.pointers() >= touches.length) {
            var d = [];

            pointermap.forEach(function(pointer, pointerId) {
                // Never remove pointerId == 1, which is mouse.
                // Touch identifiers are 2 smaller than their pointerId, which is the
                // index in pointermap.
                if(pointerId === MOUSE_POINTER_ID || this.findTouch(touches, pointerId - 2)) return;
                d.push(pointer.outEvent);
            }, this);

            d.forEach(this.cancelOut, this);
        }
    },

    /*!
     * Prevents synth mouse events from creating pointer events
     */
    dedupSynthMouse : function(touchEvent) {
        var lts = mouseEvents.lastTouches,
            t = touchEvent.changedTouches[0];

        // only the primary finger will synth mouse events
        if(this.isPrimaryTouch(t)) {
            // remember x/y of last touch
            var lt = { x : t.clientX, y : t.clientY };
            lts.push(lt);

            setTimeout(function() {
                var i = lts.indexOf(lt);
                i > -1 && lts.splice(i, 1);
            }, TOUCH_DEDUP_TIMEOUT);
        }
    },

    touchstart : function(event) {
        var touchEvent = event.originalEvent;

        this.vacuumTouches(touchEvent);
        this.setPrimaryTouch(touchEvent.changedTouches[0]);
        this.dedupSynthMouse(touchEvent);

        if(!this.scrolling) {
            this.clickCount++;
            this.processTouches(event, this.overDown);
        }
    },

    touchmove : function(event) {
        var touchEvent = event.originalEvent;
        if(!this.scrolling) {
            if(this.scrolling === null && this.shouldScroll(touchEvent)) {
                this.scrolling = true;
            } else {
                event.preventDefault();
                this.processTouches(event, this.moveOverOut);
            }
        } else if(this.firstXY) {
            var firstXY = this.firstXY,
                touch = touchEvent.changedTouches[0],
                dx = touch.clientX - firstXY.X,
                dy = touch.clientY - firstXY.Y,
                dd = Math.sqrt(dx * dx + dy * dy);
            if(dd >= TOUCHMOVE_HYSTERESIS) {
                this.touchcancel(event);
                this.scrolling = true;
                this.firstXY = null;
            }
        }
    },

    touchend : function(event) {
        var touchEvent = event.originalEvent;
        this.dedupSynthMouse(touchEvent);
        this.processTouches(event, this.upOut);
    },

    touchcancel : function(event) {
        this.processTouches(event, this.cancelOut);
    },

    overDown : function(pEvent) {
        var target = pEvent.target;
        pointermap.set(pEvent.pointerId, {
            target : target,
            outTarget : target,
            outEvent : pEvent
        });
        dispatcher.over(pEvent);
        dispatcher.enter(pEvent);
        dispatcher.down(pEvent);
    },

    moveOverOut : function(pEvent) {
        var pointer = pointermap.get(pEvent.pointerId);

        // a finger drifted off the screen, ignore it
        if(!pointer) {
            return;
        }

        dispatcher.move(pEvent);

        var outEvent = pointer.outEvent,
            outTarget = pointer.outTarget;

        if(outEvent && outTarget !== pEvent.target) {
            pEvent.relatedTarget = outTarget;
            outEvent.relatedTarget = pEvent.target;
            // recover from retargeting by shadow
            outEvent.target = outTarget;

            if(pEvent.target) {
                dispatcher.leaveOut(outEvent);
                dispatcher.enterOver(pEvent);
            } else {
                // clean up case when finger leaves the screen
                pEvent.target = outTarget;
                pEvent.relatedTarget = null;
                this.cancelOut(pEvent);
            }
        }

        pointer.outEvent = pEvent;
        pointer.outTarget = pEvent.target;
    },

    upOut : function(pEvent) {
        dispatcher.up(pEvent);
        dispatcher.out(pEvent);
        dispatcher.leave(pEvent);

        this.cleanUpPointer(pEvent);
    },

    cancelOut : function(pEvent) {
        dispatcher.cancel(pEvent);
        dispatcher.out(pEvent);
        dispatcher.leave(pEvent);
        this.cleanUpPointer(pEvent);
    },

    cleanUpPointer : function(pEvent) {
        pointermap['delete'](pEvent.pointerId);
        this.removePrimaryPointer(pEvent);
    }
};

var msEvents = {
    events : [
        'MSPointerDown',
        'MSPointerMove',
        'MSPointerUp',
        'MSPointerOut',
        'MSPointerOver',
        'MSPointerCancel'
    ],

    register : function(target) {
        dispatcher.listen(target, this.events);
    },

    unregister : function(target) {
        dispatcher.unlisten(target, this.events);
    },

    POINTER_TYPES : [
        '',
        'unavailable',
        'touch',
        'pen',
        'mouse'
    ],

    prepareEvent : function(event) {
        var e = cloneEvent(event);
        HAS_BITMAP_TYPE && (e.pointerType = this.POINTER_TYPES[event.pointerType]);
        return e;
    },

    MSPointerDown : function(event) {
        pointermap.set(event.pointerId, event);
        var e = this.prepareEvent(event);
        dispatcher.down(e);
    },

    MSPointerMove : function(event) {
        var e = this.prepareEvent(event);
        dispatcher.move(e);
    },

    MSPointerUp : function(event) {
        var e = this.prepareEvent(event);
        dispatcher.up(e);
        this.cleanup(event.pointerId);
    },

    MSPointerOut : function(event) {
        var e = this.prepareEvent(event);
        dispatcher.leaveOut(e);
    },

    MSPointerOver : function(event) {
        var e = this.prepareEvent(event);
        dispatcher.enterOver(e);
    },

    MSPointerCancel : function(event) {
        var e = this.prepareEvent(event);
        dispatcher.cancel(e);
        this.cleanup(event.pointerId);
    },

    cleanup : function(id) {
        pointermap['delete'](id);
    }
};

var navigator = window.navigator;
if(navigator.msPointerEnabled) {
    dispatcher.registerSource('ms', msEvents);
} else {
    dispatcher.registerSource('mouse', mouseEvents);
    if(typeof window.ontouchstart !== 'undefined') {
        dispatcher.registerSource('touch', touchEvents);
    }
}

dispatcher.register(doc);

}));

/* end: ../../libs/bem-core/common.blocks/jquery/__event/_type/jquery__event_type_pointernative.js */
/* begin: ../../libs/bem-core/common.blocks/keyboard/__codes/keyboard__codes.js */
/**
 * @module keyboard__codes
 */
modules.define('keyboard__codes', function(provide) {

provide(/** @exports */{
    BACKSPACE : 8,
    TAB : 9,
    ENTER : 13,
    CAPS_LOCK : 20,
    ESC : 27,
    SPACE : 32,
    PAGE_UP : 33,
    PAGE_DOWN : 34,
    END : 35,
    HOME : 36,
    LEFT : 37,
    UP : 38,
    RIGHT : 39,
    DOWN : 40,
    INSERT : 41,
    DELETE : 42
});

});

/* end: ../../libs/bem-core/common.blocks/keyboard/__codes/keyboard__codes.js */
/* begin: ../../libs/bem-components/common.blocks/control/control.js */
/**
 * @module control
 */

modules.define(
    'control',
    ['i-bem__dom', 'dom', 'next-tick'],
    function(provide, BEMDOM, dom, nextTick) {

/**
 * @exports
 * @class control
 * @abstract
 * @bem
 */
provide(BEMDOM.decl(this.name, /** @lends control.prototype */{
    beforeSetMod : {
        'focused' : {
            'true' : function() {
                return !this.hasMod('disabled');
            }
        }
    },

    onSetMod : {
        'js' : {
            'inited' : function() {
                this._focused = dom.containsFocus(this.elem('control'));
                this._focused?
                    // if control is already in focus, we need to force _onFocus
                    this._onFocus() :
                    // if block already has focused mod, we need to focus control
                    this.hasMod('focused') && this._focus();

                this._tabIndex = this.elem('control').attr('tabindex');
                if(this.hasMod('disabled') && this._tabIndex !== 'undefined')
                    this.elem('control').removeAttr('tabindex');
            }
        },

        'focused' : {
            'true' : function() {
                this._focused || this._focus();
            },

            '' : function() {
                this._focused && this._blur();
            }
        },

        'disabled' : {
            '*' : function(modName, modVal) {
                this.elem('control').prop(modName, !!modVal);
            },

            'true' : function() {
                this.delMod('focused');
                typeof this._tabIndex !== 'undefined' &&
                    this.elem('control').removeAttr('tabindex');
            },

            '' : function() {
                typeof this._tabIndex !== 'undefined' &&
                    this.elem('control').attr('tabindex', this._tabIndex);
            }
        }
    },

    /**
     * Returns name of control
     * @returns {String}
     */
    getName : function() {
        return this.elem('control').attr('name') || '';
    },

    /**
     * Returns control value
     * @returns {String}
     */
    getVal : function() {
        return this.elem('control').val();
    },

    _onFocus : function() {
        this._focused = true;
        this.setMod('focused');
    },

    _onBlur : function() {
        this._focused = false;
        this.delMod('focused');
    },

    _focus : function() {
        dom.isFocusable(this.elem('control')) && this.elem('control').focus();
    },

    _blur : function() {
        this.elem('control').blur();
    }
}, /** @lends control */{
    live : function() {
        this
            .liveBindTo('control', 'focusin', this.prototype._onFocus)
            .liveBindTo('control', 'focusout', this.prototype._onBlur);

        var focused = dom.getFocused();
        if(focused.hasClass(this.buildClass('control'))) {
            var _this = this; // TODO: https://github.com/bem/bem-core/issues/425
            nextTick(function() {
                if(focused[0] === dom.getFocused()[0]) {
                    var block = focused.closest(_this.buildSelector());
                    block && block.bem(_this.getName());
                }
            });
        }
    }
}));

});

/* end: ../../libs/bem-components/common.blocks/control/control.js */
/* begin: ../../libs/bem-components/desktop.blocks/control/control.js */
/** @module control */

modules.define(
    'control',
    function(provide, Control) {

provide(Control.decl({
    beforeSetMod : {
        'hovered' : {
            'true' : function() {
                return !this.hasMod('disabled');
            }
        }
    },

    onSetMod : {
        'disabled' : {
            'true' : function() {
                this.__base.apply(this, arguments);
                this.delMod('hovered');
            }
        },

        'hovered' : {
            'true' : function() {
                this.bindTo('mouseleave', this._onMouseLeave);
            },

            '' : function() {
                this.unbindFrom('mouseleave', this._onMouseLeave);
            }
        }
    },

    _onMouseOver : function() {
        this.setMod('hovered');
    },

    _onMouseLeave : function() {
        this.delMod('hovered');
    }
}, {
    live : function() {
        return this
            .liveBindTo('mouseover', this.prototype._onMouseOver)
            .__base.apply(this, arguments);
    }
}));

});

/* end: ../../libs/bem-components/desktop.blocks/control/control.js */
/* begin: ../../libs/bem-components/common.blocks/input/input.js */
/**
 * @module input
 */

modules.define('input', ['i-bem__dom', 'control'], function(provide, BEMDOM, Control) {

/**
 * @exports
 * @class input
 * @augments control
 * @bem
 */
provide(BEMDOM.decl({ block : this.name, baseBlock : Control }, /** @lends input.prototype */{
    onSetMod : {
        'js' : {
            'inited' : function() {
                this.__base.apply(this, arguments);
                this._val = this.elem('control').val();
            }
        }
    },

    /**
     * Returns control value
     * @returns {String}
     * @override
     */
    getVal : function() {
        return this._val;
    },

    /**
     * Sets control value
     * @param {String} val value
     * @param {Object} [data] additional data
     * @returns {input} this
     */
    setVal : function(val, data) {
        val = String(val);

        if(this._val !== val) {
            this._val = val;

            var control = this.elem('control');
            control.val() !== val && control.val(val);

            this.emit('change', data);
        }

        return this;
    }
}, /** @lends input */{
    live : function() {
        this.__base.apply(this, arguments);
        return false;
    }
}));

});

/* end: ../../libs/bem-components/common.blocks/input/input.js */
/* begin: ../../libs/bem-components/desktop.blocks/input/input.js */
/**
 * @module input
 */

modules.define('input', ['tick', 'idle'], function(provide, tick, idle, Input) {

var instances = [],
    boundToTick,
    bindToTick = function() {
        boundToTick = true;
        tick
            .on('tick', update)
            .start();
        idle
            .on({
                idle : function() {
                    tick.un('tick', update);
                },
                wakeup : function() {
                    tick.on('tick', update);
                }
            })
            .start();
    },
    update = function() {
        var instance, i = 0;
        while(instance = instances[i++]) {
            instance.setVal(instance.elem('control').val());
        }
    };

/**
 * @exports
 * @class input
 * @bem
 */
provide(Input.decl( /** @lends input.prototype */{
    onSetMod : {
        'js' : {
            'inited' : function() {
                this.__base.apply(this, arguments);

                boundToTick || bindToTick();

                // сохраняем индекс в массиве инстансов чтобы потом быстро из него удалять
                this._instanceIndex = instances.push(this) - 1;
            },

            '' : function() {
                this.__base.apply(this, arguments);

                // удаляем из общего массива instances
                instances.splice(this._instanceIndex, 1);
                // понижаем _instanceIndex всем тем кто был добавлен в instances после нас
                var i = this._instanceIndex, instance;
                while(instance = instances[i++]) --instance._instanceIndex;
            }
        }
    },

    /**
     * Нормализация установки фокуса для IE
     * @private
     * @override
     */
    _focus : function() {
        var input = this.elem('control')[0];
        if(input.createTextRange && !input.selectionStart) {
            var range = input.createTextRange();
            range.move('character', input.value.length);
            range.select();
        } else {
            input.focus();
        }
    }
}));

});

/* end: ../../libs/bem-components/desktop.blocks/input/input.js */
/* begin: ../../libs/bem-core/common.blocks/idle/idle.js */
/**
 * @module idle
 */

modules.define('idle', ['inherit', 'events', 'jquery'], function(provide, inherit, events, $) {

var IDLE_TIMEOUT = 3000,
    USER_EVENTS = 'mousemove keydown click',
    /**
     * @class Idle
     * @augments events:Emitter
     */
    Idle = inherit(events.Emitter, /** @lends Idle.prototype */{
        /**
         * @constructor
         */
        __constructor : function() {
            this._timer = null;
            this._isStarted = false;
            this._isIdle = false;
        },

        /**
         * Starts monitoring of idle state
         */
        start : function() {
            if(!this._isStarted) {
                this._isStarted = true;
                this._startTimer();
                $(document).on(USER_EVENTS, $.proxy(this._onUserAction, this));
            }
        },

        /**
         * Stops monitoring of idle state
         */
        stop : function() {
            if(this._isStarted) {
                this._isStarted = false;
                this._stopTimer();
                $(document).off(USER_EVENTS, this._onUserAction);
            }
        },

        /**
         * Returns whether state is idle
         * @returns {Boolean}
         */
        isIdle : function() {
            return this._isIdle;
        },

        _onUserAction : function() {
            if(this._isIdle) {
                this._isIdle = false;
                this.emit('wakeup');
            }

            this._stopTimer();
            this._startTimer();
        },

        _startTimer : function() {
            var _this = this;
            this._timer = setTimeout(
                function() {
                    _this._onTimeout();
                },
                IDLE_TIMEOUT);
        },

        _stopTimer : function() {
            this._timer && clearTimeout(this._timer);
        },

        _onTimeout : function() {
            this._isIdle = true;
            this.emit('idle');
        }
    });

provide(
    /**
     * @exports
     * @type Idle
     */
    new Idle());

});

/* end: ../../libs/bem-core/common.blocks/idle/idle.js */
/* begin: ../../libs/bem-components/common.blocks/input/_has-clear/input_has-clear.js */
/**
 * @module input
 */

modules.define('input', function(provide, Input) {

/**
 * @exports
 * @class input
 * @bem
 */
provide(Input.decl({ modName : 'has-clear', modVal : true }, /** @lends input.prototype */{
    onSetMod : {
        'js' : {
            'inited' : function() {
                this.__base.apply(this, arguments);

                this
                    .on('change', this._updateClear)
                    ._updateClear();
            }
        }
    },

    _onClearClick : function() {
        this
            .setVal('', { source : 'clear' })
            .setMod('focused');
    },

    _updateClear : function() {
        this.toggleMod(this.elem('clear'), 'visible', true, !!this._val);
    }
}, /** @lends input */{
    live : function() {
        this.liveBindTo('clear', 'pointerclick', function() {
            this._onClearClick();
        });

        return this.__base.apply(this, arguments);
    }
}));

});

/* end: ../../libs/bem-components/common.blocks/input/_has-clear/input_has-clear.js */
/* begin: ../../libs/bem-components/desktop.blocks/input/_has-clear/input_has-clear.js */
modules.define('input', function(provide, Input) {

provide(Input.decl({ modName : 'has-clear', modVal : true }, {
    _onBoxClick : function() {
        this.hasMod(this.elem('clear'), 'visible') || this.setMod('focused');
    }
}, {
    live : function() {
        this.liveBindTo('box', 'pointerclick', function() {
            this._onBoxClick();
        });

        return this.__base.apply(this, arguments);
    }
}));

});

/* end: ../../libs/bem-components/desktop.blocks/input/_has-clear/input_has-clear.js */
/* begin: ../../libs/bem-components/common.blocks/popup/popup.js */
/**
 * @module popup
 */

modules.define(
    'popup',
    ['i-bem__dom'],
    function(provide, BEMDOM) {

var ZINDEX_FACTOR = 1000,
    visiblePopupsZIndexes = {},
    undef;

/**
 * @exports
 * @class popup
 * @bem
 *
 * @param {Number} [zIndexGroupLevel=0] z-index group level
 *
 * @bemmod visible Represents visible state
 */
provide(BEMDOM.decl(this.name, /** @lends popup.prototype */{
    onSetMod : {
        'js' : {
            'inited' : function() {
                this._parentPopup = undef;
                this._zIndex = null;
                this._zIndexGroupLevel = null;
                this._isAttachedToScope = false;
            },

            '' : function() {
                this.delMod('visible');
            }
        },

        'visible' : {
            'true' : function() {
                if(!this._isAttachedToScope) {
                    BEMDOM.scope.append(this.domElem);
                    this._isAttachedToScope = true;
                }

                this
                    ._captureZIndex()
                    ._bindToParentPopup()
                    .bindTo('pointerpress pointerclick', this._setPreventHideByClick);
            },

            '' : function() {
                this
                    ._releaseZIndex()
                    ._unbindFromParentPopup()
                    .unbindFrom('pointerpress pointerclick', this._setPreventHideByClick);
            }
        }
    },

    /**
     * Sets content
     * @param {String|jQuery} content
     * @returns {popup} this
     */
    setContent : function(content) {
        BEMDOM.update(this.domElem, content);
        return this;
    },

    _calcZIndexGroupLevel : function() {
        var res = this.params.zIndexGroupLevel,
            parentPopup = this._getParentPopup();

        parentPopup && (res += parentPopup._zIndexGroupLevel);

        return res;
    },

    _setPreventHideByClick : function() {
        var curPopup = this;
        do {
            curPopup._preventHideByClick = true;
        } while(curPopup = curPopup._getParentPopup());
    },

    _bindToParentPopup : function() {
        var parentPopup = this._getParentPopup();
        parentPopup && parentPopup.on({ modName : 'visible', modVal : '' }, this._onParentPopupHide, this);

        return this;
    },

    _unbindFromParentPopup : function() {
        this._parentPopup && this._parentPopup.un({ modName : 'visible', modVal : '' }, this._onParentPopupHide, this);
        this._parentPopup = undef;

        return this;
    },

    _onParentPopupHide : function() {
        this.delMod('visible');
    },

    _getParentPopup : function() {
        return this._parentPopup;
    },

    _captureZIndex : function() {
        var level = this._zIndexGroupLevel === null?
                this._zIndexGroupLevel = this._calcZIndexGroupLevel() :
                this._zIndexGroupLevel,
            zIndexes = visiblePopupsZIndexes[level] || (visiblePopupsZIndexes[level] = [(level + 1) * ZINDEX_FACTOR]),
            prevZIndex = this._zIndex;

        this._zIndex = zIndexes[zIndexes.push(zIndexes[zIndexes.length - 1] + 1) - 1];
        this._zIndex !== prevZIndex && this.domElem.css('z-index', this._zIndex);

        return this;
    },

    _releaseZIndex : function() {
        var zIndexes = visiblePopupsZIndexes[this._zIndexGroupLevel];
        zIndexes.splice(zIndexes.indexOf(this._zIndex), 1);

        return this;
    },

    _recaptureZIndex : function() {
        this._releaseZIndex();
        this._zIndexGroupLevel = null;

        return this._captureZIndex();
    },

    getDefaultParams : function() {
        return {
            zIndexGroupLevel : 0
        };
    }
}, /** @lends popup */{
    live : true
}));

});

/* end: ../../libs/bem-components/common.blocks/popup/popup.js */
/* begin: ../../libs/bem-components/common.blocks/popup/_target/popup_target.js */
/**
 * @module popup
 */

modules.define(
    'popup',
    ['i-bem__dom', 'objects'],
    function(provide, BEMDOM, objects, Popup) {

var VIEWPORT_ACCURACY_FACTOR = 0.99,
    DEFAULT_DIRECTIONS = [
        'bottom-left', 'bottom-center', 'bottom-right',
        'top-left', 'top-center', 'top-right',
        'right-top', 'right-center', 'right-bottom',
        'left-top', 'left-center', 'left-bottom'
    ],

    win = BEMDOM.win,
    undef;

/**
 * @exports
 * @class popup
 * @bem
 *
 * @param {Number} [mainOffset=0] offset along the main direction
 * @param {Number} [secondaryOffset=0] offset along the secondary direction
 * @param {Number} [viewportOffset=0] offset from the viewport (window)
 * @param {Array[String]} [directions] allowed directions
 */
provide(Popup.decl({ modName : 'target' }, /** @lends popup.prototype */{
    onSetMod : {
        'js' : {
            'inited' : function() {
                this.__base.apply(this, arguments);

                this._lastDrawingCss = {
                    left : undef,
                    top : undef,
                    zIndex : undef,
                    display : undef
                };
            }
        },

        'visible' : {
            'true' : function() {
                this.__base.apply(this, arguments);
                this
                    .bindToWin('scroll resize', this._onWinScrollAndResize)
                    .redraw();
            },

            '' : function() {
                this.__base.apply(this, arguments);
                this.unbindFromWin('scroll resize', this._onWinScrollAndResize);
            }
        }
    },

    /**
     * @override
     */
    setContent : function() {
        return this.__base.apply(this, arguments).redraw();
    },

    /**
     * Redraws popup
     * @returns {popup} this
     */
    redraw : function() {
        if(!this.hasMod('visible')) return this;

        var bestDrawingParams = this._calcBestDrawingParams();

        this.setMod('direction', bestDrawingParams.direction);

        var lastDrawingCss = this._lastDrawingCss,
            needUpdateCss = false;

        objects.each(
            this._calcDrawingCss(bestDrawingParams),
            function(val, name) {
                if(lastDrawingCss[name] !== val) {
                    lastDrawingCss[name] = val;
                    needUpdateCss = true;
                }
            });

        needUpdateCss && this.domElem.css(lastDrawingCss);

        return this;
    },

    _calcDrawingCss : function(drawingParams) {
        return {
            left : drawingParams.left,
            top : drawingParams.top
        };
    },

    /**
     * Returns possible directions to draw with max available width and height.
     * @returns {Array}
     */
    calcPossibleDrawingParams : function() {
        var target = this._calcTargetDimensions(),
            viewport = this._calcViewportDimensions(),
            params = this.params,
            mainOffset = params.mainOffset,
            secondaryOffset = params.secondaryOffset,
            viewportOffset = params.viewportOffset;

        return this.params.directions.map(function(direction) {
            var subRes = {
                    direction : direction,
                    width : 0,
                    height : 0,
                    left : 0,
                    top : 0
                };

            if(this._checkMainDirection(direction, 'bottom')) {
                subRes.top = target.top + target.height + mainOffset;
                subRes.height = viewport.bottom - subRes.top - viewportOffset;
            } else if(this._checkMainDirection(direction, 'top')) {
                subRes.height = target.top - viewport.top - mainOffset - viewportOffset;
                subRes.top = target.top - subRes.height - mainOffset;
            } else {
                if(this._checkSecondaryDirection(direction, 'center')) {
                    subRes.height = viewport.bottom - viewport.top - 2 * viewportOffset;
                    subRes.top = target.top + target.height / 2 - subRes.height / 2;
                } else if(this._checkSecondaryDirection(direction, 'bottom')) {
                    subRes.height = target.top + target.height - viewport.top - secondaryOffset - viewportOffset;
                    subRes.top = target.top + target.height - subRes.height - secondaryOffset;
                } else if(this._checkSecondaryDirection(direction, 'top')) {
                    subRes.top = target.top + secondaryOffset;
                    subRes.height = viewport.bottom - subRes.top - viewportOffset;
                }

                if(this._checkMainDirection(direction, 'left')) {
                    subRes.width = target.left - viewport.left - mainOffset - viewportOffset;
                    subRes.left = target.left - subRes.width - mainOffset;
                } else {
                    subRes.left = target.left + target.width + mainOffset;
                    subRes.width = viewport.right - subRes.left - viewportOffset;
                }
            }

            if(this._checkSecondaryDirection(direction, 'right')) {
                subRes.width = target.left + target.width - viewport.left - secondaryOffset - viewportOffset;
                subRes.left = target.left + target.width - subRes.width - secondaryOffset;
            } else if(this._checkSecondaryDirection(direction, 'left')) {
                subRes.left = target.left + secondaryOffset;
                subRes.width = viewport.right - subRes.left - viewportOffset;
            } else if(this._checkSecondaryDirection(direction, 'center')) {
                if(this._checkMainDirection(direction, 'top', 'bottom')) {
                    subRes.width = viewport.right - viewport.left - 2 * viewportOffset;
                    subRes.left = target.left + target.width / 2 - subRes.width / 2;
                }
            }

            return subRes;
        }, this);
    },

    _calcBestDrawingParams : function() {
        var popup = this._calcPopupDimensions(),
            target = this._calcTargetDimensions(),
            viewport = this._calcViewportDimensions(),
            directions = this.params.directions,
            i = 0,
            direction,
            pos,
            viewportFactor,
            bestDirection,
            bestPos,
            bestViewportFactor;

        while(direction = directions[i++]) {
            pos = this._calcPos(direction, target, popup);
            viewportFactor = this._calcViewportFactor(pos, viewport, popup);
            if(i === 1 ||
                    viewportFactor > bestViewportFactor ||
                    (!bestViewportFactor && this.hasMod('direction', direction))) {
                bestDirection = direction;
                bestViewportFactor = viewportFactor;
                bestPos = pos;
            }
            if(bestViewportFactor > VIEWPORT_ACCURACY_FACTOR) break;
        }

        return {
            direction : bestDirection,
            left : bestPos.left,
            top : bestPos.top
        };
    },

    _calcPopupDimensions : function() {
        var popupWidth = this.domElem.outerWidth(),
            popupHeight = this.domElem.outerHeight();

        return {
            width : popupWidth,
            height : popupHeight,
            area : popupWidth * popupHeight
        };
    },

    /**
     * @abstract
     * @protected
     * @returns {Object}
     */
    _calcTargetDimensions : function() {},

    _calcViewportDimensions : function() {
        var winTop = win.scrollTop(),
            winLeft = win.scrollLeft(),
            winWidth = win.width(),
            winHeight = win.height();

        return {
            top : winTop,
            left : winLeft,
            bottom : winTop + winHeight,
            right : winLeft + winWidth
        };
    },

    _calcPos : function(direction, target, popup) {
        var res = {},
            mainOffset = this.params.mainOffset,
            secondaryOffset = this.params.secondaryOffset;

        if(this._checkMainDirection(direction, 'bottom')) {
            res.top = target.top + target.height + mainOffset;
        } else if(this._checkMainDirection(direction, 'top')) {
            res.top = target.top - popup.height - mainOffset;
        } else if(this._checkMainDirection(direction, 'left')) {
            res.left = target.left - popup.width - mainOffset;
        } else if(this._checkMainDirection(direction, 'right')) {
            res.left = target.left + target.width + mainOffset;
        }

        if(this._checkSecondaryDirection(direction, 'right')) {
            res.left = target.left + target.width - popup.width - secondaryOffset;
        } else if(this._checkSecondaryDirection(direction, 'left')) {
            res.left = target.left + secondaryOffset;
        } else if(this._checkSecondaryDirection(direction, 'bottom')) {
            res.top = target.top + target.height - popup.height - secondaryOffset;
        } else if(this._checkSecondaryDirection(direction, 'top')) {
            res.top = target.top + secondaryOffset;
        } else if(this._checkSecondaryDirection(direction, 'center')) {
            if(this._checkMainDirection(direction, 'top', 'bottom')) {
                res.left = target.left + target.width / 2 - popup.width / 2;
            } else if(this._checkMainDirection(direction, 'left', 'right')) {
                res.top = target.top + target.height / 2 - popup.height / 2;
            }
        }

        return res;
    },

    _calcViewportFactor : function(pos, viewport, popup) {
        var viewportOffset = this.params.viewportOffset,
            intersectionLeft = Math.max(pos.left, viewport.left + viewportOffset),
            intersectionRight = Math.min(pos.left + popup.width, viewport.right - viewportOffset),
            intersectionTop = Math.max(pos.top, viewport.top + viewportOffset),
            intersectionBottom = Math.min(pos.top + popup.height, viewport.bottom - viewportOffset);

        return intersectionLeft < intersectionRight && intersectionTop < intersectionBottom? // has intersection
            (intersectionRight - intersectionLeft) *
                (intersectionBottom - intersectionTop) /
                popup.area :
            0;
    },

    _checkMainDirection : function(direction, mainDirection1, mainDirection2) {
        return !direction.indexOf(mainDirection1) || (mainDirection2 && !direction.indexOf(mainDirection2));
    },

    _checkSecondaryDirection : function(direction, secondaryDirection) {
        return ~direction.indexOf('-' + secondaryDirection);
    },

    _onWinScrollAndResize : function() {
        this.redraw();
    },

    getDefaultParams : function() {
        return objects.extend(
            this.__base.apply(this, arguments),
            {
                mainOffset : 0,
                secondaryOffset : 0,
                viewportOffset : 0,
                directions : DEFAULT_DIRECTIONS
            });
    }
}));

});

/* end: ../../libs/bem-components/common.blocks/popup/_target/popup_target.js */
/* begin: ../../libs/bem-components/common.blocks/popup/_autoclosable/popup_autoclosable.js */
/**
 * @module popup
 */

modules.define(
    'popup',
    ['jquery', 'i-bem__dom', 'ua', 'dom', 'keyboard__codes'],
    function(provide, $, BEMDOM, ua, dom, keyCodes, Popup) {

var KEYDOWN_EVENT = ua.opera && ua.version < 12.10? 'keypress' : 'keydown',
    visiblePopupsStack = [];

/**
 * @exports
 * @class popup
 * @bem
 */
provide(Popup.decl({ modName : 'autoclosable', modVal : true }, /** @lends popup.prototype */{
    onSetMod : {
        'visible' : {
            'true' : function() {
                visiblePopupsStack.unshift(this);
                this
                    // NOTE: nextTick because of event bubbling to document
                    .nextTick(function() {
                        this.bindToDoc('pointerclick', this._onDocPointerClick);
                    })
                    .__base.apply(this, arguments);
            },

            '' : function() {
                visiblePopupsStack.splice(visiblePopupsStack.indexOf(this), 1);
                this
                    .unbindFromDoc('pointerclick', this._onDocPointerClick)
                    .__base.apply(this, arguments);
            }
        }
    },

    _onDocPointerClick : function(e) {
        if(this.hasMod('target', 'anchor') && dom.contains(this._anchor, $(e.target)))
            return;

        this._preventHideByClick?
           this._preventHideByClick = null :
           this.delMod('visible');
    }
}, /** @lends popup */{
    live : function() {
        BEMDOM.doc.on(KEYDOWN_EVENT, onDocKeyPress);
    }
}));

function onDocKeyPress(e) {
    e.keyCode === keyCodes.ESC &&
        // omit ESC in inputs, selects and etc.
        visiblePopupsStack.length &&
        !dom.isEditable($(e.target)) &&
            visiblePopupsStack[0].delMod('visible');
}

});

/* end: ../../libs/bem-components/common.blocks/popup/_autoclosable/popup_autoclosable.js */
/* begin: ../../libs/bem-components/common.blocks/select/select.js */
/**
 * @module select
 */

modules.define(
    'select',
    ['i-bem__dom', 'popup', 'menu', 'button', 'jquery', 'dom', 'keyboard__codes', 'strings__escape'],
    function(provide, BEMDOM, Popup, Menu, Button, $, dom, keyCodes, escape) {

/**
 * @exports
 * @class select
 * @bem
 *
 * @bemmod opened Represents opened state
 */
provide(BEMDOM.decl(this.name, /** @lends select.prototype */{
    beforeSetMod : {
        'opened' : {
            'true' : function() {
                return !this.hasMod('disabled');
            }
        },

        'focused' : {
            '' : function() {
                return !this._isPointerPressInProgress;
            }
        }
    },

    onSetMod : {
        'js' : {
            'inited' : function() {
                this._button = this.findBlockInside('button')
                    .on('click', this._onButtonClick, this);

                this._popup = this.findBlockInside('popup')
                    .setAnchor(this._button)
                    .on({ modName : 'visible', modVal : '' }, this._onPopupHide, this);

                this._menu = this._popup.findBlockInside('menu')
                    .on({
                        'change' : this._onMenuChange,
                        'item-click' : this._onMenuItemClick
                    }, this);

                this._isPointerPressInProgress = false;

                this.hasMod('focused') && this._focus();

                this._updateMenuWidth();
            }
        },

        'focused' : {
            'true' : function() {
                this._focus();
            },

            '' : function() {
                this._blur();
            }
        },

        'opened' : {
            '*' : function(_, modVal) {
                this._menu.setMod('focused', modVal);
            },

            'true' : function() {
                this._updateMenuHeight();
                this._popup.setMod('visible');
                this
                    .bindToDoc('pointerpress', this._onDocPointerPress)
                    .setMod('focused')
                    ._hoverCheckedOrFirstItem();
            },

            '' : function() {
                this
                    .unbindFromDoc('pointerpress', this._onDocPointerPress)
                    ._popup.delMod('visible');
            }
        },

        'disabled' : {
            '*' : function(modName, modVal) {
                this._button.setMod(modName, modVal);
                this._menu.setMod(modName, modVal);
                this.elem('control').prop('disabled', modVal);
            },

            'true' : function() {
                this._popup.delMod('visible');
            }
        }
    },

    /**
     * Get value
     * @returns {*}
     */
    getVal : function() {
        return this._menu.getVal();
    },

    /**
     * Set value
     * @param {*} val
     * @returns {select} this
     */
    setVal : function(val) {
        this._menu.setVal(val);
        return this;
    },

    /**
     * Get name
     * @returns {String}
     */
    getName : function() {
        return this.params.name;
    },

    getDefaultParams : function() {
        return {
            optionsMaxHeight : Number.POSITIVE_INFINITY
        };
    },

    _focus : function() {
        this
            .bindTo('button', {
                keydown : this._onKeyDown,
                keypress : this._onKeyPress
            })
            ._button.setMod('focused');
    },

    _blur : function() {
        this
            .unbindFrom('button', {
                keydown : this._onKeyDown,
                keypress : this._onKeyPress
            })
            .delMod('opened')
            ._button
                .delMod('focused');
    },

    _updateMenuWidth : function() {
        this._menu.domElem.css('min-width', this._button.domElem.outerWidth());

        this._popup.redraw();
    },

    _updateMenuHeight : function() {
        var drawingParams = this._popup.calcPossibleDrawingParams(),
            menuDomElem = this._menu.domElem,
            menuWidth = menuDomElem.outerWidth(),
            bestHeight = 0;

        drawingParams.forEach(function(params) {
            params.width >= menuWidth && params.height > bestHeight && (bestHeight = params.height);
        });

        bestHeight && menuDomElem.css('max-height', Math.min(this.params.optionsMaxHeight, bestHeight));
    },

    _getCheckedItems : function() {
        return this._menu.getItems().filter(function(item) {
            return item.hasMod('checked');
        });
    },

    _hoverCheckedOrFirstItem : function() { // NOTE: may be it should be moved to menu
        (this._getCheckedItems()[0] || this._menu.getItems()[0])
            .setMod('hovered');
    },

    _onKeyDown : function(e) {
        if(this.hasMod('opened')) {
            if(e.keyCode === keyCodes.ESC) {
                // NOTE: stop propagation to prevent from being listened by global handlers
                e.stopPropagation();
                this.delMod('opened');
            }
        } else if((e.keyCode === keyCodes.UP || e.keyCode === keyCodes.DOWN) && !e.shiftKey) {
            e.preventDefault();
            this.setMod('opened');
        }
    },

    _onKeyPress : function(e) {
        // press a key: closed select - set value, opened select - set hover on menu-item.
        if(!this.hasMod('opened')) {
            var item = this._menu.searchItemByKeyboardEvent(e);
            item && this._setSingleVal(item.getVal());
        }
    },

    _setSingleVal : function(value) {
        this.setVal(value);
    },

    _onMenuChange : function() {
        this._updateControl();
        this._updateButton();
        this._updateMenuWidth();

        this.emit('change');
    },

    _onMenuItemClick : function() {},

    _updateControl : function() {},

    _updateButton : function() {},

    _onButtonClick : function() {
        this.toggleMod('opened');
    },

    _onButtonFocusChange : function(e, data) {
        this.setMod('focused', data.modVal);
    },

    _onPopupHide : function() {
        this.delMod('opened');
    },

    _onDocPointerPress : function(e) {
        if(this._isEventInPopup(e)) {
            e.pointerType === 'mouse' && e.preventDefault(); // prevents button blur in most desktop browsers
            this._isPointerPressInProgress = true;
            this.bindToDoc(
                'pointerrelease',
                { focusedHardMod : this._button.getMod('focused-hard') },
                this._onDocPointerRelease);
        }
    },

    _onDocPointerRelease : function(e) {
        this._isPointerPressInProgress = false;
        this
            .unbindFromDoc('pointerrelease', this._onDocPointerRelease)
            ._button
                .toggleMod('focused', true, '', this._isEventInPopup(e))
                .setMod('focused-hard', e.data.focusedHardMod);
    },

    _isEventInPopup : function(e) {
        return dom.contains(this._popup.domElem, $(e.target));
    }
}, /** @lends select */{
    live : function() {
        this.liveInitOnBlockInsideEvent(
            { modName : 'focused', modVal : '*' },
            'button',
            this.prototype._onButtonFocusChange);
    },

    _createControlHTML : function(name, val) {
        // Using string concatenation to not depend on template engines
        return '<input ' +
            'type="hidden" ' +
            'name="' + name + '" ' +
            'class="' + this.buildClass('control') + '" ' +
            'value="' + escape.attr(val) + '"/>';
    }
}));

});

/* end: ../../libs/bem-components/common.blocks/select/select.js */
/* begin: ../../libs/bem-components/common.blocks/button/button.js */
/**
 * @module button
 */

modules.define(
    'button',
    ['i-bem__dom', 'control', 'jquery', 'dom', 'functions', 'keyboard__codes'],
    function(provide, BEMDOM, Control, $, dom, functions, keyCodes) {

/**
 * @exports
 * @class button
 * @augments control
 * @bem
 */
provide(BEMDOM.decl({ block : this.name, baseBlock : Control }, /** @lends button.prototype */{
    beforeSetMod : {
        'pressed' : {
            'true' : function() {
                return !this.hasMod('disabled') || this.hasMod('togglable');
            }
        },

        'focused' : {
            '' : function() {
                return !this._isPointerPressInProgress;
            }
        }
    },

    onSetMod : {
        'js' : {
            'inited' : function() {
                this.__base.apply(this, arguments);
                this._isPointerPressInProgress = false;
                this._focusedByPointer = false;
            }
        },

        'disabled' : {
            'true' : function() {
                this.__base.apply(this, arguments);
                this.hasMod('togglable') || this.delMod('pressed');
            }
        },

        'focused' : {
            'true' : function() {
                this.__base.apply(this, arguments);
                this._focusedByPointer || this.setMod('focused-hard');
            },

            '' : function() {
                this.__base.apply(this, arguments);
                this.delMod('focused-hard');
            }
        }
    },

    /**
     * Returns text of the button
     * @returns {String}
     */
    getText : function() {
        return this.elem('text').text();
    },

    /**
     * Sets text to the button
     * @param {String} text
     * @returns {button} this
     */
    setText : function(text) {
        this.elem('text').text(text || '');
        return this;
    },

    _onFocus : function() {
        if(this._isPointerPressInProgress) return;

        this.__base.apply(this, arguments);
        this.bindTo('control', 'keydown', this._onKeyDown);
    },

    _onBlur : function() {
        this
            .unbindFrom('control', 'keydown', this._onKeyDown)
            .__base.apply(this, arguments);
    },

    _onPointerPress : function() {
        if(!this.hasMod('disabled')) {
            this._isPointerPressInProgress = true;
            this
                .bindToDoc('pointerrelease', this._onPointerRelease)
                .setMod('pressed');
        }
    },

    _onPointerRelease : function(e) {
        this._isPointerPressInProgress = false;
        this.unbindFromDoc('pointerrelease', this._onPointerRelease);

        if(dom.contains(this.elem('control'), $(e.target))) {
            this._focusedByPointer = true;
            this._focus();
            this._focusedByPointer = false;
            this
                ._updateChecked()
                .emit('click');
        } else {
            this._blur();
        }

        this.delMod('pressed');
    },

    _onKeyDown : function(e) {
        if(this.hasMod('disabled')) return;

        var keyCode = e.keyCode;
        if(keyCode === keyCodes.SPACE || keyCode === keyCodes.ENTER) {
            this
                .unbindFrom('control', 'keydown', this._onKeyDown)
                .bindTo('control', 'keyup', this._onKeyUp)
                ._updateChecked()
                .setMod('pressed');
        }
    },

    _onKeyUp : function(e) {
        this
            .unbindFrom('control', 'keyup', this._onKeyUp)
            .bindTo('control', 'keydown', this._onKeyDown)
            .delMod('pressed');

        e.keyCode === keyCodes.SPACE && this._doAction();

        this.emit('click');
    },

    _updateChecked : function() {
        this.hasMod('togglable') &&
            (this.hasMod('togglable', 'check')?
                this.toggleMod('checked') :
                this.setMod('checked'));

        return this;
    },

    _doAction : functions.noop
}, /** @lends button */{
    live : function() {
        this.liveBindTo('control', 'pointerpress', this.prototype._onPointerPress);
        return this.__base.apply(this, arguments);
    }
}));

});

/* end: ../../libs/bem-components/common.blocks/button/button.js */
/* begin: ../../libs/bem-components/common.blocks/menu/menu.js */
/**
 * @module menu
 */

modules.define(
    'menu',
    ['i-bem__dom', 'control', 'keyboard__codes', 'menu-item'],
    function(provide, BEMDOM, Control, keyCodes) {

/** @const Number */
var TIMEOUT_KEYBOARD_SEARCH = 1500;

/**
 * @exports
 * @class menu
 * @augments control
 * @bem
 */
provide(BEMDOM.decl({ block : this.name, baseBlock : Control }, /** @lends menu.prototype */{
    onSetMod : {
        'js' : {
            'inited' : function() {
                this.__base.apply(this, arguments);
                this._hoveredItem = null;
                this._items = null;

                this._lastTyping = {
                    char : '',
                    text : '',
                    index : 0,
                    time : 0
                };
            }
        },

        'disabled' : function(modName, modVal) {
            this.getItems().forEach(function(menuItem){
                menuItem.setMod(modName, modVal);
            });
        }
    },

    /**
     * Returns items
     * @returns {menu-item[]}
     */
    getItems : function() {
        return this._items || (this._items = this.findBlocksInside('menu-item'));
    },

    /**
     * Sets content
     * @param {String|jQuery} content
     * @returns {menu} this
     */
    setContent : function(content) {
        BEMDOM.update(this.domElem, content);
        this._hoveredItem = null;
        this._items = null;
        return this;
    },

    /**
     * Search menu item by keyboard event
     * @param {jQuery.Event} e
     * @returns {menu-item}
     */
    searchItemByKeyboardEvent : function(e) {
        var currentTime = +new Date(),
            charCode = e.charCode,
            char = String.fromCharCode(charCode).toLowerCase(),
            lastTyping = this._lastTyping,
            index = lastTyping.index,
            isSameChar = char === lastTyping.char && lastTyping.text.length === 1,
            items = this.getItems();

        if(charCode <= keyCodes.SPACE || e.ctrlKey || e.altKey || e.metaKey) {
            lastTyping.time = currentTime;
            return null;
        }

        if(currentTime - lastTyping.time > TIMEOUT_KEYBOARD_SEARCH || isSameChar) {
            lastTyping.text = char;
        } else {
            lastTyping.text += char;
        }

        lastTyping.char = char;
        lastTyping.time = currentTime;

        // If key is pressed again, then continue to search to next menu item
        if(isSameChar && items[index].getText().search(lastTyping.char) === 0) {
            index = index >= items.length - 1? 0 : index + 1;
        }

        // 2 passes: from index to items.length and from 0 to index.
        var i = index, len = items.length;
        while(i < len) {
            if(this._doesItemMatchText(items[i], lastTyping.text)) {
                lastTyping.index = i;
                return items[i];
            }

            i++;

            if(i === items.length) {
                i = 0;
                len = index;
            }
        }

        return null;
    },

    /** @override **/
    _onFocus : function() {
        this.__base.apply(this, arguments);
        this
            .bindToDoc('keydown', this._onKeyDown) // NOTE: should be called after __base
            .bindToDoc('keypress', this._onKeyPress);
    },

    /** @override **/
    _onBlur : function() {
        this
            .unbindFromDoc('keydown', this._onKeyDown)
            .unbindFromDoc('keypress', this._onKeyPress)
            .__base.apply(this, arguments);
        this._hoveredItem && this._hoveredItem.delMod('hovered');
    },

    _onItemHover : function(item) {
        if(item.hasMod('hovered')) {
            this._hoveredItem && this._hoveredItem.delMod('hovered');
            this._scrollToItem(this._hoveredItem = item);
        } else if(this._hoveredItem === item) {
            this._hoveredItem = null;
        }
    },

    _scrollToItem : function(item) {
        var domElemOffsetTop = this.domElem.offset().top,
            itemDomElemOffsetTop = item.domElem.offset().top,
            relativeScroll;

        if((relativeScroll = itemDomElemOffsetTop - domElemOffsetTop) < 0 ||
            (relativeScroll =
                itemDomElemOffsetTop +
                item.domElem.outerHeight() -
                domElemOffsetTop -
                this.domElem.outerHeight()) > 0) {
            this.domElem.scrollTop(this.domElem.scrollTop() + relativeScroll);
        }
    },

    _onItemClick : function(item, data) {
        this.emit('item-click', { item : item, source : data.source });
    },

    _onKeyDown : function(e) {
        var keyCode = e.keyCode,
            isArrow = keyCode === keyCodes.UP || keyCode === keyCodes.DOWN;

        if(isArrow && !e.shiftKey) {
            e.preventDefault();

            var dir = keyCode - 39, // using the features of key codes for "up"/"down" ;-)
                items = this.getItems(),
                len = items.length,
                hoveredIdx = items.indexOf(this._hoveredItem),
                nextIdx = hoveredIdx,
                i = 0;

            do {
                nextIdx += dir;
                nextIdx = nextIdx < 0? len - 1 : nextIdx >= len? 0 : nextIdx;
                if(++i === len) return; // if we have no next item to hover
            } while(items[nextIdx].hasMod('disabled'));

            this._lastTyping.index = nextIdx;

            items[nextIdx].setMod('hovered');
        }
    },

    _onKeyPress : function(e) {
        var item = this.searchItemByKeyboardEvent(e);
        item && item.setMod('hovered');
    },

    _doesItemMatchText : function(item, text) {
        return !item.hasMod('disabled') &&
            item.getText().toLowerCase().search(text) === 0;
    }
}, /** @lends menu */{
    live : function() {
        this
            .liveInitOnBlockInsideEvent({ modName : 'hovered', modVal : '*' }, 'menu-item', function(e) {
                this._onItemHover(e.target);
            })
            .liveInitOnBlockInsideEvent('click', 'menu-item', function(e, data) {
                this._onItemClick(e.target, data);
            });

        return this.__base.apply(this, arguments);
    }
}));

});

/* end: ../../libs/bem-components/common.blocks/menu/menu.js */
/* begin: ../../libs/bem-components/common.blocks/menu-item/menu-item.js */
/**
 * @module menu-item
 */

modules.define('menu-item', ['i-bem__dom'], function(provide, BEMDOM) {

/**
 * @exports
 * @class menu-item
 * @bem
 *
 * @param val Value of item
 */
provide(BEMDOM.decl(this.name, /** @lends menu-item.prototype */{
    beforeSetMod : {
        'hovered' : {
            'true' : function() {
                return !this.hasMod('disabled');
            }
        }
    },

    onSetMod : {
        'js' : {
            'inited' : function() {
                this.bindTo('pointerleave', this._onPointerLeave);
            }
        },

        'disabled' : {
            'true' : function() {
                this.__base.apply(this, arguments);
                this.delMod('hovered');
            }
        }
    },

    /**
     * Checks whether given value is equal to current value
     * @param {String|Number} val
     * @returns {Boolean}
     */
    isValEq : function(val) {
        // NOTE: String(true) == String(1) -> false
        return String(this.params.val) === String(val);
    },

    /**
     * Returns item value
     * @returns {*}
     */
    getVal : function() {
        return this.params.val;
    },

    /**
     * Returns item text
     * @returns {String}
     */
    getText : function() {
        return this.params.text || this.domElem.text();
    },

    _onPointerOver : function() {
        this.setMod('hovered');
    },

    _onPointerLeave : function() {
        this.delMod('hovered');
    },

    _onPointerClick : function() {
        this.hasMod('disabled') || this.emit('click', { source : 'pointer' });
    }
}, /** @lends menu-item */{
    live : function() {
        var ptp = this.prototype;
        this
            .liveBindTo('pointerover', ptp._onPointerOver)
            .liveBindTo('pointerclick', ptp._onPointerClick);
    }
}));

});

/* end: ../../libs/bem-components/common.blocks/menu-item/menu-item.js */
/* begin: ../../libs/bem-components/common.blocks/menu/_mode/menu_mode.js */
/**
 * @module menu
 */

modules.define('menu', ['keyboard__codes'], function(provide, keyCodes, Menu) {

/**
 * @exports
 * @class menu
 * @bem
 */
provide(Menu.decl({ modName : 'mode' }, /** @lends menu.prototype */{
    onSetMod : {
        'js' : {
            'inited' : function() {
                this.__base.apply(this, arguments);
                this._val = null;
                this._isValValid = false;
            }
        }
    },

    _onKeyDown : function(e) {
        if(e.keyCode === keyCodes.ENTER || e.keyCode === keyCodes.SPACE) {
            this
                .unbindFromDoc('keydown', this._onKeyDown)
                .bindToDoc('keyup', this._onKeyUp);

            e.keyCode === keyCodes.SPACE && e.preventDefault();
            this._onItemClick(this._hoveredItem, { source : 'keyboard' });
        }
        this.__base.apply(this, arguments);
    },

    _onKeyUp : function() {
        this.unbindFromDoc('keyup', this._onKeyUp);
        // it could be unfocused while is key being pressed
        this.hasMod('focused') && this.bindToDoc('keydown', this._onKeyDown);
    },

    /**
     * Returns menu value
     * @returns {*}
     */
    getVal : function() {
        if(!this._isValValid) {
            this._val = this._getVal();
            this._isValValid = true;
        }
        return this._val;
    },

    /**
     * @abstract
     * @protected
     * @returns {*}
     */
    _getVal : function() {
        throw Error('_getVal is not implemented');
    },

    /**
     * Sets menu value
     * @param {*} val
     * @returns {menu} this
     */
    setVal : function(val) {
        if(this._setVal(val)) {
            this._val = val;
            this._isValValid = true;
            this.emit('change');
        }
        return this;
    },

    /**
     * @abstract
     * @protected
     * @param {*} val
     * @returns {Boolean} returns true if value was changed
     */
    _setVal : function() {
        throw Error('_setVal is not implemented');
    },

    _updateItemsCheckedMod : function(modVals) {
        var items = this.getItems();
        modVals.forEach(function(modVal, i) {
            items[i].setMod('checked', modVal);
        });
    },

    /**
     * Sets content
     * @override
     */
    setContent : function() {
        var res = this.__base.apply(this, arguments);
        this._isValValid = false;
        this.emit('change'); // NOTE: potentially unwanted event could be emitted
        return res;
    }
}));

});

/* end: ../../libs/bem-components/common.blocks/menu/_mode/menu_mode.js */
/* begin: ../../libs/bem-components/common.blocks/checkbox/checkbox.js */
/**
 * @module checkbox
 */

modules.define('checkbox', ['i-bem__dom', 'control'], function(provide, BEMDOM, Control) {

/**
 * @exports
 * @class checkbox
 * @augments control
 * @bem
 */
provide(BEMDOM.decl({ block : this.name, baseBlock : Control }, /** @lends checkbox.prototype */{
    onSetMod : {
        'checked' : function(modName, modVal) {
            this.elem('control').prop(modName, modVal);
        }
    },

    _onChange : function() {
        this.setMod('checked', this.elem('control').prop('checked'));
    }
}, /** @lends checkbox */{
    live : function() {
        this.liveBindTo('control', 'change', this.prototype._onChange);
        return this.__base.apply(this, arguments);
    }
}));

});

/* end: ../../libs/bem-components/common.blocks/checkbox/checkbox.js */
/* begin: ../../common.blocks/calendar/calendar.js */
modules.define('calendar', ['i-bem__dom', 'BEMHTML'], function(provide, BEMDOM, BEMHTML) {

provide(BEMDOM.decl(this.name, {

    _onSwitchClick: function(e) {
        var pos = this.getMod(e.currentTarget, 'dest'),
            params = this.params,
            month = params.month;

        pos === 'next'? month++ : month--;
        if (month < 1) {
            params.year--;
            month = 12;
        }
        if (month > 12) {
            params.year++;
            month = 1;
        }

        BEMDOM.update(this.domElem, BEMHTML.apply({
            block: 'calendar',
            elem: 'content',
            year: params.year,
            month: params.month = month
        }));
    },

    _onDayClick: function(e) {
        var target = e.currentTarget;

        if (this.hasMod(target, 'month', 'current')) {
            this.params.date = this.elemParams(target).date;
            this
                .delMod(this.findElem('day'), 'selected')
                .setMod(target, 'selected')
                ._emitChange();
        }

    },

    _emitChange: function() {
        var params = this.params;
        this.emit('change', {
            year: params.year,
            month: params.month,
            date: params.date
        });
    }

}, {

    live: function() {
        var ptp = this.prototype;
        this
            .liveBindTo('month-switch', 'click', ptp._onSwitchClick)
            .liveBindTo('day', 'click', ptp._onDayClick);
    }

}));

});

/* end: ../../common.blocks/calendar/calendar.js */
/* begin: ../../common.blocks/es6-promise/es6-promise.js */
(function(global){

//
// Check for native Promise and it has correct interface
//

var NativePromise = global['Promise'];
var nativePromiseSupported =
  NativePromise &&
  // Some of these methods are missing from
  // Firefox/Chrome experimental implementations
  'resolve' in NativePromise &&
  'reject' in NativePromise &&
  'all' in NativePromise &&
  'race' in NativePromise &&
  // Older version of the spec had a resolver object
  // as the arg rather than a function
  (function(){
    var resolve;
    new NativePromise(function(r){ resolve = r; });
    return typeof resolve === 'function';
  })();


//
// export if necessary
//

if (typeof exports !== 'undefined' && exports)
{
  // node.js
  exports.Promise = Promise || NativePromise;
}
else
{
  // in browser add to global
  if (!nativePromiseSupported)
    global['Promise'] = Promise;
}


//
// Polyfill
//

var PENDING = 'pending';
var SEALED = 'sealed';
var FULFILLED = 'fulfilled';
var REJECTED = 'rejected';
var NOOP = function(){};

// async calls
var asyncSetTimer = typeof setImmediate !== 'undefined' ? setImmediate : setTimeout;
var asyncQueue = [];
var asyncTimer;

function asyncFlush(){
  // run promise callbacks
  for (var i = 0; i < asyncQueue.length; i++)
    asyncQueue[i][0](asyncQueue[i][1]);

  // reset async asyncQueue
  asyncQueue = [];
  asyncTimer = false;
}

function asyncCall(callback, arg){
  asyncQueue.push([callback, arg]);

  if (!asyncTimer)
  {
    asyncTimer = true;
    asyncSetTimer(asyncFlush, 0);
  }
}


function invokeResolver(resolver, promise) {
  function resolvePromise(value) {
    resolve(promise, value);
  }

  function rejectPromise(reason) {
    reject(promise, reason);
  }

  try {
    resolver(resolvePromise, rejectPromise);
  } catch(e) {
    rejectPromise(e);
  }
}

function invokeCallback(subscriber){
  var owner = subscriber.owner;
  var settled = owner.state_;
  var value = owner.data_;  
  var callback = subscriber[settled];
  var promise = subscriber.then;

  if (typeof callback === 'function')
  {
    settled = FULFILLED;
    try {
      value = callback(value);
    } catch(e) {
      reject(promise, e);
    }
  }

  if (!handleThenable(promise, value))
  {
    if (settled === FULFILLED)
      resolve(promise, value);

    if (settled === REJECTED)
      reject(promise, value);
  }
}

function handleThenable(promise, value) {
  var resolved;

  try {
    if (promise === value)
      throw new TypeError('A promises callback cannot return that same promise.');

    if (value && (typeof value === 'function' || typeof value === 'object'))
    {
      var then = value.then;  // then should be retrived only once

      if (typeof then === 'function')
      {
        then.call(value, function(val){
          if (!resolved)
          {
            resolved = true;

            if (value !== val)
              resolve(promise, val);
            else
              fulfill(promise, val);
          }
        }, function(reason){
          if (!resolved)
          {
            resolved = true;

            reject(promise, reason);
          }
        });

        return true;
      }
    }
  } catch (e) {
    if (!resolved)
      reject(promise, e);

    return true;
  }

  return false;
}

function resolve(promise, value){
  if (promise === value || !handleThenable(promise, value))
    fulfill(promise, value);
}

function fulfill(promise, value){
  if (promise.state_ === PENDING)
  {
    promise.state_ = SEALED;
    promise.data_ = value;

    asyncCall(publishFulfillment, promise);
  }
}

function reject(promise, reason){
  if (promise.state_ === PENDING)
  {
    promise.state_ = SEALED;
    promise.data_ = reason;

    asyncCall(publishRejection, promise);
  }
}

function publish(promise) {
  promise.then_ = promise.then_.forEach(invokeCallback);
}

function publishFulfillment(promise){
  promise.state_ = FULFILLED;
  publish(promise);
}

function publishRejection(promise){
  promise.state_ = REJECTED;
  publish(promise);
}

/**
* @class
*/
function Promise(resolver){
  if (typeof resolver !== 'function')
    throw new TypeError('Promise constructor takes a function argument');

  if (this instanceof Promise === false)
    throw new TypeError('Failed to construct \'Promise\': Please use the \'new\' operator, this object constructor cannot be called as a function.');

  this.then_ = [];

  invokeResolver(resolver, this);
}

Promise.prototype = {
  constructor: Promise,

  state_: PENDING,
  then_: null,
  data_: undefined,

  then: function(onFulfillment, onRejection){
    var subscriber = {
      owner: this,
      then: new this.constructor(NOOP),
      fulfilled: onFulfillment,
      rejected: onRejection
    };

    if (this.state_ === FULFILLED || this.state_ === REJECTED)
    {
      // already resolved, call callback async
      asyncCall(invokeCallback, subscriber);
    }
    else
    {
      // subscribe
      this.then_.push(subscriber);
    }

    return subscriber.then;
  },

  'catch': function(onRejection) {
    return this.then(null, onRejection);
  }
};

Promise.all = function(promises){
  var Class = this;

  if (!Array.isArray(promises))
    throw new TypeError('You must pass an array to Promise.all().');

  return new Class(function(resolve, reject){
    var results = [];
    var remaining = 0;

    function resolver(index){
      remaining++;
      return function(value){
        results[index] = value;
        if (!--remaining)
          resolve(results);
      };
    }

    for (var i = 0, promise; i < promises.length; i++)
    {
      promise = promises[i];

      if (promise && typeof promise.then === 'function')
        promise.then(resolver(i), reject);
      else
        results[i] = promise;
    }

    if (!remaining)
      resolve(results);
  });
};

Promise.race = function(promises){
  var Class = this;

  if (!Array.isArray(promises))
    throw new TypeError('You must pass an array to Promise.race().');

  return new Class(function(resolve, reject) {
    for (var i = 0, promise; i < promises.length; i++)
    {
      promise = promises[i];

      if (promise && typeof promise.then === 'function')
        promise.then(resolve, reject);
      else
        resolve(promise);
    }
  });
};

Promise.resolve = function(value){
  var Class = this;

  if (value && typeof value === 'object' && value.constructor === Class)
    return value;

  return new Class(function(resolve){
    resolve(value);
  });
};

Promise.reject = function(reason){
  var Class = this;

  return new Class(function(resolve, reject){
    reject(reason);
  });
};

})(new Function('return this')());

/* end: ../../common.blocks/es6-promise/es6-promise.js */
/* begin: ../../common.blocks/github/__backend/github__backend.js */
modules.define('github__backend', function(provide) {
    "use strict";
    var GITHUB_ENDPOINT = 'https://api.github.com';
    provide({
        _fromJSON: function(response) {
            return response.json();
        },
        _getHeaders: function(token) {
            return{
                headers: {
                    'Authorization': 'Basic ' + btoa(token+':x-oauth-basic')
                }
            };
        },
        getRepos: function(organization, options) {
            return fetch(GITHUB_ENDPOINT+'/users/'+organization+'/repos', this._getHeaders(options.token))
                .then(this._fromJSON);
        },
        getCollaborators: function(repo, options) {
            return fetch(GITHUB_ENDPOINT+'/repos/'+repo+'/collaborators', this._getHeaders(options.token))
                .then(this._fromJSON);
        },
        getPRCommits: function(issue, options) {
            return fetch(GITHUB_ENDPOINT+'/repos/'+issue.organization+'/'+issue.repository+'/pulls/'+issue.id+'/commits',
                this._getHeaders(options.token)).then(this._fromJSON);
        },
        getIssues: function(repo, options) {
            return fetch(GITHUB_ENDPOINT+'/repos/'+repo+'/issues?direction=desc&sort=updated', this._getHeaders(options.token))
                .then(this._fromJSON);
        },
        getComments: function(repo, options) {
            return fetch(GITHUB_ENDPOINT+'/repos/'+repo+'/issues/comments?direction=desc&sort=updated', this._getHeaders(options.token))
                .then(this._fromJSON);
        }
    });
});

/* end: ../../common.blocks/github/__backend/github__backend.js */
/* begin: ../../configs/development/common.blocks/github/__backend/github__backend.js */
modules.define('github__backend', function(provide, backend) {
    "use strict";
    backend.getRepos = function(organization) {
        return Promise.resolve([
            {
                "id": 3334335,
                "name": "apw",
                "full_name": "bem/apw",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            },
            {
                "id": 32155667,
                "name": "badges",
                "full_name": "bem/badges",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            },
            {
                "id": 8156994,
                "name": "bem-articles",
                "full_name": "bem/bem-articles",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            },
            {
                "id": 11577068,
                "name": "bem-bench",
                "full_name": "bem/bem-bench",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            },
            {
                "id": 610292,
                "name": "bem-bl",
                "full_name": "bem/bem-bl",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            },
            {
                "id": 10786343,
                "name": "bem-cli",
                "full_name": "bem/bem-cli",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            },
            {
                "id": 6578551,
                "name": "bem-components",
                "full_name": "bem/bem-components",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            },
            {
                "id": 5688745,
                "name": "bem-dashboard",
                "full_name": "bem/bem-dashboard",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            },
            {
                "id": 11341198,
                "name": "bem-history",
                "full_name": "bem/bem-history",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            }
        ]);
    };
    backend.getIssues = function(repo) {
        var issues = {
            'my-org/core': [
                {
                    "url": "https://api.github.com/repos/my-org/core/issues/947",
                    "number": 947,
                    "title": "The ua block description rework with new template",
                    "comments": 0,
                    "labels": [{
                        "name": "docs",
                        "color": "fbca04"
                    }, {
                        "name": "v2",
                        "color": "d4c5f9"
                    }],
                    "state": "open",
                    "user": {"login": "aristov", "avatar_url": "https://avatars.githubusercontent.com/u/5477035?v=3"},
                    "updated_at": "2015-04-09T12:18:36Z"
                }, {
                    "url": "https://api.github.com/repos/my-org/core/issues/945",
                    "number": 945,
                    "title": "BEMJSON: boolean type added to the description",
                    "comments": 2,
                    "labels": [],
                    "pull_request": {},
                    "state": "open",
                    "user": {"login": "aristov", "avatar_url": "https://avatars.githubusercontent.com/u/5477035?v=3"},
                    "updated_at": "2015-04-06T15:09:29Z"
                }, {
                    "url": "https://api.github.com/repos/my-org/core/issues/920",
                    "number": 920,
                    "title": "Issue no comments",
                    "comments": 0,
                    "labels": [],
                    "state": "open",
                    "user": {"login": "aristov", "avatar_url": "https://avatars.githubusercontent.com/u/5477035?v=3"},
                    "updated_at": "2015-04-06T15:09:29Z"
                }],
            'my-org/extras': [{
                "url": "https://api.github.com/repos/my-org/extras/issues/20",
                "number": 20,
                "title": "i-bem.bemhtml: Support nested mix as object",
                "comments": 3,
                "labels": [],
                "pull_request": {},
                "state": "open",
                "updated_at": "2015-04-02T22:03:35Z",
                "user": {"login": "tadatuta"}
            }, {
                "url": "https://api.github.com/repos/my-org/extras/issues/23",
                "number": 23,
                "title": "i-bem.bemhtml: decline support of nested mixes at all",
                "comments": 1,
                "labels": [{
                    "name": "question",
                    "color": "cc317c"
                }],
                "state": "open",
                "user": {"login": "aristov", "avatar_url": "https://avatars.githubusercontent.com/u/5477035?v=3"},
                "updated_at": "2015-04-02T14:56:47Z"
            }],
            'my-org/examples': []
        };
        return Promise.resolve(issues[repo] || []);
    };
    backend.getComments = function(repo) {
        var comments = {
            'my-org/core': [{
                "issue_url": "https://api.github.com/repos/my-org/core/issues/947",
                "user": {"login": "aristov", "avatar_url": "https://avatars.githubusercontent.com/u/5477035?v=3"},
                "updated_at": "2015-04-08T0:50:58Z",
                "body": "core latest comment"
            }, {
                "issue_url": "https://api.github.com/repos/my-org/core/issues/945",
                "user": {"login": "baev", "avatar_url": "https://avatars.githubusercontent.com/u/5477035?v=3"},
                "updated_at": "2015-04-08T1:50:58Z",
                "body": "one of two comments"
            }, {
                "issue_url": "https://api.github.com/repos/my-org/core/issues/945",
                "user": {"login": "aristov", "avatar_url": "https://avatars.githubusercontent.com/u/5477035?v=3"},
                "updated_at": "2015-04-08T2:50:58Z",
                "body": "my comment"
            }],
            'my-org/extras': [{
                "issue_url": "https://api.github.com/repos/my-org/extras/issues/20",
                "user": {"login": "baev", "avatar_url": "https://avatars.githubusercontent.com/u/5477035?v=3"},
                "updated_at": "2014-04-08T3:50:58Z",
                "body": "comment from 20"
            }, {
                "issue_url": "https://api.github.com/repos/my-org/extras/issues/20",
                "user": {"login": "aristov", "avatar_url": "https://avatars.githubusercontent.com/u/5477035?v=3"},
                "updated_at": "2015-04-08T4:50:58Z",
                "body": "my comment"
            }, {
                "issue_url": "https://api.github.com/repos/my-org/extras/issues/23",
                "user": {"login": "baev", "avatar_url": "https://avatars.githubusercontent.com/u/5477035?v=3"},
                "updated_at": "2014-04-08T5:50:58Z",
                "body": "twenty-three"
            }],
            'my-org/examples': [{
                "issue_url": "https://api.github.com/repos/my-org/examples/issues/190",
                "user": {"login": "aristov", "avatar_url": "https://avatars.githubusercontent.com/u/5477035?v=3"},
                "updated_at": "2015-04-08T6:50:58Z",
                "body": "latest comment"
            }, {
                "issue_url": "https://api.github.com/repos/my-org/examples/issues/170",
                "user": {"login": "aristov", "avatar_url": "https://avatars.githubusercontent.com/u/5477035?v=3"},
                "updated_at": "2015-04-08T7:50:58Z",
                "body": "my comment"
            }, {
                "issue_url": "https://api.github.com/repos/my-org/examples/issues/145",
                "user": {"login": "aristov", "avatar_url": "https://avatars.githubusercontent.com/u/5477035?v=3"},
                "updated_at": "2015-04-08T8:50:58Z",
                "body": "my comment"
            }]
        };
        return Promise.resolve(comments[repo] || []);
    };
    backend.getPRCommits = function(issue) {
        var pullRequests = {
            'my-org/core/945': [{
                "commit": {
                    "author": {
                        "date": "2014-08-31T02:15:53Z"
                    },
                    "message": "bugfix: exception is now displayed in last failed step when there are multiple failed steps",
                },
                "html_url": "https://github.com/allure-framework/allure-core/commit/930be59274ca7773df62ee55d6e709b0161b78f6",
                "author": {
                    "login": "alkedr",
                    "avatar_url": "https://avatars.githubusercontent.com/u/2046080?v=3",
                    "html_url": "https://github.com/alkedr"
                }
            }],
            'my-org/extras/20': [{
                "commit": {
                    "author": {
                        "date": "2014-08-31T02:15:53Z"
                    },
                    "message": "bugfix: exception is now displayed in last failed step when there are multiple failed steps",
                },
                "html_url": "https://github.com/allure-framework/allure-core/commit/930be59274ca7773df62ee55d6e709b0161b78f6",
                "author": {
                    "login": "alkedr",
                    "avatar_url": "https://avatars.githubusercontent.com/u/2046080?v=3",
                    "html_url": "https://github.com/alkedr"
                }
            }]
        };
        return Promise.resolve(pullRequests[[issue.organization, issue.repository, issue.id].join('/')] || []);
    };
    backend.getCollaborators = function() {
        return Promise.resolve(
            [{
                "login": "just-boris",
                "avatar_url": "https://avatars.githubusercontent.com/u/812240?v=3",
                "html_url": "https://github.com/just-boris"
            }, {
                "login": "baev",
                "avatar_url": "https://avatars.githubusercontent.com/u/2149631?v=3",
                "html_url": "https://github.com/baev"
            }, {
                "login": "qatools-ci",
                "avatar_url": "https://avatars.githubusercontent.com/u/4466920?v=3",
                "html_url": "https://github.com/qatools-ci"
            }]
        );
    };
    provide(backend);
});

/* end: ../../configs/development/common.blocks/github/__backend/github__backend.js */
/* begin: ../../libs/bem-components/common.blocks/link/_pseudo/link_pseudo.js */
/**
 * @module link
 */

modules.define('link', ['keyboard__codes'], function(provide, keyCodes, Link) {

/**
 * @exports
 * @class link
 * @bem
 */
provide(Link.decl({ modName : 'pseudo', modVal : true }, /** @lends link.prototype */{
    onSetMod : {
        'focused' : {
            'true' : function() {
                this.__base.apply(this, arguments);

                this.bindTo('control', 'keydown', this._onKeyDown);
            },
            '' : function() {
                this.__base.apply(this, arguments);

                this.unbindFrom('control', 'keydown', this._onKeyDown);
            }
        }
    },

    _onPointerClick : function(e) {
        e.preventDefault();

        this.__base.apply(this, arguments);
    },

    _onKeyDown : function(e) {
        e.keyCode === keyCodes.ENTER && this._onPointerClick(e);
    }
}));

});

/* end: ../../libs/bem-components/common.blocks/link/_pseudo/link_pseudo.js */
/* begin: ../../libs/bem-core/common.blocks/i-bem/__dom/_init/i-bem__dom_init_auto.js */
/**
 * Auto initialization on DOM ready
 */

modules.require(
    ['i-bem__dom_init', 'jquery', 'next-tick'],
    function(init, $, nextTick) {

$(function() {
    nextTick(init);
});

});

/* end: ../../libs/bem-core/common.blocks/i-bem/__dom/_init/i-bem__dom_init_auto.js */
/* begin: ../../libs/bem-core/common.blocks/loader/_type/loader_type_js.js */
/**
 * @module loader_type_js
 * @description Load JS from external URL.
 */

modules.define('loader_type_js', function(provide) {

var loading = {},
    loaded = {},
    head = document.getElementsByTagName('head')[0],
    runCallbacks = function(path, type) {
        var cbs = loading[path], cb, i = 0;
        delete loading[path];
        while(cb = cbs[i++]) {
            cb[type] && cb[type]();
        }
    },
    onSuccess = function(path) {
        loaded[path] = true;
        runCallbacks(path, 'success');
    },
    onError = function(path) {
        runCallbacks(path, 'error');
    };

provide(
    /**
     * @exports
     * @param {String} path resource link
     * @param {Function} success to be called if the script succeeds
     * @param {Function} error to be called if the script fails
     */
    function(path, success, error) {
        if(loaded[path]) {
            success();
            return;
        }

        if(loading[path]) {
            loading[path].push({ success : success, error : error });
            return;
        }

        loading[path] = [{ success : success, error : error }];

        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.charset = 'utf-8';
        script.src = (location.protocol === 'file:' && !path.indexOf('//')? 'http:' : '') + path;

        if('onload' in script) {
            script.onload = function() {
                script.onload = script.onerror = null;
                onSuccess(path);
            };

            script.onerror = function() {
                script.onload = script.onerror = null;
                onError(path);
            };
        } else {
            script.onreadystatechange = function() {
                var readyState = this.readyState;
                if(readyState === 'loaded' || readyState === 'complete') {
                    script.onreadystatechange = null;
                    onSuccess(path);
                }
            };
        }

        head.insertBefore(script, head.lastChild);
    }
);

});

/* end: ../../libs/bem-core/common.blocks/loader/_type/loader_type_js.js */
/* begin: ../../libs/bem-core/common.blocks/jquery/__event/_type/jquery__event_type_pointerpressrelease.js */
modules.define('jquery', function(provide, $) {

$.each({
    pointerpress : 'pointerdown',
    pointerrelease : 'pointerup pointercancel'
}, function(spec, origEvent) {
    function eventHandler(e) {
        var res, origType = e.handleObj.origType;

        if(e.which === 1) {
            e.type = spec;
            res = $.event.dispatch.apply(this, arguments);
            e.type = origType;
        }

        return res;
    }

    $.event.special[spec] = {
        setup : function() {
            $(this).on(origEvent, eventHandler);
            return false;
        },
        teardown : function() {
            $(this).off(origEvent, eventHandler);
            return false;
        }
    };
});

provide($);

});

/* end: ../../libs/bem-core/common.blocks/jquery/__event/_type/jquery__event_type_pointerpressrelease.js */
/* begin: ../../common.blocks/field/field.js */
modules.define('field',
    ['i-bem__dom'],
    function(provide, BEMDOM) {
        "use strict";
        provide(BEMDOM.decl(this.name, {
            onSetMod: {
                js: {
                    inited: function() {
                        this.findElem('remove').on('click', this._onRemoveClick.bind(this));
                    }
                }
            },

            _onRemoveClick: function() {
                this.emit('remove', this);
            },

            getValue: function() {
                return this.findElem('control').val();
            }
        }));
    });

/* end: ../../common.blocks/field/field.js */
/* begin: ../../libs/bem-components/design/common.blocks/popup/_theme/popup_theme_islands.js */
modules.define('popup', ['objects'], function(provide, objects, Popup) {

provide(Popup.decl({ modName : 'theme', modVal : 'islands' }, {
    getDefaultParams : function() {
        return objects.extend(
            this.__base(),
            {
                mainOffset : 5,
                viewportOffset : 10
            });
    }
}));

});

/* end: ../../libs/bem-components/design/common.blocks/popup/_theme/popup_theme_islands.js */
/* begin: ../../libs/bem-components/common.blocks/popup/_target/popup_target_anchor.js */
/**
 * @module popup
 */

modules.define(
    'popup',
    ['i-bem__dom', 'jquery', 'objects', 'functions__throttle'],
    function(provide, BEMDOM, $, objects, throttle, Popup) {

var body = $(BEMDOM.doc[0].body),
    UPDATE_TARGET_VISIBILITY_THROTTLING_INTERVAL = 100,
    undef;

/**
 * @exports
 * @class popup
 * @bem
 */
provide(Popup.decl({ modName : 'target', modVal : 'anchor' }, /** @lends popup.prototype */{
    beforeSetMod : {
        'visible' : {
            'true' : function() {
                if(!this._anchor)
                    throw Error('Can\'t show popup without anchor');
            }
        }
    },

    onSetMod : {
        'js' : {
            'inited' : function() {
                this.__base.apply(this, arguments);

                this._anchor = null;
                this._anchorParents = null;
                this._destructor = null;
                this._isAnchorVisible = undef;
                this._updateIsAnchorVisible = throttle(
                    this._updateIsAnchorVisible,
                    UPDATE_TARGET_VISIBILITY_THROTTLING_INTERVAL,
                    false,
                    this);
            },

            '' : function() {
                this.__base.apply(this, arguments);
                this._unbindFromDestructor(); // don't destruct anchor as it might be the same anchor for several popups
            }
        },

        'visible' : {
            'true' : function() {
                this._anchorParents = this._anchor.parents();
                this._bindToAnchorParents();

                this.__base.apply(this, arguments);
            },

            '' : function() {
                this.__base.apply(this, arguments);

                this._unbindFromAnchorParents();
                this._anchorParents = null;
                this._isAnchorVisible = undef;
            }
        }
    },

    /**
     * Sets target
     * @param {jQuery|BEMDOM} anchor DOM elem or anchor BEMDOM block
     * @returns {popup} this
     */
    setAnchor : function(anchor) {
        this
            ._unbindFromAnchorParents()
            ._unbindFromParentPopup()
            ._unbindFromDestructor();

        this._anchor = anchor instanceof BEMDOM?
            anchor.domElem :
            anchor;

        this._destructor = this._anchor.bem('_' + this.__self.getName() + '-destructor');
        this._isAnchorVisible = undef;

        this._bindToDestructor();

        if(this.hasMod('visible')) {
            this._anchorParents = this._anchor.parents();
            this
                ._recaptureZIndex()
                ._bindToAnchorParents()
                ._bindToParentPopup()
                .redraw();
        } else {
            this._anchorParents = null;
            this._zIndexGroupLevel = null;
        }

        return this;
    },

    /**
     * @override
     */
    _calcTargetDimensions : function() {
        var anchor = this._anchor,
            anchorOffset = anchor.offset(),
            bodyOffset = body.css('position') === 'static'?
                { left : 0, top : 0 } :
                body.offset();

        return {
            left : anchorOffset.left - bodyOffset.left,
            top : anchorOffset.top - bodyOffset.top,
            width : anchor.outerWidth(),
            height : anchor.outerHeight()
        };
    },

    /**
     * @override
     */
    _calcDrawingCss : function(drawingParams) {
        typeof this._isAnchorVisible === 'undefined' &&
            (this._isAnchorVisible = this._calcIsAnchorVisible());

        return objects.extend(
            this.__base(drawingParams),
            { display : this._isAnchorVisible? '' : 'none' });
    },

    /**
     * Calculates target visibility state
     * @private
     * @returns {Boolean} Whether state is visible
     */
    _calcIsAnchorVisible : function() {
        var anchor = this._anchor,
            anchorOffset = anchor.offset(),
            anchorLeft = anchorOffset.left,
            anchorTop = anchorOffset.top,
            anchorRight = anchorLeft + anchor.outerWidth(),
            anchorBottom = anchorTop + anchor.outerHeight(),
            direction = this.getMod('direction'),
            vertBorder = Math.floor(this._checkMainDirection(direction, 'top') ||
                    this._checkSecondaryDirection(direction, 'top')?
                anchorTop :
                anchorBottom),
            horizBorder = Math.floor(this._checkMainDirection(direction, 'left') ||
                    this._checkSecondaryDirection(direction, 'left')?
                anchorLeft :
                anchorRight),
            res = true;

        this._anchorParents.each(function() {
            if(this.tagName === 'BODY') return false;

            var parent = $(this),
                overflowY = parent.css('overflow-y'),
                checkOverflowY = overflowY === 'scroll' || overflowY === 'hidden' || overflowY === 'auto',
                overflowX = parent.css('overflow-x'),
                checkOverflowX = overflowX === 'scroll' || overflowX === 'hidden' || overflowX === 'auto';

            if(checkOverflowY || checkOverflowX) {
                var parentOffset = parent.offset();

                if(checkOverflowY) {
                    var parentTopOffset = Math.floor(parentOffset.top);
                    if(vertBorder < parentTopOffset || parentTopOffset + parent.outerHeight() < vertBorder) {
                        return res = false;
                    }
                }

                if(checkOverflowX) {
                    var parentLeftOffset = Math.floor(parentOffset.left);
                    return res = !(
                        horizBorder < parentLeftOffset ||
                        parentLeftOffset + parent.outerWidth() < horizBorder);
                }
            }
        });

        return res;
    },

    _calcZIndexGroupLevel : function() {
        var res = this.__base.apply(this, arguments);

        return this._destructor.findBlocksOutside('z-index-group').reduce(
            function(res, zIndexGroup) {
                return res + Number(zIndexGroup.getMod('level'));
            },
            res);
    },

    _bindToAnchorParents : function() {
        return this.bindTo(
            this._anchorParents,
            'scroll',
            this._onAnchorParentsScroll);
    },

    _unbindFromAnchorParents : function() {
        this._anchorParents && this.unbindFrom(
            this._anchorParents,
            'scroll',
            this._onAnchorParentsScroll);
        return this;
    },

    _onAnchorParentsScroll : function() {
        this
            .redraw()
            ._updateIsAnchorVisible();
    },

    /**
     * @override
     */
    _onWinScrollAndResize : function() {
        this.__base.apply(this, arguments);
        this._updateIsAnchorVisible();
    },

    _updateIsAnchorVisible : function() {
        if(!this.hasMod('js', 'inited') || !this.hasMod('visible'))
            return;

        var isAnchorVisible = this._calcIsAnchorVisible();
        if(isAnchorVisible !== this._isAnchorVisible) {
            this._isAnchorVisible = isAnchorVisible;
            this.redraw();
        }
    },

    _bindToDestructor : function() {
        this._destructor.on({ modName : 'js', modVal : '' }, this._onPopupAnchorDestruct, this);
        return this;
    },

    _unbindFromDestructor : function() {
        this._destructor &&
            this._destructor.un({ modName : 'js', modVal : '' }, this._onPopupAnchorDestruct, this);
        return this;
    },

    _onPopupAnchorDestruct : function() {
        BEMDOM.destruct(this.domElem);
    },

    _getParentPopup : function() {
        return this._parentPopup === undef?
            this._parentPopup = this.findBlockOutside(this._anchor, this.__self.getName()) :
            this._parentPopup;
    }
}));

});

/* end: ../../libs/bem-components/common.blocks/popup/_target/popup_target_anchor.js */
/* begin: ../../libs/bem-components/common.blocks/select/_mode/select_mode_radio-check.js */
/**
 * @module select
 */

modules.define('select', ['jquery'], function(provide, $, Select) {

/**
 * @exports
 * @class select
 * @bem
 */
provide(Select.decl({ modName : 'mode', modVal : 'radio-check' }, /** @lends select.prototype */{
    _updateControl : function() {
        var val = this.getVal(),
            control = this.elem('control');

        if(!control.length) {
            control = $(Select._createControlHTML(this.getName(), val));
            this.dropElemCache('control');
        }

        if(typeof val === 'undefined') {
            // NOTE: because there is a possibility of whole select disabling,
            // "remove" is used instead of "disable"
            control.remove();
        } else {
            control.parent().length || this.domElem.prepend(control);
            control.val(val);
        }
    },

    _updateButton : function() {
        var checkedItem = this._getCheckedItems()[0];

        this._button
            .toggleMod('checked', true, '', !!checkedItem)
            .setText(checkedItem? checkedItem.getText() : this.params.text);
    },

    _onMenuItemClick : function(_, data) {
        data.source === 'pointer' && this.delMod('opened');
    }
}));

});

/* end: ../../libs/bem-components/common.blocks/select/_mode/select_mode_radio-check.js */
/* begin: ../../libs/bem-components/common.blocks/menu/_mode/menu_mode_radio-check.js */
/**
 * @module menu
 */

modules.define('menu', function(provide, Menu) {

/**
 * @exports
 * @class menu
 * @bem
 */
provide(Menu.decl({ modName : 'mode', modVal : 'radio-check' }, /** @lends menu.prototype */{
    /**
     * @override
     */
    _getVal : function() {
        var items = this.getItems(),
            i = 0, item;
        while(item = items[i++])
            if(item.hasMod('checked'))
                return item.getVal();
    },

    /**
     * @override
     */
    _setVal : function(val) {
        var isValUndefined = typeof val === 'undefined',
            wasChanged = false,
            hasVal = false,
            itemsCheckedVals = this.getItems().map(function(item) {
                if(isValUndefined) {
                    item.hasMod('checked') && (wasChanged = true);
                    return false;
                }

                if(!item.isValEq(val)) return false;

                item.hasMod('checked') || (wasChanged = true);
                return hasVal = true;
            });

        if(!isValUndefined && !hasVal) return false;

        this._updateItemsCheckedMod(itemsCheckedVals);

        return wasChanged;
    },

    /**
     * @override
     */
    _onItemClick : function(clickedItem) {
        this.__base.apply(this, arguments);

        this.getItems().forEach(function(item) {
            item === clickedItem?
                item.toggleMod('checked') :
                item.delMod('checked');
        });
        this._isValValid = false;
        this.emit('change');
    }
}));

});

/* end: ../../libs/bem-components/common.blocks/menu/_mode/menu_mode_radio-check.js */
/* begin: ../../common.blocks/input/_type/input_type_datepicker.js */
modules.define('input', function(provide, Input) {

provide(Input.decl({ modName: 'type', modVal: 'datepicker' }, {

    onSetMod: {
        focused: {
            'true': function() {
                this.__base.apply(this, arguments);

                var popup = this._popup || (this._popup = this.findBlockInside('popup'));

                popup.setAnchor(this).setMod('visible');

                popup.findBlockInside('calendar').on('change', this._onCalendarChange, this);
            }
        }
    },

    _onCalendarChange: function(e, data) {
        var date = data.date,
            month = data.month;

        this.setVal([
            date < 10 ? '0' + date : date,
            month < 10 ? '0' + month : month,
            data.year
        ].join('.'));

        this._popup.delMod('visible');
    }

}));

});

/* end: ../../common.blocks/input/_type/input_type_datepicker.js */
/* begin: ../../common.blocks/fetch/fetch.js */
(function() {
  'use strict';

  if (self.fetch) {
    return
  }

  function Headers(headers) {
    this.map = {}

    var self = this
    if (headers instanceof Headers) {
      headers.forEach(function(name, values) {
        values.forEach(function(value) {
          self.append(name, value)
        })
      })

    } else if (headers) {
      Object.getOwnPropertyNames(headers).forEach(function(name) {
        self.append(name, headers[name])
      })
    }
  }

  Headers.prototype.append = function(name, value) {
    name = name.toLowerCase()
    var list = this.map[name]
    if (!list) {
      list = []
      this.map[name] = list
    }
    list.push(value)
  }

  Headers.prototype['delete'] = function(name) {
    delete this.map[name.toLowerCase()]
  }

  Headers.prototype.get = function(name) {
    var values = this.map[name.toLowerCase()]
    return values ? values[0] : null
  }

  Headers.prototype.getAll = function(name) {
    return this.map[name.toLowerCase()] || []
  }

  Headers.prototype.has = function(name) {
    return this.map.hasOwnProperty(name.toLowerCase())
  }

  Headers.prototype.set = function(name, value) {
    this.map[name.toLowerCase()] = [value]
  }

  // Instead of iterable for now.
  Headers.prototype.forEach = function(callback) {
    var self = this
    Object.getOwnPropertyNames(this.map).forEach(function(name) {
      callback(name, self.map[name])
    })
  }

  function consumed(body) {
    if (body.bodyUsed) {
      return Promise.reject(new TypeError('Already read'))
    }
    body.bodyUsed = true
  }

  function fileReaderReady(reader) {
    return new Promise(function(resolve, reject) {
      reader.onload = function() {
        resolve(reader.result)
      }
      reader.onerror = function() {
        reject(reader.error)
      }
    })
  }

  function readBlobAsArrayBuffer(blob) {
    var reader = new FileReader()
    reader.readAsArrayBuffer(blob)
    return fileReaderReady(reader)
  }

  function readBlobAsText(blob) {
    var reader = new FileReader()
    reader.readAsText(blob)
    return fileReaderReady(reader)
  }

  var support = {
    blob: 'FileReader' in self && 'Blob' in self && (function() {
      try {
        new Blob();
        return true
      } catch(e) {
        return false
      }
    })(),
    formData: 'FormData' in self
  }

  function Body() {
    this.bodyUsed = false

    if (support.blob) {
      this._initBody = function(body) {
        this._bodyInit = body
        if (typeof body === 'string') {
          this._bodyText = body
        } else if (support.blob && Blob.prototype.isPrototypeOf(body)) {
          this._bodyBlob = body
        } else if (support.formData && FormData.prototype.isPrototypeOf(body)) {
          this._bodyFormData = body
        } else if (!body) {
          this._bodyText = ''
        } else {
          throw new Error('unsupported BodyInit type')
        }
      }

      this.blob = function() {
        var rejected = consumed(this)
        if (rejected) {
          return rejected
        }

        if (this._bodyBlob) {
          return Promise.resolve(this._bodyBlob)
        } else if (this._bodyFormData) {
          throw new Error('could not read FormData body as blob')
        } else {
          return Promise.resolve(new Blob([this._bodyText]))
        }
      }

      this.arrayBuffer = function() {
        return this.blob().then(readBlobAsArrayBuffer)
      }

      this.text = function() {
        var rejected = consumed(this)
        if (rejected) {
          return rejected
        }

        if (this._bodyBlob) {
          return readBlobAsText(this._bodyBlob)
        } else if (this._bodyFormData) {
          throw new Error('could not read FormData body as text')
        } else {
          return Promise.resolve(this._bodyText)
        }
      }
    } else {
      this._initBody = function(body) {
        this._bodyInit = body
        if (typeof body === 'string') {
          this._bodyText = body
        } else if (support.formData && FormData.prototype.isPrototypeOf(body)) {
          this._bodyFormData = body
        } else if (!body) {
          this._bodyText = ''
        } else {
          throw new Error('unsupported BodyInit type')
        }
      }

      this.text = function() {
        var rejected = consumed(this)
        return rejected ? rejected : Promise.resolve(this._bodyText)
      }
    }

    if (support.formData) {
      this.formData = function() {
        return this.text().then(decode)
      }
    }

    this.json = function() {
      return this.text().then(JSON.parse)
    }

    return this
  }

  // HTTP methods whose capitalization should be normalized
  var methods = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT']

  function normalizeMethod(method) {
    var upcased = method.toUpperCase()
    return (methods.indexOf(upcased) > -1) ? upcased : method
  }

  function Request(url, options) {
    options = options || {}
    this.url = url

    this.credentials = options.credentials || 'omit'
    this.headers = new Headers(options.headers)
    this.method = normalizeMethod(options.method || 'GET')
    this.mode = options.mode || null
    this.referrer = null

    if ((this.method === 'GET' || this.method === 'HEAD') && options.body) {
      throw new TypeError('Body not allowed for GET or HEAD requests')
    }
    this._initBody(options.body)
  }

  function decode(body) {
    var form = new FormData()
    body.trim().split('&').forEach(function(bytes) {
      if (bytes) {
        var split = bytes.split('=')
        var name = split.shift().replace(/\+/g, ' ')
        var value = split.join('=').replace(/\+/g, ' ')
        form.append(decodeURIComponent(name), decodeURIComponent(value))
      }
    })
    return form
  }

  function headers(xhr) {
    var head = new Headers()
    var pairs = xhr.getAllResponseHeaders().trim().split('\n')
    pairs.forEach(function(header) {
      var split = header.trim().split(':')
      var key = split.shift().trim()
      var value = split.join(':').trim()
      head.append(key, value)
    })
    return head
  }

  Request.prototype.fetch = function() {
    var self = this

    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest()
      if (self.credentials === 'cors') {
        xhr.withCredentials = true;
      }

      function responseURL() {
        if ('responseURL' in xhr) {
          return xhr.responseURL
        }

        // Avoid security warnings on getResponseHeader when not allowed by CORS
        if (/^X-Request-URL:/m.test(xhr.getAllResponseHeaders())) {
          return xhr.getResponseHeader('X-Request-URL')
        }

        return;
      }

      xhr.onload = function() {
        var status = (xhr.status === 1223) ? 204 : xhr.status
        if (status < 100 || status > 599) {
          reject(new TypeError('Network request failed'))
          return
        }
        var options = {
          status: status,
          statusText: xhr.statusText,
          headers: headers(xhr),
          url: responseURL()
        }
        var body = 'response' in xhr ? xhr.response : xhr.responseText;
        resolve(new Response(body, options))
      }

      xhr.onerror = function() {
        reject(new TypeError('Network request failed'))
      }

      xhr.open(self.method, self.url, true)
      if ('responseType' in xhr && support.blob) {
        xhr.responseType = 'blob'
      }

      self.headers.forEach(function(name, values) {
        values.forEach(function(value) {
          xhr.setRequestHeader(name, value)
        })
      })

      xhr.send(typeof self._bodyInit === 'undefined' ? null : self._bodyInit)
    })
  }

  Body.call(Request.prototype)

  function Response(bodyInit, options) {
    if (!options) {
      options = {}
    }

    this._initBody(bodyInit)
    this.type = 'default'
    this.url = null
    this.status = options.status
    this.statusText = options.statusText
    this.headers = options.headers
    this.url = options.url || ''
  }

  Body.call(Response.prototype)

  self.Headers = Headers;
  self.Request = Request;
  self.Response = Response;

  self.fetch = function (url, options) {
    return new Request(url, options).fetch()
  }
  self.fetch.polyfill = true
})();

/* end: ../../common.blocks/fetch/fetch.js */
/* begin: ../../common.blocks/github/github.js */
/**
 * @module dom
 * @description some DOM utils
 */

modules.define('github', ['github__backend'], function(provide, backend) {
    "use strict";

    var R_ISO8601_STR = /^(\d{4})-?(\d\d)-?(\d\d)(?:T(\d\d?)(?::?(\d\d)(?::?(\d\d)(?:\.(\d+))?)?)?(Z|([+-])(\d\d):?(\d\d))?)?$/;
    // 1        2       3         4          5          6          7          8  9     10      11
    function jsonStringToDate(string) {
        var match;
        if (match = string.match(R_ISO8601_STR)) {
            var date = new Date(0),
                tzHour = 0,
                tzMin  = 0,
                dateSetter = match[8] ? date.setUTCFullYear : date.setFullYear,
                timeSetter = match[8] ? date.setUTCHours : date.setHours;

            if (match[9]) {
                tzHour = Number(match[9] + match[10]);
                tzMin = Number(match[9] + match[11]);
            }
            dateSetter.call(date, Number(match[1]), Number(match[2]) - 1, Number(match[3]));
            var h = Number(match[4] || 0) - tzHour;
            var m = Number(match[5] || 0) - tzMin;
            var s = Number(match[6] || 0);
            var ms = Math.round(parseFloat('0.' + (match[7] || 0)) * 1000);
            timeSetter.call(date, h, m, s, ms);
            return date;
        }
        return string;
    }

    function flatten(array) {
        return Array.prototype.concat.apply([], array);
    }
    function lastCommentActivity(issue) {
        if(issue.comment) {
            issue.lastActivity = issue.comment;
        } else {
            issue.lastActivity = {
                type: 'create',
                issueUrl: issue.url,
                author: issue.author,
                date: issue.date
            };
        }
        return issue;
    }
    function lastActivity(issue, options) {
        lastCommentActivity(issue);
        if(issue.isPullRequest) {
            return backend.getPRCommits(issue, options).then(function(commits) {
                if(commits.length > 0) {
                    var lastCommit = commits.slice(-1)[0],
                        commitDate = jsonStringToDate(lastCommit.commit.author.date);
                    if(commitDate > issue.lastActivity.date) {
                        issue.lastActivity = {
                            type: 'commit',
                            issueUrl: lastCommit.html_url,
                            author: {
                                login: lastCommit.author.login,
                                avatarUrl: lastCommit.author.avatar_url,
                                url: lastCommit.author.html_url
                            },
                            date: commitDate
                        };
                    }
                }
                return issue;
            });
        } else {
            return issue;
        }

    }
    provide(/** @exports */{
        getRepos: function(organization, options) {
            options = options || {};
            return backend.getRepos(organization, options);
        },
        getIssues: function(repositories, options) {
            options = options || {};
            return Promise.all(repositories.map(function(repo) {
                var repository = repo.split('/');
                return Promise.all([
                    backend.getIssues(repo, options).then(function(issues) {
                        return issues.map(function(issue) {
                            return {
                                id: issue.number,
                                url: issue.html_url,
                                author: {
                                    login: issue.user.login,
                                    avatarUrl: issue.user.avatar_url,
                                    url: issue.user.html_url
                                },
                                date: jsonStringToDate(issue.updated_at),
                                apiUrl: issue.url,
                                organization: repository[0],
                                repository: repository[1],
                                title: issue.title,
                                labels: issue.labels,
                                isPullRequest: !!issue.pull_request
                            };
                        });
                    }),
                    backend.getComments(repo, options).then(function(comments) {
                        return comments.map(function(comment) {
                            return {
                                type: 'comment',
                                issueUrl: comment.issue_url,
                                author: {
                                    login: comment.user.login,
                                    avatarUrl: comment.user.avatar_url,
                                    url: comment.user.html_url
                                },
                                date: jsonStringToDate(comment.updated_at),
                                text: comment.body
                            };
                        });
                    }),
                    backend.getCollaborators(repo, options).then(function(collaborators) {
                        return collaborators.map(function(collaborator) {
                            return collaborator.login;
                        });
                    })
                ]).then(function(data) {
                    var issues = data[0],
                        comments = data[1],
                        collaborators = data[2];
                    return Promise.all(issues.map(function(issue) {
                        issue.comment = comments.filter(function(comment) {
                            return comment.issueUrl === issue.apiUrl;
                        })[0];
                        return Promise.resolve(lastActivity(issue, options)).then(function(issue) {
                            issue.answered = collaborators.indexOf(issue.lastActivity.author.login) > -1;
                            return issue;
                        });
                    }));
                });
            })).then(flatten).then(function(results) {
                return results.reduce(function(all, issue) {
                    all[issue.answered ? 'answered': 'unanswered'].push(issue);
                    return all;
                }, {answered: [], unanswered: []});
            });
        }
    });
});

/* end: ../../common.blocks/github/github.js */
/* begin: ../../common.blocks/moment/moment.browser.js */
/* ../../libs/moment/moment.js begin */
//! moment.js
//! version : 2.10.2
//! authors : Tim Wood, Iskren Chernev, Moment.js contributors
//! license : MIT
//! momentjs.com

(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    global.moment = factory()
}(this, function () { 'use strict';

    var hookCallback;

    function utils_hooks__hooks () {
        return hookCallback.apply(null, arguments);
    }

    // This is done to register the method called with moment()
    // without creating circular dependencies.
    function setHookCallback (callback) {
        hookCallback = callback;
    }

    function defaultParsingFlags() {
        // We need to deep clone this object.
        return {
            empty           : false,
            unusedTokens    : [],
            unusedInput     : [],
            overflow        : -2,
            charsLeftOver   : 0,
            nullInput       : false,
            invalidMonth    : null,
            invalidFormat   : false,
            userInvalidated : false,
            iso             : false
        };
    }

    function isArray(input) {
        return Object.prototype.toString.call(input) === '[object Array]';
    }

    function isDate(input) {
        return Object.prototype.toString.call(input) === '[object Date]' || input instanceof Date;
    }

    function map(arr, fn) {
        var res = [], i;
        for (i = 0; i < arr.length; ++i) {
            res.push(fn(arr[i], i));
        }
        return res;
    }

    function hasOwnProp(a, b) {
        return Object.prototype.hasOwnProperty.call(a, b);
    }

    function extend(a, b) {
        for (var i in b) {
            if (hasOwnProp(b, i)) {
                a[i] = b[i];
            }
        }

        if (hasOwnProp(b, 'toString')) {
            a.toString = b.toString;
        }

        if (hasOwnProp(b, 'valueOf')) {
            a.valueOf = b.valueOf;
        }

        return a;
    }

    function create_utc__createUTC (input, format, locale, strict) {
        return createLocalOrUTC(input, format, locale, strict, true).utc();
    }

    function valid__isValid(m) {
        if (m._isValid == null) {
            m._isValid = !isNaN(m._d.getTime()) &&
                m._pf.overflow < 0 &&
                !m._pf.empty &&
                !m._pf.invalidMonth &&
                !m._pf.nullInput &&
                !m._pf.invalidFormat &&
                !m._pf.userInvalidated;

            if (m._strict) {
                m._isValid = m._isValid &&
                    m._pf.charsLeftOver === 0 &&
                    m._pf.unusedTokens.length === 0 &&
                    m._pf.bigHour === undefined;
            }
        }
        return m._isValid;
    }

    function valid__createInvalid (flags) {
        var m = create_utc__createUTC(NaN);
        if (flags != null) {
            extend(m._pf, flags);
        }
        else {
            m._pf.userInvalidated = true;
        }

        return m;
    }

    var momentProperties = utils_hooks__hooks.momentProperties = [];

    function copyConfig(to, from) {
        var i, prop, val;

        if (typeof from._isAMomentObject !== 'undefined') {
            to._isAMomentObject = from._isAMomentObject;
        }
        if (typeof from._i !== 'undefined') {
            to._i = from._i;
        }
        if (typeof from._f !== 'undefined') {
            to._f = from._f;
        }
        if (typeof from._l !== 'undefined') {
            to._l = from._l;
        }
        if (typeof from._strict !== 'undefined') {
            to._strict = from._strict;
        }
        if (typeof from._tzm !== 'undefined') {
            to._tzm = from._tzm;
        }
        if (typeof from._isUTC !== 'undefined') {
            to._isUTC = from._isUTC;
        }
        if (typeof from._offset !== 'undefined') {
            to._offset = from._offset;
        }
        if (typeof from._pf !== 'undefined') {
            to._pf = from._pf;
        }
        if (typeof from._locale !== 'undefined') {
            to._locale = from._locale;
        }

        if (momentProperties.length > 0) {
            for (i in momentProperties) {
                prop = momentProperties[i];
                val = from[prop];
                if (typeof val !== 'undefined') {
                    to[prop] = val;
                }
            }
        }

        return to;
    }

    var updateInProgress = false;

    // Moment prototype object
    function Moment(config) {
        copyConfig(this, config);
        this._d = new Date(+config._d);
        // Prevent infinite loop in case updateOffset creates new moment
        // objects.
        if (updateInProgress === false) {
            updateInProgress = true;
            utils_hooks__hooks.updateOffset(this);
            updateInProgress = false;
        }
    }

    function isMoment (obj) {
        return obj instanceof Moment || (obj != null && hasOwnProp(obj, '_isAMomentObject'));
    }

    function toInt(argumentForCoercion) {
        var coercedNumber = +argumentForCoercion,
            value = 0;

        if (coercedNumber !== 0 && isFinite(coercedNumber)) {
            if (coercedNumber >= 0) {
                value = Math.floor(coercedNumber);
            } else {
                value = Math.ceil(coercedNumber);
            }
        }

        return value;
    }

    function compareArrays(array1, array2, dontConvert) {
        var len = Math.min(array1.length, array2.length),
            lengthDiff = Math.abs(array1.length - array2.length),
            diffs = 0,
            i;
        for (i = 0; i < len; i++) {
            if ((dontConvert && array1[i] !== array2[i]) ||
                (!dontConvert && toInt(array1[i]) !== toInt(array2[i]))) {
                diffs++;
            }
        }
        return diffs + lengthDiff;
    }

    function Locale() {
    }

    var locales = {};
    var globalLocale;

    function normalizeLocale(key) {
        return key ? key.toLowerCase().replace('_', '-') : key;
    }

    // pick the locale from the array
    // try ['en-au', 'en-gb'] as 'en-au', 'en-gb', 'en', as in move through the list trying each
    // substring from most specific to least, but move to the next array item if it's a more specific variant than the current root
    function chooseLocale(names) {
        var i = 0, j, next, locale, split;

        while (i < names.length) {
            split = normalizeLocale(names[i]).split('-');
            j = split.length;
            next = normalizeLocale(names[i + 1]);
            next = next ? next.split('-') : null;
            while (j > 0) {
                locale = loadLocale(split.slice(0, j).join('-'));
                if (locale) {
                    return locale;
                }
                if (next && next.length >= j && compareArrays(split, next, true) >= j - 1) {
                    //the next array item is better than a shallower substring of this one
                    break;
                }
                j--;
            }
            i++;
        }
        return null;
    }

    function loadLocale(name) {
        var oldLocale = null;
        // TODO: Find a better way to register and load all the locales in Node
        if (!locales[name] && typeof module !== 'undefined' &&
                module && module.exports) {
            try {
                oldLocale = globalLocale._abbr;
                require('./locale/' + name);
                // because defineLocale currently also sets the global locale, we
                // want to undo that for lazy loaded locales
                locale_locales__getSetGlobalLocale(oldLocale);
            } catch (e) { }
        }
        return locales[name];
    }

    // This function will load locale and then set the global locale.  If
    // no arguments are passed in, it will simply return the current global
    // locale key.
    function locale_locales__getSetGlobalLocale (key, values) {
        var data;
        if (key) {
            if (typeof values === 'undefined') {
                data = locale_locales__getLocale(key);
            }
            else {
                data = defineLocale(key, values);
            }

            if (data) {
                // moment.duration._locale = moment._locale = data;
                globalLocale = data;
            }
        }

        return globalLocale._abbr;
    }

    function defineLocale (name, values) {
        if (values !== null) {
            values.abbr = name;
            if (!locales[name]) {
                locales[name] = new Locale();
            }
            locales[name].set(values);

            // backwards compat for now: also set the locale
            locale_locales__getSetGlobalLocale(name);

            return locales[name];
        } else {
            // useful for testing
            delete locales[name];
            return null;
        }
    }

    // returns locale data
    function locale_locales__getLocale (key) {
        var locale;

        if (key && key._locale && key._locale._abbr) {
            key = key._locale._abbr;
        }

        if (!key) {
            return globalLocale;
        }

        if (!isArray(key)) {
            //short-circuit everything else
            locale = loadLocale(key);
            if (locale) {
                return locale;
            }
            key = [key];
        }

        return chooseLocale(key);
    }

    var aliases = {};

    function addUnitAlias (unit, shorthand) {
        var lowerCase = unit.toLowerCase();
        aliases[lowerCase] = aliases[lowerCase + 's'] = aliases[shorthand] = unit;
    }

    function normalizeUnits(units) {
        return typeof units === 'string' ? aliases[units] || aliases[units.toLowerCase()] : undefined;
    }

    function normalizeObjectUnits(inputObject) {
        var normalizedInput = {},
            normalizedProp,
            prop;

        for (prop in inputObject) {
            if (hasOwnProp(inputObject, prop)) {
                normalizedProp = normalizeUnits(prop);
                if (normalizedProp) {
                    normalizedInput[normalizedProp] = inputObject[prop];
                }
            }
        }

        return normalizedInput;
    }

    function makeGetSet (unit, keepTime) {
        return function (value) {
            if (value != null) {
                get_set__set(this, unit, value);
                utils_hooks__hooks.updateOffset(this, keepTime);
                return this;
            } else {
                return get_set__get(this, unit);
            }
        };
    }

    function get_set__get (mom, unit) {
        return mom._d['get' + (mom._isUTC ? 'UTC' : '') + unit]();
    }

    function get_set__set (mom, unit, value) {
        return mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](value);
    }

    // MOMENTS

    function getSet (units, value) {
        var unit;
        if (typeof units === 'object') {
            for (unit in units) {
                this.set(unit, units[unit]);
            }
        } else {
            units = normalizeUnits(units);
            if (typeof this[units] === 'function') {
                return this[units](value);
            }
        }
        return this;
    }

    function zeroFill(number, targetLength, forceSign) {
        var output = '' + Math.abs(number),
            sign = number >= 0;

        while (output.length < targetLength) {
            output = '0' + output;
        }
        return (sign ? (forceSign ? '+' : '') : '-') + output;
    }

    var formattingTokens = /(\[[^\[]*\])|(\\)?(Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|Q|YYYYYY|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|mm?|ss?|S{1,4}|x|X|zz?|ZZ?|.)/g;

    var localFormattingTokens = /(\[[^\[]*\])|(\\)?(LTS|LT|LL?L?L?|l{1,4})/g;

    var formatFunctions = {};

    var formatTokenFunctions = {};

    // token:    'M'
    // padded:   ['MM', 2]
    // ordinal:  'Mo'
    // callback: function () { this.month() + 1 }
    function addFormatToken (token, padded, ordinal, callback) {
        var func = callback;
        if (typeof callback === 'string') {
            func = function () {
                return this[callback]();
            };
        }
        if (token) {
            formatTokenFunctions[token] = func;
        }
        if (padded) {
            formatTokenFunctions[padded[0]] = function () {
                return zeroFill(func.apply(this, arguments), padded[1], padded[2]);
            };
        }
        if (ordinal) {
            formatTokenFunctions[ordinal] = function () {
                return this.localeData().ordinal(func.apply(this, arguments), token);
            };
        }
    }

    function removeFormattingTokens(input) {
        if (input.match(/\[[\s\S]/)) {
            return input.replace(/^\[|\]$/g, '');
        }
        return input.replace(/\\/g, '');
    }

    function makeFormatFunction(format) {
        var array = format.match(formattingTokens), i, length;

        for (i = 0, length = array.length; i < length; i++) {
            if (formatTokenFunctions[array[i]]) {
                array[i] = formatTokenFunctions[array[i]];
            } else {
                array[i] = removeFormattingTokens(array[i]);
            }
        }

        return function (mom) {
            var output = '';
            for (i = 0; i < length; i++) {
                output += array[i] instanceof Function ? array[i].call(mom, format) : array[i];
            }
            return output;
        };
    }

    // format date using native date object
    function formatMoment(m, format) {
        if (!m.isValid()) {
            return m.localeData().invalidDate();
        }

        format = expandFormat(format, m.localeData());

        if (!formatFunctions[format]) {
            formatFunctions[format] = makeFormatFunction(format);
        }

        return formatFunctions[format](m);
    }

    function expandFormat(format, locale) {
        var i = 5;

        function replaceLongDateFormatTokens(input) {
            return locale.longDateFormat(input) || input;
        }

        localFormattingTokens.lastIndex = 0;
        while (i >= 0 && localFormattingTokens.test(format)) {
            format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);
            localFormattingTokens.lastIndex = 0;
            i -= 1;
        }

        return format;
    }

    var match1         = /\d/;            //       0 - 9
    var match2         = /\d\d/;          //      00 - 99
    var match3         = /\d{3}/;         //     000 - 999
    var match4         = /\d{4}/;         //    0000 - 9999
    var match6         = /[+-]?\d{6}/;    // -999999 - 999999
    var match1to2      = /\d\d?/;         //       0 - 99
    var match1to3      = /\d{1,3}/;       //       0 - 999
    var match1to4      = /\d{1,4}/;       //       0 - 9999
    var match1to6      = /[+-]?\d{1,6}/;  // -999999 - 999999

    var matchUnsigned  = /\d+/;           //       0 - inf
    var matchSigned    = /[+-]?\d+/;      //    -inf - inf

    var matchOffset    = /Z|[+-]\d\d:?\d\d/gi; // +00:00 -00:00 +0000 -0000 or Z

    var matchTimestamp = /[+-]?\d+(\.\d{1,3})?/; // 123456789 123456789.123

    // any word (or two) characters or numbers including two/three word month in arabic.
    var matchWord = /[0-9]*['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+|[\u0600-\u06FF\/]+(\s*?[\u0600-\u06FF]+){1,2}/i;

    var regexes = {};

    function addRegexToken (token, regex, strictRegex) {
        regexes[token] = typeof regex === 'function' ? regex : function (isStrict) {
            return (isStrict && strictRegex) ? strictRegex : regex;
        };
    }

    function getParseRegexForToken (token, config) {
        if (!hasOwnProp(regexes, token)) {
            return new RegExp(unescapeFormat(token));
        }

        return regexes[token](config._strict, config._locale);
    }

    // Code from http://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
    function unescapeFormat(s) {
        return s.replace('\\', '').replace(/\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g, function (matched, p1, p2, p3, p4) {
            return p1 || p2 || p3 || p4;
        }).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    var tokens = {};

    function addParseToken (token, callback) {
        var i, func = callback;
        if (typeof token === 'string') {
            token = [token];
        }
        if (typeof callback === 'number') {
            func = function (input, array) {
                array[callback] = toInt(input);
            };
        }
        for (i = 0; i < token.length; i++) {
            tokens[token[i]] = func;
        }
    }

    function addWeekParseToken (token, callback) {
        addParseToken(token, function (input, array, config, token) {
            config._w = config._w || {};
            callback(input, config._w, config, token);
        });
    }

    function addTimeToArrayFromToken(token, input, config) {
        if (input != null && hasOwnProp(tokens, token)) {
            tokens[token](input, config._a, config, token);
        }
    }

    var YEAR = 0;
    var MONTH = 1;
    var DATE = 2;
    var HOUR = 3;
    var MINUTE = 4;
    var SECOND = 5;
    var MILLISECOND = 6;

    function daysInMonth(year, month) {
        return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    }

    // FORMATTING

    addFormatToken('M', ['MM', 2], 'Mo', function () {
        return this.month() + 1;
    });

    addFormatToken('MMM', 0, 0, function (format) {
        return this.localeData().monthsShort(this, format);
    });

    addFormatToken('MMMM', 0, 0, function (format) {
        return this.localeData().months(this, format);
    });

    // ALIASES

    addUnitAlias('month', 'M');

    // PARSING

    addRegexToken('M',    match1to2);
    addRegexToken('MM',   match1to2, match2);
    addRegexToken('MMM',  matchWord);
    addRegexToken('MMMM', matchWord);

    addParseToken(['M', 'MM'], function (input, array) {
        array[MONTH] = toInt(input) - 1;
    });

    addParseToken(['MMM', 'MMMM'], function (input, array, config, token) {
        var month = config._locale.monthsParse(input, token, config._strict);
        // if we didn't find a month name, mark the date as invalid.
        if (month != null) {
            array[MONTH] = month;
        } else {
            config._pf.invalidMonth = input;
        }
    });

    // LOCALES

    var defaultLocaleMonths = 'January_February_March_April_May_June_July_August_September_October_November_December'.split('_');
    function localeMonths (m) {
        return this._months[m.month()];
    }

    var defaultLocaleMonthsShort = 'Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec'.split('_');
    function localeMonthsShort (m) {
        return this._monthsShort[m.month()];
    }

    function localeMonthsParse (monthName, format, strict) {
        var i, mom, regex;

        if (!this._monthsParse) {
            this._monthsParse = [];
            this._longMonthsParse = [];
            this._shortMonthsParse = [];
        }

        for (i = 0; i < 12; i++) {
            // make the regex if we don't have it already
            mom = create_utc__createUTC([2000, i]);
            if (strict && !this._longMonthsParse[i]) {
                this._longMonthsParse[i] = new RegExp('^' + this.months(mom, '').replace('.', '') + '$', 'i');
                this._shortMonthsParse[i] = new RegExp('^' + this.monthsShort(mom, '').replace('.', '') + '$', 'i');
            }
            if (!strict && !this._monthsParse[i]) {
                regex = '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');
                this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
            }
            // test the regex
            if (strict && format === 'MMMM' && this._longMonthsParse[i].test(monthName)) {
                return i;
            } else if (strict && format === 'MMM' && this._shortMonthsParse[i].test(monthName)) {
                return i;
            } else if (!strict && this._monthsParse[i].test(monthName)) {
                return i;
            }
        }
    }

    // MOMENTS

    function setMonth (mom, value) {
        var dayOfMonth;

        // TODO: Move this out of here!
        if (typeof value === 'string') {
            value = mom.localeData().monthsParse(value);
            // TODO: Another silent failure?
            if (typeof value !== 'number') {
                return mom;
            }
        }

        dayOfMonth = Math.min(mom.date(), daysInMonth(mom.year(), value));
        mom._d['set' + (mom._isUTC ? 'UTC' : '') + 'Month'](value, dayOfMonth);
        return mom;
    }

    function getSetMonth (value) {
        if (value != null) {
            setMonth(this, value);
            utils_hooks__hooks.updateOffset(this, true);
            return this;
        } else {
            return get_set__get(this, 'Month');
        }
    }

    function getDaysInMonth () {
        return daysInMonth(this.year(), this.month());
    }

    function checkOverflow (m) {
        var overflow;
        var a = m._a;

        if (a && m._pf.overflow === -2) {
            overflow =
                a[MONTH]       < 0 || a[MONTH]       > 11  ? MONTH :
                a[DATE]        < 1 || a[DATE]        > daysInMonth(a[YEAR], a[MONTH]) ? DATE :
                a[HOUR]        < 0 || a[HOUR]        > 24 || (a[HOUR] === 24 && (a[MINUTE] !== 0 || a[SECOND] !== 0 || a[MILLISECOND] !== 0)) ? HOUR :
                a[MINUTE]      < 0 || a[MINUTE]      > 59  ? MINUTE :
                a[SECOND]      < 0 || a[SECOND]      > 59  ? SECOND :
                a[MILLISECOND] < 0 || a[MILLISECOND] > 999 ? MILLISECOND :
                -1;

            if (m._pf._overflowDayOfYear && (overflow < YEAR || overflow > DATE)) {
                overflow = DATE;
            }

            m._pf.overflow = overflow;
        }

        return m;
    }

    function warn(msg) {
        if (utils_hooks__hooks.suppressDeprecationWarnings === false && typeof console !== 'undefined' && console.warn) {
            console.warn('Deprecation warning: ' + msg);
        }
    }

    function deprecate(msg, fn) {
        var firstTime = true;
        return extend(function () {
            if (firstTime) {
                warn(msg);
                firstTime = false;
            }
            return fn.apply(this, arguments);
        }, fn);
    }

    var deprecations = {};

    function deprecateSimple(name, msg) {
        if (!deprecations[name]) {
            warn(msg);
            deprecations[name] = true;
        }
    }

    utils_hooks__hooks.suppressDeprecationWarnings = false;

    var from_string__isoRegex = /^\s*(?:[+-]\d{6}|\d{4})-(?:(\d\d-\d\d)|(W\d\d$)|(W\d\d-\d)|(\d\d\d))((T| )(\d\d(:\d\d(:\d\d(\.\d+)?)?)?)?([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/;

    var isoDates = [
        ['YYYYYY-MM-DD', /[+-]\d{6}-\d{2}-\d{2}/],
        ['YYYY-MM-DD', /\d{4}-\d{2}-\d{2}/],
        ['GGGG-[W]WW-E', /\d{4}-W\d{2}-\d/],
        ['GGGG-[W]WW', /\d{4}-W\d{2}/],
        ['YYYY-DDD', /\d{4}-\d{3}/]
    ];

    // iso time formats and regexes
    var isoTimes = [
        ['HH:mm:ss.SSSS', /(T| )\d\d:\d\d:\d\d\.\d+/],
        ['HH:mm:ss', /(T| )\d\d:\d\d:\d\d/],
        ['HH:mm', /(T| )\d\d:\d\d/],
        ['HH', /(T| )\d\d/]
    ];

    var aspNetJsonRegex = /^\/?Date\((\-?\d+)/i;

    // date from iso format
    function configFromISO(config) {
        var i, l,
            string = config._i,
            match = from_string__isoRegex.exec(string);

        if (match) {
            config._pf.iso = true;
            for (i = 0, l = isoDates.length; i < l; i++) {
                if (isoDates[i][1].exec(string)) {
                    // match[5] should be 'T' or undefined
                    config._f = isoDates[i][0] + (match[6] || ' ');
                    break;
                }
            }
            for (i = 0, l = isoTimes.length; i < l; i++) {
                if (isoTimes[i][1].exec(string)) {
                    config._f += isoTimes[i][0];
                    break;
                }
            }
            if (string.match(matchOffset)) {
                config._f += 'Z';
            }
            configFromStringAndFormat(config);
        } else {
            config._isValid = false;
        }
    }

    // date from iso format or fallback
    function configFromString(config) {
        var matched = aspNetJsonRegex.exec(config._i);

        if (matched !== null) {
            config._d = new Date(+matched[1]);
            return;
        }

        configFromISO(config);
        if (config._isValid === false) {
            delete config._isValid;
            utils_hooks__hooks.createFromInputFallback(config);
        }
    }

    utils_hooks__hooks.createFromInputFallback = deprecate(
        'moment construction falls back to js Date. This is ' +
        'discouraged and will be removed in upcoming major ' +
        'release. Please refer to ' +
        'https://github.com/moment/moment/issues/1407 for more info.',
        function (config) {
            config._d = new Date(config._i + (config._useUTC ? ' UTC' : ''));
        }
    );

    function createDate (y, m, d, h, M, s, ms) {
        //can't just apply() to create a date:
        //http://stackoverflow.com/questions/181348/instantiating-a-javascript-object-by-calling-prototype-constructor-apply
        var date = new Date(y, m, d, h, M, s, ms);

        //the date constructor doesn't accept years < 1970
        if (y < 1970) {
            date.setFullYear(y);
        }
        return date;
    }

    function createUTCDate (y) {
        var date = new Date(Date.UTC.apply(null, arguments));
        if (y < 1970) {
            date.setUTCFullYear(y);
        }
        return date;
    }

    addFormatToken(0, ['YY', 2], 0, function () {
        return this.year() % 100;
    });

    addFormatToken(0, ['YYYY',   4],       0, 'year');
    addFormatToken(0, ['YYYYY',  5],       0, 'year');
    addFormatToken(0, ['YYYYYY', 6, true], 0, 'year');

    // ALIASES

    addUnitAlias('year', 'y');

    // PARSING

    addRegexToken('Y',      matchSigned);
    addRegexToken('YY',     match1to2, match2);
    addRegexToken('YYYY',   match1to4, match4);
    addRegexToken('YYYYY',  match1to6, match6);
    addRegexToken('YYYYYY', match1to6, match6);

    addParseToken(['YYYY', 'YYYYY', 'YYYYYY'], YEAR);
    addParseToken('YY', function (input, array) {
        array[YEAR] = utils_hooks__hooks.parseTwoDigitYear(input);
    });

    // HELPERS

    function daysInYear(year) {
        return isLeapYear(year) ? 366 : 365;
    }

    function isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    }

    // HOOKS

    utils_hooks__hooks.parseTwoDigitYear = function (input) {
        return toInt(input) + (toInt(input) > 68 ? 1900 : 2000);
    };

    // MOMENTS

    var getSetYear = makeGetSet('FullYear', false);

    function getIsLeapYear () {
        return isLeapYear(this.year());
    }

    addFormatToken('w', ['ww', 2], 'wo', 'week');
    addFormatToken('W', ['WW', 2], 'Wo', 'isoWeek');

    // ALIASES

    addUnitAlias('week', 'w');
    addUnitAlias('isoWeek', 'W');

    // PARSING

    addRegexToken('w',  match1to2);
    addRegexToken('ww', match1to2, match2);
    addRegexToken('W',  match1to2);
    addRegexToken('WW', match1to2, match2);

    addWeekParseToken(['w', 'ww', 'W', 'WW'], function (input, week, config, token) {
        week[token.substr(0, 1)] = toInt(input);
    });

    // HELPERS

    // firstDayOfWeek       0 = sun, 6 = sat
    //                      the day of the week that starts the week
    //                      (usually sunday or monday)
    // firstDayOfWeekOfYear 0 = sun, 6 = sat
    //                      the first week is the week that contains the first
    //                      of this day of the week
    //                      (eg. ISO weeks use thursday (4))
    function weekOfYear(mom, firstDayOfWeek, firstDayOfWeekOfYear) {
        var end = firstDayOfWeekOfYear - firstDayOfWeek,
            daysToDayOfWeek = firstDayOfWeekOfYear - mom.day(),
            adjustedMoment;


        if (daysToDayOfWeek > end) {
            daysToDayOfWeek -= 7;
        }

        if (daysToDayOfWeek < end - 7) {
            daysToDayOfWeek += 7;
        }

        adjustedMoment = local__createLocal(mom).add(daysToDayOfWeek, 'd');
        return {
            week: Math.ceil(adjustedMoment.dayOfYear() / 7),
            year: adjustedMoment.year()
        };
    }

    // LOCALES

    function localeWeek (mom) {
        return weekOfYear(mom, this._week.dow, this._week.doy).week;
    }

    var defaultLocaleWeek = {
        dow : 0, // Sunday is the first day of the week.
        doy : 6  // The week that contains Jan 1st is the first week of the year.
    };

    function localeFirstDayOfWeek () {
        return this._week.dow;
    }

    function localeFirstDayOfYear () {
        return this._week.doy;
    }

    // MOMENTS

    function getSetWeek (input) {
        var week = this.localeData().week(this);
        return input == null ? week : this.add((input - week) * 7, 'd');
    }

    function getSetISOWeek (input) {
        var week = weekOfYear(this, 1, 4).week;
        return input == null ? week : this.add((input - week) * 7, 'd');
    }

    addFormatToken('DDD', ['DDDD', 3], 'DDDo', 'dayOfYear');

    // ALIASES

    addUnitAlias('dayOfYear', 'DDD');

    // PARSING

    addRegexToken('DDD',  match1to3);
    addRegexToken('DDDD', match3);
    addParseToken(['DDD', 'DDDD'], function (input, array, config) {
        config._dayOfYear = toInt(input);
    });

    // HELPERS

    //http://en.wikipedia.org/wiki/ISO_week_date#Calculating_a_date_given_the_year.2C_week_number_and_weekday
    function dayOfYearFromWeeks(year, week, weekday, firstDayOfWeekOfYear, firstDayOfWeek) {
        var d = createUTCDate(year, 0, 1).getUTCDay();
        var daysToAdd;
        var dayOfYear;

        d = d === 0 ? 7 : d;
        weekday = weekday != null ? weekday : firstDayOfWeek;
        daysToAdd = firstDayOfWeek - d + (d > firstDayOfWeekOfYear ? 7 : 0) - (d < firstDayOfWeek ? 7 : 0);
        dayOfYear = 7 * (week - 1) + (weekday - firstDayOfWeek) + daysToAdd + 1;

        return {
            year      : dayOfYear > 0 ? year      : year - 1,
            dayOfYear : dayOfYear > 0 ? dayOfYear : daysInYear(year - 1) + dayOfYear
        };
    }

    // MOMENTS

    function getSetDayOfYear (input) {
        var dayOfYear = Math.round((this.clone().startOf('day') - this.clone().startOf('year')) / 864e5) + 1;
        return input == null ? dayOfYear : this.add((input - dayOfYear), 'd');
    }

    // Pick the first defined of two or three arguments.
    function defaults(a, b, c) {
        if (a != null) {
            return a;
        }
        if (b != null) {
            return b;
        }
        return c;
    }

    function currentDateArray(config) {
        var now = new Date();
        if (config._useUTC) {
            return [now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()];
        }
        return [now.getFullYear(), now.getMonth(), now.getDate()];
    }

    // convert an array to a date.
    // the array should mirror the parameters below
    // note: all values past the year are optional and will default to the lowest possible value.
    // [year, month, day , hour, minute, second, millisecond]
    function configFromArray (config) {
        var i, date, input = [], currentDate, yearToUse;

        if (config._d) {
            return;
        }

        currentDate = currentDateArray(config);

        //compute day of the year from weeks and weekdays
        if (config._w && config._a[DATE] == null && config._a[MONTH] == null) {
            dayOfYearFromWeekInfo(config);
        }

        //if the day of the year is set, figure out what it is
        if (config._dayOfYear) {
            yearToUse = defaults(config._a[YEAR], currentDate[YEAR]);

            if (config._dayOfYear > daysInYear(yearToUse)) {
                config._pf._overflowDayOfYear = true;
            }

            date = createUTCDate(yearToUse, 0, config._dayOfYear);
            config._a[MONTH] = date.getUTCMonth();
            config._a[DATE] = date.getUTCDate();
        }

        // Default to current date.
        // * if no year, month, day of month are given, default to today
        // * if day of month is given, default month and year
        // * if month is given, default only year
        // * if year is given, don't default anything
        for (i = 0; i < 3 && config._a[i] == null; ++i) {
            config._a[i] = input[i] = currentDate[i];
        }

        // Zero out whatever was not defaulted, including time
        for (; i < 7; i++) {
            config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];
        }

        // Check for 24:00:00.000
        if (config._a[HOUR] === 24 &&
                config._a[MINUTE] === 0 &&
                config._a[SECOND] === 0 &&
                config._a[MILLISECOND] === 0) {
            config._nextDay = true;
            config._a[HOUR] = 0;
        }

        config._d = (config._useUTC ? createUTCDate : createDate).apply(null, input);
        // Apply timezone offset from input. The actual utcOffset can be changed
        // with parseZone.
        if (config._tzm != null) {
            config._d.setUTCMinutes(config._d.getUTCMinutes() - config._tzm);
        }

        if (config._nextDay) {
            config._a[HOUR] = 24;
        }
    }

    function dayOfYearFromWeekInfo(config) {
        var w, weekYear, week, weekday, dow, doy, temp;

        w = config._w;
        if (w.GG != null || w.W != null || w.E != null) {
            dow = 1;
            doy = 4;

            // TODO: We need to take the current isoWeekYear, but that depends on
            // how we interpret now (local, utc, fixed offset). So create
            // a now version of current config (take local/utc/offset flags, and
            // create now).
            weekYear = defaults(w.GG, config._a[YEAR], weekOfYear(local__createLocal(), 1, 4).year);
            week = defaults(w.W, 1);
            weekday = defaults(w.E, 1);
        } else {
            dow = config._locale._week.dow;
            doy = config._locale._week.doy;

            weekYear = defaults(w.gg, config._a[YEAR], weekOfYear(local__createLocal(), dow, doy).year);
            week = defaults(w.w, 1);

            if (w.d != null) {
                // weekday -- low day numbers are considered next week
                weekday = w.d;
                if (weekday < dow) {
                    ++week;
                }
            } else if (w.e != null) {
                // local weekday -- counting starts from begining of week
                weekday = w.e + dow;
            } else {
                // default to begining of week
                weekday = dow;
            }
        }
        temp = dayOfYearFromWeeks(weekYear, week, weekday, doy, dow);

        config._a[YEAR] = temp.year;
        config._dayOfYear = temp.dayOfYear;
    }

    utils_hooks__hooks.ISO_8601 = function () {};

    // date from string and format string
    function configFromStringAndFormat(config) {
        // TODO: Move this to another part of the creation flow to prevent circular deps
        if (config._f === utils_hooks__hooks.ISO_8601) {
            configFromISO(config);
            return;
        }

        config._a = [];
        config._pf.empty = true;

        // This array is used to make a Date, either with `new Date` or `Date.UTC`
        var string = '' + config._i,
            i, parsedInput, tokens, token, skipped,
            stringLength = string.length,
            totalParsedInputLength = 0;

        tokens = expandFormat(config._f, config._locale).match(formattingTokens) || [];

        for (i = 0; i < tokens.length; i++) {
            token = tokens[i];
            parsedInput = (string.match(getParseRegexForToken(token, config)) || [])[0];
            if (parsedInput) {
                skipped = string.substr(0, string.indexOf(parsedInput));
                if (skipped.length > 0) {
                    config._pf.unusedInput.push(skipped);
                }
                string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
                totalParsedInputLength += parsedInput.length;
            }
            // don't parse if it's not a known token
            if (formatTokenFunctions[token]) {
                if (parsedInput) {
                    config._pf.empty = false;
                }
                else {
                    config._pf.unusedTokens.push(token);
                }
                addTimeToArrayFromToken(token, parsedInput, config);
            }
            else if (config._strict && !parsedInput) {
                config._pf.unusedTokens.push(token);
            }
        }

        // add remaining unparsed input length to the string
        config._pf.charsLeftOver = stringLength - totalParsedInputLength;
        if (string.length > 0) {
            config._pf.unusedInput.push(string);
        }

        // clear _12h flag if hour is <= 12
        if (config._pf.bigHour === true && config._a[HOUR] <= 12) {
            config._pf.bigHour = undefined;
        }
        // handle meridiem
        config._a[HOUR] = meridiemFixWrap(config._locale, config._a[HOUR], config._meridiem);

        configFromArray(config);
        checkOverflow(config);
    }


    function meridiemFixWrap (locale, hour, meridiem) {
        var isPm;

        if (meridiem == null) {
            // nothing to do
            return hour;
        }
        if (locale.meridiemHour != null) {
            return locale.meridiemHour(hour, meridiem);
        } else if (locale.isPM != null) {
            // Fallback
            isPm = locale.isPM(meridiem);
            if (isPm && hour < 12) {
                hour += 12;
            }
            if (!isPm && hour === 12) {
                hour = 0;
            }
            return hour;
        } else {
            // this is not supposed to happen
            return hour;
        }
    }

    function configFromStringAndArray(config) {
        var tempConfig,
            bestMoment,

            scoreToBeat,
            i,
            currentScore;

        if (config._f.length === 0) {
            config._pf.invalidFormat = true;
            config._d = new Date(NaN);
            return;
        }

        for (i = 0; i < config._f.length; i++) {
            currentScore = 0;
            tempConfig = copyConfig({}, config);
            if (config._useUTC != null) {
                tempConfig._useUTC = config._useUTC;
            }
            tempConfig._pf = defaultParsingFlags();
            tempConfig._f = config._f[i];
            configFromStringAndFormat(tempConfig);

            if (!valid__isValid(tempConfig)) {
                continue;
            }

            // if there is any input that was not parsed add a penalty for that format
            currentScore += tempConfig._pf.charsLeftOver;

            //or tokens
            currentScore += tempConfig._pf.unusedTokens.length * 10;

            tempConfig._pf.score = currentScore;

            if (scoreToBeat == null || currentScore < scoreToBeat) {
                scoreToBeat = currentScore;
                bestMoment = tempConfig;
            }
        }

        extend(config, bestMoment || tempConfig);
    }

    function configFromObject(config) {
        if (config._d) {
            return;
        }

        var i = normalizeObjectUnits(config._i);
        config._a = [i.year, i.month, i.day || i.date, i.hour, i.minute, i.second, i.millisecond];

        configFromArray(config);
    }

    function createFromConfig (config) {
        var input = config._i,
            format = config._f,
            res;

        config._locale = config._locale || locale_locales__getLocale(config._l);

        if (input === null || (format === undefined && input === '')) {
            return valid__createInvalid({nullInput: true});
        }

        if (typeof input === 'string') {
            config._i = input = config._locale.preparse(input);
        }

        if (isMoment(input)) {
            return new Moment(checkOverflow(input));
        } else if (isArray(format)) {
            configFromStringAndArray(config);
        } else if (format) {
            configFromStringAndFormat(config);
        } else {
            configFromInput(config);
        }

        res = new Moment(checkOverflow(config));
        if (res._nextDay) {
            // Adding is smart enough around DST
            res.add(1, 'd');
            res._nextDay = undefined;
        }

        return res;
    }

    function configFromInput(config) {
        var input = config._i;
        if (input === undefined) {
            config._d = new Date();
        } else if (isDate(input)) {
            config._d = new Date(+input);
        } else if (typeof input === 'string') {
            configFromString(config);
        } else if (isArray(input)) {
            config._a = map(input.slice(0), function (obj) {
                return parseInt(obj, 10);
            });
            configFromArray(config);
        } else if (typeof(input) === 'object') {
            configFromObject(config);
        } else if (typeof(input) === 'number') {
            // from milliseconds
            config._d = new Date(input);
        } else {
            utils_hooks__hooks.createFromInputFallback(config);
        }
    }

    function createLocalOrUTC (input, format, locale, strict, isUTC) {
        var c = {};

        if (typeof(locale) === 'boolean') {
            strict = locale;
            locale = undefined;
        }
        // object construction must be done this way.
        // https://github.com/moment/moment/issues/1423
        c._isAMomentObject = true;
        c._useUTC = c._isUTC = isUTC;
        c._l = locale;
        c._i = input;
        c._f = format;
        c._strict = strict;
        c._pf = defaultParsingFlags();

        return createFromConfig(c);
    }

    function local__createLocal (input, format, locale, strict) {
        return createLocalOrUTC(input, format, locale, strict, false);
    }

    var prototypeMin = deprecate(
         'moment().min is deprecated, use moment.min instead. https://github.com/moment/moment/issues/1548',
         function () {
             var other = local__createLocal.apply(null, arguments);
             return other < this ? this : other;
         }
     );

    var prototypeMax = deprecate(
        'moment().max is deprecated, use moment.max instead. https://github.com/moment/moment/issues/1548',
        function () {
            var other = local__createLocal.apply(null, arguments);
            return other > this ? this : other;
        }
    );

    // Pick a moment m from moments so that m[fn](other) is true for all
    // other. This relies on the function fn to be transitive.
    //
    // moments should either be an array of moment objects or an array, whose
    // first element is an array of moment objects.
    function pickBy(fn, moments) {
        var res, i;
        if (moments.length === 1 && isArray(moments[0])) {
            moments = moments[0];
        }
        if (!moments.length) {
            return local__createLocal();
        }
        res = moments[0];
        for (i = 1; i < moments.length; ++i) {
            if (moments[i][fn](res)) {
                res = moments[i];
            }
        }
        return res;
    }

    // TODO: Use [].sort instead?
    function min () {
        var args = [].slice.call(arguments, 0);

        return pickBy('isBefore', args);
    }

    function max () {
        var args = [].slice.call(arguments, 0);

        return pickBy('isAfter', args);
    }

    function Duration (duration) {
        var normalizedInput = normalizeObjectUnits(duration),
            years = normalizedInput.year || 0,
            quarters = normalizedInput.quarter || 0,
            months = normalizedInput.month || 0,
            weeks = normalizedInput.week || 0,
            days = normalizedInput.day || 0,
            hours = normalizedInput.hour || 0,
            minutes = normalizedInput.minute || 0,
            seconds = normalizedInput.second || 0,
            milliseconds = normalizedInput.millisecond || 0;

        // representation for dateAddRemove
        this._milliseconds = +milliseconds +
            seconds * 1e3 + // 1000
            minutes * 6e4 + // 1000 * 60
            hours * 36e5; // 1000 * 60 * 60
        // Because of dateAddRemove treats 24 hours as different from a
        // day when working around DST, we need to store them separately
        this._days = +days +
            weeks * 7;
        // It is impossible translate months into days without knowing
        // which months you are are talking about, so we have to store
        // it separately.
        this._months = +months +
            quarters * 3 +
            years * 12;

        this._data = {};

        this._locale = locale_locales__getLocale();

        this._bubble();
    }

    function isDuration (obj) {
        return obj instanceof Duration;
    }

    function offset (token, separator) {
        addFormatToken(token, 0, 0, function () {
            var offset = this.utcOffset();
            var sign = '+';
            if (offset < 0) {
                offset = -offset;
                sign = '-';
            }
            return sign + zeroFill(~~(offset / 60), 2) + separator + zeroFill(~~(offset) % 60, 2);
        });
    }

    offset('Z', ':');
    offset('ZZ', '');

    // PARSING

    addRegexToken('Z',  matchOffset);
    addRegexToken('ZZ', matchOffset);
    addParseToken(['Z', 'ZZ'], function (input, array, config) {
        config._useUTC = true;
        config._tzm = offsetFromString(input);
    });

    // HELPERS

    // timezone chunker
    // '+10:00' > ['10',  '00']
    // '-1530'  > ['-15', '30']
    var chunkOffset = /([\+\-]|\d\d)/gi;

    function offsetFromString(string) {
        var matches = ((string || '').match(matchOffset) || []);
        var chunk   = matches[matches.length - 1] || [];
        var parts   = (chunk + '').match(chunkOffset) || ['-', 0, 0];
        var minutes = +(parts[1] * 60) + toInt(parts[2]);

        return parts[0] === '+' ? minutes : -minutes;
    }

    // Return a moment from input, that is local/utc/zone equivalent to model.
    function cloneWithOffset(input, model) {
        var res, diff;
        if (model._isUTC) {
            res = model.clone();
            diff = (isMoment(input) || isDate(input) ? +input : +local__createLocal(input)) - (+res);
            // Use low-level api, because this fn is low-level api.
            res._d.setTime(+res._d + diff);
            utils_hooks__hooks.updateOffset(res, false);
            return res;
        } else {
            return local__createLocal(input).local();
        }
        return model._isUTC ? local__createLocal(input).zone(model._offset || 0) : local__createLocal(input).local();
    }

    function getDateOffset (m) {
        // On Firefox.24 Date#getTimezoneOffset returns a floating point.
        // https://github.com/moment/moment/pull/1871
        return -Math.round(m._d.getTimezoneOffset() / 15) * 15;
    }

    // HOOKS

    // This function will be called whenever a moment is mutated.
    // It is intended to keep the offset in sync with the timezone.
    utils_hooks__hooks.updateOffset = function () {};

    // MOMENTS

    // keepLocalTime = true means only change the timezone, without
    // affecting the local hour. So 5:31:26 +0300 --[utcOffset(2, true)]-->
    // 5:31:26 +0200 It is possible that 5:31:26 doesn't exist with offset
    // +0200, so we adjust the time as needed, to be valid.
    //
    // Keeping the time actually adds/subtracts (one hour)
    // from the actual represented time. That is why we call updateOffset
    // a second time. In case it wants us to change the offset again
    // _changeInProgress == true case, then we have to adjust, because
    // there is no such time in the given timezone.
    function getSetOffset (input, keepLocalTime) {
        var offset = this._offset || 0,
            localAdjust;
        if (input != null) {
            if (typeof input === 'string') {
                input = offsetFromString(input);
            }
            if (Math.abs(input) < 16) {
                input = input * 60;
            }
            if (!this._isUTC && keepLocalTime) {
                localAdjust = getDateOffset(this);
            }
            this._offset = input;
            this._isUTC = true;
            if (localAdjust != null) {
                this.add(localAdjust, 'm');
            }
            if (offset !== input) {
                if (!keepLocalTime || this._changeInProgress) {
                    add_subtract__addSubtract(this, create__createDuration(input - offset, 'm'), 1, false);
                } else if (!this._changeInProgress) {
                    this._changeInProgress = true;
                    utils_hooks__hooks.updateOffset(this, true);
                    this._changeInProgress = null;
                }
            }
            return this;
        } else {
            return this._isUTC ? offset : getDateOffset(this);
        }
    }

    function getSetZone (input, keepLocalTime) {
        if (input != null) {
            if (typeof input !== 'string') {
                input = -input;
            }

            this.utcOffset(input, keepLocalTime);

            return this;
        } else {
            return -this.utcOffset();
        }
    }

    function setOffsetToUTC (keepLocalTime) {
        return this.utcOffset(0, keepLocalTime);
    }

    function setOffsetToLocal (keepLocalTime) {
        if (this._isUTC) {
            this.utcOffset(0, keepLocalTime);
            this._isUTC = false;

            if (keepLocalTime) {
                this.subtract(getDateOffset(this), 'm');
            }
        }
        return this;
    }

    function setOffsetToParsedOffset () {
        if (this._tzm) {
            this.utcOffset(this._tzm);
        } else if (typeof this._i === 'string') {
            this.utcOffset(offsetFromString(this._i));
        }
        return this;
    }

    function hasAlignedHourOffset (input) {
        if (!input) {
            input = 0;
        }
        else {
            input = local__createLocal(input).utcOffset();
        }

        return (this.utcOffset() - input) % 60 === 0;
    }

    function isDaylightSavingTime () {
        return (
            this.utcOffset() > this.clone().month(0).utcOffset() ||
            this.utcOffset() > this.clone().month(5).utcOffset()
        );
    }

    function isDaylightSavingTimeShifted () {
        if (this._a) {
            var other = this._isUTC ? create_utc__createUTC(this._a) : local__createLocal(this._a);
            return this.isValid() && compareArrays(this._a, other.toArray()) > 0;
        }

        return false;
    }

    function isLocal () {
        return !this._isUTC;
    }

    function isUtcOffset () {
        return this._isUTC;
    }

    function isUtc () {
        return this._isUTC && this._offset === 0;
    }

    var aspNetRegex = /(\-)?(?:(\d*)\.)?(\d+)\:(\d+)(?:\:(\d+)\.?(\d{3})?)?/;

    // from http://docs.closure-library.googlecode.com/git/closure_goog_date_date.js.source.html
    // somewhat more in line with 4.4.3.2 2004 spec, but allows decimal anywhere
    var create__isoRegex = /^(-)?P(?:(?:([0-9,.]*)Y)?(?:([0-9,.]*)M)?(?:([0-9,.]*)D)?(?:T(?:([0-9,.]*)H)?(?:([0-9,.]*)M)?(?:([0-9,.]*)S)?)?|([0-9,.]*)W)$/;

    function create__createDuration (input, key) {
        var duration = input,
            // matching against regexp is expensive, do it on demand
            match = null,
            sign,
            ret,
            diffRes;

        if (isDuration(input)) {
            duration = {
                ms : input._milliseconds,
                d  : input._days,
                M  : input._months
            };
        } else if (typeof input === 'number') {
            duration = {};
            if (key) {
                duration[key] = input;
            } else {
                duration.milliseconds = input;
            }
        } else if (!!(match = aspNetRegex.exec(input))) {
            sign = (match[1] === '-') ? -1 : 1;
            duration = {
                y  : 0,
                d  : toInt(match[DATE])        * sign,
                h  : toInt(match[HOUR])        * sign,
                m  : toInt(match[MINUTE])      * sign,
                s  : toInt(match[SECOND])      * sign,
                ms : toInt(match[MILLISECOND]) * sign
            };
        } else if (!!(match = create__isoRegex.exec(input))) {
            sign = (match[1] === '-') ? -1 : 1;
            duration = {
                y : parseIso(match[2], sign),
                M : parseIso(match[3], sign),
                d : parseIso(match[4], sign),
                h : parseIso(match[5], sign),
                m : parseIso(match[6], sign),
                s : parseIso(match[7], sign),
                w : parseIso(match[8], sign)
            };
        } else if (duration == null) {// checks for null or undefined
            duration = {};
        } else if (typeof duration === 'object' && ('from' in duration || 'to' in duration)) {
            diffRes = momentsDifference(local__createLocal(duration.from), local__createLocal(duration.to));

            duration = {};
            duration.ms = diffRes.milliseconds;
            duration.M = diffRes.months;
        }

        ret = new Duration(duration);

        if (isDuration(input) && hasOwnProp(input, '_locale')) {
            ret._locale = input._locale;
        }

        return ret;
    }

    create__createDuration.fn = Duration.prototype;

    function parseIso (inp, sign) {
        // We'd normally use ~~inp for this, but unfortunately it also
        // converts floats to ints.
        // inp may be undefined, so careful calling replace on it.
        var res = inp && parseFloat(inp.replace(',', '.'));
        // apply sign while we're at it
        return (isNaN(res) ? 0 : res) * sign;
    }

    function positiveMomentsDifference(base, other) {
        var res = {milliseconds: 0, months: 0};

        res.months = other.month() - base.month() +
            (other.year() - base.year()) * 12;
        if (base.clone().add(res.months, 'M').isAfter(other)) {
            --res.months;
        }

        res.milliseconds = +other - +(base.clone().add(res.months, 'M'));

        return res;
    }

    function momentsDifference(base, other) {
        var res;
        other = cloneWithOffset(other, base);
        if (base.isBefore(other)) {
            res = positiveMomentsDifference(base, other);
        } else {
            res = positiveMomentsDifference(other, base);
            res.milliseconds = -res.milliseconds;
            res.months = -res.months;
        }

        return res;
    }

    function createAdder(direction, name) {
        return function (val, period) {
            var dur, tmp;
            //invert the arguments, but complain about it
            if (period !== null && !isNaN(+period)) {
                deprecateSimple(name, 'moment().' + name  + '(period, number) is deprecated. Please use moment().' + name + '(number, period).');
                tmp = val; val = period; period = tmp;
            }

            val = typeof val === 'string' ? +val : val;
            dur = create__createDuration(val, period);
            add_subtract__addSubtract(this, dur, direction);
            return this;
        };
    }

    function add_subtract__addSubtract (mom, duration, isAdding, updateOffset) {
        var milliseconds = duration._milliseconds,
            days = duration._days,
            months = duration._months;
        updateOffset = updateOffset == null ? true : updateOffset;

        if (milliseconds) {
            mom._d.setTime(+mom._d + milliseconds * isAdding);
        }
        if (days) {
            get_set__set(mom, 'Date', get_set__get(mom, 'Date') + days * isAdding);
        }
        if (months) {
            setMonth(mom, get_set__get(mom, 'Month') + months * isAdding);
        }
        if (updateOffset) {
            utils_hooks__hooks.updateOffset(mom, days || months);
        }
    }

    var add_subtract__add      = createAdder(1, 'add');
    var add_subtract__subtract = createAdder(-1, 'subtract');

    function moment_calendar__calendar (time) {
        // We want to compare the start of today, vs this.
        // Getting start-of-today depends on whether we're local/utc/offset or not.
        var now = time || local__createLocal(),
            sod = cloneWithOffset(now, this).startOf('day'),
            diff = this.diff(sod, 'days', true),
            format = diff < -6 ? 'sameElse' :
                diff < -1 ? 'lastWeek' :
                diff < 0 ? 'lastDay' :
                diff < 1 ? 'sameDay' :
                diff < 2 ? 'nextDay' :
                diff < 7 ? 'nextWeek' : 'sameElse';
        return this.format(this.localeData().calendar(format, this, local__createLocal(now)));
    }

    function clone () {
        return new Moment(this);
    }

    function isAfter (input, units) {
        var inputMs;
        units = normalizeUnits(typeof units !== 'undefined' ? units : 'millisecond');
        if (units === 'millisecond') {
            input = isMoment(input) ? input : local__createLocal(input);
            return +this > +input;
        } else {
            inputMs = isMoment(input) ? +input : +local__createLocal(input);
            return inputMs < +this.clone().startOf(units);
        }
    }

    function isBefore (input, units) {
        var inputMs;
        units = normalizeUnits(typeof units !== 'undefined' ? units : 'millisecond');
        if (units === 'millisecond') {
            input = isMoment(input) ? input : local__createLocal(input);
            return +this < +input;
        } else {
            inputMs = isMoment(input) ? +input : +local__createLocal(input);
            return +this.clone().endOf(units) < inputMs;
        }
    }

    function isBetween (from, to, units) {
        return this.isAfter(from, units) && this.isBefore(to, units);
    }

    function isSame (input, units) {
        var inputMs;
        units = normalizeUnits(units || 'millisecond');
        if (units === 'millisecond') {
            input = isMoment(input) ? input : local__createLocal(input);
            return +this === +input;
        } else {
            inputMs = +local__createLocal(input);
            return +(this.clone().startOf(units)) <= inputMs && inputMs <= +(this.clone().endOf(units));
        }
    }

    function absFloor (number) {
        if (number < 0) {
            return Math.ceil(number);
        } else {
            return Math.floor(number);
        }
    }

    function diff (input, units, asFloat) {
        var that = cloneWithOffset(input, this),
            zoneDelta = (that.utcOffset() - this.utcOffset()) * 6e4,
            delta, output;

        units = normalizeUnits(units);

        if (units === 'year' || units === 'month' || units === 'quarter') {
            output = monthDiff(this, that);
            if (units === 'quarter') {
                output = output / 3;
            } else if (units === 'year') {
                output = output / 12;
            }
        } else {
            delta = this - that;
            output = units === 'second' ? delta / 1e3 : // 1000
                units === 'minute' ? delta / 6e4 : // 1000 * 60
                units === 'hour' ? delta / 36e5 : // 1000 * 60 * 60
                units === 'day' ? (delta - zoneDelta) / 864e5 : // 1000 * 60 * 60 * 24, negate dst
                units === 'week' ? (delta - zoneDelta) / 6048e5 : // 1000 * 60 * 60 * 24 * 7, negate dst
                delta;
        }
        return asFloat ? output : absFloor(output);
    }

    function monthDiff (a, b) {
        // difference in months
        var wholeMonthDiff = ((b.year() - a.year()) * 12) + (b.month() - a.month()),
            // b is in (anchor - 1 month, anchor + 1 month)
            anchor = a.clone().add(wholeMonthDiff, 'months'),
            anchor2, adjust;

        if (b - anchor < 0) {
            anchor2 = a.clone().add(wholeMonthDiff - 1, 'months');
            // linear across the month
            adjust = (b - anchor) / (anchor - anchor2);
        } else {
            anchor2 = a.clone().add(wholeMonthDiff + 1, 'months');
            // linear across the month
            adjust = (b - anchor) / (anchor2 - anchor);
        }

        return -(wholeMonthDiff + adjust);
    }

    utils_hooks__hooks.defaultFormat = 'YYYY-MM-DDTHH:mm:ssZ';

    function toString () {
        return this.clone().locale('en').format('ddd MMM DD YYYY HH:mm:ss [GMT]ZZ');
    }

    function moment_format__toISOString () {
        var m = this.clone().utc();
        if (0 < m.year() && m.year() <= 9999) {
            if ('function' === typeof Date.prototype.toISOString) {
                // native implementation is ~50x faster, use it when we can
                return this.toDate().toISOString();
            } else {
                return formatMoment(m, 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
            }
        } else {
            return formatMoment(m, 'YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
        }
    }

    function format (inputString) {
        var output = formatMoment(this, inputString || utils_hooks__hooks.defaultFormat);
        return this.localeData().postformat(output);
    }

    function from (time, withoutSuffix) {
        return create__createDuration({to: this, from: time}).locale(this.locale()).humanize(!withoutSuffix);
    }

    function fromNow (withoutSuffix) {
        return this.from(local__createLocal(), withoutSuffix);
    }

    function locale (key) {
        var newLocaleData;

        if (key === undefined) {
            return this._locale._abbr;
        } else {
            newLocaleData = locale_locales__getLocale(key);
            if (newLocaleData != null) {
                this._locale = newLocaleData;
            }
            return this;
        }
    }

    var lang = deprecate(
        'moment().lang() is deprecated. Instead, use moment().localeData() to get the language configuration. Use moment().locale() to change languages.',
        function (key) {
            if (key === undefined) {
                return this.localeData();
            } else {
                return this.locale(key);
            }
        }
    );

    function localeData () {
        return this._locale;
    }

    function startOf (units) {
        units = normalizeUnits(units);
        // the following switch intentionally omits break keywords
        // to utilize falling through the cases.
        switch (units) {
        case 'year':
            this.month(0);
            /* falls through */
        case 'quarter':
        case 'month':
            this.date(1);
            /* falls through */
        case 'week':
        case 'isoWeek':
        case 'day':
            this.hours(0);
            /* falls through */
        case 'hour':
            this.minutes(0);
            /* falls through */
        case 'minute':
            this.seconds(0);
            /* falls through */
        case 'second':
            this.milliseconds(0);
        }

        // weeks are a special case
        if (units === 'week') {
            this.weekday(0);
        }
        if (units === 'isoWeek') {
            this.isoWeekday(1);
        }

        // quarters are also special
        if (units === 'quarter') {
            this.month(Math.floor(this.month() / 3) * 3);
        }

        return this;
    }

    function endOf (units) {
        units = normalizeUnits(units);
        if (units === undefined || units === 'millisecond') {
            return this;
        }
        return this.startOf(units).add(1, (units === 'isoWeek' ? 'week' : units)).subtract(1, 'ms');
    }

    function to_type__valueOf () {
        return +this._d - ((this._offset || 0) * 60000);
    }

    function unix () {
        return Math.floor(+this / 1000);
    }

    function toDate () {
        return this._offset ? new Date(+this) : this._d;
    }

    function toArray () {
        var m = this;
        return [m.year(), m.month(), m.date(), m.hour(), m.minute(), m.second(), m.millisecond()];
    }

    function moment_valid__isValid () {
        return valid__isValid(this);
    }

    function parsingFlags () {
        return extend({}, this._pf);
    }

    function invalidAt () {
        return this._pf.overflow;
    }

    addFormatToken(0, ['gg', 2], 0, function () {
        return this.weekYear() % 100;
    });

    addFormatToken(0, ['GG', 2], 0, function () {
        return this.isoWeekYear() % 100;
    });

    function addWeekYearFormatToken (token, getter) {
        addFormatToken(0, [token, token.length], 0, getter);
    }

    addWeekYearFormatToken('gggg',     'weekYear');
    addWeekYearFormatToken('ggggg',    'weekYear');
    addWeekYearFormatToken('GGGG',  'isoWeekYear');
    addWeekYearFormatToken('GGGGG', 'isoWeekYear');

    // ALIASES

    addUnitAlias('weekYear', 'gg');
    addUnitAlias('isoWeekYear', 'GG');

    // PARSING

    addRegexToken('G',      matchSigned);
    addRegexToken('g',      matchSigned);
    addRegexToken('GG',     match1to2, match2);
    addRegexToken('gg',     match1to2, match2);
    addRegexToken('GGGG',   match1to4, match4);
    addRegexToken('gggg',   match1to4, match4);
    addRegexToken('GGGGG',  match1to6, match6);
    addRegexToken('ggggg',  match1to6, match6);

    addWeekParseToken(['gggg', 'ggggg', 'GGGG', 'GGGGG'], function (input, week, config, token) {
        week[token.substr(0, 2)] = toInt(input);
    });

    addWeekParseToken(['gg', 'GG'], function (input, week, config, token) {
        week[token] = utils_hooks__hooks.parseTwoDigitYear(input);
    });

    // HELPERS

    function weeksInYear(year, dow, doy) {
        return weekOfYear(local__createLocal([year, 11, 31 + dow - doy]), dow, doy).week;
    }

    // MOMENTS

    function getSetWeekYear (input) {
        var year = weekOfYear(this, this.localeData()._week.dow, this.localeData()._week.doy).year;
        return input == null ? year : this.add((input - year), 'y');
    }

    function getSetISOWeekYear (input) {
        var year = weekOfYear(this, 1, 4).year;
        return input == null ? year : this.add((input - year), 'y');
    }

    function getISOWeeksInYear () {
        return weeksInYear(this.year(), 1, 4);
    }

    function getWeeksInYear () {
        var weekInfo = this.localeData()._week;
        return weeksInYear(this.year(), weekInfo.dow, weekInfo.doy);
    }

    addFormatToken('Q', 0, 0, 'quarter');

    // ALIASES

    addUnitAlias('quarter', 'Q');

    // PARSING

    addRegexToken('Q', match1);
    addParseToken('Q', function (input, array) {
        array[MONTH] = (toInt(input) - 1) * 3;
    });

    // MOMENTS

    function getSetQuarter (input) {
        return input == null ? Math.ceil((this.month() + 1) / 3) : this.month((input - 1) * 3 + this.month() % 3);
    }

    addFormatToken('D', ['DD', 2], 'Do', 'date');

    // ALIASES

    addUnitAlias('date', 'D');

    // PARSING

    addRegexToken('D',  match1to2);
    addRegexToken('DD', match1to2, match2);
    addRegexToken('Do', function (isStrict, locale) {
        return isStrict ? locale._ordinalParse : locale._ordinalParseLenient;
    });

    addParseToken(['D', 'DD'], DATE);
    addParseToken('Do', function (input, array) {
        array[DATE] = toInt(input.match(match1to2)[0], 10);
    });

    // MOMENTS

    var getSetDayOfMonth = makeGetSet('Date', true);

    addFormatToken('d', 0, 'do', 'day');

    addFormatToken('dd', 0, 0, function (format) {
        return this.localeData().weekdaysMin(this, format);
    });

    addFormatToken('ddd', 0, 0, function (format) {
        return this.localeData().weekdaysShort(this, format);
    });

    addFormatToken('dddd', 0, 0, function (format) {
        return this.localeData().weekdays(this, format);
    });

    addFormatToken('e', 0, 0, 'weekday');
    addFormatToken('E', 0, 0, 'isoWeekday');

    // ALIASES

    addUnitAlias('day', 'd');
    addUnitAlias('weekday', 'e');
    addUnitAlias('isoWeekday', 'E');

    // PARSING

    addRegexToken('d',    match1to2);
    addRegexToken('e',    match1to2);
    addRegexToken('E',    match1to2);
    addRegexToken('dd',   matchWord);
    addRegexToken('ddd',  matchWord);
    addRegexToken('dddd', matchWord);

    addWeekParseToken(['dd', 'ddd', 'dddd'], function (input, week, config) {
        var weekday = config._locale.weekdaysParse(input);
        // if we didn't get a weekday name, mark the date as invalid
        if (weekday != null) {
            week.d = weekday;
        } else {
            config._pf.invalidWeekday = input;
        }
    });

    addWeekParseToken(['d', 'e', 'E'], function (input, week, config, token) {
        week[token] = toInt(input);
    });

    // HELPERS

    function parseWeekday(input, locale) {
        if (typeof input === 'string') {
            if (!isNaN(input)) {
                input = parseInt(input, 10);
            }
            else {
                input = locale.weekdaysParse(input);
                if (typeof input !== 'number') {
                    return null;
                }
            }
        }
        return input;
    }

    // LOCALES

    var defaultLocaleWeekdays = 'Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday'.split('_');
    function localeWeekdays (m) {
        return this._weekdays[m.day()];
    }

    var defaultLocaleWeekdaysShort = 'Sun_Mon_Tue_Wed_Thu_Fri_Sat'.split('_');
    function localeWeekdaysShort (m) {
        return this._weekdaysShort[m.day()];
    }

    var defaultLocaleWeekdaysMin = 'Su_Mo_Tu_We_Th_Fr_Sa'.split('_');
    function localeWeekdaysMin (m) {
        return this._weekdaysMin[m.day()];
    }

    function localeWeekdaysParse (weekdayName) {
        var i, mom, regex;

        if (!this._weekdaysParse) {
            this._weekdaysParse = [];
        }

        for (i = 0; i < 7; i++) {
            // make the regex if we don't have it already
            if (!this._weekdaysParse[i]) {
                mom = local__createLocal([2000, 1]).day(i);
                regex = '^' + this.weekdays(mom, '') + '|^' + this.weekdaysShort(mom, '') + '|^' + this.weekdaysMin(mom, '');
                this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
            }
            // test the regex
            if (this._weekdaysParse[i].test(weekdayName)) {
                return i;
            }
        }
    }

    // MOMENTS

    function getSetDayOfWeek (input) {
        var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
        if (input != null) {
            input = parseWeekday(input, this.localeData());
            return this.add(input - day, 'd');
        } else {
            return day;
        }
    }

    function getSetLocaleDayOfWeek (input) {
        var weekday = (this.day() + 7 - this.localeData()._week.dow) % 7;
        return input == null ? weekday : this.add(input - weekday, 'd');
    }

    function getSetISODayOfWeek (input) {
        // behaves the same as moment#day except
        // as a getter, returns 7 instead of 0 (1-7 range instead of 0-6)
        // as a setter, sunday should belong to the previous week.
        return input == null ? this.day() || 7 : this.day(this.day() % 7 ? input : input - 7);
    }

    addFormatToken('H', ['HH', 2], 0, 'hour');
    addFormatToken('h', ['hh', 2], 0, function () {
        return this.hours() % 12 || 12;
    });

    function meridiem (token, lowercase) {
        addFormatToken(token, 0, 0, function () {
            return this.localeData().meridiem(this.hours(), this.minutes(), lowercase);
        });
    }

    meridiem('a', true);
    meridiem('A', false);

    // ALIASES

    addUnitAlias('hour', 'h');

    // PARSING

    function matchMeridiem (isStrict, locale) {
        return locale._meridiemParse;
    }

    addRegexToken('a',  matchMeridiem);
    addRegexToken('A',  matchMeridiem);
    addRegexToken('H',  match1to2);
    addRegexToken('h',  match1to2);
    addRegexToken('HH', match1to2, match2);
    addRegexToken('hh', match1to2, match2);

    addParseToken(['H', 'HH'], HOUR);
    addParseToken(['a', 'A'], function (input, array, config) {
        config._isPm = config._locale.isPM(input);
        config._meridiem = input;
    });
    addParseToken(['h', 'hh'], function (input, array, config) {
        array[HOUR] = toInt(input);
        config._pf.bigHour = true;
    });

    // LOCALES

    function localeIsPM (input) {
        // IE8 Quirks Mode & IE7 Standards Mode do not allow accessing strings like arrays
        // Using charAt should be more compatible.
        return ((input + '').toLowerCase().charAt(0) === 'p');
    }

    var defaultLocaleMeridiemParse = /[ap]\.?m?\.?/i;
    function localeMeridiem (hours, minutes, isLower) {
        if (hours > 11) {
            return isLower ? 'pm' : 'PM';
        } else {
            return isLower ? 'am' : 'AM';
        }
    }


    // MOMENTS

    // Setting the hour should keep the time, because the user explicitly
    // specified which hour he wants. So trying to maintain the same hour (in
    // a new timezone) makes sense. Adding/subtracting hours does not follow
    // this rule.
    var getSetHour = makeGetSet('Hours', true);

    addFormatToken('m', ['mm', 2], 0, 'minute');

    // ALIASES

    addUnitAlias('minute', 'm');

    // PARSING

    addRegexToken('m',  match1to2);
    addRegexToken('mm', match1to2, match2);
    addParseToken(['m', 'mm'], MINUTE);

    // MOMENTS

    var getSetMinute = makeGetSet('Minutes', false);

    addFormatToken('s', ['ss', 2], 0, 'second');

    // ALIASES

    addUnitAlias('second', 's');

    // PARSING

    addRegexToken('s',  match1to2);
    addRegexToken('ss', match1to2, match2);
    addParseToken(['s', 'ss'], SECOND);

    // MOMENTS

    var getSetSecond = makeGetSet('Seconds', false);

    addFormatToken('S', 0, 0, function () {
        return ~~(this.millisecond() / 100);
    });

    addFormatToken(0, ['SS', 2], 0, function () {
        return ~~(this.millisecond() / 10);
    });

    function millisecond__milliseconds (token) {
        addFormatToken(0, [token, 3], 0, 'millisecond');
    }

    millisecond__milliseconds('SSS');
    millisecond__milliseconds('SSSS');

    // ALIASES

    addUnitAlias('millisecond', 'ms');

    // PARSING

    addRegexToken('S',    match1to3, match1);
    addRegexToken('SS',   match1to3, match2);
    addRegexToken('SSS',  match1to3, match3);
    addRegexToken('SSSS', matchUnsigned);
    addParseToken(['S', 'SS', 'SSS', 'SSSS'], function (input, array) {
        array[MILLISECOND] = toInt(('0.' + input) * 1000);
    });

    // MOMENTS

    var getSetMillisecond = makeGetSet('Milliseconds', false);

    addFormatToken('z',  0, 0, 'zoneAbbr');
    addFormatToken('zz', 0, 0, 'zoneName');

    // MOMENTS

    function getZoneAbbr () {
        return this._isUTC ? 'UTC' : '';
    }

    function getZoneName () {
        return this._isUTC ? 'Coordinated Universal Time' : '';
    }

    var momentPrototype__proto = Moment.prototype;

    momentPrototype__proto.add          = add_subtract__add;
    momentPrototype__proto.calendar     = moment_calendar__calendar;
    momentPrototype__proto.clone        = clone;
    momentPrototype__proto.diff         = diff;
    momentPrototype__proto.endOf        = endOf;
    momentPrototype__proto.format       = format;
    momentPrototype__proto.from         = from;
    momentPrototype__proto.fromNow      = fromNow;
    momentPrototype__proto.get          = getSet;
    momentPrototype__proto.invalidAt    = invalidAt;
    momentPrototype__proto.isAfter      = isAfter;
    momentPrototype__proto.isBefore     = isBefore;
    momentPrototype__proto.isBetween    = isBetween;
    momentPrototype__proto.isSame       = isSame;
    momentPrototype__proto.isValid      = moment_valid__isValid;
    momentPrototype__proto.lang         = lang;
    momentPrototype__proto.locale       = locale;
    momentPrototype__proto.localeData   = localeData;
    momentPrototype__proto.max          = prototypeMax;
    momentPrototype__proto.min          = prototypeMin;
    momentPrototype__proto.parsingFlags = parsingFlags;
    momentPrototype__proto.set          = getSet;
    momentPrototype__proto.startOf      = startOf;
    momentPrototype__proto.subtract     = add_subtract__subtract;
    momentPrototype__proto.toArray      = toArray;
    momentPrototype__proto.toDate       = toDate;
    momentPrototype__proto.toISOString  = moment_format__toISOString;
    momentPrototype__proto.toJSON       = moment_format__toISOString;
    momentPrototype__proto.toString     = toString;
    momentPrototype__proto.unix         = unix;
    momentPrototype__proto.valueOf      = to_type__valueOf;

    // Year
    momentPrototype__proto.year       = getSetYear;
    momentPrototype__proto.isLeapYear = getIsLeapYear;

    // Week Year
    momentPrototype__proto.weekYear    = getSetWeekYear;
    momentPrototype__proto.isoWeekYear = getSetISOWeekYear;

    // Quarter
    momentPrototype__proto.quarter = momentPrototype__proto.quarters = getSetQuarter;

    // Month
    momentPrototype__proto.month       = getSetMonth;
    momentPrototype__proto.daysInMonth = getDaysInMonth;

    // Week
    momentPrototype__proto.week           = momentPrototype__proto.weeks        = getSetWeek;
    momentPrototype__proto.isoWeek        = momentPrototype__proto.isoWeeks     = getSetISOWeek;
    momentPrototype__proto.weeksInYear    = getWeeksInYear;
    momentPrototype__proto.isoWeeksInYear = getISOWeeksInYear;

    // Day
    momentPrototype__proto.date       = getSetDayOfMonth;
    momentPrototype__proto.day        = momentPrototype__proto.days             = getSetDayOfWeek;
    momentPrototype__proto.weekday    = getSetLocaleDayOfWeek;
    momentPrototype__proto.isoWeekday = getSetISODayOfWeek;
    momentPrototype__proto.dayOfYear  = getSetDayOfYear;

    // Hour
    momentPrototype__proto.hour = momentPrototype__proto.hours = getSetHour;

    // Minute
    momentPrototype__proto.minute = momentPrototype__proto.minutes = getSetMinute;

    // Second
    momentPrototype__proto.second = momentPrototype__proto.seconds = getSetSecond;

    // Millisecond
    momentPrototype__proto.millisecond = momentPrototype__proto.milliseconds = getSetMillisecond;

    // Offset
    momentPrototype__proto.utcOffset            = getSetOffset;
    momentPrototype__proto.utc                  = setOffsetToUTC;
    momentPrototype__proto.local                = setOffsetToLocal;
    momentPrototype__proto.parseZone            = setOffsetToParsedOffset;
    momentPrototype__proto.hasAlignedHourOffset = hasAlignedHourOffset;
    momentPrototype__proto.isDST                = isDaylightSavingTime;
    momentPrototype__proto.isDSTShifted         = isDaylightSavingTimeShifted;
    momentPrototype__proto.isLocal              = isLocal;
    momentPrototype__proto.isUtcOffset          = isUtcOffset;
    momentPrototype__proto.isUtc                = isUtc;
    momentPrototype__proto.isUTC                = isUtc;

    // Timezone
    momentPrototype__proto.zoneAbbr = getZoneAbbr;
    momentPrototype__proto.zoneName = getZoneName;

    // Deprecations
    momentPrototype__proto.dates  = deprecate('dates accessor is deprecated. Use date instead.', getSetDayOfMonth);
    momentPrototype__proto.months = deprecate('months accessor is deprecated. Use month instead', getSetMonth);
    momentPrototype__proto.years  = deprecate('years accessor is deprecated. Use year instead', getSetYear);
    momentPrototype__proto.zone   = deprecate('moment().zone is deprecated, use moment().utcOffset instead. https://github.com/moment/moment/issues/1779', getSetZone);

    var momentPrototype = momentPrototype__proto;

    function moment__createUnix (input) {
        return local__createLocal(input * 1000);
    }

    function moment__createInZone () {
        return local__createLocal.apply(null, arguments).parseZone();
    }

    var defaultCalendar = {
        sameDay : '[Today at] LT',
        nextDay : '[Tomorrow at] LT',
        nextWeek : 'dddd [at] LT',
        lastDay : '[Yesterday at] LT',
        lastWeek : '[Last] dddd [at] LT',
        sameElse : 'L'
    };

    function locale_calendar__calendar (key, mom, now) {
        var output = this._calendar[key];
        return typeof output === 'function' ? output.call(mom, now) : output;
    }

    var defaultLongDateFormat = {
        LTS  : 'h:mm:ss A',
        LT   : 'h:mm A',
        L    : 'MM/DD/YYYY',
        LL   : 'MMMM D, YYYY',
        LLL  : 'MMMM D, YYYY LT',
        LLLL : 'dddd, MMMM D, YYYY LT'
    };

    function longDateFormat (key) {
        var output = this._longDateFormat[key];
        if (!output && this._longDateFormat[key.toUpperCase()]) {
            output = this._longDateFormat[key.toUpperCase()].replace(/MMMM|MM|DD|dddd/g, function (val) {
                return val.slice(1);
            });
            this._longDateFormat[key] = output;
        }
        return output;
    }

    var defaultInvalidDate = 'Invalid date';

    function invalidDate () {
        return this._invalidDate;
    }

    var defaultOrdinal = '%d';
    var defaultOrdinalParse = /\d{1,2}/;

    function ordinal (number) {
        return this._ordinal.replace('%d', number);
    }

    function preParsePostFormat (string) {
        return string;
    }

    var defaultRelativeTime = {
        future : 'in %s',
        past   : '%s ago',
        s  : 'a few seconds',
        m  : 'a minute',
        mm : '%d minutes',
        h  : 'an hour',
        hh : '%d hours',
        d  : 'a day',
        dd : '%d days',
        M  : 'a month',
        MM : '%d months',
        y  : 'a year',
        yy : '%d years'
    };

    function relative__relativeTime (number, withoutSuffix, string, isFuture) {
        var output = this._relativeTime[string];
        return (typeof output === 'function') ?
            output(number, withoutSuffix, string, isFuture) :
            output.replace(/%d/i, number);
    }

    function pastFuture (diff, output) {
        var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
        return typeof format === 'function' ? format(output) : format.replace(/%s/i, output);
    }

    function locale_set__set (config) {
        var prop, i;
        for (i in config) {
            prop = config[i];
            if (typeof prop === 'function') {
                this[i] = prop;
            } else {
                this['_' + i] = prop;
            }
        }
        // Lenient ordinal parsing accepts just a number in addition to
        // number + (possibly) stuff coming from _ordinalParseLenient.
        this._ordinalParseLenient = new RegExp(this._ordinalParse.source + '|' + /\d{1,2}/.source);
    }

    var prototype__proto = Locale.prototype;

    prototype__proto._calendar       = defaultCalendar;
    prototype__proto.calendar        = locale_calendar__calendar;
    prototype__proto._longDateFormat = defaultLongDateFormat;
    prototype__proto.longDateFormat  = longDateFormat;
    prototype__proto._invalidDate    = defaultInvalidDate;
    prototype__proto.invalidDate     = invalidDate;
    prototype__proto._ordinal        = defaultOrdinal;
    prototype__proto.ordinal         = ordinal;
    prototype__proto._ordinalParse   = defaultOrdinalParse;
    prototype__proto.preparse        = preParsePostFormat;
    prototype__proto.postformat      = preParsePostFormat;
    prototype__proto._relativeTime   = defaultRelativeTime;
    prototype__proto.relativeTime    = relative__relativeTime;
    prototype__proto.pastFuture      = pastFuture;
    prototype__proto.set             = locale_set__set;

    // Month
    prototype__proto.months       =        localeMonths;
    prototype__proto._months      = defaultLocaleMonths;
    prototype__proto.monthsShort  =        localeMonthsShort;
    prototype__proto._monthsShort = defaultLocaleMonthsShort;
    prototype__proto.monthsParse  =        localeMonthsParse;

    // Week
    prototype__proto.week = localeWeek;
    prototype__proto._week = defaultLocaleWeek;
    prototype__proto.firstDayOfYear = localeFirstDayOfYear;
    prototype__proto.firstDayOfWeek = localeFirstDayOfWeek;

    // Day of Week
    prototype__proto.weekdays       =        localeWeekdays;
    prototype__proto._weekdays      = defaultLocaleWeekdays;
    prototype__proto.weekdaysMin    =        localeWeekdaysMin;
    prototype__proto._weekdaysMin   = defaultLocaleWeekdaysMin;
    prototype__proto.weekdaysShort  =        localeWeekdaysShort;
    prototype__proto._weekdaysShort = defaultLocaleWeekdaysShort;
    prototype__proto.weekdaysParse  =        localeWeekdaysParse;

    // Hours
    prototype__proto.isPM = localeIsPM;
    prototype__proto._meridiemParse = defaultLocaleMeridiemParse;
    prototype__proto.meridiem = localeMeridiem;

    function lists__get (format, index, field, setter) {
        var locale = locale_locales__getLocale();
        var utc = create_utc__createUTC().set(setter, index);
        return locale[field](utc, format);
    }

    function list (format, index, field, count, setter) {
        if (typeof format === 'number') {
            index = format;
            format = undefined;
        }

        format = format || '';

        if (index != null) {
            return lists__get(format, index, field, setter);
        }

        var i;
        var out = [];
        for (i = 0; i < count; i++) {
            out[i] = lists__get(format, i, field, setter);
        }
        return out;
    }

    function lists__listMonths (format, index) {
        return list(format, index, 'months', 12, 'month');
    }

    function lists__listMonthsShort (format, index) {
        return list(format, index, 'monthsShort', 12, 'month');
    }

    function lists__listWeekdays (format, index) {
        return list(format, index, 'weekdays', 7, 'day');
    }

    function lists__listWeekdaysShort (format, index) {
        return list(format, index, 'weekdaysShort', 7, 'day');
    }

    function lists__listWeekdaysMin (format, index) {
        return list(format, index, 'weekdaysMin', 7, 'day');
    }

    locale_locales__getSetGlobalLocale('en', {
        ordinalParse: /\d{1,2}(th|st|nd|rd)/,
        ordinal : function (number) {
            var b = number % 10,
                output = (toInt(number % 100 / 10) === 1) ? 'th' :
                (b === 1) ? 'st' :
                (b === 2) ? 'nd' :
                (b === 3) ? 'rd' : 'th';
            return number + output;
        }
    });

    // Side effect imports
    utils_hooks__hooks.lang = deprecate('moment.lang is deprecated. Use moment.locale instead.', locale_locales__getSetGlobalLocale);
    utils_hooks__hooks.langData = deprecate('moment.langData is deprecated. Use moment.localeData instead.', locale_locales__getLocale);

    var mathAbs = Math.abs;

    function duration_abs__abs () {
        var data           = this._data;

        this._milliseconds = mathAbs(this._milliseconds);
        this._days         = mathAbs(this._days);
        this._months       = mathAbs(this._months);

        data.milliseconds  = mathAbs(data.milliseconds);
        data.seconds       = mathAbs(data.seconds);
        data.minutes       = mathAbs(data.minutes);
        data.hours         = mathAbs(data.hours);
        data.months        = mathAbs(data.months);
        data.years         = mathAbs(data.years);

        return this;
    }

    function duration_add_subtract__addSubtract (duration, input, value, direction) {
        var other = create__createDuration(input, value);

        duration._milliseconds += direction * other._milliseconds;
        duration._days         += direction * other._days;
        duration._months       += direction * other._months;

        return duration._bubble();
    }

    // supports only 2.0-style add(1, 's') or add(duration)
    function duration_add_subtract__add (input, value) {
        return duration_add_subtract__addSubtract(this, input, value, 1);
    }

    // supports only 2.0-style subtract(1, 's') or subtract(duration)
    function duration_add_subtract__subtract (input, value) {
        return duration_add_subtract__addSubtract(this, input, value, -1);
    }

    function bubble () {
        var milliseconds = this._milliseconds;
        var days         = this._days;
        var months       = this._months;
        var data         = this._data;
        var seconds, minutes, hours, years = 0;

        // The following code bubbles up values, see the tests for
        // examples of what that means.
        data.milliseconds = milliseconds % 1000;

        seconds           = absFloor(milliseconds / 1000);
        data.seconds      = seconds % 60;

        minutes           = absFloor(seconds / 60);
        data.minutes      = minutes % 60;

        hours             = absFloor(minutes / 60);
        data.hours        = hours % 24;

        days += absFloor(hours / 24);

        // Accurately convert days to years, assume start from year 0.
        years = absFloor(daysToYears(days));
        days -= absFloor(yearsToDays(years));

        // 30 days to a month
        // TODO (iskren): Use anchor date (like 1st Jan) to compute this.
        months += absFloor(days / 30);
        days   %= 30;

        // 12 months -> 1 year
        years  += absFloor(months / 12);
        months %= 12;

        data.days   = days;
        data.months = months;
        data.years  = years;

        return this;
    }

    function daysToYears (days) {
        // 400 years have 146097 days (taking into account leap year rules)
        return days * 400 / 146097;
    }

    function yearsToDays (years) {
        // years * 365 + absFloor(years / 4) -
        //     absFloor(years / 100) + absFloor(years / 400);
        return years * 146097 / 400;
    }

    function as (units) {
        var days;
        var months;
        var milliseconds = this._milliseconds;

        units = normalizeUnits(units);

        if (units === 'month' || units === 'year') {
            days   = this._days   + milliseconds / 864e5;
            months = this._months + daysToYears(days) * 12;
            return units === 'month' ? months : months / 12;
        } else {
            // handle milliseconds separately because of floating point math errors (issue #1867)
            days = this._days + Math.round(yearsToDays(this._months / 12));
            switch (units) {
                case 'week'   : return days / 7            + milliseconds / 6048e5;
                case 'day'    : return days                + milliseconds / 864e5;
                case 'hour'   : return days * 24           + milliseconds / 36e5;
                case 'minute' : return days * 24 * 60      + milliseconds / 6e4;
                case 'second' : return days * 24 * 60 * 60 + milliseconds / 1000;
                // Math.floor prevents floating point math errors here
                case 'millisecond': return Math.floor(days * 24 * 60 * 60 * 1000) + milliseconds;
                default: throw new Error('Unknown unit ' + units);
            }
        }
    }

    // TODO: Use this.as('ms')?
    function duration_as__valueOf () {
        return (
            this._milliseconds +
            this._days * 864e5 +
            (this._months % 12) * 2592e6 +
            toInt(this._months / 12) * 31536e6
        );
    }

    function makeAs (alias) {
        return function () {
            return this.as(alias);
        };
    }

    var asMilliseconds = makeAs('ms');
    var asSeconds      = makeAs('s');
    var asMinutes      = makeAs('m');
    var asHours        = makeAs('h');
    var asDays         = makeAs('d');
    var asWeeks        = makeAs('w');
    var asMonths       = makeAs('M');
    var asYears        = makeAs('y');

    function duration_get__get (units) {
        units = normalizeUnits(units);
        return this[units + 's']();
    }

    function makeGetter(name) {
        return function () {
            return this._data[name];
        };
    }

    var duration_get__milliseconds = makeGetter('milliseconds');
    var seconds      = makeGetter('seconds');
    var minutes      = makeGetter('minutes');
    var hours        = makeGetter('hours');
    var days         = makeGetter('days');
    var months       = makeGetter('months');
    var years        = makeGetter('years');

    function weeks () {
        return absFloor(this.days() / 7);
    }

    var round = Math.round;
    var thresholds = {
        s: 45,  // seconds to minute
        m: 45,  // minutes to hour
        h: 22,  // hours to day
        d: 26,  // days to month
        M: 11   // months to year
    };

    // helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize
    function substituteTimeAgo(string, number, withoutSuffix, isFuture, locale) {
        return locale.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
    }

    function duration_humanize__relativeTime (posNegDuration, withoutSuffix, locale) {
        var duration = create__createDuration(posNegDuration).abs();
        var seconds  = round(duration.as('s'));
        var minutes  = round(duration.as('m'));
        var hours    = round(duration.as('h'));
        var days     = round(duration.as('d'));
        var months   = round(duration.as('M'));
        var years    = round(duration.as('y'));

        var a = seconds < thresholds.s && ['s', seconds]  ||
                minutes === 1          && ['m']           ||
                minutes < thresholds.m && ['mm', minutes] ||
                hours   === 1          && ['h']           ||
                hours   < thresholds.h && ['hh', hours]   ||
                days    === 1          && ['d']           ||
                days    < thresholds.d && ['dd', days]    ||
                months  === 1          && ['M']           ||
                months  < thresholds.M && ['MM', months]  ||
                years   === 1          && ['y']           || ['yy', years];

        a[2] = withoutSuffix;
        a[3] = +posNegDuration > 0;
        a[4] = locale;
        return substituteTimeAgo.apply(null, a);
    }

    // This function allows you to set a threshold for relative time strings
    function duration_humanize__getSetRelativeTimeThreshold (threshold, limit) {
        if (thresholds[threshold] === undefined) {
            return false;
        }
        if (limit === undefined) {
            return thresholds[threshold];
        }
        thresholds[threshold] = limit;
        return true;
    }

    function humanize (withSuffix) {
        var locale = this.localeData();
        var output = duration_humanize__relativeTime(this, !withSuffix, locale);

        if (withSuffix) {
            output = locale.pastFuture(+this, output);
        }

        return locale.postformat(output);
    }

    var iso_string__abs = Math.abs;

    function iso_string__toISOString() {
        // inspired by https://github.com/dordille/moment-isoduration/blob/master/moment.isoduration.js
        var Y = iso_string__abs(this.years());
        var M = iso_string__abs(this.months());
        var D = iso_string__abs(this.days());
        var h = iso_string__abs(this.hours());
        var m = iso_string__abs(this.minutes());
        var s = iso_string__abs(this.seconds() + this.milliseconds() / 1000);
        var total = this.asSeconds();

        if (!total) {
            // this is the same as C#'s (Noda) and python (isodate)...
            // but not other JS (goog.date)
            return 'P0D';
        }

        return (total < 0 ? '-' : '') +
            'P' +
            (Y ? Y + 'Y' : '') +
            (M ? M + 'M' : '') +
            (D ? D + 'D' : '') +
            ((h || m || s) ? 'T' : '') +
            (h ? h + 'H' : '') +
            (m ? m + 'M' : '') +
            (s ? s + 'S' : '');
    }

    var duration_prototype__proto = Duration.prototype;

    duration_prototype__proto.abs            = duration_abs__abs;
    duration_prototype__proto.add            = duration_add_subtract__add;
    duration_prototype__proto.subtract       = duration_add_subtract__subtract;
    duration_prototype__proto.as             = as;
    duration_prototype__proto.asMilliseconds = asMilliseconds;
    duration_prototype__proto.asSeconds      = asSeconds;
    duration_prototype__proto.asMinutes      = asMinutes;
    duration_prototype__proto.asHours        = asHours;
    duration_prototype__proto.asDays         = asDays;
    duration_prototype__proto.asWeeks        = asWeeks;
    duration_prototype__proto.asMonths       = asMonths;
    duration_prototype__proto.asYears        = asYears;
    duration_prototype__proto.valueOf        = duration_as__valueOf;
    duration_prototype__proto._bubble        = bubble;
    duration_prototype__proto.get            = duration_get__get;
    duration_prototype__proto.milliseconds   = duration_get__milliseconds;
    duration_prototype__proto.seconds        = seconds;
    duration_prototype__proto.minutes        = minutes;
    duration_prototype__proto.hours          = hours;
    duration_prototype__proto.days           = days;
    duration_prototype__proto.weeks          = weeks;
    duration_prototype__proto.months         = months;
    duration_prototype__proto.years          = years;
    duration_prototype__proto.humanize       = humanize;
    duration_prototype__proto.toISOString    = iso_string__toISOString;
    duration_prototype__proto.toString       = iso_string__toISOString;
    duration_prototype__proto.toJSON         = iso_string__toISOString;
    duration_prototype__proto.locale         = locale;
    duration_prototype__proto.localeData     = localeData;

    // Deprecations
    duration_prototype__proto.toIsoString = deprecate('toIsoString() is deprecated. Please use toISOString() instead (notice the capitals)', iso_string__toISOString);
    duration_prototype__proto.lang = lang;

    // Side effect imports

    addFormatToken('X', 0, 0, 'unix');
    addFormatToken('x', 0, 0, 'valueOf');

    // PARSING

    addRegexToken('x', matchSigned);
    addRegexToken('X', matchTimestamp);
    addParseToken('X', function (input, array, config) {
        config._d = new Date(parseFloat(input, 10) * 1000);
    });
    addParseToken('x', function (input, array, config) {
        config._d = new Date(toInt(input));
    });

    // Side effect imports


    utils_hooks__hooks.version = '2.10.2';

    setHookCallback(local__createLocal);

    utils_hooks__hooks.fn                    = momentPrototype;
    utils_hooks__hooks.min                   = min;
    utils_hooks__hooks.max                   = max;
    utils_hooks__hooks.utc                   = create_utc__createUTC;
    utils_hooks__hooks.unix                  = moment__createUnix;
    utils_hooks__hooks.months                = lists__listMonths;
    utils_hooks__hooks.isDate                = isDate;
    utils_hooks__hooks.locale                = locale_locales__getSetGlobalLocale;
    utils_hooks__hooks.invalid               = valid__createInvalid;
    utils_hooks__hooks.duration              = create__createDuration;
    utils_hooks__hooks.isMoment              = isMoment;
    utils_hooks__hooks.weekdays              = lists__listWeekdays;
    utils_hooks__hooks.parseZone             = moment__createInZone;
    utils_hooks__hooks.localeData            = locale_locales__getLocale;
    utils_hooks__hooks.isDuration            = isDuration;
    utils_hooks__hooks.monthsShort           = lists__listMonthsShort;
    utils_hooks__hooks.weekdaysMin           = lists__listWeekdaysMin;
    utils_hooks__hooks.defineLocale          = defineLocale;
    utils_hooks__hooks.weekdaysShort         = lists__listWeekdaysShort;
    utils_hooks__hooks.normalizeUnits        = normalizeUnits;
    utils_hooks__hooks.relativeTimeThreshold = duration_humanize__getSetRelativeTimeThreshold;

    var _moment = utils_hooks__hooks;

    return _moment;

}));
/* ../../libs/moment/moment.js end */


/* end: ../../common.blocks/moment/moment.browser.js */
/* begin: ../../common.blocks/perdula/perdula.browser.js */
modules.define('perdula',
    ['i-bem__dom', 'BEMHTML', 'jquery', 'github'],
    function(provide, BEMDOM, BEMHTML, JQuery, github) {
        'use strict';
        provide(BEMDOM.decl(this.name, {
            onSetMod: {
                js: function() {
                    this.bind();
                },

                visible: function(modName, modVal) {
                    BEMDOM.scope.css('overflow', modVal === 'yes' ? 'hidden' : '');
                    this.emit(modVal === 'yes' ? 'show' : 'hide');
                }
            },

            bind: function() {
                var paranja = this.findElem('paranja');

                this.bindTo(paranja, 'click', function() {
                    this.setMod('visible', 'no');
                }.bind(this));
            },

            show: function(callBack) {
                this._moveDomOutside();
                //this.nextTick(function() {
                //
                //})

                setTimeout(function() {
                    return this.setMod('visible', 'yes');
                }.bind(this),25)
            },

            hide: function() {
                return this.setMod('visible', 'no');
            },

            setContent: function(content) {
                BEMDOM.update(this.elem('content'), content);
                return this;
            },

            isShowed: function() {
                return this.hasMod('visible', 'yes');
            },

            _moveDomOutside: function() {
                var container = BEMDOM.scope;
                container.children(':last')[0] === this.domElem[0] || this.domElem.appendTo(container);
            }
        }, {}))
    });

/* end: ../../common.blocks/perdula/perdula.browser.js */
/* begin: ../../common.blocks/form/form.browser.js */
modules.define('form',
    ['i-bem__dom', 'jquery', 'BEMHTML'],
    function (provide, BEMDOM, $, BEMHTML) {
        "use strict";
        provide(BEMDOM.decl(this.name, {
            onSetMod: {
                js: {
                    inited: function () {
                        this.bindTo('submit', this._onSubmit);
                        BEMDOM.blocks['input'].on(
                            { modName : 'focused', modVal : true }, this._onFocus, this
                        );

                        if (this._getBtnAddField()) {
                            this._getBtnAddField().on('click', this._onBtnAddFieldClick, this);
                        }

                        this._getFormFields().forEach(this._onAddNewInput, this);
                    }
                }
            },

            _onSubmit: function (e) {
                e.preventDefault();


                if (this._isValid()) {
                    console.log('submit form');
                    this.emit('submit', this._getSerialize());
                } else {
                    console.log('invalid');
                }

                return this;
            },

            _onError: function (input) {
                this._getPopup()
                    .setAnchor(input)
                    .setContent(this.elemParams(input).errorMessage)
                    .setMod('visible', true);
            },

            _onFocus: function () {
                this._getPopup().delMod('visible');
            },

            _onAddNewInput: function(field) {
                field.on('remove', this._onRemoveField, this);
            },

            _onRemoveField: function(e, field) {
                this._getPopup().delMod('visible');
                if(this._getFormFields().length === 1) {
                    this._onError(this.findBlockInside(field.domElem, 'input').domElem);
                } else {
                    BEMDOM.destruct(field.domElem);
                }
            },

            _onBtnAddFieldClick: function () {
                var fieldsCount = this._getFormFields().length;
                BEMDOM.append(this.elem('repositories'), BEMHTML.apply({
                    block: 'field',
                    first: fieldsCount === 0,
                    index: fieldsCount
                }));
                this._onAddNewInput(this._getFormFields().pop());
            },

            /**
             * Проверяем, введены ли данные в контрол, если нет возвращаем true
             * и показываем попап с ошибкой
             * @returns {boolean}
             */
            _isValid: function () {
                var repoFields = this.findElem('field', 'name', 'repositories'),
                    invalidField;
                repoFields.each(function(i, input) {
                    if(!this.findBlockInside($(input), 'input').getVal()) {
                        invalidField = $(input);
                        return false;
                    }
                }.bind(this));
                if(invalidField) {
                    return this._onError(invalidField);
                }

                var tokenField = this.findElem('field', 'name', 'token');
                if(!this.findBlockInside(tokenField, 'input').getVal()) {
                    return this._onError(tokenField);
                }
                return true;
            },

            /**
             * Получает значения контролов формы, http://api.jquery.com/serializeArray/
             * @returns {*}
             * @public
             */
            _getSerialize: function () {
                return this.domElem.serializeArray();
            },

            _getPopup: function () {
                return this._popup || (this._popup = this.findBlockInside('popup'));
            },

            _getBtnAddField: function () {
                return this._btnAddField || (this._btnAddField = this.findBlockInside('field-add', 'button'));
            },

            _getFormFields: function() {
                return this.findBlocksInside('field');
            }
        }));
    });

/* end: ../../common.blocks/form/form.browser.js */
/* begin: ../../common.blocks/filter/filter.browser.js */
modules.define('filter', ['i-bem__dom'], function (provide, BEMDOM) {
    'use strict';
    provide(BEMDOM.decl(this.name, {

        onSetMod: {
            js: {
                inited: function () {
                    //['repo-select', 'label-select']
                    ['repo-select']
                        .map(function (item) {
                            return this.findBlockInside(item, 'select');
                        }, this)
                        .forEach(function (item) {
                            item.on('change', this._onChange, this)
                        }, this);

                    //['issue-check', 'pr-check', 'assign-check']
                    ['issue-check', 'pr-check']
                        .map(function (item) {
                            return this.findBlockInside(item, 'checkbox');
                        }, this)
                        .forEach(function (item) {
                            item.bindTo('control', 'click', this._onChange.bind(this), this);
                        }, this);

                    this.findBlockInside('date-input', 'input').on('change', this._onChange, this);
                }
            }
        },

        _onChange: function () {
            var selectElems = [
                    ['repo-select', 'repository']
                    //['label-select', 'label']
                ],
                checkboxElems = [
                    ['issue-check', 'issues'],
                    ['pr-check', 'pullRequests'],
                    //['assign-check', 'assignToMe']
                ],
                values = selectElems
                    .map(function (item) {
                        return this.findBlockInside(item[0], 'select');
                    }, this)
                    .map(function (item) {
                        return item.getVal();
                    }, this)
                    .map(function (item, index) {
                        return { field: selectElems[index][1], value: item };
                    })
                    .concat(checkboxElems
                    .map(function (item) {
                        return this.findBlockInside(item[0], 'checkbox');
                    }, this)
                    .map(function (item, index) {
                        return { field: checkboxElems[index][1], value: item.hasMod('checked') };
                    }, this))
                    .concat({
                        field: 'date',
                        value: this.findBlockInside('date-input', 'input').getVal()
                    })
                    .reduce(function (prev, item) {
                        prev[item.field] = item.value;
                        return prev;
                    }, {});

                var strValues = JSON.stringify(values);
                console.log('filter data: ' + strValues);
                this.emit('change', values);
        }
    }));
});

/* end: ../../common.blocks/filter/filter.browser.js */
/* begin: ../../common.blocks/header/header.browser.js */
/* global modules:false */

modules.define('header', function(provide) {

provide();

});


/* end: ../../common.blocks/header/header.browser.js */
/* begin: ../../common.blocks/issues-grid/issues-grid.browser.js */
/* global modules:false */
modules.define('issues-grid',
    ['i-bem__dom', 'BEMHTML', 'jquery', 'github'],
    function(provide, BEMDOM, BEMHTML, JQuery, github) {
        'use strict';
        provide(BEMDOM.decl(this.name, {
            onSetMod: {
                js: {
                    inited: function() {
                        this._issues = this.params.issues;
                        this._perdula = this.findBlockInside('perdula');
                    }
                }
            },

            onElemSetMod: {
                sorter: {
                    loading: function(elem, modName, modVal) {
                        if (modVal) {
                            BEMDOM.append(elem, BEMHTML.apply({
                                block: 'spin',
                                mods: { theme: 'islands', size: 'xs', visible: true }
                            }));
                            this._processSort(elem);
                        } else {
                            var spin = this.findBlockInside(elem, 'spin');
                            spin && BEMDOM.destruct(spin.domElem);
                        }
                    },

                    direction: function(elem, modName, modVal) {
                        var icon = modVal ? (modVal === 'asc' ? 'sort-down' : 'sort-up') : 'angle-down',
                            html = BEMHTML.apply({ block: 'fa', icon: icon });

                        BEMDOM.update(elem, html);
                    }
                }
            },

            _onSorterClick: function(event) {
                this.setMod(event.currentTarget, 'loading');
            },

            _processSort: function(elem) {
                var key = elem.data().key,
                    currentDirection = this.getMod(elem, 'direction'),
                    newDirection = currentDirection === 'asc' ? 'dsc' : 'asc',
                    sorter = null;

                switch (key) {
                    case 'issue':
                        sorter = this._issueSorter;
                        break;
                    case 'title':
                        sorter = this._titleSorter;
                        break;
                    case 'activity':
                        sorter = this._commentsSorter;
                        break;
                }

                this._issues = sorter ? this._issues.sort(sorter) : this._issues.sort();

                /**
                 * Потому что прототип.
                 */
                if (newDirection === 'dsc') {
                    this._issues.reverse();
                }

                BEMDOM.update(this.elem('body'), BEMHTML.apply(
                    this._issues.map(function(issue) {
                        return {
                            block: 'issues-grid',
                            elem: 'issue-row',
                            issue: issue
                        };
                    })
                ));

                this.elem('sorter').each(function(index, node) {
                    this.setMod(JQuery(node), 'direction', '');
                }.bind(this));

                this.setMod(elem, 'direction', newDirection);

                this.nextTick(function() {
                    this.delMod(elem, 'loading');
                });
            },

            _commentsSorter: function(left, right) {
                return moment(left.lastActivity.date).valueOf() > moment(right.lastActivity.date).valueOf();
            },

            _issueSorter: function(left, right) {
                var issueLeft = left.organization + left.repository + left.id,
                    issueRight = right.organization + right.repository + right.id;

                return issueLeft > issueRight;
            },

            _titleSorter: function(left, right) {
                return left.title > right.title;
            },

            _onRowClick: function(event) {
                var elem = event.currentTarget,
                    issueId = elem.data().issue;

                this.setMod(elem, 'selected');

                var issue = this._getIssue(issueId);
                this._perdula.setContent(this._getIssueContent(issue));
                this._perdula.show();
                this._perdula.once('hide', function() {
                    this.delMod(elem, 'selected');
                }, this)
            },

            _getIssueContent: function() {
                return 'Hello world';
            },

            _getIssue: function(issueId) {
                return {
                    comments: [{
                        issueUrl: '//github.com',
                        author: {
                            avatarUrl: 'https://avatars.githubusercontent.com/u/475746?v=3',
                            login: 'tadatuta',
                            url: 'https://github.com/tadatuta'
                        },
                        date: '2015-04-08T20:46:32Z',
                        text: 'Thanks for the corrections - updated the doc accordingly'
                    }, {
                        issueUrl: '//github.com',
                        author: {
                            avatarUrl: 'https://avatars.githubusercontent.com/u/475746?v=3',
                            login: 'tadatuta',
                            url: 'https://github.com/tadatuta'
                        },
                        date: '2015-04-08T20:46:32Z',
                        text: 'Thanks for the corrections - updated the doc accordingly'
                    }, {
                        issueUrl: '//github.com',
                        author: {
                            avatarUrl: 'https://avatars.githubusercontent.com/u/475746?v=3',
                            login: 'tadatuta',
                            url: 'https://github.com/tadatuta'
                        },
                        date: '2015-04-08T20:46:32Z',
                        text: 'Thanks for the corrections - updated the doc accordingly'
                    }, {
                        issueUrl: '//github.com',
                        author: {
                            avatarUrl: 'https://avatars.githubusercontent.com/u/475746?v=3',
                            login: 'tadatuta',
                            url: 'https://github.com/tadatuta'
                        },
                        date: '2015-04-08T20:46:32Z',
                        text: 'Thanks for the corrections - updated the doc accordingly'
                    }, {
                        issueUrl: '//github.com',
                        author: {
                            avatarUrl: 'https://avatars.githubusercontent.com/u/475746?v=3',
                            login: 'tadatuta',
                            url: 'https://github.com/tadatuta'
                        },
                        date: '2015-04-08T20:46:32Z',
                        text: 'Thanks for the corrections - updated the doc accordingly'
                    }]
                }
            }
        }, {

            live: function() {
                this.liveBindTo('sorter', 'click', function(event) {
                    this._onSorterClick(event)
                });

                this.liveBindTo('issue-row', 'click', function(event) {
                    this._onRowClick(event);
                })
            }

        }));

    });


/* end: ../../common.blocks/issues-grid/issues-grid.browser.js */
/* begin: ../../common.blocks/app/app.browser.js */
modules.define('app', ['i-bem__dom', 'BEMHTML', 'github'], function (provide, BEMDOM, BEMHTML, github) {
    'use strict';
    provide(BEMDOM.decl(this.name, {
        onSetMod: {
            js: {
                inited: function () {
                    try {
                        this._config = JSON.parse(window.localStorage.getItem('config'));
                    } catch(e) {}

                    this.setMod('state', this._config ? 'loading' : 'config');

                    this._getLinkChangeConfig().on('click', this._onClickLinkChangeConfig, this);
                }
            },

            state: {
                config: function () {
                    this._buildConfigView();
                },

                loading: function () {
                    /**
                     * На установку модификатора loading зовем
                     * this._getContent() для получения json
                     *
                     * для тестинга лоадера пока setTimeout
                     * @type {onSetMod.state.loading}
                     * @private
                     */

                    var _this = this;

                    this._showContent({ block: 'app-content', mods: { view: 'loading' } });

                    this._getContent().then(function(issues) {
                        _this._issues = issues;
                        _this.setMod('state', 'content');
                    });

                },

                content: function () {
                    this._showContent({
                        block: 'app-content',
                        mods: { view: 'content' },
                        issues: this._issues,
                        config: this._config
                    });

                    this._getFilter().on('change', this._onFilterChange, this);
                }
            }
        },

        _onFilterChange: function (e, data) {
            if (this._issues) {
                var result = this._issues
                    .filter(function (item) {

                        // filter by repositories
                        if (data.repository && data.repository !== 'All repositories') {
                            var url = item.organization + '/' + item.repository;

                            return data.repository === url;
                        }  else {
                            return true;
                        }
                    })
                    .filter(function (item) {

                        if (data.issues === false && data.pullRequests === true) {
                            // show only PR
                            return item.isPullRequest === true;
                        } else if (data.issues === true && data.pullRequests === false) {
                            // show only issues
                            return item.isPullRequest === false;
                        } else {
                            return true;
                        }

                    })
                    .filter(function (item) {

                        // date: 11.11.2014
                        if (data.date) {
                            return item.comment.filter(function (comment) {
                                var date = new Date('11.11.2014'),
                                    dateComment = new Date(comment.date);

                                return date.toDateString() === dateComment.toDateString()
                            });
                        } else {
                            return true;
                        }
                    });

                console.log('result', result);

                var bemjson = {
                    block: 'app-content',
                    mods: { view: 'content' },
                    elem: 'layout',
                    issues: result
                };

                console.log('html', BEMHTML.apply(bemjson));

                BEMDOM.replace(this.findBlockInside('app-content').findElem('layout'), BEMHTML.apply(bemjson));
            }
        },

        _onFormConfigSubmit: function (e, data) {
            /**
             * сериализуем форму и сохраняем конфиг,
             * переставляем модификатор в loading
             */

            if (!data) return;
            if (!this._config) this._config = {};

            var _config = this._config;

            data.forEach(function (item) {

                if (item.value === '') return false;
                if (item.name === 'repositories') {

                    if(!_config.repositories) {
                        _config.repositories = [];
                    }

                    // if exist, remove slash before url
                    if ((/^\//gi).test(item.value)) {
                        item.value = item.value.slice(1);
                    }

                    _config.repositories.push(item.value);

                } else {
                    _config[item.name] = item.value;
                }
            });

            window.localStorage.setItem('config', JSON.stringify(this._config));

            this._getFormConfig().un('submit', this._onFormConfigSubmit, this);

            this.setMod('state', 'loading');
        },

        _onClickLinkChangeConfig: function () {
            this._clearCacheConfigBlocks();
            this.setMod('state', 'config');
        },

        _onClickBtnConfigClear: function () {
            this._clearConfig();
            this._buildConfigView();
        },

        _clearConfig: function () {
            delete this._config;
            window.localStorage.removeItem('config');
        },

        _buildConfigView: function () {
            var bemjson = {
                block: 'app-content',
                mods: { view: 'config' },
                config: this._config
            };

            this._showContent(bemjson);

            this._getFormConfig().on('submit', this._onFormConfigSubmit, this);
            this._getBtnConfigClear().on('click', this._onClickBtnConfigClear, this);
        },

        _getContent: function () {
            return github.getIssues(this._config.repositories, {token: this._config.token});
        },

        _showContent: function(bemjson) {
            BEMDOM.update(this.elem('content'), BEMHTML.apply(bemjson));
        },

        _getSpin: function () {
            return this._spin || (this._spin = this.findBlockInside('spin', 'spin'));
        },

        _getFormConfig: function () {
            return this._formConfig || (this._formConfig = this.findBlockInside('form'));
        },

        _getLinkChangeConfig: function () {
            return this._linkChangeConfig || (this._linkChangeConfig = this.findBlockInside('change-config', 'link'));
        },

        _getBtnConfigClear: function () {
            return this._btnConfigClear || (this._btnConfigClear = this.findBlockInside('btn-config-clear', 'button'));
        },

        _getFilter: function () {
            return this._filter || (this._filter = this.findBlockInside('filter', 'filter'));
        },

        _clearCacheConfigBlocks: function () {
            delete this._formConfig;
            delete this._btnConfigClear;
        }
    }));
});

/* end: ../../common.blocks/app/app.browser.js */
(function(g) {
  var __bem_xjst = function(exports) {
     var $$mode = "", $$block = "", $$elem = "", $$elemMods = null, $$mods = null;

var __$ref = {};

function apply(ctx) {
    ctx = ctx || this;
    $$mods = ctx["mods"];
    $$elemMods = ctx["elemMods"];
    $$elem = ctx["elem"];
    $$block = ctx["block"];
    $$mode = ctx["_mode"];
    try {
        return applyc(ctx, __$ref);
    } catch (e) {
        e.xjstContext = ctx;
        throw e;
    }
}

exports.apply = apply;

function applyc(__$ctx, __$ref) {
    var __$t = $$mode;
    if (__$t === "js") {
        var __$r = __$g0(__$ctx, __$ref);
        if (__$r !== __$ref) return __$r;
    } else if (__$t === "content") {
        var __$r = __$g1(__$ctx, __$ref);
        if (__$r !== __$ref) return __$r;
    } else if (__$t === "attrs") {
        var __$r = __$g2(__$ctx, __$ref);
        if (__$r !== __$ref) return __$r;
    } else if (__$t === "mix") {
        var __$t = $$block;
        if (__$t === "button") {
            if (!$$elem) {
                return {
                    elem: "control"
                };
            }
        } else if (__$t === "field") {
            if (!$$elem) {
                return {
                    block: "form",
                    elem: "field"
                };
            }
        } else if (__$t === "link") {
            if (!$$elem) {
                return [ {
                    elem: "control"
                } ];
            }
        } else if (__$t === "menu") {
            if (!$$elem) {
                return [ {
                    elem: "control"
                } ];
            }
        } else if (__$t === "filter") {
            var __$t = $$elem;
            if (__$t === "delimeter") {
                return [ {
                    elem: "inline-field"
                } ];
            } else if (__$t === "date-input") {
                return [ {
                    elem: "inline-field"
                } ];
            } else if (__$t === "label-select") {
                return [ {
                    elem: "inline-field"
                } ];
            } else if (__$t === "assign-check") {
                return {
                    elem: "inline-field"
                };
            } else if (__$t === "pr-check") {
                return [ {
                    elem: "inline-field"
                } ];
            } else if (__$t === "issue-check") {
                return [ {
                    elem: "inline-field"
                } ];
            } else if (__$t === "repo-select") {
                return [ {
                    elem: "inline-field"
                } ];
            }
        }
        return undefined;
    } else if (__$t === "tag") {
        var __$r = __$g3(__$ctx, __$ref);
        if (__$r !== __$ref) return __$r;
    } else if (__$t === "default") {
        var __$r = __$g4(__$ctx, __$ref);
        if (__$r !== __$ref) return __$r;
    } else if (__$t === "bem") {
        if ($$block === "ua" && !$$elem) {
            return false;
        }
        return undefined;
    } else if (__$t === "cls") {
        if ($$block === "fa" && !$$elem) {
            var __$r = __$b136(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
        return undefined;
    } else if (__$t === "") {
        if (__$ctx.ctx && __$ctx.ctx._vow && (__$ctx.__$a0 & 2097152) === 0) {
            var __$r = __$b138(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
        if (__$ctx.isSimple(__$ctx.ctx)) {
            var __$r = __$b139(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
        if (!__$ctx.ctx) {
            var __$r = __$b140(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
        if (__$ctx.isArray(__$ctx.ctx)) {
            var __$r = __$b141(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
        var __$r = __$b142(__$ctx, __$ref);
        if (__$r !== __$ref) return __$r;
    }
}

[ function(exports, context) {
    var undef, BEM_ = {}, toString = Object.prototype.toString, slice = Array.prototype.slice, isArray = Array.isArray || function(obj) {
        return toString.call(obj) === "[object Array]";
    }, SHORT_TAGS = {
        area: 1,
        base: 1,
        br: 1,
        col: 1,
        command: 1,
        embed: 1,
        hr: 1,
        img: 1,
        input: 1,
        keygen: 1,
        link: 1,
        meta: 1,
        param: 1,
        source: 1,
        wbr: 1
    };
    (function(BEM, undefined) {
        var MOD_DELIM = "_", ELEM_DELIM = "__", NAME_PATTERN = "[a-zA-Z0-9-]+";
        function buildModPostfix(modName, modVal) {
            var res = MOD_DELIM + modName;
            if (modVal !== true) res += MOD_DELIM + modVal;
            return res;
        }
        function buildBlockClass(name, modName, modVal) {
            var res = name;
            if (modVal) res += buildModPostfix(modName, modVal);
            return res;
        }
        function buildElemClass(block, name, modName, modVal) {
            var res = buildBlockClass(block) + ELEM_DELIM + name;
            if (modVal) res += buildModPostfix(modName, modVal);
            return res;
        }
        BEM.INTERNAL = {
            NAME_PATTERN: NAME_PATTERN,
            MOD_DELIM: MOD_DELIM,
            ELEM_DELIM: ELEM_DELIM,
            buildModPostfix: buildModPostfix,
            buildClass: function(block, elem, modName, modVal) {
                var typeOfModName = typeof modName;
                if (typeOfModName === "string" || typeOfModName === "boolean") {
                    var typeOfModVal = typeof modVal;
                    if (typeOfModVal !== "string" && typeOfModVal !== "boolean") {
                        modVal = modName;
                        modName = elem;
                        elem = undef;
                    }
                } else if (typeOfModName !== "undefined") {
                    modName = undef;
                } else if (elem && typeof elem !== "string") {
                    elem = undef;
                }
                if (!(elem || modName)) {
                    return block;
                }
                return elem ? buildElemClass(block, elem, modName, modVal) : buildBlockClass(block, modName, modVal);
            },
            buildModsClasses: function(block, elem, mods) {
                var res = "";
                if (mods) {
                    var modName;
                    for (modName in mods) {
                        if (!mods.hasOwnProperty(modName)) continue;
                        var modVal = mods[modName];
                        if (!modVal && modVal !== 0) continue;
                        typeof modVal !== "boolean" && (modVal += "");
                        res += " " + (elem ? buildElemClass(block, elem, modName, modVal) : buildBlockClass(block, modName, modVal));
                    }
                }
                return res;
            },
            buildClasses: function(block, elem, mods) {
                var res = "";
                res += elem ? buildElemClass(block, elem) : buildBlockClass(block);
                res += this.buildModsClasses(block, elem, mods);
                return res;
            }
        };
    })(BEM_);
    var ts = {
        '"': "&quot;",
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;"
    }, f = function(t) {
        return ts[t] || t;
    };
    var buildEscape = function(r) {
        r = new RegExp(r, "g");
        return function(s) {
            return ("" + s).replace(r, f);
        };
    };
    context.BEMContext = BEMContext;
    function BEMContext(context, apply_) {
        this.ctx = typeof context === "undefined" ? "" : context;
        this.apply = apply_;
        this._str = "";
        var _this = this;
        this._buf = {
            push: function() {
                var chunks = slice.call(arguments).join("");
                _this._str += chunks;
            },
            join: function() {
                return this._str;
            }
        };
        this._ = this;
        this._start = true;
        this._mode = "";
        this._listLength = 0;
        this._notNewList = false;
        this.position = 0;
        this.block = undef;
        this.elem = undef;
        this.mods = undef;
        this.elemMods = undef;
    }
    BEMContext.prototype.isArray = isArray;
    BEMContext.prototype.isSimple = function isSimple(obj) {
        if (!obj || obj === true) return true;
        var t = typeof obj;
        return t === "string" || t === "number";
    };
    BEMContext.prototype.isShortTag = function isShortTag(t) {
        return SHORT_TAGS.hasOwnProperty(t);
    };
    BEMContext.prototype.extend = function extend(o1, o2) {
        if (!o1 || !o2) return o1 || o2;
        var res = {}, n;
        for (n in o1) o1.hasOwnProperty(n) && (res[n] = o1[n]);
        for (n in o2) o2.hasOwnProperty(n) && (res[n] = o2[n]);
        return res;
    };
    var cnt = 0, id = +new Date(), expando = "__" + id, get = function() {
        return "uniq" + id + ++cnt;
    };
    BEMContext.prototype.identify = function(obj, onlyGet) {
        if (!obj) return get();
        if (onlyGet || obj[expando]) {
            return obj[expando];
        } else {
            return obj[expando] = get();
        }
    };
    BEMContext.prototype.xmlEscape = buildEscape("[&<>]");
    BEMContext.prototype.attrEscape = buildEscape('["&<>]');
    BEMContext.prototype.BEM = BEM_;
    BEMContext.prototype.isFirst = function isFirst() {
        return this.position === 1;
    };
    BEMContext.prototype.isLast = function isLast() {
        return this.position === this._listLength;
    };
    BEMContext.prototype.generateId = function generateId() {
        return this.identify(this.ctx);
    };
    var oldApply = exports.apply;
    exports.apply = BEMContext.apply = function BEMContext_apply(context) {
        var ctx = new BEMContext(context || this, oldApply);
        ctx.apply();
        return ctx._str;
    };
    BEMContext.prototype.reapply = BEMContext.apply;
}, function(exports, context) {
    var moment;
    if (typeof module !== "undefined" && typeof module.exports === "object") {
        moment = require("../../libs/moment/moment.js");
    } else {
        moment = window.moment;
    }
    context.BEMContext.prototype.moment = moment;
} ].forEach(function(fn) {
    fn(exports, this);
}, {
    recordExtensions: function(ctx) {
        ctx["__$a0"] = 0;
        ctx["_ctx"] = undefined;
        ctx["_menuMods"] = undefined;
        ctx["_mode"] = undefined;
        ctx["ctx"] = undefined;
        ctx["_select"] = undefined;
        ctx["_checkedOptions"] = undefined;
        ctx["_firstOption"] = undefined;
        ctx["_input"] = undefined;
        ctx["_str"] = undefined;
        ctx["block"] = undefined;
        ctx["elem"] = undefined;
        ctx["_notNewList"] = undefined;
        ctx["position"] = undefined;
        ctx["_listLength"] = undefined;
        ctx["_currBlock"] = undefined;
        ctx["mods"] = undefined;
        ctx["elemMods"] = undefined;
    },
    resetApplyNext: function(ctx) {
        ctx["__$a0"] = 0;
    }
});

function __$b5(__$ctx, __$ref) {
    var ctx__$117 = __$ctx.ctx;
    return {
        name: ctx__$117.name,
        optionsMaxHeight: ctx__$117.optionsMaxHeight
    };
}

function __$b11(__$ctx, __$ref) {
    var ctx__$49 = __$ctx.ctx;
    return {
        year: ctx__$49.year,
        month: ctx__$49.month,
        date: ctx__$49.date
    };
}

function __$b17(__$ctx, __$ref) {
    var ctx__$138 = __$ctx.ctx;
    return {
        mainOffset: ctx__$138.mainOffset,
        secondaryOffset: ctx__$138.secondaryOffset,
        viewportOffset: ctx__$138.viewportOffset,
        directions: ctx__$138.directions,
        zIndexGroupLevel: ctx__$138.zIndexGroupLevel
    };
}

function __$b21(__$ctx, __$ref) {
    "use strict";
    var config__$0 = __$ctx.ctx.config;
    if (!config__$0) config__$0 = {};
    if (!config__$0.repositories) config__$0.repositories = [ "", "" ];
    __$ctx.ctx.js = config__$0;
    return {
        block: "form",
        mix: {
            block: "app",
            elem: "form"
        },
        content: [ {
            block: "title",
            mods: {
                level: 4
            },
            content: "Settings:"
        }, {
            elem: "repositories",
            content: config__$0.repositories.map(function(item, idx) {
                return {
                    block: "field",
                    mix: {
                        block: "form",
                        elem: "field",
                        elemMods: {
                            name: "repositories"
                        },
                        js: {
                            errorMessage: "You need to add at least one repo"
                        }
                    },
                    value: item,
                    first: idx === 0,
                    index: idx
                };
            })
        }, {
            elem: "field",
            mix: {
                block: "app",
                elem: "form-field"
            },
            content: {
                block: "button",
                mix: {
                    block: "form",
                    elem: "field-add"
                },
                mods: {
                    theme: "islands",
                    size: "m"
                },
                icon: {
                    block: "fa",
                    mix: {
                        block: "icon"
                    },
                    icon: "plus"
                },
                text: "Add repository"
            }
        }, {
            elem: "field",
            elemMods: {
                name: "token"
            },
            mix: {
                block: "app",
                elem: "form-field"
            },
            js: {
                errorMessage: "User token is required to application"
            },
            content: [ {
                elem: "label",
                content: 'Generate user token <a href="https://github.com/settings/tokens/new">on this page</a>' + " and paste it here. Do not forget to check <code>admin:org</code> permission"
            }, {
                block: "input",
                mix: {
                    block: "form",
                    elem: "control",
                    elemMods: {
                        required: true
                    }
                },
                mods: {
                    theme: "islands",
                    size: "l",
                    width: "available",
                    "has-clear": true
                },
                name: "token",
                val: config__$0.token,
                placeholder: "7888f1e0edfd0f7517еe8cad83e448b088dba93c",
                tabIndex: 3
            } ]
        }, {
            block: "button",
            mix: {
                block: "app",
                elem: "btn-config-submit"
            },
            mods: {
                theme: "islands",
                size: "l",
                type: "submit",
                view: "action"
            },
            text: "Save",
            tabIndex: 4
        }, {
            block: "button",
            mix: {
                block: "app",
                elem: "btn-config-clear"
            },
            mods: {
                theme: "islands",
                size: "l",
                view: "pseudo"
            },
            text: "Clear config",
            tabIndex: 5
        }, {
            block: "popup",
            mix: {
                block: "form",
                elem: "popup-error"
            },
            mods: {
                theme: "islands",
                target: "anchor",
                autoclosable: true
            }
        } ]
    };
}

function __$b32(__$ctx, __$ref) {
    var ctx__$96 = __$ctx.ctx, content__$97 = [ ctx__$96.icon ];
    "text" in ctx__$96 && content__$97.push({
        elem: "text",
        content: ctx__$96.text
    });
    return content__$97;
}

function __$b34(__$ctx, __$ref) {
    var message__$23 = "";
    switch (__$ctx.ctx.type) {
      case "comment":
        message__$23 = "commented";
        break;

      case "create":
        message__$23 = "create issue";
        break;

      case "commit":
        message__$23 = "push commit";
        break;

      case "pull":
        message__$23 = "make pull request";
        break;
    }
    return message__$23 ? " " + message__$23 + " " : "";
}

function __$b46(__$ctx, __$ref) {
    var _ctx__$24 = __$ctx._ctx, year__$25 = _ctx__$24.year, month__$26 = _ctx__$24.month - 1, firstDayOfMonth__$27 = new Date(year__$25, month__$26, 1).getDay(), now__$28 = new Date(), currentDateString__$29 = [ now__$28.getFullYear(), now__$28.getMonth(), now__$28.getDate() ].join("."), selectedDateString__$30 = [ year__$25, month__$26, _ctx__$24.date ].join(".");
    if (firstDayOfMonth__$27 === 0) firstDayOfMonth__$27 = 7;
    var daysInMonth__$31 = new Date(year__$25, month__$26 + 1, 0).getDate(), weekCount__$32 = Math.ceil((daysInMonth__$31 + firstDayOfMonth__$27 - 1) / 7), result__$33 = [];
    for (var i__$34 = 0; i__$34 < weekCount__$32; i__$34++) {
        var row__$35 = [];
        for (var j__$36 = 1; j__$36 <= 7; j__$36++) {
            var date__$37 = i__$34 * 7 + j__$36 - firstDayOfMonth__$27 + 1, dateValue__$38 = new Date(year__$25, month__$26, date__$37).getDate(), dateString__$39 = [ year__$25, month__$26, date__$37 ].join(".");
            row__$35.push({
                elem: "day",
                elemMods: {
                    month: date__$37 < 1 ? "prev" : date__$37 > daysInMonth__$31 ? "next" : "current",
                    weekend: j__$36 > 5,
                    today: currentDateString__$29 === dateString__$39,
                    selected: selectedDateString__$30 === dateString__$39
                },
                js: {
                    date: dateValue__$38
                },
                content: {
                    elem: "date",
                    content: dateValue__$38
                }
            });
        }
        result__$33.push({
            elem: "row",
            content: row__$35
        });
    }
    return result__$33;
}

function __$b49(__$ctx, __$ref) {
    var _ctx__$40 = __$ctx._ctx, monthNames__$41 = {
        1: "jan",
        2: "feb",
        3: "mar",
        4: "apr",
        5: "may",
        6: "jun",
        7: "jul",
        8: "aug",
        9: "sep",
        10: "oct",
        11: "nov",
        12: "dec"
    };
    return [ {
        elem: "month-switch",
        elemMods: {
            dest: "prev"
        },
        content: "<"
    }, {
        elem: "month-display",
        content: [ monthNames__$41[_ctx__$40.month], " ", _ctx__$40.year ]
    }, {
        elem: "month-switch",
        elemMods: {
            dest: "next"
        },
        content: ">"
    } ];
}

function __$b50(__$ctx, __$ref) {
    var ctx__$48 = __$ctx.ctx;
    return {
        elem: "content",
        year: ctx__$48.year,
        month: ctx__$48.month,
        date: ctx__$48.date
    };
}

function __$b51(__$ctx, __$ref) {
    var ctx__$52 = __$ctx.ctx, mods__$53 = $$mods;
    return [ {
        elem: "box",
        content: {
            elem: "control",
            checked: mods__$53.checked,
            disabled: mods__$53.disabled,
            name: ctx__$52.name,
            val: ctx__$52.val
        }
    }, ctx__$52.text ];
}

function __$b58(__$ctx, __$ref) {
    var content__$135 = __$ctx.ctx.content, ALL_REPOSITORIES__$136 = "All repositories";
    return {
        block: "select",
        mods: {
            mode: "radio-check",
            theme: "islands",
            size: "m"
        },
        name: "repo_select",
        val: ALL_REPOSITORIES__$136,
        text: "Select repositories",
        options: __$ctx.ctx.content.concat(ALL_REPOSITORIES__$136).map(function(item) {
            return {
                val: item,
                text: item
            };
        })
    };
}

function __$b59(__$ctx, __$ref) {
    var config__$137 = __$ctx.ctx.config;
    return [ {
        elem: "repo-select",
        content: config__$137.repositories || []
    }, {
        elem: "issue-check"
    }, {
        elem: "pr-check"
    }, {
        elem: "delimeter"
    }, {
        elem: "date-input"
    } ];
}

function __$b62(__$ctx, __$ref) {
    var stack__$172 = __$ctx.ctx.stack;
    return stack__$172 ? stack__$172.map(function(icon) {
        icon.block = "fa";
        icon.__instack = true;
        return icon;
    }) : __$ctx.ctx.content;
}

function __$b65(__$ctx, __$ref) {
    var input__$139 = __$ctx._input, attrs__$140 = {
        id: input__$139.id,
        name: input__$139.name,
        value: input__$139.val,
        maxlength: input__$139.maxLength,
        tabindex: input__$139.tabIndex,
        placeholder: input__$139.placeholder
    };
    input__$139.autocomplete === false && (attrs__$140.autocomplete = "off");
    $$mods.disabled && (attrs__$140.disabled = "disabled");
    return attrs__$140;
}

function __$b67(__$ctx, __$ref) {
    var ctx__$98 = __$ctx.ctx, attrs__$99 = {
        type: $$mods.type || "button",
        name: ctx__$98.name,
        value: ctx__$98.val
    };
    $$mods.disabled && (attrs__$99.disabled = "disabled");
    return __$ctx.extend(function __$lb__$100() {
        var __$r__$101;
        var __$l0__$102 = __$ctx.__$a0;
        __$ctx.__$a0 = __$ctx.__$a0 | 16384;
        __$r__$101 = applyc(__$ctx, __$ref);
        __$ctx.__$a0 = __$l0__$102;
        return __$r__$101;
    }(), attrs__$99);
}

function __$b68(__$ctx, __$ref) {
    var ctx__$103 = __$ctx.ctx;
    return {
        role: "button",
        tabindex: ctx__$103.tabIndex,
        id: ctx__$103.id,
        title: ctx__$103.title
    };
}

function __$b69(__$ctx, __$ref) {
    var ctx__$16 = __$ctx.ctx, attrs__$17 = {}, tabIndex__$18;
    if (!$$mods.disabled) {
        if (ctx__$16.url) {
            attrs__$17.href = ctx__$16.url;
            tabIndex__$18 = ctx__$16.tabIndex;
        } else {
            tabIndex__$18 = ctx__$16.tabIndex || 0;
        }
    }
    typeof tabIndex__$18 === "undefined" || (attrs__$17.tabindex = tabIndex__$18);
    ctx__$16.title && (attrs__$17.title = ctx__$16.title);
    ctx__$16.target && (attrs__$17.target = ctx__$16.target);
    return attrs__$17;
}

function __$b72(__$ctx, __$ref) {
    var attrs__$50 = {
        type: "checkbox",
        autocomplete: "off"
    }, ctx__$51 = __$ctx.ctx;
    attrs__$50.name = ctx__$51.name;
    attrs__$50.value = ctx__$51.val;
    ctx__$51.checked && (attrs__$50.checked = "checked");
    ctx__$51.disabled && (attrs__$50.disabled = "disabled");
    return attrs__$50;
}

function __$b76(__$ctx, __$ref) {
    var attrs__$67 = {
        role: "menu"
    };
    $$mods.disabled || (attrs__$67.tabindex = 0);
    return attrs__$67;
}

function __$b78(__$ctx, __$ref) {
    var ctx__$155 = __$ctx.ctx;
    return __$ctx.extend(function __$lb__$156() {
        var __$r__$157;
        var __$l0__$158 = __$ctx.__$a0;
        __$ctx.__$a0 = __$ctx.__$a0 | 1048576;
        __$r__$157 = applyc(__$ctx, __$ref);
        __$ctx.__$a0 = __$l0__$158;
        return __$r__$157;
    }(), {
        src: ctx__$155.url,
        width: ctx__$155.width,
        height: ctx__$155.height,
        alt: ctx__$155.alt,
        title: ctx__$155.title
    });
}

function __$b80(__$ctx, __$ref) {
    if (__$ctx.ctx.color) {
        var c__$159 = "color:" + __$ctx.ctx.color;
        return {
            style: c__$159
        };
    }
    return;
}

function __$b81(__$ctx, __$ref) {
    var attrs__$173 = {
        "aria-hidden": "true"
    }, url__$174 = __$ctx.ctx.url;
    if (url__$174) attrs__$173.style = "background-image:url(" + url__$174 + ")";
    return attrs__$173;
}

function __$b124(__$ctx, __$ref) {
    var __$r__$142;
    var __$l0__$143 = __$ctx._input;
    __$ctx._input = __$ctx.ctx;
    var __$r__$145;
    var __$l1__$146 = __$ctx.__$a0;
    __$ctx.__$a0 = __$ctx.__$a0 | 262144;
    __$r__$145 = applyc(__$ctx, __$ref);
    __$ctx.__$a0 = __$l1__$146;
    __$r__$142 = __$r__$145;
    __$ctx._input = __$l0__$143;
    return;
}

function __$b125(__$ctx, __$ref) {
    var mods__$104 = $$mods;
    var __$r__$106;
    var __$l0__$107 = $$mode;
    $$mode = "";
    var __$l1__$108 = __$ctx.ctx;
    __$ctx.ctx = {
        block: "button",
        mix: {
            block: $$block,
            elem: $$elem
        },
        mods: {
            size: mods__$104.size,
            theme: mods__$104.theme,
            view: mods__$104.view,
            focused: mods__$104.focused,
            disabled: mods__$104.disabled,
            checked: mods__$104.mode !== "radio" && !!__$ctx._checkedOptions.length
        },
        id: __$ctx._select.id,
        tabIndex: __$ctx._select.tabIndex,
        content: [ function __$lb__$109() {
            var __$r__$110;
            var __$l3__$111 = $$mode;
            $$mode = "content";
            __$r__$110 = applyc(__$ctx, __$ref);
            $$mode = __$l3__$111;
            return __$r__$110;
        }(), {
            block: "icon",
            mix: {
                block: "select",
                elem: "tick"
            }
        } ]
    };
    var __$r__$112;
    var __$l2__$113 = __$ctx.__$a0;
    __$ctx.__$a0 = __$ctx.__$a0 | 32768;
    __$r__$112 = applyc(__$ctx, __$ref);
    __$ctx.__$a0 = __$l2__$113;
    __$r__$106 = __$r__$112;
    $$mode = __$l0__$107;
    __$ctx.ctx = __$l1__$108;
    return;
}

function __$b126(__$ctx, __$ref) {
    var mods__$83 = $$mods, optionToMenuItem__$84 = function(option) {
        var res__$85 = {
            block: "menu-item",
            mods: {
                disabled: mods__$83.disabled || option.disabled
            },
            val: option.val,
            js: {
                checkedText: option.checkedText
            },
            content: option.text
        };
        if (option.icon) {
            res__$85.js.text = option.text;
            res__$85.content = [ option.icon, res__$85.content ];
        }
        return res__$85;
    };
    var __$r__$87;
    var __$l0__$88 = $$mode;
    $$mode = "";
    var __$l1__$89 = __$ctx.ctx;
    __$ctx.ctx = {
        block: "menu",
        mix: {
            block: $$block,
            elem: $$elem
        },
        mods: {
            size: mods__$83.size,
            theme: mods__$83.theme,
            disabled: mods__$83.disabled,
            mode: mods__$83.mode
        },
        val: __$ctx._select.val,
        attrs: {
            tabindex: undefined
        },
        content: __$ctx._select.options.map(function(optionOrGroup) {
            return optionOrGroup.group ? {
                elem: "group",
                mods: {
                    "has-title": !!optionOrGroup.title
                },
                title: optionOrGroup.title,
                content: optionOrGroup.group.map(optionToMenuItem__$84)
            } : optionToMenuItem__$84(optionOrGroup);
        })
    };
    var __$r__$91;
    var __$l2__$92 = __$ctx.__$a0;
    __$ctx.__$a0 = __$ctx.__$a0 | 4096;
    __$r__$91 = applyc(__$ctx, __$ref);
    __$ctx.__$a0 = __$l2__$92;
    __$r__$87 = __$r__$91;
    $$mode = __$l0__$88;
    __$ctx.ctx = __$l1__$89;
    return;
}

function __$b127(__$ctx, __$ref) {
    if (!$$mods.mode) throw Error("Can't build select without mode modifier");
    var ctx__$118 = __$ctx.ctx, isValDef__$119 = typeof ctx__$118.val !== "undefined", isModeCheck__$120 = $$mods.mode === "check", firstOption__$121, checkedOptions__$122 = [], containsVal__$123 = function(val) {
        return isValDef__$119 && (isModeCheck__$120 ? ctx__$118.val.indexOf(val) > -1 : ctx__$118.val === val);
    }, iterateOptions__$124 = function(content) {
        var i__$125 = 0, option__$126;
        while (option__$126 = content[i__$125++]) {
            if (option__$126.group) {
                iterateOptions__$124(option__$126.group);
            } else {
                firstOption__$121 || (firstOption__$121 = option__$126);
                if (containsVal__$123(option__$126.val)) {
                    option__$126.checked = true;
                    checkedOptions__$122.push(option__$126);
                }
            }
        }
    };
    iterateOptions__$124(ctx__$118.options);
    var __$r__$128;
    var __$l0__$129 = __$ctx._select;
    __$ctx._select = __$ctx.ctx;
    var __$l1__$130 = __$ctx._checkedOptions;
    __$ctx._checkedOptions = checkedOptions__$122;
    var __$l2__$131 = __$ctx._firstOption;
    __$ctx._firstOption = firstOption__$121;
    var __$r__$133;
    var __$l3__$134 = __$ctx.__$a0;
    __$ctx.__$a0 = __$ctx.__$a0 | 131072;
    __$r__$133 = applyc(__$ctx, __$ref);
    __$ctx.__$a0 = __$l3__$134;
    __$r__$128 = __$r__$133;
    __$ctx._select = __$l0__$129;
    __$ctx._checkedOptions = __$l1__$130;
    __$ctx._firstOption = __$l2__$131;
    return;
}

function __$b128(__$ctx, __$ref) {
    var ctx__$19 = __$ctx.ctx;
    typeof ctx__$19.url === "object" && (ctx__$19.url = __$ctx.reapply(ctx__$19.url));
    var __$r__$21;
    var __$l0__$22 = __$ctx.__$a0;
    __$ctx.__$a0 = __$ctx.__$a0 | 32;
    __$r__$21 = applyc(__$ctx, __$ref);
    __$ctx.__$a0 = __$l0__$22;
    return;
}

function __$b129(__$ctx, __$ref) {
    var __$r__$43;
    var __$l0__$44 = __$ctx._ctx;
    __$ctx._ctx = __$ctx.ctx;
    var __$r__$46;
    var __$l1__$47 = __$ctx.__$a0;
    __$ctx.__$a0 = __$ctx.__$a0 | 64;
    __$r__$46 = applyc(__$ctx, __$ref);
    __$ctx.__$a0 = __$l1__$47;
    __$r__$43 = __$r__$46;
    __$ctx._ctx = __$l0__$44;
    return;
}

function __$b130(__$ctx, __$ref) {
    var ctx__$68 = __$ctx.ctx, mods__$69 = $$mods, firstItem__$70, checkedItems__$71 = [];
    if (ctx__$68.content) {
        var isValDef__$72 = typeof ctx__$68.val !== "undefined", containsVal__$73 = function(val) {
            return isValDef__$72 && (mods__$69.mode === "check" ? ctx__$68.val.indexOf(val) > -1 : ctx__$68.val === val);
        }, iterateItems__$74 = function(content) {
            var i__$75 = 0, itemOrGroup__$76;
            while (itemOrGroup__$76 = content[i__$75++]) {
                if (itemOrGroup__$76.block === "menu-item") {
                    firstItem__$70 || (firstItem__$70 = itemOrGroup__$76);
                    if (containsVal__$73(itemOrGroup__$76.val)) {
                        (itemOrGroup__$76.mods = itemOrGroup__$76.mods || {}).checked = true;
                        checkedItems__$71.push(itemOrGroup__$76);
                    }
                } else {
                    iterateItems__$74(itemOrGroup__$76.content);
                }
            }
        };
        if (!__$ctx.isArray(ctx__$68.content)) throw Error("menu: content must be an array of the menu items");
        iterateItems__$74(ctx__$68.content);
    }
    __$ctx._firstItem = firstItem__$70;
    __$ctx._checkedItems = checkedItems__$71;
    var __$r__$78;
    var __$l0__$79 = __$ctx._menuMods;
    __$ctx._menuMods = {
        theme: mods__$69.theme,
        disabled: mods__$69.disabled
    };
    var __$r__$81;
    var __$l1__$82 = __$ctx.__$a0;
    __$ctx.__$a0 = __$ctx.__$a0 | 2048;
    __$r__$81 = applyc(__$ctx, __$ref);
    __$ctx.__$a0 = __$l1__$82;
    __$r__$78 = __$r__$81;
    __$ctx._menuMods = __$l0__$79;
    return;
}

function __$b131(__$ctx, __$ref) {
    var mods__$63 = $$mods;
    mods__$63.theme = mods__$63.theme || __$ctx._menuMods.theme;
    mods__$63.disabled = mods__$63.disabled || __$ctx._menuMods.disabled;
    var __$r__$65;
    var __$l0__$66 = __$ctx.__$a0;
    __$ctx.__$a0 = __$ctx.__$a0 | 1024;
    __$r__$65 = applyc(__$ctx, __$ref);
    __$ctx.__$a0 = __$l0__$66;
    return;
}

function __$b132(__$ctx, __$ref) {
    var ctx__$147 = __$ctx.ctx;
    ctx__$147._wrapped = true;
    ctx__$147.mods = __$ctx.extend({
        position: "right",
        visible: "no"
    }, ctx__$147.mods);
    var __$r__$149;
    var __$l0__$150 = $$mode;
    $$mode = "";
    var __$l1__$151 = __$ctx.ctx;
    __$ctx.ctx = ctx__$147;
    var __$r__$153;
    var __$l2__$154 = __$ctx.__$a0;
    __$ctx.__$a0 = __$ctx.__$a0 | 524288;
    __$r__$153 = applyc(__$ctx, __$ref);
    __$ctx.__$a0 = __$l2__$154;
    __$r__$149 = __$r__$153;
    $$mode = __$l0__$150;
    __$ctx.ctx = __$l1__$151;
    return;
}

function __$b133(__$ctx, __$ref) {
    var BEM_INTERNAL__$175 = __$ctx.BEM.INTERNAL, ctx__$176 = __$ctx.ctx, isBEM__$177, tag__$178, res__$179;
    var __$r__$181;
    var __$l0__$182 = __$ctx._str;
    __$ctx._str = "";
    var vBlock__$183 = $$block;
    var __$r__$185;
    var __$l1__$186 = $$mode;
    $$mode = "tag";
    __$r__$185 = applyc(__$ctx, __$ref);
    $$mode = __$l1__$186;
    tag__$178 = __$r__$185;
    typeof tag__$178 !== "undefined" || (tag__$178 = ctx__$176.tag);
    typeof tag__$178 !== "undefined" || (tag__$178 = "div");
    if (tag__$178) {
        var jsParams__$187, js__$188;
        if (vBlock__$183 && ctx__$176.js !== false) {
            var __$r__$189;
            var __$l2__$190 = $$mode;
            $$mode = "js";
            __$r__$189 = applyc(__$ctx, __$ref);
            $$mode = __$l2__$190;
            js__$188 = __$r__$189;
            js__$188 = js__$188 ? __$ctx.extend(ctx__$176.js, js__$188 === true ? {} : js__$188) : ctx__$176.js === true ? {} : ctx__$176.js;
            js__$188 && ((jsParams__$187 = {})[BEM_INTERNAL__$175.buildClass(vBlock__$183, ctx__$176.elem)] = js__$188);
        }
        __$ctx._str += "<" + tag__$178;
        var __$r__$191;
        var __$l3__$192 = $$mode;
        $$mode = "bem";
        __$r__$191 = applyc(__$ctx, __$ref);
        $$mode = __$l3__$192;
        isBEM__$177 = __$r__$191;
        typeof isBEM__$177 !== "undefined" || (isBEM__$177 = typeof ctx__$176.bem !== "undefined" ? ctx__$176.bem : ctx__$176.block || ctx__$176.elem);
        var __$r__$194;
        var __$l4__$195 = $$mode;
        $$mode = "cls";
        __$r__$194 = applyc(__$ctx, __$ref);
        $$mode = __$l4__$195;
        var cls__$193 = __$r__$194;
        cls__$193 || (cls__$193 = ctx__$176.cls);
        var addJSInitClass__$196 = ctx__$176.block && jsParams__$187 && !ctx__$176.elem;
        if (isBEM__$177 || cls__$193) {
            __$ctx._str += ' class="';
            if (isBEM__$177) {
                __$ctx._str += BEM_INTERNAL__$175.buildClasses(vBlock__$183, ctx__$176.elem, ctx__$176.elemMods || ctx__$176.mods);
                var __$r__$198;
                var __$l5__$199 = $$mode;
                $$mode = "mix";
                __$r__$198 = applyc(__$ctx, __$ref);
                $$mode = __$l5__$199;
                var mix__$197 = __$r__$198;
                ctx__$176.mix && (mix__$197 = mix__$197 ? [].concat(mix__$197, ctx__$176.mix) : ctx__$176.mix);
                if (mix__$197) {
                    var visited__$200 = {}, visitedKey__$201 = function(block, elem) {
                        return (block || "") + "__" + (elem || "");
                    };
                    visited__$200[visitedKey__$201(vBlock__$183, $$elem)] = true;
                    __$ctx.isArray(mix__$197) || (mix__$197 = [ mix__$197 ]);
                    for (var i__$202 = 0; i__$202 < mix__$197.length; i__$202++) {
                        var mixItem__$203 = mix__$197[i__$202], hasItem__$204 = mixItem__$203.block && (vBlock__$183 !== ctx__$176.block || mixItem__$203.block !== vBlock__$183) || mixItem__$203.elem, mixBlock__$205 = mixItem__$203.block || mixItem__$203._block || $$block, mixElem__$206 = mixItem__$203.elem || mixItem__$203._elem || $$elem;
                        hasItem__$204 && (__$ctx._str += " ");
                        __$ctx._str += BEM_INTERNAL__$175[hasItem__$204 ? "buildClasses" : "buildModsClasses"](mixBlock__$205, mixItem__$203.elem || mixItem__$203._elem || (mixItem__$203.block ? undefined : $$elem), mixItem__$203.elemMods || mixItem__$203.mods);
                        if (mixItem__$203.js) {
                            (jsParams__$187 || (jsParams__$187 = {}))[BEM_INTERNAL__$175.buildClass(mixBlock__$205, mixItem__$203.elem)] = mixItem__$203.js === true ? {} : mixItem__$203.js;
                            addJSInitClass__$196 || (addJSInitClass__$196 = mixBlock__$205 && !mixItem__$203.elem);
                        }
                        if (hasItem__$204 && !visited__$200[visitedKey__$201(mixBlock__$205, mixElem__$206)]) {
                            visited__$200[visitedKey__$201(mixBlock__$205, mixElem__$206)] = true;
                            var __$r__$208;
                            var __$l6__$209 = $$mode;
                            $$mode = "mix";
                            var __$l7__$210 = $$block;
                            $$block = mixBlock__$205;
                            var __$l8__$211 = $$elem;
                            $$elem = mixElem__$206;
                            __$r__$208 = applyc(__$ctx, __$ref);
                            $$mode = __$l6__$209;
                            $$block = __$l7__$210;
                            $$elem = __$l8__$211;
                            var nestedMix__$207 = __$r__$208;
                            if (nestedMix__$207) {
                                for (var j__$212 = 0; j__$212 < nestedMix__$207.length; j__$212++) {
                                    var nestedItem__$213 = nestedMix__$207[j__$212];
                                    if (!nestedItem__$213.block && !nestedItem__$213.elem || !visited__$200[visitedKey__$201(nestedItem__$213.block, nestedItem__$213.elem)]) {
                                        nestedItem__$213._block = mixBlock__$205;
                                        nestedItem__$213._elem = mixElem__$206;
                                        mix__$197.splice(i__$202 + 1, 0, nestedItem__$213);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            cls__$193 && (__$ctx._str += isBEM__$177 ? " " + cls__$193 : cls__$193);
            __$ctx._str += addJSInitClass__$196 ? ' i-bem"' : '"';
        }
        if (isBEM__$177 && jsParams__$187) {
            __$ctx._str += ' data-bem="' + __$ctx.attrEscape(JSON.stringify(jsParams__$187)) + '"';
        }
        var __$r__$215;
        var __$l9__$216 = $$mode;
        $$mode = "attrs";
        __$r__$215 = applyc(__$ctx, __$ref);
        $$mode = __$l9__$216;
        var attrs__$214 = __$r__$215;
        attrs__$214 = __$ctx.extend(attrs__$214, ctx__$176.attrs);
        if (attrs__$214) {
            var name__$217, attr__$218;
            for (name__$217 in attrs__$214) {
                attr__$218 = attrs__$214[name__$217];
                if (typeof attr__$218 === "undefined") continue;
                __$ctx._str += " " + name__$217 + '="' + __$ctx.attrEscape(__$ctx.isSimple(attr__$218) ? attr__$218 : __$ctx.reapply(attr__$218)) + '"';
            }
        }
    }
    if (__$ctx.isShortTag(tag__$178)) {
        __$ctx._str += "/>";
    } else {
        tag__$178 && (__$ctx._str += ">");
        var __$r__$220;
        var __$l10__$221 = $$mode;
        $$mode = "content";
        __$r__$220 = applyc(__$ctx, __$ref);
        $$mode = __$l10__$221;
        var content__$219 = __$r__$220;
        if (content__$219 || content__$219 === 0) {
            isBEM__$177 = vBlock__$183 || $$elem;
            var __$r__$222;
            var __$l11__$223 = $$mode;
            $$mode = "";
            var __$l12__$224 = __$ctx._notNewList;
            __$ctx._notNewList = false;
            var __$l13__$225 = __$ctx.position;
            __$ctx.position = isBEM__$177 ? 1 : __$ctx.position;
            var __$l14__$226 = __$ctx._listLength;
            __$ctx._listLength = isBEM__$177 ? 1 : __$ctx._listLength;
            var __$l15__$227 = __$ctx.ctx;
            __$ctx.ctx = content__$219;
            __$r__$222 = applyc(__$ctx, __$ref);
            $$mode = __$l11__$223;
            __$ctx._notNewList = __$l12__$224;
            __$ctx.position = __$l13__$225;
            __$ctx._listLength = __$l14__$226;
            __$ctx.ctx = __$l15__$227;
        }
        tag__$178 && (__$ctx._str += "</" + tag__$178 + ">");
    }
    res__$179 = __$ctx._str;
    __$r__$181 = undefined;
    __$ctx._str = __$l0__$182;
    __$ctx._buf.push(res__$179);
    return;
}

function __$b136(__$ctx, __$ref) {
    var arr__$160 = [], icon__$161 = __$ctx.ctx.icon, size__$162 = __$ctx.ctx.size, width__$163 = __$ctx.ctx.width, list__$164 = __$ctx.ctx.list, rotate__$165 = __$ctx.ctx.rotate, animate__$166 = __$ctx.ctx.animate, flip__$167 = __$ctx.ctx.flip, instack__$168 = __$ctx.ctx.__instack, stack__$169 = __$ctx.ctx.stack, cls__$170 = __$ctx.ctx.cls;
    if (cls__$170) return cls__$170;
    if (stack__$169) return "fa-stack fa-" + size__$162;
    if (icon__$161) arr__$160.push("", icon__$161);
    if (size__$162) {
        if (instack__$168) {
            arr__$160.push("stack-" + size__$162);
        } else {
            arr__$160.push(size__$162);
        }
    }
    if (width__$163 === "fixed") arr__$160.push("fw");
    if (list__$164) arr__$160.push("li");
    if (rotate__$165) {
        var angle__$171 = 0;
        switch (rotate__$165) {
          case "270" || 270:
            angle__$171 += 90;

          case "180" || 180:
            angle__$171 += 90;

          case "90" || 90:
            angle__$171 += 90;

          default:
            arr__$160.push("rotate-" + angle__$171);
        }
    }
    if (animate__$166 === "spin" || animate__$166 === "pulse") {
        arr__$160.push(animate__$166);
    }
    if (flip__$167) arr__$160.push("flip-" + flip__$167);
    return arr__$160.join(" fa-");
}

function __$b138(__$ctx, __$ref) {
    var __$r__$229;
    var __$l0__$230 = $$mode;
    $$mode = "";
    var __$l1__$231 = __$ctx.ctx;
    __$ctx.ctx = __$ctx.ctx._value;
    var __$r__$233;
    var __$l2__$234 = __$ctx.__$a0;
    __$ctx.__$a0 = __$ctx.__$a0 | 2097152;
    __$r__$233 = applyc(__$ctx, __$ref);
    __$ctx.__$a0 = __$l2__$234;
    __$r__$229 = __$r__$233;
    $$mode = __$l0__$230;
    __$ctx.ctx = __$l1__$231;
    return;
}

function __$b139(__$ctx, __$ref) {
    __$ctx._listLength--;
    var ctx__$235 = __$ctx.ctx;
    if (ctx__$235 && ctx__$235 !== true || ctx__$235 === 0) {
        __$ctx._str += ctx__$235 + "";
    }
    return;
}

function __$b140(__$ctx, __$ref) {
    __$ctx._listLength--;
    return;
}

function __$b141(__$ctx, __$ref) {
    var ctx__$236 = __$ctx.ctx, len__$237 = ctx__$236.length, i__$238 = 0, prevPos__$239 = __$ctx.position, prevNotNewList__$240 = __$ctx._notNewList;
    if (prevNotNewList__$240) {
        __$ctx._listLength += len__$237 - 1;
    } else {
        __$ctx.position = 0;
        __$ctx._listLength = len__$237;
    }
    __$ctx._notNewList = true;
    while (i__$238 < len__$237) (function __$lb__$241() {
        var __$r__$242;
        var __$l0__$243 = __$ctx.ctx;
        __$ctx.ctx = ctx__$236[i__$238++];
        __$r__$242 = applyc(__$ctx, __$ref);
        __$ctx.ctx = __$l0__$243;
        return __$r__$242;
    })();
    prevNotNewList__$240 || (__$ctx.position = prevPos__$239);
    return;
}

function __$b142(__$ctx, __$ref) {
    __$ctx.ctx || (__$ctx.ctx = {});
    var vBlock__$244 = __$ctx.ctx.block, vElem__$245 = __$ctx.ctx.elem, block__$246 = __$ctx._currBlock || $$block;
    var __$r__$248;
    var __$l0__$249 = $$mode;
    $$mode = "default";
    var __$l1__$250 = $$block;
    $$block = vBlock__$244 || (vElem__$245 ? block__$246 : undefined);
    var __$l2__$251 = __$ctx._currBlock;
    __$ctx._currBlock = vBlock__$244 || vElem__$245 ? undefined : block__$246;
    var __$l3__$252 = $$elem;
    $$elem = vElem__$245;
    var __$l4__$253 = $$mods;
    $$mods = vBlock__$244 ? __$ctx.ctx.mods || (__$ctx.ctx.mods = {}) : $$mods;
    var __$l5__$254 = $$elemMods;
    $$elemMods = __$ctx.ctx.elemMods || {};
    $$block || $$elem ? __$ctx.position = (__$ctx.position || 0) + 1 : __$ctx._listLength--;
    applyc(__$ctx, __$ref);
    __$r__$248 = undefined;
    $$mode = __$l0__$249;
    $$block = __$l1__$250;
    __$ctx._currBlock = __$l2__$251;
    $$elem = __$l3__$252;
    $$mods = __$l4__$253;
    $$elemMods = __$l5__$254;
    return;
}

function __$g0(__$ctx, __$ref) {
    var __$t = $$block;
    if (__$t === "app") {
        if (!$$elem) {
            return true;
        }
    } else if (__$t === "input") {
        if (!$$elem) {
            return true;
        }
    } else if (__$t === "select") {
        var __$t = !$$elem;
        if (__$t) {
            var __$t = $$mods;
            if (__$t) {
                if ($$mods["mode"] === "radio-check" && (__$ctx.__$a0 & 8) === 0) {
                    var __$r = __$ctx.extend(function __$lb__$10() {
                        var __$r__$11;
                        var __$l0__$12 = __$ctx.__$a0;
                        __$ctx.__$a0 = __$ctx.__$a0 | 8;
                        __$r__$11 = applyc(__$ctx, __$ref);
                        __$ctx.__$a0 = __$l0__$12;
                        return __$r__$11;
                    }(), {
                        text: __$ctx.ctx.text
                    });
                    if (__$r !== __$ref) return __$r;
                }
                if ($$mods["focused"] === true && (__$ctx.__$a0 & 65536) === 0) {
                    var __$r = __$ctx.extend(function __$lb__$114() {
                        var __$r__$115;
                        var __$l0__$116 = __$ctx.__$a0;
                        __$ctx.__$a0 = __$ctx.__$a0 | 65536;
                        __$r__$115 = applyc(__$ctx, __$ref);
                        __$ctx.__$a0 = __$l0__$116;
                        return __$r__$115;
                    }(), {
                        live: false
                    });
                    if (__$r !== __$ref) return __$r;
                }
            }
            var __$r = __$b5(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "button") {
        var __$t = !$$elem;
        if (__$t) {
            if ($$mods && $$mods["focused"] === true && (__$ctx.__$a0 & 8192) === 0) {
                var __$r = __$ctx.extend(function __$lb__$93() {
                    var __$r__$94;
                    var __$l0__$95 = __$ctx.__$a0;
                    __$ctx.__$a0 = __$ctx.__$a0 | 8192;
                    __$r__$94 = applyc(__$ctx, __$ref);
                    __$ctx.__$a0 = __$l0__$95;
                    return __$r__$94;
                }(), {
                    live: false
                });
                if (__$r !== __$ref) return __$r;
            }
            return true;
        }
    } else if (__$t === "link") {
        var __$t = !$$elem;
        if (__$t) {
            if ($$mods && $$mods["disabled"] === true && (__$ctx.__$a0 & 16) === 0) {
                var __$r = __$ctx.extend(function __$lb__$13() {
                    var __$r__$14;
                    var __$l0__$15 = __$ctx.__$a0;
                    __$ctx.__$a0 = __$ctx.__$a0 | 16;
                    __$r__$14 = applyc(__$ctx, __$ref);
                    __$ctx.__$a0 = __$l0__$15;
                    return __$r__$14;
                }(), {
                    url: __$ctx.ctx.url
                });
                if (__$r !== __$ref) return __$r;
            }
            return true;
        }
    } else if (__$t === "issues-grid") {
        if (!$$elem) {
            return {
                issues: __$ctx.ctx.issues
            };
        }
    } else if (__$t === "calendar") {
        if (!$$elem) {
            var __$r = __$b11(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "checkbox") {
        if (!$$elem) {
            return true;
        }
    } else if (__$t === "menu") {
        var __$t = !$$elem;
        if (__$t) {
            if ($$mods && $$mods["focused"] === true && (__$ctx.__$a0 & 512) === 0) {
                var __$r = __$ctx.extend(function __$lb__$60() {
                    var __$r__$61;
                    var __$l0__$62 = __$ctx.__$a0;
                    __$ctx.__$a0 = __$ctx.__$a0 | 512;
                    __$r__$61 = applyc(__$ctx, __$ref);
                    __$ctx.__$a0 = __$l0__$62;
                    return __$r__$61;
                }(), {
                    live: false
                });
                if (__$r !== __$ref) return __$r;
            }
            return true;
        }
    } else if (__$t === "menu-item") {
        if (!$$elem) {
            return {
                val: __$ctx.ctx.val
            };
        }
    } else if (__$t === "filter") {
        if (!$$elem) {
            return true;
        }
    } else if (__$t === "popup") {
        if (!$$elem) {
            var __$r = __$b17(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "form") {
        if (!$$elem) {
            return true;
        }
    } else if (__$t === "perdula") {
        if (!$$elem) {
            return true;
        }
    }
    return undefined;
    return __$ref;
}

function __$g1(__$ctx, __$ref) {
    var __$t = $$block;
    if (__$t === "app-content") {
        if (!$$elem && $$mods && $$mods["view"] === "config") {
            var __$r = __$b21(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
        if ($$elem === "layout" && $$mods && $$mods["view"] === "content") {
            return [ {
                elem: "title",
                elemMods: {
                    type: "unswer"
                },
                tag: "h2",
                content: [ {
                    block: "fa",
                    icon: "dot-circle-o"
                }, " Unanswered" ]
            }, {
                block: "issues-grid",
                issues: __$ctx.ctx.issues.unanswered
            }, {
                elem: "title",
                tag: "h2",
                elemMods: {
                    type: "feedback"
                },
                content: [ {
                    block: "fa",
                    icon: "dot-circle-o"
                }, " Waiting for feedback" ]
            }, {
                block: "issues-grid",
                issues: __$ctx.ctx.issues.answered
            } ];
        }
        var __$t = !$$elem;
        if (__$t) {
            var __$t = $$mods;
            if (__$t) {
                var __$t = $$mods["view"];
                if (__$t === "content") {
                    return [ {
                        block: "filter",
                        mix: {
                            block: "app",
                            elem: "filter"
                        },
                        config: __$ctx.ctx.config
                    }, {
                        elem: "layout",
                        issues: __$ctx.ctx.issues
                    } ];
                } else if (__$t === "loading") {
                    return [ {
                        block: "title",
                        mix: {
                            block: $$block,
                            elem: "spin-title"
                        },
                        mods: {
                            level: 5
                        },
                        content: "Подождите пжл, мы загружаем данные с GitHub..."
                    }, {
                        block: "spin",
                        mix: {
                            block: $$block,
                            elem: "spin"
                        },
                        mods: {
                            theme: "islands",
                            size: "xl",
                            visible: true
                        }
                    } ];
                }
            }
        }
    } else if (__$t === "input") {
        if (!$$elem && $$mods && $$mods["type"] === "datepicker" && (__$ctx.__$a0 & 2) === 0) {
            return [ function __$lb__$4() {
                var __$r__$5;
                var __$l0__$6 = __$ctx.__$a0;
                __$ctx.__$a0 = __$ctx.__$a0 | 2;
                __$r__$5 = applyc(__$ctx, __$ref);
                __$ctx.__$a0 = __$l0__$6;
                return __$r__$5;
            }(), {
                block: "popup",
                mods: {
                    theme: "islands",
                    target: "anchor"
                },
                content: {
                    block: "calendar",
                    year: 2014,
                    month: 11
                }
            } ];
        }
        if ($$elem === "box" && $$mods && $$mods["has-clear"] === true) {
            return [ __$ctx.ctx.content, {
                elem: "clear"
            } ];
        }
        if (!$$elem) {
            return {
                elem: "box",
                content: {
                    elem: "control"
                }
            };
        }
    } else if (__$t === "select") {
        if (!$$elem && $$mods && $$mods["mode"] === "radio-check" && __$ctx._checkedOptions[0] && (__$ctx.__$a0 & 4) === 0) {
            return [ {
                elem: "control",
                val: __$ctx._checkedOptions[0].val
            }, function __$lb__$7() {
                var __$r__$8;
                var __$l0__$9 = __$ctx.__$a0;
                __$ctx.__$a0 = __$ctx.__$a0 | 4;
                __$r__$8 = applyc(__$ctx, __$ref);
                __$ctx.__$a0 = __$l0__$9;
                return __$r__$8;
            }() ];
        }
        if ($$elem === "button" && $$mods && $$mods["mode"] === "radio-check") {
            return [ {
                elem: "text",
                content: (__$ctx._checkedOptions[0] || __$ctx._select).text
            } ];
        }
        if (!$$elem) {
            return [ {
                elem: "button"
            }, {
                block: "popup",
                mods: {
                    target: "anchor",
                    theme: $$mods.theme,
                    autoclosable: true
                },
                directions: [ "bottom-left", "bottom-right", "top-left", "top-right" ],
                content: {
                    block: $$block,
                    mods: $$mods,
                    elem: "menu"
                }
            } ];
        }
    } else if (__$t === "button") {
        var __$t = !$$elem;
        if (__$t) {
            if (typeof __$ctx.ctx.content !== "undefined") {
                return __$ctx.ctx.content;
            }
            var __$r = __$b32(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "field") {
        if (!$$elem) {
            return [ {
                elem: "label",
                content: "Repository link:"
            }, {
                block: "control-group",
                mods: {
                    flex: true
                },
                content: [ {
                    block: "input",
                    mods: {
                        theme: "islands",
                        size: "l",
                        width: "available",
                        "has-clear": true
                    },
                    name: "repositories",
                    val: __$ctx.ctx.value,
                    placeholder: __$ctx.ctx.first ? "organization/one-more-repo" : "organization/repo",
                    tabIndex: __$ctx.ctx.index
                }, {
                    block: "button",
                    mods: {
                        theme: "islands",
                        size: "l"
                    },
                    mix: {
                        block: "field",
                        elem: "remove"
                    },
                    icon: {
                        block: "fa",
                        mix: {
                            block: "icon"
                        },
                        icon: "remove"
                    }
                } ]
            } ];
        }
    } else if (__$t === "issues-grid") {
        var __$t = $$elem;
        if (__$t === "type") {
            var __$r = __$b34(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        } else if (__$t === "user") {
            return [ {
                block: "image",
                url: __$ctx.ctx.avatar,
                width: 24,
                height: 24
            }, {
                elem: "login",
                tag: "span",
                content: {
                    block: "link",
                    mods: {
                        theme: "islands",
                        size: "s"
                    },
                    url: __$ctx.ctx.url,
                    content: __$ctx.ctx.login
                }
            } ];
        } else if (__$t === "label") {
            return __$ctx.ctx.label.name;
        } else if (__$t === "comment-cell") {
            if (__$ctx.ctx.lastActivity) {
                return [ {
                    block: "issues-grid",
                    elem: "user",
                    avatar: __$ctx.ctx.lastActivity.author.avatarUrl,
                    login: "@" + __$ctx.ctx.lastActivity.author.login,
                    url: __$ctx.ctx.lastActivity.author.url
                }, {
                    block: "issues-grid",
                    elem: "type",
                    type: __$ctx.ctx.lastActivity.type
                }, {
                    block: "link",
                    mods: {
                        theme: "islands",
                        size: "s"
                    },
                    url: __$ctx.ctx.lastActivity.issueUrl,
                    content: {
                        elem: "date",
                        tag: "span",
                        content: [ {
                            tag: "span",
                            title: moment(__$ctx.ctx.lastActivity.date).format(),
                            content: moment(__$ctx.ctx.lastActivity.date).fromNow()
                        } ]
                    }
                } ];
            }
        } else if (__$t === "labels-cell") {
            var __$r = __$ctx.ctx.labels.map(function(label) {
                return [ {
                    elem: "label",
                    label: label
                }, " " ];
            });
            if (__$r !== __$ref) return __$r;
        } else if (__$t === "title-cell") {
            return __$ctx.ctx.title;
        } else if (__$t === "issue-cell") {
            return {
                block: "link",
                mods: {
                    theme: "islands",
                    size: "s"
                },
                url: __$ctx.ctx.url,
                target: "_blank",
                content: __$ctx.ctx.organization + "/" + __$ctx.ctx.repository + "#" + __$ctx.ctx.id
            };
        } else if (__$t === "pr-cell") {
            if (__$ctx.ctx.isPullRequest) {
                return {
                    block: "fa",
                    icon: "code-fork"
                };
            }
        } else if (__$t === "issue-row") {
            return [ {
                elem: "pr-cell",
                mix: {
                    elem: "cell"
                },
                isPullRequest: __$ctx.ctx.issue.isPullRequest
            }, {
                elem: "issue-cell",
                mix: {
                    elem: "cell"
                },
                url: __$ctx.ctx.issue.url,
                organization: __$ctx.ctx.issue.organization,
                repository: __$ctx.ctx.issue.repository,
                id: __$ctx.ctx.issue.id
            }, {
                elem: "title-cell",
                mix: {
                    elem: "cell"
                },
                title: __$ctx.ctx.issue.title
            }, {
                elem: "labels-cell",
                mix: {
                    elem: "cell"
                },
                labels: __$ctx.ctx.issue.labels
            }, {
                elem: "comment-cell",
                mix: {
                    elem: "cell"
                },
                lastActivity: __$ctx.ctx.issue.lastActivity
            } ];
        } else if (__$t === "cell") {
            if ($$elemMods && $$elemMods && $$elemMods["sorter"] === true && $$elemMods["header"] === true) {
                return [ {
                    elem: "title",
                    tag: "span",
                    content: __$ctx.ctx.content
                }, {
                    elem: "sorter",
                    tag: "span",
                    attrs: {
                        "data-key": __$ctx.ctx.key
                    },
                    content: {
                        block: "fa",
                        icon: "angle-down"
                    }
                } ];
            }
        }
        if (!$$elem) {
            return [ {
                elem: "header",
                content: {
                    elem: "row",
                    content: [ {
                        elem: "cell",
                        elemMods: {
                            header: true
                        },
                        content: "PR"
                    }, {
                        elem: "cell",
                        elemMods: {
                            header: true,
                            sorter: true
                        },
                        key: "issue",
                        content: "Issue"
                    }, {
                        elem: "cell",
                        key: "title",
                        elemMods: {
                            header: true,
                            sorter: true
                        },
                        content: "Title"
                    }, {
                        elem: "cell",
                        elemMods: {
                            header: true
                        },
                        content: "Labels"
                    }, {
                        elem: "cell",
                        key: "activity",
                        elemMods: {
                            header: true,
                            sorter: true
                        },
                        content: "Last activity"
                    } ]
                }
            }, {
                elem: "body",
                content: __$ctx.ctx.issues.map(function(issue) {
                    return {
                        elem: "issue-row",
                        issue: issue
                    };
                })
            }, {
                block: "perdula"
            } ];
        }
    } else if (__$t === "calendar") {
        var __$t = $$elem;
        if (__$t === "content") {
            return [ {
                elem: "month-select"
            }, {
                elem: "grid"
            } ];
        } else if (__$t === "grid-body") {
            var __$r = __$b46(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        } else if (__$t === "grid-head") {
            return {
                elem: "row",
                content: [ "mo", "tu", "we", "th", "fr", "sa", "su" ].map(function(key) {
                    return {
                        elem: "day-name",
                        content: key
                    };
                })
            };
        } else if (__$t === "grid") {
            return [ {
                elem: "grid-head"
            }, {
                elem: "grid-body"
            } ];
        } else if (__$t === "month-select") {
            var __$r = __$b49(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
        if (!$$elem) {
            var __$r = __$b50(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "checkbox") {
        if (!$$elem) {
            var __$r = __$b51(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "menu") {
        if ($$elem === "group" && typeof __$ctx.ctx.title !== "undefined" && (__$ctx.__$a0 & 128) === 0) {
            return [ {
                elem: "group-title",
                content: __$ctx.ctx.title
            }, function __$lb__$54() {
                var __$r__$55;
                var __$l0__$56 = __$ctx.__$a0;
                __$ctx.__$a0 = __$ctx.__$a0 | 128;
                __$r__$55 = applyc(__$ctx, __$ref);
                __$ctx.__$a0 = __$l0__$56;
                return __$r__$55;
            }() ];
        }
    } else if (__$t === "filter") {
        var __$t = $$elem;
        if (__$t === "date-input") {
            return {
                block: "input",
                mods: {
                    theme: "islands",
                    size: "m",
                    type: "datepicker"
                },
                placeholder: "дата создания"
            };
        } else if (__$t === "label-select") {
            return {
                block: "select",
                mods: {
                    mode: "radio-check",
                    theme: "islands",
                    size: "m"
                },
                name: "label_select",
                val: 2,
                text: "Filter by label",
                options: __$ctx.ctx.content.map(function(item) {
                    return {
                        val: item,
                        text: item
                    };
                })
            };
        } else if (__$t === "assign-check") {
            return {
                block: "checkbox",
                mods: {
                    theme: "islands",
                    size: "m"
                },
                name: "assign_check",
                val: "false",
                text: "Assigned to me"
            };
        } else if (__$t === "pr-check") {
            return {
                block: "checkbox",
                mods: {
                    theme: "islands",
                    size: "m",
                    checked: true
                },
                name: "pr_check",
                val: true,
                text: "Pull requests"
            };
        } else if (__$t === "issue-check") {
            return {
                block: "checkbox",
                mods: {
                    theme: "islands",
                    size: "m",
                    checked: true
                },
                name: "issues_check",
                val: true,
                text: "Issues"
            };
        } else if (__$t === "repo-select") {
            var __$r = __$b58(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
        if (!$$elem) {
            var __$r = __$b59(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "perdula") {
        if (!$$elem) {
            return [ {
                elem: "panel",
                content: [ {
                    elem: "content",
                    content: __$ctx.ctx.content
                } ]
            }, {
                elem: "paranja"
            } ];
        }
    } else if (__$t === "ua") {
        if (!$$elem) {
            return [ "(function(e,c){", 'e[c]=e[c].replace(/(ua_js_)no/g,"$1yes");', '})(document.documentElement,"className");' ];
        }
    } else if (__$t === "fa") {
        if (!$$elem) {
            var __$r = __$b62(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    }
    return __$ctx.ctx.content;
    return __$ref;
}

function __$g2(__$ctx, __$ref) {
    var __$t = $$block;
    if (__$t === "input") {
        var __$t = $$elem;
        if (__$t === "control") {
            if ($$mods && $$mods["type"] === "datepicker" && (__$ctx.__$a0 & 1) === 0) {
                var __$r = __$ctx.extend(function __$lb__$1() {
                    var __$r__$2;
                    var __$l0__$3 = __$ctx.__$a0;
                    __$ctx.__$a0 = __$ctx.__$a0 | 1;
                    __$r__$2 = applyc(__$ctx, __$ref);
                    __$ctx.__$a0 = __$l0__$3;
                    return __$r__$2;
                }(), {
                    readonly: "readonly"
                });
                if (__$r !== __$ref) return __$r;
            }
            var __$r = __$b65(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "select") {
        if ($$elem === "control") {
            return {
                type: "hidden",
                name: __$ctx._select.name,
                value: __$ctx.ctx.val,
                disabled: $$mods.disabled ? "disabled" : undefined
            };
        }
    } else if (__$t === "button") {
        var __$t = !$$elem;
        if (__$t) {
            if ((!$$mods.type || $$mods.type === "submit") && (__$ctx.__$a0 & 16384) === 0) {
                var __$r = __$b67(__$ctx, __$ref);
                if (__$r !== __$ref) return __$r;
            }
            var __$r = __$b68(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "link") {
        if (!$$elem) {
            var __$r = __$b69(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "issues-grid") {
        var __$t = $$elem;
        if (__$t === "label") {
            return {
                style: "background-color: #" + __$ctx.ctx.label.color + ";"
            };
        } else if (__$t === "issue-row") {
            return {
                "data-issue": __$ctx.ctx.issue.id
            };
        }
    } else if (__$t === "checkbox") {
        if ($$elem === "control") {
            var __$r = __$b72(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "menu") {
        var __$t = $$elem;
        if (__$t === "group-title") {
            return {
                role: "presentation"
            };
        } else if (__$t === "group") {
            if (typeof __$ctx.ctx.title !== "undefined" && (__$ctx.__$a0 & 256) === 0) {
                var __$r = __$ctx.extend(function __$lb__$57() {
                    var __$r__$58;
                    var __$l0__$59 = __$ctx.__$a0;
                    __$ctx.__$a0 = __$ctx.__$a0 | 256;
                    __$r__$58 = applyc(__$ctx, __$ref);
                    __$ctx.__$a0 = __$l0__$59;
                    return __$r__$58;
                }(), {
                    "aria-label": __$ctx.ctx.title
                });
                if (__$r !== __$ref) return __$r;
            }
            return {
                role: "group"
            };
        }
        if (!$$elem) {
            var __$r = __$b76(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "menu-item") {
        if (!$$elem) {
            return {
                role: "menuitem"
            };
        }
    } else if (__$t === "image") {
        var __$t = !$$elem;
        if (__$t) {
            if (typeof __$ctx.ctx.content === "undefined" && (__$ctx.__$a0 & 1048576) === 0) {
                var __$r = __$b78(__$ctx, __$ref);
                if (__$r !== __$ref) return __$r;
            }
            return {
                role: "img"
            };
        }
    } else if (__$t === "fa") {
        if (!$$elem) {
            var __$r = __$b80(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "icon") {
        if (!$$elem) {
            var __$r = __$b81(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    }
    return undefined;
    return __$ref;
}

function __$g3(__$ctx, __$ref) {
    var __$t = $$block;
    if (__$t === "input") {
        var __$t = $$elem;
        if (__$t === "control") {
            return "input";
        } else if (__$t === "box") {
            return "span";
        } else if (__$t === "clear") {
            return "i";
        }
        if (!$$elem) {
            return "span";
        }
    } else if (__$t === "select") {
        if ($$elem === "control") {
            return "input";
        }
    } else if (__$t === "button") {
        if ($$elem === "text") {
            return "span";
        }
        if (!$$elem) {
            return __$ctx.ctx.tag || "button";
        }
    } else if (__$t === "link") {
        if (!$$elem) {
            return "a";
        }
    } else if (__$t === "issues-grid") {
        var __$t = $$elem;
        if (__$t === "type") {
            return "span";
        } else if (__$t === "user") {
            return "span";
        } else if (__$t === "label") {
            return "span";
        }
    } else if (__$t === "calendar") {
        var __$t = $$elem;
        if (__$t === "grid-body") {
            return "tbody";
        } else if (__$t === "grid-head") {
            return "thead";
        } else if (__$t === "grid") {
            return "table";
        } else if (__$t === "day") {
            return "td";
        } else if (__$t === "day-name") {
            return "th";
        } else if (__$t === "row") {
            return "tr";
        }
    } else if (__$t === "checkbox") {
        var __$t = $$elem;
        if (__$t === "control") {
            return "input";
        } else if (__$t === "box") {
            return "span";
        }
        if (!$$elem) {
            return "label";
        }
    } else if (__$t === "form") {
        if (!$$elem) {
            return "form";
        }
    } else if (__$t === "title") {
        if (!$$elem && function() {
            var mods = this.ctx.mods;
            return mods && mods.level;
        }.call(__$ctx)) {
            return "h" + __$ctx.ctx.mods.level;
        }
    } else if (__$t === "image") {
        var __$t = !$$elem;
        if (__$t) {
            if (typeof __$ctx.ctx.content === "undefined") {
                return "img";
            }
            return "span";
        }
    } else if (__$t === "spin") {
        if (!$$elem) {
            return "span";
        }
    } else if (__$t === "ua") {
        if (!$$elem) {
            return "script";
        }
    } else if (__$t === "fa") {
        if (!$$elem) {
            return __$ctx.ctx.stack ? "span" : "i";
        }
    } else if (__$t === "icon") {
        if (!$$elem) {
            return "i";
        }
    }
    return undefined;
    return __$ref;
}

function __$g4(__$ctx, __$ref) {
    var __$t = $$block;
    if (__$t === "input") {
        if (!$$elem && (__$ctx.__$a0 & 262144) === 0) {
            var __$r = __$b124(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "select") {
        var __$t = $$elem;
        if (__$t === "button") {
            if ((__$ctx.__$a0 & 32768) === 0) {
                var __$r = __$b125(__$ctx, __$ref);
                if (__$r !== __$ref) return __$r;
            }
        } else if (__$t === "menu") {
            if ((__$ctx.__$a0 & 4096) === 0) {
                var __$r = __$b126(__$ctx, __$ref);
                if (__$r !== __$ref) return __$r;
            }
        }
        if (!$$elem && !__$ctx._select && (__$ctx.__$a0 & 131072) === 0) {
            var __$r = __$b127(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "link") {
        if (!$$elem && (__$ctx.__$a0 & 32) === 0) {
            var __$r = __$b128(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "calendar") {
        if ($$elem === "content" && (__$ctx.__$a0 & 64) === 0) {
            var __$r = __$b129(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "menu") {
        if (!$$elem && (__$ctx.__$a0 & 2048) === 0) {
            var __$r = __$b130(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "menu-item") {
        if (!$$elem && __$ctx._menuMods && (__$ctx.__$a0 & 1024) === 0) {
            var __$r = __$b131(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    } else if (__$t === "perdula") {
        if (!$$elem && !__$ctx.ctx._wrapped && (__$ctx.__$a0 & 524288) === 0) {
            var __$r = __$b132(__$ctx, __$ref);
            if (__$r !== __$ref) return __$r;
        }
    }
    var __$r = __$b133(__$ctx, __$ref);
    if (__$r !== __$ref) return __$r;
    return __$ref;
};
     return exports;
  }
  var defineAsGlobal = true;
  if(typeof exports === "object") {
    exports["BEMHTML"] = __bem_xjst({});
    defineAsGlobal = false;
  }
  if(typeof modules === "object") {
    modules.define("BEMHTML",
      function(provide) {
        provide(__bem_xjst({})) });
    defineAsGlobal = false;
  }
  defineAsGlobal && (g["BEMHTML"] = __bem_xjst({}));
})(this);