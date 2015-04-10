modules.define('app', ['i-bem__dom', 'BEMHTML'], function (provide, BEMDOM, BEMHTML) {
    'use strict';
    provide(BEMDOM.decl(this.name, {
        onSetMod: {
            js: {
                inited: function () {
                    this._config = window.localStorage.getItem('config');

                    this.setMod('state', this._config ? 'loading' : 'config');
                }
            },

            state: {
                config: function () {
                    this._showContent({ block: 'app-content', mods: { view: 'config' } });
                    this._getBtnConfigSubmit().on('click', this._onClickBtnConfigSubmit, this);
                },

                loading: function () {
                    /**
                     * На установку модификатора loading зовем
                     * this._getContent() для получения json
                     *
                     * для тестинга лоадера пока setTimeout
                     * @type {onSetMod.state.loading}
                     * @private
                     */

                    var _this = this;

                    this._showContent({ block: 'app-content', mods: { view: 'loading' } });

                    setTimeout(function () {
                        _this.setMod('state', 'content');
                    }, 2000);
                },

                content: function () {
                    this._showContent({ block: 'app-content', mods: { view: 'content' } });
                }
            }
        },

        _onClickBtnConfigSubmit: function () {
            /**
             * сериализуем форму и сохраняем конфиг,
             * переставляем модификатор в loading
             */
            window.localStorage.setItem('config', { 'field1': 'val1' });

            this.setMod('state', 'loading');
        },

        _getContent: function () {
            // тратата с аяксом, конфиг в this._config
        },

        _showContent: function(bemjson) {
            BEMDOM.update(this.elem('content'), BEMHTML.apply(bemjson))
        },

        _getSpin: function () {
            return this._spin || (this._spin = this.findBlockInside('spin', 'spin'));
        },

        _getBtnConfigSubmit: function () {
            return this._btnConfigSubmit || (this._btnConfigSubmit = this.findBlockInside('btn-config-submit', 'button'));
        }
    }));
});
