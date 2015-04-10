modules.define('filter', ['i-bem__dom'], function (provide, BEMDOM) {
    'use strict';
    provide(BEMDOM.decl(this.name, {
        onSetMod: {
            js: {
                inited: function () {
                    ['repo-select', 'label-select']
                        .map(function (item) {
                            return this.findBlockInside(item, 'select');
                        }, this)
                        .forEach(function (item) {
                            item.on('change', this._onChange, this)
                        }, this);

                    ['issue-check', 'pr-check', 'assign-check']
                        .map(function (item) {
                            return this.findBlockInside(item, 'checkbox');
                        }, this)
                        .forEach(function (item) {
                            item.bindTo('control', 'click', this._onChange, this);
                        }, this);
                }
            }
        },

        _onChange: function () {
            console.log('CHANGE!');
        }
    }));
});
