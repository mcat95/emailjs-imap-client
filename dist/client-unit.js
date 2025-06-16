"use strict";

var _client = _interopRequireWildcard(require("./client"));
var _emailjsImapHandler = require("emailjs-imap-handler");
var _common = require("./common");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
/* eslint-disable no-unused-expressions */

describe('browserbox unit tests', () => {
  var br;
  beforeEach(() => {
    const auth = {
      user: 'baldrian',
      pass: 'sleeper.de'
    };
    br = new _client.default('somehost', 1234, {
      auth,
      logLevel: _common.LOG_LEVEL_NONE
    });
    br.client.socket = {
      send: () => {},
      upgradeToSecure: () => {}
    };
  });
  describe('#_onIdle', () => {
    it('should call enterIdle', () => {
      sinon.stub(br, 'enterIdle');
      br._authenticated = true;
      br._enteredIdle = false;
      br._onIdle();
      expect(br.enterIdle.callCount).to.equal(1);
    });
    it('should not call enterIdle', () => {
      sinon.stub(br, 'enterIdle');
      br._enteredIdle = true;
      br._onIdle();
      expect(br.enterIdle.callCount).to.equal(0);
    });
  });
  describe('#openConnection', () => {
    beforeEach(() => {
      sinon.stub(br.client, 'connect');
      sinon.stub(br.client, 'close');
      sinon.stub(br.client, 'enqueueCommand');
    });
    it('should open connection', () => {
      br.client.connect.returns(Promise.resolve());
      br.client.enqueueCommand.returns(Promise.resolve({
        capability: ['capa1', 'capa2']
      }));
      setTimeout(() => br.client.onready(), 0);
      return br.openConnection().then(() => {
        expect(br.client.connect.calledOnce).to.be.true;
        expect(br.client.enqueueCommand.calledOnce).to.be.true;
        expect(br._capability.length).to.equal(2);
        expect(br._capability[0]).to.equal('capa1');
        expect(br._capability[1]).to.equal('capa2');
      });
    });
  });
  describe('#connect', () => {
    beforeEach(() => {
      sinon.stub(br.client, 'connect');
      sinon.stub(br.client, 'close');
      sinon.stub(br, 'updateCapability');
      sinon.stub(br, 'upgradeConnection');
      sinon.stub(br, 'updateId');
      sinon.stub(br, 'login');
      sinon.stub(br, 'compressConnection');
    });
    it('should connect', () => {
      br.client.connect.returns(Promise.resolve());
      br.updateCapability.returns(Promise.resolve());
      br.upgradeConnection.returns(Promise.resolve());
      br.updateId.returns(Promise.resolve());
      br.login.returns(Promise.resolve());
      br.compressConnection.returns(Promise.resolve());
      setTimeout(() => br.client.onready(), 0);
      return br.connect().then(() => {
        expect(br.client.connect.calledOnce).to.be.true;
        expect(br.updateCapability.calledOnce).to.be.true;
        expect(br.upgradeConnection.calledOnce).to.be.true;
        expect(br.updateId.calledOnce).to.be.true;
        expect(br.login.calledOnce).to.be.true;
        expect(br.compressConnection.calledOnce).to.be.true;
      });
    });
    it('should fail to login', done => {
      br.client.connect.returns(Promise.resolve());
      br.updateCapability.returns(Promise.resolve());
      br.upgradeConnection.returns(Promise.resolve());
      br.updateId.returns(Promise.resolve());
      br.login.throws(new Error());
      setTimeout(() => br.client.onready(), 0);
      br.connect().catch(err => {
        expect(err).to.exist;
        expect(br.client.connect.calledOnce).to.be.true;
        expect(br.client.close.calledOnce).to.be.true;
        expect(br.updateCapability.calledOnce).to.be.true;
        expect(br.upgradeConnection.calledOnce).to.be.true;
        expect(br.updateId.calledOnce).to.be.true;
        expect(br.login.calledOnce).to.be.true;
        expect(br.compressConnection.called).to.be.false;
        done();
      });
    });
    it('should timeout', done => {
      br.client.connect.returns(Promise.resolve());
      br.timeoutConnection = 1;
      br.connect().catch(err => {
        expect(err).to.exist;
        expect(br.client.connect.calledOnce).to.be.true;
        expect(br.client.close.calledOnce).to.be.true;
        expect(br.updateCapability.called).to.be.false;
        expect(br.upgradeConnection.called).to.be.false;
        expect(br.updateId.called).to.be.false;
        expect(br.login.called).to.be.false;
        expect(br.compressConnection.called).to.be.false;
        done();
      });
    });
  });
  describe('#close', () => {
    it('should force-close', () => {
      sinon.stub(br.client, 'close').returns(Promise.resolve());
      return br.close().then(() => {
        expect(br._state).to.equal(_client.STATE_LOGOUT);
        expect(br.client.close.calledOnce).to.be.true;
      });
    });
  });
  describe('#exec', () => {
    beforeEach(() => {
      sinon.stub(br, 'breakIdle');
    });
    it('should send string command', () => {
      sinon.stub(br.client, 'enqueueCommand').returns(Promise.resolve({}));
      return br.exec('TEST').then(res => {
        expect(res).to.deep.equal({});
        expect(br.client.enqueueCommand.args[0][0]).to.equal('TEST');
      });
    });
    it('should update capability from response', () => {
      sinon.stub(br.client, 'enqueueCommand').returns(Promise.resolve({
        capability: ['A', 'B']
      }));
      return br.exec('TEST').then(res => {
        expect(res).to.deep.equal({
          capability: ['A', 'B']
        });
        expect(br._capability).to.deep.equal(['A', 'B']);
      });
    });
  });
  describe('#enterIdle', () => {
    it('should periodically send NOOP if IDLE not supported', done => {
      sinon.stub(br, 'exec').callsFake(command => {
        expect(command).to.equal('NOOP');
        done();
      });
      br._capability = [];
      br._selectedMailbox = 'FOO';
      br.timeoutNoop = 1;
      br.enterIdle();
    });
    it('should periodically send NOOP if no mailbox selected', done => {
      sinon.stub(br, 'exec').callsFake(command => {
        expect(command).to.equal('NOOP');
        done();
      });
      br._capability = ['IDLE'];
      br._selectedMailbox = undefined;
      br.timeoutNoop = 1;
      br.enterIdle();
    });
    it('should break IDLE after timeout', done => {
      sinon.stub(br.client, 'enqueueCommand');
      sinon.stub(br.client.socket, 'send').callsFake(payload => {
        expect(br.client.enqueueCommand.args[0][0].command).to.equal('IDLE');
        expect([].slice.call(new Uint8Array(payload))).to.deep.equal([0x44, 0x4f, 0x4e, 0x45, 0x0d, 0x0a]);
        done();
      });
      br._capability = ['IDLE'];
      br._selectedMailbox = 'FOO';
      br.timeoutIdle = 1;
      br.enterIdle();
    });
  });
  describe('#breakIdle', () => {
    it('should send DONE to socket', () => {
      sinon.stub(br.client.socket, 'send');
      br._enteredIdle = 'IDLE';
      br.breakIdle();
      expect([].slice.call(new Uint8Array(br.client.socket.send.args[0][0]))).to.deep.equal([0x44, 0x4f, 0x4e, 0x45, 0x0d, 0x0a]);
    });
  });
  describe('#upgradeConnection', () => {
    it('should do nothing if already secured', () => {
      br.client.secureMode = true;
      br._capability = ['starttls'];
      return br.upgradeConnection();
    });
    it('should do nothing if STARTTLS not available', () => {
      br.client.secureMode = false;
      br._capability = [];
      return br.upgradeConnection();
    });
    it('should run STARTTLS', () => {
      sinon.stub(br.client, 'upgrade');
      sinon.stub(br, 'exec').withArgs('STARTTLS').returns(Promise.resolve());
      sinon.stub(br, 'updateCapability').returns(Promise.resolve());
      br._capability = ['STARTTLS'];
      return br.upgradeConnection().then(() => {
        expect(br.client.upgrade.callCount).to.equal(1);
        expect(br._capability.length).to.equal(0);
      });
    });
  });
  describe('#updateCapability', () => {
    beforeEach(() => {
      sinon.stub(br, 'exec');
    });
    it('should do nothing if capability is set', () => {
      br._capability = ['abc'];
      return br.updateCapability();
    });
    it('should run CAPABILITY if capability not set', () => {
      br.exec.returns(Promise.resolve());
      br._capability = [];
      return br.updateCapability().then(() => {
        expect(br.exec.args[0][0]).to.equal('CAPABILITY');
      });
    });
    it('should force run CAPABILITY', () => {
      br.exec.returns(Promise.resolve());
      br._capability = ['abc'];
      return br.updateCapability(true).then(() => {
        expect(br.exec.args[0][0]).to.equal('CAPABILITY');
      });
    });
    it('should do nothing if connection is not yet upgraded', () => {
      br._capability = [];
      br.client.secureMode = false;
      br._requireTLS = true;
      br.updateCapability();
    });
  });
  describe('#listNamespaces', () => {
    beforeEach(() => {
      sinon.stub(br, 'exec');
    });
    it('should run NAMESPACE if supported', () => {
      br.exec.returns(Promise.resolve({
        payload: {
          NAMESPACE: [{
            attributes: [[[{
              type: 'STRING',
              value: 'INBOX.'
            }, {
              type: 'STRING',
              value: '.'
            }]], null, null]
          }]
        }
      }));
      br._capability = ['NAMESPACE'];
      return br.listNamespaces().then(namespaces => {
        expect(namespaces).to.deep.equal({
          personal: [{
            prefix: 'INBOX.',
            delimiter: '.'
          }],
          users: false,
          shared: false
        });
        expect(br.exec.args[0][0]).to.equal('NAMESPACE');
        expect(br.exec.args[0][1]).to.equal('NAMESPACE');
      });
    });
    it('should do nothing if not supported', () => {
      br._capability = [];
      return br.listNamespaces().then(namespaces => {
        expect(namespaces).to.be.false;
        expect(br.exec.callCount).to.equal(0);
      });
    });
  });
  describe('#compressConnection', () => {
    beforeEach(() => {
      sinon.stub(br, 'exec');
      sinon.stub(br.client, 'enableCompression');
    });
    it('should run COMPRESS=DEFLATE if supported', () => {
      br.exec.withArgs({
        command: 'COMPRESS',
        attributes: [{
          type: 'ATOM',
          value: 'DEFLATE'
        }]
      }).returns(Promise.resolve({}));
      br._enableCompression = true;
      br._capability = ['COMPRESS=DEFLATE'];
      return br.compressConnection().then(() => {
        expect(br.exec.callCount).to.equal(1);
        expect(br.client.enableCompression.callCount).to.equal(1);
      });
    });
    it('should do nothing if not supported', () => {
      br._capability = [];
      return br.compressConnection().then(() => {
        expect(br.exec.callCount).to.equal(0);
      });
    });
    it('should do nothing if not enabled', () => {
      br._enableCompression = false;
      br._capability = ['COMPRESS=DEFLATE'];
      return br.compressConnection().then(() => {
        expect(br.exec.callCount).to.equal(0);
      });
    });
  });
  describe('#login', () => {
    it('should call LOGIN', () => {
      sinon.stub(br, 'exec').returns(Promise.resolve({}));
      sinon.stub(br, 'updateCapability').returns(Promise.resolve(true));
      return br.login({
        user: 'u1',
        pass: 'p1'
      }).then(() => {
        expect(br.exec.callCount).to.equal(1);
        expect(br.exec.args[0][0]).to.deep.equal({
          command: 'login',
          attributes: [{
            type: 'STRING',
            value: 'u1'
          }, {
            type: 'STRING',
            value: 'p1',
            sensitive: true
          }]
        });
      });
    });
    it('should call AUTHENTICATE', () => {
      sinon.stub(br, 'exec').returns(Promise.resolve({}));
      sinon.stub(br, 'updateCapability').returns(Promise.resolve(true));
      br._capability = ['AUTH=PLAIN'];
      return br.login({
        user: 'u1',
        pass: 'p1'
      }).then(() => {
        expect(br.exec.callCount).to.equal(1);
        expect(br.exec.args[0][0]).to.deep.equal({
          command: 'AUTHENTICATE',
          attributes: [{
            type: 'TEXT',
            value: 'PLAIN'
          }, {
            chunk: true,
            type: 'TEXT',
            value: 'AHUxAHAx',
            sensitive: true
          }]
        });
      });
    });
    it('should call XOAUTH2', () => {
      sinon.stub(br, 'exec').returns(Promise.resolve({}));
      sinon.stub(br, 'updateCapability').returns(Promise.resolve(true));
      br._capability = ['AUTH=XOAUTH2'];
      br.login({
        user: 'u1',
        xoauth2: 'abc'
      }).then(() => {
        expect(br.exec.callCount).to.equal(1);
        expect(br.exec.args[0][0]).to.deep.equal({
          command: 'AUTHENTICATE',
          attributes: [{
            type: 'ATOM',
            value: 'XOAUTH2'
          }, {
            type: 'ATOM',
            value: 'dXNlcj11MQFhdXRoPUJlYXJlciBhYmMBAQ==',
            sensitive: true
          }]
        });
      });
    });
  });
  describe('#updateId', () => {
    beforeEach(() => {
      sinon.stub(br, 'exec');
    });
    it('should not nothing if not supported', () => {
      br._capability = [];
      return br.updateId({
        a: 'b',
        c: 'd'
      }).then(() => {
        expect(br.serverId).to.be.false;
      });
    });
    it('should send NIL', () => {
      br.exec.withArgs({
        command: 'ID',
        attributes: [null]
      }).returns(Promise.resolve({
        payload: {
          ID: [{
            attributes: [null]
          }]
        }
      }));
      br._capability = ['ID'];
      return br.updateId(null).then(() => {
        expect(br.serverId).to.deep.equal({});
      });
    });
    it('should exhange ID values', () => {
      br.exec.withArgs({
        command: 'ID',
        attributes: [['ckey1', 'cval1', 'ckey2', 'cval2']]
      }).returns(Promise.resolve({
        payload: {
          ID: [{
            attributes: [[{
              value: 'skey1'
            }, {
              value: 'sval1'
            }, {
              value: 'skey2'
            }, {
              value: 'sval2'
            }]]
          }]
        }
      }));
      br._capability = ['ID'];
      return br.updateId({
        ckey1: 'cval1',
        ckey2: 'cval2'
      }).then(() => {
        expect(br.serverId).to.deep.equal({
          skey1: 'sval1',
          skey2: 'sval2'
        });
      });
    });
  });
  describe('#listMailboxes', () => {
    beforeEach(() => {
      sinon.stub(br, 'exec');
    });
    it('should call LIST and LSUB in sequence', () => {
      br.exec.withArgs({
        command: 'LIST',
        attributes: ['', '*']
      }).returns(Promise.resolve({
        payload: {
          LIST: [false]
        }
      }));
      br.exec.withArgs({
        command: 'LSUB',
        attributes: ['', '*']
      }).returns(Promise.resolve({
        payload: {
          LSUB: [false]
        }
      }));
      return br.listMailboxes().then(tree => {
        expect(tree).to.exist;
      });
    });
    it('should not die on NIL separators', () => {
      br.exec.withArgs({
        command: 'LIST',
        attributes: ['', '*']
      }).returns(Promise.resolve({
        payload: {
          LIST: [(0, _emailjsImapHandler.parser)((0, _common.toTypedArray)('* LIST (\\NoInferiors) NIL "INBOX"'))]
        }
      }));
      br.exec.withArgs({
        command: 'LSUB',
        attributes: ['', '*']
      }).returns(Promise.resolve({
        payload: {
          LSUB: [(0, _emailjsImapHandler.parser)((0, _common.toTypedArray)('* LSUB (\\NoInferiors) NIL "INBOX"'))]
        }
      }));
      return br.listMailboxes().then(tree => {
        expect(tree).to.exist;
      });
    });
  });
  describe('#createMailbox', () => {
    beforeEach(() => {
      sinon.stub(br, 'exec');
    });
    it('should call CREATE with a string payload', () => {
      // The spec allows unquoted ATOM-style syntax too, but for
      // simplicity we always generate a string even if it could be
      // expressed as an atom.
      br.exec.withArgs({
        command: 'CREATE',
        attributes: ['mailboxname']
      }).returns(Promise.resolve());
      return br.createMailbox('mailboxname').then(() => {
        expect(br.exec.callCount).to.equal(1);
      });
    });
    it('should treat an ALREADYEXISTS response as success', () => {
      var fakeErr = {
        code: 'ALREADYEXISTS'
      };
      br.exec.withArgs({
        command: 'CREATE',
        attributes: ['mailboxname']
      }).returns(Promise.reject(fakeErr));
      return br.createMailbox('mailboxname').then(() => {
        expect(br.exec.callCount).to.equal(1);
      });
    });
  });
  describe('#deleteMailbox', () => {
    beforeEach(() => {
      sinon.stub(br, 'exec');
    });
    it('should call DELETE with a string payload', () => {
      br.exec.withArgs({
        command: 'DELETE',
        attributes: ['mailboxname']
      }).returns(Promise.resolve());
      return br.deleteMailbox('mailboxname').then(() => {
        expect(br.exec.callCount).to.equal(1);
      });
    });
  });
  describe.skip('#listMessages', () => {
    beforeEach(() => {
      sinon.stub(br, 'exec');
      sinon.stub(br, '_buildFETCHCommand');
      sinon.stub(br, '_parseFETCH');
    });
    it('should call FETCH', () => {
      br.exec.returns(Promise.resolve('abc'));
      br._buildFETCHCommand.withArgs(['1:2', ['uid', 'flags'], {
        byUid: true
      }]).returns({});
      return br.listMessages('INBOX', '1:2', ['uid', 'flags'], {
        byUid: true
      }).then(() => {
        expect(br._buildFETCHCommand.callCount).to.equal(1);
        expect(br._parseFETCH.withArgs('abc').callCount).to.equal(1);
      });
    });
  });
  describe.skip('#search', () => {
    beforeEach(() => {
      sinon.stub(br, 'exec');
      sinon.stub(br, '_buildSEARCHCommand');
      sinon.stub(br, '_parseSEARCH');
    });
    it('should call SEARCH', () => {
      br.exec.returns(Promise.resolve('abc'));
      br._buildSEARCHCommand.withArgs({
        uid: 1
      }, {
        byUid: true
      }).returns({});
      return br.search('INBOX', {
        uid: 1
      }, {
        byUid: true
      }).then(() => {
        expect(br._buildSEARCHCommand.callCount).to.equal(1);
        expect(br.exec.callCount).to.equal(1);
        expect(br._parseSEARCH.withArgs('abc').callCount).to.equal(1);
      });
    });
  });
  describe('#upload', () => {
    beforeEach(() => {
      sinon.stub(br, 'exec');
    });
    it('should call APPEND with custom flag', () => {
      br.exec.returns(Promise.resolve());
      return br.upload('mailbox', 'this is a message', {
        flags: ['\\$MyFlag']
      }).then(() => {
        expect(br.exec.callCount).to.equal(1);
      });
    });
    it('should call APPEND w/o flags', () => {
      br.exec.returns(Promise.resolve());
      return br.upload('mailbox', 'this is a message').then(() => {
        expect(br.exec.callCount).to.equal(1);
      });
    });
  });
  describe.skip('#setFlags', () => {
    beforeEach(() => {
      sinon.stub(br, 'exec');
      sinon.stub(br, '_buildSTORECommand');
      sinon.stub(br, '_parseFETCH');
    });
    it('should call STORE', () => {
      br.exec.returns(Promise.resolve('abc'));
      br._buildSTORECommand.withArgs('1:2', 'FLAGS', ['\\Seen', '$MyFlag'], {
        byUid: true
      }).returns({});
      return br.setFlags('INBOX', '1:2', ['\\Seen', '$MyFlag'], {
        byUid: true
      }).then(() => {
        expect(br.exec.callCount).to.equal(1);
        expect(br._parseFETCH.withArgs('abc').callCount).to.equal(1);
      });
    });
  });
  describe.skip('#store', () => {
    beforeEach(() => {
      sinon.stub(br, 'exec');
      sinon.stub(br, '_buildSTORECommand');
      sinon.stub(br, '_parseFETCH');
    });
    it('should call STORE', () => {
      br.exec.returns(Promise.resolve('abc'));
      br._buildSTORECommand.withArgs('1:2', '+X-GM-LABELS', ['\\Sent', '\\Junk'], {
        byUid: true
      }).returns({});
      return br.store('INBOX', '1:2', '+X-GM-LABELS', ['\\Sent', '\\Junk'], {
        byUid: true
      }).then(() => {
        expect(br._buildSTORECommand.callCount).to.equal(1);
        expect(br.exec.callCount).to.equal(1);
        expect(br._parseFETCH.withArgs('abc').callCount).to.equal(1);
      });
    });
  });
  describe('#deleteMessages', () => {
    beforeEach(() => {
      sinon.stub(br, 'setFlags');
      sinon.stub(br, 'exec');
    });
    it('should call UID EXPUNGE', () => {
      br.exec.withArgs({
        command: 'UID EXPUNGE',
        attributes: [{
          type: 'sequence',
          value: '1:2'
        }]
      }).returns(Promise.resolve('abc'));
      br.setFlags.withArgs('INBOX', '1:2', {
        add: '\\Deleted'
      }).returns(Promise.resolve());
      br._capability = ['UIDPLUS'];
      return br.deleteMessages('INBOX', '1:2', {
        byUid: true
      }).then(() => {
        expect(br.exec.callCount).to.equal(1);
      });
    });
    it('should call EXPUNGE', () => {
      br.exec.withArgs('EXPUNGE').returns(Promise.resolve('abc'));
      br.setFlags.withArgs('INBOX', '1:2', {
        add: '\\Deleted'
      }).returns(Promise.resolve());
      br._capability = [];
      return br.deleteMessages('INBOX', '1:2', {
        byUid: true
      }).then(() => {
        expect(br.exec.callCount).to.equal(1);
      });
    });
  });
  describe('#copyMessages', () => {
    beforeEach(() => {
      sinon.stub(br, 'exec');
    });
    it('should call COPY', () => {
      br.exec.withArgs({
        command: 'UID COPY',
        attributes: [{
          type: 'sequence',
          value: '1:2'
        }, {
          type: 'atom',
          value: '[Gmail]/Trash'
        }]
      }).returns(Promise.resolve({
        copyuid: ['1', '1:2', '4,3']
      }));
      return br.copyMessages('INBOX', '1:2', '[Gmail]/Trash', {
        byUid: true
      }).then(response => {
        expect(response).to.deep.equal({
          srcSeqSet: '1:2',
          destSeqSet: '4,3'
        });
        expect(br.exec.callCount).to.equal(1);
      });
    });
  });
  describe('#moveMessages', () => {
    beforeEach(() => {
      sinon.stub(br, 'exec');
      sinon.stub(br, 'copyMessages');
      sinon.stub(br, 'deleteMessages');
    });
    it('should call MOVE if supported', () => {
      br.exec.withArgs({
        command: 'UID MOVE',
        attributes: [{
          type: 'sequence',
          value: '1:2'
        }, {
          type: 'atom',
          value: '[Gmail]/Trash'
        }]
      }, ['OK']).returns(Promise.resolve('abc'));
      br._capability = ['MOVE'];
      return br.moveMessages('INBOX', '1:2', '[Gmail]/Trash', {
        byUid: true
      }).then(() => {
        expect(br.exec.callCount).to.equal(1);
      });
    });
    it('should fallback to copy+expunge', () => {
      br.copyMessages.withArgs('INBOX', '1:2', '[Gmail]/Trash', {
        byUid: true
      }).returns(Promise.resolve());
      br.deleteMessages.withArgs('1:2', {
        byUid: true
      }).returns(Promise.resolve());
      br._capability = [];
      return br.moveMessages('INBOX', '1:2', '[Gmail]/Trash', {
        byUid: true
      }).then(() => {
        expect(br.deleteMessages.callCount).to.equal(1);
      });
    });
  });
  describe('#_shouldSelectMailbox', () => {
    it('should return true when ctx is undefined', () => {
      expect(br._shouldSelectMailbox('path')).to.be.true;
    });
    it('should return true when a different path is queued', () => {
      sinon.stub(br.client, 'getPreviouslyQueued').returns({
        request: {
          command: 'SELECT',
          attributes: [{
            type: 'STRING',
            value: 'queued path'
          }]
        }
      });
      expect(br._shouldSelectMailbox('path', {})).to.be.true;
    });
    it('should return false when the same path is queued', () => {
      sinon.stub(br.client, 'getPreviouslyQueued').returns({
        request: {
          command: 'SELECT',
          attributes: [{
            type: 'STRING',
            value: 'queued path'
          }]
        }
      });
      expect(br._shouldSelectMailbox('queued path', {})).to.be.false;
    });
  });
  describe('#selectMailbox', () => {
    const path = '[Gmail]/Trash';
    beforeEach(() => {
      sinon.stub(br, 'exec');
    });
    it('should run SELECT', () => {
      br.exec.withArgs({
        command: 'SELECT',
        attributes: [{
          type: 'STRING',
          value: path
        }]
      }).returns(Promise.resolve({
        code: 'READ-WRITE'
      }));
      return br.selectMailbox(path).then(() => {
        expect(br.exec.callCount).to.equal(1);
        expect(br._state).to.equal(_client.STATE_SELECTED);
      });
    });
    it('should run SELECT with CONDSTORE', () => {
      br.exec.withArgs({
        command: 'SELECT',
        attributes: [{
          type: 'STRING',
          value: path
        }, [{
          type: 'ATOM',
          value: 'CONDSTORE'
        }]]
      }).returns(Promise.resolve({
        code: 'READ-WRITE'
      }));
      br._capability = ['CONDSTORE'];
      return br.selectMailbox(path, {
        condstore: true
      }).then(() => {
        expect(br.exec.callCount).to.equal(1);
        expect(br._state).to.equal(_client.STATE_SELECTED);
      });
    });
    describe('should emit onselectmailbox before selectMailbox is resolved', () => {
      beforeEach(() => {
        br.exec.returns(Promise.resolve({
          code: 'READ-WRITE'
        }));
      });
      it('when it returns a promise', () => {
        var promiseResolved = false;
        br.onselectmailbox = () => new Promise(resolve => {
          resolve();
          promiseResolved = true;
        });
        var onselectmailboxSpy = sinon.spy(br, 'onselectmailbox');
        return br.selectMailbox(path).then(() => {
          expect(onselectmailboxSpy.withArgs(path).callCount).to.equal(1);
          expect(promiseResolved).to.equal(true);
        });
      });
      it('when it does not return a promise', () => {
        br.onselectmailbox = () => {};
        var onselectmailboxSpy = sinon.spy(br, 'onselectmailbox');
        return br.selectMailbox(path).then(() => {
          expect(onselectmailboxSpy.withArgs(path).callCount).to.equal(1);
        });
      });
    });
    it('should emit onclosemailbox', () => {
      let called = false;
      br.exec.returns(Promise.resolve('abc')).returns(Promise.resolve({
        code: 'READ-WRITE'
      }));
      br.onclosemailbox = path => {
        expect(path).to.equal('yyy');
        called = true;
      };
      br._selectedMailbox = 'yyy';
      return br.selectMailbox(path).then(() => {
        expect(called).to.be.true;
      });
    });
  });
  describe('#subscribe and unsubscribe', () => {
    beforeEach(() => {
      sinon.stub(br, 'exec');
    });
    it('should call SUBSCRIBE with a string payload', () => {
      br.exec.withArgs({
        command: 'SUBSCRIBE',
        attributes: ['mailboxname']
      }).returns(Promise.resolve());
      return br.subscribeMailbox('mailboxname').then(() => {
        expect(br.exec.callCount).to.equal(1);
      });
    });
    it('should call UNSUBSCRIBE with a string payload', () => {
      br.exec.withArgs({
        command: 'UNSUBSCRIBE',
        attributes: ['mailboxname']
      }).returns(Promise.resolve());
      return br.unsubscribeMailbox('mailboxname').then(() => {
        expect(br.exec.callCount).to.equal(1);
      });
    });
  });
  describe('#hasCapability', () => {
    it('should detect existing capability', () => {
      br._capability = ['ZZZ'];
      expect(br.hasCapability('zzz')).to.be.true;
    });
    it('should detect non existing capability', () => {
      br._capability = ['ZZZ'];
      expect(br.hasCapability('ooo')).to.be.false;
      expect(br.hasCapability()).to.be.false;
    });
  });
  describe('#_untaggedOkHandler', () => {
    it('should update capability if present', () => {
      br._untaggedOkHandler({
        capability: ['abc']
      }, () => {});
      expect(br._capability).to.deep.equal(['abc']);
    });
  });
  describe('#_untaggedCapabilityHandler', () => {
    it('should update capability', () => {
      br._untaggedCapabilityHandler({
        attributes: [{
          value: 'abc'
        }]
      }, () => {});
      expect(br._capability).to.deep.equal(['ABC']);
    });
  });
  describe('#_untaggedExistsHandler', () => {
    it('should emit onupdate', () => {
      br.onupdate = sinon.stub();
      br._selectedMailbox = 'FOO';
      br._untaggedExistsHandler({
        nr: 123
      }, () => {});
      expect(br.onupdate.withArgs('FOO', 'exists', 123).callCount).to.equal(1);
    });
  });
  describe('#_untaggedExpungeHandler', () => {
    it('should emit onupdate', () => {
      br.onupdate = sinon.stub();
      br._selectedMailbox = 'FOO';
      br._untaggedExpungeHandler({
        nr: 123
      }, () => {});
      expect(br.onupdate.withArgs('FOO', 'expunge', 123).callCount).to.equal(1);
    });
  });
  describe.skip('#_untaggedFetchHandler', () => {
    it('should emit onupdate', () => {
      br.onupdate = sinon.stub();
      sinon.stub(br, '_parseFETCH').returns('abc');
      br._selectedMailbox = 'FOO';
      br._untaggedFetchHandler({
        nr: 123
      }, () => {});
      expect(br.onupdate.withArgs('FOO', 'fetch', 'abc').callCount).to.equal(1);
      expect(br._parseFETCH.args[0][0]).to.deep.equal({
        payload: {
          FETCH: [{
            nr: 123
          }]
        }
      });
    });
  });
  describe('#_changeState', () => {
    it('should set the state value', () => {
      br._changeState(12345);
      expect(br._state).to.equal(12345);
    });
    it('should emit onclosemailbox if mailbox was closed', () => {
      br.onclosemailbox = sinon.stub();
      br._state = _client.STATE_SELECTED;
      br._selectedMailbox = 'aaa';
      br._changeState(12345);
      expect(br._selectedMailbox).to.be.false;
      expect(br.onclosemailbox.withArgs('aaa').callCount).to.equal(1);
    });
  });
  describe('#_ensurePath', () => {
    it('should create the path if not present', () => {
      var tree = {
        children: []
      };
      expect(br._ensurePath(tree, 'hello/world', '/')).to.deep.equal({
        name: 'world',
        delimiter: '/',
        path: 'hello/world',
        children: []
      });
      expect(tree).to.deep.equal({
        children: [{
          name: 'hello',
          delimiter: '/',
          path: 'hello',
          children: [{
            name: 'world',
            delimiter: '/',
            path: 'hello/world',
            children: []
          }]
        }]
      });
    });
    it('should return existing path if possible', () => {
      var tree = {
        children: [{
          name: 'hello',
          delimiter: '/',
          path: 'hello',
          children: [{
            name: 'world',
            delimiter: '/',
            path: 'hello/world',
            children: [],
            abc: 123
          }]
        }]
      };
      expect(br._ensurePath(tree, 'hello/world', '/')).to.deep.equal({
        name: 'world',
        delimiter: '/',
        path: 'hello/world',
        children: [],
        abc: 123
      });
    });
    it('should handle case insensitive Inbox', () => {
      var tree = {
        children: []
      };
      expect(br._ensurePath(tree, 'Inbox/world', '/')).to.deep.equal({
        name: 'world',
        delimiter: '/',
        path: 'Inbox/world',
        children: []
      });
      expect(br._ensurePath(tree, 'INBOX/worlds', '/')).to.deep.equal({
        name: 'worlds',
        delimiter: '/',
        path: 'INBOX/worlds',
        children: []
      });
      expect(tree).to.deep.equal({
        children: [{
          name: 'Inbox',
          delimiter: '/',
          path: 'Inbox',
          children: [{
            name: 'world',
            delimiter: '/',
            path: 'Inbox/world',
            children: []
          }, {
            name: 'worlds',
            delimiter: '/',
            path: 'INBOX/worlds',
            children: []
          }]
        }]
      });
    });
  });
  describe('untagged updates', () => {
    it('should receive information about untagged exists', done => {
      br.client._connectionReady = true;
      br._selectedMailbox = 'FOO';
      br.onupdate = (path, type, value) => {
        expect(path).to.equal('FOO');
        expect(type).to.equal('exists');
        expect(value).to.equal(123);
        done();
      };
      br.client._onData({
        /* * 123 EXISTS\r\n */
        data: new Uint8Array([42, 32, 49, 50, 51, 32, 69, 88, 73, 83, 84, 83, 13, 10]).buffer
      });
    });
    it('should receive information about untagged expunge', done => {
      br.client._connectionReady = true;
      br._selectedMailbox = 'FOO';
      br.onupdate = (path, type, value) => {
        expect(path).to.equal('FOO');
        expect(type).to.equal('expunge');
        expect(value).to.equal(456);
        done();
      };
      br.client._onData({
        /* * 456 EXPUNGE\r\n */
        data: new Uint8Array([42, 32, 52, 53, 54, 32, 69, 88, 80, 85, 78, 71, 69, 13, 10]).buffer
      });
    });
    it('should receive information about untagged fetch', done => {
      br.client._connectionReady = true;
      br._selectedMailbox = 'FOO';
      br.onupdate = (path, type, value) => {
        expect(path).to.equal('FOO');
        expect(type).to.equal('fetch');
        expect(value).to.deep.equal({
          '#': 123,
          flags: ['\\Seen'],
          modseq: '4'
        });
        done();
      };
      br.client._onData({
        /* * 123 FETCH (FLAGS (\\Seen) MODSEQ (4))\r\n */
        data: new Uint8Array([42, 32, 49, 50, 51, 32, 70, 69, 84, 67, 72, 32, 40, 70, 76, 65, 71, 83, 32, 40, 92, 83, 101, 101, 110, 41, 32, 77, 79, 68, 83, 69, 81, 32, 40, 52, 41, 41, 13, 10]).buffer
      });
    });
  });
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY2xpZW50IiwiX2ludGVyb3BSZXF1aXJlV2lsZGNhcmQiLCJyZXF1aXJlIiwiX2VtYWlsanNJbWFwSGFuZGxlciIsIl9jb21tb24iLCJlIiwidCIsIldlYWtNYXAiLCJyIiwibiIsIl9fZXNNb2R1bGUiLCJvIiwiaSIsImYiLCJfX3Byb3RvX18iLCJkZWZhdWx0IiwiaGFzIiwiZ2V0Iiwic2V0IiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJkZXNjcmliZSIsImJyIiwiYmVmb3JlRWFjaCIsImF1dGgiLCJ1c2VyIiwicGFzcyIsIkltYXBDbGllbnQiLCJsb2dMZXZlbCIsImNsaWVudCIsInNvY2tldCIsInNlbmQiLCJ1cGdyYWRlVG9TZWN1cmUiLCJpdCIsInNpbm9uIiwic3R1YiIsIl9hdXRoZW50aWNhdGVkIiwiX2VudGVyZWRJZGxlIiwiX29uSWRsZSIsImV4cGVjdCIsImVudGVySWRsZSIsImNhbGxDb3VudCIsInRvIiwiZXF1YWwiLCJjb25uZWN0IiwicmV0dXJucyIsIlByb21pc2UiLCJyZXNvbHZlIiwiZW5xdWV1ZUNvbW1hbmQiLCJjYXBhYmlsaXR5Iiwic2V0VGltZW91dCIsIm9ucmVhZHkiLCJvcGVuQ29ubmVjdGlvbiIsInRoZW4iLCJjYWxsZWRPbmNlIiwiYmUiLCJ0cnVlIiwiX2NhcGFiaWxpdHkiLCJsZW5ndGgiLCJ1cGRhdGVDYXBhYmlsaXR5IiwidXBncmFkZUNvbm5lY3Rpb24iLCJ1cGRhdGVJZCIsImxvZ2luIiwiY29tcHJlc3NDb25uZWN0aW9uIiwiZG9uZSIsInRocm93cyIsIkVycm9yIiwiY2F0Y2giLCJlcnIiLCJleGlzdCIsImNsb3NlIiwiY2FsbGVkIiwiZmFsc2UiLCJ0aW1lb3V0Q29ubmVjdGlvbiIsIl9zdGF0ZSIsIlNUQVRFX0xPR09VVCIsImV4ZWMiLCJyZXMiLCJkZWVwIiwiYXJncyIsImNhbGxzRmFrZSIsImNvbW1hbmQiLCJfc2VsZWN0ZWRNYWlsYm94IiwidGltZW91dE5vb3AiLCJ1bmRlZmluZWQiLCJwYXlsb2FkIiwic2xpY2UiLCJVaW50OEFycmF5IiwidGltZW91dElkbGUiLCJicmVha0lkbGUiLCJzZWN1cmVNb2RlIiwid2l0aEFyZ3MiLCJ1cGdyYWRlIiwiX3JlcXVpcmVUTFMiLCJOQU1FU1BBQ0UiLCJhdHRyaWJ1dGVzIiwidHlwZSIsInZhbHVlIiwibGlzdE5hbWVzcGFjZXMiLCJuYW1lc3BhY2VzIiwicGVyc29uYWwiLCJwcmVmaXgiLCJkZWxpbWl0ZXIiLCJ1c2VycyIsInNoYXJlZCIsIl9lbmFibGVDb21wcmVzc2lvbiIsImVuYWJsZUNvbXByZXNzaW9uIiwic2Vuc2l0aXZlIiwiY2h1bmsiLCJ4b2F1dGgyIiwiYSIsImMiLCJzZXJ2ZXJJZCIsIklEIiwiY2tleTEiLCJja2V5MiIsInNrZXkxIiwic2tleTIiLCJMSVNUIiwiTFNVQiIsImxpc3RNYWlsYm94ZXMiLCJ0cmVlIiwicGFyc2VyIiwidG9UeXBlZEFycmF5IiwiY3JlYXRlTWFpbGJveCIsImZha2VFcnIiLCJjb2RlIiwicmVqZWN0IiwiZGVsZXRlTWFpbGJveCIsInNraXAiLCJfYnVpbGRGRVRDSENvbW1hbmQiLCJieVVpZCIsImxpc3RNZXNzYWdlcyIsIl9wYXJzZUZFVENIIiwiX2J1aWxkU0VBUkNIQ29tbWFuZCIsInVpZCIsInNlYXJjaCIsIl9wYXJzZVNFQVJDSCIsInVwbG9hZCIsImZsYWdzIiwiX2J1aWxkU1RPUkVDb21tYW5kIiwic2V0RmxhZ3MiLCJzdG9yZSIsImFkZCIsImRlbGV0ZU1lc3NhZ2VzIiwiY29weXVpZCIsImNvcHlNZXNzYWdlcyIsInJlc3BvbnNlIiwic3JjU2VxU2V0IiwiZGVzdFNlcVNldCIsIm1vdmVNZXNzYWdlcyIsIl9zaG91bGRTZWxlY3RNYWlsYm94IiwicmVxdWVzdCIsInBhdGgiLCJzZWxlY3RNYWlsYm94IiwiU1RBVEVfU0VMRUNURUQiLCJjb25kc3RvcmUiLCJwcm9taXNlUmVzb2x2ZWQiLCJvbnNlbGVjdG1haWxib3giLCJvbnNlbGVjdG1haWxib3hTcHkiLCJzcHkiLCJvbmNsb3NlbWFpbGJveCIsInN1YnNjcmliZU1haWxib3giLCJ1bnN1YnNjcmliZU1haWxib3giLCJoYXNDYXBhYmlsaXR5IiwiX3VudGFnZ2VkT2tIYW5kbGVyIiwiX3VudGFnZ2VkQ2FwYWJpbGl0eUhhbmRsZXIiLCJvbnVwZGF0ZSIsIl91bnRhZ2dlZEV4aXN0c0hhbmRsZXIiLCJuciIsIl91bnRhZ2dlZEV4cHVuZ2VIYW5kbGVyIiwiX3VudGFnZ2VkRmV0Y2hIYW5kbGVyIiwiRkVUQ0giLCJfY2hhbmdlU3RhdGUiLCJjaGlsZHJlbiIsIl9lbnN1cmVQYXRoIiwibmFtZSIsImFiYyIsIl9jb25uZWN0aW9uUmVhZHkiLCJfb25EYXRhIiwiZGF0YSIsImJ1ZmZlciIsIm1vZHNlcSJdLCJzb3VyY2VzIjpbIi4uL3NyYy9jbGllbnQtdW5pdC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiBlc2xpbnQtZGlzYWJsZSBuby11bnVzZWQtZXhwcmVzc2lvbnMgKi9cblxuaW1wb3J0IEltYXBDbGllbnQsIHsgU1RBVEVfU0VMRUNURUQsIFNUQVRFX0xPR09VVCB9IGZyb20gJy4vY2xpZW50J1xuaW1wb3J0IHsgcGFyc2VyIH0gZnJvbSAnZW1haWxqcy1pbWFwLWhhbmRsZXInXG5pbXBvcnQge1xuICB0b1R5cGVkQXJyYXksXG4gIExPR19MRVZFTF9OT05FIGFzIGxvZ0xldmVsXG59IGZyb20gJy4vY29tbW9uJ1xuXG5kZXNjcmliZSgnYnJvd3NlcmJveCB1bml0IHRlc3RzJywgKCkgPT4ge1xuICB2YXIgYnJcblxuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBjb25zdCBhdXRoID0geyB1c2VyOiAnYmFsZHJpYW4nLCBwYXNzOiAnc2xlZXBlci5kZScgfVxuICAgIGJyID0gbmV3IEltYXBDbGllbnQoJ3NvbWVob3N0JywgMTIzNCwgeyBhdXRoLCBsb2dMZXZlbCB9KVxuICAgIGJyLmNsaWVudC5zb2NrZXQgPSB7XG4gICAgICBzZW5kOiAoKSA9PiB7IH0sXG4gICAgICB1cGdyYWRlVG9TZWN1cmU6ICgpID0+IHsgfVxuICAgIH1cbiAgfSlcblxuICBkZXNjcmliZSgnI19vbklkbGUnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBjYWxsIGVudGVySWRsZScsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdlbnRlcklkbGUnKVxuXG4gICAgICBici5fYXV0aGVudGljYXRlZCA9IHRydWVcbiAgICAgIGJyLl9lbnRlcmVkSWRsZSA9IGZhbHNlXG4gICAgICBici5fb25JZGxlKClcblxuICAgICAgZXhwZWN0KGJyLmVudGVySWRsZS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgbm90IGNhbGwgZW50ZXJJZGxlJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2VudGVySWRsZScpXG5cbiAgICAgIGJyLl9lbnRlcmVkSWRsZSA9IHRydWVcbiAgICAgIGJyLl9vbklkbGUoKVxuXG4gICAgICBleHBlY3QoYnIuZW50ZXJJZGxlLmNhbGxDb3VudCkudG8uZXF1YWwoMClcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjb3BlbkNvbm5lY3Rpb24nLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLmNsaWVudCwgJ2Nvbm5lY3QnKVxuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICdjbG9zZScpXG4gICAgICBzaW5vbi5zdHViKGJyLmNsaWVudCwgJ2VucXVldWVDb21tYW5kJylcbiAgICB9KVxuICAgIGl0KCdzaG91bGQgb3BlbiBjb25uZWN0aW9uJywgKCkgPT4ge1xuICAgICAgYnIuY2xpZW50LmNvbm5lY3QucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIGJyLmNsaWVudC5lbnF1ZXVlQ29tbWFuZC5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIGNhcGFiaWxpdHk6IFsnY2FwYTEnLCAnY2FwYTInXVxuICAgICAgfSkpXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IGJyLmNsaWVudC5vbnJlYWR5KCksIDApXG4gICAgICByZXR1cm4gYnIub3BlbkNvbm5lY3Rpb24oKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmNsaWVudC5jb25uZWN0LmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgICAgZXhwZWN0KGJyLmNsaWVudC5lbnF1ZXVlQ29tbWFuZC5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici5fY2FwYWJpbGl0eS5sZW5ndGgpLnRvLmVxdWFsKDIpXG4gICAgICAgIGV4cGVjdChici5fY2FwYWJpbGl0eVswXSkudG8uZXF1YWwoJ2NhcGExJylcbiAgICAgICAgZXhwZWN0KGJyLl9jYXBhYmlsaXR5WzFdKS50by5lcXVhbCgnY2FwYTInKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjY29ubmVjdCcsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAnY29ubmVjdCcpXG4gICAgICBzaW5vbi5zdHViKGJyLmNsaWVudCwgJ2Nsb3NlJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICd1cGRhdGVDYXBhYmlsaXR5JylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICd1cGdyYWRlQ29ubmVjdGlvbicpXG4gICAgICBzaW5vbi5zdHViKGJyLCAndXBkYXRlSWQnKVxuICAgICAgc2lub24uc3R1YihiciwgJ2xvZ2luJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdjb21wcmVzc0Nvbm5lY3Rpb24nKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNvbm5lY3QnLCAoKSA9PiB7XG4gICAgICBici5jbGllbnQuY29ubmVjdC5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuICAgICAgYnIudXBkYXRlQ2FwYWJpbGl0eS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuICAgICAgYnIudXBncmFkZUNvbm5lY3Rpb24ucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIGJyLnVwZGF0ZUlkLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici5sb2dpbi5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuICAgICAgYnIuY29tcHJlc3NDb25uZWN0aW9uLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gYnIuY2xpZW50Lm9ucmVhZHkoKSwgMClcbiAgICAgIHJldHVybiBici5jb25uZWN0KCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5jbGllbnQuY29ubmVjdC5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici51cGRhdGVDYXBhYmlsaXR5LmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgICAgZXhwZWN0KGJyLnVwZ3JhZGVDb25uZWN0aW9uLmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgICAgZXhwZWN0KGJyLnVwZGF0ZUlkLmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgICAgZXhwZWN0KGJyLmxvZ2luLmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgICAgZXhwZWN0KGJyLmNvbXByZXNzQ29ubmVjdGlvbi5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGZhaWwgdG8gbG9naW4nLCAoZG9uZSkgPT4ge1xuICAgICAgYnIuY2xpZW50LmNvbm5lY3QucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIGJyLnVwZGF0ZUNhcGFiaWxpdHkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIGJyLnVwZ3JhZGVDb25uZWN0aW9uLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici51cGRhdGVJZC5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuICAgICAgYnIubG9naW4udGhyb3dzKG5ldyBFcnJvcigpKVxuXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IGJyLmNsaWVudC5vbnJlYWR5KCksIDApXG4gICAgICBici5jb25uZWN0KCkuY2F0Y2goKGVycikgPT4ge1xuICAgICAgICBleHBlY3QoZXJyKS50by5leGlzdFxuXG4gICAgICAgIGV4cGVjdChici5jbGllbnQuY29ubmVjdC5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici5jbGllbnQuY2xvc2UuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIudXBkYXRlQ2FwYWJpbGl0eS5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici51cGdyYWRlQ29ubmVjdGlvbi5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici51cGRhdGVJZC5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici5sb2dpbi5jYWxsZWRPbmNlKS50by5iZS50cnVlXG5cbiAgICAgICAgZXhwZWN0KGJyLmNvbXByZXNzQ29ubmVjdGlvbi5jYWxsZWQpLnRvLmJlLmZhbHNlXG5cbiAgICAgICAgZG9uZSgpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHRpbWVvdXQnLCAoZG9uZSkgPT4ge1xuICAgICAgYnIuY2xpZW50LmNvbm5lY3QucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIGJyLnRpbWVvdXRDb25uZWN0aW9uID0gMVxuXG4gICAgICBici5jb25uZWN0KCkuY2F0Y2goKGVycikgPT4ge1xuICAgICAgICBleHBlY3QoZXJyKS50by5leGlzdFxuXG4gICAgICAgIGV4cGVjdChici5jbGllbnQuY29ubmVjdC5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici5jbGllbnQuY2xvc2UuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuXG4gICAgICAgIGV4cGVjdChici51cGRhdGVDYXBhYmlsaXR5LmNhbGxlZCkudG8uYmUuZmFsc2VcbiAgICAgICAgZXhwZWN0KGJyLnVwZ3JhZGVDb25uZWN0aW9uLmNhbGxlZCkudG8uYmUuZmFsc2VcbiAgICAgICAgZXhwZWN0KGJyLnVwZGF0ZUlkLmNhbGxlZCkudG8uYmUuZmFsc2VcbiAgICAgICAgZXhwZWN0KGJyLmxvZ2luLmNhbGxlZCkudG8uYmUuZmFsc2VcbiAgICAgICAgZXhwZWN0KGJyLmNvbXByZXNzQ29ubmVjdGlvbi5jYWxsZWQpLnRvLmJlLmZhbHNlXG5cbiAgICAgICAgZG9uZSgpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNjbG9zZScsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGZvcmNlLWNsb3NlJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICdjbG9zZScpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIHJldHVybiBici5jbG9zZSgpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuX3N0YXRlKS50by5lcXVhbChTVEFURV9MT0dPVVQpXG4gICAgICAgIGV4cGVjdChici5jbGllbnQuY2xvc2UuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjZXhlYycsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdicmVha0lkbGUnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHNlbmQgc3RyaW5nIGNvbW1hbmQnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLmNsaWVudCwgJ2VucXVldWVDb21tYW5kJykucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe30pKVxuICAgICAgcmV0dXJuIGJyLmV4ZWMoJ1RFU1QnKS50aGVuKChyZXMpID0+IHtcbiAgICAgICAgZXhwZWN0KHJlcykudG8uZGVlcC5lcXVhbCh7fSlcbiAgICAgICAgZXhwZWN0KGJyLmNsaWVudC5lbnF1ZXVlQ29tbWFuZC5hcmdzWzBdWzBdKS50by5lcXVhbCgnVEVTVCcpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHVwZGF0ZSBjYXBhYmlsaXR5IGZyb20gcmVzcG9uc2UnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLmNsaWVudCwgJ2VucXVldWVDb21tYW5kJykucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBjYXBhYmlsaXR5OiBbJ0EnLCAnQiddXG4gICAgICB9KSlcbiAgICAgIHJldHVybiBici5leGVjKCdURVNUJykudGhlbigocmVzKSA9PiB7XG4gICAgICAgIGV4cGVjdChyZXMpLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICAgIGNhcGFiaWxpdHk6IFsnQScsICdCJ11cbiAgICAgICAgfSlcbiAgICAgICAgZXhwZWN0KGJyLl9jYXBhYmlsaXR5KS50by5kZWVwLmVxdWFsKFsnQScsICdCJ10pXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNlbnRlcklkbGUnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBwZXJpb2RpY2FsbHkgc2VuZCBOT09QIGlmIElETEUgbm90IHN1cHBvcnRlZCcsIChkb25lKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpLmNhbGxzRmFrZSgoY29tbWFuZCkgPT4ge1xuICAgICAgICBleHBlY3QoY29tbWFuZCkudG8uZXF1YWwoJ05PT1AnKVxuXG4gICAgICAgIGRvbmUoKVxuICAgICAgfSlcblxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbXVxuICAgICAgYnIuX3NlbGVjdGVkTWFpbGJveCA9ICdGT08nXG4gICAgICBici50aW1lb3V0Tm9vcCA9IDFcbiAgICAgIGJyLmVudGVySWRsZSgpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcGVyaW9kaWNhbGx5IHNlbmQgTk9PUCBpZiBubyBtYWlsYm94IHNlbGVjdGVkJywgKGRvbmUpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJykuY2FsbHNGYWtlKChjb21tYW5kKSA9PiB7XG4gICAgICAgIGV4cGVjdChjb21tYW5kKS50by5lcXVhbCgnTk9PUCcpXG5cbiAgICAgICAgZG9uZSgpXG4gICAgICB9KVxuXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnSURMRSddXG4gICAgICBici5fc2VsZWN0ZWRNYWlsYm94ID0gdW5kZWZpbmVkXG4gICAgICBici50aW1lb3V0Tm9vcCA9IDFcbiAgICAgIGJyLmVudGVySWRsZSgpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgYnJlYWsgSURMRSBhZnRlciB0aW1lb3V0JywgKGRvbmUpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAnZW5xdWV1ZUNvbW1hbmQnKVxuICAgICAgc2lub24uc3R1Yihici5jbGllbnQuc29ja2V0LCAnc2VuZCcpLmNhbGxzRmFrZSgocGF5bG9hZCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmVucXVldWVDb21tYW5kLmFyZ3NbMF1bMF0uY29tbWFuZCkudG8uZXF1YWwoJ0lETEUnKVxuICAgICAgICBleHBlY3QoW10uc2xpY2UuY2FsbChuZXcgVWludDhBcnJheShwYXlsb2FkKSkpLnRvLmRlZXAuZXF1YWwoWzB4NDQsIDB4NGYsIDB4NGUsIDB4NDUsIDB4MGQsIDB4MGFdKVxuXG4gICAgICAgIGRvbmUoKVxuICAgICAgfSlcblxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ0lETEUnXVxuICAgICAgYnIuX3NlbGVjdGVkTWFpbGJveCA9ICdGT08nXG4gICAgICBici50aW1lb3V0SWRsZSA9IDFcbiAgICAgIGJyLmVudGVySWRsZSgpXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2JyZWFrSWRsZScsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHNlbmQgRE9ORSB0byBzb2NrZXQnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLmNsaWVudC5zb2NrZXQsICdzZW5kJylcblxuICAgICAgYnIuX2VudGVyZWRJZGxlID0gJ0lETEUnXG4gICAgICBici5icmVha0lkbGUoKVxuICAgICAgZXhwZWN0KFtdLnNsaWNlLmNhbGwobmV3IFVpbnQ4QXJyYXkoYnIuY2xpZW50LnNvY2tldC5zZW5kLmFyZ3NbMF1bMF0pKSkudG8uZGVlcC5lcXVhbChbMHg0NCwgMHg0ZiwgMHg0ZSwgMHg0NSwgMHgwZCwgMHgwYV0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI3VwZ3JhZGVDb25uZWN0aW9uJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZG8gbm90aGluZyBpZiBhbHJlYWR5IHNlY3VyZWQnLCAoKSA9PiB7XG4gICAgICBici5jbGllbnQuc2VjdXJlTW9kZSA9IHRydWVcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydzdGFydHRscyddXG4gICAgICByZXR1cm4gYnIudXBncmFkZUNvbm5lY3Rpb24oKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGRvIG5vdGhpbmcgaWYgU1RBUlRUTFMgbm90IGF2YWlsYWJsZScsICgpID0+IHtcbiAgICAgIGJyLmNsaWVudC5zZWN1cmVNb2RlID0gZmFsc2VcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gW11cbiAgICAgIHJldHVybiBici51cGdyYWRlQ29ubmVjdGlvbigpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcnVuIFNUQVJUVExTJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICd1cGdyYWRlJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJykud2l0aEFyZ3MoJ1NUQVJUVExTJykucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIHNpbm9uLnN0dWIoYnIsICd1cGRhdGVDYXBhYmlsaXR5JykucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcblxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ1NUQVJUVExTJ11cblxuICAgICAgcmV0dXJuIGJyLnVwZ3JhZGVDb25uZWN0aW9uKCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5jbGllbnQudXBncmFkZS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChici5fY2FwYWJpbGl0eS5sZW5ndGgpLnRvLmVxdWFsKDApXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyN1cGRhdGVDYXBhYmlsaXR5JywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGRvIG5vdGhpbmcgaWYgY2FwYWJpbGl0eSBpcyBzZXQnLCAoKSA9PiB7XG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnYWJjJ11cbiAgICAgIHJldHVybiBici51cGRhdGVDYXBhYmlsaXR5KClcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBydW4gQ0FQQUJJTElUWSBpZiBjYXBhYmlsaXR5IG5vdCBzZXQnLCAoKSA9PiB7XG4gICAgICBici5leGVjLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gW11cblxuICAgICAgcmV0dXJuIGJyLnVwZGF0ZUNhcGFiaWxpdHkoKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuYXJnc1swXVswXSkudG8uZXF1YWwoJ0NBUEFCSUxJVFknKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBmb3JjZSBydW4gQ0FQQUJJTElUWScsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydhYmMnXVxuXG4gICAgICByZXR1cm4gYnIudXBkYXRlQ2FwYWJpbGl0eSh0cnVlKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuYXJnc1swXVswXSkudG8uZXF1YWwoJ0NBUEFCSUxJVFknKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBkbyBub3RoaW5nIGlmIGNvbm5lY3Rpb24gaXMgbm90IHlldCB1cGdyYWRlZCcsICgpID0+IHtcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gW11cbiAgICAgIGJyLmNsaWVudC5zZWN1cmVNb2RlID0gZmFsc2VcbiAgICAgIGJyLl9yZXF1aXJlVExTID0gdHJ1ZVxuXG4gICAgICBici51cGRhdGVDYXBhYmlsaXR5KClcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjbGlzdE5hbWVzcGFjZXMnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcnVuIE5BTUVTUEFDRSBpZiBzdXBwb3J0ZWQnLCAoKSA9PiB7XG4gICAgICBici5leGVjLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgIE5BTUVTUEFDRTogW3tcbiAgICAgICAgICAgIGF0dHJpYnV0ZXM6IFtcbiAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgIFt7XG4gICAgICAgICAgICAgICAgICB0eXBlOiAnU1RSSU5HJyxcbiAgICAgICAgICAgICAgICAgIHZhbHVlOiAnSU5CT1guJ1xuICAgICAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAgIHR5cGU6ICdTVFJJTkcnLFxuICAgICAgICAgICAgICAgICAgdmFsdWU6ICcuJ1xuICAgICAgICAgICAgICAgIH1dXG4gICAgICAgICAgICAgIF0sIG51bGwsIG51bGxcbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9XVxuICAgICAgICB9XG4gICAgICB9KSlcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydOQU1FU1BBQ0UnXVxuXG4gICAgICByZXR1cm4gYnIubGlzdE5hbWVzcGFjZXMoKS50aGVuKChuYW1lc3BhY2VzKSA9PiB7XG4gICAgICAgIGV4cGVjdChuYW1lc3BhY2VzKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgICBwZXJzb25hbDogW3tcbiAgICAgICAgICAgIHByZWZpeDogJ0lOQk9YLicsXG4gICAgICAgICAgICBkZWxpbWl0ZXI6ICcuJ1xuICAgICAgICAgIH1dLFxuICAgICAgICAgIHVzZXJzOiBmYWxzZSxcbiAgICAgICAgICBzaGFyZWQ6IGZhbHNlXG4gICAgICAgIH0pXG4gICAgICAgIGV4cGVjdChici5leGVjLmFyZ3NbMF1bMF0pLnRvLmVxdWFsKCdOQU1FU1BBQ0UnKVxuICAgICAgICBleHBlY3QoYnIuZXhlYy5hcmdzWzBdWzFdKS50by5lcXVhbCgnTkFNRVNQQUNFJylcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZG8gbm90aGluZyBpZiBub3Qgc3VwcG9ydGVkJywgKCkgPT4ge1xuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbXVxuICAgICAgcmV0dXJuIGJyLmxpc3ROYW1lc3BhY2VzKCkudGhlbigobmFtZXNwYWNlcykgPT4ge1xuICAgICAgICBleHBlY3QobmFtZXNwYWNlcykudG8uYmUuZmFsc2VcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgwKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjY29tcHJlc3NDb25uZWN0aW9uJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICdlbmFibGVDb21wcmVzc2lvbicpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcnVuIENPTVBSRVNTPURFRkxBVEUgaWYgc3VwcG9ydGVkJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdDT01QUkVTUycsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFt7XG4gICAgICAgICAgdHlwZTogJ0FUT00nLFxuICAgICAgICAgIHZhbHVlOiAnREVGTEFURSdcbiAgICAgICAgfV1cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHt9KSlcblxuICAgICAgYnIuX2VuYWJsZUNvbXByZXNzaW9uID0gdHJ1ZVxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ0NPTVBSRVNTPURFRkxBVEUnXVxuICAgICAgcmV0dXJuIGJyLmNvbXByZXNzQ29ubmVjdGlvbigpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChici5jbGllbnQuZW5hYmxlQ29tcHJlc3Npb24uY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBkbyBub3RoaW5nIGlmIG5vdCBzdXBwb3J0ZWQnLCAoKSA9PiB7XG4gICAgICBici5fY2FwYWJpbGl0eSA9IFtdXG5cbiAgICAgIHJldHVybiBici5jb21wcmVzc0Nvbm5lY3Rpb24oKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgwKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBkbyBub3RoaW5nIGlmIG5vdCBlbmFibGVkJywgKCkgPT4ge1xuICAgICAgYnIuX2VuYWJsZUNvbXByZXNzaW9uID0gZmFsc2VcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydDT01QUkVTUz1ERUZMQVRFJ11cblxuICAgICAgcmV0dXJuIGJyLmNvbXByZXNzQ29ubmVjdGlvbigpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDApXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNsb2dpbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGNhbGwgTE9HSU4nLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHt9KSlcbiAgICAgIHNpbm9uLnN0dWIoYnIsICd1cGRhdGVDYXBhYmlsaXR5JykucmV0dXJucyhQcm9taXNlLnJlc29sdmUodHJ1ZSkpXG5cbiAgICAgIHJldHVybiBici5sb2dpbih7XG4gICAgICAgIHVzZXI6ICd1MScsXG4gICAgICAgIHBhc3M6ICdwMSdcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChici5leGVjLmFyZ3NbMF1bMF0pLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICAgIGNvbW1hbmQ6ICdsb2dpbicsXG4gICAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICAgIHR5cGU6ICdTVFJJTkcnLFxuICAgICAgICAgICAgdmFsdWU6ICd1MSdcbiAgICAgICAgICB9LCB7XG4gICAgICAgICAgICB0eXBlOiAnU1RSSU5HJyxcbiAgICAgICAgICAgIHZhbHVlOiAncDEnLFxuICAgICAgICAgICAgc2Vuc2l0aXZlOiB0cnVlXG4gICAgICAgICAgfV1cbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBBVVRIRU5USUNBVEUnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHt9KSlcbiAgICAgIHNpbm9uLnN0dWIoYnIsICd1cGRhdGVDYXBhYmlsaXR5JykucmV0dXJucyhQcm9taXNlLnJlc29sdmUodHJ1ZSkpXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnQVVUSD1QTEFJTiddXG5cbiAgICAgIHJldHVybiBici5sb2dpbih7XG4gICAgICAgIHVzZXI6ICd1MScsXG4gICAgICAgIHBhc3M6ICdwMSdcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChici5leGVjLmFyZ3NbMF1bMF0pLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICAgIGNvbW1hbmQ6ICdBVVRIRU5USUNBVEUnLFxuICAgICAgICAgIGF0dHJpYnV0ZXM6IFt7XG4gICAgICAgICAgICB0eXBlOiAnVEVYVCcsXG4gICAgICAgICAgICB2YWx1ZTogJ1BMQUlOJ1xuICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgIGNodW5rOiB0cnVlLFxuICAgICAgICAgICAgdHlwZTogJ1RFWFQnLFxuICAgICAgICAgICAgdmFsdWU6ICdBSFV4QUhBeCcsXG4gICAgICAgICAgICBzZW5zaXRpdmU6IHRydWVcbiAgICAgICAgICB9XVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIFhPQVVUSDInLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHt9KSlcbiAgICAgIHNpbm9uLnN0dWIoYnIsICd1cGRhdGVDYXBhYmlsaXR5JykucmV0dXJucyhQcm9taXNlLnJlc29sdmUodHJ1ZSkpXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydBVVRIPVhPQVVUSDInXVxuICAgICAgYnIubG9naW4oe1xuICAgICAgICB1c2VyOiAndTEnLFxuICAgICAgICB4b2F1dGgyOiAnYWJjJ1xuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuYXJnc1swXVswXSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgICAgY29tbWFuZDogJ0FVVEhFTlRJQ0FURScsXG4gICAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICAgIHR5cGU6ICdBVE9NJyxcbiAgICAgICAgICAgIHZhbHVlOiAnWE9BVVRIMidcbiAgICAgICAgICB9LCB7XG4gICAgICAgICAgICB0eXBlOiAnQVRPTScsXG4gICAgICAgICAgICB2YWx1ZTogJ2RYTmxjajExTVFGaGRYUm9QVUpsWVhKbGNpQmhZbU1CQVE9PScsXG4gICAgICAgICAgICBzZW5zaXRpdmU6IHRydWVcbiAgICAgICAgICB9XVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjdXBkYXRlSWQnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgbm90IG5vdGhpbmcgaWYgbm90IHN1cHBvcnRlZCcsICgpID0+IHtcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gW11cblxuICAgICAgcmV0dXJuIGJyLnVwZGF0ZUlkKHtcbiAgICAgICAgYTogJ2InLFxuICAgICAgICBjOiAnZCdcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuc2VydmVySWQpLnRvLmJlLmZhbHNlXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHNlbmQgTklMJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdJRCcsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFtcbiAgICAgICAgICBudWxsXG4gICAgICAgIF1cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgIElEOiBbe1xuICAgICAgICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICAgICAgICBudWxsXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfV1cbiAgICAgICAgfVxuICAgICAgfSkpXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnSUQnXVxuXG4gICAgICByZXR1cm4gYnIudXBkYXRlSWQobnVsbCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5zZXJ2ZXJJZCkudG8uZGVlcC5lcXVhbCh7fSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZXhoYW5nZSBJRCB2YWx1ZXMnLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ0lEJyxcbiAgICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICAgIFsnY2tleTEnLCAnY3ZhbDEnLCAnY2tleTInLCAnY3ZhbDInXVxuICAgICAgICBdXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICBJRDogW3tcbiAgICAgICAgICAgIGF0dHJpYnV0ZXM6IFtcbiAgICAgICAgICAgICAgW3tcbiAgICAgICAgICAgICAgICB2YWx1ZTogJ3NrZXkxJ1xuICAgICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdmFsdWU6ICdzdmFsMSdcbiAgICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHZhbHVlOiAnc2tleTInXG4gICAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB2YWx1ZTogJ3N2YWwyJ1xuICAgICAgICAgICAgICB9XVxuICAgICAgICAgICAgXVxuICAgICAgICAgIH1dXG4gICAgICAgIH1cbiAgICAgIH0pKVxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ0lEJ11cblxuICAgICAgcmV0dXJuIGJyLnVwZGF0ZUlkKHtcbiAgICAgICAgY2tleTE6ICdjdmFsMScsXG4gICAgICAgIGNrZXkyOiAnY3ZhbDInXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLnNlcnZlcklkKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgICBza2V5MTogJ3N2YWwxJyxcbiAgICAgICAgICBza2V5MjogJ3N2YWwyJ1xuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjbGlzdE1haWxib3hlcycsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIExJU1QgYW5kIExTVUIgaW4gc2VxdWVuY2UnLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ0xJU1QnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbJycsICcqJ11cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgIExJU1Q6IFtmYWxzZV1cbiAgICAgICAgfVxuICAgICAgfSkpXG5cbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnTFNVQicsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFsnJywgJyonXVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgTFNVQjogW2ZhbHNlXVxuICAgICAgICB9XG4gICAgICB9KSlcblxuICAgICAgcmV0dXJuIGJyLmxpc3RNYWlsYm94ZXMoKS50aGVuKCh0cmVlKSA9PiB7XG4gICAgICAgIGV4cGVjdCh0cmVlKS50by5leGlzdFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBub3QgZGllIG9uIE5JTCBzZXBhcmF0b3JzJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdMSVNUJyxcbiAgICAgICAgYXR0cmlidXRlczogWycnLCAnKiddXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICBMSVNUOiBbXG4gICAgICAgICAgICBwYXJzZXIodG9UeXBlZEFycmF5KCcqIExJU1QgKFxcXFxOb0luZmVyaW9ycykgTklMIFwiSU5CT1hcIicpKVxuICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgICAgfSkpXG5cbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnTFNVQicsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFsnJywgJyonXVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgTFNVQjogW1xuICAgICAgICAgICAgcGFyc2VyKHRvVHlwZWRBcnJheSgnKiBMU1VCIChcXFxcTm9JbmZlcmlvcnMpIE5JTCBcIklOQk9YXCInKSlcbiAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICAgIH0pKVxuXG4gICAgICByZXR1cm4gYnIubGlzdE1haWxib3hlcygpLnRoZW4oKHRyZWUpID0+IHtcbiAgICAgICAgZXhwZWN0KHRyZWUpLnRvLmV4aXN0XG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNjcmVhdGVNYWlsYm94JywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgQ1JFQVRFIHdpdGggYSBzdHJpbmcgcGF5bG9hZCcsICgpID0+IHtcbiAgICAgIC8vIFRoZSBzcGVjIGFsbG93cyB1bnF1b3RlZCBBVE9NLXN0eWxlIHN5bnRheCB0b28sIGJ1dCBmb3JcbiAgICAgIC8vIHNpbXBsaWNpdHkgd2UgYWx3YXlzIGdlbmVyYXRlIGEgc3RyaW5nIGV2ZW4gaWYgaXQgY291bGQgYmVcbiAgICAgIC8vIGV4cHJlc3NlZCBhcyBhbiBhdG9tLlxuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdDUkVBVEUnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbJ21haWxib3huYW1lJ11cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIHJldHVybiBici5jcmVhdGVNYWlsYm94KCdtYWlsYm94bmFtZScpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHRyZWF0IGFuIEFMUkVBRFlFWElTVFMgcmVzcG9uc2UgYXMgc3VjY2VzcycsICgpID0+IHtcbiAgICAgIHZhciBmYWtlRXJyID0ge1xuICAgICAgICBjb2RlOiAnQUxSRUFEWUVYSVNUUydcbiAgICAgIH1cbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnQ1JFQVRFJyxcbiAgICAgICAgYXR0cmlidXRlczogWydtYWlsYm94bmFtZSddXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVqZWN0KGZha2VFcnIpKVxuXG4gICAgICByZXR1cm4gYnIuY3JlYXRlTWFpbGJveCgnbWFpbGJveG5hbWUnKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjZGVsZXRlTWFpbGJveCcsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIERFTEVURSB3aXRoIGEgc3RyaW5nIHBheWxvYWQnLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ0RFTEVURScsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFsnbWFpbGJveG5hbWUnXVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcblxuICAgICAgcmV0dXJuIGJyLmRlbGV0ZU1haWxib3goJ21haWxib3huYW1lJykudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZS5za2lwKCcjbGlzdE1lc3NhZ2VzJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgICAgc2lub24uc3R1YihiciwgJ19idWlsZEZFVENIQ29tbWFuZCcpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnX3BhcnNlRkVUQ0gnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgRkVUQ0gnLCAoKSA9PiB7XG4gICAgICBici5leGVjLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCdhYmMnKSlcbiAgICAgIGJyLl9idWlsZEZFVENIQ29tbWFuZC53aXRoQXJncyhbJzE6MicsIFsndWlkJywgJ2ZsYWdzJ10sIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH1dKS5yZXR1cm5zKHt9KVxuXG4gICAgICByZXR1cm4gYnIubGlzdE1lc3NhZ2VzKCdJTkJPWCcsICcxOjInLCBbJ3VpZCcsICdmbGFncyddLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLl9idWlsZEZFVENIQ29tbWFuZC5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChici5fcGFyc2VGRVRDSC53aXRoQXJncygnYWJjJykuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlLnNraXAoJyNzZWFyY2gnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnX2J1aWxkU0VBUkNIQ29tbWFuZCcpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnX3BhcnNlU0VBUkNIJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIFNFQVJDSCcsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMucmV0dXJucyhQcm9taXNlLnJlc29sdmUoJ2FiYycpKVxuICAgICAgYnIuX2J1aWxkU0VBUkNIQ29tbWFuZC53aXRoQXJncyh7XG4gICAgICAgIHVpZDogMVxuICAgICAgfSwge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkucmV0dXJucyh7fSlcblxuICAgICAgcmV0dXJuIGJyLnNlYXJjaCgnSU5CT1gnLCB7XG4gICAgICAgIHVpZDogMVxuICAgICAgfSwge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5fYnVpbGRTRUFSQ0hDb21tYW5kLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoYnIuX3BhcnNlU0VBUkNILndpdGhBcmdzKCdhYmMnKS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyN1cGxvYWQnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBBUFBFTkQgd2l0aCBjdXN0b20gZmxhZycsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcblxuICAgICAgcmV0dXJuIGJyLnVwbG9hZCgnbWFpbGJveCcsICd0aGlzIGlzIGEgbWVzc2FnZScsIHtcbiAgICAgICAgZmxhZ3M6IFsnXFxcXCRNeUZsYWcnXVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBBUFBFTkQgdy9vIGZsYWdzJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuXG4gICAgICByZXR1cm4gYnIudXBsb2FkKCdtYWlsYm94JywgJ3RoaXMgaXMgYSBtZXNzYWdlJykudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZS5za2lwKCcjc2V0RmxhZ3MnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnX2J1aWxkU1RPUkVDb21tYW5kJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdfcGFyc2VGRVRDSCcpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBTVE9SRScsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMucmV0dXJucyhQcm9taXNlLnJlc29sdmUoJ2FiYycpKVxuICAgICAgYnIuX2J1aWxkU1RPUkVDb21tYW5kLndpdGhBcmdzKCcxOjInLCAnRkxBR1MnLCBbJ1xcXFxTZWVuJywgJyRNeUZsYWcnXSwge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkucmV0dXJucyh7fSlcblxuICAgICAgcmV0dXJuIGJyLnNldEZsYWdzKCdJTkJPWCcsICcxOjInLCBbJ1xcXFxTZWVuJywgJyRNeUZsYWcnXSwge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGJyLl9wYXJzZUZFVENILndpdGhBcmdzKCdhYmMnKS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUuc2tpcCgnI3N0b3JlJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgICAgc2lub24uc3R1YihiciwgJ19idWlsZFNUT1JFQ29tbWFuZCcpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnX3BhcnNlRkVUQ0gnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgU1RPUkUnLCAoKSA9PiB7XG4gICAgICBici5leGVjLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCdhYmMnKSlcbiAgICAgIGJyLl9idWlsZFNUT1JFQ29tbWFuZC53aXRoQXJncygnMToyJywgJytYLUdNLUxBQkVMUycsIFsnXFxcXFNlbnQnLCAnXFxcXEp1bmsnXSwge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkucmV0dXJucyh7fSlcblxuICAgICAgcmV0dXJuIGJyLnN0b3JlKCdJTkJPWCcsICcxOjInLCAnK1gtR00tTEFCRUxTJywgWydcXFxcU2VudCcsICdcXFxcSnVuayddLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLl9idWlsZFNUT1JFQ29tbWFuZC5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGJyLl9wYXJzZUZFVENILndpdGhBcmdzKCdhYmMnKS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNkZWxldGVNZXNzYWdlcycsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdzZXRGbGFncycpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBVSUQgRVhQVU5HRScsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnVUlEIEVYUFVOR0UnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgIHR5cGU6ICdzZXF1ZW5jZScsXG4gICAgICAgICAgdmFsdWU6ICcxOjInXG4gICAgICAgIH1dXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgnYWJjJykpXG4gICAgICBici5zZXRGbGFncy53aXRoQXJncygnSU5CT1gnLCAnMToyJywge1xuICAgICAgICBhZGQ6ICdcXFxcRGVsZXRlZCdcbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydVSURQTFVTJ11cbiAgICAgIHJldHVybiBici5kZWxldGVNZXNzYWdlcygnSU5CT1gnLCAnMToyJywge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBFWFBVTkdFJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncygnRVhQVU5HRScpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCdhYmMnKSlcbiAgICAgIGJyLnNldEZsYWdzLndpdGhBcmdzKCdJTkJPWCcsICcxOjInLCB7XG4gICAgICAgIGFkZDogJ1xcXFxEZWxldGVkJ1xuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcblxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbXVxuICAgICAgcmV0dXJuIGJyLmRlbGV0ZU1lc3NhZ2VzKCdJTkJPWCcsICcxOjInLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjY29weU1lc3NhZ2VzJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgQ09QWScsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnVUlEIENPUFknLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgIHR5cGU6ICdzZXF1ZW5jZScsXG4gICAgICAgICAgdmFsdWU6ICcxOjInXG4gICAgICAgIH0sIHtcbiAgICAgICAgICB0eXBlOiAnYXRvbScsXG4gICAgICAgICAgdmFsdWU6ICdbR21haWxdL1RyYXNoJ1xuICAgICAgICB9XVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBjb3B5dWlkOiBbJzEnLCAnMToyJywgJzQsMyddXG4gICAgICB9KSlcblxuICAgICAgcmV0dXJuIGJyLmNvcHlNZXNzYWdlcygnSU5CT1gnLCAnMToyJywgJ1tHbWFpbF0vVHJhc2gnLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS50aGVuKChyZXNwb25zZSkgPT4ge1xuICAgICAgICBleHBlY3QocmVzcG9uc2UpLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICAgIHNyY1NlcVNldDogJzE6MicsXG4gICAgICAgICAgZGVzdFNlcVNldDogJzQsMydcbiAgICAgICAgfSlcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjbW92ZU1lc3NhZ2VzJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgICAgc2lub24uc3R1YihiciwgJ2NvcHlNZXNzYWdlcycpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnZGVsZXRlTWVzc2FnZXMnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgTU9WRSBpZiBzdXBwb3J0ZWQnLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ1VJRCBNT1ZFJyxcbiAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICB0eXBlOiAnc2VxdWVuY2UnLFxuICAgICAgICAgIHZhbHVlOiAnMToyJ1xuICAgICAgICB9LCB7XG4gICAgICAgICAgdHlwZTogJ2F0b20nLFxuICAgICAgICAgIHZhbHVlOiAnW0dtYWlsXS9UcmFzaCdcbiAgICAgICAgfV1cbiAgICAgIH0sIFsnT0snXSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoJ2FiYycpKVxuXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnTU9WRSddXG4gICAgICByZXR1cm4gYnIubW92ZU1lc3NhZ2VzKCdJTkJPWCcsICcxOjInLCAnW0dtYWlsXS9UcmFzaCcsIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGZhbGxiYWNrIHRvIGNvcHkrZXhwdW5nZScsICgpID0+IHtcbiAgICAgIGJyLmNvcHlNZXNzYWdlcy53aXRoQXJncygnSU5CT1gnLCAnMToyJywgJ1tHbWFpbF0vVHJhc2gnLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuICAgICAgYnIuZGVsZXRlTWVzc2FnZXMud2l0aEFyZ3MoJzE6MicsIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gW11cbiAgICAgIHJldHVybiBici5tb3ZlTWVzc2FnZXMoJ0lOQk9YJywgJzE6MicsICdbR21haWxdL1RyYXNoJywge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5kZWxldGVNZXNzYWdlcy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNfc2hvdWxkU2VsZWN0TWFpbGJveCcsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHJldHVybiB0cnVlIHdoZW4gY3R4IGlzIHVuZGVmaW5lZCcsICgpID0+IHtcbiAgICAgIGV4cGVjdChici5fc2hvdWxkU2VsZWN0TWFpbGJveCgncGF0aCcpKS50by5iZS50cnVlXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIHRydWUgd2hlbiBhIGRpZmZlcmVudCBwYXRoIGlzIHF1ZXVlZCcsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAnZ2V0UHJldmlvdXNseVF1ZXVlZCcpLnJldHVybnMoe1xuICAgICAgICByZXF1ZXN0OiB7XG4gICAgICAgICAgY29tbWFuZDogJ1NFTEVDVCcsXG4gICAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICAgIHR5cGU6ICdTVFJJTkcnLFxuICAgICAgICAgICAgdmFsdWU6ICdxdWV1ZWQgcGF0aCdcbiAgICAgICAgICB9XVxuICAgICAgICB9XG4gICAgICB9KVxuXG4gICAgICBleHBlY3QoYnIuX3Nob3VsZFNlbGVjdE1haWxib3goJ3BhdGgnLCB7fSkpLnRvLmJlLnRydWVcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gZmFsc2Ugd2hlbiB0aGUgc2FtZSBwYXRoIGlzIHF1ZXVlZCcsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAnZ2V0UHJldmlvdXNseVF1ZXVlZCcpLnJldHVybnMoe1xuICAgICAgICByZXF1ZXN0OiB7XG4gICAgICAgICAgY29tbWFuZDogJ1NFTEVDVCcsXG4gICAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICAgIHR5cGU6ICdTVFJJTkcnLFxuICAgICAgICAgICAgdmFsdWU6ICdxdWV1ZWQgcGF0aCdcbiAgICAgICAgICB9XVxuICAgICAgICB9XG4gICAgICB9KVxuXG4gICAgICBleHBlY3QoYnIuX3Nob3VsZFNlbGVjdE1haWxib3goJ3F1ZXVlZCBwYXRoJywge30pKS50by5iZS5mYWxzZVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNzZWxlY3RNYWlsYm94JywgKCkgPT4ge1xuICAgIGNvbnN0IHBhdGggPSAnW0dtYWlsXS9UcmFzaCdcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBydW4gU0VMRUNUJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdTRUxFQ1QnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgIHR5cGU6ICdTVFJJTkcnLFxuICAgICAgICAgIHZhbHVlOiBwYXRoXG4gICAgICAgIH1dXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIGNvZGU6ICdSRUFELVdSSVRFJ1xuICAgICAgfSkpXG5cbiAgICAgIHJldHVybiBici5zZWxlY3RNYWlsYm94KHBhdGgpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChici5fc3RhdGUpLnRvLmVxdWFsKFNUQVRFX1NFTEVDVEVEKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBydW4gU0VMRUNUIHdpdGggQ09ORFNUT1JFJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdTRUxFQ1QnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgIHR5cGU6ICdTVFJJTkcnLFxuICAgICAgICAgIHZhbHVlOiBwYXRoXG4gICAgICAgIH0sXG4gICAgICAgIFt7XG4gICAgICAgICAgdHlwZTogJ0FUT00nLFxuICAgICAgICAgIHZhbHVlOiAnQ09ORFNUT1JFJ1xuICAgICAgICB9XVxuICAgICAgICBdXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIGNvZGU6ICdSRUFELVdSSVRFJ1xuICAgICAgfSkpXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydDT05EU1RPUkUnXVxuICAgICAgcmV0dXJuIGJyLnNlbGVjdE1haWxib3gocGF0aCwge1xuICAgICAgICBjb25kc3RvcmU6IHRydWVcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChici5fc3RhdGUpLnRvLmVxdWFsKFNUQVRFX1NFTEVDVEVEKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgZGVzY3JpYmUoJ3Nob3VsZCBlbWl0IG9uc2VsZWN0bWFpbGJveCBiZWZvcmUgc2VsZWN0TWFpbGJveCBpcyByZXNvbHZlZCcsICgpID0+IHtcbiAgICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgICBici5leGVjLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICBjb2RlOiAnUkVBRC1XUklURSdcbiAgICAgICAgfSkpXG4gICAgICB9KVxuXG4gICAgICBpdCgnd2hlbiBpdCByZXR1cm5zIGEgcHJvbWlzZScsICgpID0+IHtcbiAgICAgICAgdmFyIHByb21pc2VSZXNvbHZlZCA9IGZhbHNlXG4gICAgICAgIGJyLm9uc2VsZWN0bWFpbGJveCA9ICgpID0+IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgcmVzb2x2ZSgpXG4gICAgICAgICAgcHJvbWlzZVJlc29sdmVkID0gdHJ1ZVxuICAgICAgICB9KVxuICAgICAgICB2YXIgb25zZWxlY3RtYWlsYm94U3B5ID0gc2lub24uc3B5KGJyLCAnb25zZWxlY3RtYWlsYm94JylcbiAgICAgICAgcmV0dXJuIGJyLnNlbGVjdE1haWxib3gocGF0aCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgZXhwZWN0KG9uc2VsZWN0bWFpbGJveFNweS53aXRoQXJncyhwYXRoKS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgICAgZXhwZWN0KHByb21pc2VSZXNvbHZlZCkudG8uZXF1YWwodHJ1ZSlcbiAgICAgICAgfSlcbiAgICAgIH0pXG5cbiAgICAgIGl0KCd3aGVuIGl0IGRvZXMgbm90IHJldHVybiBhIHByb21pc2UnLCAoKSA9PiB7XG4gICAgICAgIGJyLm9uc2VsZWN0bWFpbGJveCA9ICgpID0+IHsgfVxuICAgICAgICB2YXIgb25zZWxlY3RtYWlsYm94U3B5ID0gc2lub24uc3B5KGJyLCAnb25zZWxlY3RtYWlsYm94JylcbiAgICAgICAgcmV0dXJuIGJyLnNlbGVjdE1haWxib3gocGF0aCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgZXhwZWN0KG9uc2VsZWN0bWFpbGJveFNweS53aXRoQXJncyhwYXRoKS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGVtaXQgb25jbG9zZW1haWxib3gnLCAoKSA9PiB7XG4gICAgICBsZXQgY2FsbGVkID0gZmFsc2VcbiAgICAgIGJyLmV4ZWMucmV0dXJucyhQcm9taXNlLnJlc29sdmUoJ2FiYycpKS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIGNvZGU6ICdSRUFELVdSSVRFJ1xuICAgICAgfSkpXG5cbiAgICAgIGJyLm9uY2xvc2VtYWlsYm94ID0gKHBhdGgpID0+IHtcbiAgICAgICAgZXhwZWN0KHBhdGgpLnRvLmVxdWFsKCd5eXknKVxuICAgICAgICBjYWxsZWQgPSB0cnVlXG4gICAgICB9XG5cbiAgICAgIGJyLl9zZWxlY3RlZE1haWxib3ggPSAneXl5J1xuICAgICAgcmV0dXJuIGJyLnNlbGVjdE1haWxib3gocGF0aCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChjYWxsZWQpLnRvLmJlLnRydWVcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI3N1YnNjcmliZSBhbmQgdW5zdWJzY3JpYmUnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBTVUJTQ1JJQkUgd2l0aCBhIHN0cmluZyBwYXlsb2FkJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdTVUJTQ1JJQkUnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbJ21haWxib3huYW1lJ11cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIHJldHVybiBici5zdWJzY3JpYmVNYWlsYm94KCdtYWlsYm94bmFtZScpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgVU5TVUJTQ1JJQkUgd2l0aCBhIHN0cmluZyBwYXlsb2FkJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdVTlNVQlNDUklCRScsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFsnbWFpbGJveG5hbWUnXVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcblxuICAgICAgcmV0dXJuIGJyLnVuc3Vic2NyaWJlTWFpbGJveCgnbWFpbGJveG5hbWUnKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjaGFzQ2FwYWJpbGl0eScsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGRldGVjdCBleGlzdGluZyBjYXBhYmlsaXR5JywgKCkgPT4ge1xuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ1paWiddXG4gICAgICBleHBlY3QoYnIuaGFzQ2FwYWJpbGl0eSgnenp6JykpLnRvLmJlLnRydWVcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBkZXRlY3Qgbm9uIGV4aXN0aW5nIGNhcGFiaWxpdHknLCAoKSA9PiB7XG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnWlpaJ11cbiAgICAgIGV4cGVjdChici5oYXNDYXBhYmlsaXR5KCdvb28nKSkudG8uYmUuZmFsc2VcbiAgICAgIGV4cGVjdChici5oYXNDYXBhYmlsaXR5KCkpLnRvLmJlLmZhbHNlXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI191bnRhZ2dlZE9rSGFuZGxlcicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHVwZGF0ZSBjYXBhYmlsaXR5IGlmIHByZXNlbnQnLCAoKSA9PiB7XG4gICAgICBici5fdW50YWdnZWRPa0hhbmRsZXIoe1xuICAgICAgICBjYXBhYmlsaXR5OiBbJ2FiYyddXG4gICAgICB9LCAoKSA9PiB7IH0pXG4gICAgICBleHBlY3QoYnIuX2NhcGFiaWxpdHkpLnRvLmRlZXAuZXF1YWwoWydhYmMnXSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjX3VudGFnZ2VkQ2FwYWJpbGl0eUhhbmRsZXInLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCB1cGRhdGUgY2FwYWJpbGl0eScsICgpID0+IHtcbiAgICAgIGJyLl91bnRhZ2dlZENhcGFiaWxpdHlIYW5kbGVyKHtcbiAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICB2YWx1ZTogJ2FiYydcbiAgICAgICAgfV1cbiAgICAgIH0sICgpID0+IHsgfSlcbiAgICAgIGV4cGVjdChici5fY2FwYWJpbGl0eSkudG8uZGVlcC5lcXVhbChbJ0FCQyddKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNfdW50YWdnZWRFeGlzdHNIYW5kbGVyJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZW1pdCBvbnVwZGF0ZScsICgpID0+IHtcbiAgICAgIGJyLm9udXBkYXRlID0gc2lub24uc3R1YigpXG4gICAgICBici5fc2VsZWN0ZWRNYWlsYm94ID0gJ0ZPTydcblxuICAgICAgYnIuX3VudGFnZ2VkRXhpc3RzSGFuZGxlcih7XG4gICAgICAgIG5yOiAxMjNcbiAgICAgIH0sICgpID0+IHsgfSlcbiAgICAgIGV4cGVjdChici5vbnVwZGF0ZS53aXRoQXJncygnRk9PJywgJ2V4aXN0cycsIDEyMykuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNfdW50YWdnZWRFeHB1bmdlSGFuZGxlcicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGVtaXQgb251cGRhdGUnLCAoKSA9PiB7XG4gICAgICBici5vbnVwZGF0ZSA9IHNpbm9uLnN0dWIoKVxuICAgICAgYnIuX3NlbGVjdGVkTWFpbGJveCA9ICdGT08nXG5cbiAgICAgIGJyLl91bnRhZ2dlZEV4cHVuZ2VIYW5kbGVyKHtcbiAgICAgICAgbnI6IDEyM1xuICAgICAgfSwgKCkgPT4geyB9KVxuICAgICAgZXhwZWN0KGJyLm9udXBkYXRlLndpdGhBcmdzKCdGT08nLCAnZXhwdW5nZScsIDEyMykuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUuc2tpcCgnI191bnRhZ2dlZEZldGNoSGFuZGxlcicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGVtaXQgb251cGRhdGUnLCAoKSA9PiB7XG4gICAgICBici5vbnVwZGF0ZSA9IHNpbm9uLnN0dWIoKVxuICAgICAgc2lub24uc3R1YihiciwgJ19wYXJzZUZFVENIJykucmV0dXJucygnYWJjJylcbiAgICAgIGJyLl9zZWxlY3RlZE1haWxib3ggPSAnRk9PJ1xuXG4gICAgICBici5fdW50YWdnZWRGZXRjaEhhbmRsZXIoe1xuICAgICAgICBucjogMTIzXG4gICAgICB9LCAoKSA9PiB7IH0pXG4gICAgICBleHBlY3QoYnIub251cGRhdGUud2l0aEFyZ3MoJ0ZPTycsICdmZXRjaCcsICdhYmMnKS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICBleHBlY3QoYnIuX3BhcnNlRkVUQ0guYXJnc1swXVswXSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICBGRVRDSDogW3tcbiAgICAgICAgICAgIG5yOiAxMjNcbiAgICAgICAgICB9XVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNfY2hhbmdlU3RhdGUnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBzZXQgdGhlIHN0YXRlIHZhbHVlJywgKCkgPT4ge1xuICAgICAgYnIuX2NoYW5nZVN0YXRlKDEyMzQ1KVxuXG4gICAgICBleHBlY3QoYnIuX3N0YXRlKS50by5lcXVhbCgxMjM0NSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBlbWl0IG9uY2xvc2VtYWlsYm94IGlmIG1haWxib3ggd2FzIGNsb3NlZCcsICgpID0+IHtcbiAgICAgIGJyLm9uY2xvc2VtYWlsYm94ID0gc2lub24uc3R1YigpXG4gICAgICBici5fc3RhdGUgPSBTVEFURV9TRUxFQ1RFRFxuICAgICAgYnIuX3NlbGVjdGVkTWFpbGJveCA9ICdhYWEnXG5cbiAgICAgIGJyLl9jaGFuZ2VTdGF0ZSgxMjM0NSlcblxuICAgICAgZXhwZWN0KGJyLl9zZWxlY3RlZE1haWxib3gpLnRvLmJlLmZhbHNlXG4gICAgICBleHBlY3QoYnIub25jbG9zZW1haWxib3gud2l0aEFyZ3MoJ2FhYScpLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjX2Vuc3VyZVBhdGgnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgdGhlIHBhdGggaWYgbm90IHByZXNlbnQnLCAoKSA9PiB7XG4gICAgICB2YXIgdHJlZSA9IHtcbiAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICB9XG4gICAgICBleHBlY3QoYnIuX2Vuc3VyZVBhdGgodHJlZSwgJ2hlbGxvL3dvcmxkJywgJy8nKSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgIG5hbWU6ICd3b3JsZCcsXG4gICAgICAgIGRlbGltaXRlcjogJy8nLFxuICAgICAgICBwYXRoOiAnaGVsbG8vd29ybGQnLFxuICAgICAgICBjaGlsZHJlbjogW11cbiAgICAgIH0pXG4gICAgICBleHBlY3QodHJlZSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgIGNoaWxkcmVuOiBbe1xuICAgICAgICAgIG5hbWU6ICdoZWxsbycsXG4gICAgICAgICAgZGVsaW1pdGVyOiAnLycsXG4gICAgICAgICAgcGF0aDogJ2hlbGxvJyxcbiAgICAgICAgICBjaGlsZHJlbjogW3tcbiAgICAgICAgICAgIG5hbWU6ICd3b3JsZCcsXG4gICAgICAgICAgICBkZWxpbWl0ZXI6ICcvJyxcbiAgICAgICAgICAgIHBhdGg6ICdoZWxsby93b3JsZCcsXG4gICAgICAgICAgICBjaGlsZHJlbjogW11cbiAgICAgICAgICB9XVxuICAgICAgICB9XVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gZXhpc3RpbmcgcGF0aCBpZiBwb3NzaWJsZScsICgpID0+IHtcbiAgICAgIHZhciB0cmVlID0ge1xuICAgICAgICBjaGlsZHJlbjogW3tcbiAgICAgICAgICBuYW1lOiAnaGVsbG8nLFxuICAgICAgICAgIGRlbGltaXRlcjogJy8nLFxuICAgICAgICAgIHBhdGg6ICdoZWxsbycsXG4gICAgICAgICAgY2hpbGRyZW46IFt7XG4gICAgICAgICAgICBuYW1lOiAnd29ybGQnLFxuICAgICAgICAgICAgZGVsaW1pdGVyOiAnLycsXG4gICAgICAgICAgICBwYXRoOiAnaGVsbG8vd29ybGQnLFxuICAgICAgICAgICAgY2hpbGRyZW46IFtdLFxuICAgICAgICAgICAgYWJjOiAxMjNcbiAgICAgICAgICB9XVxuICAgICAgICB9XVxuICAgICAgfVxuICAgICAgZXhwZWN0KGJyLl9lbnN1cmVQYXRoKHRyZWUsICdoZWxsby93b3JsZCcsICcvJykpLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICBuYW1lOiAnd29ybGQnLFxuICAgICAgICBkZWxpbWl0ZXI6ICcvJyxcbiAgICAgICAgcGF0aDogJ2hlbGxvL3dvcmxkJyxcbiAgICAgICAgY2hpbGRyZW46IFtdLFxuICAgICAgICBhYmM6IDEyM1xuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgY2FzZSBpbnNlbnNpdGl2ZSBJbmJveCcsICgpID0+IHtcbiAgICAgIHZhciB0cmVlID0ge1xuICAgICAgICBjaGlsZHJlbjogW11cbiAgICAgIH1cbiAgICAgIGV4cGVjdChici5fZW5zdXJlUGF0aCh0cmVlLCAnSW5ib3gvd29ybGQnLCAnLycpKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgbmFtZTogJ3dvcmxkJyxcbiAgICAgICAgZGVsaW1pdGVyOiAnLycsXG4gICAgICAgIHBhdGg6ICdJbmJveC93b3JsZCcsXG4gICAgICAgIGNoaWxkcmVuOiBbXVxuICAgICAgfSlcbiAgICAgIGV4cGVjdChici5fZW5zdXJlUGF0aCh0cmVlLCAnSU5CT1gvd29ybGRzJywgJy8nKSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgIG5hbWU6ICd3b3JsZHMnLFxuICAgICAgICBkZWxpbWl0ZXI6ICcvJyxcbiAgICAgICAgcGF0aDogJ0lOQk9YL3dvcmxkcycsXG4gICAgICAgIGNoaWxkcmVuOiBbXVxuICAgICAgfSlcblxuICAgICAgZXhwZWN0KHRyZWUpLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICBjaGlsZHJlbjogW3tcbiAgICAgICAgICBuYW1lOiAnSW5ib3gnLFxuICAgICAgICAgIGRlbGltaXRlcjogJy8nLFxuICAgICAgICAgIHBhdGg6ICdJbmJveCcsXG4gICAgICAgICAgY2hpbGRyZW46IFt7XG4gICAgICAgICAgICBuYW1lOiAnd29ybGQnLFxuICAgICAgICAgICAgZGVsaW1pdGVyOiAnLycsXG4gICAgICAgICAgICBwYXRoOiAnSW5ib3gvd29ybGQnLFxuICAgICAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICAgICAgfSwge1xuICAgICAgICAgICAgbmFtZTogJ3dvcmxkcycsXG4gICAgICAgICAgICBkZWxpbWl0ZXI6ICcvJyxcbiAgICAgICAgICAgIHBhdGg6ICdJTkJPWC93b3JsZHMnLFxuICAgICAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICAgICAgfV1cbiAgICAgICAgfV1cbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgndW50YWdnZWQgdXBkYXRlcycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHJlY2VpdmUgaW5mb3JtYXRpb24gYWJvdXQgdW50YWdnZWQgZXhpc3RzJywgKGRvbmUpID0+IHtcbiAgICAgIGJyLmNsaWVudC5fY29ubmVjdGlvblJlYWR5ID0gdHJ1ZVxuICAgICAgYnIuX3NlbGVjdGVkTWFpbGJveCA9ICdGT08nXG4gICAgICBici5vbnVwZGF0ZSA9IChwYXRoLCB0eXBlLCB2YWx1ZSkgPT4ge1xuICAgICAgICBleHBlY3QocGF0aCkudG8uZXF1YWwoJ0ZPTycpXG4gICAgICAgIGV4cGVjdCh0eXBlKS50by5lcXVhbCgnZXhpc3RzJylcbiAgICAgICAgZXhwZWN0KHZhbHVlKS50by5lcXVhbCgxMjMpXG4gICAgICAgIGRvbmUoKVxuICAgICAgfVxuICAgICAgYnIuY2xpZW50Ll9vbkRhdGEoe1xuICAgICAgICAvKiAqIDEyMyBFWElTVFNcXHJcXG4gKi9cbiAgICAgICAgZGF0YTogbmV3IFVpbnQ4QXJyYXkoWzQyLCAzMiwgNDksIDUwLCA1MSwgMzIsIDY5LCA4OCwgNzMsIDgzLCA4NCwgODMsIDEzLCAxMF0pLmJ1ZmZlclxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCByZWNlaXZlIGluZm9ybWF0aW9uIGFib3V0IHVudGFnZ2VkIGV4cHVuZ2UnLCAoZG9uZSkgPT4ge1xuICAgICAgYnIuY2xpZW50Ll9jb25uZWN0aW9uUmVhZHkgPSB0cnVlXG4gICAgICBici5fc2VsZWN0ZWRNYWlsYm94ID0gJ0ZPTydcbiAgICAgIGJyLm9udXBkYXRlID0gKHBhdGgsIHR5cGUsIHZhbHVlKSA9PiB7XG4gICAgICAgIGV4cGVjdChwYXRoKS50by5lcXVhbCgnRk9PJylcbiAgICAgICAgZXhwZWN0KHR5cGUpLnRvLmVxdWFsKCdleHB1bmdlJylcbiAgICAgICAgZXhwZWN0KHZhbHVlKS50by5lcXVhbCg0NTYpXG4gICAgICAgIGRvbmUoKVxuICAgICAgfVxuICAgICAgYnIuY2xpZW50Ll9vbkRhdGEoe1xuICAgICAgICAvKiAqIDQ1NiBFWFBVTkdFXFxyXFxuICovXG4gICAgICAgIGRhdGE6IG5ldyBVaW50OEFycmF5KFs0MiwgMzIsIDUyLCA1MywgNTQsIDMyLCA2OSwgODgsIDgwLCA4NSwgNzgsIDcxLCA2OSwgMTMsIDEwXSkuYnVmZmVyXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJlY2VpdmUgaW5mb3JtYXRpb24gYWJvdXQgdW50YWdnZWQgZmV0Y2gnLCAoZG9uZSkgPT4ge1xuICAgICAgYnIuY2xpZW50Ll9jb25uZWN0aW9uUmVhZHkgPSB0cnVlXG4gICAgICBici5fc2VsZWN0ZWRNYWlsYm94ID0gJ0ZPTydcbiAgICAgIGJyLm9udXBkYXRlID0gKHBhdGgsIHR5cGUsIHZhbHVlKSA9PiB7XG4gICAgICAgIGV4cGVjdChwYXRoKS50by5lcXVhbCgnRk9PJylcbiAgICAgICAgZXhwZWN0KHR5cGUpLnRvLmVxdWFsKCdmZXRjaCcpXG4gICAgICAgIGV4cGVjdCh2YWx1ZSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgICAgJyMnOiAxMjMsXG4gICAgICAgICAgZmxhZ3M6IFsnXFxcXFNlZW4nXSxcbiAgICAgICAgICBtb2RzZXE6ICc0J1xuICAgICAgICB9KVxuICAgICAgICBkb25lKClcbiAgICAgIH1cbiAgICAgIGJyLmNsaWVudC5fb25EYXRhKHtcbiAgICAgICAgLyogKiAxMjMgRkVUQ0ggKEZMQUdTIChcXFxcU2VlbikgTU9EU0VRICg0KSlcXHJcXG4gKi9cbiAgICAgICAgZGF0YTogbmV3IFVpbnQ4QXJyYXkoWzQyLCAzMiwgNDksIDUwLCA1MSwgMzIsIDcwLCA2OSwgODQsIDY3LCA3MiwgMzIsIDQwLCA3MCwgNzYsIDY1LCA3MSwgODMsIDMyLCA0MCwgOTIsIDgzLCAxMDEsIDEwMSwgMTEwLCA0MSwgMzIsIDc3LCA3OSwgNjgsIDgzLCA2OSwgODEsIDMyLCA0MCwgNTIsIDQxLCA0MSwgMTMsIDEwXSkuYnVmZmVyXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG59KVxuIl0sIm1hcHBpbmdzIjoiOztBQUVBLElBQUFBLE9BQUEsR0FBQUMsdUJBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLG1CQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxPQUFBLEdBQUFGLE9BQUE7QUFHaUIsU0FBQUQsd0JBQUFJLENBQUEsRUFBQUMsQ0FBQSw2QkFBQUMsT0FBQSxNQUFBQyxDQUFBLE9BQUFELE9BQUEsSUFBQUUsQ0FBQSxPQUFBRixPQUFBLFlBQUFOLHVCQUFBLFlBQUFBLENBQUFJLENBQUEsRUFBQUMsQ0FBQSxTQUFBQSxDQUFBLElBQUFELENBQUEsSUFBQUEsQ0FBQSxDQUFBSyxVQUFBLFNBQUFMLENBQUEsTUFBQU0sQ0FBQSxFQUFBQyxDQUFBLEVBQUFDLENBQUEsS0FBQUMsU0FBQSxRQUFBQyxPQUFBLEVBQUFWLENBQUEsaUJBQUFBLENBQUEsdUJBQUFBLENBQUEseUJBQUFBLENBQUEsU0FBQVEsQ0FBQSxNQUFBRixDQUFBLEdBQUFMLENBQUEsR0FBQUcsQ0FBQSxHQUFBRCxDQUFBLFFBQUFHLENBQUEsQ0FBQUssR0FBQSxDQUFBWCxDQUFBLFVBQUFNLENBQUEsQ0FBQU0sR0FBQSxDQUFBWixDQUFBLEdBQUFNLENBQUEsQ0FBQU8sR0FBQSxDQUFBYixDQUFBLEVBQUFRLENBQUEsZ0JBQUFQLENBQUEsSUFBQUQsQ0FBQSxnQkFBQUMsQ0FBQSxPQUFBYSxjQUFBLENBQUFDLElBQUEsQ0FBQWYsQ0FBQSxFQUFBQyxDQUFBLE9BQUFNLENBQUEsSUFBQUQsQ0FBQSxHQUFBVSxNQUFBLENBQUFD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