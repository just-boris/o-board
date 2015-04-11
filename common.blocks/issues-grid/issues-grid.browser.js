/* global modules:false */
modules.define('issues-grid',
    ['i-bem__dom', 'BEMHTML'],
    function(provide, BEMDOM, BEMHTML) {
        'use strict';
        provide(BEMDOM.decl(this.name, {
            onSetMod: {
                js: {
                    inited: function() {
                        this._issues = this.params.issues;
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

                            this.afterCurrentEvent(function() {
                                this.emit('sort', {})
                            })
                        } else {
                            var spin = this.findBlockInside(elem, 'spin');
                            spin && spin.destruct();
                        }
                    }
                }
            },

            _onSorterClick: function(event) {
                this.setMod(event.currentTarget, 'loading');
            }
        }, {

            live: function() {
                this.liveBindTo('sorter', 'click', function(event) {
                    this._onSorterClick(event)
                })
            }

        }));

    });

