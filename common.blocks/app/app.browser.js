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

                    //this.channel('app').on('refresh', function(event) {
                    //    // берем фильтры
                    //    // обновляем весь контент, нахер сортировку, пока что.
                    //});
                }
            },

            state: {
                config: function () {
                    this._showContent({ block: 'app-content', mods: { view: 'config' } });
                    this._getFormConfig().on('submit', this._onFormConfigSubmit, this);
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
                    //this._showContent({
                    //    tag: 'pre',
                    //    content: JSON.stringify(this._issues, null, 4)
                    //});

                    this._showContent({
                        block: 'app-content',
                        mods: { view: 'content' },
                        issues: this._issues
                    });
                }
            }
        },

        _onFormConfigSubmit: function (e, data) {
            /**
             * сериализуем форму и сохраняем конфиг,
             * переставляем модификатор в loading
             */

            if (!data) return;
            if (!this._config) this._config = {};

            var _config = this._config;

            data.forEach(function (item) {

                if (item.value === '') return false;
                if (item.name === 'repositories') {

                    if(!_config.repositories) {
                        _config.repositories = [];
                    }

                    // if exist, remove slash before url
                    if ((/^\//gi).test(item.value)) {
                        item.value = item.value.slice(1);
                    }

                    _config.repositories.push(item.value);

                } else {
                    _config[item.name] = item.value;
                }
            });

            window.localStorage.setItem('config', JSON.stringify(this._config));

            this.setMod('state', 'loading');
        },

        _getContent: function () {
            return github.getIssues(this._config.repositories, {token: this._config.token});
        },

        _showContent: function(bemjson) {
            BEMDOM.update(this.elem('content'), BEMHTML.apply(bemjson));
        },

        _getSpin: function () {
            return this._spin || (this._spin = this.findBlockInside('spin', 'spin'));
        },

        _getFormConfig: function () {
            return this._formConfig || (this._formConfig = this.findBlockInside('form'));
        }
    }));
});
