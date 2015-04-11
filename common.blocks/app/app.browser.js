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

                    this._getLinkChangeConfig().on('click', this._onClickLinkChangeConfig, this);

                    //this.channel('app').on('refresh', function(event) {
                    //    // берем фильтры
                    //    // обновляем весь контент, нахер сортировку, пока что.
                    //});
                }
            },

            state: {
                config: function () {
                    this._buildConfigView();
                    this._getFormConfig().on('submit', this._onFormConfigSubmit, this);
                    this._getBtnConfigClear().on('click', this._onClickBtnConfigClear, this);
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

            this._getFormConfig().un('submit', this._onFormConfigSubmit, this);

            this.setMod('state', 'loading');
        },

        _onClickLinkChangeConfig: function () {
            this._clearCacheConfigBlocks();
            this.setMod('state', 'config');
            this._clearConfig();
        },

        _onClickBtnConfigClear: function () {
            this._getBtnConfigClear().un('click', this._onClickBtnConfigClear, this);
            this._clearCacheConfigBlocks();
            this._buildConfigView();
            this._getFormConfig().on('submit', this._onFormConfigSubmit, this);
            this._getBtnConfigClear().on('click', this._onClickBtnConfigClear, this);
        },

        _clearConfig: function () {
            delete this._config;
            window.localStorage.removeItem('config');
        },

        _buildConfigView: function () {
            var bemjson = {
                block: 'app-content',
                mods: { view: 'config' },
                config: this._config
            };

            this._showContent(bemjson);
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
        },

        _getLinkChangeConfig: function () {
            return this._linkChangeConfig || (this._linkChangeConfig = this.findBlockInside('change-config', 'link'));
        },

        _getBtnConfigClear: function () {
            return this._btnConfigClear || (this._btnConfigClear = this.findBlockInside('btn-config-clear', 'button'));
        },

        _clearCacheConfigBlocks: function () {
            delete this._formConfig;
            delete this._btnConfigClear;
        }
    }));
});
