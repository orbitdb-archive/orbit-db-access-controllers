'use strict'
const isValidEthAddress = require('./utils/is-valid-eth-address')
const AccessController = require('./access-controller-interface')

const type = 'eth-contract/cool-contract'

class ContractAccessController extends AccessController {
  constructor(web3, abi, address, defaultAccount) {
    super()
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

  async load () {
    this.contract = new this.web3.eth.Contract(this.abi, this.contractAddress)
  }

  async save () {
    return {
      contractAddress: this.address,
      abi: this.abi
    }
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
    return await this.contract.methods.grantCapability(identifier, this.web3.utils.fromAscii(capability)).send(options)
  }

  async revoke (capability, identifier, options = {}) {
    if (!isValidEthAddress(this.web3, identifier)) {
      console.warn(`WARNING: "${identifier}" is not a valid eth address`)
      return Promise.resolve(false)
    }
    options = Object.assign({}, { from: this.defaultAccount }, options)
    return await this.contract.methods.revokeCapability(identifier, this.web3.utils.fromAscii(capability)).send(options)
  }

  // Factory
  static async create (orbitdb, options) {
    if (!options.web3) {
      throw new Error(`No 'web3' given in options`)
    }
    if (!options.abi) {
      throw new Error(`No 'abi' given in options`)
    }
    if (!options.contractAddress) {
      throw new Error(`No 'contractAddress' given in options`)
    }
    if (!options.defaultAccount) {
      console.warning("WARNING: no defaultAccount set")
    }

    return new ContractAccessController(
      options.web3,
      options.abi,
      options.contractAddress,
      options.defaultAccount
    )
  }
}

module.exports = ContractAccessController
