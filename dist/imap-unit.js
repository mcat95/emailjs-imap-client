"use strict";

var _imap = _interopRequireDefault(require("./imap"));
var _common = require("./common");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJob3N0IiwicG9ydCIsImRlc2NyaWJlIiwiY2xpZW50Iiwic29ja2V0U3R1YiIsImJlZm9yZUVhY2giLCJJbWFwQ2xpZW50IiwiZXhwZWN0IiwidG8iLCJleGlzdCIsImxvZ2dlciIsImRlYnVnIiwiZXJyb3IiLCJTb2NrZXQiLCJvcGVuIiwicHJvdG90eXBlIiwiY2xvc2UiLCJzZW5kIiwic3VzcGVuZCIsInJlc3VtZSIsInVwZ3JhZGVUb1NlY3VyZSIsInNpbm9uIiwiY3JlYXRlU3R1Ykluc3RhbmNlIiwic3R1YiIsIndpdGhBcmdzIiwicmV0dXJucyIsInByb21pc2UiLCJjb25uZWN0IiwidGhlbiIsImNhbGxDb3VudCIsImVxdWFsIiwib25lcnJvciIsIm9ub3BlbiIsIm9uY2xvc2UiLCJvbmRhdGEiLCJzZXRUaW1lb3V0Iiwic2tpcCIsIml0Iiwic29ja2V0IiwicmVhZHlTdGF0ZSIsImNhbGxlZCIsImJlIiwiZmFsc2UiLCJzZWN1cmVNb2RlIiwidXBncmFkZSIsImhhbmRsZXIiLCJzZXRIYW5kbGVyIiwiX2dsb2JhbEFjY2VwdFVudGFnZ2VkIiwiRkVUQ0giLCJkb25lIiwiZGF0YSIsIkVycm9yIiwiX29uRGF0YSIsInRvVHlwZWRBcnJheSIsImJ1ZmZlciIsIl9wYXJzZUluY29taW5nQ29tbWFuZHMiLCJjYWxsZWRPbmNlIiwidHJ1ZSIsIl9pdGVyYXRlSW5jb21pbmdCdWZmZXIiLCJhcHBlbmRJbmNvbWluZ0J1ZmZlciIsIml0ZXJhdG9yIiwiU3RyaW5nIiwiZnJvbUNoYXJDb2RlIiwiYXBwbHkiLCJuZXh0IiwidmFsdWUiLCJ1bmRlZmluZWQiLCJpdGVyYXRvcjEiLCJpdGVyYXRvcjIiLCJpdGVyYXRvcjMiLCJjb250ZW50IiwiX2luY29taW5nQnVmZmVycyIsInB1c2giLCJvbnJlYWR5IiwiZ2VuIiwiX2hhbmRsZVJlc3BvbnNlIiwidGFnIiwiY29tbWFuZCIsImF0dHJpYnV0ZXMiLCJ0eXBlIiwibnIiLCJfY3VycmVudENvbW1hbmQiLCJlcnJvclJlc3BvbnNlRXhwZWN0c0VtcHR5TGluZSIsIlRFU1QiLCJfc2VuZFJlcXVlc3QiLCJwYXlsb2FkIiwiZGVlcCIsImNhbGxiYWNrIiwicmVzcG9uc2UiLCJjYWxsc0Zha2UiLCJfY2xpZW50UXVldWUiLCJfdGFnQ291bnRlciIsIl9jYW5TZW5kIiwiZW5xdWV1ZUNvbW1hbmQiLCJ0IiwiY2F0Y2giLCJlcnIiLCJsZW5ndGgiLCJyZXF1ZXN0IiwidmFsdWVBc1N0cmluZyIsIl9lbnRlcklkbGUiLCJfY2xlYXJJZGxlIiwiYXJncyIsInByZWNoZWNrIiwiY3R4IiwiaW5jbHVkZSIsInJlc3RvcmUiLCJQcm9taXNlIiwicmVzb2x2ZSIsIm9uaWRsZSIsInRpbWVvdXRFbnRlcklkbGUiLCJfcHJvY2Vzc1Jlc3BvbnNlIiwiaHVtYW5SZWFkYWJsZSIsInNlY3Rpb24iLCJjb2RlIiwiY2FwYWJpbGl0eSIsImlzRXJyb3IiLCJSYW5nZUVycm9yIiwiY29tcHJlc3NlZCIsImVuYWJsZUNvbXByZXNzaW9uIiwiZXhwZWN0ZWQiLCJzcGxpdCIsIm1hcCIsImNoYXIiLCJjaGFyQ29kZUF0IiwiYWN0dWFsT3V0IiwiQnVmZmVyIiwiZnJvbSIsIl9zb2NrZXRPbkRhdGEiLCJ0ZXN0QW5kR2V0QXR0cmlidXRlIiwiY3JlYXRlQ29tbWFuZCIsImdldFByZXZpb3VzbHlRdWV1ZWQiLCJhdHRyaWJ1dGUiXSwic291cmNlcyI6WyIuLi9zcmMvaW1hcC11bml0LmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qIGVzbGludC1kaXNhYmxlIG5vLXVudXNlZC1leHByZXNzaW9ucyAqL1xuXG5pbXBvcnQgSW1hcENsaWVudCBmcm9tICcuL2ltYXAnXG5pbXBvcnQgeyB0b1R5cGVkQXJyYXkgfSBmcm9tICcuL2NvbW1vbidcblxuY29uc3QgaG9zdCA9ICdsb2NhbGhvc3QnXG5jb25zdCBwb3J0ID0gMTAwMDBcblxuZGVzY3JpYmUoJ2Jyb3dzZXJib3ggaW1hcCB1bml0IHRlc3RzJywgKCkgPT4ge1xuICB2YXIgY2xpZW50LCBzb2NrZXRTdHViXG5cbiAgLyoganNoaW50IGluZGVudDpmYWxzZSAqL1xuXG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGNsaWVudCA9IG5ldyBJbWFwQ2xpZW50KGhvc3QsIHBvcnQpXG4gICAgZXhwZWN0KGNsaWVudCkudG8uZXhpc3RcblxuICAgIGNsaWVudC5sb2dnZXIgPSB7XG4gICAgICBkZWJ1ZzogKCkgPT4geyB9LFxuICAgICAgZXJyb3I6ICgpID0+IHsgfVxuICAgIH1cblxuICAgIHZhciBTb2NrZXQgPSBmdW5jdGlvbiAoKSB7IH1cbiAgICBTb2NrZXQub3BlbiA9ICgpID0+IHsgfVxuICAgIFNvY2tldC5wcm90b3R5cGUuY2xvc2UgPSAoKSA9PiB7IH1cbiAgICBTb2NrZXQucHJvdG90eXBlLnNlbmQgPSAoKSA9PiB7IH1cbiAgICBTb2NrZXQucHJvdG90eXBlLnN1c3BlbmQgPSAoKSA9PiB7IH1cbiAgICBTb2NrZXQucHJvdG90eXBlLnJlc3VtZSA9ICgpID0+IHsgfVxuICAgIFNvY2tldC5wcm90b3R5cGUudXBncmFkZVRvU2VjdXJlID0gKCkgPT4geyB9XG5cbiAgICBzb2NrZXRTdHViID0gc2lub24uY3JlYXRlU3R1Ykluc3RhbmNlKFNvY2tldClcbiAgICBzaW5vbi5zdHViKFNvY2tldCwgJ29wZW4nKS53aXRoQXJncyhob3N0LCBwb3J0KS5yZXR1cm5zKHNvY2tldFN0dWIpXG5cbiAgICB2YXIgcHJvbWlzZSA9IGNsaWVudC5jb25uZWN0KFNvY2tldCkudGhlbigoKSA9PiB7XG4gICAgICBleHBlY3QoU29ja2V0Lm9wZW4uY2FsbENvdW50KS50by5lcXVhbCgxKVxuXG4gICAgICBleHBlY3Qoc29ja2V0U3R1Yi5vbmVycm9yKS50by5leGlzdFxuICAgICAgZXhwZWN0KHNvY2tldFN0dWIub25vcGVuKS50by5leGlzdFxuICAgICAgZXhwZWN0KHNvY2tldFN0dWIub25jbG9zZSkudG8uZXhpc3RcbiAgICAgIGV4cGVjdChzb2NrZXRTdHViLm9uZGF0YSkudG8uZXhpc3RcbiAgICB9KVxuXG4gICAgc2V0VGltZW91dCgoKSA9PiBzb2NrZXRTdHViLm9ub3BlbigpLCAxMClcblxuICAgIHJldHVybiBwcm9taXNlXG4gIH0pXG5cbiAgZGVzY3JpYmUuc2tpcCgnI2Nsb3NlJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgY2FsbCBzb2NrZXQuY2xvc2UnLCAoKSA9PiB7XG4gICAgICBjbGllbnQuc29ja2V0LnJlYWR5U3RhdGUgPSAnb3BlbidcblxuICAgICAgc2V0VGltZW91dCgoKSA9PiBzb2NrZXRTdHViLm9uY2xvc2UoKSwgMTApXG4gICAgICByZXR1cm4gY2xpZW50LmNsb3NlKCkudGhlbigoKSA9PiB7XG4gICAgICAgIGV4cGVjdChzb2NrZXRTdHViLmNsb3NlLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgbm90IGNhbGwgc29ja2V0LmNsb3NlJywgKCkgPT4ge1xuICAgICAgY2xpZW50LnNvY2tldC5yZWFkeVN0YXRlID0gJ25vdCBvcGVuLiBkdWguJ1xuXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHNvY2tldFN0dWIub25jbG9zZSgpLCAxMClcbiAgICAgIHJldHVybiBjbGllbnQuY2xvc2UoKS50aGVuKCgpID0+IHtcbiAgICAgICAgZXhwZWN0KHNvY2tldFN0dWIuY2xvc2UuY2FsbGVkKS50by5iZS5mYWxzZVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjdXBncmFkZScsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHVwZ3JhZGUgc29ja2V0JywgKCkgPT4ge1xuICAgICAgY2xpZW50LnNlY3VyZU1vZGUgPSBmYWxzZVxuICAgICAgY2xpZW50LnVwZ3JhZGUoKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIG5vdCB1cGdyYWRlIHNvY2tldCcsICgpID0+IHtcbiAgICAgIGNsaWVudC5zZWN1cmVNb2RlID0gdHJ1ZVxuICAgICAgY2xpZW50LnVwZ3JhZGUoKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNzZXRIYW5kbGVyJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgc2V0IGdsb2JhbCBoYW5kbGVyIGZvciBrZXl3b3JkJywgKCkgPT4ge1xuICAgICAgdmFyIGhhbmRsZXIgPSAoKSA9PiB7IH1cbiAgICAgIGNsaWVudC5zZXRIYW5kbGVyKCdmZXRjaCcsIGhhbmRsZXIpXG5cbiAgICAgIGV4cGVjdChjbGllbnQuX2dsb2JhbEFjY2VwdFVudGFnZ2VkLkZFVENIKS50by5lcXVhbChoYW5kbGVyKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNzb2NrZXQub25lcnJvcicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGVtaXQgZXJyb3IgYW5kIGNsb3NlIGNvbm5lY3Rpb24nLCAoZG9uZSkgPT4ge1xuICAgICAgY2xpZW50LnNvY2tldC5vbmVycm9yKHtcbiAgICAgICAgZGF0YTogbmV3IEVycm9yKCdlcnInKVxuICAgICAgfSlcblxuICAgICAgY2xpZW50Lm9uZXJyb3IgPSAoKSA9PiB7XG4gICAgICAgIGRvbmUoKVxuICAgICAgfVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNzb2NrZXQub25jbG9zZScsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIGVtaXQgZXJyb3IgJywgKGRvbmUpID0+IHtcbiAgICAgIGNsaWVudC5zb2NrZXQub25jbG9zZSgpXG5cbiAgICAgIGNsaWVudC5vbmVycm9yID0gKCkgPT4ge1xuICAgICAgICBkb25lKClcbiAgICAgIH1cbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjX29uRGF0YScsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHByb2Nlc3MgaW5wdXQnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGNsaWVudCwgJ19wYXJzZUluY29taW5nQ29tbWFuZHMnKVxuICAgICAgc2lub24uc3R1YihjbGllbnQsICdfaXRlcmF0ZUluY29taW5nQnVmZmVyJylcblxuICAgICAgY2xpZW50Ll9vbkRhdGEoe1xuICAgICAgICBkYXRhOiB0b1R5cGVkQXJyYXkoJ2Zvb2JhcicpLmJ1ZmZlclxuICAgICAgfSlcblxuICAgICAgZXhwZWN0KGNsaWVudC5fcGFyc2VJbmNvbWluZ0NvbW1hbmRzLmNhbGxlZE9uY2UpLnRvLmJlLnRydWVcbiAgICAgIGV4cGVjdChjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlci5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgncmF0ZUluY29taW5nQnVmZmVyJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaXRlcmF0ZSBjaHVua2VkIGlucHV0JywgKCkgPT4ge1xuICAgICAgYXBwZW5kSW5jb21pbmdCdWZmZXIoJyogMSBGRVRDSCAoVUlEIDEpXFxyXFxuKiAyIEZFVENIIChVSUQgMilcXHJcXG4qIDMgRkVUQ0ggKFVJRCAzKVxcclxcbicpXG4gICAgICB2YXIgaXRlcmF0b3IgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG5cbiAgICAgIGV4cGVjdChTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGl0ZXJhdG9yLm5leHQoKS52YWx1ZSkpLnRvLmVxdWFsKCcqIDEgRkVUQ0ggKFVJRCAxKScpXG4gICAgICBleHBlY3QoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBpdGVyYXRvci5uZXh0KCkudmFsdWUpKS50by5lcXVhbCgnKiAyIEZFVENIIChVSUQgMiknKVxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IubmV4dCgpLnZhbHVlKSkudG8uZXF1YWwoJyogMyBGRVRDSCAoVUlEIDMpJylcbiAgICAgIGV4cGVjdChpdGVyYXRvci5uZXh0KCkudmFsdWUpLnRvLmJlLnVuZGVmaW5lZFxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHByb2Nlc3MgY2h1bmtlZCBsaXRlcmFscycsICgpID0+IHtcbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcqIDEgRkVUQ0ggKFVJRCB7MX1cXHJcXG4xKVxcclxcbiogMiBGRVRDSCAoVUlEIHs0fVxcclxcbjIzNDUpXFxyXFxuKiAzIEZFVENIIChVSUQgezR9XFxyXFxuMzc4OSlcXHJcXG4nKVxuICAgICAgdmFyIGl0ZXJhdG9yID0gY2xpZW50Ll9pdGVyYXRlSW5jb21pbmdCdWZmZXIoKVxuXG4gICAgICBleHBlY3QoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBpdGVyYXRvci5uZXh0KCkudmFsdWUpKS50by5lcXVhbCgnKiAxIEZFVENIIChVSUQgezF9XFxyXFxuMSknKVxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IubmV4dCgpLnZhbHVlKSkudG8uZXF1YWwoJyogMiBGRVRDSCAoVUlEIHs0fVxcclxcbjIzNDUpJylcbiAgICAgIGV4cGVjdChTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGl0ZXJhdG9yLm5leHQoKS52YWx1ZSkpLnRvLmVxdWFsKCcqIDMgRkVUQ0ggKFVJRCB7NH1cXHJcXG4zNzg5KScpXG4gICAgICBleHBlY3QoaXRlcmF0b3IubmV4dCgpLnZhbHVlKS50by5iZS51bmRlZmluZWRcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBwcm9jZXNzIGNodW5rZWQgbGl0ZXJhbHMgMicsICgpID0+IHtcbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcqIDEgRkVUQ0ggKFVJRCAxKVxcclxcbiogMiBGRVRDSCAoVUlEIHs0fVxcclxcbjIzNDUpXFxyXFxuJylcbiAgICAgIHZhciBpdGVyYXRvciA9IGNsaWVudC5faXRlcmF0ZUluY29taW5nQnVmZmVyKClcblxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IubmV4dCgpLnZhbHVlKSkudG8uZXF1YWwoJyogMSBGRVRDSCAoVUlEIDEpJylcbiAgICAgIGV4cGVjdChTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGl0ZXJhdG9yLm5leHQoKS52YWx1ZSkpLnRvLmVxdWFsKCcqIDIgRkVUQ0ggKFVJRCB7NH1cXHJcXG4yMzQ1KScpXG4gICAgICBleHBlY3QoaXRlcmF0b3IubmV4dCgpLnZhbHVlKS50by5iZS51bmRlZmluZWRcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBwcm9jZXNzIGNodW5rZWQgbGl0ZXJhbHMgMycsICgpID0+IHtcbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcqIDEgRkVUQ0ggKFVJRCB7MX1cXHJcXG4xKVxcclxcbiogMiBGRVRDSCAoVUlEIDQpXFxyXFxuJylcbiAgICAgIHZhciBpdGVyYXRvciA9IGNsaWVudC5faXRlcmF0ZUluY29taW5nQnVmZmVyKClcblxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IubmV4dCgpLnZhbHVlKSkudG8uZXF1YWwoJyogMSBGRVRDSCAoVUlEIHsxfVxcclxcbjEpJylcbiAgICAgIGV4cGVjdChTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGl0ZXJhdG9yLm5leHQoKS52YWx1ZSkpLnRvLmVxdWFsKCcqIDIgRkVUQ0ggKFVJRCA0KScpXG4gICAgICBleHBlY3QoaXRlcmF0b3IubmV4dCgpLnZhbHVlKS50by5iZS51bmRlZmluZWRcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBwcm9jZXNzIGNodW5rZWQgbGl0ZXJhbHMgNCcsICgpID0+IHtcbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcqIFNFQVJDSCB7MX1cXHJcXG4xIHsxfVxcclxcbjJcXHJcXG4nKVxuICAgICAgdmFyIGl0ZXJhdG9yID0gY2xpZW50Ll9pdGVyYXRlSW5jb21pbmdCdWZmZXIoKVxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IubmV4dCgpLnZhbHVlKSkudG8uZXF1YWwoJyogU0VBUkNIIHsxfVxcclxcbjEgezF9XFxyXFxuMicpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcHJvY2VzcyBDUkxGIGxpdGVyYWwnLCAoKSA9PiB7XG4gICAgICBhcHBlbmRJbmNvbWluZ0J1ZmZlcignKiAxIEZFVENIIChVSUQgMjAgQk9EWVtIRUFERVIuRklFTERTIChSRUZFUkVOQ0VTIExJU1QtSUQpXSB7Mn1cXHJcXG5cXHJcXG4pXFxyXFxuJylcbiAgICAgIHZhciBpdGVyYXRvciA9IGNsaWVudC5faXRlcmF0ZUluY29taW5nQnVmZmVyKClcbiAgICAgIGV4cGVjdChTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGl0ZXJhdG9yLm5leHQoKS52YWx1ZSkpLnRvLmVxdWFsKCcqIDEgRkVUQ0ggKFVJRCAyMCBCT0RZW0hFQURFUi5GSUVMRFMgKFJFRkVSRU5DRVMgTElTVC1JRCldIHsyfVxcclxcblxcclxcbiknKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHByb2Nlc3MgQ1JMRiBsaXRlcmFsIDInLCAoKSA9PiB7XG4gICAgICBhcHBlbmRJbmNvbWluZ0J1ZmZlcignKiAxIEZFVENIIChVSUQgMSBFTlZFTE9QRSAoXCJzdHJpbmcgd2l0aCB7cGFyZW50aGVzaXN9XCIpIEJPRFlbSEVBREVSLkZJRUxEUyAoUkVGRVJFTkNFUyBMSVNULUlEKV0gezJ9XFxyXFxuXFxyXFxuKVxcclxcbicpXG4gICAgICB2YXIgaXRlcmF0b3IgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG4gICAgICBleHBlY3QoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBpdGVyYXRvci5uZXh0KCkudmFsdWUpKS50by5lcXVhbCgnKiAxIEZFVENIIChVSUQgMSBFTlZFTE9QRSAoXCJzdHJpbmcgd2l0aCB7cGFyZW50aGVzaXN9XCIpIEJPRFlbSEVBREVSLkZJRUxEUyAoUkVGRVJFTkNFUyBMSVNULUlEKV0gezJ9XFxyXFxuXFxyXFxuKScpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcGFyc2UgbXVsdGlwbGUgemVyby1sZW5ndGggbGl0ZXJhbHMnLCAoKSA9PiB7XG4gICAgICBhcHBlbmRJbmNvbWluZ0J1ZmZlcignKiAxMjYwMTUgRkVUQ0ggKFVJRCA1ODU1OTkgQk9EWVsxLjJdIHswfVxcclxcbiBCT0RZWzEuMV0gezB9XFxyXFxuKVxcclxcbicpXG4gICAgICB2YXIgaXRlcmF0b3IgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG4gICAgICBleHBlY3QoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBpdGVyYXRvci5uZXh0KCkudmFsdWUpKS50by5lcXVhbCgnKiAxMjYwMTUgRkVUQ0ggKFVJRCA1ODU1OTkgQk9EWVsxLjJdIHswfVxcclxcbiBCT0RZWzEuMV0gezB9XFxyXFxuKScpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcHJvY2VzcyB0d28gY29tbWFuZHMgd2hlbiBDUkxGIGFycml2ZXMgaW4gMiBwYXJ0cycsICgpID0+IHtcbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcqIDEgRkVUQ0ggKFVJRCAxKVxccicpXG4gICAgICB2YXIgaXRlcmF0b3IxID0gY2xpZW50Ll9pdGVyYXRlSW5jb21pbmdCdWZmZXIoKVxuICAgICAgZXhwZWN0KGl0ZXJhdG9yMS5uZXh0KCkudmFsdWUpLnRvLmJlLnVuZGVmaW5lZFxuXG4gICAgICBhcHBlbmRJbmNvbWluZ0J1ZmZlcignXFxuKiAyIEZFVENIIChVSUQgMilcXHJcXG4nKVxuICAgICAgdmFyIGl0ZXJhdG9yMiA9IGNsaWVudC5faXRlcmF0ZUluY29taW5nQnVmZmVyKClcbiAgICAgIGV4cGVjdChTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGl0ZXJhdG9yMi5uZXh0KCkudmFsdWUpKS50by5lcXVhbCgnKiAxIEZFVENIIChVSUQgMSknKVxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IyLm5leHQoKS52YWx1ZSkpLnRvLmVxdWFsKCcqIDIgRkVUQ0ggKFVJRCAyKScpXG4gICAgICBleHBlY3QoaXRlcmF0b3IyLm5leHQoKS52YWx1ZSkudG8uYmUudW5kZWZpbmVkXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcHJvY2VzcyBsaXRlcmFsIHdoZW4gbGl0ZXJhbCBjb3VudCBhcnJpdmVzIGluIDIgcGFydHMnLCAoKSA9PiB7XG4gICAgICBhcHBlbmRJbmNvbWluZ0J1ZmZlcignKiAxIEZFVENIIChVSUQgeycpXG4gICAgICB2YXIgaXRlcmF0b3IxID0gY2xpZW50Ll9pdGVyYXRlSW5jb21pbmdCdWZmZXIoKVxuICAgICAgZXhwZWN0KGl0ZXJhdG9yMS5uZXh0KCkudmFsdWUpLnRvLmJlLnVuZGVmaW5lZFxuXG4gICAgICBhcHBlbmRJbmNvbWluZ0J1ZmZlcignMn1cXHJcXG4xMilcXHJcXG4nKVxuICAgICAgdmFyIGl0ZXJhdG9yMiA9IGNsaWVudC5faXRlcmF0ZUluY29taW5nQnVmZmVyKClcbiAgICAgIGV4cGVjdChTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGl0ZXJhdG9yMi5uZXh0KCkudmFsdWUpKS50by5lcXVhbCgnKiAxIEZFVENIIChVSUQgezJ9XFxyXFxuMTIpJylcbiAgICAgIGV4cGVjdChpdGVyYXRvcjIubmV4dCgpLnZhbHVlKS50by5iZS51bmRlZmluZWRcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBwcm9jZXNzIGxpdGVyYWwgd2hlbiBsaXRlcmFsIGNvdW50IGFycml2ZXMgaW4gMiBwYXJ0cyAyJywgKCkgPT4ge1xuICAgICAgYXBwZW5kSW5jb21pbmdCdWZmZXIoJyogMSBGRVRDSCAoVUlEIHsxJylcbiAgICAgIHZhciBpdGVyYXRvcjEgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG4gICAgICBleHBlY3QoaXRlcmF0b3IxLm5leHQoKS52YWx1ZSkudG8uYmUudW5kZWZpbmVkXG5cbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcwfVxcclxcbjAxMjM0NTY3ODkpXFxyXFxuJylcbiAgICAgIHZhciBpdGVyYXRvcjIgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG4gICAgICBleHBlY3QoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBpdGVyYXRvcjIubmV4dCgpLnZhbHVlKSkudG8uZXF1YWwoJyogMSBGRVRDSCAoVUlEIHsxMH1cXHJcXG4wMTIzNDU2Nzg5KScpXG4gICAgICBleHBlY3QoaXRlcmF0b3IyLm5leHQoKS52YWx1ZSkudG8uYmUudW5kZWZpbmVkXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcHJvY2VzcyBsaXRlcmFsIHdoZW4gbGl0ZXJhbCBjb3VudCBhcnJpdmVzIGluIDIgcGFydHMgMycsICgpID0+IHtcbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcqIDEgRkVUQ0ggKFVJRCB7JylcbiAgICAgIHZhciBpdGVyYXRvcjEgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG4gICAgICBleHBlY3QoaXRlcmF0b3IxLm5leHQoKS52YWx1ZSkudG8uYmUudW5kZWZpbmVkXG5cbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcxMH1cXHJcXG4xMjM0NTY3ODkwKVxcclxcbicpXG4gICAgICB2YXIgaXRlcmF0b3IyID0gY2xpZW50Ll9pdGVyYXRlSW5jb21pbmdCdWZmZXIoKVxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IyLm5leHQoKS52YWx1ZSkpLnRvLmVxdWFsKCcqIDEgRkVUQ0ggKFVJRCB7MTB9XFxyXFxuMTIzNDU2Nzg5MCknKVxuICAgICAgZXhwZWN0KGl0ZXJhdG9yMi5uZXh0KCkudmFsdWUpLnRvLmJlLnVuZGVmaW5lZFxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHByb2Nlc3MgbGl0ZXJhbCB3aGVuIGxpdGVyYWwgY291bnQgYXJyaXZlcyBpbiAyIHBhcnRzIDQnLCAoKSA9PiB7XG4gICAgICBhcHBlbmRJbmNvbWluZ0J1ZmZlcignKiAxIEZFVENIIChVSUQgMSBCT0RZW0hFQURFUi5GSUVMRFMgKFJFRkVSRU5DRVMgTElTVC1JRCldIHsyfVxccicpXG4gICAgICB2YXIgaXRlcmF0b3IxID0gY2xpZW50Ll9pdGVyYXRlSW5jb21pbmdCdWZmZXIoKVxuICAgICAgZXhwZWN0KGl0ZXJhdG9yMS5uZXh0KCkudmFsdWUpLnRvLmJlLnVuZGVmaW5lZFxuICAgICAgYXBwZW5kSW5jb21pbmdCdWZmZXIoJ1xcblhYKVxcclxcbicpXG4gICAgICB2YXIgaXRlcmF0b3IyID0gY2xpZW50Ll9pdGVyYXRlSW5jb21pbmdCdWZmZXIoKVxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IyLm5leHQoKS52YWx1ZSkpLnRvLmVxdWFsKCcqIDEgRkVUQ0ggKFVJRCAxIEJPRFlbSEVBREVSLkZJRUxEUyAoUkVGRVJFTkNFUyBMSVNULUlEKV0gezJ9XFxyXFxuWFgpJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBwcm9jZXNzIGxpdGVyYWwgd2hlbiBsaXRlcmFsIGNvdW50IGFycml2ZXMgaW4gMyBwYXJ0cycsICgpID0+IHtcbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcqIDEgRkVUQ0ggKFVJRCB7JylcbiAgICAgIHZhciBpdGVyYXRvcjEgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG4gICAgICBleHBlY3QoaXRlcmF0b3IxLm5leHQoKS52YWx1ZSkudG8uYmUudW5kZWZpbmVkXG5cbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCcxJylcbiAgICAgIHZhciBpdGVyYXRvcjIgPSBjbGllbnQuX2l0ZXJhdGVJbmNvbWluZ0J1ZmZlcigpXG4gICAgICBleHBlY3QoaXRlcmF0b3IyLm5leHQoKS52YWx1ZSkudG8uYmUudW5kZWZpbmVkXG5cbiAgICAgIGFwcGVuZEluY29taW5nQnVmZmVyKCd9XFxyXFxuMSlcXHJcXG4nKVxuICAgICAgdmFyIGl0ZXJhdG9yMyA9IGNsaWVudC5faXRlcmF0ZUluY29taW5nQnVmZmVyKClcbiAgICAgIGV4cGVjdChTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGl0ZXJhdG9yMy5uZXh0KCkudmFsdWUpKS50by5lcXVhbCgnKiAxIEZFVENIIChVSUQgezF9XFxyXFxuMSknKVxuICAgICAgZXhwZWN0KGl0ZXJhdG9yMy5uZXh0KCkudmFsdWUpLnRvLmJlLnVuZGVmaW5lZFxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHByb2Nlc3MgU0VBUkNIIHJlc3BvbnNlIHdoZW4gaXQgYXJyaXZlcyBpbiAyIHBhcnRzJywgKCkgPT4ge1xuICAgICAgYXBwZW5kSW5jb21pbmdCdWZmZXIoJyogU0VBUkNIIDEgMicpXG4gICAgICB2YXIgaXRlcmF0b3IxID0gY2xpZW50Ll9pdGVyYXRlSW5jb21pbmdCdWZmZXIoKVxuICAgICAgZXhwZWN0KGl0ZXJhdG9yMS5uZXh0KCkudmFsdWUpLnRvLmJlLnVuZGVmaW5lZFxuXG4gICAgICBhcHBlbmRJbmNvbWluZ0J1ZmZlcignIDMgNFxcclxcbicpXG4gICAgICB2YXIgaXRlcmF0b3IyID0gY2xpZW50Ll9pdGVyYXRlSW5jb21pbmdCdWZmZXIoKVxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IyLm5leHQoKS52YWx1ZSkpLnRvLmVxdWFsKCcqIFNFQVJDSCAxIDIgMyA0JylcbiAgICAgIGV4cGVjdChpdGVyYXRvcjIubmV4dCgpLnZhbHVlKS50by5iZS51bmRlZmluZWRcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBub3QgcHJvY2VzcyB7fSBpbiBzdHJpbmcgYXMgbGl0ZXJhbCAxJywgKCkgPT4ge1xuICAgICAgYXBwZW5kSW5jb21pbmdCdWZmZXIoJyogMSBGRVRDSCAoVUlEIDEgRU5WRUxPUEUgKFwic3RyaW5nIHdpdGgge3BhcmVudGhlc2lzfVwiKSlcXHJcXG4nKVxuICAgICAgdmFyIGl0ZXJhdG9yID0gY2xpZW50Ll9pdGVyYXRlSW5jb21pbmdCdWZmZXIoKVxuICAgICAgZXhwZWN0KFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgaXRlcmF0b3IubmV4dCgpLnZhbHVlKSkudG8uZXF1YWwoJyogMSBGRVRDSCAoVUlEIDEgRU5WRUxPUEUgKFwic3RyaW5nIHdpdGgge3BhcmVudGhlc2lzfVwiKSknKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIG5vdCBwcm9jZXNzIHt9IGluIHN0cmluZyBhcyBsaXRlcmFsIDInLCAoKSA9PiB7XG4gICAgICBhcHBlbmRJbmNvbWluZ0J1ZmZlcignKiAxIEZFVENIIChVSUQgMSBFTlZFTE9QRSAoXCJzdHJpbmcgd2l0aCBudW1iZXIgaW4gcGFyZW50aGVzaXMgezEyM31cIikpXFxyXFxuJylcbiAgICAgIHZhciBpdGVyYXRvciA9IGNsaWVudC5faXRlcmF0ZUluY29taW5nQnVmZmVyKClcbiAgICAgIGV4cGVjdChTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGl0ZXJhdG9yLm5leHQoKS52YWx1ZSkpLnRvLmVxdWFsKCcqIDEgRkVUQ0ggKFVJRCAxIEVOVkVMT1BFIChcInN0cmluZyB3aXRoIG51bWJlciBpbiBwYXJlbnRoZXNpcyB7MTIzfVwiKSknKVxuICAgIH0pXG5cbiAgICBmdW5jdGlvbiBhcHBlbmRJbmNvbWluZ0J1ZmZlciAoY29udGVudCkge1xuICAgICAgY2xpZW50Ll9pbmNvbWluZ0J1ZmZlcnMucHVzaCh0b1R5cGVkQXJyYXkoY29udGVudCkpXG4gICAgfVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjX3BhcnNlSW5jb21pbmdDb21tYW5kcycsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHByb2Nlc3MgYSB0YWdnZWQgaXRlbSBmcm9tIHRoZSBxdWV1ZScsICgpID0+IHtcbiAgICAgIGNsaWVudC5vbnJlYWR5ID0gc2lub24uc3R1YigpXG4gICAgICBzaW5vbi5zdHViKGNsaWVudCwgJ19oYW5kbGVSZXNwb25zZScpXG5cbiAgICAgIGZ1bmN0aW9uICogZ2VuICgpIHsgeWllbGQgdG9UeXBlZEFycmF5KCdPSyBIZWxsbyB3b3JsZCEnKSB9XG5cbiAgICAgIGNsaWVudC5fcGFyc2VJbmNvbWluZ0NvbW1hbmRzKGdlbigpKVxuXG4gICAgICBleHBlY3QoY2xpZW50Lm9ucmVhZHkuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgZXhwZWN0KGNsaWVudC5faGFuZGxlUmVzcG9uc2Uud2l0aEFyZ3Moe1xuICAgICAgICB0YWc6ICdPSycsXG4gICAgICAgIGNvbW1hbmQ6ICdIZWxsbycsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFt7XG4gICAgICAgICAgdHlwZTogJ0FUT00nLFxuICAgICAgICAgIHZhbHVlOiAnd29ybGQhJ1xuICAgICAgICB9XVxuICAgICAgfSkuY2FsbGVkT25jZSkudG8uYmUudHJ1ZVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHByb2Nlc3MgYW4gdW50YWdnZWQgaXRlbSBmcm9tIHRoZSBxdWV1ZScsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50LCAnX2hhbmRsZVJlc3BvbnNlJylcblxuICAgICAgZnVuY3Rpb24gKiBnZW4gKCkgeyB5aWVsZCB0b1R5cGVkQXJyYXkoJyogMSBFWElTVFMnKSB9XG5cbiAgICAgIGNsaWVudC5fcGFyc2VJbmNvbWluZ0NvbW1hbmRzKGdlbigpKVxuXG4gICAgICBleHBlY3QoY2xpZW50Ll9oYW5kbGVSZXNwb25zZS53aXRoQXJncyh7XG4gICAgICAgIHRhZzogJyonLFxuICAgICAgICBjb21tYW5kOiAnRVhJU1RTJyxcbiAgICAgICAgYXR0cmlidXRlczogW10sXG4gICAgICAgIG5yOiAxXG4gICAgICB9KS5jYWxsZWRPbmNlKS50by5iZS50cnVlXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcHJvY2VzcyBhIHBsdXMgdGFnZ2VkIGl0ZW0gZnJvbSB0aGUgcXVldWUnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGNsaWVudCwgJ3NlbmQnKVxuXG4gICAgICBmdW5jdGlvbiAqIGdlbiAoKSB7IHlpZWxkIHRvVHlwZWRBcnJheSgnKyBQbGVhc2UgY29udGludWUnKSB9XG4gICAgICBjbGllbnQuX2N1cnJlbnRDb21tYW5kID0ge1xuICAgICAgICBkYXRhOiBbJ2xpdGVyYWwgZGF0YSddXG4gICAgICB9XG5cbiAgICAgIGNsaWVudC5fcGFyc2VJbmNvbWluZ0NvbW1hbmRzKGdlbigpKVxuXG4gICAgICBleHBlY3QoY2xpZW50LnNlbmQud2l0aEFyZ3MoJ2xpdGVyYWwgZGF0YVxcclxcbicpLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCBwcm9jZXNzIGFuIFhPQVVUSDIgZXJyb3IgY2hhbGxlbmdlJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihjbGllbnQsICdzZW5kJylcblxuICAgICAgZnVuY3Rpb24gKiBnZW4gKCkgeyB5aWVsZCB0b1R5cGVkQXJyYXkoJysgRk9PQkFSJykgfVxuICAgICAgY2xpZW50Ll9jdXJyZW50Q29tbWFuZCA9IHtcbiAgICAgICAgZGF0YTogW10sXG4gICAgICAgIGVycm9yUmVzcG9uc2VFeHBlY3RzRW1wdHlMaW5lOiB0cnVlXG4gICAgICB9XG5cbiAgICAgIGNsaWVudC5fcGFyc2VJbmNvbWluZ0NvbW1hbmRzKGdlbigpKVxuXG4gICAgICBleHBlY3QoY2xpZW50LnNlbmQud2l0aEFyZ3MoJ1xcclxcbicpLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjX2hhbmRsZVJlc3BvbnNlJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgaW52b2tlIGdsb2JhbCBoYW5kbGVyIGJ5IGRlZmF1bHQnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGNsaWVudCwgJ19wcm9jZXNzUmVzcG9uc2UnKVxuICAgICAgc2lub24uc3R1YihjbGllbnQsICdfc2VuZFJlcXVlc3QnKVxuXG4gICAgICBjbGllbnQuX2dsb2JhbEFjY2VwdFVudGFnZ2VkLlRFU1QgPSAoKSA9PiB7IH1cbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50Ll9nbG9iYWxBY2NlcHRVbnRhZ2dlZCwgJ1RFU1QnKVxuXG4gICAgICBjbGllbnQuX2N1cnJlbnRDb21tYW5kID0gZmFsc2VcbiAgICAgIGNsaWVudC5faGFuZGxlUmVzcG9uc2Uoe1xuICAgICAgICB0YWc6ICcqJyxcbiAgICAgICAgY29tbWFuZDogJ3Rlc3QnXG4gICAgICB9KVxuXG4gICAgICBleHBlY3QoY2xpZW50Ll9zZW5kUmVxdWVzdC5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICBleHBlY3QoY2xpZW50Ll9nbG9iYWxBY2NlcHRVbnRhZ2dlZC5URVNULndpdGhBcmdzKHtcbiAgICAgICAgdGFnOiAnKicsXG4gICAgICAgIGNvbW1hbmQ6ICd0ZXN0J1xuICAgICAgfSkuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGludm9rZSBnbG9iYWwgaGFuZGxlciBpZiBuZWVkZWQnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGNsaWVudCwgJ19wcm9jZXNzUmVzcG9uc2UnKVxuICAgICAgY2xpZW50Ll9nbG9iYWxBY2NlcHRVbnRhZ2dlZC5URVNUID0gKCkgPT4geyB9XG4gICAgICBzaW5vbi5zdHViKGNsaWVudC5fZ2xvYmFsQWNjZXB0VW50YWdnZWQsICdURVNUJylcbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50LCAnX3NlbmRSZXF1ZXN0JylcblxuICAgICAgY2xpZW50Ll9jdXJyZW50Q29tbWFuZCA9IHtcbiAgICAgICAgcGF5bG9hZDoge31cbiAgICAgIH1cbiAgICAgIGNsaWVudC5faGFuZGxlUmVzcG9uc2Uoe1xuICAgICAgICB0YWc6ICcqJyxcbiAgICAgICAgY29tbWFuZDogJ3Rlc3QnXG4gICAgICB9KVxuXG4gICAgICBleHBlY3QoY2xpZW50Ll9zZW5kUmVxdWVzdC5jYWxsQ291bnQpLnRvLmVxdWFsKDApXG4gICAgICBleHBlY3QoY2xpZW50Ll9nbG9iYWxBY2NlcHRVbnRhZ2dlZC5URVNULndpdGhBcmdzKHtcbiAgICAgICAgdGFnOiAnKicsXG4gICAgICAgIGNvbW1hbmQ6ICd0ZXN0J1xuICAgICAgfSkuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHB1c2ggdG8gcGF5bG9hZCcsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50LCAnX3Byb2Nlc3NSZXNwb25zZScpXG4gICAgICBjbGllbnQuX2dsb2JhbEFjY2VwdFVudGFnZ2VkLlRFU1QgPSAoKSA9PiB7IH1cbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50Ll9nbG9iYWxBY2NlcHRVbnRhZ2dlZCwgJ1RFU1QnKVxuXG4gICAgICBjbGllbnQuX2N1cnJlbnRDb21tYW5kID0ge1xuICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgVEVTVDogW11cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY2xpZW50Ll9oYW5kbGVSZXNwb25zZSh7XG4gICAgICAgIHRhZzogJyonLFxuICAgICAgICBjb21tYW5kOiAndGVzdCdcbiAgICAgIH0pXG5cbiAgICAgIGV4cGVjdChjbGllbnQuX2dsb2JhbEFjY2VwdFVudGFnZ2VkLlRFU1QuY2FsbENvdW50KS50by5lcXVhbCgwKVxuICAgICAgZXhwZWN0KGNsaWVudC5fY3VycmVudENvbW1hbmQucGF5bG9hZC5URVNUKS50by5kZWVwLmVxdWFsKFt7XG4gICAgICAgIHRhZzogJyonLFxuICAgICAgICBjb21tYW5kOiAndGVzdCdcbiAgICAgIH1dKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGludm9rZSBjb21tYW5kIGNhbGxiYWNrJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihjbGllbnQsICdfcHJvY2Vzc1Jlc3BvbnNlJylcbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50LCAnX3NlbmRSZXF1ZXN0JylcbiAgICAgIGNsaWVudC5fZ2xvYmFsQWNjZXB0VW50YWdnZWQuVEVTVCA9ICgpID0+IHsgfVxuICAgICAgc2lub24uc3R1YihjbGllbnQuX2dsb2JhbEFjY2VwdFVudGFnZ2VkLCAnVEVTVCcpXG5cbiAgICAgIGNsaWVudC5fY3VycmVudENvbW1hbmQgPSB7XG4gICAgICAgIHRhZzogJ0EnLFxuICAgICAgICBjYWxsYmFjazogKHJlc3BvbnNlKSA9PiB7XG4gICAgICAgICAgZXhwZWN0KHJlc3BvbnNlKS50by5kZWVwLmVxdWFsKHtcbiAgICAgICAgICAgIHRhZzogJ0EnLFxuICAgICAgICAgICAgY29tbWFuZDogJ3Rlc3QnLFxuICAgICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgICBURVNUOiAnYWJjJ1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pXG4gICAgICAgIH0sXG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICBURVNUOiAnYWJjJ1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjbGllbnQuX2hhbmRsZVJlc3BvbnNlKHtcbiAgICAgICAgdGFnOiAnQScsXG4gICAgICAgIGNvbW1hbmQ6ICd0ZXN0J1xuICAgICAgfSlcblxuICAgICAgZXhwZWN0KGNsaWVudC5fc2VuZFJlcXVlc3QuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgICAgZXhwZWN0KGNsaWVudC5fZ2xvYmFsQWNjZXB0VW50YWdnZWQuVEVTVC5jYWxsQ291bnQpLnRvLmVxdWFsKDApXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2VucXVldWVDb21tYW5kJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgcmVqZWN0IG9uIE5PL0JBRCcsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50LCAnX3NlbmRSZXF1ZXN0JykuY2FsbHNGYWtlKCgpID0+IHtcbiAgICAgICAgY2xpZW50Ll9jbGllbnRRdWV1ZVswXS5jYWxsYmFjayh7IGNvbW1hbmQ6ICdOTycgfSlcbiAgICAgIH0pXG5cbiAgICAgIGNsaWVudC5fdGFnQ291bnRlciA9IDEwMFxuICAgICAgY2xpZW50Ll9jbGllbnRRdWV1ZSA9IFtdXG4gICAgICBjbGllbnQuX2NhblNlbmQgPSB0cnVlXG5cbiAgICAgIHJldHVybiBjbGllbnQuZW5xdWV1ZUNvbW1hbmQoe1xuICAgICAgICBjb21tYW5kOiAnYWJjJ1xuICAgICAgfSwgWydkZWYnXSwge1xuICAgICAgICB0OiAxXG4gICAgICB9KS5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgIGV4cGVjdChlcnIpLnRvLmV4aXN0XG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIGludm9rZSBzZW5kaW5nJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihjbGllbnQsICdfc2VuZFJlcXVlc3QnKS5jYWxsc0Zha2UoKCkgPT4ge1xuICAgICAgICBjbGllbnQuX2NsaWVudFF1ZXVlWzBdLmNhbGxiYWNrKHt9KVxuICAgICAgfSlcblxuICAgICAgY2xpZW50Ll90YWdDb3VudGVyID0gMTAwXG4gICAgICBjbGllbnQuX2NsaWVudFF1ZXVlID0gW11cbiAgICAgIGNsaWVudC5fY2FuU2VuZCA9IHRydWVcblxuICAgICAgcmV0dXJuIGNsaWVudC5lbnF1ZXVlQ29tbWFuZCh7XG4gICAgICAgIGNvbW1hbmQ6ICdhYmMnXG4gICAgICB9LCBbJ2RlZiddLCB7XG4gICAgICAgIHQ6IDFcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoY2xpZW50Ll9zZW5kUmVxdWVzdC5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICAgIGV4cGVjdChjbGllbnQuX2NsaWVudFF1ZXVlLmxlbmd0aCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGNsaWVudC5fY2xpZW50UXVldWVbMF0udGFnKS50by5lcXVhbCgnVzEwMScpXG4gICAgICAgIGV4cGVjdChjbGllbnQuX2NsaWVudFF1ZXVlWzBdLnJlcXVlc3QpLnRvLmRlZXAuZXF1YWwoe1xuICAgICAgICAgIGNvbW1hbmQ6ICdhYmMnLFxuICAgICAgICAgIHRhZzogJ1cxMDEnXG4gICAgICAgIH0pXG4gICAgICAgIGV4cGVjdChjbGllbnQuX2NsaWVudFF1ZXVlWzBdLnQpLnRvLmVxdWFsKDEpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIG9ubHkgcXVldWUnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGNsaWVudCwgJ19zZW5kUmVxdWVzdCcpXG5cbiAgICAgIGNsaWVudC5fdGFnQ291bnRlciA9IDEwMFxuICAgICAgY2xpZW50Ll9jbGllbnRRdWV1ZSA9IFtdXG4gICAgICBjbGllbnQuX2NhblNlbmQgPSBmYWxzZVxuXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHsgY2xpZW50Ll9jbGllbnRRdWV1ZVswXS5jYWxsYmFjayh7fSkgfSwgMClcblxuICAgICAgcmV0dXJuIGNsaWVudC5lbnF1ZXVlQ29tbWFuZCh7XG4gICAgICAgIGNvbW1hbmQ6ICdhYmMnXG4gICAgICB9LCBbJ2RlZiddLCB7XG4gICAgICAgIHQ6IDFcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoY2xpZW50Ll9zZW5kUmVxdWVzdC5jYWxsQ291bnQpLnRvLmVxdWFsKDApXG4gICAgICAgIGV4cGVjdChjbGllbnQuX2NsaWVudFF1ZXVlLmxlbmd0aCkudG8uZXF1YWwoMSlcbiAgICAgICAgZXhwZWN0KGNsaWVudC5fY2xpZW50UXVldWVbMF0udGFnKS50by5lcXVhbCgnVzEwMScpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHN0b3JlIHZhbHVlQXNTdHJpbmcgb3B0aW9uIGluIHRoZSBjb21tYW5kJywgKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihjbGllbnQsICdfc2VuZFJlcXVlc3QnKVxuXG4gICAgICBjbGllbnQuX3RhZ0NvdW50ZXIgPSAxMDBcbiAgICAgIGNsaWVudC5fY2xpZW50UXVldWUgPSBbXVxuICAgICAgY2xpZW50Ll9jYW5TZW5kID0gZmFsc2VcblxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7IGNsaWVudC5fY2xpZW50UXVldWVbMF0uY2FsbGJhY2soe30pIH0sIDApXG4gICAgICByZXR1cm4gY2xpZW50LmVucXVldWVDb21tYW5kKHtcbiAgICAgICAgY29tbWFuZDogJ2FiYycsXG4gICAgICAgIHZhbHVlQXNTdHJpbmc6IGZhbHNlXG4gICAgICB9LCBbJ2RlZiddLCB7XG4gICAgICAgIHQ6IDFcbiAgICAgIH0pLnRoZW4oKCkgPT4ge1xuICAgICAgICBleHBlY3QoY2xpZW50Ll9jbGllbnRRdWV1ZVswXS5yZXF1ZXN0LnZhbHVlQXNTdHJpbmcpLnRvLmVxdWFsKGZhbHNlKVxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKCcjX3NlbmRSZXF1ZXN0JywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZW50ZXIgaWRsZSBpZiBub3RoaW5nIGlzIHRvIHByb2Nlc3MnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGNsaWVudCwgJ19lbnRlcklkbGUnKVxuXG4gICAgICBjbGllbnQuX2NsaWVudFF1ZXVlID0gW11cbiAgICAgIGNsaWVudC5fc2VuZFJlcXVlc3QoKVxuXG4gICAgICBleHBlY3QoY2xpZW50Ll9lbnRlcklkbGUuY2FsbENvdW50KS50by5lcXVhbCgxKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHNlbmQgZGF0YScsICgpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50LCAnX2NsZWFySWRsZScpXG4gICAgICBzaW5vbi5zdHViKGNsaWVudCwgJ3NlbmQnKVxuXG4gICAgICBjbGllbnQuX2NsaWVudFF1ZXVlID0gW3tcbiAgICAgICAgcmVxdWVzdDoge1xuICAgICAgICAgIHRhZzogJ1cxMDEnLFxuICAgICAgICAgIGNvbW1hbmQ6ICdURVNUJ1xuICAgICAgICB9XG4gICAgICB9XVxuICAgICAgY2xpZW50Ll9zZW5kUmVxdWVzdCgpXG5cbiAgICAgIGV4cGVjdChjbGllbnQuX2NsZWFySWRsZS5jYWxsQ291bnQpLnRvLmVxdWFsKDEpXG4gICAgICBleHBlY3QoY2xpZW50LnNlbmQuYXJnc1swXVswXSkudG8uZXF1YWwoJ1cxMDEgVEVTVFxcclxcbicpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgc2VuZCBwYXJ0aWFsIGRhdGEnLCAoKSA9PiB7XG4gICAgICBzaW5vbi5zdHViKGNsaWVudCwgJ19jbGVhcklkbGUnKVxuICAgICAgc2lub24uc3R1YihjbGllbnQsICdzZW5kJylcblxuICAgICAgY2xpZW50Ll9jbGllbnRRdWV1ZSA9IFt7XG4gICAgICAgIHJlcXVlc3Q6IHtcbiAgICAgICAgICB0YWc6ICdXMTAxJyxcbiAgICAgICAgICBjb21tYW5kOiAnVEVTVCcsXG4gICAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICAgIHR5cGU6ICdMSVRFUkFMJyxcbiAgICAgICAgICAgIHZhbHVlOiAnYWJjJ1xuICAgICAgICAgIH1dXG4gICAgICAgIH1cbiAgICAgIH1dXG4gICAgICBjbGllbnQuX3NlbmRSZXF1ZXN0KClcblxuICAgICAgZXhwZWN0KGNsaWVudC5fY2xlYXJJZGxlLmNhbGxDb3VudCkudG8uZXF1YWwoMSlcbiAgICAgIGV4cGVjdChjbGllbnQuc2VuZC5hcmdzWzBdWzBdKS50by5lcXVhbCgnVzEwMSBURVNUIHszfVxcclxcbicpXG4gICAgICBleHBlY3QoY2xpZW50Ll9jdXJyZW50Q29tbWFuZC5kYXRhKS50by5kZWVwLmVxdWFsKFsnYWJjJ10pXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcnVuIHByZWNoZWNrJywgKGRvbmUpID0+IHtcbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50LCAnX2NsZWFySWRsZScpXG5cbiAgICAgIGNsaWVudC5fY2FuU2VuZCA9IHRydWVcbiAgICAgIGNsaWVudC5fY2xpZW50UXVldWUgPSBbe1xuICAgICAgICByZXF1ZXN0OiB7XG4gICAgICAgICAgdGFnOiAnVzEwMScsXG4gICAgICAgICAgY29tbWFuZDogJ1RFU1QnLFxuICAgICAgICAgIGF0dHJpYnV0ZXM6IFt7XG4gICAgICAgICAgICB0eXBlOiAnTElURVJBTCcsXG4gICAgICAgICAgICB2YWx1ZTogJ2FiYydcbiAgICAgICAgICB9XVxuICAgICAgICB9LFxuICAgICAgICBwcmVjaGVjazogKGN0eCkgPT4ge1xuICAgICAgICAgIGV4cGVjdChjdHgpLnRvLmV4aXN0XG4gICAgICAgICAgZXhwZWN0KGNsaWVudC5fY2FuU2VuZCkudG8uYmUudHJ1ZVxuICAgICAgICAgIGNsaWVudC5fc2VuZFJlcXVlc3QgPSAoKSA9PiB7XG4gICAgICAgICAgICBleHBlY3QoY2xpZW50Ll9jbGllbnRRdWV1ZS5sZW5ndGgpLnRvLmVxdWFsKDIpXG4gICAgICAgICAgICBleHBlY3QoY2xpZW50Ll9jbGllbnRRdWV1ZVswXS50YWcpLnRvLmluY2x1ZGUoJy5wJylcbiAgICAgICAgICAgIGV4cGVjdChjbGllbnQuX2NsaWVudFF1ZXVlWzBdLnJlcXVlc3QudGFnKS50by5pbmNsdWRlKCcucCcpXG4gICAgICAgICAgICBjbGllbnQuX2NsZWFySWRsZS5yZXN0b3JlKClcbiAgICAgICAgICAgIGRvbmUoKVxuICAgICAgICAgIH1cbiAgICAgICAgICBjbGllbnQuZW5xdWV1ZUNvbW1hbmQoe30sIHVuZGVmaW5lZCwge1xuICAgICAgICAgICAgY3R4OiBjdHhcbiAgICAgICAgICB9KVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICB9XG4gICAgICB9XVxuICAgICAgY2xpZW50Ll9zZW5kUmVxdWVzdCgpXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI19lbnRlcklkbGUnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBzZXQgaWRsZSB0aW1lcicsIChkb25lKSA9PiB7XG4gICAgICBjbGllbnQub25pZGxlID0gKCkgPT4ge1xuICAgICAgICBkb25lKClcbiAgICAgIH1cbiAgICAgIGNsaWVudC50aW1lb3V0RW50ZXJJZGxlID0gMVxuXG4gICAgICBjbGllbnQuX2VudGVySWRsZSgpXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI19wcm9jZXNzUmVzcG9uc2UnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBzZXQgaHVtYW5SZWFkYWJsZScsICgpID0+IHtcbiAgICAgIHZhciByZXNwb25zZSA9IHtcbiAgICAgICAgdGFnOiAnKicsXG4gICAgICAgIGNvbW1hbmQ6ICdPSycsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFt7XG4gICAgICAgICAgdHlwZTogJ1RFWFQnLFxuICAgICAgICAgIHZhbHVlOiAnU29tZSByYW5kb20gdGV4dCdcbiAgICAgICAgfV1cbiAgICAgIH1cbiAgICAgIGNsaWVudC5fcHJvY2Vzc1Jlc3BvbnNlKHJlc3BvbnNlKVxuXG4gICAgICBleHBlY3QocmVzcG9uc2UuaHVtYW5SZWFkYWJsZSkudG8uZXF1YWwoJ1NvbWUgcmFuZG9tIHRleHQnKVxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHNldCByZXNwb25zZSBjb2RlJywgKCkgPT4ge1xuICAgICAgdmFyIHJlc3BvbnNlID0ge1xuICAgICAgICB0YWc6ICcqJyxcbiAgICAgICAgY29tbWFuZDogJ09LJyxcbiAgICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgICB0eXBlOiAnQVRPTScsXG4gICAgICAgICAgc2VjdGlvbjogW3tcbiAgICAgICAgICAgIHR5cGU6ICdBVE9NJyxcbiAgICAgICAgICAgIHZhbHVlOiAnQ0FQQUJJTElUWSdcbiAgICAgICAgICB9LCB7XG4gICAgICAgICAgICB0eXBlOiAnQVRPTScsXG4gICAgICAgICAgICB2YWx1ZTogJ0lNQVA0UkVWMSdcbiAgICAgICAgICB9LCB7XG4gICAgICAgICAgICB0eXBlOiAnQVRPTScsXG4gICAgICAgICAgICB2YWx1ZTogJ1VJRFBMVVMnXG4gICAgICAgICAgfV1cbiAgICAgICAgfSwge1xuICAgICAgICAgIHR5cGU6ICdURVhUJyxcbiAgICAgICAgICB2YWx1ZTogJ1NvbWUgcmFuZG9tIHRleHQnXG4gICAgICAgIH1dXG4gICAgICB9XG4gICAgICBjbGllbnQuX3Byb2Nlc3NSZXNwb25zZShyZXNwb25zZSlcbiAgICAgIGV4cGVjdChyZXNwb25zZS5jb2RlKS50by5lcXVhbCgnQ0FQQUJJTElUWScpXG4gICAgICBleHBlY3QocmVzcG9uc2UuY2FwYWJpbGl0eSkudG8uZGVlcC5lcXVhbChbJ0lNQVA0UkVWMScsICdVSURQTFVTJ10pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2lzRXJyb3InLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBkZXRlY3QgaWYgYW4gb2JqZWN0IGlzIGFuIGVycm9yJywgKCkgPT4ge1xuICAgICAgZXhwZWN0KGNsaWVudC5pc0Vycm9yKG5ldyBSYW5nZUVycm9yKCdhYmMnKSkpLnRvLmJlLnRydWVcbiAgICAgIGV4cGVjdChjbGllbnQuaXNFcnJvcignYWJjJykpLnRvLmJlLmZhbHNlXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZSgnI2VuYWJsZUNvbXByZXNzaW9uJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgY3JlYXRlIGluZmxhdGVyIGFuZCBkZWZsYXRlciBzdHJlYW1zJywgKCkgPT4ge1xuICAgICAgY2xpZW50LnNvY2tldC5vbmRhdGEgPSAoKSA9PiB7IH1cbiAgICAgIHNpbm9uLnN0dWIoY2xpZW50LnNvY2tldCwgJ29uZGF0YScpXG5cbiAgICAgIGV4cGVjdChjbGllbnQuY29tcHJlc3NlZCkudG8uYmUuZmFsc2VcbiAgICAgIGNsaWVudC5lbmFibGVDb21wcmVzc2lvbigpXG4gICAgICBleHBlY3QoY2xpZW50LmNvbXByZXNzZWQpLnRvLmJlLnRydWVcblxuICAgICAgY29uc3QgcGF5bG9hZCA9ICdhc2Rhc2QnXG4gICAgICBjb25zdCBleHBlY3RlZCA9IHBheWxvYWQuc3BsaXQoJycpLm1hcChjaGFyID0+IGNoYXIuY2hhckNvZGVBdCgwKSlcblxuICAgICAgY2xpZW50LnNlbmQocGF5bG9hZClcbiAgICAgIGNvbnN0IGFjdHVhbE91dCA9IHNvY2tldFN0dWIuc2VuZC5hcmdzWzBdWzBdXG4gICAgICBjbGllbnQuc29ja2V0Lm9uZGF0YSh7IGRhdGE6IGFjdHVhbE91dCB9KVxuICAgICAgZXhwZWN0KEJ1ZmZlci5mcm9tKGNsaWVudC5fc29ja2V0T25EYXRhLmFyZ3NbMF1bMF0uZGF0YSkpLnRvLmRlZXAuZXF1YWwoQnVmZmVyLmZyb20oZXhwZWN0ZWQpKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoJyNnZXRQcmV2aW91c2x5UXVldWVkJywgKCkgPT4ge1xuICAgIGNvbnN0IGN0eCA9IHt9XG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgd2l0aCBlbXB0eSBxdWV1ZSBhbmQgbm8gY3VycmVudCBjb21tYW5kJywgKCkgPT4ge1xuICAgICAgY2xpZW50Ll9jdXJyZW50Q29tbWFuZCA9IHVuZGVmaW5lZFxuICAgICAgY2xpZW50Ll9jbGllbnRRdWV1ZSA9IFtdXG5cbiAgICAgIGV4cGVjdCh0ZXN0QW5kR2V0QXR0cmlidXRlKCkpLnRvLmJlLnVuZGVmaW5lZFxuICAgIH0pXG5cbiAgICBpdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgd2l0aCBlbXB0eSBxdWV1ZSBhbmQgbm9uLVNFTEVDVCBjdXJyZW50IGNvbW1hbmQnLCAoKSA9PiB7XG4gICAgICBjbGllbnQuX2N1cnJlbnRDb21tYW5kID0gY3JlYXRlQ29tbWFuZCgnVEVTVCcpXG4gICAgICBjbGllbnQuX2NsaWVudFF1ZXVlID0gW11cblxuICAgICAgZXhwZWN0KHRlc3RBbmRHZXRBdHRyaWJ1dGUoKSkudG8uYmUudW5kZWZpbmVkXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIGN1cnJlbnQgY29tbWFuZCB3aXRoIGVtcHR5IHF1ZXVlIGFuZCBTRUxFQ1QgY3VycmVudCBjb21tYW5kJywgKCkgPT4ge1xuICAgICAgY2xpZW50Ll9jdXJyZW50Q29tbWFuZCA9IGNyZWF0ZUNvbW1hbmQoJ1NFTEVDVCcsICdBVFRSJylcbiAgICAgIGNsaWVudC5fY2xpZW50UXVldWUgPSBbXVxuXG4gICAgICBleHBlY3QodGVzdEFuZEdldEF0dHJpYnV0ZSgpKS50by5lcXVhbCgnQVRUUicpXG4gICAgfSlcblxuICAgIGl0KCdzaG91bGQgcmV0dXJuIGN1cnJlbnQgY29tbWFuZCB3aXRoIG5vbi1TRUxFQ1QgY29tbWFuZHMgaW4gcXVldWUgYW5kIFNFTEVDVCBjdXJyZW50IGNvbW1hbmQnLCAoKSA9PiB7XG4gICAgICBjbGllbnQuX2N1cnJlbnRDb21tYW5kID0gY3JlYXRlQ29tbWFuZCgnU0VMRUNUJywgJ0FUVFInKVxuICAgICAgY2xpZW50Ll9jbGllbnRRdWV1ZSA9IFtcbiAgICAgICAgY3JlYXRlQ29tbWFuZCgnVEVTVDAxJyksXG4gICAgICAgIGNyZWF0ZUNvbW1hbmQoJ1RFU1QwMicpXG4gICAgICBdXG5cbiAgICAgIGV4cGVjdCh0ZXN0QW5kR2V0QXR0cmlidXRlKCkpLnRvLmVxdWFsKCdBVFRSJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gbGFzdCBTRUxFQ1QgYmVmb3JlIGN0eCB3aXRoIG11bHRpcGxlIFNFTEVDVCBjb21tYW5kcyBpbiBxdWV1ZSAoMSknLCAoKSA9PiB7XG4gICAgICBjbGllbnQuX2N1cnJlbnRDb21tYW5kID0gY3JlYXRlQ29tbWFuZCgnU0VMRUNUJywgJ0FUVFIwMScpXG4gICAgICBjbGllbnQuX2NsaWVudFF1ZXVlID0gW1xuICAgICAgICBjcmVhdGVDb21tYW5kKCdTRUxFQ1QnLCAnQVRUUicpLFxuICAgICAgICBjcmVhdGVDb21tYW5kKCdURVNUJyksXG4gICAgICAgIGN0eCxcbiAgICAgICAgY3JlYXRlQ29tbWFuZCgnU0VMRUNUJywgJ0FUVFIwMycpXG4gICAgICBdXG5cbiAgICAgIGV4cGVjdCh0ZXN0QW5kR2V0QXR0cmlidXRlKCkpLnRvLmVxdWFsKCdBVFRSJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gbGFzdCBTRUxFQ1QgYmVmb3JlIGN0eCB3aXRoIG11bHRpcGxlIFNFTEVDVCBjb21tYW5kcyBpbiBxdWV1ZSAoMiknLCAoKSA9PiB7XG4gICAgICBjbGllbnQuX2NsaWVudFF1ZXVlID0gW1xuICAgICAgICBjcmVhdGVDb21tYW5kKCdTRUxFQ1QnLCAnQVRUUjAyJyksXG4gICAgICAgIGNyZWF0ZUNvbW1hbmQoJ1NFTEVDVCcsICdBVFRSJyksXG4gICAgICAgIGN0eCxcbiAgICAgICAgY3JlYXRlQ29tbWFuZCgnU0VMRUNUJywgJ0FUVFIwMycpXG4gICAgICBdXG5cbiAgICAgIGV4cGVjdCh0ZXN0QW5kR2V0QXR0cmlidXRlKCkpLnRvLmVxdWFsKCdBVFRSJylcbiAgICB9KVxuXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gbGFzdCBTRUxFQ1QgYmVmb3JlIGN0eCB3aXRoIG11bHRpcGxlIFNFTEVDVCBjb21tYW5kcyBpbiBxdWV1ZSAoMyknLCAoKSA9PiB7XG4gICAgICBjbGllbnQuX2NsaWVudFF1ZXVlID0gW1xuICAgICAgICBjcmVhdGVDb21tYW5kKCdTRUxFQ1QnLCAnQVRUUjAyJyksXG4gICAgICAgIGNyZWF0ZUNvbW1hbmQoJ1NFTEVDVCcsICdBVFRSJyksXG4gICAgICAgIGNyZWF0ZUNvbW1hbmQoJ1RFU1QnKSxcbiAgICAgICAgY3R4LFxuICAgICAgICBjcmVhdGVDb21tYW5kKCdTRUxFQ1QnLCAnQVRUUjAzJylcbiAgICAgIF1cblxuICAgICAgZXhwZWN0KHRlc3RBbmRHZXRBdHRyaWJ1dGUoKSkudG8uZXF1YWwoJ0FUVFInKVxuICAgIH0pXG5cbiAgICBmdW5jdGlvbiB0ZXN0QW5kR2V0QXR0cmlidXRlICgpIHtcbiAgICAgIGNvbnN0IGRhdGEgPSBjbGllbnQuZ2V0UHJldmlvdXNseVF1ZXVlZChbJ1NFTEVDVCddLCBjdHgpXG4gICAgICBpZiAoZGF0YSkge1xuICAgICAgICByZXR1cm4gZGF0YS5yZXF1ZXN0LmF0dHJpYnV0ZXNbMF0udmFsdWVcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjcmVhdGVDb21tYW5kIChjb21tYW5kLCBhdHRyaWJ1dGUpIHtcbiAgICAgIGNvbnN0IGF0dHJpYnV0ZXMgPSBbXVxuICAgICAgY29uc3QgZGF0YSA9IHtcbiAgICAgICAgcmVxdWVzdDogeyBjb21tYW5kLCBhdHRyaWJ1dGVzIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGF0dHJpYnV0ZSkge1xuICAgICAgICBkYXRhLnJlcXVlc3QuYXR0cmlidXRlcy5wdXNoKHtcbiAgICAgICAgICB0eXBlOiAnU1RSSU5HJyxcbiAgICAgICAgICB2YWx1ZTogYXR0cmlidXRlXG4gICAgICAgIH0pXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBkYXRhXG4gICAgfVxuICB9KVxufSlcbiJdLCJtYXBwaW5ncyI6Ijs7QUFFQTtBQUNBO0FBQXVDO0FBSHZDOztBQUtBLE1BQU1BLElBQUksR0FBRyxXQUFXO0FBQ3hCLE1BQU1DLElBQUksR0FBRyxLQUFLO0FBRWxCQyxRQUFRLENBQUMsNEJBQTRCLEVBQUUsTUFBTTtFQUMzQyxJQUFJQyxNQUFNLEVBQUVDLFVBQVU7O0VBRXRCOztFQUVBQyxVQUFVLENBQUMsTUFBTTtJQUNmRixNQUFNLEdBQUcsSUFBSUcsYUFBVSxDQUFDTixJQUFJLEVBQUVDLElBQUksQ0FBQztJQUNuQ00sTUFBTSxDQUFDSixNQUFNLENBQUMsQ0FBQ0ssRUFBRSxDQUFDQyxLQUFLO0lBRXZCTixNQUFNLENBQUNPLE1BQU0sR0FBRztNQUNkQyxLQUFLLEVBQUUsTUFBTSxDQUFFLENBQUM7TUFDaEJDLEtBQUssRUFBRSxNQUFNLENBQUU7SUFDakIsQ0FBQztJQUVELElBQUlDLE1BQU0sR0FBRyxZQUFZLENBQUUsQ0FBQztJQUM1QkEsTUFBTSxDQUFDQyxJQUFJLEdBQUcsTUFBTSxDQUFFLENBQUM7SUFDdkJELE1BQU0sQ0FBQ0UsU0FBUyxDQUFDQyxLQUFLLEdBQUcsTUFBTSxDQUFFLENBQUM7SUFDbENILE1BQU0sQ0FBQ0UsU0FBUyxDQUFDRSxJQUFJLEdBQUcsTUFBTSxDQUFFLENBQUM7SUFDakNKLE1BQU0sQ0FBQ0UsU0FBUyxDQUFDRyxPQUFPLEdBQUcsTUFBTSxDQUFFLENBQUM7SUFDcENMLE1BQU0sQ0FBQ0UsU0FBUyxDQUFDSSxNQUFNLEdBQUcsTUFBTSxDQUFFLENBQUM7SUFDbkNOLE1BQU0sQ0FBQ0UsU0FBUyxDQUFDSyxlQUFlLEdBQUcsTUFBTSxDQUFFLENBQUM7SUFFNUNoQixVQUFVLEdBQUdpQixLQUFLLENBQUNDLGtCQUFrQixDQUFDVCxNQUFNLENBQUM7SUFDN0NRLEtBQUssQ0FBQ0UsSUFBSSxDQUFDVixN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