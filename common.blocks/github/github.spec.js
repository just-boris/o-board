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
                    expect(results).to.have.length(5);
                    expect(results[0]).to.have.deep.property('lastActivity.type', 'comment');
                    expect(results[1]).to.have.deep.property('lastActivity.type', 'comment');
                    expect(results[2]).to.have.deep.property('lastActivity.type', 'create');
                    expect(results[3]).to.have.deep.property('lastActivity.type', 'commit');
                    expect(results[4]).to.have.deep.property('lastActivity.type', 'comment');
                });
            });
        });

        provide();

    });
