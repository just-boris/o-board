modules.define('github__backend', function(provide, backend) {
    "use strict";
    backend.getRepos = function(organization) {
        return Promise.resolve([
            {
                "id": 3334335,
                "name": "apw",
                "full_name": "bem/apw",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            },
            {
                "id": 32155667,
                "name": "badges",
                "full_name": "bem/badges",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            },
            {
                "id": 8156994,
                "name": "bem-articles",
                "full_name": "bem/bem-articles",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            },
            {
                "id": 11577068,
                "name": "bem-bench",
                "full_name": "bem/bem-bench",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            },
            {
                "id": 610292,
                "name": "bem-bl",
                "full_name": "bem/bem-bl",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            },
            {
                "id": 10786343,
                "name": "bem-cli",
                "full_name": "bem/bem-cli",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            },
            {
                "id": 6578551,
                "name": "bem-components",
                "full_name": "bem/bem-components",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            },
            {
                "id": 5688745,
                "name": "bem-dashboard",
                "full_name": "bem/bem-dashboard",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            },
            {
                "id": 11341198,
                "name": "bem-history",
                "full_name": "bem/bem-history",
                "owner": {"login": "bem", "id": 223412, "site_admin": false}
            }
        ]);
    };
    backend.getIssues = function(repo) {
        var issues = {
            'my-org/core': [
                {
                    "url": "https://api.github.com/repos/my-org/core/issues/947",
                    "number": 947,
                    "title": "The ua block description rework with new template",
                    "comments": 0,
                    "labels": [{
                        "name": "docs",
                        "color": "fbca04"
                    }, {
                        "name": "v2",
                        "color": "d4c5f9"
                    }],
                    "state": "open",
                    "updated_at": "2015-04-09T12:18:36Z"
                }, {
                    "url": "https://api.github.com/repos/my-org/core/issues/945",
                    "number": 945,
                    "title": "BEMJSON: boolean type added to the description",
                    "comments": 2,
                    "labels": [],
                    "pull_request": {},
                    "state": "open",
                    "updated_at": "2015-04-06T15:09:29Z"
                }],
            'my-org/extras': [{
                "url": "https://api.github.com/repos/my-org/extras/issues/20",
                "number": 20,
                "title": "i-bem.bemhtml: Support nested mix as object",
                "comments": 3,
                "labels": [],
                "pull_request": {},
                "state": "open",
                "updated_at": "2015-04-02T22:03:35Z",
                "user": {"login": "tadatuta"}
            }, {
                "url": "https://api.github.com/repos/my-org/extras/issues/23",
                "number": 23,
                "title": "i-bem.bemhtml: decline support of nested mixes at all",
                "comments": 1,
                "labels": [{
                    "name": "question",
                    "color": "cc317c"
                }],
                "state": "open",
                "updated_at": "2015-04-02T14:56:47Z"
            }],
            'my-org/examples': []
        };
        return Promise.resolve(issues[repo] || []);
    };
    backend.getComments = function(repo) {
        var comments = {
            'my-org/core': [{
                "issue_url": "https://api.github.com/repos/my-org/core/issues/947",
                "user": {"login": "aristov"},
                "updated_at": "2015-04-08T13:50:58Z",
                "body": "core latest comment"
            }, {
                "issue_url": "https://api.github.com/repos/my-org/core/issues/945",
                "user": {"login": "aristov"},
                "updated_at": "2015-04-08T13:50:58Z",
                "body": "one of two comments"
            }, {
                "issue_url": "https://api.github.com/repos/my-org/core/issues/945",
                "user": {"login": "aristov"},
                "updated_at": "2015-04-08T13:50:58Z",
                "body": "my comment"
            }],
            'my-org/extras': [{
                "issue_url": "https://api.github.com/repos/my-org/extras/issues/20",
                "user": {"login": "aristov"},
                "updated_at": "2015-04-08T13:50:58Z",
                "body": "comment from 20"
            }, {
                "issue_url": "https://api.github.com/repos/my-org/extras/issues/20",
                "user": {"login": "aristov"},
                "updated_at": "2015-04-08T13:50:58Z",
                "body": "my comment"
            }, {
                "issue_url": "https://api.github.com/repos/my-org/extras/issues/23",
                "user": {"login": "aristov"},
                "updated_at": "2015-04-08T13:50:58Z",
                "body": "twenty-three"
            }],
            'my-org/examples': [{
                "issue_url": "https://api.github.com/repos/my-org/examples/issues/190",
                "user": {"login": "aristov"},
                "updated_at": "2015-04-08T13:50:58Z",
                "body": "latest comment"
            }, {
                "issue_url": "https://api.github.com/repos/my-org/examples/issues/170",
                "user": {"login": "aristov"},
                "updated_at": "2015-04-08T13:50:58Z",
                "body": "my comment"
            }, {
                "issue_url": "https://api.github.com/repos/my-org/examples/issues/145",
                "user": {"login": "aristov"},
                "updated_at": "2015-04-08T13:50:58Z",
                "body": "my comment"
            }]
        };
        return Promise.resolve(comments[repo] || []);
    };
    provide(backend);
});
