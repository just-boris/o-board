/* global modules:false */
modules.define('issues-grid',
    ['i-bem__dom', 'BEMHTML', 'jquery', 'github'],
    function(provide, BEMDOM, BEMHTML, JQuery, github) {
        'use strict';
        provide(BEMDOM.decl(this.name, {
            onSetMod: {
                js: {
                    inited: function() {
                        this._issues = this.params.issues;
                        this._perdula = this.findBlockInside('perdula');
                    }
                }
            },

            onElemSetMod: {
                sorter: {
                    loading: function(elem, modName, modVal) {
                        if (modVal) {
                            BEMDOM.append(elem, BEMHTML.apply({
                                block: 'spin',
                                mods: { theme: 'islands', size: 'xs', visible: true }
                            }));
                            this._processSort(elem);
                        } else {
                            var spin = this.findBlockInside(elem, 'spin');
                            spin && BEMDOM.destruct(spin.domElem);
                        }
                    },

                    direction: function(elem, modName, modVal) {
                        var icon = modVal ? (modVal === 'asc' ? 'sort-down' : 'sort-up') : 'angle-down',
                            html = BEMHTML.apply({ block: 'fa', icon: icon });

                        BEMDOM.update(elem, html);
                    }
                }
            },

            _onSorterClick: function(event) {
                this.setMod(event.currentTarget, 'loading');
            },

            _processSort: function(elem) {
                var key = elem.data().key,
                    currentDirection = this.getMod(elem, 'direction'),
                    newDirection = currentDirection === 'asc' ? 'dsc' : 'asc',
                    sorter = null;

                switch (key) {
                    case 'issue':
                        sorter = this._issueSorter;
                        break;
                    case 'title':
                        sorter = this._titleSorter;
                        break;
                    case 'comment':
                        sorter = this._commentsSorter;
                        break;
                }

                this._issues = sorter ? this._issues.sort(sorter) : this._issues.sort();

                /**
                 * Потому что прототип.
                 */
                if (newDirection === 'dsc') {
                    this._issues.reverse();
                }

                BEMDOM.update(this.elem('body'), BEMHTML.apply(
                    this._issues.map(function(issue) {
                        return {
                            block: 'issues-grid',
                            elem: 'issue-row',
                            issue: issue
                        };
                    })
                ));

                this.elem('sorter').each(function(index, node) {
                    this.setMod(JQuery(node), 'direction', '');
                }.bind(this));

                this.setMod(elem, 'direction', newDirection);

                this.nextTick(function() {
                    this.delMod(elem, 'loading');
                });
            },

            _commentsSorter: function(left, right) {
                return moment(left.comment.date).valueOf() > moment(right.comment.date).valueOf();
            },

            _issueSorter: function(left, right) {
                var issueLeft = left.organization + left.repository + left.id,
                    issueRight = right.organization + right.repository + right.id;

                return issueLeft > issueRight;
            },

            _titleSorter: function(left, right) {
                return left.title > right.title;
            },

            _onRowClick: function(event) {
                var elem = event.currentTarget,
                    issueId = elem.data().issue;

                this.setMod(elem, 'selected');

                var issue = this._getIssue(issueId);
                this._perdula.setContent(this._getIssueContent(issue));
                this._perdula.show();
                this._perdula.once('hide', function() {
                    this.delMod(elem, 'selected');
                }, this)
            },

            _getIssueContent: function() {
                return 'Hello world';
            },

            _getIssue: function(issueId) {
                return {
                    comments: [{
                        issueUrl: '//github.com',
                        author: {
                            avatarUrl: 'https://avatars.githubusercontent.com/u/475746?v=3',
                            login: 'tadatuta',
                            url: 'https://github.com/tadatuta'
                        },
                        date: '2015-04-08T20:46:32Z',
                        text: 'Thanks for the corrections - updated the doc accordingly'
                    }, {
                        issueUrl: '//github.com',
                        author: {
                            avatarUrl: 'https://avatars.githubusercontent.com/u/475746?v=3',
                            login: 'tadatuta',
                            url: 'https://github.com/tadatuta'
                        },
                        date: '2015-04-08T20:46:32Z',
                        text: 'Thanks for the corrections - updated the doc accordingly'
                    }, {
                        issueUrl: '//github.com',
                        author: {
                            avatarUrl: 'https://avatars.githubusercontent.com/u/475746?v=3',
                            login: 'tadatuta',
                            url: 'https://github.com/tadatuta'
                        },
                        date: '2015-04-08T20:46:32Z',
                        text: 'Thanks for the corrections - updated the doc accordingly'
                    }, {
                        issueUrl: '//github.com',
                        author: {
                            avatarUrl: 'https://avatars.githubusercontent.com/u/475746?v=3',
                            login: 'tadatuta',
                            url: 'https://github.com/tadatuta'
                        },
                        date: '2015-04-08T20:46:32Z',
                        text: 'Thanks for the corrections - updated the doc accordingly'
                    }, {
                        issueUrl: '//github.com',
                        author: {
                            avatarUrl: 'https://avatars.githubusercontent.com/u/475746?v=3',
                            login: 'tadatuta',
                            url: 'https://github.com/tadatuta'
                        },
                        date: '2015-04-08T20:46:32Z',
                        text: 'Thanks for the corrections - updated the doc accordingly'
                    }]
                }
            }
        }, {

            live: function() {
                this.liveBindTo('sorter', 'click', function(event) {
                    this._onSorterClick(event)
                });

                this.liveBindTo('issue-row', 'click', function(event) {
                    this._onRowClick(event);
                })
            }

        }));

    });

