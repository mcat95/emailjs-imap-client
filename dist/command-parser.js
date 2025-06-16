"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.parseAPPEND = parseAPPEND;
exports.parseBODYSTRUCTURE = parseBODYSTRUCTURE;
exports.parseCOPY = parseCOPY;
exports.parseENVELOPE = parseENVELOPE;
exports.parseFETCH = parseFETCH;
exports.parseNAMESPACE = parseNAMESPACE;
exports.parseNAMESPACEElement = parseNAMESPACEElement;
exports.parseSEARCH = parseSEARCH;
exports.parseSELECT = parseSELECT;
var _emailjsAddressparser = _interopRequireDefault(require("emailjs-addressparser"));
var _emailjsImapHandler = require("emailjs-imap-handler");
var _ramda = require("ramda");
var _emailjsMimeCodec = require("emailjs-mime-codec");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * Parses NAMESPACE response
 *
 * @param {Object} response
 * @return {Object} Namespaces object
 */
function parseNAMESPACE(response) {
  if (!response.payload || !response.payload.NAMESPACE || !response.payload.NAMESPACE.length) {
    return false;
  }
  const attributes = [].concat(response.payload.NAMESPACE.pop().attributes || []);
  if (!attributes.length) {
    return false;
  }
  return {
    personal: parseNAMESPACEElement(attributes[0]),
    users: parseNAMESPACEElement(attributes[1]),
    shared: parseNAMESPACEElement(attributes[2])
  };
}

/**
 * Parses a NAMESPACE element
 *
 * @param {Object} element
 * @return {Object} Namespaces element object
 */
function parseNAMESPACEElement(element) {
  if (!element) {
    return false;
  }
  element = [].concat(element || []);
  return element.map(ns => {
    if (!ns || !ns.length) {
      return false;
    }
    return {
      prefix: ns[0].value,
      delimiter: ns[1] && ns[1].value // The delimiter can legally be NIL which maps to null
    };
  });
}

/**
 * Parses SELECT response
 *
 * @param {Object} response
 * @return {Object} Mailbox information object
 */
function parseSELECT(response) {
  if (!response || !response.payload) {
    return;
  }
  const mailbox = {
    readOnly: response.code === 'READ-ONLY'
  };
  const existsResponse = response.payload.EXISTS && response.payload.EXISTS.pop();
  const flagsResponse = response.payload.FLAGS && response.payload.FLAGS.pop();
  const okResponse = response.payload.OK;
  if (existsResponse) {
    mailbox.exists = existsResponse.nr || 0;
  }
  if (flagsResponse && flagsResponse.attributes && flagsResponse.attributes.length) {
    mailbox.flags = flagsResponse.attributes[0].map(flag => (flag.value || '').toString().trim());
  }
  [].concat(okResponse || []).forEach(ok => {
    switch (ok && ok.code) {
      case 'PERMANENTFLAGS':
        mailbox.permanentFlags = [].concat(ok.permanentflags || []);
        break;
      case 'UIDVALIDITY':
        mailbox.uidValidity = Number(ok.uidvalidity) || 0;
        break;
      case 'UIDNEXT':
        mailbox.uidNext = Number(ok.uidnext) || 0;
        break;
      case 'HIGHESTMODSEQ':
        mailbox.highestModseq = ok.highestmodseq || '0'; // keep 64bit uint as a string
        break;
      case 'NOMODSEQ':
        mailbox.noModseq = true;
        break;
    }
  });
  return mailbox;
}

/**
 * Parses message envelope from FETCH response. All keys in the resulting
 * object are lowercase. Address fields are all arrays with {name:, address:}
 * structured values. Unicode strings are automatically decoded.
 *
 * @param {Array} value Envelope array
 * @param {Object} Envelope object
 */
function parseENVELOPE(value) {
  const envelope = {};
  if (value[0] && value[0].value) {
    envelope.date = value[0].value;
  }
  if (value[1] && value[1].value) {
    envelope.subject = (0, _emailjsMimeCodec.mimeWordsDecode)(value[1] && value[1].value);
  }
  if (value[2] && value[2].length) {
    envelope.from = processAddresses(value[2]);
  }
  if (value[3] && value[3].length) {
    envelope.sender = processAddresses(value[3]);
  }
  if (value[4] && value[4].length) {
    envelope['reply-to'] = processAddresses(value[4]);
  }
  if (value[5] && value[5].length) {
    envelope.to = processAddresses(value[5]);
  }
  if (value[6] && value[6].length) {
    envelope.cc = processAddresses(value[6]);
  }
  if (value[7] && value[7].length) {
    envelope.bcc = processAddresses(value[7]);
  }
  if (value[8] && value[8].value) {
    envelope['in-reply-to'] = value[8].value;
  }
  if (value[9] && value[9].value) {
    envelope['message-id'] = value[9].value;
  }
  return envelope;
}

/*
 * ENVELOPE lists addresses as [name-part, source-route, username, hostname]
 * where source-route is not used anymore and can be ignored.
 * To get comparable results with other parts of the email.js stack
 * browserbox feeds the parsed address values from ENVELOPE
 * to addressparser and uses resulting values instead of the
 * pre-parsed addresses
 */
function processAddresses(list = []) {
  return list.map(addr => {
    const name = (0, _ramda.pathOr)('', ['0', 'value'], addr).trim();
    const address = (0, _ramda.pathOr)('', ['2', 'value'], addr) + '@' + (0, _ramda.pathOr)('', ['3', 'value'], addr);
    const formatted = name ? encodeAddressName(name) + ' <' + address + '>' : address;
    const parsed = (0, _emailjsAddressparser.default)(formatted).shift(); // there should be just a single address
    parsed.name = (0, _emailjsMimeCodec.mimeWordsDecode)(parsed.name);
    return parsed;
  });
}

/**
 * If needed, encloses with quotes or mime encodes the name part of an e-mail address
 *
 * @param {String} name Name part of an address
 * @returns {String} Mime word encoded or quoted string
 */
function encodeAddressName(name) {
  if (!/^[\w ']*$/.test(name)) {
    if (/^[\x20-\x7e]*$/.test(name)) {
      return JSON.stringify(name);
    } else {
      return (0, _emailjsMimeCodec.mimeWordEncode)(name, 'Q', 52);
    }
  }
  return name;
}

/**
 * Parses message body structure from FETCH response.
 *
 * @param {Array} value BODYSTRUCTURE array
 * @param {Object} Envelope object
 */
function parseBODYSTRUCTURE(node, path = []) {
  const curNode = {};
  let i = 0;
  let part = 0;
  if (path.length) {
    curNode.part = path.join('.');
  }

  // multipart
  if (Array.isArray(node[0])) {
    curNode.childNodes = [];
    while (Array.isArray(node[i])) {
      curNode.childNodes.push(parseBODYSTRUCTURE(node[i], path.concat(++part)));
      i++;
    }

    // multipart type
    curNode.type = 'multipart/' + ((node[i++] || {}).value || '').toString().toLowerCase();

    // extension data (not available for BODY requests)

    // body parameter parenthesized list
    if (i < node.length - 1) {
      if (node[i]) {
        curNode.parameters = attributesToObject(node[i]);
      }
      i++;
    }
  } else {
    // content type
    curNode.type = [((node[i++] || {}).value || '').toString().toLowerCase(), ((node[i++] || {}).value || '').toString().toLowerCase()].join('/');

    // body parameter parenthesized list
    if (node[i]) {
      curNode.parameters = attributesToObject(node[i]);
    }
    i++;

    // id
    if (node[i]) {
      curNode.id = ((node[i] || {}).value || '').toString();
    }
    i++;

    // description
    if (node[i]) {
      curNode.description = ((node[i] || {}).value || '').toString();
    }
    i++;

    // encoding
    if (node[i]) {
      curNode.encoding = ((node[i] || {}).value || '').toString().toLowerCase();
    }
    i++;

    // size
    if (node[i]) {
      curNode.size = Number((node[i] || {}).value || 0) || 0;
    }
    i++;
    if (curNode.type === 'message/rfc822') {
      // message/rfc adds additional envelope, bodystructure and line count values

      // envelope
      if (node[i]) {
        curNode.envelope = parseENVELOPE([].concat(node[i] || []));
      }
      i++;
      if (node[i]) {
        curNode.childNodes = [
        // rfc822 bodyparts share the same path, difference is between MIME and HEADER
        // path.MIME returns message/rfc822 header
        // path.HEADER returns inlined message header
        parseBODYSTRUCTURE(node[i], path)];
      }
      i++;

      // line count
      if (node[i]) {
        curNode.lineCount = Number((node[i] || {}).value || 0) || 0;
      }
      i++;
    } else if (/^text\//.test(curNode.type)) {
      // text/* adds additional line count values

      // line count
      if (node[i]) {
        curNode.lineCount = Number((node[i] || {}).value || 0) || 0;
      }
      i++;
    }

    // extension data (not available for BODY requests)

    // md5
    if (i < node.length - 1) {
      if (node[i]) {
        curNode.md5 = ((node[i] || {}).value || '').toString().toLowerCase();
      }
      i++;
    }
  }

  // the following are shared extension values (for both multipart and non-multipart parts)
  // not available for BODY requests

  // body disposition
  if (i < node.length - 1) {
    if (Array.isArray(node[i]) && node[i].length) {
      curNode.disposition = ((node[i][0] || {}).value || '').toString().toLowerCase();
      if (Array.isArray(node[i][1])) {
        curNode.dispositionParameters = attributesToObject(node[i][1]);
      }
    }
    i++;
  }

  // body language
  if (i < node.length - 1) {
    if (node[i]) {
      curNode.language = [].concat(node[i]).map(val => (0, _ramda.propOr)('', 'value', val).toLowerCase());
    }
    i++;
  }

  // body location
  // NB! defined as a "string list" in RFC3501 but replaced in errata document with "string"
  // Errata: http://www.rfc-editor.org/errata_search.php?rfc=3501
  if (i < node.length - 1) {
    if (node[i]) {
      curNode.location = ((node[i] || {}).value || '').toString();
    }
    i++;
  }
  return curNode;
}
function attributesToObject(attrs = [], keyTransform = _ramda.toLower, valueTransform = _emailjsMimeCodec.mimeWordsDecode) {
  const vals = attrs.map((0, _ramda.prop)('value'));
  const keys = vals.filter((_, i) => i % 2 === 0).map(keyTransform);
  const values = vals.filter((_, i) => i % 2 === 1).map(valueTransform);
  return (0, _ramda.fromPairs)((0, _ramda.zip)(keys, values));
}

/**
 * Parses FETCH response
 *
 * @param {Object} response
 * @return {Object} Message object
 */
function parseFETCH(response) {
  if (!response || !response.payload || !response.payload.FETCH || !response.payload.FETCH.length) {
    return [];
  }
  const list = [];
  const messages = {};
  response.payload.FETCH.forEach(item => {
    const params = [].concat([].concat(item.attributes || [])[0] || []); // ensure the first value is an array
    let message;
    let i, len, key;
    if (messages[item.nr]) {
      // same sequence number is already used, so merge values instead of creating a new message object
      message = messages[item.nr];
    } else {
      messages[item.nr] = message = {
        '#': item.nr
      };
      list.push(message);
    }
    for (i = 0, len = params.length; i < len; i++) {
      if (i % 2 === 0) {
        key = (0, _emailjsImapHandler.compiler)({
          attributes: [params[i]]
        }).toLowerCase().replace(/<\d+>$/, '');
        continue;
      }
      message[key] = parseFetchValue(key, params[i]);
    }
  });
  return list;
}

/**
 * Parses a single value from the FETCH response object
 *
 * @param {String} key Key name (uppercase)
 * @param {Mized} value Value for the key
 * @return {Mixed} Processed value
 */
function parseFetchValue(key, value) {
  if (!value) {
    return null;
  }
  if (!Array.isArray(value)) {
    switch (key) {
      case 'uid':
      case 'rfc822.size':
        return Number(value.value) || 0;
      case 'modseq':
        // do not cast 64 bit uint to a number
        return value.value || '0';
    }
    return value.value;
  }
  switch (key) {
    case 'flags':
    case 'x-gm-labels':
      value = [].concat(value).map(flag => flag.value || '');
      break;
    case 'envelope':
      value = parseENVELOPE([].concat(value || []));
      break;
    case 'bodystructure':
      value = parseBODYSTRUCTURE([].concat(value || []));
      break;
    case 'modseq':
      value = (value.shift() || {}).value || '0';
      break;
  }
  return value;
}

/**
  * Binary Search - from npm module binary-search, license CC0
  *
  * @param {Array} haystack Ordered array
  * @param {any} needle Item to search for in haystack
  * @param {Function} comparator Function that defines the sort order
  * @return {Number} Index of needle in haystack or if not found,
  *     -Index-1 is the position where needle could be inserted while still
  *     keeping haystack ordered.
  */
function binSearch(haystack, needle, comparator = (a, b) => a - b) {
  var mid, cmp;
  var low = 0;
  var high = haystack.length - 1;
  while (low <= high) {
    // Note that "(low + high) >>> 1" may overflow, and results in
    // a typecast to double (which gives the wrong results).
    mid = low + (high - low >> 1);
    cmp = +comparator(haystack[mid], needle);
    if (cmp < 0.0) {
      // too low
      low = mid + 1;
    } else if (cmp > 0.0) {
      // too high
      high = mid - 1;
    } else {
      // key found
      return mid;
    }
  }

  // key not found
  return ~low;
}
;

/**
 * Parses SEARCH response. Gathers all untagged SEARCH responses, fetched seq./uid numbers
 * and compiles these into a sorted array.
 *
 * @param {Object} response
 * @return {Object} Message object
 * @param {Array} Sorted Seq./UID number list
 */
function parseSEARCH(response) {
  const list = [];
  if (!response || !response.payload || !response.payload.SEARCH || !response.payload.SEARCH.length) {
    return list;
  }
  response.payload.SEARCH.forEach(result => (result.attributes || []).forEach(nr => {
    nr = Number(nr && nr.value || nr) || 0;
    const idx = binSearch(list, nr);
    if (idx < 0) {
      list.splice(-idx - 1, 0, nr);
    }
  }));
  return list;
}
;

/**
 * Parses COPY and UID COPY response.
 * https://tools.ietf.org/html/rfc4315
 * @param {Object} response
 * @returns {{destSeqSet: string, srcSeqSet: string}} Source and
 * destination uid sets if available, undefined if not.
 */
function parseCOPY(response) {
  const copyuid = response && response.copyuid;
  if (copyuid) {
    return {
      srcSeqSet: copyuid[1],
      destSeqSet: copyuid[2]
    };
  }
}

/**
 * Parses APPEND (upload) response.
 * https://tools.ietf.org/html/rfc4315
 * @param {Object} response
 * @returns {String} The uid assigned to the uploaded message if available.
 */
function parseAPPEND(response) {
  return response && response.appenduid && response.appenduid[1];
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZW1haWxqc0FkZHJlc3NwYXJzZXIiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9lbWFpbGpzSW1hcEhhbmRsZXIiLCJfcmFtZGEiLCJfZW1haWxqc01pbWVDb2RlYyIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsInBhcnNlTkFNRVNQQUNFIiwicmVzcG9uc2UiLCJwYXlsb2FkIiwiTkFNRVNQQUNFIiwibGVuZ3RoIiwiYXR0cmlidXRlcyIsImNvbmNhdCIsInBvcCIsInBlcnNvbmFsIiwicGFyc2VOQU1FU1BBQ0VFbGVtZW50IiwidXNlcnMiLCJzaGFyZWQiLCJlbGVtZW50IiwibWFwIiwibnMiLCJwcmVmaXgiLCJ2YWx1ZSIsImRlbGltaXRlciIsInBhcnNlU0VMRUNUIiwibWFpbGJveCIsInJlYWRPbmx5IiwiY29kZSIsImV4aXN0c1Jlc3BvbnNlIiwiRVhJU1RTIiwiZmxhZ3NSZXNwb25zZSIsIkZMQUdTIiwib2tSZXNwb25zZSIsIk9LIiwiZXhpc3RzIiwibnIiLCJmbGFncyIsImZsYWciLCJ0b1N0cmluZyIsInRyaW0iLCJmb3JFYWNoIiwib2siLCJwZXJtYW5lbnRGbGFncyIsInBlcm1hbmVudGZsYWdzIiwidWlkVmFsaWRpdHkiLCJOdW1iZXIiLCJ1aWR2YWxpZGl0eSIsInVpZE5leHQiLCJ1aWRuZXh0IiwiaGlnaGVzdE1vZHNlcSIsImhpZ2hlc3Rtb2RzZXEiLCJub01vZHNlcSIsInBhcnNlRU5WRUxPUEUiLCJlbnZlbG9wZSIsImRhdGUiLCJzdWJqZWN0IiwibWltZVdvcmRzRGVjb2RlIiwiZnJvbSIsInByb2Nlc3NBZGRyZXNzZXMiLCJzZW5kZXIiLCJ0byIsImNjIiwiYmNjIiwibGlzdCIsImFkZHIiLCJuYW1lIiwicGF0aE9yIiwiYWRkcmVzcyIsImZvcm1hdHRlZCIsImVuY29kZUFkZHJlc3NOYW1lIiwicGFyc2VkIiwicGFyc2VBZGRyZXNzIiwic2hpZnQiLCJ0ZXN0IiwiSlNPTiIsInN0cmluZ2lmeSIsIm1pbWVXb3JkRW5jb2RlIiwicGFyc2VCT0RZU1RSVUNUVVJFIiwibm9kZSIsInBhdGgiLCJjdXJOb2RlIiwiaSIsInBhcnQiLCJqb2luIiwiQXJyYXkiLCJpc0FycmF5IiwiY2hpbGROb2RlcyIsInB1c2giLCJ0eXBlIiwidG9Mb3dlckNhc2UiLCJwYXJhbWV0ZXJzIiwiYXR0cmlidXRlc1RvT2JqZWN0IiwiaWQiLCJkZXNjcmlwdGlvbiIsImVuY29kaW5nIiwic2l6ZSIsImxpbmVDb3VudCIsIm1kNSIsImRpc3Bvc2l0aW9uIiwiZGlzcG9zaXRpb25QYXJhbWV0ZXJzIiwibGFuZ3VhZ2UiLCJ2YWwiLCJwcm9wT3IiLCJsb2NhdGlvbiIsImF0dHJzIiwia2V5VHJhbnNmb3JtIiwidG9Mb3dlciIsInZhbHVlVHJhbnNmb3JtIiwidmFscyIsInByb3AiLCJrZXlzIiwiZmlsdGVyIiwiXyIsInZhbHVlcyIsImZyb21QYWlycyIsInppcCIsInBhcnNlRkVUQ0giLCJGRVRDSCIsIm1lc3NhZ2VzIiwiaXRlbSIsInBhcmFtcyIsIm1lc3NhZ2UiLCJsZW4iLCJrZXkiLCJjb21waWxlciIsInJlcGxhY2UiLCJwYXJzZUZldGNoVmFsdWUiLCJiaW5TZWFyY2giLCJoYXlzdGFjayIsIm5lZWRsZSIsImNvbXBhcmF0b3IiLCJhIiwiYiIsIm1pZCIsImNtcCIsImxvdyIsImhpZ2giLCJwYXJzZVNFQVJDSCIsIlNFQVJDSCIsInJlc3VsdCIsImlkeCIsInNwbGljZSIsInBhcnNlQ09QWSIsImNvcHl1aWQiLCJzcmNTZXFTZXQiLCJkZXN0U2VxU2V0IiwicGFyc2VBUFBFTkQiLCJhcHBlbmR1aWQiXSwic291cmNlcyI6WyIuLi9zcmMvY29tbWFuZC1wYXJzZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHBhcnNlQWRkcmVzcyBmcm9tICdlbWFpbGpzLWFkZHJlc3NwYXJzZXInXG5pbXBvcnQgeyBjb21waWxlciB9IGZyb20gJ2VtYWlsanMtaW1hcC1oYW5kbGVyJ1xuaW1wb3J0IHsgemlwLCBmcm9tUGFpcnMsIHByb3AsIHBhdGhPciwgcHJvcE9yLCB0b0xvd2VyIH0gZnJvbSAncmFtZGEnXG5pbXBvcnQgeyBtaW1lV29yZEVuY29kZSwgbWltZVdvcmRzRGVjb2RlIH0gZnJvbSAnZW1haWxqcy1taW1lLWNvZGVjJ1xuXG4vKipcbiAqIFBhcnNlcyBOQU1FU1BBQ0UgcmVzcG9uc2VcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gcmVzcG9uc2VcbiAqIEByZXR1cm4ge09iamVjdH0gTmFtZXNwYWNlcyBvYmplY3RcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlTkFNRVNQQUNFIChyZXNwb25zZSkge1xuICBpZiAoIXJlc3BvbnNlLnBheWxvYWQgfHwgIXJlc3BvbnNlLnBheWxvYWQuTkFNRVNQQUNFIHx8ICFyZXNwb25zZS5wYXlsb2FkLk5BTUVTUEFDRS5sZW5ndGgpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIGNvbnN0IGF0dHJpYnV0ZXMgPSBbXS5jb25jYXQocmVzcG9uc2UucGF5bG9hZC5OQU1FU1BBQ0UucG9wKCkuYXR0cmlidXRlcyB8fCBbXSlcbiAgaWYgKCFhdHRyaWJ1dGVzLmxlbmd0aCkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBwZXJzb25hbDogcGFyc2VOQU1FU1BBQ0VFbGVtZW50KGF0dHJpYnV0ZXNbMF0pLFxuICAgIHVzZXJzOiBwYXJzZU5BTUVTUEFDRUVsZW1lbnQoYXR0cmlidXRlc1sxXSksXG4gICAgc2hhcmVkOiBwYXJzZU5BTUVTUEFDRUVsZW1lbnQoYXR0cmlidXRlc1syXSlcbiAgfVxufVxuXG4vKipcbiAqIFBhcnNlcyBhIE5BTUVTUEFDRSBlbGVtZW50XG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGVsZW1lbnRcbiAqIEByZXR1cm4ge09iamVjdH0gTmFtZXNwYWNlcyBlbGVtZW50IG9iamVjdFxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VOQU1FU1BBQ0VFbGVtZW50IChlbGVtZW50KSB7XG4gIGlmICghZWxlbWVudCkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgZWxlbWVudCA9IFtdLmNvbmNhdChlbGVtZW50IHx8IFtdKVxuICByZXR1cm4gZWxlbWVudC5tYXAoKG5zKSA9PiB7XG4gICAgaWYgKCFucyB8fCAhbnMubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgcHJlZml4OiBuc1swXS52YWx1ZSxcbiAgICAgIGRlbGltaXRlcjogbnNbMV0gJiYgbnNbMV0udmFsdWUgLy8gVGhlIGRlbGltaXRlciBjYW4gbGVnYWxseSBiZSBOSUwgd2hpY2ggbWFwcyB0byBudWxsXG4gICAgfVxuICB9KVxufVxuXG4vKipcbiAqIFBhcnNlcyBTRUxFQ1QgcmVzcG9uc2VcbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gcmVzcG9uc2VcbiAqIEByZXR1cm4ge09iamVjdH0gTWFpbGJveCBpbmZvcm1hdGlvbiBvYmplY3RcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlU0VMRUNUIChyZXNwb25zZSkge1xuICBpZiAoIXJlc3BvbnNlIHx8ICFyZXNwb25zZS5wYXlsb2FkKSB7XG4gICAgcmV0dXJuXG4gIH1cblxuICBjb25zdCBtYWlsYm94ID0ge1xuICAgIHJlYWRPbmx5OiByZXNwb25zZS5jb2RlID09PSAnUkVBRC1PTkxZJ1xuICB9XG4gIGNvbnN0IGV4aXN0c1Jlc3BvbnNlID0gcmVzcG9uc2UucGF5bG9hZC5FWElTVFMgJiYgcmVzcG9uc2UucGF5bG9hZC5FWElTVFMucG9wKClcbiAgY29uc3QgZmxhZ3NSZXNwb25zZSA9IHJlc3BvbnNlLnBheWxvYWQuRkxBR1MgJiYgcmVzcG9uc2UucGF5bG9hZC5GTEFHUy5wb3AoKVxuICBjb25zdCBva1Jlc3BvbnNlID0gcmVzcG9uc2UucGF5bG9hZC5PS1xuXG4gIGlmIChleGlzdHNSZXNwb25zZSkge1xuICAgIG1haWxib3guZXhpc3RzID0gZXhpc3RzUmVzcG9uc2UubnIgfHwgMFxuICB9XG5cbiAgaWYgKGZsYWdzUmVzcG9uc2UgJiYgZmxhZ3NSZXNwb25zZS5hdHRyaWJ1dGVzICYmIGZsYWdzUmVzcG9uc2UuYXR0cmlidXRlcy5sZW5ndGgpIHtcbiAgICBtYWlsYm94LmZsYWdzID0gZmxhZ3NSZXNwb25zZS5hdHRyaWJ1dGVzWzBdLm1hcCgoZmxhZykgPT4gKGZsYWcudmFsdWUgfHwgJycpLnRvU3RyaW5nKCkudHJpbSgpKVxuICB9XG5cbiAgW10uY29uY2F0KG9rUmVzcG9uc2UgfHwgW10pLmZvckVhY2goKG9rKSA9PiB7XG4gICAgc3dpdGNoIChvayAmJiBvay5jb2RlKSB7XG4gICAgICBjYXNlICdQRVJNQU5FTlRGTEFHUyc6XG4gICAgICAgIG1haWxib3gucGVybWFuZW50RmxhZ3MgPSBbXS5jb25jYXQob2sucGVybWFuZW50ZmxhZ3MgfHwgW10pXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdVSURWQUxJRElUWSc6XG4gICAgICAgIG1haWxib3gudWlkVmFsaWRpdHkgPSBOdW1iZXIob2sudWlkdmFsaWRpdHkpIHx8IDBcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgJ1VJRE5FWFQnOlxuICAgICAgICBtYWlsYm94LnVpZE5leHQgPSBOdW1iZXIob2sudWlkbmV4dCkgfHwgMFxuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnSElHSEVTVE1PRFNFUSc6XG4gICAgICAgIG1haWxib3guaGlnaGVzdE1vZHNlcSA9IG9rLmhpZ2hlc3Rtb2RzZXEgfHwgJzAnIC8vIGtlZXAgNjRiaXQgdWludCBhcyBhIHN0cmluZ1xuICAgICAgICBicmVha1xuICAgICAgY2FzZSAnTk9NT0RTRVEnOlxuICAgICAgICBtYWlsYm94Lm5vTW9kc2VxID0gdHJ1ZVxuICAgICAgICBicmVha1xuICAgIH1cbiAgfSlcblxuICByZXR1cm4gbWFpbGJveFxufVxuXG4vKipcbiAqIFBhcnNlcyBtZXNzYWdlIGVudmVsb3BlIGZyb20gRkVUQ0ggcmVzcG9uc2UuIEFsbCBrZXlzIGluIHRoZSByZXN1bHRpbmdcbiAqIG9iamVjdCBhcmUgbG93ZXJjYXNlLiBBZGRyZXNzIGZpZWxkcyBhcmUgYWxsIGFycmF5cyB3aXRoIHtuYW1lOiwgYWRkcmVzczp9XG4gKiBzdHJ1Y3R1cmVkIHZhbHVlcy4gVW5pY29kZSBzdHJpbmdzIGFyZSBhdXRvbWF0aWNhbGx5IGRlY29kZWQuXG4gKlxuICogQHBhcmFtIHtBcnJheX0gdmFsdWUgRW52ZWxvcGUgYXJyYXlcbiAqIEBwYXJhbSB7T2JqZWN0fSBFbnZlbG9wZSBvYmplY3RcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlRU5WRUxPUEUgKHZhbHVlKSB7XG4gIGNvbnN0IGVudmVsb3BlID0ge31cblxuICBpZiAodmFsdWVbMF0gJiYgdmFsdWVbMF0udmFsdWUpIHtcbiAgICBlbnZlbG9wZS5kYXRlID0gdmFsdWVbMF0udmFsdWVcbiAgfVxuXG4gIGlmICh2YWx1ZVsxXSAmJiB2YWx1ZVsxXS52YWx1ZSkge1xuICAgIGVudmVsb3BlLnN1YmplY3QgPSBtaW1lV29yZHNEZWNvZGUodmFsdWVbMV0gJiYgdmFsdWVbMV0udmFsdWUpXG4gIH1cblxuICBpZiAodmFsdWVbMl0gJiYgdmFsdWVbMl0ubGVuZ3RoKSB7XG4gICAgZW52ZWxvcGUuZnJvbSA9IHByb2Nlc3NBZGRyZXNzZXModmFsdWVbMl0pXG4gIH1cblxuICBpZiAodmFsdWVbM10gJiYgdmFsdWVbM10ubGVuZ3RoKSB7XG4gICAgZW52ZWxvcGUuc2VuZGVyID0gcHJvY2Vzc0FkZHJlc3Nlcyh2YWx1ZVszXSlcbiAgfVxuXG4gIGlmICh2YWx1ZVs0XSAmJiB2YWx1ZVs0XS5sZW5ndGgpIHtcbiAgICBlbnZlbG9wZVsncmVwbHktdG8nXSA9IHByb2Nlc3NBZGRyZXNzZXModmFsdWVbNF0pXG4gIH1cblxuICBpZiAodmFsdWVbNV0gJiYgdmFsdWVbNV0ubGVuZ3RoKSB7XG4gICAgZW52ZWxvcGUudG8gPSBwcm9jZXNzQWRkcmVzc2VzKHZhbHVlWzVdKVxuICB9XG5cbiAgaWYgKHZhbHVlWzZdICYmIHZhbHVlWzZdLmxlbmd0aCkge1xuICAgIGVudmVsb3BlLmNjID0gcHJvY2Vzc0FkZHJlc3Nlcyh2YWx1ZVs2XSlcbiAgfVxuXG4gIGlmICh2YWx1ZVs3XSAmJiB2YWx1ZVs3XS5sZW5ndGgpIHtcbiAgICBlbnZlbG9wZS5iY2MgPSBwcm9jZXNzQWRkcmVzc2VzKHZhbHVlWzddKVxuICB9XG5cbiAgaWYgKHZhbHVlWzhdICYmIHZhbHVlWzhdLnZhbHVlKSB7XG4gICAgZW52ZWxvcGVbJ2luLXJlcGx5LXRvJ10gPSB2YWx1ZVs4XS52YWx1ZVxuICB9XG5cbiAgaWYgKHZhbHVlWzldICYmIHZhbHVlWzldLnZhbHVlKSB7XG4gICAgZW52ZWxvcGVbJ21lc3NhZ2UtaWQnXSA9IHZhbHVlWzldLnZhbHVlXG4gIH1cblxuICByZXR1cm4gZW52ZWxvcGVcbn1cblxuLypcbiAqIEVOVkVMT1BFIGxpc3RzIGFkZHJlc3NlcyBhcyBbbmFtZS1wYXJ0LCBzb3VyY2Utcm91dGUsIHVzZXJuYW1lLCBob3N0bmFtZV1cbiAqIHdoZXJlIHNvdXJjZS1yb3V0ZSBpcyBub3QgdXNlZCBhbnltb3JlIGFuZCBjYW4gYmUgaWdub3JlZC5cbiAqIFRvIGdldCBjb21wYXJhYmxlIHJlc3VsdHMgd2l0aCBvdGhlciBwYXJ0cyBvZiB0aGUgZW1haWwuanMgc3RhY2tcbiAqIGJyb3dzZXJib3ggZmVlZHMgdGhlIHBhcnNlZCBhZGRyZXNzIHZhbHVlcyBmcm9tIEVOVkVMT1BFXG4gKiB0byBhZGRyZXNzcGFyc2VyIGFuZCB1c2VzIHJlc3VsdGluZyB2YWx1ZXMgaW5zdGVhZCBvZiB0aGVcbiAqIHByZS1wYXJzZWQgYWRkcmVzc2VzXG4gKi9cbmZ1bmN0aW9uIHByb2Nlc3NBZGRyZXNzZXMgKGxpc3QgPSBbXSkge1xuICByZXR1cm4gbGlzdC5tYXAoKGFkZHIpID0+IHtcbiAgICBjb25zdCBuYW1lID0gKHBhdGhPcignJywgWycwJywgJ3ZhbHVlJ10sIGFkZHIpKS50cmltKClcbiAgICBjb25zdCBhZGRyZXNzID0gKHBhdGhPcignJywgWycyJywgJ3ZhbHVlJ10sIGFkZHIpKSArICdAJyArIChwYXRoT3IoJycsIFsnMycsICd2YWx1ZSddLCBhZGRyKSlcbiAgICBjb25zdCBmb3JtYXR0ZWQgPSBuYW1lID8gKGVuY29kZUFkZHJlc3NOYW1lKG5hbWUpICsgJyA8JyArIGFkZHJlc3MgKyAnPicpIDogYWRkcmVzc1xuICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlQWRkcmVzcyhmb3JtYXR0ZWQpLnNoaWZ0KCkgLy8gdGhlcmUgc2hvdWxkIGJlIGp1c3QgYSBzaW5nbGUgYWRkcmVzc1xuICAgIHBhcnNlZC5uYW1lID0gbWltZVdvcmRzRGVjb2RlKHBhcnNlZC5uYW1lKVxuICAgIHJldHVybiBwYXJzZWRcbiAgfSlcbn1cblxuLyoqXG4gKiBJZiBuZWVkZWQsIGVuY2xvc2VzIHdpdGggcXVvdGVzIG9yIG1pbWUgZW5jb2RlcyB0aGUgbmFtZSBwYXJ0IG9mIGFuIGUtbWFpbCBhZGRyZXNzXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgTmFtZSBwYXJ0IG9mIGFuIGFkZHJlc3NcbiAqIEByZXR1cm5zIHtTdHJpbmd9IE1pbWUgd29yZCBlbmNvZGVkIG9yIHF1b3RlZCBzdHJpbmdcbiAqL1xuZnVuY3Rpb24gZW5jb2RlQWRkcmVzc05hbWUgKG5hbWUpIHtcbiAgaWYgKCEvXltcXHcgJ10qJC8udGVzdChuYW1lKSkge1xuICAgIGlmICgvXltcXHgyMC1cXHg3ZV0qJC8udGVzdChuYW1lKSkge1xuICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KG5hbWUpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBtaW1lV29yZEVuY29kZShuYW1lLCAnUScsIDUyKVxuICAgIH1cbiAgfVxuICByZXR1cm4gbmFtZVxufVxuXG4vKipcbiAqIFBhcnNlcyBtZXNzYWdlIGJvZHkgc3RydWN0dXJlIGZyb20gRkVUQ0ggcmVzcG9uc2UuXG4gKlxuICogQHBhcmFtIHtBcnJheX0gdmFsdWUgQk9EWVNUUlVDVFVSRSBhcnJheVxuICogQHBhcmFtIHtPYmplY3R9IEVudmVsb3BlIG9iamVjdFxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VCT0RZU1RSVUNUVVJFIChub2RlLCBwYXRoID0gW10pIHtcbiAgY29uc3QgY3VyTm9kZSA9IHt9XG4gIGxldCBpID0gMFxuICBsZXQgcGFydCA9IDBcblxuICBpZiAocGF0aC5sZW5ndGgpIHtcbiAgICBjdXJOb2RlLnBhcnQgPSBwYXRoLmpvaW4oJy4nKVxuICB9XG5cbiAgLy8gbXVsdGlwYXJ0XG4gIGlmIChBcnJheS5pc0FycmF5KG5vZGVbMF0pKSB7XG4gICAgY3VyTm9kZS5jaGlsZE5vZGVzID0gW11cbiAgICB3aGlsZSAoQXJyYXkuaXNBcnJheShub2RlW2ldKSkge1xuICAgICAgY3VyTm9kZS5jaGlsZE5vZGVzLnB1c2gocGFyc2VCT0RZU1RSVUNUVVJFKG5vZGVbaV0sIHBhdGguY29uY2F0KCsrcGFydCkpKVxuICAgICAgaSsrXG4gICAgfVxuXG4gICAgLy8gbXVsdGlwYXJ0IHR5cGVcbiAgICBjdXJOb2RlLnR5cGUgPSAnbXVsdGlwYXJ0LycgKyAoKG5vZGVbaSsrXSB8fCB7fSkudmFsdWUgfHwgJycpLnRvU3RyaW5nKCkudG9Mb3dlckNhc2UoKVxuXG4gICAgLy8gZXh0ZW5zaW9uIGRhdGEgKG5vdCBhdmFpbGFibGUgZm9yIEJPRFkgcmVxdWVzdHMpXG5cbiAgICAvLyBib2R5IHBhcmFtZXRlciBwYXJlbnRoZXNpemVkIGxpc3RcbiAgICBpZiAoaSA8IG5vZGUubGVuZ3RoIC0gMSkge1xuICAgICAgaWYgKG5vZGVbaV0pIHtcbiAgICAgICAgY3VyTm9kZS5wYXJhbWV0ZXJzID0gYXR0cmlidXRlc1RvT2JqZWN0KG5vZGVbaV0pXG4gICAgICB9XG4gICAgICBpKytcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgLy8gY29udGVudCB0eXBlXG4gICAgY3VyTm9kZS50eXBlID0gW1xuICAgICAgKChub2RlW2krK10gfHwge30pLnZhbHVlIHx8ICcnKS50b1N0cmluZygpLnRvTG93ZXJDYXNlKCksICgobm9kZVtpKytdIHx8IHt9KS52YWx1ZSB8fCAnJykudG9TdHJpbmcoKS50b0xvd2VyQ2FzZSgpXG4gICAgXS5qb2luKCcvJylcblxuICAgIC8vIGJvZHkgcGFyYW1ldGVyIHBhcmVudGhlc2l6ZWQgbGlzdFxuICAgIGlmIChub2RlW2ldKSB7XG4gICAgICBjdXJOb2RlLnBhcmFtZXRlcnMgPSBhdHRyaWJ1dGVzVG9PYmplY3Qobm9kZVtpXSlcbiAgICB9XG4gICAgaSsrXG5cbiAgICAvLyBpZFxuICAgIGlmIChub2RlW2ldKSB7XG4gICAgICBjdXJOb2RlLmlkID0gKChub2RlW2ldIHx8IHt9KS52YWx1ZSB8fCAnJykudG9TdHJpbmcoKVxuICAgIH1cbiAgICBpKytcblxuICAgIC8vIGRlc2NyaXB0aW9uXG4gICAgaWYgKG5vZGVbaV0pIHtcbiAgICAgIGN1ck5vZGUuZGVzY3JpcHRpb24gPSAoKG5vZGVbaV0gfHwge30pLnZhbHVlIHx8ICcnKS50b1N0cmluZygpXG4gICAgfVxuICAgIGkrK1xuXG4gICAgLy8gZW5jb2RpbmdcbiAgICBpZiAobm9kZVtpXSkge1xuICAgICAgY3VyTm9kZS5lbmNvZGluZyA9ICgobm9kZVtpXSB8fCB7fSkudmFsdWUgfHwgJycpLnRvU3RyaW5nKCkudG9Mb3dlckNhc2UoKVxuICAgIH1cbiAgICBpKytcblxuICAgIC8vIHNpemVcbiAgICBpZiAobm9kZVtpXSkge1xuICAgICAgY3VyTm9kZS5zaXplID0gTnVtYmVyKChub2RlW2ldIHx8IHt9KS52YWx1ZSB8fCAwKSB8fCAwXG4gICAgfVxuICAgIGkrK1xuXG4gICAgaWYgKGN1ck5vZGUudHlwZSA9PT0gJ21lc3NhZ2UvcmZjODIyJykge1xuICAgICAgLy8gbWVzc2FnZS9yZmMgYWRkcyBhZGRpdGlvbmFsIGVudmVsb3BlLCBib2R5c3RydWN0dXJlIGFuZCBsaW5lIGNvdW50IHZhbHVlc1xuXG4gICAgICAvLyBlbnZlbG9wZVxuICAgICAgaWYgKG5vZGVbaV0pIHtcbiAgICAgICAgY3VyTm9kZS5lbnZlbG9wZSA9IHBhcnNlRU5WRUxPUEUoW10uY29uY2F0KG5vZGVbaV0gfHwgW10pKVxuICAgICAgfVxuICAgICAgaSsrXG5cbiAgICAgIGlmIChub2RlW2ldKSB7XG4gICAgICAgIGN1ck5vZGUuY2hpbGROb2RlcyA9IFtcbiAgICAgICAgICAvLyByZmM4MjIgYm9keXBhcnRzIHNoYXJlIHRoZSBzYW1lIHBhdGgsIGRpZmZlcmVuY2UgaXMgYmV0d2VlbiBNSU1FIGFuZCBIRUFERVJcbiAgICAgICAgICAvLyBwYXRoLk1JTUUgcmV0dXJucyBtZXNzYWdlL3JmYzgyMiBoZWFkZXJcbiAgICAgICAgICAvLyBwYXRoLkhFQURFUiByZXR1cm5zIGlubGluZWQgbWVzc2FnZSBoZWFkZXJcbiAgICAgICAgICBwYXJzZUJPRFlTVFJVQ1RVUkUobm9kZVtpXSwgcGF0aClcbiAgICAgICAgXVxuICAgICAgfVxuICAgICAgaSsrXG5cbiAgICAgIC8vIGxpbmUgY291bnRcbiAgICAgIGlmIChub2RlW2ldKSB7XG4gICAgICAgIGN1ck5vZGUubGluZUNvdW50ID0gTnVtYmVyKChub2RlW2ldIHx8IHt9KS52YWx1ZSB8fCAwKSB8fCAwXG4gICAgICB9XG4gICAgICBpKytcbiAgICB9IGVsc2UgaWYgKC9edGV4dFxcLy8udGVzdChjdXJOb2RlLnR5cGUpKSB7XG4gICAgICAvLyB0ZXh0LyogYWRkcyBhZGRpdGlvbmFsIGxpbmUgY291bnQgdmFsdWVzXG5cbiAgICAgIC8vIGxpbmUgY291bnRcbiAgICAgIGlmIChub2RlW2ldKSB7XG4gICAgICAgIGN1ck5vZGUubGluZUNvdW50ID0gTnVtYmVyKChub2RlW2ldIHx8IHt9KS52YWx1ZSB8fCAwKSB8fCAwXG4gICAgICB9XG4gICAgICBpKytcbiAgICB9XG5cbiAgICAvLyBleHRlbnNpb24gZGF0YSAobm90IGF2YWlsYWJsZSBmb3IgQk9EWSByZXF1ZXN0cylcblxuICAgIC8vIG1kNVxuICAgIGlmIChpIDwgbm9kZS5sZW5ndGggLSAxKSB7XG4gICAgICBpZiAobm9kZVtpXSkge1xuICAgICAgICBjdXJOb2RlLm1kNSA9ICgobm9kZVtpXSB8fCB7fSkudmFsdWUgfHwgJycpLnRvU3RyaW5nKCkudG9Mb3dlckNhc2UoKVxuICAgICAgfVxuICAgICAgaSsrXG4gICAgfVxuICB9XG5cbiAgLy8gdGhlIGZvbGxvd2luZyBhcmUgc2hhcmVkIGV4dGVuc2lvbiB2YWx1ZXMgKGZvciBib3RoIG11bHRpcGFydCBhbmQgbm9uLW11bHRpcGFydCBwYXJ0cylcbiAgLy8gbm90IGF2YWlsYWJsZSBmb3IgQk9EWSByZXF1ZXN0c1xuXG4gIC8vIGJvZHkgZGlzcG9zaXRpb25cbiAgaWYgKGkgPCBub2RlLmxlbmd0aCAtIDEpIHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShub2RlW2ldKSAmJiBub2RlW2ldLmxlbmd0aCkge1xuICAgICAgY3VyTm9kZS5kaXNwb3NpdGlvbiA9ICgobm9kZVtpXVswXSB8fCB7fSkudmFsdWUgfHwgJycpLnRvU3RyaW5nKCkudG9Mb3dlckNhc2UoKVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkobm9kZVtpXVsxXSkpIHtcbiAgICAgICAgY3VyTm9kZS5kaXNwb3NpdGlvblBhcmFtZXRlcnMgPSBhdHRyaWJ1dGVzVG9PYmplY3Qobm9kZVtpXVsxXSlcbiAgICAgIH1cbiAgICB9XG4gICAgaSsrXG4gIH1cblxuICAvLyBib2R5IGxhbmd1YWdlXG4gIGlmIChpIDwgbm9kZS5sZW5ndGggLSAxKSB7XG4gICAgaWYgKG5vZGVbaV0pIHtcbiAgICAgIGN1ck5vZGUubGFuZ3VhZ2UgPSBbXS5jb25jYXQobm9kZVtpXSkubWFwKCh2YWwpID0+IHByb3BPcignJywgJ3ZhbHVlJywgdmFsKS50b0xvd2VyQ2FzZSgpKVxuICAgIH1cbiAgICBpKytcbiAgfVxuXG4gIC8vIGJvZHkgbG9jYXRpb25cbiAgLy8gTkIhIGRlZmluZWQgYXMgYSBcInN0cmluZyBsaXN0XCIgaW4gUkZDMzUwMSBidXQgcmVwbGFjZWQgaW4gZXJyYXRhIGRvY3VtZW50IHdpdGggXCJzdHJpbmdcIlxuICAvLyBFcnJhdGE6IGh0dHA6Ly93d3cucmZjLWVkaXRvci5vcmcvZXJyYXRhX3NlYXJjaC5waHA/cmZjPTM1MDFcbiAgaWYgKGkgPCBub2RlLmxlbmd0aCAtIDEpIHtcbiAgICBpZiAobm9kZVtpXSkge1xuICAgICAgY3VyTm9kZS5sb2NhdGlvbiA9ICgobm9kZVtpXSB8fCB7fSkudmFsdWUgfHwgJycpLnRvU3RyaW5nKClcbiAgICB9XG4gICAgaSsrXG4gIH1cblxuICByZXR1cm4gY3VyTm9kZVxufVxuXG5mdW5jdGlvbiBhdHRyaWJ1dGVzVG9PYmplY3QgKGF0dHJzID0gW10sIGtleVRyYW5zZm9ybSA9IHRvTG93ZXIsIHZhbHVlVHJhbnNmb3JtID0gbWltZVdvcmRzRGVjb2RlKSB7XG4gIGNvbnN0IHZhbHMgPSBhdHRycy5tYXAocHJvcCgndmFsdWUnKSlcbiAgY29uc3Qga2V5cyA9IHZhbHMuZmlsdGVyKChfLCBpKSA9PiBpICUgMiA9PT0gMCkubWFwKGtleVRyYW5zZm9ybSlcbiAgY29uc3QgdmFsdWVzID0gdmFscy5maWx0ZXIoKF8sIGkpID0+IGkgJSAyID09PSAxKS5tYXAodmFsdWVUcmFuc2Zvcm0pXG4gIHJldHVybiBmcm9tUGFpcnMoemlwKGtleXMsIHZhbHVlcykpXG59XG5cbi8qKlxuICogUGFyc2VzIEZFVENIIHJlc3BvbnNlXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHJlc3BvbnNlXG4gKiBAcmV0dXJuIHtPYmplY3R9IE1lc3NhZ2Ugb2JqZWN0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUZFVENIIChyZXNwb25zZSkge1xuICBpZiAoIXJlc3BvbnNlIHx8ICFyZXNwb25zZS5wYXlsb2FkIHx8ICFyZXNwb25zZS5wYXlsb2FkLkZFVENIIHx8ICFyZXNwb25zZS5wYXlsb2FkLkZFVENILmxlbmd0aCkge1xuICAgIHJldHVybiBbXVxuICB9XG5cbiAgY29uc3QgbGlzdCA9IFtdXG4gIGNvbnN0IG1lc3NhZ2VzID0ge31cblxuICByZXNwb25zZS5wYXlsb2FkLkZFVENILmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICBjb25zdCBwYXJhbXMgPSBbXS5jb25jYXQoW10uY29uY2F0KGl0ZW0uYXR0cmlidXRlcyB8fCBbXSlbMF0gfHwgW10pIC8vIGVuc3VyZSB0aGUgZmlyc3QgdmFsdWUgaXMgYW4gYXJyYXlcbiAgICBsZXQgbWVzc2FnZVxuICAgIGxldCBpLCBsZW4sIGtleVxuXG4gICAgaWYgKG1lc3NhZ2VzW2l0ZW0ubnJdKSB7XG4gICAgICAvLyBzYW1lIHNlcXVlbmNlIG51bWJlciBpcyBhbHJlYWR5IHVzZWQsIHNvIG1lcmdlIHZhbHVlcyBpbnN0ZWFkIG9mIGNyZWF0aW5nIGEgbmV3IG1lc3NhZ2Ugb2JqZWN0XG4gICAgICBtZXNzYWdlID0gbWVzc2FnZXNbaXRlbS5ucl1cbiAgICB9IGVsc2Uge1xuICAgICAgbWVzc2FnZXNbaXRlbS5ucl0gPSBtZXNzYWdlID0ge1xuICAgICAgICAnIyc6IGl0ZW0ubnJcbiAgICAgIH1cbiAgICAgIGxpc3QucHVzaChtZXNzYWdlKVxuICAgIH1cblxuICAgIGZvciAoaSA9IDAsIGxlbiA9IHBhcmFtcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgaWYgKGkgJSAyID09PSAwKSB7XG4gICAgICAgIGtleSA9IGNvbXBpbGVyKHtcbiAgICAgICAgICBhdHRyaWJ1dGVzOiBbcGFyYW1zW2ldXVxuICAgICAgICB9KS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoLzxcXGQrPiQvLCAnJylcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICAgIG1lc3NhZ2Vba2V5XSA9IHBhcnNlRmV0Y2hWYWx1ZShrZXksIHBhcmFtc1tpXSlcbiAgICB9XG4gIH0pXG5cbiAgcmV0dXJuIGxpc3Rcbn1cblxuLyoqXG4gKiBQYXJzZXMgYSBzaW5nbGUgdmFsdWUgZnJvbSB0aGUgRkVUQ0ggcmVzcG9uc2Ugb2JqZWN0XG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGtleSBLZXkgbmFtZSAodXBwZXJjYXNlKVxuICogQHBhcmFtIHtNaXplZH0gdmFsdWUgVmFsdWUgZm9yIHRoZSBrZXlcbiAqIEByZXR1cm4ge01peGVkfSBQcm9jZXNzZWQgdmFsdWVcbiAqL1xuZnVuY3Rpb24gcGFyc2VGZXRjaFZhbHVlIChrZXksIHZhbHVlKSB7XG4gIGlmICghdmFsdWUpIHtcbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgaWYgKCFBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICBjYXNlICd1aWQnOlxuICAgICAgY2FzZSAncmZjODIyLnNpemUnOlxuICAgICAgICByZXR1cm4gTnVtYmVyKHZhbHVlLnZhbHVlKSB8fCAwXG4gICAgICBjYXNlICdtb2RzZXEnOiAvLyBkbyBub3QgY2FzdCA2NCBiaXQgdWludCB0byBhIG51bWJlclxuICAgICAgICByZXR1cm4gdmFsdWUudmFsdWUgfHwgJzAnXG4gICAgfVxuICAgIHJldHVybiB2YWx1ZS52YWx1ZVxuICB9XG5cbiAgc3dpdGNoIChrZXkpIHtcbiAgICBjYXNlICdmbGFncyc6XG4gICAgY2FzZSAneC1nbS1sYWJlbHMnOlxuICAgICAgdmFsdWUgPSBbXS5jb25jYXQodmFsdWUpLm1hcCgoZmxhZykgPT4gKGZsYWcudmFsdWUgfHwgJycpKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdlbnZlbG9wZSc6XG4gICAgICB2YWx1ZSA9IHBhcnNlRU5WRUxPUEUoW10uY29uY2F0KHZhbHVlIHx8IFtdKSlcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYm9keXN0cnVjdHVyZSc6XG4gICAgICB2YWx1ZSA9IHBhcnNlQk9EWVNUUlVDVFVSRShbXS5jb25jYXQodmFsdWUgfHwgW10pKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdtb2RzZXEnOlxuICAgICAgdmFsdWUgPSAodmFsdWUuc2hpZnQoKSB8fCB7fSkudmFsdWUgfHwgJzAnXG4gICAgICBicmVha1xuICB9XG5cbiAgcmV0dXJuIHZhbHVlXG59XG5cbi8qKlxuICAqIEJpbmFyeSBTZWFyY2ggLSBmcm9tIG5wbSBtb2R1bGUgYmluYXJ5LXNlYXJjaCwgbGljZW5zZSBDQzBcbiAgKlxuICAqIEBwYXJhbSB7QXJyYXl9IGhheXN0YWNrIE9yZGVyZWQgYXJyYXlcbiAgKiBAcGFyYW0ge2FueX0gbmVlZGxlIEl0ZW0gdG8gc2VhcmNoIGZvciBpbiBoYXlzdGFja1xuICAqIEBwYXJhbSB7RnVuY3Rpb259IGNvbXBhcmF0b3IgRnVuY3Rpb24gdGhhdCBkZWZpbmVzIHRoZSBzb3J0IG9yZGVyXG4gICogQHJldHVybiB7TnVtYmVyfSBJbmRleCBvZiBuZWVkbGUgaW4gaGF5c3RhY2sgb3IgaWYgbm90IGZvdW5kLFxuICAqICAgICAtSW5kZXgtMSBpcyB0aGUgcG9zaXRpb24gd2hlcmUgbmVlZGxlIGNvdWxkIGJlIGluc2VydGVkIHdoaWxlIHN0aWxsXG4gICogICAgIGtlZXBpbmcgaGF5c3RhY2sgb3JkZXJlZC5cbiAgKi9cbmZ1bmN0aW9uIGJpblNlYXJjaCAoaGF5c3RhY2ssIG5lZWRsZSwgY29tcGFyYXRvciA9IChhLCBiKSA9PiBhIC0gYikge1xuICB2YXIgbWlkLCBjbXBcbiAgdmFyIGxvdyA9IDBcbiAgdmFyIGhpZ2ggPSBoYXlzdGFjay5sZW5ndGggLSAxXG5cbiAgd2hpbGUgKGxvdyA8PSBoaWdoKSB7XG4gICAgLy8gTm90ZSB0aGF0IFwiKGxvdyArIGhpZ2gpID4+PiAxXCIgbWF5IG92ZXJmbG93LCBhbmQgcmVzdWx0cyBpblxuICAgIC8vIGEgdHlwZWNhc3QgdG8gZG91YmxlICh3aGljaCBnaXZlcyB0aGUgd3JvbmcgcmVzdWx0cykuXG4gICAgbWlkID0gbG93ICsgKGhpZ2ggLSBsb3cgPj4gMSlcbiAgICBjbXAgPSArY29tcGFyYXRvcihoYXlzdGFja1ttaWRdLCBuZWVkbGUpXG5cbiAgICBpZiAoY21wIDwgMC4wKSB7XG4gICAgICAvLyB0b28gbG93XG4gICAgICBsb3cgPSBtaWQgKyAxXG4gICAgfSBlbHNlIGlmIChjbXAgPiAwLjApIHtcbiAgICAgIC8vIHRvbyBoaWdoXG4gICAgICBoaWdoID0gbWlkIC0gMVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBrZXkgZm91bmRcbiAgICAgIHJldHVybiBtaWRcbiAgICB9XG4gIH1cblxuICAvLyBrZXkgbm90IGZvdW5kXG4gIHJldHVybiB+bG93XG59O1xuXG4vKipcbiAqIFBhcnNlcyBTRUFSQ0ggcmVzcG9uc2UuIEdhdGhlcnMgYWxsIHVudGFnZ2VkIFNFQVJDSCByZXNwb25zZXMsIGZldGNoZWQgc2VxLi91aWQgbnVtYmVyc1xuICogYW5kIGNvbXBpbGVzIHRoZXNlIGludG8gYSBzb3J0ZWQgYXJyYXkuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHJlc3BvbnNlXG4gKiBAcmV0dXJuIHtPYmplY3R9IE1lc3NhZ2Ugb2JqZWN0XG4gKiBAcGFyYW0ge0FycmF5fSBTb3J0ZWQgU2VxLi9VSUQgbnVtYmVyIGxpc3RcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlU0VBUkNIIChyZXNwb25zZSkge1xuICBjb25zdCBsaXN0ID0gW11cblxuICBpZiAoIXJlc3BvbnNlIHx8ICFyZXNwb25zZS5wYXlsb2FkIHx8ICFyZXNwb25zZS5wYXlsb2FkLlNFQVJDSCB8fCAhcmVzcG9uc2UucGF5bG9hZC5TRUFSQ0gubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGxpc3RcbiAgfVxuXG4gIHJlc3BvbnNlLnBheWxvYWQuU0VBUkNILmZvckVhY2gocmVzdWx0ID0+XG4gICAgKHJlc3VsdC5hdHRyaWJ1dGVzIHx8IFtdKS5mb3JFYWNoKG5yID0+IHtcbiAgICAgIG5yID0gTnVtYmVyKChuciAmJiBuci52YWx1ZSkgfHwgbnIpIHx8IDBcbiAgICAgIGNvbnN0IGlkeCA9IGJpblNlYXJjaChsaXN0LCBucilcbiAgICAgIGlmIChpZHggPCAwKSB7XG4gICAgICAgIGxpc3Quc3BsaWNlKC1pZHggLSAxLCAwLCBucilcbiAgICAgIH1cbiAgICB9KVxuICApXG5cbiAgcmV0dXJuIGxpc3Rcbn07XG5cbi8qKlxuICogUGFyc2VzIENPUFkgYW5kIFVJRCBDT1BZIHJlc3BvbnNlLlxuICogaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzQzMTVcbiAqIEBwYXJhbSB7T2JqZWN0fSByZXNwb25zZVxuICogQHJldHVybnMge3tkZXN0U2VxU2V0OiBzdHJpbmcsIHNyY1NlcVNldDogc3RyaW5nfX0gU291cmNlIGFuZFxuICogZGVzdGluYXRpb24gdWlkIHNldHMgaWYgYXZhaWxhYmxlLCB1bmRlZmluZWQgaWYgbm90LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VDT1BZIChyZXNwb25zZSkge1xuICBjb25zdCBjb3B5dWlkID0gcmVzcG9uc2UgJiYgcmVzcG9uc2UuY29weXVpZFxuICBpZiAoY29weXVpZCkge1xuICAgIHJldHVybiB7XG4gICAgICBzcmNTZXFTZXQ6IGNvcHl1aWRbMV0sXG4gICAgICBkZXN0U2VxU2V0OiBjb3B5dWlkWzJdXG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogUGFyc2VzIEFQUEVORCAodXBsb2FkKSByZXNwb25zZS5cbiAqIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM0MzE1XG4gKiBAcGFyYW0ge09iamVjdH0gcmVzcG9uc2VcbiAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSB1aWQgYXNzaWduZWQgdG8gdGhlIHVwbG9hZGVkIG1lc3NhZ2UgaWYgYXZhaWxhYmxlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VBUFBFTkQgKHJlc3BvbnNlKSB7XG4gIHJldHVybiByZXNwb25zZSAmJiByZXNwb25zZS5hcHBlbmR1aWQgJiYgcmVzcG9uc2UuYXBwZW5kdWlkWzFdXG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7O0FBQUEsSUFBQUEscUJBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLG1CQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxNQUFBLEdBQUFGLE9BQUE7QUFDQSxJQUFBRyxpQkFBQSxHQUFBSCxPQUFBO0FBQW9FLFNBQUFELHVCQUFBSyxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFBRixDQUFBO0FBRXBFO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNPLFNB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