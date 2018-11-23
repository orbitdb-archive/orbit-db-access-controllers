'use strict'

const assert = require('assert')
const rmrf = require('rimraf')
const OrbitDB = require('orbit-db')
const IdentityProvider = require('orbit-db-identity-provider')
const Keystore = require('orbit-db-keystore')
const OrbitDBAccessController = require('../src/orbitdb-access-controller')
const AccessControllerStore = require('orbit-db-access-controller-store')
const AccessControllers = require('../')
const Clock = require('ipfs-log/src/lamport-clock')

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
  describe.only('orbit-db - OrbitDBAccessController', function() {
    this.timeout(config.timeout)

    let ipfsd1, ipfsd2, ipfs1, ipfs2
    let id1, id2, id3, id4, id5
    let orbitdb1, orbitdb2
    let mockEntry1

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

      id1 = await IdentityProvider.createIdentity(keystore1, 'userA')
      id2 = await IdentityProvider.createIdentity(keystore2, 'userB')
      id3 = await IdentityProvider.createIdentity(keystore1, 'userC')
      id4 = await IdentityProvider.createIdentity(keystore2, 'userAA')
      id5 = await IdentityProvider.createIdentity(keystore1, 'userBB')

      mockEntry1 = { 
        identity: id1,
        clock: new Clock(id1.publicKey, 1) 
      }

      // Add the AC store to orbitdb's databases
      OrbitDB.addDatabaseType('access-controller', AccessControllerStore)

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

    describe('Constructor', function() {
      let accessController

      before(async () => {
        accessController = await OrbitDBAccessController.create(orbitdb1)
      })

      it('creates an access controller', () => {
        assert.notEqual(accessController, null)
        assert.notEqual(accessController, undefined)
      })

      it('sets the controller type', () => {
        assert.equal(accessController.type, 'orbitdb')
      })

      it('has OrbitDB instance', async () => {
        assert.notEqual(accessController._orbitdb, null)
        assert.equal(accessController._orbitdb.id, orbitdb1.id)
      })

      it('has IPFS instance', async () => {
        const peerId1 = await accessController._orbitdb._ipfs.id()
        const peerId2 = await ipfs1.id()
        assert.equal(peerId1.id, peerId2.id)
      })

      it('sets default capabilities', async () => {
        assert.deepEqual(accessController.capabilities, {
          admin: new Set([id1.publicKey])
        })
      })

      it('allows owner to append after creation', async () => {
        const mockEntry = {
          identity: id1
          // ...
          // doesn't matter what we put here, only identity is used for the check
        }
        const canAppend = await accessController.canAppend(mockEntry1, id1.provider)
        assert.equal(canAppend, true)
      })
    })

    describe('grant', function () {
      let accessController

      before(async () => {
        accessController = new OrbitDBAccessController(orbitdb1)
        await accessController.load('testdb/add')
      })

      it('loads the root access controller from IPFS', () => {
        assert.equal(accessController._db.access.type, 'ipfs')
        assert.deepEqual(accessController._db.access.write, [id1.publicKey])
      })

      it('adds a capability', async () => {
        try {
          await accessController.grant('write', id1, { after: mockEntry1 })
        } catch (e) {
          assert.equal(e, null)
        }
        assert.deepEqual(accessController.capabilities, {
          admin: new Set([id1.publicKey]),
          write: new Set([id1.publicKey])
        })
      })

      it('adds more capabilities', async () => {
        try {
          await accessController.grant('read', id4, { after: mockEntry1 })
          await accessController.grant('delete', id4, { after: mockEntry1 })
        } catch (e) {
          assert.equal(e, null)
        }
        assert.deepEqual(accessController.capabilities.admin, new Set([id1.publicKey]))
        assert.deepEqual(accessController.capabilities.write, new Set([id1.publicKey]))
        assert.deepEqual(accessController.capabilities.read, new Set([id4.publicKey]))
        assert.deepEqual(accessController.capabilities.delete, new Set([id4.publicKey]))
      })

      it('emit \'updated\' event when a capability was added', async () => {
        return new Promise(async (resolve, reject) => {
          accessController.on('updated', () => {
            try {
              assert.deepEqual(accessController.capabilities, {
                admin: new Set([id1.publicKey]),
                write: new Set([id1.publicKey]),
                read: new Set([id4.publicKey]),
                delete: new Set([id4.publicKey])
              })
              resolve()
            } catch (e) {
              reject(e)
            }
          })
          await accessController.grant('read', id4, { after: mockEntry1 })
        })
      })

      it('can append after acquiring capability', async () => {
        try {
          await accessController.grant('write', id1, { after: mockEntry1 })
          await accessController.grant('write', id2, { after: mockEntry1 })
        } catch (e) {
          assert.equal(e, null)
        }
        const entry1 = {
          identity: id1,
          clock: new Clock(id1.publicKey, 2)
        }
        const entry2 = {
          identity: id2,
          clock: new Clock(id2.publicKey, 2)
        }
        const canAppend1 = await accessController.canAppend(entry1, id1.provider)
        const canAppend2 = await accessController.canAppend(entry2, id2.provider)
        assert.equal(canAppend1, true)
        assert.equal(canAppend2, true)
      })
    })

    describe('revoke', function () {
      let accessController

      beforeEach(async () => {
        accessController = new OrbitDBAccessController(orbitdb1)
        await accessController.load('testdb/remove/' + new Date().getTime())
      })

      it('removes a capability', async () => {
        try {
          await accessController.grant('write', id1, { after: mockEntry1 })
          await accessController.grant('write', id4, { after: mockEntry1 })
          await accessController.revoke('write', id4, { after: mockEntry1 })
        } catch (e) {
          assert.equal(e, null)
        }
        assert.deepEqual(accessController.capabilities, {
          admin: new Set([id1.publicKey]),
          write: new Set([id1.publicKey])
        })
      })

      it('can remove the creator\'s write access', async () => {
        try {
          await accessController.revoke('write', id1, { after: mockEntry1 })
        } catch (e) {
          assert.equal(e, null)
        }
        assert.deepEqual(accessController.capabilities, {
          admin: new Set([id1.publicKey])
        })
      })

      it('can\'t remove the creator\'s admin access', async () => {
        try {
          await accessController.revoke('admin', id1, { after: mockEntry1 })
        } catch (e) {
          assert.equal(e, null)
        }
        assert.deepEqual(accessController.capabilities, {
          admin: new Set([id1.publicKey])
        })
      })

      it('removes more capabilities', async () => {
        try {
          await accessController.grant('read', id4, { after: mockEntry1 })
          await accessController.grant('delete', id4, { after: mockEntry1 })
          await accessController.grant('write', id1, { after: mockEntry1 })
          await accessController.revoke('read', id4, { after: mockEntry1 })
          await accessController.revoke('delete', id4, { after: mockEntry1 })
        } catch (e) {
          assert.equal(e, null)
        }
        assert.deepEqual(accessController.capabilities, {
          admin: new Set([id1.publicKey]),
          write: new Set([id1.publicKey])
        })
      })

      it('can\'t append after revoking capability', async () => {
        try {
          await accessController.grant('write', id2, { after: mockEntry1 })
          await accessController.revoke('write', id2, { after: mockEntry1 })
        } catch (e) {
          assert.equal(e, null)
        }
        const entry1 = {
          identity: id1,
          clock: new Clock(id1.publicKey, 2)
        }
        const entry2 = {
          identity: id2,
          clock: new Clock(id1.publicKey, 2)
        }
        const canAppend = await accessController.canAppend(entry1, id1.provider)
        const noAppend = await accessController.canAppend(entry2, id2.provider)
        assert.equal(canAppend, true)
        assert.equal(noAppend, false)
      })

      it('emits \'updated\' event when a capability was removed', async () => {
        await accessController.grant('admin', id1, { after: mockEntry1 })
        await accessController.grant('admin', id2, { after: mockEntry1 })

        return new Promise(async (resolve, reject) => {
          accessController.on('updated', () => {
            try {
              assert.deepEqual(accessController.capabilities, {
                admin: new Set([id1.publicKey]),
              })
              resolve()
            } catch (e) {
              reject(e)
            }
          })
          await accessController.revoke('admin', id2, { after: mockEntry1 })
        })
      })
    })

    describe('save and load', function () {
      let accessController, dbName

      before(async () => {
        dbName = 'testdb-load-' + new Date().getTime()
        accessController = new OrbitDBAccessController(orbitdb1)
        await accessController.load(dbName)
        await accessController.grant('write', id1, { after: mockEntry1 })
        await accessController.grant('write', id2, { after: mockEntry1 })
        await accessController.grant('write', id3, { after: mockEntry1 })
        await accessController.grant('write', id3, { after: mockEntry1 }) // double entry
        await accessController.revoke('write', id3, { after: mockEntry1 })
        await accessController.grant('another', id4, { after: mockEntry1 })
        await accessController.grant('another', id5, { after: mockEntry1 })
        await accessController.revoke('another', id4, { after: mockEntry1 })
        await accessController.grant('admin', id1, { after: mockEntry1 })
        return new Promise(async (resolve) => {
          // Test that the access controller emits 'updated' after it was loaded
          accessController.on('updated', () => resolve())
          await accessController.load(accessController.address)
        })
      })

      it('has the correct database address for the internal db', async () => {
        const addr = accessController._db.address.toString().split('/')
        assert.equal(addr[addr.length - 1], '_access')
        assert.equal(addr[addr.length - 2], dbName)
      })

      it('has correct capabalities', async () => {
        assert.deepEqual(accessController.get('admin'), new Set([id1.publicKey]))
        assert.deepEqual(accessController.get('write'), new Set([id1.publicKey, id2.publicKey]))
        assert.deepEqual(accessController.get('another'), new Set([id5.publicKey]))
      })
    })
  })
  // TODO: use two separate peers for testing the AC
  // TODO: add tests for revocation correctness with a database (integration tests)
})
