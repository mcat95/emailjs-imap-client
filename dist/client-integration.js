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
          imap.onupdate = function (mb, type /*, data */) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJwcm9jZXNzIiwiZW52IiwiTk9ERV9UTFNfUkVKRUNUX1VOQVVUSE9SSVpFRCIsImRlc2NyaWJlIiwiaW1hcCIsInBvcnQiLCJzZXJ2ZXIiLCJiZWZvcmVFYWNoIiwiZG9uZSIsIm9wdGlvbnMiLCJwbHVnaW5zIiwic2VjdXJlQ29ubmVjdGlvbiIsInN0b3JhZ2UiLCJJTkJPWCIsIm1lc3NhZ2VzIiwicmF3IiwiZmxhZ3MiLCJ1aWQiLCJzZXBhcmF0b3IiLCJmb2xkZXJzIiwiRHJhZnRzIiwiSW1wb3J0YW50IiwiU3BhbSIsIlN0YXJyZWQiLCJUcmFzaCIsIkEiLCJCIiwiaG9vZGllY3JvdyIsImxpc3RlbiIsImFmdGVyRWFjaCIsImNsb3NlIiwiaW5zZWN1cmVTZXJ2ZXIiLCJpdCIsIkltYXBDbGllbnQiLCJsb2dMZXZlbCIsImF1dGgiLCJ1c2VyIiwicGFzcyIsInVzZVNlY3VyZVRyYW5zcG9ydCIsImNvbm5lY3QiLCJ0aGVuIiwiZXhwZWN0IiwiY2xpZW50Iiwic2VjdXJlTW9kZSIsInRvIiwiYmUiLCJ0cnVlIiwiaWdub3JlVExTIiwiZmFsc2UiLCJyZXF1aXJlVExTIiwiY2F0Y2giLCJlcnIiLCJleGlzdCIsInNlbGVjdE1haWxib3giLCJsaXN0TWFpbGJveGVzIiwibWFpbGJveGVzIiwibGlzdE1lc3NhZ2VzIiwibm90IiwiZW1wdHkiLCJzdWJzY3JpYmVNYWlsYm94IiwicmVzcG9uc2UiLCJjb21tYW5kIiwiZXF1YWwiLCJ1bnN1YnNjcmliZU1haWxib3giLCJtc2dDb3VudCIsImxlbmd0aCIsInVwbG9hZCIsInNlYXJjaCIsImhlYWRlciIsInJlc3VsdCIsImRlZXAiLCJieVVpZCIsInNlZW4iLCJzZXRGbGFncyIsImFkZCIsInJlbW92ZSIsInNpbGVudCIsInN0b3JlIiwiaW5pdGlhbEluZm8iLCJleHB1bmdlTm90aWZpZWQiLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsIm9udXBkYXRlIiwibWIiLCJ0eXBlIiwiaW5mbyIsImRlbGV0ZU1lc3NhZ2VzIiwicmVzdWx0SW5mbyIsImV4aXN0cyIsImNvcHlNZXNzYWdlcyIsIm1vdmVNZXNzYWdlcyIsInF1ZXJ5IiwiYnVpbGRTRUFSQ0hDb21tYW5kIiwiZXhlYyIsInByZWNoZWNrIiwiRXJyb3IiLCJwYXJzZVNFQVJDSCIsIm1lc3NhZ2UiLCJhbGwiLCJ0aW1lb3V0U29ja2V0TG93ZXJCb3VuZCIsInRpbWVvdXRTb2NrZXRNdWx0aXBsaWVyIiwic29ja2V0Iiwib25kYXRhIiwib25lcnJvciIsInJlamVjdGlvbkNvdW50Il0sInNvdXJjZXMiOlsiLi4vc3JjL2NsaWVudC1pbnRlZ3JhdGlvbi5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiBlc2xpbnQtZGlzYWJsZSBuby11bnVzZWQtZXhwcmVzc2lvbnMgKi9cblxuaW1wb3J0IGhvb2RpZWNyb3cgZnJvbSAnaG9vZGllY3Jvdy1pbWFwJ1xuaW1wb3J0IEltYXBDbGllbnQsIHsgTE9HX0xFVkVMX05PTkUgYXMgbG9nTGV2ZWwgfSBmcm9tICcuLi9zcmMvaW5kZXgnXG5pbXBvcnQgeyBwYXJzZVNFQVJDSCB9IGZyb20gJy4vY29tbWFuZC1wYXJzZXInXG5pbXBvcnQgeyBidWlsZFNFQVJDSENvbW1hbmQgfSBmcm9tICcuL2NvbW1hbmQtYnVpbGRlcidcblxucHJvY2Vzcy5lbnYuTk9ERV9UTFNfUkVKRUNUX1VOQVVUSE9SSVpFRCA9ICcwJ1xuXG5kZXNjcmliZSgnYnJvd3NlcmJveCBpbnRlZ3JhdGlvbiB0ZXN0cycsICgpID0+IHtcbiAgbGV0IGltYXBcbiAgY29uc3QgcG9ydCA9IDEwMDAwXG4gIGxldCBzZXJ2ZXJcblxuICBiZWZvcmVFYWNoKChkb25lKSA9PiB7XG4gICAgLy8gc3RhcnQgaW1hcCB0ZXN0IHNlcnZlclxuICAgIHZhciBvcHRpb25zID0ge1xuICAgICAgLy8gZGVidWc6IHRydWUsXG4gICAgICBwbHVnaW5zOiBbJ1NUQVJUVExTJywgJ1gtR00tRVhULTEnXSxcbiAgICAgIHNlY3VyZUNvbm5lY3Rpb246IGZhbHNlLFxuICAgICAgc3RvcmFnZToge1xuICAgICAgICBJTkJPWDoge1xuICAgICAgICAgIG1lc3NhZ2VzOiBbXG4gICAgICAgICAgICB7IHJhdzogJ1N1YmplY3Q6IGhlbGxvIDFcXHJcXG5cXHJcXG5Xb3JsZCAxIScgfSxcbiAgICAgICAgICAgIHsgcmF3OiAnU3ViamVjdDogaGVsbG8gMlxcclxcblxcclxcbldvcmxkIDIhJywgZmxhZ3M6IFsnXFxcXFNlZW4nXSB9LFxuICAgICAgICAgICAgeyByYXc6ICdTdWJqZWN0OiBoZWxsbyAzXFxyXFxuXFxyXFxuV29ybGQgMyEnLCB1aWQ6IDU1NSB9LFxuICAgICAgICAgICAgeyByYXc6ICdGcm9tOiBzZW5kZXIgbmFtZSA8c2VuZGVyQGV4YW1wbGUuY29tPlxcclxcblRvOiBSZWNlaXZlciBuYW1lIDxyZWNlaXZlckBleGFtcGxlLmNvbT5cXHJcXG5TdWJqZWN0OiBoZWxsbyA0XFxyXFxuTWVzc2FnZS1JZDogPGFiY2RlPlxcclxcbkRhdGU6IEZyaSwgMTMgU2VwIDIwMTMgMTU6MDE6MDAgKzAzMDBcXHJcXG5cXHJcXG5Xb3JsZCA0IScgfSxcbiAgICAgICAgICAgIHsgcmF3OiAnU3ViamVjdDogaGVsbG8gNVxcclxcblxcclxcbldvcmxkIDUhJywgZmxhZ3M6IFsnJE15RmxhZycsICdcXFxcRGVsZXRlZCddLCB1aWQ6IDU1NyB9LFxuICAgICAgICAgICAgeyByYXc6ICdTdWJqZWN0OiBoZWxsbyA2XFxyXFxuXFxyXFxuV29ybGQgNiEnIH0sXG4gICAgICAgICAgICB7IHJhdzogJ1N1YmplY3Q6IGhlbGxvIDdcXHJcXG5cXHJcXG5Xb3JsZCA3IScsIHVpZDogNjAwIH1cbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgICcnOiB7XG4gICAgICAgICAgc2VwYXJhdG9yOiAnLycsXG4gICAgICAgICAgZm9sZGVyczoge1xuICAgICAgICAgICAgJ1tHbWFpbF0nOiB7XG4gICAgICAgICAgICAgIGZsYWdzOiBbJ1xcXFxOb3NlbGVjdCddLFxuICAgICAgICAgICAgICBmb2xkZXJzOiB7XG4gICAgICAgICAgICAgICAgJ0FsbCBNYWlsJzogeyAnc3BlY2lhbC11c2UnOiAnXFxcXEFsbCcgfSxcbiAgICAgICAgICAgICAgICBEcmFmdHM6IHsgJ3NwZWNpYWwtdXNlJzogJ1xcXFxEcmFmdHMnIH0sXG4gICAgICAgICAgICAgICAgSW1wb3J0YW50OiB7ICdzcGVjaWFsLXVzZSc6ICdcXFxcSW1wb3J0YW50JyB9LFxuICAgICAgICAgICAgICAgICdTZW50IE1haWwnOiB7ICdzcGVjaWFsLXVzZSc6ICdcXFxcU2VudCcgfSxcbiAgICAgICAgICAgICAgICBTcGFtOiB7ICdzcGVjaWFsLXVzZSc6ICdcXFxcSnVuaycgfSxcbiAgICAgICAgICAgICAgICBTdGFycmVkOiB7ICdzcGVjaWFsLXVzZSc6ICdcXFxcRmxhZ2dlZCcgfSxcbiAgICAgICAgICAgICAgICBUcmFzaDogeyAnc3BlY2lhbC11c2UnOiAnXFxcXFRyYXNoJyB9LFxuICAgICAgICAgICAgICAgIEE6IHsgbWVzc2FnZXM6IFt7fV0gfSxcbiAgICAgICAgICAgICAgICBCOiB7IG1lc3NhZ2VzOiBbe31dIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHNlcnZlciA9IGhvb2RpZWNyb3cob3B0aW9ucylcbiAgICBzZXJ2ZXIubGlzdGVuKHBvcnQsIGRvbmUpXG4gIH0pXG5cbiAgYWZ0ZXJFYWNoKChkb25lKSA9PiB7XG4gICAgc2VydmVyLmNsb3NlKGRvbmUpXG4gIH0pXG5cbiAgZGVzY3JpYmUoJ0Nvbm5lY3Rpb24gdGVzdHMnLCAoKSA9PiB7XG4gICAgdmFyIGluc2VjdXJlU2VydmVyXG5cbiAgICBiZWZvcmVFYWNoKChkb25lKSA9PiB7XG4gICAgICAvLyBzdGFydCBpbWFwIHRlc3Qgc2VydmVyXG4gICAgICB2YXIgb3B0aW9ucyA9IHtcbiAgICAgICAgLy8gZGVidWc6IHRydWUsXG4gICAgICAgIHBsdWdpbnM6IFtdLFxuICAgICAgICBzZWN1cmVDb25uZWN0aW9uOiBmYWxzZVxuICAgICAgfVxuXG4gICAgICBpbnNlY3VyZVNlcnZlciA9IGhvb2RpZWNyb3cob3B0aW9ucylcbiAgICAgIGluc2VjdXJlU2VydmVyLmxpc3Rlbihwb3J0ICsgMiwgZG9uZSlcbiAgICB9KVxuXG4gICAgYWZ0ZXJFYWNoKChkb25lKSA9PiB7XG4gICAgICBpbnNlY3VyZVNlcnZlci5jbG9zZShkb25lKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHVzZSBTVEFSVFRMUyBieSBkZWZhdWx0JywgKCkgPT4ge1xuICAgICAgaW1hcCA9IG5ldyBJbWFwQ2xpZW50KCcxMjcuMC4wLjEnLCBwb3J0LCB7XG4gICAgICAgIGxvZ0xldmVsLFxuICAgICAgICBhdXRoOiB7XG4gICAgICAgICAgdXNlcjogJ3Rlc3R1c2VyJyxcbiAgICAgICAgICBwYXNzOiAndGVzdHBhc3MnXG4gICAgICAgIH0sXG4gICAgICAgIHVzZVNlY3VyZVRyYW5zcG9ydDogZmFsc2VcbiAgICAgIH0pXG5cbiAgICAgIHJldHVybiBpbWFwLmNvbm5lY3QoKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGltYXAuY2xpZW50LnNlY3VyZU1vZGUpLnRvLmJlLnRydWVcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gaW1hcC5jbG9zZSgpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGlnbm9yZSBTVEFSVFRMUycsICgpID0+IHtcbiAgICAgIGltYXAgPSBuZXcgSW1hcENsaWVudCgnMTI3LjAuMC4xJywgcG9ydCwge1xuICAgICAgICBsb2dMZXZlbCxcbiAgICAgICAgYXV0aDoge1xuICAgICAgICAgIHVzZXI6ICd0ZXN0dXNlcicsXG4gICAgICAgICAgcGFzczogJ3Rlc3RwYXNzJ1xuICAgICAgICB9LFxuICAgICAgICB1c2VTZWN1cmVUcmFuc3BvcnQ6IGZhbHNlLFxuICAgICAgICBpZ25vcmVUTFM6IHRydWVcbiAgICAgIH0pXG5cbiAgICAgIHJldHVybiBpbWFwLmNvbm5lY3QoKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGltYXAuY2xpZW50LnNlY3VyZU1vZGUpLnRvLmJlLmZhbHNlXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIGltYXAuY2xvc2UoKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBmYWlsIGNvbm5lY3RpbmcgdG8gbm9uLVNUQVJUVExTIGhvc3QnLCAoKSA9PiB7XG4gICAgICBpbWFwID0gbmV3IEltYXBDbGllbnQoJzEyNy4wLjAuMScsIHBvcnQgKyAyLCB7XG4gICAgICAgIGxvZ0xldmVsLFxuICAgICAgICBhdXRoOiB7XG4gICAgICAgICAgdXNlcjogJ3Rlc3R1c2VyJyxcbiAgICAgICAgICBwYXNzOiAndGVzdHBhc3MnXG4gICAgICAgIH0sXG4gICAgICAgIHVzZVNlY3VyZVRyYW5zcG9ydDogZmFsc2UsXG4gICAgICAgIHJlcXVpcmVUTFM6IHRydWVcbiAgICAgIH0pXG5cbiAgICAgIHJldHVybiBpbWFwLmNvbm5lY3QoKS5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgIGV4cGVjdChlcnIpLnRvLmV4aXN0XG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNvbm5lY3QgdG8gbm9uIHNlY3VyZSBob3N0JywgKCkgPT4ge1xuICAgICAgaW1hcCA9IG5ldyBJbWFwQ2xpZW50KCcxMjcuMC4wLjEnLCBwb3J0ICsgMiwge1xuICAgICAgICBsb2dMZXZlbCxcbiAgICAgICAgYXV0aDoge1xuICAgICAgICAgIHVzZXI6ICd0ZXN0dXNlcicsXG4gICAgICAgICAgcGFzczogJ3Rlc3RwYXNzJ1xuICAgICAgICB9LFxuICAgICAgICB1c2VTZWN1cmVUcmFuc3BvcnQ6IGZhbHNlXG4gICAgICB9KVxuXG4gICAgICByZXR1cm4gaW1hcC5jb25uZWN0KCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChpbWFwLmNsaWVudC5zZWN1cmVNb2RlKS50by5iZS5mYWxzZVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBpbWFwLmNsb3NlKClcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZmFpbCBhdXRoZW50aWNhdGlvbicsIChkb25lKSA9PiB7XG4gICAgICBpbWFwID0gbmV3IEltYXBDbGllbnQoJzEyNy4wLjAuMScsIHBvcnQgKyAyLCB7XG4gICAgICAgIGxvZ0xldmVsLFxuICAgICAgICBhdXRoOiB7XG4gICAgICAgICAgdXNlcjogJ2ludmFsaWQnLFxuICAgICAgICAgIHBhc3M6ICdpbnZhbGlkJ1xuICAgICAgICB9LFxuICAgICAgICB1c2VTZWN1cmVUcmFuc3BvcnQ6IGZhbHNlXG4gICAgICB9KVxuXG4gICAgICBpbWFwLmNvbm5lY3QoKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGltYXAuY2xpZW50LnNlY3VyZU1vZGUpLnRvLmJlLmZhbHNlXG4gICAgICB9KS5jYXRjaCgoKSA9PiB7IGRvbmUoKSB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJ1Bvc3QgbG9naW4gdGVzdHMnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBpbWFwID0gbmV3IEltYXBDbGllbnQoJzEyNy4wLjAuMScsIHBvcnQsIHtcbiAgICAgICAgbG9nTGV2ZWwsXG4gICAgICAgIGF1dGg6IHtcbiAgICAgICAgICB1c2VyOiAndGVzdHVzZXInLFxuICAgICAgICAgIHBhc3M6ICd0ZXN0cGFzcydcbiAgICAgICAgfSxcbiAgICAgICAgdXNlU2VjdXJlVHJhbnNwb3J0OiBmYWxzZVxuICAgICAgfSlcblxuICAgICAgcmV0dXJuIGltYXAuY29ubmVjdCgpLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gaW1hcC5zZWxlY3RNYWlsYm94KCdbR21haWxdL1NwYW0nKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgYWZ0ZXJFYWNoKCgpID0+IHtcbiAgICAgIHJldHVybiBpbWFwLmNsb3NlKClcbiAgICB9KVxuXG4gICAgZGVzY3JpYmUoJyNsaXN0TWFpbGJveGVzJywgKCkgPT4ge1xuICAgICAgaXQoJ3Nob3VsZCBzdWNjZWVkJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gaW1hcC5saXN0TWFpbGJveGVzKCkudGhlbigobWFpbGJveGVzKSA9PiB7XG4gICAgICAgICAgZXhwZWN0KG1haWxib3hlcykudG8uZXhpc3RcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGRlc2NyaWJlKCcjbGlzdE1lc3NhZ2VzJywgKCkgPT4ge1xuICAgICAgaXQoJ3Nob3VsZCBzdWNjZWVkJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gaW1hcC5saXN0TWVzc2FnZXMoJ2luYm94JywgJzE6KicsIFsndWlkJywgJ2ZsYWdzJywgJ2VudmVsb3BlJywgJ2JvZHlzdHJ1Y3R1cmUnLCAnYm9keS5wZWVrW10nXSkudGhlbigobWVzc2FnZXMpID0+IHtcbiAgICAgICAgICBleHBlY3QobWVzc2FnZXMpLnRvLm5vdC5iZS5lbXB0eVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgZGVzY3JpYmUoJyNzdWJzY3JpYmUnLCAoKSA9PiB7XG4gICAgICBpdCgnc2hvdWxkIHN1Y2NlZWQnLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiBpbWFwLnN1YnNjcmliZU1haWxib3goJ2luYm94JykudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgZXhwZWN0KHJlc3BvbnNlLmNvbW1hbmQpLnRvLmVxdWFsKCdPSycpXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBkZXNjcmliZSgnI3Vuc3Vic2NyaWJlJywgKCkgPT4ge1xuICAgICAgaXQoJ3Nob3VsZCBzdWNjZWVkJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gaW1hcC51bnN1YnNjcmliZU1haWxib3goJ2luYm94JykudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgZXhwZWN0KHJlc3BvbnNlLmNvbW1hbmQpLnRvLmVxdWFsKCdPSycpXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBkZXNjcmliZSgnI3VwbG9hZCcsICgpID0+IHtcbiAgICAgIGl0KCdzaG91bGQgc3VjY2VlZCcsICgpID0+IHtcbiAgICAgICAgdmFyIG1zZ0NvdW50XG5cbiAgICAgICAgcmV0dXJuIGltYXAubGlzdE1lc3NhZ2VzKCdpbmJveCcsICcxOionLCBbJ3VpZCcsICdmbGFncycsICdlbnZlbG9wZScsICdib2R5c3RydWN0dXJlJ10pLnRoZW4oKG1lc3NhZ2VzKSA9PiB7XG4gICAgICAgICAgZXhwZWN0KG1lc3NhZ2VzKS50by5ub3QuYmUuZW1wdHlcbiAgICAgICAgICBtc2dDb3VudCA9IG1lc3NhZ2VzLmxlbmd0aFxuICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICByZXR1cm4gaW1hcC51cGxvYWQoJ2luYm94JywgJ01JTUUtVmVyc2lvbjogMS4wXFxyXFxuRGF0ZTogV2VkLCA5IEp1bCAyMDE0IDE1OjA3OjQ3ICswMjAwXFxyXFxuRGVsaXZlcmVkLVRvOiB0ZXN0QHRlc3QuY29tXFxyXFxuTWVzc2FnZS1JRDogPENBSGZ0WVlRbz01ZnFidG52LURhelhoTDJqNUF4VlAxbldhcmprenRuLU45U1Y5MVoyd0BtYWlsLmdtYWlsLmNvbT5cXHJcXG5TdWJqZWN0OiB0ZXN0XFxyXFxuRnJvbTogVGVzdCBUZXN0IDx0ZXN0QHRlc3QuY29tPlxcclxcblRvOiBUZXN0IFRlc3QgPHRlc3RAdGVzdC5jb20+XFxyXFxuQ29udGVudC1UeXBlOiB0ZXh0L3BsYWluOyBjaGFyc2V0PVVURi04XFxyXFxuXFxyXFxudGVzdCcsIHtcbiAgICAgICAgICAgIGZsYWdzOiBbJ1xcXFxTZWVuJywgJ1xcXFxBbnN3ZXJlZCcsICdcXFxcJE15RmxhZyddXG4gICAgICAgICAgfSlcbiAgICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGltYXAubGlzdE1lc3NhZ2VzKCdpbmJveCcsICcxOionLCBbJ3VpZCcsICdmbGFncycsICdlbnZlbG9wZScsICdib2R5c3RydWN0dXJlJ10pXG4gICAgICAgIH0pLnRoZW4oKG1lc3NhZ2VzKSA9PiB7XG4gICAgICAgICAgZXhwZWN0KG1lc3NhZ2VzLmxlbmd0aCkudG8uZXF1YWwobXNnQ291bnQgKyAxKVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgZGVzY3JpYmUoJyNzZWFyY2gnLCAoKSA9PiB7XG4gICAgICBpdCgnc2hvdWxkIHJldHVybiBhIHNlcXVlbmNlIG51bWJlcicsICgpID0+IHtcbiAgICAgICAgcmV0dXJuIGltYXAuc2VhcmNoKCdpbmJveCcsIHtcbiAgICAgICAgICBoZWFkZXI6IFsnc3ViamVjdCcsICdoZWxsbyAzJ11cbiAgICAgICAgfSkudGhlbigocmVzdWx0KSA9PiB7XG4gICAgICAgICAgZXhwZWN0KHJlc3VsdCkudG8uZGVlcC5lcXVhbChbM10pXG4gICAgICAgIH0pXG4gICAgICB9KVxuXG4gICAgICBpdCgnc2hvdWxkIHJldHVybiBhbiB1aWQnLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiBpbWFwLnNlYXJjaCgnaW5ib3gnLCB7XG4gICAgICAgICAgaGVhZGVyOiBbJ3N1YmplY3QnLCAnaGVsbG8gMyddXG4gICAgICAgIH0sIHtcbiAgICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgICB9KS50aGVuKChyZXN1bHQpID0+IHtcbiAgICAgICAgICBleHBlY3QocmVzdWx0KS50by5kZWVwLmVxdWFsKFs1NTVdKVxuICAgICAgICB9KVxuICAgICAgfSlcblxuICAgICAgaXQoJ3Nob3VsZCB3b3JrIHdpdGggY29tcGxleCBxdWVyaWVzJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gaW1hcC5zZWFyY2goJ2luYm94Jywge1xuICAgICAgICAgIGhlYWRlcjogWydzdWJqZWN0JywgJ2hlbGxvJ10sXG4gICAgICAgICAgc2VlbjogdHJ1ZVxuICAgICAgICB9KS50aGVuKChyZXN1bHQpID0+IHtcbiAgICAgICAgICBleHBlY3QocmVzdWx0KS50by5kZWVwLmVxdWFsKFsyXSlcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGRlc2NyaWJlKCcjc2V0RmxhZ3MnLCAoKSA9PiB7XG4gICAgICBpdCgnc2hvdWxkIHNldCBmbGFncyBmb3IgYSBtZXNzYWdlJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gaW1hcC5zZXRGbGFncygnaW5ib3gnLCAnMScsIFsnXFxcXFNlZW4nLCAnJE15RmxhZyddKS50aGVuKChyZXN1bHQpID0+IHtcbiAgICAgICAgICBleHBlY3QocmVzdWx0KS50by5kZWVwLmVxdWFsKFt7XG4gICAgICAgICAgICAnIyc6IDEsXG4gICAgICAgICAgICBmbGFnczogWydcXFxcU2VlbicsICckTXlGbGFnJ11cbiAgICAgICAgICB9XSlcbiAgICAgICAgfSlcbiAgICAgIH0pXG5cbiAgICAgIGl0KCdzaG91bGQgYWRkIGZsYWdzIHRvIGEgbWVzc2FnZScsICgpID0+IHtcbiAgICAgICAgcmV0dXJuIGltYXAuc2V0RmxhZ3MoJ2luYm94JywgJzInLCB7XG4gICAgICAgICAgYWRkOiBbJyRNeUZsYWcnXVxuICAgICAgICB9KS50aGVuKChyZXN1bHQpID0+IHtcbiAgICAgICAgICBleHBlY3QocmVzdWx0KS50by5kZWVwLmVxdWFsKFt7XG4gICAgICAgICAgICAnIyc6IDIsXG4gICAgICAgICAgICBmbGFnczogWydcXFxcU2VlbicsICckTXlGbGFnJ11cbiAgICAgICAgICB9XSlcbiAgICAgICAgfSlcbiAgICAgIH0pXG5cbiAgICAgIGl0KCdzaG91bGQgcmVtb3ZlIGZsYWdzIGZyb20gYSBtZXNzYWdlJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gaW1hcC5zZXRGbGFncygnaW5ib3gnLCAnNTU3Jywge1xuICAgICAgICAgIHJlbW92ZTogWydcXFxcRGVsZXRlZCddXG4gICAgICAgIH0sIHtcbiAgICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgICB9KS50aGVuKChyZXN1bHQpID0+IHtcbiAgICAgICAgICBleHBlY3QocmVzdWx0KS50by5kZWVwLmVxdWFsKFt7XG4gICAgICAgICAgICAnIyc6IDUsXG4gICAgICAgICAgICBmbGFnczogWyckTXlGbGFnJ10sXG4gICAgICAgICAgICB1aWQ6IDU1N1xuICAgICAgICAgIH1dKVxuICAgICAgICB9KVxuICAgICAgfSlcblxuICAgICAgaXQoJ3Nob3VsZCBub3QgcmV0dXJuIGFueXRoaW5nIG9uIHNpbGVudCBtb2RlJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gaW1hcC5zZXRGbGFncygnaW5ib3gnLCAnMScsIFsnJE15RmxhZzInXSwge1xuICAgICAgICAgIHNpbGVudDogdHJ1ZVxuICAgICAgICB9KS50aGVuKChyZXN1bHQpID0+IHtcbiAgICAgICAgICBleHBlY3QocmVzdWx0KS50by5kZWVwLmVxdWFsKFtdKVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgZGVzY3JpYmUoJyNzdG9yZScsICgpID0+IHtcbiAgICAgIGl0KCdzaG91bGQgYWRkIGxhYmVscyBmb3IgYSBtZXNzYWdlJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gaW1hcC5zdG9yZSgnaW5ib3gnLCAnMScsICcrWC1HTS1MQUJFTFMnLCBbJ1xcXFxTZW50JywgJ1xcXFxKdW5rJ10pLnRoZW4oKHJlc3VsdCkgPT4ge1xuICAgICAgICAgIGV4cGVjdChyZXN1bHQpLnRvLmRlZXAuZXF1YWwoW3tcbiAgICAgICAgICAgICcjJzogMSxcbiAgICAgICAgICAgICd4LWdtLWxhYmVscyc6IFsnXFxcXEluYm94JywgJ1xcXFxTZW50JywgJ1xcXFxKdW5rJ11cbiAgICAgICAgICB9XSlcbiAgICAgICAgfSlcbiAgICAgIH0pXG5cbiAgICAgIGl0KCdzaG91bGQgc2V0IGxhYmVscyBmb3IgYSBtZXNzYWdlJywgKCkgPT4ge1xuICAgICAgICByZXR1cm4gaW1hcC5zdG9yZSgnaW5ib3gnLCAnMScsICdYLUdNLUxBQkVMUycsIFsnXFxcXFNlbnQnLCAnXFxcXEp1bmsnXSkudGhlbigocmVzdWx0KSA9PiB7XG4gICAgICAgICAgZXhwZWN0KHJlc3VsdCkudG8uZGVlcC5lcXVhbChbe1xuICAgICAgICAgICAgJyMnOiAxLFxuICAgICAgICAgICAgJ3gtZ20tbGFiZWxzJzogWydcXFxcU2VudCcsICdcXFxcSnVuayddXG4gICAgICAgICAgfV0pXG4gICAgICAgIH0pXG4gICAgICB9KVxuXG4gICAgICBpdCgnc2hvdWxkIHJlbW92ZSBsYWJlbHMgZnJvbSBhIG1lc3NhZ2UnLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiBpbWFwLnN0b3JlKCdpbmJveCcsICcxJywgJy1YLUdNLUxBQkVMUycsIFsnXFxcXFNlbnQnLCAnXFxcXEluYm94J10pLnRoZW4oKHJlc3VsdCkgPT4ge1xuICAgICAgICAgIGV4cGVjdChyZXN1bHQpLnRvLmRlZXAuZXF1YWwoW3tcbiAgICAgICAgICAgICcjJzogMSxcbiAgICAgICAgICAgICd4LWdtLWxhYmVscyc6IFtdXG4gICAgICAgICAgfV0pXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBkZXNjcmliZSgnI2RlbGV0ZU1lc3NhZ2VzJywgKCkgPT4ge1xuICAgICAgaXQoJ3Nob3VsZCBkZWxldGUgYSBtZXNzYWdlJywgKCkgPT4ge1xuICAgICAgICB2YXIgaW5pdGlhbEluZm9cblxuICAgICAgICB2YXIgZXhwdW5nZU5vdGlmaWVkID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgIGltYXAub251cGRhdGUgPSBmdW5jdGlvbiAobWIsIHR5cGUgLyosIGRhdGEgKi8pIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGV4cGVjdChtYikudG8uZXF1YWwoJ2luYm94JylcbiAgICAgICAgICAgICAgZXhwZWN0KHR5cGUpLnRvLmVxdWFsKCdleHB1bmdlJylcbiAgICAgICAgICAgICAgcmVzb2x2ZSgpXG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgcmVqZWN0KGVycilcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pXG5cbiAgICAgICAgcmV0dXJuIGltYXAuc2VsZWN0TWFpbGJveCgnaW5ib3gnKS50aGVuKChpbmZvKSA9PiB7XG4gICAgICAgICAgaW5pdGlhbEluZm8gPSBpbmZvXG4gICAgICAgICAgcmV0dXJuIGltYXAuZGVsZXRlTWVzc2FnZXMoJ2luYm94JywgNTU3LCB7XG4gICAgICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgICAgIH0pXG4gICAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJldHVybiBpbWFwLnNlbGVjdE1haWxib3goJ2luYm94JylcbiAgICAgICAgfSkudGhlbigocmVzdWx0SW5mbykgPT4ge1xuICAgICAgICAgIGV4cGVjdChpbml0aWFsSW5mby5leGlzdHMgLSAxID09PSByZXN1bHRJbmZvLmV4aXN0cykudG8uYmUudHJ1ZVxuICAgICAgICB9KS50aGVuKCgpID0+IGV4cHVuZ2VOb3RpZmllZClcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGRlc2NyaWJlKCcjY29weU1lc3NhZ2VzJywgKCkgPT4ge1xuICAgICAgaXQoJ3Nob3VsZCBjb3B5IGEgbWVzc2FnZScsICgpID0+IHtcbiAgICAgICAgcmV0dXJuIGltYXAuY29weU1lc3NhZ2VzKCdpbmJveCcsIDU1NSwgJ1tHbWFpbF0vVHJhc2gnLCB7XG4gICAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGltYXAuc2VsZWN0TWFpbGJveCgnW0dtYWlsXS9UcmFzaCcpXG4gICAgICAgIH0pLnRoZW4oKGluZm8pID0+IHtcbiAgICAgICAgICBleHBlY3QoaW5mby5leGlzdHMpLnRvLmVxdWFsKDEpXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBkZXNjcmliZSgnI21vdmVNZXNzYWdlcycsICgpID0+IHtcbiAgICAgIGl0KCdzaG91bGQgbW92ZSBhIG1lc3NhZ2UnLCAoKSA9PiB7XG4gICAgICAgIHZhciBpbml0aWFsSW5mb1xuICAgICAgICByZXR1cm4gaW1hcC5zZWxlY3RNYWlsYm94KCdpbmJveCcpLnRoZW4oKGluZm8pID0+IHtcbiAgICAgICAgICBpbml0aWFsSW5mbyA9IGluZm9cbiAgICAgICAgICByZXR1cm4gaW1hcC5tb3ZlTWVzc2FnZXMoJ2luYm94JywgNTU1LCAnW0dtYWlsXS9TcGFtJywge1xuICAgICAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgICAgICB9KVxuICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICByZXR1cm4gaW1hcC5zZWxlY3RNYWlsYm94KCdbR21haWxdL1NwYW0nKVxuICAgICAgICB9KS50aGVuKChpbmZvKSA9PiB7XG4gICAgICAgICAgZXhwZWN0KGluZm8uZXhpc3RzKS50by5lcXVhbCgxKVxuICAgICAgICAgIHJldHVybiBpbWFwLnNlbGVjdE1haWxib3goJ2luYm94JylcbiAgICAgICAgfSkudGhlbigocmVzdWx0SW5mbykgPT4ge1xuICAgICAgICAgIGV4cGVjdChpbml0aWFsSW5mby5leGlzdHMpLnRvLm5vdC5lcXVhbChyZXN1bHRJbmZvLmV4aXN0cylcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGRlc2NyaWJlKCdwcmVjaGVjaycsICgpID0+IHtcbiAgICAgIGl0KCdzaG91bGQgaGFuZGxlIHByZWNoZWNrIGVycm9yIGNvcnJlY3RseScsICgpID0+IHtcbiAgICAgICAgLy8gc2ltdWxhdGVzIGEgYnJva2VuIHNlYXJjaCBjb21tYW5kXG4gICAgICAgIHZhciBzZWFyY2ggPSAocXVlcnksIG9wdGlvbnMgPSB7fSkgPT4ge1xuICAgICAgICAgIHZhciBjb21tYW5kID0gYnVpbGRTRUFSQ0hDb21tYW5kKHF1ZXJ5LCBvcHRpb25zKVxuICAgICAgICAgIHJldHVybiBpbWFwLmV4ZWMoY29tbWFuZCwgJ1NFQVJDSCcsIHtcbiAgICAgICAgICAgIHByZWNoZWNrOiAoKSA9PiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ0ZPTycpKVxuICAgICAgICAgIH0pLnRoZW4oKHJlc3BvbnNlKSA9PiBwYXJzZVNFQVJDSChyZXNwb25zZSkpXG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaW1hcC5zZWxlY3RNYWlsYm94KCdpbmJveCcpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2VhcmNoKHsgaGVhZGVyOiBbJ3N1YmplY3QnLCAnaGVsbG8gMyddIH0pKVxuICAgICAgICAgIC5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgICAgICBleHBlY3QoZXJyLm1lc3NhZ2UpLnRvLmVxdWFsKCdGT08nKVxuICAgICAgICAgICAgcmV0dXJuIGltYXAuc2VsZWN0TWFpbGJveCgnW0dtYWlsXS9TcGFtJylcbiAgICAgICAgICB9KVxuICAgICAgfSlcblxuICAgICAgaXQoJ3Nob3VsZCBzZWxlY3QgY29ycmVjdCBtYWlsYm94ZXMgaW4gcHJlY2hlY2tzIG9uIGNvbmN1cnJlbnQgY2FsbHMnLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiBpbWFwLnNlbGVjdE1haWxib3goJ1tHbWFpbF0vQScpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICBpbWFwLnNlbGVjdE1haWxib3goJ1tHbWFpbF0vQicpLFxuICAgICAgICAgICAgaW1hcC5zZXRGbGFncygnW0dtYWlsXS9BJywgJzEnLCBbJ1xcXFxTZWVuJ10pXG4gICAgICAgICAgXSlcbiAgICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGltYXAubGlzdE1lc3NhZ2VzKCdbR21haWxdL0EnLCAnMToxJywgWydmbGFncyddKVxuICAgICAgICB9KS50aGVuKChtZXNzYWdlcykgPT4ge1xuICAgICAgICAgIGV4cGVjdChtZXNzYWdlcy5sZW5ndGgpLnRvLmVxdWFsKDEpXG4gICAgICAgICAgZXhwZWN0KG1lc3NhZ2VzWzBdLmZsYWdzKS50by5kZWVwLmVxdWFsKFsnXFxcXFNlZW4nXSlcbiAgICAgICAgfSlcbiAgICAgIH0pXG5cbiAgICAgIGl0KCdzaG91bGQgc2VuZCBwcmVjaGVjayBjb21tYW5kcyBpbiBjb3JyZWN0IG9yZGVyIG9uIGNvbmN1cnJlbnQgY2FsbHMnLCAoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChbXG4gICAgICAgICAgaW1hcC5zZXRGbGFncygnW0dtYWlsXS9BJywgJzEnLCBbJ1xcXFxTZWVuJ10pLFxuICAgICAgICAgIGltYXAuc2V0RmxhZ3MoJ1tHbWFpbF0vQicsICcxJywgWydcXFxcU2VlbiddKVxuICAgICAgICBdKS50aGVuKCgpID0+IHtcbiAgICAgICAgICByZXR1cm4gaW1hcC5saXN0TWVzc2FnZXMoJ1tHbWFpbF0vQScsICcxOjEnLCBbJ2ZsYWdzJ10pXG4gICAgICAgIH0pLnRoZW4oKG1lc3NhZ2VzKSA9PiB7XG4gICAgICAgICAgZXhwZWN0KG1lc3NhZ2VzLmxlbmd0aCkudG8uZXF1YWwoMSlcbiAgICAgICAgICBleHBlY3QobWVzc2FnZXNbMF0uZmxhZ3MpLnRvLmRlZXAuZXF1YWwoWydcXFxcU2VlbiddKVxuICAgICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgICByZXR1cm4gaW1hcC5saXN0TWVzc2FnZXMoJ1tHbWFpbF0vQicsICcxOjEnLCBbJ2ZsYWdzJ10pXG4gICAgICAgIH0pLnRoZW4oKG1lc3NhZ2VzKSA9PiB7XG4gICAgICAgICAgZXhwZWN0KG1lc3NhZ2VzLmxlbmd0aCkudG8uZXF1YWwoMSlcbiAgICAgICAgICBleHBlY3QobWVzc2FnZXNbMF0uZmxhZ3MpLnRvLmRlZXAuZXF1YWwoWydcXFxcU2VlbiddKVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCdUaW1lb3V0JywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgaW1hcCA9IG5ldyBJbWFwQ2xpZW50KCcxMjcuMC4wLjEnLCBwb3J0LCB7XG4gICAgICAgIGxvZ0xldmVsLFxuICAgICAgICBhdXRoOiB7XG4gICAgICAgICAgdXNlcjogJ3Rlc3R1c2VyJyxcbiAgICAgICAgICBwYXNzOiAndGVzdHBhc3MnXG4gICAgICAgIH0sXG4gICAgICAgIHVzZVNlY3VyZVRyYW5zcG9ydDogZmFsc2VcbiAgICAgIH0pXG5cbiAgICAgIHJldHVybiBpbWFwLmNvbm5lY3QoKVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgLy8gcmVtb3ZlIHRoZSBvbmRhdGEgZXZlbnQgdG8gc2ltdWxhdGUgMTAwJSBwYWNrZXQgbG9zcyBhbmQgbWFrZSB0aGUgc29ja2V0IHRpbWUgb3V0IGFmdGVyIDEwbXNcbiAgICAgICAgICBpbWFwLmNsaWVudC50aW1lb3V0U29ja2V0TG93ZXJCb3VuZCA9IDEwXG4gICAgICAgICAgaW1hcC5jbGllbnQudGltZW91dFNvY2tldE11bHRpcGxpZXIgPSAwXG4gICAgICAgICAgaW1hcC5jbGllbnQuc29ja2V0Lm9uZGF0YSA9ICgpID0+IHsgfVxuICAgICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHRpbWVvdXQnLCAoZG9uZSkgPT4ge1xuICAgICAgaW1hcC5vbmVycm9yID0gKCkgPT4geyBkb25lKCkgfVxuICAgICAgaW1hcC5zZWxlY3RNYWlsYm94KCdpbmJveCcpLmNhdGNoKCgpID0+IHt9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJlamVjdCBhbGwgcGVuZGluZyBjb21tYW5kcyBvbiB0aW1lb3V0JywgKCkgPT4ge1xuICAgICAgbGV0IHJlamVjdGlvbkNvdW50ID0gMFxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFtcbiAgICAgICAgaW1hcC5zZWxlY3RNYWlsYm94KCdJTkJPWCcpXG4gICAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICBleHBlY3QoZXJyKS50by5leGlzdFxuICAgICAgICAgICAgcmVqZWN0aW9uQ291bnQrK1xuICAgICAgICAgIH0pLFxuICAgICAgICBpbWFwLmxpc3RNZXNzYWdlcygnSU5CT1gnLCAnMToqJywgWydib2R5LnBlZWtbXSddKVxuICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgZXhwZWN0KGVycikudG8uZXhpc3RcbiAgICAgICAgICAgIHJlamVjdGlvbkNvdW50KytcbiAgICAgICAgICB9KVxuXG4gICAgICBdKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KHJlamVjdGlvbkNvdW50KS50by5lcXVhbCgyKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxufSlcbiJdLCJtYXBwaW5ncyI6Ijs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUFzRDtBQUFBO0FBQUE7QUFMdEQ7O0FBT0FBLE9BQU8sQ0FBQ0MsR0FBRyxDQUFDQyw0QkFBNEIsR0FBRyxHQUFHO0FBRTlDQyxRQUFRLENBQUMsOEJBQThCLEVBQUUsTUFBTTtFQUM3QyxJQUFJQyxJQUFJO0VBQ1IsTUFBTUMsSUFBSSxHQUFHLEtBQUs7RUFDbEIsSUFBSUMsTUFBTTtFQUVWQyxVQUFVLENBQUVDLElBQUksSUFBSztJQUNuQjtJQUNBLElBQUlDLE9BQU8sR0FBRztNQUNaO01BQ0FDLE9BQU8sRUFBRSxDQUFDLFVBQVUsRUFBRSxZQUFZLENBQUM7TUFDbkNDLGdCQUFnQixFQUFFLEtBQUs7TUFDdkJDLE9BQU8sRUFBRTtRQUNQQyxLQUFLLEVBQUU7VUFDTEMsUUFBUSxFQUFFLENBQ1I7WUFBRUMsR0FBRyxFQUFFO1VBQW1DLENBQUMsRUFDM0M7WUFBRUEsR0FBRyxFQUFFLGtDQUFrQztZQUFFQyxLQUFLLEVBQUUsQ0FBQyxRQUFRO1VBQUUsQ0FBQyxFQUM5RDtZQUFFRCxHQUFHLEVBQUUsa0NBQWtDO1lBQUVFLEdBQUcsRUFBRTtVQUFJLENBQUMsRUFDckQ7WUFBRUYsR0FBRyxFQUFFO1VBQXlMLENBQUMsRUFDak07WUFBRUEsR0FBRyxFQUFFLGtDQUFrQztZQUFFQyxLQUFLLEVBQUUsQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDO1lBQUVDLEdBQUcsRUFBRTtVQUFJLENBQUMsRUFDdEY7WUFBRUYsR0FBRyxF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