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
            type: 'TEXT',
            value: 'PLAIN'
          }, {
            type: 'TEXT',
            chunk: true,
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJUSU1FT1VUX0NPTk5FQ1RJT04iLCJUSU1FT1VUX05PT1AiLCJUSU1FT1VUX0lETEUiLCJTVEFURV9DT05ORUNUSU5HIiwiU1RBVEVfTk9UX0FVVEhFTlRJQ0FURUQiLCJTVEFURV9BVVRIRU5USUNBVEVEIiwiU1RBVEVfU0VMRUNURUQiLCJTVEFURV9MT0dPVVQiLCJERUZBVUxUX0NMSUVOVF9JRCIsIm5hbWUiLCJDbGllbnQiLCJjb25zdHJ1Y3RvciIsImhvc3QiLCJwb3J0Iiwib3B0aW9ucyIsInRpbWVvdXRDb25uZWN0aW9uIiwidGltZW91dE5vb3AiLCJ0aW1lb3V0SWRsZSIsInNlcnZlcklkIiwib25jZXJ0Iiwib251cGRhdGUiLCJvbnNlbGVjdG1haWxib3giLCJvbmNsb3NlbWFpbGJveCIsIl9ob3N0IiwiX2NsaWVudElkIiwicHJvcE9yIiwiX3N0YXRlIiwiX2F1dGhlbnRpY2F0ZWQiLCJfY2FwYWJpbGl0eSIsIl9zZWxlY3RlZE1haWxib3giLCJfZW50ZXJlZElkbGUiLCJfaWRsZVRpbWVvdXQiLCJfZW5hYmxlQ29tcHJlc3Npb24iLCJlbmFibGVDb21wcmVzc2lvbiIsIl9hdXRoIiwiYXV0aCIsIl9yZXF1aXJlVExTIiwicmVxdWlyZVRMUyIsIl9pZ25vcmVUTFMiLCJpZ25vcmVUTFMiLCJfaWdub3JlSWRsZUNhcGFiaWxpdHkiLCJpZ25vcmVJZGxlQ2FwYWJpbGl0eSIsImNsaWVudCIsIkltYXBDbGllbnQiLCJvbmVycm9yIiwiX29uRXJyb3IiLCJiaW5kIiwiY2VydCIsIm9uaWRsZSIsIl9vbklkbGUiLCJzZXRIYW5kbGVyIiwicmVzcG9uc2UiLCJfdW50YWdnZWRDYXBhYmlsaXR5SGFuZGxlciIsIl91bnRhZ2dlZE9rSGFuZGxlciIsIl91bnRhZ2dlZEV4aXN0c0hhbmRsZXIiLCJfdW50YWdnZWRFeHB1bmdlSGFuZGxlciIsIl91bnRhZ2dlZEZldGNoSGFuZGxlciIsImNyZWF0ZUxvZ2dlciIsImxvZ0xldmVsIiwiTE9HX0xFVkVMX0FMTCIsImVyciIsImNsZWFyVGltZW91dCIsImNvbm5lY3QiLCJvcGVuQ29ubmVjdGlvbiIsInVwZ3JhZGVDb25uZWN0aW9uIiwidXBkYXRlSWQiLCJsb2dnZXIiLCJ3YXJuIiwibWVzc2FnZSIsImxvZ2luIiwiY29tcHJlc3NDb25uZWN0aW9uIiwiZGVidWciLCJlcnJvciIsImNsb3NlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJjb25uZWN0aW9uVGltZW91dCIsInNldFRpbWVvdXQiLCJFcnJvciIsIl9jaGFuZ2VTdGF0ZSIsInRoZW4iLCJvbnJlYWR5IiwidXBkYXRlQ2FwYWJpbGl0eSIsImNhdGNoIiwibG9nb3V0IiwiaWQiLCJpbmRleE9mIiwiY29tbWFuZCIsImF0dHJpYnV0ZXMiLCJmbGF0dGVuIiwiT2JqZWN0IiwiZW50cmllcyIsImV4ZWMiLCJsaXN0IiwicGF0aE9yIiwibWFwIiwidmFsdWVzIiwia2V5cyIsImZpbHRlciIsIl8iLCJpIiwiZnJvbVBhaXJzIiwiemlwIiwiX3Nob3VsZFNlbGVjdE1haWxib3giLCJwYXRoIiwiY3R4IiwicHJldmlvdXNTZWxlY3QiLCJnZXRQcmV2aW91c2x5UXVldWVkIiwicmVxdWVzdCIsInBhdGhBdHRyaWJ1dGUiLCJmaW5kIiwiYXR0cmlidXRlIiwidHlwZSIsInZhbHVlIiwic2VsZWN0TWFpbGJveCIsInF1ZXJ5IiwicmVhZE9ubHkiLCJjb25kc3RvcmUiLCJwdXNoIiwibWFpbGJveEluZm8iLCJwYXJzZVNFTEVDVCIsInN1YnNjcmliZU1haWxib3giLCJ1bnN1YnNjcmliZU1haWxib3giLCJsaXN0TmFtZXNwYWNlcyIsInBhcnNlTkFNRVNQQUNFIiwibGlzdE1haWxib3hlcyIsInRyZWUiLCJyb290IiwiY2hpbGRyZW4iLCJsaXN0UmVzcG9uc2UiLCJmb3JFYWNoIiwiaXRlbSIsImF0dHIiLCJsZW5ndGgiLCJkZWxpbSIsImJyYW5jaCIsIl9lbnN1cmVQYXRoIiwiZmxhZ3MiLCJsaXN0ZWQiLCJjaGVja1NwZWNpYWxVc2UiLCJsc3ViUmVzcG9uc2UiLCJsc3ViIiwiZmxhZyIsInVuaW9uIiwic3Vic2NyaWJlZCIsImNyZWF0ZU1haWxib3giLCJjb2RlIiwiZGVsZXRlTWFpbGJveCIsImxpc3RNZXNzYWdlcyIsInNlcXVlbmNlIiwiaXRlbXMiLCJmYXN0IiwiYnVpbGRGRVRDSENvbW1hbmQiLCJwcmVjaGVjayIsInBhcnNlRkVUQ0giLCJzZWFyY2giLCJidWlsZFNFQVJDSENvbW1hbmQiLCJwYXJzZVNFQVJDSCIsInNldEZsYWdzIiwia2V5IiwiQXJyYXkiLCJpc0FycmF5IiwiY29uY2F0IiwiYWRkIiwic2V0IiwicmVtb3ZlIiwic3RvcmUiLCJhY3Rpb24iLCJidWlsZFNUT1JFQ29tbWFuZCIsInVwbG9hZCIsImRlc3RpbmF0aW9uIiwicGFyc2VBUFBFTkQiLCJkZWxldGVNZXNzYWdlcyIsInVzZVVpZFBsdXMiLCJieVVpZCIsInVpZEV4cHVuZ2VDb21tYW5kIiwiY21kIiwiY29weU1lc3NhZ2VzIiwicGFyc2VDT1BZIiwibW92ZU1lc3NhZ2VzIiwiY29tcHJlc3NlZCIsInhvYXV0aDIiLCJidWlsZFhPQXV0aDJUb2tlbiIsInVzZXIiLCJzZW5zaXRpdmUiLCJlcnJvclJlc3BvbnNlRXhwZWN0c0VtcHR5TGluZSIsImNodW5rIiwiQnVmZmVyIiwiZnJvbSIsInBhc3MiLCJ0b1N0cmluZyIsImNhcGFiaWxpdHkiLCJwYXlsb2FkIiwiQ0FQQUJJTElUWSIsInBvcCIsImNhcGEiLCJ0b1VwcGVyQ2FzZSIsInRyaW0iLCJhY2NlcHRVbnRhZ2dlZCIsImJyZWFrSWRsZSIsImVucXVldWVDb21tYW5kIiwiZW50ZXJJZGxlIiwic2VuZCIsInNlY3VyZU1vZGUiLCJ1cGdyYWRlIiwiZm9yY2VkIiwiaGFzQ2FwYWJpbGl0eSIsInBpcGUiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJuciIsIkZFVENIIiwic2hpZnQiLCJuZXdTdGF0ZSIsImRlbGltaXRlciIsIm5hbWVzIiwic3BsaXQiLCJmb3VuZCIsImoiLCJfY29tcGFyZU1haWxib3hOYW1lcyIsImltYXBEZWNvZGUiLCJzbGljZSIsImpvaW4iLCJhIiwiYiIsImNyZWF0b3IiLCJjcmVhdGVEZWZhdWx0TG9nZ2VyIiwibXNncyIsIkxPR19MRVZFTF9ERUJVRyIsImluZm8iLCJMT0dfTEVWRUxfSU5GTyIsIkxPR19MRVZFTF9XQVJOIiwiTE9HX0xFVkVMX0VSUk9SIl0sInNvdXJjZXMiOlsiLi4vc3JjL2NsaWVudC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBtYXAsIHBpcGUsIHVuaW9uLCB6aXAsIGZyb21QYWlycywgcHJvcE9yLCBwYXRoT3IsIGZsYXR0ZW4gfSBmcm9tICdyYW1kYSdcbmltcG9ydCB7IGltYXBEZWNvZGUgfSBmcm9tICdlbWFpbGpzLXV0ZjcnXG5pbXBvcnQge1xuICBwYXJzZUFQUEVORCxcbiAgcGFyc2VDT1BZLFxuICBwYXJzZU5BTUVTUEFDRSxcbiAgcGFyc2VTRUxFQ1QsXG4gIHBhcnNlRkVUQ0gsXG4gIHBhcnNlU0VBUkNIXG59IGZyb20gJy4vY29tbWFuZC1wYXJzZXInXG5pbXBvcnQge1xuICBidWlsZEZFVENIQ29tbWFuZCxcbiAgYnVpbGRYT0F1dGgyVG9rZW4sXG4gIGJ1aWxkU0VBUkNIQ29tbWFuZCxcbiAgYnVpbGRTVE9SRUNvbW1hbmRcbn0gZnJvbSAnLi9jb21tYW5kLWJ1aWxkZXInXG5cbmltcG9ydCBjcmVhdGVEZWZhdWx0TG9nZ2VyIGZyb20gJy4vbG9nZ2VyJ1xuaW1wb3J0IEltYXBDbGllbnQgZnJvbSAnLi9pbWFwJ1xuaW1wb3J0IHtcbiAgTE9HX0xFVkVMX0VSUk9SLFxuICBMT0dfTEVWRUxfV0FSTixcbiAgTE9HX0xFVkVMX0lORk8sXG4gIExPR19MRVZFTF9ERUJVRyxcbiAgTE9HX0xFVkVMX0FMTFxufSBmcm9tICcuL2NvbW1vbidcblxuaW1wb3J0IHtcbiAgY2hlY2tTcGVjaWFsVXNlXG59IGZyb20gJy4vc3BlY2lhbC11c2UnXG5cbmV4cG9ydCBjb25zdCBUSU1FT1VUX0NPTk5FQ1RJT04gPSA5MCAqIDEwMDAgLy8gTWlsbGlzZWNvbmRzIHRvIHdhaXQgZm9yIHRoZSBJTUFQIGdyZWV0aW5nIGZyb20gdGhlIHNlcnZlclxuZXhwb3J0IGNvbnN0IFRJTUVPVVRfTk9PUCA9IDYwICogMTAwMCAvLyBNaWxsaXNlY29uZHMgYmV0d2VlbiBOT09QIGNvbW1hbmRzIHdoaWxlIGlkbGluZ1xuZXhwb3J0IGNvbnN0IFRJTUVPVVRfSURMRSA9IDYwICogMTAwMCAvLyBNaWxsaXNlY29uZHMgdW50aWwgSURMRSBjb21tYW5kIGlzIGNhbmNlbGxlZFxuXG5leHBvcnQgY29uc3QgU1RBVEVfQ09OTkVDVElORyA9IDFcbmV4cG9ydCBjb25zdCBTVEFURV9OT1RfQVVUSEVOVElDQVRFRCA9IDJcbmV4cG9ydCBjb25zdCBTVEFURV9BVVRIRU5USUNBVEVEID0gM1xuZXhwb3J0IGNvbnN0IFNUQVRFX1NFTEVDVEVEID0gNFxuZXhwb3J0IGNvbnN0IFNUQVRFX0xPR09VVCA9IDVcblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfQ0xJRU5UX0lEID0ge1xuICBuYW1lOiAnZW1haWxqcy1pbWFwLWNsaWVudCdcbn1cblxuLyoqXG4gKiBlbWFpbGpzIElNQVAgY2xpZW50XG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IFtob3N0PSdsb2NhbGhvc3QnXSBIb3N0bmFtZSB0byBjb25lbmN0IHRvXG4gKiBAcGFyYW0ge051bWJlcn0gW3BvcnQ9MTQzXSBQb3J0IG51bWJlciB0byBjb25uZWN0IHRvXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIE9wdGlvbmFsIG9wdGlvbnMgb2JqZWN0XG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIENsaWVudCB7XG4gIGNvbnN0cnVjdG9yIChob3N0LCBwb3J0LCBvcHRpb25zID0ge30pIHtcbiAgICB0aGlzLnRpbWVvdXRDb25uZWN0aW9uID0gVElNRU9VVF9DT05ORUNUSU9OXG4gICAgdGhpcy50aW1lb3V0Tm9vcCA9IG9wdGlvbnMudGltZW91dE5vb3AgfHwgVElNRU9VVF9OT09QXG4gICAgdGhpcy50aW1lb3V0SWRsZSA9IG9wdGlvbnMudGltZW91dElkbGUgfHwgVElNRU9VVF9JRExFXG5cbiAgICB0aGlzLnNlcnZlcklkID0gZmFsc2UgLy8gUkZDIDI5NzEgU2VydmVyIElEIGFzIGtleSB2YWx1ZSBwYWlyc1xuXG4gICAgLy8gRXZlbnQgcGxhY2Vob2xkZXJzXG4gICAgdGhpcy5vbmNlcnQgPSBudWxsXG4gICAgdGhpcy5vbnVwZGF0ZSA9IG51bGxcbiAgICB0aGlzLm9uc2VsZWN0bWFpbGJveCA9IG51bGxcbiAgICB0aGlzLm9uY2xvc2VtYWlsYm94ID0gbnVsbFxuXG4gICAgdGhpcy5faG9zdCA9IGhvc3RcbiAgICB0aGlzLl9jbGllbnRJZCA9IHByb3BPcihERUZBVUxUX0NMSUVOVF9JRCwgJ2lkJywgb3B0aW9ucylcbiAgICB0aGlzLl9zdGF0ZSA9IGZhbHNlIC8vIEN1cnJlbnQgc3RhdGVcbiAgICB0aGlzLl9hdXRoZW50aWNhdGVkID0gZmFsc2UgLy8gSXMgdGhlIGNvbm5lY3Rpb24gYXV0aGVudGljYXRlZFxuICAgIHRoaXMuX2NhcGFiaWxpdHkgPSBbXSAvLyBMaXN0IG9mIGV4dGVuc2lvbnMgdGhlIHNlcnZlciBzdXBwb3J0c1xuICAgIHRoaXMuX3NlbGVjdGVkTWFpbGJveCA9IGZhbHNlIC8vIFNlbGVjdGVkIG1haWxib3hcbiAgICB0aGlzLl9lbnRlcmVkSWRsZSA9IGZhbHNlXG4gICAgdGhpcy5faWRsZVRpbWVvdXQgPSBmYWxzZVxuICAgIHRoaXMuX2VuYWJsZUNvbXByZXNzaW9uID0gISFvcHRpb25zLmVuYWJsZUNvbXByZXNzaW9uXG4gICAgdGhpcy5fYXV0aCA9IG9wdGlvbnMuYXV0aFxuICAgIHRoaXMuX3JlcXVpcmVUTFMgPSAhIW9wdGlvbnMucmVxdWlyZVRMU1xuICAgIHRoaXMuX2lnbm9yZVRMUyA9ICEhb3B0aW9ucy5pZ25vcmVUTFNcbiAgICB0aGlzLl9pZ25vcmVJZGxlQ2FwYWJpbGl0eSA9ICEhb3B0aW9ucy5pZ25vcmVJZGxlQ2FwYWJpbGl0eVxuXG4gICAgdGhpcy5jbGllbnQgPSBuZXcgSW1hcENsaWVudChob3N0LCBwb3J0LCBvcHRpb25zKSAvLyBJTUFQIGNsaWVudCBvYmplY3RcblxuICAgIC8vIEV2ZW50IEhhbmRsZXJzXG4gICAgdGhpcy5jbGllbnQub25lcnJvciA9IHRoaXMuX29uRXJyb3IuYmluZCh0aGlzKVxuICAgIHRoaXMuY2xpZW50Lm9uY2VydCA9IChjZXJ0KSA9PiAodGhpcy5vbmNlcnQgJiYgdGhpcy5vbmNlcnQoY2VydCkpIC8vIGFsbG93cyBjZXJ0aWZpY2F0ZSBoYW5kbGluZyBmb3IgcGxhdGZvcm1zIHcvbyBuYXRpdmUgdGxzIHN1cHBvcnRcbiAgICB0aGlzLmNsaWVudC5vbmlkbGUgPSAoKSA9PiB0aGlzLl9vbklkbGUoKSAvLyBzdGFydCBpZGxpbmdcblxuICAgIC8vIERlZmF1bHQgaGFuZGxlcnMgZm9yIHVudGFnZ2VkIHJlc3BvbnNlc1xuICAgIHRoaXMuY2xpZW50LnNldEhhbmRsZXIoJ2NhcGFiaWxpdHknLCAocmVzcG9uc2UpID0+IHRoaXMuX3VudGFnZ2VkQ2FwYWJpbGl0eUhhbmRsZXIocmVzcG9uc2UpKSAvLyBjYXBhYmlsaXR5IHVwZGF0ZXNcbiAgICB0aGlzLmNsaWVudC5zZXRIYW5kbGVyKCdvaycsIChyZXNwb25zZSkgPT4gdGhpcy5fdW50YWdnZWRPa0hhbmRsZXIocmVzcG9uc2UpKSAvLyBub3RpZmljYXRpb25zXG4gICAgdGhpcy5jbGllbnQuc2V0SGFuZGxlcignZXhpc3RzJywgKHJlc3BvbnNlKSA9PiB0aGlzLl91bnRhZ2dlZEV4aXN0c0hhbmRsZXIocmVzcG9uc2UpKSAvLyBtZXNzYWdlIGNvdW50IGhhcyBjaGFuZ2VkXG4gICAgdGhpcy5jbGllbnQuc2V0SGFuZGxlcignZXhwdW5nZScsIChyZXNwb25zZSkgPT4gdGhpcy5fdW50YWdnZWRFeHB1bmdlSGFuZGxlcihyZXNwb25zZSkpIC8vIG1lc3NhZ2UgaGFzIGJlZW4gZGVsZXRlZFxuICAgIHRoaXMuY2xpZW50LnNldEhhbmRsZXIoJ2ZldGNoJywgKHJlc3BvbnNlKSA9PiB0aGlzLl91bnRhZ2dlZEZldGNoSGFuZGxlcihyZXNwb25zZSkpIC8vIG1lc3NhZ2UgaGFzIGJlZW4gdXBkYXRlZCAoZWcuIGZsYWcgY2hhbmdlKVxuXG4gICAgLy8gQWN0aXZhdGUgbG9nZ2luZ1xuICAgIHRoaXMuY3JlYXRlTG9nZ2VyKClcbiAgICB0aGlzLmxvZ0xldmVsID0gcHJvcE9yKExPR19MRVZFTF9BTEwsICdsb2dMZXZlbCcsIG9wdGlvbnMpXG4gIH1cblxuICAvKipcbiAgICogQ2FsbGVkIGlmIHRoZSBsb3dlci1sZXZlbCBJbWFwQ2xpZW50IGhhcyBlbmNvdW50ZXJlZCBhbiB1bnJlY292ZXJhYmxlXG4gICAqIGVycm9yIGR1cmluZyBvcGVyYXRpb24uIENsZWFucyB1cCBhbmQgcHJvcGFnYXRlcyB0aGUgZXJyb3IgdXB3YXJkcy5cbiAgICovXG4gIF9vbkVycm9yIChlcnIpIHtcbiAgICAvLyBtYWtlIHN1cmUgbm8gaWRsZSB0aW1lb3V0IGlzIHBlbmRpbmcgYW55bW9yZVxuICAgIGNsZWFyVGltZW91dCh0aGlzLl9pZGxlVGltZW91dClcblxuICAgIC8vIHByb3BhZ2F0ZSB0aGUgZXJyb3IgdXB3YXJkc1xuICAgIHRoaXMub25lcnJvciAmJiB0aGlzLm9uZXJyb3IoZXJyKVxuICB9XG5cbiAgLy9cbiAgLy9cbiAgLy8gUFVCTElDIEFQSVxuICAvL1xuICAvL1xuXG4gIC8qKlxuICAgKiBJbml0aWF0ZSBjb25uZWN0aW9uIGFuZCBsb2dpbiB0byB0aGUgSU1BUCBzZXJ2ZXJcbiAgICpcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2Ugd2hlbiBsb2dpbiBwcm9jZWR1cmUgaXMgY29tcGxldGVcbiAgICovXG4gIGFzeW5jIGNvbm5lY3QgKCkge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLm9wZW5Db25uZWN0aW9uKClcbiAgICAgIGF3YWl0IHRoaXMudXBncmFkZUNvbm5lY3Rpb24oKVxuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVJZCh0aGlzLl9jbGllbnRJZClcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICB0aGlzLmxvZ2dlci53YXJuKCdGYWlsZWQgdG8gdXBkYXRlIHNlcnZlciBpZCEnLCBlcnIubWVzc2FnZSlcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5sb2dpbih0aGlzLl9hdXRoKVxuICAgICAgYXdhaXQgdGhpcy5jb21wcmVzc0Nvbm5lY3Rpb24oKVxuICAgICAgdGhpcy5sb2dnZXIuZGVidWcoJ0Nvbm5lY3Rpb24gZXN0YWJsaXNoZWQsIHJlYWR5IHRvIHJvbGwhJylcbiAgICAgIHRoaXMuY2xpZW50Lm9uZXJyb3IgPSB0aGlzLl9vbkVycm9yLmJpbmQodGhpcylcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKCdDb3VsZCBub3QgY29ubmVjdCB0byBzZXJ2ZXInLCBlcnIpXG4gICAgICB0aGlzLmNsb3NlKGVycikgLy8gd2UgZG9uJ3QgcmVhbGx5IGNhcmUgd2hldGhlciB0aGlzIHdvcmtzIG9yIG5vdFxuICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEluaXRpYXRlIGNvbm5lY3Rpb24gdG8gdGhlIElNQVAgc2VydmVyXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBjYXBhYmlsaXR5IG9mIHNlcnZlciB3aXRob3V0IGxvZ2luXG4gICAqL1xuICBvcGVuQ29ubmVjdGlvbiAoKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IGNvbm5lY3Rpb25UaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiByZWplY3QobmV3IEVycm9yKCdUaW1lb3V0IGNvbm5lY3RpbmcgdG8gc2VydmVyJykpLCB0aGlzLnRpbWVvdXRDb25uZWN0aW9uKVxuICAgICAgdGhpcy5sb2dnZXIuZGVidWcoJ0Nvbm5lY3RpbmcgdG8nLCB0aGlzLmNsaWVudC5ob3N0LCAnOicsIHRoaXMuY2xpZW50LnBvcnQpXG4gICAgICB0aGlzLl9jaGFuZ2VTdGF0ZShTVEFURV9DT05ORUNUSU5HKVxuICAgICAgdGhpcy5jbGllbnQuY29ubmVjdCgpLnRoZW4oKCkgPT4ge1xuICAgICAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnU29ja2V0IG9wZW5lZCwgd2FpdGluZyBmb3IgZ3JlZXRpbmcgZnJvbSB0aGUgc2VydmVyLi4uJylcblxuICAgICAgICB0aGlzLmNsaWVudC5vbnJlYWR5ID0gKCkgPT4ge1xuICAgICAgICAgIGNsZWFyVGltZW91dChjb25uZWN0aW9uVGltZW91dClcbiAgICAgICAgICB0aGlzLl9jaGFuZ2VTdGF0ZShTVEFURV9OT1RfQVVUSEVOVElDQVRFRClcbiAgICAgICAgICB0aGlzLnVwZGF0ZUNhcGFiaWxpdHkoKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gcmVzb2x2ZSh0aGlzLl9jYXBhYmlsaXR5KSlcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuY2xpZW50Lm9uZXJyb3IgPSAoZXJyKSA9PiB7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KGNvbm5lY3Rpb25UaW1lb3V0KVxuICAgICAgICAgIHJlamVjdChlcnIpXG4gICAgICAgIH1cbiAgICAgIH0pLmNhdGNoKHJlamVjdClcbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIExvZ291dFxuICAgKlxuICAgKiBTZW5kIExPR09VVCwgdG8gd2hpY2ggdGhlIHNlcnZlciByZXNwb25kcyBieSBjbG9zaW5nIHRoZSBjb25uZWN0aW9uLlxuICAgKiBVc2UgaXMgZGlzY291cmFnZWQgaWYgbmV0d29yayBzdGF0dXMgaXMgdW5jbGVhciEgSWYgbmV0d29ya3Mgc3RhdHVzIGlzXG4gICAqIHVuY2xlYXIsIHBsZWFzZSB1c2UgI2Nsb3NlIGluc3RlYWQhXG4gICAqXG4gICAqIExPR09VVCBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4xLjNcbiAgICpcbiAgICogQHJldHVybnMge1Byb21pc2V9IFJlc29sdmVzIHdoZW4gc2VydmVyIGhhcyBjbG9zZWQgdGhlIGNvbm5lY3Rpb25cbiAgICovXG4gIGFzeW5jIGxvZ291dCAoKSB7XG4gICAgdGhpcy5fY2hhbmdlU3RhdGUoU1RBVEVfTE9HT1VUKVxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdMb2dnaW5nIG91dC4uLicpXG4gICAgYXdhaXQgdGhpcy5jbGllbnQubG9nb3V0KClcbiAgICBjbGVhclRpbWVvdXQodGhpcy5faWRsZVRpbWVvdXQpXG4gIH1cblxuICAvKipcbiAgICogRm9yY2UtY2xvc2VzIHRoZSBjdXJyZW50IGNvbm5lY3Rpb24gYnkgY2xvc2luZyB0aGUgVENQIHNvY2tldC5cbiAgICpcbiAgICogQHJldHVybnMge1Byb21pc2V9IFJlc29sdmVzIHdoZW4gc29ja2V0IGlzIGNsb3NlZFxuICAgKi9cbiAgYXN5bmMgY2xvc2UgKGVycikge1xuICAgIHRoaXMuX2NoYW5nZVN0YXRlKFNUQVRFX0xPR09VVClcbiAgICBjbGVhclRpbWVvdXQodGhpcy5faWRsZVRpbWVvdXQpXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0Nsb3NpbmcgY29ubmVjdGlvbi4uLicpXG4gICAgYXdhaXQgdGhpcy5jbGllbnQuY2xvc2UoZXJyKVxuICAgIGNsZWFyVGltZW91dCh0aGlzLl9pZGxlVGltZW91dClcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIElEIGNvbW1hbmQsIHBhcnNlcyBJRCByZXNwb25zZSwgc2V0cyB0aGlzLnNlcnZlcklkXG4gICAqXG4gICAqIElEIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMjk3MVxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gaWQgSUQgYXMgSlNPTiBvYmplY3QuIFNlZSBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMyOTcxI3NlY3Rpb24tMy4zIGZvciBwb3NzaWJsZSB2YWx1ZXNcbiAgICogQHJldHVybnMge1Byb21pc2V9IFJlc29sdmVzIHdoZW4gcmVzcG9uc2UgaGFzIGJlZW4gcGFyc2VkXG4gICAqL1xuICBhc3luYyB1cGRhdGVJZCAoaWQpIHtcbiAgICBpZiAodGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdJRCcpIDwgMCkgcmV0dXJuXG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnVXBkYXRpbmcgaWQuLi4nKVxuXG4gICAgY29uc3QgY29tbWFuZCA9ICdJRCdcbiAgICBjb25zdCBhdHRyaWJ1dGVzID0gaWQgPyBbZmxhdHRlbihPYmplY3QuZW50cmllcyhpZCkpXSA6IFtudWxsXVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKHsgY29tbWFuZCwgYXR0cmlidXRlcyB9LCAnSUQnKVxuICAgIGNvbnN0IGxpc3QgPSBmbGF0dGVuKHBhdGhPcihbXSwgWydwYXlsb2FkJywgJ0lEJywgJzAnLCAnYXR0cmlidXRlcycsICcwJ10sIHJlc3BvbnNlKS5tYXAoT2JqZWN0LnZhbHVlcykpXG4gICAgY29uc3Qga2V5cyA9IGxpc3QuZmlsdGVyKChfLCBpKSA9PiBpICUgMiA9PT0gMClcbiAgICBjb25zdCB2YWx1ZXMgPSBsaXN0LmZpbHRlcigoXywgaSkgPT4gaSAlIDIgPT09IDEpXG4gICAgdGhpcy5zZXJ2ZXJJZCA9IGZyb21QYWlycyh6aXAoa2V5cywgdmFsdWVzKSlcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnU2VydmVyIGlkIHVwZGF0ZWQhJywgdGhpcy5zZXJ2ZXJJZClcbiAgfVxuXG4gIF9zaG91bGRTZWxlY3RNYWlsYm94IChwYXRoLCBjdHgpIHtcbiAgICBpZiAoIWN0eCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBjb25zdCBwcmV2aW91c1NlbGVjdCA9IHRoaXMuY2xpZW50LmdldFByZXZpb3VzbHlRdWV1ZWQoWydTRUxFQ1QnLCAnRVhBTUlORSddLCBjdHgpXG4gICAgaWYgKHByZXZpb3VzU2VsZWN0ICYmIHByZXZpb3VzU2VsZWN0LnJlcXVlc3QuYXR0cmlidXRlcykge1xuICAgICAgY29uc3QgcGF0aEF0dHJpYnV0ZSA9IHByZXZpb3VzU2VsZWN0LnJlcXVlc3QuYXR0cmlidXRlcy5maW5kKChhdHRyaWJ1dGUpID0+IGF0dHJpYnV0ZS50eXBlID09PSAnU1RSSU5HJylcbiAgICAgIGlmIChwYXRoQXR0cmlidXRlKSB7XG4gICAgICAgIHJldHVybiBwYXRoQXR0cmlidXRlLnZhbHVlICE9PSBwYXRoXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX3NlbGVjdGVkTWFpbGJveCAhPT0gcGF0aFxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgU0VMRUNUIG9yIEVYQU1JTkUgdG8gb3BlbiBhIG1haWxib3hcbiAgICpcbiAgICogU0VMRUNUIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMy4xXG4gICAqIEVYQU1JTkUgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjJcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggRnVsbCBwYXRoIHRvIG1haWxib3hcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBPcHRpb25zIG9iamVjdFxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIGluZm9ybWF0aW9uIGFib3V0IHRoZSBzZWxlY3RlZCBtYWlsYm94XG4gICAqL1xuICBhc3luYyBzZWxlY3RNYWlsYm94IChwYXRoLCBvcHRpb25zID0ge30pIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIGNvbW1hbmQ6IG9wdGlvbnMucmVhZE9ubHkgPyAnRVhBTUlORScgOiAnU0VMRUNUJyxcbiAgICAgIGF0dHJpYnV0ZXM6IFt7IHR5cGU6ICdTVFJJTkcnLCB2YWx1ZTogcGF0aCB9XVxuICAgIH1cblxuICAgIGlmIChvcHRpb25zLmNvbmRzdG9yZSAmJiB0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ0NPTkRTVE9SRScpID49IDApIHtcbiAgICAgIHF1ZXJ5LmF0dHJpYnV0ZXMucHVzaChbeyB0eXBlOiAnQVRPTScsIHZhbHVlOiAnQ09ORFNUT1JFJyB9XSlcbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnT3BlbmluZycsIHBhdGgsICcuLi4nKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKHF1ZXJ5LCBbJ0VYSVNUUycsICdGTEFHUycsICdPSyddLCB7IGN0eDogb3B0aW9ucy5jdHggfSlcbiAgICBjb25zdCBtYWlsYm94SW5mbyA9IHBhcnNlU0VMRUNUKHJlc3BvbnNlKVxuXG4gICAgdGhpcy5fY2hhbmdlU3RhdGUoU1RBVEVfU0VMRUNURUQpXG5cbiAgICBpZiAodGhpcy5fc2VsZWN0ZWRNYWlsYm94ICE9PSBwYXRoICYmIHRoaXMub25jbG9zZW1haWxib3gpIHtcbiAgICAgIGF3YWl0IHRoaXMub25jbG9zZW1haWxib3godGhpcy5fc2VsZWN0ZWRNYWlsYm94KVxuICAgIH1cbiAgICB0aGlzLl9zZWxlY3RlZE1haWxib3ggPSBwYXRoXG4gICAgaWYgKHRoaXMub25zZWxlY3RtYWlsYm94KSB7XG4gICAgICBhd2FpdCB0aGlzLm9uc2VsZWN0bWFpbGJveChwYXRoLCBtYWlsYm94SW5mbylcbiAgICB9XG5cbiAgICByZXR1cm4gbWFpbGJveEluZm9cbiAgfVxuXG4gIC8qKlxuICAgKiBTdWJzY3JpYmUgdG8gYSBtYWlsYm94IHdpdGggdGhlIGdpdmVuIHBhdGhcbiAgICpcbiAgICogU1VCU0NSSUJFIGRldGFpbHM6XG4gICAqICAgaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjMuNlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICAgKiAgICAgVGhlIHBhdGggb2YgdGhlIG1haWxib3ggeW91IHdvdWxkIGxpa2UgdG8gc3Vic2NyaWJlIHRvLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICogICAgIFByb21pc2UgcmVzb2x2ZXMgaWYgbWFpbGJveCBpcyBub3cgc3Vic2NyaWJlZCB0byBvciB3YXMgc28gYWxyZWFkeS5cbiAgICovXG4gIGFzeW5jIHN1YnNjcmliZU1haWxib3ggKHBhdGgpIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnU3Vic2NyaWJpbmcgdG8gbWFpbGJveCcsIHBhdGgsICcuLi4nKVxuICAgIHJldHVybiB0aGlzLmV4ZWMoeyBjb21tYW5kOiAnU1VCU0NSSUJFJywgYXR0cmlidXRlczogW3BhdGhdIH0pXG4gIH1cblxuICAvKipcbiAgICogVW5zdWJzY3JpYmUgZnJvbSBhIG1haWxib3ggd2l0aCB0aGUgZ2l2ZW4gcGF0aFxuICAgKlxuICAgKiBVTlNVQlNDUklCRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjdcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogICAgIFRoZSBwYXRoIG9mIHRoZSBtYWlsYm94IHlvdSB3b3VsZCBsaWtlIHRvIHVuc3Vic2NyaWJlIGZyb20uXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfVxuICAgKiAgICAgUHJvbWlzZSByZXNvbHZlcyBpZiBtYWlsYm94IGlzIG5vIGxvbmdlciBzdWJzY3JpYmVkIHRvIG9yIHdhcyBub3QgYmVmb3JlLlxuICAgKi9cbiAgYXN5bmMgdW5zdWJzY3JpYmVNYWlsYm94IChwYXRoKSB7XG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ1Vuc3Vic2NyaWJpbmcgdG8gbWFpbGJveCcsIHBhdGgsICcuLi4nKVxuICAgIHJldHVybiB0aGlzLmV4ZWMoeyBjb21tYW5kOiAnVU5TVUJTQ1JJQkUnLCBhdHRyaWJ1dGVzOiBbcGF0aF0gfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIE5BTUVTUEFDRSBjb21tYW5kXG4gICAqXG4gICAqIE5BTUVTUEFDRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMyMzQyXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggbmFtZXNwYWNlIG9iamVjdFxuICAgKi9cbiAgYXN5bmMgbGlzdE5hbWVzcGFjZXMgKCkge1xuICAgIGlmICh0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ05BTUVTUEFDRScpIDwgMCkgcmV0dXJuIGZhbHNlXG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnTGlzdGluZyBuYW1lc3BhY2VzLi4uJylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYygnTkFNRVNQQUNFJywgJ05BTUVTUEFDRScpXG4gICAgcmV0dXJuIHBhcnNlTkFNRVNQQUNFKHJlc3BvbnNlKVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgTElTVCBhbmQgTFNVQiBjb21tYW5kcy4gUmV0cmlldmVzIGEgdHJlZSBvZiBhdmFpbGFibGUgbWFpbGJveGVzXG4gICAqXG4gICAqIExJU1QgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjhcbiAgICogTFNVQiBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjMuOVxuICAgKlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIGxpc3Qgb2YgbWFpbGJveGVzXG4gICAqL1xuICBhc3luYyBsaXN0TWFpbGJveGVzICgpIHtcbiAgICBjb25zdCB0cmVlID0geyByb290OiB0cnVlLCBjaGlsZHJlbjogW10gfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0xpc3RpbmcgbWFpbGJveGVzLi4uJylcbiAgICBjb25zdCBsaXN0UmVzcG9uc2UgPSBhd2FpdCB0aGlzLmV4ZWMoeyBjb21tYW5kOiAnTElTVCcsIGF0dHJpYnV0ZXM6IFsnJywgJyonXSB9LCAnTElTVCcpXG4gICAgY29uc3QgbGlzdCA9IHBhdGhPcihbXSwgWydwYXlsb2FkJywgJ0xJU1QnXSwgbGlzdFJlc3BvbnNlKVxuICAgIGxpc3QuZm9yRWFjaChpdGVtID0+IHtcbiAgICAgIGNvbnN0IGF0dHIgPSBwcm9wT3IoW10sICdhdHRyaWJ1dGVzJywgaXRlbSlcbiAgICAgIGlmIChhdHRyLmxlbmd0aCA8IDMpIHJldHVyblxuXG4gICAgICBjb25zdCBwYXRoID0gcGF0aE9yKCcnLCBbJzInLCAndmFsdWUnXSwgYXR0cilcbiAgICAgIGNvbnN0IGRlbGltID0gcGF0aE9yKCcvJywgWycxJywgJ3ZhbHVlJ10sIGF0dHIpXG4gICAgICBjb25zdCBicmFuY2ggPSB0aGlzLl9lbnN1cmVQYXRoKHRyZWUsIHBhdGgsIGRlbGltKVxuICAgICAgYnJhbmNoLmZsYWdzID0gcHJvcE9yKFtdLCAnMCcsIGF0dHIpLm1hcCgoeyB2YWx1ZSB9KSA9PiB2YWx1ZSB8fCAnJylcbiAgICAgIGJyYW5jaC5saXN0ZWQgPSB0cnVlXG4gICAgICBjaGVja1NwZWNpYWxVc2UoYnJhbmNoKVxuICAgIH0pXG5cbiAgICBjb25zdCBsc3ViUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmV4ZWMoeyBjb21tYW5kOiAnTFNVQicsIGF0dHJpYnV0ZXM6IFsnJywgJyonXSB9LCAnTFNVQicpLmNhdGNoKGVyciA9PiB7XG4gICAgICB0aGlzLmxvZ2dlci53YXJuKCdMU1VCIGNvbW1hbmQgZmFpbGVkOiAnLCBlcnIpXG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0pXG4gICAgY29uc3QgbHN1YiA9IHBhdGhPcihbXSwgWydwYXlsb2FkJywgJ0xTVUInXSwgbHN1YlJlc3BvbnNlKVxuICAgIGxzdWIuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgICAgY29uc3QgYXR0ciA9IHByb3BPcihbXSwgJ2F0dHJpYnV0ZXMnLCBpdGVtKVxuICAgICAgaWYgKGF0dHIubGVuZ3RoIDwgMykgcmV0dXJuXG5cbiAgICAgIGNvbnN0IHBhdGggPSBwYXRoT3IoJycsIFsnMicsICd2YWx1ZSddLCBhdHRyKVxuICAgICAgY29uc3QgZGVsaW0gPSBwYXRoT3IoJy8nLCBbJzEnLCAndmFsdWUnXSwgYXR0cilcbiAgICAgIGNvbnN0IGJyYW5jaCA9IHRoaXMuX2Vuc3VyZVBhdGgodHJlZSwgcGF0aCwgZGVsaW0pXG4gICAgICBwcm9wT3IoW10sICcwJywgYXR0cikubWFwKChmbGFnID0gJycpID0+IHsgYnJhbmNoLmZsYWdzID0gdW5pb24oYnJhbmNoLmZsYWdzLCBbZmxhZ10pIH0pXG4gICAgICBicmFuY2guc3Vic2NyaWJlZCA9IHRydWVcbiAgICB9KVxuXG4gICAgcmV0dXJuIHRyZWVcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBtYWlsYm94IHdpdGggdGhlIGdpdmVuIHBhdGguXG4gICAqXG4gICAqIENSRUFURSBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjMuM1xuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICAgKiAgICAgVGhlIHBhdGggb2YgdGhlIG1haWxib3ggeW91IHdvdWxkIGxpa2UgdG8gY3JlYXRlLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICogICAgIFByb21pc2UgcmVzb2x2ZXMgaWYgbWFpbGJveCB3YXMgY3JlYXRlZC5cbiAgICogICAgIEluIHRoZSBldmVudCB0aGUgc2VydmVyIHNheXMgTk8gW0FMUkVBRFlFWElTVFNdLCB3ZSB0cmVhdCB0aGF0IGFzIHN1Y2Nlc3MuXG4gICAqL1xuICBhc3luYyBjcmVhdGVNYWlsYm94IChwYXRoKSB7XG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0NyZWF0aW5nIG1haWxib3gnLCBwYXRoLCAnLi4uJylcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5leGVjKHsgY29tbWFuZDogJ0NSRUFURScsIGF0dHJpYnV0ZXM6IFtwYXRoXSB9KVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgaWYgKGVyciAmJiBlcnIuY29kZSA9PT0gJ0FMUkVBRFlFWElTVFMnKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIERlbGV0ZSBhIG1haWxib3ggd2l0aCB0aGUgZ2l2ZW4gcGF0aC5cbiAgICpcbiAgICogREVMRVRFIGRldGFpbHM6XG4gICAqICAgaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjMuNFxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICAgKiAgICAgVGhlIHBhdGggb2YgdGhlIG1haWxib3ggeW91IHdvdWxkIGxpa2UgdG8gZGVsZXRlLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICogICAgIFByb21pc2UgcmVzb2x2ZXMgaWYgbWFpbGJveCB3YXMgZGVsZXRlZC5cbiAgICovXG4gIGRlbGV0ZU1haWxib3ggKHBhdGgpIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnRGVsZXRpbmcgbWFpbGJveCcsIHBhdGgsICcuLi4nKVxuICAgIHJldHVybiB0aGlzLmV4ZWMoeyBjb21tYW5kOiAnREVMRVRFJywgYXR0cmlidXRlczogW3BhdGhdIH0pXG4gIH1cblxuICAvKipcbiAgICogUnVucyBGRVRDSCBjb21tYW5kXG4gICAqXG4gICAqIEZFVENIIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuNC41XG4gICAqIENIQU5HRURTSU5DRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM0NTUxI3NlY3Rpb24tMy4zXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIGZvciB0aGUgbWFpbGJveCB3aGljaCBzaG91bGQgYmUgc2VsZWN0ZWQgZm9yIHRoZSBjb21tYW5kLiBTZWxlY3RzIG1haWxib3ggaWYgbmVjZXNzYXJ5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzZXF1ZW5jZSBTZXF1ZW5jZSBzZXQsIGVnIDE6KiBmb3IgYWxsIG1lc3NhZ2VzXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbaXRlbXNdIE1lc3NhZ2UgZGF0YSBpdGVtIG5hbWVzIG9yIG1hY3JvXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gUXVlcnkgbW9kaWZpZXJzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggdGhlIGZldGNoZWQgbWVzc2FnZSBpbmZvXG4gICAqL1xuICBhc3luYyBsaXN0TWVzc2FnZXMgKHBhdGgsIHNlcXVlbmNlLCBpdGVtcyA9IFt7IGZhc3Q6IHRydWUgfV0sIG9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdGZXRjaGluZyBtZXNzYWdlcycsIHNlcXVlbmNlLCAnZnJvbScsIHBhdGgsICcuLi4nKVxuICAgIGNvbnN0IGNvbW1hbmQgPSBidWlsZEZFVENIQ29tbWFuZChzZXF1ZW5jZSwgaXRlbXMsIG9wdGlvbnMpXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmV4ZWMoY29tbWFuZCwgJ0ZFVENIJywge1xuICAgICAgcHJlY2hlY2s6IChjdHgpID0+IHRoaXMuX3Nob3VsZFNlbGVjdE1haWxib3gocGF0aCwgY3R4KSA/IHRoaXMuc2VsZWN0TWFpbGJveChwYXRoLCB7IGN0eCB9KSA6IFByb21pc2UucmVzb2x2ZSgpXG4gICAgfSlcbiAgICByZXR1cm4gcGFyc2VGRVRDSChyZXNwb25zZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIFNFQVJDSCBjb21tYW5kXG4gICAqXG4gICAqIFNFQVJDSCBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjQuNFxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBmb3IgdGhlIG1haWxib3ggd2hpY2ggc2hvdWxkIGJlIHNlbGVjdGVkIGZvciB0aGUgY29tbWFuZC4gU2VsZWN0cyBtYWlsYm94IGlmIG5lY2Vzc2FyeVxuICAgKiBAcGFyYW0ge09iamVjdH0gcXVlcnkgU2VhcmNoIHRlcm1zXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gUXVlcnkgbW9kaWZpZXJzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggdGhlIGFycmF5IG9mIG1hdGNoaW5nIHNlcS4gb3IgdWlkIG51bWJlcnNcbiAgICovXG4gIGFzeW5jIHNlYXJjaCAocGF0aCwgcXVlcnksIG9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdTZWFyY2hpbmcgaW4nLCBwYXRoLCAnLi4uJylcbiAgICBjb25zdCBjb21tYW5kID0gYnVpbGRTRUFSQ0hDb21tYW5kKHF1ZXJ5LCBvcHRpb25zKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKGNvbW1hbmQsICdTRUFSQ0gnLCB7XG4gICAgICBwcmVjaGVjazogKGN0eCkgPT4gdGhpcy5fc2hvdWxkU2VsZWN0TWFpbGJveChwYXRoLCBjdHgpID8gdGhpcy5zZWxlY3RNYWlsYm94KHBhdGgsIHsgY3R4IH0pIDogUHJvbWlzZS5yZXNvbHZlKClcbiAgICB9KVxuICAgIHJldHVybiBwYXJzZVNFQVJDSChyZXNwb25zZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIFNUT1JFIGNvbW1hbmRcbiAgICpcbiAgICogU1RPUkUgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi40LjZcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHNlcXVlbmNlIE1lc3NhZ2Ugc2VsZWN0b3Igd2hpY2ggdGhlIGZsYWcgY2hhbmdlIGlzIGFwcGxpZWQgdG9cbiAgICogQHBhcmFtIHtBcnJheX0gZmxhZ3NcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBRdWVyeSBtb2RpZmllcnNcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2Ugd2l0aCB0aGUgYXJyYXkgb2YgbWF0Y2hpbmcgc2VxLiBvciB1aWQgbnVtYmVyc1xuICAgKi9cbiAgc2V0RmxhZ3MgKHBhdGgsIHNlcXVlbmNlLCBmbGFncywgb3B0aW9ucykge1xuICAgIGxldCBrZXkgPSAnJ1xuICAgIGxldCBsaXN0ID0gW11cblxuICAgIGlmIChBcnJheS5pc0FycmF5KGZsYWdzKSB8fCB0eXBlb2YgZmxhZ3MgIT09ICdvYmplY3QnKSB7XG4gICAgICBsaXN0ID0gW10uY29uY2F0KGZsYWdzIHx8IFtdKVxuICAgICAga2V5ID0gJydcbiAgICB9IGVsc2UgaWYgKGZsYWdzLmFkZCkge1xuICAgICAgbGlzdCA9IFtdLmNvbmNhdChmbGFncy5hZGQgfHwgW10pXG4gICAgICBrZXkgPSAnKydcbiAgICB9IGVsc2UgaWYgKGZsYWdzLnNldCkge1xuICAgICAga2V5ID0gJydcbiAgICAgIGxpc3QgPSBbXS5jb25jYXQoZmxhZ3Muc2V0IHx8IFtdKVxuICAgIH0gZWxzZSBpZiAoZmxhZ3MucmVtb3ZlKSB7XG4gICAgICBrZXkgPSAnLSdcbiAgICAgIGxpc3QgPSBbXS5jb25jYXQoZmxhZ3MucmVtb3ZlIHx8IFtdKVxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdTZXR0aW5nIGZsYWdzIG9uJywgc2VxdWVuY2UsICdpbicsIHBhdGgsICcuLi4nKVxuICAgIHJldHVybiB0aGlzLnN0b3JlKHBhdGgsIHNlcXVlbmNlLCBrZXkgKyAnRkxBR1MnLCBsaXN0LCBvcHRpb25zKVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgU1RPUkUgY29tbWFuZFxuICAgKlxuICAgKiBTVE9SRSBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjQuNlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBmb3IgdGhlIG1haWxib3ggd2hpY2ggc2hvdWxkIGJlIHNlbGVjdGVkIGZvciB0aGUgY29tbWFuZC4gU2VsZWN0cyBtYWlsYm94IGlmIG5lY2Vzc2FyeVxuICAgKiBAcGFyYW0ge1N0cmluZ30gc2VxdWVuY2UgTWVzc2FnZSBzZWxlY3RvciB3aGljaCB0aGUgZmxhZyBjaGFuZ2UgaXMgYXBwbGllZCB0b1xuICAgKiBAcGFyYW0ge1N0cmluZ30gYWN0aW9uIFNUT1JFIG1ldGhvZCB0byBjYWxsLCBlZyBcIitGTEFHU1wiXG4gICAqIEBwYXJhbSB7QXJyYXl9IGZsYWdzXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gUXVlcnkgbW9kaWZpZXJzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggdGhlIGFycmF5IG9mIG1hdGNoaW5nIHNlcS4gb3IgdWlkIG51bWJlcnNcbiAgICovXG4gIGFzeW5jIHN0b3JlIChwYXRoLCBzZXF1ZW5jZSwgYWN0aW9uLCBmbGFncywgb3B0aW9ucyA9IHt9KSB7XG4gICAgY29uc3QgY29tbWFuZCA9IGJ1aWxkU1RPUkVDb21tYW5kKHNlcXVlbmNlLCBhY3Rpb24sIGZsYWdzLCBvcHRpb25zKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKGNvbW1hbmQsICdGRVRDSCcsIHtcbiAgICAgIHByZWNoZWNrOiAoY3R4KSA9PiB0aGlzLl9zaG91bGRTZWxlY3RNYWlsYm94KHBhdGgsIGN0eCkgPyB0aGlzLnNlbGVjdE1haWxib3gocGF0aCwgeyBjdHggfSkgOiBQcm9taXNlLnJlc29sdmUoKVxuICAgIH0pXG4gICAgcmV0dXJuIHBhcnNlRkVUQ0gocmVzcG9uc2UpXG4gIH1cblxuICAvKipcbiAgICogUnVucyBBUFBFTkQgY29tbWFuZFxuICAgKlxuICAgKiBBUFBFTkQgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjExXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBkZXN0aW5hdGlvbiBUaGUgbWFpbGJveCB3aGVyZSB0byBhcHBlbmQgdGhlIG1lc3NhZ2VcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgVGhlIG1lc3NhZ2UgdG8gYXBwZW5kXG4gICAqIEBwYXJhbSB7QXJyYXl9IG9wdGlvbnMuZmxhZ3MgQW55IGZsYWdzIHlvdSB3YW50IHRvIHNldCBvbiB0aGUgdXBsb2FkZWQgbWVzc2FnZS4gRGVmYXVsdHMgdG8gW1xcU2Vlbl0uIChvcHRpb25hbClcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2Ugd2l0aCB0aGUgYXJyYXkgb2YgbWF0Y2hpbmcgc2VxLiBvciB1aWQgbnVtYmVyc1xuICAgKi9cbiAgYXN5bmMgdXBsb2FkIChkZXN0aW5hdGlvbiwgbWVzc2FnZSwgb3B0aW9ucyA9IHt9KSB7XG4gICAgY29uc3QgZmxhZ3MgPSBwcm9wT3IoWydcXFxcU2VlbiddLCAnZmxhZ3MnLCBvcHRpb25zKS5tYXAodmFsdWUgPT4gKHsgdHlwZTogJ2F0b20nLCB2YWx1ZSB9KSlcbiAgICBjb25zdCBjb21tYW5kID0ge1xuICAgICAgY29tbWFuZDogJ0FQUEVORCcsXG4gICAgICBhdHRyaWJ1dGVzOiBbXG4gICAgICAgIHsgdHlwZTogJ2F0b20nLCB2YWx1ZTogZGVzdGluYXRpb24gfSxcbiAgICAgICAgZmxhZ3MsXG4gICAgICAgIHsgdHlwZTogJ2xpdGVyYWwnLCB2YWx1ZTogbWVzc2FnZSB9XG4gICAgICBdXG4gICAgfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ1VwbG9hZGluZyBtZXNzYWdlIHRvJywgZGVzdGluYXRpb24sICcuLi4nKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKGNvbW1hbmQpXG4gICAgcmV0dXJuIHBhcnNlQVBQRU5EKHJlc3BvbnNlKVxuICB9XG5cbiAgLyoqXG4gICAqIERlbGV0ZXMgbWVzc2FnZXMgZnJvbSBhIHNlbGVjdGVkIG1haWxib3hcbiAgICpcbiAgICogRVhQVU5HRSBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjQuM1xuICAgKiBVSUQgRVhQVU5HRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM0MzE1I3NlY3Rpb24tMi4xXG4gICAqXG4gICAqIElmIHBvc3NpYmxlIChieVVpZDp0cnVlIGFuZCBVSURQTFVTIGV4dGVuc2lvbiBzdXBwb3J0ZWQpLCB1c2VzIFVJRCBFWFBVTkdFXG4gICAqIGNvbW1hbmQgdG8gZGVsZXRlIGEgcmFuZ2Ugb2YgbWVzc2FnZXMsIG90aGVyd2lzZSBmYWxscyBiYWNrIHRvIEVYUFVOR0UuXG4gICAqXG4gICAqIE5CISBUaGlzIG1ldGhvZCBtaWdodCBiZSBkZXN0cnVjdGl2ZSAtIGlmIEVYUFVOR0UgaXMgdXNlZCwgdGhlbiBhbnkgbWVzc2FnZXNcbiAgICogd2l0aCBcXERlbGV0ZWQgZmxhZyBzZXQgYXJlIGRlbGV0ZWRcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHNlcXVlbmNlIE1lc3NhZ2UgcmFuZ2UgdG8gYmUgZGVsZXRlZFxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZVxuICAgKi9cbiAgYXN5bmMgZGVsZXRlTWVzc2FnZXMgKHBhdGgsIHNlcXVlbmNlLCBvcHRpb25zID0ge30pIHtcbiAgICAvLyBhZGQgXFxEZWxldGVkIGZsYWcgdG8gdGhlIG1lc3NhZ2VzIGFuZCBydW4gRVhQVU5HRSBvciBVSUQgRVhQVU5HRVxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdEZWxldGluZyBtZXNzYWdlcycsIHNlcXVlbmNlLCAnaW4nLCBwYXRoLCAnLi4uJylcbiAgICBjb25zdCB1c2VVaWRQbHVzID0gb3B0aW9ucy5ieVVpZCAmJiB0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ1VJRFBMVVMnKSA+PSAwXG4gICAgY29uc3QgdWlkRXhwdW5nZUNvbW1hbmQgPSB7IGNvbW1hbmQ6ICdVSUQgRVhQVU5HRScsIGF0dHJpYnV0ZXM6IFt7IHR5cGU6ICdzZXF1ZW5jZScsIHZhbHVlOiBzZXF1ZW5jZSB9XSB9XG4gICAgYXdhaXQgdGhpcy5zZXRGbGFncyhwYXRoLCBzZXF1ZW5jZSwgeyBhZGQ6ICdcXFxcRGVsZXRlZCcgfSwgb3B0aW9ucylcbiAgICBjb25zdCBjbWQgPSB1c2VVaWRQbHVzID8gdWlkRXhwdW5nZUNvbW1hbmQgOiAnRVhQVU5HRSdcbiAgICByZXR1cm4gdGhpcy5leGVjKGNtZCwgbnVsbCwge1xuICAgICAgcHJlY2hlY2s6IChjdHgpID0+IHRoaXMuX3Nob3VsZFNlbGVjdE1haWxib3gocGF0aCwgY3R4KSA/IHRoaXMuc2VsZWN0TWFpbGJveChwYXRoLCB7IGN0eCB9KSA6IFByb21pc2UucmVzb2x2ZSgpXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBDb3BpZXMgYSByYW5nZSBvZiBtZXNzYWdlcyBmcm9tIHRoZSBhY3RpdmUgbWFpbGJveCB0byB0aGUgZGVzdGluYXRpb24gbWFpbGJveC5cbiAgICogU2lsZW50IG1ldGhvZCAodW5sZXNzIGFuIGVycm9yIG9jY3VycyksIGJ5IGRlZmF1bHQgcmV0dXJucyBubyBpbmZvcm1hdGlvbi5cbiAgICpcbiAgICogQ09QWSBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjQuN1xuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBmb3IgdGhlIG1haWxib3ggd2hpY2ggc2hvdWxkIGJlIHNlbGVjdGVkIGZvciB0aGUgY29tbWFuZC4gU2VsZWN0cyBtYWlsYm94IGlmIG5lY2Vzc2FyeVxuICAgKiBAcGFyYW0ge1N0cmluZ30gc2VxdWVuY2UgTWVzc2FnZSByYW5nZSB0byBiZSBjb3BpZWRcbiAgICogQHBhcmFtIHtTdHJpbmd9IGRlc3RpbmF0aW9uIERlc3RpbmF0aW9uIG1haWxib3ggcGF0aFxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLmJ5VWlkXSBJZiB0cnVlLCB1c2VzIFVJRCBDT1BZIGluc3RlYWQgb2YgQ09QWVxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZVxuICAgKi9cbiAgYXN5bmMgY29weU1lc3NhZ2VzIChwYXRoLCBzZXF1ZW5jZSwgZGVzdGluYXRpb24sIG9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDb3B5aW5nIG1lc3NhZ2VzJywgc2VxdWVuY2UsICdmcm9tJywgcGF0aCwgJ3RvJywgZGVzdGluYXRpb24sICcuLi4nKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKHtcbiAgICAgIGNvbW1hbmQ6IG9wdGlvbnMuYnlVaWQgPyAnVUlEIENPUFknIDogJ0NPUFknLFxuICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICB7IHR5cGU6ICdzZXF1ZW5jZScsIHZhbHVlOiBzZXF1ZW5jZSB9LFxuICAgICAgICB7IHR5cGU6ICdhdG9tJywgdmFsdWU6IGRlc3RpbmF0aW9uIH1cbiAgICAgIF1cbiAgICB9LCBudWxsLCB7XG4gICAgICBwcmVjaGVjazogKGN0eCkgPT4gdGhpcy5fc2hvdWxkU2VsZWN0TWFpbGJveChwYXRoLCBjdHgpID8gdGhpcy5zZWxlY3RNYWlsYm94KHBhdGgsIHsgY3R4IH0pIDogUHJvbWlzZS5yZXNvbHZlKClcbiAgICB9KVxuICAgIHJldHVybiBwYXJzZUNPUFkocmVzcG9uc2UpXG4gIH1cblxuICAvKipcbiAgICogTW92ZXMgYSByYW5nZSBvZiBtZXNzYWdlcyBmcm9tIHRoZSBhY3RpdmUgbWFpbGJveCB0byB0aGUgZGVzdGluYXRpb24gbWFpbGJveC5cbiAgICogUHJlZmVycyB0aGUgTU9WRSBleHRlbnNpb24gYnV0IGlmIG5vdCBhdmFpbGFibGUsIGZhbGxzIGJhY2sgdG9cbiAgICogQ09QWSArIEVYUFVOR0VcbiAgICpcbiAgICogTU9WRSBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzY4NTFcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHNlcXVlbmNlIE1lc3NhZ2UgcmFuZ2UgdG8gYmUgbW92ZWRcbiAgICogQHBhcmFtIHtTdHJpbmd9IGRlc3RpbmF0aW9uIERlc3RpbmF0aW9uIG1haWxib3ggcGF0aFxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZVxuICAgKi9cbiAgYXN5bmMgbW92ZU1lc3NhZ2VzIChwYXRoLCBzZXF1ZW5jZSwgZGVzdGluYXRpb24sIG9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdNb3ZpbmcgbWVzc2FnZXMnLCBzZXF1ZW5jZSwgJ2Zyb20nLCBwYXRoLCAndG8nLCBkZXN0aW5hdGlvbiwgJy4uLicpXG5cbiAgICBpZiAodGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdNT1ZFJykgPT09IC0xKSB7XG4gICAgICAvLyBGYWxsYmFjayB0byBDT1BZICsgRVhQVU5HRVxuICAgICAgYXdhaXQgdGhpcy5jb3B5TWVzc2FnZXMocGF0aCwgc2VxdWVuY2UsIGRlc3RpbmF0aW9uLCBvcHRpb25zKVxuICAgICAgcmV0dXJuIHRoaXMuZGVsZXRlTWVzc2FnZXMocGF0aCwgc2VxdWVuY2UsIG9wdGlvbnMpXG4gICAgfVxuXG4gICAgLy8gSWYgcG9zc2libGUsIHVzZSBNT1ZFXG4gICAgcmV0dXJuIHRoaXMuZXhlYyh7XG4gICAgICBjb21tYW5kOiBvcHRpb25zLmJ5VWlkID8gJ1VJRCBNT1ZFJyA6ICdNT1ZFJyxcbiAgICAgIGF0dHJpYnV0ZXM6IFtcbiAgICAgICAgeyB0eXBlOiAnc2VxdWVuY2UnLCB2YWx1ZTogc2VxdWVuY2UgfSxcbiAgICAgICAgeyB0eXBlOiAnYXRvbScsIHZhbHVlOiBkZXN0aW5hdGlvbiB9XG4gICAgICBdXG4gICAgfSwgWydPSyddLCB7XG4gICAgICBwcmVjaGVjazogKGN0eCkgPT4gdGhpcy5fc2hvdWxkU2VsZWN0TWFpbGJveChwYXRoLCBjdHgpID8gdGhpcy5zZWxlY3RNYWlsYm94KHBhdGgsIHsgY3R4IH0pIDogUHJvbWlzZS5yZXNvbHZlKClcbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgQ09NUFJFU1MgY29tbWFuZFxuICAgKlxuICAgKiBDT01QUkVTUyBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM0OTc4XG4gICAqL1xuICBhc3luYyBjb21wcmVzc0Nvbm5lY3Rpb24gKCkge1xuICAgIGlmICghdGhpcy5fZW5hYmxlQ29tcHJlc3Npb24gfHwgdGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdDT01QUkVTUz1ERUZMQVRFJykgPCAwIHx8IHRoaXMuY2xpZW50LmNvbXByZXNzZWQpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdFbmFibGluZyBjb21wcmVzc2lvbi4uLicpXG4gICAgYXdhaXQgdGhpcy5leGVjKHtcbiAgICAgIGNvbW1hbmQ6ICdDT01QUkVTUycsXG4gICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICB0eXBlOiAnQVRPTScsXG4gICAgICAgIHZhbHVlOiAnREVGTEFURSdcbiAgICAgIH1dXG4gICAgfSlcbiAgICB0aGlzLmNsaWVudC5lbmFibGVDb21wcmVzc2lvbigpXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0NvbXByZXNzaW9uIGVuYWJsZWQsIGFsbCBkYXRhIHNlbnQgYW5kIHJlY2VpdmVkIGlzIGRlZmxhdGVkIScpXG4gIH1cblxuICAvKipcbiAgICogUnVucyBMT0dJTiBvciBBVVRIRU5USUNBVEUgWE9BVVRIMiBjb21tYW5kXG4gICAqXG4gICAqIExPR0lOIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMi4zXG4gICAqIFhPQVVUSDIgZGV0YWlsczpcbiAgICogICBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9nbWFpbC94b2F1dGgyX3Byb3RvY29sI2ltYXBfcHJvdG9jb2xfZXhjaGFuZ2VcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IGF1dGgudXNlclxuICAgKiBAcGFyYW0ge1N0cmluZ30gYXV0aC5wYXNzXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBhdXRoLnhvYXV0aDJcbiAgICovXG4gIGFzeW5jIGxvZ2luIChhdXRoKSB7XG4gICAgbGV0IGNvbW1hbmRcbiAgICBjb25zdCBvcHRpb25zID0ge31cblxuICAgIGlmICghYXV0aCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBdXRoZW50aWNhdGlvbiBpbmZvcm1hdGlvbiBub3QgcHJvdmlkZWQnKVxuICAgIH1cblxuICAgIGlmICh0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ0FVVEg9WE9BVVRIMicpID49IDAgJiYgYXV0aCAmJiBhdXRoLnhvYXV0aDIpIHtcbiAgICAgIGNvbW1hbmQgPSB7XG4gICAgICAgIGNvbW1hbmQ6ICdBVVRIRU5USUNBVEUnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbXG4gICAgICAgICAgeyB0eXBlOiAnQVRPTScsIHZhbHVlOiAnWE9BVVRIMicgfSxcbiAgICAgICAgICB7IHR5cGU6ICdBVE9NJywgdmFsdWU6IGJ1aWxkWE9BdXRoMlRva2VuKGF1dGgudXNlciwgYXV0aC54b2F1dGgyKSwgc2Vuc2l0aXZlOiB0cnVlIH1cbiAgICAgICAgXVxuICAgICAgfVxuXG4gICAgICBvcHRpb25zLmVycm9yUmVzcG9uc2VFeHBlY3RzRW1wdHlMaW5lID0gdHJ1ZSAvLyArIHRhZ2dlZCBlcnJvciByZXNwb25zZSBleHBlY3RzIGFuIGVtcHR5IGxpbmUgaW4gcmV0dXJuXG4gICAgfSBlbHNlIGlmICh0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ0FVVEg9UExBSU4nKSA+PSAwKSB7XG4gICAgICBjb21tYW5kID0ge1xuICAgICAgICBjb21tYW5kOiAnQVVUSEVOVElDQVRFJyxcbiAgICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICAgIHsgdHlwZTogJ1RFWFQnLCB2YWx1ZTogJ1BMQUlOJyB9LFxuICAgICAgICAgIHsgdHlwZTogJ1RFWFQnLCBjaHVuazogdHJ1ZSwgdmFsdWU6IEJ1ZmZlci5mcm9tKCdcXHgwMCcgKyBhdXRoLnVzZXIgKyAnXFx4MDAnICsgYXV0aC5wYXNzIHx8ICcnKS50b1N0cmluZygnYmFzZTY0JyksIHNlbnNpdGl2ZTogdHJ1ZSB9XG4gICAgICAgIF1cbiAgICAgIH1cbiAgICAgIG9wdGlvbnMuZXJyb3JSZXNwb25zZUV4cGVjdHNFbXB0eUxpbmUgPSB0cnVlIC8vICsgdGFnZ2VkIGVycm9yIHJlc3BvbnNlIGV4cGVjdHMgYW4gZW1wdHkgbGluZSBpbiByZXR1cm5cbiAgICB9IGVsc2Uge1xuICAgICAgY29tbWFuZCA9IHtcbiAgICAgICAgY29tbWFuZDogJ2xvZ2luJyxcbiAgICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICAgIHsgdHlwZTogJ1NUUklORycsIHZhbHVlOiBhdXRoLnVzZXIgfHwgJycgfSxcbiAgICAgICAgICB7IHR5cGU6ICdTVFJJTkcnLCB2YWx1ZTogYXV0aC5wYXNzIHx8ICcnLCBzZW5zaXRpdmU6IHRydWUgfVxuICAgICAgICBdXG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0xvZ2dpbmcgaW4uLi4nKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKGNvbW1hbmQsICdjYXBhYmlsaXR5Jywgb3B0aW9ucylcbiAgICAvKlxuICAgICAqIHVwZGF0ZSBwb3N0LWF1dGggY2FwYWJpbGl0ZXNcbiAgICAgKiBjYXBhYmlsaXR5IGxpc3Qgc2hvdWxkbid0IGNvbnRhaW4gYXV0aCByZWxhdGVkIHN0dWZmIGFueW1vcmVcbiAgICAgKiBidXQgc29tZSBuZXcgZXh0ZW5zaW9ucyBtaWdodCBoYXZlIHBvcHBlZCB1cCB0aGF0IGRvIG5vdFxuICAgICAqIG1ha2UgbXVjaCBzZW5zZSBpbiB0aGUgbm9uLWF1dGggc3RhdGVcbiAgICAgKi9cbiAgICBpZiAocmVzcG9uc2UuY2FwYWJpbGl0eSAmJiByZXNwb25zZS5jYXBhYmlsaXR5Lmxlbmd0aCkge1xuICAgICAgLy8gY2FwYWJpbGl0ZXMgd2VyZSBsaXN0ZWQgd2l0aCB0aGUgT0sgW0NBUEFCSUxJVFkgLi4uXSByZXNwb25zZVxuICAgICAgdGhpcy5fY2FwYWJpbGl0eSA9IHJlc3BvbnNlLmNhcGFiaWxpdHlcbiAgICB9IGVsc2UgaWYgKHJlc3BvbnNlLnBheWxvYWQgJiYgcmVzcG9uc2UucGF5bG9hZC5DQVBBQklMSVRZICYmIHJlc3BvbnNlLnBheWxvYWQuQ0FQQUJJTElUWS5sZW5ndGgpIHtcbiAgICAgIC8vIGNhcGFiaWxpdGVzIHdlcmUgbGlzdGVkIHdpdGggKiBDQVBBQklMSVRZIC4uLiByZXNwb25zZVxuICAgICAgdGhpcy5fY2FwYWJpbGl0eSA9IHJlc3BvbnNlLnBheWxvYWQuQ0FQQUJJTElUWS5wb3AoKS5hdHRyaWJ1dGVzLm1hcCgoY2FwYSA9ICcnKSA9PiBjYXBhLnZhbHVlLnRvVXBwZXJDYXNlKCkudHJpbSgpKVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBjYXBhYmlsaXRpZXMgd2VyZSBub3QgYXV0b21hdGljYWxseSBsaXN0ZWQsIHJlbG9hZFxuICAgICAgYXdhaXQgdGhpcy51cGRhdGVDYXBhYmlsaXR5KHRydWUpXG4gICAgfVxuXG4gICAgdGhpcy5fY2hhbmdlU3RhdGUoU1RBVEVfQVVUSEVOVElDQVRFRClcbiAgICB0aGlzLl9hdXRoZW50aWNhdGVkID0gdHJ1ZVxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdMb2dpbiBzdWNjZXNzZnVsLCBwb3N0LWF1dGggY2FwYWJpbGl0ZXMgdXBkYXRlZCEnLCB0aGlzLl9jYXBhYmlsaXR5KVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1biBhbiBJTUFQIGNvbW1hbmQuXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXF1ZXN0IFN0cnVjdHVyZWQgcmVxdWVzdCBvYmplY3RcbiAgICogQHBhcmFtIHtBcnJheX0gYWNjZXB0VW50YWdnZWQgYSBsaXN0IG9mIHVudGFnZ2VkIHJlc3BvbnNlcyB0aGF0IHdpbGwgYmUgaW5jbHVkZWQgaW4gJ3BheWxvYWQnIHByb3BlcnR5XG4gICAqL1xuICBhc3luYyBleGVjIChyZXF1ZXN0LCBhY2NlcHRVbnRhZ2dlZCwgb3B0aW9ucykge1xuICAgIHRoaXMuYnJlYWtJZGxlKClcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuY2xpZW50LmVucXVldWVDb21tYW5kKHJlcXVlc3QsIGFjY2VwdFVudGFnZ2VkLCBvcHRpb25zKVxuICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5jYXBhYmlsaXR5KSB7XG4gICAgICB0aGlzLl9jYXBhYmlsaXR5ID0gcmVzcG9uc2UuY2FwYWJpbGl0eVxuICAgIH1cbiAgICByZXR1cm4gcmVzcG9uc2VcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGUgY29ubmVjdGlvbiBpcyBpZGxpbmcuIFNlbmRzIGEgTk9PUCBvciBJRExFIGNvbW1hbmRcbiAgICpcbiAgICogSURMRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMyMTc3XG4gICAqL1xuICBlbnRlcklkbGUgKCkge1xuICAgIGlmICh0aGlzLl9lbnRlcmVkSWRsZSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHRoaXMuX2VudGVyZWRJZGxlID0gIXRoaXMuX2lnbm9yZUlkbGVDYXBhYmlsaXR5ICYmIHRoaXMuX3NlbGVjdGVkTWFpbGJveCAmJiB0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ0lETEUnKSA+PSAwID8gJ0lETEUnIDogJ05PT1AnXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0VudGVyaW5nIGlkbGUgd2l0aCAnICsgdGhpcy5fZW50ZXJlZElkbGUpXG5cbiAgICBpZiAodGhpcy5fZW50ZXJlZElkbGUgPT09ICdOT09QJykge1xuICAgICAgdGhpcy5faWRsZVRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgdGhpcy5sb2dnZXIuZGVidWcoJ1NlbmRpbmcgTk9PUCcpXG4gICAgICAgIHRoaXMuZXhlYygnTk9PUCcpXG4gICAgICB9LCB0aGlzLnRpbWVvdXROb29wKVxuICAgIH0gZWxzZSBpZiAodGhpcy5fZW50ZXJlZElkbGUgPT09ICdJRExFJykge1xuICAgICAgdGhpcy5jbGllbnQuZW5xdWV1ZUNvbW1hbmQoe1xuICAgICAgICBjb21tYW5kOiAnSURMRSdcbiAgICAgIH0pXG4gICAgICB0aGlzLl9pZGxlVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICB0aGlzLmNsaWVudC5zZW5kKCdET05FXFxyXFxuJylcbiAgICAgICAgdGhpcy5fZW50ZXJlZElkbGUgPSBmYWxzZVxuICAgICAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnSWRsZSB0ZXJtaW5hdGVkJylcbiAgICAgIH0sIHRoaXMudGltZW91dElkbGUpXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN0b3BzIGFjdGlvbnMgcmVsYXRlZCBpZGxpbmcsIGlmIElETEUgaXMgc3VwcG9ydGVkLCBzZW5kcyBET05FIHRvIHN0b3AgaXRcbiAgICovXG4gIGJyZWFrSWRsZSAoKSB7XG4gICAgaWYgKCF0aGlzLl9lbnRlcmVkSWRsZSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY2xlYXJUaW1lb3V0KHRoaXMuX2lkbGVUaW1lb3V0KVxuICAgIGlmICh0aGlzLl9lbnRlcmVkSWRsZSA9PT0gJ0lETEUnKSB7XG4gICAgICB0aGlzLmNsaWVudC5zZW5kKCdET05FXFxyXFxuJylcbiAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdJZGxlIHRlcm1pbmF0ZWQnKVxuICAgIH1cbiAgICB0aGlzLl9lbnRlcmVkSWRsZSA9IGZhbHNlXG4gIH1cblxuICAvKipcbiAgICogUnVucyBTVEFSVFRMUyBjb21tYW5kIGlmIG5lZWRlZFxuICAgKlxuICAgKiBTVEFSVFRMUyBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjIuMVxuICAgKlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtmb3JjZWRdIEJ5IGRlZmF1bHQgdGhlIGNvbW1hbmQgaXMgbm90IHJ1biBpZiBjYXBhYmlsaXR5IGlzIGFscmVhZHkgbGlzdGVkLiBTZXQgdG8gdHJ1ZSB0byBza2lwIHRoaXMgdmFsaWRhdGlvblxuICAgKi9cbiAgYXN5bmMgdXBncmFkZUNvbm5lY3Rpb24gKCkge1xuICAgIC8vIHNraXAgcmVxdWVzdCwgaWYgYWxyZWFkeSBzZWN1cmVkXG4gICAgaWYgKHRoaXMuY2xpZW50LnNlY3VyZU1vZGUpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIC8vIHNraXAgaWYgU1RBUlRUTFMgbm90IGF2YWlsYWJsZSBvciBzdGFydHRscyBzdXBwb3J0IGRpc2FibGVkXG4gICAgaWYgKCh0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ1NUQVJUVExTJykgPCAwIHx8IHRoaXMuX2lnbm9yZVRMUykgJiYgIXRoaXMuX3JlcXVpcmVUTFMpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdFbmNyeXB0aW5nIGNvbm5lY3Rpb24uLi4nKVxuICAgIGF3YWl0IHRoaXMuZXhlYygnU1RBUlRUTFMnKVxuICAgIHRoaXMuX2NhcGFiaWxpdHkgPSBbXVxuICAgIHRoaXMuY2xpZW50LnVwZ3JhZGUoKVxuICAgIHJldHVybiB0aGlzLnVwZGF0ZUNhcGFiaWxpdHkoKVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgQ0FQQUJJTElUWSBjb21tYW5kXG4gICAqXG4gICAqIENBUEFCSUxJVFkgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4xLjFcbiAgICpcbiAgICogRG9lc24ndCByZWdpc3RlciB1bnRhZ2dlZCBDQVBBQklMSVRZIGhhbmRsZXIgYXMgdGhpcyBpcyBhbHJlYWR5XG4gICAqIGhhbmRsZWQgYnkgZ2xvYmFsIGhhbmRsZXJcbiAgICpcbiAgICogQHBhcmFtIHtCb29sZWFufSBbZm9yY2VkXSBCeSBkZWZhdWx0IHRoZSBjb21tYW5kIGlzIG5vdCBydW4gaWYgY2FwYWJpbGl0eSBpcyBhbHJlYWR5IGxpc3RlZC4gU2V0IHRvIHRydWUgdG8gc2tpcCB0aGlzIHZhbGlkYXRpb25cbiAgICovXG4gIGFzeW5jIHVwZGF0ZUNhcGFiaWxpdHkgKGZvcmNlZCkge1xuICAgIC8vIHNraXAgcmVxdWVzdCwgaWYgbm90IGZvcmNlZCB1cGRhdGUgYW5kIGNhcGFiaWxpdGllcyBhcmUgYWxyZWFkeSBsb2FkZWRcbiAgICBpZiAoIWZvcmNlZCAmJiB0aGlzLl9jYXBhYmlsaXR5Lmxlbmd0aCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gSWYgU1RBUlRUTFMgaXMgcmVxdWlyZWQgdGhlbiBza2lwIGNhcGFiaWxpdHkgbGlzdGluZyBhcyB3ZSBhcmUgZ29pbmcgdG8gdHJ5XG4gICAgLy8gU1RBUlRUTFMgYW55d2F5IGFuZCB3ZSByZS1jaGVjayBjYXBhYmlsaXRpZXMgYWZ0ZXIgY29ubmVjdGlvbiBpcyBzZWN1cmVkXG4gICAgaWYgKCF0aGlzLmNsaWVudC5zZWN1cmVNb2RlICYmIHRoaXMuX3JlcXVpcmVUTFMpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdVcGRhdGluZyBjYXBhYmlsaXR5Li4uJylcbiAgICByZXR1cm4gdGhpcy5leGVjKCdDQVBBQklMSVRZJylcbiAgfVxuXG4gIGhhc0NhcGFiaWxpdHkgKGNhcGEgPSAnJykge1xuICAgIHJldHVybiB0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoY2FwYS50b1VwcGVyQ2FzZSgpLnRyaW0oKSkgPj0gMFxuICB9XG5cbiAgLy8gRGVmYXVsdCBoYW5kbGVycyBmb3IgdW50YWdnZWQgcmVzcG9uc2VzXG5cbiAgLyoqXG4gICAqIENoZWNrcyBpZiBhbiB1bnRhZ2dlZCBPSyBpbmNsdWRlcyBbQ0FQQUJJTElUWV0gdGFnIGFuZCB1cGRhdGVzIGNhcGFiaWxpdHkgb2JqZWN0XG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXNwb25zZSBQYXJzZWQgc2VydmVyIHJlc3BvbnNlXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHQgVW50aWwgY2FsbGVkLCBzZXJ2ZXIgcmVzcG9uc2VzIGFyZSBub3QgcHJvY2Vzc2VkXG4gICAqL1xuICBfdW50YWdnZWRPa0hhbmRsZXIgKHJlc3BvbnNlKSB7XG4gICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLmNhcGFiaWxpdHkpIHtcbiAgICAgIHRoaXMuX2NhcGFiaWxpdHkgPSByZXNwb25zZS5jYXBhYmlsaXR5XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZXMgY2FwYWJpbGl0eSBvYmplY3RcbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlc3BvbnNlIFBhcnNlZCBzZXJ2ZXIgcmVzcG9uc2VcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dCBVbnRpbCBjYWxsZWQsIHNlcnZlciByZXNwb25zZXMgYXJlIG5vdCBwcm9jZXNzZWRcbiAgICovXG4gIF91bnRhZ2dlZENhcGFiaWxpdHlIYW5kbGVyIChyZXNwb25zZSkge1xuICAgIHRoaXMuX2NhcGFiaWxpdHkgPSBwaXBlKFxuICAgICAgcHJvcE9yKFtdLCAnYXR0cmlidXRlcycpLFxuICAgICAgbWFwKCh7IHZhbHVlIH0pID0+ICh2YWx1ZSB8fCAnJykudG9VcHBlckNhc2UoKS50cmltKCkpXG4gICAgKShyZXNwb25zZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGVzIGV4aXN0aW5nIG1lc3NhZ2UgY291bnRcbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlc3BvbnNlIFBhcnNlZCBzZXJ2ZXIgcmVzcG9uc2VcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dCBVbnRpbCBjYWxsZWQsIHNlcnZlciByZXNwb25zZXMgYXJlIG5vdCBwcm9jZXNzZWRcbiAgICovXG4gIF91bnRhZ2dlZEV4aXN0c0hhbmRsZXIgKHJlc3BvbnNlKSB7XG4gICAgaWYgKHJlc3BvbnNlICYmIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXNwb25zZSwgJ25yJykpIHtcbiAgICAgIHRoaXMub251cGRhdGUgJiYgdGhpcy5vbnVwZGF0ZSh0aGlzLl9zZWxlY3RlZE1haWxib3gsICdleGlzdHMnLCByZXNwb25zZS5ucilcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogSW5kaWNhdGVzIGEgbWVzc2FnZSBoYXMgYmVlbiBkZWxldGVkXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXNwb25zZSBQYXJzZWQgc2VydmVyIHJlc3BvbnNlXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHQgVW50aWwgY2FsbGVkLCBzZXJ2ZXIgcmVzcG9uc2VzIGFyZSBub3QgcHJvY2Vzc2VkXG4gICAqL1xuICBfdW50YWdnZWRFeHB1bmdlSGFuZGxlciAocmVzcG9uc2UpIHtcbiAgICBpZiAocmVzcG9uc2UgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3BvbnNlLCAnbnInKSkge1xuICAgICAgdGhpcy5vbnVwZGF0ZSAmJiB0aGlzLm9udXBkYXRlKHRoaXMuX3NlbGVjdGVkTWFpbGJveCwgJ2V4cHVuZ2UnLCByZXNwb25zZS5ucilcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogSW5kaWNhdGVzIHRoYXQgZmxhZ3MgaGF2ZSBiZWVuIHVwZGF0ZWQgZm9yIGEgbWVzc2FnZVxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVzcG9uc2UgUGFyc2VkIHNlcnZlciByZXNwb25zZVxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0IFVudGlsIGNhbGxlZCwgc2VydmVyIHJlc3BvbnNlcyBhcmUgbm90IHByb2Nlc3NlZFxuICAgKi9cbiAgX3VudGFnZ2VkRmV0Y2hIYW5kbGVyIChyZXNwb25zZSkge1xuICAgIHRoaXMub251cGRhdGUgJiYgdGhpcy5vbnVwZGF0ZSh0aGlzLl9zZWxlY3RlZE1haWxib3gsICdmZXRjaCcsIFtdLmNvbmNhdChwYXJzZUZFVENIKHsgcGF5bG9hZDogeyBGRVRDSDogW3Jlc3BvbnNlXSB9IH0pIHx8IFtdKS5zaGlmdCgpKVxuICB9XG5cbiAgLy8gUHJpdmF0ZSBoZWxwZXJzXG5cbiAgLyoqXG4gICAqIEluZGljYXRlcyB0aGF0IHRoZSBjb25uZWN0aW9uIHN0YXJ0ZWQgaWRsaW5nLiBJbml0aWF0ZXMgYSBjeWNsZVxuICAgKiBvZiBOT09QcyBvciBJRExFcyB0byByZWNlaXZlIG5vdGlmaWNhdGlvbnMgYWJvdXQgdXBkYXRlcyBpbiB0aGUgc2VydmVyXG4gICAqL1xuICBfb25JZGxlICgpIHtcbiAgICBpZiAoIXRoaXMuX2F1dGhlbnRpY2F0ZWQgfHwgdGhpcy5fZW50ZXJlZElkbGUpIHtcbiAgICAgIC8vIE5vIG5lZWQgdG8gSURMRSB3aGVuIG5vdCBsb2dnZWQgaW4gb3IgYWxyZWFkeSBpZGxpbmdcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDbGllbnQgc3RhcnRlZCBpZGxpbmcnKVxuICAgIHRoaXMuZW50ZXJJZGxlKClcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGVzIHRoZSBJTUFQIHN0YXRlIHZhbHVlIGZvciB0aGUgY3VycmVudCBjb25uZWN0aW9uXG4gICAqXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBuZXdTdGF0ZSBUaGUgc3RhdGUgeW91IHdhbnQgdG8gY2hhbmdlIHRvXG4gICAqL1xuICBfY2hhbmdlU3RhdGUgKG5ld1N0YXRlKSB7XG4gICAgaWYgKG5ld1N0YXRlID09PSB0aGlzLl9zdGF0ZSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0VudGVyaW5nIHN0YXRlOiAnICsgbmV3U3RhdGUpXG5cbiAgICAvLyBpZiBhIG1haWxib3ggd2FzIG9wZW5lZCwgZW1pdCBvbmNsb3NlbWFpbGJveCBhbmQgY2xlYXIgc2VsZWN0ZWRNYWlsYm94IHZhbHVlXG4gICAgaWYgKHRoaXMuX3N0YXRlID09PSBTVEFURV9TRUxFQ1RFRCAmJiB0aGlzLl9zZWxlY3RlZE1haWxib3gpIHtcbiAgICAgIHRoaXMub25jbG9zZW1haWxib3ggJiYgdGhpcy5vbmNsb3NlbWFpbGJveCh0aGlzLl9zZWxlY3RlZE1haWxib3gpXG4gICAgICB0aGlzLl9zZWxlY3RlZE1haWxib3ggPSBmYWxzZVxuICAgIH1cblxuICAgIHRoaXMuX3N0YXRlID0gbmV3U3RhdGVcbiAgfVxuXG4gIC8qKlxuICAgKiBFbnN1cmVzIGEgcGF0aCBleGlzdHMgaW4gdGhlIE1haWxib3ggdHJlZVxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gdHJlZSBNYWlsYm94IHRyZWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogQHBhcmFtIHtTdHJpbmd9IGRlbGltaXRlclxuICAgKiBAcmV0dXJuIHtPYmplY3R9IGJyYW5jaCBmb3IgdXNlZCBwYXRoXG4gICAqL1xuICBfZW5zdXJlUGF0aCAodHJlZSwgcGF0aCwgZGVsaW1pdGVyKSB7XG4gICAgY29uc3QgbmFtZXMgPSBwYXRoLnNwbGl0KGRlbGltaXRlcilcbiAgICBsZXQgYnJhbmNoID0gdHJlZVxuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBuYW1lcy5sZW5ndGg7IGkrKykge1xuICAgICAgbGV0IGZvdW5kID0gZmFsc2VcbiAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgYnJhbmNoLmNoaWxkcmVuLmxlbmd0aDsgaisrKSB7XG4gICAgICAgIGlmICh0aGlzLl9jb21wYXJlTWFpbGJveE5hbWVzKGJyYW5jaC5jaGlsZHJlbltqXS5uYW1lLCBpbWFwRGVjb2RlKG5hbWVzW2ldKSkpIHtcbiAgICAgICAgICBicmFuY2ggPSBicmFuY2guY2hpbGRyZW5bal1cbiAgICAgICAgICBmb3VuZCA9IHRydWVcbiAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoIWZvdW5kKSB7XG4gICAgICAgIGJyYW5jaC5jaGlsZHJlbi5wdXNoKHtcbiAgICAgICAgICBuYW1lOiBpbWFwRGVjb2RlKG5hbWVzW2ldKSxcbiAgICAgICAgICBkZWxpbWl0ZXI6IGRlbGltaXRlcixcbiAgICAgICAgICBwYXRoOiBuYW1lcy5zbGljZSgwLCBpICsgMSkuam9pbihkZWxpbWl0ZXIpLFxuICAgICAgICAgIGNoaWxkcmVuOiBbXVxuICAgICAgICB9KVxuICAgICAgICBicmFuY2ggPSBicmFuY2guY2hpbGRyZW5bYnJhbmNoLmNoaWxkcmVuLmxlbmd0aCAtIDFdXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBicmFuY2hcbiAgfVxuXG4gIC8qKlxuICAgKiBDb21wYXJlcyB0d28gbWFpbGJveCBuYW1lcy4gQ2FzZSBpbnNlbnNpdGl2ZSBpbiBjYXNlIG9mIElOQk9YLCBvdGhlcndpc2UgY2FzZSBzZW5zaXRpdmVcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IGEgTWFpbGJveCBuYW1lXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBiIE1haWxib3ggbmFtZVxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gVHJ1ZSBpZiB0aGUgZm9sZGVyIG5hbWVzIG1hdGNoXG4gICAqL1xuICBfY29tcGFyZU1haWxib3hOYW1lcyAoYSwgYikge1xuICAgIHJldHVybiAoYS50b1VwcGVyQ2FzZSgpID09PSAnSU5CT1gnID8gJ0lOQk9YJyA6IGEpID09PSAoYi50b1VwcGVyQ2FzZSgpID09PSAnSU5CT1gnID8gJ0lOQk9YJyA6IGIpXG4gIH1cblxuICBjcmVhdGVMb2dnZXIgKGNyZWF0b3IgPSBjcmVhdGVEZWZhdWx0TG9nZ2VyKSB7XG4gICAgY29uc3QgbG9nZ2VyID0gY3JlYXRvcigodGhpcy5fYXV0aCB8fCB7fSkudXNlciB8fCAnJywgdGhpcy5faG9zdClcbiAgICB0aGlzLmxvZ2dlciA9IHRoaXMuY2xpZW50LmxvZ2dlciA9IHtcbiAgICAgIGRlYnVnOiAoLi4ubXNncykgPT4geyBpZiAoTE9HX0xFVkVMX0RFQlVHID49IHRoaXMubG9nTGV2ZWwpIHsgbG9nZ2VyLmRlYnVnKG1zZ3MpIH0gfSxcbiAgICAgIGluZm86ICguLi5tc2dzKSA9PiB7IGlmIChMT0dfTEVWRUxfSU5GTyA+PSB0aGlzLmxvZ0xldmVsKSB7IGxvZ2dlci5pbmZvKG1zZ3MpIH0gfSxcbiAgICAgIHdhcm46ICguLi5tc2dzKSA9PiB7IGlmIChMT0dfTEVWRUxfV0FSTiA+PSB0aGlzLmxvZ0xldmVsKSB7IGxvZ2dlci53YXJuKG1zZ3MpIH0gfSxcbiAgICAgIGVycm9yOiAoLi4ubXNncykgPT4geyBpZiAoTE9HX0xFVkVMX0VSUk9SID49IHRoaXMubG9nTGV2ZWwpIHsgbG9nZ2VyLmVycm9yKG1zZ3MpIH0gfVxuICAgIH1cbiAgfVxufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQTtBQUNBO0FBQ0E7QUFRQTtBQU9BO0FBQ0E7QUFDQTtBQVFBO0FBRXNCO0FBQUE7QUFBQTtBQUVmLE1BQU1BLGtCQUFrQixHQUFHLEVBQUUsR0FBRyxJQUFJLEVBQUM7QUFBQTtBQUNyQyxNQUFNQyxZQUFZLEdBQUcsRUFBRSxHQUFHLElBQUksRUFBQztBQUFBO0FBQy9CLE1BQU1DLFlBQVksR0FBRyxFQUFFLEdBQUcsSUFBSSxFQUFDO0FBQUE7QUFFL0IsTUFBTUMsZ0JBQWdCLEdBQUcsQ0FBQztBQUFBO0FBQzFCLE1BQU1DLHVCQUF1QixHQUFHLENBQUM7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