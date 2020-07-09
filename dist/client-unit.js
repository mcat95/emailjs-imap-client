"use strict";

var _client = _interopRequireWildcard(require("./client"));

var _emailjsImapHandler = require("emailjs-imap-handler");

var _common = require("./common");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9jbGllbnQtdW5pdC5qcyJdLCJuYW1lcyI6WyJkZXNjcmliZSIsImJyIiwiYmVmb3JlRWFjaCIsImF1dGgiLCJ1c2VyIiwicGFzcyIsIkltYXBDbGllbnQiLCJsb2dMZXZlbCIsImNsaWVudCIsInNvY2tldCIsInNlbmQiLCJ1cGdyYWRlVG9TZWN1cmUiLCJpdCIsInNpbm9uIiwic3R1YiIsIl9hdXRoZW50aWNhdGVkIiwiX2VudGVyZWRJZGxlIiwiX29uSWRsZSIsImV4cGVjdCIsImVudGVySWRsZSIsImNhbGxDb3VudCIsInRvIiwiZXF1YWwiLCJjb25uZWN0IiwicmV0dXJucyIsIlByb21pc2UiLCJyZXNvbHZlIiwiZW5xdWV1ZUNvbW1hbmQiLCJjYXBhYmlsaXR5Iiwic2V0VGltZW91dCIsIm9ucmVhZHkiLCJvcGVuQ29ubmVjdGlvbiIsInRoZW4iLCJjYWxsZWRPbmNlIiwiYmUiLCJ0cnVlIiwiX2NhcGFiaWxpdHkiLCJsZW5ndGgiLCJ1cGRhdGVDYXBhYmlsaXR5IiwidXBncmFkZUNvbm5lY3Rpb24iLCJ1cGRhdGVJZCIsImxvZ2luIiwiY29tcHJlc3NDb25uZWN0aW9uIiwiZG9uZSIsInRocm93cyIsIkVycm9yIiwiY2F0Y2giLCJlcnIiLCJleGlzdCIsImNsb3NlIiwiY2FsbGVkIiwiZmFsc2UiLCJ0aW1lb3V0Q29ubmVjdGlvbiIsIl9zdGF0ZSIsIlNUQVRFX0xPR09VVCIsImV4ZWMiLCJyZXMiLCJkZWVwIiwiYXJncyIsImNhbGxzRmFrZSIsImNvbW1hbmQiLCJfc2VsZWN0ZWRNYWlsYm94IiwidGltZW91dE5vb3AiLCJ1bmRlZmluZWQiLCJwYXlsb2FkIiwic2xpY2UiLCJjYWxsIiwiVWludDhBcnJheSIsInRpbWVvdXRJZGxlIiwiYnJlYWtJZGxlIiwic2VjdXJlTW9kZSIsIndpdGhBcmdzIiwidXBncmFkZSIsIl9yZXF1aXJlVExTIiwiTkFNRVNQQUNFIiwiYXR0cmlidXRlcyIsInR5cGUiLCJ2YWx1ZSIsImxpc3ROYW1lc3BhY2VzIiwibmFtZXNwYWNlcyIsInBlcnNvbmFsIiwicHJlZml4IiwiZGVsaW1pdGVyIiwidXNlcnMiLCJzaGFyZWQiLCJfZW5hYmxlQ29tcHJlc3Npb24iLCJlbmFibGVDb21wcmVzc2lvbiIsInNlbnNpdGl2ZSIsInhvYXV0aDIiLCJhIiwiYyIsInNlcnZlcklkIiwiSUQiLCJja2V5MSIsImNrZXkyIiwic2tleTEiLCJza2V5MiIsIkxJU1QiLCJMU1VCIiwibGlzdE1haWxib3hlcyIsInRyZWUiLCJjcmVhdGVNYWlsYm94IiwiZmFrZUVyciIsImNvZGUiLCJyZWplY3QiLCJkZWxldGVNYWlsYm94Iiwic2tpcCIsIl9idWlsZEZFVENIQ29tbWFuZCIsImJ5VWlkIiwibGlzdE1lc3NhZ2VzIiwiX3BhcnNlRkVUQ0giLCJfYnVpbGRTRUFSQ0hDb21tYW5kIiwidWlkIiwic2VhcmNoIiwiX3BhcnNlU0VBUkNIIiwidXBsb2FkIiwiZmxhZ3MiLCJfYnVpbGRTVE9SRUNvbW1hbmQiLCJzZXRGbGFncyIsInN0b3JlIiwiYWRkIiwiZGVsZXRlTWVzc2FnZXMiLCJjb3B5dWlkIiwiY29weU1lc3NhZ2VzIiwicmVzcG9uc2UiLCJzcmNTZXFTZXQiLCJkZXN0U2VxU2V0IiwibW92ZU1lc3NhZ2VzIiwiX3Nob3VsZFNlbGVjdE1haWxib3giLCJyZXF1ZXN0IiwicGF0aCIsInNlbGVjdE1haWxib3giLCJTVEFURV9TRUxFQ1RFRCIsImNvbmRzdG9yZSIsInByb21pc2VSZXNvbHZlZCIsIm9uc2VsZWN0bWFpbGJveCIsIm9uc2VsZWN0bWFpbGJveFNweSIsInNweSIsIm9uY2xvc2VtYWlsYm94Iiwic3Vic2NyaWJlTWFpbGJveCIsInVuc3Vic2NyaWJlTWFpbGJveCIsImhhc0NhcGFiaWxpdHkiLCJfdW50YWdnZWRPa0hhbmRsZXIiLCJfdW50YWdnZWRDYXBhYmlsaXR5SGFuZGxlciIsIm9udXBkYXRlIiwiX3VudGFnZ2VkRXhpc3RzSGFuZGxlciIsIm5yIiwiX3VudGFnZ2VkRXhwdW5nZUhhbmRsZXIiLCJfdW50YWdnZWRGZXRjaEhhbmRsZXIiLCJGRVRDSCIsIl9jaGFuZ2VTdGF0ZSIsImNoaWxkcmVuIiwiX2Vuc3VyZVBhdGgiLCJuYW1lIiwiYWJjIiwiX2Nvbm5lY3Rpb25SZWFkeSIsIl9vbkRhdGEiLCJkYXRhIiwiYnVmZmVyIiwibW9kc2VxIl0sIm1hcHBpbmdzIjoiOztBQUVBOztBQUNBOztBQUNBOzs7Ozs7QUFKQTtBQVNBQSxRQUFRLENBQUMsdUJBQUQsRUFBMEIsTUFBTTtBQUN0QyxNQUFJQyxFQUFKO0FBRUFDLEVBQUFBLFVBQVUsQ0FBQyxNQUFNO0FBQ2YsVUFBTUMsSUFBSSxHQUFHO0FBQUVDLE1BQUFBLElBQUksRUFBRSxVQUFSO0FBQW9CQyxNQUFBQSxJQUFJLEVBQUU7QUFBMUIsS0FBYjtBQUNBSixJQUFBQSxFQUFFLEdBQUcsSUFBSUssZUFBSixDQUFlLFVBQWYsRUFBMkIsSUFBM0IsRUFBaUM7QUFBRUgsTUFBQUEsSUFBRjtBQUFRSSxNQUFBQSxRQUFRLEVBQVJBO0FBQVIsS0FBakMsQ0FBTDtBQUNBTixJQUFBQSxFQUFFLENBQUNPLE1BQUgsQ0FBVUMsTUFBVixHQUFtQjtBQUNqQkMsTUFBQUEsSUFBSSxFQUFFLE1BQU0sQ0FBRyxDQURFO0FBRWpCQyxNQUFBQSxlQUFlLEVBQUUsTUFBTSxDQUFHO0FBRlQsS0FBbkI7QUFJRCxHQVBTLENBQVY7QUFTQVgsRUFBQUEsUUFBUSxDQUFDLFVBQUQsRUFBYSxNQUFNO0FBQ3pCWSxJQUFBQSxFQUFFLENBQUMsdUJBQUQsRUFBMEIsTUFBTTtBQUNoQ0MsTUFBQUEsS0FBSyxDQUFDQyxJQUFOLENBQVdiLEVBQVgsRUFBZSxXQUFmO0FBRUFBLE1BQUFBLEVBQUUsQ0FBQ2MsY0FBSCxHQUFvQixJQUFwQjtBQUNBZCxNQUFBQSxFQUFFLENBQUNlLFlBQUgsR0FBa0IsS0FBbEI7O0FBQ0FmLE1BQUFBLEVBQUUsQ0FBQ2dCLE9BQUg7O0FBRUFDLE1BQUFBLE1BQU0sQ0FBQ2pCLEVBQUUsQ0FBQ2tCLFNBQUgsQ0FBYUMsU0FBZCxDQUFOLENBQStCQyxFQUEvQixD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QWIsRUFBaUIsRUFBakIsRUFBcUIsRUFBckIsRUFBeUIsRUFBekIsRUFBNkIsRUFBN0IsRUFBaUMsRUFBakMsRUFBcUMsRUFBckMsRUFBeUMsRUFBekMsRUFBNkMsRUFBN0MsRUFBaUQsRUFBakQsRUFBcUQsRUFBckQsRUFBeUQsRUFBekQsRUFBNkQsRUFBN0QsRUFBaUUsRUFBakUsRUFBcUUsRUFBckUsRUFBeUUsRUFBekUsRUFBNkUsRUFBN0UsRUFBaUYsRUFBakYsRUFBcUYsRUFBckYsRUFBeUYsR0FBekYsRUFBOEYsR0FBOUYsRUFBbUcsR0FBbkcsRUFBd0csRUFBeEcsRUFBNEcsRUFBNUcsRUFBZ0gsRUFBaEgsRUFBb0gsRUFBcEgsRUFBd0gsRUFBeEgsRUFBNEgsRUFBNUgsRUFBZ0ksRUFBaEksRUFBb0ksRUFBcEksRUFBd0ksRUFBeEksRUFBNEksRUFBNUksRUFBZ0osRUFBaEosRUFBb0osRUFBcEosRUFBd0osRUFBeEosRUFBNEosRUFBNUosRUFBZ0ssRUFBaEssQ0FBZixFQUFvTDJGO0FBRjFLLE9BQWxCO0FBSUQsS0FqQkMsQ0FBRjtBQWtCRCxHQWpETyxDQUFSO0FBa0RELENBaHRDTyxDQUFSIiwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50LWRpc2FibGUgbm8tdW51c2VkLWV4cHJlc3Npb25zICovXG5cbmltcG9ydCBJbWFwQ2xpZW50LCB7IFNUQVRFX1NFTEVDVEVELCBTVEFURV9MT0dPVVQgfSBmcm9tICcuL2NsaWVudCdcbmltcG9ydCB7IHBhcnNlciB9IGZyb20gJ2VtYWlsanMtaW1hcC1oYW5kbGVyJ1xuaW1wb3J0IHtcbiAgdG9UeXBlZEFycmF5LFxuICBMT0dfTEVWRUxfTk9ORSBhcyBsb2dMZXZlbFxufSBmcm9tICcuL2NvbW1vbidcblxuZGVzY3JpYmUoJ2Jyb3dzZXJib3ggdW5pdCB0ZXN0cycsICgpID0+IHtcbiAgdmFyIGJyXG5cbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgY29uc3QgYXV0aCA9IHsgdXNlcjogJ2JhbGRyaWFuJywgcGFzczogJ3NsZWVwZXIuZGUnIH1cbiAgICBiciA9IG5ldyBJbWFwQ2xpZW50KCdzb21laG9zdCcsIDEyMzQsIHsgYXV0aCwgbG9nTGV2ZWwgfSlcbiAgICBici5jbGllbnQuc29ja2V0ID0ge1xuICAgICAgc2VuZDogKCkgPT4geyB9LFxuICAgICAgdXBncmFkZVRvU2VjdXJlOiAoKSA9PiB7IH1cbiAgICB9XG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNfb25JZGxlJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgY2FsbCBlbnRlcklkbGUnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZW50ZXJJZGxlJylcblxuICAgICAgYnIuX2F1dGhlbnRpY2F0ZWQgPSB0cnVlXG4gICAgICBici5fZW50ZXJlZElkbGUgPSBmYWxzZVxuICAgICAgYnIuX29uSWRsZSgpXG5cbiAgICAgIGV4cGVjdChici5lbnRlcklkbGUuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIG5vdCBjYWxsIGVudGVySWRsZScsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdlbnRlcklkbGUnKVxuXG4gICAgICBici5fZW50ZXJlZElkbGUgPSB0cnVlXG4gICAgICBici5fb25JZGxlKClcblxuICAgICAgZXhwZWN0KGJyLmVudGVySWRsZS5jYWxsQ291bnQpLnRvLmVxdWFsKDApXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI29wZW5Db25uZWN0aW9uJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICdjb25uZWN0JylcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAnY2xvc2UnKVxuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICdlbnF1ZXVlQ29tbWFuZCcpXG4gICAgfSlcbiAgICBpdCgnc2hvdWxkIG9wZW4gY29ubmVjdGlvbicsICgpID0+IHtcbiAgICAgIGJyLmNsaWVudC5jb25uZWN0LnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici5jbGllbnQuZW5xdWV1ZUNvbW1hbmQucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBjYXBhYmlsaXR5OiBbJ2NhcGExJywgJ2NhcGEyJ11cbiAgICAgIH0pKVxuICAgICAgc2V0VGltZW91dCgoKSA9PiBici5jbGllbnQub25yZWFkeSgpLCAwKVxuICAgICAgcmV0dXJuIGJyLm9wZW5Db25uZWN0aW9uKCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5jbGllbnQuY29ubmVjdC5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici5jbGllbnQuZW5xdWV1ZUNvbW1hbmQuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIuX2NhcGFiaWxpdHkubGVuZ3RoKS50by5lcXVhbCgyKVxuICAgICAgICBleHBlY3QoYnIuX2NhcGFiaWxpdHlbMF0pLnRvLmVxdWFsKCdjYXBhMScpXG4gICAgICAgIGV4cGVjdChici5fY2FwYWJpbGl0eVsxXSkudG8uZXF1YWwoJ2NhcGEyJylcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2Nvbm5lY3QnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLmNsaWVudCwgJ2Nvbm5lY3QnKVxuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICdjbG9zZScpXG4gICAgICBzaW5vbi5zdHViKGJyLCAndXBkYXRlQ2FwYWJpbGl0eScpXG4gICAgICBzaW5vbi5zdHViKGJyLCAndXBncmFkZUNvbm5lY3Rpb24nKVxuICAgICAgc2lub24uc3R1YihiciwgJ3VwZGF0ZUlkJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdsb2dpbicpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnY29tcHJlc3NDb25uZWN0aW9uJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjb25uZWN0JywgKCkgPT4ge1xuICAgICAgYnIuY2xpZW50LmNvbm5lY3QucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIGJyLnVwZGF0ZUNhcGFiaWxpdHkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIGJyLnVwZ3JhZGVDb25uZWN0aW9uLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici51cGRhdGVJZC5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuICAgICAgYnIubG9naW4ucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIGJyLmNvbXByZXNzQ29ubmVjdGlvbi5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IGJyLmNsaWVudC5vbnJlYWR5KCksIDApXG4gICAgICByZXR1cm4gYnIuY29ubmVjdCgpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmNvbm5lY3QuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIudXBkYXRlQ2FwYWJpbGl0eS5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici51cGdyYWRlQ29ubmVjdGlvbi5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici51cGRhdGVJZC5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici5sb2dpbi5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici5jb21wcmVzc0Nvbm5lY3Rpb24uY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBmYWlsIHRvIGxvZ2luJywgKGRvbmUpID0+IHtcbiAgICAgIGJyLmNsaWVudC5jb25uZWN0LnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici51cGRhdGVDYXBhYmlsaXR5LnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici51cGdyYWRlQ29ubmVjdGlvbi5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuICAgICAgYnIudXBkYXRlSWQucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIGJyLmxvZ2luLnRocm93cyhuZXcgRXJyb3IoKSlcblxuICAgICAgc2V0VGltZW91dCgoKSA9PiBici5jbGllbnQub25yZWFkeSgpLCAwKVxuICAgICAgYnIuY29ubmVjdCgpLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgZXhwZWN0KGVycikudG8uZXhpc3RcblxuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmNvbm5lY3QuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmNsb3NlLmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgICAgZXhwZWN0KGJyLnVwZGF0ZUNhcGFiaWxpdHkuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIudXBncmFkZUNvbm5lY3Rpb24uY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIudXBkYXRlSWQuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIubG9naW4uY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuXG4gICAgICAgIGV4cGVjdChici5jb21wcmVzc0Nvbm5lY3Rpb24uY2FsbGVkKS50by5iZS5mYWxzZVxuXG4gICAgICAgIGRvbmUoKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCB0aW1lb3V0JywgKGRvbmUpID0+IHtcbiAgICAgIGJyLmNsaWVudC5jb25uZWN0LnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici50aW1lb3V0Q29ubmVjdGlvbiA9IDFcblxuICAgICAgYnIuY29ubmVjdCgpLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgZXhwZWN0KGVycikudG8uZXhpc3RcblxuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmNvbm5lY3QuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmNsb3NlLmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcblxuICAgICAgICBleHBlY3QoYnIudXBkYXRlQ2FwYWJpbGl0eS5jYWxsZWQpLnRvLmJlLmZhbHNlXG4gICAgICAgIGV4cGVjdChici51cGdyYWRlQ29ubmVjdGlvbi5jYWxsZWQpLnRvLmJlLmZhbHNlXG4gICAgICAgIGV4cGVjdChici51cGRhdGVJZC5jYWxsZWQpLnRvLmJlLmZhbHNlXG4gICAgICAgIGV4cGVjdChici5sb2dpbi5jYWxsZWQpLnRvLmJlLmZhbHNlXG4gICAgICAgIGV4cGVjdChici5jb21wcmVzc0Nvbm5lY3Rpb24uY2FsbGVkKS50by5iZS5mYWxzZVxuXG4gICAgICAgIGRvbmUoKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjY2xvc2UnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBmb3JjZS1jbG9zZScsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAnY2xvc2UnKS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuXG4gICAgICByZXR1cm4gYnIuY2xvc2UoKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLl9zdGF0ZSkudG8uZXF1YWwoU1RBVEVfTE9HT1VUKVxuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmNsb3NlLmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2V4ZWMnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnYnJlYWtJZGxlJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBzZW5kIHN0cmluZyBjb21tYW5kJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICdlbnF1ZXVlQ29tbWFuZCcpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHt9KSlcbiAgICAgIHJldHVybiBici5leGVjKCdURVNUJykudGhlbigocmVzKSA9PiB7XG4gICAgICAgIGV4cGVjdChyZXMpLnRvLmRlZXAuZXF1YWwoe30pXG4gICAgICAgIGV4cGVjdChici5jbGllbnQuZW5xdWV1ZUNvbW1hbmQuYXJnc1swXVswXSkudG8uZXF1YWwoJ1RFU1QnKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCB1cGRhdGUgY2FwYWJpbGl0eSBmcm9tIHJlc3BvbnNlJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICdlbnF1ZXVlQ29tbWFuZCcpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgY2FwYWJpbGl0eTogWydBJywgJ0InXVxuICAgICAgfSkpXG4gICAgICByZXR1cm4gYnIuZXhlYygnVEVTVCcpLnRoZW4oKHJlcykgPT4ge1xuICAgICAgICBleHBlY3QocmVzKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgICBjYXBhYmlsaXR5OiBbJ0EnLCAnQiddXG4gICAgICAgIH0pXG4gICAgICAgIGV4cGVjdChici5fY2FwYWJpbGl0eSkudG8uZGVlcC5lcXVhbChbJ0EnLCAnQiddKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjZW50ZXJJZGxlJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcGVyaW9kaWNhbGx5IHNlbmQgTk9PUCBpZiBJRExFIG5vdCBzdXBwb3J0ZWQnLCAoZG9uZSkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKS5jYWxsc0Zha2UoKGNvbW1hbmQpID0+IHtcbiAgICAgICAgZXhwZWN0KGNvbW1hbmQpLnRvLmVxdWFsKCdOT09QJylcblxuICAgICAgICBkb25lKClcbiAgICAgIH0pXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gW11cbiAgICAgIGJyLl9zZWxlY3RlZE1haWxib3ggPSAnRk9PJ1xuICAgICAgYnIudGltZW91dE5vb3AgPSAxXG4gICAgICBici5lbnRlcklkbGUoKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHBlcmlvZGljYWxseSBzZW5kIE5PT1AgaWYgbm8gbWFpbGJveCBzZWxlY3RlZCcsIChkb25lKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpLmNhbGxzRmFrZSgoY29tbWFuZCkgPT4ge1xuICAgICAgICBleHBlY3QoY29tbWFuZCkudG8uZXF1YWwoJ05PT1AnKVxuXG4gICAgICAgIGRvbmUoKVxuICAgICAgfSlcblxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ0lETEUnXVxuICAgICAgYnIuX3NlbGVjdGVkTWFpbGJveCA9IHVuZGVmaW5lZFxuICAgICAgYnIudGltZW91dE5vb3AgPSAxXG4gICAgICBici5lbnRlcklkbGUoKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGJyZWFrIElETEUgYWZ0ZXIgdGltZW91dCcsIChkb25lKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLmNsaWVudCwgJ2VucXVldWVDb21tYW5kJylcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LnNvY2tldCwgJ3NlbmQnKS5jYWxsc0Zha2UoKHBheWxvYWQpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmNsaWVudC5lbnF1ZXVlQ29tbWFuZC5hcmdzWzBdWzBdLmNvbW1hbmQpLnRvLmVxdWFsKCdJRExFJylcbiAgICAgICAgZXhwZWN0KFtdLnNsaWNlLmNhbGwobmV3IFVpbnQ4QXJyYXkocGF5bG9hZCkpKS50by5kZWVwLmVxdWFsKFsweDQ0LCAweDRmLCAweDRlLCAweDQ1LCAweDBkLCAweDBhXSlcblxuICAgICAgICBkb25lKClcbiAgICAgIH0pXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydJRExFJ11cbiAgICAgIGJyLl9zZWxlY3RlZE1haWxib3ggPSAnRk9PJ1xuICAgICAgYnIudGltZW91dElkbGUgPSAxXG4gICAgICBici5lbnRlcklkbGUoKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNicmVha0lkbGUnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBzZW5kIERPTkUgdG8gc29ja2V0JywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1Yihici5jbGllbnQuc29ja2V0LCAnc2VuZCcpXG5cbiAgICAgIGJyLl9lbnRlcmVkSWRsZSA9ICdJRExFJ1xuICAgICAgYnIuYnJlYWtJZGxlKClcbiAgICAgIGV4cGVjdChbXS5zbGljZS5jYWxsKG5ldyBVaW50OEFycmF5KGJyLmNsaWVudC5zb2NrZXQuc2VuZC5hcmdzWzBdWzBdKSkpLnRvLmRlZXAuZXF1YWwoWzB4NDQsIDB4NGYsIDB4NGUsIDB4NDUsIDB4MGQsIDB4MGFdKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyN1cGdyYWRlQ29ubmVjdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGRvIG5vdGhpbmcgaWYgYWxyZWFkeSBzZWN1cmVkJywgKCkgPT4ge1xuICAgICAgYnIuY2xpZW50LnNlY3VyZU1vZGUgPSB0cnVlXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnc3RhcnR0bHMnXVxuICAgICAgcmV0dXJuIGJyLnVwZ3JhZGVDb25uZWN0aW9uKClcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBkbyBub3RoaW5nIGlmIFNUQVJUVExTIG5vdCBhdmFpbGFibGUnLCAoKSA9PiB7XG4gICAgICBici5jbGllbnQuc2VjdXJlTW9kZSA9IGZhbHNlXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFtdXG4gICAgICByZXR1cm4gYnIudXBncmFkZUNvbm5lY3Rpb24oKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJ1biBTVEFSVFRMUycsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAndXBncmFkZScpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpLndpdGhBcmdzKCdTVEFSVFRMUycpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBzaW5vbi5zdHViKGJyLCAndXBkYXRlQ2FwYWJpbGl0eScpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydTVEFSVFRMUyddXG5cbiAgICAgIHJldHVybiBici51cGdyYWRlQ29ubmVjdGlvbigpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuY2xpZW50LnVwZ3JhZGUuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoYnIuX2NhcGFiaWxpdHkubGVuZ3RoKS50by5lcXVhbCgwKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjdXBkYXRlQ2FwYWJpbGl0eScsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBkbyBub3RoaW5nIGlmIGNhcGFiaWxpdHkgaXMgc2V0JywgKCkgPT4ge1xuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ2FiYyddXG4gICAgICByZXR1cm4gYnIudXBkYXRlQ2FwYWJpbGl0eSgpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcnVuIENBUEFCSUxJVFkgaWYgY2FwYWJpbGl0eSBub3Qgc2V0JywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFtdXG5cbiAgICAgIHJldHVybiBici51cGRhdGVDYXBhYmlsaXR5KCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmFyZ3NbMF1bMF0pLnRvLmVxdWFsKCdDQVBBQklMSVRZJylcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZm9yY2UgcnVuIENBUEFCSUxJVFknLCAoKSA9PiB7XG4gICAgICBici5leGVjLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnYWJjJ11cblxuICAgICAgcmV0dXJuIGJyLnVwZGF0ZUNhcGFiaWxpdHkodHJ1ZSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmFyZ3NbMF1bMF0pLnRvLmVxdWFsKCdDQVBBQklMSVRZJylcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZG8gbm90aGluZyBpZiBjb25uZWN0aW9uIGlzIG5vdCB5ZXQgdXBncmFkZWQnLCAoKSA9PiB7XG4gICAgICBici5fY2FwYWJpbGl0eSA9IFtdXG4gICAgICBici5jbGllbnQuc2VjdXJlTW9kZSA9IGZhbHNlXG4gICAgICBici5fcmVxdWlyZVRMUyA9IHRydWVcblxuICAgICAgYnIudXBkYXRlQ2FwYWJpbGl0eSgpXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2xpc3ROYW1lc3BhY2VzJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJ1biBOQU1FU1BBQ0UgaWYgc3VwcG9ydGVkJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICBOQU1FU1BBQ0U6IFt7XG4gICAgICAgICAgICBhdHRyaWJ1dGVzOiBbXG4gICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICBbe1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ1NUUklORycsXG4gICAgICAgICAgICAgICAgICB2YWx1ZTogJ0lOQk9YLidcbiAgICAgICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgICB0eXBlOiAnU1RSSU5HJyxcbiAgICAgICAgICAgICAgICAgIHZhbHVlOiAnLidcbiAgICAgICAgICAgICAgICB9XVxuICAgICAgICAgICAgICBdLCBudWxsLCBudWxsXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfV1cbiAgICAgICAgfVxuICAgICAgfSkpXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnTkFNRVNQQUNFJ11cblxuICAgICAgcmV0dXJuIGJyLmxpc3ROYW1lc3BhY2VzKCkudGhlbigobmFtZXNwYWNlcykgPT4ge1xuICAgICAgICBleHBlY3QobmFtZXNwYWNlcykudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgICAgcGVyc29uYWw6IFt7XG4gICAgICAgICAgICBwcmVmaXg6ICdJTkJPWC4nLFxuICAgICAgICAgICAgZGVsaW1pdGVyOiAnLidcbiAgICAgICAgICB9XSxcbiAgICAgICAgICB1c2VyczogZmFsc2UsXG4gICAgICAgICAgc2hhcmVkOiBmYWxzZVxuICAgICAgICB9KVxuICAgICAgICBleHBlY3QoYnIuZXhlYy5hcmdzWzBdWzBdKS50by5lcXVhbCgnTkFNRVNQQUNFJylcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuYXJnc1swXVsxXSkudG8uZXF1YWwoJ05BTUVTUEFDRScpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGRvIG5vdGhpbmcgaWYgbm90IHN1cHBvcnRlZCcsICgpID0+IHtcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gW11cbiAgICAgIHJldHVybiBici5saXN0TmFtZXNwYWNlcygpLnRoZW4oKG5hbWVzcGFjZXMpID0+IHtcbiAgICAgICAgZXhwZWN0KG5hbWVzcGFjZXMpLnRvLmJlLmZhbHNlXG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMClcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2NvbXByZXNzQ29ubmVjdGlvbicsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAnZW5hYmxlQ29tcHJlc3Npb24nKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJ1biBDT01QUkVTUz1ERUZMQVRFIGlmIHN1cHBvcnRlZCcsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnQ09NUFJFU1MnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgIHR5cGU6ICdBVE9NJyxcbiAgICAgICAgICB2YWx1ZTogJ0RFRkxBVEUnXG4gICAgICAgIH1dXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7fSkpXG5cbiAgICAgIGJyLl9lbmFibGVDb21wcmVzc2lvbiA9IHRydWVcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydDT01QUkVTUz1ERUZMQVRFJ11cbiAgICAgIHJldHVybiBici5jb21wcmVzc0Nvbm5lY3Rpb24oKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmVuYWJsZUNvbXByZXNzaW9uLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZG8gbm90aGluZyBpZiBub3Qgc3VwcG9ydGVkJywgKCkgPT4ge1xuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbXVxuXG4gICAgICByZXR1cm4gYnIuY29tcHJlc3NDb25uZWN0aW9uKCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMClcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZG8gbm90aGluZyBpZiBub3QgZW5hYmxlZCcsICgpID0+IHtcbiAgICAgIGJyLl9lbmFibGVDb21wcmVzc2lvbiA9IGZhbHNlXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnQ09NUFJFU1M9REVGTEFURSddXG5cbiAgICAgIHJldHVybiBici5jb21wcmVzc0Nvbm5lY3Rpb24oKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgwKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjbG9naW4nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBjYWxsIExPR0lOJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7fSkpXG4gICAgICBzaW5vbi5zdHViKGJyLCAndXBkYXRlQ2FwYWJpbGl0eScpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHRydWUpKVxuXG4gICAgICByZXR1cm4gYnIubG9naW4oe1xuICAgICAgICB1c2VyOiAndTEnLFxuICAgICAgICBwYXNzOiAncDEnXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoYnIuZXhlYy5hcmdzWzBdWzBdKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgICBjb21tYW5kOiAnbG9naW4nLFxuICAgICAgICAgIGF0dHJpYnV0ZXM6IFt7XG4gICAgICAgICAgICB0eXBlOiAnU1RSSU5HJyxcbiAgICAgICAgICAgIHZhbHVlOiAndTEnXG4gICAgICAgICAgfSwge1xuICAgICAgICAgICAgdHlwZTogJ1NUUklORycsXG4gICAgICAgICAgICB2YWx1ZTogJ3AxJyxcbiAgICAgICAgICAgIHNlbnNpdGl2ZTogdHJ1ZVxuICAgICAgICAgIH1dXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgWE9BVVRIMicsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJykucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe30pKVxuICAgICAgc2lub24uc3R1YihiciwgJ3VwZGF0ZUNhcGFiaWxpdHknKS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh0cnVlKSlcblxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ0FVVEg9WE9BVVRIMiddXG4gICAgICBici5sb2dpbih7XG4gICAgICAgIHVzZXI6ICd1MScsXG4gICAgICAgIHhvYXV0aDI6ICdhYmMnXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoYnIuZXhlYy5hcmdzWzBdWzBdKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgICBjb21tYW5kOiAnQVVUSEVOVElDQVRFJyxcbiAgICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgICAgdHlwZTogJ0FUT00nLFxuICAgICAgICAgICAgdmFsdWU6ICdYT0FVVEgyJ1xuICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgIHR5cGU6ICdBVE9NJyxcbiAgICAgICAgICAgIHZhbHVlOiAnZFhObGNqMTFNUUZoZFhSb1BVSmxZWEpsY2lCaFltTUJBUT09JyxcbiAgICAgICAgICAgIHNlbnNpdGl2ZTogdHJ1ZVxuICAgICAgICAgIH1dXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyN1cGRhdGVJZCcsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBub3Qgbm90aGluZyBpZiBub3Qgc3VwcG9ydGVkJywgKCkgPT4ge1xuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbXVxuXG4gICAgICByZXR1cm4gYnIudXBkYXRlSWQoe1xuICAgICAgICBhOiAnYicsXG4gICAgICAgIGM6ICdkJ1xuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5zZXJ2ZXJJZCkudG8uYmUuZmFsc2VcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgc2VuZCBOSUwnLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ0lEJyxcbiAgICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICAgIG51bGxcbiAgICAgICAgXVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgSUQ6IFt7XG4gICAgICAgICAgICBhdHRyaWJ1dGVzOiBbXG4gICAgICAgICAgICAgIG51bGxcbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9XVxuICAgICAgICB9XG4gICAgICB9KSlcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydJRCddXG5cbiAgICAgIHJldHVybiBici51cGRhdGVJZChudWxsKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLnNlcnZlcklkKS50by5kZWVwLmVxdWFsKHt9KVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBleGhhbmdlIElEIHZhbHVlcycsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnSUQnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbXG4gICAgICAgICAgWydja2V5MScsICdjdmFsMScsICdja2V5MicsICdjdmFsMiddXG4gICAgICAgIF1cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgIElEOiBbe1xuICAgICAgICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICAgICAgICBbe1xuICAgICAgICAgICAgICAgIHZhbHVlOiAnc2tleTEnXG4gICAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB2YWx1ZTogJ3N2YWwxJ1xuICAgICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdmFsdWU6ICdza2V5MidcbiAgICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHZhbHVlOiAnc3ZhbDInXG4gICAgICAgICAgICAgIH1dXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfV1cbiAgICAgICAgfVxuICAgICAgfSkpXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnSUQnXVxuXG4gICAgICByZXR1cm4gYnIudXBkYXRlSWQoe1xuICAgICAgICBja2V5MTogJ2N2YWwxJyxcbiAgICAgICAgY2tleTI6ICdjdmFsMidcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuc2VydmVySWQpLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICAgIHNrZXkxOiAnc3ZhbDEnLFxuICAgICAgICAgIHNrZXkyOiAnc3ZhbDInXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNsaXN0TWFpbGJveGVzJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgTElTVCBhbmQgTFNVQiBpbiBzZXF1ZW5jZScsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnTElTVCcsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFsnJywgJyonXVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgTElTVDogW2ZhbHNlXVxuICAgICAgICB9XG4gICAgICB9KSlcblxuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdMU1VCJyxcbiAgICAgICAgYXR0cmlidXRlczogWycnLCAnKiddXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICBMU1VCOiBbZmFsc2VdXG4gICAgICAgIH1cbiAgICAgIH0pKVxuXG4gICAgICByZXR1cm4gYnIubGlzdE1haWxib3hlcygpLnRoZW4oKHRyZWUpID0+IHtcbiAgICAgICAgZXhwZWN0KHRyZWUpLnRvLmV4aXN0XG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIG5vdCBkaWUgb24gTklMIHNlcGFyYXRvcnMnLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ0xJU1QnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbJycsICcqJ11cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgIExJU1Q6IFtcbiAgICAgICAgICAgIHBhcnNlcih0b1R5cGVkQXJyYXkoJyogTElTVCAoXFxcXE5vSW5mZXJpb3JzKSBOSUwgXCJJTkJPWFwiJykpXG4gICAgICAgICAgXVxuICAgICAgICB9XG4gICAgICB9KSlcblxuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdMU1VCJyxcbiAgICAgICAgYXR0cmlidXRlczogWycnLCAnKiddXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICBMU1VCOiBbXG4gICAgICAgICAgICBwYXJzZXIodG9UeXBlZEFycmF5KCcqIExTVUIgKFxcXFxOb0luZmVyaW9ycykgTklMIFwiSU5CT1hcIicpKVxuICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgICAgfSkpXG5cbiAgICAgIHJldHVybiBici5saXN0TWFpbGJveGVzKCkudGhlbigodHJlZSkgPT4ge1xuICAgICAgICBleHBlY3QodHJlZSkudG8uZXhpc3RcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2NyZWF0ZU1haWxib3gnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBDUkVBVEUgd2l0aCBhIHN0cmluZyBwYXlsb2FkJywgKCkgPT4ge1xuICAgICAgLy8gVGhlIHNwZWMgYWxsb3dzIHVucXVvdGVkIEFUT00tc3R5bGUgc3ludGF4IHRvbywgYnV0IGZvclxuICAgICAgLy8gc2ltcGxpY2l0eSB3ZSBhbHdheXMgZ2VuZXJhdGUgYSBzdHJpbmcgZXZlbiBpZiBpdCBjb3VsZCBiZVxuICAgICAgLy8gZXhwcmVzc2VkIGFzIGFuIGF0b20uXG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ0NSRUFURScsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFsnbWFpbGJveG5hbWUnXVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcblxuICAgICAgcmV0dXJuIGJyLmNyZWF0ZU1haWxib3goJ21haWxib3huYW1lJykudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgdHJlYXQgYW4gQUxSRUFEWUVYSVNUUyByZXNwb25zZSBhcyBzdWNjZXNzJywgKCkgPT4ge1xuICAgICAgdmFyIGZha2VFcnIgPSB7XG4gICAgICAgIGNvZGU6ICdBTFJFQURZRVhJU1RTJ1xuICAgICAgfVxuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdDUkVBVEUnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbJ21haWxib3huYW1lJ11cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZWplY3QoZmFrZUVycikpXG5cbiAgICAgIHJldHVybiBici5jcmVhdGVNYWlsYm94KCdtYWlsYm94bmFtZScpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNkZWxldGVNYWlsYm94JywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgREVMRVRFIHdpdGggYSBzdHJpbmcgcGF5bG9hZCcsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnREVMRVRFJyxcbiAgICAgICAgYXR0cmlidXRlczogWydtYWlsYm94bmFtZSddXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuXG4gICAgICByZXR1cm4gYnIuZGVsZXRlTWFpbGJveCgnbWFpbGJveG5hbWUnKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlLnNraXAoJyNsaXN0TWVzc2FnZXMnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnX2J1aWxkRkVUQ0hDb21tYW5kJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdfcGFyc2VGRVRDSCcpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBGRVRDSCcsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMucmV0dXJucyhQcm9taXNlLnJlc29sdmUoJ2FiYycpKVxuICAgICAgYnIuX2J1aWxkRkVUQ0hDb21tYW5kLndpdGhBcmdzKFsnMToyJywgWyd1aWQnLCAnZmxhZ3MnXSwge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfV0pLnJldHVybnMoe30pXG5cbiAgICAgIHJldHVybiBici5saXN0TWVzc2FnZXMoJ0lOQk9YJywgJzE6MicsIFsndWlkJywgJ2ZsYWdzJ10sIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuX2J1aWxkRkVUQ0hDb21tYW5kLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGJyLl9wYXJzZUZFVENILndpdGhBcmdzKCdhYmMnKS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUuc2tpcCgnI3NlYXJjaCcsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdfYnVpbGRTRUFSQ0hDb21tYW5kJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdfcGFyc2VTRUFSQ0gnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgU0VBUkNIJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgnYWJjJykpXG4gICAgICBici5fYnVpbGRTRUFSQ0hDb21tYW5kLndpdGhBcmdzKHtcbiAgICAgICAgdWlkOiAxXG4gICAgICB9LCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS5yZXR1cm5zKHt9KVxuXG4gICAgICByZXR1cm4gYnIuc2VhcmNoKCdJTkJPWCcsIHtcbiAgICAgICAgdWlkOiAxXG4gICAgICB9LCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLl9idWlsZFNFQVJDSENvbW1hbmQuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChici5fcGFyc2VTRUFSQ0gud2l0aEFyZ3MoJ2FiYycpLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI3VwbG9hZCcsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIEFQUEVORCB3aXRoIGN1c3RvbSBmbGFnJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuXG4gICAgICByZXR1cm4gYnIudXBsb2FkKCdtYWlsYm94JywgJ3RoaXMgaXMgYSBtZXNzYWdlJywge1xuICAgICAgICBmbGFnczogWydcXFxcJE15RmxhZyddXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIEFQUEVORCB3L28gZmxhZ3MnLCAoKSA9PiB7XG4gICAgICBici5leGVjLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIHJldHVybiBici51cGxvYWQoJ21haWxib3gnLCAndGhpcyBpcyBhIG1lc3NhZ2UnKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlLnNraXAoJyNzZXRGbGFncycsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdfYnVpbGRTVE9SRUNvbW1hbmQnKVxuICAgICAgc2lub24uc3R1YihiciwgJ19wYXJzZUZFVENIJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIFNUT1JFJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgnYWJjJykpXG4gICAgICBici5fYnVpbGRTVE9SRUNvbW1hbmQud2l0aEFyZ3MoJzE6MicsICdGTEFHUycsIFsnXFxcXFNlZW4nLCAnJE15RmxhZyddLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS5yZXR1cm5zKHt9KVxuXG4gICAgICByZXR1cm4gYnIuc2V0RmxhZ3MoJ0lOQk9YJywgJzE6MicsIFsnXFxcXFNlZW4nLCAnJE15RmxhZyddLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoYnIuX3BhcnNlRkVUQ0gud2l0aEFyZ3MoJ2FiYycpLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZS5za2lwKCcjc3RvcmUnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnX2J1aWxkU1RPUkVDb21tYW5kJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdfcGFyc2VGRVRDSCcpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBTVE9SRScsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMucmV0dXJucyhQcm9taXNlLnJlc29sdmUoJ2FiYycpKVxuICAgICAgYnIuX2J1aWxkU1RPUkVDb21tYW5kLndpdGhBcmdzKCcxOjInLCAnK1gtR00tTEFCRUxTJywgWydcXFxcU2VudCcsICdcXFxcSnVuayddLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS5yZXR1cm5zKHt9KVxuXG4gICAgICByZXR1cm4gYnIuc3RvcmUoJ0lOQk9YJywgJzE6MicsICcrWC1HTS1MQUJFTFMnLCBbJ1xcXFxTZW50JywgJ1xcXFxKdW5rJ10sIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuX2J1aWxkU1RPUkVDb21tYW5kLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoYnIuX3BhcnNlRkVUQ0gud2l0aEFyZ3MoJ2FiYycpLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2RlbGV0ZU1lc3NhZ2VzJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ3NldEZsYWdzJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIFVJRCBFWFBVTkdFJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdVSUQgRVhQVU5HRScsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFt7XG4gICAgICAgICAgdHlwZTogJ3NlcXVlbmNlJyxcbiAgICAgICAgICB2YWx1ZTogJzE6MidcbiAgICAgICAgfV1cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCdhYmMnKSlcbiAgICAgIGJyLnNldEZsYWdzLndpdGhBcmdzKCdJTkJPWCcsICcxOjInLCB7XG4gICAgICAgIGFkZDogJ1xcXFxEZWxldGVkJ1xuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcblxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ1VJRFBMVVMnXVxuICAgICAgcmV0dXJuIGJyLmRlbGV0ZU1lc3NhZ2VzKCdJTkJPWCcsICcxOjInLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIEVYUFVOR0UnLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKCdFWFBVTkdFJykucmV0dXJucyhQcm9taXNlLnJlc29sdmUoJ2FiYycpKVxuICAgICAgYnIuc2V0RmxhZ3Mud2l0aEFyZ3MoJ0lOQk9YJywgJzE6MicsIHtcbiAgICAgICAgYWRkOiAnXFxcXERlbGV0ZWQnXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFtdXG4gICAgICByZXR1cm4gYnIuZGVsZXRlTWVzc2FnZXMoJ0lOQk9YJywgJzE6MicsIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNjb3B5TWVzc2FnZXMnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBDT1BZJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdVSUQgQ09QWScsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFt7XG4gICAgICAgICAgdHlwZTogJ3NlcXVlbmNlJyxcbiAgICAgICAgICB2YWx1ZTogJzE6MidcbiAgICAgICAgfSwge1xuICAgICAgICAgIHR5cGU6ICdhdG9tJyxcbiAgICAgICAgICB2YWx1ZTogJ1tHbWFpbF0vVHJhc2gnXG4gICAgICAgIH1dXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIGNvcHl1aWQ6IFsnMScsICcxOjInLCAnNCwzJ11cbiAgICAgIH0pKVxuXG4gICAgICByZXR1cm4gYnIuY29weU1lc3NhZ2VzKCdJTkJPWCcsICcxOjInLCAnW0dtYWlsXS9UcmFzaCcsIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH0pLnRoZW4oKHJlc3BvbnNlKSA9PiB7XG4gICAgICAgIGV4cGVjdChyZXNwb25zZSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgICAgc3JjU2VxU2V0OiAnMToyJyxcbiAgICAgICAgICBkZXN0U2VxU2V0OiAnNCwzJ1xuICAgICAgICB9KVxuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNtb3ZlTWVzc2FnZXMnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnY29weU1lc3NhZ2VzJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdkZWxldGVNZXNzYWdlcycpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBNT1ZFIGlmIHN1cHBvcnRlZCcsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnVUlEIE1PVkUnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgIHR5cGU6ICdzZXF1ZW5jZScsXG4gICAgICAgICAgdmFsdWU6ICcxOjInXG4gICAgICAgIH0sIHtcbiAgICAgICAgICB0eXBlOiAnYXRvbScsXG4gICAgICAgICAgdmFsdWU6ICdbR21haWxdL1RyYXNoJ1xuICAgICAgICB9XVxuICAgICAgfSwgWydPSyddKS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgnYWJjJykpXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydNT1ZFJ11cbiAgICAgIHJldHVybiBici5tb3ZlTWVzc2FnZXMoJ0lOQk9YJywgJzE6MicsICdbR21haWxdL1RyYXNoJywge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZmFsbGJhY2sgdG8gY29weStleHB1bmdlJywgKCkgPT4ge1xuICAgICAgYnIuY29weU1lc3NhZ2VzLndpdGhBcmdzKCdJTkJPWCcsICcxOjInLCAnW0dtYWlsXS9UcmFzaCcsIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici5kZWxldGVNZXNzYWdlcy53aXRoQXJncygnMToyJywge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcblxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbXVxuICAgICAgcmV0dXJuIGJyLm1vdmVNZXNzYWdlcygnSU5CT1gnLCAnMToyJywgJ1tHbWFpbF0vVHJhc2gnLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmRlbGV0ZU1lc3NhZ2VzLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI19zaG91bGRTZWxlY3RNYWlsYm94JywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmV0dXJuIHRydWUgd2hlbiBjdHggaXMgdW5kZWZpbmVkJywgKCkgPT4ge1xuICAgICAgZXhwZWN0KGJyLl9zaG91bGRTZWxlY3RNYWlsYm94KCdwYXRoJykpLnRvLmJlLnRydWVcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gdHJ1ZSB3aGVuIGEgZGlmZmVyZW50IHBhdGggaXMgcXVldWVkJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICdnZXRQcmV2aW91c2x5UXVldWVkJykucmV0dXJucyh7XG4gICAgICAgIHJlcXVlc3Q6IHtcbiAgICAgICAgICBjb21tYW5kOiAnU0VMRUNUJyxcbiAgICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgICAgdHlwZTogJ1NUUklORycsXG4gICAgICAgICAgICB2YWx1ZTogJ3F1ZXVlZCBwYXRoJ1xuICAgICAgICAgIH1dXG4gICAgICAgIH1cbiAgICAgIH0pXG5cbiAgICAgIGV4cGVjdChici5fc2hvdWxkU2VsZWN0TWFpbGJveCgncGF0aCcsIHt9KSkudG8uYmUudHJ1ZVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiBmYWxzZSB3aGVuIHRoZSBzYW1lIHBhdGggaXMgcXVldWVkJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICdnZXRQcmV2aW91c2x5UXVldWVkJykucmV0dXJucyh7XG4gICAgICAgIHJlcXVlc3Q6IHtcbiAgICAgICAgICBjb21tYW5kOiAnU0VMRUNUJyxcbiAgICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgICAgdHlwZTogJ1NUUklORycsXG4gICAgICAgICAgICB2YWx1ZTogJ3F1ZXVlZCBwYXRoJ1xuICAgICAgICAgIH1dXG4gICAgICAgIH1cbiAgICAgIH0pXG5cbiAgICAgIGV4cGVjdChici5fc2hvdWxkU2VsZWN0TWFpbGJveCgncXVldWVkIHBhdGgnLCB7fSkpLnRvLmJlLmZhbHNlXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI3NlbGVjdE1haWxib3gnLCAoKSA9PiB7XG4gICAgY29uc3QgcGF0aCA9ICdbR21haWxdL1RyYXNoJ1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJ1biBTRUxFQ1QnLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ1NFTEVDVCcsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFt7XG4gICAgICAgICAgdHlwZTogJ1NUUklORycsXG4gICAgICAgICAgdmFsdWU6IHBhdGhcbiAgICAgICAgfV1cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgY29kZTogJ1JFQUQtV1JJVEUnXG4gICAgICB9KSlcblxuICAgICAgcmV0dXJuIGJyLnNlbGVjdE1haWxib3gocGF0aCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGJyLl9zdGF0ZSkudG8uZXF1YWwoU1RBVEVfU0VMRUNURUQpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJ1biBTRUxFQ1Qgd2l0aCBDT05EU1RPUkUnLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ1NFTEVDVCcsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFt7XG4gICAgICAgICAgdHlwZTogJ1NUUklORycsXG4gICAgICAgICAgdmFsdWU6IHBhdGhcbiAgICAgICAgfSxcbiAgICAgICAgW3tcbiAgICAgICAgICB0eXBlOiAnQVRPTScsXG4gICAgICAgICAgdmFsdWU6ICdDT05EU1RPUkUnXG4gICAgICAgIH1dXG4gICAgICAgIF1cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgY29kZTogJ1JFQUQtV1JJVEUnXG4gICAgICB9KSlcblxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ0NPTkRTVE9SRSddXG4gICAgICByZXR1cm4gYnIuc2VsZWN0TWFpbGJveChwYXRoLCB7XG4gICAgICAgIGNvbmRzdG9yZTogdHJ1ZVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGJyLl9zdGF0ZSkudG8uZXF1YWwoU1RBVEVfU0VMRUNURUQpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBkZXNjcmliZSgnc2hvdWxkIGVtaXQgb25zZWxlY3RtYWlsYm94IGJlZm9yZSBzZWxlY3RNYWlsYm94IGlzIHJlc29sdmVkJywgKCkgPT4ge1xuICAgICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICAgIGJyLmV4ZWMucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgIGNvZGU6ICdSRUFELVdSSVRFJ1xuICAgICAgICB9KSlcbiAgICAgIH0pXG5cbiAgICAgIGl0KCd3aGVuIGl0IHJldHVybnMgYSBwcm9taXNlJywgKCkgPT4ge1xuICAgICAgICB2YXIgcHJvbWlzZVJlc29sdmVkID0gZmFsc2VcbiAgICAgICAgYnIub25zZWxlY3RtYWlsYm94ID0gKCkgPT4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICByZXNvbHZlKClcbiAgICAgICAgICBwcm9taXNlUmVzb2x2ZWQgPSB0cnVlXG4gICAgICAgIH0pXG4gICAgICAgIHZhciBvbnNlbGVjdG1haWxib3hTcHkgPSBzaW5vbi5zcHkoYnIsICdvbnNlbGVjdG1haWxib3gnKVxuICAgICAgICByZXR1cm4gYnIuc2VsZWN0TWFpbGJveChwYXRoKS50aGVuKCgpID0+IHtcbiAgICAgICAgICBleHBlY3Qob25zZWxlY3RtYWlsYm94U3B5LndpdGhBcmdzKHBhdGgpLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgICBleHBlY3QocHJvbWlzZVJlc29sdmVkKS50by5lcXVhbCh0cnVlKVxuICAgICAgICB9KVxuICAgICAgfSlcblxuICAgICAgaXQoJ3doZW4gaXQgZG9lcyBub3QgcmV0dXJuIGEgcHJvbWlzZScsICgpID0+IHtcbiAgICAgICAgYnIub25zZWxlY3RtYWlsYm94ID0gKCkgPT4geyB9XG4gICAgICAgIHZhciBvbnNlbGVjdG1haWxib3hTcHkgPSBzaW5vbi5zcHkoYnIsICdvbnNlbGVjdG1haWxib3gnKVxuICAgICAgICByZXR1cm4gYnIuc2VsZWN0TWFpbGJveChwYXRoKS50aGVuKCgpID0+IHtcbiAgICAgICAgICBleHBlY3Qob25zZWxlY3RtYWlsYm94U3B5LndpdGhBcmdzKHBhdGgpLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZW1pdCBvbmNsb3NlbWFpbGJveCcsICgpID0+IHtcbiAgICAgIGxldCBjYWxsZWQgPSBmYWxzZVxuICAgICAgYnIuZXhlYy5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgnYWJjJykpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgY29kZTogJ1JFQUQtV1JJVEUnXG4gICAgICB9KSlcblxuICAgICAgYnIub25jbG9zZW1haWxib3ggPSAocGF0aCkgPT4ge1xuICAgICAgICBleHBlY3QocGF0aCkudG8uZXF1YWwoJ3l5eScpXG4gICAgICAgIGNhbGxlZCA9IHRydWVcbiAgICAgIH1cblxuICAgICAgYnIuX3NlbGVjdGVkTWFpbGJveCA9ICd5eXknXG4gICAgICByZXR1cm4gYnIuc2VsZWN0TWFpbGJveChwYXRoKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGNhbGxlZCkudG8uYmUudHJ1ZVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjc3Vic2NyaWJlIGFuZCB1bnN1YnNjcmliZScsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIFNVQlNDUklCRSB3aXRoIGEgc3RyaW5nIHBheWxvYWQnLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ1NVQlNDUklCRScsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFsnbWFpbGJveG5hbWUnXVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcblxuICAgICAgcmV0dXJuIGJyLnN1YnNjcmliZU1haWxib3goJ21haWxib3huYW1lJykudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBVTlNVQlNDUklCRSB3aXRoIGEgc3RyaW5nIHBheWxvYWQnLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ1VOU1VCU0NSSUJFJyxcbiAgICAgICAgYXR0cmlidXRlczogWydtYWlsYm94bmFtZSddXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuXG4gICAgICByZXR1cm4gYnIudW5zdWJzY3JpYmVNYWlsYm94KCdtYWlsYm94bmFtZScpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNoYXNDYXBhYmlsaXR5JywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZGV0ZWN0IGV4aXN0aW5nIGNhcGFiaWxpdHknLCAoKSA9PiB7XG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnWlpaJ11cbiAgICAgIGV4cGVjdChici5oYXNDYXBhYmlsaXR5KCd6enonKSkudG8uYmUudHJ1ZVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGRldGVjdCBub24gZXhpc3RpbmcgY2FwYWJpbGl0eScsICgpID0+IHtcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydaWlonXVxuICAgICAgZXhwZWN0KGJyLmhhc0NhcGFiaWxpdHkoJ29vbycpKS50by5iZS5mYWxzZVxuICAgICAgZXhwZWN0KGJyLmhhc0NhcGFiaWxpdHkoKSkudG8uYmUuZmFsc2VcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjX3VudGFnZ2VkT2tIYW5kbGVyJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgdXBkYXRlIGNhcGFiaWxpdHkgaWYgcHJlc2VudCcsICgpID0+IHtcbiAgICAgIGJyLl91bnRhZ2dlZE9rSGFuZGxlcih7XG4gICAgICAgIGNhcGFiaWxpdHk6IFsnYWJjJ11cbiAgICAgIH0sICgpID0+IHsgfSlcbiAgICAgIGV4cGVjdChici5fY2FwYWJpbGl0eSkudG8uZGVlcC5lcXVhbChbJ2FiYyddKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNfdW50YWdnZWRDYXBhYmlsaXR5SGFuZGxlcicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHVwZGF0ZSBjYXBhYmlsaXR5JywgKCkgPT4ge1xuICAgICAgYnIuX3VudGFnZ2VkQ2FwYWJpbGl0eUhhbmRsZXIoe1xuICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgIHZhbHVlOiAnYWJjJ1xuICAgICAgICB9XVxuICAgICAgfSwgKCkgPT4geyB9KVxuICAgICAgZXhwZWN0KGJyLl9jYXBhYmlsaXR5KS50by5kZWVwLmVxdWFsKFsnQUJDJ10pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI191bnRhZ2dlZEV4aXN0c0hhbmRsZXInLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBlbWl0IG9udXBkYXRlJywgKCkgPT4ge1xuICAgICAgYnIub251cGRhdGUgPSBzaW5vbi5zdHViKClcbiAgICAgIGJyLl9zZWxlY3RlZE1haWxib3ggPSAnRk9PJ1xuXG4gICAgICBici5fdW50YWdnZWRFeGlzdHNIYW5kbGVyKHtcbiAgICAgICAgbnI6IDEyM1xuICAgICAgfSwgKCkgPT4geyB9KVxuICAgICAgZXhwZWN0KGJyLm9udXBkYXRlLndpdGhBcmdzKCdGT08nLCAnZXhpc3RzJywgMTIzKS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI191bnRhZ2dlZEV4cHVuZ2VIYW5kbGVyJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZW1pdCBvbnVwZGF0ZScsICgpID0+IHtcbiAgICAgIGJyLm9udXBkYXRlID0gc2lub24uc3R1YigpXG4gICAgICBici5fc2VsZWN0ZWRNYWlsYm94ID0gJ0ZPTydcblxuICAgICAgYnIuX3VudGFnZ2VkRXhwdW5nZUhhbmRsZXIoe1xuICAgICAgICBucjogMTIzXG4gICAgICB9LCAoKSA9PiB7IH0pXG4gICAgICBleHBlY3QoYnIub251cGRhdGUud2l0aEFyZ3MoJ0ZPTycsICdleHB1bmdlJywgMTIzKS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZS5za2lwKCcjX3VudGFnZ2VkRmV0Y2hIYW5kbGVyJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZW1pdCBvbnVwZGF0ZScsICgpID0+IHtcbiAgICAgIGJyLm9udXBkYXRlID0gc2lub24uc3R1YigpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnX3BhcnNlRkVUQ0gnKS5yZXR1cm5zKCdhYmMnKVxuICAgICAgYnIuX3NlbGVjdGVkTWFpbGJveCA9ICdGT08nXG5cbiAgICAgIGJyLl91bnRhZ2dlZEZldGNoSGFuZGxlcih7XG4gICAgICAgIG5yOiAxMjNcbiAgICAgIH0sICgpID0+IHsgfSlcbiAgICAgIGV4cGVjdChici5vbnVwZGF0ZS53aXRoQXJncygnRk9PJywgJ2ZldGNoJywgJ2FiYycpLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIGV4cGVjdChici5fcGFyc2VGRVRDSC5hcmdzWzBdWzBdKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgIEZFVENIOiBbe1xuICAgICAgICAgICAgbnI6IDEyM1xuICAgICAgICAgIH1dXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI19jaGFuZ2VTdGF0ZScsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHNldCB0aGUgc3RhdGUgdmFsdWUnLCAoKSA9PiB7XG4gICAgICBici5fY2hhbmdlU3RhdGUoMTIzNDUpXG5cbiAgICAgIGV4cGVjdChici5fc3RhdGUpLnRvLmVxdWFsKDEyMzQ1KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGVtaXQgb25jbG9zZW1haWxib3ggaWYgbWFpbGJveCB3YXMgY2xvc2VkJywgKCkgPT4ge1xuICAgICAgYnIub25jbG9zZW1haWxib3ggPSBzaW5vbi5zdHViKClcbiAgICAgIGJyLl9zdGF0ZSA9IFNUQVRFX1NFTEVDVEVEXG4gICAgICBici5fc2VsZWN0ZWRNYWlsYm94ID0gJ2FhYSdcblxuICAgICAgYnIuX2NoYW5nZVN0YXRlKDEyMzQ1KVxuXG4gICAgICBleHBlY3QoYnIuX3NlbGVjdGVkTWFpbGJveCkudG8uYmUuZmFsc2VcbiAgICAgIGV4cGVjdChici5vbmNsb3NlbWFpbGJveC53aXRoQXJncygnYWFhJykuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNfZW5zdXJlUGF0aCcsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGNyZWF0ZSB0aGUgcGF0aCBpZiBub3QgcHJlc2VudCcsICgpID0+IHtcbiAgICAgIHZhciB0cmVlID0ge1xuICAgICAgICBjaGlsZHJlbjogW11cbiAgICAgIH1cbiAgICAgIGV4cGVjdChici5fZW5zdXJlUGF0aCh0cmVlLCAnaGVsbG8vd29ybGQnLCAnLycpKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgbmFtZTogJ3dvcmxkJyxcbiAgICAgICAgZGVsaW1pdGVyOiAnLycsXG4gICAgICAgIHBhdGg6ICdoZWxsby93b3JsZCcsXG4gICAgICAgIGNoaWxkcmVuOiBbXVxuICAgICAgfSlcbiAgICAgIGV4cGVjdCh0cmVlKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgY2hpbGRyZW46IFt7XG4gICAgICAgICAgbmFtZTogJ2hlbGxvJyxcbiAgICAgICAgICBkZWxpbWl0ZXI6ICcvJyxcbiAgICAgICAgICBwYXRoOiAnaGVsbG8nLFxuICAgICAgICAgIGNoaWxkcmVuOiBbe1xuICAgICAgICAgICAgbmFtZTogJ3dvcmxkJyxcbiAgICAgICAgICAgIGRlbGltaXRlcjogJy8nLFxuICAgICAgICAgICAgcGF0aDogJ2hlbGxvL3dvcmxkJyxcbiAgICAgICAgICAgIGNoaWxkcmVuOiBbXVxuICAgICAgICAgIH1dXG4gICAgICAgIH1dXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiBleGlzdGluZyBwYXRoIGlmIHBvc3NpYmxlJywgKCkgPT4ge1xuICAgICAgdmFyIHRyZWUgPSB7XG4gICAgICAgIGNoaWxkcmVuOiBbe1xuICAgICAgICAgIG5hbWU6ICdoZWxsbycsXG4gICAgICAgICAgZGVsaW1pdGVyOiAnLycsXG4gICAgICAgICAgcGF0aDogJ2hlbGxvJyxcbiAgICAgICAgICBjaGlsZHJlbjogW3tcbiAgICAgICAgICAgIG5hbWU6ICd3b3JsZCcsXG4gICAgICAgICAgICBkZWxpbWl0ZXI6ICcvJyxcbiAgICAgICAgICAgIHBhdGg6ICdoZWxsby93b3JsZCcsXG4gICAgICAgICAgICBjaGlsZHJlbjogW10sXG4gICAgICAgICAgICBhYmM6IDEyM1xuICAgICAgICAgIH1dXG4gICAgICAgIH1dXG4gICAgICB9XG4gICAgICBleHBlY3QoYnIuX2Vuc3VyZVBhdGgodHJlZSwgJ2hlbGxvL3dvcmxkJywgJy8nKSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgIG5hbWU6ICd3b3JsZCcsXG4gICAgICAgIGRlbGltaXRlcjogJy8nLFxuICAgICAgICBwYXRoOiAnaGVsbG8vd29ybGQnLFxuICAgICAgICBjaGlsZHJlbjogW10sXG4gICAgICAgIGFiYzogMTIzXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBjYXNlIGluc2Vuc2l0aXZlIEluYm94JywgKCkgPT4ge1xuICAgICAgdmFyIHRyZWUgPSB7XG4gICAgICAgIGNoaWxkcmVuOiBbXVxuICAgICAgfVxuICAgICAgZXhwZWN0KGJyLl9lbnN1cmVQYXRoKHRyZWUsICdJbmJveC93b3JsZCcsICcvJykpLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICBuYW1lOiAnd29ybGQnLFxuICAgICAgICBkZWxpbWl0ZXI6ICcvJyxcbiAgICAgICAgcGF0aDogJ0luYm94L3dvcmxkJyxcbiAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICB9KVxuICAgICAgZXhwZWN0KGJyLl9lbnN1cmVQYXRoKHRyZWUsICdJTkJPWC93b3JsZHMnLCAnLycpKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgbmFtZTogJ3dvcmxkcycsXG4gICAgICAgIGRlbGltaXRlcjogJy8nLFxuICAgICAgICBwYXRoOiAnSU5CT1gvd29ybGRzJyxcbiAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICB9KVxuXG4gICAgICBleHBlY3QodHJlZSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgIGNoaWxkcmVuOiBbe1xuICAgICAgICAgIG5hbWU6ICdJbmJveCcsXG4gICAgICAgICAgZGVsaW1pdGVyOiAnLycsXG4gICAgICAgICAgcGF0aDogJ0luYm94JyxcbiAgICAgICAgICBjaGlsZHJlbjogW3tcbiAgICAgICAgICAgIG5hbWU6ICd3b3JsZCcsXG4gICAgICAgICAgICBkZWxpbWl0ZXI6ICcvJyxcbiAgICAgICAgICAgIHBhdGg6ICdJbmJveC93b3JsZCcsXG4gICAgICAgICAgICBjaGlsZHJlbjogW11cbiAgICAgICAgICB9LCB7XG4gICAgICAgICAgICBuYW1lOiAnd29ybGRzJyxcbiAgICAgICAgICAgIGRlbGltaXRlcjogJy8nLFxuICAgICAgICAgICAgcGF0aDogJ0lOQk9YL3dvcmxkcycsXG4gICAgICAgICAgICBjaGlsZHJlbjogW11cbiAgICAgICAgICB9XVxuICAgICAgICB9XVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCd1bnRhZ2dlZCB1cGRhdGVzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmVjZWl2ZSBpbmZvcm1hdGlvbiBhYm91dCB1bnRhZ2dlZCBleGlzdHMnLCAoZG9uZSkgPT4ge1xuICAgICAgYnIuY2xpZW50Ll9jb25uZWN0aW9uUmVhZHkgPSB0cnVlXG4gICAgICBici5fc2VsZWN0ZWRNYWlsYm94ID0gJ0ZPTydcbiAgICAgIGJyLm9udXBkYXRlID0gKHBhdGgsIHR5cGUsIHZhbHVlKSA9PiB7XG4gICAgICAgIGV4cGVjdChwYXRoKS50by5lcXVhbCgnRk9PJylcbiAgICAgICAgZXhwZWN0KHR5cGUpLnRvLmVxdWFsKCdleGlzdHMnKVxuICAgICAgICBleHBlY3QodmFsdWUpLnRvLmVxdWFsKDEyMylcbiAgICAgICAgZG9uZSgpXG4gICAgICB9XG4gICAgICBici5jbGllbnQuX29uRGF0YSh7XG4gICAgICAgIC8qICogMTIzIEVYSVNUU1xcclxcbiAqL1xuICAgICAgICBkYXRhOiBuZXcgVWludDhBcnJheShbNDIsIDMyLCA0OSwgNTAsIDUxLCAzMiwgNjksIDg4LCA3MywgODMsIDg0LCA4MywgMTMsIDEwXSkuYnVmZmVyXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJlY2VpdmUgaW5mb3JtYXRpb24gYWJvdXQgdW50YWdnZWQgZXhwdW5nZScsIChkb25lKSA9PiB7XG4gICAgICBici5jbGllbnQuX2Nvbm5lY3Rpb25SZWFkeSA9IHRydWVcbiAgICAgIGJyLl9zZWxlY3RlZE1haWxib3ggPSAnRk9PJ1xuICAgICAgYnIub251cGRhdGUgPSAocGF0aCwgdHlwZSwgdmFsdWUpID0+IHtcbiAgICAgICAgZXhwZWN0KHBhdGgpLnRvLmVxdWFsKCdGT08nKVxuICAgICAgICBleHBlY3QodHlwZSkudG8uZXF1YWwoJ2V4cHVuZ2UnKVxuICAgICAgICBleHBlY3QodmFsdWUpLnRvLmVxdWFsKDQ1NilcbiAgICAgICAgZG9uZSgpXG4gICAgICB9XG4gICAgICBici5jbGllbnQuX29uRGF0YSh7XG4gICAgICAgIC8qICogNDU2IEVYUFVOR0VcXHJcXG4gKi9cbiAgICAgICAgZGF0YTogbmV3IFVpbnQ4QXJyYXkoWzQyLCAzMiwgNTIsIDUzLCA1NCwgMzIsIDY5LCA4OCwgODAsIDg1LCA3OCwgNzEsIDY5LCAxMywgMTBdKS5idWZmZXJcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcmVjZWl2ZSBpbmZvcm1hdGlvbiBhYm91dCB1bnRhZ2dlZCBmZXRjaCcsIChkb25lKSA9PiB7XG4gICAgICBici5jbGllbnQuX2Nvbm5lY3Rpb25SZWFkeSA9IHRydWVcbiAgICAgIGJyLl9zZWxlY3RlZE1haWxib3ggPSAnRk9PJ1xuICAgICAgYnIub251cGRhdGUgPSAocGF0aCwgdHlwZSwgdmFsdWUpID0+IHtcbiAgICAgICAgZXhwZWN0KHBhdGgpLnRvLmVxdWFsKCdGT08nKVxuICAgICAgICBleHBlY3QodHlwZSkudG8uZXF1YWwoJ2ZldGNoJylcbiAgICAgICAgZXhwZWN0KHZhbHVlKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgICAnIyc6IDEyMyxcbiAgICAgICAgICBmbGFnczogWydcXFxcU2VlbiddLFxuICAgICAgICAgIG1vZHNlcTogJzQnXG4gICAgICAgIH0pXG4gICAgICAgIGRvbmUoKVxuICAgICAgfVxuICAgICAgYnIuY2xpZW50Ll9vbkRhdGEoe1xuICAgICAgICAvKiAqIDEyMyBGRVRDSCAoRkxBR1MgKFxcXFxTZWVuKSBNT0RTRVEgKDQpKVxcclxcbiAqL1xuICAgICAgICBkYXRhOiBuZXcgVWludDhBcnJheShbNDIsIDMyLCA0OSwgNTAsIDUxLCAzMiwgNzAsIDY5LCA4NCwgNjcsIDcyLCAzMiwgNDAsIDcwLCA3NiwgNjUsIDcxLCA4MywgMzIsIDQwLCA5MiwgODMsIDEwMSwgMTAxLCAxMTAsIDQxLCAzMiwgNzcsIDc5LCA2OCwgODMsIDY5LCA4MSwgMzIsIDQwLCA1MiwgNDEsIDQxLCAxMywgMTBdKS5idWZmZXJcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcbn0pXG4iXX0=