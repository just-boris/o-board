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
            {elems: ['spin', 'btn-config-submit']}
        ]
    }
]);
