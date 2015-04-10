//noinspection BadExpressionStatementJS
module.exports = {
    block: 'page',
    title: 'Title of the page',
    favicon: '/favicon.ico',
    head: [
        { elem: 'meta', attrs: { name: 'description', content: '' } },
        { elem: 'meta', attrs: { name: 'viewport', content: 'width=device-width, initial-scale=1' } },
        { elem: 'css', url: '_index.css' }
    ],
    scripts: [{ elem: 'js', url: '_index.js' }],
    mods: { theme: 'islands' },
    content: {
        // Корневой блок app, в нем вся логика дашборда
        block: 'app',
        content: [
            {
                block: 'header',
                title: 'User\'s issues'
            },
            {
                block: 'filter'
            },
            // Обязательный элемент блока app,
            // в него будут вставляться таблицы
            {
                elem: 'content'
            }
        ]
    }
};
