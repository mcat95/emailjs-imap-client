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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9jbGllbnQuanMiXSwibmFtZXMiOlsiVElNRU9VVF9DT05ORUNUSU9OIiwiVElNRU9VVF9OT09QIiwiVElNRU9VVF9JRExFIiwiU1RBVEVfQ09OTkVDVElORyIsIlNUQVRFX05PVF9BVVRIRU5USUNBVEVEIiwiU1RBVEVfQVVUSEVOVElDQVRFRCIsIlNUQVRFX1NFTEVDVEVEIiwiU1RBVEVfTE9HT1VUIiwiREVGQVVMVF9DTElFTlRfSUQiLCJuYW1lIiwiQ2xpZW50IiwiY29uc3RydWN0b3IiLCJob3N0IiwicG9ydCIsIm9wdGlvbnMiLCJ0aW1lb3V0Q29ubmVjdGlvbiIsInRpbWVvdXROb29wIiwidGltZW91dElkbGUiLCJzZXJ2ZXJJZCIsIm9uY2VydCIsIm9udXBkYXRlIiwib25zZWxlY3RtYWlsYm94Iiwib25jbG9zZW1haWxib3giLCJfaG9zdCIsIl9jbGllbnRJZCIsIl9zdGF0ZSIsIl9hdXRoZW50aWNhdGVkIiwiX2NhcGFiaWxpdHkiLCJfc2VsZWN0ZWRNYWlsYm94IiwiX2VudGVyZWRJZGxlIiwiX2lkbGVUaW1lb3V0IiwiX2VuYWJsZUNvbXByZXNzaW9uIiwiZW5hYmxlQ29tcHJlc3Npb24iLCJfYXV0aCIsImF1dGgiLCJfcmVxdWlyZVRMUyIsInJlcXVpcmVUTFMiLCJfaWdub3JlVExTIiwiaWdub3JlVExTIiwiX2lnbm9yZUlkbGVDYXBhYmlsaXR5IiwiaWdub3JlSWRsZUNhcGFiaWxpdHkiLCJjbGllbnQiLCJJbWFwQ2xpZW50Iiwib25lcnJvciIsIl9vbkVycm9yIiwiYmluZCIsImNlcnQiLCJvbmlkbGUiLCJfb25JZGxlIiwic2V0SGFuZGxlciIsInJlc3BvbnNlIiwiX3VudGFnZ2VkQ2FwYWJpbGl0eUhhbmRsZXIiLCJfdW50YWdnZWRPa0hhbmRsZXIiLCJfdW50YWdnZWRFeGlzdHNIYW5kbGVyIiwiX3VudGFnZ2VkRXhwdW5nZUhhbmRsZXIiLCJfdW50YWdnZWRGZXRjaEhhbmRsZXIiLCJjcmVhdGVMb2dnZXIiLCJsb2dMZXZlbCIsIkxPR19MRVZFTF9BTEwiLCJlcnIiLCJjbGVhclRpbWVvdXQiLCJjb25uZWN0Iiwib3BlbkNvbm5lY3Rpb24iLCJ1cGdyYWRlQ29ubmVjdGlvbiIsInVwZGF0ZUlkIiwibG9nZ2VyIiwid2FybiIsIm1lc3NhZ2UiLCJsb2dpbiIsImNvbXByZXNzQ29ubmVjdGlvbiIsImRlYnVnIiwiZXJyb3IiLCJjbG9zZSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiY29ubmVjdGlvblRpbWVvdXQiLCJzZXRUaW1lb3V0IiwiRXJyb3IiLCJfY2hhbmdlU3RhdGUiLCJ0aGVuIiwib25yZWFkeSIsInVwZGF0ZUNhcGFiaWxpdHkiLCJjYXRjaCIsImxvZ291dCIsImlkIiwiaW5kZXhPZiIsImNvbW1hbmQiLCJhdHRyaWJ1dGVzIiwiT2JqZWN0IiwiZW50cmllcyIsImV4ZWMiLCJsaXN0IiwibWFwIiwidmFsdWVzIiwia2V5cyIsImZpbHRlciIsIl8iLCJpIiwiX3Nob3VsZFNlbGVjdE1haWxib3giLCJwYXRoIiwiY3R4IiwicHJldmlvdXNTZWxlY3QiLCJnZXRQcmV2aW91c2x5UXVldWVkIiwicmVxdWVzdCIsInBhdGhBdHRyaWJ1dGUiLCJmaW5kIiwiYXR0cmlidXRlIiwidHlwZSIsInZhbHVlIiwic2VsZWN0TWFpbGJveCIsInF1ZXJ5IiwicmVhZE9ubHkiLCJjb25kc3RvcmUiLCJwdXNoIiwibWFpbGJveEluZm8iLCJzdWJzY3JpYmVNYWlsYm94IiwidW5zdWJzY3JpYmVNYWlsYm94IiwibGlzdE5hbWVzcGFjZXMiLCJsaXN0TWFpbGJveGVzIiwidHJlZSIsInJvb3QiLCJjaGlsZHJlbiIsImxpc3RSZXNwb25zZSIsImZvckVhY2giLCJpdGVtIiwiYXR0ciIsImxlbmd0aCIsImRlbGltIiwiYnJhbmNoIiwiX2Vuc3VyZVBhdGgiLCJmbGFncyIsImxpc3RlZCIsImxzdWJSZXNwb25zZSIsImxzdWIiLCJmbGFnIiwic3Vic2NyaWJlZCIsImNyZWF0ZU1haWxib3giLCJjb2RlIiwiZGVsZXRlTWFpbGJveCIsImxpc3RNZXNzYWdlcyIsInNlcXVlbmNlIiwiaXRlbXMiLCJmYXN0IiwicHJlY2hlY2siLCJzZWFyY2giLCJzZXRGbGFncyIsImtleSIsIkFycmF5IiwiaXNBcnJheSIsImNvbmNhdCIsImFkZCIsInNldCIsInJlbW92ZSIsInN0b3JlIiwiYWN0aW9uIiwidXBsb2FkIiwiZGVzdGluYXRpb24iLCJkZWxldGVNZXNzYWdlcyIsInVzZVVpZFBsdXMiLCJieVVpZCIsInVpZEV4cHVuZ2VDb21tYW5kIiwiY21kIiwiY29weU1lc3NhZ2VzIiwibW92ZU1lc3NhZ2VzIiwiY29tcHJlc3NlZCIsInhvYXV0aDIiLCJ1c2VyIiwic2Vuc2l0aXZlIiwiZXJyb3JSZXNwb25zZUV4cGVjdHNFbXB0eUxpbmUiLCJwYXNzIiwiY2FwYWJpbGl0eSIsInBheWxvYWQiLCJDQVBBQklMSVRZIiwicG9wIiwiY2FwYSIsInRvVXBwZXJDYXNlIiwidHJpbSIsImFjY2VwdFVudGFnZ2VkIiwiYnJlYWtJZGxlIiwiZW5xdWV1ZUNvbW1hbmQiLCJlbnRlcklkbGUiLCJzZW5kIiwic2VjdXJlTW9kZSIsInVwZ3JhZGUiLCJmb3JjZWQiLCJoYXNDYXBhYmlsaXR5IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwibnIiLCJGRVRDSCIsInNoaWZ0IiwibmV3U3RhdGUiLCJkZWxpbWl0ZXIiLCJuYW1lcyIsInNwbGl0IiwiZm91bmQiLCJqIiwiX2NvbXBhcmVNYWlsYm94TmFtZXMiLCJzbGljZSIsImpvaW4iLCJhIiwiYiIsImNyZWF0b3IiLCJjcmVhdGVEZWZhdWx0TG9nZ2VyIiwibXNncyIsIkxPR19MRVZFTF9ERUJVRyIsImluZm8iLCJMT0dfTEVWRUxfSU5GTyIsIkxPR19MRVZFTF9XQVJOIiwiTE9HX0xFVkVMX0VSUk9SIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBUUE7O0FBT0E7O0FBQ0E7O0FBQ0E7O0FBUUE7Ozs7Ozs7O0FBSU8sTUFBTUEsa0JBQWtCLEdBQUcsS0FB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QUFKLEtBQWE7QUFBRSxZQUFJSywyQkFBbUIsS0FBSzFKLFFBQTVCLEVBQXNDO0FBQUVRLFVBQUFBLE1BQU0sQ0FBQ00sS0FBUCxDQUFhdUksSUFBYjtBQUFvQjtBQUFFO0FBSm5ELEtBQW5DO0FBTUQ7O0FBNTZCeUIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBtYXAsIHBpcGUsIHVuaW9uLCB6aXAsIGZyb21QYWlycywgcHJvcE9yLCBwYXRoT3IsIGZsYXR0ZW4gfSBmcm9tICdyYW1kYSdcbmltcG9ydCB7IGltYXBEZWNvZGUgfSBmcm9tICdlbWFpbGpzLXV0ZjcnXG5pbXBvcnQge1xuICBwYXJzZUFQUEVORCxcbiAgcGFyc2VDT1BZLFxuICBwYXJzZU5BTUVTUEFDRSxcbiAgcGFyc2VTRUxFQ1QsXG4gIHBhcnNlRkVUQ0gsXG4gIHBhcnNlU0VBUkNIXG59IGZyb20gJy4vY29tbWFuZC1wYXJzZXInXG5pbXBvcnQge1xuICBidWlsZEZFVENIQ29tbWFuZCxcbiAgYnVpbGRYT0F1dGgyVG9rZW4sXG4gIGJ1aWxkU0VBUkNIQ29tbWFuZCxcbiAgYnVpbGRTVE9SRUNvbW1hbmRcbn0gZnJvbSAnLi9jb21tYW5kLWJ1aWxkZXInXG5cbmltcG9ydCBjcmVhdGVEZWZhdWx0TG9nZ2VyIGZyb20gJy4vbG9nZ2VyJ1xuaW1wb3J0IEltYXBDbGllbnQgZnJvbSAnLi9pbWFwJ1xuaW1wb3J0IHtcbiAgTE9HX0xFVkVMX0VSUk9SLFxuICBMT0dfTEVWRUxfV0FSTixcbiAgTE9HX0xFVkVMX0lORk8sXG4gIExPR19MRVZFTF9ERUJVRyxcbiAgTE9HX0xFVkVMX0FMTFxufSBmcm9tICcuL2NvbW1vbidcblxuaW1wb3J0IHtcbiAgY2hlY2tTcGVjaWFsVXNlXG59IGZyb20gJy4vc3BlY2lhbC11c2UnXG5cbmV4cG9ydCBjb25zdCBUSU1FT1VUX0NPTk5FQ1RJT04gPSA5MCAqIDEwMDAgLy8gTWlsbGlzZWNvbmRzIHRvIHdhaXQgZm9yIHRoZSBJTUFQIGdyZWV0aW5nIGZyb20gdGhlIHNlcnZlclxuZXhwb3J0IGNvbnN0IFRJTUVPVVRfTk9PUCA9IDYwICogMTAwMCAvLyBNaWxsaXNlY29uZHMgYmV0d2VlbiBOT09QIGNvbW1hbmRzIHdoaWxlIGlkbGluZ1xuZXhwb3J0IGNvbnN0IFRJTUVPVVRfSURMRSA9IDYwICogMTAwMCAvLyBNaWxsaXNlY29uZHMgdW50aWwgSURMRSBjb21tYW5kIGlzIGNhbmNlbGxlZFxuXG5leHBvcnQgY29uc3QgU1RBVEVfQ09OTkVDVElORyA9IDFcbmV4cG9ydCBjb25zdCBTVEFURV9OT1RfQVVUSEVOVElDQVRFRCA9IDJcbmV4cG9ydCBjb25zdCBTVEFURV9BVVRIRU5USUNBVEVEID0gM1xuZXhwb3J0IGNvbnN0IFNUQVRFX1NFTEVDVEVEID0gNFxuZXhwb3J0IGNvbnN0IFNUQVRFX0xPR09VVCA9IDVcblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfQ0xJRU5UX0lEID0ge1xuICBuYW1lOiAnZW1haWxqcy1pbWFwLWNsaWVudCdcbn1cblxuLyoqXG4gKiBlbWFpbGpzIElNQVAgY2xpZW50XG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IFtob3N0PSdsb2NhbGhvc3QnXSBIb3N0bmFtZSB0byBjb25lbmN0IHRvXG4gKiBAcGFyYW0ge051bWJlcn0gW3BvcnQ9MTQzXSBQb3J0IG51bWJlciB0byBjb25uZWN0IHRvXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIE9wdGlvbmFsIG9wdGlvbnMgb2JqZWN0XG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIENsaWVudCB7XG4gIGNvbnN0cnVjdG9yIChob3N0LCBwb3J0LCBvcHRpb25zID0ge30pIHtcbiAgICB0aGlzLnRpbWVvdXRDb25uZWN0aW9uID0gVElNRU9VVF9DT05ORUNUSU9OXG4gICAgdGhpcy50aW1lb3V0Tm9vcCA9IG9wdGlvbnMudGltZW91dE5vb3AgfHwgVElNRU9VVF9OT09QXG4gICAgdGhpcy50aW1lb3V0SWRsZSA9IG9wdGlvbnMudGltZW91dElkbGUgfHwgVElNRU9VVF9JRExFXG5cbiAgICB0aGlzLnNlcnZlcklkID0gZmFsc2UgLy8gUkZDIDI5NzEgU2VydmVyIElEIGFzIGtleSB2YWx1ZSBwYWlyc1xuXG4gICAgLy8gRXZlbnQgcGxhY2Vob2xkZXJzXG4gICAgdGhpcy5vbmNlcnQgPSBudWxsXG4gICAgdGhpcy5vbnVwZGF0ZSA9IG51bGxcbiAgICB0aGlzLm9uc2VsZWN0bWFpbGJveCA9IG51bGxcbiAgICB0aGlzLm9uY2xvc2VtYWlsYm94ID0gbnVsbFxuXG4gICAgdGhpcy5faG9zdCA9IGhvc3RcbiAgICB0aGlzLl9jbGllbnRJZCA9IHByb3BPcihERUZBVUxUX0NMSUVOVF9JRCwgJ2lkJywgb3B0aW9ucylcbiAgICB0aGlzLl9zdGF0ZSA9IGZhbHNlIC8vIEN1cnJlbnQgc3RhdGVcbiAgICB0aGlzLl9hdXRoZW50aWNhdGVkID0gZmFsc2UgLy8gSXMgdGhlIGNvbm5lY3Rpb24gYXV0aGVudGljYXRlZFxuICAgIHRoaXMuX2NhcGFiaWxpdHkgPSBbXSAvLyBMaXN0IG9mIGV4dGVuc2lvbnMgdGhlIHNlcnZlciBzdXBwb3J0c1xuICAgIHRoaXMuX3NlbGVjdGVkTWFpbGJveCA9IGZhbHNlIC8vIFNlbGVjdGVkIG1haWxib3hcbiAgICB0aGlzLl9lbnRlcmVkSWRsZSA9IGZhbHNlXG4gICAgdGhpcy5faWRsZVRpbWVvdXQgPSBmYWxzZVxuICAgIHRoaXMuX2VuYWJsZUNvbXByZXNzaW9uID0gISFvcHRpb25zLmVuYWJsZUNvbXByZXNzaW9uXG4gICAgdGhpcy5fYXV0aCA9IG9wdGlvbnMuYXV0aFxuICAgIHRoaXMuX3JlcXVpcmVUTFMgPSAhIW9wdGlvbnMucmVxdWlyZVRMU1xuICAgIHRoaXMuX2lnbm9yZVRMUyA9ICEhb3B0aW9ucy5pZ25vcmVUTFNcbiAgICB0aGlzLl9pZ25vcmVJZGxlQ2FwYWJpbGl0eSA9ICEhb3B0aW9ucy5pZ25vcmVJZGxlQ2FwYWJpbGl0eVxuXG4gICAgdGhpcy5jbGllbnQgPSBuZXcgSW1hcENsaWVudChob3N0LCBwb3J0LCBvcHRpb25zKSAvLyBJTUFQIGNsaWVudCBvYmplY3RcblxuICAgIC8vIEV2ZW50IEhhbmRsZXJzXG4gICAgdGhpcy5jbGllbnQub25lcnJvciA9IHRoaXMuX29uRXJyb3IuYmluZCh0aGlzKVxuICAgIHRoaXMuY2xpZW50Lm9uY2VydCA9IChjZXJ0KSA9PiAodGhpcy5vbmNlcnQgJiYgdGhpcy5vbmNlcnQoY2VydCkpIC8vIGFsbG93cyBjZXJ0aWZpY2F0ZSBoYW5kbGluZyBmb3IgcGxhdGZvcm1zIHcvbyBuYXRpdmUgdGxzIHN1cHBvcnRcbiAgICB0aGlzLmNsaWVudC5vbmlkbGUgPSAoKSA9PiB0aGlzLl9vbklkbGUoKSAvLyBzdGFydCBpZGxpbmdcblxuICAgIC8vIERlZmF1bHQgaGFuZGxlcnMgZm9yIHVudGFnZ2VkIHJlc3BvbnNlc1xuICAgIHRoaXMuY2xpZW50LnNldEhhbmRsZXIoJ2NhcGFiaWxpdHknLCAocmVzcG9uc2UpID0+IHRoaXMuX3VudGFnZ2VkQ2FwYWJpbGl0eUhhbmRsZXIocmVzcG9uc2UpKSAvLyBjYXBhYmlsaXR5IHVwZGF0ZXNcbiAgICB0aGlzLmNsaWVudC5zZXRIYW5kbGVyKCdvaycsIChyZXNwb25zZSkgPT4gdGhpcy5fdW50YWdnZWRPa0hhbmRsZXIocmVzcG9uc2UpKSAvLyBub3RpZmljYXRpb25zXG4gICAgdGhpcy5jbGllbnQuc2V0SGFuZGxlcignZXhpc3RzJywgKHJlc3BvbnNlKSA9PiB0aGlzLl91bnRhZ2dlZEV4aXN0c0hhbmRsZXIocmVzcG9uc2UpKSAvLyBtZXNzYWdlIGNvdW50IGhhcyBjaGFuZ2VkXG4gICAgdGhpcy5jbGllbnQuc2V0SGFuZGxlcignZXhwdW5nZScsIChyZXNwb25zZSkgPT4gdGhpcy5fdW50YWdnZWRFeHB1bmdlSGFuZGxlcihyZXNwb25zZSkpIC8vIG1lc3NhZ2UgaGFzIGJlZW4gZGVsZXRlZFxuICAgIHRoaXMuY2xpZW50LnNldEhhbmRsZXIoJ2ZldGNoJywgKHJlc3BvbnNlKSA9PiB0aGlzLl91bnRhZ2dlZEZldGNoSGFuZGxlcihyZXNwb25zZSkpIC8vIG1lc3NhZ2UgaGFzIGJlZW4gdXBkYXRlZCAoZWcuIGZsYWcgY2hhbmdlKVxuXG4gICAgLy8gQWN0aXZhdGUgbG9nZ2luZ1xuICAgIHRoaXMuY3JlYXRlTG9nZ2VyKClcbiAgICB0aGlzLmxvZ0xldmVsID0gcHJvcE9yKExPR19MRVZFTF9BTEwsICdsb2dMZXZlbCcsIG9wdGlvbnMpXG4gIH1cblxuICAvKipcbiAgICogQ2FsbGVkIGlmIHRoZSBsb3dlci1sZXZlbCBJbWFwQ2xpZW50IGhhcyBlbmNvdW50ZXJlZCBhbiB1bnJlY292ZXJhYmxlXG4gICAqIGVycm9yIGR1cmluZyBvcGVyYXRpb24uIENsZWFucyB1cCBhbmQgcHJvcGFnYXRlcyB0aGUgZXJyb3IgdXB3YXJkcy5cbiAgICovXG4gIF9vbkVycm9yIChlcnIpIHtcbiAgICAvLyBtYWtlIHN1cmUgbm8gaWRsZSB0aW1lb3V0IGlzIHBlbmRpbmcgYW55bW9yZVxuICAgIGNsZWFyVGltZW91dCh0aGlzLl9pZGxlVGltZW91dClcblxuICAgIC8vIHByb3BhZ2F0ZSB0aGUgZXJyb3IgdXB3YXJkc1xuICAgIHRoaXMub25lcnJvciAmJiB0aGlzLm9uZXJyb3IoZXJyKVxuICB9XG5cbiAgLy9cbiAgLy9cbiAgLy8gUFVCTElDIEFQSVxuICAvL1xuICAvL1xuXG4gIC8qKlxuICAgKiBJbml0aWF0ZSBjb25uZWN0aW9uIGFuZCBsb2dpbiB0byB0aGUgSU1BUCBzZXJ2ZXJcbiAgICpcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2Ugd2hlbiBsb2dpbiBwcm9jZWR1cmUgaXMgY29tcGxldGVcbiAgICovXG4gIGFzeW5jIGNvbm5lY3QgKCkge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLm9wZW5Db25uZWN0aW9uKClcbiAgICAgIGF3YWl0IHRoaXMudXBncmFkZUNvbm5lY3Rpb24oKVxuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVJZCh0aGlzLl9jbGllbnRJZClcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICB0aGlzLmxvZ2dlci53YXJuKCdGYWlsZWQgdG8gdXBkYXRlIHNlcnZlciBpZCEnLCBlcnIubWVzc2FnZSlcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5sb2dpbih0aGlzLl9hdXRoKVxuICAgICAgYXdhaXQgdGhpcy5jb21wcmVzc0Nvbm5lY3Rpb24oKVxuICAgICAgdGhpcy5sb2dnZXIuZGVidWcoJ0Nvbm5lY3Rpb24gZXN0YWJsaXNoZWQsIHJlYWR5IHRvIHJvbGwhJylcbiAgICAgIHRoaXMuY2xpZW50Lm9uZXJyb3IgPSB0aGlzLl9vbkVycm9yLmJpbmQodGhpcylcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIHRoaXMubG9nZ2VyLmVycm9yKCdDb3VsZCBub3QgY29ubmVjdCB0byBzZXJ2ZXInLCBlcnIpXG4gICAgICB0aGlzLmNsb3NlKGVycikgLy8gd2UgZG9uJ3QgcmVhbGx5IGNhcmUgd2hldGhlciB0aGlzIHdvcmtzIG9yIG5vdFxuICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEluaXRpYXRlIGNvbm5lY3Rpb24gdG8gdGhlIElNQVAgc2VydmVyXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBjYXBhYmlsaXR5IG9mIHNlcnZlciB3aXRob3V0IGxvZ2luXG4gICAqL1xuICBvcGVuQ29ubmVjdGlvbiAoKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IGNvbm5lY3Rpb25UaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiByZWplY3QobmV3IEVycm9yKCdUaW1lb3V0IGNvbm5lY3RpbmcgdG8gc2VydmVyJykpLCB0aGlzLnRpbWVvdXRDb25uZWN0aW9uKVxuICAgICAgdGhpcy5sb2dnZXIuZGVidWcoJ0Nvbm5lY3RpbmcgdG8nLCB0aGlzLmNsaWVudC5ob3N0LCAnOicsIHRoaXMuY2xpZW50LnBvcnQpXG4gICAgICB0aGlzLl9jaGFuZ2VTdGF0ZShTVEFURV9DT05ORUNUSU5HKVxuICAgICAgdGhpcy5jbGllbnQuY29ubmVjdCgpLnRoZW4oKCkgPT4ge1xuICAgICAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnU29ja2V0IG9wZW5lZCwgd2FpdGluZyBmb3IgZ3JlZXRpbmcgZnJvbSB0aGUgc2VydmVyLi4uJylcblxuICAgICAgICB0aGlzLmNsaWVudC5vbnJlYWR5ID0gKCkgPT4ge1xuICAgICAgICAgIGNsZWFyVGltZW91dChjb25uZWN0aW9uVGltZW91dClcbiAgICAgICAgICB0aGlzLl9jaGFuZ2VTdGF0ZShTVEFURV9OT1RfQVVUSEVOVElDQVRFRClcbiAgICAgICAgICB0aGlzLnVwZGF0ZUNhcGFiaWxpdHkoKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gcmVzb2x2ZSh0aGlzLl9jYXBhYmlsaXR5KSlcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuY2xpZW50Lm9uZXJyb3IgPSAoZXJyKSA9PiB7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KGNvbm5lY3Rpb25UaW1lb3V0KVxuICAgICAgICAgIHJlamVjdChlcnIpXG4gICAgICAgIH1cbiAgICAgIH0pLmNhdGNoKHJlamVjdClcbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIExvZ291dFxuICAgKlxuICAgKiBTZW5kIExPR09VVCwgdG8gd2hpY2ggdGhlIHNlcnZlciByZXNwb25kcyBieSBjbG9zaW5nIHRoZSBjb25uZWN0aW9uLlxuICAgKiBVc2UgaXMgZGlzY291cmFnZWQgaWYgbmV0d29yayBzdGF0dXMgaXMgdW5jbGVhciEgSWYgbmV0d29ya3Mgc3RhdHVzIGlzXG4gICAqIHVuY2xlYXIsIHBsZWFzZSB1c2UgI2Nsb3NlIGluc3RlYWQhXG4gICAqXG4gICAqIExPR09VVCBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4xLjNcbiAgICpcbiAgICogQHJldHVybnMge1Byb21pc2V9IFJlc29sdmVzIHdoZW4gc2VydmVyIGhhcyBjbG9zZWQgdGhlIGNvbm5lY3Rpb25cbiAgICovXG4gIGFzeW5jIGxvZ291dCAoKSB7XG4gICAgdGhpcy5fY2hhbmdlU3RhdGUoU1RBVEVfTE9HT1VUKVxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdMb2dnaW5nIG91dC4uLicpXG4gICAgYXdhaXQgdGhpcy5jbGllbnQubG9nb3V0KClcbiAgICBjbGVhclRpbWVvdXQodGhpcy5faWRsZVRpbWVvdXQpXG4gIH1cblxuICAvKipcbiAgICogRm9yY2UtY2xvc2VzIHRoZSBjdXJyZW50IGNvbm5lY3Rpb24gYnkgY2xvc2luZyB0aGUgVENQIHNvY2tldC5cbiAgICpcbiAgICogQHJldHVybnMge1Byb21pc2V9IFJlc29sdmVzIHdoZW4gc29ja2V0IGlzIGNsb3NlZFxuICAgKi9cbiAgYXN5bmMgY2xvc2UgKGVycikge1xuICAgIHRoaXMuX2NoYW5nZVN0YXRlKFNUQVRFX0xPR09VVClcbiAgICBjbGVhclRpbWVvdXQodGhpcy5faWRsZVRpbWVvdXQpXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0Nsb3NpbmcgY29ubmVjdGlvbi4uLicpXG4gICAgYXdhaXQgdGhpcy5jbGllbnQuY2xvc2UoZXJyKVxuICAgIGNsZWFyVGltZW91dCh0aGlzLl9pZGxlVGltZW91dClcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIElEIGNvbW1hbmQsIHBhcnNlcyBJRCByZXNwb25zZSwgc2V0cyB0aGlzLnNlcnZlcklkXG4gICAqXG4gICAqIElEIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMjk3MVxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gaWQgSUQgYXMgSlNPTiBvYmplY3QuIFNlZSBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMyOTcxI3NlY3Rpb24tMy4zIGZvciBwb3NzaWJsZSB2YWx1ZXNcbiAgICogQHJldHVybnMge1Byb21pc2V9IFJlc29sdmVzIHdoZW4gcmVzcG9uc2UgaGFzIGJlZW4gcGFyc2VkXG4gICAqL1xuICBhc3luYyB1cGRhdGVJZCAoaWQpIHtcbiAgICBpZiAodGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdJRCcpIDwgMCkgcmV0dXJuXG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnVXBkYXRpbmcgaWQuLi4nKVxuXG4gICAgY29uc3QgY29tbWFuZCA9ICdJRCdcbiAgICBjb25zdCBhdHRyaWJ1dGVzID0gaWQgPyBbZmxhdHRlbihPYmplY3QuZW50cmllcyhpZCkpXSA6IFtudWxsXVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKHsgY29tbWFuZCwgYXR0cmlidXRlcyB9LCAnSUQnKVxuICAgIGNvbnN0IGxpc3QgPSBmbGF0dGVuKHBhdGhPcihbXSwgWydwYXlsb2FkJywgJ0lEJywgJzAnLCAnYXR0cmlidXRlcycsICcwJ10sIHJlc3BvbnNlKS5tYXAoT2JqZWN0LnZhbHVlcykpXG4gICAgY29uc3Qga2V5cyA9IGxpc3QuZmlsdGVyKChfLCBpKSA9PiBpICUgMiA9PT0gMClcbiAgICBjb25zdCB2YWx1ZXMgPSBsaXN0LmZpbHRlcigoXywgaSkgPT4gaSAlIDIgPT09IDEpXG4gICAgdGhpcy5zZXJ2ZXJJZCA9IGZyb21QYWlycyh6aXAoa2V5cywgdmFsdWVzKSlcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnU2VydmVyIGlkIHVwZGF0ZWQhJywgdGhpcy5zZXJ2ZXJJZClcbiAgfVxuXG4gIF9zaG91bGRTZWxlY3RNYWlsYm94IChwYXRoLCBjdHgpIHtcbiAgICBpZiAoIWN0eCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICBjb25zdCBwcmV2aW91c1NlbGVjdCA9IHRoaXMuY2xpZW50LmdldFByZXZpb3VzbHlRdWV1ZWQoWydTRUxFQ1QnLCAnRVhBTUlORSddLCBjdHgpXG4gICAgaWYgKHByZXZpb3VzU2VsZWN0ICYmIHByZXZpb3VzU2VsZWN0LnJlcXVlc3QuYXR0cmlidXRlcykge1xuICAgICAgY29uc3QgcGF0aEF0dHJpYnV0ZSA9IHByZXZpb3VzU2VsZWN0LnJlcXVlc3QuYXR0cmlidXRlcy5maW5kKChhdHRyaWJ1dGUpID0+IGF0dHJpYnV0ZS50eXBlID09PSAnU1RSSU5HJylcbiAgICAgIGlmIChwYXRoQXR0cmlidXRlKSB7XG4gICAgICAgIHJldHVybiBwYXRoQXR0cmlidXRlLnZhbHVlICE9PSBwYXRoXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX3NlbGVjdGVkTWFpbGJveCAhPT0gcGF0aFxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgU0VMRUNUIG9yIEVYQU1JTkUgdG8gb3BlbiBhIG1haWxib3hcbiAgICpcbiAgICogU0VMRUNUIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMy4xXG4gICAqIEVYQU1JTkUgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjJcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggRnVsbCBwYXRoIHRvIG1haWxib3hcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBPcHRpb25zIG9iamVjdFxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIGluZm9ybWF0aW9uIGFib3V0IHRoZSBzZWxlY3RlZCBtYWlsYm94XG4gICAqL1xuICBhc3luYyBzZWxlY3RNYWlsYm94IChwYXRoLCBvcHRpb25zID0ge30pIHtcbiAgICBjb25zdCBxdWVyeSA9IHtcbiAgICAgIGNvbW1hbmQ6IG9wdGlvbnMucmVhZE9ubHkgPyAnRVhBTUlORScgOiAnU0VMRUNUJyxcbiAgICAgIGF0dHJpYnV0ZXM6IFt7IHR5cGU6ICdTVFJJTkcnLCB2YWx1ZTogcGF0aCB9XVxuICAgIH1cblxuICAgIGlmIChvcHRpb25zLmNvbmRzdG9yZSAmJiB0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ0NPTkRTVE9SRScpID49IDApIHtcbiAgICAgIHF1ZXJ5LmF0dHJpYnV0ZXMucHVzaChbeyB0eXBlOiAnQVRPTScsIHZhbHVlOiAnQ09ORFNUT1JFJyB9XSlcbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnT3BlbmluZycsIHBhdGgsICcuLi4nKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKHF1ZXJ5LCBbJ0VYSVNUUycsICdGTEFHUycsICdPSyddLCB7IGN0eDogb3B0aW9ucy5jdHggfSlcbiAgICBjb25zdCBtYWlsYm94SW5mbyA9IHBhcnNlU0VMRUNUKHJlc3BvbnNlKVxuXG4gICAgdGhpcy5fY2hhbmdlU3RhdGUoU1RBVEVfU0VMRUNURUQpXG5cbiAgICBpZiAodGhpcy5fc2VsZWN0ZWRNYWlsYm94ICE9PSBwYXRoICYmIHRoaXMub25jbG9zZW1haWxib3gpIHtcbiAgICAgIGF3YWl0IHRoaXMub25jbG9zZW1haWxib3godGhpcy5fc2VsZWN0ZWRNYWlsYm94KVxuICAgIH1cbiAgICB0aGlzLl9zZWxlY3RlZE1haWxib3ggPSBwYXRoXG4gICAgaWYgKHRoaXMub25zZWxlY3RtYWlsYm94KSB7XG4gICAgICBhd2FpdCB0aGlzLm9uc2VsZWN0bWFpbGJveChwYXRoLCBtYWlsYm94SW5mbylcbiAgICB9XG5cbiAgICByZXR1cm4gbWFpbGJveEluZm9cbiAgfVxuXG4gIC8qKlxuICAgKiBTdWJzY3JpYmUgdG8gYSBtYWlsYm94IHdpdGggdGhlIGdpdmVuIHBhdGhcbiAgICpcbiAgICogU1VCU0NSSUJFIGRldGFpbHM6XG4gICAqICAgaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjMuNlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICAgKiAgICAgVGhlIHBhdGggb2YgdGhlIG1haWxib3ggeW91IHdvdWxkIGxpa2UgdG8gc3Vic2NyaWJlIHRvLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICogICAgIFByb21pc2UgcmVzb2x2ZXMgaWYgbWFpbGJveCBpcyBub3cgc3Vic2NyaWJlZCB0byBvciB3YXMgc28gYWxyZWFkeS5cbiAgICovXG4gIGFzeW5jIHN1YnNjcmliZU1haWxib3ggKHBhdGgpIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnU3Vic2NyaWJpbmcgdG8gbWFpbGJveCcsIHBhdGgsICcuLi4nKVxuICAgIHJldHVybiB0aGlzLmV4ZWMoeyBjb21tYW5kOiAnU1VCU0NSSUJFJywgYXR0cmlidXRlczogW3BhdGhdIH0pXG4gIH1cblxuICAvKipcbiAgICogVW5zdWJzY3JpYmUgZnJvbSBhIG1haWxib3ggd2l0aCB0aGUgZ2l2ZW4gcGF0aFxuICAgKlxuICAgKiBVTlNVQlNDUklCRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjdcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGhcbiAgICogICAgIFRoZSBwYXRoIG9mIHRoZSBtYWlsYm94IHlvdSB3b3VsZCBsaWtlIHRvIHVuc3Vic2NyaWJlIGZyb20uXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfVxuICAgKiAgICAgUHJvbWlzZSByZXNvbHZlcyBpZiBtYWlsYm94IGlzIG5vIGxvbmdlciBzdWJzY3JpYmVkIHRvIG9yIHdhcyBub3QgYmVmb3JlLlxuICAgKi9cbiAgYXN5bmMgdW5zdWJzY3JpYmVNYWlsYm94IChwYXRoKSB7XG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ1Vuc3Vic2NyaWJpbmcgdG8gbWFpbGJveCcsIHBhdGgsICcuLi4nKVxuICAgIHJldHVybiB0aGlzLmV4ZWMoeyBjb21tYW5kOiAnVU5TVUJTQ1JJQkUnLCBhdHRyaWJ1dGVzOiBbcGF0aF0gfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIE5BTUVTUEFDRSBjb21tYW5kXG4gICAqXG4gICAqIE5BTUVTUEFDRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMyMzQyXG4gICAqXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggbmFtZXNwYWNlIG9iamVjdFxuICAgKi9cbiAgYXN5bmMgbGlzdE5hbWVzcGFjZXMgKCkge1xuICAgIGlmICh0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ05BTUVTUEFDRScpIDwgMCkgcmV0dXJuIGZhbHNlXG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnTGlzdGluZyBuYW1lc3BhY2VzLi4uJylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYygnTkFNRVNQQUNFJywgJ05BTUVTUEFDRScpXG4gICAgcmV0dXJuIHBhcnNlTkFNRVNQQUNFKHJlc3BvbnNlKVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgTElTVCBhbmQgTFNVQiBjb21tYW5kcy4gUmV0cmlldmVzIGEgdHJlZSBvZiBhdmFpbGFibGUgbWFpbGJveGVzXG4gICAqXG4gICAqIExJU1QgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjhcbiAgICogTFNVQiBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjMuOVxuICAgKlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZSB3aXRoIGxpc3Qgb2YgbWFpbGJveGVzXG4gICAqL1xuICBhc3luYyBsaXN0TWFpbGJveGVzICgpIHtcbiAgICBjb25zdCB0cmVlID0geyByb290OiB0cnVlLCBjaGlsZHJlbjogW10gfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0xpc3RpbmcgbWFpbGJveGVzLi4uJylcbiAgICBjb25zdCBsaXN0UmVzcG9uc2UgPSBhd2FpdCB0aGlzLmV4ZWMoeyBjb21tYW5kOiAnTElTVCcsIGF0dHJpYnV0ZXM6IFsnJywgJyonXSB9LCAnTElTVCcpXG4gICAgY29uc3QgbGlzdCA9IHBhdGhPcihbXSwgWydwYXlsb2FkJywgJ0xJU1QnXSwgbGlzdFJlc3BvbnNlKVxuICAgIGxpc3QuZm9yRWFjaChpdGVtID0+IHtcbiAgICAgIGNvbnN0IGF0dHIgPSBwcm9wT3IoW10sICdhdHRyaWJ1dGVzJywgaXRlbSlcbiAgICAgIGlmIChhdHRyLmxlbmd0aCA8IDMpIHJldHVyblxuXG4gICAgICBjb25zdCBwYXRoID0gcGF0aE9yKCcnLCBbJzInLCAndmFsdWUnXSwgYXR0cilcbiAgICAgIGNvbnN0IGRlbGltID0gcGF0aE9yKCcvJywgWycxJywgJ3ZhbHVlJ10sIGF0dHIpXG4gICAgICBjb25zdCBicmFuY2ggPSB0aGlzLl9lbnN1cmVQYXRoKHRyZWUsIHBhdGgsIGRlbGltKVxuICAgICAgYnJhbmNoLmZsYWdzID0gcHJvcE9yKFtdLCAnMCcsIGF0dHIpLm1hcCgoeyB2YWx1ZSB9KSA9PiB2YWx1ZSB8fCAnJylcbiAgICAgIGJyYW5jaC5saXN0ZWQgPSB0cnVlXG4gICAgICBjaGVja1NwZWNpYWxVc2UoYnJhbmNoKVxuICAgIH0pXG5cbiAgICBjb25zdCBsc3ViUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmV4ZWMoeyBjb21tYW5kOiAnTFNVQicsIGF0dHJpYnV0ZXM6IFsnJywgJyonXSB9LCAnTFNVQicpLmNhdGNoKGVyciA9PiB7XG4gICAgICB0aGlzLmxvZ2dlci53YXJuKCdMU1VCIGNvbW1hbmQgZmFpbGVkOiAnLCBlcnIpXG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0pXG4gICAgY29uc3QgbHN1YiA9IHBhdGhPcihbXSwgWydwYXlsb2FkJywgJ0xTVUInXSwgbHN1YlJlc3BvbnNlKVxuICAgIGxzdWIuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgICAgY29uc3QgYXR0ciA9IHByb3BPcihbXSwgJ2F0dHJpYnV0ZXMnLCBpdGVtKVxuICAgICAgaWYgKGF0dHIubGVuZ3RoIDwgMykgcmV0dXJuXG5cbiAgICAgIGNvbnN0IHBhdGggPSBwYXRoT3IoJycsIFsnMicsICd2YWx1ZSddLCBhdHRyKVxuICAgICAgY29uc3QgZGVsaW0gPSBwYXRoT3IoJy8nLCBbJzEnLCAndmFsdWUnXSwgYXR0cilcbiAgICAgIGNvbnN0IGJyYW5jaCA9IHRoaXMuX2Vuc3VyZVBhdGgodHJlZSwgcGF0aCwgZGVsaW0pXG4gICAgICBwcm9wT3IoW10sICcwJywgYXR0cikubWFwKChmbGFnID0gJycpID0+IHsgYnJhbmNoLmZsYWdzID0gdW5pb24oYnJhbmNoLmZsYWdzLCBbZmxhZ10pIH0pXG4gICAgICBicmFuY2guc3Vic2NyaWJlZCA9IHRydWVcbiAgICB9KVxuXG4gICAgcmV0dXJuIHRyZWVcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBtYWlsYm94IHdpdGggdGhlIGdpdmVuIHBhdGguXG4gICAqXG4gICAqIENSRUFURSBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjMuM1xuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICAgKiAgICAgVGhlIHBhdGggb2YgdGhlIG1haWxib3ggeW91IHdvdWxkIGxpa2UgdG8gY3JlYXRlLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICogICAgIFByb21pc2UgcmVzb2x2ZXMgaWYgbWFpbGJveCB3YXMgY3JlYXRlZC5cbiAgICogICAgIEluIHRoZSBldmVudCB0aGUgc2VydmVyIHNheXMgTk8gW0FMUkVBRFlFWElTVFNdLCB3ZSB0cmVhdCB0aGF0IGFzIHN1Y2Nlc3MuXG4gICAqL1xuICBhc3luYyBjcmVhdGVNYWlsYm94IChwYXRoKSB7XG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0NyZWF0aW5nIG1haWxib3gnLCBwYXRoLCAnLi4uJylcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5leGVjKHsgY29tbWFuZDogJ0NSRUFURScsIGF0dHJpYnV0ZXM6IFtwYXRoXSB9KVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgaWYgKGVyciAmJiBlcnIuY29kZSA9PT0gJ0FMUkVBRFlFWElTVFMnKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIERlbGV0ZSBhIG1haWxib3ggd2l0aCB0aGUgZ2l2ZW4gcGF0aC5cbiAgICpcbiAgICogREVMRVRFIGRldGFpbHM6XG4gICAqICAgaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjMuNFxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aFxuICAgKiAgICAgVGhlIHBhdGggb2YgdGhlIG1haWxib3ggeW91IHdvdWxkIGxpa2UgdG8gZGVsZXRlLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAgICogICAgIFByb21pc2UgcmVzb2x2ZXMgaWYgbWFpbGJveCB3YXMgZGVsZXRlZC5cbiAgICovXG4gIGRlbGV0ZU1haWxib3ggKHBhdGgpIHtcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnRGVsZXRpbmcgbWFpbGJveCcsIHBhdGgsICcuLi4nKVxuICAgIHJldHVybiB0aGlzLmV4ZWMoeyBjb21tYW5kOiAnREVMRVRFJywgYXR0cmlidXRlczogW3BhdGhdIH0pXG4gIH1cblxuICAvKipcbiAgICogUnVucyBGRVRDSCBjb21tYW5kXG4gICAqXG4gICAqIEZFVENIIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuNC41XG4gICAqIENIQU5HRURTSU5DRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM0NTUxI3NlY3Rpb24tMy4zXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoIFRoZSBwYXRoIGZvciB0aGUgbWFpbGJveCB3aGljaCBzaG91bGQgYmUgc2VsZWN0ZWQgZm9yIHRoZSBjb21tYW5kLiBTZWxlY3RzIG1haWxib3ggaWYgbmVjZXNzYXJ5XG4gICAqIEBwYXJhbSB7U3RyaW5nfSBzZXF1ZW5jZSBTZXF1ZW5jZSBzZXQsIGVnIDE6KiBmb3IgYWxsIG1lc3NhZ2VzXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbaXRlbXNdIE1lc3NhZ2UgZGF0YSBpdGVtIG5hbWVzIG9yIG1hY3JvXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gUXVlcnkgbW9kaWZpZXJzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggdGhlIGZldGNoZWQgbWVzc2FnZSBpbmZvXG4gICAqL1xuICBhc3luYyBsaXN0TWVzc2FnZXMgKHBhdGgsIHNlcXVlbmNlLCBpdGVtcyA9IFt7IGZhc3Q6IHRydWUgfV0sIG9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdGZXRjaGluZyBtZXNzYWdlcycsIHNlcXVlbmNlLCAnZnJvbScsIHBhdGgsICcuLi4nKVxuICAgIGNvbnN0IGNvbW1hbmQgPSBidWlsZEZFVENIQ29tbWFuZChzZXF1ZW5jZSwgaXRlbXMsIG9wdGlvbnMpXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmV4ZWMoY29tbWFuZCwgJ0ZFVENIJywge1xuICAgICAgcHJlY2hlY2s6IChjdHgpID0+IHRoaXMuX3Nob3VsZFNlbGVjdE1haWxib3gocGF0aCwgY3R4KSA/IHRoaXMuc2VsZWN0TWFpbGJveChwYXRoLCB7IGN0eCB9KSA6IFByb21pc2UucmVzb2x2ZSgpXG4gICAgfSlcbiAgICByZXR1cm4gcGFyc2VGRVRDSChyZXNwb25zZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIFNFQVJDSCBjb21tYW5kXG4gICAqXG4gICAqIFNFQVJDSCBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjQuNFxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBmb3IgdGhlIG1haWxib3ggd2hpY2ggc2hvdWxkIGJlIHNlbGVjdGVkIGZvciB0aGUgY29tbWFuZC4gU2VsZWN0cyBtYWlsYm94IGlmIG5lY2Vzc2FyeVxuICAgKiBAcGFyYW0ge09iamVjdH0gcXVlcnkgU2VhcmNoIHRlcm1zXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gUXVlcnkgbW9kaWZpZXJzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggdGhlIGFycmF5IG9mIG1hdGNoaW5nIHNlcS4gb3IgdWlkIG51bWJlcnNcbiAgICovXG4gIGFzeW5jIHNlYXJjaCAocGF0aCwgcXVlcnksIG9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdTZWFyY2hpbmcgaW4nLCBwYXRoLCAnLi4uJylcbiAgICBjb25zdCBjb21tYW5kID0gYnVpbGRTRUFSQ0hDb21tYW5kKHF1ZXJ5LCBvcHRpb25zKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKGNvbW1hbmQsICdTRUFSQ0gnLCB7XG4gICAgICBwcmVjaGVjazogKGN0eCkgPT4gdGhpcy5fc2hvdWxkU2VsZWN0TWFpbGJveChwYXRoLCBjdHgpID8gdGhpcy5zZWxlY3RNYWlsYm94KHBhdGgsIHsgY3R4IH0pIDogUHJvbWlzZS5yZXNvbHZlKClcbiAgICB9KVxuICAgIHJldHVybiBwYXJzZVNFQVJDSChyZXNwb25zZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIFNUT1JFIGNvbW1hbmRcbiAgICpcbiAgICogU1RPUkUgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi40LjZcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHNlcXVlbmNlIE1lc3NhZ2Ugc2VsZWN0b3Igd2hpY2ggdGhlIGZsYWcgY2hhbmdlIGlzIGFwcGxpZWQgdG9cbiAgICogQHBhcmFtIHtBcnJheX0gZmxhZ3NcbiAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXSBRdWVyeSBtb2RpZmllcnNcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2Ugd2l0aCB0aGUgYXJyYXkgb2YgbWF0Y2hpbmcgc2VxLiBvciB1aWQgbnVtYmVyc1xuICAgKi9cbiAgc2V0RmxhZ3MgKHBhdGgsIHNlcXVlbmNlLCBmbGFncywgb3B0aW9ucykge1xuICAgIGxldCBrZXkgPSAnJ1xuICAgIGxldCBsaXN0ID0gW11cblxuICAgIGlmIChBcnJheS5pc0FycmF5KGZsYWdzKSB8fCB0eXBlb2YgZmxhZ3MgIT09ICdvYmplY3QnKSB7XG4gICAgICBsaXN0ID0gW10uY29uY2F0KGZsYWdzIHx8IFtdKVxuICAgICAga2V5ID0gJydcbiAgICB9IGVsc2UgaWYgKGZsYWdzLmFkZCkge1xuICAgICAgbGlzdCA9IFtdLmNvbmNhdChmbGFncy5hZGQgfHwgW10pXG4gICAgICBrZXkgPSAnKydcbiAgICB9IGVsc2UgaWYgKGZsYWdzLnNldCkge1xuICAgICAga2V5ID0gJydcbiAgICAgIGxpc3QgPSBbXS5jb25jYXQoZmxhZ3Muc2V0IHx8IFtdKVxuICAgIH0gZWxzZSBpZiAoZmxhZ3MucmVtb3ZlKSB7XG4gICAgICBrZXkgPSAnLSdcbiAgICAgIGxpc3QgPSBbXS5jb25jYXQoZmxhZ3MucmVtb3ZlIHx8IFtdKVxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdTZXR0aW5nIGZsYWdzIG9uJywgc2VxdWVuY2UsICdpbicsIHBhdGgsICcuLi4nKVxuICAgIHJldHVybiB0aGlzLnN0b3JlKHBhdGgsIHNlcXVlbmNlLCBrZXkgKyAnRkxBR1MnLCBsaXN0LCBvcHRpb25zKVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgU1RPUkUgY29tbWFuZFxuICAgKlxuICAgKiBTVE9SRSBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjQuNlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBmb3IgdGhlIG1haWxib3ggd2hpY2ggc2hvdWxkIGJlIHNlbGVjdGVkIGZvciB0aGUgY29tbWFuZC4gU2VsZWN0cyBtYWlsYm94IGlmIG5lY2Vzc2FyeVxuICAgKiBAcGFyYW0ge1N0cmluZ30gc2VxdWVuY2UgTWVzc2FnZSBzZWxlY3RvciB3aGljaCB0aGUgZmxhZyBjaGFuZ2UgaXMgYXBwbGllZCB0b1xuICAgKiBAcGFyYW0ge1N0cmluZ30gYWN0aW9uIFNUT1JFIG1ldGhvZCB0byBjYWxsLCBlZyBcIitGTEFHU1wiXG4gICAqIEBwYXJhbSB7QXJyYXl9IGZsYWdzXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gUXVlcnkgbW9kaWZpZXJzXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfSBQcm9taXNlIHdpdGggdGhlIGFycmF5IG9mIG1hdGNoaW5nIHNlcS4gb3IgdWlkIG51bWJlcnNcbiAgICovXG4gIGFzeW5jIHN0b3JlIChwYXRoLCBzZXF1ZW5jZSwgYWN0aW9uLCBmbGFncywgb3B0aW9ucyA9IHt9KSB7XG4gICAgY29uc3QgY29tbWFuZCA9IGJ1aWxkU1RPUkVDb21tYW5kKHNlcXVlbmNlLCBhY3Rpb24sIGZsYWdzLCBvcHRpb25zKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKGNvbW1hbmQsICdGRVRDSCcsIHtcbiAgICAgIHByZWNoZWNrOiAoY3R4KSA9PiB0aGlzLl9zaG91bGRTZWxlY3RNYWlsYm94KHBhdGgsIGN0eCkgPyB0aGlzLnNlbGVjdE1haWxib3gocGF0aCwgeyBjdHggfSkgOiBQcm9taXNlLnJlc29sdmUoKVxuICAgIH0pXG4gICAgcmV0dXJuIHBhcnNlRkVUQ0gocmVzcG9uc2UpXG4gIH1cblxuICAvKipcbiAgICogUnVucyBBUFBFTkQgY29tbWFuZFxuICAgKlxuICAgKiBBUFBFTkQgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4zLjExXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBkZXN0aW5hdGlvbiBUaGUgbWFpbGJveCB3aGVyZSB0byBhcHBlbmQgdGhlIG1lc3NhZ2VcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgVGhlIG1lc3NhZ2UgdG8gYXBwZW5kXG4gICAqIEBwYXJhbSB7QXJyYXl9IG9wdGlvbnMuZmxhZ3MgQW55IGZsYWdzIHlvdSB3YW50IHRvIHNldCBvbiB0aGUgdXBsb2FkZWQgbWVzc2FnZS4gRGVmYXVsdHMgdG8gW1xcU2Vlbl0uIChvcHRpb25hbClcbiAgICogQHJldHVybnMge1Byb21pc2V9IFByb21pc2Ugd2l0aCB0aGUgYXJyYXkgb2YgbWF0Y2hpbmcgc2VxLiBvciB1aWQgbnVtYmVyc1xuICAgKi9cbiAgYXN5bmMgdXBsb2FkIChkZXN0aW5hdGlvbiwgbWVzc2FnZSwgb3B0aW9ucyA9IHt9KSB7XG4gICAgY29uc3QgZmxhZ3MgPSBwcm9wT3IoWydcXFxcU2VlbiddLCAnZmxhZ3MnLCBvcHRpb25zKS5tYXAodmFsdWUgPT4gKHsgdHlwZTogJ2F0b20nLCB2YWx1ZSB9KSlcbiAgICBjb25zdCBjb21tYW5kID0ge1xuICAgICAgY29tbWFuZDogJ0FQUEVORCcsXG4gICAgICBhdHRyaWJ1dGVzOiBbXG4gICAgICAgIHsgdHlwZTogJ2F0b20nLCB2YWx1ZTogZGVzdGluYXRpb24gfSxcbiAgICAgICAgZmxhZ3MsXG4gICAgICAgIHsgdHlwZTogJ2xpdGVyYWwnLCB2YWx1ZTogbWVzc2FnZSB9XG4gICAgICBdXG4gICAgfVxuXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ1VwbG9hZGluZyBtZXNzYWdlIHRvJywgZGVzdGluYXRpb24sICcuLi4nKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKGNvbW1hbmQpXG4gICAgcmV0dXJuIHBhcnNlQVBQRU5EKHJlc3BvbnNlKVxuICB9XG5cbiAgLyoqXG4gICAqIERlbGV0ZXMgbWVzc2FnZXMgZnJvbSBhIHNlbGVjdGVkIG1haWxib3hcbiAgICpcbiAgICogRVhQVU5HRSBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjQuM1xuICAgKiBVSUQgRVhQVU5HRSBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM0MzE1I3NlY3Rpb24tMi4xXG4gICAqXG4gICAqIElmIHBvc3NpYmxlIChieVVpZDp0cnVlIGFuZCBVSURQTFVTIGV4dGVuc2lvbiBzdXBwb3J0ZWQpLCB1c2VzIFVJRCBFWFBVTkdFXG4gICAqIGNvbW1hbmQgdG8gZGVsZXRlIGEgcmFuZ2Ugb2YgbWVzc2FnZXMsIG90aGVyd2lzZSBmYWxscyBiYWNrIHRvIEVYUFVOR0UuXG4gICAqXG4gICAqIE5CISBUaGlzIG1ldGhvZCBtaWdodCBiZSBkZXN0cnVjdGl2ZSAtIGlmIEVYUFVOR0UgaXMgdXNlZCwgdGhlbiBhbnkgbWVzc2FnZXNcbiAgICogd2l0aCBcXERlbGV0ZWQgZmxhZyBzZXQgYXJlIGRlbGV0ZWRcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHNlcXVlbmNlIE1lc3NhZ2UgcmFuZ2UgdG8gYmUgZGVsZXRlZFxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZVxuICAgKi9cbiAgYXN5bmMgZGVsZXRlTWVzc2FnZXMgKHBhdGgsIHNlcXVlbmNlLCBvcHRpb25zID0ge30pIHtcbiAgICAvLyBhZGQgXFxEZWxldGVkIGZsYWcgdG8gdGhlIG1lc3NhZ2VzIGFuZCBydW4gRVhQVU5HRSBvciBVSUQgRVhQVU5HRVxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdEZWxldGluZyBtZXNzYWdlcycsIHNlcXVlbmNlLCAnaW4nLCBwYXRoLCAnLi4uJylcbiAgICBjb25zdCB1c2VVaWRQbHVzID0gb3B0aW9ucy5ieVVpZCAmJiB0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ1VJRFBMVVMnKSA+PSAwXG4gICAgY29uc3QgdWlkRXhwdW5nZUNvbW1hbmQgPSB7IGNvbW1hbmQ6ICdVSUQgRVhQVU5HRScsIGF0dHJpYnV0ZXM6IFt7IHR5cGU6ICdzZXF1ZW5jZScsIHZhbHVlOiBzZXF1ZW5jZSB9XSB9XG4gICAgYXdhaXQgdGhpcy5zZXRGbGFncyhwYXRoLCBzZXF1ZW5jZSwgeyBhZGQ6ICdcXFxcRGVsZXRlZCcgfSwgb3B0aW9ucylcbiAgICBjb25zdCBjbWQgPSB1c2VVaWRQbHVzID8gdWlkRXhwdW5nZUNvbW1hbmQgOiAnRVhQVU5HRSdcbiAgICByZXR1cm4gdGhpcy5leGVjKGNtZCwgbnVsbCwge1xuICAgICAgcHJlY2hlY2s6IChjdHgpID0+IHRoaXMuX3Nob3VsZFNlbGVjdE1haWxib3gocGF0aCwgY3R4KSA/IHRoaXMuc2VsZWN0TWFpbGJveChwYXRoLCB7IGN0eCB9KSA6IFByb21pc2UucmVzb2x2ZSgpXG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBDb3BpZXMgYSByYW5nZSBvZiBtZXNzYWdlcyBmcm9tIHRoZSBhY3RpdmUgbWFpbGJveCB0byB0aGUgZGVzdGluYXRpb24gbWFpbGJveC5cbiAgICogU2lsZW50IG1ldGhvZCAodW5sZXNzIGFuIGVycm9yIG9jY3VycyksIGJ5IGRlZmF1bHQgcmV0dXJucyBubyBpbmZvcm1hdGlvbi5cbiAgICpcbiAgICogQ09QWSBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM1MDEjc2VjdGlvbi02LjQuN1xuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ30gcGF0aCBUaGUgcGF0aCBmb3IgdGhlIG1haWxib3ggd2hpY2ggc2hvdWxkIGJlIHNlbGVjdGVkIGZvciB0aGUgY29tbWFuZC4gU2VsZWN0cyBtYWlsYm94IGlmIG5lY2Vzc2FyeVxuICAgKiBAcGFyYW0ge1N0cmluZ30gc2VxdWVuY2UgTWVzc2FnZSByYW5nZSB0byBiZSBjb3BpZWRcbiAgICogQHBhcmFtIHtTdHJpbmd9IGRlc3RpbmF0aW9uIERlc3RpbmF0aW9uIG1haWxib3ggcGF0aFxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtvcHRpb25zLmJ5VWlkXSBJZiB0cnVlLCB1c2VzIFVJRCBDT1BZIGluc3RlYWQgb2YgQ09QWVxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZVxuICAgKi9cbiAgYXN5bmMgY29weU1lc3NhZ2VzIChwYXRoLCBzZXF1ZW5jZSwgZGVzdGluYXRpb24sIG9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdDb3B5aW5nIG1lc3NhZ2VzJywgc2VxdWVuY2UsICdmcm9tJywgcGF0aCwgJ3RvJywgZGVzdGluYXRpb24sICcuLi4nKVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5leGVjKHtcbiAgICAgIGNvbW1hbmQ6IG9wdGlvbnMuYnlVaWQgPyAnVUlEIENPUFknIDogJ0NPUFknLFxuICAgICAgYXR0cmlidXRlczogW1xuICAgICAgICB7IHR5cGU6ICdzZXF1ZW5jZScsIHZhbHVlOiBzZXF1ZW5jZSB9LFxuICAgICAgICB7IHR5cGU6ICdhdG9tJywgdmFsdWU6IGRlc3RpbmF0aW9uIH1cbiAgICAgIF1cbiAgICB9LCBudWxsLCB7XG4gICAgICBwcmVjaGVjazogKGN0eCkgPT4gdGhpcy5fc2hvdWxkU2VsZWN0TWFpbGJveChwYXRoLCBjdHgpID8gdGhpcy5zZWxlY3RNYWlsYm94KHBhdGgsIHsgY3R4IH0pIDogUHJvbWlzZS5yZXNvbHZlKClcbiAgICB9KVxuICAgIHJldHVybiBwYXJzZUNPUFkocmVzcG9uc2UpXG4gIH1cblxuICAvKipcbiAgICogTW92ZXMgYSByYW5nZSBvZiBtZXNzYWdlcyBmcm9tIHRoZSBhY3RpdmUgbWFpbGJveCB0byB0aGUgZGVzdGluYXRpb24gbWFpbGJveC5cbiAgICogUHJlZmVycyB0aGUgTU9WRSBleHRlbnNpb24gYnV0IGlmIG5vdCBhdmFpbGFibGUsIGZhbGxzIGJhY2sgdG9cbiAgICogQ09QWSArIEVYUFVOR0VcbiAgICpcbiAgICogTU9WRSBkZXRhaWxzOlxuICAgKiAgIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzY4NTFcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhdGggVGhlIHBhdGggZm9yIHRoZSBtYWlsYm94IHdoaWNoIHNob3VsZCBiZSBzZWxlY3RlZCBmb3IgdGhlIGNvbW1hbmQuIFNlbGVjdHMgbWFpbGJveCBpZiBuZWNlc3NhcnlcbiAgICogQHBhcmFtIHtTdHJpbmd9IHNlcXVlbmNlIE1lc3NhZ2UgcmFuZ2UgdG8gYmUgbW92ZWRcbiAgICogQHBhcmFtIHtTdHJpbmd9IGRlc3RpbmF0aW9uIERlc3RpbmF0aW9uIG1haWxib3ggcGF0aFxuICAgKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFF1ZXJ5IG1vZGlmaWVyc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUHJvbWlzZVxuICAgKi9cbiAgYXN5bmMgbW92ZU1lc3NhZ2VzIChwYXRoLCBzZXF1ZW5jZSwgZGVzdGluYXRpb24sIG9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdNb3ZpbmcgbWVzc2FnZXMnLCBzZXF1ZW5jZSwgJ2Zyb20nLCBwYXRoLCAndG8nLCBkZXN0aW5hdGlvbiwgJy4uLicpXG5cbiAgICBpZiAodGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdNT1ZFJykgPT09IC0xKSB7XG4gICAgICAvLyBGYWxsYmFjayB0byBDT1BZICsgRVhQVU5HRVxuICAgICAgYXdhaXQgdGhpcy5jb3B5TWVzc2FnZXMocGF0aCwgc2VxdWVuY2UsIGRlc3RpbmF0aW9uLCBvcHRpb25zKVxuICAgICAgcmV0dXJuIHRoaXMuZGVsZXRlTWVzc2FnZXMocGF0aCwgc2VxdWVuY2UsIG9wdGlvbnMpXG4gICAgfVxuXG4gICAgLy8gSWYgcG9zc2libGUsIHVzZSBNT1ZFXG4gICAgcmV0dXJuIHRoaXMuZXhlYyh7XG4gICAgICBjb21tYW5kOiBvcHRpb25zLmJ5VWlkID8gJ1VJRCBNT1ZFJyA6ICdNT1ZFJyxcbiAgICAgIGF0dHJpYnV0ZXM6IFtcbiAgICAgICAgeyB0eXBlOiAnc2VxdWVuY2UnLCB2YWx1ZTogc2VxdWVuY2UgfSxcbiAgICAgICAgeyB0eXBlOiAnYXRvbScsIHZhbHVlOiBkZXN0aW5hdGlvbiB9XG4gICAgICBdXG4gICAgfSwgWydPSyddLCB7XG4gICAgICBwcmVjaGVjazogKGN0eCkgPT4gdGhpcy5fc2hvdWxkU2VsZWN0TWFpbGJveChwYXRoLCBjdHgpID8gdGhpcy5zZWxlY3RNYWlsYm94KHBhdGgsIHsgY3R4IH0pIDogUHJvbWlzZS5yZXNvbHZlKClcbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgQ09NUFJFU1MgY29tbWFuZFxuICAgKlxuICAgKiBDT01QUkVTUyBkZXRhaWxzOlxuICAgKiAgIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM0OTc4XG4gICAqL1xuICBhc3luYyBjb21wcmVzc0Nvbm5lY3Rpb24gKCkge1xuICAgIGlmICghdGhpcy5fZW5hYmxlQ29tcHJlc3Npb24gfHwgdGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdDT01QUkVTUz1ERUZMQVRFJykgPCAwIHx8IHRoaXMuY2xpZW50LmNvbXByZXNzZWQpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdFbmFibGluZyBjb21wcmVzc2lvbi4uLicpXG4gICAgYXdhaXQgdGhpcy5leGVjKHtcbiAgICAgIGNvbW1hbmQ6ICdDT01QUkVTUycsXG4gICAgICBhdHRyaWJ1dGVzOiBbe1xuICAgICAgICB0eXBlOiAnQVRPTScsXG4gICAgICAgIHZhbHVlOiAnREVGTEFURSdcbiAgICAgIH1dXG4gICAgfSlcbiAgICB0aGlzLmNsaWVudC5lbmFibGVDb21wcmVzc2lvbigpXG4gICAgdGhpcy5sb2dnZXIuZGVidWcoJ0NvbXByZXNzaW9uIGVuYWJsZWQsIGFsbCBkYXRhIHNlbnQgYW5kIHJlY2VpdmVkIGlzIGRlZmxhdGVkIScpXG4gIH1cblxuICAvKipcbiAgICogUnVucyBMT0dJTiBvciBBVVRIRU5USUNBVEUgWE9BVVRIMiBjb21tYW5kXG4gICAqXG4gICAqIExPR0lOIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMi4zXG4gICAqIFhPQVVUSDIgZGV0YWlsczpcbiAgICogICBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9nbWFpbC94b2F1dGgyX3Byb3RvY29sI2ltYXBfcHJvdG9jb2xfZXhjaGFuZ2VcbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd9IGF1dGgudXNlclxuICAgKiBAcGFyYW0ge1N0cmluZ30gYXV0aC5wYXNzXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBhdXRoLnhvYXV0aDJcbiAgICovXG4gIGFzeW5jIGxvZ2luIChhdXRoKSB7XG4gICAgbGV0IGNvbW1hbmRcbiAgICBjb25zdCBvcHRpb25zID0ge31cblxuICAgIGlmICghYXV0aCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBdXRoZW50aWNhdGlvbiBpbmZvcm1hdGlvbiBub3QgcHJvdmlkZWQnKVxuICAgIH1cblxuICAgIGlmICh0aGlzLl9jYXBhYmlsaXR5LmluZGV4T2YoJ0FVVEg9WE9BVVRIMicpID49IDAgJiYgYXV0aCAmJiBhdXRoLnhvYXV0aDIpIHtcbiAgICAgIGNvbW1hbmQgPSB7XG4gICAgICAgIGNvbW1hbmQ6ICdBVVRIRU5USUNBVEUnLFxuICAgICAgICBhdHRyaWJ1dGVzOiBbXG4gICAgICAgICAgeyB0eXBlOiAnQVRPTScsIHZhbHVlOiAnWE9BVVRIMicgfSxcbiAgICAgICAgICB7IHR5cGU6ICdBVE9NJywgdmFsdWU6IGJ1aWxkWE9BdXRoMlRva2VuKGF1dGgudXNlciwgYXV0aC54b2F1dGgyKSwgc2Vuc2l0aXZlOiB0cnVlIH1cbiAgICAgICAgXVxuICAgICAgfVxuXG4gICAgICBvcHRpb25zLmVycm9yUmVzcG9uc2VFeHBlY3RzRW1wdHlMaW5lID0gdHJ1ZSAvLyArIHRhZ2dlZCBlcnJvciByZXNwb25zZSBleHBlY3RzIGFuIGVtcHR5IGxpbmUgaW4gcmV0dXJuXG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbW1hbmQgPSB7XG4gICAgICAgIGNvbW1hbmQ6ICdsb2dpbicsXG4gICAgICAgIGF0dHJpYnV0ZXM6IFtcbiAgICAgICAgICB7IHR5cGU6ICdTVFJJTkcnLCB2YWx1ZTogYXV0aC51c2VyIHx8ICcnIH0sXG4gICAgICAgICAgeyB0eXBlOiAnU1RSSU5HJywgdmFsdWU6IGF1dGgucGFzcyB8fCAnJywgc2Vuc2l0aXZlOiB0cnVlIH1cbiAgICAgICAgXVxuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdMb2dnaW5nIGluLi4uJylcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZXhlYyhjb21tYW5kLCAnY2FwYWJpbGl0eScsIG9wdGlvbnMpXG4gICAgLypcbiAgICAgKiB1cGRhdGUgcG9zdC1hdXRoIGNhcGFiaWxpdGVzXG4gICAgICogY2FwYWJpbGl0eSBsaXN0IHNob3VsZG4ndCBjb250YWluIGF1dGggcmVsYXRlZCBzdHVmZiBhbnltb3JlXG4gICAgICogYnV0IHNvbWUgbmV3IGV4dGVuc2lvbnMgbWlnaHQgaGF2ZSBwb3BwZWQgdXAgdGhhdCBkbyBub3RcbiAgICAgKiBtYWtlIG11Y2ggc2Vuc2UgaW4gdGhlIG5vbi1hdXRoIHN0YXRlXG4gICAgICovXG4gICAgaWYgKHJlc3BvbnNlLmNhcGFiaWxpdHkgJiYgcmVzcG9uc2UuY2FwYWJpbGl0eS5sZW5ndGgpIHtcbiAgICAgIC8vIGNhcGFiaWxpdGVzIHdlcmUgbGlzdGVkIHdpdGggdGhlIE9LIFtDQVBBQklMSVRZIC4uLl0gcmVzcG9uc2VcbiAgICAgIHRoaXMuX2NhcGFiaWxpdHkgPSByZXNwb25zZS5jYXBhYmlsaXR5XG4gICAgfSBlbHNlIGlmIChyZXNwb25zZS5wYXlsb2FkICYmIHJlc3BvbnNlLnBheWxvYWQuQ0FQQUJJTElUWSAmJiByZXNwb25zZS5wYXlsb2FkLkNBUEFCSUxJVFkubGVuZ3RoKSB7XG4gICAgICAvLyBjYXBhYmlsaXRlcyB3ZXJlIGxpc3RlZCB3aXRoICogQ0FQQUJJTElUWSAuLi4gcmVzcG9uc2VcbiAgICAgIHRoaXMuX2NhcGFiaWxpdHkgPSByZXNwb25zZS5wYXlsb2FkLkNBUEFCSUxJVFkucG9wKCkuYXR0cmlidXRlcy5tYXAoKGNhcGEgPSAnJykgPT4gY2FwYS52YWx1ZS50b1VwcGVyQ2FzZSgpLnRyaW0oKSlcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gY2FwYWJpbGl0aWVzIHdlcmUgbm90IGF1dG9tYXRpY2FsbHkgbGlzdGVkLCByZWxvYWRcbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlQ2FwYWJpbGl0eSh0cnVlKVxuICAgIH1cblxuICAgIHRoaXMuX2NoYW5nZVN0YXRlKFNUQVRFX0FVVEhFTlRJQ0FURUQpXG4gICAgdGhpcy5fYXV0aGVudGljYXRlZCA9IHRydWVcbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnTG9naW4gc3VjY2Vzc2Z1bCwgcG9zdC1hdXRoIGNhcGFiaWxpdGVzIHVwZGF0ZWQhJywgdGhpcy5fY2FwYWJpbGl0eSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW4gYW4gSU1BUCBjb21tYW5kLlxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVxdWVzdCBTdHJ1Y3R1cmVkIHJlcXVlc3Qgb2JqZWN0XG4gICAqIEBwYXJhbSB7QXJyYXl9IGFjY2VwdFVudGFnZ2VkIGEgbGlzdCBvZiB1bnRhZ2dlZCByZXNwb25zZXMgdGhhdCB3aWxsIGJlIGluY2x1ZGVkIGluICdwYXlsb2FkJyBwcm9wZXJ0eVxuICAgKi9cbiAgYXN5bmMgZXhlYyAocmVxdWVzdCwgYWNjZXB0VW50YWdnZWQsIG9wdGlvbnMpIHtcbiAgICB0aGlzLmJyZWFrSWRsZSgpXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmNsaWVudC5lbnF1ZXVlQ29tbWFuZChyZXF1ZXN0LCBhY2NlcHRVbnRhZ2dlZCwgb3B0aW9ucylcbiAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2UuY2FwYWJpbGl0eSkge1xuICAgICAgdGhpcy5fY2FwYWJpbGl0eSA9IHJlc3BvbnNlLmNhcGFiaWxpdHlcbiAgICB9XG4gICAgcmV0dXJuIHJlc3BvbnNlXG4gIH1cblxuICAvKipcbiAgICogVGhlIGNvbm5lY3Rpb24gaXMgaWRsaW5nLiBTZW5kcyBhIE5PT1Agb3IgSURMRSBjb21tYW5kXG4gICAqXG4gICAqIElETEUgZGV0YWlsczpcbiAgICogICBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMjE3N1xuICAgKi9cbiAgZW50ZXJJZGxlICgpIHtcbiAgICBpZiAodGhpcy5fZW50ZXJlZElkbGUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICB0aGlzLl9lbnRlcmVkSWRsZSA9ICF0aGlzLl9pZ25vcmVJZGxlQ2FwYWJpbGl0eSAmJiB0aGlzLl9zZWxlY3RlZE1haWxib3ggJiYgdGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdJRExFJykgPj0gMCA/ICdJRExFJyA6ICdOT09QJ1xuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdFbnRlcmluZyBpZGxlIHdpdGggJyArIHRoaXMuX2VudGVyZWRJZGxlKVxuXG4gICAgaWYgKHRoaXMuX2VudGVyZWRJZGxlID09PSAnTk9PUCcpIHtcbiAgICAgIHRoaXMuX2lkbGVUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdTZW5kaW5nIE5PT1AnKVxuICAgICAgICB0aGlzLmV4ZWMoJ05PT1AnKVxuICAgICAgfSwgdGhpcy50aW1lb3V0Tm9vcClcbiAgICB9IGVsc2UgaWYgKHRoaXMuX2VudGVyZWRJZGxlID09PSAnSURMRScpIHtcbiAgICAgIHRoaXMuY2xpZW50LmVucXVldWVDb21tYW5kKHtcbiAgICAgICAgY29tbWFuZDogJ0lETEUnXG4gICAgICB9KVxuICAgICAgdGhpcy5faWRsZVRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgdGhpcy5jbGllbnQuc2VuZCgnRE9ORVxcclxcbicpXG4gICAgICAgIHRoaXMuX2VudGVyZWRJZGxlID0gZmFsc2VcbiAgICAgICAgdGhpcy5sb2dnZXIuZGVidWcoJ0lkbGUgdGVybWluYXRlZCcpXG4gICAgICB9LCB0aGlzLnRpbWVvdXRJZGxlKVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdG9wcyBhY3Rpb25zIHJlbGF0ZWQgaWRsaW5nLCBpZiBJRExFIGlzIHN1cHBvcnRlZCwgc2VuZHMgRE9ORSB0byBzdG9wIGl0XG4gICAqL1xuICBicmVha0lkbGUgKCkge1xuICAgIGlmICghdGhpcy5fZW50ZXJlZElkbGUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNsZWFyVGltZW91dCh0aGlzLl9pZGxlVGltZW91dClcbiAgICBpZiAodGhpcy5fZW50ZXJlZElkbGUgPT09ICdJRExFJykge1xuICAgICAgdGhpcy5jbGllbnQuc2VuZCgnRE9ORVxcclxcbicpXG4gICAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnSWRsZSB0ZXJtaW5hdGVkJylcbiAgICB9XG4gICAgdGhpcy5fZW50ZXJlZElkbGUgPSBmYWxzZVxuICB9XG5cbiAgLyoqXG4gICAqIFJ1bnMgU1RBUlRUTFMgY29tbWFuZCBpZiBuZWVkZWRcbiAgICpcbiAgICogU1RBUlRUTFMgZGV0YWlsczpcbiAgICogICBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzNTAxI3NlY3Rpb24tNi4yLjFcbiAgICpcbiAgICogQHBhcmFtIHtCb29sZWFufSBbZm9yY2VkXSBCeSBkZWZhdWx0IHRoZSBjb21tYW5kIGlzIG5vdCBydW4gaWYgY2FwYWJpbGl0eSBpcyBhbHJlYWR5IGxpc3RlZC4gU2V0IHRvIHRydWUgdG8gc2tpcCB0aGlzIHZhbGlkYXRpb25cbiAgICovXG4gIGFzeW5jIHVwZ3JhZGVDb25uZWN0aW9uICgpIHtcbiAgICAvLyBza2lwIHJlcXVlc3QsIGlmIGFscmVhZHkgc2VjdXJlZFxuICAgIGlmICh0aGlzLmNsaWVudC5zZWN1cmVNb2RlKSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG5cbiAgICAvLyBza2lwIGlmIFNUQVJUVExTIG5vdCBhdmFpbGFibGUgb3Igc3RhcnR0bHMgc3VwcG9ydCBkaXNhYmxlZFxuICAgIGlmICgodGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKCdTVEFSVFRMUycpIDwgMCB8fCB0aGlzLl9pZ25vcmVUTFMpICYmICF0aGlzLl9yZXF1aXJlVExTKSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnRW5jcnlwdGluZyBjb25uZWN0aW9uLi4uJylcbiAgICBhd2FpdCB0aGlzLmV4ZWMoJ1NUQVJUVExTJylcbiAgICB0aGlzLl9jYXBhYmlsaXR5ID0gW11cbiAgICB0aGlzLmNsaWVudC51cGdyYWRlKClcbiAgICByZXR1cm4gdGhpcy51cGRhdGVDYXBhYmlsaXR5KClcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIENBUEFCSUxJVFkgY29tbWFuZFxuICAgKlxuICAgKiBDQVBBQklMSVRZIGRldGFpbHM6XG4gICAqICAgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzUwMSNzZWN0aW9uLTYuMS4xXG4gICAqXG4gICAqIERvZXNuJ3QgcmVnaXN0ZXIgdW50YWdnZWQgQ0FQQUJJTElUWSBoYW5kbGVyIGFzIHRoaXMgaXMgYWxyZWFkeVxuICAgKiBoYW5kbGVkIGJ5IGdsb2JhbCBoYW5kbGVyXG4gICAqXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW2ZvcmNlZF0gQnkgZGVmYXVsdCB0aGUgY29tbWFuZCBpcyBub3QgcnVuIGlmIGNhcGFiaWxpdHkgaXMgYWxyZWFkeSBsaXN0ZWQuIFNldCB0byB0cnVlIHRvIHNraXAgdGhpcyB2YWxpZGF0aW9uXG4gICAqL1xuICBhc3luYyB1cGRhdGVDYXBhYmlsaXR5IChmb3JjZWQpIHtcbiAgICAvLyBza2lwIHJlcXVlc3QsIGlmIG5vdCBmb3JjZWQgdXBkYXRlIGFuZCBjYXBhYmlsaXRpZXMgYXJlIGFscmVhZHkgbG9hZGVkXG4gICAgaWYgKCFmb3JjZWQgJiYgdGhpcy5fY2FwYWJpbGl0eS5sZW5ndGgpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vIElmIFNUQVJUVExTIGlzIHJlcXVpcmVkIHRoZW4gc2tpcCBjYXBhYmlsaXR5IGxpc3RpbmcgYXMgd2UgYXJlIGdvaW5nIHRvIHRyeVxuICAgIC8vIFNUQVJUVExTIGFueXdheSBhbmQgd2UgcmUtY2hlY2sgY2FwYWJpbGl0aWVzIGFmdGVyIGNvbm5lY3Rpb24gaXMgc2VjdXJlZFxuICAgIGlmICghdGhpcy5jbGllbnQuc2VjdXJlTW9kZSAmJiB0aGlzLl9yZXF1aXJlVExTKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnVXBkYXRpbmcgY2FwYWJpbGl0eS4uLicpXG4gICAgcmV0dXJuIHRoaXMuZXhlYygnQ0FQQUJJTElUWScpXG4gIH1cblxuICBoYXNDYXBhYmlsaXR5IChjYXBhID0gJycpIHtcbiAgICByZXR1cm4gdGhpcy5fY2FwYWJpbGl0eS5pbmRleE9mKGNhcGEudG9VcHBlckNhc2UoKS50cmltKCkpID49IDBcbiAgfVxuXG4gIC8vIERlZmF1bHQgaGFuZGxlcnMgZm9yIHVudGFnZ2VkIHJlc3BvbnNlc1xuXG4gIC8qKlxuICAgKiBDaGVja3MgaWYgYW4gdW50YWdnZWQgT0sgaW5jbHVkZXMgW0NBUEFCSUxJVFldIHRhZyBhbmQgdXBkYXRlcyBjYXBhYmlsaXR5IG9iamVjdFxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVzcG9uc2UgUGFyc2VkIHNlcnZlciByZXNwb25zZVxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0IFVudGlsIGNhbGxlZCwgc2VydmVyIHJlc3BvbnNlcyBhcmUgbm90IHByb2Nlc3NlZFxuICAgKi9cbiAgX3VudGFnZ2VkT2tIYW5kbGVyIChyZXNwb25zZSkge1xuICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5jYXBhYmlsaXR5KSB7XG4gICAgICB0aGlzLl9jYXBhYmlsaXR5ID0gcmVzcG9uc2UuY2FwYWJpbGl0eVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGVzIGNhcGFiaWxpdHkgb2JqZWN0XG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXNwb25zZSBQYXJzZWQgc2VydmVyIHJlc3BvbnNlXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHQgVW50aWwgY2FsbGVkLCBzZXJ2ZXIgcmVzcG9uc2VzIGFyZSBub3QgcHJvY2Vzc2VkXG4gICAqL1xuICBfdW50YWdnZWRDYXBhYmlsaXR5SGFuZGxlciAocmVzcG9uc2UpIHtcbiAgICB0aGlzLl9jYXBhYmlsaXR5ID0gcGlwZShcbiAgICAgIHByb3BPcihbXSwgJ2F0dHJpYnV0ZXMnKSxcbiAgICAgIG1hcCgoeyB2YWx1ZSB9KSA9PiAodmFsdWUgfHwgJycpLnRvVXBwZXJDYXNlKCkudHJpbSgpKVxuICAgICkocmVzcG9uc2UpXG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlcyBleGlzdGluZyBtZXNzYWdlIGNvdW50XG4gICAqXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXNwb25zZSBQYXJzZWQgc2VydmVyIHJlc3BvbnNlXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IG5leHQgVW50aWwgY2FsbGVkLCBzZXJ2ZXIgcmVzcG9uc2VzIGFyZSBub3QgcHJvY2Vzc2VkXG4gICAqL1xuICBfdW50YWdnZWRFeGlzdHNIYW5kbGVyIChyZXNwb25zZSkge1xuICAgIGlmIChyZXNwb25zZSAmJiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzcG9uc2UsICducicpKSB7XG4gICAgICB0aGlzLm9udXBkYXRlICYmIHRoaXMub251cGRhdGUodGhpcy5fc2VsZWN0ZWRNYWlsYm94LCAnZXhpc3RzJywgcmVzcG9uc2UubnIpXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEluZGljYXRlcyBhIG1lc3NhZ2UgaGFzIGJlZW4gZGVsZXRlZFxuICAgKlxuICAgKiBAcGFyYW0ge09iamVjdH0gcmVzcG9uc2UgUGFyc2VkIHNlcnZlciByZXNwb25zZVxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBuZXh0IFVudGlsIGNhbGxlZCwgc2VydmVyIHJlc3BvbnNlcyBhcmUgbm90IHByb2Nlc3NlZFxuICAgKi9cbiAgX3VudGFnZ2VkRXhwdW5nZUhhbmRsZXIgKHJlc3BvbnNlKSB7XG4gICAgaWYgKHJlc3BvbnNlICYmIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXNwb25zZSwgJ25yJykpIHtcbiAgICAgIHRoaXMub251cGRhdGUgJiYgdGhpcy5vbnVwZGF0ZSh0aGlzLl9zZWxlY3RlZE1haWxib3gsICdleHB1bmdlJywgcmVzcG9uc2UubnIpXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEluZGljYXRlcyB0aGF0IGZsYWdzIGhhdmUgYmVlbiB1cGRhdGVkIGZvciBhIG1lc3NhZ2VcbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlc3BvbnNlIFBhcnNlZCBzZXJ2ZXIgcmVzcG9uc2VcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gbmV4dCBVbnRpbCBjYWxsZWQsIHNlcnZlciByZXNwb25zZXMgYXJlIG5vdCBwcm9jZXNzZWRcbiAgICovXG4gIF91bnRhZ2dlZEZldGNoSGFuZGxlciAocmVzcG9uc2UpIHtcbiAgICB0aGlzLm9udXBkYXRlICYmIHRoaXMub251cGRhdGUodGhpcy5fc2VsZWN0ZWRNYWlsYm94LCAnZmV0Y2gnLCBbXS5jb25jYXQocGFyc2VGRVRDSCh7IHBheWxvYWQ6IHsgRkVUQ0g6IFtyZXNwb25zZV0gfSB9KSB8fCBbXSkuc2hpZnQoKSlcbiAgfVxuXG4gIC8vIFByaXZhdGUgaGVscGVyc1xuXG4gIC8qKlxuICAgKiBJbmRpY2F0ZXMgdGhhdCB0aGUgY29ubmVjdGlvbiBzdGFydGVkIGlkbGluZy4gSW5pdGlhdGVzIGEgY3ljbGVcbiAgICogb2YgTk9PUHMgb3IgSURMRXMgdG8gcmVjZWl2ZSBub3RpZmljYXRpb25zIGFib3V0IHVwZGF0ZXMgaW4gdGhlIHNlcnZlclxuICAgKi9cbiAgX29uSWRsZSAoKSB7XG4gICAgaWYgKCF0aGlzLl9hdXRoZW50aWNhdGVkIHx8IHRoaXMuX2VudGVyZWRJZGxlKSB7XG4gICAgICAvLyBObyBuZWVkIHRvIElETEUgd2hlbiBub3QgbG9nZ2VkIGluIG9yIGFscmVhZHkgaWRsaW5nXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB0aGlzLmxvZ2dlci5kZWJ1ZygnQ2xpZW50IHN0YXJ0ZWQgaWRsaW5nJylcbiAgICB0aGlzLmVudGVySWRsZSgpXG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlcyB0aGUgSU1BUCBzdGF0ZSB2YWx1ZSBmb3IgdGhlIGN1cnJlbnQgY29ubmVjdGlvblxuICAgKlxuICAgKiBAcGFyYW0ge051bWJlcn0gbmV3U3RhdGUgVGhlIHN0YXRlIHlvdSB3YW50IHRvIGNoYW5nZSB0b1xuICAgKi9cbiAgX2NoYW5nZVN0YXRlIChuZXdTdGF0ZSkge1xuICAgIGlmIChuZXdTdGF0ZSA9PT0gdGhpcy5fc3RhdGUpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHRoaXMubG9nZ2VyLmRlYnVnKCdFbnRlcmluZyBzdGF0ZTogJyArIG5ld1N0YXRlKVxuXG4gICAgLy8gaWYgYSBtYWlsYm94IHdhcyBvcGVuZWQsIGVtaXQgb25jbG9zZW1haWxib3ggYW5kIGNsZWFyIHNlbGVjdGVkTWFpbGJveCB2YWx1ZVxuICAgIGlmICh0aGlzLl9zdGF0ZSA9PT0gU1RBVEVfU0VMRUNURUQgJiYgdGhpcy5fc2VsZWN0ZWRNYWlsYm94KSB7XG4gICAgICB0aGlzLm9uY2xvc2VtYWlsYm94ICYmIHRoaXMub25jbG9zZW1haWxib3godGhpcy5fc2VsZWN0ZWRNYWlsYm94KVxuICAgICAgdGhpcy5fc2VsZWN0ZWRNYWlsYm94ID0gZmFsc2VcbiAgICB9XG5cbiAgICB0aGlzLl9zdGF0ZSA9IG5ld1N0YXRlXG4gIH1cblxuICAvKipcbiAgICogRW5zdXJlcyBhIHBhdGggZXhpc3RzIGluIHRoZSBNYWlsYm94IHRyZWVcbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IHRyZWUgTWFpbGJveCB0cmVlXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXRoXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBkZWxpbWl0ZXJcbiAgICogQHJldHVybiB7T2JqZWN0fSBicmFuY2ggZm9yIHVzZWQgcGF0aFxuICAgKi9cbiAgX2Vuc3VyZVBhdGggKHRyZWUsIHBhdGgsIGRlbGltaXRlcikge1xuICAgIGNvbnN0IG5hbWVzID0gcGF0aC5zcGxpdChkZWxpbWl0ZXIpXG4gICAgbGV0IGJyYW5jaCA9IHRyZWVcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbmFtZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGxldCBmb3VuZCA9IGZhbHNlXG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGJyYW5jaC5jaGlsZHJlbi5sZW5ndGg7IGorKykge1xuICAgICAgICBpZiAodGhpcy5fY29tcGFyZU1haWxib3hOYW1lcyhicmFuY2guY2hpbGRyZW5bal0ubmFtZSwgaW1hcERlY29kZShuYW1lc1tpXSkpKSB7XG4gICAgICAgICAgYnJhbmNoID0gYnJhbmNoLmNoaWxkcmVuW2pdXG4gICAgICAgICAgZm91bmQgPSB0cnVlXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKCFmb3VuZCkge1xuICAgICAgICBicmFuY2guY2hpbGRyZW4ucHVzaCh7XG4gICAgICAgICAgbmFtZTogaW1hcERlY29kZShuYW1lc1tpXSksXG4gICAgICAgICAgZGVsaW1pdGVyOiBkZWxpbWl0ZXIsXG4gICAgICAgICAgcGF0aDogbmFtZXMuc2xpY2UoMCwgaSArIDEpLmpvaW4oZGVsaW1pdGVyKSxcbiAgICAgICAgICBjaGlsZHJlbjogW11cbiAgICAgICAgfSlcbiAgICAgICAgYnJhbmNoID0gYnJhbmNoLmNoaWxkcmVuW2JyYW5jaC5jaGlsZHJlbi5sZW5ndGggLSAxXVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYnJhbmNoXG4gIH1cblxuICAvKipcbiAgICogQ29tcGFyZXMgdHdvIG1haWxib3ggbmFtZXMuIENhc2UgaW5zZW5zaXRpdmUgaW4gY2FzZSBvZiBJTkJPWCwgb3RoZXJ3aXNlIGNhc2Ugc2Vuc2l0aXZlXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBhIE1haWxib3ggbmFtZVxuICAgKiBAcGFyYW0ge1N0cmluZ30gYiBNYWlsYm94IG5hbWVcbiAgICogQHJldHVybnMge0Jvb2xlYW59IFRydWUgaWYgdGhlIGZvbGRlciBuYW1lcyBtYXRjaFxuICAgKi9cbiAgX2NvbXBhcmVNYWlsYm94TmFtZXMgKGEsIGIpIHtcbiAgICByZXR1cm4gKGEudG9VcHBlckNhc2UoKSA9PT0gJ0lOQk9YJyA/ICdJTkJPWCcgOiBhKSA9PT0gKGIudG9VcHBlckNhc2UoKSA9PT0gJ0lOQk9YJyA/ICdJTkJPWCcgOiBiKVxuICB9XG5cbiAgY3JlYXRlTG9nZ2VyIChjcmVhdG9yID0gY3JlYXRlRGVmYXVsdExvZ2dlcikge1xuICAgIGNvbnN0IGxvZ2dlciA9IGNyZWF0b3IoKHRoaXMuX2F1dGggfHwge30pLnVzZXIgfHwgJycsIHRoaXMuX2hvc3QpXG4gICAgdGhpcy5sb2dnZXIgPSB0aGlzLmNsaWVudC5sb2dnZXIgPSB7XG4gICAgICBkZWJ1ZzogKC4uLm1zZ3MpID0+IHsgaWYgKExPR19MRVZFTF9ERUJVRyA+PSB0aGlzLmxvZ0xldmVsKSB7IGxvZ2dlci5kZWJ1Zyhtc2dzKSB9IH0sXG4gICAgICBpbmZvOiAoLi4ubXNncykgPT4geyBpZiAoTE9HX0xFVkVMX0lORk8gPj0gdGhpcy5sb2dMZXZlbCkgeyBsb2dnZXIuaW5mbyhtc2dzKSB9IH0sXG4gICAgICB3YXJuOiAoLi4ubXNncykgPT4geyBpZiAoTE9HX0xFVkVMX1dBUk4gPj0gdGhpcy5sb2dMZXZlbCkgeyBsb2dnZXIud2Fybihtc2dzKSB9IH0sXG4gICAgICBlcnJvcjogKC4uLm1zZ3MpID0+IHsgaWYgKExPR19MRVZFTF9FUlJPUiA+PSB0aGlzLmxvZ0xldmVsKSB7IGxvZ2dlci5lcnJvcihtc2dzKSB9IH1cbiAgICB9XG4gIH1cbn1cbiJdfQ==