'use strict'
const isValidEthAddress = require('./utils/is-valid-eth-address')
const AccessController = require('./access-controller-interface')
const io = require('orbit-db-io')
const type = 'eth-contract/cool-contract'

class ContractAccessController extends AccessController {
  constructor (ipfs, web3, abi, address, defaultAccount) {
    super()
    this._ipfs = ipfs
    this.web3 = web3
    this.abi = abi
    this.contractAddress = address
    this.defaultAccount = defaultAccount
  }

  // Returns the type of the access controller
  static get type () { return type }

  // Returns the address of the contract used as the AC
  get address () {
    return this.contractAddress
  }

  async load (address) {
    if (address) {
      try {
        if (address.indexOf('/ipfs') === 0) { address = address.split('/')[2] }
        const access = await io.read(this._ipfs, address)
        this.contractAddress = access.contractAddress
        this.abi = JSON.parse(access.abi)
      } catch (e) {
        console.log('ContractAccessController.load ERROR:', e)
      }
    }
    this.contract = new this.web3.eth.Contract(this.abi, this.contractAddress)
  }

  async save () {
    let cid
    try {
      cid = await io.write(this._ipfs, 'dag-cbor', {
        contractAddress: this.address,
        abi: JSON.stringify(this.abi, null, 2)
      })
    } catch (e) {
      console.log('ContractAccessController.save ERROR:', e)
    }
    // return the manifest data
    return { address: cid }
  }

  async canAppend (entry, identityProvider) {
    // Write the custom access control logic here
    if (!isValidEthAddress(this.web3, entry.identity.id)) {
      console.warn(`WARNING: "${entry.identity.id}" is not a valid eth address`)
      return Promise.resolve(false)
    }
    const isPermitted = await this.contract.methods.isPermitted(entry.identity.id, this.web3.utils.fromAscii('write')).call()
    if (isPermitted) {
      const verifiedIdentity = await identityProvider.verifyIdentity(entry.identity)
      // Allow access if identity verifies
      return Promise.resolve(verifiedIdentity)
    }
    return Promise.resolve(false)
  }

  async grant (capability, identifier, options = {}) {
    if (!isValidEthAddress(this.web3, identifier)) {
      console.warn(`WARNING: "${identifier}" is not a valid eth address`)
      return Promise.resolve(false)
    }
    options = Object.assign({}, { from: this.defaultAccount }, options)
    return this.contract.methods.grantCapability(identifier, this.web3.utils.fromAscii(capability)).send(options)
  }

  async revoke (capability, identifier, options = {}) {
    if (!isValidEthAddress(this.web3, identifier)) {
      console.warn(`WARNING: "${identifier}" is not a valid eth address`)
      return Promise.resolve(false)
    }
    options = Object.assign({}, { from: this.defaultAccount }, options)
    return this.contract.methods.revokeCapability(identifier, this.web3.utils.fromAscii(capability)).send(options)
  }

  // Factory
  static async create (orbitdb, options) {
    if (!options.web3) {
      throw new Error("No 'web3' given in options")
    }
    if (!options.abi && !options.address) {
      throw new Error("No 'abi' given in options")
    }
    if (!options.contractAddress && !options.address) {
      throw new Error("No 'contractAddress' given in options")
    }
    if (!options.defaultAccount) {
      console.warn('WARNING: no defaultAccount set')
    }

    return new ContractAccessController(
      orbitdb._ipfs,
      options.web3,
      options.abi,
      options.contractAddress,
      options.defaultAccount
    )
  }
}

module.exports = ContractAccessController
