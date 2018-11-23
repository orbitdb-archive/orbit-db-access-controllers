'use strict'

const pMapSeries = require('p-map-series')
const AccessController = require('./access-controller-interface')
const ensureAddress = require('./utils/ensure-ac-address')
const Clock = require('ipfs-log/src/lamport-clock')

const type = 'orbitdb'

class OrbitDBAccessController extends AccessController {
  constructor (orbitdb, options) {
    super()
    this._orbitdb = orbitdb
    this._db = null
    this._options = options || {}
  }

  // Returns the type of the access controller
  static get type () { return type }

  // Returns the address of the OrbitDB used as the AC
  get address () {
    return this._db.address
  }

  // Return true if entry is allowed to be added to the database
  async canAppend (entry, identityProvider) {
    return (await this._db.hasAccessForEntry('write', entry) === true) ||
      (await this._db.hasAccessForEntry('admin', entry) === true) ||
      (await this._db.hasAccessForEntry('*', entry) === true)
  }

  get capabilities () {
    if (this._db) {
      let capabilities = this._db.all()

      const toSet = (e) => {
        const key = e[0]
        capabilities[key] = new Set([...(capabilities[key] || []), ...e[1]])
      }

      // Merge with the access controller of the database
      // and make sure all values are Sets
      Object.entries({
        ...capabilities,
        // Add the root access controller's 'write' access list 
        // as admins on this controller
        ...{ admin: new Set([...(capabilities.admin || []), ...this._db.access.write])
        }
      }).forEach(toSet)

      return capabilities
    }
    return {}
  }

  get (capability) {
    return this.capabilities[capability] || new Set([])
  }

  async close () {
    await this._db.close()
  }

  async load (address) {
    if (this._db)
      await this._db.close()

    // Force '<address>/_access' naming for the database
    this._db = await this._orbitdb.open(ensureAddress(address), {
      type: 'access-controller',
      create: true,
      // use ipfs controller as a immutable "root controller"
      accessController: {
        type: 'ipfs',
        write: this._options.admin || [this._orbitdb.identity.publicKey],
      },
      sync: true
    })

    this._db.events.on('ready', this._onUpdate.bind(this))
    this._db.events.on('write', this._onUpdate.bind(this))
    this._db.events.on('replicated', this._onUpdate.bind(this))

    await this._db.load()
  }

  async save () {
    // return the manifest data
    return {
      address: this._db.address.toString()
    }
  }

  async grant (capability, identity, options = {}) {
    return await this._db.grant(capability, identity, options.after)
  }

  async revoke (capability, identity, options = {}) {
    return await this._db.revoke(capability, identity, options.after)
  }

  /* Private methods */
  _onUpdate () {
    this.emit('updated')
  }

  /* Factory */
  static async create (orbitdb, options = {}) {
    const ac = new OrbitDBAccessController(orbitdb, options)
    await ac.load(options.address || 'default-access-controller')

    const mockEntry1 = { 
      identity: orbitdb.identity,
      clock: new Clock(orbitdb.identity.publicKey, 0) 
    }

    // Add write access from options
    if (options.write && !options.address) {
      // TODO: how to deal with the initial access rights?
      await pMapSeries(options.write, async (e) => await ac.grant('write', e, { after: mockEntry1 }))
    }

    return ac
  }
}

module.exports = OrbitDBAccessController
