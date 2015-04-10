/**
 * @module dom
 * @description some DOM utils
 */

modules.define('github', [], function(provide) {
    "use strict";
    function fromJSON(response) {
        return response.json();
    }
    function flatten(array) {
        return Array.prototype.concat.apply([], array);
    }
    var GITHUB_ENDPOINT = 'http://api.github.com';
    provide(/** @exports */{
        getRepos: function(organization) {
            return fetch(GITHUB_ENDPOINT+'/users/'+organization+'/repos')
                .then(fromJSON);
        },
        getIssues: function(repositories) {
            return Promise.all([
                Promise.all(repositories.map(function(repo) {
                    var repository = repo.split('/');
                    return fetch(GITHUB_ENDPOINT+'/repos/'+repo+'/issues?direction=desc&sort=updated')
                        .then(fromJSON)
                        .then(function(issues) {
                        return issues.map(function(issue) {
                            return {
                                id: issue.number,
                                url: issue.url,
                                organization: repository[0],
                                repository: repository[1],
                                title: issue.title,
                                labels: issue.labels,
                                isPullRequest: !!issue.pull_request
                            };
                        });
                    });
                })).then(flatten),
                Promise.all(repositories.map(function(repo) {
                    return fetch(GITHUB_ENDPOINT+'/repos/'+repo+'/issues/comments?direction=desc&sort=updated')
                        .then(fromJSON)
                        .then(function(comments) {
                            return comments.map(function(comment) {
                                return {
                                    issueUrl: comment.issue_url,
                                    author: {
                                        login: comment.user.login,
                                        url: comment.user.html_url
                                    },
                                    date: comment.updated_at,
                                    text: comment.body
                                };
                            });
                        });
                })).then(flatten)
            ]).then(function(data) {
                var issues = data[0],
                    comments = data[1];
                return issues.map(function(issue) {
                    issue.comment = comments.filter(function(comment) {
                        return comment.issueUrl === issue.url;
                    })[0];
                    return issue;
                });
            });
        }
    });
});
