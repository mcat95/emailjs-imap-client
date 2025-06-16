"use strict";

var _imap = _interopRequireDefault(require("./imap"));
var _common = require("./common");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/* eslint-disable no-unused-expressions */

const host = 'localhost';
const port = 10000;
describe('browserbox imap unit tests', () => {
  var client, socketStub;

  /* jshint indent:false */

  beforeEach(() => {
    client = new _imap.default(host, port);
    expect(client).to.exist;
    client.logger = {
      debug: () => {},
      error: () => {}
    };
    var Socket = function () {};
    Socket.open = () => {};
    Socket.prototype.close = () => {};
    Socket.prototype.send = () => {};
    Socket.prototype.suspend = () => {};
    Socket.prototype.resume = () => {};
    Socket.prototype.upgradeToSecure = () => {};
    socketStub = sinon.createStubInstance(Socket);
    sinon.stub(Socket, 'open').withArgs(host, port).returns(socketStub);
    var promise = client.connect(Socket).then(() => {
      expect(Socket.open.callCount).to.equal(1);
      expect(socketStub.onerror).to.exist;
      expect(socketStub.onopen).to.exist;
      expect(socketStub.onclose).to.exist;
      expect(socketStub.ondata).to.exist;
    });
    setTimeout(() => socketStub.onopen(), 10);
    return promise;
  });
  describe.skip('#close', () => {
    it('should call socket.close', () => {
      client.socket.readyState = 'open';
      setTimeout(() => socketStub.onclose(), 10);
      return client.close().then(() => {
        expect(socketStub.close.callCount).to.equal(1);
      });
    });
    it('should not call socket.close', () => {
      client.socket.readyState = 'not open. duh.';
      setTimeout(() => socketStub.onclose(), 10);
      return client.close().then(() => {
        expect(socketStub.close.called).to.be.false;
      });
    });
  });
  describe('#upgrade', () => {
    it('should upgrade socket', () => {
      client.secureMode = false;
      client.upgrade();
    });
    it('should not upgrade socket', () => {
      client.secureMode = true;
      client.upgrade();
    });
  });
  describe('#setHandler', () => {
    it('should set global handler for keyword', () => {
      var handler = () => {};
      client.setHandler('fetch', handler);
      expect(client._globalAcceptUntagged.FETCH).to.equal(handler);
    });
  });
  describe('#socket.onerror', () => {
    it('should emit error and close connection', done => {
      client.socket.onerror({
        data: new Error('err')
      });
      client.onerror = () => {
        done();
      };
    });
  });
  describe('#socket.onclose', () => {
    it('should emit error ', done => {
      client.socket.onclose();
      client.onerror = () => {
        done();
      };
    });
  });
  describe('#_onData', () => {
    it('should process input', () => {
      sinon.stub(client, '_parseIncomingCommands');
      sinon.stub(client, '_iterateIncomingBuffer');
      client._onData({
        data: (0, _common.toTypedArray)('foobar').buffer
      });
      expect(client._parseIncomingCommands.calledOnce).to.be.true;
      expect(client._iterateIncomingBuffer.calledOnce).to.be.true;
    });
  });
  describe('rateIncomingBuffer', () => {
    it('should iterate chunked input', () => {
      appendIncomingBuffer('* 1 FETCH (UID 1)\r\n* 2 FETCH (UID 2)\r\n* 3 FETCH (UID 3)\r\n');
      var iterator = client._iterateIncomingBuffer();
      expect(String.fromCharCode.apply(null, iterator.next().value)).to.equal('* 1 FETCH (UID 1)');
      expect(String.fromCharCode.apply(null, iterator.next().value)).to.equal('* 2 FETCH (UID 2)');
      expect(String.fromCharCode.apply(null, iterator.next().value)).to.equal('* 3 FETCH (UID 3)');
      expect(iterator.next().value).to.be.undefined;
    });
    it('should process chunked literals', () => {
      appendIncomingBuffer('* 1 FETCH (UID {1}\r\n1)\r\n* 2 FETCH (UID {4}\r\n2345)\r\n* 3 FETCH (UID {4}\r\n3789)\r\n');
      var iterator = client._iterateIncomingBuffer();
      expect(String.fromCharCode.apply(null, iterator.next().value)).to.equal('* 1 FETCH (UID {1}\r\n1)');
      expect(String.fromCharCode.apply(null, iterator.next().value)).to.equal('* 2 FETCH (UID {4}\r\n2345)');
      expect(String.fromCharCode.apply(null, iterator.next().value)).to.equal('* 3 FETCH (UID {4}\r\n3789)');
      expect(iterator.next().value).to.be.undefined;
    });
    it('should process chunked literals 2', () => {
      appendIncomingBuffer('* 1 FETCH (UID 1)\r\n* 2 FETCH (UID {4}\r\n2345)\r\n');
      var iterator = client._iterateIncomingBuffer();
      expect(String.fromCharCode.apply(null, iterator.next().value)).to.equal('* 1 FETCH (UID 1)');
      expect(String.fromCharCode.apply(null, iterator.next().value)).to.equal('* 2 FETCH (UID {4}\r\n2345)');
      expect(iterator.next().value).to.be.undefined;
    });
    it('should process chunked literals 3', () => {
      appendIncomingBuffer('* 1 FETCH (UID {1}\r\n1)\r\n* 2 FETCH (UID 4)\r\n');
      var iterator = client._iterateIncomingBuffer();
      expect(String.fromCharCode.apply(null, iterator.next().value)).to.equal('* 1 FETCH (UID {1}\r\n1)');
      expect(String.fromCharCode.apply(null, iterator.next().value)).to.equal('* 2 FETCH (UID 4)');
      expect(iterator.next().value).to.be.undefined;
    });
    it('should process chunked literals 4', () => {
      appendIncomingBuffer('* SEARCH {1}\r\n1 {1}\r\n2\r\n');
      var iterator = client._iterateIncomingBuffer();
      expect(String.fromCharCode.apply(null, iterator.next().value)).to.equal('* SEARCH {1}\r\n1 {1}\r\n2');
    });
    it('should process CRLF literal', () => {
      appendIncomingBuffer('* 1 FETCH (UID 20 BODY[HEADER.FIELDS (REFERENCES LIST-ID)] {2}\r\n\r\n)\r\n');
      var iterator = client._iterateIncomingBuffer();
      expect(String.fromCharCode.apply(null, iterator.next().value)).to.equal('* 1 FETCH (UID 20 BODY[HEADER.FIELDS (REFERENCES LIST-ID)] {2}\r\n\r\n)');
    });
    it('should process CRLF literal 2', () => {
      appendIncomingBuffer('* 1 FETCH (UID 1 ENVELOPE ("string with {parenthesis}") BODY[HEADER.FIELDS (REFERENCES LIST-ID)] {2}\r\n\r\n)\r\n');
      var iterator = client._iterateIncomingBuffer();
      expect(String.fromCharCode.apply(null, iterator.next().value)).to.equal('* 1 FETCH (UID 1 ENVELOPE ("string with {parenthesis}") BODY[HEADER.FIELDS (REFERENCES LIST-ID)] {2}\r\n\r\n)');
    });
    it('should parse multiple zero-length literals', () => {
      appendIncomingBuffer('* 126015 FETCH (UID 585599 BODY[1.2] {0}\r\n BODY[1.1] {0}\r\n)\r\n');
      var iterator = client._iterateIncomingBuffer();
      expect(String.fromCharCode.apply(null, iterator.next().value)).to.equal('* 126015 FETCH (UID 585599 BODY[1.2] {0}\r\n BODY[1.1] {0}\r\n)');
    });
    it('should process two commands when CRLF arrives in 2 parts', () => {
      appendIncomingBuffer('* 1 FETCH (UID 1)\r');
      var iterator1 = client._iterateIncomingBuffer();
      expect(iterator1.next().value).to.be.undefined;
      appendIncomingBuffer('\n* 2 FETCH (UID 2)\r\n');
      var iterator2 = client._iterateIncomingBuffer();
      expect(String.fromCharCode.apply(null, iterator2.next().value)).to.equal('* 1 FETCH (UID 1)');
      expect(String.fromCharCode.apply(null, iterator2.next().value)).to.equal('* 2 FETCH (UID 2)');
      expect(iterator2.next().value).to.be.undefined;
    });
    it('should process literal when literal count arrives in 2 parts', () => {
      appendIncomingBuffer('* 1 FETCH (UID {');
      var iterator1 = client._iterateIncomingBuffer();
      expect(iterator1.next().value).to.be.undefined;
      appendIncomingBuffer('2}\r\n12)\r\n');
      var iterator2 = client._iterateIncomingBuffer();
      expect(String.fromCharCode.apply(null, iterator2.next().value)).to.equal('* 1 FETCH (UID {2}\r\n12)');
      expect(iterator2.next().value).to.be.undefined;
    });
    it('should process literal when literal count arrives in 2 parts 2', () => {
      appendIncomingBuffer('* 1 FETCH (UID {1');
      var iterator1 = client._iterateIncomingBuffer();
      expect(iterator1.next().value).to.be.undefined;
      appendIncomingBuffer('0}\r\n0123456789)\r\n');
      var iterator2 = client._iterateIncomingBuffer();
      expect(String.fromCharCode.apply(null, iterator2.next().value)).to.equal('* 1 FETCH (UID {10}\r\n0123456789)');
      expect(iterator2.next().value).to.be.undefined;
    });
    it('should process literal when literal count arrives in 2 parts 3', () => {
      appendIncomingBuffer('* 1 FETCH (UID {');
      var iterator1 = client._iterateIncomingBuffer();
      expect(iterator1.next().value).to.be.undefined;
      appendIncomingBuffer('10}\r\n1234567890)\r\n');
      var iterator2 = client._iterateIncomingBuffer();
      expect(String.fromCharCode.apply(null, iterator2.next().value)).to.equal('* 1 FETCH (UID {10}\r\n1234567890)');
      expect(iterator2.next().value).to.be.undefined;
    });
    it('should process literal when literal count arrives in 2 parts 4', () => {
      appendIncomingBuffer('* 1 FETCH (UID 1 BODY[HEADER.FIELDS (REFERENCES LIST-ID)] {2}\r');
      var iterator1 = client._iterateIncomingBuffer();
      expect(iterator1.next().value).to.be.undefined;
      appendIncomingBuffer('\nXX)\r\n');
      var iterator2 = client._iterateIncomingBuffer();
      expect(String.fromCharCode.apply(null, iterator2.next().value)).to.equal('* 1 FETCH (UID 1 BODY[HEADER.FIELDS (REFERENCES LIST-ID)] {2}\r\nXX)');
    });
    it('should process literal when literal count arrives in 3 parts', () => {
      appendIncomingBuffer('* 1 FETCH (UID {');
      var iterator1 = client._iterateIncomingBuffer();
      expect(iterator1.next().value).to.be.undefined;
      appendIncomingBuffer('1');
      var iterator2 = client._iterateIncomingBuffer();
      expect(iterator2.next().value).to.be.undefined;
      appendIncomingBuffer('}\r\n1)\r\n');
      var iterator3 = client._iterateIncomingBuffer();
      expect(String.fromCharCode.apply(null, iterator3.next().value)).to.equal('* 1 FETCH (UID {1}\r\n1)');
      expect(iterator3.next().value).to.be.undefined;
    });
    it('should process SEARCH response when it arrives in 2 parts', () => {
      appendIncomingBuffer('* SEARCH 1 2');
      var iterator1 = client._iterateIncomingBuffer();
      expect(iterator1.next().value).to.be.undefined;
      appendIncomingBuffer(' 3 4\r\n');
      var iterator2 = client._iterateIncomingBuffer();
      expect(String.fromCharCode.apply(null, iterator2.next().value)).to.equal('* SEARCH 1 2 3 4');
      expect(iterator2.next().value).to.be.undefined;
    });
    it('should not process {} in string as literal 1', () => {
      appendIncomingBuffer('* 1 FETCH (UID 1 ENVELOPE ("string with {parenthesis}"))\r\n');
      var iterator = client._iterateIncomingBuffer();
      expect(String.fromCharCode.apply(null, iterator.next().value)).to.equal('* 1 FETCH (UID 1 ENVELOPE ("string with {parenthesis}"))');
    });
    it('should not process {} in string as literal 2', () => {
      appendIncomingBuffer('* 1 FETCH (UID 1 ENVELOPE ("string with number in parenthesis {123}"))\r\n');
      var iterator = client._iterateIncomingBuffer();
      expect(String.fromCharCode.apply(null, iterator.next().value)).to.equal('* 1 FETCH (UID 1 ENVELOPE ("string with number in parenthesis {123}"))');
    });
    function appendIncomingBuffer(content) {
      client._incomingBuffers.push((0, _common.toTypedArray)(content));
    }
  });
  describe('#_parseIncomingCommands', () => {
    it('should process a tagged item from the queue', () => {
      client.onready = sinon.stub();
      sinon.stub(client, '_handleResponse');
      function* gen() {
        yield (0, _common.toTypedArray)('OK Hello world!');
      }
      client._parseIncomingCommands(gen());
      expect(client.onready.callCount).to.equal(1);
      expect(client._handleResponse.withArgs({
        tag: 'OK',
        command: 'Hello',
        attributes: [{
          type: 'ATOM',
          value: 'world!'
        }]
      }).calledOnce).to.be.true;
    });
    it('should process an untagged item from the queue', () => {
      sinon.stub(client, '_handleResponse');
      function* gen() {
        yield (0, _common.toTypedArray)('* 1 EXISTS');
      }
      client._parseIncomingCommands(gen());
      expect(client._handleResponse.withArgs({
        tag: '*',
        command: 'EXISTS',
        attributes: [],
        nr: 1
      }).calledOnce).to.be.true;
    });
    it('should process a plus tagged item from the queue', () => {
      sinon.stub(client, 'send');
      function* gen() {
        yield (0, _common.toTypedArray)('+ Please continue');
      }
      client._currentCommand = {
        data: ['literal data']
      };
      client._parseIncomingCommands(gen());
      expect(client.send.withArgs('literal data\r\n').callCount).to.equal(1);
    });
    it('should process an XOAUTH2 error challenge', () => {
      sinon.stub(client, 'send');
      function* gen() {
        yield (0, _common.toTypedArray)('+ FOOBAR');
      }
      client._currentCommand = {
        data: [],
        errorResponseExpectsEmptyLine: true
      };
      client._parseIncomingCommands(gen());
      expect(client.send.withArgs('\r\n').callCount).to.equal(1);
    });
  });
  describe('#_handleResponse', () => {
    it('should invoke global handler by default', () => {
      sinon.stub(client, '_processResponse');
      sinon.stub(client, '_sendRequest');
      client._globalAcceptUntagged.TEST = () => {};
      sinon.stub(client._globalAcceptUntagged, 'TEST');
      client._currentCommand = false;
      client._handleResponse({
        tag: '*',
        command: 'test'
      });
      expect(client._sendRequest.callCount).to.equal(1);
      expect(client._globalAcceptUntagged.TEST.withArgs({
        tag: '*',
        command: 'test'
      }).callCount).to.equal(1);
    });
    it('should invoke global handler if needed', () => {
      sinon.stub(client, '_processResponse');
      client._globalAcceptUntagged.TEST = () => {};
      sinon.stub(client._globalAcceptUntagged, 'TEST');
      sinon.stub(client, '_sendRequest');
      client._currentCommand = {
        payload: {}
      };
      client._handleResponse({
        tag: '*',
        command: 'test'
      });
      expect(client._sendRequest.callCount).to.equal(0);
      expect(client._globalAcceptUntagged.TEST.withArgs({
        tag: '*',
        command: 'test'
      }).callCount).to.equal(1);
    });
    it('should push to payload', () => {
      sinon.stub(client, '_processResponse');
      client._globalAcceptUntagged.TEST = () => {};
      sinon.stub(client._globalAcceptUntagged, 'TEST');
      client._currentCommand = {
        payload: {
          TEST: []
        }
      };
      client._handleResponse({
        tag: '*',
        command: 'test'
      });
      expect(client._globalAcceptUntagged.TEST.callCount).to.equal(0);
      expect(client._currentCommand.payload.TEST).to.deep.equal([{
        tag: '*',
        command: 'test'
      }]);
    });
    it('should invoke command callback', () => {
      sinon.stub(client, '_processResponse');
      sinon.stub(client, '_sendRequest');
      client._globalAcceptUntagged.TEST = () => {};
      sinon.stub(client._globalAcceptUntagged, 'TEST');
      client._currentCommand = {
        tag: 'A',
        callback: response => {
          expect(response).to.deep.equal({
            tag: 'A',
            command: 'test',
            payload: {
              TEST: 'abc'
            }
          });
        },
        payload: {
          TEST: 'abc'
        }
      };
      client._handleResponse({
        tag: 'A',
        command: 'test'
      });
      expect(client._sendRequest.callCount).to.equal(1);
      expect(client._globalAcceptUntagged.TEST.callCount).to.equal(0);
    });
  });
  describe('#enqueueCommand', () => {
    it('should reject on NO/BAD', () => {
      sinon.stub(client, '_sendRequest').callsFake(() => {
        client._clientQueue[0].callback({
          command: 'NO'
        });
      });
      client._tagCounter = 100;
      client._clientQueue = [];
      client._canSend = true;
      return client.enqueueCommand({
        command: 'abc'
      }, ['def'], {
        t: 1
      }).catch(err => {
        expect(err).to.exist;
      });
    });
    it('should invoke sending', () => {
      sinon.stub(client, '_sendRequest').callsFake(() => {
        client._clientQueue[0].callback({});
      });
      client._tagCounter = 100;
      client._clientQueue = [];
      client._canSend = true;
      return client.enqueueCommand({
        command: 'abc'
      }, ['def'], {
        t: 1
      }).then(() => {
        expect(client._sendRequest.callCount).to.equal(1);
        expect(client._clientQueue.length).to.equal(1);
        expect(client._clientQueue[0].tag).to.equal('W101');
        expect(client._clientQueue[0].request).to.deep.equal({
          command: 'abc',
          tag: 'W101'
        });
        expect(client._clientQueue[0].t).to.equal(1);
      });
    });
    it('should only queue', () => {
      sinon.stub(client, '_sendRequest');
      client._tagCounter = 100;
      client._clientQueue = [];
      client._canSend = false;
      setTimeout(() => {
        client._clientQueue[0].callback({});
      }, 0);
      return client.enqueueCommand({
        command: 'abc'
      }, ['def'], {
        t: 1
      }).then(() => {
        expect(client._sendRequest.callCount).to.equal(0);
        expect(client._clientQueue.length).to.equal(1);
        expect(client._clientQueue[0].tag).to.equal('W101');
      });
    });
    it('should store valueAsString option in the command', () => {
      sinon.stub(client, '_sendRequest');
      client._tagCounter = 100;
      client._clientQueue = [];
      client._canSend = false;
      setTimeout(() => {
        client._clientQueue[0].callback({});
      }, 0);
      return client.enqueueCommand({
        command: 'abc',
        valueAsString: false
      }, ['def'], {
        t: 1
      }).then(() => {
        expect(client._clientQueue[0].request.valueAsString).to.equal(false);
      });
    });
  });
  describe('#_sendRequest', () => {
    it('should enter idle if nothing is to process', () => {
      sinon.stub(client, '_enterIdle');
      client._clientQueue = [];
      client._sendRequest();
      expect(client._enterIdle.callCount).to.equal(1);
    });
    it('should send data', () => {
      sinon.stub(client, '_clearIdle');
      sinon.stub(client, 'send');
      client._clientQueue = [{
        request: {
          tag: 'W101',
          command: 'TEST'
        }
      }];
      client._sendRequest();
      expect(client._clearIdle.callCount).to.equal(1);
      expect(client.send.args[0][0]).to.equal('W101 TEST\r\n');
    });
    it('should send partial data', () => {
      sinon.stub(client, '_clearIdle');
      sinon.stub(client, 'send');
      client._clientQueue = [{
        request: {
          tag: 'W101',
          command: 'TEST',
          attributes: [{
            type: 'LITERAL',
            value: 'abc'
          }]
        }
      }];
      client._sendRequest();
      expect(client._clearIdle.callCount).to.equal(1);
      expect(client.send.args[0][0]).to.equal('W101 TEST {3}\r\n');
      expect(client._currentCommand.data).to.deep.equal(['abc']);
    });
    it('should run precheck', done => {
      sinon.stub(client, '_clearIdle');
      client._canSend = true;
      client._clientQueue = [{
        request: {
          tag: 'W101',
          command: 'TEST',
          attributes: [{
            type: 'LITERAL',
            value: 'abc'
          }]
        },
        precheck: ctx => {
          expect(ctx).to.exist;
          expect(client._canSend).to.be.true;
          client._sendRequest = () => {
            expect(client._clientQueue.length).to.equal(2);
            expect(client._clientQueue[0].tag).to.include('.p');
            expect(client._clientQueue[0].request.tag).to.include('.p');
            client._clearIdle.restore();
            done();
          };
          client.enqueueCommand({}, undefined, {
            ctx: ctx
          });
          return Promise.resolve();
        }
      }];
      client._sendRequest();
    });
  });
  describe('#_enterIdle', () => {
    it('should set idle timer', done => {
      client.onidle = () => {
        done();
      };
      client.timeoutEnterIdle = 1;
      client._enterIdle();
    });
  });
  describe('#_processResponse', () => {
    it('should set humanReadable', () => {
      var response = {
        tag: '*',
        command: 'OK',
        attributes: [{
          type: 'TEXT',
          value: 'Some random text'
        }]
      };
      client._processResponse(response);
      expect(response.humanReadable).to.equal('Some random text');
    });
    it('should set response code', () => {
      var response = {
        tag: '*',
        command: 'OK',
        attributes: [{
          type: 'ATOM',
          section: [{
            type: 'ATOM',
            value: 'CAPABILITY'
          }, {
            type: 'ATOM',
            value: 'IMAP4REV1'
          }, {
            type: 'ATOM',
            value: 'UIDPLUS'
          }]
        }, {
          type: 'TEXT',
          value: 'Some random text'
        }]
      };
      client._processResponse(response);
      expect(response.code).to.equal('CAPABILITY');
      expect(response.capability).to.deep.equal(['IMAP4REV1', 'UIDPLUS']);
    });
  });
  describe('#isError', () => {
    it('should detect if an object is an error', () => {
      expect(client.isError(new RangeError('abc'))).to.be.true;
      expect(client.isError('abc')).to.be.false;
    });
  });
  describe('#enableCompression', () => {
    it('should create inflater and deflater streams', () => {
      client.socket.ondata = () => {};
      sinon.stub(client.socket, 'ondata');
      expect(client.compressed).to.be.false;
      client.enableCompression();
      expect(client.compressed).to.be.true;
      const payload = 'asdasd';
      const expected = payload.split('').map(char => char.charCodeAt(0));
      client.send(payload);
      const actualOut = socketStub.send.args[0][0];
      client.socket.ondata({
        data: actualOut
      });
      expect(Buffer.from(client._socketOnData.args[0][0].data)).to.deep.equal(Buffer.from(expected));
    });
  });
  describe('#getPreviouslyQueued', () => {
    const ctx = {};
    it('should return undefined with empty queue and no current command', () => {
      client._currentCommand = undefined;
      client._clientQueue = [];
      expect(testAndGetAttribute()).to.be.undefined;
    });
    it('should return undefined with empty queue and non-SELECT current command', () => {
      client._currentCommand = createCommand('TEST');
      client._clientQueue = [];
      expect(testAndGetAttribute()).to.be.undefined;
    });
    it('should return current command with empty queue and SELECT current command', () => {
      client._currentCommand = createCommand('SELECT', 'ATTR');
      client._clientQueue = [];
      expect(testAndGetAttribute()).to.equal('ATTR');
    });
    it('should return current command with non-SELECT commands in queue and SELECT current command', () => {
      client._currentCommand = createCommand('SELECT', 'ATTR');
      client._clientQueue = [createCommand('TEST01'), createCommand('TEST02')];
      expect(testAndGetAttribute()).to.equal('ATTR');
    });
    it('should return last SELECT before ctx with multiple SELECT commands in queue (1)', () => {
      client._currentCommand = createCommand('SELECT', 'ATTR01');
      client._clientQueue = [createCommand('SELECT', 'ATTR'), createCommand('TEST'), ctx, createCommand('SELECT', 'ATTR03')];
      expect(testAndGetAttribute()).to.equal('ATTR');
    });
    it('should return last SELECT before ctx with multiple SELECT commands in queue (2)', () => {
      client._clientQueue = [createCommand('SELECT', 'ATTR02'), createCommand('SELECT', 'ATTR'), ctx, createCommand('SELECT', 'ATTR03')];
      expect(testAndGetAttribute()).to.equal('ATTR');
    });
    it('should return last SELECT before ctx with multiple SELECT commands in queue (3)', () => {
      client._clientQueue = [createCommand('SELECT', 'ATTR02'), createCommand('SELECT', 'ATTR'), createCommand('TEST'), ctx, createCommand('SELECT', 'ATTR03')];
      expect(testAndGetAttribute()).to.equal('ATTR');
    });
    function testAndGetAttribute() {
      const data = client.getPreviouslyQueued(['SELECT'], ctx);
      if (data) {
        return data.request.attributes[0].value;
      }
    }
    function createCommand(command, attribute) {
      const attributes = [];
      const data = {
        request: {
          command,
          attributes
        }
      };
      if (attribute) {
        data.request.attributes.push({
          type: 'STRING',
          value: attribute
        });
      }
      return data;
    }
  });
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfaW1hcCIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJyZXF1aXJlIiwiX2NvbW1vbiIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImhvc3QiLCJwb3J0IiwiZGVzY3JpYmUiLCJjbGllbnQiLCJzb2NrZXRTdHViIiwiYmVmb3JlRWFjaCIsIkltYXBDbGllbnQiLCJleHBlY3QiLCJ0byIsImV4aXN0IiwibG9nZ2VyIiwiZGVidWciLCJlcnJvciIsIlNvY2tldCIsIm9wZW4iLCJwcm90b3R5cGUiLCJjbG9zZSIsInNlbmQiLCJzdXNwZW5kIiwicmVzdW1lIiwidXBncmFkZVRvU2VjdXJlIiwic2lub24iLCJjcmVhdGVTdHViSW5zdGFuY2UiLCJzdHViIiwid2l0aEFyZ3MiLCJyZXR1cm5zIiwicHJvbWlzZSIsImNvbm5lY3QiLCJ0aGVuIiwiY2FsbENvdW50IiwiZXF1YWwiLCJvbmVycm9yIiwib25vcGVuIiwib25jbG9zZSIsIm9uZGF0YSIsInNldFRpbWVvdXQiLCJza2lwIiwiaXQiLCJzb2NrZXQiLCJyZWFkeVN0YXRlIiwiY2FsbGVkIiwiYmUiLCJmYWxzZSIsInNlY3VyZU1vZGUiLCJ1cGdyYWRlIiwiaGFuZGxlciIsInNldEhhbmRsZXIiLCJfZ2xvYmFsQWNjZXB0VW50YWdnZWQiLCJGRVRDSCIsImRvbmUiLCJkYXRhIiwiRXJyb3IiLCJfb25EYXRhIiwidG9UeXBlZEFycmF5IiwiYnVmZmVyIiwiX3BhcnNlSW5jb21pbmdDb21tYW5kcyIsImNhbGxlZE9uY2UiLCJ0cnVlIiwiX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlciIsImFwcGVuZEluY29taW5nQnVmZmVyIiwiaXRlcmF0b3IiLCJTdHJpbmciLCJmcm9tQ2hhckNvZGUiLCJhcHBseSIsIm5leHQiLCJ2YWx1ZSIsInVuZGVmaW5lZCIsIml0ZXJhdG9yMSIsIml0ZXJhdG9yMiIsIml0ZXJhdG9yMyIsImNvbnRlbnQiLCJfaW5jb21pbmdCdWZmZXJzIiwicHVzaCIsIm9ucmVhZHkiLCJnZW4iLCJfaGFuZGxlUmVzcG9uc2UiLCJ0YWciLCJjb21tYW5kIiwiYXR0cmlidXRlcyIsInR5cGUiLCJuciIsIl9jdXJyZW50Q29tbWFuZCIsImVycm9yUmVzcG9uc2VFeHBlY3RzRW1wdHlMaW5lIiwiVEVTVCIsIl9zZW5kUmVxdWVzdCIsInBheWxvYWQiLCJkZWVwIiwiY2FsbGJhY2siLCJyZXNwb25zZSIsImNhbGxzRmFrZSIsIl9jbGllbnRRdWV1ZSIsIl90YWdDb3VudGVyIiwiX2NhblNlbmQiLCJlbnF1ZXVlQ29tbWFuZCIsInQiLCJjYXRjaCIsImVyciIsImxlbmd0aCIsInJlcXVlc3QiLCJ2YWx1ZUFzU3RyaW5nIiwiX2VudGVySWRsZSIsIl9jbGVhcklkbGUiLCJhcmdzIiwicHJlY2hlY2siLCJjdHgiLCJpbmNsdWRlIiwicmVzdG9yZSIsIlByb21pc2UiLCJyZXNvbHZlIiwib25pZGxlIiwidGltZW91dEVudGVySWRsZSIsIl9wcm9jZXNzUmVzcG9uc2UiLCJodW1hblJlYWRhYmxlIiwic2VjdGlvbiIsImNvZGUiLCJjYXBhYmlsaXR5IiwiaXNFcnJvciIsIlJhbmdlRXJyb3IiLCJjb21wcmVzc2VkIiwiZW5hYmxlQ29tcHJlc3Npb24iLCJleHBlY3RlZCIsInNwbGl0IiwibWFwIiwiY2hhciIsImNoYXJDb2RlQXQiLCJhY3R1YWxPdXQiLCJCdWZmZXIiLCJmcm9tIiwiX3NvY2tldE9uRGF0YSIsInRlc3RBbmRHZXRBdHRyaWJ1dGUiLCJjcmVhdGVDb21tYW5kIiwiZ2V0UHJldmlvdXNseVF1ZXVlZCIsImF0dHJpYnV0ZSJdLCJzb3VyY2VzIjpbIi4uL3NyYy9pbWFwLXVuaXQuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50LWRpc2FibGUgbm8tdW51c2VkLWV4cHJlc3Npb25zICovXG5cbmltcG9ydCBJbWFwQ2xpZW50IGZyb20gJy4vaW1hcCdcbmltcG9ydCB7IHRvVHlwZWRBcnJheSB9IGZyb20gJy4vY29tbW9uJ1xuXG5jb25zdCBob3N0ID0gJ2xvY2FsaG9zdCdcbmNvbnN0IHBvcnQgPSAxMDAwMFxuXG5kZXNjcmliZSgnYnJvd3NlcmJveCBpbWFwIHVuaXQgdGVzdHMnLCAoKSA9PiB7XG4gIHZhciBjbGllbnQsIHNvY2tldFN0dWJcblxuICAvKiBqc2hpbnQgaW5kZW50OmZhbHNlICovXG5cbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgY2xpZW50ID0gbmV3IEltYXBDbGllbnQoaG9zdCwgcG9ydClcbiAgICBleHBlY3QoY2xpZW50KS50by5leGlzdFxuXG4gICAgY2xpZW50LmxvZ2dlciA9IHtcbiAgICAgIGRlYnVnOiAoKSA9PiB7IH0sXG4gICAgICBlcnJvcjogKCkgPT4geyB9XG4gICAgfVxuXG4gICAgdmFyIFNvY2tldCA9IGZ1bmN0aW9uICgpIHsgfVxuICAgIFNvY2tldC5vcGVuID0gKCkgPT4geyB9XG4gICAgU29ja2V0LnByb3RvdHlwZS5jbG9zZSA9ICgpID0+IHsgfVxuICAgIFNvY2tldC5wcm90b3R5cGUuc2VuZCA9ICgpID0+IHsgfVxuICAgIFNvY2tldC5wcm90b3R5cGUuc3VzcGVuZCA9ICgpID0+IHsgfVxuICAgIFNvY2tldC5wcm90b3R5cGUucmVzdW1lID0gKCkgPT4geyB9XG4gICAgU29ja2V0LnByb3RvdHlwZS51cGdyYWRlVG9TZWN1cmUgPSAoKSA9PiB7IH1cblxuICAgIHNvY2tldFN0dWIgPSBzaW5vbi5jcmVhdGVTdHViSW5zdGFuY2UoU29ja2V0KVxuICAgIHNpbm9uLnN0dWIoU29ja2V0LCAnb3BlbicpLndpdGhBcmdzKGhvc3QsIHBvcnQpLnJldHVybnMoc29ja2V0U3R1YilcblxuICAgIHZhciBwcm9taXNlID0gY2xpZW50LmNvbm5lY3QoU29ja2V0KS50aGVuKCgpID0+IHtcbiAgICAgIGV4cGVjdChTb2NrZXQub3Blbi5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG5cbiAgICAgIGV4cGVjdChzb2NrZXRTdHViLm9uZXJyb3IpLnRvLmV4aXN0XG4gICAgICBleHBlY3Qoc29ja2V0U3R1Yi5vbm9wZW4pLnRvLmV4aXN0XG4gICAgICBleHBlY3Qoc29ja2V0U3R1Yi5vbmNsb3NlKS50by5leGlzdFxuICAgICAgZXhwZWN0KHNvY2tldFN0dWIub25kYXRhKS50by5leGlzdFxuICAgIH0pXG5cbiAgICBzZXRUaW1lb3V0KCgpID0+IHNvY2tldFN0dWIub25vcGVuKCksIDEwKVxuXG4gICAgcmV0dXJuIHByb21pc2VcbiAgfSlcblxuICBkZXNjcmliZS5za2lwKCcjY2xvc2UnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBjYWxsIHNvY2tldC5jbG9zZScsICgpID0+IHtcbiAgICAgIGNsaWVudC5zb2NrZXQucmVhZHlTdGF0ZSA9ICdvcGVuJ1xuXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHNvY2tldFN0dWIub25jbG9zZSgpLCAxMClcbiAgICAgIHJldHVybiBjbGllbnQuY2xvc2UoKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KHNvY2tldFN0dWIuY2xvc2UuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBub3QgY2FsbCBzb2NrZXQuY2xvc2UnLCAoKSA9PiB7XG4gICAgICBjbGllbnQuc29ja2V0LnJlYWR5U3RhdGUgPSAnbm90IG9wZW4uIGR1aC4nXG5cbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gc29ja2V0U3R1Yi5vbmNsb3NlKCksIDEwKVxuICAgICAgcmV0dXJuIGNsaWVudC5jbG9zZSgpLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3Qoc29ja2V0U3R1Yi5jbG9zZS5jYWxsZWQpLnRvLmJlLmZhbHNlXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyN1cGdyYWRlJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgdXBncmFkZSBzb2NrZXQnLCAoKSA9PiB7XG4gICAgICBjbGllbnQuc2VjdXJlTW9kZSA9IGZhbHNlXG4gICAgICBjbGllbnQudXBncmFkZSgpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgbm90IHVwZ3JhZGUgc29ja2V0JywgKCkgPT4ge1xuICAgICAgY2xpZW50LnNlY3VyZU1vZGUgPSB0cnVlXG4gICAgICBjbGllbnQudXBncmFkZSgpXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI3NldEhhbmRsZXInLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBzZXQgZ2xvYmFsIGhhbmRsZXIgZm9yIGtleXdvcmQnLCAoKSA9PiB7XG4gICAgICB2YXIgaGFuZGxlciA9ICgpID0+IHsgfVxuICAgICAgY2xpZW50LnNldEhhbmRsZXIoJ2ZldGNoJywgaGFuZGxlcilcblxuICAgICAgZXhwZWN0KGNsaWVudC5fZ2xvYmFsQWNjZXB0VW50YWdnZWQuRkVUQ0gpLnRvLmVxdWFsKGhhbmRsZXIpXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI3NvY2tldC5vbmVycm9yJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZW1pdCBlcnJvciBhbmQgY2xvc2UgY29ubmVjdGlvbicsIChkb25lKSA9PiB7XG4gICAgICBjbGllbnQuc29ja2V0Lm9uZXJyb3Ioe1xuICAgICAgICBkYXRhOiBuZXcgRXJyb3IoJ2VycicpXG4gICAgICB9KVxuXG4gICAgICBjbGllbnQub25lcnJvciA9ICgpID0+IHtcbiAgICAgICAgZG9uZSgpXG4gICAgICB9XG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI3NvY2tldC5vbmNsb3NlJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZW1pdCBlcnJvciAnLCAoZG9uZSkgPT4ge1xuICAgICAgY2xpZW50LnNvY2tldC5vbmNsb3NlKClcblxuICAgICAgY2xpZW50Lm9uZXJyb3IgPSAoKSA9PiB7XG4gICAgICAgIGRvbmUoKVxuICAgICAgfVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNfb25EYXRhJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcHJvY2VzcyBpbnB1dCcsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50LCAnX3BhcnNlSW5jb21pbmdDb21tYW5kcycpXG4gICAgICBzaW5vbi5zdHViKGNsaWVudCwgJ19pdGVyYXRlSW5jb21pbmdCdWZmZXInKVxuXG4gICAgICBjbGllbnQuX29uRGF0YSh7XG4gICAgICAgIGRhdGE6IHRvVHlwZWRBcnJheSgnZm9vYmFyJykuYnVmZmVyXG4gICAgICB9KVxuXG4gICAgICBleHBlY3QoY2xpZW50Ll9wYXJzZUluY29taW5nQ29tbWFuZHMuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgICAgZXhwZWN0KGNsaWVudC5faXRlcmF0ZUluY29taW5nQnVmZmVyLmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCdyYXRlSW5jb21pbmdCdWZmZXInLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBpdGVyYXRlIGNodW5rZWQgaW5wdXQnLCAoKSA9PiB7XG4gICAgICBhcHBlbmRJbmNvbWluZ0J1ZmZlcignKiAxIEZFVENIIChVSUQgMSlcXHJcXG4qIDIgRkVUQ0ggKFVJRCAyKVxcclxcbiogMyBGRVRDSCAoVUlEIDMpXFxyXFxuJylcbiAgICAgIHZhciBpdGVyYXRvciA9IGNsaWVudC5faXRlcmF0ZUluY29taW5nQnVmZmVyKClcblxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IubmV4dCgpLnZhbHVlKSkudG8uZXF1YWwoJyogMSBGRVRDSCAoVUlEIDEpJylcbiAgICAgIGV4cGVjdChTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGl0ZXJhdG9yLm5leHQoKS52YWx1ZSkpLnRvLmVxdWFsKCcqIDIgRkVUQ0ggKFVJRCAyKScpXG4gICAgICBleHBlY3QoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBpdGVyYXRvci5uZXh0KCkudmFsdWUpKS50by5lcXVhbCgnKiAzIEZFVENIIChVSUQgMyknKVxuICAgICAgZXhwZWN0KGl0ZXJhdG9yLm5leHQoKS52YWx1ZSkudG8uYmUudW5kZWZpbmVkXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcHJvY2VzcyBjaHVua2VkIGxpdGVyYWxzJywgKCkgPT4ge1xuICAgICAgYXBwZW5kSW5jb21pbmdCdWZmZXIoJyogMSBGRVRDSCAoVUlEIHsxfVxcclxcbjEpXFxyXFxuKiAyIEZFVENIIChVSUQgezR9XFxyXFxuMjM0NSlcXHJcXG4qIDMgRkVUQ0ggKFVJRCB7NH1cXHJcXG4zNzg5KVxcclxcbicpXG4gICAgICB2YXIgaXRlcmF0b3IgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG5cbiAgICAgIGV4cGVjdChTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGl0ZXJhdG9yLm5leHQoKS52YWx1ZSkpLnRvLmVxdWFsKCcqIDEgRkVUQ0ggKFVJRCB7MX1cXHJcXG4xKScpXG4gICAgICBleHBlY3QoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBpdGVyYXRvci5uZXh0KCkudmFsdWUpKS50by5lcXVhbCgnKiAyIEZFVENIIChVSUQgezR9XFxyXFxuMjM0NSknKVxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IubmV4dCgpLnZhbHVlKSkudG8uZXF1YWwoJyogMyBGRVRDSCAoVUlEIHs0fVxcclxcbjM3ODkpJylcbiAgICAgIGV4cGVjdChpdGVyYXRvci5uZXh0KCkudmFsdWUpLnRvLmJlLnVuZGVmaW5lZFxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHByb2Nlc3MgY2h1bmtlZCBsaXRlcmFscyAyJywgKCkgPT4ge1xuICAgICAgYXBwZW5kSW5jb21pbmdCdWZmZXIoJyogMSBGRVRDSCAoVUlEIDEpXFxyXFxuKiAyIEZFVENIIChVSUQgezR9XFxyXFxuMjM0NSlcXHJcXG4nKVxuICAgICAgdmFyIGl0ZXJhdG9yID0gY2xpZW50Ll9pdGVyYXRlSW5jb21pbmdCdWZmZXIoKVxuXG4gICAgICBleHBlY3QoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBpdGVyYXRvci5uZXh0KCkudmFsdWUpKS50by5lcXVhbCgnKiAxIEZFVENIIChVSUQgMSknKVxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IubmV4dCgpLnZhbHVlKSkudG8uZXF1YWwoJyogMiBGRVRDSCAoVUlEIHs0fVxcclxcbjIzNDUpJylcbiAgICAgIGV4cGVjdChpdGVyYXRvci5uZXh0KCkudmFsdWUpLnRvLmJlLnVuZGVmaW5lZFxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHByb2Nlc3MgY2h1bmtlZCBsaXRlcmFscyAzJywgKCkgPT4ge1xuICAgICAgYXBwZW5kSW5jb21pbmdCdWZmZXIoJyogMSBGRVRDSCAoVUlEIHsxfVxcclxcbjEpXFxyXFxuKiAyIEZFVENIIChVSUQgNClcXHJcXG4nKVxuICAgICAgdmFyIGl0ZXJhdG9yID0gY2xpZW50Ll9pdGVyYXRlSW5jb21pbmdCdWZmZXIoKVxuXG4gICAgICBleHBlY3QoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBpdGVyYXRvci5uZXh0KCkudmFsdWUpKS50by5lcXVhbCgnKiAxIEZFVENIIChVSUQgezF9XFxyXFxuMSknKVxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IubmV4dCgpLnZhbHVlKSkudG8uZXF1YWwoJyogMiBGRVRDSCAoVUlEIDQpJylcbiAgICAgIGV4cGVjdChpdGVyYXRvci5uZXh0KCkudmFsdWUpLnRvLmJlLnVuZGVmaW5lZFxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHByb2Nlc3MgY2h1bmtlZCBsaXRlcmFscyA0JywgKCkgPT4ge1xuICAgICAgYXBwZW5kSW5jb21pbmdCdWZmZXIoJyogU0VBUkNIIHsxfVxcclxcbjEgezF9XFxyXFxuMlxcclxcbicpXG4gICAgICB2YXIgaXRlcmF0b3IgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG4gICAgICBleHBlY3QoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBpdGVyYXRvci5uZXh0KCkudmFsdWUpKS50by5lcXVhbCgnKiBTRUFSQ0ggezF9XFxyXFxuMSB7MX1cXHJcXG4yJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBwcm9jZXNzIENSTEYgbGl0ZXJhbCcsICgpID0+IHtcbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcqIDEgRkVUQ0ggKFVJRCAyMCBCT0RZW0hFQURFUi5GSUVMRFMgKFJFRkVSRU5DRVMgTElTVC1JRCldIHsyfVxcclxcblxcclxcbilcXHJcXG4nKVxuICAgICAgdmFyIGl0ZXJhdG9yID0gY2xpZW50Ll9pdGVyYXRlSW5jb21pbmdCdWZmZXIoKVxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IubmV4dCgpLnZhbHVlKSkudG8uZXF1YWwoJyogMSBGRVRDSCAoVUlEIDIwIEJPRFlbSEVBREVSLkZJRUxEUyAoUkVGRVJFTkNFUyBMSVNULUlEKV0gezJ9XFxyXFxuXFxyXFxuKScpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcHJvY2VzcyBDUkxGIGxpdGVyYWwgMicsICgpID0+IHtcbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcqIDEgRkVUQ0ggKFVJRCAxIEVOVkVMT1BFIChcInN0cmluZyB3aXRoIHtwYXJlbnRoZXNpc31cIikgQk9EWVtIRUFERVIuRklFTERTIChSRUZFUkVOQ0VTIExJU1QtSUQpXSB7Mn1cXHJcXG5cXHJcXG4pXFxyXFxuJylcbiAgICAgIHZhciBpdGVyYXRvciA9IGNsaWVudC5faXRlcmF0ZUluY29taW5nQnVmZmVyKClcbiAgICAgIGV4cGVjdChTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGl0ZXJhdG9yLm5leHQoKS52YWx1ZSkpLnRvLmVxdWFsKCcqIDEgRkVUQ0ggKFVJRCAxIEVOVkVMT1BFIChcInN0cmluZyB3aXRoIHtwYXJlbnRoZXNpc31cIikgQk9EWVtIRUFERVIuRklFTERTIChSRUZFUkVOQ0VTIExJU1QtSUQpXSB7Mn1cXHJcXG5cXHJcXG4pJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBwYXJzZSBtdWx0aXBsZSB6ZXJvLWxlbmd0aCBsaXRlcmFscycsICgpID0+IHtcbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcqIDEyNjAxNSBGRVRDSCAoVUlEIDU4NTU5OSBCT0RZWzEuMl0gezB9XFxyXFxuIEJPRFlbMS4xXSB7MH1cXHJcXG4pXFxyXFxuJylcbiAgICAgIHZhciBpdGVyYXRvciA9IGNsaWVudC5faXRlcmF0ZUluY29taW5nQnVmZmVyKClcbiAgICAgIGV4cGVjdChTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGl0ZXJhdG9yLm5leHQoKS52YWx1ZSkpLnRvLmVxdWFsKCcqIDEyNjAxNSBGRVRDSCAoVUlEIDU4NTU5OSBCT0RZWzEuMl0gezB9XFxyXFxuIEJPRFlbMS4xXSB7MH1cXHJcXG4pJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBwcm9jZXNzIHR3byBjb21tYW5kcyB3aGVuIENSTEYgYXJyaXZlcyBpbiAyIHBhcnRzJywgKCkgPT4ge1xuICAgICAgYXBwZW5kSW5jb21pbmdCdWZmZXIoJyogMSBGRVRDSCAoVUlEIDEpXFxyJylcbiAgICAgIHZhciBpdGVyYXRvcjEgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG4gICAgICBleHBlY3QoaXRlcmF0b3IxLm5leHQoKS52YWx1ZSkudG8uYmUudW5kZWZpbmVkXG5cbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCdcXG4qIDIgRkVUQ0ggKFVJRCAyKVxcclxcbicpXG4gICAgICB2YXIgaXRlcmF0b3IyID0gY2xpZW50Ll9pdGVyYXRlSW5jb21pbmdCdWZmZXIoKVxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IyLm5leHQoKS52YWx1ZSkpLnRvLmVxdWFsKCcqIDEgRkVUQ0ggKFVJRCAxKScpXG4gICAgICBleHBlY3QoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBpdGVyYXRvcjIubmV4dCgpLnZhbHVlKSkudG8uZXF1YWwoJyogMiBGRVRDSCAoVUlEIDIpJylcbiAgICAgIGV4cGVjdChpdGVyYXRvcjIubmV4dCgpLnZhbHVlKS50by5iZS51bmRlZmluZWRcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBwcm9jZXNzIGxpdGVyYWwgd2hlbiBsaXRlcmFsIGNvdW50IGFycml2ZXMgaW4gMiBwYXJ0cycsICgpID0+IHtcbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcqIDEgRkVUQ0ggKFVJRCB7JylcbiAgICAgIHZhciBpdGVyYXRvcjEgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG4gICAgICBleHBlY3QoaXRlcmF0b3IxLm5leHQoKS52YWx1ZSkudG8uYmUudW5kZWZpbmVkXG5cbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcyfVxcclxcbjEyKVxcclxcbicpXG4gICAgICB2YXIgaXRlcmF0b3IyID0gY2xpZW50Ll9pdGVyYXRlSW5jb21pbmdCdWZmZXIoKVxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IyLm5leHQoKS52YWx1ZSkpLnRvLmVxdWFsKCcqIDEgRkVUQ0ggKFVJRCB7Mn1cXHJcXG4xMiknKVxuICAgICAgZXhwZWN0KGl0ZXJhdG9yMi5uZXh0KCkudmFsdWUpLnRvLmJlLnVuZGVmaW5lZFxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHByb2Nlc3MgbGl0ZXJhbCB3aGVuIGxpdGVyYWwgY291bnQgYXJyaXZlcyBpbiAyIHBhcnRzIDInLCAoKSA9PiB7XG4gICAgICBhcHBlbmRJbmNvbWluZ0J1ZmZlcignKiAxIEZFVENIIChVSUQgezEnKVxuICAgICAgdmFyIGl0ZXJhdG9yMSA9IGNsaWVudC5faXRlcmF0ZUluY29taW5nQnVmZmVyKClcbiAgICAgIGV4cGVjdChpdGVyYXRvcjEubmV4dCgpLnZhbHVlKS50by5iZS51bmRlZmluZWRcblxuICAgICAgYXBwZW5kSW5jb21pbmdCdWZmZXIoJzB9XFxyXFxuMDEyMzQ1Njc4OSlcXHJcXG4nKVxuICAgICAgdmFyIGl0ZXJhdG9yMiA9IGNsaWVudC5faXRlcmF0ZUluY29taW5nQnVmZmVyKClcbiAgICAgIGV4cGVjdChTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGl0ZXJhdG9yMi5uZXh0KCkudmFsdWUpKS50by5lcXVhbCgnKiAxIEZFVENIIChVSUQgezEwfVxcclxcbjAxMjM0NTY3ODkpJylcbiAgICAgIGV4cGVjdChpdGVyYXRvcjIubmV4dCgpLnZhbHVlKS50by5iZS51bmRlZmluZWRcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBwcm9jZXNzIGxpdGVyYWwgd2hlbiBsaXRlcmFsIGNvdW50IGFycml2ZXMgaW4gMiBwYXJ0cyAzJywgKCkgPT4ge1xuICAgICAgYXBwZW5kSW5jb21pbmdCdWZmZXIoJyogMSBGRVRDSCAoVUlEIHsnKVxuICAgICAgdmFyIGl0ZXJhdG9yMSA9IGNsaWVudC5faXRlcmF0ZUluY29taW5nQnVmZmVyKClcbiAgICAgIGV4cGVjdChpdGVyYXRvcjEubmV4dCgpLnZhbHVlKS50by5iZS51bmRlZmluZWRcblxuICAgICAgYXBwZW5kSW5jb21pbmdCdWZmZXIoJzEwfVxcclxcbjEyMzQ1Njc4OTApXFxyXFxuJylcbiAgICAgIHZhciBpdGVyYXRvcjIgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG4gICAgICBleHBlY3QoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBpdGVyYXRvcjIubmV4dCgpLnZhbHVlKSkudG8uZXF1YWwoJyogMSBGRVRDSCAoVUlEIHsxMH1cXHJcXG4xMjM0NTY3ODkwKScpXG4gICAgICBleHBlY3QoaXRlcmF0b3IyLm5leHQoKS52YWx1ZSkudG8uYmUudW5kZWZpbmVkXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcHJvY2VzcyBsaXRlcmFsIHdoZW4gbGl0ZXJhbCBjb3VudCBhcnJpdmVzIGluIDIgcGFydHMgNCcsICgpID0+IHtcbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcqIDEgRkVUQ0ggKFVJRCAxIEJPRFlbSEVBREVSLkZJRUxEUyAoUkVGRVJFTkNFUyBMSVNULUlEKV0gezJ9XFxyJylcbiAgICAgIHZhciBpdGVyYXRvcjEgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG4gICAgICBleHBlY3QoaXRlcmF0b3IxLm5leHQoKS52YWx1ZSkudG8uYmUudW5kZWZpbmVkXG4gICAgICBhcHBlbmRJbmNvbWluZ0J1ZmZlcignXFxuWFgpXFxyXFxuJylcbiAgICAgIHZhciBpdGVyYXRvcjIgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG4gICAgICBleHBlY3QoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBpdGVyYXRvcjIubmV4dCgpLnZhbHVlKSkudG8uZXF1YWwoJyogMSBGRVRDSCAoVUlEIDEgQk9EWVtIRUFERVIuRklFTERTIChSRUZFUkVOQ0VTIExJU1QtSUQpXSB7Mn1cXHJcXG5YWCknKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHByb2Nlc3MgbGl0ZXJhbCB3aGVuIGxpdGVyYWwgY291bnQgYXJyaXZlcyBpbiAzIHBhcnRzJywgKCkgPT4ge1xuICAgICAgYXBwZW5kSW5jb21pbmdCdWZmZXIoJyogMSBGRVRDSCAoVUlEIHsnKVxuICAgICAgdmFyIGl0ZXJhdG9yMSA9IGNsaWVudC5faXRlcmF0ZUluY29taW5nQnVmZmVyKClcbiAgICAgIGV4cGVjdChpdGVyYXRvcjEubmV4dCgpLnZhbHVlKS50by5iZS51bmRlZmluZWRcblxuICAgICAgYXBwZW5kSW5jb21pbmdCdWZmZXIoJzEnKVxuICAgICAgdmFyIGl0ZXJhdG9yMiA9IGNsaWVudC5faXRlcmF0ZUluY29taW5nQnVmZmVyKClcbiAgICAgIGV4cGVjdChpdGVyYXRvcjIubmV4dCgpLnZhbHVlKS50by5iZS51bmRlZmluZWRcblxuICAgICAgYXBwZW5kSW5jb21pbmdCdWZmZXIoJ31cXHJcXG4xKVxcclxcbicpXG4gICAgICB2YXIgaXRlcmF0b3IzID0gY2xpZW50Ll9pdGVyYXRlSW5jb21pbmdCdWZmZXIoKVxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IzLm5leHQoKS52YWx1ZSkpLnRvLmVxdWFsKCcqIDEgRkVUQ0ggKFVJRCB7MX1cXHJcXG4xKScpXG4gICAgICBleHBlY3QoaXRlcmF0b3IzLm5leHQoKS52YWx1ZSkudG8uYmUudW5kZWZpbmVkXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcHJvY2VzcyBTRUFSQ0ggcmVzcG9uc2Ugd2hlbiBpdCBhcnJpdmVzIGluIDIgcGFydHMnLCAoKSA9PiB7XG4gICAgICBhcHBlbmRJbmNvbWluZ0J1ZmZlcignKiBTRUFSQ0ggMSAyJylcbiAgICAgIHZhciBpdGVyYXRvcjEgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG4gICAgICBleHBlY3QoaXRlcmF0b3IxLm5leHQoKS52YWx1ZSkudG8uYmUudW5kZWZpbmVkXG5cbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcgMyA0XFxyXFxuJylcbiAgICAgIHZhciBpdGVyYXRvcjIgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG4gICAgICBleHBlY3QoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBpdGVyYXRvcjIubmV4dCgpLnZhbHVlKSkudG8uZXF1YWwoJyogU0VBUkNIIDEgMiAzIDQnKVxuICAgICAgZXhwZWN0KGl0ZXJhdG9yMi5uZXh0KCkudmFsdWUpLnRvLmJlLnVuZGVmaW5lZFxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIG5vdCBwcm9jZXNzIHt9IGluIHN0cmluZyBhcyBsaXRlcmFsIDEnLCAoKSA9PiB7XG4gICAgICBhcHBlbmRJbmNvbWluZ0J1ZmZlcignKiAxIEZFVENIIChVSUQgMSBFTlZFTE9QRSAoXCJzdHJpbmcgd2l0aCB7cGFyZW50aGVzaXN9XCIpKVxcclxcbicpXG4gICAgICB2YXIgaXRlcmF0b3IgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG4gICAgICBleHBlY3QoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBpdGVyYXRvci5uZXh0KCkudmFsdWUpKS50by5lcXVhbCgnKiAxIEZFVENIIChVSUQgMSBFTlZFTE9QRSAoXCJzdHJpbmcgd2l0aCB7cGFyZW50aGVzaXN9XCIpKScpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgbm90IHByb2Nlc3Mge30gaW4gc3RyaW5nIGFzIGxpdGVyYWwgMicsICgpID0+IHtcbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcqIDEgRkVUQ0ggKFVJRCAxIEVOVkVMT1BFIChcInN0cmluZyB3aXRoIG51bWJlciBpbiBwYXJlbnRoZXNpcyB7MTIzfVwiKSlcXHJcXG4nKVxuICAgICAgdmFyIGl0ZXJhdG9yID0gY2xpZW50Ll9pdGVyYXRlSW5jb21pbmdCdWZmZXIoKVxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IubmV4dCgpLnZhbHVlKSkudG8uZXF1YWwoJyogMSBGRVRDSCAoVUlEIDEgRU5WRUxPUEUgKFwic3RyaW5nIHdpdGggbnVtYmVyIGluIHBhcmVudGhlc2lzIHsxMjN9XCIpKScpXG4gICAgfSlcblxuICAgIGZ1bmN0aW9uIGFwcGVuZEluY29taW5nQnVmZmVyIChjb250ZW50KSB7XG4gICAgICBjbGllbnQuX2luY29taW5nQnVmZmVycy5wdXNoKHRvVHlwZWRBcnJheShjb250ZW50KSlcbiAgICB9XG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNfcGFyc2VJbmNvbWluZ0NvbW1hbmRzJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcHJvY2VzcyBhIHRhZ2dlZCBpdGVtIGZyb20gdGhlIHF1ZXVlJywgKCkgPT4ge1xuICAgICAgY2xpZW50Lm9ucmVhZHkgPSBzaW5vbi5zdHViKClcbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50LCAnX2hhbmRsZVJlc3BvbnNlJylcblxuICAgICAgZnVuY3Rpb24gKiBnZW4gKCkgeyB5aWVsZCB0b1R5cGVkQXJyYXkoJ09LIEhlbGxvIHdvcmxkIScpIH1cblxuICAgICAgY2xpZW50Ll9wYXJzZUluY29taW5nQ29tbWFuZHMoZ2VuKCkpXG5cbiAgICAgIGV4cGVjdChjbGllbnQub25yZWFkeS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICBleHBlY3QoY2xpZW50Ll9oYW5kbGVSZXNwb25zZS53aXRoQXJncyh7XG4gICAgICAgIHRhZzogJ09LJyxcbiAgICAgICAgY29tbWFuZDogJ0hlbGxvJyxcbiAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICB0eXBlOiAnQVRPTScsXG4gICAgICAgICAgdmFsdWU6ICd3b3JsZCEnXG4gICAgICAgIH1dXG4gICAgICB9KS5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcHJvY2VzcyBhbiB1bnRhZ2dlZCBpdGVtIGZyb20gdGhlIHF1ZXVlJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihjbGllbnQsICdfaGFuZGxlUmVzcG9uc2UnKVxuXG4gICAgICBmdW5jdGlvbiAqIGdlbiAoKSB7IHlpZWxkIHRvVHlwZWRBcnJheSgnKiAxIEVYSVNUUycpIH1cblxuICAgICAgY2xpZW50Ll9wYXJzZUluY29taW5nQ29tbWFuZHMoZ2VuKCkpXG5cbiAgICAgIGV4cGVjdChjbGllbnQuX2hhbmRsZVJlc3BvbnNlLndpdGhBcmdzKHtcbiAgICAgICAgdGFnOiAnKicsXG4gICAgICAgIGNvbW1hbmQ6ICdFWElTVFMnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbXSxcbiAgICAgICAgbnI6IDFcbiAgICAgIH0pLmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBwcm9jZXNzIGEgcGx1cyB0YWdnZWQgaXRlbSBmcm9tIHRoZSBxdWV1ZScsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50LCAnc2VuZCcpXG5cbiAgICAgIGZ1bmN0aW9uICogZ2VuICgpIHsgeWllbGQgdG9UeXBlZEFycmF5KCcrIFBsZWFzZSBjb250aW51ZScpIH1cbiAgICAgIGNsaWVudC5fY3VycmVudENvbW1hbmQgPSB7XG4gICAgICAgIGRhdGE6IFsnbGl0ZXJhbCBkYXRhJ11cbiAgICAgIH1cblxuICAgICAgY2xpZW50Ll9wYXJzZUluY29taW5nQ29tbWFuZHMoZ2VuKCkpXG5cbiAgICAgIGV4cGVjdChjbGllbnQuc2VuZC53aXRoQXJncygnbGl0ZXJhbCBkYXRhXFxyXFxuJykuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHByb2Nlc3MgYW4gWE9BVVRIMiBlcnJvciBjaGFsbGVuZ2UnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGNsaWVudCwgJ3NlbmQnKVxuXG4gICAgICBmdW5jdGlvbiAqIGdlbiAoKSB7IHlpZWxkIHRvVHlwZWRBcnJheSgnKyBGT09CQVInKSB9XG4gICAgICBjbGllbnQuX2N1cnJlbnRDb21tYW5kID0ge1xuICAgICAgICBkYXRhOiBbXSxcbiAgICAgICAgZXJyb3JSZXNwb25zZUV4cGVjdHNFbXB0eUxpbmU6IHRydWVcbiAgICAgIH1cblxuICAgICAgY2xpZW50Ll9wYXJzZUluY29taW5nQ29tbWFuZHMoZ2VuKCkpXG5cbiAgICAgIGV4cGVjdChjbGllbnQuc2VuZC53aXRoQXJncygnXFxyXFxuJykuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNfaGFuZGxlUmVzcG9uc2UnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBpbnZva2UgZ2xvYmFsIGhhbmRsZXIgYnkgZGVmYXVsdCcsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50LCAnX3Byb2Nlc3NSZXNwb25zZScpXG4gICAgICBzaW5vbi5zdHViKGNsaWVudCwgJ19zZW5kUmVxdWVzdCcpXG5cbiAgICAgIGNsaWVudC5fZ2xvYmFsQWNjZXB0VW50YWdnZWQuVEVTVCA9ICgpID0+IHsgfVxuICAgICAgc2lub24uc3R1YihjbGllbnQuX2dsb2JhbEFjY2VwdFVudGFnZ2VkLCAnVEVTVCcpXG5cbiAgICAgIGNsaWVudC5fY3VycmVudENvbW1hbmQgPSBmYWxzZVxuICAgICAgY2xpZW50Ll9oYW5kbGVSZXNwb25zZSh7XG4gICAgICAgIHRhZzogJyonLFxuICAgICAgICBjb21tYW5kOiAndGVzdCdcbiAgICAgIH0pXG5cbiAgICAgIGV4cGVjdChjbGllbnQuX3NlbmRSZXF1ZXN0LmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIGV4cGVjdChjbGllbnQuX2dsb2JhbEFjY2VwdFVudGFnZ2VkLlRFU1Qud2l0aEFyZ3Moe1xuICAgICAgICB0YWc6ICcqJyxcbiAgICAgICAgY29tbWFuZDogJ3Rlc3QnXG4gICAgICB9KS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgaW52b2tlIGdsb2JhbCBoYW5kbGVyIGlmIG5lZWRlZCcsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50LCAnX3Byb2Nlc3NSZXNwb25zZScpXG4gICAgICBjbGllbnQuX2dsb2JhbEFjY2VwdFVudGFnZ2VkLlRFU1QgPSAoKSA9PiB7IH1cbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50Ll9nbG9iYWxBY2NlcHRVbnRhZ2dlZCwgJ1RFU1QnKVxuICAgICAgc2lub24uc3R1YihjbGllbnQsICdfc2VuZFJlcXVlc3QnKVxuXG4gICAgICBjbGllbnQuX2N1cnJlbnRDb21tYW5kID0ge1xuICAgICAgICBwYXlsb2FkOiB7fVxuICAgICAgfVxuICAgICAgY2xpZW50Ll9oYW5kbGVSZXNwb25zZSh7XG4gICAgICAgIHRhZzogJyonLFxuICAgICAgICBjb21tYW5kOiAndGVzdCdcbiAgICAgIH0pXG5cbiAgICAgIGV4cGVjdChjbGllbnQuX3NlbmRSZXF1ZXN0LmNhbGxDb3VudCkudG8uZXF1YWwoMClcbiAgICAgIGV4cGVjdChjbGllbnQuX2dsb2JhbEFjY2VwdFVudGFnZ2VkLlRFU1Qud2l0aEFyZ3Moe1xuICAgICAgICB0YWc6ICcqJyxcbiAgICAgICAgY29tbWFuZDogJ3Rlc3QnXG4gICAgICB9KS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcHVzaCB0byBwYXlsb2FkJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihjbGllbnQsICdfcHJvY2Vzc1Jlc3BvbnNlJylcbiAgICAgIGNsaWVudC5fZ2xvYmFsQWNjZXB0VW50YWdnZWQuVEVTVCA9ICgpID0+IHsgfVxuICAgICAgc2lub24uc3R1YihjbGllbnQuX2dsb2JhbEFjY2VwdFVudGFnZ2VkLCAnVEVTVCcpXG5cbiAgICAgIGNsaWVudC5fY3VycmVudENvbW1hbmQgPSB7XG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICBURVNUOiBbXVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjbGllbnQuX2hhbmRsZVJlc3BvbnNlKHtcbiAgICAgICAgdGFnOiAnKicsXG4gICAgICAgIGNvbW1hbmQ6ICd0ZXN0J1xuICAgICAgfSlcblxuICAgICAgZXhwZWN0KGNsaWVudC5fZ2xvYmFsQWNjZXB0VW50YWdnZWQuVEVTVC5jYWxsQ291bnQpLnRvLmVxdWFsKDApXG4gICAgICBleHBlY3QoY2xpZW50Ll9jdXJyZW50Q29tbWFuZC5wYXlsb2FkLlRFU1QpLnRvLmRlZXAuZXF1YWwoW3tcbiAgICAgICAgdGFnOiAnKicsXG4gICAgICAgIGNvbW1hbmQ6ICd0ZXN0J1xuICAgICAgfV0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgaW52b2tlIGNvbW1hbmQgY2FsbGJhY2snLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGNsaWVudCwgJ19wcm9jZXNzUmVzcG9uc2UnKVxuICAgICAgc2lub24uc3R1YihjbGllbnQsICdfc2VuZFJlcXVlc3QnKVxuICAgICAgY2xpZW50Ll9nbG9iYWxBY2NlcHRVbnRhZ2dlZC5URVNUID0gKCkgPT4geyB9XG4gICAgICBzaW5vbi5zdHViKGNsaWVudC5fZ2xvYmFsQWNjZXB0VW50YWdnZWQsICdURVNUJylcblxuICAgICAgY2xpZW50Ll9jdXJyZW50Q29tbWFuZCA9IHtcbiAgICAgICAgdGFnOiAnQScsXG4gICAgICAgIGNhbGxiYWNrOiAocmVzcG9uc2UpID0+IHtcbiAgICAgICAgICBleHBlY3QocmVzcG9uc2UpLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICAgICAgdGFnOiAnQScsXG4gICAgICAgICAgICBjb21tYW5kOiAndGVzdCcsXG4gICAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICAgIFRFU1Q6ICdhYmMnXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSlcbiAgICAgICAgfSxcbiAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgIFRFU1Q6ICdhYmMnXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNsaWVudC5faGFuZGxlUmVzcG9uc2Uoe1xuICAgICAgICB0YWc6ICdBJyxcbiAgICAgICAgY29tbWFuZDogJ3Rlc3QnXG4gICAgICB9KVxuXG4gICAgICBleHBlY3QoY2xpZW50Ll9zZW5kUmVxdWVzdC5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICBleHBlY3QoY2xpZW50Ll9nbG9iYWxBY2NlcHRVbnRhZ2dlZC5URVNULmNhbGxDb3VudCkudG8uZXF1YWwoMClcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjZW5xdWV1ZUNvbW1hbmQnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCByZWplY3Qgb24gTk8vQkFEJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihjbGllbnQsICdfc2VuZFJlcXVlc3QnKS5jYWxsc0Zha2UoKCkgPT4ge1xuICAgICAgICBjbGllbnQuX2NsaWVudFF1ZXVlWzBdLmNhbGxiYWNrKHsgY29tbWFuZDogJ05PJyB9KVxuICAgICAgfSlcblxuICAgICAgY2xpZW50Ll90YWdDb3VudGVyID0gMTAwXG4gICAgICBjbGllbnQuX2NsaWVudFF1ZXVlID0gW11cbiAgICAgIGNsaWVudC5fY2FuU2VuZCA9IHRydWVcblxuICAgICAgcmV0dXJuIGNsaWVudC5lbnF1ZXVlQ29tbWFuZCh7XG4gICAgICAgIGNvbW1hbmQ6ICdhYmMnXG4gICAgICB9LCBbJ2RlZiddLCB7XG4gICAgICAgIHQ6IDFcbiAgICAgIH0pLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgZXhwZWN0KGVycikudG8uZXhpc3RcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgaW52b2tlIHNlbmRpbmcnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGNsaWVudCwgJ19zZW5kUmVxdWVzdCcpLmNhbGxzRmFrZSgoKSA9PiB7XG4gICAgICAgIGNsaWVudC5fY2xpZW50UXVldWVbMF0uY2FsbGJhY2soe30pXG4gICAgICB9KVxuXG4gICAgICBjbGllbnQuX3RhZ0NvdW50ZXIgPSAxMDBcbiAgICAgIGNsaWVudC5fY2xpZW50UXVldWUgPSBbXVxuICAgICAgY2xpZW50Ll9jYW5TZW5kID0gdHJ1ZVxuXG4gICAgICByZXR1cm4gY2xpZW50LmVucXVldWVDb21tYW5kKHtcbiAgICAgICAgY29tbWFuZDogJ2FiYydcbiAgICAgIH0sIFsnZGVmJ10sIHtcbiAgICAgICAgdDogMVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChjbGllbnQuX3NlbmRSZXF1ZXN0LmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGNsaWVudC5fY2xpZW50UXVldWUubGVuZ3RoKS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoY2xpZW50Ll9jbGllbnRRdWV1ZVswXS50YWcpLnRvLmVxdWFsKCdXMTAxJylcbiAgICAgICAgZXhwZWN0KGNsaWVudC5fY2xpZW50UXVldWVbMF0ucmVxdWVzdCkudG8uZGVlcC5lcXVhbCh7XG4gICAgICAgICAgY29tbWFuZDogJ2FiYycsXG4gICAgICAgICAgdGFnOiAnVzEwMSdcbiAgICAgICAgfSlcbiAgICAgICAgZXhwZWN0KGNsaWVudC5fY2xpZW50UXVldWVbMF0udCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgb25seSBxdWV1ZScsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50LCAnX3NlbmRSZXF1ZXN0JylcblxuICAgICAgY2xpZW50Ll90YWdDb3VudGVyID0gMTAwXG4gICAgICBjbGllbnQuX2NsaWVudFF1ZXVlID0gW11cbiAgICAgIGNsaWVudC5fY2FuU2VuZCA9IGZhbHNlXG5cbiAgICAgIHNldFRpbWVvdXQoKCkgPT4geyBjbGllbnQuX2NsaWVudFF1ZXVlWzBdLmNhbGxiYWNrKHt9KSB9LCAwKVxuXG4gICAgICByZXR1cm4gY2xpZW50LmVucXVldWVDb21tYW5kKHtcbiAgICAgICAgY29tbWFuZDogJ2FiYydcbiAgICAgIH0sIFsnZGVmJ10sIHtcbiAgICAgICAgdDogMVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChjbGllbnQuX3NlbmRSZXF1ZXN0LmNhbGxDb3VudCkudG8uZXF1YWwoMClcbiAgICAgICAgZXhwZWN0KGNsaWVudC5fY2xpZW50UXVldWUubGVuZ3RoKS50by5lcXVhbCgxKVxuICAgICAgICBleHBlY3QoY2xpZW50Ll9jbGllbnRRdWV1ZVswXS50YWcpLnRvLmVxdWFsKCdXMTAxJylcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgc3RvcmUgdmFsdWVBc1N0cmluZyBvcHRpb24gaW4gdGhlIGNvbW1hbmQnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGNsaWVudCwgJ19zZW5kUmVxdWVzdCcpXG5cbiAgICAgIGNsaWVudC5fdGFnQ291bnRlciA9IDEwMFxuICAgICAgY2xpZW50Ll9jbGllbnRRdWV1ZSA9IFtdXG4gICAgICBjbGllbnQuX2NhblNlbmQgPSBmYWxzZVxuXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHsgY2xpZW50Ll9jbGllbnRRdWV1ZVswXS5jYWxsYmFjayh7fSkgfSwgMClcbiAgICAgIHJldHVybiBjbGllbnQuZW5xdWV1ZUNvbW1hbmQoe1xuICAgICAgICBjb21tYW5kOiAnYWJjJyxcbiAgICAgICAgdmFsdWVBc1N0cmluZzogZmFsc2VcbiAgICAgIH0sIFsnZGVmJ10sIHtcbiAgICAgICAgdDogMVxuICAgICAgfSkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChjbGllbnQuX2NsaWVudFF1ZXVlWzBdLnJlcXVlc3QudmFsdWVBc1N0cmluZykudG8uZXF1YWwoZmFsc2UpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNfc2VuZFJlcXVlc3QnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBlbnRlciBpZGxlIGlmIG5vdGhpbmcgaXMgdG8gcHJvY2VzcycsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50LCAnX2VudGVySWRsZScpXG5cbiAgICAgIGNsaWVudC5fY2xpZW50UXVldWUgPSBbXVxuICAgICAgY2xpZW50Ll9zZW5kUmVxdWVzdCgpXG5cbiAgICAgIGV4cGVjdChjbGllbnQuX2VudGVySWRsZS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgc2VuZCBkYXRhJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihjbGllbnQsICdfY2xlYXJJZGxlJylcbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50LCAnc2VuZCcpXG5cbiAgICAgIGNsaWVudC5fY2xpZW50UXVldWUgPSBbe1xuICAgICAgICByZXF1ZXN0OiB7XG4gICAgICAgICAgdGFnOiAnVzEwMScsXG4gICAgICAgICAgY29tbWFuZDogJ1RFU1QnXG4gICAgICAgIH1cbiAgICAgIH1dXG4gICAgICBjbGllbnQuX3NlbmRSZXF1ZXN0KClcblxuICAgICAgZXhwZWN0KGNsaWVudC5fY2xlYXJJZGxlLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIGV4cGVjdChjbGllbnQuc2VuZC5hcmdzWzBdWzBdKS50by5lcXVhbCgnVzEwMSBURVNUXFxyXFxuJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBzZW5kIHBhcnRpYWwgZGF0YScsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50LCAnX2NsZWFySWRsZScpXG4gICAgICBzaW5vbi5zdHViKGNsaWVudCwgJ3NlbmQnKVxuXG4gICAgICBjbGllbnQuX2NsaWVudFF1ZXVlID0gW3tcbiAgICAgICAgcmVxdWVzdDoge1xuICAgICAgICAgIHRhZzogJ1cxMDEnLFxuICAgICAgICAgIGNvbW1hbmQ6ICdURVNUJyxcbiAgICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgICAgdHlwZTogJ0xJVEVSQUwnLFxuICAgICAgICAgICAgdmFsdWU6ICdhYmMnXG4gICAgICAgICAgfV1cbiAgICAgICAgfVxuICAgICAgfV1cbiAgICAgIGNsaWVudC5fc2VuZFJlcXVlc3QoKVxuXG4gICAgICBleHBlY3QoY2xpZW50Ll9jbGVhcklkbGUuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgZXhwZWN0KGNsaWVudC5zZW5kLmFyZ3NbMF1bMF0pLnRvLmVxdWFsKCdXMTAxIFRFU1QgezN9XFxyXFxuJylcbiAgICAgIGV4cGVjdChjbGllbnQuX2N1cnJlbnRDb21tYW5kLmRhdGEpLnRvLmRlZXAuZXF1YWwoWydhYmMnXSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBydW4gcHJlY2hlY2snLCAoZG9uZSkgPT4ge1xuICAgICAgc2lub24uc3R1YihjbGllbnQsICdfY2xlYXJJZGxlJylcblxuICAgICAgY2xpZW50Ll9jYW5TZW5kID0gdHJ1ZVxuICAgICAgY2xpZW50Ll9jbGllbnRRdWV1ZSA9IFt7XG4gICAgICAgIHJlcXVlc3Q6IHtcbiAgICAgICAgICB0YWc6ICdXMTAxJyxcbiAgICAgICAgICBjb21tYW5kOiAnVEVTVCcsXG4gICAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICAgIHR5cGU6ICdMSVRFUkFMJyxcbiAgICAgICAgICAgIHZhbHVlOiAnYWJjJ1xuICAgICAgICAgIH1dXG4gICAgICAgIH0sXG4gICAgICAgIHByZWNoZWNrOiAoY3R4KSA9PiB7XG4gICAgICAgICAgZXhwZWN0KGN0eCkudG8uZXhpc3RcbiAgICAgICAgICBleHBlY3QoY2xpZW50Ll9jYW5TZW5kKS50by5iZS50cnVlXG4gICAgICAgICAgY2xpZW50Ll9zZW5kUmVxdWVzdCA9ICgpID0+IHtcbiAgICAgICAgICAgIGV4cGVjdChjbGllbnQuX2NsaWVudFF1ZXVlLmxlbmd0aCkudG8uZXF1YWwoMilcbiAgICAgICAgICAgIGV4cGVjdChjbGllbnQuX2NsaWVudFF1ZXVlWzBdLnRhZykudG8uaW5jbHVkZSgnLnAnKVxuICAgICAgICAgICAgZXhwZWN0KGNsaWVudC5fY2xpZW50UXVldWVbMF0ucmVxdWVzdC50YWcpLnRvLmluY2x1ZGUoJy5wJylcbiAgICAgICAgICAgIGNsaWVudC5fY2xlYXJJZGxlLnJlc3RvcmUoKVxuICAgICAgICAgICAgZG9uZSgpXG4gICAgICAgICAgfVxuICAgICAgICAgIGNsaWVudC5lbnF1ZXVlQ29tbWFuZCh7fSwgdW5kZWZpbmVkLCB7XG4gICAgICAgICAgICBjdHg6IGN0eFxuICAgICAgICAgIH0pXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIH1cbiAgICAgIH1dXG4gICAgICBjbGllbnQuX3NlbmRSZXF1ZXN0KClcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjX2VudGVySWRsZScsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHNldCBpZGxlIHRpbWVyJywgKGRvbmUpID0+IHtcbiAgICAgIGNsaWVudC5vbmlkbGUgPSAoKSA9PiB7XG4gICAgICAgIGRvbmUoKVxuICAgICAgfVxuICAgICAgY2xpZW50LnRpbWVvdXRFbnRlcklkbGUgPSAxXG5cbiAgICAgIGNsaWVudC5fZW50ZXJJZGxlKClcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjX3Byb2Nlc3NSZXNwb25zZScsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHNldCBodW1hblJlYWRhYmxlJywgKCkgPT4ge1xuICAgICAgdmFyIHJlc3BvbnNlID0ge1xuICAgICAgICB0YWc6ICcqJyxcbiAgICAgICAgY29tbWFuZDogJ09LJyxcbiAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICB0eXBlOiAnVEVYVCcsXG4gICAgICAgICAgdmFsdWU6ICdTb21lIHJhbmRvbSB0ZXh0J1xuICAgICAgICB9XVxuICAgICAgfVxuICAgICAgY2xpZW50Ll9wcm9jZXNzUmVzcG9uc2UocmVzcG9uc2UpXG5cbiAgICAgIGV4cGVjdChyZXNwb25zZS5odW1hblJlYWRhYmxlKS50by5lcXVhbCgnU29tZSByYW5kb20gdGV4dCcpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgc2V0IHJlc3BvbnNlIGNvZGUnLCAoKSA9PiB7XG4gICAgICB2YXIgcmVzcG9uc2UgPSB7XG4gICAgICAgIHRhZzogJyonLFxuICAgICAgICBjb21tYW5kOiAnT0snLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICAgIHR5cGU6ICdBVE9NJyxcbiAgICAgICAgICBzZWN0aW9uOiBbe1xuICAgICAgICAgICAgdHlwZTogJ0FUT00nLFxuICAgICAgICAgICAgdmFsdWU6ICdDQVBBQklMSVRZJ1xuICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgIHR5cGU6ICdBVE9NJyxcbiAgICAgICAgICAgIHZhbHVlOiAnSU1BUDRSRVYxJ1xuICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgIHR5cGU6ICdBVE9NJyxcbiAgICAgICAgICAgIHZhbHVlOiAnVUlEUExVUydcbiAgICAgICAgICB9XVxuICAgICAgICB9LCB7XG4gICAgICAgICAgdHlwZTogJ1RFWFQnLFxuICAgICAgICAgIHZhbHVlOiAnU29tZSByYW5kb20gdGV4dCdcbiAgICAgICAgfV1cbiAgICAgIH1cbiAgICAgIGNsaWVudC5fcHJvY2Vzc1Jlc3BvbnNlKHJlc3BvbnNlKVxuICAgICAgZXhwZWN0KHJlc3BvbnNlLmNvZGUpLnRvLmVxdWFsKCdDQVBBQklMSVRZJylcbiAgICAgIGV4cGVjdChyZXNwb25zZS5jYXBhYmlsaXR5KS50by5kZWVwLmVxdWFsKFsnSU1BUDRSRVYxJywgJ1VJRFBMVVMnXSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjaXNFcnJvcicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGRldGVjdCBpZiBhbiBvYmplY3QgaXMgYW4gZXJyb3InLCAoKSA9PiB7XG4gICAgICBleHBlY3QoY2xpZW50LmlzRXJyb3IobmV3IFJhbmdlRXJyb3IoJ2FiYycpKSkudG8uYmUudHJ1ZVxuICAgICAgZXhwZWN0KGNsaWVudC5pc0Vycm9yKCdhYmMnKSkudG8uYmUuZmFsc2VcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjZW5hYmxlQ29tcHJlc3Npb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgaW5mbGF0ZXIgYW5kIGRlZmxhdGVyIHN0cmVhbXMnLCAoKSA9PiB7XG4gICAgICBjbGllbnQuc29ja2V0Lm9uZGF0YSA9ICgpID0+IHsgfVxuICAgICAgc2lub24uc3R1YihjbGllbnQuc29ja2V0LCAnb25kYXRhJylcblxuICAgICAgZXhwZWN0KGNsaWVudC5jb21wcmVzc2VkKS50by5iZS5mYWxzZVxuICAgICAgY2xpZW50LmVuYWJsZUNvbXByZXNzaW9uKClcbiAgICAgIGV4cGVjdChjbGllbnQuY29tcHJlc3NlZCkudG8uYmUudHJ1ZVxuXG4gICAgICBjb25zdCBwYXlsb2FkID0gJ2FzZGFzZCdcbiAgICAgIGNvbnN0IGV4cGVjdGVkID0gcGF5bG9hZC5zcGxpdCgnJykubWFwKGNoYXIgPT4gY2hhci5jaGFyQ29kZUF0KDApKVxuXG4gICAgICBjbGllbnQuc2VuZChwYXlsb2FkKVxuICAgICAgY29uc3QgYWN0dWFsT3V0ID0gc29ja2V0U3R1Yi5zZW5kLmFyZ3NbMF1bMF1cbiAgICAgIGNsaWVudC5zb2NrZXQub25kYXRhKHsgZGF0YTogYWN0dWFsT3V0IH0pXG4gICAgICBleHBlY3QoQnVmZmVyLmZyb20oY2xpZW50Ll9zb2NrZXRPbkRhdGEuYXJnc1swXVswXS5kYXRhKSkudG8uZGVlcC5lcXVhbChCdWZmZXIuZnJvbShleHBlY3RlZCkpXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2dldFByZXZpb3VzbHlRdWV1ZWQnLCAoKSA9PiB7XG4gICAgY29uc3QgY3R4ID0ge31cblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCB3aXRoIGVtcHR5IHF1ZXVlIGFuZCBubyBjdXJyZW50IGNvbW1hbmQnLCAoKSA9PiB7XG4gICAgICBjbGllbnQuX2N1cnJlbnRDb21tYW5kID0gdW5kZWZpbmVkXG4gICAgICBjbGllbnQuX2NsaWVudFF1ZXVlID0gW11cblxuICAgICAgZXhwZWN0KHRlc3RBbmRHZXRBdHRyaWJ1dGUoKSkudG8uYmUudW5kZWZpbmVkXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCB3aXRoIGVtcHR5IHF1ZXVlIGFuZCBub24tU0VMRUNUIGN1cnJlbnQgY29tbWFuZCcsICgpID0+IHtcbiAgICAgIGNsaWVudC5fY3VycmVudENvbW1hbmQgPSBjcmVhdGVDb21tYW5kKCdURVNUJylcbiAgICAgIGNsaWVudC5fY2xpZW50UXVldWUgPSBbXVxuXG4gICAgICBleHBlY3QodGVzdEFuZEdldEF0dHJpYnV0ZSgpKS50by5iZS51bmRlZmluZWRcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gY3VycmVudCBjb21tYW5kIHdpdGggZW1wdHkgcXVldWUgYW5kIFNFTEVDVCBjdXJyZW50IGNvbW1hbmQnLCAoKSA9PiB7XG4gICAgICBjbGllbnQuX2N1cnJlbnRDb21tYW5kID0gY3JlYXRlQ29tbWFuZCgnU0VMRUNUJywgJ0FUVFInKVxuICAgICAgY2xpZW50Ll9jbGllbnRRdWV1ZSA9IFtdXG5cbiAgICAgIGV4cGVjdCh0ZXN0QW5kR2V0QXR0cmlidXRlKCkpLnRvLmVxdWFsKCdBVFRSJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gY3VycmVudCBjb21tYW5kIHdpdGggbm9uLVNFTEVDVCBjb21tYW5kcyBpbiBxdWV1ZSBhbmQgU0VMRUNUIGN1cnJlbnQgY29tbWFuZCcsICgpID0+IHtcbiAgICAgIGNsaWVudC5fY3VycmVudENvbW1hbmQgPSBjcmVhdGVDb21tYW5kKCdTRUxFQ1QnLCAnQVRUUicpXG4gICAgICBjbGllbnQuX2NsaWVudFF1ZXVlID0gW1xuICAgICAgICBjcmVhdGVDb21tYW5kKCdURVNUMDEnKSxcbiAgICAgICAgY3JlYXRlQ29tbWFuZCgnVEVTVDAyJylcbiAgICAgIF1cblxuICAgICAgZXhwZWN0KHRlc3RBbmRHZXRBdHRyaWJ1dGUoKSkudG8uZXF1YWwoJ0FUVFInKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiBsYXN0IFNFTEVDVCBiZWZvcmUgY3R4IHdpdGggbXVsdGlwbGUgU0VMRUNUIGNvbW1hbmRzIGluIHF1ZXVlICgxKScsICgpID0+IHtcbiAgICAgIGNsaWVudC5fY3VycmVudENvbW1hbmQgPSBjcmVhdGVDb21tYW5kKCdTRUxFQ1QnLCAnQVRUUjAxJylcbiAgICAgIGNsaWVudC5fY2xpZW50UXVldWUgPSBbXG4gICAgICAgIGNyZWF0ZUNvbW1hbmQoJ1NFTEVDVCcsICdBVFRSJyksXG4gICAgICAgIGNyZWF0ZUNvbW1hbmQoJ1RFU1QnKSxcbiAgICAgICAgY3R4LFxuICAgICAgICBjcmVhdGVDb21tYW5kKCdTRUxFQ1QnLCAnQVRUUjAzJylcbiAgICAgIF1cblxuICAgICAgZXhwZWN0KHRlc3RBbmRHZXRBdHRyaWJ1dGUoKSkudG8uZXF1YWwoJ0FUVFInKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiBsYXN0IFNFTEVDVCBiZWZvcmUgY3R4IHdpdGggbXVsdGlwbGUgU0VMRUNUIGNvbW1hbmRzIGluIHF1ZXVlICgyKScsICgpID0+IHtcbiAgICAgIGNsaWVudC5fY2xpZW50UXVldWUgPSBbXG4gICAgICAgIGNyZWF0ZUNvbW1hbmQoJ1NFTEVDVCcsICdBVFRSMDInKSxcbiAgICAgICAgY3JlYXRlQ29tbWFuZCgnU0VMRUNUJywgJ0FUVFInKSxcbiAgICAgICAgY3R4LFxuICAgICAgICBjcmVhdGVDb21tYW5kKCdTRUxFQ1QnLCAnQVRUUjAzJylcbiAgICAgIF1cblxuICAgICAgZXhwZWN0KHRlc3RBbmRHZXRBdHRyaWJ1dGUoKSkudG8uZXF1YWwoJ0FUVFInKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiBsYXN0IFNFTEVDVCBiZWZvcmUgY3R4IHdpdGggbXVsdGlwbGUgU0VMRUNUIGNvbW1hbmRzIGluIHF1ZXVlICgzKScsICgpID0+IHtcbiAgICAgIGNsaWVudC5fY2xpZW50UXVldWUgPSBbXG4gICAgICAgIGNyZWF0ZUNvbW1hbmQoJ1NFTEVDVCcsICdBVFRSMDInKSxcbiAgICAgICAgY3JlYXRlQ29tbWFuZCgnU0VMRUNUJywgJ0FUVFInKSxcbiAgICAgICAgY3JlYXRlQ29tbWFuZCgnVEVTVCcpLFxuICAgICAgICBjdHgsXG4gICAgICAgIGNyZWF0ZUNvbW1hbmQoJ1NFTEVDVCcsICdBVFRSMDMnKVxuICAgICAgXVxuXG4gICAgICBleHBlY3QodGVzdEFuZEdldEF0dHJpYnV0ZSgpKS50by5lcXVhbCgnQVRUUicpXG4gICAgfSlcblxuICAgIGZ1bmN0aW9uIHRlc3RBbmRHZXRBdHRyaWJ1dGUgKCkge1xuICAgICAgY29uc3QgZGF0YSA9IGNsaWVudC5nZXRQcmV2aW91c2x5UXVldWVkKFsnU0VMRUNUJ10sIGN0eClcbiAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgIHJldHVybiBkYXRhLnJlcXVlc3QuYXR0cmlidXRlc1swXS52YWx1ZVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZUNvbW1hbmQgKGNvbW1hbmQsIGF0dHJpYnV0ZSkge1xuICAgICAgY29uc3QgYXR0cmlidXRlcyA9IFtdXG4gICAgICBjb25zdCBkYXRhID0ge1xuICAgICAgICByZXF1ZXN0OiB7IGNvbW1hbmQsIGF0dHJpYnV0ZXMgfVxuICAgICAgfVxuXG4gICAgICBpZiAoYXR0cmlidXRlKSB7XG4gICAgICAgIGRhdGEucmVxdWVzdC5hdHRyaWJ1dGVzLnB1c2goe1xuICAgICAgICAgIHR5cGU6ICdTVFJJTkcnLFxuICAgICAgICAgIHZhbHVlOiBhdHRyaWJ1dGVcbiAgICAgICAgfSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGRhdGFcbiAgICB9XG4gIH0pXG59KVxuIl0sIm1hcHBpbmdzIjoiOztBQUVBLElBQUFBLEtBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLE9BQUEsR0FBQUQsT0FBQTtBQUF1QyxTQUFBRCx1QkFBQUcsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQUh2Qzs7QUFLQSxNQUFNRyxJQUFJLEdBQUcsV0FBVztBQUN4QixNQUFNQyxJQUFJLEdBQUcsS0FBSztBQUVsQkMsUUFBUSxDQUFDLDRCQUE0QixFQUFFLE1BQU07RUFDM0MsSUFBSUMsTUFBTSxFQUFFQyxVQUFVOztFQUV0Qjs7RUFFQUMsVUFBVSxDQUFDLE1BQU07SUFDZkYsTUFBTSxHQUFHLElBQUlHLGFBQVUsQ0FBQ04sSUFBSSxFQUFFQyxJQUFJLENBQUM7SUFDbkNNLE1BQU0sQ0FBQ0osTUFBTSxDQUFDLENBQUNLLEVBQUUsQ0FBQ0MsS0FBSztJQUV2Qk4sTUFBTSxDQUFDTyxNQUFNLEdBQUc7TUFDZEMsS0FBSyxFQUFFQSxDQUFBLEtBQU0sQ0FBRSxDQUFDO01BQ2hCQyxLQUFLLEVBQUVBLENBQUEsS0FBTSxDQUFFO0lBQ2pCLENBQUM7SUFFRCxJQUFJQyxNQUFNLEdBQUcsU0FBQUEsQ0FBQSxFQUFZLENBQUUsQ0FBQztJQUM1QkEsTUFBTSxDQUFDQyxJQUFJLEdBQUcsTUFBTSxDQUFFLENBQUM7SUFDdkJELE1BQU0sQ0FBQ0UsU0FBUyxDQUFDQyxLQUFLLEdBQUcsTUFBTSxDQUFFLENBQUM7SUFDbENILE1BQU0sQ0FBQ0UsU0FBUyxDQUFDRSxJQUFJLEdBQUcsTUFBTSxDQUFFLENBQUM7SUFD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