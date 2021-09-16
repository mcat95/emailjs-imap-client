"use strict";

var _hoodiecrowImap = _interopRequireDefault(require("hoodiecrow-imap"));

var _index = _interopRequireWildcard(require("../src/index"));

var _commandParser = require("./command-parser");

var _commandBuilder = require("./command-builder");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-disable no-unused-expressions */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
describe('browserbox integration tests', () => {
  let imap;
  const port = 10000;
  let server;
  beforeEach(done => {
    // start imap test server
    var options = {
      // debug: true,
      plugins: ['STARTTLS', 'X-GM-EXT-1'],
      secureConnection: false,
      storage: {
        INBOX: {
          messages: [{
            raw: 'Subject: hello 1\r\n\r\nWorld 1!'
          }, {
            raw: 'Subject: hello 2\r\n\r\nWorld 2!',
            flags: ['\\Seen']
          }, {
            raw: 'Subject: hello 3\r\n\r\nWorld 3!',
            uid: 555
          }, {
            raw: 'From: sender name <sender@example.com>\r\nTo: Receiver name <receiver@example.com>\r\nSubject: hello 4\r\nMessage-Id: <abcde>\r\nDate: Fri, 13 Sep 2013 15:01:00 +0300\r\n\r\nWorld 4!'
          }, {
            raw: 'Subject: hello 5\r\n\r\nWorld 5!',
            flags: ['$MyFlag', '\\Deleted'],
            uid: 557
          }, {
            raw: 'Subject: hello 6\r\n\r\nWorld 6!'
          }, {
            raw: 'Subject: hello 7\r\n\r\nWorld 7!',
            uid: 600
          }]
        },
        '': {
          separator: '/',
          folders: {
            '[Gmail]': {
              flags: ['\\Noselect'],
              folders: {
                'All Mail': {
                  'special-use': '\\All'
                },
                Drafts: {
                  'special-use': '\\Drafts'
                },
                Important: {
                  'special-use': '\\Important'
                },
                'Sent Mail': {
                  'special-use': '\\Sent'
                },
                Spam: {
                  'special-use': '\\Junk'
                },
                Starred: {
                  'special-use': '\\Flagged'
                },
                Trash: {
                  'special-use': '\\Trash'
                },
                A: {
                  messages: [{}]
                },
                B: {
                  messages: [{}]
                }
              }
            }
          }
        }
      }
    };
    server = (0, _hoodiecrowImap.default)(options);
    server.listen(port, done);
  });
  afterEach(done => {
    server.close(done);
  });
  describe('Connection tests', () => {
    var insecureServer;
    beforeEach(done => {
      // start imap test server
      var options = {
        // debug: true,
        plugins: [],
        secureConnection: false
      };
      insecureServer = (0, _hoodiecrowImap.default)(options);
      insecureServer.listen(port + 2, done);
    });
    afterEach(done => {
      insecureServer.close(done);
    });
    it('should use STARTTLS by default', () => {
      imap = new _index.default('127.0.0.1', port, {
        logLevel: _index.LOG_LEVEL_NONE,
        auth: {
          user: 'testuser',
          pass: 'testpass'
        },
        useSecureTransport: false
      });
      return imap.connect().then(() => {
        expect(imap.client.secureMode).to.be.true;
      }).then(() => {
        return imap.close();
      });
    });
    it('should ignore STARTTLS', () => {
      imap = new _index.default('127.0.0.1', port, {
        logLevel: _index.LOG_LEVEL_NONE,
        auth: {
          user: 'testuser',
          pass: 'testpass'
        },
        useSecureTransport: false,
        ignoreTLS: true
      });
      return imap.connect().then(() => {
        expect(imap.client.secureMode).to.be.false;
      }).then(() => {
        return imap.close();
      });
    });
    it('should fail connecting to non-STARTTLS host', () => {
      imap = new _index.default('127.0.0.1', port + 2, {
        logLevel: _index.LOG_LEVEL_NONE,
        auth: {
          user: 'testuser',
          pass: 'testpass'
        },
        useSecureTransport: false,
        requireTLS: true
      });
      return imap.connect().catch(err => {
        expect(err).to.exist;
      });
    });
    it('should connect to non secure host', () => {
      imap = new _index.default('127.0.0.1', port + 2, {
        logLevel: _index.LOG_LEVEL_NONE,
        auth: {
          user: 'testuser',
          pass: 'testpass'
        },
        useSecureTransport: false
      });
      return imap.connect().then(() => {
        expect(imap.client.secureMode).to.be.false;
      }).then(() => {
        return imap.close();
      });
    });
    it('should fail authentication', done => {
      imap = new _index.default('127.0.0.1', port + 2, {
        logLevel: _index.LOG_LEVEL_NONE,
        auth: {
          user: 'invalid',
          pass: 'invalid'
        },
        useSecureTransport: false
      });
      imap.connect().then(() => {
        expect(imap.client.secureMode).to.be.false;
      }).catch(() => {
        done();
      });
    });
  });
  describe('Post login tests', () => {
    beforeEach(() => {
      imap = new _index.default('127.0.0.1', port, {
        logLevel: _index.LOG_LEVEL_NONE,
        auth: {
          user: 'testuser',
          pass: 'testpass'
        },
        useSecureTransport: false
      });
      return imap.connect().then(() => {
        return imap.selectMailbox('[Gmail]/Spam');
      });
    });
    afterEach(() => {
      return imap.close();
    });
    describe('#listMailboxes', () => {
      it('should succeed', () => {
        return imap.listMailboxes().then(mailboxes => {
          expect(mailboxes).to.exist;
        });
      });
    });
    describe('#listMessages', () => {
      it('should succeed', () => {
        return imap.listMessages('inbox', '1:*', ['uid', 'flags', 'envelope', 'bodystructure', 'body.peek[]']).then(messages => {
          expect(messages).to.not.be.empty;
        });
      });
    });
    describe('#subscribe', () => {
      it('should succeed', () => {
        return imap.subscribeMailbox('inbox').then(response => {
          expect(response.command).to.equal('OK');
        });
      });
    });
    describe('#unsubscribe', () => {
      it('should succeed', () => {
        return imap.unsubscribeMailbox('inbox').then(response => {
          expect(response.command).to.equal('OK');
        });
      });
    });
    describe('#upload', () => {
      it('should succeed', () => {
        var msgCount;
        return imap.listMessages('inbox', '1:*', ['uid', 'flags', 'envelope', 'bodystructure']).then(messages => {
          expect(messages).to.not.be.empty;
          msgCount = messages.length;
        }).then(() => {
          return imap.upload('inbox', 'MIME-Version: 1.0\r\nDate: Wed, 9 Jul 2014 15:07:47 +0200\r\nDelivered-To: test@test.com\r\nMessage-ID: <CAHftYYQo=5fqbtnv-DazXhL2j5AxVP1nWarjkztn-N9SV91Z2w@mail.gmail.com>\r\nSubject: test\r\nFrom: Test Test <test@test.com>\r\nTo: Test Test <test@test.com>\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\ntest', {
            flags: ['\\Seen', '\\Answered', '\\$MyFlag']
          });
        }).then(() => {
          return imap.listMessages('inbox', '1:*', ['uid', 'flags', 'envelope', 'bodystructure']);
        }).then(messages => {
          expect(messages.length).to.equal(msgCount + 1);
        });
      });
    });
    describe('#search', () => {
      it('should return a sequence number', () => {
        return imap.search('inbox', {
          header: ['subject', 'hello 3']
        }).then(result => {
          expect(result).to.deep.equal([3]);
        });
      });
      it('should return an uid', () => {
        return imap.search('inbox', {
          header: ['subject', 'hello 3']
        }, {
          byUid: true
        }).then(result => {
          expect(result).to.deep.equal([555]);
        });
      });
      it('should work with complex queries', () => {
        return imap.search('inbox', {
          header: ['subject', 'hello'],
          seen: true
        }).then(result => {
          expect(result).to.deep.equal([2]);
        });
      });
    });
    describe('#setFlags', () => {
      it('should set flags for a message', () => {
        return imap.setFlags('inbox', '1', ['\\Seen', '$MyFlag']).then(result => {
          expect(result).to.deep.equal([{
            '#': 1,
            flags: ['\\Seen', '$MyFlag']
          }]);
        });
      });
      it('should add flags to a message', () => {
        return imap.setFlags('inbox', '2', {
          add: ['$MyFlag']
        }).then(result => {
          expect(result).to.deep.equal([{
            '#': 2,
            flags: ['\\Seen', '$MyFlag']
          }]);
        });
      });
      it('should remove flags from a message', () => {
        return imap.setFlags('inbox', '557', {
          remove: ['\\Deleted']
        }, {
          byUid: true
        }).then(result => {
          expect(result).to.deep.equal([{
            '#': 5,
            flags: ['$MyFlag'],
            uid: 557
          }]);
        });
      });
      it('should not return anything on silent mode', () => {
        return imap.setFlags('inbox', '1', ['$MyFlag2'], {
          silent: true
        }).then(result => {
          expect(result).to.deep.equal([]);
        });
      });
    });
    describe('#store', () => {
      it('should add labels for a message', () => {
        return imap.store('inbox', '1', '+X-GM-LABELS', ['\\Sent', '\\Junk']).then(result => {
          expect(result).to.deep.equal([{
            '#': 1,
            'x-gm-labels': ['\\Inbox', '\\Sent', '\\Junk']
          }]);
        });
      });
      it('should set labels for a message', () => {
        return imap.store('inbox', '1', 'X-GM-LABELS', ['\\Sent', '\\Junk']).then(result => {
          expect(result).to.deep.equal([{
            '#': 1,
            'x-gm-labels': ['\\Sent', '\\Junk']
          }]);
        });
      });
      it('should remove labels from a message', () => {
        return imap.store('inbox', '1', '-X-GM-LABELS', ['\\Sent', '\\Inbox']).then(result => {
          expect(result).to.deep.equal([{
            '#': 1,
            'x-gm-labels': []
          }]);
        });
      });
    });
    describe('#deleteMessages', () => {
      it('should delete a message', () => {
        var initialInfo;
        var expungeNotified = new Promise((resolve, reject) => {
          imap.onupdate = function (mb, type
          /*, data */
          ) {
            try {
              expect(mb).to.equal('inbox');
              expect(type).to.equal('expunge');
              resolve();
            } catch (err) {
              reject(err);
            }
          };
        });
        return imap.selectMailbox('inbox').then(info => {
          initialInfo = info;
          return imap.deleteMessages('inbox', 557, {
            byUid: true
          });
        }).then(() => {
          return imap.selectMailbox('inbox');
        }).then(resultInfo => {
          expect(initialInfo.exists - 1 === resultInfo.exists).to.be.true;
        }).then(() => expungeNotified);
      });
    });
    describe('#copyMessages', () => {
      it('should copy a message', () => {
        return imap.copyMessages('inbox', 555, '[Gmail]/Trash', {
          byUid: true
        }).then(() => {
          return imap.selectMailbox('[Gmail]/Trash');
        }).then(info => {
          expect(info.exists).to.equal(1);
        });
      });
    });
    describe('#moveMessages', () => {
      it('should move a message', () => {
        var initialInfo;
        return imap.selectMailbox('inbox').then(info => {
          initialInfo = info;
          return imap.moveMessages('inbox', 555, '[Gmail]/Spam', {
            byUid: true
          });
        }).then(() => {
          return imap.selectMailbox('[Gmail]/Spam');
        }).then(info => {
          expect(info.exists).to.equal(1);
          return imap.selectMailbox('inbox');
        }).then(resultInfo => {
          expect(initialInfo.exists).to.not.equal(resultInfo.exists);
        });
      });
    });
    describe('precheck', () => {
      it('should handle precheck error correctly', () => {
        // simulates a broken search command
        var search = (query, options = {}) => {
          var command = (0, _commandBuilder.buildSEARCHCommand)(query, options);
          return imap.exec(command, 'SEARCH', {
            precheck: () => Promise.reject(new Error('FOO'))
          }).then(response => (0, _commandParser.parseSEARCH)(response));
        };

        return imap.selectMailbox('inbox').then(() => search({
          header: ['subject', 'hello 3']
        })).catch(err => {
          expect(err.message).to.equal('FOO');
          return imap.selectMailbox('[Gmail]/Spam');
        });
      });
      it('should select correct mailboxes in prechecks on concurrent calls', () => {
        return imap.selectMailbox('[Gmail]/A').then(() => {
          return Promise.all([imap.selectMailbox('[Gmail]/B'), imap.setFlags('[Gmail]/A', '1', ['\\Seen'])]);
        }).then(() => {
          return imap.listMessages('[Gmail]/A', '1:1', ['flags']);
        }).then(messages => {
          expect(messages.length).to.equal(1);
          expect(messages[0].flags).to.deep.equal(['\\Seen']);
        });
      });
      it('should send precheck commands in correct order on concurrent calls', () => {
        return Promise.all([imap.setFlags('[Gmail]/A', '1', ['\\Seen']), imap.setFlags('[Gmail]/B', '1', ['\\Seen'])]).then(() => {
          return imap.listMessages('[Gmail]/A', '1:1', ['flags']);
        }).then(messages => {
          expect(messages.length).to.equal(1);
          expect(messages[0].flags).to.deep.equal(['\\Seen']);
        }).then(() => {
          return imap.listMessages('[Gmail]/B', '1:1', ['flags']);
        }).then(messages => {
          expect(messages.length).to.equal(1);
          expect(messages[0].flags).to.deep.equal(['\\Seen']);
        });
      });
    });
  });
  describe('Timeout', () => {
    beforeEach(() => {
      imap = new _index.default('127.0.0.1', port, {
        logLevel: _index.LOG_LEVEL_NONE,
        auth: {
          user: 'testuser',
          pass: 'testpass'
        },
        useSecureTransport: false
      });
      return imap.connect().then(() => {
        // remove the ondata event to simulate 100% packet loss and make the socket time out after 10ms
        imap.client.timeoutSocketLowerBound = 10;
        imap.client.timeoutSocketMultiplier = 0;

        imap.client.socket.ondata = () => {};
      });
    });
    it('should timeout', done => {
      imap.onerror = () => {
        done();
      };

      imap.selectMailbox('inbox').catch(() => {});
    });
    it('should reject all pending commands on timeout', () => {
      let rejectionCount = 0;
      return Promise.all([imap.selectMailbox('INBOX').catch(err => {
        expect(err).to.exist;
        rejectionCount++;
      }), imap.listMessages('INBOX', '1:*', ['body.peek[]']).catch(err => {
        expect(err).to.exist;
        rejectionCount++;
      })]).then(() => {
        expect(rejectionCount).to.equal(2);
      });
    });
  });
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9jbGllbnQtaW50ZWdyYXRpb24uanMiXSwibmFtZXMiOlsicHJvY2VzcyIsImVudiIsIk5PREVfVExTX1JFSkVDVF9VTkFVVEhPUklaRUQiLCJkZXNjcmliZSIsImltYXAiLCJwb3J0Iiwic2VydmVyIiwiYmVmb3JlRWFjaCIsImRvbmUiLCJvcHRpb25zIiwicGx1Z2lucyIsInNlY3VyZUNvbm5lY3Rpb24iLCJzdG9yYWdlIiwiSU5CT1giLCJtZXNzYWdlcyIsInJhdyIsImZsYWdzIiwidWlkIiwic2VwYXJhdG9yIiwiZm9sZGVycyIsIkRyYWZ0cyIsIkltcG9ydGFudCIsIlNwYW0iLCJTdGFycmVkIiwiVHJhc2giLCJBIiwiQiIsImxpc3RlbiIsImFmdGVyRWFjaCIsImNsb3NlIiwiaW5zZWN1cmVTZXJ2ZXIiLCJpdCIsIkltYXBDbGllbnQiLCJsb2dMZXZlbCIsImF1dGgiLCJ1c2VyIiwicGFzcyIsInVzZVNlY3VyZVRyYW5zcG9ydCIsImNvbm5lY3QiLCJ0aGVuIiwiZXhwZWN0IiwiY2xpZW50Iiwic2VjdXJlTW9kZSIsInRvIiwiYmUiLCJ0cnVlIiwiaWdub3JlVExTIiwiZmFsc2UiLCJyZXF1aXJlVExTIiwiY2F0Y2giLCJlcnIiLCJleGlzdCIsInNlbGVjdE1haWxib3giLCJsaXN0TWFpbGJveGVzIiwibWFpbGJveGVzIiwibGlzdE1lc3NhZ2VzIiwibm90IiwiZW1wdHkiLCJzdWJzY3JpYmVNYWlsYm94IiwicmVzcG9uc2UiLCJjb21tYW5kIiwiZXF1YWwiLCJ1bnN1YnNjcmliZU1haWxib3giLCJtc2dDb3VudCIsImxlbmd0aCIsInVwbG9hZCIsInNlYXJjaCIsImhlYWRlciIsInJlc3VsdCIsImRlZXAiLCJieVVpZCIsInNlZW4iLCJzZXRGbGFncyIsImFkZCIsInJlbW92ZSIsInNpbGVudCIsInN0b3JlIiwiaW5pdGlhbEluZm8iLCJleHB1bmdlTm90aWZpZWQiLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsIm9udXBkYXRlIiwibWIiLCJ0eXBlIiwiaW5mbyIsImRlbGV0ZU1lc3NhZ2VzIiwicmVzdWx0SW5mbyIsImV4aXN0cyIsImNvcHlNZXNzYWdlcyIsIm1vdmVNZXNzYWdlcyIsInF1ZXJ5IiwiZXhlYyIsInByZWNoZWNrIiwiRXJyb3IiLCJtZXNzYWdlIiwiYWxsIiwidGltZW91dFNvY2tldExvd2VyQm91bmQiLCJ0aW1lb3V0U29ja2V0TXVsdGlwbGllciIsInNvY2tldCIsIm9uZGF0YSIsIm9uZXJyb3IiLCJyZWplY3Rpb25Db3VudCJdLCJtYXBwaW5ncyI6Ijs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFMQTtBQU9BQSxPQUFPLENBQUNDLEdBQVIsQ0FBWUMsNEJBQVosR0FBMkMsR0FBM0M7QUFFQUMsUUFBUSxDQUFDLDhCQUFELEVBQWlDLE1BQU07QUFDN0MsTUFBSUMsSUFBSjtBQUNBLFFBQU1DLElBQUksR0FBRyxLQUFiO0FBQ0EsTUFBSUMsTUFBSjtBQUVBQyxFQUFBQSxVQUFVLENBQUVDLElBQUQsSUFBVTtBQUNuQjtBQUNBLFFBQUlDLE9BQU8sR0FBRztBQUNaO0FBQ0FDLE1BQUFBLE9BQU8sRUFBRSxDQUFDLFVBQUQsRUFBYSxZQUFiLENBRkc7QUFHWkMsTUFBQUEsZ0JBQWdCLEVBQUUsS0FITjtBQUlaQyxNQUFBQSxPQUFPLEVBQUU7QUFDUEMsUUFBQUEsS0FBSyxFQUFFO0FBQ0xDLFVBQUFBLFFBQVEsRUFBRSxDQUNSO0FBQUVDLFlBQUFBLEdBQUcsRUFBRTtBQUFQLFdBRFEsRUFFUjtBQUFFQSxZQUFBQSxHQUFHLEVBQUUsa0NBQVA7QUFBMkNDLFlBQUFBLEtBQUssRUFBRSxDQUFDLFFBQUQ7QUFBbEQsV0FGUSxFQUdSO0FBQUVELFlBQUFBLEdBQUcsRUFBRSxrQ0FBUDtBQUEyQ0UsWUFBQUEsR0FBRyxFQUFFO0FBQWhELFdBSFEsRUFJUjtBQUFFRixZQUFBQSxHQUFHLEVBQUU7QUFBUCxXQUpRLEVBS1I7QUFBRUEsWUFBQUEsR0FBRyxFQUFFLGtDQUFQO0FBQTJDQyxZQUFBQSxLQUFLLEVBQUUsQ0FBQyxTQUFELEVBQVksV0FBWixDQUFsRDtBQUE0RUMsWUFBQUEsR0FBRyxFQUFFO0FBQWpGLFdBTFEsRUFNUjtBQUFFRixZQUFBQSxHQUFHLEVBQUU7QUFBUCxXQU5RLEVBT1I7QUFBRUEsWUFBQUEsR0FBRyxFQUFFLGtDQUFQO0FBQTJDRSxZQUFBQSxHQUFHLEVBQUU7QUFBaEQsV0FQUTtBQURMLFNBREE7QUFZUCxZQUFJO0FBQ0ZDLFVBQUFBLFNBQVMsRUFBRSxHQURUO0FBRUZDLFVBQUFBLE9BQU8sRUFBRTtBQUNQLHVCQUFXO0FBQ1RILGNBQUFBLEtBQUssRUFBRSxDQUFDLFlBQUQsQ0FERTtBQUVURyxjQUFBQSxPQUFPLEVBQUU7QUFDUCw0QkFBWTtBQUFFLGlDQUFlO0FBQWpCLGlCQURMO0FBRVBDLGdCQUFBQSxNQUFNLEVBQUU7QUFBRSxpQ0FBZTtBQUFqQixpQkFGRDtBQUdQQyxnQkFBQUEsU0FBUyxFQUFFO0FBQUUsaUNBQWU7QUFBakIsaUJBSEo7QUFJUCw2QkFBYTtBQUFFLGlDQUFlO0FBQWpCLGlCQUpOO0FBS1BDLGdCQUFBQSxJQUFJLEVBQUU7QUFBRSxpQ0FBZTtBQUFqQixpQkFMQztBQU1QQyxnQkFBQUEsT0FBTyxFQUFFO0FBQUUsaUNBQWU7QUFBakIsaUJBTkY7QUFPUEMsZ0JBQUFBLEtBQUssRUFBRTtBQUFFLGlDQUFlO0FBQWpCLGlCQVBBO0FBUVBDLGdCQUFBQSxDQUFDLEVBQUU7QUFBRVgsa0JBQUFBLFFBQVEsRUFBRSxDQUFDLEVBQUQ7QUFBWixpQkFSSTtBQVNQWSxnQkFBQUEsQ0FBQyxFQUFFO0FBQUVaLGtCQUFBQSxRQUFRLEVBQUUsQ0FBQyxFQUFEO0FBQVo7QUFUSTtBQUZBO0FBREo7QUFGUDtBQVpHO0FBSkcsS0FBZDtBQXNDQVIsSUFBQUEsTUFBTSxHQUFHLDZCQUFXRyxPQUFYLENBQVQ7QUFDQUgsSUFBQUEsTUFBTSxDQUFDcUIsTUFBUCxDQUFjdEIsSUFBZCxFQUFvQkcsSUFBcEI7QUFDRCxHQTFDUyxDQUFWO0FBNENBb0IsRUFBQUEsU0FBUyxDQUFFcEIsSUFBRCxJQUFVO0FBQ2xCRixJQUFBQSxNQUFNLENBQUN1QixLQUFQLENBQWFyQixJQUFiO0FBQ0QsR0FGUSxDQUFUO0FBSUFMLEVBQUFBLFFBQVEsQ0FBQyxrQkFBRCxFQUFxQixNQUFNO0FBQ2pDLFFBQUkyQixjQUFKO0FBRUF2QixJQUFBQSxVQUFVLENBQUVDLElBQUQsSUFBVTtBQUNuQjtBQUNBLFVBQUlDLE9BQU8sR0FBRztBQUNaO0FBQ0FDLFFBQUFBLE9BQU8sRUFBRSxFQUZHO0FBR1pDLFFBQUFBLGdCQUFnQixFQUFFO0FBSE4sT0FBZDtBQU1BbUIsTUFBQUEsY0FBYyxHQUFHLDZCQUFXckIsT0FBWCxDQUFqQjtBQUNBcUIsTUFBQUEsY0FBYyxDQUFDSCxNQUFmLENBQXNCdEIsSUFBSSxHQUFHLENBQTdCLEVBQWdDRyxJQUFoQztBQUNELEtBVlMsQ0FBVjtBQVlBb0IsSUFBQUEsU0FBUyxDQUFFcEIsSUFBRCxJQUFVO0FBQ2xCc0IsTUFBQUEsY0FBYyxDQUFDRCxLQUFmLENBQXFCckIsSUFBckI7QUFDRCxLQUZRLENBQVQ7QUFJQXVCLElBQUFBLEVBQUUsQ0FBQyxnQ0FBRCxFQUFtQyxNQUFNO0FBQ3pDM0IsTUFBQUEsSUFBSSxHQUFHLElBQUk0QixjQUFKLENBQWUsV0FBZixFQUE0QjNCLElBQTVCLEVBQWtDO0FBQ3ZDNEIsUUFBQUEsUUFBUSxFQUFSQSxxQkFEdUM7QUFFdkNDLFFBQUFBLElBQUksRUFBRTtBQUNKQyxVQUFBQSxJQUFJLEVBQUUsVUFERjtBQUVKQyxVQUFBQSxJQUFJLEVBQUU7QUFGRixTQUZpQztBQU12Q0MsUUFBQUEsa0JBQWtCLEVBQUU7QUFObUIsT0FBbEMsQ0FBUDtBQVNBLGFBQU9qQyxJQUFJLENBQUNrQyxPQUFMLEdBQWVDLElBQWYsQ0FBb0IsTUFBTTtBQUMvQkMsUUFBQUEsTUFBTSxDQUFDcEMsSUFBSSxDQUFDcUMsTUFBTCxDQUFZQyxVQUFiLENBQU4sQ0FBK0JDLEVBQS9CLENBQWtDQyxFQUFsQyxDQUFxQ0MsSUFBckM7QUFDRCxPQUZNLEVBRUpOLElBRkksQ0FFQyxNQUFNO0FBQ1osZUFBT25DLElBQUksQ0FBQ3lCLEtBQUwsRUFBUDtBQUNELE9BSk0sQ0FBUDtBQUtELEtBZkMsQ0FBRjtBQWlCQUUsSUFBQUEsRUFBRSxDQUFDLHdCQUFELEVBQTJCLE1BQU07QUFDakMzQixNQUFBQSxJQUFJLEdBQUcsSUFBSTRCLGNBQUosQ0FBZSxXQUFmLEVBQTRCM0IsSUFBNUIsRUFBa0M7QUFDdkM0QixRQUFBQSxRQUFRLEVBQVJBLHFCQUR1QztBQUV2Q0MsUUFBQUEsSUFBSSxFQUFFO0FBQ0pDLFVBQUFBLElBQUksRUFBRSxVQURGO0FBRUpDLFVBQUFBLElBQUksRUFBRTtBQUZGLFNBRmlDO0FBTXZDQyxRQUFBQSxrQkFBa0IsRUFBRSxLQU5tQjtBQU92Q1MsUUFBQUEsU0FBUyxFQUFFO0FBUDRCLE9BQWxDLENBQVA7QUFVQSxhQUFPMUMsSUFBSSxDQUFDa0MsT0FBTCxHQUFlQyxJQUFmLENBQW9CLE1BQU07QUFDL0JDLFFBQUFBLE1BQU0sQ0FBQ3BDLElBQUksQ0FBQ3FDLE1BQUwsQ0FBWUMsVUFBYixDQUFOLENBQStCQyxFQUEvQixDQUFrQ0MsRUFBbEMsQ0FBcUNHLEtBQXJDO0FBQ0QsT0FGTSxFQUVKUixJQUZJLENBRUMsTUFBTTtBQUNaLGVBQU9uQyxJQUFJLENBQUN5QixLQUFMLEVBQVA7QUFDRCxPQUpNLENBQVA7QUFLRCxLQWhCQyxDQUFGO0FBa0JBRSxJQUFBQSxFQUFFLENBQUMsNkNBQUQsRUFBZ0QsTUFBTTtBQUN0RDNCLE1BQUFBLElBQUksR0FBRyxJQUFJNEIsY0FBSixDQUFlLFdBQWYsRUFBNEIzQixJQUFJLEdBQUcsQ0FBbkMsRUFBc0M7QUFDM0M0QixRQUFBQSxRQUFRLEVBQVJBLHFCQUQyQztBQUUzQ0MsUUFBQUEsSUFBSSxFQUFFO0FBQ0pDLFVBQUFBLElBQUksRUFBRSxVQURGO0FBRUpDLFVBQUFBLElBQUksRUFBRTtBQUZGLFNBRnFDO0FBTTNDQyxRQUFBQSxrQkFBa0IsRUFBRSxLQU51QjtBQU8zQ1csUUFBQUEsVUFBVSxFQUFFO0FBUCtCLE9BQXRDLENBQVA7QUFVQSxhQUFPNUMsSUFBSSxDQUFDa0MsT0FBTCxHQUFlVyxLQUFmLENBQXNCQyxHQUFELElBQVM7QUFDbkNWLFFBQUFBLE1BQU0sQ0FBQ1UsR0FBRCxDQUFOLENBQVlQLEVBQVosQ0FBZVEsS0FBZjtBQUNELE9BRk0sQ0FBUDtBQUdELEtBZEMsQ0FBRjtBQWdCQXBCLElBQUFBLEVBQUUsQ0FBQyxtQ0FBRCxFQUFzQyxNQUFNO0FBQzVDM0IsTUFBQUEsSUFBSSxHQUFHLElBQUk0QixjQUFKLENBQWUsV0FBZixFQUE0QjNCLElBQUksR0FBRyxDQUFuQyxFQUFzQztBQUMzQzRCLFFBQUFBLFFBQVEsRUFBUkEscUJBRDJDO0FBRTNDQyxRQUFBQSxJQUFJLEVBQUU7QUFDSkMsVUFBQUEsSUFBSSxFQUFFLFVBREY7QUFFSkMsVUFBQUEsSUFBSSxFQUFFO0FBRkYsU0FGcUM7QUFNM0NDLFFBQUFBLGtCQUFrQixFQUFFO0FBTnVCLE9BQXRDLENBQVA7QUFTQSxhQUFPakMsSUFBSSxDQUFDa0MsT0FBTCxHQUFlQyxJQUFmLENBQW9CLE1BQU07QUFDL0JDLFFBQUFBLE1BQU0sQ0FBQ3BDLElBQUksQ0FBQ3FDLE1BQUwsQ0FBWUMsVUFBYixDQUFOLENBQStCQyxFQUEvQixDQUFrQ0MsRUFBbEMsQ0FBcUNHLEtBQXJDO0FBQ0QsT0FGTSxFQUVKUixJQUZJLENBRUMsTUFBTTtBQUNaLGVBQU9uQyxJQUFJLENBQUN5QixLQUFMLEVBQVA7QUFDRCxPQUpNLENBQVA7QUFLRCxLQWZDLENBQUY7QUFpQkFFLElBQUFBLEVBQUUsQ0FBQyw0QkFBRCxFQUFnQ3ZCLElBQUQsSUFBVTtBQUN6Q0osTUFBQUEsSUFBSSxHQUFHLElBQUk0QixjQUFKLENBQWUsV0FBZixFQUE0QjNCLElBQUksR0FBRyxDQUFuQyxFQUFzQztBQUMzQzRCLFFBQUFBLFFBQVEsRUFBUkEscUJBRDJDO0FBRTNDQyxRQUFBQSxJQUFJLEVBQUU7QUFDSkMsVUFBQUEsSUFBSSxFQUFFLFNBREY7QUFFSkMsVUFBQUEsSUFBSSxFQUFFO0FBRkYsU0FGcUM7QUFNM0NDLFFBQUFBLGtCQUFrQixFQUFFO0FBTnVCLE9BQXRDLENBQVA7QUFTQWpDLE1BQUFBLElBQUksQ0FBQ2tDLE9BQUwsR0FBZUMsSUFBZixDQUFvQixNQUFNO0FBQ3hCQyxRQUFBQSxNQUFNLENBQUNwQyxJQUFJLENBQUNxQyxNQUFMLENBQVlDLFVBQWIsQ0FBTixDQUErQkMsRUFBL0IsQ0FBa0NDLEVBQWxDLENBQXFDRyxLQUFyQztBQUNELE9BRkQsRUFFR0UsS0FGSCxDQUVTLE1BQU07QUFBRXpDLFFBQUFBLElBQUk7QUFBSSxPQUZ6QjtBQUdELEtBYkMsQ0FBRjtBQWNELEdBckdPLENBQVI7QUF1R0FMLEVBQUFBLFFBQVEsQ0FBQyxrQkFBRCxFQUFxQixNQUFNO0FBQ2pDSSxJQUFBQSxVQUFVLENBQUMsTUFBTTtBQUNmSCxNQUFBQSxJQUFJLEdBQUcsSUFBSTRCLGNBQUosQ0FBZSxXQUFmLEVBQTRCM0IsSUFBNUIsRUFBa0M7QUFDdkM0QixRQUFBQSxRQUFRLEVBQVJBLHFCQUR1QztBQUV2Q0MsUUFBQUEsSUFBSSxFQUFFO0FBQ0pDLFVBQUFBLElBQUksRUFBRSxVQURGO0FBRUpDLFVBQUFBLElBQUksRUFBRTtBQUZGLFNBRmlDO0FBTXZDQyxRQUFBQSxrQkFBa0IsRUFBRTtBQU5tQixPQUFsQyxDQUFQO0FBU0EsYUFBT2pDLElBQUksQ0FBQ2tDLE9BQUwsR0FBZUMsSUFBZixDQUFvQixNQUFNO0FBQy9CLGVBQU9uQyxJQUFJLENBQUNnRCxhQUFMLENBQW1CLGNBQW5CLENBQVA7QUFDRCxPQUZNLENBQVA7QUFHRCxLQWJTLENBQVY7QUFlQXhCLElBQUFBLFNBQVMsQ0FBQyxNQUFNO0FBQ2QsYUFBT3hCLElBQUksQ0FBQ3lCLEtBQUwsRUFBUDtBQUNELEtBRlEsQ0FBVDtBQUlBMUIsSUFBQUEsUUFBUSxDQUFDLGdCQUFELEVBQW1CLE1BQU07QUFDL0I0QixNQUFBQSxFQUFFLENBQUMsZ0JBQUQsRUFBbUIsTUFBTTtBQUN6QixlQUFPM0IsSUFBSSxDQUFDaUQsYUFBTCxHQUFxQmQsSUFBckIsQ0FBMkJlLFNBQUQsSUFBZTtBQUM5Q2QsVUFBQUEsTUFBTSxDQUFDYyxTQUFELENBQU4sQ0FBa0JYLEVBQWxCLENBQXFCUSxLQUFyQjtBQUNELFNBRk0sQ0FBUDtBQUdELE9BSkMsQ0FBRjtBQUtELEtBTk8sQ0FBUjtBQVFBaEQsSUFBQUEsUUFBUSxDQUFDLGVBQUQsRUFBa0IsTUFBTTtBQUM5QjRCLE1BQUFBLEVBQUUsQ0FBQyxnQkFBRCxFQUFtQixNQUFNO0FBQ3pCLGVBQU8zQixJQUFJLENBQUNtRCxZQUFMLENBQWtCLE9BQWxCLEVBQTJCLEtBQTNCLEVBQWtDLENBQUMsS0FBRCxFQUFRLE9BQVIsRUFBaUIsVUFBakIsRUFBNkIsZUFBN0IsRUFBOEMsYUFBOUMsQ0FBbEMsRUFBZ0doQixJQUFoRyxDQUFzR3pCLFFBQUQsSUFBYztBQUN4SDBCLFVBQUFBLE1BQU0sQ0FBQzFCLFFBQUQsQ0FBTixDQUFpQjZCLEVBQWpCLENBQW9CYSxHQUFwQixDQUF3QlosRUFBeEIsQ0FBMkJhLEtBQTNCO0FBQ0QsU0FGTSxDQUFQO0FBR0QsT0FKQyxDQUFGO0FBS0QsS0FOTyxDQUFSO0FBUUF0RCxJQUFBQSxRQUFRLENBQUMsWUFBRCxFQUFlLE1BQU07QUFDM0I0QixNQUFBQSxFQUFFLENBQUMsZ0JBQUQsRUFBbUIsTUFBTTtBQUN6QixlQUFPM0IsSUFBSSxDQUFDc0QsZ0JBQUwsQ0FBc0IsT0FBdEIsRUFBK0JuQixJQUEvQixDQUFvQ29CLFFBQVEsSUFBSTtBQUNyRG5CLFVBQUFBLE1BQU0sQ0FBQ21CLFFBQVEsQ0FBQ0MsT0FBVixDQUFOLENBQXlCakIsRUFBekIsQ0FBNEJrQixLQUE1QixDQUFrQyxJQUFsQztBQUNELFNBRk0sQ0FBUDtBQUdELE9BSkMsQ0FBRjtBQUtELEtBTk8sQ0FBUjtBQVFBMUQsSUFBQUEsUUFBUSxDQUFDLGNBQUQsRUFBaUIsTUFBTTtBQUM3QjRCLE1BQUFBLEVBQUUsQ0FBQyxnQkFBRCxFQUFtQixNQUFNO0FBQ3pCLGVBQU8zQixJQUFJLENBQUMwRCxrQkFBTCxDQUF3QixPQUF4QixFQUFpQ3ZCLElBQWpDLENBQXNDb0IsUUFBUSxJQUFJO0FBQ3ZEbkIsVUFBQUEsTUFBTSxDQUFDbUIsUUFBUSxDQUFDQyxPQUFWLENBQU4sQ0FBeUJqQixFQUF6QixDQUE0QmtCLEtBQTVCLENBQWtDLElBQWxDO0FBQ0QsU0FGTSxDQUFQO0FBR0QsT0FKQyxDQUFGO0FBS0QsS0FOTyxDQUFSO0FBUUExRCxJQUFBQSxRQUFRLENBQUMsU0FBRCxFQUFZLE1BQU07QUFDeEI0QixNQUFBQSxFQUFFLENBQUMsZ0JBQUQsRUFBbUIsTUFBTTtBQUN6QixZQUFJZ0MsUUFBSjtBQUVBLGVBQU8zRCxJQUFJLENBQUNtRCxZQUFMLENBQWtCLE9BQWxCLEVBQTJCLEtBQTNCLEVBQWtDLENBQUMsS0FBRCxFQUFRLE9BQVIsRUFBaUIsVUFBakIsRUFBNkIsZUFBN0IsQ0FBbEMsRUFBaUZoQixJQUFqRixDQUF1RnpCLFFBQUQsSUFBYztBQUN6RzBCLFVBQUFBLE1BQU0sQ0FBQzFCLFFBQUQsQ0FBTixDQUFpQjZCLEVBQWpCLENBQW9CYSxHQUFwQixDQUF3QlosRUFBeEIsQ0FBMkJhLEtBQTNCO0FBQ0FNLFVBQUFBLFFBQVEsR0FBR2pELFFBQVEsQ0FBQ2tELE1BQXBCO0FBQ0QsU0FITSxFQUdKekIsSUFISSxDQUdDLE1BQU07QUFDWixpQkFBT25DLElBQUksQ0FBQzZELE1BQUwsQ0FBWSxPQUFaLEVBQXFCLDBUQUFyQixFQUFpVjtBQUN0VmpELFlBQUFBLEtBQUssRUFBRSxDQUFDLFFBQUQsRUFBVyxZQUFYLEVBQXlCLFdBQXpCO0FBRCtVLFdBQWpWLENBQVA7QUFHRCxTQVBNLEVBT0p1QixJQVBJLENBT0MsTUFBTTtBQUNaLGlCQUFPbkMsSUFBSSxDQUFDbUQsWUFBTCxDQUFrQixPQUFsQixFQUEyQixLQUEzQixFQUFrQyxDQUFDLEtBQUQsRUFBUSxPQUFSLEVBQWlCLFVBQWpCLEVBQTZCLGVBQTdCLENBQWxDLENBQVA7QUFDRCxTQVRNLEVBU0poQixJQVRJLENBU0V6QixRQUFELElBQWM7QUFDcEIwQixVQUFBQSxNQUFNLENBQUMxQixRQUFRLENBQUNrRCxNQUFWLENBQU4sQ0FBd0JyQixFQUF4QixDQUEyQmtCLEtBQTNCLENBQWlDRSxRQUFRLEdBQUcsQ0FBNUM7QUFDRCxTQVhNLENBQVA7QUFZRCxPQWZDLENBQUY7QUFnQkQsS0FqQk8sQ0FBUjtBQW1CQTVELElBQUFBLFFBQVEsQ0FBQyxTQUFELEVBQVksTUFBTTtBQUN4QjRCLE1BQUFBLEVBQUUsQ0FBQyxpQ0FBRCxFQUFvQyxNQUFNO0FBQzFDLGVBQU8zQixJQUFJLENBQUM4RCxNQUFMLENBQVksT0FBWixFQUFxQjtBQUMxQkMsVUFBQUEsTUFBTSxFQUFFLENBQUMsU0FBRCxFQUFZLFNBQVo7QUFEa0IsU0FBckIsRUFFSjVCLElBRkksQ0FFRTZCLE1BQUQsSUFBWTtBQUNsQjVCLFVBQUFBLE1BQU0sQ0FBQzRCLE1BQUQsQ0FBTixDQUFlekIsRUFBZixDQUFrQjBCLElBQWxCLENBQXVCUixLQUF2QixDQUE2QixDQUFDLENBQUQsQ0FBN0I7QUFDRCxTQUpNLENBQVA7QUFLRCxPQU5DLENBQUY7QUFRQTlCLE1BQUFBLEVBQUUsQ0FBQyxzQkFBRCxFQUF5QixNQUFNO0FBQy9CLGVBQU8zQixJQUFJLENBQUM4RCxNQUFMLENBQVksT0FBWixFQUFxQjtBQUMxQkMsVUFBQUEsTUFBTSxFQUFFLENBQUMsU0FBRCxFQUFZLFNBQVo7QUFEa0IsU0FBckIsRUFFSjtBQUNERyxVQUFBQSxLQUFLLEVBQUU7QUFETixTQUZJLEVBSUovQixJQUpJLENBSUU2QixNQUFELElBQVk7QUFDbEI1QixVQUFBQSxNQUFNLENBQUM0QixNQUFELENBQU4sQ0FBZXpCLEVBQWYsQ0FBa0IwQixJQUFsQixDQUF1QlIsS0FBdkIsQ0FBNkIsQ0FBQyxHQUFELENBQTdCO0FBQ0QsU0FOTSxDQUFQO0FBT0QsT0FSQyxDQUFGO0FBVUE5QixNQUFBQSxFQUFFLENBQUMsa0NBQUQsRUFBcUMsTUFBTTtBQUMzQyxlQUFPM0IsSUFBSSxDQUFDOEQsTUFBTCxDQUFZLE9BQVosRUFBcUI7QUFDMUJDLFVBQUFBLE1BQU0sRUFBRSxDQUFDLFNBQUQsRUFBWSxPQUFaLENBRGtCO0FBRTFCSSxVQUFBQSxJQUFJLEVBQUU7QUFGb0IsU0FBckIsRUFHSmhDLElBSEksQ0FHRTZCLE1BQUQsSUFBWTtBQUNsQjVCLFVBQUFBLE1BQU0sQ0FBQzRCLE1BQUQsQ0FBTixDQUFlekIsRUFBZixDQUFrQjBCLElBQWxCLENBQXVCUixLQUF2QixDQUE2QixDQUFDLENBQUQsQ0FBN0I7QUFDRCxTQUxNLENBQVA7QUFNRCxPQVBDLENBQUY7QUFRRCxLQTNCTyxDQUFSO0FBNkJBMUQsSUFBQUEsUUFBUSxDQUFDLFdBQUQsRUFBYyxNQUFNO0FBQzFCNEIsTUFBQUEsRUFBRSxDQUFDLGdDQUFELEVBQW1DLE1BQU07QUFDekMsZUFBTzNCLElBQUksQ0FBQ29FLFFBQUwsQ0FBYyxPQUFkLEVBQXVCLEdBQXZCLEVBQTRCLENBQUMsUUFBRCxFQUFXLFNBQVgsQ0FBNUIsRUFBbURqQyxJQUFuRCxDQUF5RDZCLE1BQUQsSUFBWTtBQUN6RTVCLFVBQUFBLE1BQU0sQ0FBQzRCLE1BQUQsQ0FBTixDQUFlekIsRUFBZixDQUFrQjBCLElBQWxCLENBQXVCUixLQUF2QixDQUE2QixDQUFDO0FBQzVCLGlCQUFLLENBRHVCO0FBRTVCN0MsWUFBQUEsS0FBSyxFQUFFLENBQUMsUUFBRCxFQUFXLFNBQVg7QUFGcUIsV0FBRCxDQUE3QjtBQUlELFNBTE0sQ0FBUDtBQU1ELE9BUEMsQ0FBRjtBQVNBZSxNQUFBQSxFQUFFLENBQUMsK0JBQUQsRUFBa0MsTUFBTTtBQUN4QyxlQUFPM0IsSUFBSSxDQUFDb0UsUUFBTCxDQUFjLE9BQWQsRUFBdUIsR0FBdkIsRUFBNEI7QUFDakNDLFVBQUFBLEdBQUcsRUFBRSxDQUFDLFNBQUQ7QUFENEIsU0FBNUIsRUFFSmxDLElBRkksQ0FFRTZCLE1BQUQsSUFBWTtBQUNsQjVCLFVBQUFBLE1BQU0sQ0FBQzRCLE1BQUQsQ0FBTixDQUFlekIsRUFBZixDQUFrQjBCLElBQWxCLENBQXVCUixLQUF2QixDQUE2QixDQUFDO0FBQzVCLGlCQUFLLENBRHVCO0FBRTVCN0MsWUFBQUEsS0FBSyxFQUFFLENBQUMsUUFBRCxFQUFXLFNBQVg7QUFGcUIsV0FBRCxDQUE3QjtBQUlELFNBUE0sQ0FBUDtBQVFELE9BVEMsQ0FBRjtBQVdBZSxNQUFBQSxFQUFFLENBQUMsb0NBQUQsRUFBdUMsTUFBTTtBQUM3QyxlQUFPM0IsSUFBSSxDQUFDb0UsUUFBTCxDQUFjLE9BQWQsRUFBdUIsS0FBdkIsRUFBOEI7QUFDbkNFLFVBQUFBLE1BQU0sRUFBRSxDQUFDLFdBQUQ7QUFEMkIsU0FBOUIsRUFFSjtBQUNESixVQUFBQSxLQUFLLEVBQUU7QUFETixTQUZJLEVBSUovQixJQUpJLENBSUU2QixNQUFELElBQVk7QUFDbEI1QixVQUFBQSxNQUFNLENBQUM0QixNQUFELENBQU4sQ0FBZXpCLEVBQWYsQ0FBa0IwQixJQUFsQixDQUF1QlIsS0FBdkIsQ0FBNkIsQ0FBQztBQUM1QixpQkFBSyxDQUR1QjtBQUU1QjdDLFlBQUFBLEtBQUssRUFBRSxDQUFDLFNBQUQsQ0FGcUI7QUFHNUJDLFlBQUFBLEdBQUcsRUFBRTtBQUh1QixXQUFELENBQTdCO0FBS0QsU0FWTSxDQUFQO0FBV0QsT0FaQyxDQUFGO0FBY0FjLE1BQUFBLEVBQUUsQ0FBQywyQ0FBRCxFQUE4QyxNQUFNO0FBQ3BELGVBQU8zQixJQUFJLENBQUNvRSxRQUFMLENBQWMsT0FBZCxFQUF1QixHQUF2QixFQUE0QixDQUFDLFVBQUQsQ0FBNUIsRUFBMEM7QUFDL0NHLFVBQUFBLE1BQU0sRUFBRTtBQUR1QyxTQUExQyxFQUVKcEMsSUFGSSxDQUVFNkIsTUFBRCxJQUFZO0FBQ2xCNUIsVUFBQUEsTUFBTSxDQUFDNEIsTUFBRCxDQUFOLENBQWV6QixFQUFmLENBQWtCMEIsSUFBbEIsQ0FBdUJSLEtBQXZCLENBQTZCLEVBQTdCO0FBQ0QsU0FKTSxDQUFQO0FBS0QsT0FOQyxDQUFGO0FBT0QsS0ExQ08sQ0FBUjtBQTRDQTFELElBQUFBLFFBQVEsQ0FBQyxRQUFELEVBQVcsTUFBTTtBQUN2QjRCLE1BQUFBLEVBQUUsQ0FBQyxpQ0FBRCxFQUFvQyxNQUFNO0FBQzFDLGVBQU8zQixJQUFJLENBQUN3RSxLQUFMLENBQVcsT0FBWCxFQUFvQixHQUFwQixFQUF5QixjQUF6QixFQUF5QyxDQUFDLFFBQUQsRUFBVyxRQUFYLENBQXpDLEVBQStEckMsSUFBL0QsQ0FBcUU2QixNQUFELElBQVk7QUFDckY1QixVQUFBQSxNQUFNLENBQUM0QixNQUFELENBQU4sQ0FBZXpCLEVBQWYsQ0FBa0IwQixJQUFsQixDQUF1QlIsS0FBdkIsQ0FBNkIsQ0FBQztBQUM1QixpQkFBSyxDQUR1QjtBQUU1QiwyQkFBZSxDQUFDLFNBQUQsRUFBWSxRQUFaLEVBQXNCLFFBQXRCO0FBRmEsV0FBRCxDQUE3QjtBQUlELFNBTE0sQ0FBUDtBQU1ELE9BUEMsQ0FBRjtBQVNBOUIsTUFBQUEsRUFBRSxDQUFDLGlDQUFELEVBQW9DLE1BQU07QUFDMUMsZUFBTzNCLElBQUksQ0FBQ3dFLEtBQUwsQ0FBVyxPQUFYLEVBQW9CLEdBQXBCLEVBQXlCLGFBQXpCLEVBQXdDLENBQUMsUUFBRCxFQUFXLFFBQVgsQ0FBeEMsRUFBOERyQyxJQUE5RCxDQUFvRTZCLE1BQUQsSUFBWTtBQUNwRjVCLFVBQUFBLE1BQU0sQ0FBQzRCLE1BQUQsQ0FBTixDQUFlekIsRUFBZixDQUFrQjBCLElBQWxCLENBQXVCUixLQUF2QixDQUE2QixDQUFDO0FBQzVCLGlCQUFLLENBRHVCO0FBRTVCLDJCQUFlLENBQUMsUUFBRCxFQUFXLFFBQVg7QUFGYSxXQUFELENBQTdCO0FBSUQsU0FMTSxDQUFQO0FBTUQsT0FQQyxDQUFGO0FBU0E5QixNQUFBQSxFQUFFLENBQUMscUNBQUQsRUFBd0MsTUFBTTtBQUM5QyxlQUFPM0IsSUFBSSxDQUFDd0UsS0FBTCxDQUFXLE9BQVgsRUFBb0IsR0FBcEIsRUFBeUIsY0FBekIsRUFBeUMsQ0FBQyxRQUFELEVBQVcsU0FBWCxDQUF6QyxFQUFnRXJDLElBQWhFLENBQXNFNkIsTUFBRCxJQUFZO0FBQ3RGNUIsVUFBQUEsTUFBTSxDQUFDNEIsTUFBRCxDQUFOLENBQWV6QixFQUFmLENBQWtCMEIsSUFBbEIsQ0FBdUJSLEtBQXZCLENBQTZCLENBQUM7QUFDNUIsaUJBQUssQ0FEdUI7QUFFNUIsMkJBQWU7QUFGYSxXQUFELENBQTdCO0FBSUQsU0FMTSxDQUFQO0FBTUQsT0FQQyxDQUFGO0FBUUQsS0EzQk8sQ0FBUjtBQTZCQTFELElBQUFBLFFBQVEsQ0FBQyxpQkFBRCxFQUFvQixNQUFNO0FBQ2hDNEIsTUFBQUEsRUFBRSxDQUFDLHlCQUFELEVBQTRCLE1BQU07QUFDbEMsWUFBSThDLFdBQUo7QUFFQSxZQUFJQyxlQUFlLEdBQUcsSUFBSUMsT0FBSixDQUFZLENBQUNDLE9BQUQsRUFBVUMsTUFBVixLQUFxQjtBQUNyRDdFLFVBQUFBLElBQUksQ0FBQzhFLFFBQUwsR0FBZ0IsVUFBVUMsRUFBVixFQUFjQztBQUFLO0FBQW5CLFlBQWdDO0FBQzlDLGdCQUFJO0FBQ0Y1QyxjQUFBQSxNQUFNLENBQUMyQyxFQUFELENBQU4sQ0FBV3hDLEVBQVgsQ0FBY2tCLEtBQWQsQ0FBb0IsT0FBcEI7QUFDQXJCLGNBQUFBLE1BQU0sQ0FBQzRDLElBQUQsQ0FBTixDQUFhekMsRUFBYixDQUFnQmtCLEtBQWhCLENBQXNCLFNBQXRCO0FBQ0FtQixjQUFBQSxPQUFPO0FBQ1IsYUFKRCxDQUlFLE9BQU85QixHQUFQLEVBQVk7QUFDWitCLGNBQUFBLE1BQU0sQ0FBQy9CLEdBQUQsQ0FBTjtBQUNEO0FBQ0YsV0FSRDtBQVNELFNBVnFCLENBQXRCO0FBWUEsZUFBTzlDLElBQUksQ0FBQ2dELGFBQUwsQ0FBbUIsT0FBbkIsRUFBNEJiLElBQTVCLENBQWtDOEMsSUFBRCxJQUFVO0FBQ2hEUixVQUFBQSxXQUFXLEdBQUdRLElBQWQ7QUFDQSxpQkFBT2pGLElBQUksQ0FBQ2tGLGNBQUwsQ0FBb0IsT0FBcEIsRUFBNkIsR0FBN0IsRUFBa0M7QUFDdkNoQixZQUFBQSxLQUFLLEVBQUU7QUFEZ0MsV0FBbEMsQ0FBUDtBQUdELFNBTE0sRUFLSi9CLElBTEksQ0FLQyxNQUFNO0FBQ1osaUJBQU9uQyxJQUFJLENBQUNnRCxhQUFMLENBQW1CLE9BQW5CLENBQVA7QUFDRCxTQVBNLEVBT0piLElBUEksQ0FPRWdELFVBQUQsSUFBZ0I7QUFDdEIvQyxVQUFBQSxNQUFNLENBQUNxQyxXQUFXLENBQUNXLE1BQVosR0FBcUIsQ0FBckIsS0FBMkJELFVBQVUsQ0FBQ0MsTUFBdkMsQ0FBTixDQUFxRDdDLEVBQXJELENBQXdEQyxFQUF4RCxDQUEyREMsSUFBM0Q7QUFDRCxTQVRNLEVBU0pOLElBVEksQ0FTQyxNQUFNdUMsZUFUUCxDQUFQO0FBVUQsT0F6QkMsQ0FBRjtBQTBCRCxLQTNCTyxDQUFSO0FBNkJBM0UsSUFBQUEsUUFBUSxDQUFDLGVBQUQsRUFBa0IsTUFBTTtBQUM5QjRCLE1BQUFBLEVBQUUsQ0FBQyx1QkFBRCxFQUEwQixNQUFNO0FBQ2hDLGVBQU8zQixJQUFJLENBQUNxRixZQUFMLENBQWtCLE9BQWxCLEVBQTJCLEdBQTNCLEVBQWdDLGVBQWhDLEVBQWlEO0FBQ3REbkIsVUFBQUEsS0FBSyxFQUFFO0FBRCtDLFNBQWpELEVBRUovQixJQUZJLENBRUMsTUFBTTtBQUNaLGlCQUFPbkMsSUFBSSxDQUFDZ0QsYUFBTCxDQUFtQixlQUFuQixDQUFQO0FBQ0QsU0FKTSxFQUlKYixJQUpJLENBSUU4QyxJQUFELElBQVU7QUFDaEI3QyxVQUFBQSxNQUFNLENBQUM2QyxJQUFJLENBQUNHLE1BQU4sQ0FBTixDQUFvQjdDLEVBQXBCLENBQXVCa0IsS0FBdkIsQ0FBNkIsQ0FBN0I7QUFDRCxTQU5NLENBQVA7QUFPRCxPQVJDLENBQUY7QUFTRCxLQVZPLENBQVI7QUFZQTFELElBQUFBLFFBQVEsQ0FBQyxlQUFELEVBQWtCLE1BQU07QUFDOUI0QixNQUFBQSxFQUFFLENBQUMsdUJBQUQsRUFBMEIsTUFBTTtBQUNoQyxZQUFJOEMsV0FBSjtBQUNBLGVBQU96RSxJQUFJLENBQUNnRCxhQUFMLENBQW1CLE9BQW5CLEVBQTRCYixJQUE1QixDQUFrQzhDLElBQUQsSUFBVTtBQUNoRFIsVUFBQUEsV0FBVyxHQUFHUSxJQUFkO0FBQ0EsaUJBQU9qRixJQUFJLENBQUNzRixZQUFMLENBQWtCLE9BQWxCLEVBQTJCLEdBQTNCLEVBQWdDLGNBQWhDLEVBQWdEO0FBQ3JEcEIsWUFBQUEsS0FBSyxFQUFFO0FBRDhDLFdBQWhELENBQVA7QUFHRCxTQUxNLEVBS0ovQixJQUxJLENBS0MsTUFBTTtBQUNaLGlCQUFPbkMsSUFBSSxDQUFDZ0QsYUFBTCxDQUFtQixjQUFuQixDQUFQO0FBQ0QsU0FQTSxFQU9KYixJQVBJLENBT0U4QyxJQUFELElBQVU7QUFDaEI3QyxVQUFBQSxNQUFNLENBQUM2QyxJQUFJLENBQUNHLE1BQU4sQ0FBTixDQUFvQjdDLEVBQXBCLENBQXVCa0IsS0FBdkIsQ0FBNkIsQ0FBN0I7QUFDQSxpQkFBT3pELElBQUksQ0FBQ2dELGFBQUwsQ0FBbUIsT0FBbkIsQ0FBUDtBQUNELFNBVk0sRUFVSmIsSUFWSSxDQVVFZ0QsVUFBRCxJQUFnQjtBQUN0Qi9DLFVBQUFBLE1BQU0sQ0FBQ3FDLFdBQVcsQ0FBQ1csTUFBYixDQUFOLENBQTJCN0MsRUFBM0IsQ0FBOEJhLEdBQTlCLENBQWtDSyxLQUFsQyxDQUF3QzBCLFVBQVUsQ0FBQ0MsTUFBbkQ7QUFDRCxTQVpNLENBQVA7QUFhRCxPQWZDLENBQUY7QUFnQkQsS0FqQk8sQ0FBUjtBQW1CQXJGLElBQUFBLFFBQVEsQ0FBQyxVQUFELEVBQWEsTUFBTTtBQUN6QjRCLE1BQUFBLEVBQUUsQ0FBQyx3Q0FBRCxFQUEyQyxNQUFNO0FBQ2pEO0FBQ0EsWUFBSW1DLE1BQU0sR0FBRyxDQUFDeUIsS0FBRCxFQUFRbEYsT0FBTyxHQUFHLEVBQWxCLEtBQXlCO0FBQ3BDLGNBQUltRCxPQUFPLEdBQUcsd0NBQW1CK0IsS0FBbkIsRUFBMEJsRixPQUExQixDQUFkO0FBQ0EsaUJBQU9MLElBQUksQ0FBQ3dGLElBQUwsQ0FBVWhDLE9BQVYsRUFBbUIsUUFBbkIsRUFBNkI7QUFDbENpQyxZQUFBQSxRQUFRLEVBQUUsTUFBTWQsT0FBTyxDQUFDRSxNQUFSLENBQWUsSUFBSWEsS0FBSixDQUFVLEtBQVYsQ0FBZjtBQURrQixXQUE3QixFQUVKdkQsSUFGSSxDQUVFb0IsUUFBRCxJQUFjLGdDQUFZQSxRQUFaLENBRmYsQ0FBUDtBQUdELFNBTEQ7O0FBT0EsZUFBT3ZELElBQUksQ0FBQ2dELGFBQUwsQ0FBbUIsT0FBbkIsRUFDSmIsSUFESSxDQUNDLE1BQU0yQixNQUFNLENBQUM7QUFBRUMsVUFBQUEsTUFBTSxFQUFFLENBQUMsU0FBRCxFQUFZLFNBQVo7QUFBVixTQUFELENBRGIsRUFFSmxCLEtBRkksQ0FFR0MsR0FBRCxJQUFTO0FBQ2RWLFVBQUFBLE1BQU0sQ0FBQ1UsR0FBRyxDQUFDNkMsT0FBTCxDQUFOLENBQW9CcEQsRUFBcEIsQ0FBdUJrQixLQUF2QixDQUE2QixLQUE3QjtBQUNBLGlCQUFPekQsSUFBSSxDQUFDZ0QsYUFBTCxDQUFtQixjQUFuQixDQUFQO0FBQ0QsU0FMSSxDQUFQO0FBTUQsT0FmQyxDQUFGO0FBaUJBckIsTUFBQUEsRUFBRSxDQUFDLGtFQUFELEVBQXFFLE1BQU07QUFDM0UsZUFBTzNCLElBQUksQ0FBQ2dELGFBQUwsQ0FBbUIsV0FBbkIsRUFBZ0NiLElBQWhDLENBQXFDLE1BQU07QUFDaEQsaUJBQU93QyxPQUFPLENBQUNpQixHQUFSLENBQVksQ0FDakI1RixJQUFJLENBQUNnRCxhQUFMLENBQW1CLFdBQW5CLENBRGlCLEVBRWpCaEQsSUFBSSxDQUFDb0UsUUFBTCxDQUFjLFdBQWQsRUFBMkIsR0FBM0IsRUFBZ0MsQ0FBQyxRQUFELENBQWhDLENBRmlCLENBQVosQ0FBUDtBQUlELFNBTE0sRUFLSmpDLElBTEksQ0FLQyxNQUFNO0FBQ1osaUJBQU9uQyxJQUFJLENBQUNtRCxZQUFMLENBQWtCLFdBQWxCLEVBQStCLEtBQS9CLEVBQXNDLENBQUMsT0FBRCxDQUF0QyxDQUFQO0FBQ0QsU0FQTSxFQU9KaEIsSUFQSSxDQU9FekIsUUFBRCxJQUFjO0FBQ3BCMEIsVUFBQUEsTUFBTSxDQUFDMUIsUUFBUSxDQUFDa0QsTUFBVixDQUFOLENBQXdCckIsRUFBeEIsQ0FBMkJrQixLQUEzQixDQUFpQyxDQUFqQztBQUNBckIsVUFBQUEsTUFBTSxDQUFDMUIsUUFBUSxDQUFDLENBQUQsQ0FBUixDQUFZRSxLQUFiLENBQU4sQ0FBMEIyQixFQUExQixDQUE2QjBCLElBQTdCLENBQWtDUixLQUFsQyxDQUF3QyxDQUFDLFFBQUQsQ0FBeEM7QUFDRCxTQVZNLENBQVA7QUFXRCxPQVpDLENBQUY7QUFjQTlCLE1BQUFBLEVBQUUsQ0FBQyxvRUFBRCxFQUF1RSxNQUFNO0FBQzdFLGVBQU9nRCxPQUFPLENBQUNpQixHQUFSLENBQVksQ0FDakI1RixJQUFJLENBQUNvRSxRQUFMLENBQWMsV0FBZCxFQUEyQixHQUEzQixFQUFnQyxDQUFDLFFBQUQsQ0FBaEMsQ0FEaUIsRUFFakJwRSxJQUFJLENBQUNvRSxRQUFMLENBQWMsV0FBZCxFQUEyQixHQUEzQixFQUFnQyxDQUFDLFFBQUQsQ0FBaEMsQ0FGaUIsQ0FBWixFQUdKakMsSUFISSxDQUdDLE1BQU07QUFDWixpQkFBT25DLElBQUksQ0FBQ21ELFlBQUwsQ0FBa0IsV0FBbEIsRUFBK0IsS0FBL0IsRUFBc0MsQ0FBQyxPQUFELENBQXRDLENBQVA7QUFDRCxTQUxNLEVBS0poQixJQUxJLENBS0V6QixRQUFELElBQWM7QUFDcEIwQixVQUFBQSxNQUFNLENBQUMxQixRQUFRLENBQUNrRCxNQUFWLENBQU4sQ0FBd0JyQixFQUF4QixDQUEyQmtCLEtBQTNCLENBQWlDLENBQWpDO0FBQ0FyQixVQUFBQSxNQUFNLENBQUMxQixRQUFRLENBQUMsQ0FBRCxDQUFSLENBQVlFLEtBQWIsQ0FBTixDQUEwQjJCLEVBQTFCLENBQTZCMEIsSUFBN0IsQ0FBa0NSLEtBQWxDLENBQXdDLENBQUMsUUFBRCxDQUF4QztBQUNELFNBUk0sRUFRSnRCLElBUkksQ0FRQyxNQUFNO0FBQ1osaUJBQU9uQyxJQUFJLENBQUNtRCxZQUFMLENBQWtCLFdBQWxCLEVBQStCLEtBQS9CLEVBQXNDLENBQUMsT0FBRCxDQUF0QyxDQUFQO0FBQ0QsU0FWTSxFQVVKaEIsSUFWSSxDQVVFekIsUUFBRCxJQUFjO0FBQ3BCMEIsVUFBQUEsTUFBTSxDQUFDMUIsUUFBUSxDQUFDa0QsTUFBVixDQUFOLENBQXdCckIsRUFBeEIsQ0FBMkJrQixLQUEzQixDQUFpQyxDQUFqQztBQUNBckIsVUFBQUEsTUFBTSxDQUFDMUIsUUFBUSxDQUFDLENBQUQsQ0FBUixDQUFZRSxLQUFiLENBQU4sQ0FBMEIyQixFQUExQixDQUE2QjBCLElBQTdCLENBQWtDUixLQUFsQyxDQUF3QyxDQUFDLFFBQUQsQ0FBeEM7QUFDRCxTQWJNLENBQVA7QUFjRCxPQWZDLENBQUY7QUFnQkQsS0FoRE8sQ0FBUjtBQWlERCxHQTFSTyxDQUFSO0FBNFJBMUQsRUFBQUEsUUFBUSxDQUFDLFNBQUQsRUFBWSxNQUFNO0FBQ3hCSSxJQUFBQSxVQUFVLENBQUMsTUFBTTtBQUNmSCxNQUFBQSxJQUFJLEdBQUcsSUFBSTRCLGNBQUosQ0FBZSxXQUFmLEVBQTRCM0IsSUFBNUIsRUFBa0M7QUFDdkM0QixRQUFBQSxRQUFRLEVBQVJBLHFCQUR1QztBQUV2Q0MsUUFBQUEsSUFBSSxFQUFFO0FBQ0pDLFVBQUFBLElBQUksRUFBRSxVQURGO0FBRUpDLFVBQUFBLElBQUksRUFBRTtBQUZGLFNBRmlDO0FBTXZDQyxRQUFBQSxrQkFBa0IsRUFBRTtBQU5tQixPQUFsQyxDQUFQO0FBU0EsYUFBT2pDLElBQUksQ0FBQ2tDLE9BQUwsR0FDSkMsSUFESSxDQUNDLE1BQU07QUFDVjtBQUNBbkMsUUFBQUEsSUFBSSxDQUFDcUMsTUFBTCxDQUFZd0QsdUJBQVosR0FBc0MsRUFBdEM7QUFDQTdGLFFBQUFBLElBQUksQ0FBQ3FDLE1BQUwsQ0FBWXlELHVCQUFaLEdBQXNDLENBQXRDOztBQUNBOUYsUUFBQUEsSUFBSSxDQUFDcUMsTUFBTCxDQUFZMEQsTUFBWixDQUFtQkMsTUFBbkIsR0FBNEIsTUFBTSxDQUFHLENBQXJDO0FBQ0QsT0FOSSxDQUFQO0FBT0QsS0FqQlMsQ0FBVjtBQW1CQXJFLElBQUFBLEVBQUUsQ0FBQyxnQkFBRCxFQUFvQnZCLElBQUQsSUFBVTtBQUM3QkosTUFBQUEsSUFBSSxDQUFDaUcsT0FBTCxHQUFlLE1BQU07QUFBRTdGLFFBQUFBLElBQUk7QUFBSSxPQUEvQjs7QUFDQUosTUFBQUEsSUFBSSxDQUFDZ0QsYUFBTCxDQUFtQixPQUFuQixFQUE0QkgsS0FBNUIsQ0FBa0MsTUFBTSxDQUFFLENBQTFDO0FBQ0QsS0FIQyxDQUFGO0FBS0FsQixJQUFBQSxFQUFFLENBQUMsK0NBQUQsRUFBa0QsTUFBTTtBQUN4RCxVQUFJdUUsY0FBYyxHQUFHLENBQXJCO0FBQ0EsYUFBT3ZCLE9BQU8sQ0FBQ2lCLEdBQVIsQ0FBWSxDQUNqQjVGLElBQUksQ0FBQ2dELGFBQUwsQ0FBbUIsT0FBbkIsRUFDR0gsS0FESCxDQUNTQyxHQUFHLElBQUk7QUFDWlYsUUFBQUEsTUFBTSxDQUFDVSxHQUFELENBQU4sQ0FBWVAsRUFBWixDQUFlUSxLQUFmO0FBQ0FtRCxRQUFBQSxjQUFjO0FBQ2YsT0FKSCxDQURpQixFQU1qQmxHLElBQUksQ0FBQ21ELFlBQUwsQ0FBa0IsT0FBbEIsRUFBMkIsS0FBM0IsRUFBa0MsQ0FBQyxhQUFELENBQWxDLEVBQ0dOLEtBREgsQ0FDU0MsR0FBRyxJQUFJO0FBQ1pWLFFBQUFBLE1BQU0sQ0FBQ1UsR0FBRCxDQUFOLENBQVlQLEVBQVosQ0FBZVEsS0FBZjtBQUNBbUQsUUFBQUEsY0FBYztBQUNmLE9BSkgsQ0FOaUIsQ0FBWixFQVlKL0QsSUFaSSxDQVlDLE1BQU07QUFDWkMsUUFBQUEsTUFBTSxDQUFDOEQsY0FBRCxDQUFOLENBQXVCM0QsRUFBdkIsQ0FBMEJrQixLQUExQixDQUFnQyxDQUFoQztBQUNELE9BZE0sQ0FBUDtBQWVELEtBakJDLENBQUY7QUFrQkQsR0EzQ08sQ0FBUjtBQTRDRCxDQXBlTyxDQUFSIiwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50LWRpc2FibGUgbm8tdW51c2VkLWV4cHJlc3Npb25zICovXG5cbmltcG9ydCBob29kaWVjcm93IGZyb20gJ2hvb2RpZWNyb3ctaW1hcCdcbmltcG9ydCBJbWFwQ2xpZW50LCB7IExPR19MRVZFTF9OT05FIGFzIGxvZ0xldmVsIH0gZnJvbSAnLi4vc3JjL2luZGV4J1xuaW1wb3J0IHsgcGFyc2VTRUFSQ0ggfSBmcm9tICcuL2NvbW1hbmQtcGFyc2VyJ1xuaW1wb3J0IHsgYnVpbGRTRUFSQ0hDb21tYW5kIH0gZnJvbSAnLi9jb21tYW5kLWJ1aWxkZXInXG5cbnByb2Nlc3MuZW52Lk5PREVfVExTX1JFSkVDVF9VTkFVVEhPUklaRUQgPSAnMCdcblxuZGVzY3JpYmUoJ2Jyb3dzZXJib3ggaW50ZWdyYXRpb24gdGVzdHMnLCAoKSA9PiB7XG4gIGxldCBpbWFwXG4gIGNvbnN0IHBvcnQgPSAxMDAwMFxuICBsZXQgc2VydmVyXG5cbiAgYmVmb3JlRWFjaCgoZG9uZSkgPT4ge1xuICAgIC8vIHN0YXJ0IGltYXAgdGVzdCBzZXJ2ZXJcbiAgICB2YXIgb3B0aW9ucyA9IHtcbiAgICAgIC8vIGRlYnVnOiB0cnVlLFxuICAgICAgcGx1Z2luczogWydTVEFSVFRMUycsICdYLUdNLUVYVC0xJ10sXG4gICAgICBzZWN1cmVDb25uZWN0aW9uOiBmYWxzZSxcbiAgICAgIHN0b3JhZ2U6IHtcbiAgICAgICAgSU5CT1g6IHtcbiAgICAgICAgICBtZXNzYWdlczogW1xuICAgICAgICAgICAgeyByYXc6ICdTdWJqZWN0OiBoZWxsbyAxXFxyXFxuXFxyXFxuV29ybGQgMSEnIH0sXG4gICAgICAgICAgICB7IHJhdzogJ1N1YmplY3Q6IGhlbGxvIDJcXHJcXG5cXHJcXG5Xb3JsZCAyIScsIGZsYWdzOiBbJ1xcXFxTZWVuJ10gfSxcbiAgICAgICAgICAgIHsgcmF3OiAnU3ViamVjdDogaGVsbG8gM1xcclxcblxcclxcbldvcmxkIDMhJywgdWlkOiA1NTUgfSxcbiAgICAgICAgICAgIHsgcmF3OiAnRnJvbTogc2VuZGVyIG5hbWUgPHNlbmRlckBleGFtcGxlLmNvbT5cXHJcXG5UbzogUmVjZWl2ZXIgbmFtZSA8cmVjZWl2ZXJAZXhhbXBsZS5jb20+XFxyXFxuU3ViamVjdDogaGVsbG8gNFxcclxcbk1lc3NhZ2UtSWQ6IDxhYmNkZT5cXHJcXG5EYXRlOiBGcmksIDEzIFNlcCAyMDEzIDE1OjAxOjAwICswMzAwXFxyXFxuXFxyXFxuV29ybGQgNCEnIH0sXG4gICAgICAgICAgICB7IHJhdzogJ1N1YmplY3Q6IGhlbGxvIDVcXHJcXG5cXHJcXG5Xb3JsZCA1IScsIGZsYWdzOiBbJyRNeUZsYWcnLCAnXFxcXERlbGV0ZWQnXSwgdWlkOiA1NTcgfSxcbiAgICAgICAgICAgIHsgcmF3OiAnU3ViamVjdDogaGVsbG8gNlxcclxcblxcclxcbldvcmxkIDYhJyB9LFxuICAgICAgICAgICAgeyByYXc6ICdTdWJqZWN0OiBoZWxsbyA3XFxyXFxuXFxyXFxuV29ybGQgNyEnLCB1aWQ6IDYwMCB9XG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICAnJzoge1xuICAgICAgICAgIHNlcGFyYXRvcjogJy8nLFxuICAgICAgICAgIGZvbGRlcnM6IHtcbiAgICAgICAgICAgICdbR21haWxdJzoge1xuICAgICAgICAgICAgICBmbGFnczogWydcXFxcTm9zZWxlY3QnXSxcbiAgICAgICAgICAgICAgZm9sZGVyczoge1xuICAgICAgICAgICAgICAgICdBbGwgTWFpbCc6IHsgJ3NwZWNpYWwtdXNlJzogJ1xcXFxBbGwnIH0sXG4gICAgICAgICAgICAgICAgRHJhZnRzOiB7ICdzcGVjaWFsLXVzZSc6ICdcXFxcRHJhZnRzJyB9LFxuICAgICAgICAgICAgICAgIEltcG9ydGFudDogeyAnc3BlY2lhbC11c2UnOiAnXFxcXEltcG9ydGFudCcgfSxcbiAgICAgICAgICAgICAgICAnU2VudCBNYWlsJzogeyAnc3BlY2lhbC11c2UnOiAnXFxcXFNlbnQnIH0sXG4gICAgICAgICAgICAgICAgU3BhbTogeyAnc3BlY2lhbC11c2UnOiAnXFxcXEp1bmsnIH0sXG4gICAgICAgICAgICAgICAgU3RhcnJlZDogeyAnc3BlY2lhbC11c2UnOiAnXFxcXEZsYWdnZWQnIH0sXG4gICAgICAgICAgICAgICAgVHJhc2g6IHsgJ3NwZWNpYWwtdXNlJzogJ1xcXFxUcmFzaCcgfSxcbiAgICAgICAgICAgICAgICBBOiB7IG1lc3NhZ2VzOiBbe31dIH0sXG4gICAgICAgICAgICAgICAgQjogeyBtZXNzYWdlczogW3t9XSB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBzZXJ2ZXIgPSBob29kaWVjcm93KG9wdGlvbnMpXG4gICAgc2VydmVyLmxpc3Rlbihwb3J0LCBkb25lKVxuICB9KVxuXG4gIGFmdGVyRWFjaCgoZG9uZSkgPT4ge1xuICAgIHNlcnZlci5jbG9zZShkb25lKVxuICB9KVxuXG4gIGRlc2NyaWJlKCdDb25uZWN0aW9uIHRlc3RzJywgKCkgPT4ge1xuICAgIHZhciBpbnNlY3VyZVNlcnZlclxuXG4gICAgYmVmb3JlRWFjaCgoZG9uZSkgPT4ge1xuICAgICAgLy8gc3RhcnQgaW1hcCB0ZXN0IHNlcnZlclxuICAgICAgdmFyIG9wdGlvbnMgPSB7XG4gICAgICAgIC8vIGRlYnVnOiB0cnVlLFxuICAgICAgICBwbHVnaW5zOiBbXSxcbiAgICAgICAgc2VjdXJlQ29ubmVjdGlvbjogZmFsc2VcbiAgICAgIH1cblxuICAgICAgaW5zZWN1cmVTZXJ2ZXIgPSBob29kaWVjcm93KG9wdGlvbnMpXG4gICAgICBpbnNlY3VyZVNlcnZlci5saXN0ZW4ocG9ydCArIDIsIGRvbmUpXG4gICAgfSlcblxuICAgIGFmdGVyRWFjaCgoZG9uZSkgPT4ge1xuICAgICAgaW5zZWN1cmVTZXJ2ZXIuY2xvc2UoZG9uZSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCB1c2UgU1RBUlRUTFMgYnkgZGVmYXVsdCcsICgpID0+IHtcbiAgICAgIGltYXAgPSBuZXcgSW1hcENsaWVudCgnMTI3LjAuMC4xJywgcG9ydCwge1xuICAgICAgICBsb2dMZXZlbCxcbiAgICAgICAgYXV0aDoge1xuICAgICAgICAgIHVzZXI6ICd0ZXN0dXNlcicsXG4gICAgICAgICAgcGFzczogJ3Rlc3RwYXNzJ1xuICAgICAgICB9LFxuICAgICAgICB1c2VTZWN1cmVUcmFuc3BvcnQ6IGZhbHNlXG4gICAgICB9KVxuXG4gICAgICByZXR1cm4gaW1hcC5jb25uZWN0KCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChpbWFwLmNsaWVudC5zZWN1cmVNb2RlKS50by5iZS50cnVlXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIGltYXAuY2xvc2UoKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBpZ25vcmUgU1RBUlRUTFMnLCAoKSA9PiB7XG4gICAgICBpbWFwID0gbmV3IEltYXBDbGllbnQoJzEyNy4wLjAuMScsIHBvcnQsIHtcbiAgICAgICAgbG9nTGV2ZWwsXG4gICAgICAgIGF1dGg6IHtcbiAgICAgICAgICB1c2VyOiAndGVzdHVzZXInLFxuICAgICAgICAgIHBhc3M6ICd0ZXN0cGFzcydcbiAgICAgICAgfSxcbiAgICAgICAgdXNlU2VjdXJlVHJhbnNwb3J0OiBmYWxzZSxcbiAgICAgICAgaWdub3JlVExTOiB0cnVlXG4gICAgICB9KVxuXG4gICAgICByZXR1cm4gaW1hcC5jb25uZWN0KCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChpbWFwLmNsaWVudC5zZWN1cmVNb2RlKS50by5iZS5mYWxzZVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBpbWFwLmNsb3NlKClcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZmFpbCBjb25uZWN0aW5nIHRvIG5vbi1TVEFSVFRMUyBob3N0JywgKCkgPT4ge1xuICAgICAgaW1hcCA9IG5ldyBJbWFwQ2xpZW50KCcxMjcuMC4wLjEnLCBwb3J0ICsgMiwge1xuICAgICAgICBsb2dMZXZlbCxcbiAgICAgICAgYXV0aDoge1xuICAgICAgICAgIHVzZXI6ICd0ZXN0dXNlcicsXG4gICAgICAgICAgcGFzczogJ3Rlc3RwYXNzJ1xuICAgICAgICB9LFxuICAgICAgICB1c2VTZWN1cmVUcmFuc3BvcnQ6IGZhbHNlLFxuICAgICAgICByZXF1aXJlVExTOiB0cnVlXG4gICAgICB9KVxuXG4gICAgICByZXR1cm4gaW1hcC5jb25uZWN0KCkuY2F0Y2goKGVycikgPT4ge1xuICAgICAgICBleHBlY3QoZXJyKS50by5leGlzdFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjb25uZWN0IHRvIG5vbiBzZWN1cmUgaG9zdCcsICgpID0+IHtcbiAgICAgIGltYXAgPSBuZXcgSW1hcENsaWVudCgnMTI3LjAuMC4xJywgcG9ydCArIDIsIHtcbiAgICAgICAgbG9nTGV2ZWwsXG4gICAgICAgIGF1dGg6IHtcbiAgICAgICAgICB1c2VyOiAndGVzdHVzZXInLFxuICAgICAgICAgIHBhc3M6ICd0ZXN0cGFzcydcbiAgICAgICAgfSxcbiAgICAgICAgdXNlU2VjdXJlVHJhbnNwb3J0OiBmYWxzZVxuICAgICAgfSlcblxuICAgICAgcmV0dXJuIGltYXAuY29ubmVjdCgpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoaW1hcC5jbGllbnQuc2VjdXJlTW9kZSkudG8uYmUuZmFsc2VcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gaW1hcC5jbG9zZSgpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGZhaWwgYXV0aGVudGljYXRpb24nLCAoZG9uZSkgPT4ge1xuICAgICAgaW1hcCA9IG5ldyBJbWFwQ2xpZW50KCcxMjcuMC4wLjEnLCBwb3J0ICsgMiwge1xuICAgICAgICBsb2dMZXZlbCxcbiAgICAgICAgYXV0aDoge1xuICAgICAgICAgIHVzZXI6ICdpbnZhbGlkJyxcbiAgICAgICAgICBwYXNzOiAnaW52YWxpZCdcbiAgICAgICAgfSxcbiAgICAgICAgdXNlU2VjdXJlVHJhbnNwb3J0OiBmYWxzZVxuICAgICAgfSlcblxuICAgICAgaW1hcC5jb25uZWN0KCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChpbWFwLmNsaWVudC5zZWN1cmVNb2RlKS50by5iZS5mYWxzZVxuICAgICAgfSkuY2F0Y2goKCkgPT4geyBkb25lKCkgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCdQb3N0IGxvZ2luIHRlc3RzJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgaW1hcCA9IG5ldyBJbWFwQ2xpZW50KCcxMjcuMC4wLjEnLCBwb3J0LCB7XG4gICAgICAgIGxvZ0xldmVsLFxuICAgICAgICBhdXRoOiB7XG4gICAgICAgICAgdXNlcjogJ3Rlc3R1c2VyJyxcbiAgICAgICAgICBwYXNzOiAndGVzdHBhc3MnXG4gICAgICAgIH0sXG4gICAgICAgIHVzZVNlY3VyZVRyYW5zcG9ydDogZmFsc2VcbiAgICAgIH0pXG5cbiAgICAgIHJldHVybiBpbWFwLmNvbm5lY3QoKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIGltYXAuc2VsZWN0TWFpbGJveCgnW0dtYWlsXS9TcGFtJylcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGFmdGVyRWFjaCgoKSA9PiB7XG4gICAgICByZXR1cm4gaW1hcC5jbG9zZSgpXG4gICAgfSlcblxuICAgIGRlc2NyaWJlKCcjbGlzdE1haWxib3hlcycsICgpID0+IHtcbiAgICAgIGl0KCdzaG91bGQgc3VjY2VlZCcsICgpID0+IHtcbiAgICAgICAgcmV0dXJuIGltYXAubGlzdE1haWxib3hlcygpLnRoZW4oKG1haWxib3hlcykgPT4ge1xuICAgICAgICAgIGV4cGVjdChtYWlsYm94ZXMpLnRvLmV4aXN0XG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBkZXNjcmliZSgnI2xpc3RNZXNzYWdlcycsICgpID0+IHtcbiAgICAgIGl0KCdzaG91bGQgc3VjY2VlZCcsICgpID0+IHtcbiAgICAgICAgcmV0dXJuIGltYXAubGlzdE1lc3NhZ2VzKCdpbmJveCcsICcxOionLCBbJ3VpZCcsICdmbGFncycsICdlbnZlbG9wZScsICdib2R5c3RydWN0dXJlJywgJ2JvZHkucGVla1tdJ10pLnRoZW4oKG1lc3NhZ2VzKSA9PiB7XG4gICAgICAgICAgZXhwZWN0KG1lc3NhZ2VzKS50by5ub3QuYmUuZW1wdHlcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGRlc2NyaWJlKCcjc3Vic2NyaWJlJywgKCkgPT4ge1xuICAgICAgaXQoJ3Nob3VsZCBzdWNjZWVkJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gaW1hcC5zdWJzY3JpYmVNYWlsYm94KCdpbmJveCcpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICAgIGV4cGVjdChyZXNwb25zZS5jb21tYW5kKS50by5lcXVhbCgnT0snKVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgZGVzY3JpYmUoJyN1bnN1YnNjcmliZScsICgpID0+IHtcbiAgICAgIGl0KCdzaG91bGQgc3VjY2VlZCcsICgpID0+IHtcbiAgICAgICAgcmV0dXJuIGltYXAudW5zdWJzY3JpYmVNYWlsYm94KCdpbmJveCcpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICAgIGV4cGVjdChyZXNwb25zZS5jb21tYW5kKS50by5lcXVhbCgnT0snKVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgZGVzY3JpYmUoJyN1cGxvYWQnLCAoKSA9PiB7XG4gICAgICBpdCgnc2hvdWxkIHN1Y2NlZWQnLCAoKSA9PiB7XG4gICAgICAgIHZhciBtc2dDb3VudFxuXG4gICAgICAgIHJldHVybiBpbWFwLmxpc3RNZXNzYWdlcygnaW5ib3gnLCAnMToqJywgWyd1aWQnLCAnZmxhZ3MnLCAnZW52ZWxvcGUnLCAnYm9keXN0cnVjdHVyZSddKS50aGVuKChtZXNzYWdlcykgPT4ge1xuICAgICAgICAgIGV4cGVjdChtZXNzYWdlcykudG8ubm90LmJlLmVtcHR5XG4gICAgICAgICAgbXNnQ291bnQgPSBtZXNzYWdlcy5sZW5ndGhcbiAgICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGltYXAudXBsb2FkKCdpbmJveCcsICdNSU1FLVZlcnNpb246IDEuMFxcclxcbkRhdGU6IFdlZCwgOSBKdWwgMjAxNCAxNTowNzo0NyArMDIwMFxcclxcbkRlbGl2ZXJlZC1UbzogdGVzdEB0ZXN0LmNvbVxcclxcbk1lc3NhZ2UtSUQ6IDxDQUhmdFlZUW89NWZxYnRudi1EYXpYaEwyajVBeFZQMW5XYXJqa3p0bi1OOVNWOTFaMndAbWFpbC5nbWFpbC5jb20+XFxyXFxuU3ViamVjdDogdGVzdFxcclxcbkZyb206IFRlc3QgVGVzdCA8dGVzdEB0ZXN0LmNvbT5cXHJcXG5UbzogVGVzdCBUZXN0IDx0ZXN0QHRlc3QuY29tPlxcclxcbkNvbnRlbnQtVHlwZTogdGV4dC9wbGFpbjsgY2hhcnNldD1VVEYtOFxcclxcblxcclxcbnRlc3QnLCB7XG4gICAgICAgICAgICBmbGFnczogWydcXFxcU2VlbicsICdcXFxcQW5zd2VyZWQnLCAnXFxcXCRNeUZsYWcnXVxuICAgICAgICAgIH0pXG4gICAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpbWFwLmxpc3RNZXNzYWdlcygnaW5ib3gnLCAnMToqJywgWyd1aWQnLCAnZmxhZ3MnLCAnZW52ZWxvcGUnLCAnYm9keXN0cnVjdHVyZSddKVxuICAgICAgICB9KS50aGVuKChtZXNzYWdlcykgPT4ge1xuICAgICAgICAgIGV4cGVjdChtZXNzYWdlcy5sZW5ndGgpLnRvLmVxdWFsKG1zZ0NvdW50ICsgMSlcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGRlc2NyaWJlKCcjc2VhcmNoJywgKCkgPT4ge1xuICAgICAgaXQoJ3Nob3VsZCByZXR1cm4gYSBzZXF1ZW5jZSBudW1iZXInLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiBpbWFwLnNlYXJjaCgnaW5ib3gnLCB7XG4gICAgICAgICAgaGVhZGVyOiBbJ3N1YmplY3QnLCAnaGVsbG8gMyddXG4gICAgICAgIH0pLnRoZW4oKHJlc3VsdCkgPT4ge1xuICAgICAgICAgIGV4cGVjdChyZXN1bHQpLnRvLmRlZXAuZXF1YWwoWzNdKVxuICAgICAgICB9KVxuICAgICAgfSlcblxuICAgICAgaXQoJ3Nob3VsZCByZXR1cm4gYW4gdWlkJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gaW1hcC5zZWFyY2goJ2luYm94Jywge1xuICAgICAgICAgIGhlYWRlcjogWydzdWJqZWN0JywgJ2hlbGxvIDMnXVxuICAgICAgICB9LCB7XG4gICAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgICAgfSkudGhlbigocmVzdWx0KSA9PiB7XG4gICAgICAgICAgZXhwZWN0KHJlc3VsdCkudG8uZGVlcC5lcXVhbChbNTU1XSlcbiAgICAgICAgfSlcbiAgICAgIH0pXG5cbiAgICAgIGl0KCdzaG91bGQgd29yayB3aXRoIGNvbXBsZXggcXVlcmllcycsICgpID0+IHtcbiAgICAgICAgcmV0dXJuIGltYXAuc2VhcmNoKCdpbmJveCcsIHtcbiAgICAgICAgICBoZWFkZXI6IFsnc3ViamVjdCcsICdoZWxsbyddLFxuICAgICAgICAgIHNlZW46IHRydWVcbiAgICAgICAgfSkudGhlbigocmVzdWx0KSA9PiB7XG4gICAgICAgICAgZXhwZWN0KHJlc3VsdCkudG8uZGVlcC5lcXVhbChbMl0pXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBkZXNjcmliZSgnI3NldEZsYWdzJywgKCkgPT4ge1xuICAgICAgaXQoJ3Nob3VsZCBzZXQgZmxhZ3MgZm9yIGEgbWVzc2FnZScsICgpID0+IHtcbiAgICAgICAgcmV0dXJuIGltYXAuc2V0RmxhZ3MoJ2luYm94JywgJzEnLCBbJ1xcXFxTZWVuJywgJyRNeUZsYWcnXSkudGhlbigocmVzdWx0KSA9PiB7XG4gICAgICAgICAgZXhwZWN0KHJlc3VsdCkudG8uZGVlcC5lcXVhbChbe1xuICAgICAgICAgICAgJyMnOiAxLFxuICAgICAgICAgICAgZmxhZ3M6IFsnXFxcXFNlZW4nLCAnJE15RmxhZyddXG4gICAgICAgICAgfV0pXG4gICAgICAgIH0pXG4gICAgICB9KVxuXG4gICAgICBpdCgnc2hvdWxkIGFkZCBmbGFncyB0byBhIG1lc3NhZ2UnLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiBpbWFwLnNldEZsYWdzKCdpbmJveCcsICcyJywge1xuICAgICAgICAgIGFkZDogWyckTXlGbGFnJ11cbiAgICAgICAgfSkudGhlbigocmVzdWx0KSA9PiB7XG4gICAgICAgICAgZXhwZWN0KHJlc3VsdCkudG8uZGVlcC5lcXVhbChbe1xuICAgICAgICAgICAgJyMnOiAyLFxuICAgICAgICAgICAgZmxhZ3M6IFsnXFxcXFNlZW4nLCAnJE15RmxhZyddXG4gICAgICAgICAgfV0pXG4gICAgICAgIH0pXG4gICAgICB9KVxuXG4gICAgICBpdCgnc2hvdWxkIHJlbW92ZSBmbGFncyBmcm9tIGEgbWVzc2FnZScsICgpID0+IHtcbiAgICAgICAgcmV0dXJuIGltYXAuc2V0RmxhZ3MoJ2luYm94JywgJzU1NycsIHtcbiAgICAgICAgICByZW1vdmU6IFsnXFxcXERlbGV0ZWQnXVxuICAgICAgICB9LCB7XG4gICAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgICAgfSkudGhlbigocmVzdWx0KSA9PiB7XG4gICAgICAgICAgZXhwZWN0KHJlc3VsdCkudG8uZGVlcC5lcXVhbChbe1xuICAgICAgICAgICAgJyMnOiA1LFxuICAgICAgICAgICAgZmxhZ3M6IFsnJE15RmxhZyddLFxuICAgICAgICAgICAgdWlkOiA1NTdcbiAgICAgICAgICB9XSlcbiAgICAgICAgfSlcbiAgICAgIH0pXG5cbiAgICAgIGl0KCdzaG91bGQgbm90IHJldHVybiBhbnl0aGluZyBvbiBzaWxlbnQgbW9kZScsICgpID0+IHtcbiAgICAgICAgcmV0dXJuIGltYXAuc2V0RmxhZ3MoJ2luYm94JywgJzEnLCBbJyRNeUZsYWcyJ10sIHtcbiAgICAgICAgICBzaWxlbnQ6IHRydWVcbiAgICAgICAgfSkudGhlbigocmVzdWx0KSA9PiB7XG4gICAgICAgICAgZXhwZWN0KHJlc3VsdCkudG8uZGVlcC5lcXVhbChbXSlcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGRlc2NyaWJlKCcjc3RvcmUnLCAoKSA9PiB7XG4gICAgICBpdCgnc2hvdWxkIGFkZCBsYWJlbHMgZm9yIGEgbWVzc2FnZScsICgpID0+IHtcbiAgICAgICAgcmV0dXJuIGltYXAuc3RvcmUoJ2luYm94JywgJzEnLCAnK1gtR00tTEFCRUxTJywgWydcXFxcU2VudCcsICdcXFxcSnVuayddKS50aGVuKChyZXN1bHQpID0+IHtcbiAgICAgICAgICBleHBlY3QocmVzdWx0KS50by5kZWVwLmVxdWFsKFt7XG4gICAgICAgICAgICAnIyc6IDEsXG4gICAgICAgICAgICAneC1nbS1sYWJlbHMnOiBbJ1xcXFxJbmJveCcsICdcXFxcU2VudCcsICdcXFxcSnVuayddXG4gICAgICAgICAgfV0pXG4gICAgICAgIH0pXG4gICAgICB9KVxuXG4gICAgICBpdCgnc2hvdWxkIHNldCBsYWJlbHMgZm9yIGEgbWVzc2FnZScsICgpID0+IHtcbiAgICAgICAgcmV0dXJuIGltYXAuc3RvcmUoJ2luYm94JywgJzEnLCAnWC1HTS1MQUJFTFMnLCBbJ1xcXFxTZW50JywgJ1xcXFxKdW5rJ10pLnRoZW4oKHJlc3VsdCkgPT4ge1xuICAgICAgICAgIGV4cGVjdChyZXN1bHQpLnRvLmRlZXAuZXF1YWwoW3tcbiAgICAgICAgICAgICcjJzogMSxcbiAgICAgICAgICAgICd4LWdtLWxhYmVscyc6IFsnXFxcXFNlbnQnLCAnXFxcXEp1bmsnXVxuICAgICAgICAgIH1dKVxuICAgICAgICB9KVxuICAgICAgfSlcblxuICAgICAgaXQoJ3Nob3VsZCByZW1vdmUgbGFiZWxzIGZyb20gYSBtZXNzYWdlJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gaW1hcC5zdG9yZSgnaW5ib3gnLCAnMScsICctWC1HTS1MQUJFTFMnLCBbJ1xcXFxTZW50JywgJ1xcXFxJbmJveCddKS50aGVuKChyZXN1bHQpID0+IHtcbiAgICAgICAgICBleHBlY3QocmVzdWx0KS50by5kZWVwLmVxdWFsKFt7XG4gICAgICAgICAgICAnIyc6IDEsXG4gICAgICAgICAgICAneC1nbS1sYWJlbHMnOiBbXVxuICAgICAgICAgIH1dKVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgZGVzY3JpYmUoJyNkZWxldGVNZXNzYWdlcycsICgpID0+IHtcbiAgICAgIGl0KCdzaG91bGQgZGVsZXRlIGEgbWVzc2FnZScsICgpID0+IHtcbiAgICAgICAgdmFyIGluaXRpYWxJbmZvXG5cbiAgICAgICAgdmFyIGV4cHVuZ2VOb3RpZmllZCA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICBpbWFwLm9udXBkYXRlID0gZnVuY3Rpb24gKG1iLCB0eXBlIC8qLCBkYXRhICovKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBleHBlY3QobWIpLnRvLmVxdWFsKCdpbmJveCcpXG4gICAgICAgICAgICAgIGV4cGVjdCh0eXBlKS50by5lcXVhbCgnZXhwdW5nZScpXG4gICAgICAgICAgICAgIHJlc29sdmUoKVxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgIHJlamVjdChlcnIpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuXG4gICAgICAgIHJldHVybiBpbWFwLnNlbGVjdE1haWxib3goJ2luYm94JykudGhlbigoaW5mbykgPT4ge1xuICAgICAgICAgIGluaXRpYWxJbmZvID0gaW5mb1xuICAgICAgICAgIHJldHVybiBpbWFwLmRlbGV0ZU1lc3NhZ2VzKCdpbmJveCcsIDU1Nywge1xuICAgICAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgICAgICB9KVxuICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICByZXR1cm4gaW1hcC5zZWxlY3RNYWlsYm94KCdpbmJveCcpXG4gICAgICAgIH0pLnRoZW4oKHJlc3VsdEluZm8pID0+IHtcbiAgICAgICAgICBleHBlY3QoaW5pdGlhbEluZm8uZXhpc3RzIC0gMSA9PT0gcmVzdWx0SW5mby5leGlzdHMpLnRvLmJlLnRydWVcbiAgICAgICAgfSkudGhlbigoKSA9PiBleHB1bmdlTm90aWZpZWQpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBkZXNjcmliZSgnI2NvcHlNZXNzYWdlcycsICgpID0+IHtcbiAgICAgIGl0KCdzaG91bGQgY29weSBhIG1lc3NhZ2UnLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiBpbWFwLmNvcHlNZXNzYWdlcygnaW5ib3gnLCA1NTUsICdbR21haWxdL1RyYXNoJywge1xuICAgICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpbWFwLnNlbGVjdE1haWxib3goJ1tHbWFpbF0vVHJhc2gnKVxuICAgICAgICB9KS50aGVuKChpbmZvKSA9PiB7XG4gICAgICAgICAgZXhwZWN0KGluZm8uZXhpc3RzKS50by5lcXVhbCgxKVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgZGVzY3JpYmUoJyNtb3ZlTWVzc2FnZXMnLCAoKSA9PiB7XG4gICAgICBpdCgnc2hvdWxkIG1vdmUgYSBtZXNzYWdlJywgKCkgPT4ge1xuICAgICAgICB2YXIgaW5pdGlhbEluZm9cbiAgICAgICAgcmV0dXJuIGltYXAuc2VsZWN0TWFpbGJveCgnaW5ib3gnKS50aGVuKChpbmZvKSA9PiB7XG4gICAgICAgICAgaW5pdGlhbEluZm8gPSBpbmZvXG4gICAgICAgICAgcmV0dXJuIGltYXAubW92ZU1lc3NhZ2VzKCdpbmJveCcsIDU1NSwgJ1tHbWFpbF0vU3BhbScsIHtcbiAgICAgICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICAgICAgfSlcbiAgICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGltYXAuc2VsZWN0TWFpbGJveCgnW0dtYWlsXS9TcGFtJylcbiAgICAgICAgfSkudGhlbigoaW5mbykgPT4ge1xuICAgICAgICAgIGV4cGVjdChpbmZvLmV4aXN0cykudG8uZXF1YWwoMSlcbiAgICAgICAgICByZXR1cm4gaW1hcC5zZWxlY3RNYWlsYm94KCdpbmJveCcpXG4gICAgICAgIH0pLnRoZW4oKHJlc3VsdEluZm8pID0+IHtcbiAgICAgICAgICBleHBlY3QoaW5pdGlhbEluZm8uZXhpc3RzKS50by5ub3QuZXF1YWwocmVzdWx0SW5mby5leGlzdHMpXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBkZXNjcmliZSgncHJlY2hlY2snLCAoKSA9PiB7XG4gICAgICBpdCgnc2hvdWxkIGhhbmRsZSBwcmVjaGVjayBlcnJvciBjb3JyZWN0bHknLCAoKSA9PiB7XG4gICAgICAgIC8vIHNpbXVsYXRlcyBhIGJyb2tlbiBzZWFyY2ggY29tbWFuZFxuICAgICAgICB2YXIgc2VhcmNoID0gKHF1ZXJ5LCBvcHRpb25zID0ge30pID0+IHtcbiAgICAgICAgICB2YXIgY29tbWFuZCA9IGJ1aWxkU0VBUkNIQ29tbWFuZChxdWVyeSwgb3B0aW9ucylcbiAgICAgICAgICByZXR1cm4gaW1hcC5leGVjKGNvbW1hbmQsICdTRUFSQ0gnLCB7XG4gICAgICAgICAgICBwcmVjaGVjazogKCkgPT4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdGT08nKSlcbiAgICAgICAgICB9KS50aGVuKChyZXNwb25zZSkgPT4gcGFyc2VTRUFSQ0gocmVzcG9uc2UpKVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGltYXAuc2VsZWN0TWFpbGJveCgnaW5ib3gnKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNlYXJjaCh7IGhlYWRlcjogWydzdWJqZWN0JywgJ2hlbGxvIDMnXSB9KSlcbiAgICAgICAgICAuY2F0Y2goKGVycikgPT4ge1xuICAgICAgICAgICAgZXhwZWN0KGVyci5tZXNzYWdlKS50by5lcXVhbCgnRk9PJylcbiAgICAgICAgICAgIHJldHVybiBpbWFwLnNlbGVjdE1haWxib3goJ1tHbWFpbF0vU3BhbScpXG4gICAgICAgICAgfSlcbiAgICAgIH0pXG5cbiAgICAgIGl0KCdzaG91bGQgc2VsZWN0IGNvcnJlY3QgbWFpbGJveGVzIGluIHByZWNoZWNrcyBvbiBjb25jdXJyZW50IGNhbGxzJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gaW1hcC5zZWxlY3RNYWlsYm94KCdbR21haWxdL0EnKS50aGVuKCgpID0+IHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgaW1hcC5zZWxlY3RNYWlsYm94KCdbR21haWxdL0InKSxcbiAgICAgICAgICAgIGltYXAuc2V0RmxhZ3MoJ1tHbWFpbF0vQScsICcxJywgWydcXFxcU2VlbiddKVxuICAgICAgICAgIF0pXG4gICAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpbWFwLmxpc3RNZXNzYWdlcygnW0dtYWlsXS9BJywgJzE6MScsIFsnZmxhZ3MnXSlcbiAgICAgICAgfSkudGhlbigobWVzc2FnZXMpID0+IHtcbiAgICAgICAgICBleHBlY3QobWVzc2FnZXMubGVuZ3RoKS50by5lcXVhbCgxKVxuICAgICAgICAgIGV4cGVjdChtZXNzYWdlc1swXS5mbGFncykudG8uZGVlcC5lcXVhbChbJ1xcXFxTZWVuJ10pXG4gICAgICAgIH0pXG4gICAgICB9KVxuXG4gICAgICBpdCgnc2hvdWxkIHNlbmQgcHJlY2hlY2sgY29tbWFuZHMgaW4gY29ycmVjdCBvcmRlciBvbiBjb25jdXJyZW50IGNhbGxzJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoW1xuICAgICAgICAgIGltYXAuc2V0RmxhZ3MoJ1tHbWFpbF0vQScsICcxJywgWydcXFxcU2VlbiddKSxcbiAgICAgICAgICBpbWFwLnNldEZsYWdzKCdbR21haWxdL0InLCAnMScsIFsnXFxcXFNlZW4nXSlcbiAgICAgICAgXSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGltYXAubGlzdE1lc3NhZ2VzKCdbR21haWxdL0EnLCAnMToxJywgWydmbGFncyddKVxuICAgICAgICB9KS50aGVuKChtZXNzYWdlcykgPT4ge1xuICAgICAgICAgIGV4cGVjdChtZXNzYWdlcy5sZW5ndGgpLnRvLmVxdWFsKDEpXG4gICAgICAgICAgZXhwZWN0KG1lc3NhZ2VzWzBdLmZsYWdzKS50by5kZWVwLmVxdWFsKFsnXFxcXFNlZW4nXSlcbiAgICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGltYXAubGlzdE1lc3NhZ2VzKCdbR21haWxdL0InLCAnMToxJywgWydmbGFncyddKVxuICAgICAgICB9KS50aGVuKChtZXNzYWdlcykgPT4ge1xuICAgICAgICAgIGV4cGVjdChtZXNzYWdlcy5sZW5ndGgpLnRvLmVxdWFsKDEpXG4gICAgICAgICAgZXhwZWN0KG1lc3NhZ2VzWzBdLmZsYWdzKS50by5kZWVwLmVxdWFsKFsnXFxcXFNlZW4nXSlcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnVGltZW91dCcsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIGltYXAgPSBuZXcgSW1hcENsaWVudCgnMTI3LjAuMC4xJywgcG9ydCwge1xuICAgICAgICBsb2dMZXZlbCxcbiAgICAgICAgYXV0aDoge1xuICAgICAgICAgIHVzZXI6ICd0ZXN0dXNlcicsXG4gICAgICAgICAgcGFzczogJ3Rlc3RwYXNzJ1xuICAgICAgICB9LFxuICAgICAgICB1c2VTZWN1cmVUcmFuc3BvcnQ6IGZhbHNlXG4gICAgICB9KVxuXG4gICAgICByZXR1cm4gaW1hcC5jb25uZWN0KClcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIC8vIHJlbW92ZSB0aGUgb25kYXRhIGV2ZW50IHRvIHNpbXVsYXRlIDEwMCUgcGFja2V0IGxvc3MgYW5kIG1ha2UgdGhlIHNvY2tldCB0aW1lIG91dCBhZnRlciAxMG1zXG4gICAgICAgICAgaW1hcC5jbGllbnQudGltZW91dFNvY2tldExvd2VyQm91bmQgPSAxMFxuICAgICAgICAgIGltYXAuY2xpZW50LnRpbWVvdXRTb2NrZXRNdWx0aXBsaWVyID0gMFxuICAgICAgICAgIGltYXAuY2xpZW50LnNvY2tldC5vbmRhdGEgPSAoKSA9PiB7IH1cbiAgICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCB0aW1lb3V0JywgKGRvbmUpID0+IHtcbiAgICAgIGltYXAub25lcnJvciA9ICgpID0+IHsgZG9uZSgpIH1cbiAgICAgIGltYXAuc2VsZWN0TWFpbGJveCgnaW5ib3gnKS5jYXRjaCgoKSA9PiB7fSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCByZWplY3QgYWxsIHBlbmRpbmcgY29tbWFuZHMgb24gdGltZW91dCcsICgpID0+IHtcbiAgICAgIGxldCByZWplY3Rpb25Db3VudCA9IDBcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChbXG4gICAgICAgIGltYXAuc2VsZWN0TWFpbGJveCgnSU5CT1gnKVxuICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgZXhwZWN0KGVycikudG8uZXhpc3RcbiAgICAgICAgICAgIHJlamVjdGlvbkNvdW50KytcbiAgICAgICAgICB9KSxcbiAgICAgICAgaW1hcC5saXN0TWVzc2FnZXMoJ0lOQk9YJywgJzE6KicsIFsnYm9keS5wZWVrW10nXSlcbiAgICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGV4cGVjdChlcnIpLnRvLmV4aXN0XG4gICAgICAgICAgICByZWplY3Rpb25Db3VudCsrXG4gICAgICAgICAgfSlcblxuICAgICAgXSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChyZWplY3Rpb25Db3VudCkudG8uZXF1YWwoMilcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcbn0pXG4iXX0=