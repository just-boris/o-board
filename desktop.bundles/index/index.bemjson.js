//noinspection BadExpressionStatementJS
module.exports = {
    block: 'page',
    title: 'Hello, I am O-board / Github issues dashboard',
    favicon: '/favicon.ico',
    head: [
        { elem: 'meta', attrs: { name: 'description', content: '' } },
        { elem: 'meta', attrs: { name: 'viewport', content: 'width=device-width, initial-scale=1' } },
        { elem: 'css', url: '_index.css' },
        { elem: 'css', url: '//maxcdn.bootstrapcdn.com/font-awesome/4.3.0/css/font-awesome.min.css' }
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
            },
            {
                block: 'issues-grid',
                issues: [{
                    pullRequest: '//github.com',
                    url: '//github.com',
                    organization: 'MyOrganization',
                    repository: 'MyRepository',
                    id: '123',
                    title: 'Issue title',
                    labels: [{
                        name: 'label',
                        color: '#red'
                    }],
                    comment: {
                        author: {
                            name: 'AuthorName',
                            url: '//github.com'
                        },
                        text: 'commentText',
                        date: Date.now()
                    }
                }]
            }
        ]
    }
}
