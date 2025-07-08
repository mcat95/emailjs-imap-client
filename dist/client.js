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
          if (['Socket closed unexpectedly', 'Socket timed out'].some(txt => err.message.includes(txt))) throw err;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfcmFtZGEiLCJyZXF1aXJlIiwiX2VtYWlsanNVdGYiLCJfY29tbWFuZFBhcnNlciIsIl9jb21tYW5kQnVpbGRlciIsIl9sb2dnZXIiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2ltYXAiLCJfY29tbW9uIiwiX3NwZWNpYWxVc2UiLCJlIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJhc3luY0dlbmVyYXRvclN0ZXAiLCJuIiwidCIsInIiLCJvIiwiYSIsImMiLCJpIiwidSIsInZhbHVlIiwiZG9uZSIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsIl9hc3luY1RvR2VuZXJhdG9yIiwiYXJndW1lbnRzIiwiYXBwbHkiLCJfbmV4dCIsIl90aHJvdyIsIlRJTUVPVVRfQ09OTkVDVElPTiIsImV4cG9ydHMiLCJUSU1FT1VUX05PT1AiLCJUSU1FT1VUX0lETEUiLCJTVEFURV9DT05ORUNUSU5HIiwiU1RBVEVfTk9UX0FVVEhFTlRJQ0FURUQiLCJTVEFURV9BVVRIRU5USUNBVEVEIiwiU1RBVEVfU0VMRUNURUQiLCJTVEFURV9MT0dPVVQiLCJERUZBVUxUX0NMSUVOVF9JRCIsIm5hbWUiLCJDbGllbnQiLCJjb25zdHJ1Y3RvciIsImhvc3QiLCJwb3J0Iiwib3B0aW9ucyIsInRpbWVvdXRDb25uZWN0aW9uIiwidGltZW91dE5vb3AiLCJ0aW1lb3V0SWRsZSIsInNlcnZlcklkIiwib25jZXJ0Iiwib251cGRhdGUiLCJvbnNlbGVjdG1haWxib3giLCJvbmNsb3NlbWFpbGJveCIsIl9ob3N0IiwiX2NsaWVudElkIiwicHJvcE9yIiwiX3N0YXRlIiwiX2F1dGhlbnRpY2F0ZWQiLCJfY2FwYWJpbGl0eSIsIl9zZWxlY3RlZE1haWxib3giLCJfZW50ZXJlZElkbGUiLCJfaWRsZVRpbWVvdXQiLCJfZW5hYmxlQ29tcHJlc3Npb24iLCJlbmFibGVDb21wcmVzc2lvbiIsIl9hdXRoIiwiYXV0aCIsIl9yZXF1aXJlVExTIiwicmVxdWlyZVRMUyIsIl9pZ25vcmVUTFMiLCJpZ25vcmVUTFMiLCJfaWdub3JlSWRsZUNhcGFiaWxpdHkiLCJpZ25vcmVJZGxlQ2FwYWJpbGl0eSIsImNsaWVudCIsIkltYXBDbGllbnQiLCJvbmVycm9yIiwiX29uRXJyb3IiLCJiaW5kIiwiY2VydCIsIm9uaWRsZSIsIl9vbklkbGUiLCJzZXRIYW5kbGVyIiwicmVzcG9uc2UiLCJfdW50YWdnZWRDYXBhYmlsaXR5SGFuZGxlciIsIl91bnRhZ2dlZE9rSGFuZGxlciIsIl91bnRhZ2dlZEV4aXN0c0hhbmRsZXIiLCJfdW50YWdnZWRFeHB1bmdlSGFuZGxlciIsIl91bnRhZ2dlZEZldGNoSGFuZGxlciIsImNyZWF0ZUxvZ2dlciIsImxvZ0xldmVsIiwiTE9HX0xFVkVMX0FMTCIsImVyciIsImNsZWFyVGltZW91dCIsImNvbm5lY3QiLCJfdGhpcyIsIm9wZW5Db25uZWN0aW9uIiwidXBncmFkZUNvbm5lY3Rpb24iLCJ1cGRhdGVJZCIsInNvbWUiLCJ0eHQiLCJtZXNzYWdlIiwiaW5jbHVkZXMiLCJsb2dnZXIiLCJ3YXJuIiwibG9naW4iLCJjb21wcmVzc0Nvbm5lY3Rpb24iLCJkZWJ1ZyIsImVycm9yIiwiY2xvc2UiLCJyZWplY3QiLCJjb25uZWN0aW9uVGltZW91dCIsInNldFRpbWVvdXQiLCJFcnJvciIsIl9jaGFuZ2VTdGF0ZSIsIm9ucmVhZHkiLCJ1cGRhdGVDYXBhYmlsaXR5IiwiY2F0Y2giLCJsb2dvdXQiLCJfdGhpczIiLCJfdGhpczMiLCJpZCIsIl90aGlzNCIsImluZGV4T2YiLCJjb21tYW5kIiwiYXR0cmlidXRlcyIsImZsYXR0ZW4iLCJPYmplY3QiLCJlbnRyaWVzIiwiZXhlYyIsImxpc3QiLCJwYXRoT3IiLCJtYXAiLCJ2YWx1ZXMiLCJrZXlzIiwiZmlsdGVyIiwiXyIsImZyb21QYWlycyIsInppcCIsIl9zaG91bGRTZWxlY3RNYWlsYm94IiwicGF0aCIsImN0eCIsInByZXZpb3VzU2VsZWN0IiwiZ2V0UHJldmlvdXNseVF1ZXVlZCIsInJlcXVlc3QiLCJwYXRoQXR0cmlidXRlIiwiZmluZCIsImF0dHJpYnV0ZSIsInR5cGUiLCJzZWxlY3RNYWlsYm94IiwiX3giLCJfdGhpczUiLCJxdWVyeSIsInJlYWRPbmx5IiwiY29uZHN0b3JlIiwicHVzaCIsIm1haWxib3hJbmZvIiwicGFyc2VTRUxFQ1QiLCJzdWJzY3JpYmVNYWlsYm94IiwiX3RoaXM2IiwidW5zdWJzY3JpYmVNYWlsYm94IiwiX3RoaXM3IiwibGlzdE5hbWVzcGFjZXMiLCJfdGhpczgiLCJwYXJzZU5BTUVTUEFDRSIsImxpc3RNYWlsYm94ZXMiLCJfdGhpczkiLCJ0cmVlIiwicm9vdCIsImNoaWxkcmVuIiwibGlzdFJlc3BvbnNlIiwiZm9yRWFjaCIsIml0ZW0iLCJhdHRyIiwibGVuZ3RoIiwiZGVsaW0iLCJicmFuY2giLCJfZW5zdXJlUGF0aCIsImZsYWdzIiwibGlzdGVkIiwiY2hlY2tTcGVjaWFsVXNlIiwibHN1YlJlc3BvbnNlIiwibHN1YiIsImZsYWciLCJ1bmlvbiIsInN1YnNjcmliZWQiLCJjcmVhdGVNYWlsYm94IiwiX3RoaXMwIiwiY29kZSIsImRlbGV0ZU1haWxib3giLCJsaXN0TWVzc2FnZXMiLCJfeDIiLCJfeDMiLCJfdGhpczEiLCJzZXF1ZW5jZSIsIml0ZW1zIiwiZmFzdCIsImJ1aWxkRkVUQ0hDb21tYW5kIiwicHJlY2hlY2siLCJwYXJzZUZFVENIIiwic2VhcmNoIiwiX3g0IiwiX3g1IiwiX3RoaXMxMCIsImJ1aWxkU0VBUkNIQ29tbWFuZCIsInBhcnNlU0VBUkNIIiwic2V0RmxhZ3MiLCJrZXkiLCJBcnJheSIsImlzQXJyYXkiLCJjb25jYXQiLCJhZGQiLCJzZXQiLCJyZW1vdmUiLCJzdG9yZSIsIl94NiIsIl94NyIsIl94OCIsIl94OSIsIl90aGlzMTEiLCJhY3Rpb24iLCJidWlsZFNUT1JFQ29tbWFuZCIsInVwbG9hZCIsIl94MCIsIl94MSIsIl90aGlzMTIiLCJkZXN0aW5hdGlvbiIsInBhcnNlQVBQRU5EIiwiZGVsZXRlTWVzc2FnZXMiLCJfeDEwIiwiX3gxMSIsIl90aGlzMTMiLCJ1c2VVaWRQbHVzIiwiYnlVaWQiLCJ1aWRFeHB1bmdlQ29tbWFuZCIsImNtZCIsImNvcHlNZXNzYWdlcyIsIl94MTIiLCJfeDEzIiwiX3gxNCIsIl90aGlzMTQiLCJwYXJzZUNPUFkiLCJtb3ZlTWVzc2FnZXMiLCJfeDE1IiwiX3gxNiIsIl94MTciLCJfdGhpczE1IiwiX3RoaXMxNiIsImNvbXByZXNzZWQiLCJfdGhpczE3IiwieG9hdXRoMiIsImJ1aWxkWE9BdXRoMlRva2VuIiwidXNlciIsInNlbnNpdGl2ZSIsImVycm9yUmVzcG9uc2VFeHBlY3RzRW1wdHlMaW5lIiwiY2h1bmsiLCJCdWZmZXIiLCJmcm9tIiwicGFzcyIsInRvU3RyaW5nIiwiY2FwYWJpbGl0eSIsInBheWxvYWQiLCJDQVBBQklMSVRZIiwicG9wIiwiY2FwYSIsInRvVXBwZXJDYXNlIiwidHJpbSIsImFjY2VwdFVudGFnZ2VkIiwiX3RoaXMxOCIsImJyZWFrSWRsZSIsImVucXVldWVDb21tYW5kIiwiZW50ZXJJZGxlIiwic2VuZCIsIl90aGlzMTkiLCJzZWN1cmVNb2RlIiwidXBncmFkZSIsImZvcmNlZCIsIl90aGlzMjAiLCJoYXNDYXBhYmlsaXR5IiwicGlwZSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIm5yIiwiRkVUQ0giLCJzaGlmdCIsIm5ld1N0YXRlIiwiZGVsaW1pdGVyIiwibmFtZXMiLCJzcGxpdCIsImZvdW5kIiwiaiIsIl9jb21wYXJlTWFpbGJveE5hbWVzIiwiaW1hcERlY29kZSIsInNsaWNlIiwiam9pbiIsImIiLCJjcmVhdG9yIiwiY3JlYXRlRGVmYXVsdExvZ2dlciIsIm1zZ3MiLCJMT0dfTEVWRUxfREVCVUciLCJpbmZvIiwiTE9HX0xFVkVMX0lORk8iLCJMT0dfTEVWRUxfV0FSTiIsIkxPR19MRVZFTF9FUlJPUiJdLCJzb3VyY2VzIjpbIi4uL3NyYy9jbGllbnQuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgbWFwLCBwaXBlLCB1bmlvbiwgemlwLCBmcm9tUGFpcnMsIHByb3BPciwgcGF0aE9yLCBmbGF0dGVuIH0gZnJvbSAncmFtZGEnXG5pbXBvcnQgeyBpbWFwRGVjb2RlIH0gZnJvbSAnZW1haWxqcy11dGY3J1xuaW1wb3J0IHtcbiAgcGFyc2VBUFBFTkQsXG4gIHBhcnNlQ09QWSxcbiAgcGFyc2VOQU1FU1BBQ0UsXG4gIHBhcnNlU0VMRUNULFxuICBwYXJzZUZFVENILFxuICBwYXJzZVNFQVJDSFxufSBmcm9tICcuL2NvbW1hbmQtcGFyc2VyJ1xuaW1wb3J0IHtcbiAgYnVpbGRGRVRDSENvbW1hbmQsXG4gIGJ1aWxkWE9BdXRoMlRva2VuLFxuICBidWlsZFNFQVJDSENvbW1hbmQsXG4gIGJ1aWxkU1RPUkVDb21tYW5kXG59IGZyb20gJy4vY29tbWFuZC1idWlsZGVyJ1xuXG5pbXBvcnQgY3JlYXRlRGVmYXVsdExvZ2dlciBmcm9tICcuL2xvZ2dlcidcbmltcG9ydCBJbWFwQ2xpZW50IGZyb20gJy4vaW1hcCdcbmltcG9ydCB7XG4gIExPR19MRVZFTF9FUlJPUixcbiAgTE9HX0xFVkVMX1dBUk4sXG4gIExPR19MRVZFTF9JTkZPLFxuICBMT0dfTEVWRUxfREVCVUcsXG4gIExPR19MRVZFTF9BTExcbn0gZnJvbSAnLi9jb21tb24nXG5cbmltcG9ydCB7XG4gIGNoZWNrU3BlY2lhbFVzZVxufSBmcm9tICcuL3NwZWNpYWwtdXNlJ1xuXG5leHBvcnQgY29uc3QgVElNRU9VVF9DT05ORUNUSU9OID0gOTAgKiAxMDAwIC8vIE1pbGxpc2Vjb25kcyB0byB3YWl0IGZvciB0aGUgSU1BUCBncmVldGluZyBmcm9tIHRoZSBzZXJ2ZXJcbmV4cG9ydCBjb25zdCBUSU1FT1VUX05PT1AgPSA2MCAqIDEwMDAgLy8gTWlsbGlzZWNvbmRzIGJldHdlZW4gTk9PUCBjb21tYW5kcyB3aGlsZSBpZGxpbmdcbmV4cG9ydCBjb25zdCBUSU1FT1VUX0lETEUgPSA2MCAqIDEwMDAgLy8gTWlsbGlzZWNvbmRzIHVudGlsIElETEUgY29tbWFuZCBpcyBjYW5jZWxsZWRcblxuZXhwb3J0IGNvbnN0IFNUQVRFX0NPTk5FQ1RJTkcgPSAxXG5leHBvcnQgY29uc3QgU1RBVEVfTk9UX0FVVEhFTlRJQ0FURUQgPSAyXG5leHBvcnQgY29uc3QgU1RBVEVfQVVUSEVOVElDQVRFRCA9IDNcbmV4cG9ydCBjb25zdCBTVEFURV9TRUxFQ1RFRCA9IDRcbmV4cG9ydCBjb25zdCBTVEFURV9MT0dPVVQgPSA1XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0NMSUVOVF9JRCA9IHtcbiAgbmFtZTogJ2VtYWlsanMtaW1hcC1jbGllbnQnXG59XG5cbi8qKlxuICogZW1haWxqcyBJTUFQIGNsaWVudFxuICpcbiAqIEBjb25zdHJ1Y3RvclxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBbaG9zdD0nbG9jYWxob3N0J10gSG9zdG5hbWUgdG8gY29uZW5jdCB0b1xuICogQHBhcmFtIHtOdW1iZXJ9IFtwb3J0PTE0M10gUG9ydCBudW1iZXIgdG8gY29ubmVjdCB0b1xuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBPcHRpb25hbCBvcHRpb25zIG9iamVjdFxuICovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBDbGllbnQge1xuICBjb25zdHJ1Y3RvciAoaG9zdCwgcG9ydCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgdGhpcy50aW1lb3V0Q29ubmVjdGlvbiA9IFRJTUVPVVRfQ09OTkVDVElPTlxuICAgIHRoaXMudGltZW91dE5vb3AgPSBvcHRpb25zLnRpbWVvdXROb29wIHx8IFRJTUVPVVRfTk9PUFxuICAgIHRoaXMudGltZW91dElkbGUgPSBvcHRpb25zLnRpbWVvdXRJZGxlIHx8IFRJTUVPVVRfSURMRVxuXG4gICAgdGhpcy5zZXJ2ZXJJZCA9IGZhbHNlIC8vIFJGQyAyOTcxIFNlcnZlciBJRCBhcyBrZXkgdmFsdWUgcGFpcnNcblxuICAgIC8vIEV2ZW50IHBsYWNlaG9sZGVyc1xuICAgIHRoaXMub25jZXJ0ID0gbnVsbFxuICAgIHRoaXMub251cGRhdGUgPSBudWxsXG4gICAgdGhpcy5vbnNlbGVjdG1haWxib3ggPSBudWxsXG4gICAgdGhpcy5vbmNsb3NlbWFpbGJveCA9IG51bGxcblxuICAgIHRoaXMuX2hvc3QgPSBob3N0XG4gICAgdGhpcy5fY2xpZW50SWQgPSBwcm9wT3IoREVGQVVMVF9DTElFTlRfSUQsICdpZCcsIG9wdGlvbnMpXG4gICAgdGhpcy5fc3RhdGUgPSBmYWxzZSAvLyBDdXJyZW50IHN0YXRlXG4gICAgdGhpcy5fYXV0aGVudGljYXRlZCA9IGZhbHNlIC8vIElzIHRoZSBjb25uZWN0aW9uIGF1dGhlbnRpY2F0ZWRcbiAgICB0aGlzLl9jYXBhYmlsaXR5ID0gW10gLy8gTGlzdCBvZiBleHRlbnNpb25zIHRoZSBzZXJ2ZXIgc3VwcG9ydHNcbiAgICB0aGlzLl9zZWxlY3RlZE1haWxib3ggPSBmYWxzZSAvLyBTZWxlY3RlZCBtYWlsYm94XG4gICAgdGhpcy5fZW50ZXJlZElkbGUgPSBmYWxzZVxuICAgIHRoaXMuX2lkbGVUaW1lb3V0ID0gZmFsc2VcbiAgICB0aGlzLl9lbmFibGVDb21wcmVzc2lvbiA9ICEhb3B0aW9ucy5lbmFibGVDb21wcmVzc2lvblxuICAgIHRoaXMuX2F1dGggPSBvcHRpb25zLmF1dGhcbiAgICB0aGlzLl9yZXF1aXJlVExTID0gISFvcHRpb25zLnJlcXVpcmVUTFNcbiAgICB0aGlzLl9pZ25vcmVUTFMgPSAhIW9wdGlvbnMuaWdub3JlVExTXG4gICAgdGhpcy5faWdub3JlSWRsZUNhcGFiaWxpdHkgPSAhIW9wdGlvbnMuaWdub3JlSWRsZUNhcGFiaWxpdHlcblxuICAgIHRoaXMuY2xpZW50ID0gbmV3IEltYXBDbGllbnQoaG9zdCwgcG9ydCwgb3B0aW9ucykgLy8gSU1BUCBjbGllbnQgb2JqZWN0XG5cbiAgICAvLyBFdmVudCBIYW5kbGVyc1xuICAgIHRoaXMuY2xpZW50Lm9uZXJyb3IgPSB0aGlzLl9vbkVycm9yLmJpbmQodGhpcylcbiAgICB0aGlzLmNsaWVudC5vbmNlcnQgPSAoY2VydCkgPT4gKHRoaXMub25jZXJ0ICYmIHRoaXMub25jZXJ0KGNlcnQpKSAvLyBhbGxvd3MgY2VydGlmaWNhdGUgaGFuZGxpbmcgZm9yIHBsYXRmb3JtcyB3L28gbmF0aXZlIHRscyBzdXBwb3J0XG4gICAgdGhpcy5jbGllbnQub25pZGxlID0gKCkgPT4gdGhpcy5fb25JZGxlKCkgLy8gc3RhcnQgaWRsaW5nXG5cbiAgICAvLyBEZWZhdWx0IGhhbmRsZXJzIGZvciB1bnRhZ2dlZCByZXNwb25zZXNcbiAgICB0aGlzLmNsaWVudC5zZXRIYW5kbGVyKCdjYXBhYmlsaXR5JywgKHJlc3BvbnNlKSA9PiB0aGlzLl91bnRhZ2dlZENhcGFiaWxpdHlIYW5kbGVyKHJlc3BvbnNlKSkgLy8gY2FwYWJpbGl0eSB1cGRhdGVzXG4gICAgdGhpcy5jbGllbnQuc2V0SGFuZGxlcignb2snLCAocmVzcG9uc2UpID0+IHRoaXMuX3VudGFnZ2VkT2tIYW5kbGVyKHJlc3BvbnNlKSkgLy8gbm90aWZpY2F0aW9uc1xuICAgIHRoaXMuY2xpZW50LnNldEhhbmRsZXIoJ2V4aXN0cycsIChyZXNwb25zZSkgPT4gdGhpcy5fdW50YWdnZWRFeGlzdHNIYW5kbGVyKHJlc3BvbnNlKSkgLy8gbWVzc2FnZSBjb3VudCBoYXMgY2hhbmdlZFxuICAgIHRoaXMuY2xpZW50LnNldEhhbmRsZXIoJ2V4cHVuZ2UnLCAocmVzcG9uc2UpID0+IHRoaXMuX3VudGFnZ2VkRXhwdW5nZUhhbmRsZXIocmVzcG9uc2UpKSAvLyBtZXNzYWdlIGhhcyBiZWVuIGRlbGV0ZWRcbiAgICB0aGlzLmNsaWVudC5zZXRIYW5kbGVyKCdmZXRjaCcsIChyZXNwb25zZSkgPT4gdGhpcy5fdW50YWdnZWRGZXRjaEhhbmRsZXIocmVzcG9uc2UpKSAvLyBtZXNzYWdlIGhhcyBiZWVuIHVwZGF0ZWQgKGVnLiBmbGFnIGNoYW5nZSlcblxuICAgIC8vIEFjdGl2YXRlIGxvZ2dpbmdcbiAgICB0aGlzLmNyZWF0ZUxvZ2dlcigpXG4gICAgdGhpcy5sb2dMZXZlbCA9IHByb3BPcihMT0dfTEVWRUxfQUxMLCAnbG9nTGV2ZWwnLCBvcHRpb25zKVxuICB9XG5cbiAgLyoqXG4gICAqIENhbGxlZCBpZiB0aGUgbG93ZXItbGV2ZWwgSW1hcENsaWVudCBoYXMgZW5jb3VudGVyZWQgYW4gdW5yZWNvdmVyYWJsZVxuICAgKiBlcnJvciBkdXJpbmcgb3BlcmF0aW9uLiBDbGVhbnMgdXAgYW5kIHByb3BhZ2F0ZXMgdGhlIGVycm9yIHVwd2FyZHMuXG4gICAqL1xuICBfb25FcnJvciAoZXJyKSB7XG4gICAgLy8gbWFrZSBzdXJlIG5vIGlkbGUgdGltZW91dCBpcyBwZW5kaW5nIGFueW1vcmVcbiAgICBjbGVhclRpbWVvdXQodGhpcy5faWRsZVRpbWVvdXQpXG5cbiAgICAvLyBwcm9wYWdhdGUgdGhlIGVycm9yIHVwd2FyZHNcbiAgICB0aGlzLm9uZXJyb3IgJiYgdGhpcy5vbmVycm9yKGVycilcbiAgfVxuXG4gIC8vXG4gIC8vXG4gIC8vIFBVQkxJQyBBUElcbiAgLy9cbiAgLy9cblxuICAvKipcbiAgICogSW5pdGlhdGUgY29ubmVjdGlvbiBhbmQgbG9naW4gdG8gdGhlIElNQVAgc2VydmVyXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdoZW4gbG9naW4gcHJvY2VkdXJlIGlzIGNvbXBsZXRlXG4gICAqL1xuICBhc3luYyBjb25uZWN0ICgpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5vcGVuQ29ubmVjdGlvbigpXG4gICAgICBhd2FpdCB0aGlzLnVwZ3JhZGVDb25uZWN0aW9uKClcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMudXBkYXRlSWQodGhpcy5fY2xpZW50SWQpXG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgaWYgKFsnU29ja2V0IGNsb3NlZCB1bmV4cGVjdGVkbHknLCAnU29ja2V0IHRpbWVkIG91dCddLnNvbWUodHh0ID0+IGVyci5tZXNzYWdlLmluY2x1ZGVzKHR4dCkpKSB0aHJvdyBlcnJcbiAgICAgICAgdGhpcy5sb2dnZXIud2FybignRmFpbGVkIHRvIHVwZGF0ZSBzZXJ2ZXIgaWQhJywgZXJyLm1lc3NhZ2UpXG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMubG9naW4odGhpcy5fYXV0aClcbiAgICAgIGF3YWl0IHRoaXMuY29tcHJlc3NDb25uZWN0aW9uKClcbiAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDb25uZWN0aW9uIGVzdGFibGlzaGVkLCByZWFkeSB0byByb2xsIScpXG4gICAgICB0aGlzLmNsaWVudC5vbmVycm9yID0gdGhpcy5fb25FcnJvci5iaW5kKHRoaXMpXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICB0aGlzLmxvZ2dlci5lcnJvcignQ291bGQgbm90IGNvbm5lY3QgdG8gc2VydmVyJywgZXJyKVxuICAgICAgdGhpcy5jbG9zZShlcnIpIC8vIHdlIGRvbid0IHJlYWxseSBjYXJlIHdoZXRoZXIgdGhpcyB3b3JrcyBvciBub3RcbiAgICAgIHRocm93IGVyclxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBJbml0aWF0ZSBjb25uZWN0aW9uIHRvIHRoZSBJTUFQIHNlcnZlclxuICAgKlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gY2FwYWJpbGl0eSBvZiBzZXJ2ZXIgd2l0aG91dCBsb2dpblxuICAgKi9cbiAgb3BlbkNvbm5lY3Rpb24gKCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCBjb25uZWN0aW9uVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4gcmVqZWN0KG5ldyBFcnJvcignVGltZW91dCBjb25uZWN0aW5nIHRvIHNlcnZlcicpKSwgdGhpcy50aW1lb3V0Q29ubmVjdGlvbilcbiAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDb25uZWN0aW5nIHRvJywgdGhpcy5jbGllbnQuaG9zdCwgJzonLCB0aGlzLmNsaWVudC5wb3J0KVxuICAgICAgdGhpcy5fY2hhbmdlU3RhdGUoU1RBVEVfQ09OTkVDVElORylcbiAgICAgIHRoaXMuY2xpZW50LmNvbm5lY3QoKS50aGVuKCgpID0+IHtcbiAgICAgICAgdGhpcy5sb2dnZXIuZGVidWcoJ1NvY2tldCBvcGVuZWQsIHdhaXRpbmcgZm9yIGdyZWV0aW5nIGZyb20gdGhlIHNlcnZlci4uLicpXG5cbiAgICAgICAgdGhpcy5jbGllbnQub25yZWFkeSA9ICgpID0+IHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQoY29ubmVjdGlvblRpbWVvdXQpXG4gICAgICAgICAgdGhpcy5fY2hhbmdlU3RhdGUoU1RBVEVfTk9UX0FVVEhFTlRJQ0FURUQpXG4gICAgICAgICAgdGhpcy51cGRhdGVDYXBhYmlsaXR5KClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHJlc29sdmUodGhpcy5fY2FwYWJpbGl0eSkpXG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmNsaWVudC5vbmVycm9yID0gKGVycikgPT4ge1xuICAgICAgICAgIGNsZWFyVGltZW91dChjb25uZWN0aW9uVGltZW91dClcbiAgICAgICAgICByZWplY3QoZXJyKVxuICAgICAgICB9XG4gICAgICB9KS5jYXRjaChyZWplY3QpXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBMb2dvdXRcbiAgICpcbiAgICogU2VuZCBMT0dPVVQsIHRvIHdoaWNoIHRoZSBzZXJ2ZXIgcmVzcG9uZHMgYnkgY2xvc2luZyB0aGUgY29ubmVjdGlvbi5cbiAgICogVXNlIGlzIGRpc2NvdXJhZ2VkIGlmIG5ldHdvcmsgc3RhdHVzIGlzIHVuY2xlYXIhIElmIG5ldHdvcmtzIHN0YXR1cyBpc1xuICAgKiB1bmNsZWFyLCBwbGVhc2UgdXNlICNjbG9zZSBpbnN0ZWFkIVxuICAgKlxuICAgKiBMT0dPVVQgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMS4zXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBSZXNvbHZlcyB3aGVuIHNlcnZlciBoYXMgY2xvc2VkIHRoZSBjb25uZWN0aW9uXG4gICAqL1xuICBhc3luYyBsb2dvdXQgKCkge1xuICAgIHRoaXMuX2NoYW5nZVN0YXRlKFNUQVRFX0xPR09VVClcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnTG9nZ2luZyBvdXQuLi4nKVxuICAgIGF3YWl0IHRoaXMuY2xpZW50LmxvZ291dCgpXG4gICAgY2xlYXJUaW1lb3V0KHRoaXMuX2lkbGVUaW1lb3V0KVxuICB9XG5cbiAgLyoqXG4gICAqIEZvcmNlLWNsb3NlcyB0aGUgY3VycmVudCBjb25uZWN0aW9uIGJ5IGNsb3NpbmcgdGhlIFRDUCBzb2NrZXQuXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBSZXNvbHZlcyB3aGVuIHNvY2tldCBpcyBjbG9zZWRcbiAgICovXG4gIGFzeW5jIGNsb3NlIChlcnIpIHtcbiAgICB0aGlzLl9jaGFuZ2VTdGF0ZShTVEFURV9MT0dPVVQpXG4gICAgY2xlYXJUaW1lb3V0KHRoaXMuX2lkbGVUaW1lb3V0KVxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDbG9zaW5nIGNvbm5lY3Rpb24uLi4nKVxuICAgIGF3YWl0IHRoaXMuY2xpZW50LmNsb3NlKGVycilcbiAgICBjbGVhclRpbWVvdXQodGhpcy5faWRsZVRpbWVvdXQpXG4gIH1cblxuICAvKipcbiAgICogUnVucyBJRCBjb21tYW5kLCBwYXJzZXMgSUQgcmVzcG9uc2UsIHNldHMgdGhpcy5zZXJ2ZXJJZFxuICAgKlxuICAgKiBJRCBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzI5NzFcbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IGlkIElEIGFzIEpTT04gb2JqZWN0LiBTZWUgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMjk3MSNzZWN0aW9uLTMuMyBmb3IgcG9zc2libGUgdmFsdWVzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBSZXNvbHZlcyB3aGVuIHJlc3BvbnNlIGhhcyBiZWVuIHBhcnNlZFxuICAgKi9cbiAgYXN5bmMgdXBkYXRlSWQgKGlkKSB7XG4gICAgaWYgKHRoaXMuX2NhcGFiaWxpdHkuaW5kZXhPZignSUQnKSA8IDApIHJldHVyblxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ1VwZGF0aW5nIGlkLi4uJylcblxuICAgIGNvbnN0IGNvbW1hbmQgPSAnSUQnXG4gICAgY29uc3QgYXR0cmlidXRlcyA9IGlkID8gW2ZsYXR0ZW4oT2JqZWN0LmVudHJpZXMoaWQpKV0gOiBbbnVsbF1cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyh7IGNvbW1hbmQsIGF0dHJpYnV0ZXMgfSwgJ0lEJylcbiAgICBjb25zdCBsaXN0ID0gZmxhdHRlbihwYXRoT3IoW10sIFsncGF5bG9hZCcsICdJRCcsICcwJywgJ2F0dHJpYnV0ZXMnLCAnMCddLCByZXNwb25zZSkubWFwKE9iamVjdC52YWx1ZXMpKVxuICAgIGNvbnN0IGtleXMgPSBsaXN0LmZpbHRlcigoXywgaSkgPT4gaSAlIDIgPT09IDApXG4gICAgY29uc3QgdmFsdWVzID0gbGlzdC5maWx0ZXIoKF8sIGkpID0+IGkgJSAyID09PSAxKVxuICAgIHRoaXMuc2VydmVySWQgPSBmcm9tUGFpcnMoemlwKGtleXMsIHZhbHVlcykpXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ1NlcnZlciBpZCB1cGRhdGVkIScsIHRoaXMuc2VydmVySWQpXG4gIH1cblxuICBfc2hvdWxkU2VsZWN0TWFpbGJveCAocGF0aCwgY3R4KSB7XG4gICAgaWYgKCFjdHgpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgY29uc3QgcHJldmlvdXNTZWxlY3QgPSB0aGlzLmNsaWVudC5nZXRQcmV2aW91c2x5UXVldWVkKFsnU0VMRUNUJywgJ0VYQU1JTkUnXSwgY3R4KVxuICAgIGlmIChwcmV2aW91c1NlbGVjdCAmJiBwcmV2aW91c1NlbGVjdC5yZXF1ZXN0LmF0dHJpYnV0ZXMpIHtcbiAgICAgIGNvbnN0IHBhdGhBdHRyaWJ1dGUgPSBwcmV2aW91c1NlbGVjdC5yZXF1ZXN0LmF0dHJpYnV0ZXMuZmluZCgoYXR0cmlidXRlKSA9PiBhdHRyaWJ1dGUudHlwZSA9PT0gJ1NUUklORycpXG4gICAgICBpZiAocGF0aEF0dHJpYnV0ZSkge1xuICAgICAgICByZXR1cm4gcGF0aEF0dHJpYnV0ZS52YWx1ZSAhPT0gcGF0aFxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9zZWxlY3RlZE1haWxib3ggIT09IHBhdGhcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIFNFTEVDVCBvciBFWEFNSU5FIHRvIG9wZW4gYSBtYWlsYm94XG4gICAqXG4gICAqIFNFTEVDVCBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjMuMVxuICAgKiBFWEFNSU5FIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMy4yXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIEZ1bGwgcGF0aCB0byBtYWlsYm94XG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gT3B0aW9ucyBvYmplY3RcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2Ugd2l0aCBpbmZvcm1hdGlvbiBhYm91dCB0aGUgc2VsZWN0ZWQgbWFpbGJveFxuICAgKi9cbiAgYXN5bmMgc2VsZWN0TWFpbGJveCAocGF0aCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgY29uc3QgcXVlcnkgPSB7XG4gICAgICBjb21tYW5kOiBvcHRpb25zLnJlYWRPbmx5ID8gJ0VYQU1JTkUnIDogJ1NFTEVDVCcsXG4gICAgICBhdHRyaWJ1dGVzOiBbeyB0eXBlOiAnU1RSSU5HJywgdmFsdWU6IHBhdGggfV1cbiAgICB9XG5cbiAgICBpZiAob3B0aW9ucy5jb25kc3RvcmUgJiYgdGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdDT05EU1RPUkUnKSA+PSAwKSB7XG4gICAgICBxdWVyeS5hdHRyaWJ1dGVzLnB1c2goW3sgdHlwZTogJ0FUT00nLCB2YWx1ZTogJ0NPTkRTVE9SRScgfV0pXG4gICAgfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ09wZW5pbmcnLCBwYXRoLCAnLi4uJylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyhxdWVyeSwgWydFWElTVFMnLCAnRkxBR1MnLCAnT0snXSwgeyBjdHg6IG9wdGlvbnMuY3R4IH0pXG4gICAgY29uc3QgbWFpbGJveEluZm8gPSBwYXJzZVNFTEVDVChyZXNwb25zZSlcblxuICAgIHRoaXMuX2NoYW5nZVN0YXRlKFNUQVRFX1NFTEVDVEVEKVxuXG4gICAgaWYgKHRoaXMuX3NlbGVjdGVkTWFpbGJveCAhPT0gcGF0aCAmJiB0aGlzLm9uY2xvc2VtYWlsYm94KSB7XG4gICAgICBhd2FpdCB0aGlzLm9uY2xvc2VtYWlsYm94KHRoaXMuX3NlbGVjdGVkTWFpbGJveClcbiAgICB9XG4gICAgdGhpcy5fc2VsZWN0ZWRNYWlsYm94ID0gcGF0aFxuICAgIGlmICh0aGlzLm9uc2VsZWN0bWFpbGJveCkge1xuICAgICAgYXdhaXQgdGhpcy5vbnNlbGVjdG1haWxib3gocGF0aCwgbWFpbGJveEluZm8pXG4gICAgfVxuXG4gICAgcmV0dXJuIG1haWxib3hJbmZvXG4gIH1cblxuICAvKipcbiAgICogU3Vic2NyaWJlIHRvIGEgbWFpbGJveCB3aXRoIHRoZSBnaXZlbiBwYXRoXG4gICAqXG4gICAqIFNVQlNDUklCRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjZcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogICAgIFRoZSBwYXRoIG9mIHRoZSBtYWlsYm94IHlvdSB3b3VsZCBsaWtlIHRvIHN1YnNjcmliZSB0by5cbiAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAqICAgICBQcm9taXNlIHJlc29sdmVzIGlmIG1haWxib3ggaXMgbm93IHN1YnNjcmliZWQgdG8gb3Igd2FzIHNvIGFscmVhZHkuXG4gICAqL1xuICBhc3luYyBzdWJzY3JpYmVNYWlsYm94IChwYXRoKSB7XG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ1N1YnNjcmliaW5nIHRvIG1haWxib3gnLCBwYXRoLCAnLi4uJylcbiAgICByZXR1cm4gdGhpcy5leGVjKHsgY29tbWFuZDogJ1NVQlNDUklCRScsIGF0dHJpYnV0ZXM6IFtwYXRoXSB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFVuc3Vic2NyaWJlIGZyb20gYSBtYWlsYm94IHdpdGggdGhlIGdpdmVuIHBhdGhcbiAgICpcbiAgICogVU5TVUJTQ1JJQkUgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMy43XG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoXG4gICAqICAgICBUaGUgcGF0aCBvZiB0aGUgbWFpbGJveCB5b3Ugd291bGQgbGlrZSB0byB1bnN1YnNjcmliZSBmcm9tLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICogICAgIFByb21pc2UgcmVzb2x2ZXMgaWYgbWFpbGJveCBpcyBubyBsb25nZXIgc3Vic2NyaWJlZCB0byBvciB3YXMgbm90IGJlZm9yZS5cbiAgICovXG4gIGFzeW5jIHVuc3Vic2NyaWJlTWFpbGJveCAocGF0aCkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdVbnN1YnNjcmliaW5nIHRvIG1haWxib3gnLCBwYXRoLCAnLi4uJylcbiAgICByZXR1cm4gdGhpcy5leGVjKHsgY29tbWFuZDogJ1VOU1VCU0NSSUJFJywgYXR0cmlidXRlczogW3BhdGhdIH0pXG4gIH1cblxuICAvKipcbiAgICogUnVucyBOQU1FU1BBQ0UgY29tbWFuZFxuICAgKlxuICAgKiBOQU1FU1BBQ0UgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMjM0MlxuICAgKlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIG5hbWVzcGFjZSBvYmplY3RcbiAgICovXG4gIGFzeW5jIGxpc3ROYW1lc3BhY2VzICgpIHtcbiAgICBpZiAodGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdOQU1FU1BBQ0UnKSA8IDApIHJldHVybiBmYWxzZVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0xpc3RpbmcgbmFtZXNwYWNlcy4uLicpXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmV4ZWMoJ05BTUVTUEFDRScsICdOQU1FU1BBQ0UnKVxuICAgIHJldHVybiBwYXJzZU5BTUVTUEFDRShyZXNwb25zZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIExJU1QgYW5kIExTVUIgY29tbWFuZHMuIFJldHJpZXZlcyBhIHRyZWUgb2YgYXZhaWxhYmxlIG1haWxib3hlc1xuICAgKlxuICAgKiBMSVNUIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMy44XG4gICAqIExTVUIgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjlcbiAgICpcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2Ugd2l0aCBsaXN0IG9mIG1haWxib3hlc1xuICAgKi9cbiAgYXN5bmMgbGlzdE1haWxib3hlcyAoKSB7XG4gICAgY29uc3QgdHJlZSA9IHsgcm9vdDogdHJ1ZSwgY2hpbGRyZW46IFtdIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdMaXN0aW5nIG1haWxib3hlcy4uLicpXG4gICAgY29uc3QgbGlzdFJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKHsgY29tbWFuZDogJ0xJU1QnLCBhdHRyaWJ1dGVzOiBbJycsICcqJ10gfSwgJ0xJU1QnKVxuICAgIGNvbnN0IGxpc3QgPSBwYXRoT3IoW10sIFsncGF5bG9hZCcsICdMSVNUJ10sIGxpc3RSZXNwb25zZSlcbiAgICBsaXN0LmZvckVhY2goaXRlbSA9PiB7XG4gICAgICBjb25zdCBhdHRyID0gcHJvcE9yKFtdLCAnYXR0cmlidXRlcycsIGl0ZW0pXG4gICAgICBpZiAoYXR0ci5sZW5ndGggPCAzKSByZXR1cm5cblxuICAgICAgY29uc3QgcGF0aCA9IHBhdGhPcignJywgWycyJywgJ3ZhbHVlJ10sIGF0dHIpXG4gICAgICBjb25zdCBkZWxpbSA9IHBhdGhPcignLycsIFsnMScsICd2YWx1ZSddLCBhdHRyKVxuICAgICAgY29uc3QgYnJhbmNoID0gdGhpcy5fZW5zdXJlUGF0aCh0cmVlLCBwYXRoLCBkZWxpbSlcbiAgICAgIGJyYW5jaC5mbGFncyA9IHByb3BPcihbXSwgJzAnLCBhdHRyKS5tYXAoKHsgdmFsdWUgfSkgPT4gdmFsdWUgfHwgJycpXG4gICAgICBicmFuY2gubGlzdGVkID0gdHJ1ZVxuICAgICAgY2hlY2tTcGVjaWFsVXNlKGJyYW5jaClcbiAgICB9KVxuXG4gICAgY29uc3QgbHN1YlJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKHsgY29tbWFuZDogJ0xTVUInLCBhdHRyaWJ1dGVzOiBbJycsICcqJ10gfSwgJ0xTVUInKS5jYXRjaChlcnIgPT4ge1xuICAgICAgdGhpcy5sb2dnZXIud2FybignTFNVQiBjb21tYW5kIGZhaWxlZDogJywgZXJyKVxuICAgICAgcmV0dXJuIG51bGxcbiAgICB9KVxuICAgIGNvbnN0IGxzdWIgPSBwYXRoT3IoW10sIFsncGF5bG9hZCcsICdMU1VCJ10sIGxzdWJSZXNwb25zZSlcbiAgICBsc3ViLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICAgIGNvbnN0IGF0dHIgPSBwcm9wT3IoW10sICdhdHRyaWJ1dGVzJywgaXRlbSlcbiAgICAgIGlmIChhdHRyLmxlbmd0aCA8IDMpIHJldHVyblxuXG4gICAgICBjb25zdCBwYXRoID0gcGF0aE9yKCcnLCBbJzInLCAndmFsdWUnXSwgYXR0cilcbiAgICAgIGNvbnN0IGRlbGltID0gcGF0aE9yKCcvJywgWycxJywgJ3ZhbHVlJ10sIGF0dHIpXG4gICAgICBjb25zdCBicmFuY2ggPSB0aGlzLl9lbnN1cmVQYXRoKHRyZWUsIHBhdGgsIGRlbGltKVxuICAgICAgcHJvcE9yKFtdLCAnMCcsIGF0dHIpLm1hcCgoZmxhZyA9ICcnKSA9PiB7IGJyYW5jaC5mbGFncyA9IHVuaW9uKGJyYW5jaC5mbGFncywgW2ZsYWddKSB9KVxuICAgICAgYnJhbmNoLnN1YnNjcmliZWQgPSB0cnVlXG4gICAgfSlcblxuICAgIHJldHVybiB0cmVlXG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgbWFpbGJveCB3aXRoIHRoZSBnaXZlbiBwYXRoLlxuICAgKlxuICAgKiBDUkVBVEUgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjNcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogICAgIFRoZSBwYXRoIG9mIHRoZSBtYWlsYm94IHlvdSB3b3VsZCBsaWtlIHRvIGNyZWF0ZS5cbiAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAqICAgICBQcm9taXNlIHJlc29sdmVzIGlmIG1haWxib3ggd2FzIGNyZWF0ZWQuXG4gICAqICAgICBJbiB0aGUgZXZlbnQgdGhlIHNlcnZlciBzYXlzIE5PIFtBTFJFQURZRVhJU1RTXSwgd2UgdHJlYXQgdGhhdCBhcyBzdWNjZXNzLlxuICAgKi9cbiAgYXN5bmMgY3JlYXRlTWFpbGJveCAocGF0aCkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDcmVhdGluZyBtYWlsYm94JywgcGF0aCwgJy4uLicpXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuZXhlYyh7IGNvbW1hbmQ6ICdDUkVBVEUnLCBhdHRyaWJ1dGVzOiBbcGF0aF0gfSlcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGlmIChlcnIgJiYgZXJyLmNvZGUgPT09ICdBTFJFQURZRVhJU1RTJykge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHRocm93IGVyclxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBEZWxldGUgYSBtYWlsYm94IHdpdGggdGhlIGdpdmVuIHBhdGguXG4gICAqXG4gICAqIERFTEVURSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjRcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogICAgIFRoZSBwYXRoIG9mIHRoZSBtYWlsYm94IHlvdSB3b3VsZCBsaWtlIHRvIGRlbGV0ZS5cbiAgICogQHJldHVybnMge1Byb21pc2V9XG4gICAqICAgICBQcm9taXNlIHJlc29sdmVzIGlmIG1haWxib3ggd2FzIGRlbGV0ZWQuXG4gICAqL1xuICBkZWxldGVNYWlsYm94IChwYXRoKSB7XG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0RlbGV0aW5nIG1haWxib3gnLCBwYXRoLCAnLi4uJylcbiAgICByZXR1cm4gdGhpcy5leGVjKHsgY29tbWFuZDogJ0RFTEVURScsIGF0dHJpYnV0ZXM6IFtwYXRoXSB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgRkVUQ0ggY29tbWFuZFxuICAgKlxuICAgKiBGRVRDSCBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjQuNVxuICAgKiBDSEFOR0VEU0lOQ0UgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNDU1MSNzZWN0aW9uLTMuM1xuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBmb3IgdGhlIG1haWxib3ggd2hpY2ggc2hvdWxkIGJlIHNlbGVjdGVkIGZvciB0aGUgY29tbWFuZC4gU2VsZWN0cyBtYWlsYm94IGlmIG5lY2Vzc2FyeVxuICAgKiBAcGFyYW0ge1N0cmluZ30gc2VxdWVuY2UgU2VxdWVuY2Ugc2V0LCBlZyAxOiogZm9yIGFsbCBtZXNzYWdlc1xuICAgKiBAcGFyYW0ge09iamVjdH0gW2l0ZW1zXSBNZXNzYWdlIGRhdGEgaXRlbSBuYW1lcyBvciBtYWNyb1xuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIHRoZSBmZXRjaGVkIG1lc3NhZ2UgaW5mb1xuICAgKi9cbiAgYXN5bmMgbGlzdE1lc3NhZ2VzIChwYXRoLCBzZXF1ZW5jZSwgaXRlbXMgPSBbeyBmYXN0OiB0cnVlIH1dLCBvcHRpb25zID0ge30pIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnRmV0Y2hpbmcgbWVzc2FnZXMnLCBzZXF1ZW5jZSwgJ2Zyb20nLCBwYXRoLCAnLi4uJylcbiAgICBjb25zdCBjb21tYW5kID0gYnVpbGRGRVRDSENvbW1hbmQoc2VxdWVuY2UsIGl0ZW1zLCBvcHRpb25zKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKGNvbW1hbmQsICdGRVRDSCcsIHtcbiAgICAgIHByZWNoZWNrOiAoY3R4KSA9PiB0aGlzLl9zaG91bGRTZWxlY3RNYWlsYm94KHBhdGgsIGN0eCkgPyB0aGlzLnNlbGVjdE1haWxib3gocGF0aCwgeyBjdHggfSkgOiBQcm9taXNlLnJlc29sdmUoKVxuICAgIH0pXG4gICAgcmV0dXJuIHBhcnNlRkVUQ0gocmVzcG9uc2UpXG4gIH1cblxuICAvKipcbiAgICogUnVucyBTRUFSQ0ggY29tbWFuZFxuICAgKlxuICAgKiBTRUFSQ0ggZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi40LjRcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtPYmplY3R9IHF1ZXJ5IFNlYXJjaCB0ZXJtc1xuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIHRoZSBhcnJheSBvZiBtYXRjaGluZyBzZXEuIG9yIHVpZCBudW1iZXJzXG4gICAqL1xuICBhc3luYyBzZWFyY2ggKHBhdGgsIHF1ZXJ5LCBvcHRpb25zID0ge30pIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnU2VhcmNoaW5nIGluJywgcGF0aCwgJy4uLicpXG4gICAgY29uc3QgY29tbWFuZCA9IGJ1aWxkU0VBUkNIQ29tbWFuZChxdWVyeSwgb3B0aW9ucylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyhjb21tYW5kLCAnU0VBUkNIJywge1xuICAgICAgcHJlY2hlY2s6IChjdHgpID0+IHRoaXMuX3Nob3VsZFNlbGVjdE1haWxib3gocGF0aCwgY3R4KSA/IHRoaXMuc2VsZWN0TWFpbGJveChwYXRoLCB7IGN0eCB9KSA6IFByb21pc2UucmVzb2x2ZSgpXG4gICAgfSlcbiAgICByZXR1cm4gcGFyc2VTRUFSQ0gocmVzcG9uc2UpXG4gIH1cblxuICAvKipcbiAgICogUnVucyBTVE9SRSBjb21tYW5kXG4gICAqXG4gICAqIFNUT1JFIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuNC42XG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIGZvciB0aGUgbWFpbGJveCB3aGljaCBzaG91bGQgYmUgc2VsZWN0ZWQgZm9yIHRoZSBjb21tYW5kLiBTZWxlY3RzIG1haWxib3ggaWYgbmVjZXNzYXJ5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzZXF1ZW5jZSBNZXNzYWdlIHNlbGVjdG9yIHdoaWNoIHRoZSBmbGFnIGNoYW5nZSBpcyBhcHBsaWVkIHRvXG4gICAqIEBwYXJhbSB7QXJyYXl9IGZsYWdzXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gUXVlcnkgbW9kaWZpZXJzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggdGhlIGFycmF5IG9mIG1hdGNoaW5nIHNlcS4gb3IgdWlkIG51bWJlcnNcbiAgICovXG4gIHNldEZsYWdzIChwYXRoLCBzZXF1ZW5jZSwgZmxhZ3MsIG9wdGlvbnMpIHtcbiAgICBsZXQga2V5ID0gJydcbiAgICBsZXQgbGlzdCA9IFtdXG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShmbGFncykgfHwgdHlwZW9mIGZsYWdzICE9PSAnb2JqZWN0Jykge1xuICAgICAgbGlzdCA9IFtdLmNvbmNhdChmbGFncyB8fCBbXSlcbiAgICAgIGtleSA9ICcnXG4gICAgfSBlbHNlIGlmIChmbGFncy5hZGQpIHtcbiAgICAgIGxpc3QgPSBbXS5jb25jYXQoZmxhZ3MuYWRkIHx8IFtdKVxuICAgICAga2V5ID0gJysnXG4gICAgfSBlbHNlIGlmIChmbGFncy5zZXQpIHtcbiAgICAgIGtleSA9ICcnXG4gICAgICBsaXN0ID0gW10uY29uY2F0KGZsYWdzLnNldCB8fCBbXSlcbiAgICB9IGVsc2UgaWYgKGZsYWdzLnJlbW92ZSkge1xuICAgICAga2V5ID0gJy0nXG4gICAgICBsaXN0ID0gW10uY29uY2F0KGZsYWdzLnJlbW92ZSB8fCBbXSlcbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnU2V0dGluZyBmbGFncyBvbicsIHNlcXVlbmNlLCAnaW4nLCBwYXRoLCAnLi4uJylcbiAgICByZXR1cm4gdGhpcy5zdG9yZShwYXRoLCBzZXF1ZW5jZSwga2V5ICsgJ0ZMQUdTJywgbGlzdCwgb3B0aW9ucylcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIFNUT1JFIGNvbW1hbmRcbiAgICpcbiAgICogU1RPUkUgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi40LjZcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHNlcXVlbmNlIE1lc3NhZ2Ugc2VsZWN0b3Igd2hpY2ggdGhlIGZsYWcgY2hhbmdlIGlzIGFwcGxpZWQgdG9cbiAgICogQHBhcmFtIHtTdHJpbmd9IGFjdGlvbiBTVE9SRSBtZXRob2QgdG8gY2FsbCwgZWcgXCIrRkxBR1NcIlxuICAgKiBAcGFyYW0ge0FycmF5fSBmbGFnc1xuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIHRoZSBhcnJheSBvZiBtYXRjaGluZyBzZXEuIG9yIHVpZCBudW1iZXJzXG4gICAqL1xuICBhc3luYyBzdG9yZSAocGF0aCwgc2VxdWVuY2UsIGFjdGlvbiwgZmxhZ3MsIG9wdGlvbnMgPSB7fSkge1xuICAgIGNvbnN0IGNvbW1hbmQgPSBidWlsZFNUT1JFQ29tbWFuZChzZXF1ZW5jZSwgYWN0aW9uLCBmbGFncywgb3B0aW9ucylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyhjb21tYW5kLCAnRkVUQ0gnLCB7XG4gICAgICBwcmVjaGVjazogKGN0eCkgPT4gdGhpcy5fc2hvdWxkU2VsZWN0TWFpbGJveChwYXRoLCBjdHgpID8gdGhpcy5zZWxlY3RNYWlsYm94KHBhdGgsIHsgY3R4IH0pIDogUHJvbWlzZS5yZXNvbHZlKClcbiAgICB9KVxuICAgIHJldHVybiBwYXJzZUZFVENIKHJlc3BvbnNlKVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgQVBQRU5EIGNvbW1hbmRcbiAgICpcbiAgICogQVBQRU5EIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMy4xMVxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gZGVzdGluYXRpb24gVGhlIG1haWxib3ggd2hlcmUgdG8gYXBwZW5kIHRoZSBtZXNzYWdlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIFRoZSBtZXNzYWdlIHRvIGFwcGVuZFxuICAgKiBAcGFyYW0ge0FycmF5fSBvcHRpb25zLmZsYWdzIEFueSBmbGFncyB5b3Ugd2FudCB0byBzZXQgb24gdGhlIHVwbG9hZGVkIG1lc3NhZ2UuIERlZmF1bHRzIHRvIFtcXFNlZW5dLiAob3B0aW9uYWwpXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggdGhlIGFycmF5IG9mIG1hdGNoaW5nIHNlcS4gb3IgdWlkIG51bWJlcnNcbiAgICovXG4gIGFzeW5jIHVwbG9hZCAoZGVzdGluYXRpb24sIG1lc3NhZ2UsIG9wdGlvbnMgPSB7fSkge1xuICAgIGNvbnN0IGZsYWdzID0gcHJvcE9yKFsnXFxcXFNlZW4nXSwgJ2ZsYWdzJywgb3B0aW9ucykubWFwKHZhbHVlID0+ICh7IHR5cGU6ICdhdG9tJywgdmFsdWUgfSkpXG4gICAgY29uc3QgY29tbWFuZCA9IHtcbiAgICAgIGNvbW1hbmQ6ICdBUFBFTkQnLFxuICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICB7IHR5cGU6ICdhdG9tJywgdmFsdWU6IGRlc3RpbmF0aW9uIH0sXG4gICAgICAgIGZsYWdzLFxuICAgICAgICB7IHR5cGU6ICdsaXRlcmFsJywgdmFsdWU6IG1lc3NhZ2UgfVxuICAgICAgXVxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdVcGxvYWRpbmcgbWVzc2FnZSB0bycsIGRlc3RpbmF0aW9uLCAnLi4uJylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyhjb21tYW5kKVxuICAgIHJldHVybiBwYXJzZUFQUEVORChyZXNwb25zZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBEZWxldGVzIG1lc3NhZ2VzIGZyb20gYSBzZWxlY3RlZCBtYWlsYm94XG4gICAqXG4gICAqIEVYUFVOR0UgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi40LjNcbiAgICogVUlEIEVYUFVOR0UgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNDMxNSNzZWN0aW9uLTIuMVxuICAgKlxuICAgKiBJZiBwb3NzaWJsZSAoYnlVaWQ6dHJ1ZSBhbmQgVUlEUExVUyBleHRlbnNpb24gc3VwcG9ydGVkKSwgdXNlcyBVSUQgRVhQVU5HRVxuICAgKiBjb21tYW5kIHRvIGRlbGV0ZSBhIHJhbmdlIG9mIG1lc3NhZ2VzLCBvdGhlcndpc2UgZmFsbHMgYmFjayB0byBFWFBVTkdFLlxuICAgKlxuICAgKiBOQiEgVGhpcyBtZXRob2QgbWlnaHQgYmUgZGVzdHJ1Y3RpdmUgLSBpZiBFWFBVTkdFIGlzIHVzZWQsIHRoZW4gYW55IG1lc3NhZ2VzXG4gICAqIHdpdGggXFxEZWxldGVkIGZsYWcgc2V0IGFyZSBkZWxldGVkXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIGZvciB0aGUgbWFpbGJveCB3aGljaCBzaG91bGQgYmUgc2VsZWN0ZWQgZm9yIHRoZSBjb21tYW5kLiBTZWxlY3RzIG1haWxib3ggaWYgbmVjZXNzYXJ5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzZXF1ZW5jZSBNZXNzYWdlIHJhbmdlIHRvIGJlIGRlbGV0ZWRcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBRdWVyeSBtb2RpZmllcnNcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2VcbiAgICovXG4gIGFzeW5jIGRlbGV0ZU1lc3NhZ2VzIChwYXRoLCBzZXF1ZW5jZSwgb3B0aW9ucyA9IHt9KSB7XG4gICAgLy8gYWRkIFxcRGVsZXRlZCBmbGFnIHRvIHRoZSBtZXNzYWdlcyBhbmQgcnVuIEVYUFVOR0Ugb3IgVUlEIEVYUFVOR0VcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnRGVsZXRpbmcgbWVzc2FnZXMnLCBzZXF1ZW5jZSwgJ2luJywgcGF0aCwgJy4uLicpXG4gICAgY29uc3QgdXNlVWlkUGx1cyA9IG9wdGlvbnMuYnlVaWQgJiYgdGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdVSURQTFVTJykgPj0gMFxuICAgIGNvbnN0IHVpZEV4cHVuZ2VDb21tYW5kID0geyBjb21tYW5kOiAnVUlEIEVYUFVOR0UnLCBhdHRyaWJ1dGVzOiBbeyB0eXBlOiAnc2VxdWVuY2UnLCB2YWx1ZTogc2VxdWVuY2UgfV0gfVxuICAgIGF3YWl0IHRoaXMuc2V0RmxhZ3MocGF0aCwgc2VxdWVuY2UsIHsgYWRkOiAnXFxcXERlbGV0ZWQnIH0sIG9wdGlvbnMpXG4gICAgY29uc3QgY21kID0gdXNlVWlkUGx1cyA/IHVpZEV4cHVuZ2VDb21tYW5kIDogJ0VYUFVOR0UnXG4gICAgcmV0dXJuIHRoaXMuZXhlYyhjbWQsIG51bGwsIHtcbiAgICAgIHByZWNoZWNrOiAoY3R4KSA9PiB0aGlzLl9zaG91bGRTZWxlY3RNYWlsYm94KHBhdGgsIGN0eCkgPyB0aGlzLnNlbGVjdE1haWxib3gocGF0aCwgeyBjdHggfSkgOiBQcm9taXNlLnJlc29sdmUoKVxuICAgIH0pXG4gIH1cblxuICAvKipcbiAgICogQ29waWVzIGEgcmFuZ2Ugb2YgbWVzc2FnZXMgZnJvbSB0aGUgYWN0aXZlIG1haWxib3ggdG8gdGhlIGRlc3RpbmF0aW9uIG1haWxib3guXG4gICAqIFNpbGVudCBtZXRob2QgKHVubGVzcyBhbiBlcnJvciBvY2N1cnMpLCBieSBkZWZhdWx0IHJldHVybnMgbm8gaW5mb3JtYXRpb24uXG4gICAqXG4gICAqIENPUFkgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi40LjdcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHNlcXVlbmNlIE1lc3NhZ2UgcmFuZ2UgdG8gYmUgY29waWVkXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBkZXN0aW5hdGlvbiBEZXN0aW5hdGlvbiBtYWlsYm94IHBhdGhcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBRdWVyeSBtb2RpZmllcnNcbiAgICogQHBhcmFtIHtCb29sZWFufSBbb3B0aW9ucy5ieVVpZF0gSWYgdHJ1ZSwgdXNlcyBVSUQgQ09QWSBpbnN0ZWFkIG9mIENPUFlcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2VcbiAgICovXG4gIGFzeW5jIGNvcHlNZXNzYWdlcyAocGF0aCwgc2VxdWVuY2UsIGRlc3RpbmF0aW9uLCBvcHRpb25zID0ge30pIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnQ29weWluZyBtZXNzYWdlcycsIHNlcXVlbmNlLCAnZnJvbScsIHBhdGgsICd0bycsIGRlc3RpbmF0aW9uLCAnLi4uJylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyh7XG4gICAgICBjb21tYW5kOiBvcHRpb25zLmJ5VWlkID8gJ1VJRCBDT1BZJyA6ICdDT1BZJyxcbiAgICAgIGF0dHJpYnV0ZXM6IFtcbiAgICAgICAgeyB0eXBlOiAnc2VxdWVuY2UnLCB2YWx1ZTogc2VxdWVuY2UgfSxcbiAgICAgICAgeyB0eXBlOiAnYXRvbScsIHZhbHVlOiBkZXN0aW5hdGlvbiB9XG4gICAgICBdXG4gICAgfSwgbnVsbCwge1xuICAgICAgcHJlY2hlY2s6IChjdHgpID0+IHRoaXMuX3Nob3VsZFNlbGVjdE1haWxib3gocGF0aCwgY3R4KSA/IHRoaXMuc2VsZWN0TWFpbGJveChwYXRoLCB7IGN0eCB9KSA6IFByb21pc2UucmVzb2x2ZSgpXG4gICAgfSlcbiAgICByZXR1cm4gcGFyc2VDT1BZKHJlc3BvbnNlKVxuICB9XG5cbiAgLyoqXG4gICAqIE1vdmVzIGEgcmFuZ2Ugb2YgbWVzc2FnZXMgZnJvbSB0aGUgYWN0aXZlIG1haWxib3ggdG8gdGhlIGRlc3RpbmF0aW9uIG1haWxib3guXG4gICAqIFByZWZlcnMgdGhlIE1PVkUgZXh0ZW5zaW9uIGJ1dCBpZiBub3QgYXZhaWxhYmxlLCBmYWxscyBiYWNrIHRvXG4gICAqIENPUFkgKyBFWFBVTkdFXG4gICAqXG4gICAqIE1PVkUgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM2ODUxXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIGZvciB0aGUgbWFpbGJveCB3aGljaCBzaG91bGQgYmUgc2VsZWN0ZWQgZm9yIHRoZSBjb21tYW5kLiBTZWxlY3RzIG1haWxib3ggaWYgbmVjZXNzYXJ5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzZXF1ZW5jZSBNZXNzYWdlIHJhbmdlIHRvIGJlIG1vdmVkXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBkZXN0aW5hdGlvbiBEZXN0aW5hdGlvbiBtYWlsYm94IHBhdGhcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBRdWVyeSBtb2RpZmllcnNcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2VcbiAgICovXG4gIGFzeW5jIG1vdmVNZXNzYWdlcyAocGF0aCwgc2VxdWVuY2UsIGRlc3RpbmF0aW9uLCBvcHRpb25zID0ge30pIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnTW92aW5nIG1lc3NhZ2VzJywgc2VxdWVuY2UsICdmcm9tJywgcGF0aCwgJ3RvJywgZGVzdGluYXRpb24sICcuLi4nKVxuXG4gICAgaWYgKHRoaXMuX2NhcGFiaWxpdHkuaW5kZXhPZignTU9WRScpID09PSAtMSkge1xuICAgICAgLy8gRmFsbGJhY2sgdG8gQ09QWSArIEVYUFVOR0VcbiAgICAgIGF3YWl0IHRoaXMuY29weU1lc3NhZ2VzKHBhdGgsIHNlcXVlbmNlLCBkZXN0aW5hdGlvbiwgb3B0aW9ucylcbiAgICAgIHJldHVybiB0aGlzLmRlbGV0ZU1lc3NhZ2VzKHBhdGgsIHNlcXVlbmNlLCBvcHRpb25zKVxuICAgIH1cblxuICAgIC8vIElmIHBvc3NpYmxlLCB1c2UgTU9WRVxuICAgIHJldHVybiB0aGlzLmV4ZWMoe1xuICAgICAgY29tbWFuZDogb3B0aW9ucy5ieVVpZCA/ICdVSUQgTU9WRScgOiAnTU9WRScsXG4gICAgICBhdHRyaWJ1dGVzOiBbXG4gICAgICAgIHsgdHlwZTogJ3NlcXVlbmNlJywgdmFsdWU6IHNlcXVlbmNlIH0sXG4gICAgICAgIHsgdHlwZTogJ2F0b20nLCB2YWx1ZTogZGVzdGluYXRpb24gfVxuICAgICAgXVxuICAgIH0sIFsnT0snXSwge1xuICAgICAgcHJlY2hlY2s6IChjdHgpID0+IHRoaXMuX3Nob3VsZFNlbGVjdE1haWxib3gocGF0aCwgY3R4KSA/IHRoaXMuc2VsZWN0TWFpbGJveChwYXRoLCB7IGN0eCB9KSA6IFByb21pc2UucmVzb2x2ZSgpXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIENPTVBSRVNTIGNvbW1hbmRcbiAgICpcbiAgICogQ09NUFJFU1MgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNDk3OFxuICAgKi9cbiAgYXN5bmMgY29tcHJlc3NDb25uZWN0aW9uICgpIHtcbiAgICBpZiAoIXRoaXMuX2VuYWJsZUNvbXByZXNzaW9uIHx8IHRoaXMuX2NhcGFiaWxpdHkuaW5kZXhPZignQ09NUFJFU1M9REVGTEFURScpIDwgMCB8fCB0aGlzLmNsaWVudC5jb21wcmVzc2VkKSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnRW5hYmxpbmcgY29tcHJlc3Npb24uLi4nKVxuICAgIGF3YWl0IHRoaXMuZXhlYyh7XG4gICAgICBjb21tYW5kOiAnQ09NUFJFU1MnLFxuICAgICAgYXR0cmlidXRlczogW3tcbiAgICAgICAgdHlwZTogJ0FUT00nLFxuICAgICAgICB2YWx1ZTogJ0RFRkxBVEUnXG4gICAgICB9XVxuICAgIH0pXG4gICAgdGhpcy5jbGllbnQuZW5hYmxlQ29tcHJlc3Npb24oKVxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDb21wcmVzc2lvbiBlbmFibGVkLCBhbGwgZGF0YSBzZW50IGFuZCByZWNlaXZlZCBpcyBkZWZsYXRlZCEnKVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgTE9HSU4gb3IgQVVUSEVOVElDQVRFIFhPQVVUSDIgY29tbWFuZFxuICAgKlxuICAgKiBMT0dJTiBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjIuM1xuICAgKiBYT0FVVEgyIGRldGFpbHM6XG4gICAqICAgaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vZ21haWwveG9hdXRoMl9wcm90b2NvbCNpbWFwX3Byb3RvY29sX2V4Y2hhbmdlXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBhdXRoLnVzZXJcbiAgICogQHBhcmFtIHtTdHJpbmd9IGF1dGgucGFzc1xuICAgKiBAcGFyYW0ge1N0cmluZ30gYXV0aC54b2F1dGgyXG4gICAqL1xuICBhc3luYyBsb2dpbiAoYXV0aCkge1xuICAgIGxldCBjb21tYW5kXG4gICAgY29uc3Qgb3B0aW9ucyA9IHt9XG5cbiAgICBpZiAoIWF1dGgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQXV0aGVudGljYXRpb24gaW5mb3JtYXRpb24gbm90IHByb3ZpZGVkJylcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdBVVRIPVhPQVVUSDInKSA+PSAwICYmIGF1dGggJiYgYXV0aC54b2F1dGgyKSB7XG4gICAgICBjb21tYW5kID0ge1xuICAgICAgICBjb21tYW5kOiAnQVVUSEVOVElDQVRFJyxcbiAgICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICAgIHsgdHlwZTogJ0FUT00nLCB2YWx1ZTogJ1hPQVVUSDInIH0sXG4gICAgICAgICAgeyB0eXBlOiAnQVRPTScsIHZhbHVlOiBidWlsZFhPQXV0aDJUb2tlbihhdXRoLnVzZXIsIGF1dGgueG9hdXRoMiksIHNlbnNpdGl2ZTogdHJ1ZSB9XG4gICAgICAgIF1cbiAgICAgIH1cblxuICAgICAgb3B0aW9ucy5lcnJvclJlc3BvbnNlRXhwZWN0c0VtcHR5TGluZSA9IHRydWUgLy8gKyB0YWdnZWQgZXJyb3IgcmVzcG9uc2UgZXhwZWN0cyBhbiBlbXB0eSBsaW5lIGluIHJldHVyblxuICAgIH0gZWxzZSBpZiAodGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdBVVRIPVBMQUlOJykgPj0gMCkge1xuICAgICAgY29tbWFuZCA9IHtcbiAgICAgICAgY29tbWFuZDogJ0FVVEhFTlRJQ0FURScsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFtcbiAgICAgICAgICB7IHR5cGU6ICdURVhUJywgdmFsdWU6ICdQTEFJTicgfSxcbiAgICAgICAgICB7IHR5cGU6ICdURVhUJywgY2h1bms6IHRydWUsIHZhbHVlOiBCdWZmZXIuZnJvbSgnXFx4MDAnICsgYXV0aC51c2VyICsgJ1xceDAwJyArIGF1dGgucGFzcyB8fCAnJykudG9TdHJpbmcoJ2Jhc2U2NCcpLCBzZW5zaXRpdmU6IHRydWUgfVxuICAgICAgICBdXG4gICAgICB9XG4gICAgICBvcHRpb25zLmVycm9yUmVzcG9uc2VFeHBlY3RzRW1wdHlMaW5lID0gdHJ1ZSAvLyArIHRhZ2dlZCBlcnJvciByZXNwb25zZSBleHBlY3RzIGFuIGVtcHR5IGxpbmUgaW4gcmV0dXJuXG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbW1hbmQgPSB7XG4gICAgICAgIGNvbW1hbmQ6ICdsb2dpbicsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFtcbiAgICAgICAgICB7IHR5cGU6ICdTVFJJTkcnLCB2YWx1ZTogYXV0aC51c2VyIHx8ICcnIH0sXG4gICAgICAgICAgeyB0eXBlOiAnU1RSSU5HJywgdmFsdWU6IGF1dGgucGFzcyB8fCAnJywgc2Vuc2l0aXZlOiB0cnVlIH1cbiAgICAgICAgXVxuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdMb2dnaW5nIGluLi4uJylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyhjb21tYW5kLCAnY2FwYWJpbGl0eScsIG9wdGlvbnMpXG4gICAgLypcbiAgICAgKiB1cGRhdGUgcG9zdC1hdXRoIGNhcGFiaWxpdGVzXG4gICAgICogY2FwYWJpbGl0eSBsaXN0IHNob3VsZG4ndCBjb250YWluIGF1dGggcmVsYXRlZCBzdHVmZiBhbnltb3JlXG4gICAgICogYnV0IHNvbWUgbmV3IGV4dGVuc2lvbnMgbWlnaHQgaGF2ZSBwb3BwZWQgdXAgdGhhdCBkbyBub3RcbiAgICAgKiBtYWtlIG11Y2ggc2Vuc2UgaW4gdGhlIG5vbi1hdXRoIHN0YXRlXG4gICAgICovXG4gICAgaWYgKHJlc3BvbnNlLmNhcGFiaWxpdHkgJiYgcmVzcG9uc2UuY2FwYWJpbGl0eS5sZW5ndGgpIHtcbiAgICAgIC8vIGNhcGFiaWxpdGVzIHdlcmUgbGlzdGVkIHdpdGggdGhlIE9LIFtDQVBBQklMSVRZIC4uLl0gcmVzcG9uc2VcbiAgICAgIHRoaXMuX2NhcGFiaWxpdHkgPSByZXNwb25zZS5jYXBhYmlsaXR5XG4gICAgfSBlbHNlIGlmIChyZXNwb25zZS5wYXlsb2FkICYmIHJlc3BvbnNlLnBheWxvYWQuQ0FQQUJJTElUWSAmJiByZXNwb25zZS5wYXlsb2FkLkNBUEFCSUxJVFkubGVuZ3RoKSB7XG4gICAgICAvLyBjYXBhYmlsaXRlcyB3ZXJlIGxpc3RlZCB3aXRoICogQ0FQQUJJTElUWSAuLi4gcmVzcG9uc2VcbiAgICAgIHRoaXMuX2NhcGFiaWxpdHkgPSByZXNwb25zZS5wYXlsb2FkLkNBUEFCSUxJVFkucG9wKCkuYXR0cmlidXRlcy5tYXAoKGNhcGEgPSAnJykgPT4gY2FwYS52YWx1ZS50b1VwcGVyQ2FzZSgpLnRyaW0oKSlcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gY2FwYWJpbGl0aWVzIHdlcmUgbm90IGF1dG9tYXRpY2FsbHkgbGlzdGVkLCByZWxvYWRcbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlQ2FwYWJpbGl0eSh0cnVlKVxuICAgIH1cblxuICAgIHRoaXMuX2NoYW5nZVN0YXRlKFNUQVRFX0FVVEhFTlRJQ0FURUQpXG4gICAgdGhpcy5fYXV0aGVudGljYXRlZCA9IHRydWVcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnTG9naW4gc3VjY2Vzc2Z1bCwgcG9zdC1hdXRoIGNhcGFiaWxpdGVzIHVwZGF0ZWQhJywgdGhpcy5fY2FwYWJpbGl0eSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW4gYW4gSU1BUCBjb21tYW5kLlxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxdWVzdCBTdHJ1Y3R1cmVkIHJlcXVlc3Qgb2JqZWN0XG4gICAqIEBwYXJhbSB7QXJyYXl9IGFjY2VwdFVudGFnZ2VkIGEgbGlzdCBvZiB1bnRhZ2dlZCByZXNwb25zZXMgdGhhdCB3aWxsIGJlIGluY2x1ZGVkIGluICdwYXlsb2FkJyBwcm9wZXJ0eVxuICAgKi9cbiAgYXN5bmMgZXhlYyAocmVxdWVzdCwgYWNjZXB0VW50YWdnZWQsIG9wdGlvbnMpIHtcbiAgICB0aGlzLmJyZWFrSWRsZSgpXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmNsaWVudC5lbnF1ZXVlQ29tbWFuZChyZXF1ZXN0LCBhY2NlcHRVbnRhZ2dlZCwgb3B0aW9ucylcbiAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2UuY2FwYWJpbGl0eSkge1xuICAgICAgdGhpcy5fY2FwYWJpbGl0eSA9IHJlc3BvbnNlLmNhcGFiaWxpdHlcbiAgICB9XG4gICAgcmV0dXJuIHJlc3BvbnNlXG4gIH1cblxuICAvKipcbiAgICogVGhlIGNvbm5lY3Rpb24gaXMgaWRsaW5nLiBTZW5kcyBhIE5PT1Agb3IgSURMRSBjb21tYW5kXG4gICAqXG4gICAqIElETEUgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMjE3N1xuICAgKi9cbiAgZW50ZXJJZGxlICgpIHtcbiAgICBpZiAodGhpcy5fZW50ZXJlZElkbGUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICB0aGlzLl9lbnRlcmVkSWRsZSA9ICF0aGlzLl9pZ25vcmVJZGxlQ2FwYWJpbGl0eSAmJiB0aGlzLl9zZWxlY3RlZE1haWxib3ggJiYgdGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdJRExFJykgPj0gMCA/ICdJRExFJyA6ICdOT09QJ1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdFbnRlcmluZyBpZGxlIHdpdGggJyArIHRoaXMuX2VudGVyZWRJZGxlKVxuXG4gICAgaWYgKHRoaXMuX2VudGVyZWRJZGxlID09PSAnTk9PUCcpIHtcbiAgICAgIHRoaXMuX2lkbGVUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdTZW5kaW5nIE5PT1AnKVxuICAgICAgICB0aGlzLmV4ZWMoJ05PT1AnKVxuICAgICAgfSwgdGhpcy50aW1lb3V0Tm9vcClcbiAgICB9IGVsc2UgaWYgKHRoaXMuX2VudGVyZWRJZGxlID09PSAnSURMRScpIHtcbiAgICAgIHRoaXMuY2xpZW50LmVucXVldWVDb21tYW5kKHtcbiAgICAgICAgY29tbWFuZDogJ0lETEUnXG4gICAgICB9KVxuICAgICAgdGhpcy5faWRsZVRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgdGhpcy5jbGllbnQuc2VuZCgnRE9ORVxcclxcbicpXG4gICAgICAgIHRoaXMuX2VudGVyZWRJZGxlID0gZmFsc2VcbiAgICAgICAgdGhpcy5sb2dnZXIuZGVidWcoJ0lkbGUgdGVybWluYXRlZCcpXG4gICAgICB9LCB0aGlzLnRpbWVvdXRJZGxlKVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdG9wcyBhY3Rpb25zIHJlbGF0ZWQgaWRsaW5nLCBpZiBJRExFIGlzIHN1cHBvcnRlZCwgc2VuZHMgRE9ORSB0byBzdG9wIGl0XG4gICAqL1xuICBicmVha0lkbGUgKCkge1xuICAgIGlmICghdGhpcy5fZW50ZXJlZElkbGUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNsZWFyVGltZW91dCh0aGlzLl9pZGxlVGltZW91dClcbiAgICBpZiAodGhpcy5fZW50ZXJlZElkbGUgPT09ICdJRExFJykge1xuICAgICAgdGhpcy5jbGllbnQuc2VuZCgnRE9ORVxcclxcbicpXG4gICAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnSWRsZSB0ZXJtaW5hdGVkJylcbiAgICB9XG4gICAgdGhpcy5fZW50ZXJlZElkbGUgPSBmYWxzZVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgU1RBUlRUTFMgY29tbWFuZCBpZiBuZWVkZWRcbiAgICpcbiAgICogU1RBUlRUTFMgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4yLjFcbiAgICpcbiAgICogQHBhcmFtIHtCb29sZWFufSBbZm9yY2VkXSBCeSBkZWZhdWx0IHRoZSBjb21tYW5kIGlzIG5vdCBydW4gaWYgY2FwYWJpbGl0eSBpcyBhbHJlYWR5IGxpc3RlZC4gU2V0IHRvIHRydWUgdG8gc2tpcCB0aGlzIHZhbGlkYXRpb25cbiAgICovXG4gIGFzeW5jIHVwZ3JhZGVDb25uZWN0aW9uICgpIHtcbiAgICAvLyBza2lwIHJlcXVlc3QsIGlmIGFscmVhZHkgc2VjdXJlZFxuICAgIGlmICh0aGlzLmNsaWVudC5zZWN1cmVNb2RlKSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG5cbiAgICAvLyBza2lwIGlmIFNUQVJUVExTIG5vdCBhdmFpbGFibGUgb3Igc3RhcnR0bHMgc3VwcG9ydCBkaXNhYmxlZFxuICAgIGlmICgodGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdTVEFSVFRMUycpIDwgMCB8fCB0aGlzLl9pZ25vcmVUTFMpICYmICF0aGlzLl9yZXF1aXJlVExTKSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnRW5jcnlwdGluZyBjb25uZWN0aW9uLi4uJylcbiAgICBhd2FpdCB0aGlzLmV4ZWMoJ1NUQVJUVExTJylcbiAgICB0aGlzLl9jYXBhYmlsaXR5ID0gW11cbiAgICB0aGlzLmNsaWVudC51cGdyYWRlKClcbiAgICByZXR1cm4gdGhpcy51cGRhdGVDYXBhYmlsaXR5KClcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIENBUEFCSUxJVFkgY29tbWFuZFxuICAgKlxuICAgKiBDQVBBQklMSVRZIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMS4xXG4gICAqXG4gICAqIERvZXNuJ3QgcmVnaXN0ZXIgdW50YWdnZWQgQ0FQQUJJTElUWSBoYW5kbGVyIGFzIHRoaXMgaXMgYWxyZWFkeVxuICAgKiBoYW5kbGVkIGJ5IGdsb2JhbCBoYW5kbGVyXG4gICAqXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW2ZvcmNlZF0gQnkgZGVmYXVsdCB0aGUgY29tbWFuZCBpcyBub3QgcnVuIGlmIGNhcGFiaWxpdHkgaXMgYWxyZWFkeSBsaXN0ZWQuIFNldCB0byB0cnVlIHRvIHNraXAgdGhpcyB2YWxpZGF0aW9uXG4gICAqL1xuICBhc3luYyB1cGRhdGVDYXBhYmlsaXR5IChmb3JjZWQpIHtcbiAgICAvLyBza2lwIHJlcXVlc3QsIGlmIG5vdCBmb3JjZWQgdXBkYXRlIGFuZCBjYXBhYmlsaXRpZXMgYXJlIGFscmVhZHkgbG9hZGVkXG4gICAgaWYgKCFmb3JjZWQgJiYgdGhpcy5fY2FwYWJpbGl0eS5sZW5ndGgpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vIElmIFNUQVJUVExTIGlzIHJlcXVpcmVkIHRoZW4gc2tpcCBjYXBhYmlsaXR5IGxpc3RpbmcgYXMgd2UgYXJlIGdvaW5nIHRvIHRyeVxuICAgIC8vIFNUQVJUVExTIGFueXdheSBhbmQgd2UgcmUtY2hlY2sgY2FwYWJpbGl0aWVzIGFmdGVyIGNvbm5lY3Rpb24gaXMgc2VjdXJlZFxuICAgIGlmICghdGhpcy5jbGllbnQuc2VjdXJlTW9kZSAmJiB0aGlzLl9yZXF1aXJlVExTKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnVXBkYXRpbmcgY2FwYWJpbGl0eS4uLicpXG4gICAgcmV0dXJuIHRoaXMuZXhlYygnQ0FQQUJJTElUWScpXG4gIH1cblxuICBoYXNDYXBhYmlsaXR5IChjYXBhID0gJycpIHtcbiAgICByZXR1cm4gdGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKGNhcGEudG9VcHBlckNhc2UoKS50cmltKCkpID49IDBcbiAgfVxuXG4gIC8vIERlZmF1bHQgaGFuZGxlcnMgZm9yIHVudGFnZ2VkIHJlc3BvbnNlc1xuXG4gIC8qKlxuICAgKiBDaGVja3MgaWYgYW4gdW50YWdnZWQgT0sgaW5jbHVkZXMgW0NBUEFCSUxJVFldIHRhZyBhbmQgdXBkYXRlcyBjYXBhYmlsaXR5IG9iamVjdFxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVzcG9uc2UgUGFyc2VkIHNlcnZlciByZXNwb25zZVxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0IFVudGlsIGNhbGxlZCwgc2VydmVyIHJlc3BvbnNlcyBhcmUgbm90IHByb2Nlc3NlZFxuICAgKi9cbiAgX3VudGFnZ2VkT2tIYW5kbGVyIChyZXNwb25zZSkge1xuICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5jYXBhYmlsaXR5KSB7XG4gICAgICB0aGlzLl9jYXBhYmlsaXR5ID0gcmVzcG9uc2UuY2FwYWJpbGl0eVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGVzIGNhcGFiaWxpdHkgb2JqZWN0XG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXNwb25zZSBQYXJzZWQgc2VydmVyIHJlc3BvbnNlXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHQgVW50aWwgY2FsbGVkLCBzZXJ2ZXIgcmVzcG9uc2VzIGFyZSBub3QgcHJvY2Vzc2VkXG4gICAqL1xuICBfdW50YWdnZWRDYXBhYmlsaXR5SGFuZGxlciAocmVzcG9uc2UpIHtcbiAgICB0aGlzLl9jYXBhYmlsaXR5ID0gcGlwZShcbiAgICAgIHByb3BPcihbXSwgJ2F0dHJpYnV0ZXMnKSxcbiAgICAgIG1hcCgoeyB2YWx1ZSB9KSA9PiAodmFsdWUgfHwgJycpLnRvVXBwZXJDYXNlKCkudHJpbSgpKVxuICAgICkocmVzcG9uc2UpXG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlcyBleGlzdGluZyBtZXNzYWdlIGNvdW50XG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXNwb25zZSBQYXJzZWQgc2VydmVyIHJlc3BvbnNlXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHQgVW50aWwgY2FsbGVkLCBzZXJ2ZXIgcmVzcG9uc2VzIGFyZSBub3QgcHJvY2Vzc2VkXG4gICAqL1xuICBfdW50YWdnZWRFeGlzdHNIYW5kbGVyIChyZXNwb25zZSkge1xuICAgIGlmIChyZXNwb25zZSAmJiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzcG9uc2UsICducicpKSB7XG4gICAgICB0aGlzLm9udXBkYXRlICYmIHRoaXMub251cGRhdGUodGhpcy5fc2VsZWN0ZWRNYWlsYm94LCAnZXhpc3RzJywgcmVzcG9uc2UubnIpXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEluZGljYXRlcyBhIG1lc3NhZ2UgaGFzIGJlZW4gZGVsZXRlZFxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVzcG9uc2UgUGFyc2VkIHNlcnZlciByZXNwb25zZVxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0IFVudGlsIGNhbGxlZCwgc2VydmVyIHJlc3BvbnNlcyBhcmUgbm90IHByb2Nlc3NlZFxuICAgKi9cbiAgX3VudGFnZ2VkRXhwdW5nZUhhbmRsZXIgKHJlc3BvbnNlKSB7XG4gICAgaWYgKHJlc3BvbnNlICYmIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXNwb25zZSwgJ25yJykpIHtcbiAgICAgIHRoaXMub251cGRhdGUgJiYgdGhpcy5vbnVwZGF0ZSh0aGlzLl9zZWxlY3RlZE1haWxib3gsICdleHB1bmdlJywgcmVzcG9uc2UubnIpXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEluZGljYXRlcyB0aGF0IGZsYWdzIGhhdmUgYmVlbiB1cGRhdGVkIGZvciBhIG1lc3NhZ2VcbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlc3BvbnNlIFBhcnNlZCBzZXJ2ZXIgcmVzcG9uc2VcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dCBVbnRpbCBjYWxsZWQsIHNlcnZlciByZXNwb25zZXMgYXJlIG5vdCBwcm9jZXNzZWRcbiAgICovXG4gIF91bnRhZ2dlZEZldGNoSGFuZGxlciAocmVzcG9uc2UpIHtcbiAgICB0aGlzLm9udXBkYXRlICYmIHRoaXMub251cGRhdGUodGhpcy5fc2VsZWN0ZWRNYWlsYm94LCAnZmV0Y2gnLCBbXS5jb25jYXQocGFyc2VGRVRDSCh7IHBheWxvYWQ6IHsgRkVUQ0g6IFtyZXNwb25zZV0gfSB9KSB8fCBbXSkuc2hpZnQoKSlcbiAgfVxuXG4gIC8vIFByaXZhdGUgaGVscGVyc1xuXG4gIC8qKlxuICAgKiBJbmRpY2F0ZXMgdGhhdCB0aGUgY29ubmVjdGlvbiBzdGFydGVkIGlkbGluZy4gSW5pdGlhdGVzIGEgY3ljbGVcbiAgICogb2YgTk9PUHMgb3IgSURMRXMgdG8gcmVjZWl2ZSBub3RpZmljYXRpb25zIGFib3V0IHVwZGF0ZXMgaW4gdGhlIHNlcnZlclxuICAgKi9cbiAgX29uSWRsZSAoKSB7XG4gICAgaWYgKCF0aGlzLl9hdXRoZW50aWNhdGVkIHx8IHRoaXMuX2VudGVyZWRJZGxlKSB7XG4gICAgICAvLyBObyBuZWVkIHRvIElETEUgd2hlbiBub3QgbG9nZ2VkIGluIG9yIGFscmVhZHkgaWRsaW5nXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnQ2xpZW50IHN0YXJ0ZWQgaWRsaW5nJylcbiAgICB0aGlzLmVudGVySWRsZSgpXG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlcyB0aGUgSU1BUCBzdGF0ZSB2YWx1ZSBmb3IgdGhlIGN1cnJlbnQgY29ubmVjdGlvblxuICAgKlxuICAgKiBAcGFyYW0ge051bWJlcn0gbmV3U3RhdGUgVGhlIHN0YXRlIHlvdSB3YW50IHRvIGNoYW5nZSB0b1xuICAgKi9cbiAgX2NoYW5nZVN0YXRlIChuZXdTdGF0ZSkge1xuICAgIGlmIChuZXdTdGF0ZSA9PT0gdGhpcy5fc3RhdGUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdFbnRlcmluZyBzdGF0ZTogJyArIG5ld1N0YXRlKVxuXG4gICAgLy8gaWYgYSBtYWlsYm94IHdhcyBvcGVuZWQsIGVtaXQgb25jbG9zZW1haWxib3ggYW5kIGNsZWFyIHNlbGVjdGVkTWFpbGJveCB2YWx1ZVxuICAgIGlmICh0aGlzLl9zdGF0ZSA9PT0gU1RBVEVfU0VMRUNURUQgJiYgdGhpcy5fc2VsZWN0ZWRNYWlsYm94KSB7XG4gICAgICB0aGlzLm9uY2xvc2VtYWlsYm94ICYmIHRoaXMub25jbG9zZW1haWxib3godGhpcy5fc2VsZWN0ZWRNYWlsYm94KVxuICAgICAgdGhpcy5fc2VsZWN0ZWRNYWlsYm94ID0gZmFsc2VcbiAgICB9XG5cbiAgICB0aGlzLl9zdGF0ZSA9IG5ld1N0YXRlXG4gIH1cblxuICAvKipcbiAgICogRW5zdXJlcyBhIHBhdGggZXhpc3RzIGluIHRoZSBNYWlsYm94IHRyZWVcbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IHRyZWUgTWFpbGJveCB0cmVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBkZWxpbWl0ZXJcbiAgICogQHJldHVybiB7T2JqZWN0fSBicmFuY2ggZm9yIHVzZWQgcGF0aFxuICAgKi9cbiAgX2Vuc3VyZVBhdGggKHRyZWUsIHBhdGgsIGRlbGltaXRlcikge1xuICAgIGNvbnN0IG5hbWVzID0gcGF0aC5zcGxpdChkZWxpbWl0ZXIpXG4gICAgbGV0IGJyYW5jaCA9IHRyZWVcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbmFtZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGxldCBmb3VuZCA9IGZhbHNlXG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGJyYW5jaC5jaGlsZHJlbi5sZW5ndGg7IGorKykge1xuICAgICAgICBpZiAodGhpcy5fY29tcGFyZU1haWxib3hOYW1lcyhicmFuY2guY2hpbGRyZW5bal0ubmFtZSwgaW1hcERlY29kZShuYW1lc1tpXSkpKSB7XG4gICAgICAgICAgYnJhbmNoID0gYnJhbmNoLmNoaWxkcmVuW2pdXG4gICAgICAgICAgZm91bmQgPSB0cnVlXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKCFmb3VuZCkge1xuICAgICAgICBicmFuY2guY2hpbGRyZW4ucHVzaCh7XG4gICAgICAgICAgbmFtZTogaW1hcERlY29kZShuYW1lc1tpXSksXG4gICAgICAgICAgZGVsaW1pdGVyOiBkZWxpbWl0ZXIsXG4gICAgICAgICAgcGF0aDogbmFtZXMuc2xpY2UoMCwgaSArIDEpLmpvaW4oZGVsaW1pdGVyKSxcbiAgICAgICAgICBjaGlsZHJlbjogW11cbiAgICAgICAgfSlcbiAgICAgICAgYnJhbmNoID0gYnJhbmNoLmNoaWxkcmVuW2JyYW5jaC5jaGlsZHJlbi5sZW5ndGggLSAxXVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYnJhbmNoXG4gIH1cblxuICAvKipcbiAgICogQ29tcGFyZXMgdHdvIG1haWxib3ggbmFtZXMuIENhc2UgaW5zZW5zaXRpdmUgaW4gY2FzZSBvZiBJTkJPWCwgb3RoZXJ3aXNlIGNhc2Ugc2Vuc2l0aXZlXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBhIE1haWxib3ggbmFtZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gYiBNYWlsYm94IG5hbWVcbiAgICogQHJldHVybnMge0Jvb2xlYW59IFRydWUgaWYgdGhlIGZvbGRlciBuYW1lcyBtYXRjaFxuICAgKi9cbiAgX2NvbXBhcmVNYWlsYm94TmFtZXMgKGEsIGIpIHtcbiAgICByZXR1cm4gKGEudG9VcHBlckNhc2UoKSA9PT0gJ0lOQk9YJyA/ICdJTkJPWCcgOiBhKSA9PT0gKGIudG9VcHBlckNhc2UoKSA9PT0gJ0lOQk9YJyA/ICdJTkJPWCcgOiBiKVxuICB9XG5cbiAgY3JlYXRlTG9nZ2VyIChjcmVhdG9yID0gY3JlYXRlRGVmYXVsdExvZ2dlcikge1xuICAgIGNvbnN0IGxvZ2dlciA9IGNyZWF0b3IoKHRoaXMuX2F1dGggfHwge30pLnVzZXIgfHwgJycsIHRoaXMuX2hvc3QpXG4gICAgdGhpcy5sb2dnZXIgPSB0aGlzLmNsaWVudC5sb2dnZXIgPSB7XG4gICAgICBkZWJ1ZzogKC4uLm1zZ3MpID0+IHsgaWYgKExPR19MRVZFTF9ERUJVRyA+PSB0aGlzLmxvZ0xldmVsKSB7IGxvZ2dlci5kZWJ1Zyhtc2dzKSB9IH0sXG4gICAgICBpbmZvOiAoLi4ubXNncykgPT4geyBpZiAoTE9HX0xFVkVMX0lORk8gPj0gdGhpcy5sb2dMZXZlbCkgeyBsb2dnZXIuaW5mbyhtc2dzKSB9IH0sXG4gICAgICB3YXJuOiAoLi4ubXNncykgPT4geyBpZiAoTE9HX0xFVkVMX1dBUk4gPj0gdGhpcy5sb2dMZXZlbCkgeyBsb2dnZXIud2Fybihtc2dzKSB9IH0sXG4gICAgICBlcnJvcjogKC4uLm1zZ3MpID0+IHsgaWYgKExPR19MRVZFTF9FUlJPUiA+PSB0aGlzLmxvZ0xldmVsKSB7IGxvZ2dlci5lcnJvcihtc2dzKSB9IH1cbiAgICB9XG4gIH1cbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsTUFBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsV0FBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsY0FBQSxHQUFBRixPQUFBO0FBUUEsSUFBQUcsZUFBQSxHQUFBSCxPQUFBO0FBT0EsSUFBQUksT0FBQSxHQUFBQyxzQkFBQSxDQUFBTCxPQUFBO0FBQ0EsSUFBQU0sS0FBQSxHQUFBRCxzQkFBQSxDQUFBTCxPQUFBO0FBQ0EsSUFBQU8sT0FBQSxHQUFBUCxPQUFBO0FBUUEsSUFBQVEsV0FBQSxHQUFBUixPQUFBO0FBRXNCLFNBQUFLLHVCQUFBSSxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBQUEsU0FBQUcsbUJBQUFDLENBQUEsRUFBQUMsQ0FBQSxFQUFBTCxDQUFBLEVBQUFNLENBQUEsRUFBQUMsQ0FBQSxFQUFBQyxDQUFBLEVBQUFD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