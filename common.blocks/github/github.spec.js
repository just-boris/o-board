modules.define(
    'spec',
    ['github', 'chai'],
    function(provide, github, chai) {

        describe('github wrapper', function() {

            it('should request', function() {
                var result = github.getRepos();
                chai.expect(result).to.be.instanceof(Promise);
            });
        });

        provide();

    });
