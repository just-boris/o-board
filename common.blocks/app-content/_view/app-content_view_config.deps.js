[
    {
        tech: 'js',
        mustDeps: [
            {
                block: 'input',
                mods: {
                    theme: 'islands',
                    size: 'l',
                    width: 'available',
                    'has-clear': true
                },
                tech: 'bemhtml'
            },
            {
                block: 'popup',
                mods: { theme: 'islands', target: 'anchor', autoclosable: true },
                tech: 'bemhtml'
            }
        ]
    },
    {
        mustDeps: [
            {
                block: 'form'
            },
            {
                block: 'input',
                mods: {
                    theme: 'islands',
                    size: 'l',
                    width: 'available',
                    'has-clear': true
                }
            },
            {
                block: 'popup',
                mods: { theme: 'islands', target: 'anchor', autoclosable: true }
            }
        ]
    }
]
