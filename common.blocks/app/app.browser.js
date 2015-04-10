modules.define('app', ['i-bem__dom', 'BEMHTML', 'github'], function (provide, BEMDOM, BEMHTML, github) {
    'use strict';
    provide(BEMDOM.decl(this.name, {
        onSetMod: {
            js: {
                inited: function () {
                    try {
                        this._config = JSON.parse(window.localStorage.getItem('config'));
                    } catch(e) {}


                    this.setMod('state', this._config ? 'loading' : 'config');
                }
            },

            state: {
                config: function () {
                    this._showContent({ block: 'app-content', mods: { view: 'config' } });
                    //this._getBtnConfigSubmit().on('click', this._onClickBtnConfigSubmit, this);
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

                    this._getContent().then(function(issues) {
                        _this._issues = issues;
                        _this.setMod('state', 'content');
                    });

                },

                content: function () {
                    this._showContent({
                        block: 'app-content',
                        mods: { view: 'content' },
                        issues: this._issues
                    });
                }
            }
        },

        _onClickBtnConfigSubmit: function () {
            /**
             * сериализуем форму и сохраняем конфиг,
             * переставляем модификатор в loading
             */
            this._config = {
                token: 'default-token',
                repositories: [
                    'allure-framework/allure-core',
                    'allure-framework/allure-teamcity-plugin'
                ]
            };
            window.localStorage.setItem('config', JSON.stringify(this._config));

            this.setMod('state', 'loading');
        },

        _getContent: function () {
            return github.getIssues(this._config.repositories);
        },

        _showContent: function(bemjson) {
            BEMDOM.update(this.elem('content'), BEMHTML.apply(bemjson));
        },

        _getSpin: function () {
            return this._spin || (this._spin = this.findBlockInside('spin', 'spin'));
        },

        _getBtnConfigSubmit: function () {
            return this._btnConfigSubmit || (this._btnConfigSubmit = this.findBlockInside('btn-config-submit', 'button'));
        }
    }));
});
