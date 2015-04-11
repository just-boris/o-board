modules.define('github__backend', function(provide) {
    "use strict";
    var GITHUB_ENDPOINT = 'https://api.github.com';
    provide({
        _fromJSON: function(response) {
            return response.json();
        },
        _getHeaders: function(token) {
            return{
                headers: {
                    'Authorization': 'Basic ' + btoa(token+':x-oauth-basic')
                }
            };
        },
        getRepos: function(organization, options) {
            return fetch(GITHUB_ENDPOINT+'/users/'+organization+'/repos', this._getHeaders(options.token))
                .then(this._fromJSON);
        },
        getCollaborators: function(repo, options) {
            return fetch(GITHUB_ENDPOINT+'/repos/'+repo+'/collaborators', this._getHeaders(options.token))
                .then(this._fromJSON);
        },
        getPRCommits: function(issue, options) {
            return fetch(GITHUB_ENDPOINT+'/repos/'+issue.organization+'/'+issue.repository+'/pulls/'+issue.id+'/commits',
                this._getHeaders(options.token)).then(this._fromJSON);
        },
        getIssues: function(repo, options) {
            return fetch(GITHUB_ENDPOINT+'/repos/'+repo+'/issues?direction=desc&sort=updated', this._getHeaders(options.token))
                .then(this._fromJSON);
        },
        getComments: function(repo, options) {
            return fetch(GITHUB_ENDPOINT+'/repos/'+repo+'/issues/comments?direction=desc&sort=updated', this._getHeaders(options.token))
                .then(this._fromJSON);
        }
    });
});
