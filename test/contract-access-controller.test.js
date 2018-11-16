'use strict'

const assert = require('assert')
const mapSeries = require('p-map-series')
const rmrf = require('rimraf')
const OrbitDB = require('orbit-db')
const IdentityProvider = require('orbit-db-identity-provider')
const Keystore = require('orbit-db-keystore')
const ContractAccessController = require('../src/contract-access-controller')
const DepositContractAccessController = require('../src/deposit-contract-access-controller')
const AccessControllers = require('../')
const Web3 = require('web3')
const { open } = require('@colony/purser-software')
const ganache = require('ganache-cli')

// Include test utilities
const {
  config,
  startIpfs,
  stopIpfs,
  testAPIs
} = require('./utils')

const dbPath1 = './orbitdb/tests/contract-access-controller/1'
const dbPath2 = './orbitdb/tests/contract-access-controller/2'
const ipfsPath1 = './orbitdb/tests/contract-access-controller/1/ipfs'
const ipfsPath2 = './orbitdb/tests/contract-access-controller/2/ipfs'

const accessControllers = [
  {
    ACType: ContractAccessController,
    contract: require('./Access')
  },
  {
    ACType: DepositContractAccessController,
    contract: require('./PayDeposit')
  }
]

Object.keys(testAPIs).forEach(API => {
  describe('orbit-db - ContractAccessController', function () {
    this.timeout(config.timeout)

    let ipfsd1, ipfsd2, ipfs1, ipfs2, id1, id2
    let orbitdb1, orbitdb2
    let web3, accounts

    before(async () => {
      config.daemon1.repo = ipfsPath1
      config.daemon2.repo = ipfsPath2
      rmrf.sync(config.daemon1.repo)
      rmrf.sync(config.daemon2.repo)
      rmrf.sync(dbPath1)
      rmrf.sync(dbPath2)
      ipfsd1 = await startIpfs(API, config.daemon1)
      ipfsd2 = await startIpfs(API, config.daemon2)
      ipfs1 = ipfsd1.api
      ipfs2 = ipfsd2.api

      const keystore1 = Keystore.create(dbPath1 + '/keys')
      const keystore2 = Keystore.create(dbPath2 + '/keys')

      let wallet1 = await open({
        privateKey: '0x3141592653589793238462643383279502884197169399375105820974944592'
      })

      let wallet2 = await open({
        privateKey: '0x2141592653589793238462643383279502884197169399375105820974944592'
      })

      const signer1 = async (id, data) => { return await wallet1.signMessage({ message: data }) }
      const signer2 = async (id, data) => { return await wallet2.signMessage({ message: data }) }

      id1 = await IdentityProvider.createIdentity(keystore1, wallet1.address, { type: 'ethers', identitySignerFn: signer1 })
      id2 = await IdentityProvider.createIdentity(keystore2, wallet2.address, { type: 'ethers', identitySignerFn: signer2 })

      web3 = new Web3(ganache.provider())
      accounts = await web3.eth.getAccounts()

      orbitdb1 = await OrbitDB.createInstance(ipfs1, {
        ACFactory: AccessControllers,
        directory: dbPath1,
        identity: id1
      })

      orbitdb2 = await OrbitDB.createInstance(ipfs2, {
        ACFactory: AccessControllers,
        directory: dbPath2,
        identity: id2
      })
    })

    after(async () => {
      if (orbitdb1) {
        await orbitdb1.stop()
      }

      if (orbitdb2) {
        await orbitdb2.stop()
      }

      if (ipfsd1) {
        await stopIpfs(ipfsd1)
      }

      if (ipfsd2) {
        await stopIpfs(ipfsd2)
      }
    })

    describe('Constructor', function () {
      accessControllers.forEach(async (ac, i) => {
        let accessController, contract
        before(async () => {
          contract = await new web3.eth.Contract(ac.contract.abi)
                                  .deploy({ data: ac.contract.bytecode })
                                  .send({ from: accounts[i], gas: '1000000'})

          accessController = await ac.ACType.create(orbitdb1, {
            type: ac.ACType.type,
            web3: web3,
            abi: ac.contract.abi,
            contractAddress: contract._address,
            defaultAccount: accounts[i]
          })
          await accessController.load()
        })

        it('creates an access controller', () => {
          assert.notEqual(accessController, null)
          assert.notEqual(accessController, undefined)
        })

        it('sets the controller type', () => {
          assert.equal(accessController.type, ac.ACType.type)
        })

        it('grants access to key', async () => {
          const mockEntry = {
            identity: id1
            // ...
            // doesn't matter what we put here, only identity is used for the check
          }
          await accessController.grant('write', id1.id)
          const canAppend = await accessController.canAppend(mockEntry, id1.provider)
          assert.equal(canAppend, true)
        })

        it('grants access to multiple keys', async () => {
          const canAppend1 = await accessController.canAppend({ identity: orbitdb1.identity })
          const canAppend2 = await accessController.canAppend({ identity: orbitdb2.identity })

          await accessController.grant('write', orbitdb2.identity.id)
          const canAppend3 = await accessController.canAppend({ identity: orbitdb2.identity })

          assert.equal(canAppend1, true)
          assert.equal(canAppend2, false)
          assert.equal(canAppend3, true)
        })

        describe('save and load', function () {
          let accessController, manifest

          before(async () => {
            accessController = await ac.ACType.create(orbitdb1, {
              type: ac.ACType.type,
              web3: web3,
              abi: ac.contract.abi,
              contractAddress: contract._address,
              defaultAccount: accounts[i]
            })
            manifest = await accessController.save()

            accessController = null
            accessController = await ac.ACType.create(orbitdb1, {
              type: ac.ACType.type,
              web3: web3,
              abi: manifest.abi,
              contractAddress: manifest.contractAddress,
              defaultAccount: accounts[i]
            })

            await accessController.load()
          })

          it('has correct capabalities', async () => {
            const canAppend1 = await accessController.canAppend({ identity: orbitdb1.identity })
            const canAppend2 = await accessController.canAppend({ identity: orbitdb2.identity })
            const canAppend3 = await accessController.canAppend({ identity: { id: "someotherid"} })

            assert.equal(canAppend1, true)
            assert.equal(canAppend2, true)
            assert.equal(canAppend3, false)
          })
        })
      })
    })
  })
})
