'use strict'

const AccessController = require('./access-controller-interface')

const type = 'eth-contract/my-contract-ac'

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

  async canAppend (entry, identityProvider) {
    // Write the custom access control logic here
    if (!this.web3.utils.isAddress(entry.identity.id)) return Promise.resolve(false)
    return await this.contract.methods.isPermitted(entry.identity.id, this.web3.utils.fromAscii('write')).call()
  }

  async grant (capability, identifier, options = {}) {
    if (!this.web3.utils.isAddress(identifier)) return Promise.resolve(false)
    return await this.contract.methods.grantCapability(identifier, this.web3.utils.fromAscii(capability)).send(options)
  }

  async revoke (capability, identifier, options = {}) {
    if (!this.web3.utils.isAddress(identifier)) return Promise.resolve(false)
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
