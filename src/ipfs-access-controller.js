'use strict'
const io = require('orbit-db-io')
const AccessController = require('./access-controller-interface')
const type = 'ipfs'

class IPFSAccessController extends AccessController {
  constructor (ipfs, options) {
    super()
    this._ipfs = ipfs
    this._write = Array.from(options.write || [])
  }

  // Returns the type of the access controller
  static get type () { return type }

  // Return a Set of keys that have `access` capability
  get write () {
    return this._write
  }

  async canAppend (entry, identityProvider) {
    // Allow if access list contain the writer's publicKey or is '*'
    const publicKey = entry.v === 0 ? entry.key : entry.identity.publicKey
    if (this.write.includes(publicKey) ||
      this.write.includes('*')) {
      return true
    }
    return false
  }

  async load (address) {
    // Transform '/ipfs/QmPFtHi3cmfZerxtH9ySLdzpg1yFhocYDZgEZywdUXHxFU'
    // to 'QmPFtHi3cmfZerxtH9ySLdzpg1yFhocYDZgEZywdUXHxFU'
    if (address.indexOf('/ipfs') === 0) { address = address.split('/')[2] }

    try {
      const access = await io.read(this._ipfs, address)
      this._write = JSON.parse(access.write)
    } catch (e) {
      console.log('IPFSAccessController.load ERROR:', e)
    }
  }

  async save () {
    let cid
    try {

      cid = await io.write(this._ipfs, 'dag-cbor', { write: JSON.stringify(this.write, null, 2) })

    } catch (e) {
      console.log('IPFSAccessController.save ERROR:', e)
    }
    // return the manifest data
    return { address: cid }
  }

  static async create (orbitdb, options = {}) {
    options = { ...options, ...{ write: options.write || [orbitdb.identity.publicKey] } }
    return new IPFSAccessController(orbitdb._ipfs, options)
  }
}

module.exports = IPFSAccessController
