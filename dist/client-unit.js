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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJkZXNjcmliZSIsImJyIiwiYmVmb3JlRWFjaCIsImF1dGgiLCJ1c2VyIiwicGFzcyIsIkltYXBDbGllbnQiLCJsb2dMZXZlbCIsImNsaWVudCIsInNvY2tldCIsInNlbmQiLCJ1cGdyYWRlVG9TZWN1cmUiLCJpdCIsInNpbm9uIiwic3R1YiIsIl9hdXRoZW50aWNhdGVkIiwiX2VudGVyZWRJZGxlIiwiX29uSWRsZSIsImV4cGVjdCIsImVudGVySWRsZSIsImNhbGxDb3VudCIsInRvIiwiZXF1YWwiLCJjb25uZWN0IiwicmV0dXJucyIsIlByb21pc2UiLCJyZXNvbHZlIiwiZW5xdWV1ZUNvbW1hbmQiLCJjYXBhYmlsaXR5Iiwic2V0VGltZW91dCIsIm9ucmVhZHkiLCJvcGVuQ29ubmVjdGlvbiIsInRoZW4iLCJjYWxsZWRPbmNlIiwiYmUiLCJ0cnVlIiwiX2NhcGFiaWxpdHkiLCJsZW5ndGgiLCJ1cGRhdGVDYXBhYmlsaXR5IiwidXBncmFkZUNvbm5lY3Rpb24iLCJ1cGRhdGVJZCIsImxvZ2luIiwiY29tcHJlc3NDb25uZWN0aW9uIiwiZG9uZSIsInRocm93cyIsIkVycm9yIiwiY2F0Y2giLCJlcnIiLCJleGlzdCIsImNsb3NlIiwiY2FsbGVkIiwiZmFsc2UiLCJ0aW1lb3V0Q29ubmVjdGlvbiIsIl9zdGF0ZSIsIlNUQVRFX0xPR09VVCIsImV4ZWMiLCJyZXMiLCJkZWVwIiwiYXJncyIsImNhbGxzRmFrZSIsImNvbW1hbmQiLCJfc2VsZWN0ZWRNYWlsYm94IiwidGltZW91dE5vb3AiLCJ1bmRlZmluZWQiLCJwYXlsb2FkIiwic2xpY2UiLCJjYWxsIiwiVWludDhBcnJheSIsInRpbWVvdXRJZGxlIiwiYnJlYWtJZGxlIiwic2VjdXJlTW9kZSIsIndpdGhBcmdzIiwidXBncmFkZSIsIl9yZXF1aXJlVExTIiwiTkFNRVNQQUNFIiwiYXR0cmlidXRlcyIsInR5cGUiLCJ2YWx1ZSIsImxpc3ROYW1lc3BhY2VzIiwibmFtZXNwYWNlcyIsInBlcnNvbmFsIiwicHJlZml4IiwiZGVsaW1pdGVyIiwidXNlcnMiLCJzaGFyZWQiLCJfZW5hYmxlQ29tcHJlc3Npb24iLCJlbmFibGVDb21wcmVzc2lvbiIsInNlbnNpdGl2ZSIsImNodW5rIiwieG9hdXRoMiIsImEiLCJjIiwic2VydmVySWQiLCJJRCIsImNrZXkxIiwiY2tleTIiLCJza2V5MSIsInNrZXkyIiwiTElTVCIsIkxTVUIiLCJsaXN0TWFpbGJveGVzIiwidHJlZSIsInBhcnNlciIsInRvVHlwZWRBcnJheSIsImNyZWF0ZU1haWxib3giLCJmYWtlRXJyIiwiY29kZSIsInJlamVjdCIsImRlbGV0ZU1haWxib3giLCJza2lwIiwiX2J1aWxkRkVUQ0hDb21tYW5kIiwiYnlVaWQiLCJsaXN0TWVzc2FnZXMiLCJfcGFyc2VGRVRDSCIsIl9idWlsZFNFQVJDSENvbW1hbmQiLCJ1aWQiLCJzZWFyY2giLCJfcGFyc2VTRUFSQ0giLCJ1cGxvYWQiLCJmbGFncyIsIl9idWlsZFNUT1JFQ29tbWFuZCIsInNldEZsYWdzIiwic3RvcmUiLCJhZGQiLCJkZWxldGVNZXNzYWdlcyIsImNvcHl1aWQiLCJjb3B5TWVzc2FnZXMiLCJyZXNwb25zZSIsInNyY1NlcVNldCIsImRlc3RTZXFTZXQiLCJtb3ZlTWVzc2FnZXMiLCJfc2hvdWxkU2VsZWN0TWFpbGJveCIsInJlcXVlc3QiLCJwYXRoIiwic2VsZWN0TWFpbGJveCIsIlNUQVRFX1NFTEVDVEVEIiwiY29uZHN0b3JlIiwicHJvbWlzZVJlc29sdmVkIiwib25zZWxlY3RtYWlsYm94Iiwib25zZWxlY3RtYWlsYm94U3B5Iiwic3B5Iiwib25jbG9zZW1haWxib3giLCJzdWJzY3JpYmVNYWlsYm94IiwidW5zdWJzY3JpYmVNYWlsYm94IiwiaGFzQ2FwYWJpbGl0eSIsIl91bnRhZ2dlZE9rSGFuZGxlciIsIl91bnRhZ2dlZENhcGFiaWxpdHlIYW5kbGVyIiwib251cGRhdGUiLCJfdW50YWdnZWRFeGlzdHNIYW5kbGVyIiwibnIiLCJfdW50YWdnZWRFeHB1bmdlSGFuZGxlciIsIl91bnRhZ2dlZEZldGNoSGFuZGxlciIsIkZFVENIIiwiX2NoYW5nZVN0YXRlIiwiY2hpbGRyZW4iLCJfZW5zdXJlUGF0aCIsIm5hbWUiLCJhYmMiLCJfY29ubmVjdGlvblJlYWR5IiwiX29uRGF0YSIsImRhdGEiLCJidWZmZXIiLCJtb2RzZXEiXSwic291cmNlcyI6WyIuLi9zcmMvY2xpZW50LXVuaXQuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50LWRpc2FibGUgbm8tdW51c2VkLWV4cHJlc3Npb25zICovXG5cbmltcG9ydCBJbWFwQ2xpZW50LCB7IFNUQVRFX1NFTEVDVEVELCBTVEFURV9MT0dPVVQgfSBmcm9tICcuL2NsaWVudCdcbmltcG9ydCB7IHBhcnNlciB9IGZyb20gJ2VtYWlsanMtaW1hcC1oYW5kbGVyJ1xuaW1wb3J0IHtcbiAgdG9UeXBlZEFycmF5LFxuICBMT0dfTEVWRUxfTk9ORSBhcyBsb2dMZXZlbFxufSBmcm9tICcuL2NvbW1vbidcblxuZGVzY3JpYmUoJ2Jyb3dzZXJib3ggdW5pdCB0ZXN0cycsICgpID0+IHtcbiAgdmFyIGJyXG5cbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgY29uc3QgYXV0aCA9IHsgdXNlcjogJ2JhbGRyaWFuJywgcGFzczogJ3NsZWVwZXIuZGUnIH1cbiAgICBiciA9IG5ldyBJbWFwQ2xpZW50KCdzb21laG9zdCcsIDEyMzQsIHsgYXV0aCwgbG9nTGV2ZWwgfSlcbiAgICBici5jbGllbnQuc29ja2V0ID0ge1xuICAgICAgc2VuZDogKCkgPT4geyB9LFxuICAgICAgdXBncmFkZVRvU2VjdXJlOiAoKSA9PiB7IH1cbiAgICB9XG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNfb25JZGxlJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgY2FsbCBlbnRlcklkbGUnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZW50ZXJJZGxlJylcblxuICAgICAgYnIuX2F1dGhlbnRpY2F0ZWQgPSB0cnVlXG4gICAgICBici5fZW50ZXJlZElkbGUgPSBmYWxzZVxuICAgICAgYnIuX29uSWRsZSgpXG5cbiAgICAgIGV4cGVjdChici5lbnRlcklkbGUuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIG5vdCBjYWxsIGVudGVySWRsZScsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdlbnRlcklkbGUnKVxuXG4gICAgICBici5fZW50ZXJlZElkbGUgPSB0cnVlXG4gICAgICBici5fb25JZGxlKClcblxuICAgICAgZXhwZWN0KGJyLmVudGVySWRsZS5jYWxsQ291bnQpLnRvLmVxdWFsKDApXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI29wZW5Db25uZWN0aW9uJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICdjb25uZWN0JylcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAnY2xvc2UnKVxuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICdlbnF1ZXVlQ29tbWFuZCcpXG4gICAgfSlcbiAgICBpdCgnc2hvdWxkIG9wZW4gY29ubmVjdGlvbicsICgpID0+IHtcbiAgICAgIGJyLmNsaWVudC5jb25uZWN0LnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici5jbGllbnQuZW5xdWV1ZUNvbW1hbmQucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBjYXBhYmlsaXR5OiBbJ2NhcGExJywgJ2NhcGEyJ11cbiAgICAgIH0pKVxuICAgICAgc2V0VGltZW91dCgoKSA9PiBici5jbGllbnQub25yZWFkeSgpLCAwKVxuICAgICAgcmV0dXJuIGJyLm9wZW5Db25uZWN0aW9uKCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5jbGllbnQuY29ubmVjdC5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici5jbGllbnQuZW5xdWV1ZUNvbW1hbmQuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIuX2NhcGFiaWxpdHkubGVuZ3RoKS50by5lcXVhbCgyKVxuICAgICAgICBleHBlY3QoYnIuX2NhcGFiaWxpdHlbMF0pLnRvLmVxdWFsKCdjYXBhMScpXG4gICAgICAgIGV4cGVjdChici5fY2FwYWJpbGl0eVsxXSkudG8uZXF1YWwoJ2NhcGEyJylcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2Nvbm5lY3QnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLmNsaWVudCwgJ2Nvbm5lY3QnKVxuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICdjbG9zZScpXG4gICAgICBzaW5vbi5zdHViKGJyLCAndXBkYXRlQ2FwYWJpbGl0eScpXG4gICAgICBzaW5vbi5zdHViKGJyLCAndXBncmFkZUNvbm5lY3Rpb24nKVxuICAgICAgc2lub24uc3R1YihiciwgJ3VwZGF0ZUlkJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdsb2dpbicpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnY29tcHJlc3NDb25uZWN0aW9uJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjb25uZWN0JywgKCkgPT4ge1xuICAgICAgYnIuY2xpZW50LmNvbm5lY3QucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIGJyLnVwZGF0ZUNhcGFiaWxpdHkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIGJyLnVwZ3JhZGVDb25uZWN0aW9uLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici51cGRhdGVJZC5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuICAgICAgYnIubG9naW4ucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIGJyLmNvbXByZXNzQ29ubmVjdGlvbi5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IGJyLmNsaWVudC5vbnJlYWR5KCksIDApXG4gICAgICByZXR1cm4gYnIuY29ubmVjdCgpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmNvbm5lY3QuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIudXBkYXRlQ2FwYWJpbGl0eS5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici51cGdyYWRlQ29ubmVjdGlvbi5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici51cGRhdGVJZC5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici5sb2dpbi5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgICAgIGV4cGVjdChici5jb21wcmVzc0Nvbm5lY3Rpb24uY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBmYWlsIHRvIGxvZ2luJywgKGRvbmUpID0+IHtcbiAgICAgIGJyLmNsaWVudC5jb25uZWN0LnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici51cGRhdGVDYXBhYmlsaXR5LnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici51cGdyYWRlQ29ubmVjdGlvbi5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuICAgICAgYnIudXBkYXRlSWQucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIGJyLmxvZ2luLnRocm93cyhuZXcgRXJyb3IoKSlcblxuICAgICAgc2V0VGltZW91dCgoKSA9PiBici5jbGllbnQub25yZWFkeSgpLCAwKVxuICAgICAgYnIuY29ubmVjdCgpLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgZXhwZWN0KGVycikudG8uZXhpc3RcblxuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmNvbm5lY3QuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmNsb3NlLmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgICAgZXhwZWN0KGJyLnVwZGF0ZUNhcGFiaWxpdHkuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIudXBncmFkZUNvbm5lY3Rpb24uY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIudXBkYXRlSWQuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIubG9naW4uY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuXG4gICAgICAgIGV4cGVjdChici5jb21wcmVzc0Nvbm5lY3Rpb24uY2FsbGVkKS50by5iZS5mYWxzZVxuXG4gICAgICAgIGRvbmUoKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCB0aW1lb3V0JywgKGRvbmUpID0+IHtcbiAgICAgIGJyLmNsaWVudC5jb25uZWN0LnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici50aW1lb3V0Q29ubmVjdGlvbiA9IDFcblxuICAgICAgYnIuY29ubmVjdCgpLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgZXhwZWN0KGVycikudG8uZXhpc3RcblxuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmNvbm5lY3QuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmNsb3NlLmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcblxuICAgICAgICBleHBlY3QoYnIudXBkYXRlQ2FwYWJpbGl0eS5jYWxsZWQpLnRvLmJlLmZhbHNlXG4gICAgICAgIGV4cGVjdChici51cGdyYWRlQ29ubmVjdGlvbi5jYWxsZWQpLnRvLmJlLmZhbHNlXG4gICAgICAgIGV4cGVjdChici51cGRhdGVJZC5jYWxsZWQpLnRvLmJlLmZhbHNlXG4gICAgICAgIGV4cGVjdChici5sb2dpbi5jYWxsZWQpLnRvLmJlLmZhbHNlXG4gICAgICAgIGV4cGVjdChici5jb21wcmVzc0Nvbm5lY3Rpb24uY2FsbGVkKS50by5iZS5mYWxzZVxuXG4gICAgICAgIGRvbmUoKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjY2xvc2UnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBmb3JjZS1jbG9zZScsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAnY2xvc2UnKS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuXG4gICAgICByZXR1cm4gYnIuY2xvc2UoKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLl9zdGF0ZSkudG8uZXF1YWwoU1RBVEVfTE9HT1VUKVxuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmNsb3NlLmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2V4ZWMnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnYnJlYWtJZGxlJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBzZW5kIHN0cmluZyBjb21tYW5kJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICdlbnF1ZXVlQ29tbWFuZCcpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHt9KSlcbiAgICAgIHJldHVybiBici5leGVjKCdURVNUJykudGhlbigocmVzKSA9PiB7XG4gICAgICAgIGV4cGVjdChyZXMpLnRvLmRlZXAuZXF1YWwoe30pXG4gICAgICAgIGV4cGVjdChici5jbGllbnQuZW5xdWV1ZUNvbW1hbmQuYXJnc1swXVswXSkudG8uZXF1YWwoJ1RFU1QnKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCB1cGRhdGUgY2FwYWJpbGl0eSBmcm9tIHJlc3BvbnNlJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1Yihici5jbGllbnQsICdlbnF1ZXVlQ29tbWFuZCcpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgY2FwYWJpbGl0eTogWydBJywgJ0InXVxuICAgICAgfSkpXG4gICAgICByZXR1cm4gYnIuZXhlYygnVEVTVCcpLnRoZW4oKHJlcykgPT4ge1xuICAgICAgICBleHBlY3QocmVzKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgICBjYXBhYmlsaXR5OiBbJ0EnLCAnQiddXG4gICAgICAgIH0pXG4gICAgICAgIGV4cGVjdChici5fY2FwYWJpbGl0eSkudG8uZGVlcC5lcXVhbChbJ0EnLCAnQiddKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjZW50ZXJJZGxlJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcGVyaW9kaWNhbGx5IHNlbmQgTk9PUCBpZiBJRExFIG5vdCBzdXBwb3J0ZWQnLCAoZG9uZSkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKS5jYWxsc0Zha2UoKGNvbW1hbmQpID0+IHtcbiAgICAgICAgZXhwZWN0KGNvbW1hbmQpLnRvLmVxdWFsKCdOT09QJylcblxuICAgICAgICBkb25lKClcbiAgICAgIH0pXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gW11cbiAgICAgIGJyLl9zZWxlY3RlZE1haWxib3ggPSAnRk9PJ1xuICAgICAgYnIudGltZW91dE5vb3AgPSAxXG4gICAgICBici5lbnRlcklkbGUoKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHBlcmlvZGljYWxseSBzZW5kIE5PT1AgaWYgbm8gbWFpbGJveCBzZWxlY3RlZCcsIChkb25lKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpLmNhbGxzRmFrZSgoY29tbWFuZCkgPT4ge1xuICAgICAgICBleHBlY3QoY29tbWFuZCkudG8uZXF1YWwoJ05PT1AnKVxuXG4gICAgICAgIGRvbmUoKVxuICAgICAgfSlcblxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ0lETEUnXVxuICAgICAgYnIuX3NlbGVjdGVkTWFpbGJveCA9IHVuZGVmaW5lZFxuICAgICAgYnIudGltZW91dE5vb3AgPSAxXG4gICAgICBici5lbnRlcklkbGUoKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGJyZWFrIElETEUgYWZ0ZXIgdGltZW91dCcsIChkb25lKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLmNsaWVudCwgJ2VucXVldWVDb21tYW5kJylcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LnNvY2tldCwgJ3NlbmQnKS5jYWxsc0Zha2UoKHBheWxvYWQpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmNsaWVudC5lbnF1ZXVlQ29tbWFuZC5hcmdzWzBdWzBdLmNvbW1hbmQpLnRvLmVxdWFsKCdJRExFJylcbiAgICAgICAgZXhwZWN0KFtdLnNsaWNlLmNhbGwobmV3IFVpbnQ4QXJyYXkocGF5bG9hZCkpKS50by5kZWVwLmVxdWFsKFsweDQ0LCAweDRmLCAweDRlLCAweDQ1LCAweDBkLCAweDBhXSlcblxuICAgICAgICBkb25lKClcbiAgICAgIH0pXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydJRExFJ11cbiAgICAgIGJyLl9zZWxlY3RlZE1haWxib3ggPSAnRk9PJ1xuICAgICAgYnIudGltZW91dElkbGUgPSAxXG4gICAgICBici5lbnRlcklkbGUoKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNicmVha0lkbGUnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBzZW5kIERPTkUgdG8gc29ja2V0JywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1Yihici5jbGllbnQuc29ja2V0LCAnc2VuZCcpXG5cbiAgICAgIGJyLl9lbnRlcmVkSWRsZSA9ICdJRExFJ1xuICAgICAgYnIuYnJlYWtJZGxlKClcbiAgICAgIGV4cGVjdChbXS5zbGljZS5jYWxsKG5ldyBVaW50OEFycmF5KGJyLmNsaWVudC5zb2NrZXQuc2VuZC5hcmdzWzBdWzBdKSkpLnRvLmRlZXAuZXF1YWwoWzB4NDQsIDB4NGYsIDB4NGUsIDB4NDUsIDB4MGQsIDB4MGFdKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyN1cGdyYWRlQ29ubmVjdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGRvIG5vdGhpbmcgaWYgYWxyZWFkeSBzZWN1cmVkJywgKCkgPT4ge1xuICAgICAgYnIuY2xpZW50LnNlY3VyZU1vZGUgPSB0cnVlXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnc3RhcnR0bHMnXVxuICAgICAgcmV0dXJuIGJyLnVwZ3JhZGVDb25uZWN0aW9uKClcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBkbyBub3RoaW5nIGlmIFNUQVJUVExTIG5vdCBhdmFpbGFibGUnLCAoKSA9PiB7XG4gICAgICBici5jbGllbnQuc2VjdXJlTW9kZSA9IGZhbHNlXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFtdXG4gICAgICByZXR1cm4gYnIudXBncmFkZUNvbm5lY3Rpb24oKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJ1biBTVEFSVFRMUycsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAndXBncmFkZScpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpLndpdGhBcmdzKCdTVEFSVFRMUycpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBzaW5vbi5zdHViKGJyLCAndXBkYXRlQ2FwYWJpbGl0eScpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydTVEFSVFRMUyddXG5cbiAgICAgIHJldHVybiBici51cGdyYWRlQ29ubmVjdGlvbigpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuY2xpZW50LnVwZ3JhZGUuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoYnIuX2NhcGFiaWxpdHkubGVuZ3RoKS50by5lcXVhbCgwKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjdXBkYXRlQ2FwYWJpbGl0eScsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBkbyBub3RoaW5nIGlmIGNhcGFiaWxpdHkgaXMgc2V0JywgKCkgPT4ge1xuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ2FiYyddXG4gICAgICByZXR1cm4gYnIudXBkYXRlQ2FwYWJpbGl0eSgpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcnVuIENBUEFCSUxJVFkgaWYgY2FwYWJpbGl0eSBub3Qgc2V0JywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFtdXG5cbiAgICAgIHJldHVybiBici51cGRhdGVDYXBhYmlsaXR5KCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmFyZ3NbMF1bMF0pLnRvLmVxdWFsKCdDQVBBQklMSVRZJylcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZm9yY2UgcnVuIENBUEFCSUxJVFknLCAoKSA9PiB7XG4gICAgICBici5leGVjLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnYWJjJ11cblxuICAgICAgcmV0dXJuIGJyLnVwZGF0ZUNhcGFiaWxpdHkodHJ1ZSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmFyZ3NbMF1bMF0pLnRvLmVxdWFsKCdDQVBBQklMSVRZJylcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZG8gbm90aGluZyBpZiBjb25uZWN0aW9uIGlzIG5vdCB5ZXQgdXBncmFkZWQnLCAoKSA9PiB7XG4gICAgICBici5fY2FwYWJpbGl0eSA9IFtdXG4gICAgICBici5jbGllbnQuc2VjdXJlTW9kZSA9IGZhbHNlXG4gICAgICBici5fcmVxdWlyZVRMUyA9IHRydWVcblxuICAgICAgYnIudXBkYXRlQ2FwYWJpbGl0eSgpXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2xpc3ROYW1lc3BhY2VzJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJ1biBOQU1FU1BBQ0UgaWYgc3VwcG9ydGVkJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICBOQU1FU1BBQ0U6IFt7XG4gICAgICAgICAgICBhdHRyaWJ1dGVzOiBbXG4gICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICBbe1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ1NUUklORycsXG4gICAgICAgICAgICAgICAgICB2YWx1ZTogJ0lOQk9YLidcbiAgICAgICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgICB0eXBlOiAnU1RSSU5HJyxcbiAgICAgICAgICAgICAgICAgIHZhbHVlOiAnLidcbiAgICAgICAgICAgICAgICB9XVxuICAgICAgICAgICAgICBdLCBudWxsLCBudWxsXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfV1cbiAgICAgICAgfVxuICAgICAgfSkpXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnTkFNRVNQQUNFJ11cblxuICAgICAgcmV0dXJuIGJyLmxpc3ROYW1lc3BhY2VzKCkudGhlbigobmFtZXNwYWNlcykgPT4ge1xuICAgICAgICBleHBlY3QobmFtZXNwYWNlcykudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgICAgcGVyc29uYWw6IFt7XG4gICAgICAgICAgICBwcmVmaXg6ICdJTkJPWC4nLFxuICAgICAgICAgICAgZGVsaW1pdGVyOiAnLidcbiAgICAgICAgICB9XSxcbiAgICAgICAgICB1c2VyczogZmFsc2UsXG4gICAgICAgICAgc2hhcmVkOiBmYWxzZVxuICAgICAgICB9KVxuICAgICAgICBleHBlY3QoYnIuZXhlYy5hcmdzWzBdWzBdKS50by5lcXVhbCgnTkFNRVNQQUNFJylcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuYXJnc1swXVsxXSkudG8uZXF1YWwoJ05BTUVTUEFDRScpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGRvIG5vdGhpbmcgaWYgbm90IHN1cHBvcnRlZCcsICgpID0+IHtcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gW11cbiAgICAgIHJldHVybiBici5saXN0TmFtZXNwYWNlcygpLnRoZW4oKG5hbWVzcGFjZXMpID0+IHtcbiAgICAgICAgZXhwZWN0KG5hbWVzcGFjZXMpLnRvLmJlLmZhbHNlXG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMClcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2NvbXByZXNzQ29ubmVjdGlvbicsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICAgIHNpbm9uLnN0dWIoYnIuY2xpZW50LCAnZW5hYmxlQ29tcHJlc3Npb24nKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJ1biBDT01QUkVTUz1ERUZMQVRFIGlmIHN1cHBvcnRlZCcsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnQ09NUFJFU1MnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgIHR5cGU6ICdBVE9NJyxcbiAgICAgICAgICB2YWx1ZTogJ0RFRkxBVEUnXG4gICAgICAgIH1dXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7fSkpXG5cbiAgICAgIGJyLl9lbmFibGVDb21wcmVzc2lvbiA9IHRydWVcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydDT01QUkVTUz1ERUZMQVRFJ11cbiAgICAgIHJldHVybiBici5jb21wcmVzc0Nvbm5lY3Rpb24oKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoYnIuY2xpZW50LmVuYWJsZUNvbXByZXNzaW9uLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZG8gbm90aGluZyBpZiBub3Qgc3VwcG9ydGVkJywgKCkgPT4ge1xuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbXVxuXG4gICAgICByZXR1cm4gYnIuY29tcHJlc3NDb25uZWN0aW9uKCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMClcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZG8gbm90aGluZyBpZiBub3QgZW5hYmxlZCcsICgpID0+IHtcbiAgICAgIGJyLl9lbmFibGVDb21wcmVzc2lvbiA9IGZhbHNlXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnQ09NUFJFU1M9REVGTEFURSddXG5cbiAgICAgIHJldHVybiBici5jb21wcmVzc0Nvbm5lY3Rpb24oKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgwKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjbG9naW4nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBjYWxsIExPR0lOJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7fSkpXG4gICAgICBzaW5vbi5zdHViKGJyLCAndXBkYXRlQ2FwYWJpbGl0eScpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHRydWUpKVxuXG4gICAgICByZXR1cm4gYnIubG9naW4oe1xuICAgICAgICB1c2VyOiAndTEnLFxuICAgICAgICBwYXNzOiAncDEnXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoYnIuZXhlYy5hcmdzWzBdWzBdKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgICBjb21tYW5kOiAnbG9naW4nLFxuICAgICAgICAgIGF0dHJpYnV0ZXM6IFt7XG4gICAgICAgICAgICB0eXBlOiAnU1RSSU5HJyxcbiAgICAgICAgICAgIHZhbHVlOiAndTEnXG4gICAgICAgICAgfSwge1xuICAgICAgICAgICAgdHlwZTogJ1NUUklORycsXG4gICAgICAgICAgICB2YWx1ZTogJ3AxJyxcbiAgICAgICAgICAgIHNlbnNpdGl2ZTogdHJ1ZVxuICAgICAgICAgIH1dXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgQVVUSEVOVElDQVRFJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7fSkpXG4gICAgICBzaW5vbi5zdHViKGJyLCAndXBkYXRlQ2FwYWJpbGl0eScpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHRydWUpKVxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ0FVVEg9UExBSU4nXVxuXG4gICAgICByZXR1cm4gYnIubG9naW4oe1xuICAgICAgICB1c2VyOiAndTEnLFxuICAgICAgICBwYXNzOiAncDEnXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoYnIuZXhlYy5hcmdzWzBdWzBdKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgICBjb21tYW5kOiAnQVVUSEVOVElDQVRFJyxcbiAgICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgICAgdHlwZTogJ1RFWFQnLFxuICAgICAgICAgICAgdmFsdWU6ICdQTEFJTidcbiAgICAgICAgICB9LCB7XG4gICAgICAgICAgICBjaHVuazogdHJ1ZSxcbiAgICAgICAgICAgIHR5cGU6ICdURVhUJyxcbiAgICAgICAgICAgIHZhbHVlOiAnQUhVeEFIQXgnLFxuICAgICAgICAgICAgc2Vuc2l0aXZlOiB0cnVlXG4gICAgICAgICAgfV1cbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBYT0FVVEgyJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7fSkpXG4gICAgICBzaW5vbi5zdHViKGJyLCAndXBkYXRlQ2FwYWJpbGl0eScpLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHRydWUpKVxuXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnQVVUSD1YT0FVVEgyJ11cbiAgICAgIGJyLmxvZ2luKHtcbiAgICAgICAgdXNlcjogJ3UxJyxcbiAgICAgICAgeG9hdXRoMjogJ2FiYydcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChici5leGVjLmFyZ3NbMF1bMF0pLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICAgIGNvbW1hbmQ6ICdBVVRIRU5USUNBVEUnLFxuICAgICAgICAgIGF0dHJpYnV0ZXM6IFt7XG4gICAgICAgICAgICB0eXBlOiAnQVRPTScsXG4gICAgICAgICAgICB2YWx1ZTogJ1hPQVVUSDInXG4gICAgICAgICAgfSwge1xuICAgICAgICAgICAgdHlwZTogJ0FUT00nLFxuICAgICAgICAgICAgdmFsdWU6ICdkWE5sY2oxMU1RRmhkWFJvUFVKbFlYSmxjaUJoWW1NQkFRPT0nLFxuICAgICAgICAgICAgc2Vuc2l0aXZlOiB0cnVlXG4gICAgICAgICAgfV1cbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI3VwZGF0ZUlkJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIG5vdCBub3RoaW5nIGlmIG5vdCBzdXBwb3J0ZWQnLCAoKSA9PiB7XG4gICAgICBici5fY2FwYWJpbGl0eSA9IFtdXG5cbiAgICAgIHJldHVybiBici51cGRhdGVJZCh7XG4gICAgICAgIGE6ICdiJyxcbiAgICAgICAgYzogJ2QnXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLnNlcnZlcklkKS50by5iZS5mYWxzZVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBzZW5kIE5JTCcsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnSUQnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbXG4gICAgICAgICAgbnVsbFxuICAgICAgICBdXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICBJRDogW3tcbiAgICAgICAgICAgIGF0dHJpYnV0ZXM6IFtcbiAgICAgICAgICAgICAgbnVsbFxuICAgICAgICAgICAgXVxuICAgICAgICAgIH1dXG4gICAgICAgIH1cbiAgICAgIH0pKVxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ0lEJ11cblxuICAgICAgcmV0dXJuIGJyLnVwZGF0ZUlkKG51bGwpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuc2VydmVySWQpLnRvLmRlZXAuZXF1YWwoe30pXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGV4aGFuZ2UgSUQgdmFsdWVzJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdJRCcsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFtcbiAgICAgICAgICBbJ2NrZXkxJywgJ2N2YWwxJywgJ2NrZXkyJywgJ2N2YWwyJ11cbiAgICAgICAgXVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgSUQ6IFt7XG4gICAgICAgICAgICBhdHRyaWJ1dGVzOiBbXG4gICAgICAgICAgICAgIFt7XG4gICAgICAgICAgICAgICAgdmFsdWU6ICdza2V5MSdcbiAgICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHZhbHVlOiAnc3ZhbDEnXG4gICAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB2YWx1ZTogJ3NrZXkyJ1xuICAgICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdmFsdWU6ICdzdmFsMidcbiAgICAgICAgICAgICAgfV1cbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9XVxuICAgICAgICB9XG4gICAgICB9KSlcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydJRCddXG5cbiAgICAgIHJldHVybiBici51cGRhdGVJZCh7XG4gICAgICAgIGNrZXkxOiAnY3ZhbDEnLFxuICAgICAgICBja2V5MjogJ2N2YWwyJ1xuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5zZXJ2ZXJJZCkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgICAgc2tleTE6ICdzdmFsMScsXG4gICAgICAgICAgc2tleTI6ICdzdmFsMidcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2xpc3RNYWlsYm94ZXMnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBMSVNUIGFuZCBMU1VCIGluIHNlcXVlbmNlJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdMSVNUJyxcbiAgICAgICAgYXR0cmlidXRlczogWycnLCAnKiddXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICBMSVNUOiBbZmFsc2VdXG4gICAgICAgIH1cbiAgICAgIH0pKVxuXG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ0xTVUInLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbJycsICcqJ11cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgIExTVUI6IFtmYWxzZV1cbiAgICAgICAgfVxuICAgICAgfSkpXG5cbiAgICAgIHJldHVybiBici5saXN0TWFpbGJveGVzKCkudGhlbigodHJlZSkgPT4ge1xuICAgICAgICBleHBlY3QodHJlZSkudG8uZXhpc3RcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgbm90IGRpZSBvbiBOSUwgc2VwYXJhdG9ycycsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnTElTVCcsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFsnJywgJyonXVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgTElTVDogW1xuICAgICAgICAgICAgcGFyc2VyKHRvVHlwZWRBcnJheSgnKiBMSVNUIChcXFxcTm9JbmZlcmlvcnMpIE5JTCBcIklOQk9YXCInKSlcbiAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICAgIH0pKVxuXG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ0xTVUInLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbJycsICcqJ11cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgIExTVUI6IFtcbiAgICAgICAgICAgIHBhcnNlcih0b1R5cGVkQXJyYXkoJyogTFNVQiAoXFxcXE5vSW5mZXJpb3JzKSBOSUwgXCJJTkJPWFwiJykpXG4gICAgICAgICAgXVxuICAgICAgICB9XG4gICAgICB9KSlcblxuICAgICAgcmV0dXJuIGJyLmxpc3RNYWlsYm94ZXMoKS50aGVuKCh0cmVlKSA9PiB7XG4gICAgICAgIGV4cGVjdCh0cmVlKS50by5leGlzdFxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjY3JlYXRlTWFpbGJveCcsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIENSRUFURSB3aXRoIGEgc3RyaW5nIHBheWxvYWQnLCAoKSA9PiB7XG4gICAgICAvLyBUaGUgc3BlYyBhbGxvd3MgdW5xdW90ZWQgQVRPTS1zdHlsZSBzeW50YXggdG9vLCBidXQgZm9yXG4gICAgICAvLyBzaW1wbGljaXR5IHdlIGFsd2F5cyBnZW5lcmF0ZSBhIHN0cmluZyBldmVuIGlmIGl0IGNvdWxkIGJlXG4gICAgICAvLyBleHByZXNzZWQgYXMgYW4gYXRvbS5cbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnQ1JFQVRFJyxcbiAgICAgICAgYXR0cmlidXRlczogWydtYWlsYm94bmFtZSddXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuXG4gICAgICByZXR1cm4gYnIuY3JlYXRlTWFpbGJveCgnbWFpbGJveG5hbWUnKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCB0cmVhdCBhbiBBTFJFQURZRVhJU1RTIHJlc3BvbnNlIGFzIHN1Y2Nlc3MnLCAoKSA9PiB7XG4gICAgICB2YXIgZmFrZUVyciA9IHtcbiAgICAgICAgY29kZTogJ0FMUkVBRFlFWElTVFMnXG4gICAgICB9XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ0NSRUFURScsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFsnbWFpbGJveG5hbWUnXVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlamVjdChmYWtlRXJyKSlcblxuICAgICAgcmV0dXJuIGJyLmNyZWF0ZU1haWxib3goJ21haWxib3huYW1lJykudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2RlbGV0ZU1haWxib3gnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBERUxFVEUgd2l0aCBhIHN0cmluZyBwYXlsb2FkJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdERUxFVEUnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbJ21haWxib3huYW1lJ11cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIHJldHVybiBici5kZWxldGVNYWlsYm94KCdtYWlsYm94bmFtZScpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUuc2tpcCgnI2xpc3RNZXNzYWdlcycsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdfYnVpbGRGRVRDSENvbW1hbmQnKVxuICAgICAgc2lub24uc3R1YihiciwgJ19wYXJzZUZFVENIJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIEZFVENIJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgnYWJjJykpXG4gICAgICBici5fYnVpbGRGRVRDSENvbW1hbmQud2l0aEFyZ3MoWycxOjInLCBbJ3VpZCcsICdmbGFncyddLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9XSkucmV0dXJucyh7fSlcblxuICAgICAgcmV0dXJuIGJyLmxpc3RNZXNzYWdlcygnSU5CT1gnLCAnMToyJywgWyd1aWQnLCAnZmxhZ3MnXSwge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5fYnVpbGRGRVRDSENvbW1hbmQuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoYnIuX3BhcnNlRkVUQ0gud2l0aEFyZ3MoJ2FiYycpLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZS5za2lwKCcjc2VhcmNoJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgICAgc2lub24uc3R1YihiciwgJ19idWlsZFNFQVJDSENvbW1hbmQnKVxuICAgICAgc2lub24uc3R1YihiciwgJ19wYXJzZVNFQVJDSCcpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgY2FsbCBTRUFSQ0gnLCAoKSA9PiB7XG4gICAgICBici5leGVjLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCdhYmMnKSlcbiAgICAgIGJyLl9idWlsZFNFQVJDSENvbW1hbmQud2l0aEFyZ3Moe1xuICAgICAgICB1aWQ6IDFcbiAgICAgIH0sIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH0pLnJldHVybnMoe30pXG5cbiAgICAgIHJldHVybiBici5zZWFyY2goJ0lOQk9YJywge1xuICAgICAgICB1aWQ6IDFcbiAgICAgIH0sIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuX2J1aWxkU0VBUkNIQ29tbWFuZC5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGJyLl9wYXJzZVNFQVJDSC53aXRoQXJncygnYWJjJykuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjdXBsb2FkJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgQVBQRU5EIHdpdGggY3VzdG9tIGZsYWcnLCAoKSA9PiB7XG4gICAgICBici5leGVjLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIHJldHVybiBici51cGxvYWQoJ21haWxib3gnLCAndGhpcyBpcyBhIG1lc3NhZ2UnLCB7XG4gICAgICAgIGZsYWdzOiBbJ1xcXFwkTXlGbGFnJ11cbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgQVBQRU5EIHcvbyBmbGFncycsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcblxuICAgICAgcmV0dXJuIGJyLnVwbG9hZCgnbWFpbGJveCcsICd0aGlzIGlzIGEgbWVzc2FnZScpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUuc2tpcCgnI3NldEZsYWdzJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgICAgc2lub24uc3R1YihiciwgJ19idWlsZFNUT1JFQ29tbWFuZCcpXG4gICAgICBzaW5vbi5zdHViKGJyLCAnX3BhcnNlRkVUQ0gnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgU1RPUkUnLCAoKSA9PiB7XG4gICAgICBici5leGVjLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCdhYmMnKSlcbiAgICAgIGJyLl9idWlsZFNUT1JFQ29tbWFuZC53aXRoQXJncygnMToyJywgJ0ZMQUdTJywgWydcXFxcU2VlbicsICckTXlGbGFnJ10sIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH0pLnJldHVybnMoe30pXG5cbiAgICAgIHJldHVybiBici5zZXRGbGFncygnSU5CT1gnLCAnMToyJywgWydcXFxcU2VlbicsICckTXlGbGFnJ10sIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChici5fcGFyc2VGRVRDSC53aXRoQXJncygnYWJjJykuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlLnNraXAoJyNzdG9yZScsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdfYnVpbGRTVE9SRUNvbW1hbmQnKVxuICAgICAgc2lub24uc3R1YihiciwgJ19wYXJzZUZFVENIJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIFNUT1JFJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgnYWJjJykpXG4gICAgICBici5fYnVpbGRTVE9SRUNvbW1hbmQud2l0aEFyZ3MoJzE6MicsICcrWC1HTS1MQUJFTFMnLCBbJ1xcXFxTZW50JywgJ1xcXFxKdW5rJ10sIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH0pLnJldHVybnMoe30pXG5cbiAgICAgIHJldHVybiBici5zdG9yZSgnSU5CT1gnLCAnMToyJywgJytYLUdNLUxBQkVMUycsIFsnXFxcXFNlbnQnLCAnXFxcXEp1bmsnXSwge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5fYnVpbGRTVE9SRUNvbW1hbmQuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChici5fcGFyc2VGRVRDSC53aXRoQXJncygnYWJjJykuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjZGVsZXRlTWVzc2FnZXMnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnc2V0RmxhZ3MnKVxuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgVUlEIEVYUFVOR0UnLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ1VJRCBFWFBVTkdFJyxcbiAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICB0eXBlOiAnc2VxdWVuY2UnLFxuICAgICAgICAgIHZhbHVlOiAnMToyJ1xuICAgICAgICB9XVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoJ2FiYycpKVxuICAgICAgYnIuc2V0RmxhZ3Mud2l0aEFyZ3MoJ0lOQk9YJywgJzE6MicsIHtcbiAgICAgICAgYWRkOiAnXFxcXERlbGV0ZWQnXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnVUlEUExVUyddXG4gICAgICByZXR1cm4gYnIuZGVsZXRlTWVzc2FnZXMoJ0lOQk9YJywgJzE6MicsIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZXhlYy5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgRVhQVU5HRScsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3MoJ0VYUFVOR0UnKS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgnYWJjJykpXG4gICAgICBici5zZXRGbGFncy53aXRoQXJncygnSU5CT1gnLCAnMToyJywge1xuICAgICAgICBhZGQ6ICdcXFxcRGVsZXRlZCdcbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gW11cbiAgICAgIHJldHVybiBici5kZWxldGVNZXNzYWdlcygnSU5CT1gnLCAnMToyJywge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2NvcHlNZXNzYWdlcycsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIENPUFknLCAoKSA9PiB7XG4gICAgICBici5leGVjLndpdGhBcmdzKHtcbiAgICAgICAgY29tbWFuZDogJ1VJRCBDT1BZJyxcbiAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICB0eXBlOiAnc2VxdWVuY2UnLFxuICAgICAgICAgIHZhbHVlOiAnMToyJ1xuICAgICAgICB9LCB7XG4gICAgICAgICAgdHlwZTogJ2F0b20nLFxuICAgICAgICAgIHZhbHVlOiAnW0dtYWlsXS9UcmFzaCdcbiAgICAgICAgfV1cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgY29weXVpZDogWycxJywgJzE6MicsICc0LDMnXVxuICAgICAgfSkpXG5cbiAgICAgIHJldHVybiBici5jb3B5TWVzc2FnZXMoJ0lOQk9YJywgJzE6MicsICdbR21haWxdL1RyYXNoJywge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkudGhlbigocmVzcG9uc2UpID0+IHtcbiAgICAgICAgZXhwZWN0KHJlc3BvbnNlKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgICBzcmNTZXFTZXQ6ICcxOjInLFxuICAgICAgICAgIGRlc3RTZXFTZXQ6ICc0LDMnXG4gICAgICAgIH0pXG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI21vdmVNZXNzYWdlcycsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdleGVjJylcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdjb3B5TWVzc2FnZXMnKVxuICAgICAgc2lub24uc3R1YihiciwgJ2RlbGV0ZU1lc3NhZ2VzJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIE1PVkUgaWYgc3VwcG9ydGVkJywgKCkgPT4ge1xuICAgICAgYnIuZXhlYy53aXRoQXJncyh7XG4gICAgICAgIGNvbW1hbmQ6ICdVSUQgTU9WRScsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFt7XG4gICAgICAgICAgdHlwZTogJ3NlcXVlbmNlJyxcbiAgICAgICAgICB2YWx1ZTogJzE6MidcbiAgICAgICAgfSwge1xuICAgICAgICAgIHR5cGU6ICdhdG9tJyxcbiAgICAgICAgICB2YWx1ZTogJ1tHbWFpbF0vVHJhc2gnXG4gICAgICAgIH1dXG4gICAgICB9LCBbJ09LJ10pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCdhYmMnKSlcblxuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ01PVkUnXVxuICAgICAgcmV0dXJuIGJyLm1vdmVNZXNzYWdlcygnSU5CT1gnLCAnMToyJywgJ1tHbWFpbF0vVHJhc2gnLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBmYWxsYmFjayB0byBjb3B5K2V4cHVuZ2UnLCAoKSA9PiB7XG4gICAgICBici5jb3B5TWVzc2FnZXMud2l0aEFyZ3MoJ0lOQk9YJywgJzE6MicsICdbR21haWxdL1RyYXNoJywge1xuICAgICAgICBieVVpZDogdHJ1ZVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoKSlcbiAgICAgIGJyLmRlbGV0ZU1lc3NhZ2VzLndpdGhBcmdzKCcxOjInLCB7XG4gICAgICAgIGJ5VWlkOiB0cnVlXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFtdXG4gICAgICByZXR1cm4gYnIubW92ZU1lc3NhZ2VzKCdJTkJPWCcsICcxOjInLCAnW0dtYWlsXS9UcmFzaCcsIHtcbiAgICAgICAgYnlVaWQ6IHRydWVcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoYnIuZGVsZXRlTWVzc2FnZXMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjX3Nob3VsZFNlbGVjdE1haWxib3gnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gdHJ1ZSB3aGVuIGN0eCBpcyB1bmRlZmluZWQnLCAoKSA9PiB7XG4gICAgICBleHBlY3QoYnIuX3Nob3VsZFNlbGVjdE1haWxib3goJ3BhdGgnKSkudG8uYmUudHJ1ZVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiB0cnVlIHdoZW4gYSBkaWZmZXJlbnQgcGF0aCBpcyBxdWV1ZWQnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLmNsaWVudCwgJ2dldFByZXZpb3VzbHlRdWV1ZWQnKS5yZXR1cm5zKHtcbiAgICAgICAgcmVxdWVzdDoge1xuICAgICAgICAgIGNvbW1hbmQ6ICdTRUxFQ1QnLFxuICAgICAgICAgIGF0dHJpYnV0ZXM6IFt7XG4gICAgICAgICAgICB0eXBlOiAnU1RSSU5HJyxcbiAgICAgICAgICAgIHZhbHVlOiAncXVldWVkIHBhdGgnXG4gICAgICAgICAgfV1cbiAgICAgICAgfVxuICAgICAgfSlcblxuICAgICAgZXhwZWN0KGJyLl9zaG91bGRTZWxlY3RNYWlsYm94KCdwYXRoJywge30pKS50by5iZS50cnVlXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIGZhbHNlIHdoZW4gdGhlIHNhbWUgcGF0aCBpcyBxdWV1ZWQnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLmNsaWVudCwgJ2dldFByZXZpb3VzbHlRdWV1ZWQnKS5yZXR1cm5zKHtcbiAgICAgICAgcmVxdWVzdDoge1xuICAgICAgICAgIGNvbW1hbmQ6ICdTRUxFQ1QnLFxuICAgICAgICAgIGF0dHJpYnV0ZXM6IFt7XG4gICAgICAgICAgICB0eXBlOiAnU1RSSU5HJyxcbiAgICAgICAgICAgIHZhbHVlOiAncXVldWVkIHBhdGgnXG4gICAgICAgICAgfV1cbiAgICAgICAgfVxuICAgICAgfSlcblxuICAgICAgZXhwZWN0KGJyLl9zaG91bGRTZWxlY3RNYWlsYm94KCdxdWV1ZWQgcGF0aCcsIHt9KSkudG8uYmUuZmFsc2VcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjc2VsZWN0TWFpbGJveCcsICgpID0+IHtcbiAgICBjb25zdCBwYXRoID0gJ1tHbWFpbF0vVHJhc2gnXG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGJyLCAnZXhlYycpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcnVuIFNFTEVDVCcsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnU0VMRUNUJyxcbiAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICB0eXBlOiAnU1RSSU5HJyxcbiAgICAgICAgICB2YWx1ZTogcGF0aFxuICAgICAgICB9XVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBjb2RlOiAnUkVBRC1XUklURSdcbiAgICAgIH0pKVxuXG4gICAgICByZXR1cm4gYnIuc2VsZWN0TWFpbGJveChwYXRoKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoYnIuX3N0YXRlKS50by5lcXVhbChTVEFURV9TRUxFQ1RFRClcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcnVuIFNFTEVDVCB3aXRoIENPTkRTVE9SRScsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnU0VMRUNUJyxcbiAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICB0eXBlOiAnU1RSSU5HJyxcbiAgICAgICAgICB2YWx1ZTogcGF0aFxuICAgICAgICB9LFxuICAgICAgICBbe1xuICAgICAgICAgIHR5cGU6ICdBVE9NJyxcbiAgICAgICAgICB2YWx1ZTogJ0NPTkRTVE9SRSdcbiAgICAgICAgfV1cbiAgICAgICAgXVxuICAgICAgfSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBjb2RlOiAnUkVBRC1XUklURSdcbiAgICAgIH0pKVxuXG4gICAgICBici5fY2FwYWJpbGl0eSA9IFsnQ09ORFNUT1JFJ11cbiAgICAgIHJldHVybiBici5zZWxlY3RNYWlsYm94KHBhdGgsIHtcbiAgICAgICAgY29uZHN0b3JlOiB0cnVlXG4gICAgICB9KS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoYnIuX3N0YXRlKS50by5lcXVhbChTVEFURV9TRUxFQ1RFRClcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGRlc2NyaWJlKCdzaG91bGQgZW1pdCBvbnNlbGVjdG1haWxib3ggYmVmb3JlIHNlbGVjdE1haWxib3ggaXMgcmVzb2x2ZWQnLCAoKSA9PiB7XG4gICAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgICAgYnIuZXhlYy5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgY29kZTogJ1JFQUQtV1JJVEUnXG4gICAgICAgIH0pKVxuICAgICAgfSlcblxuICAgICAgaXQoJ3doZW4gaXQgcmV0dXJucyBhIHByb21pc2UnLCAoKSA9PiB7XG4gICAgICAgIHZhciBwcm9taXNlUmVzb2x2ZWQgPSBmYWxzZVxuICAgICAgICBici5vbnNlbGVjdG1haWxib3ggPSAoKSA9PiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgIHJlc29sdmUoKVxuICAgICAgICAgIHByb21pc2VSZXNvbHZlZCA9IHRydWVcbiAgICAgICAgfSlcbiAgICAgICAgdmFyIG9uc2VsZWN0bWFpbGJveFNweSA9IHNpbm9uLnNweShiciwgJ29uc2VsZWN0bWFpbGJveCcpXG4gICAgICAgIHJldHVybiBici5zZWxlY3RNYWlsYm94KHBhdGgpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIGV4cGVjdChvbnNlbGVjdG1haWxib3hTcHkud2l0aEFyZ3MocGF0aCkuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICAgIGV4cGVjdChwcm9taXNlUmVzb2x2ZWQpLnRvLmVxdWFsKHRydWUpXG4gICAgICAgIH0pXG4gICAgICB9KVxuXG4gICAgICBpdCgnd2hlbiBpdCBkb2VzIG5vdCByZXR1cm4gYSBwcm9taXNlJywgKCkgPT4ge1xuICAgICAgICBici5vbnNlbGVjdG1haWxib3ggPSAoKSA9PiB7IH1cbiAgICAgICAgdmFyIG9uc2VsZWN0bWFpbGJveFNweSA9IHNpbm9uLnNweShiciwgJ29uc2VsZWN0bWFpbGJveCcpXG4gICAgICAgIHJldHVybiBici5zZWxlY3RNYWlsYm94KHBhdGgpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIGV4cGVjdChvbnNlbGVjdG1haWxib3hTcHkud2l0aEFyZ3MocGF0aCkuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBlbWl0IG9uY2xvc2VtYWlsYm94JywgKCkgPT4ge1xuICAgICAgbGV0IGNhbGxlZCA9IGZhbHNlXG4gICAgICBici5leGVjLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCdhYmMnKSkucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBjb2RlOiAnUkVBRC1XUklURSdcbiAgICAgIH0pKVxuXG4gICAgICBici5vbmNsb3NlbWFpbGJveCA9IChwYXRoKSA9PiB7XG4gICAgICAgIGV4cGVjdChwYXRoKS50by5lcXVhbCgneXl5JylcbiAgICAgICAgY2FsbGVkID0gdHJ1ZVxuICAgICAgfVxuXG4gICAgICBici5fc2VsZWN0ZWRNYWlsYm94ID0gJ3l5eSdcbiAgICAgIHJldHVybiBici5zZWxlY3RNYWlsYm94KHBhdGgpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoY2FsbGVkKS50by5iZS50cnVlXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNzdWJzY3JpYmUgYW5kIHVuc3Vic2NyaWJlJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihiciwgJ2V4ZWMnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGNhbGwgU1VCU0NSSUJFIHdpdGggYSBzdHJpbmcgcGF5bG9hZCcsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnU1VCU0NSSUJFJyxcbiAgICAgICAgYXR0cmlidXRlczogWydtYWlsYm94bmFtZSddXG4gICAgICB9KS5yZXR1cm5zKFByb21pc2UucmVzb2x2ZSgpKVxuXG4gICAgICByZXR1cm4gYnIuc3Vic2NyaWJlTWFpbGJveCgnbWFpbGJveG5hbWUnKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KGJyLmV4ZWMuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBjYWxsIFVOU1VCU0NSSUJFIHdpdGggYSBzdHJpbmcgcGF5bG9hZCcsICgpID0+IHtcbiAgICAgIGJyLmV4ZWMud2l0aEFyZ3Moe1xuICAgICAgICBjb21tYW5kOiAnVU5TVUJTQ1JJQkUnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbJ21haWxib3huYW1lJ11cbiAgICAgIH0pLnJldHVybnMoUHJvbWlzZS5yZXNvbHZlKCkpXG5cbiAgICAgIHJldHVybiBici51bnN1YnNjcmliZU1haWxib3goJ21haWxib3huYW1lJykudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChici5leGVjLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2hhc0NhcGFiaWxpdHknLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBkZXRlY3QgZXhpc3RpbmcgY2FwYWJpbGl0eScsICgpID0+IHtcbiAgICAgIGJyLl9jYXBhYmlsaXR5ID0gWydaWlonXVxuICAgICAgZXhwZWN0KGJyLmhhc0NhcGFiaWxpdHkoJ3p6eicpKS50by5iZS50cnVlXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZGV0ZWN0IG5vbiBleGlzdGluZyBjYXBhYmlsaXR5JywgKCkgPT4ge1xuICAgICAgYnIuX2NhcGFiaWxpdHkgPSBbJ1paWiddXG4gICAgICBleHBlY3QoYnIuaGFzQ2FwYWJpbGl0eSgnb29vJykpLnRvLmJlLmZhbHNlXG4gICAgICBleHBlY3QoYnIuaGFzQ2FwYWJpbGl0eSgpKS50by5iZS5mYWxzZVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNfdW50YWdnZWRPa0hhbmRsZXInLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCB1cGRhdGUgY2FwYWJpbGl0eSBpZiBwcmVzZW50JywgKCkgPT4ge1xuICAgICAgYnIuX3VudGFnZ2VkT2tIYW5kbGVyKHtcbiAgICAgICAgY2FwYWJpbGl0eTogWydhYmMnXVxuICAgICAgfSwgKCkgPT4geyB9KVxuICAgICAgZXhwZWN0KGJyLl9jYXBhYmlsaXR5KS50by5kZWVwLmVxdWFsKFsnYWJjJ10pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI191bnRhZ2dlZENhcGFiaWxpdHlIYW5kbGVyJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgdXBkYXRlIGNhcGFiaWxpdHknLCAoKSA9PiB7XG4gICAgICBici5fdW50YWdnZWRDYXBhYmlsaXR5SGFuZGxlcih7XG4gICAgICAgIGF0dHJpYnV0ZXM6IFt7XG4gICAgICAgICAgdmFsdWU6ICdhYmMnXG4gICAgICAgIH1dXG4gICAgICB9LCAoKSA9PiB7IH0pXG4gICAgICBleHBlY3QoYnIuX2NhcGFiaWxpdHkpLnRvLmRlZXAuZXF1YWwoWydBQkMnXSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjX3VudGFnZ2VkRXhpc3RzSGFuZGxlcicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGVtaXQgb251cGRhdGUnLCAoKSA9PiB7XG4gICAgICBici5vbnVwZGF0ZSA9IHNpbm9uLnN0dWIoKVxuICAgICAgYnIuX3NlbGVjdGVkTWFpbGJveCA9ICdGT08nXG5cbiAgICAgIGJyLl91bnRhZ2dlZEV4aXN0c0hhbmRsZXIoe1xuICAgICAgICBucjogMTIzXG4gICAgICB9LCAoKSA9PiB7IH0pXG4gICAgICBleHBlY3QoYnIub251cGRhdGUud2l0aEFyZ3MoJ0ZPTycsICdleGlzdHMnLCAxMjMpLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjX3VudGFnZ2VkRXhwdW5nZUhhbmRsZXInLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBlbWl0IG9udXBkYXRlJywgKCkgPT4ge1xuICAgICAgYnIub251cGRhdGUgPSBzaW5vbi5zdHViKClcbiAgICAgIGJyLl9zZWxlY3RlZE1haWxib3ggPSAnRk9PJ1xuXG4gICAgICBici5fdW50YWdnZWRFeHB1bmdlSGFuZGxlcih7XG4gICAgICAgIG5yOiAxMjNcbiAgICAgIH0sICgpID0+IHsgfSlcbiAgICAgIGV4cGVjdChici5vbnVwZGF0ZS53aXRoQXJncygnRk9PJywgJ2V4cHVuZ2UnLCAxMjMpLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlLnNraXAoJyNfdW50YWdnZWRGZXRjaEhhbmRsZXInLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBlbWl0IG9udXBkYXRlJywgKCkgPT4ge1xuICAgICAgYnIub251cGRhdGUgPSBzaW5vbi5zdHViKClcbiAgICAgIHNpbm9uLnN0dWIoYnIsICdfcGFyc2VGRVRDSCcpLnJldHVybnMoJ2FiYycpXG4gICAgICBici5fc2VsZWN0ZWRNYWlsYm94ID0gJ0ZPTydcblxuICAgICAgYnIuX3VudGFnZ2VkRmV0Y2hIYW5kbGVyKHtcbiAgICAgICAgbnI6IDEyM1xuICAgICAgfSwgKCkgPT4geyB9KVxuICAgICAgZXhwZWN0KGJyLm9udXBkYXRlLndpdGhBcmdzKCdGT08nLCAnZmV0Y2gnLCAnYWJjJykuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgZXhwZWN0KGJyLl9wYXJzZUZFVENILmFyZ3NbMF1bMF0pLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgRkVUQ0g6IFt7XG4gICAgICAgICAgICBucjogMTIzXG4gICAgICAgICAgfV1cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjX2NoYW5nZVN0YXRlJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgc2V0IHRoZSBzdGF0ZSB2YWx1ZScsICgpID0+IHtcbiAgICAgIGJyLl9jaGFuZ2VTdGF0ZSgxMjM0NSlcblxuICAgICAgZXhwZWN0KGJyLl9zdGF0ZSkudG8uZXF1YWwoMTIzNDUpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgZW1pdCBvbmNsb3NlbWFpbGJveCBpZiBtYWlsYm94IHdhcyBjbG9zZWQnLCAoKSA9PiB7XG4gICAgICBici5vbmNsb3NlbWFpbGJveCA9IHNpbm9uLnN0dWIoKVxuICAgICAgYnIuX3N0YXRlID0gU1RBVEVfU0VMRUNURURcbiAgICAgIGJyLl9zZWxlY3RlZE1haWxib3ggPSAnYWFhJ1xuXG4gICAgICBici5fY2hhbmdlU3RhdGUoMTIzNDUpXG5cbiAgICAgIGV4cGVjdChici5fc2VsZWN0ZWRNYWlsYm94KS50by5iZS5mYWxzZVxuICAgICAgZXhwZWN0KGJyLm9uY2xvc2VtYWlsYm94LndpdGhBcmdzKCdhYWEnKS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI19lbnN1cmVQYXRoJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgY3JlYXRlIHRoZSBwYXRoIGlmIG5vdCBwcmVzZW50JywgKCkgPT4ge1xuICAgICAgdmFyIHRyZWUgPSB7XG4gICAgICAgIGNoaWxkcmVuOiBbXVxuICAgICAgfVxuICAgICAgZXhwZWN0KGJyLl9lbnN1cmVQYXRoKHRyZWUsICdoZWxsby93b3JsZCcsICcvJykpLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICBuYW1lOiAnd29ybGQnLFxuICAgICAgICBkZWxpbWl0ZXI6ICcvJyxcbiAgICAgICAgcGF0aDogJ2hlbGxvL3dvcmxkJyxcbiAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICB9KVxuICAgICAgZXhwZWN0KHRyZWUpLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICBjaGlsZHJlbjogW3tcbiAgICAgICAgICBuYW1lOiAnaGVsbG8nLFxuICAgICAgICAgIGRlbGltaXRlcjogJy8nLFxuICAgICAgICAgIHBhdGg6ICdoZWxsbycsXG4gICAgICAgICAgY2hpbGRyZW46IFt7XG4gICAgICAgICAgICBuYW1lOiAnd29ybGQnLFxuICAgICAgICAgICAgZGVsaW1pdGVyOiAnLycsXG4gICAgICAgICAgICBwYXRoOiAnaGVsbG8vd29ybGQnLFxuICAgICAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICAgICAgfV1cbiAgICAgICAgfV1cbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIGV4aXN0aW5nIHBhdGggaWYgcG9zc2libGUnLCAoKSA9PiB7XG4gICAgICB2YXIgdHJlZSA9IHtcbiAgICAgICAgY2hpbGRyZW46IFt7XG4gICAgICAgICAgbmFtZTogJ2hlbGxvJyxcbiAgICAgICAgICBkZWxpbWl0ZXI6ICcvJyxcbiAgICAgICAgICBwYXRoOiAnaGVsbG8nLFxuICAgICAgICAgIGNoaWxkcmVuOiBbe1xuICAgICAgICAgICAgbmFtZTogJ3dvcmxkJyxcbiAgICAgICAgICAgIGRlbGltaXRlcjogJy8nLFxuICAgICAgICAgICAgcGF0aDogJ2hlbGxvL3dvcmxkJyxcbiAgICAgICAgICAgIGNoaWxkcmVuOiBbXSxcbiAgICAgICAgICAgIGFiYzogMTIzXG4gICAgICAgICAgfV1cbiAgICAgICAgfV1cbiAgICAgIH1cbiAgICAgIGV4cGVjdChici5fZW5zdXJlUGF0aCh0cmVlLCAnaGVsbG8vd29ybGQnLCAnLycpKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgbmFtZTogJ3dvcmxkJyxcbiAgICAgICAgZGVsaW1pdGVyOiAnLycsXG4gICAgICAgIHBhdGg6ICdoZWxsby93b3JsZCcsXG4gICAgICAgIGNoaWxkcmVuOiBbXSxcbiAgICAgICAgYWJjOiAxMjNcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIGNhc2UgaW5zZW5zaXRpdmUgSW5ib3gnLCAoKSA9PiB7XG4gICAgICB2YXIgdHJlZSA9IHtcbiAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICB9XG4gICAgICBleHBlY3QoYnIuX2Vuc3VyZVBhdGgodHJlZSwgJ0luYm94L3dvcmxkJywgJy8nKSkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgIG5hbWU6ICd3b3JsZCcsXG4gICAgICAgIGRlbGltaXRlcjogJy8nLFxuICAgICAgICBwYXRoOiAnSW5ib3gvd29ybGQnLFxuICAgICAgICBjaGlsZHJlbjogW11cbiAgICAgIH0pXG4gICAgICBleHBlY3QoYnIuX2Vuc3VyZVBhdGgodHJlZSwgJ0lOQk9YL3dvcmxkcycsICcvJykpLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICBuYW1lOiAnd29ybGRzJyxcbiAgICAgICAgZGVsaW1pdGVyOiAnLycsXG4gICAgICAgIHBhdGg6ICdJTkJPWC93b3JsZHMnLFxuICAgICAgICBjaGlsZHJlbjogW11cbiAgICAgIH0pXG5cbiAgICAgIGV4cGVjdCh0cmVlKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgY2hpbGRyZW46IFt7XG4gICAgICAgICAgbmFtZTogJ0luYm94JyxcbiAgICAgICAgICBkZWxpbWl0ZXI6ICcvJyxcbiAgICAgICAgICBwYXRoOiAnSW5ib3gnLFxuICAgICAgICAgIGNoaWxkcmVuOiBbe1xuICAgICAgICAgICAgbmFtZTogJ3dvcmxkJyxcbiAgICAgICAgICAgIGRlbGltaXRlcjogJy8nLFxuICAgICAgICAgICAgcGF0aDogJ0luYm94L3dvcmxkJyxcbiAgICAgICAgICAgIGNoaWxkcmVuOiBbXVxuICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgIG5hbWU6ICd3b3JsZHMnLFxuICAgICAgICAgICAgZGVsaW1pdGVyOiAnLycsXG4gICAgICAgICAgICBwYXRoOiAnSU5CT1gvd29ybGRzJyxcbiAgICAgICAgICAgIGNoaWxkcmVuOiBbXVxuICAgICAgICAgIH1dXG4gICAgICAgIH1dXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJ3VudGFnZ2VkIHVwZGF0ZXMnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZWNlaXZlIGluZm9ybWF0aW9uIGFib3V0IHVudGFnZ2VkIGV4aXN0cycsIChkb25lKSA9PiB7XG4gICAgICBici5jbGllbnQuX2Nvbm5lY3Rpb25SZWFkeSA9IHRydWVcbiAgICAgIGJyLl9zZWxlY3RlZE1haWxib3ggPSAnRk9PJ1xuICAgICAgYnIub251cGRhdGUgPSAocGF0aCwgdHlwZSwgdmFsdWUpID0+IHtcbiAgICAgICAgZXhwZWN0KHBhdGgpLnRvLmVxdWFsKCdGT08nKVxuICAgICAgICBleHBlY3QodHlwZSkudG8uZXF1YWwoJ2V4aXN0cycpXG4gICAgICAgIGV4cGVjdCh2YWx1ZSkudG8uZXF1YWwoMTIzKVxuICAgICAgICBkb25lKClcbiAgICAgIH1cbiAgICAgIGJyLmNsaWVudC5fb25EYXRhKHtcbiAgICAgICAgLyogKiAxMjMgRVhJU1RTXFxyXFxuICovXG4gICAgICAgIGRhdGE6IG5ldyBVaW50OEFycmF5KFs0MiwgMzIsIDQ5LCA1MCwgNTEsIDMyLCA2OSwgODgsIDczLCA4MywgODQsIDgzLCAxMywgMTBdKS5idWZmZXJcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcmVjZWl2ZSBpbmZvcm1hdGlvbiBhYm91dCB1bnRhZ2dlZCBleHB1bmdlJywgKGRvbmUpID0+IHtcbiAgICAgIGJyLmNsaWVudC5fY29ubmVjdGlvblJlYWR5ID0gdHJ1ZVxuICAgICAgYnIuX3NlbGVjdGVkTWFpbGJveCA9ICdGT08nXG4gICAgICBici5vbnVwZGF0ZSA9IChwYXRoLCB0eXBlLCB2YWx1ZSkgPT4ge1xuICAgICAgICBleHBlY3QocGF0aCkudG8uZXF1YWwoJ0ZPTycpXG4gICAgICAgIGV4cGVjdCh0eXBlKS50by5lcXVhbCgnZXhwdW5nZScpXG4gICAgICAgIGV4cGVjdCh2YWx1ZSkudG8uZXF1YWwoNDU2KVxuICAgICAgICBkb25lKClcbiAgICAgIH1cbiAgICAgIGJyLmNsaWVudC5fb25EYXRhKHtcbiAgICAgICAgLyogKiA0NTYgRVhQVU5HRVxcclxcbiAqL1xuICAgICAgICBkYXRhOiBuZXcgVWludDhBcnJheShbNDIsIDMyLCA1MiwgNTMsIDU0LCAzMiwgNjksIDg4LCA4MCwgODUsIDc4LCA3MSwgNjksIDEzLCAxMF0pLmJ1ZmZlclxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCByZWNlaXZlIGluZm9ybWF0aW9uIGFib3V0IHVudGFnZ2VkIGZldGNoJywgKGRvbmUpID0+IHtcbiAgICAgIGJyLmNsaWVudC5fY29ubmVjdGlvblJlYWR5ID0gdHJ1ZVxuICAgICAgYnIuX3NlbGVjdGVkTWFpbGJveCA9ICdGT08nXG4gICAgICBici5vbnVwZGF0ZSA9IChwYXRoLCB0eXBlLCB2YWx1ZSkgPT4ge1xuICAgICAgICBleHBlY3QocGF0aCkudG8uZXF1YWwoJ0ZPTycpXG4gICAgICAgIGV4cGVjdCh0eXBlKS50by5lcXVhbCgnZmV0Y2gnKVxuICAgICAgICBleHBlY3QodmFsdWUpLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICAgICcjJzogMTIzLFxuICAgICAgICAgIGZsYWdzOiBbJ1xcXFxTZWVuJ10sXG4gICAgICAgICAgbW9kc2VxOiAnNCdcbiAgICAgICAgfSlcbiAgICAgICAgZG9uZSgpXG4gICAgICB9XG4gICAgICBici5jbGllbnQuX29uRGF0YSh7XG4gICAgICAgIC8qICogMTIzIEZFVENIIChGTEFHUyAoXFxcXFNlZW4pIE1PRFNFUSAoNCkpXFxyXFxuICovXG4gICAgICAgIGRhdGE6IG5ldyBVaW50OEFycmF5KFs0MiwgMzIsIDQ5LCA1MCwgNTEsIDMyLCA3MCwgNjksIDg0LCA2NywgNzIsIDMyLCA0MCwgNzAsIDc2LCA2NSwgNzEsIDgzLCAzMiwgNDAsIDkyLCA4MywgMTAxLCAxMDEsIDExMCwgNDEsIDMyLCA3NywgNzksIDY4LCA4MywgNjksIDgxLCAzMiwgNDAsIDUyLCA0MSwgNDEsIDEzLCAxMF0pLmJ1ZmZlclxuICAgICAgfSlcbiAgICB9KVxuICB9KVxufSlcbiJdLCJtYXBwaW5ncyI6Ijs7QUFF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