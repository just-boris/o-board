/* global modules:false */
modules.define('issues-grid',
    ['i-bem__dom', 'BEMHTML', 'jquery'],
    function(provide, BEMDOM, BEMHTML, JQuery) {
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
                    case 'comment':
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

            }
        }, {

            live: function() {
                this.liveBindTo('sorter', 'click', function(event) {
                    this._onSorterClick(event)
                })
            }

        }));

    });

