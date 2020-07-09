"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.DEFAULT_CLIENT_ID = exports.STATE_LOGOUT = exports.STATE_SELECTED = exports.STATE_AUTHENTICATED = exports.STATE_NOT_AUTHENTICATED = exports.STATE_CONNECTING = exports.TIMEOUT_IDLE = exports.TIMEOUT_NOOP = exports.TIMEOUT_CONNECTION = void 0;

var _ramda = require("ramda");

var _emailjsUtf = require("emailjs-utf7");

var _commandParser = require("./command-parser");

var _commandBuilder = require("./command-builder");

var _logger = _interopRequireDefault(require("./logger"));

var _imap = _interopRequireDefault(require("./imap"));

var _common = require("./common");

var _specialUse = require("./special-use");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

const TIMEOUT_CONNECTION = 90 * 1000; // Milliseconds to wait for the IMAP greeting from the server

exports.TIMEOUT_CONNECTION = TIMEOUT_CONNECTION;
const TIMEOUT_NOOP = 60 * 1000; // Milliseconds between NOOP commands while idling

exports.TIMEOUT_NOOP = TIMEOUT_NOOP;
const TIMEOUT_IDLE = 60 * 1000; // Milliseconds until IDLE command is cancelled

exports.TIMEOUT_IDLE = TIMEOUT_IDLE;
const STATE_CONNECTING = 1;
exports.STATE_CONNECTING = STATE_CONNECTING;
const STATE_NOT_AUTHENTICATED = 2;
exports.STATE_NOT_AUTHENTICATED = STATE_NOT_AUTHENTICATED;
const STATE_AUTHENTICATED = 3;
exports.STATE_AUTHENTICATED = STATE_AUTHENTICATED;
const STATE_SELECTED = 4;
exports.STATE_SELECTED = STATE_SELECTED;
const STATE_LOGOUT = 5;
exports.STATE_LOGOUT = STATE_LOGOUT;
const DEFAULT_CLIENT_ID = {
  name: 'emailjs-imap-client'
};
/**
 * emailjs IMAP client
 *
 * @constructor
 *
 * @param {String} [host='localhost'] Hostname to conenct to
 * @param {Number} [port=143] Port number to connect to
 * @param {Object} [options] Optional options object
 */

exports.DEFAULT_CLIENT_ID = DEFAULT_CLIENT_ID;

class Client {
  constructor(host, port, options = {}) {
    this.timeoutConnection = TIMEOUT_CONNECTION;
    this.timeoutNoop = options.timeoutNoop || TIMEOUT_NOOP;
    this.timeoutIdle = options.timeoutIdle || TIMEOUT_IDLE;
    this.serverId = false; // RFC 2971 Server ID as key value pairs
    // Event placeholders

    this.oncert = null;
    this.onupdate = null;
    this.onselectmailbox = null;
    this.onclosemailbox = null;
    this._host = host;
    this._clientId = (0, _ramda.propOr)(DEFAULT_CLIENT_ID, 'id', options);
    this._state = false; // Current state

    this._authenticated = false; // Is the connection authenticated

    this._capability = []; // List of extensions the server supports

    this._selectedMailbox = false; // Selected mailbox

    this._enteredIdle = false;
    this._idleTimeout = false;
    this._enableCompression = !!options.enableCompression;
    this._auth = options.auth;
    this._requireTLS = !!options.requireTLS;
    this._ignoreTLS = !!options.ignoreTLS;
    this._ignoreIdleCapability = !!options.ignoreIdleCapability;
    this.client = new _imap.default(host, port, options); // IMAP client object
    // Event Handlers

    this.client.onerror = this._onError.bind(this);

    this.client.oncert = cert => this.oncert && this.oncert(cert); // allows certificate handling for platforms w/o native tls support


    this.client.onidle = () => this._onIdle(); // start idling
    // Default handlers for untagged responses


    this.client.setHandler('capability', response => this._untaggedCapabilityHandler(response)); // capability updates

    this.client.setHandler('ok', response => this._untaggedOkHandler(response)); // notifications

    this.client.setHandler('exists', response => this._untaggedExistsHandler(response)); // message count has changed

    this.client.setHandler('expunge', response => this._untaggedExpungeHandler(response)); // message has been deleted

    this.client.setHandler('fetch', response => this._untaggedFetchHandler(response)); // message has been updated (eg. flag change)
    // Activate logging

    this.createLogger();
    this.logLevel = (0, _ramda.propOr)(_common.LOG_LEVEL_ALL, 'logLevel', options);
  }
  /**
   * Called if the lower-level ImapClient has encountered an unrecoverable
   * error during operation. Cleans up and propagates the error upwards.
   */


  _onError(err) {
    // make sure no idle timeout is pending anymore
    clearTimeout(this._idleTimeout); // propagate the error upwards

    this.onerror && this.onerror(err);
  } //
  //
  // PUBLIC API
  //
  //

  /**
   * Initiate connection and login to the IMAP server
   *
   * @returns {Promise} Promise when login procedure is complete
   */


  connect() {
    var _this = this;

    return _asyncToGenerator(function* () {
      try {
        yield _this.openConnection();
        yield _this.upgradeConnection();

        try {
          yield _this.updateId(_this._clientId);
        } catch (err) {
          _this.logger.warn('Failed to update server id!', err.message);
        }

        yield _this.login(_this._auth);
        yield _this.compressConnection();

        _this.logger.debug('Connection established, ready to roll!');

        _this.client.onerror = _this._onError.bind(_this);
      } catch (err) {
        _this.logger.error('Could not connect to server', err);

        _this.close(err); // we don't really care whether this works or not


        throw err;
      }
    })();
  }
  /**
   * Initiate connection to the IMAP server
   *
   * @returns {Promise} capability of server without login
   */


  openConnection() {
    return new Promise((resolve, reject) => {
      const connectionTimeout = setTimeout(() => reject(new Error('Timeout connecting to server')), this.timeoutConnection);
      this.logger.debug('Connecting to', this.client.host, ':', this.client.port);

      this._changeState(STATE_CONNECTING);

      this.client.connect().then(() => {
        this.logger.debug('Socket opened, waiting for greeting from the server...');

        this.client.onready = () => {
          clearTimeout(connectionTimeout);

          this._changeState(STATE_NOT_AUTHENTICATED);

          this.updateCapability().then(() => resolve(this._capability));
        };

        this.client.onerror = err => {
          clearTimeout(connectionTimeout);
          reject(err);
        };
      }).catch(reject);
    });
  }
  /**
   * Logout
   *
   * Send LOGOUT, to which the server responds by closing the connection.
   * Use is discouraged if network status is unclear! If networks status is
   * unclear, please use #close instead!
   *
   * LOGOUT details:
   *   https://tools.ietf.org/html/rfc3501#section-6.1.3
   *
   * @returns {Promise} Resolves when server has closed the connection
   */


  logout() {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      _this2._changeState(STATE_LOGOUT);

      _this2.logger.debug('Logging out...');

      yield _this2.client.logout();
      clearTimeout(_this2._idleTimeout);
    })();
  }
  /**
   * Force-closes the current connection by closing the TCP socket.
   *
   * @returns {Promise} Resolves when socket is closed
   */


  close(err) {
    var _this3 = this;

    return _asyncToGenerator(function* () {
      _this3._changeState(STATE_LOGOUT);

      clearTimeout(_this3._idleTimeout);

      _this3.logger.debug('Closing connection...');

      yield _this3.client.close(err);
      clearTimeout(_this3._idleTimeout);
    })();
  }
  /**
   * Runs ID command, parses ID response, sets this.serverId
   *
   * ID details:
   *   http://tools.ietf.org/html/rfc2971
   *
   * @param {Object} id ID as JSON object. See http://tools.ietf.org/html/rfc2971#section-3.3 for possible values
   * @returns {Promise} Resolves when response has been parsed
   */


  updateId(id) {
    var _this4 = this;

    return _asyncToGenerator(function* () {
      if (_this4._capability.indexOf('ID') < 0) return;

      _this4.logger.debug('Updating id...');

      const command = 'ID';
      const attributes = id ? [(0, _ramda.flatten)(Object.entries(id))] : [null];
      const response = yield _this4.exec({
        command,
        attributes
      }, 'ID');
      const list = (0, _ramda.flatten)((0, _ramda.pathOr)([], ['payload', 'ID', '0', 'attributes', '0'], response).map(Object.values));
      const keys = list.filter((_, i) => i % 2 === 0);
      const values = list.filter((_, i) => i % 2 === 1);
      _this4.serverId = (0, _ramda.fromPairs)((0, _ramda.zip)(keys, values));

      _this4.logger.debug('Server id updated!', _this4.serverId);
    })();
  }

  _shouldSelectMailbox(path, ctx) {
    if (!ctx) {
      return true;
    }

    const previousSelect = this.client.getPreviouslyQueued(['SELECT', 'EXAMINE'], ctx);

    if (previousSelect && previousSelect.request.attributes) {
      const pathAttribute = previousSelect.request.attributes.find(attribute => attribute.type === 'STRING');

      if (pathAttribute) {
        return pathAttribute.value !== path;
      }
    }

    return this._selectedMailbox !== path;
  }
  /**
   * Runs SELECT or EXAMINE to open a mailbox
   *
   * SELECT details:
   *   http://tools.ietf.org/html/rfc3501#section-6.3.1
   * EXAMINE details:
   *   http://tools.ietf.org/html/rfc3501#section-6.3.2
   *
   * @param {String} path Full path to mailbox
   * @param {Object} [options] Options object
   * @returns {Promise} Promise with information about the selected mailbox
   */


  selectMailbox(path, options = {}) {
    var _this5 = this;

    return _asyncToGenerator(function* () {
      const query = {
        command: options.readOnly ? 'EXAMINE' : 'SELECT',
        attributes: [{
          type: 'STRING',
          value: path
        }]
      };

      if (options.condstore && _this5._capability.indexOf('CONDSTORE') >= 0) {
        query.attributes.push([{
          type: 'ATOM',
          value: 'CONDSTORE'
        }]);
      }

      _this5.logger.debug('Opening', path, '...');

      const response = yield _this5.exec(query, ['EXISTS', 'FLAGS', 'OK'], {
        ctx: options.ctx
      });
      const mailboxInfo = (0, _commandParser.parseSELECT)(response);

      _this5._changeState(STATE_SELECTED);

      if (_this5._selectedMailbox !== path && _this5.onclosemailbox) {
        yield _this5.onclosemailbox(_this5._selectedMailbox);
      }

      _this5._selectedMailbox = path;

      if (_this5.onselectmailbox) {
        yield _this5.onselectmailbox(path, mailboxInfo);
      }

      return mailboxInfo;
    })();
  }
  /**
   * Subscribe to a mailbox with the given path
   *
   * SUBSCRIBE details:
   *   https://tools.ietf.org/html/rfc3501#section-6.3.6
   *
   * @param {String} path
   *     The path of the mailbox you would like to subscribe to.
   * @returns {Promise}
   *     Promise resolves if mailbox is now subscribed to or was so already.
   */


  subscribeMailbox(path) {
    var _this6 = this;

    return _asyncToGenerator(function* () {
      _this6.logger.debug('Subscribing to mailbox', path, '...');

      return _this6.exec({
        command: 'SUBSCRIBE',
        attributes: [path]
      });
    })();
  }
  /**
   * Unsubscribe from a mailbox with the given path
   *
   * UNSUBSCRIBE details:
   *   https://tools.ietf.org/html/rfc3501#section-6.3.7
   *
   * @param {String} path
   *     The path of the mailbox you would like to unsubscribe from.
   * @returns {Promise}
   *     Promise resolves if mailbox is no longer subscribed to or was not before.
   */


  unsubscribeMailbox(path) {
    var _this7 = this;

    return _asyncToGenerator(function* () {
      _this7.logger.debug('Unsubscribing to mailbox', path, '...');

      return _this7.exec({
        command: 'UNSUBSCRIBE',
        attributes: [path]
      });
    })();
  }
  /**
   * Runs NAMESPACE command
   *
   * NAMESPACE details:
   *   https://tools.ietf.org/html/rfc2342
   *
   * @returns {Promise} Promise with namespace object
   */


  listNamespaces() {
    var _this8 = this;

    return _asyncToGenerator(function* () {
      if (_this8._capability.indexOf('NAMESPACE') < 0) return false;

      _this8.logger.debug('Listing namespaces...');

      const response = yield _this8.exec('NAMESPACE', 'NAMESPACE');
      return (0, _commandParser.parseNAMESPACE)(response);
    })();
  }
  /**
   * Runs LIST and LSUB commands. Retrieves a tree of available mailboxes
   *
   * LIST details:
   *   http://tools.ietf.org/html/rfc3501#section-6.3.8
   * LSUB details:
   *   http://tools.ietf.org/html/rfc3501#section-6.3.9
   *
   * @returns {Promise} Promise with list of mailboxes
   */


  listMailboxes() {
    var _this9 = this;

    return _asyncToGenerator(function* () {
      const tree = {
        root: true,
        children: []
      };

      _this9.logger.debug('Listing mailboxes...');

      const listResponse = yield _this9.exec({
        command: 'LIST',
        attributes: ['', '*']
      }, 'LIST');
      const list = (0, _ramda.pathOr)([], ['payload', 'LIST'], listResponse);
      list.forEach(item => {
        const attr = (0, _ramda.propOr)([], 'attributes', item);
        if (attr.length < 3) return;
        const path = (0, _ramda.pathOr)('', ['2', 'value'], attr);
        const delim = (0, _ramda.pathOr)('/', ['1', 'value'], attr);

        const branch = _this9._ensurePath(tree, path, delim);

        branch.flags = (0, _ramda.propOr)([], '0', attr).map(({
          value
        }) => value || '');
        branch.listed = true;
        (0, _specialUse.checkSpecialUse)(branch);
      });
      const lsubResponse = yield _this9.exec({
        command: 'LSUB',
        attributes: ['', '*']
      }, 'LSUB');
      const lsub = (0, _ramda.pathOr)([], ['payload', 'LSUB'], lsubResponse);
      lsub.forEach(item => {
        const attr = (0, _ramda.propOr)([], 'attributes', item);
        if (attr.length < 3) return;
        const path = (0, _ramda.pathOr)('', ['2', 'value'], attr);
        const delim = (0, _ramda.pathOr)('/', ['1', 'value'], attr);

        const branch = _this9._ensurePath(tree, path, delim);

        (0, _ramda.propOr)([], '0', attr).map((flag = '') => {
          branch.flags = (0, _ramda.union)(branch.flags, [flag]);
        });
        branch.subscribed = true;
      });
      return tree;
    })();
  }
  /**
   * Create a mailbox with the given path.
   *
   * CREATE details:
   *   http://tools.ietf.org/html/rfc3501#section-6.3.3
   *
   * @param {String} path
   *     The path of the mailbox you would like to create.
   * @returns {Promise}
   *     Promise resolves if mailbox was created.
   *     In the event the server says NO [ALREADYEXISTS], we treat that as success.
   */


  createMailbox(path) {
    var _this10 = this;

    return _asyncToGenerator(function* () {
      _this10.logger.debug('Creating mailbox', path, '...');

      try {
        yield _this10.exec({
          command: 'CREATE',
          attributes: [path]
        });
      } catch (err) {
        if (err && err.code === 'ALREADYEXISTS') {
          return;
        }

        throw err;
      }
    })();
  }
  /**
   * Delete a mailbox with the given path.
   *
   * DELETE details:
   *   https://tools.ietf.org/html/rfc3501#section-6.3.4
   *
   * @param {String} path
   *     The path of the mailbox you would like to delete.
   * @returns {Promise}
   *     Promise resolves if mailbox was deleted.
   */


  deleteMailbox(path) {
    this.logger.debug('Deleting mailbox', path, '...');
    return this.exec({
      command: 'DELETE',
      attributes: [path]
    });
  }
  /**
   * Runs FETCH command
   *
   * FETCH details:
   *   http://tools.ietf.org/html/rfc3501#section-6.4.5
   * CHANGEDSINCE details:
   *   https://tools.ietf.org/html/rfc4551#section-3.3
   *
   * @param {String} path The path for the mailbox which should be selected for the command. Selects mailbox if necessary
   * @param {String} sequence Sequence set, eg 1:* for all messages
   * @param {Object} [items] Message data item names or macro
   * @param {Object} [options] Query modifiers
   * @returns {Promise} Promise with the fetched message info
   */


  listMessages(path, sequence, items = [{
    fast: true
  }], options = {}) {
    var _this11 = this;

    return _asyncToGenerator(function* () {
      _this11.logger.debug('Fetching messages', sequence, 'from', path, '...');

      const command = (0, _commandBuilder.buildFETCHCommand)(sequence, items, options);
      const response = yield _this11.exec(command, 'FETCH', {
        precheck: ctx => _this11._shouldSelectMailbox(path, ctx) ? _this11.selectMailbox(path, {
          ctx
        }) : Promise.resolve()
      });
      return (0, _commandParser.parseFETCH)(response);
    })();
  }
  /**
   * Runs SEARCH command
   *
   * SEARCH details:
   *   http://tools.ietf.org/html/rfc3501#section-6.4.4
   *
   * @param {String} path The path for the mailbox which should be selected for the command. Selects mailbox if necessary
   * @param {Object} query Search terms
   * @param {Object} [options] Query modifiers
   * @returns {Promise} Promise with the array of matching seq. or uid numbers
   */


  search(path, query, options = {}) {
    var _this12 = this;

    return _asyncToGenerator(function* () {
      _this12.logger.debug('Searching in', path, '...');

      const command = (0, _commandBuilder.buildSEARCHCommand)(query, options);
      const response = yield _this12.exec(command, 'SEARCH', {
        precheck: ctx => _this12._shouldSelectMailbox(path, ctx) ? _this12.selectMailbox(path, {
          ctx
        }) : Promise.resolve()
      });
      return (0, _commandParser.parseSEARCH)(response);
    })();
  }
  /**
   * Runs STORE command
   *
   * STORE details:
   *   http://tools.ietf.org/html/rfc3501#section-6.4.6
   *
   * @param {String} path The path for the mailbox which should be selected for the command. Selects mailbox if necessary
   * @param {String} sequence Message selector which the flag change is applied to
   * @param {Array} flags
   * @param {Object} [options] Query modifiers
   * @returns {Promise} Promise with the array of matching seq. or uid numbers
   */


  setFlags(path, sequence, flags, options) {
    let key = '';
    let list = [];

    if (Array.isArray(flags) || typeof flags !== 'object') {
      list = [].concat(flags || []);
      key = '';
    } else if (flags.add) {
      list = [].concat(flags.add || []);
      key = '+';
    } else if (flags.set) {
      key = '';
      list = [].concat(flags.set || []);
    } else if (flags.remove) {
      key = '-';
      list = [].concat(flags.remove || []);
    }

    this.logger.debug('Setting flags on', sequence, 'in', path, '...');
    return this.store(path, sequence, key + 'FLAGS', list, options);
  }
  /**
   * Runs STORE command
   *
   * STORE details:
   *   http://tools.ietf.org/html/rfc3501#section-6.4.6
   *
   * @param {String} path The path for the mailbox which should be selected for the command. Selects mailbox if necessary
   * @param {String} sequence Message selector which the flag change is applied to
   * @param {String} action STORE method to call, eg "+FLAGS"
   * @param {Array} flags
   * @param {Object} [options] Query modifiers
   * @returns {Promise} Promise with the array of matching seq. or uid numbers
   */


  store(path, sequence, action, flags, options = {}) {
    var _this13 = this;

    return _asyncToGenerator(function* () {
      const command = (0, _commandBuilder.buildSTORECommand)(sequence, action, flags, options);
      const response = yield _this13.exec(command, 'FETCH', {
        precheck: ctx => _this13._shouldSelectMailbox(path, ctx) ? _this13.selectMailbox(path, {
          ctx
        }) : Promise.resolve()
      });
      return (0, _commandParser.parseFETCH)(response);
    })();
  }
  /**
   * Runs APPEND command
   *
   * APPEND details:
   *   http://tools.ietf.org/html/rfc3501#section-6.3.11
   *
   * @param {String} destination The mailbox where to append the message
   * @param {String} message The message to append
   * @param {Array} options.flags Any flags you want to set on the uploaded message. Defaults to [\Seen]. (optional)
   * @returns {Promise} Promise with the array of matching seq. or uid numbers
   */


  upload(destination, message, options = {}) {
    var _this14 = this;

    return _asyncToGenerator(function* () {
      const flags = (0, _ramda.propOr)(['\\Seen'], 'flags', options).map(value => ({
        type: 'atom',
        value
      }));
      const command = {
        command: 'APPEND',
        attributes: [{
          type: 'atom',
          value: destination
        }, flags, {
          type: 'literal',
          value: message
        }]
      };

      _this14.logger.debug('Uploading message to', destination, '...');

      const response = yield _this14.exec(command);
      return (0, _commandParser.parseAPPEND)(response);
    })();
  }
  /**
   * Deletes messages from a selected mailbox
   *
   * EXPUNGE details:
   *   http://tools.ietf.org/html/rfc3501#section-6.4.3
   * UID EXPUNGE details:
   *   https://tools.ietf.org/html/rfc4315#section-2.1
   *
   * If possible (byUid:true and UIDPLUS extension supported), uses UID EXPUNGE
   * command to delete a range of messages, otherwise falls back to EXPUNGE.
   *
   * NB! This method might be destructive - if EXPUNGE is used, then any messages
   * with \Deleted flag set are deleted
   *
   * @param {String} path The path for the mailbox which should be selected for the command. Selects mailbox if necessary
   * @param {String} sequence Message range to be deleted
   * @param {Object} [options] Query modifiers
   * @returns {Promise} Promise
   */


  deleteMessages(path, sequence, options = {}) {
    var _this15 = this;

    return _asyncToGenerator(function* () {
      // add \Deleted flag to the messages and run EXPUNGE or UID EXPUNGE
      _this15.logger.debug('Deleting messages', sequence, 'in', path, '...');

      const useUidPlus = options.byUid && _this15._capability.indexOf('UIDPLUS') >= 0;
      const uidExpungeCommand = {
        command: 'UID EXPUNGE',
        attributes: [{
          type: 'sequence',
          value: sequence
        }]
      };
      yield _this15.setFlags(path, sequence, {
        add: '\\Deleted'
      }, options);
      const cmd = useUidPlus ? uidExpungeCommand : 'EXPUNGE';
      return _this15.exec(cmd, null, {
        precheck: ctx => _this15._shouldSelectMailbox(path, ctx) ? _this15.selectMailbox(path, {
          ctx
        }) : Promise.resolve()
      });
    })();
  }
  /**
   * Copies a range of messages from the active mailbox to the destination mailbox.
   * Silent method (unless an error occurs), by default returns no information.
   *
   * COPY details:
   *   http://tools.ietf.org/html/rfc3501#section-6.4.7
   *
   * @param {String} path The path for the mailbox which should be selected for the command. Selects mailbox if necessary
   * @param {String} sequence Message range to be copied
   * @param {String} destination Destination mailbox path
   * @param {Object} [options] Query modifiers
   * @param {Boolean} [options.byUid] If true, uses UID COPY instead of COPY
   * @returns {Promise} Promise
   */


  copyMessages(path, sequence, destination, options = {}) {
    var _this16 = this;

    return _asyncToGenerator(function* () {
      _this16.logger.debug('Copying messages', sequence, 'from', path, 'to', destination, '...');

      const response = yield _this16.exec({
        command: options.byUid ? 'UID COPY' : 'COPY',
        attributes: [{
          type: 'sequence',
          value: sequence
        }, {
          type: 'atom',
          value: destination
        }]
      }, null, {
        precheck: ctx => _this16._shouldSelectMailbox(path, ctx) ? _this16.selectMailbox(path, {
          ctx
        }) : Promise.resolve()
      });
      return (0, _commandParser.parseCOPY)(response);
    })();
  }
  /**
   * Moves a range of messages from the active mailbox to the destination mailbox.
   * Prefers the MOVE extension but if not available, falls back to
   * COPY + EXPUNGE
   *
   * MOVE details:
   *   http://tools.ietf.org/html/rfc6851
   *
   * @param {String} path The path for the mailbox which should be selected for the command. Selects mailbox if necessary
   * @param {String} sequence Message range to be moved
   * @param {String} destination Destination mailbox path
   * @param {Object} [options] Query modifiers
   * @returns {Promise} Promise
   */


  moveMessages(path, sequence, destination, options = {}) {
    var _this17 = this;

    return _asyncToGenerator(function* () {
      _this17.logger.debug('Moving messages', sequence, 'from', path, 'to', destination, '...');

      if (_this17._capability.indexOf('MOVE') === -1) {
        // Fallback to COPY + EXPUNGE
        yield _this17.copyMessages(path, sequence, destination, options);
        return _this17.deleteMessages(path, sequence, options);
      } // If possible, use MOVE


      return _this17.exec({
        command: options.byUid ? 'UID MOVE' : 'MOVE',
        attributes: [{
          type: 'sequence',
          value: sequence
        }, {
          type: 'atom',
          value: destination
        }]
      }, ['OK'], {
        precheck: ctx => _this17._shouldSelectMailbox(path, ctx) ? _this17.selectMailbox(path, {
          ctx
        }) : Promise.resolve()
      });
    })();
  }
  /**
   * Runs COMPRESS command
   *
   * COMPRESS details:
   *   https://tools.ietf.org/html/rfc4978
   */


  compressConnection() {
    var _this18 = this;

    return _asyncToGenerator(function* () {
      if (!_this18._enableCompression || _this18._capability.indexOf('COMPRESS=DEFLATE') < 0 || _this18.client.compressed) {
        return false;
      }

      _this18.logger.debug('Enabling compression...');

      yield _this18.exec({
        command: 'COMPRESS',
        attributes: [{
          type: 'ATOM',
          value: 'DEFLATE'
        }]
      });

      _this18.client.enableCompression();

      _this18.logger.debug('Compression enabled, all data sent and received is deflated!');
    })();
  }
  /**
   * Runs LOGIN or AUTHENTICATE XOAUTH2 command
   *
   * LOGIN details:
   *   http://tools.ietf.org/html/rfc3501#section-6.2.3
   * XOAUTH2 details:
   *   https://developers.google.com/gmail/xoauth2_protocol#imap_protocol_exchange
   *
   * @param {String} auth.user
   * @param {String} auth.pass
   * @param {String} auth.xoauth2
   */


  login(auth) {
    var _this19 = this;

    return _asyncToGenerator(function* () {
      let command;
      const options = {};

      if (!auth) {
        throw new Error('Authentication information not provided');
      }

      if (_this19._capability.indexOf('AUTH=XOAUTH2') >= 0 && auth && auth.xoauth2) {
        command = {
          command: 'AUTHENTICATE',
          attributes: [{
            type: 'ATOM',
            value: 'XOAUTH2'
          }, {
            type: 'ATOM',
            value: (0, _commandBuilder.buildXOAuth2Token)(auth.user, auth.xoauth2),
            sensitive: true
          }]
        };
        options.errorResponseExpectsEmptyLine = true; // + tagged error response expects an empty line in return
      } else {
        command = {
          command: 'login',
          attributes: [{
            type: 'STRING',
            value: auth.user || ''
          }, {
            type: 'STRING',
            value: auth.pass || '',
            sensitive: true
          }]
        };
      }

      _this19.logger.debug('Logging in...');

      const response = yield _this19.exec(command, 'capability', options);
      /*
       * update post-auth capabilites
       * capability list shouldn't contain auth related stuff anymore
       * but some new extensions might have popped up that do not
       * make much sense in the non-auth state
       */

      if (response.capability && response.capability.length) {
        // capabilites were listed with the OK [CAPABILITY ...] response
        _this19._capability = response.capability;
      } else if (response.payload && response.payload.CAPABILITY && response.payload.CAPABILITY.length) {
        // capabilites were listed with * CAPABILITY ... response
        _this19._capability = response.payload.CAPABILITY.pop().attributes.map((capa = '') => capa.value.toUpperCase().trim());
      } else {
        // capabilities were not automatically listed, reload
        yield _this19.updateCapability(true);
      }

      _this19._changeState(STATE_AUTHENTICATED);

      _this19._authenticated = true;

      _this19.logger.debug('Login successful, post-auth capabilites updated!', _this19._capability);
    })();
  }
  /**
   * Run an IMAP command.
   *
   * @param {Object} request Structured request object
   * @param {Array} acceptUntagged a list of untagged responses that will be included in 'payload' property
   */


  exec(request, acceptUntagged, options) {
    var _this20 = this;

    return _asyncToGenerator(function* () {
      _this20.breakIdle();

      const response = yield _this20.client.enqueueCommand(request, acceptUntagged, options);

      if (response && response.capability) {
        _this20._capability = response.capability;
      }

      return response;
    })();
  }
  /**
   * The connection is idling. Sends a NOOP or IDLE command
   *
   * IDLE details:
   *   https://tools.ietf.org/html/rfc2177
   */


  enterIdle() {
    if (this._enteredIdle) {
      return;
    }

    this._enteredIdle = !this._ignoreIdleCapability && this._selectedMailbox && this._capability.indexOf('IDLE') >= 0 ? 'IDLE' : 'NOOP';
    this.logger.debug('Entering idle with ' + this._enteredIdle);

    if (this._enteredIdle === 'NOOP') {
      this._idleTimeout = setTimeout(() => {
        this.logger.debug('Sending NOOP');
        this.exec('NOOP');
      }, this.timeoutNoop);
    } else if (this._enteredIdle === 'IDLE') {
      this.client.enqueueCommand({
        command: 'IDLE'
      });
      this._idleTimeout = setTimeout(() => {
        this.client.send('DONE\r\n');
        this._enteredIdle = false;
        this.logger.debug('Idle terminated');
      }, this.timeoutIdle);
    }
  }
  /**
   * Stops actions related idling, if IDLE is supported, sends DONE to stop it
   */


  breakIdle() {
    if (!this._enteredIdle) {
      return;
    }

    clearTimeout(this._idleTimeout);

    if (this._enteredIdle === 'IDLE') {
      this.client.send('DONE\r\n');
      this.logger.debug('Idle terminated');
    }

    this._enteredIdle = false;
  }
  /**
   * Runs STARTTLS command if needed
   *
   * STARTTLS details:
   *   http://tools.ietf.org/html/rfc3501#section-6.2.1
   *
   * @param {Boolean} [forced] By default the command is not run if capability is already listed. Set to true to skip this validation
   */


  upgradeConnection() {
    var _this21 = this;

    return _asyncToGenerator(function* () {
      // skip request, if already secured
      if (_this21.client.secureMode) {
        return false;
      } // skip if STARTTLS not available or starttls support disabled


      if ((_this21._capability.indexOf('STARTTLS') < 0 || _this21._ignoreTLS) && !_this21._requireTLS) {
        return false;
      }

      _this21.logger.debug('Encrypting connection...');

      yield _this21.exec('STARTTLS');
      _this21._capability = [];

      _this21.client.upgrade();

      return _this21.updateCapability();
    })();
  }
  /**
   * Runs CAPABILITY command
   *
   * CAPABILITY details:
   *   http://tools.ietf.org/html/rfc3501#section-6.1.1
   *
   * Doesn't register untagged CAPABILITY handler as this is already
   * handled by global handler
   *
   * @param {Boolean} [forced] By default the command is not run if capability is already listed. Set to true to skip this validation
   */


  updateCapability(forced) {
    var _this22 = this;

    return _asyncToGenerator(function* () {
      // skip request, if not forced update and capabilities are already loaded
      if (!forced && _this22._capability.length) {
        return;
      } // If STARTTLS is required then skip capability listing as we are going to try
      // STARTTLS anyway and we re-check capabilities after connection is secured


      if (!_this22.client.secureMode && _this22._requireTLS) {
        return;
      }

      _this22.logger.debug('Updating capability...');

      return _this22.exec('CAPABILITY');
    })();
  }

  hasCapability(capa = '') {
    return this._capability.indexOf(capa.toUpperCase().trim()) >= 0;
  } // Default handlers for untagged responses

  /**
   * Checks if an untagged OK includes [CAPABILITY] tag and updates capability object
   *
   * @param {Object} response Parsed server response
   * @param {Function} next Until called, server responses are not processed
   */


  _untaggedOkHandler(response) {
    if (response && response.capability) {
      this._capability = response.capability;
    }
  }
  /**
   * Updates capability object
   *
   * @param {Object} response Parsed server response
   * @param {Function} next Until called, server responses are not processed
   */


  _untaggedCapabilityHandler(response) {
    this._capability = (0, _ramda.pipe)((0, _ramda.propOr)([], 'attributes'), (0, _ramda.map)(({
      value
    }) => (value || '').toUpperCase().trim()))(response);
  }
  /**
   * Updates existing message count
   *
   * @param {Object} response Parsed server response
   * @param {Function} next Until called, server responses are not processed
   */


  _untaggedExistsHandler(response) {
    if (response && Object.prototype.hasOwnProperty.call(response, 'nr')) {
      this.onupdate && this.onupdate(this._selectedMailbox, 'exists', response.nr);
    }
  }
  /**
   * Indicates a message has been deleted
   *
   * @param {Object} response Parsed server response
   * @param {Function} next Until called, server responses are not processed
   */


  _untaggedExpungeHandler(response) {
    if (response && Object.prototype.hasOwnProperty.call(response, 'nr')) {
      this.onupdate && this.onupdate(this._selectedMailbox, 'expunge', response.nr);
    }
  }
  /**
   * Indicates that flags have been updated for a message
   *
   * @param {Object} response Parsed server response
   * @param {Function} next Until called, server responses are not processed
   */


  _untaggedFetchHandler(response) {
    this.onupdate && this.onupdate(this._selectedMailbox, 'fetch', [].concat((0, _commandParser.parseFETCH)({
      payload: {
        FETCH: [response]
      }
    }) || []).shift());
  } // Private helpers

  /**
   * Indicates that the connection started idling. Initiates a cycle
   * of NOOPs or IDLEs to receive notifications about updates in the server
   */


  _onIdle() {
    if (!this._authenticated || this._enteredIdle) {
      // No need to IDLE when not logged in or already idling
      return;
    }

    this.logger.debug('Client started idling');
    this.enterIdle();
  }
  /**
   * Updates the IMAP state value for the current connection
   *
   * @param {Number} newState The state you want to change to
   */


  _changeState(newState) {
    if (newState === this._state) {
      return;
    }

    this.logger.debug('Entering state: ' + newState); // if a mailbox was opened, emit onclosemailbox and clear selectedMailbox value

    if (this._state === STATE_SELECTED && this._selectedMailbox) {
      this.onclosemailbox && this.onclosemailbox(this._selectedMailbox);
      this._selectedMailbox = false;
    }

    this._state = newState;
  }
  /**
   * Ensures a path exists in the Mailbox tree
   *
   * @param {Object} tree Mailbox tree
   * @param {String} path
   * @param {String} delimiter
   * @return {Object} branch for used path
   */


  _ensurePath(tree, path, delimiter) {
    const names = path.split(delimiter);
    let branch = tree;

    for (let i = 0; i < names.length; i++) {
      let found = false;

      for (let j = 0; j < branch.children.length; j++) {
        if (this._compareMailboxNames(branch.children[j].name, (0, _emailjsUtf.imapDecode)(names[i]))) {
          branch = branch.children[j];
          found = true;
          break;
        }
      }

      if (!found) {
        branch.children.push({
          name: (0, _emailjsUtf.imapDecode)(names[i]),
          delimiter: delimiter,
          path: names.slice(0, i + 1).join(delimiter),
          children: []
        });
        branch = branch.children[branch.children.length - 1];
      }
    }

    return branch;
  }
  /**
   * Compares two mailbox names. Case insensitive in case of INBOX, otherwise case sensitive
   *
   * @param {String} a Mailbox name
   * @param {String} b Mailbox name
   * @returns {Boolean} True if the folder names match
   */


  _compareMailboxNames(a, b) {
    return (a.toUpperCase() === 'INBOX' ? 'INBOX' : a) === (b.toUpperCase() === 'INBOX' ? 'INBOX' : b);
  }

  createLogger(creator = _logger.default) {
    const logger = creator((this._auth || {}).user || '', this._host);
    this.logger = this.client.logger = {
      debug: (...msgs) => {
        if (_common.LOG_LEVEL_DEBUG >= this.logLevel) {
          logger.debug(msgs);
        }
      },
      info: (...msgs) => {
        if (_common.LOG_LEVEL_INFO >= this.logLevel) {
          logger.info(msgs);
        }
      },
      warn: (...msgs) => {
        if (_common.LOG_LEVEL_WARN >= this.logLevel) {
          logger.warn(msgs);
        }
      },
      error: (...msgs) => {
        if (_common.LOG_LEVEL_ERROR >= this.logLevel) {
          logger.error(msgs);
        }
      }
    };
  }

}

exports.default = Client;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9jbGllbnQuanMiXSwibmFtZXMiOlsiVElNRU9VVF9DT05ORUNUSU9OIiwiVElNRU9VVF9OT09QIiwiVElNRU9VVF9JRExFIiwiU1RBVEVfQ09OTkVDVElORyIsIlNUQVRFX05PVF9BVVRIRU5USUNBVEVEIiwiU1RBVEVfQVVUSEVOVElDQVRFRCIsIlNUQVRFX1NFTEVDVEVEIiwiU1RBVEVfTE9HT1VUIiwiREVGQVVMVF9DTElFTlRfSUQiLCJuYW1lIiwiQ2xpZW50IiwiY29uc3RydWN0b3IiLCJob3N0IiwicG9ydCIsIm9wdGlvbnMiLCJ0aW1lb3V0Q29ubmVjdGlvbiIsInRpbWVvdXROb29wIiwidGltZW91dElkbGUiLCJzZXJ2ZXJJZCIsIm9uY2VydCIsIm9udXBkYXRlIiwib25zZWxlY3RtYWlsYm94Iiwib25jbG9zZW1haWxib3giLCJfaG9zdCIsIl9jbGllbnRJZCIsIl9zdGF0ZSIsIl9hdXRoZW50aWNhdGVkIiwiX2NhcGFiaWxpdHkiLCJfc2VsZWN0ZWRNYWlsYm94IiwiX2VudGVyZWRJZGxlIiwiX2lkbGVUaW1lb3V0IiwiX2VuYWJsZUNvbXByZXNzaW9uIiwiZW5hYmxlQ29tcHJlc3Npb24iLCJfYXV0aCIsImF1dGgiLCJfcmVxdWlyZVRMUyIsInJlcXVpcmVUTFMiLCJfaWdub3JlVExTIiwiaWdub3JlVExTIiwiX2lnbm9yZUlkbGVDYXBhYmlsaXR5IiwiaWdub3JlSWRsZUNhcGFiaWxpdHkiLCJjbGllbnQiLCJJbWFwQ2xpZW50Iiwib25lcnJvciIsIl9vbkVycm9yIiwiYmluZCIsImNlcnQiLCJvbmlkbGUiLCJfb25JZGxlIiwic2V0SGFuZGxlciIsInJlc3BvbnNlIiwiX3VudGFnZ2VkQ2FwYWJpbGl0eUhhbmRsZXIiLCJfdW50YWdnZWRPa0hhbmRsZXIiLCJfdW50YWdnZWRFeGlzdHNIYW5kbGVyIiwiX3VudGFnZ2VkRXhwdW5nZUhhbmRsZXIiLCJfdW50YWdnZWRGZXRjaEhhbmRsZXIiLCJjcmVhdGVMb2dnZXIiLCJsb2dMZXZlbCIsIkxPR19MRVZFTF9BTEwiLCJlcnIiLCJjbGVhclRpbWVvdXQiLCJjb25uZWN0Iiwib3BlbkNvbm5lY3Rpb24iLCJ1cGdyYWRlQ29ubmVjdGlvbiIsInVwZGF0ZUlkIiwibG9nZ2VyIiwid2FybiIsIm1lc3NhZ2UiLCJsb2dpbiIsImNvbXByZXNzQ29ubmVjdGlvbiIsImRlYnVnIiwiZXJyb3IiLCJjbG9zZSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiY29ubmVjdGlvblRpbWVvdXQiLCJzZXRUaW1lb3V0IiwiRXJyb3IiLCJfY2hhbmdlU3RhdGUiLCJ0aGVuIiwib25yZWFkeSIsInVwZGF0ZUNhcGFiaWxpdHkiLCJjYXRjaCIsImxvZ291dCIsImlkIiwiaW5kZXhPZiIsImNvbW1hbmQiLCJhdHRyaWJ1dGVzIiwiT2JqZWN0IiwiZW50cmllcyIsImV4ZWMiLCJsaXN0IiwibWFwIiwidmFsdWVzIiwia2V5cyIsImZpbHRlciIsIl8iLCJpIiwiX3Nob3VsZFNlbGVjdE1haWxib3giLCJwYXRoIiwiY3R4IiwicHJldmlvdXNTZWxlY3QiLCJnZXRQcmV2aW91c2x5UXVldWVkIiwicmVxdWVzdCIsInBhdGhBdHRyaWJ1dGUiLCJmaW5kIiwiYXR0cmlidXRlIiwidHlwZSIsInZhbHVlIiwic2VsZWN0TWFpbGJveCIsInF1ZXJ5IiwicmVhZE9ubHkiLCJjb25kc3RvcmUiLCJwdXNoIiwibWFpbGJveEluZm8iLCJzdWJzY3JpYmVNYWlsYm94IiwidW5zdWJzY3JpYmVNYWlsYm94IiwibGlzdE5hbWVzcGFjZXMiLCJsaXN0TWFpbGJveGVzIiwidHJlZSIsInJvb3QiLCJjaGlsZHJlbiIsImxpc3RSZXNwb25zZSIsImZvckVhY2giLCJpdGVtIiwiYXR0ciIsImxlbmd0aCIsImRlbGltIiwiYnJhbmNoIiwiX2Vuc3VyZVBhdGgiLCJmbGFncyIsImxpc3RlZCIsImxzdWJSZXNwb25zZSIsImxzdWIiLCJmbGFnIiwic3Vic2NyaWJlZCIsImNyZWF0ZU1haWxib3giLCJjb2RlIiwiZGVsZXRlTWFpbGJveCIsImxpc3RNZXNzYWdlcyIsInNlcXVlbmNlIiwiaXRlbXMiLCJmYXN0IiwicHJlY2hlY2siLCJzZWFyY2giLCJzZXRGbGFncyIsImtleSIsIkFycmF5IiwiaXNBcnJheSIsImNvbmNhdCIsImFkZCIsInNldCIsInJlbW92ZSIsInN0b3JlIiwiYWN0aW9uIiwidXBsb2FkIiwiZGVzdGluYXRpb24iLCJkZWxldGVNZXNzYWdlcyIsInVzZVVpZFBsdXMiLCJieVVpZCIsInVpZEV4cHVuZ2VDb21tYW5kIiwiY21kIiwiY29weU1lc3NhZ2VzIiwibW92ZU1lc3NhZ2VzIiwiY29tcHJlc3NlZCIsInhvYXV0aDIiLCJ1c2VyIiwic2Vuc2l0aXZlIiwiZXJyb3JSZXNwb25zZUV4cGVjdHNFbXB0eUxpbmUiLCJwYXNzIiwiY2FwYWJpbGl0eSIsInBheWxvYWQiLCJDQVBBQklMSVRZIiwicG9wIiwiY2FwYSIsInRvVXBwZXJDYXNlIiwidHJpbSIsImFjY2VwdFVudGFnZ2VkIiwiYnJlYWtJZGxlIiwiZW5xdWV1ZUNvbW1hbmQiLCJlbnRlcklkbGUiLCJzZW5kIiwic2VjdXJlTW9kZSIsInVwZ3JhZGUiLCJmb3JjZWQiLCJoYXNDYXBhYmlsaXR5IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwibnIiLCJGRVRDSCIsInNoaWZ0IiwibmV3U3RhdGUiLCJkZWxpbWl0ZXIiLCJuYW1lcyIsInNwbGl0IiwiZm91bmQiLCJqIiwiX2NvbXBhcmVNYWlsYm94TmFtZXMiLCJzbGljZSIsImpvaW4iLCJhIiwiYiIsImNyZWF0b3IiLCJjcmVhdGVEZWZhdWx0TG9nZ2VyIiwibXNncyIsIkxPR19MRVZFTF9ERUJVRyIsImluZm8iLCJMT0dfTEVWRUxfSU5GTyIsIkxPR19MRVZFTF9XQVJOIiwiTE9HX0xFVkVMX0VSUk9SIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBUUE7O0FBT0E7O0FBQ0E7O0FBQ0E7O0FBUUE7Ozs7Ozs7O0FBSU8sTUFBTUEsa0JBQWtCLEdBQUcsS0FB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QUNBLFNBQUswQyxNQUFMLEdBQWMsS0FBS3hCLE1BQUwsQ0FBWXdCLE1BQVosR0FBcUI7QUFDakNLLE1BQUFBLEtBQUssRUFBRSxDQUFDLEdBQUd3SSxJQUFKLEtBQWE7QUFBRSxZQUFJQywyQkFBbUIsS0FBS3RKLFFBQTVCLEVBQXNDO0FBQUVRLFVBQUFBLE1BQU0sQ0FBQ0ssS0FBUCxDQUFhd0ksSUFBYjtBQUFvQjtBQUFFLE9BRG5EO0FBRWpDRSxNQUFBQSxJQUFJLEVBQUUsQ0FBQyxHQUFHRixJQUFKLEtBQWE7QUFBRSxZQUFJRywwQkFBa0IsS0FBS3hKLFFBQTNCLEVBQXFDO0FBQUVRLFVBQUFBLE1BQU0sQ0FBQytJLElBQVAsQ0FBWUYsSUFBWjtBQUFtQjtBQUFFLE9BRmhEO0FBR2pDNUksTUFBQUEsSUFBSSxFQUFFLENBQUMsR0FBRzRJLElBQUosS0FBYTtBQUFFLFlBQUlJLDBCQUFrQixLQUFLekosUUFBM0IsRUFBcUM7QUFBRVEsVUFBQUEsTUFBTSxDQUFDQyxJQUFQLENBQVk0SSxJQUFaO0FBQW1CO0FBQUUsT0FIaEQ7QUFJakN2SSxNQUFBQSxLQUFLLEVBQUUsQ0FBQyxHQUFHdUksSUFBSixLQUFhO0FBQUUsWUFBSUssMkJBQW1CLEtBQUsxSixRQUE1QixFQUFzQztBQUFFUSxVQUFBQSxNQUFNLENBQUNNLEtBQVAsQ0FBYXVJLElBQWI7QUFBb0I7QUFBRTtBQUpuRCxLQUFuQztBQU1EOztBQXo2QnlCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgbWFwLCBwaXBlLCB1bmlvbiwgemlwLCBmcm9tUGFpcnMsIHByb3BPciwgcGF0aE9yLCBmbGF0dGVuIH0gZnJvbSAncmFtZGEnXG5pbXBvcnQgeyBpbWFwRGVjb2RlIH0gZnJvbSAnZW1haWxqcy11dGY3J1xuaW1wb3J0IHtcbiAgcGFyc2VBUFBFTkQsXG4gIHBhcnNlQ09QWSxcbiAgcGFyc2VOQU1FU1BBQ0UsXG4gIHBhcnNlU0VMRUNULFxuICBwYXJzZUZFVENILFxuICBwYXJzZVNFQVJDSFxufSBmcm9tICcuL2NvbW1hbmQtcGFyc2VyJ1xuaW1wb3J0IHtcbiAgYnVpbGRGRVRDSENvbW1hbmQsXG4gIGJ1aWxkWE9BdXRoMlRva2VuLFxuICBidWlsZFNFQVJDSENvbW1hbmQsXG4gIGJ1aWxkU1RPUkVDb21tYW5kXG59IGZyb20gJy4vY29tbWFuZC1idWlsZGVyJ1xuXG5pbXBvcnQgY3JlYXRlRGVmYXVsdExvZ2dlciBmcm9tICcuL2xvZ2dlcidcbmltcG9ydCBJbWFwQ2xpZW50IGZyb20gJy4vaW1hcCdcbmltcG9ydCB7XG4gIExPR19MRVZFTF9FUlJPUixcbiAgTE9HX0xFVkVMX1dBUk4sXG4gIExPR19MRVZFTF9JTkZPLFxuICBMT0dfTEVWRUxfREVCVUcsXG4gIExPR19MRVZFTF9BTExcbn0gZnJvbSAnLi9jb21tb24nXG5cbmltcG9ydCB7XG4gIGNoZWNrU3BlY2lhbFVzZVxufSBmcm9tICcuL3NwZWNpYWwtdXNlJ1xuXG5leHBvcnQgY29uc3QgVElNRU9VVF9DT05ORUNUSU9OID0gOTAgKiAxMDAwIC8vIE1pbGxpc2Vjb25kcyB0byB3YWl0IGZvciB0aGUgSU1BUCBncmVldGluZyBmcm9tIHRoZSBzZXJ2ZXJcbmV4cG9ydCBjb25zdCBUSU1FT1VUX05PT1AgPSA2MCAqIDEwMDAgLy8gTWlsbGlzZWNvbmRzIGJldHdlZW4gTk9PUCBjb21tYW5kcyB3aGlsZSBpZGxpbmdcbmV4cG9ydCBjb25zdCBUSU1FT1VUX0lETEUgPSA2MCAqIDEwMDAgLy8gTWlsbGlzZWNvbmRzIHVudGlsIElETEUgY29tbWFuZCBpcyBjYW5jZWxsZWRcblxuZXhwb3J0IGNvbnN0IFNUQVRFX0NPTk5FQ1RJTkcgPSAxXG5leHBvcnQgY29uc3QgU1RBVEVfTk9UX0FVVEhFTlRJQ0FURUQgPSAyXG5leHBvcnQgY29uc3QgU1RBVEVfQVVUSEVOVElDQVRFRCA9IDNcbmV4cG9ydCBjb25zdCBTVEFURV9TRUxFQ1RFRCA9IDRcbmV4cG9ydCBjb25zdCBTVEFURV9MT0dPVVQgPSA1XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0NMSUVOVF9JRCA9IHtcbiAgbmFtZTogJ2VtYWlsanMtaW1hcC1jbGllbnQnXG59XG5cbi8qKlxuICogZW1haWxqcyBJTUFQIGNsaWVudFxuICpcbiAqIEBjb25zdHJ1Y3RvclxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBbaG9zdD0nbG9jYWxob3N0J10gSG9zdG5hbWUgdG8gY29uZW5jdCB0b1xuICogQHBhcmFtIHtOdW1iZXJ9IFtwb3J0PTE0M10gUG9ydCBudW1iZXIgdG8gY29ubmVjdCB0b1xuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBPcHRpb25hbCBvcHRpb25zIG9iamVjdFxuICovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBDbGllbnQge1xuICBjb25zdHJ1Y3RvciAoaG9zdCwgcG9ydCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgdGhpcy50aW1lb3V0Q29ubmVjdGlvbiA9IFRJTUVPVVRfQ09OTkVDVElPTlxuICAgIHRoaXMudGltZW91dE5vb3AgPSBvcHRpb25zLnRpbWVvdXROb29wIHx8IFRJTUVPVVRfTk9PUFxuICAgIHRoaXMudGltZW91dElkbGUgPSBvcHRpb25zLnRpbWVvdXRJZGxlIHx8IFRJTUVPVVRfSURMRVxuXG4gICAgdGhpcy5zZXJ2ZXJJZCA9IGZhbHNlIC8vIFJGQyAyOTcxIFNlcnZlciBJRCBhcyBrZXkgdmFsdWUgcGFpcnNcblxuICAgIC8vIEV2ZW50IHBsYWNlaG9sZGVyc1xuICAgIHRoaXMub25jZXJ0ID0gbnVsbFxuICAgIHRoaXMub251cGRhdGUgPSBudWxsXG4gICAgdGhpcy5vbnNlbGVjdG1haWxib3ggPSBudWxsXG4gICAgdGhpcy5vbmNsb3NlbWFpbGJveCA9IG51bGxcblxuICAgIHRoaXMuX2hvc3QgPSBob3N0XG4gICAgdGhpcy5fY2xpZW50SWQgPSBwcm9wT3IoREVGQVVMVF9DTElFTlRfSUQsICdpZCcsIG9wdGlvbnMpXG4gICAgdGhpcy5fc3RhdGUgPSBmYWxzZSAvLyBDdXJyZW50IHN0YXRlXG4gICAgdGhpcy5fYXV0aGVudGljYXRlZCA9IGZhbHNlIC8vIElzIHRoZSBjb25uZWN0aW9uIGF1dGhlbnRpY2F0ZWRcbiAgICB0aGlzLl9jYXBhYmlsaXR5ID0gW10gLy8gTGlzdCBvZiBleHRlbnNpb25zIHRoZSBzZXJ2ZXIgc3VwcG9ydHNcbiAgICB0aGlzLl9zZWxlY3RlZE1haWxib3ggPSBmYWxzZSAvLyBTZWxlY3RlZCBtYWlsYm94XG4gICAgdGhpcy5fZW50ZXJlZElkbGUgPSBmYWxzZVxuICAgIHRoaXMuX2lkbGVUaW1lb3V0ID0gZmFsc2VcbiAgICB0aGlzLl9lbmFibGVDb21wcmVzc2lvbiA9ICEhb3B0aW9ucy5lbmFibGVDb21wcmVzc2lvblxuICAgIHRoaXMuX2F1dGggPSBvcHRpb25zLmF1dGhcbiAgICB0aGlzLl9yZXF1aXJlVExTID0gISFvcHRpb25zLnJlcXVpcmVUTFNcbiAgICB0aGlzLl9pZ25vcmVUTFMgPSAhIW9wdGlvbnMuaWdub3JlVExTXG4gICAgdGhpcy5faWdub3JlSWRsZUNhcGFiaWxpdHkgPSAhIW9wdGlvbnMuaWdub3JlSWRsZUNhcGFiaWxpdHlcblxuICAgIHRoaXMuY2xpZW50ID0gbmV3IEltYXBDbGllbnQoaG9zdCwgcG9ydCwgb3B0aW9ucykgLy8gSU1BUCBjbGllbnQgb2JqZWN0XG5cbiAgICAvLyBFdmVudCBIYW5kbGVyc1xuICAgIHRoaXMuY2xpZW50Lm9uZXJyb3IgPSB0aGlzLl9vbkVycm9yLmJpbmQodGhpcylcbiAgICB0aGlzLmNsaWVudC5vbmNlcnQgPSAoY2VydCkgPT4gKHRoaXMub25jZXJ0ICYmIHRoaXMub25jZXJ0KGNlcnQpKSAvLyBhbGxvd3MgY2VydGlmaWNhdGUgaGFuZGxpbmcgZm9yIHBsYXRmb3JtcyB3L28gbmF0aXZlIHRscyBzdXBwb3J0XG4gICAgdGhpcy5jbGllbnQub25pZGxlID0gKCkgPT4gdGhpcy5fb25JZGxlKCkgLy8gc3RhcnQgaWRsaW5nXG5cbiAgICAvLyBEZWZhdWx0IGhhbmRsZXJzIGZvciB1bnRhZ2dlZCByZXNwb25zZXNcbiAgICB0aGlzLmNsaWVudC5zZXRIYW5kbGVyKCdjYXBhYmlsaXR5JywgKHJlc3BvbnNlKSA9PiB0aGlzLl91bnRhZ2dlZENhcGFiaWxpdHlIYW5kbGVyKHJlc3BvbnNlKSkgLy8gY2FwYWJpbGl0eSB1cGRhdGVzXG4gICAgdGhpcy5jbGllbnQuc2V0SGFuZGxlcignb2snLCAocmVzcG9uc2UpID0+IHRoaXMuX3VudGFnZ2VkT2tIYW5kbGVyKHJlc3BvbnNlKSkgLy8gbm90aWZpY2F0aW9uc1xuICAgIHRoaXMuY2xpZW50LnNldEhhbmRsZXIoJ2V4aXN0cycsIChyZXNwb25zZSkgPT4gdGhpcy5fdW50YWdnZWRFeGlzdHNIYW5kbGVyKHJlc3BvbnNlKSkgLy8gbWVzc2FnZSBjb3VudCBoYXMgY2hhbmdlZFxuICAgIHRoaXMuY2xpZW50LnNldEhhbmRsZXIoJ2V4cHVuZ2UnLCAocmVzcG9uc2UpID0+IHRoaXMuX3VudGFnZ2VkRXhwdW5nZUhhbmRsZXIocmVzcG9uc2UpKSAvLyBtZXNzYWdlIGhhcyBiZWVuIGRlbGV0ZWRcbiAgICB0aGlzLmNsaWVudC5zZXRIYW5kbGVyKCdmZXRjaCcsIChyZXNwb25zZSkgPT4gdGhpcy5fdW50YWdnZWRGZXRjaEhhbmRsZXIocmVzcG9uc2UpKSAvLyBtZXNzYWdlIGhhcyBiZWVuIHVwZGF0ZWQgKGVnLiBmbGFnIGNoYW5nZSlcblxuICAgIC8vIEFjdGl2YXRlIGxvZ2dpbmdcbiAgICB0aGlzLmNyZWF0ZUxvZ2dlcigpXG4gICAgdGhpcy5sb2dMZXZlbCA9IHByb3BPcihMT0dfTEVWRUxfQUxMLCAnbG9nTGV2ZWwnLCBvcHRpb25zKVxuICB9XG5cbiAgLyoqXG4gICAqIENhbGxlZCBpZiB0aGUgbG93ZXItbGV2ZWwgSW1hcENsaWVudCBoYXMgZW5jb3VudGVyZWQgYW4gdW5yZWNvdmVyYWJsZVxuICAgKiBlcnJvciBkdXJpbmcgb3BlcmF0aW9uLiBDbGVhbnMgdXAgYW5kIHByb3BhZ2F0ZXMgdGhlIGVycm9yIHVwd2FyZHMuXG4gICAqL1xuICBfb25FcnJvciAoZXJyKSB7XG4gICAgLy8gbWFrZSBzdXJlIG5vIGlkbGUgdGltZW91dCBpcyBwZW5kaW5nIGFueW1vcmVcbiAgICBjbGVhclRpbWVvdXQodGhpcy5faWRsZVRpbWVvdXQpXG5cbiAgICAvLyBwcm9wYWdhdGUgdGhlIGVycm9yIHVwd2FyZHNcbiAgICB0aGlzLm9uZXJyb3IgJiYgdGhpcy5vbmVycm9yKGVycilcbiAgfVxuXG4gIC8vXG4gIC8vXG4gIC8vIFBVQkxJQyBBUElcbiAgLy9cbiAgLy9cblxuICAvKipcbiAgICogSW5pdGlhdGUgY29ubmVjdGlvbiBhbmQgbG9naW4gdG8gdGhlIElNQVAgc2VydmVyXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdoZW4gbG9naW4gcHJvY2VkdXJlIGlzIGNvbXBsZXRlXG4gICAqL1xuICBhc3luYyBjb25uZWN0ICgpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5vcGVuQ29ubmVjdGlvbigpXG4gICAgICBhd2FpdCB0aGlzLnVwZ3JhZGVDb25uZWN0aW9uKClcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMudXBkYXRlSWQodGhpcy5fY2xpZW50SWQpXG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgdGhpcy5sb2dnZXIud2FybignRmFpbGVkIHRvIHVwZGF0ZSBzZXJ2ZXIgaWQhJywgZXJyLm1lc3NhZ2UpXG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMubG9naW4odGhpcy5fYXV0aClcbiAgICAgIGF3YWl0IHRoaXMuY29tcHJlc3NDb25uZWN0aW9uKClcbiAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDb25uZWN0aW9uIGVzdGFibGlzaGVkLCByZWFkeSB0byByb2xsIScpXG4gICAgICB0aGlzLmNsaWVudC5vbmVycm9yID0gdGhpcy5fb25FcnJvci5iaW5kKHRoaXMpXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcignQ291bGQgbm90IGNvbm5lY3QgdG8gc2VydmVyJywgZXJyKVxuICAgICAgdGhpcy5jbG9zZShlcnIpIC8vIHdlIGRvbid0IHJlYWxseSBjYXJlIHdoZXRoZXIgdGhpcyB3b3JrcyBvciBub3RcbiAgICAgIHRocm93IGVyclxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBJbml0aWF0ZSBjb25uZWN0aW9uIHRvIHRoZSBJTUFQIHNlcnZlclxuICAgKlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gY2FwYWJpbGl0eSBvZiBzZXJ2ZXIgd2l0aG91dCBsb2dpblxuICAgKi9cbiAgb3BlbkNvbm5lY3Rpb24gKCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCBjb25uZWN0aW9uVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4gcmVqZWN0KG5ldyBFcnJvcignVGltZW91dCBjb25uZWN0aW5nIHRvIHNlcnZlcicpKSwgdGhpcy50aW1lb3V0Q29ubmVjdGlvbilcbiAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDb25uZWN0aW5nIHRvJywgdGhpcy5jbGllbnQuaG9zdCwgJzonLCB0aGlzLmNsaWVudC5wb3J0KVxuICAgICAgdGhpcy5fY2hhbmdlU3RhdGUoU1RBVEVfQ09OTkVDVElORylcbiAgICAgIHRoaXMuY2xpZW50LmNvbm5lY3QoKS50aGVuKCgpID0+IHtcbiAgICAgICAgdGhpcy5sb2dnZXIuZGVidWcoJ1NvY2tldCBvcGVuZWQsIHdhaXRpbmcgZm9yIGdyZWV0aW5nIGZyb20gdGhlIHNlcnZlci4uLicpXG5cbiAgICAgICAgdGhpcy5jbGllbnQub25yZWFkeSA9ICgpID0+IHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQoY29ubmVjdGlvblRpbWVvdXQpXG4gICAgICAgICAgdGhpcy5fY2hhbmdlU3RhdGUoU1RBVEVfTk9UX0FVVEhFTlRJQ0FURUQpXG4gICAgICAgICAgdGhpcy51cGRhdGVDYXBhYmlsaXR5KClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHJlc29sdmUodGhpcy5fY2FwYWJpbGl0eSkpXG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmNsaWVudC5vbmVycm9yID0gKGVycikgPT4ge1xuICAgICAgICAgIGNsZWFyVGltZW91dChjb25uZWN0aW9uVGltZW91dClcbiAgICAgICAgICByZWplY3QoZXJyKVxuICAgICAgICB9XG4gICAgICB9KS5jYXRjaChyZWplY3QpXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBMb2dvdXRcbiAgICpcbiAgICogU2VuZCBMT0dPVVQsIHRvIHdoaWNoIHRoZSBzZXJ2ZXIgcmVzcG9uZHMgYnkgY2xvc2luZyB0aGUgY29ubmVjdGlvbi5cbiAgICogVXNlIGlzIGRpc2NvdXJhZ2VkIGlmIG5ldHdvcmsgc3RhdHVzIGlzIHVuY2xlYXIhIElmIG5ldHdvcmtzIHN0YXR1cyBpc1xuICAgKiB1bmNsZWFyLCBwbGVhc2UgdXNlICNjbG9zZSBpbnN0ZWFkIVxuICAgKlxuICAgKiBMT0dPVVQgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMS4zXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBSZXNvbHZlcyB3aGVuIHNlcnZlciBoYXMgY2xvc2VkIHRoZSBjb25uZWN0aW9uXG4gICAqL1xuICBhc3luYyBsb2dvdXQgKCkge1xuICAgIHRoaXMuX2NoYW5nZVN0YXRlKFNUQVRFX0xPR09VVClcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnTG9nZ2luZyBvdXQuLi4nKVxuICAgIGF3YWl0IHRoaXMuY2xpZW50LmxvZ291dCgpXG4gICAgY2xlYXJUaW1lb3V0KHRoaXMuX2lkbGVUaW1lb3V0KVxuICB9XG5cbiAgLyoqXG4gICAqIEZvcmNlLWNsb3NlcyB0aGUgY3VycmVudCBjb25uZWN0aW9uIGJ5IGNsb3NpbmcgdGhlIFRDUCBzb2NrZXQuXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBSZXNvbHZlcyB3aGVuIHNvY2tldCBpcyBjbG9zZWRcbiAgICovXG4gIGFzeW5jIGNsb3NlIChlcnIpIHtcbiAgICB0aGlzLl9jaGFuZ2VTdGF0ZShTVEFURV9MT0dPVVQpXG4gICAgY2xlYXJUaW1lb3V0KHRoaXMuX2lkbGVUaW1lb3V0KVxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDbG9zaW5nIGNvbm5lY3Rpb24uLi4nKVxuICAgIGF3YWl0IHRoaXMuY2xpZW50LmNsb3NlKGVycilcbiAgICBjbGVhclRpbWVvdXQodGhpcy5faWRsZVRpbWVvdXQpXG4gIH1cblxuICAvKipcbiAgICogUnVucyBJRCBjb21tYW5kLCBwYXJzZXMgSUQgcmVzcG9uc2UsIHNldHMgdGhpcy5zZXJ2ZXJJZFxuICAgKlxuICAgKiBJRCBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzI5NzFcbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IGlkIElEIGFzIEpTT04gb2JqZWN0LiBTZWUgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMjk3MSNzZWN0aW9uLTMuMyBmb3IgcG9zc2libGUgdmFsdWVzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBSZXNvbHZlcyB3aGVuIHJlc3BvbnNlIGhhcyBiZWVuIHBhcnNlZFxuICAgKi9cbiAgYXN5bmMgdXBkYXRlSWQgKGlkKSB7XG4gICAgaWYgKHRoaXMuX2NhcGFiaWxpdHkuaW5kZXhPZignSUQnKSA8IDApIHJldHVyblxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ1VwZGF0aW5nIGlkLi4uJylcblxuICAgIGNvbnN0IGNvbW1hbmQgPSAnSUQnXG4gICAgY29uc3QgYXR0cmlidXRlcyA9IGlkID8gW2ZsYXR0ZW4oT2JqZWN0LmVudHJpZXMoaWQpKV0gOiBbbnVsbF1cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyh7IGNvbW1hbmQsIGF0dHJpYnV0ZXMgfSwgJ0lEJylcbiAgICBjb25zdCBsaXN0ID0gZmxhdHRlbihwYXRoT3IoW10sIFsncGF5bG9hZCcsICdJRCcsICcwJywgJ2F0dHJpYnV0ZXMnLCAnMCddLCByZXNwb25zZSkubWFwKE9iamVjdC52YWx1ZXMpKVxuICAgIGNvbnN0IGtleXMgPSBsaXN0LmZpbHRlcigoXywgaSkgPT4gaSAlIDIgPT09IDApXG4gICAgY29uc3QgdmFsdWVzID0gbGlzdC5maWx0ZXIoKF8sIGkpID0+IGkgJSAyID09PSAxKVxuICAgIHRoaXMuc2VydmVySWQgPSBmcm9tUGFpcnMoemlwKGtleXMsIHZhbHVlcykpXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ1NlcnZlciBpZCB1cGRhdGVkIScsIHRoaXMuc2VydmVySWQpXG4gIH1cblxuICBfc2hvdWxkU2VsZWN0TWFpbGJveCAocGF0aCwgY3R4KSB7XG4gICAgaWYgKCFjdHgpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgY29uc3QgcHJldmlvdXNTZWxlY3QgPSB0aGlzLmNsaWVudC5nZXRQcmV2aW91c2x5UXVldWVkKFsnU0VMRUNUJywgJ0VYQU1JTkUnXSwgY3R4KVxuICAgIGlmIChwcmV2aW91c1NlbGVjdCAmJiBwcmV2aW91c1NlbGVjdC5yZXF1ZXN0LmF0dHJpYnV0ZXMpIHtcbiAgICAgIGNvbnN0IHBhdGhBdHRyaWJ1dGUgPSBwcmV2aW91c1NlbGVjdC5yZXF1ZXN0LmF0dHJpYnV0ZXMuZmluZCgoYXR0cmlidXRlKSA9PiBhdHRyaWJ1dGUudHlwZSA9PT0gJ1NUUklORycpXG4gICAgICBpZiAocGF0aEF0dHJpYnV0ZSkge1xuICAgICAgICByZXR1cm4gcGF0aEF0dHJpYnV0ZS52YWx1ZSAhPT0gcGF0aFxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9zZWxlY3RlZE1haWxib3ggIT09IHBhdGhcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIFNFTEVDVCBvciBFWEFNSU5FIHRvIG9wZW4gYSBtYWlsYm94XG4gICAqXG4gICAqIFNFTEVDVCBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjMuMVxuICAgKiBFWEFNSU5FIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMy4yXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIEZ1bGwgcGF0aCB0byBtYWlsYm94XG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gT3B0aW9ucyBvYmplY3RcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2Ugd2l0aCBpbmZvcm1hdGlvbiBhYm91dCB0aGUgc2VsZWN0ZWQgbWFpbGJveFxuICAgKi9cbiAgYXN5bmMgc2VsZWN0TWFpbGJveCAocGF0aCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgY29uc3QgcXVlcnkgPSB7XG4gICAgICBjb21tYW5kOiBvcHRpb25zLnJlYWRPbmx5ID8gJ0VYQU1JTkUnIDogJ1NFTEVDVCcsXG4gICAgICBhdHRyaWJ1dGVzOiBbeyB0eXBlOiAnU1RSSU5HJywgdmFsdWU6IHBhdGggfV1cbiAgICB9XG5cbiAgICBpZiAob3B0aW9ucy5jb25kc3RvcmUgJiYgdGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdDT05EU1RPUkUnKSA+PSAwKSB7XG4gICAgICBxdWVyeS5hdHRyaWJ1dGVzLnB1c2goW3sgdHlwZTogJ0FUT00nLCB2YWx1ZTogJ0NPTkRTVE9SRScgfV0pXG4gICAgfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ09wZW5pbmcnLCBwYXRoLCAnLi4uJylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyhxdWVyeSwgWydFWElTVFMnLCAnRkxBR1MnLCAnT0snXSwgeyBjdHg6IG9wdGlvbnMuY3R4IH0pXG4gICAgY29uc3QgbWFpbGJveEluZm8gPSBwYXJzZVNFTEVDVChyZXNwb25zZSlcblxuICAgIHRoaXMuX2NoYW5nZVN0YXRlKFNUQVRFX1NFTEVDVEVEKVxuXG4gICAgaWYgKHRoaXMuX3NlbGVjdGVkTWFpbGJveCAhPT0gcGF0aCAmJiB0aGlzLm9uY2xvc2VtYWlsYm94KSB7XG4gICAgICBhd2FpdCB0aGlzLm9uY2xvc2VtYWlsYm94KHRoaXMuX3NlbGVjdGVkTWFpbGJveClcbiAgICB9XG4gICAgdGhpcy5fc2VsZWN0ZWRNYWlsYm94ID0gcGF0aFxuICAgIGlmICh0aGlzLm9uc2VsZWN0bWFpbGJveCkge1xuICAgICAgYXdhaXQgdGhpcy5vbnNlbGVjdG1haWxib3gocGF0aCwgbWFpbGJveEluZm8pXG4gICAgfVxuXG4gICAgcmV0dXJuIG1haWxib3hJbmZvXG4gIH1cblxuICAvKipcbiAgICogU3Vic2NyaWJlIHRvIGEgbWFpbGJveCB3aXRoIHRoZSBnaXZlbiBwYXRoXG4gICAqXG4gICAqIFNVQlNDUklCRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjZcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogICAgIFRoZSBwYXRoIG9mIHRoZSBtYWlsYm94IHlvdSB3b3VsZCBsaWtlIHRvIHN1YnNjcmliZSB0by5cbiAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAqICAgICBQcm9taXNlIHJlc29sdmVzIGlmIG1haWxib3ggaXMgbm93IHN1YnNjcmliZWQgdG8gb3Igd2FzIHNvIGFscmVhZHkuXG4gICAqL1xuICBhc3luYyBzdWJzY3JpYmVNYWlsYm94IChwYXRoKSB7XG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ1N1YnNjcmliaW5nIHRvIG1haWxib3gnLCBwYXRoLCAnLi4uJylcbiAgICByZXR1cm4gdGhpcy5leGVjKHsgY29tbWFuZDogJ1NVQlNDUklCRScsIGF0dHJpYnV0ZXM6IFtwYXRoXSB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFVuc3Vic2NyaWJlIGZyb20gYSBtYWlsYm94IHdpdGggdGhlIGdpdmVuIHBhdGhcbiAgICpcbiAgICogVU5TVUJTQ1JJQkUgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMy43XG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoXG4gICAqICAgICBUaGUgcGF0aCBvZiB0aGUgbWFpbGJveCB5b3Ugd291bGQgbGlrZSB0byB1bnN1YnNjcmliZSBmcm9tLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICogICAgIFByb21pc2UgcmVzb2x2ZXMgaWYgbWFpbGJveCBpcyBubyBsb25nZXIgc3Vic2NyaWJlZCB0byBvciB3YXMgbm90IGJlZm9yZS5cbiAgICovXG4gIGFzeW5jIHVuc3Vic2NyaWJlTWFpbGJveCAocGF0aCkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdVbnN1YnNjcmliaW5nIHRvIG1haWxib3gnLCBwYXRoLCAnLi4uJylcbiAgICByZXR1cm4gdGhpcy5leGVjKHsgY29tbWFuZDogJ1VOU1VCU0NSSUJFJywgYXR0cmlidXRlczogW3BhdGhdIH0pXG4gIH1cblxuICAvKipcbiAgICogUnVucyBOQU1FU1BBQ0UgY29tbWFuZFxuICAgKlxuICAgKiBOQU1FU1BBQ0UgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMjM0MlxuICAgKlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIG5hbWVzcGFjZSBvYmplY3RcbiAgICovXG4gIGFzeW5jIGxpc3ROYW1lc3BhY2VzICgpIHtcbiAgICBpZiAodGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdOQU1FU1BBQ0UnKSA8IDApIHJldHVybiBmYWxzZVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0xpc3RpbmcgbmFtZXNwYWNlcy4uLicpXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmV4ZWMoJ05BTUVTUEFDRScsICdOQU1FU1BBQ0UnKVxuICAgIHJldHVybiBwYXJzZU5BTUVTUEFDRShyZXNwb25zZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIExJU1QgYW5kIExTVUIgY29tbWFuZHMuIFJldHJpZXZlcyBhIHRyZWUgb2YgYXZhaWxhYmxlIG1haWxib3hlc1xuICAgKlxuICAgKiBMSVNUIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMy44XG4gICAqIExTVUIgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjlcbiAgICpcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2Ugd2l0aCBsaXN0IG9mIG1haWxib3hlc1xuICAgKi9cbiAgYXN5bmMgbGlzdE1haWxib3hlcyAoKSB7XG4gICAgY29uc3QgdHJlZSA9IHsgcm9vdDogdHJ1ZSwgY2hpbGRyZW46IFtdIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdMaXN0aW5nIG1haWxib3hlcy4uLicpXG4gICAgY29uc3QgbGlzdFJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKHsgY29tbWFuZDogJ0xJU1QnLCBhdHRyaWJ1dGVzOiBbJycsICcqJ10gfSwgJ0xJU1QnKVxuICAgIGNvbnN0IGxpc3QgPSBwYXRoT3IoW10sIFsncGF5bG9hZCcsICdMSVNUJ10sIGxpc3RSZXNwb25zZSlcbiAgICBsaXN0LmZvckVhY2goaXRlbSA9PiB7XG4gICAgICBjb25zdCBhdHRyID0gcHJvcE9yKFtdLCAnYXR0cmlidXRlcycsIGl0ZW0pXG4gICAgICBpZiAoYXR0ci5sZW5ndGggPCAzKSByZXR1cm5cblxuICAgICAgY29uc3QgcGF0aCA9IHBhdGhPcignJywgWycyJywgJ3ZhbHVlJ10sIGF0dHIpXG4gICAgICBjb25zdCBkZWxpbSA9IHBhdGhPcignLycsIFsnMScsICd2YWx1ZSddLCBhdHRyKVxuICAgICAgY29uc3QgYnJhbmNoID0gdGhpcy5fZW5zdXJlUGF0aCh0cmVlLCBwYXRoLCBkZWxpbSlcbiAgICAgIGJyYW5jaC5mbGFncyA9IHByb3BPcihbXSwgJzAnLCBhdHRyKS5tYXAoKHsgdmFsdWUgfSkgPT4gdmFsdWUgfHwgJycpXG4gICAgICBicmFuY2gubGlzdGVkID0gdHJ1ZVxuICAgICAgY2hlY2tTcGVjaWFsVXNlKGJyYW5jaClcbiAgICB9KVxuXG4gICAgY29uc3QgbHN1YlJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKHsgY29tbWFuZDogJ0xTVUInLCBhdHRyaWJ1dGVzOiBbJycsICcqJ10gfSwgJ0xTVUInKVxuICAgIGNvbnN0IGxzdWIgPSBwYXRoT3IoW10sIFsncGF5bG9hZCcsICdMU1VCJ10sIGxzdWJSZXNwb25zZSlcbiAgICBsc3ViLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICAgIGNvbnN0IGF0dHIgPSBwcm9wT3IoW10sICdhdHRyaWJ1dGVzJywgaXRlbSlcbiAgICAgIGlmIChhdHRyLmxlbmd0aCA8IDMpIHJldHVyblxuXG4gICAgICBjb25zdCBwYXRoID0gcGF0aE9yKCcnLCBbJzInLCAndmFsdWUnXSwgYXR0cilcbiAgICAgIGNvbnN0IGRlbGltID0gcGF0aE9yKCcvJywgWycxJywgJ3ZhbHVlJ10sIGF0dHIpXG4gICAgICBjb25zdCBicmFuY2ggPSB0aGlzLl9lbnN1cmVQYXRoKHRyZWUsIHBhdGgsIGRlbGltKVxuICAgICAgcHJvcE9yKFtdLCAnMCcsIGF0dHIpLm1hcCgoZmxhZyA9ICcnKSA9PiB7IGJyYW5jaC5mbGFncyA9IHVuaW9uKGJyYW5jaC5mbGFncywgW2ZsYWddKSB9KVxuICAgICAgYnJhbmNoLnN1YnNjcmliZWQgPSB0cnVlXG4gICAgfSlcblxuICAgIHJldHVybiB0cmVlXG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgbWFpbGJveCB3aXRoIHRoZSBnaXZlbiBwYXRoLlxuICAgKlxuICAgKiBDUkVBVEUgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjNcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogICAgIFRoZSBwYXRoIG9mIHRoZSBtYWlsYm94IHlvdSB3b3VsZCBsaWtlIHRvIGNyZWF0ZS5cbiAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAqICAgICBQcm9taXNlIHJlc29sdmVzIGlmIG1haWxib3ggd2FzIGNyZWF0ZWQuXG4gICAqICAgICBJbiB0aGUgZXZlbnQgdGhlIHNlcnZlciBzYXlzIE5PIFtBTFJFQURZRVhJU1RTXSwgd2UgdHJlYXQgdGhhdCBhcyBzdWNjZXNzLlxuICAgKi9cbiAgYXN5bmMgY3JlYXRlTWFpbGJveCAocGF0aCkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDcmVhdGluZyBtYWlsYm94JywgcGF0aCwgJy4uLicpXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuZXhlYyh7IGNvbW1hbmQ6ICdDUkVBVEUnLCBhdHRyaWJ1dGVzOiBbcGF0aF0gfSlcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGlmIChlcnIgJiYgZXJyLmNvZGUgPT09ICdBTFJFQURZRVhJU1RTJykge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHRocm93IGVyclxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBEZWxldGUgYSBtYWlsYm94IHdpdGggdGhlIGdpdmVuIHBhdGguXG4gICAqXG4gICAqIERFTEVURSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjRcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogICAgIFRoZSBwYXRoIG9mIHRoZSBtYWlsYm94IHlvdSB3b3VsZCBsaWtlIHRvIGRlbGV0ZS5cbiAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAqICAgICBQcm9taXNlIHJlc29sdmVzIGlmIG1haWxib3ggd2FzIGRlbGV0ZWQuXG4gICAqL1xuICBkZWxldGVNYWlsYm94IChwYXRoKSB7XG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0RlbGV0aW5nIG1haWxib3gnLCBwYXRoLCAnLi4uJylcbiAgICByZXR1cm4gdGhpcy5leGVjKHsgY29tbWFuZDogJ0RFTEVURScsIGF0dHJpYnV0ZXM6IFtwYXRoXSB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgRkVUQ0ggY29tbWFuZFxuICAgKlxuICAgKiBGRVRDSCBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjQuNVxuICAgKiBDSEFOR0VEU0lOQ0UgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNDU1MSNzZWN0aW9uLTMuM1xuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBmb3IgdGhlIG1haWxib3ggd2hpY2ggc2hvdWxkIGJlIHNlbGVjdGVkIGZvciB0aGUgY29tbWFuZC4gU2VsZWN0cyBtYWlsYm94IGlmIG5lY2Vzc2FyeVxuICAgKiBAcGFyYW0ge1N0cmluZ30gc2VxdWVuY2UgU2VxdWVuY2Ugc2V0LCBlZyAxOiogZm9yIGFsbCBtZXNzYWdlc1xuICAgKiBAcGFyYW0ge09iamVjdH0gW2l0ZW1zXSBNZXNzYWdlIGRhdGEgaXRlbSBuYW1lcyBvciBtYWNyb1xuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIHRoZSBmZXRjaGVkIG1lc3NhZ2UgaW5mb1xuICAgKi9cbiAgYXN5bmMgbGlzdE1lc3NhZ2VzIChwYXRoLCBzZXF1ZW5jZSwgaXRlbXMgPSBbeyBmYXN0OiB0cnVlIH1dLCBvcHRpb25zID0ge30pIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnRmV0Y2hpbmcgbWVzc2FnZXMnLCBzZXF1ZW5jZSwgJ2Zyb20nLCBwYXRoLCAnLi4uJylcbiAgICBjb25zdCBjb21tYW5kID0gYnVpbGRGRVRDSENvbW1hbmQoc2VxdWVuY2UsIGl0ZW1zLCBvcHRpb25zKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKGNvbW1hbmQsICdGRVRDSCcsIHtcbiAgICAgIHByZWNoZWNrOiAoY3R4KSA9PiB0aGlzLl9zaG91bGRTZWxlY3RNYWlsYm94KHBhdGgsIGN0eCkgPyB0aGlzLnNlbGVjdE1haWxib3gocGF0aCwgeyBjdHggfSkgOiBQcm9taXNlLnJlc29sdmUoKVxuICAgIH0pXG4gICAgcmV0dXJuIHBhcnNlRkVUQ0gocmVzcG9uc2UpXG4gIH1cblxuICAvKipcbiAgICogUnVucyBTRUFSQ0ggY29tbWFuZFxuICAgKlxuICAgKiBTRUFSQ0ggZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi40LjRcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtPYmplY3R9IHF1ZXJ5IFNlYXJjaCB0ZXJtc1xuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIHRoZSBhcnJheSBvZiBtYXRjaGluZyBzZXEuIG9yIHVpZCBudW1iZXJzXG4gICAqL1xuICBhc3luYyBzZWFyY2ggKHBhdGgsIHF1ZXJ5LCBvcHRpb25zID0ge30pIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnU2VhcmNoaW5nIGluJywgcGF0aCwgJy4uLicpXG4gICAgY29uc3QgY29tbWFuZCA9IGJ1aWxkU0VBUkNIQ29tbWFuZChxdWVyeSwgb3B0aW9ucylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyhjb21tYW5kLCAnU0VBUkNIJywge1xuICAgICAgcHJlY2hlY2s6IChjdHgpID0+IHRoaXMuX3Nob3VsZFNlbGVjdE1haWxib3gocGF0aCwgY3R4KSA/IHRoaXMuc2VsZWN0TWFpbGJveChwYXRoLCB7IGN0eCB9KSA6IFByb21pc2UucmVzb2x2ZSgpXG4gICAgfSlcbiAgICByZXR1cm4gcGFyc2VTRUFSQ0gocmVzcG9uc2UpXG4gIH1cblxuICAvKipcbiAgICogUnVucyBTVE9SRSBjb21tYW5kXG4gICAqXG4gICAqIFNUT1JFIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuNC42XG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIGZvciB0aGUgbWFpbGJveCB3aGljaCBzaG91bGQgYmUgc2VsZWN0ZWQgZm9yIHRoZSBjb21tYW5kLiBTZWxlY3RzIG1haWxib3ggaWYgbmVjZXNzYXJ5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzZXF1ZW5jZSBNZXNzYWdlIHNlbGVjdG9yIHdoaWNoIHRoZSBmbGFnIGNoYW5nZSBpcyBhcHBsaWVkIHRvXG4gICAqIEBwYXJhbSB7QXJyYXl9IGZsYWdzXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gUXVlcnkgbW9kaWZpZXJzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggdGhlIGFycmF5IG9mIG1hdGNoaW5nIHNlcS4gb3IgdWlkIG51bWJlcnNcbiAgICovXG4gIHNldEZsYWdzIChwYXRoLCBzZXF1ZW5jZSwgZmxhZ3MsIG9wdGlvbnMpIHtcbiAgICBsZXQga2V5ID0gJydcbiAgICBsZXQgbGlzdCA9IFtdXG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShmbGFncykgfHwgdHlwZW9mIGZsYWdzICE9PSAnb2JqZWN0Jykge1xuICAgICAgbGlzdCA9IFtdLmNvbmNhdChmbGFncyB8fCBbXSlcbiAgICAgIGtleSA9ICcnXG4gICAgfSBlbHNlIGlmIChmbGFncy5hZGQpIHtcbiAgICAgIGxpc3QgPSBbXS5jb25jYXQoZmxhZ3MuYWRkIHx8IFtdKVxuICAgICAga2V5ID0gJysnXG4gICAgfSBlbHNlIGlmIChmbGFncy5zZXQpIHtcbiAgICAgIGtleSA9ICcnXG4gICAgICBsaXN0ID0gW10uY29uY2F0KGZsYWdzLnNldCB8fCBbXSlcbiAgICB9IGVsc2UgaWYgKGZsYWdzLnJlbW92ZSkge1xuICAgICAga2V5ID0gJy0nXG4gICAgICBsaXN0ID0gW10uY29uY2F0KGZsYWdzLnJlbW92ZSB8fCBbXSlcbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnU2V0dGluZyBmbGFncyBvbicsIHNlcXVlbmNlLCAnaW4nLCBwYXRoLCAnLi4uJylcbiAgICByZXR1cm4gdGhpcy5zdG9yZShwYXRoLCBzZXF1ZW5jZSwga2V5ICsgJ0ZMQUdTJywgbGlzdCwgb3B0aW9ucylcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIFNUT1JFIGNvbW1hbmRcbiAgICpcbiAgICogU1RPUkUgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi40LjZcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHNlcXVlbmNlIE1lc3NhZ2Ugc2VsZWN0b3Igd2hpY2ggdGhlIGZsYWcgY2hhbmdlIGlzIGFwcGxpZWQgdG9cbiAgICogQHBhcmFtIHtTdHJpbmd9IGFjdGlvbiBTVE9SRSBtZXRob2QgdG8gY2FsbCwgZWcgXCIrRkxBR1NcIlxuICAgKiBAcGFyYW0ge0FycmF5fSBmbGFnc1xuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIHRoZSBhcnJheSBvZiBtYXRjaGluZyBzZXEuIG9yIHVpZCBudW1iZXJzXG4gICAqL1xuICBhc3luYyBzdG9yZSAocGF0aCwgc2VxdWVuY2UsIGFjdGlvbiwgZmxhZ3MsIG9wdGlvbnMgPSB7fSkge1xuICAgIGNvbnN0IGNvbW1hbmQgPSBidWlsZFNUT1JFQ29tbWFuZChzZXF1ZW5jZSwgYWN0aW9uLCBmbGFncywgb3B0aW9ucylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyhjb21tYW5kLCAnRkVUQ0gnLCB7XG4gICAgICBwcmVjaGVjazogKGN0eCkgPT4gdGhpcy5fc2hvdWxkU2VsZWN0TWFpbGJveChwYXRoLCBjdHgpID8gdGhpcy5zZWxlY3RNYWlsYm94KHBhdGgsIHsgY3R4IH0pIDogUHJvbWlzZS5yZXNvbHZlKClcbiAgICB9KVxuICAgIHJldHVybiBwYXJzZUZFVENIKHJlc3BvbnNlKVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgQVBQRU5EIGNvbW1hbmRcbiAgICpcbiAgICogQVBQRU5EIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMy4xMVxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gZGVzdGluYXRpb24gVGhlIG1haWxib3ggd2hlcmUgdG8gYXBwZW5kIHRoZSBtZXNzYWdlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIFRoZSBtZXNzYWdlIHRvIGFwcGVuZFxuICAgKiBAcGFyYW0ge0FycmF5fSBvcHRpb25zLmZsYWdzIEFueSBmbGFncyB5b3Ugd2FudCB0byBzZXQgb24gdGhlIHVwbG9hZGVkIG1lc3NhZ2UuIERlZmF1bHRzIHRvIFtcXFNlZW5dLiAob3B0aW9uYWwpXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggdGhlIGFycmF5IG9mIG1hdGNoaW5nIHNlcS4gb3IgdWlkIG51bWJlcnNcbiAgICovXG4gIGFzeW5jIHVwbG9hZCAoZGVzdGluYXRpb24sIG1lc3NhZ2UsIG9wdGlvbnMgPSB7fSkge1xuICAgIGNvbnN0IGZsYWdzID0gcHJvcE9yKFsnXFxcXFNlZW4nXSwgJ2ZsYWdzJywgb3B0aW9ucykubWFwKHZhbHVlID0+ICh7IHR5cGU6ICdhdG9tJywgdmFsdWUgfSkpXG4gICAgY29uc3QgY29tbWFuZCA9IHtcbiAgICAgIGNvbW1hbmQ6ICdBUFBFTkQnLFxuICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICB7IHR5cGU6ICdhdG9tJywgdmFsdWU6IGRlc3RpbmF0aW9uIH0sXG4gICAgICAgIGZsYWdzLFxuICAgICAgICB7IHR5cGU6ICdsaXRlcmFsJywgdmFsdWU6IG1lc3NhZ2UgfVxuICAgICAgXVxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdVcGxvYWRpbmcgbWVzc2FnZSB0bycsIGRlc3RpbmF0aW9uLCAnLi4uJylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyhjb21tYW5kKVxuICAgIHJldHVybiBwYXJzZUFQUEVORChyZXNwb25zZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBEZWxldGVzIG1lc3NhZ2VzIGZyb20gYSBzZWxlY3RlZCBtYWlsYm94XG4gICAqXG4gICAqIEVYUFVOR0UgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi40LjNcbiAgICogVUlEIEVYUFVOR0UgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNDMxNSNzZWN0aW9uLTIuMVxuICAgKlxuICAgKiBJZiBwb3NzaWJsZSAoYnlVaWQ6dHJ1ZSBhbmQgVUlEUExVUyBleHRlbnNpb24gc3VwcG9ydGVkKSwgdXNlcyBVSUQgRVhQVU5HRVxuICAgKiBjb21tYW5kIHRvIGRlbGV0ZSBhIHJhbmdlIG9mIG1lc3NhZ2VzLCBvdGhlcndpc2UgZmFsbHMgYmFjayB0byBFWFBVTkdFLlxuICAgKlxuICAgKiBOQiEgVGhpcyBtZXRob2QgbWlnaHQgYmUgZGVzdHJ1Y3RpdmUgLSBpZiBFWFBVTkdFIGlzIHVzZWQsIHRoZW4gYW55IG1lc3NhZ2VzXG4gICAqIHdpdGggXFxEZWxldGVkIGZsYWcgc2V0IGFyZSBkZWxldGVkXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIGZvciB0aGUgbWFpbGJveCB3aGljaCBzaG91bGQgYmUgc2VsZWN0ZWQgZm9yIHRoZSBjb21tYW5kLiBTZWxlY3RzIG1haWxib3ggaWYgbmVjZXNzYXJ5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzZXF1ZW5jZSBNZXNzYWdlIHJhbmdlIHRvIGJlIGRlbGV0ZWRcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBRdWVyeSBtb2RpZmllcnNcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2VcbiAgICovXG4gIGFzeW5jIGRlbGV0ZU1lc3NhZ2VzIChwYXRoLCBzZXF1ZW5jZSwgb3B0aW9ucyA9IHt9KSB7XG4gICAgLy8gYWRkIFxcRGVsZXRlZCBmbGFnIHRvIHRoZSBtZXNzYWdlcyBhbmQgcnVuIEVYUFVOR0Ugb3IgVUlEIEVYUFVOR0VcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnRGVsZXRpbmcgbWVzc2FnZXMnLCBzZXF1ZW5jZSwgJ2luJywgcGF0aCwgJy4uLicpXG4gICAgY29uc3QgdXNlVWlkUGx1cyA9IG9wdGlvbnMuYnlVaWQgJiYgdGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdVSURQTFVTJykgPj0gMFxuICAgIGNvbnN0IHVpZEV4cHVuZ2VDb21tYW5kID0geyBjb21tYW5kOiAnVUlEIEVYUFVOR0UnLCBhdHRyaWJ1dGVzOiBbeyB0eXBlOiAnc2VxdWVuY2UnLCB2YWx1ZTogc2VxdWVuY2UgfV0gfVxuICAgIGF3YWl0IHRoaXMuc2V0RmxhZ3MocGF0aCwgc2VxdWVuY2UsIHsgYWRkOiAnXFxcXERlbGV0ZWQnIH0sIG9wdGlvbnMpXG4gICAgY29uc3QgY21kID0gdXNlVWlkUGx1cyA/IHVpZEV4cHVuZ2VDb21tYW5kIDogJ0VYUFVOR0UnXG4gICAgcmV0dXJuIHRoaXMuZXhlYyhjbWQsIG51bGwsIHtcbiAgICAgIHByZWNoZWNrOiAoY3R4KSA9PiB0aGlzLl9zaG91bGRTZWxlY3RNYWlsYm94KHBhdGgsIGN0eCkgPyB0aGlzLnNlbGVjdE1haWxib3gocGF0aCwgeyBjdHggfSkgOiBQcm9taXNlLnJlc29sdmUoKVxuICAgIH0pXG4gIH1cblxuICAvKipcbiAgICogQ29waWVzIGEgcmFuZ2Ugb2YgbWVzc2FnZXMgZnJvbSB0aGUgYWN0aXZlIG1haWxib3ggdG8gdGhlIGRlc3RpbmF0aW9uIG1haWxib3guXG4gICAqIFNpbGVudCBtZXRob2QgKHVubGVzcyBhbiBlcnJvciBvY2N1cnMpLCBieSBkZWZhdWx0IHJldHVybnMgbm8gaW5mb3JtYXRpb24uXG4gICAqXG4gICAqIENPUFkgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi40LjdcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHNlcXVlbmNlIE1lc3NhZ2UgcmFuZ2UgdG8gYmUgY29waWVkXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBkZXN0aW5hdGlvbiBEZXN0aW5hdGlvbiBtYWlsYm94IHBhdGhcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBRdWVyeSBtb2RpZmllcnNcbiAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5ieVVpZF0gSWYgdHJ1ZSwgdXNlcyBVSUQgQ09QWSBpbnN0ZWFkIG9mIENPUFlcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2VcbiAgICovXG4gIGFzeW5jIGNvcHlNZXNzYWdlcyAocGF0aCwgc2VxdWVuY2UsIGRlc3RpbmF0aW9uLCBvcHRpb25zID0ge30pIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnQ29weWluZyBtZXNzYWdlcycsIHNlcXVlbmNlLCAnZnJvbScsIHBhdGgsICd0bycsIGRlc3RpbmF0aW9uLCAnLi4uJylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyh7XG4gICAgICBjb21tYW5kOiBvcHRpb25zLmJ5VWlkID8gJ1VJRCBDT1BZJyA6ICdDT1BZJyxcbiAgICAgIGF0dHJpYnV0ZXM6IFtcbiAgICAgICAgeyB0eXBlOiAnc2VxdWVuY2UnLCB2YWx1ZTogc2VxdWVuY2UgfSxcbiAgICAgICAgeyB0eXBlOiAnYXRvbScsIHZhbHVlOiBkZXN0aW5hdGlvbiB9XG4gICAgICBdXG4gICAgfSwgbnVsbCwge1xuICAgICAgcHJlY2hlY2s6IChjdHgpID0+IHRoaXMuX3Nob3VsZFNlbGVjdE1haWxib3gocGF0aCwgY3R4KSA/IHRoaXMuc2VsZWN0TWFpbGJveChwYXRoLCB7IGN0eCB9KSA6IFByb21pc2UucmVzb2x2ZSgpXG4gICAgfSlcbiAgICByZXR1cm4gcGFyc2VDT1BZKHJlc3BvbnNlKVxuICB9XG5cbiAgLyoqXG4gICAqIE1vdmVzIGEgcmFuZ2Ugb2YgbWVzc2FnZXMgZnJvbSB0aGUgYWN0aXZlIG1haWxib3ggdG8gdGhlIGRlc3RpbmF0aW9uIG1haWxib3guXG4gICAqIFByZWZlcnMgdGhlIE1PVkUgZXh0ZW5zaW9uIGJ1dCBpZiBub3QgYXZhaWxhYmxlLCBmYWxscyBiYWNrIHRvXG4gICAqIENPUFkgKyBFWFBVTkdFXG4gICAqXG4gICAqIE1PVkUgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM2ODUxXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIGZvciB0aGUgbWFpbGJveCB3aGljaCBzaG91bGQgYmUgc2VsZWN0ZWQgZm9yIHRoZSBjb21tYW5kLiBTZWxlY3RzIG1haWxib3ggaWYgbmVjZXNzYXJ5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzZXF1ZW5jZSBNZXNzYWdlIHJhbmdlIHRvIGJlIG1vdmVkXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBkZXN0aW5hdGlvbiBEZXN0aW5hdGlvbiBtYWlsYm94IHBhdGhcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBRdWVyeSBtb2RpZmllcnNcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2VcbiAgICovXG4gIGFzeW5jIG1vdmVNZXNzYWdlcyAocGF0aCwgc2VxdWVuY2UsIGRlc3RpbmF0aW9uLCBvcHRpb25zID0ge30pIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnTW92aW5nIG1lc3NhZ2VzJywgc2VxdWVuY2UsICdmcm9tJywgcGF0aCwgJ3RvJywgZGVzdGluYXRpb24sICcuLi4nKVxuXG4gICAgaWYgKHRoaXMuX2NhcGFiaWxpdHkuaW5kZXhPZignTU9WRScpID09PSAtMSkge1xuICAgICAgLy8gRmFsbGJhY2sgdG8gQ09QWSArIEVYUFVOR0VcbiAgICAgIGF3YWl0IHRoaXMuY29weU1lc3NhZ2VzKHBhdGgsIHNlcXVlbmNlLCBkZXN0aW5hdGlvbiwgb3B0aW9ucylcbiAgICAgIHJldHVybiB0aGlzLmRlbGV0ZU1lc3NhZ2VzKHBhdGgsIHNlcXVlbmNlLCBvcHRpb25zKVxuICAgIH1cblxuICAgIC8vIElmIHBvc3NpYmxlLCB1c2UgTU9WRVxuICAgIHJldHVybiB0aGlzLmV4ZWMoe1xuICAgICAgY29tbWFuZDogb3B0aW9ucy5ieVVpZCA/ICdVSUQgTU9WRScgOiAnTU9WRScsXG4gICAgICBhdHRyaWJ1dGVzOiBbXG4gICAgICAgIHsgdHlwZTogJ3NlcXVlbmNlJywgdmFsdWU6IHNlcXVlbmNlIH0sXG4gICAgICAgIHsgdHlwZTogJ2F0b20nLCB2YWx1ZTogZGVzdGluYXRpb24gfVxuICAgICAgXVxuICAgIH0sIFsnT0snXSwge1xuICAgICAgcHJlY2hlY2s6IChjdHgpID0+IHRoaXMuX3Nob3VsZFNlbGVjdE1haWxib3gocGF0aCwgY3R4KSA/IHRoaXMuc2VsZWN0TWFpbGJveChwYXRoLCB7IGN0eCB9KSA6IFByb21pc2UucmVzb2x2ZSgpXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIENPTVBSRVNTIGNvbW1hbmRcbiAgICpcbiAgICogQ09NUFJFU1MgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNDk3OFxuICAgKi9cbiAgYXN5bmMgY29tcHJlc3NDb25uZWN0aW9uICgpIHtcbiAgICBpZiAoIXRoaXMuX2VuYWJsZUNvbXByZXNzaW9uIHx8IHRoaXMuX2NhcGFiaWxpdHkuaW5kZXhPZignQ09NUFJFU1M9REVGTEFURScpIDwgMCB8fCB0aGlzLmNsaWVudC5jb21wcmVzc2VkKSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnRW5hYmxpbmcgY29tcHJlc3Npb24uLi4nKVxuICAgIGF3YWl0IHRoaXMuZXhlYyh7XG4gICAgICBjb21tYW5kOiAnQ09NUFJFU1MnLFxuICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgdHlwZTogJ0FUT00nLFxuICAgICAgICB2YWx1ZTogJ0RFRkxBVEUnXG4gICAgICB9XVxuICAgIH0pXG4gICAgdGhpcy5jbGllbnQuZW5hYmxlQ29tcHJlc3Npb24oKVxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDb21wcmVzc2lvbiBlbmFibGVkLCBhbGwgZGF0YSBzZW50IGFuZCByZWNlaXZlZCBpcyBkZWZsYXRlZCEnKVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgTE9HSU4gb3IgQVVUSEVOVElDQVRFIFhPQVVUSDIgY29tbWFuZFxuICAgKlxuICAgKiBMT0dJTiBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjIuM1xuICAgKiBYT0FVVEgyIGRldGFpbHM6XG4gICAqICAgaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vZ21haWwveG9hdXRoMl9wcm90b2NvbCNpbWFwX3Byb3RvY29sX2V4Y2hhbmdlXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBhdXRoLnVzZXJcbiAgICogQHBhcmFtIHtTdHJpbmd9IGF1dGgucGFzc1xuICAgKiBAcGFyYW0ge1N0cmluZ30gYXV0aC54b2F1dGgyXG4gICAqL1xuICBhc3luYyBsb2dpbiAoYXV0aCkge1xuICAgIGxldCBjb21tYW5kXG4gICAgY29uc3Qgb3B0aW9ucyA9IHt9XG5cbiAgICBpZiAoIWF1dGgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQXV0aGVudGljYXRpb24gaW5mb3JtYXRpb24gbm90IHByb3ZpZGVkJylcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdBVVRIPVhPQVVUSDInKSA+PSAwICYmIGF1dGggJiYgYXV0aC54b2F1dGgyKSB7XG4gICAgICBjb21tYW5kID0ge1xuICAgICAgICBjb21tYW5kOiAnQVVUSEVOVElDQVRFJyxcbiAgICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICAgIHsgdHlwZTogJ0FUT00nLCB2YWx1ZTogJ1hPQVVUSDInIH0sXG4gICAgICAgICAgeyB0eXBlOiAnQVRPTScsIHZhbHVlOiBidWlsZFhPQXV0aDJUb2tlbihhdXRoLnVzZXIsIGF1dGgueG9hdXRoMiksIHNlbnNpdGl2ZTogdHJ1ZSB9XG4gICAgICAgIF1cbiAgICAgIH1cblxuICAgICAgb3B0aW9ucy5lcnJvclJlc3BvbnNlRXhwZWN0c0VtcHR5TGluZSA9IHRydWUgLy8gKyB0YWdnZWQgZXJyb3IgcmVzcG9uc2UgZXhwZWN0cyBhbiBlbXB0eSBsaW5lIGluIHJldHVyblxuICAgIH0gZWxzZSB7XG4gICAgICBjb21tYW5kID0ge1xuICAgICAgICBjb21tYW5kOiAnbG9naW4nLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbXG4gICAgICAgICAgeyB0eXBlOiAnU1RSSU5HJywgdmFsdWU6IGF1dGgudXNlciB8fCAnJyB9LFxuICAgICAgICAgIHsgdHlwZTogJ1NUUklORycsIHZhbHVlOiBhdXRoLnBhc3MgfHwgJycsIHNlbnNpdGl2ZTogdHJ1ZSB9XG4gICAgICAgIF1cbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnTG9nZ2luZyBpbi4uLicpXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmV4ZWMoY29tbWFuZCwgJ2NhcGFiaWxpdHknLCBvcHRpb25zKVxuICAgIC8qXG4gICAgICogdXBkYXRlIHBvc3QtYXV0aCBjYXBhYmlsaXRlc1xuICAgICAqIGNhcGFiaWxpdHkgbGlzdCBzaG91bGRuJ3QgY29udGFpbiBhdXRoIHJlbGF0ZWQgc3R1ZmYgYW55bW9yZVxuICAgICAqIGJ1dCBzb21lIG5ldyBleHRlbnNpb25zIG1pZ2h0IGhhdmUgcG9wcGVkIHVwIHRoYXQgZG8gbm90XG4gICAgICogbWFrZSBtdWNoIHNlbnNlIGluIHRoZSBub24tYXV0aCBzdGF0ZVxuICAgICAqL1xuICAgIGlmIChyZXNwb25zZS5jYXBhYmlsaXR5ICYmIHJlc3BvbnNlLmNhcGFiaWxpdHkubGVuZ3RoKSB7XG4gICAgICAvLyBjYXBhYmlsaXRlcyB3ZXJlIGxpc3RlZCB3aXRoIHRoZSBPSyBbQ0FQQUJJTElUWSAuLi5dIHJlc3BvbnNlXG4gICAgICB0aGlzLl9jYXBhYmlsaXR5ID0gcmVzcG9uc2UuY2FwYWJpbGl0eVxuICAgIH0gZWxzZSBpZiAocmVzcG9uc2UucGF5bG9hZCAmJiByZXNwb25zZS5wYXlsb2FkLkNBUEFCSUxJVFkgJiYgcmVzcG9uc2UucGF5bG9hZC5DQVBBQklMSVRZLmxlbmd0aCkge1xuICAgICAgLy8gY2FwYWJpbGl0ZXMgd2VyZSBsaXN0ZWQgd2l0aCAqIENBUEFCSUxJVFkgLi4uIHJlc3BvbnNlXG4gICAgICB0aGlzLl9jYXBhYmlsaXR5ID0gcmVzcG9uc2UucGF5bG9hZC5DQVBBQklMSVRZLnBvcCgpLmF0dHJpYnV0ZXMubWFwKChjYXBhID0gJycpID0+IGNhcGEudmFsdWUudG9VcHBlckNhc2UoKS50cmltKCkpXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIGNhcGFiaWxpdGllcyB3ZXJlIG5vdCBhdXRvbWF0aWNhbGx5IGxpc3RlZCwgcmVsb2FkXG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZUNhcGFiaWxpdHkodHJ1ZSlcbiAgICB9XG5cbiAgICB0aGlzLl9jaGFuZ2VTdGF0ZShTVEFURV9BVVRIRU5USUNBVEVEKVxuICAgIHRoaXMuX2F1dGhlbnRpY2F0ZWQgPSB0cnVlXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0xvZ2luIHN1Y2Nlc3NmdWwsIHBvc3QtYXV0aCBjYXBhYmlsaXRlcyB1cGRhdGVkIScsIHRoaXMuX2NhcGFiaWxpdHkpXG4gIH1cblxuICAvKipcbiAgICogUnVuIGFuIElNQVAgY29tbWFuZC5cbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcXVlc3QgU3RydWN0dXJlZCByZXF1ZXN0IG9iamVjdFxuICAgKiBAcGFyYW0ge0FycmF5fSBhY2NlcHRVbnRhZ2dlZCBhIGxpc3Qgb2YgdW50YWdnZWQgcmVzcG9uc2VzIHRoYXQgd2lsbCBiZSBpbmNsdWRlZCBpbiAncGF5bG9hZCcgcHJvcGVydHlcbiAgICovXG4gIGFzeW5jIGV4ZWMgKHJlcXVlc3QsIGFjY2VwdFVudGFnZ2VkLCBvcHRpb25zKSB7XG4gICAgdGhpcy5icmVha0lkbGUoKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5jbGllbnQuZW5xdWV1ZUNvbW1hbmQocmVxdWVzdCwgYWNjZXB0VW50YWdnZWQsIG9wdGlvbnMpXG4gICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLmNhcGFiaWxpdHkpIHtcbiAgICAgIHRoaXMuX2NhcGFiaWxpdHkgPSByZXNwb25zZS5jYXBhYmlsaXR5XG4gICAgfVxuICAgIHJldHVybiByZXNwb25zZVxuICB9XG5cbiAgLyoqXG4gICAqIFRoZSBjb25uZWN0aW9uIGlzIGlkbGluZy4gU2VuZHMgYSBOT09QIG9yIElETEUgY29tbWFuZFxuICAgKlxuICAgKiBJRExFIGRldGFpbHM6XG4gICAqICAgaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzIxNzdcbiAgICovXG4gIGVudGVySWRsZSAoKSB7XG4gICAgaWYgKHRoaXMuX2VudGVyZWRJZGxlKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgdGhpcy5fZW50ZXJlZElkbGUgPSAhdGhpcy5faWdub3JlSWRsZUNhcGFiaWxpdHkgJiYgdGhpcy5fc2VsZWN0ZWRNYWlsYm94ICYmIHRoaXMuX2NhcGFiaWxpdHkuaW5kZXhPZignSURMRScpID49IDAgPyAnSURMRScgOiAnTk9PUCdcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnRW50ZXJpbmcgaWRsZSB3aXRoICcgKyB0aGlzLl9lbnRlcmVkSWRsZSlcblxuICAgIGlmICh0aGlzLl9lbnRlcmVkSWRsZSA9PT0gJ05PT1AnKSB7XG4gICAgICB0aGlzLl9pZGxlVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnU2VuZGluZyBOT09QJylcbiAgICAgICAgdGhpcy5leGVjKCdOT09QJylcbiAgICAgIH0sIHRoaXMudGltZW91dE5vb3ApXG4gICAgfSBlbHNlIGlmICh0aGlzLl9lbnRlcmVkSWRsZSA9PT0gJ0lETEUnKSB7XG4gICAgICB0aGlzLmNsaWVudC5lbnF1ZXVlQ29tbWFuZCh7XG4gICAgICAgIGNvbW1hbmQ6ICdJRExFJ1xuICAgICAgfSlcbiAgICAgIHRoaXMuX2lkbGVUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHRoaXMuY2xpZW50LnNlbmQoJ0RPTkVcXHJcXG4nKVxuICAgICAgICB0aGlzLl9lbnRlcmVkSWRsZSA9IGZhbHNlXG4gICAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdJZGxlIHRlcm1pbmF0ZWQnKVxuICAgICAgfSwgdGhpcy50aW1lb3V0SWRsZSlcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU3RvcHMgYWN0aW9ucyByZWxhdGVkIGlkbGluZywgaWYgSURMRSBpcyBzdXBwb3J0ZWQsIHNlbmRzIERPTkUgdG8gc3RvcCBpdFxuICAgKi9cbiAgYnJlYWtJZGxlICgpIHtcbiAgICBpZiAoIXRoaXMuX2VudGVyZWRJZGxlKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjbGVhclRpbWVvdXQodGhpcy5faWRsZVRpbWVvdXQpXG4gICAgaWYgKHRoaXMuX2VudGVyZWRJZGxlID09PSAnSURMRScpIHtcbiAgICAgIHRoaXMuY2xpZW50LnNlbmQoJ0RPTkVcXHJcXG4nKVxuICAgICAgdGhpcy5sb2dnZXIuZGVidWcoJ0lkbGUgdGVybWluYXRlZCcpXG4gICAgfVxuICAgIHRoaXMuX2VudGVyZWRJZGxlID0gZmFsc2VcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIFNUQVJUVExTIGNvbW1hbmQgaWYgbmVlZGVkXG4gICAqXG4gICAqIFNUQVJUVExTIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMi4xXG4gICAqXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW2ZvcmNlZF0gQnkgZGVmYXVsdCB0aGUgY29tbWFuZCBpcyBub3QgcnVuIGlmIGNhcGFiaWxpdHkgaXMgYWxyZWFkeSBsaXN0ZWQuIFNldCB0byB0cnVlIHRvIHNraXAgdGhpcyB2YWxpZGF0aW9uXG4gICAqL1xuICBhc3luYyB1cGdyYWRlQ29ubmVjdGlvbiAoKSB7XG4gICAgLy8gc2tpcCByZXF1ZXN0LCBpZiBhbHJlYWR5IHNlY3VyZWRcbiAgICBpZiAodGhpcy5jbGllbnQuc2VjdXJlTW9kZSkge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuXG4gICAgLy8gc2tpcCBpZiBTVEFSVFRMUyBub3QgYXZhaWxhYmxlIG9yIHN0YXJ0dGxzIHN1cHBvcnQgZGlzYWJsZWRcbiAgICBpZiAoKHRoaXMuX2NhcGFiaWxpdHkuaW5kZXhPZignU1RBUlRUTFMnKSA8IDAgfHwgdGhpcy5faWdub3JlVExTKSAmJiAhdGhpcy5fcmVxdWlyZVRMUykge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0VuY3J5cHRpbmcgY29ubmVjdGlvbi4uLicpXG4gICAgYXdhaXQgdGhpcy5leGVjKCdTVEFSVFRMUycpXG4gICAgdGhpcy5fY2FwYWJpbGl0eSA9IFtdXG4gICAgdGhpcy5jbGllbnQudXBncmFkZSgpXG4gICAgcmV0dXJuIHRoaXMudXBkYXRlQ2FwYWJpbGl0eSgpXG4gIH1cblxuICAvKipcbiAgICogUnVucyBDQVBBQklMSVRZIGNvbW1hbmRcbiAgICpcbiAgICogQ0FQQUJJTElUWSBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjEuMVxuICAgKlxuICAgKiBEb2Vzbid0IHJlZ2lzdGVyIHVudGFnZ2VkIENBUEFCSUxJVFkgaGFuZGxlciBhcyB0aGlzIGlzIGFscmVhZHlcbiAgICogaGFuZGxlZCBieSBnbG9iYWwgaGFuZGxlclxuICAgKlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtmb3JjZWRdIEJ5IGRlZmF1bHQgdGhlIGNvbW1hbmQgaXMgbm90IHJ1biBpZiBjYXBhYmlsaXR5IGlzIGFscmVhZHkgbGlzdGVkLiBTZXQgdG8gdHJ1ZSB0byBza2lwIHRoaXMgdmFsaWRhdGlvblxuICAgKi9cbiAgYXN5bmMgdXBkYXRlQ2FwYWJpbGl0eSAoZm9yY2VkKSB7XG4gICAgLy8gc2tpcCByZXF1ZXN0LCBpZiBub3QgZm9yY2VkIHVwZGF0ZSBhbmQgY2FwYWJpbGl0aWVzIGFyZSBhbHJlYWR5IGxvYWRlZFxuICAgIGlmICghZm9yY2VkICYmIHRoaXMuX2NhcGFiaWxpdHkubGVuZ3RoKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICAvLyBJZiBTVEFSVFRMUyBpcyByZXF1aXJlZCB0aGVuIHNraXAgY2FwYWJpbGl0eSBsaXN0aW5nIGFzIHdlIGFyZSBnb2luZyB0byB0cnlcbiAgICAvLyBTVEFSVFRMUyBhbnl3YXkgYW5kIHdlIHJlLWNoZWNrIGNhcGFiaWxpdGllcyBhZnRlciBjb25uZWN0aW9uIGlzIHNlY3VyZWRcbiAgICBpZiAoIXRoaXMuY2xpZW50LnNlY3VyZU1vZGUgJiYgdGhpcy5fcmVxdWlyZVRMUykge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ1VwZGF0aW5nIGNhcGFiaWxpdHkuLi4nKVxuICAgIHJldHVybiB0aGlzLmV4ZWMoJ0NBUEFCSUxJVFknKVxuICB9XG5cbiAgaGFzQ2FwYWJpbGl0eSAoY2FwYSA9ICcnKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NhcGFiaWxpdHkuaW5kZXhPZihjYXBhLnRvVXBwZXJDYXNlKCkudHJpbSgpKSA+PSAwXG4gIH1cblxuICAvLyBEZWZhdWx0IGhhbmRsZXJzIGZvciB1bnRhZ2dlZCByZXNwb25zZXNcblxuICAvKipcbiAgICogQ2hlY2tzIGlmIGFuIHVudGFnZ2VkIE9LIGluY2x1ZGVzIFtDQVBBQklMSVRZXSB0YWcgYW5kIHVwZGF0ZXMgY2FwYWJpbGl0eSBvYmplY3RcbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlc3BvbnNlIFBhcnNlZCBzZXJ2ZXIgcmVzcG9uc2VcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dCBVbnRpbCBjYWxsZWQsIHNlcnZlciByZXNwb25zZXMgYXJlIG5vdCBwcm9jZXNzZWRcbiAgICovXG4gIF91bnRhZ2dlZE9rSGFuZGxlciAocmVzcG9uc2UpIHtcbiAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2UuY2FwYWJpbGl0eSkge1xuICAgICAgdGhpcy5fY2FwYWJpbGl0eSA9IHJlc3BvbnNlLmNhcGFiaWxpdHlcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlcyBjYXBhYmlsaXR5IG9iamVjdFxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVzcG9uc2UgUGFyc2VkIHNlcnZlciByZXNwb25zZVxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0IFVudGlsIGNhbGxlZCwgc2VydmVyIHJlc3BvbnNlcyBhcmUgbm90IHByb2Nlc3NlZFxuICAgKi9cbiAgX3VudGFnZ2VkQ2FwYWJpbGl0eUhhbmRsZXIgKHJlc3BvbnNlKSB7XG4gICAgdGhpcy5fY2FwYWJpbGl0eSA9IHBpcGUoXG4gICAgICBwcm9wT3IoW10sICdhdHRyaWJ1dGVzJyksXG4gICAgICBtYXAoKHsgdmFsdWUgfSkgPT4gKHZhbHVlIHx8ICcnKS50b1VwcGVyQ2FzZSgpLnRyaW0oKSlcbiAgICApKHJlc3BvbnNlKVxuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZXMgZXhpc3RpbmcgbWVzc2FnZSBjb3VudFxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVzcG9uc2UgUGFyc2VkIHNlcnZlciByZXNwb25zZVxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0IFVudGlsIGNhbGxlZCwgc2VydmVyIHJlc3BvbnNlcyBhcmUgbm90IHByb2Nlc3NlZFxuICAgKi9cbiAgX3VudGFnZ2VkRXhpc3RzSGFuZGxlciAocmVzcG9uc2UpIHtcbiAgICBpZiAocmVzcG9uc2UgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3BvbnNlLCAnbnInKSkge1xuICAgICAgdGhpcy5vbnVwZGF0ZSAmJiB0aGlzLm9udXBkYXRlKHRoaXMuX3NlbGVjdGVkTWFpbGJveCwgJ2V4aXN0cycsIHJlc3BvbnNlLm5yKVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBJbmRpY2F0ZXMgYSBtZXNzYWdlIGhhcyBiZWVuIGRlbGV0ZWRcbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlc3BvbnNlIFBhcnNlZCBzZXJ2ZXIgcmVzcG9uc2VcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dCBVbnRpbCBjYWxsZWQsIHNlcnZlciByZXNwb25zZXMgYXJlIG5vdCBwcm9jZXNzZWRcbiAgICovXG4gIF91bnRhZ2dlZEV4cHVuZ2VIYW5kbGVyIChyZXNwb25zZSkge1xuICAgIGlmIChyZXNwb25zZSAmJiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzcG9uc2UsICducicpKSB7XG4gICAgICB0aGlzLm9udXBkYXRlICYmIHRoaXMub251cGRhdGUodGhpcy5fc2VsZWN0ZWRNYWlsYm94LCAnZXhwdW5nZScsIHJlc3BvbnNlLm5yKVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBJbmRpY2F0ZXMgdGhhdCBmbGFncyBoYXZlIGJlZW4gdXBkYXRlZCBmb3IgYSBtZXNzYWdlXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXNwb25zZSBQYXJzZWQgc2VydmVyIHJlc3BvbnNlXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHQgVW50aWwgY2FsbGVkLCBzZXJ2ZXIgcmVzcG9uc2VzIGFyZSBub3QgcHJvY2Vzc2VkXG4gICAqL1xuICBfdW50YWdnZWRGZXRjaEhhbmRsZXIgKHJlc3BvbnNlKSB7XG4gICAgdGhpcy5vbnVwZGF0ZSAmJiB0aGlzLm9udXBkYXRlKHRoaXMuX3NlbGVjdGVkTWFpbGJveCwgJ2ZldGNoJywgW10uY29uY2F0KHBhcnNlRkVUQ0goeyBwYXlsb2FkOiB7IEZFVENIOiBbcmVzcG9uc2VdIH0gfSkgfHwgW10pLnNoaWZ0KCkpXG4gIH1cblxuICAvLyBQcml2YXRlIGhlbHBlcnNcblxuICAvKipcbiAgICogSW5kaWNhdGVzIHRoYXQgdGhlIGNvbm5lY3Rpb24gc3RhcnRlZCBpZGxpbmcuIEluaXRpYXRlcyBhIGN5Y2xlXG4gICAqIG9mIE5PT1BzIG9yIElETEVzIHRvIHJlY2VpdmUgbm90aWZpY2F0aW9ucyBhYm91dCB1cGRhdGVzIGluIHRoZSBzZXJ2ZXJcbiAgICovXG4gIF9vbklkbGUgKCkge1xuICAgIGlmICghdGhpcy5fYXV0aGVudGljYXRlZCB8fCB0aGlzLl9lbnRlcmVkSWRsZSkge1xuICAgICAgLy8gTm8gbmVlZCB0byBJRExFIHdoZW4gbm90IGxvZ2dlZCBpbiBvciBhbHJlYWR5IGlkbGluZ1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0NsaWVudCBzdGFydGVkIGlkbGluZycpXG4gICAgdGhpcy5lbnRlcklkbGUoKVxuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZXMgdGhlIElNQVAgc3RhdGUgdmFsdWUgZm9yIHRoZSBjdXJyZW50IGNvbm5lY3Rpb25cbiAgICpcbiAgICogQHBhcmFtIHtOdW1iZXJ9IG5ld1N0YXRlIFRoZSBzdGF0ZSB5b3Ugd2FudCB0byBjaGFuZ2UgdG9cbiAgICovXG4gIF9jaGFuZ2VTdGF0ZSAobmV3U3RhdGUpIHtcbiAgICBpZiAobmV3U3RhdGUgPT09IHRoaXMuX3N0YXRlKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnRW50ZXJpbmcgc3RhdGU6ICcgKyBuZXdTdGF0ZSlcblxuICAgIC8vIGlmIGEgbWFpbGJveCB3YXMgb3BlbmVkLCBlbWl0IG9uY2xvc2VtYWlsYm94IGFuZCBjbGVhciBzZWxlY3RlZE1haWxib3ggdmFsdWVcbiAgICBpZiAodGhpcy5fc3RhdGUgPT09IFNUQVRFX1NFTEVDVEVEICYmIHRoaXMuX3NlbGVjdGVkTWFpbGJveCkge1xuICAgICAgdGhpcy5vbmNsb3NlbWFpbGJveCAmJiB0aGlzLm9uY2xvc2VtYWlsYm94KHRoaXMuX3NlbGVjdGVkTWFpbGJveClcbiAgICAgIHRoaXMuX3NlbGVjdGVkTWFpbGJveCA9IGZhbHNlXG4gICAgfVxuXG4gICAgdGhpcy5fc3RhdGUgPSBuZXdTdGF0ZVxuICB9XG5cbiAgLyoqXG4gICAqIEVuc3VyZXMgYSBwYXRoIGV4aXN0cyBpbiB0aGUgTWFpbGJveCB0cmVlXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSB0cmVlIE1haWxib3ggdHJlZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICAgKiBAcGFyYW0ge1N0cmluZ30gZGVsaW1pdGVyXG4gICAqIEByZXR1cm4ge09iamVjdH0gYnJhbmNoIGZvciB1c2VkIHBhdGhcbiAgICovXG4gIF9lbnN1cmVQYXRoICh0cmVlLCBwYXRoLCBkZWxpbWl0ZXIpIHtcbiAgICBjb25zdCBuYW1lcyA9IHBhdGguc3BsaXQoZGVsaW1pdGVyKVxuICAgIGxldCBicmFuY2ggPSB0cmVlXG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG5hbWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBsZXQgZm91bmQgPSBmYWxzZVxuICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBicmFuY2guY2hpbGRyZW4ubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgaWYgKHRoaXMuX2NvbXBhcmVNYWlsYm94TmFtZXMoYnJhbmNoLmNoaWxkcmVuW2pdLm5hbWUsIGltYXBEZWNvZGUobmFtZXNbaV0pKSkge1xuICAgICAgICAgIGJyYW5jaCA9IGJyYW5jaC5jaGlsZHJlbltqXVxuICAgICAgICAgIGZvdW5kID0gdHJ1ZVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmICghZm91bmQpIHtcbiAgICAgICAgYnJhbmNoLmNoaWxkcmVuLnB1c2goe1xuICAgICAgICAgIG5hbWU6IGltYXBEZWNvZGUobmFtZXNbaV0pLFxuICAgICAgICAgIGRlbGltaXRlcjogZGVsaW1pdGVyLFxuICAgICAgICAgIHBhdGg6IG5hbWVzLnNsaWNlKDAsIGkgKyAxKS5qb2luKGRlbGltaXRlciksXG4gICAgICAgICAgY2hpbGRyZW46IFtdXG4gICAgICAgIH0pXG4gICAgICAgIGJyYW5jaCA9IGJyYW5jaC5jaGlsZHJlblticmFuY2guY2hpbGRyZW4ubGVuZ3RoIC0gMV1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGJyYW5jaFxuICB9XG5cbiAgLyoqXG4gICAqIENvbXBhcmVzIHR3byBtYWlsYm94IG5hbWVzLiBDYXNlIGluc2Vuc2l0aXZlIGluIGNhc2Ugb2YgSU5CT1gsIG90aGVyd2lzZSBjYXNlIHNlbnNpdGl2ZVxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gYSBNYWlsYm94IG5hbWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IGIgTWFpbGJveCBuYW1lXG4gICAqIEByZXR1cm5zIHtCb29sZWFufSBUcnVlIGlmIHRoZSBmb2xkZXIgbmFtZXMgbWF0Y2hcbiAgICovXG4gIF9jb21wYXJlTWFpbGJveE5hbWVzIChhLCBiKSB7XG4gICAgcmV0dXJuIChhLnRvVXBwZXJDYXNlKCkgPT09ICdJTkJPWCcgPyAnSU5CT1gnIDogYSkgPT09IChiLnRvVXBwZXJDYXNlKCkgPT09ICdJTkJPWCcgPyAnSU5CT1gnIDogYilcbiAgfVxuXG4gIGNyZWF0ZUxvZ2dlciAoY3JlYXRvciA9IGNyZWF0ZURlZmF1bHRMb2dnZXIpIHtcbiAgICBjb25zdCBsb2dnZXIgPSBjcmVhdG9yKCh0aGlzLl9hdXRoIHx8IHt9KS51c2VyIHx8ICcnLCB0aGlzLl9ob3N0KVxuICAgIHRoaXMubG9nZ2VyID0gdGhpcy5jbGllbnQubG9nZ2VyID0ge1xuICAgICAgZGVidWc6ICguLi5tc2dzKSA9PiB7IGlmIChMT0dfTEVWRUxfREVCVUcgPj0gdGhpcy5sb2dMZXZlbCkgeyBsb2dnZXIuZGVidWcobXNncykgfSB9LFxuICAgICAgaW5mbzogKC4uLm1zZ3MpID0+IHsgaWYgKExPR19MRVZFTF9JTkZPID49IHRoaXMubG9nTGV2ZWwpIHsgbG9nZ2VyLmluZm8obXNncykgfSB9LFxuICAgICAgd2FybjogKC4uLm1zZ3MpID0+IHsgaWYgKExPR19MRVZFTF9XQVJOID49IHRoaXMubG9nTGV2ZWwpIHsgbG9nZ2VyLndhcm4obXNncykgfSB9LFxuICAgICAgZXJyb3I6ICguLi5tc2dzKSA9PiB7IGlmIChMT0dfTEVWRUxfRVJST1IgPj0gdGhpcy5sb2dMZXZlbCkgeyBsb2dnZXIuZXJyb3IobXNncykgfSB9XG4gICAgfVxuICB9XG59XG4iXX0=