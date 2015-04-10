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
                            item.bindTo('control', 'click', this._onChange.bind(this), this);
                        }, this);

                    this.findBlockInside('date-input', 'input').on('change', this._onChange, this);
                }
            }
        },

        _onChange: function () {
            var selectElems = [
                    ['repo-select', 'repository'],
                    ['label-select', 'label']
                ],
                checkboxElems = [
                    ['issue-check', 'issues'],
                    ['pr-check', 'pullRequests'],
                    ['assign-check', 'assignToMe']
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

                console.log('filter data: ' + JSON.stringify(values));
                this.emit('change', values);
        }
    }));
});
