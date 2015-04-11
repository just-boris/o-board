([{
    tech: 'js',
    mustDeps: [
        {
            block: 'i-bem',
            tech: 'bemhtml'
        },
        {
            block: 'issues-grid',
            tech: 'bemhtml'
        },
    ]
}, {
    mustDeps: [
        { block: 'moment' }
    ],
    shouldDeps: [
        { block: 'icon' },
        { block: 'fa' },
        { block: 'link', mods: { theme: 'islands', size: 's' } },
        { block: 'spin', mods: { theme: 'islands', size: 'xs' } },
        { block: 'jquery' },
        { block: 'image' },
        { block: 'perdula' }
    ]
}]);
