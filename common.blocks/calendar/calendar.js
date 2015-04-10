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
