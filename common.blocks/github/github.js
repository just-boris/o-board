/**
 * @module dom
 * @description some DOM utils
 */

modules.define('github', ['github__backend'], function(provide, backend) {
    "use strict";

    var R_ISO8601_STR = /^(\d{4})-?(\d\d)-?(\d\d)(?:T(\d\d?)(?::?(\d\d)(?::?(\d\d)(?:\.(\d+))?)?)?(Z|([+-])(\d\d):?(\d\d))?)?$/;
    // 1        2       3         4          5          6          7          8  9     10      11
    function jsonStringToDate(string) {
        var match;
        if (match = string.match(R_ISO8601_STR)) {
            var date = new Date(0),
                tzHour = 0,
                tzMin  = 0,
                dateSetter = match[8] ? date.setUTCFullYear : date.setFullYear,
                timeSetter = match[8] ? date.setUTCHours : date.setHours;

            if (match[9]) {
                tzHour = Number(match[9] + match[10]);
                tzMin = Number(match[9] + match[11]);
            }
            dateSetter.call(date, Number(match[1]), Number(match[2]) - 1, Number(match[3]));
            var h = Number(match[4] || 0) - tzHour;
            var m = Number(match[5] || 0) - tzMin;
            var s = Number(match[6] || 0);
            var ms = Math.round(parseFloat('0.' + (match[7] || 0)) * 1000);
            timeSetter.call(date, h, m, s, ms);
            return date;
        }
        return string;
    }

    function flatten(array) {
        return Array.prototype.concat.apply([], array);
    }
    function getCommitAuthor(commit) {
        if(commit.author) {
            return {
                login: commit.author.login,
                avatarUrl: commit.author.avatar_url,
                url: commit.author.html_url
            };
        } else {
            return {
                login: commit.commit.author.name
            };
        }
    }
    function lastCommentActivity(issue) {
        if(issue.comment) {
            issue.lastActivity = issue.comment;
        } else {
            issue.lastActivity = {
                type: 'create',
                issueUrl: issue.url,
                author: issue.author,
                date: issue.date
            };
        }
        return issue;
    }
    function lastActivity(issue, options) {
        lastCommentActivity(issue);
        if(issue.isPullRequest) {
            return backend.getPRCommits(issue, options).then(function(commits) {
                if(commits.length > 0) {
                    var lastCommit = commits.slice(-1)[0],
                        commitDate = jsonStringToDate(lastCommit.commit.author.date);
                    if(commitDate > issue.lastActivity.date) {
                        issue.lastActivity = {
                            type: 'commit',
                            issueUrl: lastCommit.html_url,
                            author: getCommitAuthor(lastCommit),
                            date: commitDate
                        };
                    }
                }
                return issue;
            });
        } else {
            return issue;
        }

    }
    provide(/** @exports */{
        getRepos: function(organization, options) {
            options = options || {};
            return backend.getRepos(organization, options);
        },
        getIssues: function(repositories, options) {
            options = options || {};
            return Promise.all(repositories.map(function(repo) {
                var repository = repo.split('/');
                return Promise.all([
                    backend.getIssues(repo, options).then(function(issues) {
                        return issues.map(function(issue) {
                            return {
                                id: issue.number,
                                url: issue.html_url,
                                author: {
                                    login: issue.user.login,
                                    avatarUrl: issue.user.avatar_url,
                                    url: issue.user.html_url
                                },
                                date: jsonStringToDate(issue.updated_at),
                                apiUrl: issue.url,
                                organization: repository[0],
                                repository: repository[1],
                                title: issue.title,
                                labels: issue.labels,
                                isPullRequest: !!issue.pull_request
                            };
                        });
                    }),
                    backend.getComments(repo, options).then(function(comments) {
                        return comments.map(function(comment) {
                            return {
                                type: 'comment',
                                issueUrl: comment.issue_url,
                                author: {
                                    login: comment.user.login,
                                    avatarUrl: comment.user.avatar_url,
                                    url: comment.user.html_url
                                },
                                date: jsonStringToDate(comment.updated_at),
                                text: comment.body
                            };
                        });
                    }),
                    backend.getCollaborators(repo, options).then(function(collaborators) {
                        return collaborators.map(function(collaborator) {
                            return collaborator.login;
                        });
                    })
                ]).then(function(data) {
                    var issues = data[0],
                        comments = data[1],
                        collaborators = data[2];
                    return Promise.all(issues.map(function(issue) {
                        issue.comment = comments.filter(function(comment) {
                            return comment.issueUrl === issue.apiUrl;
                        })[0];
                        return Promise.resolve(lastActivity(issue, options)).then(function(issue) {
                            issue.answered = collaborators.indexOf(issue.lastActivity.author.login) > -1;
                            return issue;
                        });
                    }));
                });
            })).then(flatten).then(function(results) {
                return results.reduce(function(all, issue) {
                    all[issue.answered ? 'answered': 'unanswered'].push(issue);
                    return all;
                }, {answered: [], unanswered: []});
            });
        }
    });
});
