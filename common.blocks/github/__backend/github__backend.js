modules.define('github__backend', function(provide) {
    "use strict";
    var GITHUB_ENDPOINT = 'http://api.github.com';
    provide({
        fromJSON: function(response) {
            return response.json();
        },
        getRepos: function(organization) {
            return fetch(GITHUB_ENDPOINT+'/users/'+organization+'/repos')
                .then(this.fromJSON);
        },
        getIssues: function(repo) {
            return fetch(GITHUB_ENDPOINT+'/repos/'+repo+'/issues?direction=desc&sort=updated')
                .then(this.fromJSON);
        },
        getComments: function(repo) {
            return fetch(GITHUB_ENDPOINT+'/repos/'+repo+'/issues/comments?direction=desc&sort=updated')
                .then(this.fromJSON);
        }
    });
});
