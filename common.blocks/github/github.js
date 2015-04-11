/**
 * @module dom
 * @description some DOM utils
 */

modules.define('github', ['github__backend'], function(provide, backend) {
    "use strict";
    function flatten(array) {
        return Array.prototype.concat.apply([], array);
    }
    provide(/** @exports */{
        getRepos: function(organization, options) {
            return backend.getRepos(organization);
        },
        getIssues: function(repositories, options) {
            return Promise.all([
                Promise.all(repositories.map(function(repo) {
                    var repository = repo.split('/');
                    return backend.getIssues(repo).then(function(issues) {
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
                    return backend.getComments(repo).then(function(comments) {
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
