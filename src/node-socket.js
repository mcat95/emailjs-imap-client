import { propOr } from 'ramda'
import net from 'net'
import tls from 'tls'
import httpProxyClient from './http-proxy-client.js'

export default class TCPSocket {
  static open (host, port, options = {}) {
    return new TCPSocket({ host, port, options })
  }

  constructor ({ host, port, options }) {
    this.host = host
    this.port = port
    this.ssl = propOr(false, 'useSecureTransport')(options)
    this.bufferedAmount = 0
    this.readyState = 'connecting'
    this.binaryType = propOr('arraybuffer', 'binaryType')(options)

    if (this.binaryType !== 'arraybuffer') {
      throw new Error('Only arraybuffers are supported!')
    }
    if (options.proxy) {
      this._socket = httpProxyClient(options.proxy, this.port, this.host, err => {
        if (err) return this._emit('error', err)
        // Upgrade to SSL connection if using secure connection
        if (this.ssl) {
          this._socket = tls.connect({
            socket: this._socket,
            host: this.host,
            servername: this.host // SNI
          }, () => { this.ssl = true })
        }
        this._attachListeners()
        this._emit('open')
      })
    } else {
      this._socket = this.ssl ? (
        tls.connect({
          port: this.port,
          host: this.host,
          minVersion: options.minTLSVersion || tls.DEFAULT_MIN_VERSION,
          maxVersion: options.maxTLSVersion || tls.DEFAULT_MAX_VERSION,
          servername: this.host // SNI
        }, () => this._emit('open'))) : (
        net.connect(this.port, this.host, () => this._emit('open'))
      )
      // add all event listeners to the new socket
      this._attachListeners()
    }
  }

  _attachListeners () {
    this._socket.on('data', nodeBuf => this._emit('data', nodeBuffertoArrayBuffer(nodeBuf)))
    this._socket.on('error', error => {
      // Ignore ECONNRESET errors. For the app this is the same as normal close
      if (error.code !== 'ECONNRESET') {
        this._emit('error', error)
      }
      this.close()
    })

    this._socket.on('end', () => this._emit('close'))
  }

  _removeListeners () {
    this._socket.removeAllListeners('data')
    this._socket.removeAllListeners('end')
    this._socket.removeAllListeners('error')
  }

  _emit (type, data) {
    const target = this
    switch (type) {
      case 'open':
        this.readyState = 'open'
        this.onopen && this.onopen({ target, type, data })
        break
      case 'error':
        this.onerror && this.onerror({ target, type, data })
        break
      case 'data':
        this.ondata && this.ondata({ target, type, data })
        break
      case 'drain':
        this.ondrain && this.ondrain({ target, type, data })
        break
      case 'close':
        this.readyState = 'closed'
        this.onclose && this.onclose({ target, type, data })
        break
    }
  }

  //
  // API
  //

  close () {
    this.readyState = 'closing'
    this._socket.end()
  }

  send (data) {
    // convert data to string or node buffer
    this._socket.write(arrayBufferToNodeBuffer(data), this._emit.bind(this, 'drain'))
  }

  upgradeToSecure () {
    if (this.ssl) return

    this._removeListeners()
    this._socket = tls.connect({
      host: this.host,
      servername: this.host, // SNI
      socket: this._socket
    }, () => { this.ssl = true })
    this._attachListeners()
  }
}

const nodeBuffertoArrayBuffer = buf => Uint8Array.from(buf).buffer
const arrayBufferToNodeBuffer = (ab) => Buffer.from(new Uint8Array(ab))
