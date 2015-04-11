modules.define('github__backend', function(provide) {
    "use strict";
    var GITHUB_ENDPOINT = 'https://api.github.com';
    provide({
        _fromJSON: function(response) {
            return response.json();
        },
        _getAuthHeader: function(token) {
            return {
                'Authorization': 'Basic ' + btoa(token+':x-oauth-basic')
            };
        },
        getRepos: function(organization, options) {
            return fetch(GITHUB_ENDPOINT+'/users/'+organization+'/repos', {
                headers: this._getAuthHeader(options.token)
            }).then(this._fromJSON);
        },
        getIssues: function(repo, options) {
            return fetch(GITHUB_ENDPOINT+'/repos/'+repo+'/issues?direction=desc&sort=updated', {
                headers: this._getAuthHeader(options.token)
            }).then(this._fromJSON);
        },
        getComments: function(repo, options) {
            return fetch(GITHUB_ENDPOINT+'/repos/'+repo+'/issues/comments?direction=desc&sort=updated', {
                headers: this._getAuthHeader(options.token)
            }).then(this._fromJSON);
        }
    });
});
