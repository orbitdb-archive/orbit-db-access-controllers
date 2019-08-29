'use strict'
const io = require('orbit-db-io')

class AccessControllerManifest {
  constructor (type, params = {}) {
    this.type = type
    this.params = params
  }

  static async resolve (ipfs, manifestHash, options = {}) {
    if (options.skipManifest) {
      if (!options.type) {
        throw new Error('No manifest, access-controller type required')
      }
      return new AccessControllerManifest(options.type, { address: manifestHash })
    } else {
      // TODO: ensure this is a valid multihash
      if (manifestHash.indexOf('/ipfs') === 0) { manifestHash = manifestHash.split('/')[2] }
      const { type, params } = await io.read(ipfs, manifestHash)
      return new AccessControllerManifest(type, params)
    }
  }

  static async create (ipfs, type, params) {
    if (params.skipManifest) {
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
