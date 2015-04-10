modules.define(
    'spec',
    ['github', 'chai', 'sinon'],
    function(provide, github, chai, sinon) {
        "use strict";
        var expect = chai.expect;
        describe('github wrapper', function() {
            beforeEach(function() {
                this.server = sinon.fakeServer.create();
                this.expectResponse = function(url, response) {
                    this.server.respondWith("GET", "http://api.github.com/" + url,
                        [
                            200,
                            {"Content-Type": "application/json"},
                            JSON.stringify(response)
                        ]);
                };
            });
            afterEach(function() {
                this.server.restore();
            });

            it('should request repos', function() {
                this.expectResponse('users/my-org/repos', [
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
                var result = github.getRepos('my-org').then(function(results) {
                    expect(results).to.have.length(9);
                });
                expect(result).to.be.instanceof(Promise);
                this.server.respond();
                return result;
            });

            it('should request issues and group it', function() {
                this.expectResponse('repos/my-org/core/issues?direction=desc&sort=updated', [
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
                    }]);
                this.expectResponse('repos/my-org/extras/issues?direction=desc&sort=updated', [{
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
                    }]);
                this.expectResponse('repos/my-org/examples/issues?direction=desc&sort=updated', []);
                this.expectResponse('repos/my-org/core/issues/comments?direction=desc&sort=updated', [{
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
                }]);
                this.expectResponse('repos/my-org/extras/issues/comments?direction=desc&sort=updated', [{
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
                }]);
                this.expectResponse('repos/my-org/examples/issues/comments?direction=desc&sort=updated', [{
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
                }]);
                var result = github.getIssues(['my-org/core', 'my-org/extras', 'my-org/examples']).then(function(results) {
                    expect(results).to.have.length(4);
                    expect(results[0]).to.have.deep.property('comment.text', 'core latest comment');
                    expect(results[1]).to.have.deep.property('comment.text', 'one of two comments');
                    expect(results[2]).to.have.deep.property('comment.text', 'comment from 20');
                    expect(results[3]).to.have.deep.property('comment.text', 'twenty-three');
                });
                this.server.respond();
                return result;
            });
        });

        provide();

    });
