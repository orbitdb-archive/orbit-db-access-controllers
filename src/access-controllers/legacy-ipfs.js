import * as io from 'orbit-db-io'
import { Buffer } from 'safe-buffer'
import AccessController from './interface.js'
const type = 'legacy-ipfs'

export default class LegacyIPFSAccessController extends AccessController {
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
    const publicKey = entry.key
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
      this._write = access.write
    } catch (e) {
      console.log('LegacyIPFSAccessController.load ERROR:', e)
    }
  }

  async save (options) {
    let cid
    const access = { admin: [], write: this.write, read: [] }
    try {
      cid = await io.write(this._ipfs, 'raw', Buffer.from(JSON.stringify(access, null, 2)), { format: 'dag-pb' })
    } catch (e) {
      console.log('LegacyIPFSAccessController.save ERROR:', e)
    }
    // return the manifest data
    return { address: cid, skipManifest: true }
  }

  static async create (orbitdb, options = {}) {
    options = { ...options, ...{ write: options.write || [orbitdb.identity.publicKey] } }
    return new LegacyIPFSAccessController(orbitdb._ipfs, options)
  }
}
