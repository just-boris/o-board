([
    {
        tech: 'js',
        mustDeps: [
            {
                block: 'i-bem',
                tech: 'bemhtml'
            },
            {
                elems: ['spin-title'],
                tech: 'bemhtml'
            },
            {
                mods: { view: ['config', 'loading', 'content'] },
                tech: 'bemhtml'
            }
        ]
    },
    {
        shouldDeps: [
            'issues-grid',
            { elems: ['spin-title'] },
            { mods: { view: ['config', 'loading', 'content'] } }
        ]
    }
]);
