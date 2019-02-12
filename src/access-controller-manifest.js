'use strict'

class AccessControllerManifest {
  constructor (type, params = {}) {
    this.type = type
    this.params = params
  }

  static async resolve (ipfs, manifestHash) {
    // TODO: ensure this is a valid multihash
    if (manifestHash.indexOf('/ipfs') === 0) { manifestHash = manifestHash.split('/')[2] }

    const data = await dagNode.read(ipfs, manifestHash)
    const { type, params } = data.type ? data : { type: 'ipfs', params: { address: manifestHash } }
    return new AccessControllerManifest(type, params)
  }

  static async create (ipfs, type, params) {
    const manifest = {
      type: type,
      params: params
    }
<<<<<<< HEAD
    const buffer = Buffer.from(JSON.stringify(manifest))
    const dag = await ipfs.object.put(buffer)
    return dag.toJSON().multihash.toString()
=======
    return dagNode.write(ipfs, 'dag-cbor', manifest)
>>>>>>> Use io module
  }
}

module.exports = AccessControllerManifest
