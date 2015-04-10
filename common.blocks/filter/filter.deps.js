({
    shouldDeps: [
        { elems: [
            'repo-select',
            'issue-check',
            'pr-check',
            'assign-check',
            'label-select',
            'date-input',
            'inline-field',
            'delimeter'
        ]},
        { block: 'select', mods: { mode : 'radio-check', theme : 'islands', size : 'm' } },
        { block: 'checkbox', mods:  { theme : 'islands', size : 'm' } },
        { block: 'input', mods : { theme : 'islands', size : 'm' } }
    ]
});
