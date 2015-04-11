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
