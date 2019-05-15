'use strict'
const io = require('orbit-db-io')

class AccessControllerManifest {
  constructor (type, params = {}) {
    this.type = type
    this.params = params
  }

  static async resolve (ipfs, manifestHash) {
    // TODO: ensure this is a valid multihash
    if (manifestHash.indexOf('/ipfs') === 0) { manifestHash = manifestHash.split('/')[2] }

    const data = await io.read(ipfs, manifestHash)
    const { type, params } = data.type ? data : { type: 'legacy-ipfs', params: { address: manifestHash } } // check data shape for backwards-compatibility
    return new AccessControllerManifest(type, params)
  }

  static async create (ipfs, type, params) {
    if (type === 'legacy-ipfs') {
      return params.address
    }
    const manifest = {
      type: type,
      params: params
    }
    return io.write(ipfs, 'dag-cbor', manifest)
  }
}

module.exports = AccessControllerManifest
