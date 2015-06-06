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
