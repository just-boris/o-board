modules.define(
    'skeleton',
    ['i-bem__dom', 'github'],
    function(provide, BEMDOM, github) {
        "use strict";
        provide(BEMDOM.decl(this.name, {
            onSetMod: {
                js: {
                    inited: function() {
                        github.getRepos('bem').then(function(repos) {
                            console.log(repos);
                        });
                    }
                }
            }
        }));
    });
