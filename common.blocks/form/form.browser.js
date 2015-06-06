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
