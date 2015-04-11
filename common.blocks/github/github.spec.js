modules.define(
    'spec',
    ['github', 'chai', 'sinon'],
    function(provide, github, chai) {
        "use strict";
        var expect = chai.expect;
        describe('github wrapper', function() {
            it('should request repos', function() {
                var result = github.getRepos('my-org').then(function(results) {
                    expect(results).to.have.length(9);
                });
                expect(result).to.be.instanceof(Promise);
                return result;
            });

            it('should request issues and group it', function() {
                return github.getIssues(['my-org/core', 'my-org/extras', 'my-org/examples']).then(function(results) {
                    expect(results.answered).to.have.length(2);
                    expect(results.unanswered).to.have.length(3);
                    expect(results.unanswered[0]).to.have.deep.property('lastActivity.type', 'comment');
                    expect(results.unanswered[1]).to.have.deep.property('lastActivity.type', 'create');
                    expect(results.unanswered[2]).to.have.deep.property('lastActivity.type', 'commit');
                    expect(results.answered[0]).to.have.deep.property('lastActivity.type', 'comment');
                    expect(results.answered[1]).to.have.deep.property('lastActivity.type', 'comment');
                });
            });
        });

        provide();

    });
