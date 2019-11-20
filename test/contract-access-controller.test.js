'use strict'

const assert = require('assert')
const rmrf = require('rimraf')
const OrbitDB = require('orbit-db')
const IdentityProvider = require('orbit-db-identity-provider')
const EthIdentityProvider = require('orbit-db-identity-provider/src/ethereum-identity-provider')
const Keystore = require('orbit-db-keystore')
const ContractAccessController = require('../src/contract-access-controller')
const DepositContractAccessController = require('../src/deposit-contract-access-controller')
const AccessControllers = require('../')
const Web3 = require('web3')
const ganache = require('ganache-cli')
const io = require('orbit-db-io')
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
    AccessController: ContractAccessController,
    contract: require('./Access')
  },
  {
    AccessController: DepositContractAccessController,
    contract: require('./PayDeposit')
  }
]

Object.keys(testAPIs).forEach(API => {
  describe(`orbit-db - ContractAccessController (${API})`, function () {
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

      const keystore = new Keystore(dbPath1 + '/keys')

      IdentityProvider.addIdentityProvider(EthIdentityProvider)
      const identities = new IdentityProvider({ keystore })
      id1 = await identities.createIdentity({ type: EthIdentityProvider.type })
      id2 = await identities.createIdentity({ type: EthIdentityProvider.type })

      web3 = new Web3(ganache.provider())
      accounts = await web3.eth.getAccounts()

      orbitdb1 = await OrbitDB.createInstance(ipfs1, {
        AccessControllers: AccessControllers,
        directory: dbPath1,
        identity: id1,
        identities
      })

      orbitdb2 = await OrbitDB.createInstance(ipfs2, {
        AccessControllers: AccessControllers,
        directory: dbPath2,
        identity: id2,
        identities
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
            .send({ from: accounts[i], gas: '1000000' })

          accessController = await ac.AccessController.create(orbitdb1, {
            type: ac.AccessController.type,
            web3: web3,
            abi: ac.contract.abi,
            contractAddress: contract._address,
            defaultAccount: accounts[i]
          })
          await accessController.load()
        })

        it('creates an access controller', () => {
          assert.notStrictEqual(accessController, null)
          assert.notStrictEqual(accessController, undefined)
        })

        it('sets the controller type', () => {
          assert.strictEqual(accessController.type, ac.AccessController.type)
        })

        it('grants access to key', async () => {
          const mockEntry = {
            identity: id1
            // ...
            // doesn't matter what we put here, only identity is used for the check
          }
          await accessController.grant('write', id1.id)
          const canAppend = await accessController.canAppend(mockEntry)
          assert.strictEqual(canAppend, true)
        })

        it('grants access to multiple keys', async () => {
          const canAppend1 = await accessController.canAppend({ identity: orbitdb1.identity })
          const canAppend2 = await accessController.canAppend({ identity: orbitdb2.identity })

          await accessController.grant('write', orbitdb2.identity.id)
          const canAppend3 = await accessController.canAppend({ identity: orbitdb2.identity })

          assert.strictEqual(canAppend1, true)
          assert.strictEqual(canAppend2, false)
          assert.strictEqual(canAppend3, true)
        })

        describe('save and load', function () {
          let accessController, manifest

          before(async () => {
            accessController = await ac.AccessController.create(orbitdb1, {
              type: ac.AccessController.type,
              web3: web3,
              abi: ac.contract.abi,
              contractAddress: contract._address,
              defaultAccount: accounts[i]
            })
            manifest = await accessController.save()
            const access = await io.read(ipfs1, manifest.address)

            accessController = await ac.AccessController.create(orbitdb1, {
              type: ac.AccessController.type,
              web3: web3,
              abi: JSON.parse(access.abi),
              contractAddress: access.contractAddress,
              defaultAccount: accounts[i]
            })

            await accessController.load(manifest.address)
          })

          it('has correct capabalities', async () => {
            const canAppend1 = await accessController.canAppend({ identity: orbitdb1.identity })
            const canAppend2 = await accessController.canAppend({ identity: orbitdb2.identity })
            const canAppend3 = await accessController.canAppend({ identity: { id: 'someotherid' } })

            assert.strictEqual(canAppend1, true)
            assert.strictEqual(canAppend2, true)
            assert.strictEqual(canAppend3, false)
          })
        })
      })
    })
  })
})
