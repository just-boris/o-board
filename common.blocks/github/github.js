/**
 * @module dom
 * @description some DOM utils
 */

modules.define('github', [], function(provide) {
    "use strict";
    function fromJSON(response) {
        return response.json();
    }
    var GITHUB_ENDPOINT = 'http://api.github.com';
    provide(/** @exports */{
        getRepos: function(organization) {
            return fetch(GITHUB_ENDPOINT+'/users/'+organization+'/repos')
                .then(fromJSON);
        }
    });

});
