[
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
            { elems: ['spin-title'] },
            { mods: { view: ['config', 'loading', 'content'] } }
        ]
    }
]
