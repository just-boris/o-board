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
