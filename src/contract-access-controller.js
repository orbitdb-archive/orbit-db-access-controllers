'use strict'

const AccessController = require('./access-controller-interface')

const type = 'eth-contract'

class ContractAccessController extends AccessController {
  constructor(web3, abi, address) {
    super()
    this.web3 = web3
    this.abi = abi
    this.contractAddress = address
  }

  // Returns the type of the access controller
  static get type () { return type }

  async load () {
    this.contract = new this.web3.eth.Contract(this.abi, this.contractAddress)
  }

  async save () {
    return {
      contractAddress: this.contractAddress,
      abi: this.abi
    }
  }

  static isValidEthAddress (web3, address) {
    return web3.utils.isAddress(address)
  }

  async canAppend (entry, identityProvider) {
    // Write the custom access control logic here
    if (!ContractAccessController.isValidEthAddress(this.web3, entry.identity.id)) {
      console.warn(`WARNING: "${entry.identity.id}" is not a valid eth address`)
      return Promise.resolve(false)
    }
    return await this.contract.methods.isPermitted(entry.identity.id, this.web3.utils.fromAscii('write')).call()
  }

  async grant (capability, identifier, options = {}) {
    if (!ContractAccessController.isValidEthAddress(this.web3, identifier)) {
      console.warn(`WARNING: "${identifier}" is not a valid eth address`)
      return Promise.resolve(false)
    }
    return await this.contract.methods.grantCapability(identifier, this.web3.utils.fromAscii(capability)).send(options)
  }

  async revoke (capability, identifier, options = {}) {
    if (!ContractAccessController.isValidEthAddress(this.web3, identifier)) {
      console.warn(`WARNING: "${identifier}" is not a valid eth address`)
      return Promise.resolve(false)
    }
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

    return new ContractAccessController(
      options.web3,
      options.abi,
      options.contractAddress
    )
  }
}

module.exports = ContractAccessController
