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
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
const TIMEOUT_CONNECTION = exports.TIMEOUT_CONNECTION = 90 * 1000; // Milliseconds to wait for the IMAP greeting from the server
const TIMEOUT_NOOP = exports.TIMEOUT_NOOP = 60 * 1000; // Milliseconds between NOOP commands while idling
const TIMEOUT_IDLE = exports.TIMEOUT_IDLE = 60 * 1000; // Milliseconds until IDLE command is cancelled

const STATE_CONNECTING = exports.STATE_CONNECTING = 1;
const STATE_NOT_AUTHENTICATED = exports.STATE_NOT_AUTHENTICATED = 2;
const STATE_AUTHENTICATED = exports.STATE_AUTHENTICATED = 3;
const STATE_SELECTED = exports.STATE_SELECTED = 4;
const STATE_LOGOUT = exports.STATE_LOGOUT = 5;
const DEFAULT_CLIENT_ID = exports.DEFAULT_CLIENT_ID = {
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
          if (err.message.includes('Socket closed unexpectedly')) throw err;
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
  selectMailbox(_x) {
    var _this5 = this;
    return _asyncToGenerator(function* (path, options = {}) {
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
    }).apply(this, arguments);
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
    var _this0 = this;
    return _asyncToGenerator(function* () {
      _this0.logger.debug('Creating mailbox', path, '...');
      try {
        yield _this0.exec({
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
  listMessages(_x2, _x3) {
    var _this1 = this;
    return _asyncToGenerator(function* (path, sequence, items = [{
      fast: true
    }], options = {}) {
      _this1.logger.debug('Fetching messages', sequence, 'from', path, '...');
      const command = (0, _commandBuilder.buildFETCHCommand)(sequence, items, options);
      const response = yield _this1.exec(command, 'FETCH', {
        precheck: ctx => _this1._shouldSelectMailbox(path, ctx) ? _this1.selectMailbox(path, {
          ctx
        }) : Promise.resolve()
      });
      return (0, _commandParser.parseFETCH)(response);
    }).apply(this, arguments);
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
  search(_x4, _x5) {
    var _this10 = this;
    return _asyncToGenerator(function* (path, query, options = {}) {
      _this10.logger.debug('Searching in', path, '...');
      const command = (0, _commandBuilder.buildSEARCHCommand)(query, options);
      const response = yield _this10.exec(command, 'SEARCH', {
        precheck: ctx => _this10._shouldSelectMailbox(path, ctx) ? _this10.selectMailbox(path, {
          ctx
        }) : Promise.resolve()
      });
      return (0, _commandParser.parseSEARCH)(response);
    }).apply(this, arguments);
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
  store(_x6, _x7, _x8, _x9) {
    var _this11 = this;
    return _asyncToGenerator(function* (path, sequence, action, flags, options = {}) {
      const command = (0, _commandBuilder.buildSTORECommand)(sequence, action, flags, options);
      const response = yield _this11.exec(command, 'FETCH', {
        precheck: ctx => _this11._shouldSelectMailbox(path, ctx) ? _this11.selectMailbox(path, {
          ctx
        }) : Promise.resolve()
      });
      return (0, _commandParser.parseFETCH)(response);
    }).apply(this, arguments);
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
  upload(_x0, _x1) {
    var _this12 = this;
    return _asyncToGenerator(function* (destination, message, options = {}) {
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
      _this12.logger.debug('Uploading message to', destination, '...');
      const response = yield _this12.exec(command);
      return (0, _commandParser.parseAPPEND)(response);
    }).apply(this, arguments);
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
  deleteMessages(_x10, _x11) {
    var _this13 = this;
    return _asyncToGenerator(function* (path, sequence, options = {}) {
      // add \Deleted flag to the messages and run EXPUNGE or UID EXPUNGE
      _this13.logger.debug('Deleting messages', sequence, 'in', path, '...');
      const useUidPlus = options.byUid && _this13._capability.indexOf('UIDPLUS') >= 0;
      const uidExpungeCommand = {
        command: 'UID EXPUNGE',
        attributes: [{
          type: 'sequence',
          value: sequence
        }]
      };
      yield _this13.setFlags(path, sequence, {
        add: '\\Deleted'
      }, options);
      const cmd = useUidPlus ? uidExpungeCommand : 'EXPUNGE';
      return _this13.exec(cmd, null, {
        precheck: ctx => _this13._shouldSelectMailbox(path, ctx) ? _this13.selectMailbox(path, {
          ctx
        }) : Promise.resolve()
      });
    }).apply(this, arguments);
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
  copyMessages(_x12, _x13, _x14) {
    var _this14 = this;
    return _asyncToGenerator(function* (path, sequence, destination, options = {}) {
      _this14.logger.debug('Copying messages', sequence, 'from', path, 'to', destination, '...');
      const response = yield _this14.exec({
        command: options.byUid ? 'UID COPY' : 'COPY',
        attributes: [{
          type: 'sequence',
          value: sequence
        }, {
          type: 'atom',
          value: destination
        }]
      }, null, {
        precheck: ctx => _this14._shouldSelectMailbox(path, ctx) ? _this14.selectMailbox(path, {
          ctx
        }) : Promise.resolve()
      });
      return (0, _commandParser.parseCOPY)(response);
    }).apply(this, arguments);
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
  moveMessages(_x15, _x16, _x17) {
    var _this15 = this;
    return _asyncToGenerator(function* (path, sequence, destination, options = {}) {
      _this15.logger.debug('Moving messages', sequence, 'from', path, 'to', destination, '...');
      if (_this15._capability.indexOf('MOVE') === -1) {
        // Fallback to COPY + EXPUNGE
        yield _this15.copyMessages(path, sequence, destination, options);
        return _this15.deleteMessages(path, sequence, options);
      }

      // If possible, use MOVE
      return _this15.exec({
        command: options.byUid ? 'UID MOVE' : 'MOVE',
        attributes: [{
          type: 'sequence',
          value: sequence
        }, {
          type: 'atom',
          value: destination
        }]
      }, ['OK'], {
        precheck: ctx => _this15._shouldSelectMailbox(path, ctx) ? _this15.selectMailbox(path, {
          ctx
        }) : Promise.resolve()
      });
    }).apply(this, arguments);
  }

  /**
   * Runs COMPRESS command
   *
   * COMPRESS details:
   *   https://tools.ietf.org/html/rfc4978
   */
  compressConnection() {
    var _this16 = this;
    return _asyncToGenerator(function* () {
      if (!_this16._enableCompression || _this16._capability.indexOf('COMPRESS=DEFLATE') < 0 || _this16.client.compressed) {
        return false;
      }
      _this16.logger.debug('Enabling compression...');
      yield _this16.exec({
        command: 'COMPRESS',
        attributes: [{
          type: 'ATOM',
          value: 'DEFLATE'
        }]
      });
      _this16.client.enableCompression();
      _this16.logger.debug('Compression enabled, all data sent and received is deflated!');
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
    var _this17 = this;
    return _asyncToGenerator(function* () {
      let command;
      const options = {};
      if (!auth) {
        throw new Error('Authentication information not provided');
      }
      if (_this17._capability.indexOf('AUTH=XOAUTH2') >= 0 && auth && auth.xoauth2) {
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
      } else if (_this17._capability.indexOf('AUTH=PLAIN') >= 0) {
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
      _this17.logger.debug('Logging in...');
      const response = yield _this17.exec(command, 'capability', options);
      /*
       * update post-auth capabilites
       * capability list shouldn't contain auth related stuff anymore
       * but some new extensions might have popped up that do not
       * make much sense in the non-auth state
       */
      if (response.capability && response.capability.length) {
        // capabilites were listed with the OK [CAPABILITY ...] response
        _this17._capability = response.capability;
      } else if (response.payload && response.payload.CAPABILITY && response.payload.CAPABILITY.length) {
        // capabilites were listed with * CAPABILITY ... response
        _this17._capability = response.payload.CAPABILITY.pop().attributes.map((capa = '') => capa.value.toUpperCase().trim());
      } else {
        // capabilities were not automatically listed, reload
        yield _this17.updateCapability(true);
      }
      _this17._changeState(STATE_AUTHENTICATED);
      _this17._authenticated = true;
      _this17.logger.debug('Login successful, post-auth capabilites updated!', _this17._capability);
    })();
  }

  /**
   * Run an IMAP command.
   *
   * @param {Object} request Structured request object
   * @param {Array} acceptUntagged a list of untagged responses that will be included in 'payload' property
   */
  exec(request, acceptUntagged, options) {
    var _this18 = this;
    return _asyncToGenerator(function* () {
      _this18.breakIdle();
      const response = yield _this18.client.enqueueCommand(request, acceptUntagged, options);
      if (response && response.capability) {
        _this18._capability = response.capability;
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
    var _this19 = this;
    return _asyncToGenerator(function* () {
      // skip request, if already secured
      if (_this19.client.secureMode) {
        return false;
      }

      // skip if STARTTLS not available or starttls support disabled
      if ((_this19._capability.indexOf('STARTTLS') < 0 || _this19._ignoreTLS) && !_this19._requireTLS) {
        return false;
      }
      _this19.logger.debug('Encrypting connection...');
      yield _this19.exec('STARTTLS');
      _this19._capability = [];
      _this19.client.upgrade();
      return _this19.updateCapability();
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
    var _this20 = this;
    return _asyncToGenerator(function* () {
      // skip request, if not forced update and capabilities are already loaded
      if (!forced && _this20._capability.length) {
        return;
      }

      // If STARTTLS is required then skip capability listing as we are going to try
      // STARTTLS anyway and we re-check capabilities after connection is secured
      if (!_this20.client.secureMode && _this20._requireTLS) {
        return;
      }
      _this20.logger.debug('Updating capability...');
      return _this20.exec('CAPABILITY');
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfcmFtZGEiLCJyZXF1aXJlIiwiX2VtYWlsanNVdGYiLCJfY29tbWFuZFBhcnNlciIsIl9jb21tYW5kQnVpbGRlciIsIl9sb2dnZXIiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2ltYXAiLCJfY29tbW9uIiwiX3NwZWNpYWxVc2UiLCJlIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJhc3luY0dlbmVyYXRvclN0ZXAiLCJuIiwidCIsInIiLCJvIiwiYSIsImMiLCJpIiwidSIsInZhbHVlIiwiZG9uZSIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsIl9hc3luY1RvR2VuZXJhdG9yIiwiYXJndW1lbnRzIiwiYXBwbHkiLCJfbmV4dCIsIl90aHJvdyIsIlRJTUVPVVRfQ09OTkVDVElPTiIsImV4cG9ydHMiLCJUSU1FT1VUX05PT1AiLCJUSU1FT1VUX0lETEUiLCJTVEFURV9DT05ORUNUSU5HIiwiU1RBVEVfTk9UX0FVVEhFTlRJQ0FURUQiLCJTVEFURV9BVVRIRU5USUNBVEVEIiwiU1RBVEVfU0VMRUNURUQiLCJTVEFURV9MT0dPVVQiLCJERUZBVUxUX0NMSUVOVF9JRCIsIm5hbWUiLCJDbGllbnQiLCJjb25zdHJ1Y3RvciIsImhvc3QiLCJwb3J0Iiwib3B0aW9ucyIsInRpbWVvdXRDb25uZWN0aW9uIiwidGltZW91dE5vb3AiLCJ0aW1lb3V0SWRsZSIsInNlcnZlcklkIiwib25jZXJ0Iiwib251cGRhdGUiLCJvbnNlbGVjdG1haWxib3giLCJvbmNsb3NlbWFpbGJveCIsIl9ob3N0IiwiX2NsaWVudElkIiwicHJvcE9yIiwiX3N0YXRlIiwiX2F1dGhlbnRpY2F0ZWQiLCJfY2FwYWJpbGl0eSIsIl9zZWxlY3RlZE1haWxib3giLCJfZW50ZXJlZElkbGUiLCJfaWRsZVRpbWVvdXQiLCJfZW5hYmxlQ29tcHJlc3Npb24iLCJlbmFibGVDb21wcmVzc2lvbiIsIl9hdXRoIiwiYXV0aCIsIl9yZXF1aXJlVExTIiwicmVxdWlyZVRMUyIsIl9pZ25vcmVUTFMiLCJpZ25vcmVUTFMiLCJfaWdub3JlSWRsZUNhcGFiaWxpdHkiLCJpZ25vcmVJZGxlQ2FwYWJpbGl0eSIsImNsaWVudCIsIkltYXBDbGllbnQiLCJvbmVycm9yIiwiX29uRXJyb3IiLCJiaW5kIiwiY2VydCIsIm9uaWRsZSIsIl9vbklkbGUiLCJzZXRIYW5kbGVyIiwicmVzcG9uc2UiLCJfdW50YWdnZWRDYXBhYmlsaXR5SGFuZGxlciIsIl91bnRhZ2dlZE9rSGFuZGxlciIsIl91bnRhZ2dlZEV4aXN0c0hhbmRsZXIiLCJfdW50YWdnZWRFeHB1bmdlSGFuZGxlciIsIl91bnRhZ2dlZEZldGNoSGFuZGxlciIsImNyZWF0ZUxvZ2dlciIsImxvZ0xldmVsIiwiTE9HX0xFVkVMX0FMTCIsImVyciIsImNsZWFyVGltZW91dCIsImNvbm5lY3QiLCJfdGhpcyIsIm9wZW5Db25uZWN0aW9uIiwidXBncmFkZUNvbm5lY3Rpb24iLCJ1cGRhdGVJZCIsIm1lc3NhZ2UiLCJpbmNsdWRlcyIsImxvZ2dlciIsIndhcm4iLCJsb2dpbiIsImNvbXByZXNzQ29ubmVjdGlvbiIsImRlYnVnIiwiZXJyb3IiLCJjbG9zZSIsInJlamVjdCIsImNvbm5lY3Rpb25UaW1lb3V0Iiwic2V0VGltZW91dCIsIkVycm9yIiwiX2NoYW5nZVN0YXRlIiwib25yZWFkeSIsInVwZGF0ZUNhcGFiaWxpdHkiLCJjYXRjaCIsImxvZ291dCIsIl90aGlzMiIsIl90aGlzMyIsImlkIiwiX3RoaXM0IiwiaW5kZXhPZiIsImNvbW1hbmQiLCJhdHRyaWJ1dGVzIiwiZmxhdHRlbiIsIk9iamVjdCIsImVudHJpZXMiLCJleGVjIiwibGlzdCIsInBhdGhPciIsIm1hcCIsInZhbHVlcyIsImtleXMiLCJmaWx0ZXIiLCJfIiwiZnJvbVBhaXJzIiwiemlwIiwiX3Nob3VsZFNlbGVjdE1haWxib3giLCJwYXRoIiwiY3R4IiwicHJldmlvdXNTZWxlY3QiLCJnZXRQcmV2aW91c2x5UXVldWVkIiwicmVxdWVzdCIsInBhdGhBdHRyaWJ1dGUiLCJmaW5kIiwiYXR0cmlidXRlIiwidHlwZSIsInNlbGVjdE1haWxib3giLCJfeCIsIl90aGlzNSIsInF1ZXJ5IiwicmVhZE9ubHkiLCJjb25kc3RvcmUiLCJwdXNoIiwibWFpbGJveEluZm8iLCJwYXJzZVNFTEVDVCIsInN1YnNjcmliZU1haWxib3giLCJfdGhpczYiLCJ1bnN1YnNjcmliZU1haWxib3giLCJfdGhpczciLCJsaXN0TmFtZXNwYWNlcyIsIl90aGlzOCIsInBhcnNlTkFNRVNQQUNFIiwibGlzdE1haWxib3hlcyIsIl90aGlzOSIsInRyZWUiLCJyb290IiwiY2hpbGRyZW4iLCJsaXN0UmVzcG9uc2UiLCJmb3JFYWNoIiwiaXRlbSIsImF0dHIiLCJsZW5ndGgiLCJkZWxpbSIsImJyYW5jaCIsIl9lbnN1cmVQYXRoIiwiZmxhZ3MiLCJsaXN0ZWQiLCJjaGVja1NwZWNpYWxVc2UiLCJsc3ViUmVzcG9uc2UiLCJsc3ViIiwiZmxhZyIsInVuaW9uIiwic3Vic2NyaWJlZCIsImNyZWF0ZU1haWxib3giLCJfdGhpczAiLCJjb2RlIiwiZGVsZXRlTWFpbGJveCIsImxpc3RNZXNzYWdlcyIsIl94MiIsIl94MyIsIl90aGlzMSIsInNlcXVlbmNlIiwiaXRlbXMiLCJmYXN0IiwiYnVpbGRGRVRDSENvbW1hbmQiLCJwcmVjaGVjayIsInBhcnNlRkVUQ0giLCJzZWFyY2giLCJfeDQiLCJfeDUiLCJfdGhpczEwIiwiYnVpbGRTRUFSQ0hDb21tYW5kIiwicGFyc2VTRUFSQ0giLCJzZXRGbGFncyIsImtleSIsIkFycmF5IiwiaXNBcnJheSIsImNvbmNhdCIsImFkZCIsInNldCIsInJlbW92ZSIsInN0b3JlIiwiX3g2IiwiX3g3IiwiX3g4IiwiX3g5IiwiX3RoaXMxMSIsImFjdGlvbiIsImJ1aWxkU1RPUkVDb21tYW5kIiwidXBsb2FkIiwiX3gwIiwiX3gxIiwiX3RoaXMxMiIsImRlc3RpbmF0aW9uIiwicGFyc2VBUFBFTkQiLCJkZWxldGVNZXNzYWdlcyIsIl94MTAiLCJfeDExIiwiX3RoaXMxMyIsInVzZVVpZFBsdXMiLCJieVVpZCIsInVpZEV4cHVuZ2VDb21tYW5kIiwiY21kIiwiY29weU1lc3NhZ2VzIiwiX3gxMiIsIl94MTMiLCJfeDE0IiwiX3RoaXMxNCIsInBhcnNlQ09QWSIsIm1vdmVNZXNzYWdlcyIsIl94MTUiLCJfeDE2IiwiX3gxNyIsIl90aGlzMTUiLCJfdGhpczE2IiwiY29tcHJlc3NlZCIsIl90aGlzMTciLCJ4b2F1dGgyIiwiYnVpbGRYT0F1dGgyVG9rZW4iLCJ1c2VyIiwic2Vuc2l0aXZlIiwiZXJyb3JSZXNwb25zZUV4cGVjdHNFbXB0eUxpbmUiLCJjaHVuayIsIkJ1ZmZlciIsImZyb20iLCJwYXNzIiwidG9TdHJpbmciLCJjYXBhYmlsaXR5IiwicGF5bG9hZCIsIkNBUEFCSUxJVFkiLCJwb3AiLCJjYXBhIiwidG9VcHBlckNhc2UiLCJ0cmltIiwiYWNjZXB0VW50YWdnZWQiLCJfdGhpczE4IiwiYnJlYWtJZGxlIiwiZW5xdWV1ZUNvbW1hbmQiLCJlbnRlcklkbGUiLCJzZW5kIiwiX3RoaXMxOSIsInNlY3VyZU1vZGUiLCJ1cGdyYWRlIiwiZm9yY2VkIiwiX3RoaXMyMCIsImhhc0NhcGFiaWxpdHkiLCJwaXBlIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwibnIiLCJGRVRDSCIsInNoaWZ0IiwibmV3U3RhdGUiLCJkZWxpbWl0ZXIiLCJuYW1lcyIsInNwbGl0IiwiZm91bmQiLCJqIiwiX2NvbXBhcmVNYWlsYm94TmFtZXMiLCJpbWFwRGVjb2RlIiwic2xpY2UiLCJqb2luIiwiYiIsImNyZWF0b3IiLCJjcmVhdGVEZWZhdWx0TG9nZ2VyIiwibXNncyIsIkxPR19MRVZFTF9ERUJVRyIsImluZm8iLCJMT0dfTEVWRUxfSU5GTyIsIkxPR19MRVZFTF9XQVJOIiwiTE9HX0xFVkVMX0VSUk9SIl0sInNvdXJjZXMiOlsiLi4vc3JjL2NsaWVudC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBtYXAsIHBpcGUsIHVuaW9uLCB6aXAsIGZyb21QYWlycywgcHJvcE9yLCBwYXRoT3IsIGZsYXR0ZW4gfSBmcm9tICdyYW1kYSdcbmltcG9ydCB7IGltYXBEZWNvZGUgfSBmcm9tICdlbWFpbGpzLXV0ZjcnXG5pbXBvcnQge1xuICBwYXJzZUFQUEVORCxcbiAgcGFyc2VDT1BZLFxuICBwYXJzZU5BTUVTUEFDRSxcbiAgcGFyc2VTRUxFQ1QsXG4gIHBhcnNlRkVUQ0gsXG4gIHBhcnNlU0VBUkNIXG59IGZyb20gJy4vY29tbWFuZC1wYXJzZXInXG5pbXBvcnQge1xuICBidWlsZEZFVENIQ29tbWFuZCxcbiAgYnVpbGRYT0F1dGgyVG9rZW4sXG4gIGJ1aWxkU0VBUkNIQ29tbWFuZCxcbiAgYnVpbGRTVE9SRUNvbW1hbmRcbn0gZnJvbSAnLi9jb21tYW5kLWJ1aWxkZXInXG5cbmltcG9ydCBjcmVhdGVEZWZhdWx0TG9nZ2VyIGZyb20gJy4vbG9nZ2VyJ1xuaW1wb3J0IEltYXBDbGllbnQgZnJvbSAnLi9pbWFwJ1xuaW1wb3J0IHtcbiAgTE9HX0xFVkVMX0VSUk9SLFxuICBMT0dfTEVWRUxfV0FSTixcbiAgTE9HX0xFVkVMX0lORk8sXG4gIExPR19MRVZFTF9ERUJVRyxcbiAgTE9HX0xFVkVMX0FMTFxufSBmcm9tICcuL2NvbW1vbidcblxuaW1wb3J0IHtcbiAgY2hlY2tTcGVjaWFsVXNlXG59IGZyb20gJy4vc3BlY2lhbC11c2UnXG5cbmV4cG9ydCBjb25zdCBUSU1FT1VUX0NPTk5FQ1RJT04gPSA5MCAqIDEwMDAgLy8gTWlsbGlzZWNvbmRzIHRvIHdhaXQgZm9yIHRoZSBJTUFQIGdyZWV0aW5nIGZyb20gdGhlIHNlcnZlclxuZXhwb3J0IGNvbnN0IFRJTUVPVVRfTk9PUCA9IDYwICogMTAwMCAvLyBNaWxsaXNlY29uZHMgYmV0d2VlbiBOT09QIGNvbW1hbmRzIHdoaWxlIGlkbGluZ1xuZXhwb3J0IGNvbnN0IFRJTUVPVVRfSURMRSA9IDYwICogMTAwMCAvLyBNaWxsaXNlY29uZHMgdW50aWwgSURMRSBjb21tYW5kIGlzIGNhbmNlbGxlZFxuXG5leHBvcnQgY29uc3QgU1RBVEVfQ09OTkVDVElORyA9IDFcbmV4cG9ydCBjb25zdCBTVEFURV9OT1RfQVVUSEVOVElDQVRFRCA9IDJcbmV4cG9ydCBjb25zdCBTVEFURV9BVVRIRU5USUNBVEVEID0gM1xuZXhwb3J0IGNvbnN0IFNUQVRFX1NFTEVDVEVEID0gNFxuZXhwb3J0IGNvbnN0IFNUQVRFX0xPR09VVCA9IDVcblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfQ0xJRU5UX0lEID0ge1xuICBuYW1lOiAnZW1haWxqcy1pbWFwLWNsaWVudCdcbn1cblxuLyoqXG4gKiBlbWFpbGpzIElNQVAgY2xpZW50XG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IFtob3N0PSdsb2NhbGhvc3QnXSBIb3N0bmFtZSB0byBjb25lbmN0IHRvXG4gKiBAcGFyYW0ge051bWJlcn0gW3BvcnQ9MTQzXSBQb3J0IG51bWJlciB0byBjb25uZWN0IHRvXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIE9wdGlvbmFsIG9wdGlvbnMgb2JqZWN0XG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIENsaWVudCB7XG4gIGNvbnN0cnVjdG9yIChob3N0LCBwb3J0LCBvcHRpb25zID0ge30pIHtcbiAgICB0aGlzLnRpbWVvdXRDb25uZWN0aW9uID0gVElNRU9VVF9DT05ORUNUSU9OXG4gICAgdGhpcy50aW1lb3V0Tm9vcCA9IG9wdGlvbnMudGltZW91dE5vb3AgfHwgVElNRU9VVF9OT09QXG4gICAgdGhpcy50aW1lb3V0SWRsZSA9IG9wdGlvbnMudGltZW91dElkbGUgfHwgVElNRU9VVF9JRExFXG5cbiAgICB0aGlzLnNlcnZlcklkID0gZmFsc2UgLy8gUkZDIDI5NzEgU2VydmVyIElEIGFzIGtleSB2YWx1ZSBwYWlyc1xuXG4gICAgLy8gRXZlbnQgcGxhY2Vob2xkZXJzXG4gICAgdGhpcy5vbmNlcnQgPSBudWxsXG4gICAgdGhpcy5vbnVwZGF0ZSA9IG51bGxcbiAgICB0aGlzLm9uc2VsZWN0bWFpbGJveCA9IG51bGxcbiAgICB0aGlzLm9uY2xvc2VtYWlsYm94ID0gbnVsbFxuXG4gICAgdGhpcy5faG9zdCA9IGhvc3RcbiAgICB0aGlzLl9jbGllbnRJZCA9IHByb3BPcihERUZBVUxUX0NMSUVOVF9JRCwgJ2lkJywgb3B0aW9ucylcbiAgICB0aGlzLl9zdGF0ZSA9IGZhbHNlIC8vIEN1cnJlbnQgc3RhdGVcbiAgICB0aGlzLl9hdXRoZW50aWNhdGVkID0gZmFsc2UgLy8gSXMgdGhlIGNvbm5lY3Rpb24gYXV0aGVudGljYXRlZFxuICAgIHRoaXMuX2NhcGFiaWxpdHkgPSBbXSAvLyBMaXN0IG9mIGV4dGVuc2lvbnMgdGhlIHNlcnZlciBzdXBwb3J0c1xuICAgIHRoaXMuX3NlbGVjdGVkTWFpbGJveCA9IGZhbHNlIC8vIFNlbGVjdGVkIG1haWxib3hcbiAgICB0aGlzLl9lbnRlcmVkSWRsZSA9IGZhbHNlXG4gICAgdGhpcy5faWRsZVRpbWVvdXQgPSBmYWxzZVxuICAgIHRoaXMuX2VuYWJsZUNvbXByZXNzaW9uID0gISFvcHRpb25zLmVuYWJsZUNvbXByZXNzaW9uXG4gICAgdGhpcy5fYXV0aCA9IG9wdGlvbnMuYXV0aFxuICAgIHRoaXMuX3JlcXVpcmVUTFMgPSAhIW9wdGlvbnMucmVxdWlyZVRMU1xuICAgIHRoaXMuX2lnbm9yZVRMUyA9ICEhb3B0aW9ucy5pZ25vcmVUTFNcbiAgICB0aGlzLl9pZ25vcmVJZGxlQ2FwYWJpbGl0eSA9ICEhb3B0aW9ucy5pZ25vcmVJZGxlQ2FwYWJpbGl0eVxuXG4gICAgdGhpcy5jbGllbnQgPSBuZXcgSW1hcENsaWVudChob3N0LCBwb3J0LCBvcHRpb25zKSAvLyBJTUFQIGNsaWVudCBvYmplY3RcblxuICAgIC8vIEV2ZW50IEhhbmRsZXJzXG4gICAgdGhpcy5jbGllbnQub25lcnJvciA9IHRoaXMuX29uRXJyb3IuYmluZCh0aGlzKVxuICAgIHRoaXMuY2xpZW50Lm9uY2VydCA9IChjZXJ0KSA9PiAodGhpcy5vbmNlcnQgJiYgdGhpcy5vbmNlcnQoY2VydCkpIC8vIGFsbG93cyBjZXJ0aWZpY2F0ZSBoYW5kbGluZyBmb3IgcGxhdGZvcm1zIHcvbyBuYXRpdmUgdGxzIHN1cHBvcnRcbiAgICB0aGlzLmNsaWVudC5vbmlkbGUgPSAoKSA9PiB0aGlzLl9vbklkbGUoKSAvLyBzdGFydCBpZGxpbmdcblxuICAgIC8vIERlZmF1bHQgaGFuZGxlcnMgZm9yIHVudGFnZ2VkIHJlc3BvbnNlc1xuICAgIHRoaXMuY2xpZW50LnNldEhhbmRsZXIoJ2NhcGFiaWxpdHknLCAocmVzcG9uc2UpID0+IHRoaXMuX3VudGFnZ2VkQ2FwYWJpbGl0eUhhbmRsZXIocmVzcG9uc2UpKSAvLyBjYXBhYmlsaXR5IHVwZGF0ZXNcbiAgICB0aGlzLmNsaWVudC5zZXRIYW5kbGVyKCdvaycsIChyZXNwb25zZSkgPT4gdGhpcy5fdW50YWdnZWRPa0hhbmRsZXIocmVzcG9uc2UpKSAvLyBub3RpZmljYXRpb25zXG4gICAgdGhpcy5jbGllbnQuc2V0SGFuZGxlcignZXhpc3RzJywgKHJlc3BvbnNlKSA9PiB0aGlzLl91bnRhZ2dlZEV4aXN0c0hhbmRsZXIocmVzcG9uc2UpKSAvLyBtZXNzYWdlIGNvdW50IGhhcyBjaGFuZ2VkXG4gICAgdGhpcy5jbGllbnQuc2V0SGFuZGxlcignZXhwdW5nZScsIChyZXNwb25zZSkgPT4gdGhpcy5fdW50YWdnZWRFeHB1bmdlSGFuZGxlcihyZXNwb25zZSkpIC8vIG1lc3NhZ2UgaGFzIGJlZW4gZGVsZXRlZFxuICAgIHRoaXMuY2xpZW50LnNldEhhbmRsZXIoJ2ZldGNoJywgKHJlc3BvbnNlKSA9PiB0aGlzLl91bnRhZ2dlZEZldGNoSGFuZGxlcihyZXNwb25zZSkpIC8vIG1lc3NhZ2UgaGFzIGJlZW4gdXBkYXRlZCAoZWcuIGZsYWcgY2hhbmdlKVxuXG4gICAgLy8gQWN0aXZhdGUgbG9nZ2luZ1xuICAgIHRoaXMuY3JlYXRlTG9nZ2VyKClcbiAgICB0aGlzLmxvZ0xldmVsID0gcHJvcE9yKExPR19MRVZFTF9BTEwsICdsb2dMZXZlbCcsIG9wdGlvbnMpXG4gIH1cblxuICAvKipcbiAgICogQ2FsbGVkIGlmIHRoZSBsb3dlci1sZXZlbCBJbWFwQ2xpZW50IGhhcyBlbmNvdW50ZXJlZCBhbiB1bnJlY292ZXJhYmxlXG4gICAqIGVycm9yIGR1cmluZyBvcGVyYXRpb24uIENsZWFucyB1cCBhbmQgcHJvcGFnYXRlcyB0aGUgZXJyb3IgdXB3YXJkcy5cbiAgICovXG4gIF9vbkVycm9yIChlcnIpIHtcbiAgICAvLyBtYWtlIHN1cmUgbm8gaWRsZSB0aW1lb3V0IGlzIHBlbmRpbmcgYW55bW9yZVxuICAgIGNsZWFyVGltZW91dCh0aGlzLl9pZGxlVGltZW91dClcblxuICAgIC8vIHByb3BhZ2F0ZSB0aGUgZXJyb3IgdXB3YXJkc1xuICAgIHRoaXMub25lcnJvciAmJiB0aGlzLm9uZXJyb3IoZXJyKVxuICB9XG5cbiAgLy9cbiAgLy9cbiAgLy8gUFVCTElDIEFQSVxuICAvL1xuICAvL1xuXG4gIC8qKlxuICAgKiBJbml0aWF0ZSBjb25uZWN0aW9uIGFuZCBsb2dpbiB0byB0aGUgSU1BUCBzZXJ2ZXJcbiAgICpcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2Ugd2hlbiBsb2dpbiBwcm9jZWR1cmUgaXMgY29tcGxldGVcbiAgICovXG4gIGFzeW5jIGNvbm5lY3QgKCkge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLm9wZW5Db25uZWN0aW9uKClcbiAgICAgIGF3YWl0IHRoaXMudXBncmFkZUNvbm5lY3Rpb24oKVxuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVJZCh0aGlzLl9jbGllbnRJZClcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBpZiAoZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ1NvY2tldCBjbG9zZWQgdW5leHBlY3RlZGx5JykpIHRocm93IGVyclxuICAgICAgICB0aGlzLmxvZ2dlci53YXJuKCdGYWlsZWQgdG8gdXBkYXRlIHNlcnZlciBpZCEnLCBlcnIubWVzc2FnZSlcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5sb2dpbih0aGlzLl9hdXRoKVxuICAgICAgYXdhaXQgdGhpcy5jb21wcmVzc0Nvbm5lY3Rpb24oKVxuICAgICAgdGhpcy5sb2dnZXIuZGVidWcoJ0Nvbm5lY3Rpb24gZXN0YWJsaXNoZWQsIHJlYWR5IHRvIHJvbGwhJylcbiAgICAgIHRoaXMuY2xpZW50Lm9uZXJyb3IgPSB0aGlzLl9vbkVycm9yLmJpbmQodGhpcylcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKCdDb3VsZCBub3QgY29ubmVjdCB0byBzZXJ2ZXInLCBlcnIpXG4gICAgICB0aGlzLmNsb3NlKGVycikgLy8gd2UgZG9uJ3QgcmVhbGx5IGNhcmUgd2hldGhlciB0aGlzIHdvcmtzIG9yIG5vdFxuICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEluaXRpYXRlIGNvbm5lY3Rpb24gdG8gdGhlIElNQVAgc2VydmVyXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBjYXBhYmlsaXR5IG9mIHNlcnZlciB3aXRob3V0IGxvZ2luXG4gICAqL1xuICBvcGVuQ29ubmVjdGlvbiAoKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IGNvbm5lY3Rpb25UaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiByZWplY3QobmV3IEVycm9yKCdUaW1lb3V0IGNvbm5lY3RpbmcgdG8gc2VydmVyJykpLCB0aGlzLnRpbWVvdXRDb25uZWN0aW9uKVxuICAgICAgdGhpcy5sb2dnZXIuZGVidWcoJ0Nvbm5lY3RpbmcgdG8nLCB0aGlzLmNsaWVudC5ob3N0LCAnOicsIHRoaXMuY2xpZW50LnBvcnQpXG4gICAgICB0aGlzLl9jaGFuZ2VTdGF0ZShTVEFURV9DT05ORUNUSU5HKVxuICAgICAgdGhpcy5jbGllbnQuY29ubmVjdCgpLnRoZW4oKCkgPT4ge1xuICAgICAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnU29ja2V0IG9wZW5lZCwgd2FpdGluZyBmb3IgZ3JlZXRpbmcgZnJvbSB0aGUgc2VydmVyLi4uJylcblxuICAgICAgICB0aGlzLmNsaWVudC5vbnJlYWR5ID0gKCkgPT4ge1xuICAgICAgICAgIGNsZWFyVGltZW91dChjb25uZWN0aW9uVGltZW91dClcbiAgICAgICAgICB0aGlzLl9jaGFuZ2VTdGF0ZShTVEFURV9OT1RfQVVUSEVOVElDQVRFRClcbiAgICAgICAgICB0aGlzLnVwZGF0ZUNhcGFiaWxpdHkoKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gcmVzb2x2ZSh0aGlzLl9jYXBhYmlsaXR5KSlcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuY2xpZW50Lm9uZXJyb3IgPSAoZXJyKSA9PiB7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KGNvbm5lY3Rpb25UaW1lb3V0KVxuICAgICAgICAgIHJlamVjdChlcnIpXG4gICAgICAgIH1cbiAgICAgIH0pLmNhdGNoKHJlamVjdClcbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIExvZ291dFxuICAgKlxuICAgKiBTZW5kIExPR09VVCwgdG8gd2hpY2ggdGhlIHNlcnZlciByZXNwb25kcyBieSBjbG9zaW5nIHRoZSBjb25uZWN0aW9uLlxuICAgKiBVc2UgaXMgZGlzY291cmFnZWQgaWYgbmV0d29yayBzdGF0dXMgaXMgdW5jbGVhciEgSWYgbmV0d29ya3Mgc3RhdHVzIGlzXG4gICAqIHVuY2xlYXIsIHBsZWFzZSB1c2UgI2Nsb3NlIGluc3RlYWQhXG4gICAqXG4gICAqIExPR09VVCBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4xLjNcbiAgICpcbiAgICogQHJldHVybnMge1Byb21pc2V9IFJlc29sdmVzIHdoZW4gc2VydmVyIGhhcyBjbG9zZWQgdGhlIGNvbm5lY3Rpb25cbiAgICovXG4gIGFzeW5jIGxvZ291dCAoKSB7XG4gICAgdGhpcy5fY2hhbmdlU3RhdGUoU1RBVEVfTE9HT1VUKVxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdMb2dnaW5nIG91dC4uLicpXG4gICAgYXdhaXQgdGhpcy5jbGllbnQubG9nb3V0KClcbiAgICBjbGVhclRpbWVvdXQodGhpcy5faWRsZVRpbWVvdXQpXG4gIH1cblxuICAvKipcbiAgICogRm9yY2UtY2xvc2VzIHRoZSBjdXJyZW50IGNvbm5lY3Rpb24gYnkgY2xvc2luZyB0aGUgVENQIHNvY2tldC5cbiAgICpcbiAgICogQHJldHVybnMge1Byb21pc2V9IFJlc29sdmVzIHdoZW4gc29ja2V0IGlzIGNsb3NlZFxuICAgKi9cbiAgYXN5bmMgY2xvc2UgKGVycikge1xuICAgIHRoaXMuX2NoYW5nZVN0YXRlKFNUQVRFX0xPR09VVClcbiAgICBjbGVhclRpbWVvdXQodGhpcy5faWRsZVRpbWVvdXQpXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0Nsb3NpbmcgY29ubmVjdGlvbi4uLicpXG4gICAgYXdhaXQgdGhpcy5jbGllbnQuY2xvc2UoZXJyKVxuICAgIGNsZWFyVGltZW91dCh0aGlzLl9pZGxlVGltZW91dClcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIElEIGNvbW1hbmQsIHBhcnNlcyBJRCByZXNwb25zZSwgc2V0cyB0aGlzLnNlcnZlcklkXG4gICAqXG4gICAqIElEIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMjk3MVxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gaWQgSUQgYXMgSlNPTiBvYmplY3QuIFNlZSBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMyOTcxI3NlY3Rpb24tMy4zIGZvciBwb3NzaWJsZSB2YWx1ZXNcbiAgICogQHJldHVybnMge1Byb21pc2V9IFJlc29sdmVzIHdoZW4gcmVzcG9uc2UgaGFzIGJlZW4gcGFyc2VkXG4gICAqL1xuICBhc3luYyB1cGRhdGVJZCAoaWQpIHtcbiAgICBpZiAodGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdJRCcpIDwgMCkgcmV0dXJuXG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnVXBkYXRpbmcgaWQuLi4nKVxuXG4gICAgY29uc3QgY29tbWFuZCA9ICdJRCdcbiAgICBjb25zdCBhdHRyaWJ1dGVzID0gaWQgPyBbZmxhdHRlbihPYmplY3QuZW50cmllcyhpZCkpXSA6IFtudWxsXVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKHsgY29tbWFuZCwgYXR0cmlidXRlcyB9LCAnSUQnKVxuICAgIGNvbnN0IGxpc3QgPSBmbGF0dGVuKHBhdGhPcihbXSwgWydwYXlsb2FkJywgJ0lEJywgJzAnLCAnYXR0cmlidXRlcycsICcwJ10sIHJlc3BvbnNlKS5tYXAoT2JqZWN0LnZhbHVlcykpXG4gICAgY29uc3Qga2V5cyA9IGxpc3QuZmlsdGVyKChfLCBpKSA9PiBpICUgMiA9PT0gMClcbiAgICBjb25zdCB2YWx1ZXMgPSBsaXN0LmZpbHRlcigoXywgaSkgPT4gaSAlIDIgPT09IDEpXG4gICAgdGhpcy5zZXJ2ZXJJZCA9IGZyb21QYWlycyh6aXAoa2V5cywgdmFsdWVzKSlcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnU2VydmVyIGlkIHVwZGF0ZWQhJywgdGhpcy5zZXJ2ZXJJZClcbiAgfVxuXG4gIF9zaG91bGRTZWxlY3RNYWlsYm94IChwYXRoLCBjdHgpIHtcbiAgICBpZiAoIWN0eCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBjb25zdCBwcmV2aW91c1NlbGVjdCA9IHRoaXMuY2xpZW50LmdldFByZXZpb3VzbHlRdWV1ZWQoWydTRUxFQ1QnLCAnRVhBTUlORSddLCBjdHgpXG4gICAgaWYgKHByZXZpb3VzU2VsZWN0ICYmIHByZXZpb3VzU2VsZWN0LnJlcXVlc3QuYXR0cmlidXRlcykge1xuICAgICAgY29uc3QgcGF0aEF0dHJpYnV0ZSA9IHByZXZpb3VzU2VsZWN0LnJlcXVlc3QuYXR0cmlidXRlcy5maW5kKChhdHRyaWJ1dGUpID0+IGF0dHJpYnV0ZS50eXBlID09PSAnU1RSSU5HJylcbiAgICAgIGlmIChwYXRoQXR0cmlidXRlKSB7XG4gICAgICAgIHJldHVybiBwYXRoQXR0cmlidXRlLnZhbHVlICE9PSBwYXRoXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX3NlbGVjdGVkTWFpbGJveCAhPT0gcGF0aFxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgU0VMRUNUIG9yIEVYQU1JTkUgdG8gb3BlbiBhIG1haWxib3hcbiAgICpcbiAgICogU0VMRUNUIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMy4xXG4gICAqIEVYQU1JTkUgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjJcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggRnVsbCBwYXRoIHRvIG1haWxib3hcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBPcHRpb25zIG9iamVjdFxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIGluZm9ybWF0aW9uIGFib3V0IHRoZSBzZWxlY3RlZCBtYWlsYm94XG4gICAqL1xuICBhc3luYyBzZWxlY3RNYWlsYm94IChwYXRoLCBvcHRpb25zID0ge30pIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIGNvbW1hbmQ6IG9wdGlvbnMucmVhZE9ubHkgPyAnRVhBTUlORScgOiAnU0VMRUNUJyxcbiAgICAgIGF0dHJpYnV0ZXM6IFt7IHR5cGU6ICdTVFJJTkcnLCB2YWx1ZTogcGF0aCB9XVxuICAgIH1cblxuICAgIGlmIChvcHRpb25zLmNvbmRzdG9yZSAmJiB0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ0NPTkRTVE9SRScpID49IDApIHtcbiAgICAgIHF1ZXJ5LmF0dHJpYnV0ZXMucHVzaChbeyB0eXBlOiAnQVRPTScsIHZhbHVlOiAnQ09ORFNUT1JFJyB9XSlcbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnT3BlbmluZycsIHBhdGgsICcuLi4nKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKHF1ZXJ5LCBbJ0VYSVNUUycsICdGTEFHUycsICdPSyddLCB7IGN0eDogb3B0aW9ucy5jdHggfSlcbiAgICBjb25zdCBtYWlsYm94SW5mbyA9IHBhcnNlU0VMRUNUKHJlc3BvbnNlKVxuXG4gICAgdGhpcy5fY2hhbmdlU3RhdGUoU1RBVEVfU0VMRUNURUQpXG5cbiAgICBpZiAodGhpcy5fc2VsZWN0ZWRNYWlsYm94ICE9PSBwYXRoICYmIHRoaXMub25jbG9zZW1haWxib3gpIHtcbiAgICAgIGF3YWl0IHRoaXMub25jbG9zZW1haWxib3godGhpcy5fc2VsZWN0ZWRNYWlsYm94KVxuICAgIH1cbiAgICB0aGlzLl9zZWxlY3RlZE1haWxib3ggPSBwYXRoXG4gICAgaWYgKHRoaXMub25zZWxlY3RtYWlsYm94KSB7XG4gICAgICBhd2FpdCB0aGlzLm9uc2VsZWN0bWFpbGJveChwYXRoLCBtYWlsYm94SW5mbylcbiAgICB9XG5cbiAgICByZXR1cm4gbWFpbGJveEluZm9cbiAgfVxuXG4gIC8qKlxuICAgKiBTdWJzY3JpYmUgdG8gYSBtYWlsYm94IHdpdGggdGhlIGdpdmVuIHBhdGhcbiAgICpcbiAgICogU1VCU0NSSUJFIGRldGFpbHM6XG4gICAqICAgaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjMuNlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICAgKiAgICAgVGhlIHBhdGggb2YgdGhlIG1haWxib3ggeW91IHdvdWxkIGxpa2UgdG8gc3Vic2NyaWJlIHRvLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICogICAgIFByb21pc2UgcmVzb2x2ZXMgaWYgbWFpbGJveCBpcyBub3cgc3Vic2NyaWJlZCB0byBvciB3YXMgc28gYWxyZWFkeS5cbiAgICovXG4gIGFzeW5jIHN1YnNjcmliZU1haWxib3ggKHBhdGgpIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnU3Vic2NyaWJpbmcgdG8gbWFpbGJveCcsIHBhdGgsICcuLi4nKVxuICAgIHJldHVybiB0aGlzLmV4ZWMoeyBjb21tYW5kOiAnU1VCU0NSSUJFJywgYXR0cmlidXRlczogW3BhdGhdIH0pXG4gIH1cblxuICAvKipcbiAgICogVW5zdWJzY3JpYmUgZnJvbSBhIG1haWxib3ggd2l0aCB0aGUgZ2l2ZW4gcGF0aFxuICAgKlxuICAgKiBVTlNVQlNDUklCRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjdcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogICAgIFRoZSBwYXRoIG9mIHRoZSBtYWlsYm94IHlvdSB3b3VsZCBsaWtlIHRvIHVuc3Vic2NyaWJlIGZyb20uXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfVxuICAgKiAgICAgUHJvbWlzZSByZXNvbHZlcyBpZiBtYWlsYm94IGlzIG5vIGxvbmdlciBzdWJzY3JpYmVkIHRvIG9yIHdhcyBub3QgYmVmb3JlLlxuICAgKi9cbiAgYXN5bmMgdW5zdWJzY3JpYmVNYWlsYm94IChwYXRoKSB7XG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ1Vuc3Vic2NyaWJpbmcgdG8gbWFpbGJveCcsIHBhdGgsICcuLi4nKVxuICAgIHJldHVybiB0aGlzLmV4ZWMoeyBjb21tYW5kOiAnVU5TVUJTQ1JJQkUnLCBhdHRyaWJ1dGVzOiBbcGF0aF0gfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIE5BTUVTUEFDRSBjb21tYW5kXG4gICAqXG4gICAqIE5BTUVTUEFDRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMyMzQyXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggbmFtZXNwYWNlIG9iamVjdFxuICAgKi9cbiAgYXN5bmMgbGlzdE5hbWVzcGFjZXMgKCkge1xuICAgIGlmICh0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ05BTUVTUEFDRScpIDwgMCkgcmV0dXJuIGZhbHNlXG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnTGlzdGluZyBuYW1lc3BhY2VzLi4uJylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYygnTkFNRVNQQUNFJywgJ05BTUVTUEFDRScpXG4gICAgcmV0dXJuIHBhcnNlTkFNRVNQQUNFKHJlc3BvbnNlKVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgTElTVCBhbmQgTFNVQiBjb21tYW5kcy4gUmV0cmlldmVzIGEgdHJlZSBvZiBhdmFpbGFibGUgbWFpbGJveGVzXG4gICAqXG4gICAqIExJU1QgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjhcbiAgICogTFNVQiBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjMuOVxuICAgKlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIGxpc3Qgb2YgbWFpbGJveGVzXG4gICAqL1xuICBhc3luYyBsaXN0TWFpbGJveGVzICgpIHtcbiAgICBjb25zdCB0cmVlID0geyByb290OiB0cnVlLCBjaGlsZHJlbjogW10gfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0xpc3RpbmcgbWFpbGJveGVzLi4uJylcbiAgICBjb25zdCBsaXN0UmVzcG9uc2UgPSBhd2FpdCB0aGlzLmV4ZWMoeyBjb21tYW5kOiAnTElTVCcsIGF0dHJpYnV0ZXM6IFsnJywgJyonXSB9LCAnTElTVCcpXG4gICAgY29uc3QgbGlzdCA9IHBhdGhPcihbXSwgWydwYXlsb2FkJywgJ0xJU1QnXSwgbGlzdFJlc3BvbnNlKVxuICAgIGxpc3QuZm9yRWFjaChpdGVtID0+IHtcbiAgICAgIGNvbnN0IGF0dHIgPSBwcm9wT3IoW10sICdhdHRyaWJ1dGVzJywgaXRlbSlcbiAgICAgIGlmIChhdHRyLmxlbmd0aCA8IDMpIHJldHVyblxuXG4gICAgICBjb25zdCBwYXRoID0gcGF0aE9yKCcnLCBbJzInLCAndmFsdWUnXSwgYXR0cilcbiAgICAgIGNvbnN0IGRlbGltID0gcGF0aE9yKCcvJywgWycxJywgJ3ZhbHVlJ10sIGF0dHIpXG4gICAgICBjb25zdCBicmFuY2ggPSB0aGlzLl9lbnN1cmVQYXRoKHRyZWUsIHBhdGgsIGRlbGltKVxuICAgICAgYnJhbmNoLmZsYWdzID0gcHJvcE9yKFtdLCAnMCcsIGF0dHIpLm1hcCgoeyB2YWx1ZSB9KSA9PiB2YWx1ZSB8fCAnJylcbiAgICAgIGJyYW5jaC5saXN0ZWQgPSB0cnVlXG4gICAgICBjaGVja1NwZWNpYWxVc2UoYnJhbmNoKVxuICAgIH0pXG5cbiAgICBjb25zdCBsc3ViUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmV4ZWMoeyBjb21tYW5kOiAnTFNVQicsIGF0dHJpYnV0ZXM6IFsnJywgJyonXSB9LCAnTFNVQicpLmNhdGNoKGVyciA9PiB7XG4gICAgICB0aGlzLmxvZ2dlci53YXJuKCdMU1VCIGNvbW1hbmQgZmFpbGVkOiAnLCBlcnIpXG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0pXG4gICAgY29uc3QgbHN1YiA9IHBhdGhPcihbXSwgWydwYXlsb2FkJywgJ0xTVUInXSwgbHN1YlJlc3BvbnNlKVxuICAgIGxzdWIuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgICAgY29uc3QgYXR0ciA9IHByb3BPcihbXSwgJ2F0dHJpYnV0ZXMnLCBpdGVtKVxuICAgICAgaWYgKGF0dHIubGVuZ3RoIDwgMykgcmV0dXJuXG5cbiAgICAgIGNvbnN0IHBhdGggPSBwYXRoT3IoJycsIFsnMicsICd2YWx1ZSddLCBhdHRyKVxuICAgICAgY29uc3QgZGVsaW0gPSBwYXRoT3IoJy8nLCBbJzEnLCAndmFsdWUnXSwgYXR0cilcbiAgICAgIGNvbnN0IGJyYW5jaCA9IHRoaXMuX2Vuc3VyZVBhdGgodHJlZSwgcGF0aCwgZGVsaW0pXG4gICAgICBwcm9wT3IoW10sICcwJywgYXR0cikubWFwKChmbGFnID0gJycpID0+IHsgYnJhbmNoLmZsYWdzID0gdW5pb24oYnJhbmNoLmZsYWdzLCBbZmxhZ10pIH0pXG4gICAgICBicmFuY2guc3Vic2NyaWJlZCA9IHRydWVcbiAgICB9KVxuXG4gICAgcmV0dXJuIHRyZWVcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBtYWlsYm94IHdpdGggdGhlIGdpdmVuIHBhdGguXG4gICAqXG4gICAqIENSRUFURSBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjMuM1xuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICAgKiAgICAgVGhlIHBhdGggb2YgdGhlIG1haWxib3ggeW91IHdvdWxkIGxpa2UgdG8gY3JlYXRlLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICogICAgIFByb21pc2UgcmVzb2x2ZXMgaWYgbWFpbGJveCB3YXMgY3JlYXRlZC5cbiAgICogICAgIEluIHRoZSBldmVudCB0aGUgc2VydmVyIHNheXMgTk8gW0FMUkVBRFlFWElTVFNdLCB3ZSB0cmVhdCB0aGF0IGFzIHN1Y2Nlc3MuXG4gICAqL1xuICBhc3luYyBjcmVhdGVNYWlsYm94IChwYXRoKSB7XG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0NyZWF0aW5nIG1haWxib3gnLCBwYXRoLCAnLi4uJylcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5leGVjKHsgY29tbWFuZDogJ0NSRUFURScsIGF0dHJpYnV0ZXM6IFtwYXRoXSB9KVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgaWYgKGVyciAmJiBlcnIuY29kZSA9PT0gJ0FMUkVBRFlFWElTVFMnKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIERlbGV0ZSBhIG1haWxib3ggd2l0aCB0aGUgZ2l2ZW4gcGF0aC5cbiAgICpcbiAgICogREVMRVRFIGRldGFpbHM6XG4gICAqICAgaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjMuNFxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICAgKiAgICAgVGhlIHBhdGggb2YgdGhlIG1haWxib3ggeW91IHdvdWxkIGxpa2UgdG8gZGVsZXRlLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICogICAgIFByb21pc2UgcmVzb2x2ZXMgaWYgbWFpbGJveCB3YXMgZGVsZXRlZC5cbiAgICovXG4gIGRlbGV0ZU1haWxib3ggKHBhdGgpIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnRGVsZXRpbmcgbWFpbGJveCcsIHBhdGgsICcuLi4nKVxuICAgIHJldHVybiB0aGlzLmV4ZWMoeyBjb21tYW5kOiAnREVMRVRFJywgYXR0cmlidXRlczogW3BhdGhdIH0pXG4gIH1cblxuICAvKipcbiAgICogUnVucyBGRVRDSCBjb21tYW5kXG4gICAqXG4gICAqIEZFVENIIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuNC41XG4gICAqIENIQU5HRURTSU5DRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM0NTUxI3NlY3Rpb24tMy4zXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIGZvciB0aGUgbWFpbGJveCB3aGljaCBzaG91bGQgYmUgc2VsZWN0ZWQgZm9yIHRoZSBjb21tYW5kLiBTZWxlY3RzIG1haWxib3ggaWYgbmVjZXNzYXJ5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzZXF1ZW5jZSBTZXF1ZW5jZSBzZXQsIGVnIDE6KiBmb3IgYWxsIG1lc3NhZ2VzXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbaXRlbXNdIE1lc3NhZ2UgZGF0YSBpdGVtIG5hbWVzIG9yIG1hY3JvXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gUXVlcnkgbW9kaWZpZXJzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggdGhlIGZldGNoZWQgbWVzc2FnZSBpbmZvXG4gICAqL1xuICBhc3luYyBsaXN0TWVzc2FnZXMgKHBhdGgsIHNlcXVlbmNlLCBpdGVtcyA9IFt7IGZhc3Q6IHRydWUgfV0sIG9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdGZXRjaGluZyBtZXNzYWdlcycsIHNlcXVlbmNlLCAnZnJvbScsIHBhdGgsICcuLi4nKVxuICAgIGNvbnN0IGNvbW1hbmQgPSBidWlsZEZFVENIQ29tbWFuZChzZXF1ZW5jZSwgaXRlbXMsIG9wdGlvbnMpXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmV4ZWMoY29tbWFuZCwgJ0ZFVENIJywge1xuICAgICAgcHJlY2hlY2s6IChjdHgpID0+IHRoaXMuX3Nob3VsZFNlbGVjdE1haWxib3gocGF0aCwgY3R4KSA/IHRoaXMuc2VsZWN0TWFpbGJveChwYXRoLCB7IGN0eCB9KSA6IFByb21pc2UucmVzb2x2ZSgpXG4gICAgfSlcbiAgICByZXR1cm4gcGFyc2VGRVRDSChyZXNwb25zZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIFNFQVJDSCBjb21tYW5kXG4gICAqXG4gICAqIFNFQVJDSCBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjQuNFxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBmb3IgdGhlIG1haWxib3ggd2hpY2ggc2hvdWxkIGJlIHNlbGVjdGVkIGZvciB0aGUgY29tbWFuZC4gU2VsZWN0cyBtYWlsYm94IGlmIG5lY2Vzc2FyeVxuICAgKiBAcGFyYW0ge09iamVjdH0gcXVlcnkgU2VhcmNoIHRlcm1zXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gUXVlcnkgbW9kaWZpZXJzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggdGhlIGFycmF5IG9mIG1hdGNoaW5nIHNlcS4gb3IgdWlkIG51bWJlcnNcbiAgICovXG4gIGFzeW5jIHNlYXJjaCAocGF0aCwgcXVlcnksIG9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdTZWFyY2hpbmcgaW4nLCBwYXRoLCAnLi4uJylcbiAgICBjb25zdCBjb21tYW5kID0gYnVpbGRTRUFSQ0hDb21tYW5kKHF1ZXJ5LCBvcHRpb25zKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKGNvbW1hbmQsICdTRUFSQ0gnLCB7XG4gICAgICBwcmVjaGVjazogKGN0eCkgPT4gdGhpcy5fc2hvdWxkU2VsZWN0TWFpbGJveChwYXRoLCBjdHgpID8gdGhpcy5zZWxlY3RNYWlsYm94KHBhdGgsIHsgY3R4IH0pIDogUHJvbWlzZS5yZXNvbHZlKClcbiAgICB9KVxuICAgIHJldHVybiBwYXJzZVNFQVJDSChyZXNwb25zZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIFNUT1JFIGNvbW1hbmRcbiAgICpcbiAgICogU1RPUkUgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi40LjZcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHNlcXVlbmNlIE1lc3NhZ2Ugc2VsZWN0b3Igd2hpY2ggdGhlIGZsYWcgY2hhbmdlIGlzIGFwcGxpZWQgdG9cbiAgICogQHBhcmFtIHtBcnJheX0gZmxhZ3NcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBRdWVyeSBtb2RpZmllcnNcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2Ugd2l0aCB0aGUgYXJyYXkgb2YgbWF0Y2hpbmcgc2VxLiBvciB1aWQgbnVtYmVyc1xuICAgKi9cbiAgc2V0RmxhZ3MgKHBhdGgsIHNlcXVlbmNlLCBmbGFncywgb3B0aW9ucykge1xuICAgIGxldCBrZXkgPSAnJ1xuICAgIGxldCBsaXN0ID0gW11cblxuICAgIGlmIChBcnJheS5pc0FycmF5KGZsYWdzKSB8fCB0eXBlb2YgZmxhZ3MgIT09ICdvYmplY3QnKSB7XG4gICAgICBsaXN0ID0gW10uY29uY2F0KGZsYWdzIHx8IFtdKVxuICAgICAga2V5ID0gJydcbiAgICB9IGVsc2UgaWYgKGZsYWdzLmFkZCkge1xuICAgICAgbGlzdCA9IFtdLmNvbmNhdChmbGFncy5hZGQgfHwgW10pXG4gICAgICBrZXkgPSAnKydcbiAgICB9IGVsc2UgaWYgKGZsYWdzLnNldCkge1xuICAgICAga2V5ID0gJydcbiAgICAgIGxpc3QgPSBbXS5jb25jYXQoZmxhZ3Muc2V0IHx8IFtdKVxuICAgIH0gZWxzZSBpZiAoZmxhZ3MucmVtb3ZlKSB7XG4gICAgICBrZXkgPSAnLSdcbiAgICAgIGxpc3QgPSBbXS5jb25jYXQoZmxhZ3MucmVtb3ZlIHx8IFtdKVxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdTZXR0aW5nIGZsYWdzIG9uJywgc2VxdWVuY2UsICdpbicsIHBhdGgsICcuLi4nKVxuICAgIHJldHVybiB0aGlzLnN0b3JlKHBhdGgsIHNlcXVlbmNlLCBrZXkgKyAnRkxBR1MnLCBsaXN0LCBvcHRpb25zKVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgU1RPUkUgY29tbWFuZFxuICAgKlxuICAgKiBTVE9SRSBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjQuNlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBmb3IgdGhlIG1haWxib3ggd2hpY2ggc2hvdWxkIGJlIHNlbGVjdGVkIGZvciB0aGUgY29tbWFuZC4gU2VsZWN0cyBtYWlsYm94IGlmIG5lY2Vzc2FyeVxuICAgKiBAcGFyYW0ge1N0cmluZ30gc2VxdWVuY2UgTWVzc2FnZSBzZWxlY3RvciB3aGljaCB0aGUgZmxhZyBjaGFuZ2UgaXMgYXBwbGllZCB0b1xuICAgKiBAcGFyYW0ge1N0cmluZ30gYWN0aW9uIFNUT1JFIG1ldGhvZCB0byBjYWxsLCBlZyBcIitGTEFHU1wiXG4gICAqIEBwYXJhbSB7QXJyYXl9IGZsYWdzXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gUXVlcnkgbW9kaWZpZXJzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggdGhlIGFycmF5IG9mIG1hdGNoaW5nIHNlcS4gb3IgdWlkIG51bWJlcnNcbiAgICovXG4gIGFzeW5jIHN0b3JlIChwYXRoLCBzZXF1ZW5jZSwgYWN0aW9uLCBmbGFncywgb3B0aW9ucyA9IHt9KSB7XG4gICAgY29uc3QgY29tbWFuZCA9IGJ1aWxkU1RPUkVDb21tYW5kKHNlcXVlbmNlLCBhY3Rpb24sIGZsYWdzLCBvcHRpb25zKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKGNvbW1hbmQsICdGRVRDSCcsIHtcbiAgICAgIHByZWNoZWNrOiAoY3R4KSA9PiB0aGlzLl9zaG91bGRTZWxlY3RNYWlsYm94KHBhdGgsIGN0eCkgPyB0aGlzLnNlbGVjdE1haWxib3gocGF0aCwgeyBjdHggfSkgOiBQcm9taXNlLnJlc29sdmUoKVxuICAgIH0pXG4gICAgcmV0dXJuIHBhcnNlRkVUQ0gocmVzcG9uc2UpXG4gIH1cblxuICAvKipcbiAgICogUnVucyBBUFBFTkQgY29tbWFuZFxuICAgKlxuICAgKiBBUFBFTkQgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjExXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBkZXN0aW5hdGlvbiBUaGUgbWFpbGJveCB3aGVyZSB0byBhcHBlbmQgdGhlIG1lc3NhZ2VcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgVGhlIG1lc3NhZ2UgdG8gYXBwZW5kXG4gICAqIEBwYXJhbSB7QXJyYXl9IG9wdGlvbnMuZmxhZ3MgQW55IGZsYWdzIHlvdSB3YW50IHRvIHNldCBvbiB0aGUgdXBsb2FkZWQgbWVzc2FnZS4gRGVmYXVsdHMgdG8gW1xcU2Vlbl0uIChvcHRpb25hbClcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2Ugd2l0aCB0aGUgYXJyYXkgb2YgbWF0Y2hpbmcgc2VxLiBvciB1aWQgbnVtYmVyc1xuICAgKi9cbiAgYXN5bmMgdXBsb2FkIChkZXN0aW5hdGlvbiwgbWVzc2FnZSwgb3B0aW9ucyA9IHt9KSB7XG4gICAgY29uc3QgZmxhZ3MgPSBwcm9wT3IoWydcXFxcU2VlbiddLCAnZmxhZ3MnLCBvcHRpb25zKS5tYXAodmFsdWUgPT4gKHsgdHlwZTogJ2F0b20nLCB2YWx1ZSB9KSlcbiAgICBjb25zdCBjb21tYW5kID0ge1xuICAgICAgY29tbWFuZDogJ0FQUEVORCcsXG4gICAgICBhdHRyaWJ1dGVzOiBbXG4gICAgICAgIHsgdHlwZTogJ2F0b20nLCB2YWx1ZTogZGVzdGluYXRpb24gfSxcbiAgICAgICAgZmxhZ3MsXG4gICAgICAgIHsgdHlwZTogJ2xpdGVyYWwnLCB2YWx1ZTogbWVzc2FnZSB9XG4gICAgICBdXG4gICAgfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ1VwbG9hZGluZyBtZXNzYWdlIHRvJywgZGVzdGluYXRpb24sICcuLi4nKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKGNvbW1hbmQpXG4gICAgcmV0dXJuIHBhcnNlQVBQRU5EKHJlc3BvbnNlKVxuICB9XG5cbiAgLyoqXG4gICAqIERlbGV0ZXMgbWVzc2FnZXMgZnJvbSBhIHNlbGVjdGVkIG1haWxib3hcbiAgICpcbiAgICogRVhQVU5HRSBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjQuM1xuICAgKiBVSUQgRVhQVU5HRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM0MzE1I3NlY3Rpb24tMi4xXG4gICAqXG4gICAqIElmIHBvc3NpYmxlIChieVVpZDp0cnVlIGFuZCBVSURQTFVTIGV4dGVuc2lvbiBzdXBwb3J0ZWQpLCB1c2VzIFVJRCBFWFBVTkdFXG4gICAqIGNvbW1hbmQgdG8gZGVsZXRlIGEgcmFuZ2Ugb2YgbWVzc2FnZXMsIG90aGVyd2lzZSBmYWxscyBiYWNrIHRvIEVYUFVOR0UuXG4gICAqXG4gICAqIE5CISBUaGlzIG1ldGhvZCBtaWdodCBiZSBkZXN0cnVjdGl2ZSAtIGlmIEVYUFVOR0UgaXMgdXNlZCwgdGhlbiBhbnkgbWVzc2FnZXNcbiAgICogd2l0aCBcXERlbGV0ZWQgZmxhZyBzZXQgYXJlIGRlbGV0ZWRcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHNlcXVlbmNlIE1lc3NhZ2UgcmFuZ2UgdG8gYmUgZGVsZXRlZFxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZVxuICAgKi9cbiAgYXN5bmMgZGVsZXRlTWVzc2FnZXMgKHBhdGgsIHNlcXVlbmNlLCBvcHRpb25zID0ge30pIHtcbiAgICAvLyBhZGQgXFxEZWxldGVkIGZsYWcgdG8gdGhlIG1lc3NhZ2VzIGFuZCBydW4gRVhQVU5HRSBvciBVSUQgRVhQVU5HRVxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdEZWxldGluZyBtZXNzYWdlcycsIHNlcXVlbmNlLCAnaW4nLCBwYXRoLCAnLi4uJylcbiAgICBjb25zdCB1c2VVaWRQbHVzID0gb3B0aW9ucy5ieVVpZCAmJiB0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ1VJRFBMVVMnKSA+PSAwXG4gICAgY29uc3QgdWlkRXhwdW5nZUNvbW1hbmQgPSB7IGNvbW1hbmQ6ICdVSUQgRVhQVU5HRScsIGF0dHJpYnV0ZXM6IFt7IHR5cGU6ICdzZXF1ZW5jZScsIHZhbHVlOiBzZXF1ZW5jZSB9XSB9XG4gICAgYXdhaXQgdGhpcy5zZXRGbGFncyhwYXRoLCBzZXF1ZW5jZSwgeyBhZGQ6ICdcXFxcRGVsZXRlZCcgfSwgb3B0aW9ucylcbiAgICBjb25zdCBjbWQgPSB1c2VVaWRQbHVzID8gdWlkRXhwdW5nZUNvbW1hbmQgOiAnRVhQVU5HRSdcbiAgICByZXR1cm4gdGhpcy5leGVjKGNtZCwgbnVsbCwge1xuICAgICAgcHJlY2hlY2s6IChjdHgpID0+IHRoaXMuX3Nob3VsZFNlbGVjdE1haWxib3gocGF0aCwgY3R4KSA/IHRoaXMuc2VsZWN0TWFpbGJveChwYXRoLCB7IGN0eCB9KSA6IFByb21pc2UucmVzb2x2ZSgpXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBDb3BpZXMgYSByYW5nZSBvZiBtZXNzYWdlcyBmcm9tIHRoZSBhY3RpdmUgbWFpbGJveCB0byB0aGUgZGVzdGluYXRpb24gbWFpbGJveC5cbiAgICogU2lsZW50IG1ldGhvZCAodW5sZXNzIGFuIGVycm9yIG9jY3VycyksIGJ5IGRlZmF1bHQgcmV0dXJucyBubyBpbmZvcm1hdGlvbi5cbiAgICpcbiAgICogQ09QWSBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjQuN1xuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBmb3IgdGhlIG1haWxib3ggd2hpY2ggc2hvdWxkIGJlIHNlbGVjdGVkIGZvciB0aGUgY29tbWFuZC4gU2VsZWN0cyBtYWlsYm94IGlmIG5lY2Vzc2FyeVxuICAgKiBAcGFyYW0ge1N0cmluZ30gc2VxdWVuY2UgTWVzc2FnZSByYW5nZSB0byBiZSBjb3BpZWRcbiAgICogQHBhcmFtIHtTdHJpbmd9IGRlc3RpbmF0aW9uIERlc3RpbmF0aW9uIG1haWxib3ggcGF0aFxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLmJ5VWlkXSBJZiB0cnVlLCB1c2VzIFVJRCBDT1BZIGluc3RlYWQgb2YgQ09QWVxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZVxuICAgKi9cbiAgYXN5bmMgY29weU1lc3NhZ2VzIChwYXRoLCBzZXF1ZW5jZSwgZGVzdGluYXRpb24sIG9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDb3B5aW5nIG1lc3NhZ2VzJywgc2VxdWVuY2UsICdmcm9tJywgcGF0aCwgJ3RvJywgZGVzdGluYXRpb24sICcuLi4nKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKHtcbiAgICAgIGNvbW1hbmQ6IG9wdGlvbnMuYnlVaWQgPyAnVUlEIENPUFknIDogJ0NPUFknLFxuICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICB7IHR5cGU6ICdzZXF1ZW5jZScsIHZhbHVlOiBzZXF1ZW5jZSB9LFxuICAgICAgICB7IHR5cGU6ICdhdG9tJywgdmFsdWU6IGRlc3RpbmF0aW9uIH1cbiAgICAgIF1cbiAgICB9LCBudWxsLCB7XG4gICAgICBwcmVjaGVjazogKGN0eCkgPT4gdGhpcy5fc2hvdWxkU2VsZWN0TWFpbGJveChwYXRoLCBjdHgpID8gdGhpcy5zZWxlY3RNYWlsYm94KHBhdGgsIHsgY3R4IH0pIDogUHJvbWlzZS5yZXNvbHZlKClcbiAgICB9KVxuICAgIHJldHVybiBwYXJzZUNPUFkocmVzcG9uc2UpXG4gIH1cblxuICAvKipcbiAgICogTW92ZXMgYSByYW5nZSBvZiBtZXNzYWdlcyBmcm9tIHRoZSBhY3RpdmUgbWFpbGJveCB0byB0aGUgZGVzdGluYXRpb24gbWFpbGJveC5cbiAgICogUHJlZmVycyB0aGUgTU9WRSBleHRlbnNpb24gYnV0IGlmIG5vdCBhdmFpbGFibGUsIGZhbGxzIGJhY2sgdG9cbiAgICogQ09QWSArIEVYUFVOR0VcbiAgICpcbiAgICogTU9WRSBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzY4NTFcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHNlcXVlbmNlIE1lc3NhZ2UgcmFuZ2UgdG8gYmUgbW92ZWRcbiAgICogQHBhcmFtIHtTdHJpbmd9IGRlc3RpbmF0aW9uIERlc3RpbmF0aW9uIG1haWxib3ggcGF0aFxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZVxuICAgKi9cbiAgYXN5bmMgbW92ZU1lc3NhZ2VzIChwYXRoLCBzZXF1ZW5jZSwgZGVzdGluYXRpb24sIG9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdNb3ZpbmcgbWVzc2FnZXMnLCBzZXF1ZW5jZSwgJ2Zyb20nLCBwYXRoLCAndG8nLCBkZXN0aW5hdGlvbiwgJy4uLicpXG5cbiAgICBpZiAodGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdNT1ZFJykgPT09IC0xKSB7XG4gICAgICAvLyBGYWxsYmFjayB0byBDT1BZICsgRVhQVU5HRVxuICAgICAgYXdhaXQgdGhpcy5jb3B5TWVzc2FnZXMocGF0aCwgc2VxdWVuY2UsIGRlc3RpbmF0aW9uLCBvcHRpb25zKVxuICAgICAgcmV0dXJuIHRoaXMuZGVsZXRlTWVzc2FnZXMocGF0aCwgc2VxdWVuY2UsIG9wdGlvbnMpXG4gICAgfVxuXG4gICAgLy8gSWYgcG9zc2libGUsIHVzZSBNT1ZFXG4gICAgcmV0dXJuIHRoaXMuZXhlYyh7XG4gICAgICBjb21tYW5kOiBvcHRpb25zLmJ5VWlkID8gJ1VJRCBNT1ZFJyA6ICdNT1ZFJyxcbiAgICAgIGF0dHJpYnV0ZXM6IFtcbiAgICAgICAgeyB0eXBlOiAnc2VxdWVuY2UnLCB2YWx1ZTogc2VxdWVuY2UgfSxcbiAgICAgICAgeyB0eXBlOiAnYXRvbScsIHZhbHVlOiBkZXN0aW5hdGlvbiB9XG4gICAgICBdXG4gICAgfSwgWydPSyddLCB7XG4gICAgICBwcmVjaGVjazogKGN0eCkgPT4gdGhpcy5fc2hvdWxkU2VsZWN0TWFpbGJveChwYXRoLCBjdHgpID8gdGhpcy5zZWxlY3RNYWlsYm94KHBhdGgsIHsgY3R4IH0pIDogUHJvbWlzZS5yZXNvbHZlKClcbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgQ09NUFJFU1MgY29tbWFuZFxuICAgKlxuICAgKiBDT01QUkVTUyBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM0OTc4XG4gICAqL1xuICBhc3luYyBjb21wcmVzc0Nvbm5lY3Rpb24gKCkge1xuICAgIGlmICghdGhpcy5fZW5hYmxlQ29tcHJlc3Npb24gfHwgdGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdDT01QUkVTUz1ERUZMQVRFJykgPCAwIHx8IHRoaXMuY2xpZW50LmNvbXByZXNzZWQpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdFbmFibGluZyBjb21wcmVzc2lvbi4uLicpXG4gICAgYXdhaXQgdGhpcy5leGVjKHtcbiAgICAgIGNvbW1hbmQ6ICdDT01QUkVTUycsXG4gICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICB0eXBlOiAnQVRPTScsXG4gICAgICAgIHZhbHVlOiAnREVGTEFURSdcbiAgICAgIH1dXG4gICAgfSlcbiAgICB0aGlzLmNsaWVudC5lbmFibGVDb21wcmVzc2lvbigpXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0NvbXByZXNzaW9uIGVuYWJsZWQsIGFsbCBkYXRhIHNlbnQgYW5kIHJlY2VpdmVkIGlzIGRlZmxhdGVkIScpXG4gIH1cblxuICAvKipcbiAgICogUnVucyBMT0dJTiBvciBBVVRIRU5USUNBVEUgWE9BVVRIMiBjb21tYW5kXG4gICAqXG4gICAqIExPR0lOIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMi4zXG4gICAqIFhPQVVUSDIgZGV0YWlsczpcbiAgICogICBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9nbWFpbC94b2F1dGgyX3Byb3RvY29sI2ltYXBfcHJvdG9jb2xfZXhjaGFuZ2VcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IGF1dGgudXNlclxuICAgKiBAcGFyYW0ge1N0cmluZ30gYXV0aC5wYXNzXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBhdXRoLnhvYXV0aDJcbiAgICovXG4gIGFzeW5jIGxvZ2luIChhdXRoKSB7XG4gICAgbGV0IGNvbW1hbmRcbiAgICBjb25zdCBvcHRpb25zID0ge31cblxuICAgIGlmICghYXV0aCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBdXRoZW50aWNhdGlvbiBpbmZvcm1hdGlvbiBub3QgcHJvdmlkZWQnKVxuICAgIH1cblxuICAgIGlmICh0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ0FVVEg9WE9BVVRIMicpID49IDAgJiYgYXV0aCAmJiBhdXRoLnhvYXV0aDIpIHtcbiAgICAgIGNvbW1hbmQgPSB7XG4gICAgICAgIGNvbW1hbmQ6ICdBVVRIRU5USUNBVEUnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbXG4gICAgICAgICAgeyB0eXBlOiAnQVRPTScsIHZhbHVlOiAnWE9BVVRIMicgfSxcbiAgICAgICAgICB7IHR5cGU6ICdBVE9NJywgdmFsdWU6IGJ1aWxkWE9BdXRoMlRva2VuKGF1dGgudXNlciwgYXV0aC54b2F1dGgyKSwgc2Vuc2l0aXZlOiB0cnVlIH1cbiAgICAgICAgXVxuICAgICAgfVxuXG4gICAgICBvcHRpb25zLmVycm9yUmVzcG9uc2VFeHBlY3RzRW1wdHlMaW5lID0gdHJ1ZSAvLyArIHRhZ2dlZCBlcnJvciByZXNwb25zZSBleHBlY3RzIGFuIGVtcHR5IGxpbmUgaW4gcmV0dXJuXG4gICAgfSBlbHNlIGlmICh0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ0FVVEg9UExBSU4nKSA+PSAwKSB7XG4gICAgICBjb21tYW5kID0ge1xuICAgICAgICBjb21tYW5kOiAnQVVUSEVOVElDQVRFJyxcbiAgICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICAgIHsgdHlwZTogJ1RFWFQnLCB2YWx1ZTogJ1BMQUlOJyB9LFxuICAgICAgICAgIHsgdHlwZTogJ1RFWFQnLCBjaHVuazogdHJ1ZSwgdmFsdWU6IEJ1ZmZlci5mcm9tKCdcXHgwMCcgKyBhdXRoLnVzZXIgKyAnXFx4MDAnICsgYXV0aC5wYXNzIHx8ICcnKS50b1N0cmluZygnYmFzZTY0JyksIHNlbnNpdGl2ZTogdHJ1ZSB9XG4gICAgICAgIF1cbiAgICAgIH1cbiAgICAgIG9wdGlvbnMuZXJyb3JSZXNwb25zZUV4cGVjdHNFbXB0eUxpbmUgPSB0cnVlIC8vICsgdGFnZ2VkIGVycm9yIHJlc3BvbnNlIGV4cGVjdHMgYW4gZW1wdHkgbGluZSBpbiByZXR1cm5cbiAgICB9IGVsc2Uge1xuICAgICAgY29tbWFuZCA9IHtcbiAgICAgICAgY29tbWFuZDogJ2xvZ2luJyxcbiAgICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICAgIHsgdHlwZTogJ1NUUklORycsIHZhbHVlOiBhdXRoLnVzZXIgfHwgJycgfSxcbiAgICAgICAgICB7IHR5cGU6ICdTVFJJTkcnLCB2YWx1ZTogYXV0aC5wYXNzIHx8ICcnLCBzZW5zaXRpdmU6IHRydWUgfVxuICAgICAgICBdXG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0xvZ2dpbmcgaW4uLi4nKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKGNvbW1hbmQsICdjYXBhYmlsaXR5Jywgb3B0aW9ucylcbiAgICAvKlxuICAgICAqIHVwZGF0ZSBwb3N0LWF1dGggY2FwYWJpbGl0ZXNcbiAgICAgKiBjYXBhYmlsaXR5IGxpc3Qgc2hvdWxkbid0IGNvbnRhaW4gYXV0aCByZWxhdGVkIHN0dWZmIGFueW1vcmVcbiAgICAgKiBidXQgc29tZSBuZXcgZXh0ZW5zaW9ucyBtaWdodCBoYXZlIHBvcHBlZCB1cCB0aGF0IGRvIG5vdFxuICAgICAqIG1ha2UgbXVjaCBzZW5zZSBpbiB0aGUgbm9uLWF1dGggc3RhdGVcbiAgICAgKi9cbiAgICBpZiAocmVzcG9uc2UuY2FwYWJpbGl0eSAmJiByZXNwb25zZS5jYXBhYmlsaXR5Lmxlbmd0aCkge1xuICAgICAgLy8gY2FwYWJpbGl0ZXMgd2VyZSBsaXN0ZWQgd2l0aCB0aGUgT0sgW0NBUEFCSUxJVFkgLi4uXSByZXNwb25zZVxuICAgICAgdGhpcy5fY2FwYWJpbGl0eSA9IHJlc3BvbnNlLmNhcGFiaWxpdHlcbiAgICB9IGVsc2UgaWYgKHJlc3BvbnNlLnBheWxvYWQgJiYgcmVzcG9uc2UucGF5bG9hZC5DQVBBQklMSVRZICYmIHJlc3BvbnNlLnBheWxvYWQuQ0FQQUJJTElUWS5sZW5ndGgpIHtcbiAgICAgIC8vIGNhcGFiaWxpdGVzIHdlcmUgbGlzdGVkIHdpdGggKiBDQVBBQklMSVRZIC4uLiByZXNwb25zZVxuICAgICAgdGhpcy5fY2FwYWJpbGl0eSA9IHJlc3BvbnNlLnBheWxvYWQuQ0FQQUJJTElUWS5wb3AoKS5hdHRyaWJ1dGVzLm1hcCgoY2FwYSA9ICcnKSA9PiBjYXBhLnZhbHVlLnRvVXBwZXJDYXNlKCkudHJpbSgpKVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBjYXBhYmlsaXRpZXMgd2VyZSBub3QgYXV0b21hdGljYWxseSBsaXN0ZWQsIHJlbG9hZFxuICAgICAgYXdhaXQgdGhpcy51cGRhdGVDYXBhYmlsaXR5KHRydWUpXG4gICAgfVxuXG4gICAgdGhpcy5fY2hhbmdlU3RhdGUoU1RBVEVfQVVUSEVOVElDQVRFRClcbiAgICB0aGlzLl9hdXRoZW50aWNhdGVkID0gdHJ1ZVxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdMb2dpbiBzdWNjZXNzZnVsLCBwb3N0LWF1dGggY2FwYWJpbGl0ZXMgdXBkYXRlZCEnLCB0aGlzLl9jYXBhYmlsaXR5KVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1biBhbiBJTUFQIGNvbW1hbmQuXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXF1ZXN0IFN0cnVjdHVyZWQgcmVxdWVzdCBvYmplY3RcbiAgICogQHBhcmFtIHtBcnJheX0gYWNjZXB0VW50YWdnZWQgYSBsaXN0IG9mIHVudGFnZ2VkIHJlc3BvbnNlcyB0aGF0IHdpbGwgYmUgaW5jbHVkZWQgaW4gJ3BheWxvYWQnIHByb3BlcnR5XG4gICAqL1xuICBhc3luYyBleGVjIChyZXF1ZXN0LCBhY2NlcHRVbnRhZ2dlZCwgb3B0aW9ucykge1xuICAgIHRoaXMuYnJlYWtJZGxlKClcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuY2xpZW50LmVucXVldWVDb21tYW5kKHJlcXVlc3QsIGFjY2VwdFVudGFnZ2VkLCBvcHRpb25zKVxuICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5jYXBhYmlsaXR5KSB7XG4gICAgICB0aGlzLl9jYXBhYmlsaXR5ID0gcmVzcG9uc2UuY2FwYWJpbGl0eVxuICAgIH1cbiAgICByZXR1cm4gcmVzcG9uc2VcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGUgY29ubmVjdGlvbiBpcyBpZGxpbmcuIFNlbmRzIGEgTk9PUCBvciBJRExFIGNvbW1hbmRcbiAgICpcbiAgICogSURMRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMyMTc3XG4gICAqL1xuICBlbnRlcklkbGUgKCkge1xuICAgIGlmICh0aGlzLl9lbnRlcmVkSWRsZSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHRoaXMuX2VudGVyZWRJZGxlID0gIXRoaXMuX2lnbm9yZUlkbGVDYXBhYmlsaXR5ICYmIHRoaXMuX3NlbGVjdGVkTWFpbGJveCAmJiB0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ0lETEUnKSA+PSAwID8gJ0lETEUnIDogJ05PT1AnXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0VudGVyaW5nIGlkbGUgd2l0aCAnICsgdGhpcy5fZW50ZXJlZElkbGUpXG5cbiAgICBpZiAodGhpcy5fZW50ZXJlZElkbGUgPT09ICdOT09QJykge1xuICAgICAgdGhpcy5faWRsZVRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgdGhpcy5sb2dnZXIuZGVidWcoJ1NlbmRpbmcgTk9PUCcpXG4gICAgICAgIHRoaXMuZXhlYygnTk9PUCcpXG4gICAgICB9LCB0aGlzLnRpbWVvdXROb29wKVxuICAgIH0gZWxzZSBpZiAodGhpcy5fZW50ZXJlZElkbGUgPT09ICdJRExFJykge1xuICAgICAgdGhpcy5jbGllbnQuZW5xdWV1ZUNvbW1hbmQoe1xuICAgICAgICBjb21tYW5kOiAnSURMRSdcbiAgICAgIH0pXG4gICAgICB0aGlzLl9pZGxlVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICB0aGlzLmNsaWVudC5zZW5kKCdET05FXFxyXFxuJylcbiAgICAgICAgdGhpcy5fZW50ZXJlZElkbGUgPSBmYWxzZVxuICAgICAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnSWRsZSB0ZXJtaW5hdGVkJylcbiAgICAgIH0sIHRoaXMudGltZW91dElkbGUpXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN0b3BzIGFjdGlvbnMgcmVsYXRlZCBpZGxpbmcsIGlmIElETEUgaXMgc3VwcG9ydGVkLCBzZW5kcyBET05FIHRvIHN0b3AgaXRcbiAgICovXG4gIGJyZWFrSWRsZSAoKSB7XG4gICAgaWYgKCF0aGlzLl9lbnRlcmVkSWRsZSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY2xlYXJUaW1lb3V0KHRoaXMuX2lkbGVUaW1lb3V0KVxuICAgIGlmICh0aGlzLl9lbnRlcmVkSWRsZSA9PT0gJ0lETEUnKSB7XG4gICAgICB0aGlzLmNsaWVudC5zZW5kKCdET05FXFxyXFxuJylcbiAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdJZGxlIHRlcm1pbmF0ZWQnKVxuICAgIH1cbiAgICB0aGlzLl9lbnRlcmVkSWRsZSA9IGZhbHNlXG4gIH1cblxuICAvKipcbiAgICogUnVucyBTVEFSVFRMUyBjb21tYW5kIGlmIG5lZWRlZFxuICAgKlxuICAgKiBTVEFSVFRMUyBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjIuMVxuICAgKlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtmb3JjZWRdIEJ5IGRlZmF1bHQgdGhlIGNvbW1hbmQgaXMgbm90IHJ1biBpZiBjYXBhYmlsaXR5IGlzIGFscmVhZHkgbGlzdGVkLiBTZXQgdG8gdHJ1ZSB0byBza2lwIHRoaXMgdmFsaWRhdGlvblxuICAgKi9cbiAgYXN5bmMgdXBncmFkZUNvbm5lY3Rpb24gKCkge1xuICAgIC8vIHNraXAgcmVxdWVzdCwgaWYgYWxyZWFkeSBzZWN1cmVkXG4gICAgaWYgKHRoaXMuY2xpZW50LnNlY3VyZU1vZGUpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIC8vIHNraXAgaWYgU1RBUlRUTFMgbm90IGF2YWlsYWJsZSBvciBzdGFydHRscyBzdXBwb3J0IGRpc2FibGVkXG4gICAgaWYgKCh0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ1NUQVJUVExTJykgPCAwIHx8IHRoaXMuX2lnbm9yZVRMUykgJiYgIXRoaXMuX3JlcXVpcmVUTFMpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdFbmNyeXB0aW5nIGNvbm5lY3Rpb24uLi4nKVxuICAgIGF3YWl0IHRoaXMuZXhlYygnU1RBUlRUTFMnKVxuICAgIHRoaXMuX2NhcGFiaWxpdHkgPSBbXVxuICAgIHRoaXMuY2xpZW50LnVwZ3JhZGUoKVxuICAgIHJldHVybiB0aGlzLnVwZGF0ZUNhcGFiaWxpdHkoKVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgQ0FQQUJJTElUWSBjb21tYW5kXG4gICAqXG4gICAqIENBUEFCSUxJVFkgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4xLjFcbiAgICpcbiAgICogRG9lc24ndCByZWdpc3RlciB1bnRhZ2dlZCBDQVBBQklMSVRZIGhhbmRsZXIgYXMgdGhpcyBpcyBhbHJlYWR5XG4gICAqIGhhbmRsZWQgYnkgZ2xvYmFsIGhhbmRsZXJcbiAgICpcbiAgICogQHBhcmFtIHtCb29sZWFufSBbZm9yY2VkXSBCeSBkZWZhdWx0IHRoZSBjb21tYW5kIGlzIG5vdCBydW4gaWYgY2FwYWJpbGl0eSBpcyBhbHJlYWR5IGxpc3RlZC4gU2V0IHRvIHRydWUgdG8gc2tpcCB0aGlzIHZhbGlkYXRpb25cbiAgICovXG4gIGFzeW5jIHVwZGF0ZUNhcGFiaWxpdHkgKGZvcmNlZCkge1xuICAgIC8vIHNraXAgcmVxdWVzdCwgaWYgbm90IGZvcmNlZCB1cGRhdGUgYW5kIGNhcGFiaWxpdGllcyBhcmUgYWxyZWFkeSBsb2FkZWRcbiAgICBpZiAoIWZvcmNlZCAmJiB0aGlzLl9jYXBhYmlsaXR5Lmxlbmd0aCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gSWYgU1RBUlRUTFMgaXMgcmVxdWlyZWQgdGhlbiBza2lwIGNhcGFiaWxpdHkgbGlzdGluZyBhcyB3ZSBhcmUgZ29pbmcgdG8gdHJ5XG4gICAgLy8gU1RBUlRUTFMgYW55d2F5IGFuZCB3ZSByZS1jaGVjayBjYXBhYmlsaXRpZXMgYWZ0ZXIgY29ubmVjdGlvbiBpcyBzZWN1cmVkXG4gICAgaWYgKCF0aGlzLmNsaWVudC5zZWN1cmVNb2RlICYmIHRoaXMuX3JlcXVpcmVUTFMpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdVcGRhdGluZyBjYXBhYmlsaXR5Li4uJylcbiAgICByZXR1cm4gdGhpcy5leGVjKCdDQVBBQklMSVRZJylcbiAgfVxuXG4gIGhhc0NhcGFiaWxpdHkgKGNhcGEgPSAnJykge1xuICAgIHJldHVybiB0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoY2FwYS50b1VwcGVyQ2FzZSgpLnRyaW0oKSkgPj0gMFxuICB9XG5cbiAgLy8gRGVmYXVsdCBoYW5kbGVycyBmb3IgdW50YWdnZWQgcmVzcG9uc2VzXG5cbiAgLyoqXG4gICAqIENoZWNrcyBpZiBhbiB1bnRhZ2dlZCBPSyBpbmNsdWRlcyBbQ0FQQUJJTElUWV0gdGFnIGFuZCB1cGRhdGVzIGNhcGFiaWxpdHkgb2JqZWN0XG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXNwb25zZSBQYXJzZWQgc2VydmVyIHJlc3BvbnNlXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHQgVW50aWwgY2FsbGVkLCBzZXJ2ZXIgcmVzcG9uc2VzIGFyZSBub3QgcHJvY2Vzc2VkXG4gICAqL1xuICBfdW50YWdnZWRPa0hhbmRsZXIgKHJlc3BvbnNlKSB7XG4gICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLmNhcGFiaWxpdHkpIHtcbiAgICAgIHRoaXMuX2NhcGFiaWxpdHkgPSByZXNwb25zZS5jYXBhYmlsaXR5XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZXMgY2FwYWJpbGl0eSBvYmplY3RcbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlc3BvbnNlIFBhcnNlZCBzZXJ2ZXIgcmVzcG9uc2VcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dCBVbnRpbCBjYWxsZWQsIHNlcnZlciByZXNwb25zZXMgYXJlIG5vdCBwcm9jZXNzZWRcbiAgICovXG4gIF91bnRhZ2dlZENhcGFiaWxpdHlIYW5kbGVyIChyZXNwb25zZSkge1xuICAgIHRoaXMuX2NhcGFiaWxpdHkgPSBwaXBlKFxuICAgICAgcHJvcE9yKFtdLCAnYXR0cmlidXRlcycpLFxuICAgICAgbWFwKCh7IHZhbHVlIH0pID0+ICh2YWx1ZSB8fCAnJykudG9VcHBlckNhc2UoKS50cmltKCkpXG4gICAgKShyZXNwb25zZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGVzIGV4aXN0aW5nIG1lc3NhZ2UgY291bnRcbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlc3BvbnNlIFBhcnNlZCBzZXJ2ZXIgcmVzcG9uc2VcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dCBVbnRpbCBjYWxsZWQsIHNlcnZlciByZXNwb25zZXMgYXJlIG5vdCBwcm9jZXNzZWRcbiAgICovXG4gIF91bnRhZ2dlZEV4aXN0c0hhbmRsZXIgKHJlc3BvbnNlKSB7XG4gICAgaWYgKHJlc3BvbnNlICYmIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXNwb25zZSwgJ25yJykpIHtcbiAgICAgIHRoaXMub251cGRhdGUgJiYgdGhpcy5vbnVwZGF0ZSh0aGlzLl9zZWxlY3RlZE1haWxib3gsICdleGlzdHMnLCByZXNwb25zZS5ucilcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogSW5kaWNhdGVzIGEgbWVzc2FnZSBoYXMgYmVlbiBkZWxldGVkXG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXNwb25zZSBQYXJzZWQgc2VydmVyIHJlc3BvbnNlXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHQgVW50aWwgY2FsbGVkLCBzZXJ2ZXIgcmVzcG9uc2VzIGFyZSBub3QgcHJvY2Vzc2VkXG4gICAqL1xuICBfdW50YWdnZWRFeHB1bmdlSGFuZGxlciAocmVzcG9uc2UpIHtcbiAgICBpZiAocmVzcG9uc2UgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3BvbnNlLCAnbnInKSkge1xuICAgICAgdGhpcy5vbnVwZGF0ZSAmJiB0aGlzLm9udXBkYXRlKHRoaXMuX3NlbGVjdGVkTWFpbGJveCwgJ2V4cHVuZ2UnLCByZXNwb25zZS5ucilcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogSW5kaWNhdGVzIHRoYXQgZmxhZ3MgaGF2ZSBiZWVuIHVwZGF0ZWQgZm9yIGEgbWVzc2FnZVxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVzcG9uc2UgUGFyc2VkIHNlcnZlciByZXNwb25zZVxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0IFVudGlsIGNhbGxlZCwgc2VydmVyIHJlc3BvbnNlcyBhcmUgbm90IHByb2Nlc3NlZFxuICAgKi9cbiAgX3VudGFnZ2VkRmV0Y2hIYW5kbGVyIChyZXNwb25zZSkge1xuICAgIHRoaXMub251cGRhdGUgJiYgdGhpcy5vbnVwZGF0ZSh0aGlzLl9zZWxlY3RlZE1haWxib3gsICdmZXRjaCcsIFtdLmNvbmNhdChwYXJzZUZFVENIKHsgcGF5bG9hZDogeyBGRVRDSDogW3Jlc3BvbnNlXSB9IH0pIHx8IFtdKS5zaGlmdCgpKVxuICB9XG5cbiAgLy8gUHJpdmF0ZSBoZWxwZXJzXG5cbiAgLyoqXG4gICAqIEluZGljYXRlcyB0aGF0IHRoZSBjb25uZWN0aW9uIHN0YXJ0ZWQgaWRsaW5nLiBJbml0aWF0ZXMgYSBjeWNsZVxuICAgKiBvZiBOT09QcyBvciBJRExFcyB0byByZWNlaXZlIG5vdGlmaWNhdGlvbnMgYWJvdXQgdXBkYXRlcyBpbiB0aGUgc2VydmVyXG4gICAqL1xuICBfb25JZGxlICgpIHtcbiAgICBpZiAoIXRoaXMuX2F1dGhlbnRpY2F0ZWQgfHwgdGhpcy5fZW50ZXJlZElkbGUpIHtcbiAgICAgIC8vIE5vIG5lZWQgdG8gSURMRSB3aGVuIG5vdCBsb2dnZWQgaW4gb3IgYWxyZWFkeSBpZGxpbmdcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDbGllbnQgc3RhcnRlZCBpZGxpbmcnKVxuICAgIHRoaXMuZW50ZXJJZGxlKClcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGVzIHRoZSBJTUFQIHN0YXRlIHZhbHVlIGZvciB0aGUgY3VycmVudCBjb25uZWN0aW9uXG4gICAqXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBuZXdTdGF0ZSBUaGUgc3RhdGUgeW91IHdhbnQgdG8gY2hhbmdlIHRvXG4gICAqL1xuICBfY2hhbmdlU3RhdGUgKG5ld1N0YXRlKSB7XG4gICAgaWYgKG5ld1N0YXRlID09PSB0aGlzLl9zdGF0ZSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0VudGVyaW5nIHN0YXRlOiAnICsgbmV3U3RhdGUpXG5cbiAgICAvLyBpZiBhIG1haWxib3ggd2FzIG9wZW5lZCwgZW1pdCBvbmNsb3NlbWFpbGJveCBhbmQgY2xlYXIgc2VsZWN0ZWRNYWlsYm94IHZhbHVlXG4gICAgaWYgKHRoaXMuX3N0YXRlID09PSBTVEFURV9TRUxFQ1RFRCAmJiB0aGlzLl9zZWxlY3RlZE1haWxib3gpIHtcbiAgICAgIHRoaXMub25jbG9zZW1haWxib3ggJiYgdGhpcy5vbmNsb3NlbWFpbGJveCh0aGlzLl9zZWxlY3RlZE1haWxib3gpXG4gICAgICB0aGlzLl9zZWxlY3RlZE1haWxib3ggPSBmYWxzZVxuICAgIH1cblxuICAgIHRoaXMuX3N0YXRlID0gbmV3U3RhdGVcbiAgfVxuXG4gIC8qKlxuICAgKiBFbnN1cmVzIGEgcGF0aCBleGlzdHMgaW4gdGhlIE1haWxib3ggdHJlZVxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gdHJlZSBNYWlsYm94IHRyZWVcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogQHBhcmFtIHtTdHJpbmd9IGRlbGltaXRlclxuICAgKiBAcmV0dXJuIHtPYmplY3R9IGJyYW5jaCBmb3IgdXNlZCBwYXRoXG4gICAqL1xuICBfZW5zdXJlUGF0aCAodHJlZSwgcGF0aCwgZGVsaW1pdGVyKSB7XG4gICAgY29uc3QgbmFtZXMgPSBwYXRoLnNwbGl0KGRlbGltaXRlcilcbiAgICBsZXQgYnJhbmNoID0gdHJlZVxuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBuYW1lcy5sZW5ndGg7IGkrKykge1xuICAgICAgbGV0IGZvdW5kID0gZmFsc2VcbiAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgYnJhbmNoLmNoaWxkcmVuLmxlbmd0aDsgaisrKSB7XG4gICAgICAgIGlmICh0aGlzLl9jb21wYXJlTWFpbGJveE5hbWVzKGJyYW5jaC5jaGlsZHJlbltqXS5uYW1lLCBpbWFwRGVjb2RlKG5hbWVzW2ldKSkpIHtcbiAgICAgICAgICBicmFuY2ggPSBicmFuY2guY2hpbGRyZW5bal1cbiAgICAgICAgICBmb3VuZCA9IHRydWVcbiAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoIWZvdW5kKSB7XG4gICAgICAgIGJyYW5jaC5jaGlsZHJlbi5wdXNoKHtcbiAgICAgICAgICBuYW1lOiBpbWFwRGVjb2RlKG5hbWVzW2ldKSxcbiAgICAgICAgICBkZWxpbWl0ZXI6IGRlbGltaXRlcixcbiAgICAgICAgICBwYXRoOiBuYW1lcy5zbGljZSgwLCBpICsgMSkuam9pbihkZWxpbWl0ZXIpLFxuICAgICAgICAgIGNoaWxkcmVuOiBbXVxuICAgICAgICB9KVxuICAgICAgICBicmFuY2ggPSBicmFuY2guY2hpbGRyZW5bYnJhbmNoLmNoaWxkcmVuLmxlbmd0aCAtIDFdXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBicmFuY2hcbiAgfVxuXG4gIC8qKlxuICAgKiBDb21wYXJlcyB0d28gbWFpbGJveCBuYW1lcy4gQ2FzZSBpbnNlbnNpdGl2ZSBpbiBjYXNlIG9mIElOQk9YLCBvdGhlcndpc2UgY2FzZSBzZW5zaXRpdmVcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IGEgTWFpbGJveCBuYW1lXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBiIE1haWxib3ggbmFtZVxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gVHJ1ZSBpZiB0aGUgZm9sZGVyIG5hbWVzIG1hdGNoXG4gICAqL1xuICBfY29tcGFyZU1haWxib3hOYW1lcyAoYSwgYikge1xuICAgIHJldHVybiAoYS50b1VwcGVyQ2FzZSgpID09PSAnSU5CT1gnID8gJ0lOQk9YJyA6IGEpID09PSAoYi50b1VwcGVyQ2FzZSgpID09PSAnSU5CT1gnID8gJ0lOQk9YJyA6IGIpXG4gIH1cblxuICBjcmVhdGVMb2dnZXIgKGNyZWF0b3IgPSBjcmVhdGVEZWZhdWx0TG9nZ2VyKSB7XG4gICAgY29uc3QgbG9nZ2VyID0gY3JlYXRvcigodGhpcy5fYXV0aCB8fCB7fSkudXNlciB8fCAnJywgdGhpcy5faG9zdClcbiAgICB0aGlzLmxvZ2dlciA9IHRoaXMuY2xpZW50LmxvZ2dlciA9IHtcbiAgICAgIGRlYnVnOiAoLi4ubXNncykgPT4geyBpZiAoTE9HX0xFVkVMX0RFQlVHID49IHRoaXMubG9nTGV2ZWwpIHsgbG9nZ2VyLmRlYnVnKG1zZ3MpIH0gfSxcbiAgICAgIGluZm86ICguLi5tc2dzKSA9PiB7IGlmIChMT0dfTEVWRUxfSU5GTyA+PSB0aGlzLmxvZ0xldmVsKSB7IGxvZ2dlci5pbmZvKG1zZ3MpIH0gfSxcbiAgICAgIHdhcm46ICguLi5tc2dzKSA9PiB7IGlmIChMT0dfTEVWRUxfV0FSTiA+PSB0aGlzLmxvZ0xldmVsKSB7IGxvZ2dlci53YXJuKG1zZ3MpIH0gfSxcbiAgICAgIGVycm9yOiAoLi4ubXNncykgPT4geyBpZiAoTE9HX0xFVkVMX0VSUk9SID49IHRoaXMubG9nTGV2ZWwpIHsgbG9nZ2VyLmVycm9yKG1zZ3MpIH0gfVxuICAgIH1cbiAgfVxufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxNQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxXQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxjQUFBLEdBQUFGLE9BQUE7QUFRQSxJQUFBRyxlQUFBLEdBQUFILE9BQUE7QUFPQSxJQUFBSSxPQUFBLEdBQUFDLHNCQUFBLENBQUFMLE9BQUE7QUFDQSxJQUFBTSxLQUFBLEdBQUFELHNCQUFBLENBQUFMLE9BQUE7QUFDQSxJQUFBTyxPQUFBLEdBQUFQLE9BQUE7QUFRQSxJQUFBUSxXQUFBLEdBQUFSLE9BQUE7QUFFc0IsU0FBQUssdUJBQUFJLENBQUEsV0FBQUEsQ0FBQSxJQUFBQSxDQUFBLENBQUFDLFVBQUEsR0FBQUQsQ0FBQSxLQUFBRSxPQUFBLEVBQUFGLENBQUE7QUFBQSxTQUFBRyxtQkFBQUMsQ0FBQSxFQUFBQyxDQUFBLEVBQUFMLENBQUEsRUFBQU0sQ0FBQSxFQUFBQyxDQUFBLEVBQUFDLENBQUEsRUFBQUMsQ0FBQSxjQUFBQyxDQUFBLEdBQUFOLENBQUEsQ0FBQUksQ0FBQSxFQUFBQyxDQUFBLEdB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