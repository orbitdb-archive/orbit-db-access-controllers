'use strict'

const AccessController = require('./access-controller-interface')
const isValidEthAddress = require('./utils/is-valid-eth-address')

const type = 'eth-contract/deposit-contract'

class DepositContractAccessController extends AccessController {
  constructor (web3, abi, address, defaultAccount) {
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
      contractAddress: this.contractAddress,
      abi: this.abi
    }
  }

  async canAppend (entry, identityProvider) {
    // Write the custom access control logic here
    if (!isValidEthAddress(this.web3, entry.identity.id)) {
      console.warn(`WARNING: "${entry.identity.id}" is not a valid eth address`)
      return Promise.resolve(false)
    }
    return this.contract.methods.hasPaidDeposit(entry.identity.id).call()
  }

  async grant (capability, identifier, options = {}) {
    if (!isValidEthAddress(this.web3, identifier)) {
      console.warn(`WARNING: "${identifier}" is not a valid eth address`)
      return Promise.resolve(false)
    }
    if (capability === 'admin') {
      // do one thing
      return Promise.resolve(false)
    } else if (capability === 'write') {
      options = Object.assign({}, { from: this.defaultAccount }, options)
      return this.contract.methods.payDeposit(identifier).send(options)
    }
  }

  async revoke (capability, identifier, options = {}) {
    if (!isValidEthAddress(this.web3, identifier)) {
      console.warn(`WARNING: "${identifier}" is not a valid eth address`)
      return Promise.resolve(false)
    }

    if (capability === 'admin') {
      // do one thing
      return Promise.resolve(false)
    } else if (capability === 'write') {
      options = Object.assign({}, { from: this.defaultAccount }, options)
      return this.contract.methods.expireDeposit(identifier).send(options)
    }
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
      console.warning('WARNING: no defaultAccount set')
    }

    return new DepositContractAccessController(
      options.web3,
      options.abi,
      options.contractAddress,
      options.defaultAccount
    )
  }
}

module.exports = DepositContractAccessController
