'use strict'

const assert = require('assert')
const mapSeries = require('p-map-series')
const rmrf = require('rimraf')
const Web3 = require('web3')
const OrbitDB = require('orbit-db')
const IdentityProvider = require('orbit-db-identity-provider')
const Keystore = require('orbit-db-keystore')
const AccessControllers = require('../')
const ContractAccessController = require('../src/contract-access-controller.js')
const fs = require('fs')
const path =require('path')
const abi = JSON.parse(fs.readFileSync(path.resolve('./test/', 'abi.json')))

// Include test utilities
const {
  config,
  startIpfs,
  stopIpfs,
  testAPIs,
} = require('./utils')

const dbPath1 = './orbitdb/tests/orbitdb-access-controller/1'
const dbPath2 = './orbitdb/tests/orbitdb-access-controller/2'
const ipfsPath1 = './orbitdb/tests/orbitdb-access-controller/1/ipfs'
const ipfsPath2 = './orbitdb/tests/orbitdb-access-controller/2/ipfs'

Object.keys(testAPIs).forEach(API => {
  describe('orbit-db - Access Controller Handlers', function() {
    this.timeout(config.timeout)

    let web3, ipfsd1, ipfsd2, ipfs1, ipfs2, id1, id2
    let orbitdb1, orbitdb2, db1, db2

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

      id1 = await IdentityProvider.createIdentity(keystore1, 'userAA')
      id2 = await IdentityProvider.createIdentity(keystore2, 'userBB')

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

      // web3 = new Web3(new Web3.providers.WebsocketProvider('ws://127.0.0.1:8546'))
    })

    after(async () => {
      if(orbitdb1)
        await orbitdb1.stop()

      if(orbitdb2)
        await orbitdb2.stop()

      if (ipfsd1)
        await stopIpfs(ipfsd1)

      if (ipfsd2)
        await stopIpfs(ipfsd2)
    })

    describe('isSupported', function() {
      it('supports default access controllers', () => {
        assert.equal(AccessControllers.isSupported('ipfs'), true)
        assert.equal(AccessControllers.isSupported('orbitdb'), true)
      })

      it('doesn\'t support smart contract access controller by default', () => {
        assert.equal(AccessControllers.isSupported('eth-contract'), false)
      })
    })

    describe('addAccessController', function() {
      it('supports added access controller', () => {
        const options = {
          AccessController: ContractAccessController,
          web3: web3,
          abi: abi,
        }
        AccessControllers.addAccessController(options)
        assert.equal(AccessControllers.isSupported('eth-contract/my-contract-ac'), true)
      })
    })

    describe('create access controllers', function() {
      const options = {
        AccessController: ContractAccessController,
        web3: {}, // disabled for now to get CI running
        abi: abi,
        contractAddress: '0xF9d040A318c468a8AAeB5B61d73bB20b799d847D'
      }

      before(() => {
        AccessControllers.addAccessController(options)
      })

      it('throws an error if AccessController is not defined', async () => {
        let err
        try {
          AccessControllers.addAccessController({})
        } catch (e) {
          err = e
        }
        assert.equal(err, 'Error: AccessController class needs to be given as an option')
      })

      it('throws an error if AccessController doesn\'t define type', async () => {
        let err
        try {
          AccessControllers.addAccessController({ AccessController: {} })
        } catch (e) {
          err = e
        }
        assert.equal(err, 'Error: Given AccessController class needs to implement: static get type() { /* return a string */}.')
      })

      it('creates a custom access controller', async () => {
        const type = ContractAccessController.type
        const acManifestHash = await AccessControllers.create(orbitdb1, type, options)
        assert.notEqual(acManifestHash, null)

        const ac = await AccessControllers.resolve(orbitdb1, acManifestHash, options)
        assert.equal(ac.type, type)
      })

      it('removes the custom access controller', async () => {
        AccessControllers.removeAccessController(ContractAccessController.type)
        assert.equal(AccessControllers.isSupported('eth-contract/my-contract-ac'), false)
      })
    })
  })
})
