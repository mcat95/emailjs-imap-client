"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.TIMEOUT_NOOP = exports.TIMEOUT_IDLE = exports.TIMEOUT_CONNECTION = exports.STATE_SELECTED = exports.STATE_NOT_AUTHENTICATED = exports.STATE_LOGOUT = exports.STATE_CONNECTING = exports.STATE_AUTHENTICATED = exports.DEFAULT_CLIENT_ID = void 0;
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
    clearTimeout(this._idleTimeout);

    // propagate the error upwards
    this.onerror && this.onerror(err);
  }

  //
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
      }, 'LSUB').catch(err => {
        _this9.logger.warn('LSUB command failed: ', err);
        return null;
      });
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
      }

      // If possible, use MOVE
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
      } else if (_this19._capability.indexOf('AUTH=PLAIN') >= 0) {
        command = {
          command: 'AUTHENTICATE',
          attributes: [{
            type: 'ATOM',
            value: 'PLAIN'
          }, {
            type: 'ATOM',
            value: Buffer.from('\x00' + auth.user + '\x00' + auth.pass || '').toString('base64'),
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
      }

      // skip if STARTTLS not available or starttls support disabled
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
      }

      // If STARTTLS is required then skip capability listing as we are going to try
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
  }

  // Default handlers for untagged responses

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
  }

  // Private helpers

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
    this.logger.debug('Entering state: ' + newState);

    // if a mailbox was opened, emit onclosemailbox and clear selectedMailbox value
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJUSU1FT1VUX0NPTk5FQ1RJT04iLCJUSU1FT1VUX05PT1AiLCJUSU1FT1VUX0lETEUiLCJTVEFURV9DT05ORUNUSU5HIiwiU1RBVEVfTk9UX0FVVEhFTlRJQ0FURUQiLCJTVEFURV9BVVRIRU5USUNBVEVEIiwiU1RBVEVfU0VMRUNURUQiLCJTVEFURV9MT0dPVVQiLCJERUZBVUxUX0NMSUVOVF9JRCIsIm5hbWUiLCJDbGllbnQiLCJjb25zdHJ1Y3RvciIsImhvc3QiLCJwb3J0Iiwib3B0aW9ucyIsInRpbWVvdXRDb25uZWN0aW9uIiwidGltZW91dE5vb3AiLCJ0aW1lb3V0SWRsZSIsInNlcnZlcklkIiwib25jZXJ0Iiwib251cGRhdGUiLCJvbnNlbGVjdG1haWxib3giLCJvbmNsb3NlbWFpbGJveCIsIl9ob3N0IiwiX2NsaWVudElkIiwicHJvcE9yIiwiX3N0YXRlIiwiX2F1dGhlbnRpY2F0ZWQiLCJfY2FwYWJpbGl0eSIsIl9zZWxlY3RlZE1haWxib3giLCJfZW50ZXJlZElkbGUiLCJfaWRsZVRpbWVvdXQiLCJfZW5hYmxlQ29tcHJlc3Npb24iLCJlbmFibGVDb21wcmVzc2lvbiIsIl9hdXRoIiwiYXV0aCIsIl9yZXF1aXJlVExTIiwicmVxdWlyZVRMUyIsIl9pZ25vcmVUTFMiLCJpZ25vcmVUTFMiLCJfaWdub3JlSWRsZUNhcGFiaWxpdHkiLCJpZ25vcmVJZGxlQ2FwYWJpbGl0eSIsImNsaWVudCIsIkltYXBDbGllbnQiLCJvbmVycm9yIiwiX29uRXJyb3IiLCJiaW5kIiwiY2VydCIsIm9uaWRsZSIsIl9vbklkbGUiLCJzZXRIYW5kbGVyIiwicmVzcG9uc2UiLCJfdW50YWdnZWRDYXBhYmlsaXR5SGFuZGxlciIsIl91bnRhZ2dlZE9rSGFuZGxlciIsIl91bnRhZ2dlZEV4aXN0c0hhbmRsZXIiLCJfdW50YWdnZWRFeHB1bmdlSGFuZGxlciIsIl91bnRhZ2dlZEZldGNoSGFuZGxlciIsImNyZWF0ZUxvZ2dlciIsImxvZ0xldmVsIiwiTE9HX0xFVkVMX0FMTCIsImVyciIsImNsZWFyVGltZW91dCIsImNvbm5lY3QiLCJvcGVuQ29ubmVjdGlvbiIsInVwZ3JhZGVDb25uZWN0aW9uIiwidXBkYXRlSWQiLCJsb2dnZXIiLCJ3YXJuIiwibWVzc2FnZSIsImxvZ2luIiwiY29tcHJlc3NDb25uZWN0aW9uIiwiZGVidWciLCJlcnJvciIsImNsb3NlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJjb25uZWN0aW9uVGltZW91dCIsInNldFRpbWVvdXQiLCJFcnJvciIsIl9jaGFuZ2VTdGF0ZSIsInRoZW4iLCJvbnJlYWR5IiwidXBkYXRlQ2FwYWJpbGl0eSIsImNhdGNoIiwibG9nb3V0IiwiaWQiLCJpbmRleE9mIiwiY29tbWFuZCIsImF0dHJpYnV0ZXMiLCJmbGF0dGVuIiwiT2JqZWN0IiwiZW50cmllcyIsImV4ZWMiLCJsaXN0IiwicGF0aE9yIiwibWFwIiwidmFsdWVzIiwia2V5cyIsImZpbHRlciIsIl8iLCJpIiwiZnJvbVBhaXJzIiwiemlwIiwiX3Nob3VsZFNlbGVjdE1haWxib3giLCJwYXRoIiwiY3R4IiwicHJldmlvdXNTZWxlY3QiLCJnZXRQcmV2aW91c2x5UXVldWVkIiwicmVxdWVzdCIsInBhdGhBdHRyaWJ1dGUiLCJmaW5kIiwiYXR0cmlidXRlIiwidHlwZSIsInZhbHVlIiwic2VsZWN0TWFpbGJveCIsInF1ZXJ5IiwicmVhZE9ubHkiLCJjb25kc3RvcmUiLCJwdXNoIiwibWFpbGJveEluZm8iLCJwYXJzZVNFTEVDVCIsInN1YnNjcmliZU1haWxib3giLCJ1bnN1YnNjcmliZU1haWxib3giLCJsaXN0TmFtZXNwYWNlcyIsInBhcnNlTkFNRVNQQUNFIiwibGlzdE1haWxib3hlcyIsInRyZWUiLCJyb290IiwiY2hpbGRyZW4iLCJsaXN0UmVzcG9uc2UiLCJmb3JFYWNoIiwiaXRlbSIsImF0dHIiLCJsZW5ndGgiLCJkZWxpbSIsImJyYW5jaCIsIl9lbnN1cmVQYXRoIiwiZmxhZ3MiLCJsaXN0ZWQiLCJjaGVja1NwZWNpYWxVc2UiLCJsc3ViUmVzcG9uc2UiLCJsc3ViIiwiZmxhZyIsInVuaW9uIiwic3Vic2NyaWJlZCIsImNyZWF0ZU1haWxib3giLCJjb2RlIiwiZGVsZXRlTWFpbGJveCIsImxpc3RNZXNzYWdlcyIsInNlcXVlbmNlIiwiaXRlbXMiLCJmYXN0IiwiYnVpbGRGRVRDSENvbW1hbmQiLCJwcmVjaGVjayIsInBhcnNlRkVUQ0giLCJzZWFyY2giLCJidWlsZFNFQVJDSENvbW1hbmQiLCJwYXJzZVNFQVJDSCIsInNldEZsYWdzIiwia2V5IiwiQXJyYXkiLCJpc0FycmF5IiwiY29uY2F0IiwiYWRkIiwic2V0IiwicmVtb3ZlIiwic3RvcmUiLCJhY3Rpb24iLCJidWlsZFNUT1JFQ29tbWFuZCIsInVwbG9hZCIsImRlc3RpbmF0aW9uIiwicGFyc2VBUFBFTkQiLCJkZWxldGVNZXNzYWdlcyIsInVzZVVpZFBsdXMiLCJieVVpZCIsInVpZEV4cHVuZ2VDb21tYW5kIiwiY21kIiwiY29weU1lc3NhZ2VzIiwicGFyc2VDT1BZIiwibW92ZU1lc3NhZ2VzIiwiY29tcHJlc3NlZCIsInhvYXV0aDIiLCJidWlsZFhPQXV0aDJUb2tlbiIsInVzZXIiLCJzZW5zaXRpdmUiLCJlcnJvclJlc3BvbnNlRXhwZWN0c0VtcHR5TGluZSIsIkJ1ZmZlciIsImZyb20iLCJwYXNzIiwidG9TdHJpbmciLCJjYXBhYmlsaXR5IiwicGF5bG9hZCIsIkNBUEFCSUxJVFkiLCJwb3AiLCJjYXBhIiwidG9VcHBlckNhc2UiLCJ0cmltIiwiYWNjZXB0VW50YWdnZWQiLCJicmVha0lkbGUiLCJlbnF1ZXVlQ29tbWFuZCIsImVudGVySWRsZSIsInNlbmQiLCJzZWN1cmVNb2RlIiwidXBncmFkZSIsImZvcmNlZCIsImhhc0NhcGFiaWxpdHkiLCJwaXBlIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwibnIiLCJGRVRDSCIsInNoaWZ0IiwibmV3U3RhdGUiLCJkZWxpbWl0ZXIiLCJuYW1lcyIsInNwbGl0IiwiZm91bmQiLCJqIiwiX2NvbXBhcmVNYWlsYm94TmFtZXMiLCJpbWFwRGVjb2RlIiwic2xpY2UiLCJqb2luIiwiYSIsImIiLCJjcmVhdG9yIiwiY3JlYXRlRGVmYXVsdExvZ2dlciIsIm1zZ3MiLCJMT0dfTEVWRUxfREVCVUciLCJpbmZvIiwiTE9HX0xFVkVMX0lORk8iLCJMT0dfTEVWRUxfV0FSTiIsIkxPR19MRVZFTF9FUlJPUiJdLCJzb3VyY2VzIjpbIi4uL3NyYy9jbGllbnQuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgbWFwLCBwaXBlLCB1bmlvbiwgemlwLCBmcm9tUGFpcnMsIHByb3BPciwgcGF0aE9yLCBmbGF0dGVuIH0gZnJvbSAncmFtZGEnXG5pbXBvcnQgeyBpbWFwRGVjb2RlIH0gZnJvbSAnZW1haWxqcy11dGY3J1xuaW1wb3J0IHtcbiAgcGFyc2VBUFBFTkQsXG4gIHBhcnNlQ09QWSxcbiAgcGFyc2VOQU1FU1BBQ0UsXG4gIHBhcnNlU0VMRUNULFxuICBwYXJzZUZFVENILFxuICBwYXJzZVNFQVJDSFxufSBmcm9tICcuL2NvbW1hbmQtcGFyc2VyJ1xuaW1wb3J0IHtcbiAgYnVpbGRGRVRDSENvbW1hbmQsXG4gIGJ1aWxkWE9BdXRoMlRva2VuLFxuICBidWlsZFNFQVJDSENvbW1hbmQsXG4gIGJ1aWxkU1RPUkVDb21tYW5kXG59IGZyb20gJy4vY29tbWFuZC1idWlsZGVyJ1xuXG5pbXBvcnQgY3JlYXRlRGVmYXVsdExvZ2dlciBmcm9tICcuL2xvZ2dlcidcbmltcG9ydCBJbWFwQ2xpZW50IGZyb20gJy4vaW1hcCdcbmltcG9ydCB7XG4gIExPR19MRVZFTF9FUlJPUixcbiAgTE9HX0xFVkVMX1dBUk4sXG4gIExPR19MRVZFTF9JTkZPLFxuICBMT0dfTEVWRUxfREVCVUcsXG4gIExPR19MRVZFTF9BTExcbn0gZnJvbSAnLi9jb21tb24nXG5cbmltcG9ydCB7XG4gIGNoZWNrU3BlY2lhbFVzZVxufSBmcm9tICcuL3NwZWNpYWwtdXNlJ1xuXG5leHBvcnQgY29uc3QgVElNRU9VVF9DT05ORUNUSU9OID0gOTAgKiAxMDAwIC8vIE1pbGxpc2Vjb25kcyB0byB3YWl0IGZvciB0aGUgSU1BUCBncmVldGluZyBmcm9tIHRoZSBzZXJ2ZXJcbmV4cG9ydCBjb25zdCBUSU1FT1VUX05PT1AgPSA2MCAqIDEwMDAgLy8gTWlsbGlzZWNvbmRzIGJldHdlZW4gTk9PUCBjb21tYW5kcyB3aGlsZSBpZGxpbmdcbmV4cG9ydCBjb25zdCBUSU1FT1VUX0lETEUgPSA2MCAqIDEwMDAgLy8gTWlsbGlzZWNvbmRzIHVudGlsIElETEUgY29tbWFuZCBpcyBjYW5jZWxsZWRcblxuZXhwb3J0IGNvbnN0IFNUQVRFX0NPTk5FQ1RJTkcgPSAxXG5leHBvcnQgY29uc3QgU1RBVEVfTk9UX0FVVEhFTlRJQ0FURUQgPSAyXG5leHBvcnQgY29uc3QgU1RBVEVfQVVUSEVOVElDQVRFRCA9IDNcbmV4cG9ydCBjb25zdCBTVEFURV9TRUxFQ1RFRCA9IDRcbmV4cG9ydCBjb25zdCBTVEFURV9MT0dPVVQgPSA1XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0NMSUVOVF9JRCA9IHtcbiAgbmFtZTogJ2VtYWlsanMtaW1hcC1jbGllbnQnXG59XG5cbi8qKlxuICogZW1haWxqcyBJTUFQIGNsaWVudFxuICpcbiAqIEBjb25zdHJ1Y3RvclxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBbaG9zdD0nbG9jYWxob3N0J10gSG9zdG5hbWUgdG8gY29uZW5jdCB0b1xuICogQHBhcmFtIHtOdW1iZXJ9IFtwb3J0PTE0M10gUG9ydCBudW1iZXIgdG8gY29ubmVjdCB0b1xuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBPcHRpb25hbCBvcHRpb25zIG9iamVjdFxuICovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBDbGllbnQge1xuICBjb25zdHJ1Y3RvciAoaG9zdCwgcG9ydCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgdGhpcy50aW1lb3V0Q29ubmVjdGlvbiA9IFRJTUVPVVRfQ09OTkVDVElPTlxuICAgIHRoaXMudGltZW91dE5vb3AgPSBvcHRpb25zLnRpbWVvdXROb29wIHx8IFRJTUVPVVRfTk9PUFxuICAgIHRoaXMudGltZW91dElkbGUgPSBvcHRpb25zLnRpbWVvdXRJZGxlIHx8IFRJTUVPVVRfSURMRVxuXG4gICAgdGhpcy5zZXJ2ZXJJZCA9IGZhbHNlIC8vIFJGQyAyOTcxIFNlcnZlciBJRCBhcyBrZXkgdmFsdWUgcGFpcnNcblxuICAgIC8vIEV2ZW50IHBsYWNlaG9sZGVyc1xuICAgIHRoaXMub25jZXJ0ID0gbnVsbFxuICAgIHRoaXMub251cGRhdGUgPSBudWxsXG4gICAgdGhpcy5vbnNlbGVjdG1haWxib3ggPSBudWxsXG4gICAgdGhpcy5vbmNsb3NlbWFpbGJveCA9IG51bGxcblxuICAgIHRoaXMuX2hvc3QgPSBob3N0XG4gICAgdGhpcy5fY2xpZW50SWQgPSBwcm9wT3IoREVGQVVMVF9DTElFTlRfSUQsICdpZCcsIG9wdGlvbnMpXG4gICAgdGhpcy5fc3RhdGUgPSBmYWxzZSAvLyBDdXJyZW50IHN0YXRlXG4gICAgdGhpcy5fYXV0aGVudGljYXRlZCA9IGZhbHNlIC8vIElzIHRoZSBjb25uZWN0aW9uIGF1dGhlbnRpY2F0ZWRcbiAgICB0aGlzLl9jYXBhYmlsaXR5ID0gW10gLy8gTGlzdCBvZiBleHRlbnNpb25zIHRoZSBzZXJ2ZXIgc3VwcG9ydHNcbiAgICB0aGlzLl9zZWxlY3RlZE1haWxib3ggPSBmYWxzZSAvLyBTZWxlY3RlZCBtYWlsYm94XG4gICAgdGhpcy5fZW50ZXJlZElkbGUgPSBmYWxzZVxuICAgIHRoaXMuX2lkbGVUaW1lb3V0ID0gZmFsc2VcbiAgICB0aGlzLl9lbmFibGVDb21wcmVzc2lvbiA9ICEhb3B0aW9ucy5lbmFibGVDb21wcmVzc2lvblxuICAgIHRoaXMuX2F1dGggPSBvcHRpb25zLmF1dGhcbiAgICB0aGlzLl9yZXF1aXJlVExTID0gISFvcHRpb25zLnJlcXVpcmVUTFNcbiAgICB0aGlzLl9pZ25vcmVUTFMgPSAhIW9wdGlvbnMuaWdub3JlVExTXG4gICAgdGhpcy5faWdub3JlSWRsZUNhcGFiaWxpdHkgPSAhIW9wdGlvbnMuaWdub3JlSWRsZUNhcGFiaWxpdHlcblxuICAgIHRoaXMuY2xpZW50ID0gbmV3IEltYXBDbGllbnQoaG9zdCwgcG9ydCwgb3B0aW9ucykgLy8gSU1BUCBjbGllbnQgb2JqZWN0XG5cbiAgICAvLyBFdmVudCBIYW5kbGVyc1xuICAgIHRoaXMuY2xpZW50Lm9uZXJyb3IgPSB0aGlzLl9vbkVycm9yLmJpbmQodGhpcylcbiAgICB0aGlzLmNsaWVudC5vbmNlcnQgPSAoY2VydCkgPT4gKHRoaXMub25jZXJ0ICYmIHRoaXMub25jZXJ0KGNlcnQpKSAvLyBhbGxvd3MgY2VydGlmaWNhdGUgaGFuZGxpbmcgZm9yIHBsYXRmb3JtcyB3L28gbmF0aXZlIHRscyBzdXBwb3J0XG4gICAgdGhpcy5jbGllbnQub25pZGxlID0gKCkgPT4gdGhpcy5fb25JZGxlKCkgLy8gc3RhcnQgaWRsaW5nXG5cbiAgICAvLyBEZWZhdWx0IGhhbmRsZXJzIGZvciB1bnRhZ2dlZCByZXNwb25zZXNcbiAgICB0aGlzLmNsaWVudC5zZXRIYW5kbGVyKCdjYXBhYmlsaXR5JywgKHJlc3BvbnNlKSA9PiB0aGlzLl91bnRhZ2dlZENhcGFiaWxpdHlIYW5kbGVyKHJlc3BvbnNlKSkgLy8gY2FwYWJpbGl0eSB1cGRhdGVzXG4gICAgdGhpcy5jbGllbnQuc2V0SGFuZGxlcignb2snLCAocmVzcG9uc2UpID0+IHRoaXMuX3VudGFnZ2VkT2tIYW5kbGVyKHJlc3BvbnNlKSkgLy8gbm90aWZpY2F0aW9uc1xuICAgIHRoaXMuY2xpZW50LnNldEhhbmRsZXIoJ2V4aXN0cycsIChyZXNwb25zZSkgPT4gdGhpcy5fdW50YWdnZWRFeGlzdHNIYW5kbGVyKHJlc3BvbnNlKSkgLy8gbWVzc2FnZSBjb3VudCBoYXMgY2hhbmdlZFxuICAgIHRoaXMuY2xpZW50LnNldEhhbmRsZXIoJ2V4cHVuZ2UnLCAocmVzcG9uc2UpID0+IHRoaXMuX3VudGFnZ2VkRXhwdW5nZUhhbmRsZXIocmVzcG9uc2UpKSAvLyBtZXNzYWdlIGhhcyBiZWVuIGRlbGV0ZWRcbiAgICB0aGlzLmNsaWVudC5zZXRIYW5kbGVyKCdmZXRjaCcsIChyZXNwb25zZSkgPT4gdGhpcy5fdW50YWdnZWRGZXRjaEhhbmRsZXIocmVzcG9uc2UpKSAvLyBtZXNzYWdlIGhhcyBiZWVuIHVwZGF0ZWQgKGVnLiBmbGFnIGNoYW5nZSlcblxuICAgIC8vIEFjdGl2YXRlIGxvZ2dpbmdcbiAgICB0aGlzLmNyZWF0ZUxvZ2dlcigpXG4gICAgdGhpcy5sb2dMZXZlbCA9IHByb3BPcihMT0dfTEVWRUxfQUxMLCAnbG9nTGV2ZWwnLCBvcHRpb25zKVxuICB9XG5cbiAgLyoqXG4gICAqIENhbGxlZCBpZiB0aGUgbG93ZXItbGV2ZWwgSW1hcENsaWVudCBoYXMgZW5jb3VudGVyZWQgYW4gdW5yZWNvdmVyYWJsZVxuICAgKiBlcnJvciBkdXJpbmcgb3BlcmF0aW9uLiBDbGVhbnMgdXAgYW5kIHByb3BhZ2F0ZXMgdGhlIGVycm9yIHVwd2FyZHMuXG4gICAqL1xuICBfb25FcnJvciAoZXJyKSB7XG4gICAgLy8gbWFrZSBzdXJlIG5vIGlkbGUgdGltZW91dCBpcyBwZW5kaW5nIGFueW1vcmVcbiAgICBjbGVhclRpbWVvdXQodGhpcy5faWRsZVRpbWVvdXQpXG5cbiAgICAvLyBwcm9wYWdhdGUgdGhlIGVycm9yIHVwd2FyZHNcbiAgICB0aGlzLm9uZXJyb3IgJiYgdGhpcy5vbmVycm9yKGVycilcbiAgfVxuXG4gIC8vXG4gIC8vXG4gIC8vIFBVQkxJQyBBUElcbiAgLy9cbiAgLy9cblxuICAvKipcbiAgICogSW5pdGlhdGUgY29ubmVjdGlvbiBhbmQgbG9naW4gdG8gdGhlIElNQVAgc2VydmVyXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdoZW4gbG9naW4gcHJvY2VkdXJlIGlzIGNvbXBsZXRlXG4gICAqL1xuICBhc3luYyBjb25uZWN0ICgpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5vcGVuQ29ubmVjdGlvbigpXG4gICAgICBhd2FpdCB0aGlzLnVwZ3JhZGVDb25uZWN0aW9uKClcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMudXBkYXRlSWQodGhpcy5fY2xpZW50SWQpXG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgdGhpcy5sb2dnZXIud2FybignRmFpbGVkIHRvIHVwZGF0ZSBzZXJ2ZXIgaWQhJywgZXJyLm1lc3NhZ2UpXG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMubG9naW4odGhpcy5fYXV0aClcbiAgICAgIGF3YWl0IHRoaXMuY29tcHJlc3NDb25uZWN0aW9uKClcbiAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDb25uZWN0aW9uIGVzdGFibGlzaGVkLCByZWFkeSB0byByb2xsIScpXG4gICAgICB0aGlzLmNsaWVudC5vbmVycm9yID0gdGhpcy5fb25FcnJvci5iaW5kKHRoaXMpXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcignQ291bGQgbm90IGNvbm5lY3QgdG8gc2VydmVyJywgZXJyKVxuICAgICAgdGhpcy5jbG9zZShlcnIpIC8vIHdlIGRvbid0IHJlYWxseSBjYXJlIHdoZXRoZXIgdGhpcyB3b3JrcyBvciBub3RcbiAgICAgIHRocm93IGVyclxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBJbml0aWF0ZSBjb25uZWN0aW9uIHRvIHRoZSBJTUFQIHNlcnZlclxuICAgKlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gY2FwYWJpbGl0eSBvZiBzZXJ2ZXIgd2l0aG91dCBsb2dpblxuICAgKi9cbiAgb3BlbkNvbm5lY3Rpb24gKCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCBjb25uZWN0aW9uVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4gcmVqZWN0KG5ldyBFcnJvcignVGltZW91dCBjb25uZWN0aW5nIHRvIHNlcnZlcicpKSwgdGhpcy50aW1lb3V0Q29ubmVjdGlvbilcbiAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDb25uZWN0aW5nIHRvJywgdGhpcy5jbGllbnQuaG9zdCwgJzonLCB0aGlzLmNsaWVudC5wb3J0KVxuICAgICAgdGhpcy5fY2hhbmdlU3RhdGUoU1RBVEVfQ09OTkVDVElORylcbiAgICAgIHRoaXMuY2xpZW50LmNvbm5lY3QoKS50aGVuKCgpID0+IHtcbiAgICAgICAgdGhpcy5sb2dnZXIuZGVidWcoJ1NvY2tldCBvcGVuZWQsIHdhaXRpbmcgZm9yIGdyZWV0aW5nIGZyb20gdGhlIHNlcnZlci4uLicpXG5cbiAgICAgICAgdGhpcy5jbGllbnQub25yZWFkeSA9ICgpID0+IHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQoY29ubmVjdGlvblRpbWVvdXQpXG4gICAgICAgICAgdGhpcy5fY2hhbmdlU3RhdGUoU1RBVEVfTk9UX0FVVEhFTlRJQ0FURUQpXG4gICAgICAgICAgdGhpcy51cGRhdGVDYXBhYmlsaXR5KClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHJlc29sdmUodGhpcy5fY2FwYWJpbGl0eSkpXG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmNsaWVudC5vbmVycm9yID0gKGVycikgPT4ge1xuICAgICAgICAgIGNsZWFyVGltZW91dChjb25uZWN0aW9uVGltZW91dClcbiAgICAgICAgICByZWplY3QoZXJyKVxuICAgICAgICB9XG4gICAgICB9KS5jYXRjaChyZWplY3QpXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBMb2dvdXRcbiAgICpcbiAgICogU2VuZCBMT0dPVVQsIHRvIHdoaWNoIHRoZSBzZXJ2ZXIgcmVzcG9uZHMgYnkgY2xvc2luZyB0aGUgY29ubmVjdGlvbi5cbiAgICogVXNlIGlzIGRpc2NvdXJhZ2VkIGlmIG5ldHdvcmsgc3RhdHVzIGlzIHVuY2xlYXIhIElmIG5ldHdvcmtzIHN0YXR1cyBpc1xuICAgKiB1bmNsZWFyLCBwbGVhc2UgdXNlICNjbG9zZSBpbnN0ZWFkIVxuICAgKlxuICAgKiBMT0dPVVQgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMS4zXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBSZXNvbHZlcyB3aGVuIHNlcnZlciBoYXMgY2xvc2VkIHRoZSBjb25uZWN0aW9uXG4gICAqL1xuICBhc3luYyBsb2dvdXQgKCkge1xuICAgIHRoaXMuX2NoYW5nZVN0YXRlKFNUQVRFX0xPR09VVClcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnTG9nZ2luZyBvdXQuLi4nKVxuICAgIGF3YWl0IHRoaXMuY2xpZW50LmxvZ291dCgpXG4gICAgY2xlYXJUaW1lb3V0KHRoaXMuX2lkbGVUaW1lb3V0KVxuICB9XG5cbiAgLyoqXG4gICAqIEZvcmNlLWNsb3NlcyB0aGUgY3VycmVudCBjb25uZWN0aW9uIGJ5IGNsb3NpbmcgdGhlIFRDUCBzb2NrZXQuXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBSZXNvbHZlcyB3aGVuIHNvY2tldCBpcyBjbG9zZWRcbiAgICovXG4gIGFzeW5jIGNsb3NlIChlcnIpIHtcbiAgICB0aGlzLl9jaGFuZ2VTdGF0ZShTVEFURV9MT0dPVVQpXG4gICAgY2xlYXJUaW1lb3V0KHRoaXMuX2lkbGVUaW1lb3V0KVxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDbG9zaW5nIGNvbm5lY3Rpb24uLi4nKVxuICAgIGF3YWl0IHRoaXMuY2xpZW50LmNsb3NlKGVycilcbiAgICBjbGVhclRpbWVvdXQodGhpcy5faWRsZVRpbWVvdXQpXG4gIH1cblxuICAvKipcbiAgICogUnVucyBJRCBjb21tYW5kLCBwYXJzZXMgSUQgcmVzcG9uc2UsIHNldHMgdGhpcy5zZXJ2ZXJJZFxuICAgKlxuICAgKiBJRCBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzI5NzFcbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IGlkIElEIGFzIEpTT04gb2JqZWN0LiBTZWUgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMjk3MSNzZWN0aW9uLTMuMyBmb3IgcG9zc2libGUgdmFsdWVzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBSZXNvbHZlcyB3aGVuIHJlc3BvbnNlIGhhcyBiZWVuIHBhcnNlZFxuICAgKi9cbiAgYXN5bmMgdXBkYXRlSWQgKGlkKSB7XG4gICAgaWYgKHRoaXMuX2NhcGFiaWxpdHkuaW5kZXhPZignSUQnKSA8IDApIHJldHVyblxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ1VwZGF0aW5nIGlkLi4uJylcblxuICAgIGNvbnN0IGNvbW1hbmQgPSAnSUQnXG4gICAgY29uc3QgYXR0cmlidXRlcyA9IGlkID8gW2ZsYXR0ZW4oT2JqZWN0LmVudHJpZXMoaWQpKV0gOiBbbnVsbF1cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyh7IGNvbW1hbmQsIGF0dHJpYnV0ZXMgfSwgJ0lEJylcbiAgICBjb25zdCBsaXN0ID0gZmxhdHRlbihwYXRoT3IoW10sIFsncGF5bG9hZCcsICdJRCcsICcwJywgJ2F0dHJpYnV0ZXMnLCAnMCddLCByZXNwb25zZSkubWFwKE9iamVjdC52YWx1ZXMpKVxuICAgIGNvbnN0IGtleXMgPSBsaXN0LmZpbHRlcigoXywgaSkgPT4gaSAlIDIgPT09IDApXG4gICAgY29uc3QgdmFsdWVzID0gbGlzdC5maWx0ZXIoKF8sIGkpID0+IGkgJSAyID09PSAxKVxuICAgIHRoaXMuc2VydmVySWQgPSBmcm9tUGFpcnMoemlwKGtleXMsIHZhbHVlcykpXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ1NlcnZlciBpZCB1cGRhdGVkIScsIHRoaXMuc2VydmVySWQpXG4gIH1cblxuICBfc2hvdWxkU2VsZWN0TWFpbGJveCAocGF0aCwgY3R4KSB7XG4gICAgaWYgKCFjdHgpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgY29uc3QgcHJldmlvdXNTZWxlY3QgPSB0aGlzLmNsaWVudC5nZXRQcmV2aW91c2x5UXVldWVkKFsnU0VMRUNUJywgJ0VYQU1JTkUnXSwgY3R4KVxuICAgIGlmIChwcmV2aW91c1NlbGVjdCAmJiBwcmV2aW91c1NlbGVjdC5yZXF1ZXN0LmF0dHJpYnV0ZXMpIHtcbiAgICAgIGNvbnN0IHBhdGhBdHRyaWJ1dGUgPSBwcmV2aW91c1NlbGVjdC5yZXF1ZXN0LmF0dHJpYnV0ZXMuZmluZCgoYXR0cmlidXRlKSA9PiBhdHRyaWJ1dGUudHlwZSA9PT0gJ1NUUklORycpXG4gICAgICBpZiAocGF0aEF0dHJpYnV0ZSkge1xuICAgICAgICByZXR1cm4gcGF0aEF0dHJpYnV0ZS52YWx1ZSAhPT0gcGF0aFxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9zZWxlY3RlZE1haWxib3ggIT09IHBhdGhcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIFNFTEVDVCBvciBFWEFNSU5FIHRvIG9wZW4gYSBtYWlsYm94XG4gICAqXG4gICAqIFNFTEVDVCBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjMuMVxuICAgKiBFWEFNSU5FIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMy4yXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIEZ1bGwgcGF0aCB0byBtYWlsYm94XG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gT3B0aW9ucyBvYmplY3RcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2Ugd2l0aCBpbmZvcm1hdGlvbiBhYm91dCB0aGUgc2VsZWN0ZWQgbWFpbGJveFxuICAgKi9cbiAgYXN5bmMgc2VsZWN0TWFpbGJveCAocGF0aCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgY29uc3QgcXVlcnkgPSB7XG4gICAgICBjb21tYW5kOiBvcHRpb25zLnJlYWRPbmx5ID8gJ0VYQU1JTkUnIDogJ1NFTEVDVCcsXG4gICAgICBhdHRyaWJ1dGVzOiBbeyB0eXBlOiAnU1RSSU5HJywgdmFsdWU6IHBhdGggfV1cbiAgICB9XG5cbiAgICBpZiAob3B0aW9ucy5jb25kc3RvcmUgJiYgdGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdDT05EU1RPUkUnKSA+PSAwKSB7XG4gICAgICBxdWVyeS5hdHRyaWJ1dGVzLnB1c2goW3sgdHlwZTogJ0FUT00nLCB2YWx1ZTogJ0NPTkRTVE9SRScgfV0pXG4gICAgfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ09wZW5pbmcnLCBwYXRoLCAnLi4uJylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyhxdWVyeSwgWydFWElTVFMnLCAnRkxBR1MnLCAnT0snXSwgeyBjdHg6IG9wdGlvbnMuY3R4IH0pXG4gICAgY29uc3QgbWFpbGJveEluZm8gPSBwYXJzZVNFTEVDVChyZXNwb25zZSlcblxuICAgIHRoaXMuX2NoYW5nZVN0YXRlKFNUQVRFX1NFTEVDVEVEKVxuXG4gICAgaWYgKHRoaXMuX3NlbGVjdGVkTWFpbGJveCAhPT0gcGF0aCAmJiB0aGlzLm9uY2xvc2VtYWlsYm94KSB7XG4gICAgICBhd2FpdCB0aGlzLm9uY2xvc2VtYWlsYm94KHRoaXMuX3NlbGVjdGVkTWFpbGJveClcbiAgICB9XG4gICAgdGhpcy5fc2VsZWN0ZWRNYWlsYm94ID0gcGF0aFxuICAgIGlmICh0aGlzLm9uc2VsZWN0bWFpbGJveCkge1xuICAgICAgYXdhaXQgdGhpcy5vbnNlbGVjdG1haWxib3gocGF0aCwgbWFpbGJveEluZm8pXG4gICAgfVxuXG4gICAgcmV0dXJuIG1haWxib3hJbmZvXG4gIH1cblxuICAvKipcbiAgICogU3Vic2NyaWJlIHRvIGEgbWFpbGJveCB3aXRoIHRoZSBnaXZlbiBwYXRoXG4gICAqXG4gICAqIFNVQlNDUklCRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjZcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogICAgIFRoZSBwYXRoIG9mIHRoZSBtYWlsYm94IHlvdSB3b3VsZCBsaWtlIHRvIHN1YnNjcmliZSB0by5cbiAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAqICAgICBQcm9taXNlIHJlc29sdmVzIGlmIG1haWxib3ggaXMgbm93IHN1YnNjcmliZWQgdG8gb3Igd2FzIHNvIGFscmVhZHkuXG4gICAqL1xuICBhc3luYyBzdWJzY3JpYmVNYWlsYm94IChwYXRoKSB7XG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ1N1YnNjcmliaW5nIHRvIG1haWxib3gnLCBwYXRoLCAnLi4uJylcbiAgICByZXR1cm4gdGhpcy5leGVjKHsgY29tbWFuZDogJ1NVQlNDUklCRScsIGF0dHJpYnV0ZXM6IFtwYXRoXSB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFVuc3Vic2NyaWJlIGZyb20gYSBtYWlsYm94IHdpdGggdGhlIGdpdmVuIHBhdGhcbiAgICpcbiAgICogVU5TVUJTQ1JJQkUgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMy43XG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoXG4gICAqICAgICBUaGUgcGF0aCBvZiB0aGUgbWFpbGJveCB5b3Ugd291bGQgbGlrZSB0byB1bnN1YnNjcmliZSBmcm9tLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICogICAgIFByb21pc2UgcmVzb2x2ZXMgaWYgbWFpbGJveCBpcyBubyBsb25nZXIgc3Vic2NyaWJlZCB0byBvciB3YXMgbm90IGJlZm9yZS5cbiAgICovXG4gIGFzeW5jIHVuc3Vic2NyaWJlTWFpbGJveCAocGF0aCkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdVbnN1YnNjcmliaW5nIHRvIG1haWxib3gnLCBwYXRoLCAnLi4uJylcbiAgICByZXR1cm4gdGhpcy5leGVjKHsgY29tbWFuZDogJ1VOU1VCU0NSSUJFJywgYXR0cmlidXRlczogW3BhdGhdIH0pXG4gIH1cblxuICAvKipcbiAgICogUnVucyBOQU1FU1BBQ0UgY29tbWFuZFxuICAgKlxuICAgKiBOQU1FU1BBQ0UgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMjM0MlxuICAgKlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIG5hbWVzcGFjZSBvYmplY3RcbiAgICovXG4gIGFzeW5jIGxpc3ROYW1lc3BhY2VzICgpIHtcbiAgICBpZiAodGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdOQU1FU1BBQ0UnKSA8IDApIHJldHVybiBmYWxzZVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0xpc3RpbmcgbmFtZXNwYWNlcy4uLicpXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmV4ZWMoJ05BTUVTUEFDRScsICdOQU1FU1BBQ0UnKVxuICAgIHJldHVybiBwYXJzZU5BTUVTUEFDRShyZXNwb25zZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIExJU1QgYW5kIExTVUIgY29tbWFuZHMuIFJldHJpZXZlcyBhIHRyZWUgb2YgYXZhaWxhYmxlIG1haWxib3hlc1xuICAgKlxuICAgKiBMSVNUIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMy44XG4gICAqIExTVUIgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjlcbiAgICpcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2Ugd2l0aCBsaXN0IG9mIG1haWxib3hlc1xuICAgKi9cbiAgYXN5bmMgbGlzdE1haWxib3hlcyAoKSB7XG4gICAgY29uc3QgdHJlZSA9IHsgcm9vdDogdHJ1ZSwgY2hpbGRyZW46IFtdIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdMaXN0aW5nIG1haWxib3hlcy4uLicpXG4gICAgY29uc3QgbGlzdFJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKHsgY29tbWFuZDogJ0xJU1QnLCBhdHRyaWJ1dGVzOiBbJycsICcqJ10gfSwgJ0xJU1QnKVxuICAgIGNvbnN0IGxpc3QgPSBwYXRoT3IoW10sIFsncGF5bG9hZCcsICdMSVNUJ10sIGxpc3RSZXNwb25zZSlcbiAgICBsaXN0LmZvckVhY2goaXRlbSA9PiB7XG4gICAgICBjb25zdCBhdHRyID0gcHJvcE9yKFtdLCAnYXR0cmlidXRlcycsIGl0ZW0pXG4gICAgICBpZiAoYXR0ci5sZW5ndGggPCAzKSByZXR1cm5cblxuICAgICAgY29uc3QgcGF0aCA9IHBhdGhPcignJywgWycyJywgJ3ZhbHVlJ10sIGF0dHIpXG4gICAgICBjb25zdCBkZWxpbSA9IHBhdGhPcignLycsIFsnMScsICd2YWx1ZSddLCBhdHRyKVxuICAgICAgY29uc3QgYnJhbmNoID0gdGhpcy5fZW5zdXJlUGF0aCh0cmVlLCBwYXRoLCBkZWxpbSlcbiAgICAgIGJyYW5jaC5mbGFncyA9IHByb3BPcihbXSwgJzAnLCBhdHRyKS5tYXAoKHsgdmFsdWUgfSkgPT4gdmFsdWUgfHwgJycpXG4gICAgICBicmFuY2gubGlzdGVkID0gdHJ1ZVxuICAgICAgY2hlY2tTcGVjaWFsVXNlKGJyYW5jaClcbiAgICB9KVxuXG4gICAgY29uc3QgbHN1YlJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKHsgY29tbWFuZDogJ0xTVUInLCBhdHRyaWJ1dGVzOiBbJycsICcqJ10gfSwgJ0xTVUInKS5jYXRjaChlcnIgPT4ge1xuICAgICAgdGhpcy5sb2dnZXIud2FybignTFNVQiBjb21tYW5kIGZhaWxlZDogJywgZXJyKVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9KVxuICAgIGNvbnN0IGxzdWIgPSBwYXRoT3IoW10sIFsncGF5bG9hZCcsICdMU1VCJ10sIGxzdWJSZXNwb25zZSlcbiAgICBsc3ViLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICAgIGNvbnN0IGF0dHIgPSBwcm9wT3IoW10sICdhdHRyaWJ1dGVzJywgaXRlbSlcbiAgICAgIGlmIChhdHRyLmxlbmd0aCA8IDMpIHJldHVyblxuXG4gICAgICBjb25zdCBwYXRoID0gcGF0aE9yKCcnLCBbJzInLCAndmFsdWUnXSwgYXR0cilcbiAgICAgIGNvbnN0IGRlbGltID0gcGF0aE9yKCcvJywgWycxJywgJ3ZhbHVlJ10sIGF0dHIpXG4gICAgICBjb25zdCBicmFuY2ggPSB0aGlzLl9lbnN1cmVQYXRoKHRyZWUsIHBhdGgsIGRlbGltKVxuICAgICAgcHJvcE9yKFtdLCAnMCcsIGF0dHIpLm1hcCgoZmxhZyA9ICcnKSA9PiB7IGJyYW5jaC5mbGFncyA9IHVuaW9uKGJyYW5jaC5mbGFncywgW2ZsYWddKSB9KVxuICAgICAgYnJhbmNoLnN1YnNjcmliZWQgPSB0cnVlXG4gICAgfSlcblxuICAgIHJldHVybiB0cmVlXG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgbWFpbGJveCB3aXRoIHRoZSBnaXZlbiBwYXRoLlxuICAgKlxuICAgKiBDUkVBVEUgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjNcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogICAgIFRoZSBwYXRoIG9mIHRoZSBtYWlsYm94IHlvdSB3b3VsZCBsaWtlIHRvIGNyZWF0ZS5cbiAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAqICAgICBQcm9taXNlIHJlc29sdmVzIGlmIG1haWxib3ggd2FzIGNyZWF0ZWQuXG4gICAqICAgICBJbiB0aGUgZXZlbnQgdGhlIHNlcnZlciBzYXlzIE5PIFtBTFJFQURZRVhJU1RTXSwgd2UgdHJlYXQgdGhhdCBhcyBzdWNjZXNzLlxuICAgKi9cbiAgYXN5bmMgY3JlYXRlTWFpbGJveCAocGF0aCkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDcmVhdGluZyBtYWlsYm94JywgcGF0aCwgJy4uLicpXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuZXhlYyh7IGNvbW1hbmQ6ICdDUkVBVEUnLCBhdHRyaWJ1dGVzOiBbcGF0aF0gfSlcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGlmIChlcnIgJiYgZXJyLmNvZGUgPT09ICdBTFJFQURZRVhJU1RTJykge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHRocm93IGVyclxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBEZWxldGUgYSBtYWlsYm94IHdpdGggdGhlIGdpdmVuIHBhdGguXG4gICAqXG4gICAqIERFTEVURSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjRcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogICAgIFRoZSBwYXRoIG9mIHRoZSBtYWlsYm94IHlvdSB3b3VsZCBsaWtlIHRvIGRlbGV0ZS5cbiAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAqICAgICBQcm9taXNlIHJlc29sdmVzIGlmIG1haWxib3ggd2FzIGRlbGV0ZWQuXG4gICAqL1xuICBkZWxldGVNYWlsYm94IChwYXRoKSB7XG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0RlbGV0aW5nIG1haWxib3gnLCBwYXRoLCAnLi4uJylcbiAgICByZXR1cm4gdGhpcy5leGVjKHsgY29tbWFuZDogJ0RFTEVURScsIGF0dHJpYnV0ZXM6IFtwYXRoXSB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgRkVUQ0ggY29tbWFuZFxuICAgKlxuICAgKiBGRVRDSCBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjQuNVxuICAgKiBDSEFOR0VEU0lOQ0UgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNDU1MSNzZWN0aW9uLTMuM1xuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBmb3IgdGhlIG1haWxib3ggd2hpY2ggc2hvdWxkIGJlIHNlbGVjdGVkIGZvciB0aGUgY29tbWFuZC4gU2VsZWN0cyBtYWlsYm94IGlmIG5lY2Vzc2FyeVxuICAgKiBAcGFyYW0ge1N0cmluZ30gc2VxdWVuY2UgU2VxdWVuY2Ugc2V0LCBlZyAxOiogZm9yIGFsbCBtZXNzYWdlc1xuICAgKiBAcGFyYW0ge09iamVjdH0gW2l0ZW1zXSBNZXNzYWdlIGRhdGEgaXRlbSBuYW1lcyBvciBtYWNyb1xuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIHRoZSBmZXRjaGVkIG1lc3NhZ2UgaW5mb1xuICAgKi9cbiAgYXN5bmMgbGlzdE1lc3NhZ2VzIChwYXRoLCBzZXF1ZW5jZSwgaXRlbXMgPSBbeyBmYXN0OiB0cnVlIH1dLCBvcHRpb25zID0ge30pIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnRmV0Y2hpbmcgbWVzc2FnZXMnLCBzZXF1ZW5jZSwgJ2Zyb20nLCBwYXRoLCAnLi4uJylcbiAgICBjb25zdCBjb21tYW5kID0gYnVpbGRGRVRDSENvbW1hbmQoc2VxdWVuY2UsIGl0ZW1zLCBvcHRpb25zKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKGNvbW1hbmQsICdGRVRDSCcsIHtcbiAgICAgIHByZWNoZWNrOiAoY3R4KSA9PiB0aGlzLl9zaG91bGRTZWxlY3RNYWlsYm94KHBhdGgsIGN0eCkgPyB0aGlzLnNlbGVjdE1haWxib3gocGF0aCwgeyBjdHggfSkgOiBQcm9taXNlLnJlc29sdmUoKVxuICAgIH0pXG4gICAgcmV0dXJuIHBhcnNlRkVUQ0gocmVzcG9uc2UpXG4gIH1cblxuICAvKipcbiAgICogUnVucyBTRUFSQ0ggY29tbWFuZFxuICAgKlxuICAgKiBTRUFSQ0ggZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi40LjRcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtPYmplY3R9IHF1ZXJ5IFNlYXJjaCB0ZXJtc1xuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIHRoZSBhcnJheSBvZiBtYXRjaGluZyBzZXEuIG9yIHVpZCBudW1iZXJzXG4gICAqL1xuICBhc3luYyBzZWFyY2ggKHBhdGgsIHF1ZXJ5LCBvcHRpb25zID0ge30pIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnU2VhcmNoaW5nIGluJywgcGF0aCwgJy4uLicpXG4gICAgY29uc3QgY29tbWFuZCA9IGJ1aWxkU0VBUkNIQ29tbWFuZChxdWVyeSwgb3B0aW9ucylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyhjb21tYW5kLCAnU0VBUkNIJywge1xuICAgICAgcHJlY2hlY2s6IChjdHgpID0+IHRoaXMuX3Nob3VsZFNlbGVjdE1haWxib3gocGF0aCwgY3R4KSA/IHRoaXMuc2VsZWN0TWFpbGJveChwYXRoLCB7IGN0eCB9KSA6IFByb21pc2UucmVzb2x2ZSgpXG4gICAgfSlcbiAgICByZXR1cm4gcGFyc2VTRUFSQ0gocmVzcG9uc2UpXG4gIH1cblxuICAvKipcbiAgICogUnVucyBTVE9SRSBjb21tYW5kXG4gICAqXG4gICAqIFNUT1JFIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuNC42XG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIGZvciB0aGUgbWFpbGJveCB3aGljaCBzaG91bGQgYmUgc2VsZWN0ZWQgZm9yIHRoZSBjb21tYW5kLiBTZWxlY3RzIG1haWxib3ggaWYgbmVjZXNzYXJ5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzZXF1ZW5jZSBNZXNzYWdlIHNlbGVjdG9yIHdoaWNoIHRoZSBmbGFnIGNoYW5nZSBpcyBhcHBsaWVkIHRvXG4gICAqIEBwYXJhbSB7QXJyYXl9IGZsYWdzXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gUXVlcnkgbW9kaWZpZXJzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggdGhlIGFycmF5IG9mIG1hdGNoaW5nIHNlcS4gb3IgdWlkIG51bWJlcnNcbiAgICovXG4gIHNldEZsYWdzIChwYXRoLCBzZXF1ZW5jZSwgZmxhZ3MsIG9wdGlvbnMpIHtcbiAgICBsZXQga2V5ID0gJydcbiAgICBsZXQgbGlzdCA9IFtdXG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShmbGFncykgfHwgdHlwZW9mIGZsYWdzICE9PSAnb2JqZWN0Jykge1xuICAgICAgbGlzdCA9IFtdLmNvbmNhdChmbGFncyB8fCBbXSlcbiAgICAgIGtleSA9ICcnXG4gICAgfSBlbHNlIGlmIChmbGFncy5hZGQpIHtcbiAgICAgIGxpc3QgPSBbXS5jb25jYXQoZmxhZ3MuYWRkIHx8IFtdKVxuICAgICAga2V5ID0gJysnXG4gICAgfSBlbHNlIGlmIChmbGFncy5zZXQpIHtcbiAgICAgIGtleSA9ICcnXG4gICAgICBsaXN0ID0gW10uY29uY2F0KGZsYWdzLnNldCB8fCBbXSlcbiAgICB9IGVsc2UgaWYgKGZsYWdzLnJlbW92ZSkge1xuICAgICAga2V5ID0gJy0nXG4gICAgICBsaXN0ID0gW10uY29uY2F0KGZsYWdzLnJlbW92ZSB8fCBbXSlcbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnU2V0dGluZyBmbGFncyBvbicsIHNlcXVlbmNlLCAnaW4nLCBwYXRoLCAnLi4uJylcbiAgICByZXR1cm4gdGhpcy5zdG9yZShwYXRoLCBzZXF1ZW5jZSwga2V5ICsgJ0ZMQUdTJywgbGlzdCwgb3B0aW9ucylcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIFNUT1JFIGNvbW1hbmRcbiAgICpcbiAgICogU1RPUkUgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi40LjZcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHNlcXVlbmNlIE1lc3NhZ2Ugc2VsZWN0b3Igd2hpY2ggdGhlIGZsYWcgY2hhbmdlIGlzIGFwcGxpZWQgdG9cbiAgICogQHBhcmFtIHtTdHJpbmd9IGFjdGlvbiBTVE9SRSBtZXRob2QgdG8gY2FsbCwgZWcgXCIrRkxBR1NcIlxuICAgKiBAcGFyYW0ge0FycmF5fSBmbGFnc1xuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIHRoZSBhcnJheSBvZiBtYXRjaGluZyBzZXEuIG9yIHVpZCBudW1iZXJzXG4gICAqL1xuICBhc3luYyBzdG9yZSAocGF0aCwgc2VxdWVuY2UsIGFjdGlvbiwgZmxhZ3MsIG9wdGlvbnMgPSB7fSkge1xuICAgIGNvbnN0IGNvbW1hbmQgPSBidWlsZFNUT1JFQ29tbWFuZChzZXF1ZW5jZSwgYWN0aW9uLCBmbGFncywgb3B0aW9ucylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyhjb21tYW5kLCAnRkVUQ0gnLCB7XG4gICAgICBwcmVjaGVjazogKGN0eCkgPT4gdGhpcy5fc2hvdWxkU2VsZWN0TWFpbGJveChwYXRoLCBjdHgpID8gdGhpcy5zZWxlY3RNYWlsYm94KHBhdGgsIHsgY3R4IH0pIDogUHJvbWlzZS5yZXNvbHZlKClcbiAgICB9KVxuICAgIHJldHVybiBwYXJzZUZFVENIKHJlc3BvbnNlKVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgQVBQRU5EIGNvbW1hbmRcbiAgICpcbiAgICogQVBQRU5EIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMy4xMVxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gZGVzdGluYXRpb24gVGhlIG1haWxib3ggd2hlcmUgdG8gYXBwZW5kIHRoZSBtZXNzYWdlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIFRoZSBtZXNzYWdlIHRvIGFwcGVuZFxuICAgKiBAcGFyYW0ge0FycmF5fSBvcHRpb25zLmZsYWdzIEFueSBmbGFncyB5b3Ugd2FudCB0byBzZXQgb24gdGhlIHVwbG9hZGVkIG1lc3NhZ2UuIERlZmF1bHRzIHRvIFtcXFNlZW5dLiAob3B0aW9uYWwpXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggdGhlIGFycmF5IG9mIG1hdGNoaW5nIHNlcS4gb3IgdWlkIG51bWJlcnNcbiAgICovXG4gIGFzeW5jIHVwbG9hZCAoZGVzdGluYXRpb24sIG1lc3NhZ2UsIG9wdGlvbnMgPSB7fSkge1xuICAgIGNvbnN0IGZsYWdzID0gcHJvcE9yKFsnXFxcXFNlZW4nXSwgJ2ZsYWdzJywgb3B0aW9ucykubWFwKHZhbHVlID0+ICh7IHR5cGU6ICdhdG9tJywgdmFsdWUgfSkpXG4gICAgY29uc3QgY29tbWFuZCA9IHtcbiAgICAgIGNvbW1hbmQ6ICdBUFBFTkQnLFxuICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICB7IHR5cGU6ICdhdG9tJywgdmFsdWU6IGRlc3RpbmF0aW9uIH0sXG4gICAgICAgIGZsYWdzLFxuICAgICAgICB7IHR5cGU6ICdsaXRlcmFsJywgdmFsdWU6IG1lc3NhZ2UgfVxuICAgICAgXVxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdVcGxvYWRpbmcgbWVzc2FnZSB0bycsIGRlc3RpbmF0aW9uLCAnLi4uJylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyhjb21tYW5kKVxuICAgIHJldHVybiBwYXJzZUFQUEVORChyZXNwb25zZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBEZWxldGVzIG1lc3NhZ2VzIGZyb20gYSBzZWxlY3RlZCBtYWlsYm94XG4gICAqXG4gICAqIEVYUFVOR0UgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi40LjNcbiAgICogVUlEIEVYUFVOR0UgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNDMxNSNzZWN0aW9uLTIuMVxuICAgKlxuICAgKiBJZiBwb3NzaWJsZSAoYnlVaWQ6dHJ1ZSBhbmQgVUlEUExVUyBleHRlbnNpb24gc3VwcG9ydGVkKSwgdXNlcyBVSUQgRVhQVU5HRVxuICAgKiBjb21tYW5kIHRvIGRlbGV0ZSBhIHJhbmdlIG9mIG1lc3NhZ2VzLCBvdGhlcndpc2UgZmFsbHMgYmFjayB0byBFWFBVTkdFLlxuICAgKlxuICAgKiBOQiEgVGhpcyBtZXRob2QgbWlnaHQgYmUgZGVzdHJ1Y3RpdmUgLSBpZiBFWFBVTkdFIGlzIHVzZWQsIHRoZW4gYW55IG1lc3NhZ2VzXG4gICAqIHdpdGggXFxEZWxldGVkIGZsYWcgc2V0IGFyZSBkZWxldGVkXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIGZvciB0aGUgbWFpbGJveCB3aGljaCBzaG91bGQgYmUgc2VsZWN0ZWQgZm9yIHRoZSBjb21tYW5kLiBTZWxlY3RzIG1haWxib3ggaWYgbmVjZXNzYXJ5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzZXF1ZW5jZSBNZXNzYWdlIHJhbmdlIHRvIGJlIGRlbGV0ZWRcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBRdWVyeSBtb2RpZmllcnNcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2VcbiAgICovXG4gIGFzeW5jIGRlbGV0ZU1lc3NhZ2VzIChwYXRoLCBzZXF1ZW5jZSwgb3B0aW9ucyA9IHt9KSB7XG4gICAgLy8gYWRkIFxcRGVsZXRlZCBmbGFnIHRvIHRoZSBtZXNzYWdlcyBhbmQgcnVuIEVYUFVOR0Ugb3IgVUlEIEVYUFVOR0VcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnRGVsZXRpbmcgbWVzc2FnZXMnLCBzZXF1ZW5jZSwgJ2luJywgcGF0aCwgJy4uLicpXG4gICAgY29uc3QgdXNlVWlkUGx1cyA9IG9wdGlvbnMuYnlVaWQgJiYgdGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdVSURQTFVTJykgPj0gMFxuICAgIGNvbnN0IHVpZEV4cHVuZ2VDb21tYW5kID0geyBjb21tYW5kOiAnVUlEIEVYUFVOR0UnLCBhdHRyaWJ1dGVzOiBbeyB0eXBlOiAnc2VxdWVuY2UnLCB2YWx1ZTogc2VxdWVuY2UgfV0gfVxuICAgIGF3YWl0IHRoaXMuc2V0RmxhZ3MocGF0aCwgc2VxdWVuY2UsIHsgYWRkOiAnXFxcXERlbGV0ZWQnIH0sIG9wdGlvbnMpXG4gICAgY29uc3QgY21kID0gdXNlVWlkUGx1cyA/IHVpZEV4cHVuZ2VDb21tYW5kIDogJ0VYUFVOR0UnXG4gICAgcmV0dXJuIHRoaXMuZXhlYyhjbWQsIG51bGwsIHtcbiAgICAgIHByZWNoZWNrOiAoY3R4KSA9PiB0aGlzLl9zaG91bGRTZWxlY3RNYWlsYm94KHBhdGgsIGN0eCkgPyB0aGlzLnNlbGVjdE1haWxib3gocGF0aCwgeyBjdHggfSkgOiBQcm9taXNlLnJlc29sdmUoKVxuICAgIH0pXG4gIH1cblxuICAvKipcbiAgICogQ29waWVzIGEgcmFuZ2Ugb2YgbWVzc2FnZXMgZnJvbSB0aGUgYWN0aXZlIG1haWxib3ggdG8gdGhlIGRlc3RpbmF0aW9uIG1haWxib3guXG4gICAqIFNpbGVudCBtZXRob2QgKHVubGVzcyBhbiBlcnJvciBvY2N1cnMpLCBieSBkZWZhdWx0IHJldHVybnMgbm8gaW5mb3JtYXRpb24uXG4gICAqXG4gICAqIENPUFkgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi40LjdcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHNlcXVlbmNlIE1lc3NhZ2UgcmFuZ2UgdG8gYmUgY29waWVkXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBkZXN0aW5hdGlvbiBEZXN0aW5hdGlvbiBtYWlsYm94IHBhdGhcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBRdWVyeSBtb2RpZmllcnNcbiAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5ieVVpZF0gSWYgdHJ1ZSwgdXNlcyBVSUQgQ09QWSBpbnN0ZWFkIG9mIENPUFlcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2VcbiAgICovXG4gIGFzeW5jIGNvcHlNZXNzYWdlcyAocGF0aCwgc2VxdWVuY2UsIGRlc3RpbmF0aW9uLCBvcHRpb25zID0ge30pIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnQ29weWluZyBtZXNzYWdlcycsIHNlcXVlbmNlLCAnZnJvbScsIHBhdGgsICd0bycsIGRlc3RpbmF0aW9uLCAnLi4uJylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyh7XG4gICAgICBjb21tYW5kOiBvcHRpb25zLmJ5VWlkID8gJ1VJRCBDT1BZJyA6ICdDT1BZJyxcbiAgICAgIGF0dHJpYnV0ZXM6IFtcbiAgICAgICAgeyB0eXBlOiAnc2VxdWVuY2UnLCB2YWx1ZTogc2VxdWVuY2UgfSxcbiAgICAgICAgeyB0eXBlOiAnYXRvbScsIHZhbHVlOiBkZXN0aW5hdGlvbiB9XG4gICAgICBdXG4gICAgfSwgbnVsbCwge1xuICAgICAgcHJlY2hlY2s6IChjdHgpID0+IHRoaXMuX3Nob3VsZFNlbGVjdE1haWxib3gocGF0aCwgY3R4KSA/IHRoaXMuc2VsZWN0TWFpbGJveChwYXRoLCB7IGN0eCB9KSA6IFByb21pc2UucmVzb2x2ZSgpXG4gICAgfSlcbiAgICByZXR1cm4gcGFyc2VDT1BZKHJlc3BvbnNlKVxuICB9XG5cbiAgLyoqXG4gICAqIE1vdmVzIGEgcmFuZ2Ugb2YgbWVzc2FnZXMgZnJvbSB0aGUgYWN0aXZlIG1haWxib3ggdG8gdGhlIGRlc3RpbmF0aW9uIG1haWxib3guXG4gICAqIFByZWZlcnMgdGhlIE1PVkUgZXh0ZW5zaW9uIGJ1dCBpZiBub3QgYXZhaWxhYmxlLCBmYWxscyBiYWNrIHRvXG4gICAqIENPUFkgKyBFWFBVTkdFXG4gICAqXG4gICAqIE1PVkUgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM2ODUxXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIGZvciB0aGUgbWFpbGJveCB3aGljaCBzaG91bGQgYmUgc2VsZWN0ZWQgZm9yIHRoZSBjb21tYW5kLiBTZWxlY3RzIG1haWxib3ggaWYgbmVjZXNzYXJ5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzZXF1ZW5jZSBNZXNzYWdlIHJhbmdlIHRvIGJlIG1vdmVkXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBkZXN0aW5hdGlvbiBEZXN0aW5hdGlvbiBtYWlsYm94IHBhdGhcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBRdWVyeSBtb2RpZmllcnNcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2VcbiAgICovXG4gIGFzeW5jIG1vdmVNZXNzYWdlcyAocGF0aCwgc2VxdWVuY2UsIGRlc3RpbmF0aW9uLCBvcHRpb25zID0ge30pIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnTW92aW5nIG1lc3NhZ2VzJywgc2VxdWVuY2UsICdmcm9tJywgcGF0aCwgJ3RvJywgZGVzdGluYXRpb24sICcuLi4nKVxuXG4gICAgaWYgKHRoaXMuX2NhcGFiaWxpdHkuaW5kZXhPZignTU9WRScpID09PSAtMSkge1xuICAgICAgLy8gRmFsbGJhY2sgdG8gQ09QWSArIEVYUFVOR0VcbiAgICAgIGF3YWl0IHRoaXMuY29weU1lc3NhZ2VzKHBhdGgsIHNlcXVlbmNlLCBkZXN0aW5hdGlvbiwgb3B0aW9ucylcbiAgICAgIHJldHVybiB0aGlzLmRlbGV0ZU1lc3NhZ2VzKHBhdGgsIHNlcXVlbmNlLCBvcHRpb25zKVxuICAgIH1cblxuICAgIC8vIElmIHBvc3NpYmxlLCB1c2UgTU9WRVxuICAgIHJldHVybiB0aGlzLmV4ZWMoe1xuICAgICAgY29tbWFuZDogb3B0aW9ucy5ieVVpZCA/ICdVSUQgTU9WRScgOiAnTU9WRScsXG4gICAgICBhdHRyaWJ1dGVzOiBbXG4gICAgICAgIHsgdHlwZTogJ3NlcXVlbmNlJywgdmFsdWU6IHNlcXVlbmNlIH0sXG4gICAgICAgIHsgdHlwZTogJ2F0b20nLCB2YWx1ZTogZGVzdGluYXRpb24gfVxuICAgICAgXVxuICAgIH0sIFsnT0snXSwge1xuICAgICAgcHJlY2hlY2s6IChjdHgpID0+IHRoaXMuX3Nob3VsZFNlbGVjdE1haWxib3gocGF0aCwgY3R4KSA/IHRoaXMuc2VsZWN0TWFpbGJveChwYXRoLCB7IGN0eCB9KSA6IFByb21pc2UucmVzb2x2ZSgpXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIENPTVBSRVNTIGNvbW1hbmRcbiAgICpcbiAgICogQ09NUFJFU1MgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNDk3OFxuICAgKi9cbiAgYXN5bmMgY29tcHJlc3NDb25uZWN0aW9uICgpIHtcbiAgICBpZiAoIXRoaXMuX2VuYWJsZUNvbXByZXNzaW9uIHx8IHRoaXMuX2NhcGFiaWxpdHkuaW5kZXhPZignQ09NUFJFU1M9REVGTEFURScpIDwgMCB8fCB0aGlzLmNsaWVudC5jb21wcmVzc2VkKSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnRW5hYmxpbmcgY29tcHJlc3Npb24uLi4nKVxuICAgIGF3YWl0IHRoaXMuZXhlYyh7XG4gICAgICBjb21tYW5kOiAnQ09NUFJFU1MnLFxuICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgdHlwZTogJ0FUT00nLFxuICAgICAgICB2YWx1ZTogJ0RFRkxBVEUnXG4gICAgICB9XVxuICAgIH0pXG4gICAgdGhpcy5jbGllbnQuZW5hYmxlQ29tcHJlc3Npb24oKVxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDb21wcmVzc2lvbiBlbmFibGVkLCBhbGwgZGF0YSBzZW50IGFuZCByZWNlaXZlZCBpcyBkZWZsYXRlZCEnKVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgTE9HSU4gb3IgQVVUSEVOVElDQVRFIFhPQVVUSDIgY29tbWFuZFxuICAgKlxuICAgKiBMT0dJTiBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjIuM1xuICAgKiBYT0FVVEgyIGRldGFpbHM6XG4gICAqICAgaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vZ21haWwveG9hdXRoMl9wcm90b2NvbCNpbWFwX3Byb3RvY29sX2V4Y2hhbmdlXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBhdXRoLnVzZXJcbiAgICogQHBhcmFtIHtTdHJpbmd9IGF1dGgucGFzc1xuICAgKiBAcGFyYW0ge1N0cmluZ30gYXV0aC54b2F1dGgyXG4gICAqL1xuICBhc3luYyBsb2dpbiAoYXV0aCkge1xuICAgIGxldCBjb21tYW5kXG4gICAgY29uc3Qgb3B0aW9ucyA9IHt9XG5cbiAgICBpZiAoIWF1dGgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQXV0aGVudGljYXRpb24gaW5mb3JtYXRpb24gbm90IHByb3ZpZGVkJylcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdBVVRIPVhPQVVUSDInKSA+PSAwICYmIGF1dGggJiYgYXV0aC54b2F1dGgyKSB7XG4gICAgICBjb21tYW5kID0ge1xuICAgICAgICBjb21tYW5kOiAnQVVUSEVOVElDQVRFJyxcbiAgICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICAgIHsgdHlwZTogJ0FUT00nLCB2YWx1ZTogJ1hPQVVUSDInIH0sXG4gICAgICAgICAgeyB0eXBlOiAnQVRPTScsIHZhbHVlOiBidWlsZFhPQXV0aDJUb2tlbihhdXRoLnVzZXIsIGF1dGgueG9hdXRoMiksIHNlbnNpdGl2ZTogdHJ1ZSB9XG4gICAgICAgIF1cbiAgICAgIH1cblxuICAgICAgb3B0aW9ucy5lcnJvclJlc3BvbnNlRXhwZWN0c0VtcHR5TGluZSA9IHRydWUgLy8gKyB0YWdnZWQgZXJyb3IgcmVzcG9uc2UgZXhwZWN0cyBhbiBlbXB0eSBsaW5lIGluIHJldHVyblxuICAgIH0gZWxzZSBpZiAodGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdBVVRIPVBMQUlOJykgPj0gMCkge1xuICAgICAgY29tbWFuZCA9IHtcbiAgICAgICAgY29tbWFuZDogJ0FVVEhFTlRJQ0FURScsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFtcbiAgICAgICAgICB7IHR5cGU6ICdBVE9NJywgdmFsdWU6ICdQTEFJTicgfSxcbiAgICAgICAgICB7IHR5cGU6ICdBVE9NJywgdmFsdWU6IEJ1ZmZlci5mcm9tKCdcXHgwMCcgKyBhdXRoLnVzZXIgKyAnXFx4MDAnICsgYXV0aC5wYXNzIHx8ICcnKS50b1N0cmluZygnYmFzZTY0JyksIHNlbnNpdGl2ZTogdHJ1ZSB9XG4gICAgICAgIF1cbiAgICAgIH1cbiAgICAgIG9wdGlvbnMuZXJyb3JSZXNwb25zZUV4cGVjdHNFbXB0eUxpbmUgPSB0cnVlIC8vICsgdGFnZ2VkIGVycm9yIHJlc3BvbnNlIGV4cGVjdHMgYW4gZW1wdHkgbGluZSBpbiByZXR1cm5cbiAgICB9IGVsc2Uge1xuICAgICAgY29tbWFuZCA9IHtcbiAgICAgICAgY29tbWFuZDogJ2xvZ2luJyxcbiAgICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICAgIHsgdHlwZTogJ1NUUklORycsIHZhbHVlOiBhdXRoLnVzZXIgfHwgJycgfSxcbiAgICAgICAgICB7IHR5cGU6ICdTVFJJTkcnLCB2YWx1ZTogYXV0aC5wYXNzIHx8ICcnLCBzZW5zaXRpdmU6IHRydWUgfVxuICAgICAgICBdXG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0xvZ2dpbmcgaW4uLi4nKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKGNvbW1hbmQsICdjYXBhYmlsaXR5Jywgb3B0aW9ucylcbiAgICAvKlxuICAgICAqIHVwZGF0ZSBwb3N0LWF1dGggY2FwYWJpbGl0ZXNcbiAgICAgKiBjYXBhYmlsaXR5IGxpc3Qgc2hvdWxkbid0IGNvbnRhaW4gYXV0aCByZWxhdGVkIHN0dWZmIGFueW1vcmVcbiAgICAgKiBidXQgc29tZSBuZXcgZXh0ZW5zaW9ucyBtaWdodCBoYXZlIHBvcHBlZCB1cCB0aGF0IGRvIG5vdFxuICAgICAqIG1ha2UgbXVjaCBzZW5zZSBpbiB0aGUgbm9uLWF1dGggc3RhdGVcbiAgICAgKi9cbiAgICBpZiAocmVzcG9uc2UuY2FwYWJpbGl0eSAmJiByZXNwb25zZS5jYXBhYmlsaXR5Lmxlbmd0aCkge1xuICAgICAgLy8gY2FwYWJpbGl0ZXMgd2VyZSBsaXN0ZWQgd2l0aCB0aGUgT0sgW0NBUEFCSUxJVFkgLi4uXSByZXNwb25zZVxuICAgICAgdGhpcy5fY2FwYWJpbGl0eSA9IHJlc3BvbnNlLmNhcGFiaWxpdHlcbiAgICB9IGVsc2UgaWYgKHJlc3BvbnNlLnBheWxvYWQgJiYgcmVzcG9uc2UucGF5bG9hZC5DQVBBQklMSVRZICYmIHJlc3BvbnNlLnBheWxvYWQuQ0FQQUJJTElUWS5sZW5ndGgpIHtcbiAgICAgIC8vIGNhcGFiaWxpdGVzIHdlcmUgbGlzdGVkIHdpdGggKiBDQVBBQklMSVRZIC4uLiByZXNwb25zZVxuICAgICAgdGhpcy5fY2FwYWJpbGl0eSA9IHJlc3BvbnNlLnBheWxvYWQuQ0FQQUJJTElUWS5wb3AoKS5hdHRyaWJ1dGVzLm1hcCgoY2FwYSA9ICcnKSA9PiBjYXBhLnZhbHVlLnRvVXBwZXJDYXNlKCkudHJpbSgpKVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBjYXBhYmlsaXRpZXMgd2VyZSBub3QgYXV0b21hdGljYWxseSBsaXN0ZWQsIHJlbG9hZFxuICAgICAgYXdhaXQgdGhpcy51cGRhdGVDYXBhYmlsaXR5KHRydWUpXG4gICAgfVxuXG4gICAgdGhpcy5fY2hhbmdlU3RhdGUoU1RBVEVfQVVUSEVOVElDQVRFRClcbiAgICB0aGlzLl9hdXRoZW50aWNhdGVkID0gdHJ1ZVxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdMb2dpbiBzdWNjZXNzZnVsLCBwb3N0LWF1dGggY2FwYWJpbGl0ZXMgdXBkYXRlZCEnLCB0aGlzLl9jYXBhYmlsaXR5KVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1biBhbiBJTUFQIGNvbW1hbmQuXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXF1ZXN0IFN0cnVjdHVyZWQgcmVxdWVzdCBvYmplY3RcbiAgICogQHBhcmFtIHtBcnJheX0gYWNjZXB0VW50YWdnZWQgYSBsaXN0IG9mIHVudGFnZ2VkIHJlc3BvbnNlcyB0aGF0IHdpbGwgYmUgaW5jbHVkZWQgaW4gJ3BheWxvYWQnIHByb3BlcnR5XG4gICAqL1xuICBhc3luYyBleGVjIChyZXF1ZXN0LCBhY2NlcHRVbnRhZ2dlZCwgb3B0aW9ucykge1xuICAgIHRoaXMuYnJlYWtJZGxlKClcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuY2xpZW50LmVucXVldWVDb21tYW5kKHJlcXVlc3QsIGFjY2VwdFVudGFnZ2VkLCBvcHRpb25zKVxuICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5jYXBhYmlsaXR5KSB7XG4gICAgICB0aGlzLl9jYXBhYmlsaXR5ID0gcmVzcG9uc2UuY2FwYWJpbGl0eVxuICAgIH1cbiAgICByZXR1cm4gcmVzcG9uc2VcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGUgY29ubmVjdGlvbiBpcyBpZGxpbmcuIFNlbmRzIGEgTk9PUCBvciBJRExFIGNvbW1hbmRcbiAgICpcbiAgICogSURMRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMyMTc3XG4gICAqL1xuICBlbnRlcklkbGUgKCkge1xuICAgIGlmICh0aGlzLl9lbnRlcmVkSWRsZSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHRoaXMuX2VudGVyZWRJZGxlID0gIXRoaXMuX2lnbm9yZUlkbGVDYXBhYmlsaXR5ICYmIHRoaXMuX3NlbGVjdGVkTWFpbGJveCAmJiB0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ0lETEUnKSA+PSAwID8gJ0lETEUnIDogJ05PT1AnXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0VudGVyaW5nIGlkbGUgd2l0aCAnICsgdGhpcy5fZW50ZXJlZElkbGUpXG5cbiAgICBpZiAodGhpcy5fZW50ZXJlZElkbGUgPT09ICdOT09QJykge1xuICAgICAgdGhpcy5faWRsZVRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgdGhpcy5sb2dnZXIuZGVidWcoJ1NlbmRpbmcgTk9PUCcpXG4gICAgICAgIHRoaXMuZXhlYygnTk9PUCcpXG4gICAgICB9LCB0aGlzLnRpbWVvdXROb29wKVxuICAgIH0gZWxzZSBpZiAodGhpcy5fZW50ZXJlZElkbGUgPT09ICdJRExFJykge1xuICAgICAgdGhpcy5jbGllbnQuZW5xdWV1ZUNvbW1hbmQoe1xuICAgICAgICBjb21tYW5kOiAnSURMRSdcbiAgICAgIH0pXG4gICAgICB0aGlzLl9pZGxlVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICB0aGlzLmNsaWVudC5zZW5kKCdET05FXFxyXFxuJylcbiAgICAgICAgdGhpcy5fZW50ZXJlZElkbGUgPSBmYWxzZVxuICAgICAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnSWRsZSB0ZXJtaW5hdGVkJylcbiAgICAgIH0sIHRoaXMudGltZW91dElkbGUpXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN0b3BzIGFjdGlvbnMgcmVsYXRlZCBpZGxpbmcsIGlmIElETEUgaXMgc3VwcG9ydGVkLCBzZW5kcyBET05FIHRvIHN0b3AgaXRcbiAgICovXG4gIGJyZWFrSWRsZSAoKSB7XG4gICAgaWYgKCF0aGlzLl9lbnRlcmVkSWRsZSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY2xlYXJUaW1lb3V0KHRoaXMuX2lkbGVUaW1lb3V0KVxuICAgIGlmICh0aGlzLl9lbnRlcmVkSWRsZSA9PT0gJ0lETEUnKSB7XG4gICAgICB0aGlzLmNsaWVudC5zZW5kKCdET05FXFxyXFxuJylcbiAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdJZGxlIHRlcm1pbmF0ZWQnKVxuICAgIH1cbiAgICB0aGlzLl9lbnRlcmVkSWRsZSA9IGZhbHNlXG4gIH1cblxuICAvKipcbiAgICogUnVucyBTVEFSVFRMUyBjb21tYW5kIGlmIG5lZWRlZFxuICAgKlxuICAgKiBTVEFSVFRMUyBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjIuMVxuICAgKlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtmb3JjZWRdIEJ5IGRlZmF1bHQgdGhlIGNvbW1hbmQgaXMgbm90IHJ1biBpZiBjYXBhYmlsaXR5IGlzIGFscmVhZHkgbGlzdGVkLiBTZXQgdG8gdHJ1ZSB0byBza2lwIHRoaXMgdmFsaWRhdGlvblxuICAgKi9cbiAgYXN5bmMgdXBncmFkZUNvbm5lY3Rpb24gKCkge1xuICAgIC8vIHNraXAgcmVxdWVzdCwgaWYgYWxyZWFkeSBzZWN1cmVkXG4gICAgaWYgKHRoaXMuY2xpZW50LnNlY3VyZU1vZGUpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIC8vIHNraXAgaWYgU1RBUlRUTFMgbm90IGF2YWlsYWJsZSBvciBzdGFydHRscyBzdXBwb3J0IGRpc2FibGVkXG4gICAgaWYgKCh0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ1NUQVJUVExTJykgPCAwIHx8IHRoaXMuX2lnbm9yZVRMUykgJiYgIXRoaXMuX3JlcXVpcmVUTFMpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdFbmNyeXB0aW5nIGNvbm5lY3Rpb24uLi4nKVxuICAgIGF3YWl0IHRoaXMuZXhlYygnU1RBUlRUTFMnKVxuICAgIHRoaXMuX2NhcGFiaWxpdHkgPSBbXVxuICAgIHRoaXMuY2xpZW50LnVwZ3JhZGUoKVxuICAgIHJldHVybiB0aGlzLnVwZGF0ZUNhcGFiaWxpdHkoKVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgQ0FQQUJJTElUWSBjb21tYW5kXG4gICAqXG4gICAqIENBUEFCSUxJVFkgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4xLjFcbiAgICpcbiAgICogRG9lc24ndCByZWdpc3RlciB1bnRhZ2dlZCBDQVBBQklMSVRZIGhhbmRsZXIgYXMgdGhpcyBpcyBhbHJlYWR5XG4gICAqIGhhbmRsZWQgYnkgZ2xvYmFsIGhhbmRsZXJcbiAgICpcbiAgICogQHBhcmFtIHtCb29sZWFufSBbZm9yY2VkXSBCeSBkZWZhdWx0IHRoZSBjb21tYW5kIGlzIG5vdCBydW4gaWYgY2FwYWJpbGl0eSBpcyBhbHJlYWR5IGxpc3RlZC4gU2V0IHRvIHRydWUgdG8gc2tpcCB0aGlzIHZhbGlkYXRpb25cbiAgICovXG4gIGFzeW5jIHVwZGF0ZUNhcGFiaWxpdHkgKGZvcmNlZCkge1xuICAgIC8vIHNraXAgcmVxdWVzdCwgaWYgbm90IGZvcmNlZCB1cGRhdGUgYW5kIGNhcGFiaWxpdGllcyBhcmUgYWxyZWFkeSBsb2FkZWRcbiAgICBpZiAoIWZvcmNlZCAmJiB0aGlzLl9jYXBhYmlsaXR5Lmxlbmd0aCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gSWYgU1RBUlRUTFMgaXMgcmVxdWlyZWQgdGhlbiBza2lwIGNhcGFiaWxpdHkgbGlzdGluZyBhcyB3ZSBhcmUgZ29pbmcgdG8gdHJ5XG4gICAgLy8gU1RBUlRUTFMgYW55d2F5IGFuZCB3ZSByZS1jaGVjayBjYXBhYmlsaXRpZXMgYWZ0ZXIgY29ubmVjdGlvbiBpcyBzZWN1cmVkXG4gICAgaWYgKCF0aGlzLmNsaWVudC5zZWN1cmVNb2RlICYmIHRoaXMuX3JlcXVpcmVUTFMpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdVcGRhdGluZyBjYXBhYmlsaXR5Li4uJylcbiAgICByZXR1cm4gdGhpcy5leGVjKCdDQVBBQklMSVRZJylcbiAgfVxuXG4gIGhhc0NhcGFiaWxpdHkgKGNhcGEgPSAnJykge1xuICAgIHJldHVybiB0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoY2FwYS50b1VwcGVyQ2FzZSgpLnRyaW0oKSkgPj0gMFxuICB9XG5cbiAgLy8gRGVmYXVsdCBoYW5kbGVycyBmb3IgdW50YWdnZWQgcmVzcG9uc2VzXG5cbiAgLyoqXG4gICAqIENoZWNrcyBpZiBhbiB1bnRhZ2dlZCBPSyBpbmNsdWRlcyBbQ0FQQUJJTElUWV0gdGFnIGFuZCB1cGRhdGVzIGNhcGFiaWxpdHkgb2JqZWN0XG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXNwb25zZSBQYXJzZWQgc2VydmVyIHJlc3BvbnNlXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHQgVW50aWwgY2FsbGVkLCBzZXJ2ZXIgcmVzcG9uc2VzIGFyZSBub3QgcHJvY2Vzc2VkXG4gICAqL1xuICBfdW50YWdnZWRPa0hhbmRsZXIgKHJlc3BvbnNlKSB7XG4gICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLmNhcGFiaWxpdHkpIHtcbiAgICAgIHRoaXMuX2NhcGFiaWxpdHkgPSByZXNwb25zZS5jYXBhYmlsaXR5XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZXMgY2FwYWJpbGl0eSBvYmplY3RcbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlc3BvbnNlIFBhcnNlZCBzZXJ2ZXIgcmVzcG9uc2VcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dCBVbnRpbCBjYWxsZWQsIHNlcnZlciByZXNwb25zZXMgYXJlIG5vdCBwcm9jZXNzZWRcbiAgICovXG4gIF91bnRhZ2dlZENhcGFiaWxpdHlIYW5kbGVyIChyZXNwb25zZSkge1xuICAgIHRoaXMuX2NhcGFiaWxpdHkgPSBwaXBlKFxuICAgICAgcHJvcE9yKFtdLCAnYXR0cmlidXRlcycpLFxuICAgICAgbWFwKCh7IHZhbHVlIH0pID0+ICh2YWx1ZSB8fCAnJykudG9VcHBlckNhc2UoKS50cmltKCkpXG4gICAgKShyZXNwb25zZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGVzIGV4aXN0aW5nIG1lc3NhZ2UgY291bnRcbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlc3BvbnNlIFBhcnNlZCBzZXJ2ZXIgcmVzcG9uc2VcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dCBVbnRpbCBjYWxsZWQsIHNlcnZlciByZXNwb25zZXMgYXJlIG5vdCBwcm9jZXNzZWRcbiAgICovXG4gIF91bnRhZ2dlZEV4aXN0c0hhbmRsZXIgKHJlc3BvbnNlKSB7XG4gICAgaWYgKHJlc3BvbnNlICYmIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXNwb25zZSwgJ25yJykpIHtcbiAgICAgIHRoaXMub251cGRhdGUgJiYgdGhpcy5vbnVwZGF0ZSh0aGlzLl9zZWxlY3RlZE1haWxib3gsICdleGlzdHMnLCByZXNwb25zZS5ucilcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogSW5kaWNhdGVzIGEgbWVzc2FnZSBoYXMgYmVlbiBkZWxldGVkXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXNwb25zZSBQYXJzZWQgc2VydmVyIHJlc3BvbnNlXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHQgVW50aWwgY2FsbGVkLCBzZXJ2ZXIgcmVzcG9uc2VzIGFyZSBub3QgcHJvY2Vzc2VkXG4gICAqL1xuICBfdW50YWdnZWRFeHB1bmdlSGFuZGxlciAocmVzcG9uc2UpIHtcbiAgICBpZiAocmVzcG9uc2UgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3BvbnNlLCAnbnInKSkge1xuICAgICAgdGhpcy5vbnVwZGF0ZSAmJiB0aGlzLm9udXBkYXRlKHRoaXMuX3NlbGVjdGVkTWFpbGJveCwgJ2V4cHVuZ2UnLCByZXNwb25zZS5ucilcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogSW5kaWNhdGVzIHRoYXQgZmxhZ3MgaGF2ZSBiZWVuIHVwZGF0ZWQgZm9yIGEgbWVzc2FnZVxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVzcG9uc2UgUGFyc2VkIHNlcnZlciByZXNwb25zZVxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0IFVudGlsIGNhbGxlZCwgc2VydmVyIHJlc3BvbnNlcyBhcmUgbm90IHByb2Nlc3NlZFxuICAgKi9cbiAgX3VudGFnZ2VkRmV0Y2hIYW5kbGVyIChyZXNwb25zZSkge1xuICAgIHRoaXMub251cGRhdGUgJiYgdGhpcy5vbnVwZGF0ZSh0aGlzLl9zZWxlY3RlZE1haWxib3gsICdmZXRjaCcsIFtdLmNvbmNhdChwYXJzZUZFVENIKHsgcGF5bG9hZDogeyBGRVRDSDogW3Jlc3BvbnNlXSB9IH0pIHx8IFtdKS5zaGlmdCgpKVxuICB9XG5cbiAgLy8gUHJpdmF0ZSBoZWxwZXJzXG5cbiAgLyoqXG4gICAqIEluZGljYXRlcyB0aGF0IHRoZSBjb25uZWN0aW9uIHN0YXJ0ZWQgaWRsaW5nLiBJbml0aWF0ZXMgYSBjeWNsZVxuICAgKiBvZiBOT09QcyBvciBJRExFcyB0byByZWNlaXZlIG5vdGlmaWNhdGlvbnMgYWJvdXQgdXBkYXRlcyBpbiB0aGUgc2VydmVyXG4gICAqL1xuICBfb25JZGxlICgpIHtcbiAgICBpZiAoIXRoaXMuX2F1dGhlbnRpY2F0ZWQgfHwgdGhpcy5fZW50ZXJlZElkbGUpIHtcbiAgICAgIC8vIE5vIG5lZWQgdG8gSURMRSB3aGVuIG5vdCBsb2dnZWQgaW4gb3IgYWxyZWFkeSBpZGxpbmdcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDbGllbnQgc3RhcnRlZCBpZGxpbmcnKVxuICAgIHRoaXMuZW50ZXJJZGxlKClcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGVzIHRoZSBJTUFQIHN0YXRlIHZhbHVlIGZvciB0aGUgY3VycmVudCBjb25uZWN0aW9uXG4gICAqXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBuZXdTdGF0ZSBUaGUgc3RhdGUgeW91IHdhbnQgdG8gY2hhbmdlIHRvXG4gICAqL1xuICBfY2hhbmdlU3RhdGUgKG5ld1N0YXRlKSB7XG4gICAgaWYgKG5ld1N0YXRlID09PSB0aGlzLl9zdGF0ZSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0VudGVyaW5nIHN0YXRlOiAnICsgbmV3U3RhdGUpXG5cbiAgICAvLyBpZiBhIG1haWxib3ggd2FzIG9wZW5lZCwgZW1pdCBvbmNsb3NlbWFpbGJveCBhbmQgY2xlYXIgc2VsZWN0ZWRNYWlsYm94IHZhbHVlXG4gICAgaWYgKHRoaXMuX3N0YXRlID09PSBTVEFURV9TRUxFQ1RFRCAmJiB0aGlzLl9zZWxlY3RlZE1haWxib3gpIHtcbiAgICAgIHRoaXMub25jbG9zZW1haWxib3ggJiYgdGhpcy5vbmNsb3NlbWFpbGJveCh0aGlzLl9zZWxlY3RlZE1haWxib3gpXG4gICAgICB0aGlzLl9zZWxlY3RlZE1haWxib3ggPSBmYWxzZVxuICAgIH1cblxuICAgIHRoaXMuX3N0YXRlID0gbmV3U3RhdGVcbiAgfVxuXG4gIC8qKlxuICAgKiBFbnN1cmVzIGEgcGF0aCBleGlzdHMgaW4gdGhlIE1haWxib3ggdHJlZVxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gdHJlZSBNYWlsYm94IHRyZWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogQHBhcmFtIHtTdHJpbmd9IGRlbGltaXRlclxuICAgKiBAcmV0dXJuIHtPYmplY3R9IGJyYW5jaCBmb3IgdXNlZCBwYXRoXG4gICAqL1xuICBfZW5zdXJlUGF0aCAodHJlZSwgcGF0aCwgZGVsaW1pdGVyKSB7XG4gICAgY29uc3QgbmFtZXMgPSBwYXRoLnNwbGl0KGRlbGltaXRlcilcbiAgICBsZXQgYnJhbmNoID0gdHJlZVxuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBuYW1lcy5sZW5ndGg7IGkrKykge1xuICAgICAgbGV0IGZvdW5kID0gZmFsc2VcbiAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgYnJhbmNoLmNoaWxkcmVuLmxlbmd0aDsgaisrKSB7XG4gICAgICAgIGlmICh0aGlzLl9jb21wYXJlTWFpbGJveE5hbWVzKGJyYW5jaC5jaGlsZHJlbltqXS5uYW1lLCBpbWFwRGVjb2RlKG5hbWVzW2ldKSkpIHtcbiAgICAgICAgICBicmFuY2ggPSBicmFuY2guY2hpbGRyZW5bal1cbiAgICAgICAgICBmb3VuZCA9IHRydWVcbiAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoIWZvdW5kKSB7XG4gICAgICAgIGJyYW5jaC5jaGlsZHJlbi5wdXNoKHtcbiAgICAgICAgICBuYW1lOiBpbWFwRGVjb2RlKG5hbWVzW2ldKSxcbiAgICAgICAgICBkZWxpbWl0ZXI6IGRlbGltaXRlcixcbiAgICAgICAgICBwYXRoOiBuYW1lcy5zbGljZSgwLCBpICsgMSkuam9pbihkZWxpbWl0ZXIpLFxuICAgICAgICAgIGNoaWxkcmVuOiBbXVxuICAgICAgICB9KVxuICAgICAgICBicmFuY2ggPSBicmFuY2guY2hpbGRyZW5bYnJhbmNoLmNoaWxkcmVuLmxlbmd0aCAtIDFdXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBicmFuY2hcbiAgfVxuXG4gIC8qKlxuICAgKiBDb21wYXJlcyB0d28gbWFpbGJveCBuYW1lcy4gQ2FzZSBpbnNlbnNpdGl2ZSBpbiBjYXNlIG9mIElOQk9YLCBvdGhlcndpc2UgY2FzZSBzZW5zaXRpdmVcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IGEgTWFpbGJveCBuYW1lXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBiIE1haWxib3ggbmFtZVxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gVHJ1ZSBpZiB0aGUgZm9sZGVyIG5hbWVzIG1hdGNoXG4gICAqL1xuICBfY29tcGFyZU1haWxib3hOYW1lcyAoYSwgYikge1xuICAgIHJldHVybiAoYS50b1VwcGVyQ2FzZSgpID09PSAnSU5CT1gnID8gJ0lOQk9YJyA6IGEpID09PSAoYi50b1VwcGVyQ2FzZSgpID09PSAnSU5CT1gnID8gJ0lOQk9YJyA6IGIpXG4gIH1cblxuICBjcmVhdGVMb2dnZXIgKGNyZWF0b3IgPSBjcmVhdGVEZWZhdWx0TG9nZ2VyKSB7XG4gICAgY29uc3QgbG9nZ2VyID0gY3JlYXRvcigodGhpcy5fYXV0aCB8fCB7fSkudXNlciB8fCAnJywgdGhpcy5faG9zdClcbiAgICB0aGlzLmxvZ2dlciA9IHRoaXMuY2xpZW50LmxvZ2dlciA9IHtcbiAgICAgIGRlYnVnOiAoLi4ubXNncykgPT4geyBpZiAoTE9HX0xFVkVMX0RFQlVHID49IHRoaXMubG9nTGV2ZWwpIHsgbG9nZ2VyLmRlYnVnKG1zZ3MpIH0gfSxcbiAgICAgIGluZm86ICguLi5tc2dzKSA9PiB7IGlmIChMT0dfTEVWRUxfSU5GTyA+PSB0aGlzLmxvZ0xldmVsKSB7IGxvZ2dlci5pbmZvKG1zZ3MpIH0gfSxcbiAgICAgIHdhcm46ICguLi5tc2dzKSA9PiB7IGlmIChMT0dfTEVWRUxfV0FSTiA+PSB0aGlzLmxvZ0xldmVsKSB7IGxvZ2dlci53YXJuKG1zZ3MpIH0gfSxcbiAgICAgIGVycm9yOiAoLi4ubXNncykgPT4geyBpZiAoTE9HX0xFVkVMX0VSUk9SID49IHRoaXMubG9nTGV2ZWwpIHsgbG9nZ2VyLmVycm9yKG1zZ3MpIH0gfVxuICAgIH1cbiAgfVxufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFRQTtBQU9BO0FBQ0E7QUFDQTtBQVFBO0FBRXNCO0FBQUE7QUFBQTtBQUVmLE1BQU1BLGtCQUFrQixHQUFHLEVBQUUsR0FBRyxJQUFJLEVBQUM7QUFBQTtBQUNyQyxNQUFNQyxZQUFZLEdBQUcsRUFBRSxHQUFHLElBQUksRUFBQztBQUFBO0FBQy9CLE1BQU1DLFlBQVksR0FBRyxFQUFFLEdBQUcsSUFBSSxFQUFDO0FBQUE7QUFFL0IsTUFBTUMsZ0JBQWdCLEdBQUcsQ0FBQztBQUFBO0FBQzFCLE1BQU1DLHVCQUF1QixHQUFHLENBQUM7QUFBQTtBQUNqQyxNQUFNQyxtQkFB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