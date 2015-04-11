modules.define('form',
    ['i-bem__dom', 'jquery'],
    function (provide, BEMDOM, $) {
        provide(BEMDOM.decl(this.name, {
            onSetMod: {
                js: {
                    inited: function () {
                        this.bindTo('submit', this._onSubmit);
                        BEMDOM.blocks['input'].on(
                            { modName : 'focused', modVal : true }, this._onFocus, this
                        );
                    }
                }
            },

            _onSubmit: function (e) {
                e.preventDefault();

                this._isValid() && this.emit('submit', this._getSerialize());

                return this;
            },

            _onError: function (control, input) {
                this._getPopup()
                    .setAnchor(input)
                    .setContent(this.elemParams($(control)).errorMessage)
                    .setMod('visible', true);
            },

            _onFocus: function () {
                this._getPopup().delMod('visible');
            },

            /**
             * Проверяем, введены ли данные в контрол, если нет возвращаем true
             * и показываем попап с ошибкой
             * @returns {boolean}
             */
            _isValid: function () {
                var _this = this,
                    $controls = this.findElem('control', 'required', true),
                    resultCheck = true,
                    input;

                $controls.each(function (idx, control) {
                    input = _this.findBlockInside($(control), 'input');

                    if (input && !input.getVal()) {

                        _this._onError(control, input);

                        resultCheck = false;

                        // after find goal elem - exit from $.each()
                        return false;
                    }

                });

                return resultCheck;
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
            }
        }));
    });
