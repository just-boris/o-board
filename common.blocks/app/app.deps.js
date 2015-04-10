([
    {
        tech: 'js',
        mustDeps: [
            {
                block: 'i-bem',
                tech: 'bemhtml'
            },
            {
                block: 'app-content',
                tech: 'bemhtml'
            },
        ]
    },
    {
        mustDeps: [
            'app-content',
            'github',
            { elems: ['btn-config-submit', 'filter', 'form', 'form-field', 'spin'] }
        ]
    }
]);
