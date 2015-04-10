//noinspection BadExpressionStatementJS
module.exports = {
    block: 'page',
    title: 'Hello, I am O-board / Github issues dashboard',
    favicon: '/favicon.ico',
    head: [
        { elem: 'meta', attrs: { name: 'description', content: '' } },
        { elem: 'meta', attrs: { name: 'viewport', content: 'width=device-width, initial-scale=1' } },
        { elem: 'css', url: '_index.css' }
    ],
    scripts: [{ elem: 'js', url: '_index.js' }],
    mods: { theme: 'o-board' },
    content: {
        // Корневой блок app, в нем вся логика дашборда
        block: 'app',
        content: [
            {
                block: 'header',
                mix: { block: 'app', elem: 'header' },
                title: 'User\'s issues'
            },
            {
                block: 'filter',
                mix: { block: 'app', elem: 'filter' },
                js: true
            },
            // Обязательный элемент блока app,
            // в него будут вставляться таблицы
            {
                elem: 'content'
            }
        ]
    }
};
