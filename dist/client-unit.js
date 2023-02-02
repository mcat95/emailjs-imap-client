"use strict";

var _client = _interopRequireWildcard(require("./client"));
var _emailjsImapHandler = require("emailjs-imap-handler");
var _common = require("./common");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
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
            type: 'ATOM',
            value: 'PLAIN'
          }, {
            type: 'ATOM',
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJkZXNjcmliZSIsImJyIiwiYmVmb3JlRWFjaCIsImF1dGgiLCJ1c2VyIiwicGFzcyIsIkltYXBDbGllbnQiLCJsb2dMZXZlbCIsImNsaWVudCIsInNvY2tldCIsInNlbmQiLCJ1cGdyYWRlVG9TZWN1cmUiLCJpdCIsInNpbm9uIiwic3R1YiIsIl9hdXRoZW50aWNhdGVkIiwiX2VudGVyZWRJZGxlIiwiX29uSWRsZSIsImV4cGVjdCIsImVudGVySWRsZSIsImNhbGxDb3VudCIsInRvIiwiZXF1YWwiLCJjb25uZWN0IiwicmV0dXJucyIsIlByb21pc2UiLCJyZXNvbHZlIiwiZW5xdWV1ZUNvbW1hbmQiLCJjYXBhYmlsaXR5Iiwic2V0VGltZW91dCIsIm9ucmVhZHkiLCJvcGVuQ29ubmVjdGlvbiIsInRoZW4iLCJjYWxsZWRPbmNlIiwiYmUiLCJ0cnVlIiwiX2NhcGFiaWxpdHkiLCJsZW5ndGgiLCJ1cGRhdGVDYXBhYmlsaXR5IiwidXBncmFkZUNvbm5lY3Rpb24iLCJ1cGRhdGVJZCIsImxvZ2luIiwiY29tcHJlc3NDb25uZWN0aW9uIiwiZG9uZSIsInRocm93cyIsIkVycm9yIiwiY2F0Y2giLCJlcnIiLCJleGlzdCIsImNsb3NlIiwiY2FsbGVkIiwiZmFsc2UiLCJ0aW1lb3V0Q29ubmVjdGlvbiIsIl9zdGF0ZSIsIlNUQVRFX0xPR09VVCIsImV4ZWMiLCJyZXMiLCJkZWVwIiwiYXJncyIsImNhbGxzRmFrZSIsImNvbW1hbmQiLCJfc2VsZWN0ZWRNYWlsYm94IiwidGltZW91dE5vb3AiLCJ1bmRlZmluZWQiLCJwYXlsb2FkIiwic2xpY2UiLCJjYWxsIiwiVWludDhBcnJheSIsInRpbWVvdXRJZGxlIiwiYnJlYWtJZGxlIiwic2VjdXJlTW9kZSIsIndpdGhBcmdzIiwidXBncmFkZSIsIl9yZXF1aXJlVExTIiwiTkFNRVNQQUNFIiwiYXR0cmlidXRlcyIsInR5cGUiLCJ2YWx1ZSIsImxpc3ROYW1lc3BhY2VzIiwibmFtZXNwYWNlcyIsInBlcnNvbmFsIiwicHJlZml4IiwiZGVsaW1pdGVyIiwidXNlcnMiLCJzaGFyZWQiLCJfZW5hYmxlQ29tcHJlc3Npb24iLCJlbmFibGVDb21wcmVzc2lvbiIsInNlbnNpdGl2ZSIsInhvYXV0aDIiLCJhIiwiYyIsInNlcnZlcklkIiwiSUQiLCJja2V5MSIsImNrZXkyIiwic2tleTEiLCJza2V5MiIsIkxJU1QiLCJMU1VCIiwibGlzdE1haWxib3hlcyIsInRyZWUiLCJwYXJzZXIiLCJ0b1R5cGVkQXJyYXkiLCJjcmVhdGVNYWlsYm94IiwiZmFrZUVyciIsImNvZGUiLCJyZWplY3QiLCJkZWxldGVNYWlsYm94Iiwic2tpcCIsIl9idWlsZEZFVENIQ29tbWFuZCIsImJ5VWlkIiwibGlzdE1lc3NhZ2VzIiwiX3BhcnNlRkVUQ0giLCJfYnVpbGRTRUFSQ0hDb21tYW5kIiwidWlkIiwic2VhcmNoIiwiX3BhcnNlU0VBUkNIIiwidXBsb2FkIiwiZmxhZ3MiLCJfYnVpbGRTVE9SRUNvbW1hbmQiLCJzZXRGbGFncyIsInN0b3JlIiwiYWRkIiwiZGVsZXRlTWVzc2FnZXMiLCJjb3B5dWlkIiwiY29weU1lc3NhZ2VzIiwicmVzcG9uc2UiLCJzcmNTZXFTZXQiLCJkZXN0U2VxU2V0IiwibW92ZU1lc3NhZ2VzIiwiX3Nob3VsZFNlbGVjdE1haWxib3giLCJyZXF1ZXN0IiwicGF0aCIsInNlbGVjdE1haWxib3giLCJTVEFURV9TRUxFQ1RFRCIsImNvbmRzdG9yZSIsInByb21pc2VSZXNvbHZlZCIsIm9uc2VsZWN0bWFpbGJveCIsIm9uc2VsZWN0bWFpbGJveFNweSIsInNweSIsIm9uY2xvc2VtYWlsYm94Iiwic3Vic2NyaWJlTWFpbGJveCIsInVuc3Vic2NyaWJlTWFpbGJveCIsImhhc0NhcGFiaWxpdHkiLCJfdW50YWdnZWRPa0hhbmRsZXIiLCJfdW50YWdnZWRDYXBhYmlsaXR5SGFuZGxlciIsIm9udXBkYXRlIiwiX3VudGFnZ2VkRXhpc3RzSGFuZGxlciIsIm5yIiwiX3VudGFnZ2VkRXhwdW5nZUhhbmRsZXIiLCJfdW50YWdnZWRGZXRjaEhhbmRsZXIiLCJGRVRDSCIsIl9jaGFuZ2VTdGF0ZSIsImNoaWxkcmVuIiwiX2Vuc3VyZVBhdGgiLCJuYW1lIiwiYWJjIiwiX2Nvbm5lY3Rpb25SZWFkeSIsIl9vbkRhdGEiLCJkYXRhIiwiYnVmZmVyIiwibW9kc2VxIl0sInNvdXJjZXMiOlsiLi4vc3JjL2NsaWVudC11bml0LmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qIGVzbGludC1kaXNhYmxlIG5vLXVudXNlZC1leHByZXNzaW9ucyAqL1xuXG5pbXBvcnQgSW1hcENsaWVudCwgeyBTVEFURV9TRUxFQ1RFRCwgU1RBVEVfTE9HT1VUIH0gZnJvbSAnLi9jbGllbnQnXG5pbXBvcnQgeyBwYXJzZXIgfSBmcm9tICdlbWFpbGpzLWltYXAtaGFuZGxlcidcbmltcG9ydCB7XG4gIHRvVHlwZWRBcnJheSxcbiAgTE9HX0xFVkVMX05PTkUgYXMgbG9nTGV2ZWxcbn0gZnJvbSAnLi9jb21tb24nXG5cbmRlc2NyaWJlKCdicm93c2VyYm94IHVuaXQgdGVzdHMnLCAoKSA9PiB7XG4gIHZhciBiclxuXG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGNvbnN0IGF1dGggPSB7IHVzZXI6ICdiYWxkcmlhbicsIHBhc3M6ICdzbGVlcGVyLmRlJyB9XG4gICAgYnIgPSBuZXcgSW1hcENsaWVudCgnc29tZWhvc3QnLCAxMjM0LCB7IGF1dGgsIGxvZ0xldmVsIH0pXG4gICAgYnIuY2xpZW50LnNvY2tldCA9IHtcbiAgICAgIHNlbmQ6ICgpID0+IHsgfSxcbiAgICAgIHVwZ3JhZGVUb1NlY3VyZTogKCkgPT4geyB9XG4gICAgfVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjX29uSWRsZScsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGNhbGwgZW50ZXJJZGxlJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2VudGVySWRsZScpXG5cbiAgICAgIGJyLl9hdXRoZW50aWNhdGVkID0gdHJ1ZVxuICAgICAgYnIuX2VudGVyZWRJZGxlID0gZmFsc2VcbiAgICAgIGJyLl9vbklkbGUoKVxuXG4gICAgICBleHBlY3QoYnIuZW50ZXJJZGxlLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBub3QgY2FsbCBlbnRlcklkbGUnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZW50ZXJJZGxlJylcblxuICAgICAgYnIuX2VudGVyZWRJZGxlID0gdHJ1ZVxuICAgICAgYnIuX29uSWRsZSgpXG5cbiAgICAgIGV4cGVjdChici5lbnRlcklkbGUuY2FsbENvdW50KS50by5lcXVhbCgwKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNvcGVuQ29ubmVjdGlvbicsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAnY29ubmVjdCcpXG4gICAgICBzaW5vbi5zdHViKGJyLmNsaWVudCwgJ2Nsb3NlJylcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAnZW5xdWV1ZUNvbW1hbmQnKVxuICAgIH0pXG4gICAgaXQoJ3Nob3VsZCBvcGVuIGNvbm5lY3Rpb24nLCAoKSA9PiB7XG4gICAgICBici5jbGllbnQuY29ubmVjdC5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuICAgICAgYnIuY2xpZW50LmVucXVldWVDb21tYW5kLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgY2FwYWJpbGl0eTogWydjYXBhMScsICdjYXBhMiddXG4gICAgICB9KSlcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gYnIuY2xpZW50Lm9ucmVhZHkoKSwgMClcbiAgICAgIHJldHVybiBici5vcGVuQ29ubmVjdGlvbigpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmNvbm5lY3QuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmVucXVldWVDb21tYW5kLmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgICAgZXhwZWN0KGJyLl9jYXBhYmlsaXR5Lmxlbmd0aCkudG8uZXF1YWwoMilcbiAgICAgICAgZXhwZWN0KGJyLl9jYXBhYmlsaXR5WzBdKS50by5lcXVhbCgnY2FwYTEnKVxuICAgICAgICBleHBlY3QoYnIuX2NhcGFiaWxpdHlbMV0pLnRvLmVxdWFsKCdjYXBhMicpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNjb25uZWN0JywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICdjb25uZWN0JylcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAnY2xvc2UnKVxuICAgICAgc2lub24uc3R1YihiciwgJ3VwZGF0ZUNhcGFiaWxpdHknKVxuICAgICAgc2lub24uc3R1YihiciwgJ3VwZ3JhZGVDb25uZWN0aW9uJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICd1cGRhdGVJZCcpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnbG9naW4nKVxuICAgICAgc2lub24uc3R1YihiciwgJ2NvbXByZXNzQ29ubmVjdGlvbicpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY29ubmVjdCcsICgpID0+IHtcbiAgICAgIGJyLmNsaWVudC5jb25uZWN0LnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici51cGRhdGVDYXBhYmlsaXR5LnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici51cGdyYWRlQ29ubmVjdGlvbi5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuICAgICAgYnIudXBkYXRlSWQucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIGJyLmxvZ2luLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici5jb21wcmVzc0Nvbm5lY3Rpb24ucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcblxuICAgICAgc2V0VGltZW91dCgoKSA9PiBici5jbGllbnQub25yZWFkeSgpLCAwKVxuICAgICAgcmV0dXJuIGJyLmNvbm5lY3QoKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmNsaWVudC5jb25uZWN0LmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgICAgZXhwZWN0KGJyLnVwZGF0ZUNhcGFiaWxpdHkuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIudXBncmFkZUNvbm5lY3Rpb24uY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIudXBkYXRlSWQuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIubG9naW4uY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIuY29tcHJlc3NDb25uZWN0aW9uLmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZmFpbCB0byBsb2dpbicsIChkb25lKSA9PiB7XG4gICAgICBici5jbGllbnQuY29ubmVjdC5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuICAgICAgYnIudXBkYXRlQ2FwYWJpbGl0eS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuICAgICAgYnIudXBncmFkZUNvbm5lY3Rpb24ucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIGJyLnVwZGF0ZUlkLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici5sb2dpbi50aHJvd3MobmV3IEVycm9yKCkpXG5cbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gYnIuY2xpZW50Lm9ucmVhZHkoKSwgMClcbiAgICAgIGJyLmNvbm5lY3QoKS5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgIGV4cGVjdChlcnIpLnRvLmV4aXN0XG5cbiAgICAgICAgZXhwZWN0KGJyLmNsaWVudC5jb25uZWN0LmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgICAgZXhwZWN0KGJyLmNsaWVudC5jbG9zZS5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici51cGRhdGVDYXBhYmlsaXR5LmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgICAgZXhwZWN0KGJyLnVwZ3JhZGVDb25uZWN0aW9uLmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgICAgZXhwZWN0KGJyLnVwZGF0ZUlkLmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgICAgZXhwZWN0KGJyLmxvZ2luLmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcblxuICAgICAgICBleHBlY3QoYnIuY29tcHJlc3NDb25uZWN0aW9uLmNhbGxlZCkudG8uYmUuZmFsc2VcblxuICAgICAgICBkb25lKClcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgdGltZW91dCcsIChkb25lKSA9PiB7XG4gICAgICBici5jbGllbnQuY29ubmVjdC5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuICAgICAgYnIudGltZW91dENvbm5lY3Rpb24gPSAxXG5cbiAgICAgIGJyLmNvbm5lY3QoKS5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgIGV4cGVjdChlcnIpLnRvLmV4aXN0XG5cbiAgICAgICAgZXhwZWN0KGJyLmNsaWVudC5jb25uZWN0LmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgICAgZXhwZWN0KGJyLmNsaWVudC5jbG9zZS5jYWxsZWRPbmNlKS50by5iZS50cnVlXG5cbiAgICAgICAgZXhwZWN0KGJyLnVwZGF0ZUNhcGFiaWxpdHkuY2FsbGVkKS50by5iZS5mYWxzZVxuICAgICAgICBleHBlY3QoYnIudXBncmFkZUNvbm5lY3Rpb24uY2FsbGVkKS50by5iZS5mYWxzZVxuICAgICAgICBleHBlY3QoYnIudXBkYXRlSWQuY2FsbGVkKS50by5iZS5mYWxzZVxuICAgICAgICBleHBlY3QoYnIubG9naW4uY2FsbGVkKS50by5iZS5mYWxzZVxuICAgICAgICBleHBlY3QoYnIuY29tcHJlc3NDb25uZWN0aW9uLmNhbGxlZCkudG8uYmUuZmFsc2VcblxuICAgICAgICBkb25lKClcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2Nsb3NlJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZm9yY2UtY2xvc2UnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLmNsaWVudCwgJ2Nsb3NlJykucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcblxuICAgICAgcmV0dXJuIGJyLmNsb3NlKCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5fc3RhdGUpLnRvLmVxdWFsKFNUQVRFX0xPR09VVClcbiAgICAgICAgZXhwZWN0KGJyLmNsaWVudC5jbG9zZS5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNleGVjJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2JyZWFrSWRsZScpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgc2VuZCBzdHJpbmcgY29tbWFuZCcsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAnZW5xdWV1ZUNvbW1hbmQnKS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7fSkpXG4gICAgICByZXR1cm4gYnIuZXhlYygnVEVTVCcpLnRoZW4oKHJlcykgPT4ge1xuICAgICAgICBleHBlY3QocmVzKS50by5kZWVwLmVxdWFsKHt9KVxuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmVucXVldWVDb21tYW5kLmFyZ3NbMF1bMF0pLnRvLmVxdWFsKCdURVNUJylcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgdXBkYXRlIGNhcGFiaWxpdHkgZnJvbSByZXNwb25zZScsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAnZW5xdWV1ZUNvbW1hbmQnKS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIGNhcGFiaWxpdHk6IFsnQScsICdCJ11cbiAgICAgIH0pKVxuICAgICAgcmV0dXJuIGJyLmV4ZWMoJ1RFU1QnKS50aGVuKChyZXMpID0+IHtcbiAgICAgICAgZXhwZWN0KHJlcykudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgICAgY2FwYWJpbGl0eTogWydBJywgJ0InXVxuICAgICAgICB9KVxuICAgICAgICBleHBlY3QoYnIuX2NhcGFiaWxpdHkpLnRvLmRlZXAuZXF1YWwoWydBJywgJ0InXSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2VudGVySWRsZScsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHBlcmlvZGljYWxseSBzZW5kIE5PT1AgaWYgSURMRSBub3Qgc3VwcG9ydGVkJywgKGRvbmUpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJykuY2FsbHNGYWtlKChjb21tYW5kKSA9PiB7XG4gICAgICAgIGV4cGVjdChjb21tYW5kKS50by5lcXVhbCgnTk9PUCcpXG5cbiAgICAgICAgZG9uZSgpXG4gICAgICB9KVxuXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFtdXG4gICAgICBici5fc2VsZWN0ZWRNYWlsYm94ID0gJ0ZPTydcbiAgICAgIGJyLnRpbWVvdXROb29wID0gMVxuICAgICAgYnIuZW50ZXJJZGxlKClcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBwZXJpb2RpY2FsbHkgc2VuZCBOT09QIGlmIG5vIG1haWxib3ggc2VsZWN0ZWQnLCAoZG9uZSkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKS5jYWxsc0Zha2UoKGNvbW1hbmQpID0+IHtcbiAgICAgICAgZXhwZWN0KGNvbW1hbmQpLnRvLmVxdWFsKCdOT09QJylcblxuICAgICAgICBkb25lKClcbiAgICAgIH0pXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydJRExFJ11cbiAgICAgIGJyLl9zZWxlY3RlZE1haWxib3ggPSB1bmRlZmluZWRcbiAgICAgIGJyLnRpbWVvdXROb29wID0gMVxuICAgICAgYnIuZW50ZXJJZGxlKClcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBicmVhayBJRExFIGFmdGVyIHRpbWVvdXQnLCAoZG9uZSkgPT4ge1xuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICdlbnF1ZXVlQ29tbWFuZCcpXG4gICAgICBzaW5vbi5zdHViKGJyLmNsaWVudC5zb2NrZXQsICdzZW5kJykuY2FsbHNGYWtlKChwYXlsb2FkKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5jbGllbnQuZW5xdWV1ZUNvbW1hbmQuYXJnc1swXVswXS5jb21tYW5kKS50by5lcXVhbCgnSURMRScpXG4gICAgICAgIGV4cGVjdChbXS5zbGljZS5jYWxsKG5ldyBVaW50OEFycmF5KHBheWxvYWQpKSkudG8uZGVlcC5lcXVhbChbMHg0NCwgMHg0ZiwgMHg0ZSwgMHg0NSwgMHgwZCwgMHgwYV0pXG5cbiAgICAgICAgZG9uZSgpXG4gICAgICB9KVxuXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnSURMRSddXG4gICAgICBici5fc2VsZWN0ZWRNYWlsYm94ID0gJ0ZPTydcbiAgICAgIGJyLnRpbWVvdXRJZGxlID0gMVxuICAgICAgYnIuZW50ZXJJZGxlKClcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjYnJlYWtJZGxlJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgc2VuZCBET05FIHRvIHNvY2tldCcsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LnNvY2tldCwgJ3NlbmQnKVxuXG4gICAgICBici5fZW50ZXJlZElkbGUgPSAnSURMRSdcbiAgICAgIGJyLmJyZWFrSWRsZSgpXG4gICAgICBleHBlY3QoW10uc2xpY2UuY2FsbChuZXcgVWludDhBcnJheShici5jbGllbnQuc29ja2V0LnNlbmQuYXJnc1swXVswXSkpKS50by5kZWVwLmVxdWFsKFsweDQ0LCAweDRmLCAweDRlLCAweDQ1LCAweDBkLCAweDBhXSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjdXBncmFkZUNvbm5lY3Rpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBkbyBub3RoaW5nIGlmIGFscmVhZHkgc2VjdXJlZCcsICgpID0+IHtcbiAgICAgIGJyLmNsaWVudC5zZWN1cmVNb2RlID0gdHJ1ZVxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ3N0YXJ0dGxzJ11cbiAgICAgIHJldHVybiBici51cGdyYWRlQ29ubmVjdGlvbigpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZG8gbm90aGluZyBpZiBTVEFSVFRMUyBub3QgYXZhaWxhYmxlJywgKCkgPT4ge1xuICAgICAgYnIuY2xpZW50LnNlY3VyZU1vZGUgPSBmYWxzZVxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbXVxuICAgICAgcmV0dXJuIGJyLnVwZ3JhZGVDb25uZWN0aW9uKClcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBydW4gU1RBUlRUTFMnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLmNsaWVudCwgJ3VwZ3JhZGUnKVxuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKS53aXRoQXJncygnU1RBUlRUTFMnKS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuICAgICAgc2lub24uc3R1YihiciwgJ3VwZGF0ZUNhcGFiaWxpdHknKS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnU1RBUlRUTFMnXVxuXG4gICAgICByZXR1cm4gYnIudXBncmFkZUNvbm5lY3Rpb24oKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmNsaWVudC51cGdyYWRlLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGJyLl9jYXBhYmlsaXR5Lmxlbmd0aCkudG8uZXF1YWwoMClcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI3VwZGF0ZUNhcGFiaWxpdHknLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZG8gbm90aGluZyBpZiBjYXBhYmlsaXR5IGlzIHNldCcsICgpID0+IHtcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydhYmMnXVxuICAgICAgcmV0dXJuIGJyLnVwZGF0ZUNhcGFiaWxpdHkoKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJ1biBDQVBBQklMSVRZIGlmIGNhcGFiaWxpdHkgbm90IHNldCcsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcblxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbXVxuXG4gICAgICByZXR1cm4gYnIudXBkYXRlQ2FwYWJpbGl0eSgpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5hcmdzWzBdWzBdKS50by5lcXVhbCgnQ0FQQUJJTElUWScpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGZvcmNlIHJ1biBDQVBBQklMSVRZJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ2FiYyddXG5cbiAgICAgIHJldHVybiBici51cGRhdGVDYXBhYmlsaXR5KHRydWUpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5hcmdzWzBdWzBdKS50by5lcXVhbCgnQ0FQQUJJTElUWScpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGRvIG5vdGhpbmcgaWYgY29ubmVjdGlvbiBpcyBub3QgeWV0IHVwZ3JhZGVkJywgKCkgPT4ge1xuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbXVxuICAgICAgYnIuY2xpZW50LnNlY3VyZU1vZGUgPSBmYWxzZVxuICAgICAgYnIuX3JlcXVpcmVUTFMgPSB0cnVlXG5cbiAgICAgIGJyLnVwZGF0ZUNhcGFiaWxpdHkoKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNsaXN0TmFtZXNwYWNlcycsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBydW4gTkFNRVNQQUNFIGlmIHN1cHBvcnRlZCcsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgTkFNRVNQQUNFOiBbe1xuICAgICAgICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICAgICAgICBbXG4gICAgICAgICAgICAgICAgW3tcbiAgICAgICAgICAgICAgICAgIHR5cGU6ICdTVFJJTkcnLFxuICAgICAgICAgICAgICAgICAgdmFsdWU6ICdJTkJPWC4nXG4gICAgICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ1NUUklORycsXG4gICAgICAgICAgICAgICAgICB2YWx1ZTogJy4nXG4gICAgICAgICAgICAgICAgfV1cbiAgICAgICAgICAgICAgXSwgbnVsbCwgbnVsbFxuICAgICAgICAgICAgXVxuICAgICAgICAgIH1dXG4gICAgICAgIH1cbiAgICAgIH0pKVxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ05BTUVTUEFDRSddXG5cbiAgICAgIHJldHVybiBici5saXN0TmFtZXNwYWNlcygpLnRoZW4oKG5hbWVzcGFjZXMpID0+IHtcbiAgICAgICAgZXhwZWN0KG5hbWVzcGFjZXMpLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICAgIHBlcnNvbmFsOiBbe1xuICAgICAgICAgICAgcHJlZml4OiAnSU5CT1guJyxcbiAgICAgICAgICAgIGRlbGltaXRlcjogJy4nXG4gICAgICAgICAgfV0sXG4gICAgICAgICAgdXNlcnM6IGZhbHNlLFxuICAgICAgICAgIHNoYXJlZDogZmFsc2VcbiAgICAgICAgfSlcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuYXJnc1swXVswXSkudG8uZXF1YWwoJ05BTUVTUEFDRScpXG4gICAgICAgIGV4cGVjdChici5leGVjLmFyZ3NbMF1bMV0pLnRvLmVxdWFsKCdOQU1FU1BBQ0UnKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBkbyBub3RoaW5nIGlmIG5vdCBzdXBwb3J0ZWQnLCAoKSA9PiB7XG4gICAgICBici5fY2FwYWJpbGl0eSA9IFtdXG4gICAgICByZXR1cm4gYnIubGlzdE5hbWVzcGFjZXMoKS50aGVuKChuYW1lc3BhY2VzKSA9PiB7XG4gICAgICAgIGV4cGVjdChuYW1lc3BhY2VzKS50by5iZS5mYWxzZVxuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDApXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNjb21wcmVzc0Nvbm5lY3Rpb24nLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgICBzaW5vbi5zdHViKGJyLmNsaWVudCwgJ2VuYWJsZUNvbXByZXNzaW9uJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBydW4gQ09NUFJFU1M9REVGTEFURSBpZiBzdXBwb3J0ZWQnLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ0NPTVBSRVNTJyxcbiAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICB0eXBlOiAnQVRPTScsXG4gICAgICAgICAgdmFsdWU6ICdERUZMQVRFJ1xuICAgICAgICB9XVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe30pKVxuXG4gICAgICBici5fZW5hYmxlQ29tcHJlc3Npb24gPSB0cnVlXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnQ09NUFJFU1M9REVGTEFURSddXG4gICAgICByZXR1cm4gYnIuY29tcHJlc3NDb25uZWN0aW9uKCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGJyLmNsaWVudC5lbmFibGVDb21wcmVzc2lvbi5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGRvIG5vdGhpbmcgaWYgbm90IHN1cHBvcnRlZCcsICgpID0+IHtcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gW11cblxuICAgICAgcmV0dXJuIGJyLmNvbXByZXNzQ29ubmVjdGlvbigpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDApXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGRvIG5vdGhpbmcgaWYgbm90IGVuYWJsZWQnLCAoKSA9PiB7XG4gICAgICBici5fZW5hYmxlQ29tcHJlc3Npb24gPSBmYWxzZVxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ0NPTVBSRVNTPURFRkxBVEUnXVxuXG4gICAgICByZXR1cm4gYnIuY29tcHJlc3NDb25uZWN0aW9uKCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMClcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2xvZ2luJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgY2FsbCBMT0dJTicsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJykucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe30pKVxuICAgICAgc2lub24uc3R1YihiciwgJ3VwZGF0ZUNhcGFiaWxpdHknKS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh0cnVlKSlcblxuICAgICAgcmV0dXJuIGJyLmxvZ2luKHtcbiAgICAgICAgdXNlcjogJ3UxJyxcbiAgICAgICAgcGFzczogJ3AxJ1xuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuYXJnc1swXVswXSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgICAgY29tbWFuZDogJ2xvZ2luJyxcbiAgICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgICAgdHlwZTogJ1NUUklORycsXG4gICAgICAgICAgICB2YWx1ZTogJ3UxJ1xuICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgIHR5cGU6ICdTVFJJTkcnLFxuICAgICAgICAgICAgdmFsdWU6ICdwMScsXG4gICAgICAgICAgICBzZW5zaXRpdmU6IHRydWVcbiAgICAgICAgICB9XVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIEFVVEhFTlRJQ0FURScsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJykucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe30pKVxuICAgICAgc2lub24uc3R1YihiciwgJ3VwZGF0ZUNhcGFiaWxpdHknKS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh0cnVlKSlcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydBVVRIPVBMQUlOJ11cblxuICAgICAgcmV0dXJuIGJyLmxvZ2luKHtcbiAgICAgICAgdXNlcjogJ3UxJyxcbiAgICAgICAgcGFzczogJ3AxJ1xuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuYXJnc1swXVswXSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgICAgY29tbWFuZDogJ0FVVEhFTlRJQ0FURScsXG4gICAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICAgIHR5cGU6ICdBVE9NJyxcbiAgICAgICAgICAgIHZhbHVlOiAnUExBSU4nXG4gICAgICAgICAgfSwge1xuICAgICAgICAgICAgdHlwZTogJ0FUT00nLFxuICAgICAgICAgICAgdmFsdWU6ICdBSFV4QUhBeCcsXG4gICAgICAgICAgICBzZW5zaXRpdmU6IHRydWVcbiAgICAgICAgICB9XVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIFhPQVVUSDInLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHt9KSlcbiAgICAgIHNpbm9uLnN0dWIoYnIsICd1cGRhdGVDYXBhYmlsaXR5JykucmV0dXJucyhQcm9taXNlLnJlc29sdmUodHJ1ZSkpXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydBVVRIPVhPQVVUSDInXVxuICAgICAgYnIubG9naW4oe1xuICAgICAgICB1c2VyOiAndTEnLFxuICAgICAgICB4b2F1dGgyOiAnYWJjJ1xuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuYXJnc1swXVswXSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgICAgY29tbWFuZDogJ0FVVEhFTlRJQ0FURScsXG4gICAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICAgIHR5cGU6ICdBVE9NJyxcbiAgICAgICAgICAgIHZhbHVlOiAnWE9BVVRIMidcbiAgICAgICAgICB9LCB7XG4gICAgICAgICAgICB0eXBlOiAnQVRPTScsXG4gICAgICAgICAgICB2YWx1ZTogJ2RYTmxjajExTVFGaGRYUm9QVUpsWVhKbGNpQmhZbU1CQVE9PScsXG4gICAgICAgICAgICBzZW5zaXRpdmU6IHRydWVcbiAgICAgICAgICB9XVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjdXBkYXRlSWQnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgbm90IG5vdGhpbmcgaWYgbm90IHN1cHBvcnRlZCcsICgpID0+IHtcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gW11cblxuICAgICAgcmV0dXJuIGJyLnVwZGF0ZUlkKHtcbiAgICAgICAgYTogJ2InLFxuICAgICAgICBjOiAnZCdcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuc2VydmVySWQpLnRvLmJlLmZhbHNlXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHNlbmQgTklMJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdJRCcsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFtcbiAgICAgICAgICBudWxsXG4gICAgICAgIF1cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgIElEOiBbe1xuICAgICAgICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICAgICAgICBudWxsXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfV1cbiAgICAgICAgfVxuICAgICAgfSkpXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnSUQnXVxuXG4gICAgICByZXR1cm4gYnIudXBkYXRlSWQobnVsbCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5zZXJ2ZXJJZCkudG8uZGVlcC5lcXVhbCh7fSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZXhoYW5nZSBJRCB2YWx1ZXMnLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ0lEJyxcbiAgICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICAgIFsnY2tleTEnLCAnY3ZhbDEnLCAnY2tleTInLCAnY3ZhbDInXVxuICAgICAgICBdXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICBJRDogW3tcbiAgICAgICAgICAgIGF0dHJpYnV0ZXM6IFtcbiAgICAgICAgICAgICAgW3tcbiAgICAgICAgICAgICAgICB2YWx1ZTogJ3NrZXkxJ1xuICAgICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdmFsdWU6ICdzdmFsMSdcbiAgICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHZhbHVlOiAnc2tleTInXG4gICAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB2YWx1ZTogJ3N2YWwyJ1xuICAgICAgICAgICAgICB9XVxuICAgICAgICAgICAgXVxuICAgICAgICAgIH1dXG4gICAgICAgIH1cbiAgICAgIH0pKVxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ0lEJ11cblxuICAgICAgcmV0dXJuIGJyLnVwZGF0ZUlkKHtcbiAgICAgICAgY2tleTE6ICdjdmFsMScsXG4gICAgICAgIGNrZXkyOiAnY3ZhbDInXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLnNlcnZlcklkKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgICBza2V5MTogJ3N2YWwxJyxcbiAgICAgICAgICBza2V5MjogJ3N2YWwyJ1xuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjbGlzdE1haWxib3hlcycsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIExJU1QgYW5kIExTVUIgaW4gc2VxdWVuY2UnLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ0xJU1QnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbJycsICcqJ11cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgIExJU1Q6IFtmYWxzZV1cbiAgICAgICAgfVxuICAgICAgfSkpXG5cbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnTFNVQicsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFsnJywgJyonXVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgTFNVQjogW2ZhbHNlXVxuICAgICAgICB9XG4gICAgICB9KSlcblxuICAgICAgcmV0dXJuIGJyLmxpc3RNYWlsYm94ZXMoKS50aGVuKCh0cmVlKSA9PiB7XG4gICAgICAgIGV4cGVjdCh0cmVlKS50by5leGlzdFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBub3QgZGllIG9uIE5JTCBzZXBhcmF0b3JzJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdMSVNUJyxcbiAgICAgICAgYXR0cmlidXRlczogWycnLCAnKiddXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICBMSVNUOiBbXG4gICAgICAgICAgICBwYXJzZXIodG9UeXBlZEFycmF5KCcqIExJU1QgKFxcXFxOb0luZmVyaW9ycykgTklMIFwiSU5CT1hcIicpKVxuICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgICAgfSkpXG5cbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnTFNVQicsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFsnJywgJyonXVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgTFNVQjogW1xuICAgICAgICAgICAgcGFyc2VyKHRvVHlwZWRBcnJheSgnKiBMU1VCIChcXFxcTm9JbmZlcmlvcnMpIE5JTCBcIklOQk9YXCInKSlcbiAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICAgIH0pKVxuXG4gICAgICByZXR1cm4gYnIubGlzdE1haWxib3hlcygpLnRoZW4oKHRyZWUpID0+IHtcbiAgICAgICAgZXhwZWN0KHRyZWUpLnRvLmV4aXN0XG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNjcmVhdGVNYWlsYm94JywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgQ1JFQVRFIHdpdGggYSBzdHJpbmcgcGF5bG9hZCcsICgpID0+IHtcbiAgICAgIC8vIFRoZSBzcGVjIGFsbG93cyB1bnF1b3RlZCBBVE9NLXN0eWxlIHN5bnRheCB0b28sIGJ1dCBmb3JcbiAgICAgIC8vIHNpbXBsaWNpdHkgd2UgYWx3YXlzIGdlbmVyYXRlIGEgc3RyaW5nIGV2ZW4gaWYgaXQgY291bGQgYmVcbiAgICAgIC8vIGV4cHJlc3NlZCBhcyBhbiBhdG9tLlxuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdDUkVBVEUnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbJ21haWxib3huYW1lJ11cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIHJldHVybiBici5jcmVhdGVNYWlsYm94KCdtYWlsYm94bmFtZScpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHRyZWF0IGFuIEFMUkVBRFlFWElTVFMgcmVzcG9uc2UgYXMgc3VjY2VzcycsICgpID0+IHtcbiAgICAgIHZhciBmYWtlRXJyID0ge1xuICAgICAgICBjb2RlOiAnQUxSRUFEWUVYSVNUUydcbiAgICAgIH1cbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnQ1JFQVRFJyxcbiAgICAgICAgYXR0cmlidXRlczogWydtYWlsYm94bmFtZSddXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVqZWN0KGZha2VFcnIpKVxuXG4gICAgICByZXR1cm4gYnIuY3JlYXRlTWFpbGJveCgnbWFpbGJveG5hbWUnKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjZGVsZXRlTWFpbGJveCcsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIERFTEVURSB3aXRoIGEgc3RyaW5nIHBheWxvYWQnLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ0RFTEVURScsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFsnbWFpbGJveG5hbWUnXVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcblxuICAgICAgcmV0dXJuIGJyLmRlbGV0ZU1haWxib3goJ21haWxib3huYW1lJykudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZS5za2lwKCcjbGlzdE1lc3NhZ2VzJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgICAgc2lub24uc3R1YihiciwgJ19idWlsZEZFVENIQ29tbWFuZCcpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnX3BhcnNlRkVUQ0gnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgRkVUQ0gnLCAoKSA9PiB7XG4gICAgICBici5leGVjLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCdhYmMnKSlcbiAgICAgIGJyLl9idWlsZEZFVENIQ29tbWFuZC53aXRoQXJncyhbJzE6MicsIFsndWlkJywgJ2ZsYWdzJ10sIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH1dKS5yZXR1cm5zKHt9KVxuXG4gICAgICByZXR1cm4gYnIubGlzdE1lc3NhZ2VzKCdJTkJPWCcsICcxOjInLCBbJ3VpZCcsICdmbGFncyddLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLl9idWlsZEZFVENIQ29tbWFuZC5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChici5fcGFyc2VGRVRDSC53aXRoQXJncygnYWJjJykuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlLnNraXAoJyNzZWFyY2gnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnX2J1aWxkU0VBUkNIQ29tbWFuZCcpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnX3BhcnNlU0VBUkNIJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIFNFQVJDSCcsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMucmV0dXJucyhQcm9taXNlLnJlc29sdmUoJ2FiYycpKVxuICAgICAgYnIuX2J1aWxkU0VBUkNIQ29tbWFuZC53aXRoQXJncyh7XG4gICAgICAgIHVpZDogMVxuICAgICAgfSwge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkucmV0dXJucyh7fSlcblxuICAgICAgcmV0dXJuIGJyLnNlYXJjaCgnSU5CT1gnLCB7XG4gICAgICAgIHVpZDogMVxuICAgICAgfSwge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5fYnVpbGRTRUFSQ0hDb21tYW5kLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoYnIuX3BhcnNlU0VBUkNILndpdGhBcmdzKCdhYmMnKS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyN1cGxvYWQnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBBUFBFTkQgd2l0aCBjdXN0b20gZmxhZycsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcblxuICAgICAgcmV0dXJuIGJyLnVwbG9hZCgnbWFpbGJveCcsICd0aGlzIGlzIGEgbWVzc2FnZScsIHtcbiAgICAgICAgZmxhZ3M6IFsnXFxcXCRNeUZsYWcnXVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBBUFBFTkQgdy9vIGZsYWdzJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuXG4gICAgICByZXR1cm4gYnIudXBsb2FkKCdtYWlsYm94JywgJ3RoaXMgaXMgYSBtZXNzYWdlJykudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZS5za2lwKCcjc2V0RmxhZ3MnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnX2J1aWxkU1RPUkVDb21tYW5kJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdfcGFyc2VGRVRDSCcpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBTVE9SRScsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMucmV0dXJucyhQcm9taXNlLnJlc29sdmUoJ2FiYycpKVxuICAgICAgYnIuX2J1aWxkU1RPUkVDb21tYW5kLndpdGhBcmdzKCcxOjInLCAnRkxBR1MnLCBbJ1xcXFxTZWVuJywgJyRNeUZsYWcnXSwge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkucmV0dXJucyh7fSlcblxuICAgICAgcmV0dXJuIGJyLnNldEZsYWdzKCdJTkJPWCcsICcxOjInLCBbJ1xcXFxTZWVuJywgJyRNeUZsYWcnXSwge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGJyLl9wYXJzZUZFVENILndpdGhBcmdzKCdhYmMnKS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUuc2tpcCgnI3N0b3JlJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgICAgc2lub24uc3R1YihiciwgJ19idWlsZFNUT1JFQ29tbWFuZCcpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnX3BhcnNlRkVUQ0gnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgU1RPUkUnLCAoKSA9PiB7XG4gICAgICBici5leGVjLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCdhYmMnKSlcbiAgICAgIGJyLl9idWlsZFNUT1JFQ29tbWFuZC53aXRoQXJncygnMToyJywgJytYLUdNLUxBQkVMUycsIFsnXFxcXFNlbnQnLCAnXFxcXEp1bmsnXSwge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkucmV0dXJucyh7fSlcblxuICAgICAgcmV0dXJuIGJyLnN0b3JlKCdJTkJPWCcsICcxOjInLCAnK1gtR00tTEFCRUxTJywgWydcXFxcU2VudCcsICdcXFxcSnVuayddLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLl9idWlsZFNUT1JFQ29tbWFuZC5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGJyLl9wYXJzZUZFVENILndpdGhBcmdzKCdhYmMnKS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNkZWxldGVNZXNzYWdlcycsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdzZXRGbGFncycpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBVSUQgRVhQVU5HRScsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnVUlEIEVYUFVOR0UnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgIHR5cGU6ICdzZXF1ZW5jZScsXG4gICAgICAgICAgdmFsdWU6ICcxOjInXG4gICAgICAgIH1dXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgnYWJjJykpXG4gICAgICBici5zZXRGbGFncy53aXRoQXJncygnSU5CT1gnLCAnMToyJywge1xuICAgICAgICBhZGQ6ICdcXFxcRGVsZXRlZCdcbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydVSURQTFVTJ11cbiAgICAgIHJldHVybiBici5kZWxldGVNZXNzYWdlcygnSU5CT1gnLCAnMToyJywge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBFWFBVTkdFJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncygnRVhQVU5HRScpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCdhYmMnKSlcbiAgICAgIGJyLnNldEZsYWdzLndpdGhBcmdzKCdJTkJPWCcsICcxOjInLCB7XG4gICAgICAgIGFkZDogJ1xcXFxEZWxldGVkJ1xuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcblxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbXVxuICAgICAgcmV0dXJuIGJyLmRlbGV0ZU1lc3NhZ2VzKCdJTkJPWCcsICcxOjInLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjY29weU1lc3NhZ2VzJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgQ09QWScsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnVUlEIENPUFknLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgIHR5cGU6ICdzZXF1ZW5jZScsXG4gICAgICAgICAgdmFsdWU6ICcxOjInXG4gICAgICAgIH0sIHtcbiAgICAgICAgICB0eXBlOiAnYXRvbScsXG4gICAgICAgICAgdmFsdWU6ICdbR21haWxdL1RyYXNoJ1xuICAgICAgICB9XVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBjb3B5dWlkOiBbJzEnLCAnMToyJywgJzQsMyddXG4gICAgICB9KSlcblxuICAgICAgcmV0dXJuIGJyLmNvcHlNZXNzYWdlcygnSU5CT1gnLCAnMToyJywgJ1tHbWFpbF0vVHJhc2gnLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS50aGVuKChyZXNwb25zZSkgPT4ge1xuICAgICAgICBleHBlY3QocmVzcG9uc2UpLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICAgIHNyY1NlcVNldDogJzE6MicsXG4gICAgICAgICAgZGVzdFNlcVNldDogJzQsMydcbiAgICAgICAgfSlcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjbW92ZU1lc3NhZ2VzJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgICAgc2lub24uc3R1YihiciwgJ2NvcHlNZXNzYWdlcycpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnZGVsZXRlTWVzc2FnZXMnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgTU9WRSBpZiBzdXBwb3J0ZWQnLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ1VJRCBNT1ZFJyxcbiAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICB0eXBlOiAnc2VxdWVuY2UnLFxuICAgICAgICAgIHZhbHVlOiAnMToyJ1xuICAgICAgICB9LCB7XG4gICAgICAgICAgdHlwZTogJ2F0b20nLFxuICAgICAgICAgIHZhbHVlOiAnW0dtYWlsXS9UcmFzaCdcbiAgICAgICAgfV1cbiAgICAgIH0sIFsnT0snXSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoJ2FiYycpKVxuXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnTU9WRSddXG4gICAgICByZXR1cm4gYnIubW92ZU1lc3NhZ2VzKCdJTkJPWCcsICcxOjInLCAnW0dtYWlsXS9UcmFzaCcsIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGZhbGxiYWNrIHRvIGNvcHkrZXhwdW5nZScsICgpID0+IHtcbiAgICAgIGJyLmNvcHlNZXNzYWdlcy53aXRoQXJncygnSU5CT1gnLCAnMToyJywgJ1tHbWFpbF0vVHJhc2gnLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuICAgICAgYnIuZGVsZXRlTWVzc2FnZXMud2l0aEFyZ3MoJzE6MicsIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gW11cbiAgICAgIHJldHVybiBici5tb3ZlTWVzc2FnZXMoJ0lOQk9YJywgJzE6MicsICdbR21haWxdL1RyYXNoJywge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5kZWxldGVNZXNzYWdlcy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNfc2hvdWxkU2VsZWN0TWFpbGJveCcsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHJldHVybiB0cnVlIHdoZW4gY3R4IGlzIHVuZGVmaW5lZCcsICgpID0+IHtcbiAgICAgIGV4cGVjdChici5fc2hvdWxkU2VsZWN0TWFpbGJveCgncGF0aCcpKS50by5iZS50cnVlXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIHRydWUgd2hlbiBhIGRpZmZlcmVudCBwYXRoIGlzIHF1ZXVlZCcsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAnZ2V0UHJldmlvdXNseVF1ZXVlZCcpLnJldHVybnMoe1xuICAgICAgICByZXF1ZXN0OiB7XG4gICAgICAgICAgY29tbWFuZDogJ1NFTEVDVCcsXG4gICAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICAgIHR5cGU6ICdTVFJJTkcnLFxuICAgICAgICAgICAgdmFsdWU6ICdxdWV1ZWQgcGF0aCdcbiAgICAgICAgICB9XVxuICAgICAgICB9XG4gICAgICB9KVxuXG4gICAgICBleHBlY3QoYnIuX3Nob3VsZFNlbGVjdE1haWxib3goJ3BhdGgnLCB7fSkpLnRvLmJlLnRydWVcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gZmFsc2Ugd2hlbiB0aGUgc2FtZSBwYXRoIGlzIHF1ZXVlZCcsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAnZ2V0UHJldmlvdXNseVF1ZXVlZCcpLnJldHVybnMoe1xuICAgICAgICByZXF1ZXN0OiB7XG4gICAgICAgICAgY29tbWFuZDogJ1NFTEVDVCcsXG4gICAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICAgIHR5cGU6ICdTVFJJTkcnLFxuICAgICAgICAgICAgdmFsdWU6ICdxdWV1ZWQgcGF0aCdcbiAgICAgICAgICB9XVxuICAgICAgICB9XG4gICAgICB9KVxuXG4gICAgICBleHBlY3QoYnIuX3Nob3VsZFNlbGVjdE1haWxib3goJ3F1ZXVlZCBwYXRoJywge30pKS50by5iZS5mYWxzZVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNzZWxlY3RNYWlsYm94JywgKCkgPT4ge1xuICAgIGNvbnN0IHBhdGggPSAnW0dtYWlsXS9UcmFzaCdcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBydW4gU0VMRUNUJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdTRUxFQ1QnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgIHR5cGU6ICdTVFJJTkcnLFxuICAgICAgICAgIHZhbHVlOiBwYXRoXG4gICAgICAgIH1dXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIGNvZGU6ICdSRUFELVdSSVRFJ1xuICAgICAgfSkpXG5cbiAgICAgIHJldHVybiBici5zZWxlY3RNYWlsYm94KHBhdGgpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChici5fc3RhdGUpLnRvLmVxdWFsKFNUQVRFX1NFTEVDVEVEKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBydW4gU0VMRUNUIHdpdGggQ09ORFNUT1JFJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdTRUxFQ1QnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgIHR5cGU6ICdTVFJJTkcnLFxuICAgICAgICAgIHZhbHVlOiBwYXRoXG4gICAgICAgIH0sXG4gICAgICAgIFt7XG4gICAgICAgICAgdHlwZTogJ0FUT00nLFxuICAgICAgICAgIHZhbHVlOiAnQ09ORFNUT1JFJ1xuICAgICAgICB9XVxuICAgICAgICBdXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIGNvZGU6ICdSRUFELVdSSVRFJ1xuICAgICAgfSkpXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydDT05EU1RPUkUnXVxuICAgICAgcmV0dXJuIGJyLnNlbGVjdE1haWxib3gocGF0aCwge1xuICAgICAgICBjb25kc3RvcmU6IHRydWVcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChici5fc3RhdGUpLnRvLmVxdWFsKFNUQVRFX1NFTEVDVEVEKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgZGVzY3JpYmUoJ3Nob3VsZCBlbWl0IG9uc2VsZWN0bWFpbGJveCBiZWZvcmUgc2VsZWN0TWFpbGJveCBpcyByZXNvbHZlZCcsICgpID0+IHtcbiAgICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgICBici5leGVjLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICBjb2RlOiAnUkVBRC1XUklURSdcbiAgICAgICAgfSkpXG4gICAgICB9KVxuXG4gICAgICBpdCgnd2hlbiBpdCByZXR1cm5zIGEgcHJvbWlzZScsICgpID0+IHtcbiAgICAgICAgdmFyIHByb21pc2VSZXNvbHZlZCA9IGZhbHNlXG4gICAgICAgIGJyLm9uc2VsZWN0bWFpbGJveCA9ICgpID0+IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgcmVzb2x2ZSgpXG4gICAgICAgICAgcHJvbWlzZVJlc29sdmVkID0gdHJ1ZVxuICAgICAgICB9KVxuICAgICAgICB2YXIgb25zZWxlY3RtYWlsYm94U3B5ID0gc2lub24uc3B5KGJyLCAnb25zZWxlY3RtYWlsYm94JylcbiAgICAgICAgcmV0dXJuIGJyLnNlbGVjdE1haWxib3gocGF0aCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgZXhwZWN0KG9uc2VsZWN0bWFpbGJveFNweS53aXRoQXJncyhwYXRoKS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgICAgZXhwZWN0KHByb21pc2VSZXNvbHZlZCkudG8uZXF1YWwodHJ1ZSlcbiAgICAgICAgfSlcbiAgICAgIH0pXG5cbiAgICAgIGl0KCd3aGVuIGl0IGRvZXMgbm90IHJldHVybiBhIHByb21pc2UnLCAoKSA9PiB7XG4gICAgICAgIGJyLm9uc2VsZWN0bWFpbGJveCA9ICgpID0+IHsgfVxuICAgICAgICB2YXIgb25zZWxlY3RtYWlsYm94U3B5ID0gc2lub24uc3B5KGJyLCAnb25zZWxlY3RtYWlsYm94JylcbiAgICAgICAgcmV0dXJuIGJyLnNlbGVjdE1haWxib3gocGF0aCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgZXhwZWN0KG9uc2VsZWN0bWFpbGJveFNweS53aXRoQXJncyhwYXRoKS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGVtaXQgb25jbG9zZW1haWxib3gnLCAoKSA9PiB7XG4gICAgICBsZXQgY2FsbGVkID0gZmFsc2VcbiAgICAgIGJyLmV4ZWMucmV0dXJucyhQcm9taXNlLnJlc29sdmUoJ2FiYycpKS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIGNvZGU6ICdSRUFELVdSSVRFJ1xuICAgICAgfSkpXG5cbiAgICAgIGJyLm9uY2xvc2VtYWlsYm94ID0gKHBhdGgpID0+IHtcbiAgICAgICAgZXhwZWN0KHBhdGgpLnRvLmVxdWFsKCd5eXknKVxuICAgICAgICBjYWxsZWQgPSB0cnVlXG4gICAgICB9XG5cbiAgICAgIGJyLl9zZWxlY3RlZE1haWxib3ggPSAneXl5J1xuICAgICAgcmV0dXJuIGJyLnNlbGVjdE1haWxib3gocGF0aCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChjYWxsZWQpLnRvLmJlLnRydWVcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI3N1YnNjcmliZSBhbmQgdW5zdWJzY3JpYmUnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBTVUJTQ1JJQkUgd2l0aCBhIHN0cmluZyBwYXlsb2FkJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdTVUJTQ1JJQkUnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbJ21haWxib3huYW1lJ11cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIHJldHVybiBici5zdWJzY3JpYmVNYWlsYm94KCdtYWlsYm94bmFtZScpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgVU5TVUJTQ1JJQkUgd2l0aCBhIHN0cmluZyBwYXlsb2FkJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdVTlNVQlNDUklCRScsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFsnbWFpbGJveG5hbWUnXVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcblxuICAgICAgcmV0dXJuIGJyLnVuc3Vic2NyaWJlTWFpbGJveCgnbWFpbGJveG5hbWUnKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjaGFzQ2FwYWJpbGl0eScsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGRldGVjdCBleGlzdGluZyBjYXBhYmlsaXR5JywgKCkgPT4ge1xuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ1paWiddXG4gICAgICBleHBlY3QoYnIuaGFzQ2FwYWJpbGl0eSgnenp6JykpLnRvLmJlLnRydWVcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBkZXRlY3Qgbm9uIGV4aXN0aW5nIGNhcGFiaWxpdHknLCAoKSA9PiB7XG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnWlpaJ11cbiAgICAgIGV4cGVjdChici5oYXNDYXBhYmlsaXR5KCdvb28nKSkudG8uYmUuZmFsc2VcbiAgICAgIGV4cGVjdChici5oYXNDYXBhYmlsaXR5KCkpLnRvLmJlLmZhbHNlXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI191bnRhZ2dlZE9rSGFuZGxlcicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHVwZGF0ZSBjYXBhYmlsaXR5IGlmIHByZXNlbnQnLCAoKSA9PiB7XG4gICAgICBici5fdW50YWdnZWRPa0hhbmRsZXIoe1xuICAgICAgICBjYXBhYmlsaXR5OiBbJ2FiYyddXG4gICAgICB9LCAoKSA9PiB7IH0pXG4gICAgICBleHBlY3QoYnIuX2NhcGFiaWxpdHkpLnRvLmRlZXAuZXF1YWwoWydhYmMnXSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjX3VudGFnZ2VkQ2FwYWJpbGl0eUhhbmRsZXInLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCB1cGRhdGUgY2FwYWJpbGl0eScsICgpID0+IHtcbiAgICAgIGJyLl91bnRhZ2dlZENhcGFiaWxpdHlIYW5kbGVyKHtcbiAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICB2YWx1ZTogJ2FiYydcbiAgICAgICAgfV1cbiAgICAgIH0sICgpID0+IHsgfSlcbiAgICAgIGV4cGVjdChici5fY2FwYWJpbGl0eSkudG8uZGVlcC5lcXVhbChbJ0FCQyddKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNfdW50YWdnZWRFeGlzdHNIYW5kbGVyJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZW1pdCBvbnVwZGF0ZScsICgpID0+IHtcbiAgICAgIGJyLm9udXBkYXRlID0gc2lub24uc3R1YigpXG4gICAgICBici5fc2VsZWN0ZWRNYWlsYm94ID0gJ0ZPTydcblxuICAgICAgYnIuX3VudGFnZ2VkRXhpc3RzSGFuZGxlcih7XG4gICAgICAgIG5yOiAxMjNcbiAgICAgIH0sICgpID0+IHsgfSlcbiAgICAgIGV4cGVjdChici5vbnVwZGF0ZS53aXRoQXJncygnRk9PJywgJ2V4aXN0cycsIDEyMykuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNfdW50YWdnZWRFeHB1bmdlSGFuZGxlcicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGVtaXQgb251cGRhdGUnLCAoKSA9PiB7XG4gICAgICBici5vbnVwZGF0ZSA9IHNpbm9uLnN0dWIoKVxuICAgICAgYnIuX3NlbGVjdGVkTWFpbGJveCA9ICdGT08nXG5cbiAgICAgIGJyLl91bnRhZ2dlZEV4cHVuZ2VIYW5kbGVyKHtcbiAgICAgICAgbnI6IDEyM1xuICAgICAgfSwgKCkgPT4geyB9KVxuICAgICAgZXhwZWN0KGJyLm9udXBkYXRlLndpdGhBcmdzKCdGT08nLCAnZXhwdW5nZScsIDEyMykuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUuc2tpcCgnI191bnRhZ2dlZEZldGNoSGFuZGxlcicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGVtaXQgb251cGRhdGUnLCAoKSA9PiB7XG4gICAgICBici5vbnVwZGF0ZSA9IHNpbm9uLnN0dWIoKVxuICAgICAgc2lub24uc3R1YihiciwgJ19wYXJzZUZFVENIJykucmV0dXJucygnYWJjJylcbiAgICAgIGJyLl9zZWxlY3RlZE1haWxib3ggPSAnRk9PJ1xuXG4gICAgICBici5fdW50YWdnZWRGZXRjaEhhbmRsZXIoe1xuICAgICAgICBucjogMTIzXG4gICAgICB9LCAoKSA9PiB7IH0pXG4gICAgICBleHBlY3QoYnIub251cGRhdGUud2l0aEFyZ3MoJ0ZPTycsICdmZXRjaCcsICdhYmMnKS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICBleHBlY3QoYnIuX3BhcnNlRkVUQ0guYXJnc1swXVswXSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICBGRVRDSDogW3tcbiAgICAgICAgICAgIG5yOiAxMjNcbiAgICAgICAgICB9XVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNfY2hhbmdlU3RhdGUnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBzZXQgdGhlIHN0YXRlIHZhbHVlJywgKCkgPT4ge1xuICAgICAgYnIuX2NoYW5nZVN0YXRlKDEyMzQ1KVxuXG4gICAgICBleHBlY3QoYnIuX3N0YXRlKS50by5lcXVhbCgxMjM0NSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBlbWl0IG9uY2xvc2VtYWlsYm94IGlmIG1haWxib3ggd2FzIGNsb3NlZCcsICgpID0+IHtcbiAgICAgIGJyLm9uY2xvc2VtYWlsYm94ID0gc2lub24uc3R1YigpXG4gICAgICBici5fc3RhdGUgPSBTVEFURV9TRUxFQ1RFRFxuICAgICAgYnIuX3NlbGVjdGVkTWFpbGJveCA9ICdhYWEnXG5cbiAgICAgIGJyLl9jaGFuZ2VTdGF0ZSgxMjM0NSlcblxuICAgICAgZXhwZWN0KGJyLl9zZWxlY3RlZE1haWxib3gpLnRvLmJlLmZhbHNlXG4gICAgICBleHBlY3QoYnIub25jbG9zZW1haWxib3gud2l0aEFyZ3MoJ2FhYScpLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjX2Vuc3VyZVBhdGgnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgdGhlIHBhdGggaWYgbm90IHByZXNlbnQnLCAoKSA9PiB7XG4gICAgICB2YXIgdHJlZSA9IHtcbiAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICB9XG4gICAgICBleHBlY3QoYnIuX2Vuc3VyZVBhdGgodHJlZSwgJ2hlbGxvL3dvcmxkJywgJy8nKSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgIG5hbWU6ICd3b3JsZCcsXG4gICAgICAgIGRlbGltaXRlcjogJy8nLFxuICAgICAgICBwYXRoOiAnaGVsbG8vd29ybGQnLFxuICAgICAgICBjaGlsZHJlbjogW11cbiAgICAgIH0pXG4gICAgICBleHBlY3QodHJlZSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgIGNoaWxkcmVuOiBbe1xuICAgICAgICAgIG5hbWU6ICdoZWxsbycsXG4gICAgICAgICAgZGVsaW1pdGVyOiAnLycsXG4gICAgICAgICAgcGF0aDogJ2hlbGxvJyxcbiAgICAgICAgICBjaGlsZHJlbjogW3tcbiAgICAgICAgICAgIG5hbWU6ICd3b3JsZCcsXG4gICAgICAgICAgICBkZWxpbWl0ZXI6ICcvJyxcbiAgICAgICAgICAgIHBhdGg6ICdoZWxsby93b3JsZCcsXG4gICAgICAgICAgICBjaGlsZHJlbjogW11cbiAgICAgICAgICB9XVxuICAgICAgICB9XVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gZXhpc3RpbmcgcGF0aCBpZiBwb3NzaWJsZScsICgpID0+IHtcbiAgICAgIHZhciB0cmVlID0ge1xuICAgICAgICBjaGlsZHJlbjogW3tcbiAgICAgICAgICBuYW1lOiAnaGVsbG8nLFxuICAgICAgICAgIGRlbGltaXRlcjogJy8nLFxuICAgICAgICAgIHBhdGg6ICdoZWxsbycsXG4gICAgICAgICAgY2hpbGRyZW46IFt7XG4gICAgICAgICAgICBuYW1lOiAnd29ybGQnLFxuICAgICAgICAgICAgZGVsaW1pdGVyOiAnLycsXG4gICAgICAgICAgICBwYXRoOiAnaGVsbG8vd29ybGQnLFxuICAgICAgICAgICAgY2hpbGRyZW46IFtdLFxuICAgICAgICAgICAgYWJjOiAxMjNcbiAgICAgICAgICB9XVxuICAgICAgICB9XVxuICAgICAgfVxuICAgICAgZXhwZWN0KGJyLl9lbnN1cmVQYXRoKHRyZWUsICdoZWxsby93b3JsZCcsICcvJykpLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICBuYW1lOiAnd29ybGQnLFxuICAgICAgICBkZWxpbWl0ZXI6ICcvJyxcbiAgICAgICAgcGF0aDogJ2hlbGxvL3dvcmxkJyxcbiAgICAgICAgY2hpbGRyZW46IFtdLFxuICAgICAgICBhYmM6IDEyM1xuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgY2FzZSBpbnNlbnNpdGl2ZSBJbmJveCcsICgpID0+IHtcbiAgICAgIHZhciB0cmVlID0ge1xuICAgICAgICBjaGlsZHJlbjogW11cbiAgICAgIH1cbiAgICAgIGV4cGVjdChici5fZW5zdXJlUGF0aCh0cmVlLCAnSW5ib3gvd29ybGQnLCAnLycpKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgbmFtZTogJ3dvcmxkJyxcbiAgICAgICAgZGVsaW1pdGVyOiAnLycsXG4gICAgICAgIHBhdGg6ICdJbmJveC93b3JsZCcsXG4gICAgICAgIGNoaWxkcmVuOiBbXVxuICAgICAgfSlcbiAgICAgIGV4cGVjdChici5fZW5zdXJlUGF0aCh0cmVlLCAnSU5CT1gvd29ybGRzJywgJy8nKSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgIG5hbWU6ICd3b3JsZHMnLFxuICAgICAgICBkZWxpbWl0ZXI6ICcvJyxcbiAgICAgICAgcGF0aDogJ0lOQk9YL3dvcmxkcycsXG4gICAgICAgIGNoaWxkcmVuOiBbXVxuICAgICAgfSlcblxuICAgICAgZXhwZWN0KHRyZWUpLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICBjaGlsZHJlbjogW3tcbiAgICAgICAgICBuYW1lOiAnSW5ib3gnLFxuICAgICAgICAgIGRlbGltaXRlcjogJy8nLFxuICAgICAgICAgIHBhdGg6ICdJbmJveCcsXG4gICAgICAgICAgY2hpbGRyZW46IFt7XG4gICAgICAgICAgICBuYW1lOiAnd29ybGQnLFxuICAgICAgICAgICAgZGVsaW1pdGVyOiAnLycsXG4gICAgICAgICAgICBwYXRoOiAnSW5ib3gvd29ybGQnLFxuICAgICAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICAgICAgfSwge1xuICAgICAgICAgICAgbmFtZTogJ3dvcmxkcycsXG4gICAgICAgICAgICBkZWxpbWl0ZXI6ICcvJyxcbiAgICAgICAgICAgIHBhdGg6ICdJTkJPWC93b3JsZHMnLFxuICAgICAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICAgICAgfV1cbiAgICAgICAgfV1cbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgndW50YWdnZWQgdXBkYXRlcycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHJlY2VpdmUgaW5mb3JtYXRpb24gYWJvdXQgdW50YWdnZWQgZXhpc3RzJywgKGRvbmUpID0+IHtcbiAgICAgIGJyLmNsaWVudC5fY29ubmVjdGlvblJlYWR5ID0gdHJ1ZVxuICAgICAgYnIuX3NlbGVjdGVkTWFpbGJveCA9ICdGT08nXG4gICAgICBici5vbnVwZGF0ZSA9IChwYXRoLCB0eXBlLCB2YWx1ZSkgPT4ge1xuICAgICAgICBleHBlY3QocGF0aCkudG8uZXF1YWwoJ0ZPTycpXG4gICAgICAgIGV4cGVjdCh0eXBlKS50by5lcXVhbCgnZXhpc3RzJylcbiAgICAgICAgZXhwZWN0KHZhbHVlKS50by5lcXVhbCgxMjMpXG4gICAgICAgIGRvbmUoKVxuICAgICAgfVxuICAgICAgYnIuY2xpZW50Ll9vbkRhdGEoe1xuICAgICAgICAvKiAqIDEyMyBFWElTVFNcXHJcXG4gKi9cbiAgICAgICAgZGF0YTogbmV3IFVpbnQ4QXJyYXkoWzQyLCAzMiwgNDksIDUwLCA1MSwgMzIsIDY5LCA4OCwgNzMsIDgzLCA4NCwgODMsIDEzLCAxMF0pLmJ1ZmZlclxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCByZWNlaXZlIGluZm9ybWF0aW9uIGFib3V0IHVudGFnZ2VkIGV4cHVuZ2UnLCAoZG9uZSkgPT4ge1xuICAgICAgYnIuY2xpZW50Ll9jb25uZWN0aW9uUmVhZHkgPSB0cnVlXG4gICAgICBici5fc2VsZWN0ZWRNYWlsYm94ID0gJ0ZPTydcbiAgICAgIGJyLm9udXBkYXRlID0gKHBhdGgsIHR5cGUsIHZhbHVlKSA9PiB7XG4gICAgICAgIGV4cGVjdChwYXRoKS50by5lcXVhbCgnRk9PJylcbiAgICAgICAgZXhwZWN0KHR5cGUpLnRvLmVxdWFsKCdleHB1bmdlJylcbiAgICAgICAgZXhwZWN0KHZhbHVlKS50by5lcXVhbCg0NTYpXG4gICAgICAgIGRvbmUoKVxuICAgICAgfVxuICAgICAgYnIuY2xpZW50Ll9vbkRhdGEoe1xuICAgICAgICAvKiAqIDQ1NiBFWFBVTkdFXFxyXFxuICovXG4gICAgICAgIGRhdGE6IG5ldyBVaW50OEFycmF5KFs0MiwgMzIsIDUyLCA1MywgNTQsIDMyLCA2OSwgODgsIDgwLCA4NSwgNzgsIDcxLCA2OSwgMTMsIDEwXSkuYnVmZmVyXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJlY2VpdmUgaW5mb3JtYXRpb24gYWJvdXQgdW50YWdnZWQgZmV0Y2gnLCAoZG9uZSkgPT4ge1xuICAgICAgYnIuY2xpZW50Ll9jb25uZWN0aW9uUmVhZHkgPSB0cnVlXG4gICAgICBici5fc2VsZWN0ZWRNYWlsYm94ID0gJ0ZPTydcbiAgICAgIGJyLm9udXBkYXRlID0gKHBhdGgsIHR5cGUsIHZhbHVlKSA9PiB7XG4gICAgICAgIGV4cGVjdChwYXRoKS50by5lcXVhbCgnRk9PJylcbiAgICAgICAgZXhwZWN0KHR5cGUpLnRvLmVxdWFsKCdmZXRjaCcpXG4gICAgICAgIGV4cGVjdCh2YWx1ZSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgICAgJyMnOiAxMjMsXG4gICAgICAgICAgZmxhZ3M6IFsnXFxcXFNlZW4nXSxcbiAgICAgICAgICBtb2RzZXE6ICc0J1xuICAgICAgICB9KVxuICAgICAgICBkb25lKClcbiAgICAgIH1cbiAgICAgIGJyLmNsaWVudC5fb25EYXRhKHtcbiAgICAgICAgLyogKiAxMjMgRkVUQ0ggKEZMQUdTIChcXFxcU2VlbikgTU9EU0VRICg0KSlcXHJcXG4gKi9cbiAgICAgICAgZGF0YTogbmV3IFVpbnQ4QXJyYXkoWzQyLCAzMiwgNDksIDUwLCA1MSwgMzIsIDcwLCA2OSwgODQsIDY3LCA3MiwgMzIsIDQwLCA3MCwgNzYsIDY1LCA3MSwgODMsIDMyLCA0MCwgOTIsIDgzLCAxMDEsIDEwMSwgMTEwLCA0MSwgMzIsIDc3LCA3OSwgNjgsIDgzLCA2OSwgODEsIDMyLCA0MCwgNTIsIDQxLCA0MSwgMTMsIDEwXSkuYnVmZmVyXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG59KVxuIl0sIm1hcHBpbmdzIjoiOztBQUVBO0FBQ0E7QUFDQTtBQUdpQjtBQUFBO0FBUGpCOztBQVNB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