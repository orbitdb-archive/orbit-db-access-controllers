'use strict'

const assert = require('assert')
const rmrf = require('rimraf')
const OrbitDB = require('orbit-db')
const IdentityProvider = require('orbit-db-identity-provider')
const Keystore = require('orbit-db-keystore')
const OrbitDBAccessController = require('../src/orbitdb-access-controller')
const AccessControllers = require('../')

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
  describe('orbit-db - OrbitDBAccessController', function() {
    this.timeout(config.timeout)

    let ipfsd1, ipfsd2, ipfs1, ipfs2, id1, id2
    let orbitdb1, orbitdb2

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

      id1 = await IdentityProvider.createIdentity({ipfs: ipfs1, keystore: keystore1 })
      id2 = await IdentityProvider.createIdentity({ipfs: ipfs2, keystore: keystore2 })

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
        const canAppend = await accessController.canAppend(mockEntry, id1.provider)
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
          await accessController.grant('write', id1.publicKey)
        } catch (e) {
          assert(e, null)
        }
        assert.deepEqual(accessController.capabilities, {
          admin: new Set([id1.publicKey]),
          write: new Set([id1.publicKey])
        })
      })

      it('adds more capabilities', async () => {
        try {
          await accessController.grant('read', 'ABCD')
          await accessController.grant('delete', 'ABCD')
        } catch (e) {
          assert.equal(e, null)
        }
        assert.deepEqual(accessController.capabilities, {
          admin: new Set([id1.publicKey]),
          write: new Set([id1.publicKey]),
          read: new Set(['ABCD']),
          delete: new Set(['ABCD'])
        })
      })

      it('emit \'updated\' event when a capability was added', async () => {
        return new Promise(async (resolve, reject) => {
          accessController.on('updated', () => {
            try {
              assert.deepEqual(accessController.capabilities, {
                admin: new Set([id1.publicKey]),
                write: new Set([id1.publicKey]),
                read: new Set(['ABCD', 'AXES']),
                delete: new Set(['ABCD'])
              })
              resolve()
            } catch (e) {
              reject(e)
            }
          })
          await accessController.grant('read', 'AXES')
        })
      })

      it('can append after acquiring capability', async () => {
        try {
          await accessController.grant('write', id1.publicKey)
          await accessController.grant('write', id2.publicKey)
        } catch (e) {
          assert(e, null)
        }
        const mockEntry1 = {
          identity: id1,
        }
        const mockEntry2 = {
          identity: id2,
        }
        const canAppend1 = await accessController.canAppend(mockEntry1, id1.provider)
        const canAppend2 = await accessController.canAppend(mockEntry2, id2.provider)
        assert.equal(canAppend1, true)
        assert.equal(canAppend2, true)
      })
    })

    describe('revoke', function () {
      let accessController

      before(async () => {
        accessController = new OrbitDBAccessController(orbitdb1)
        await accessController.load('testdb/remove')
      })

      it('removes a capability', async () => {
        try {
          await accessController.grant('write', id1.publicKey)
          await accessController.grant('write', 'AABB')
          await accessController.revoke('write', 'AABB')
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
          await accessController.revoke('write', id1.publicKey)
        } catch (e) {
          assert.equal(e, null)
        }
        assert.deepEqual(accessController.capabilities, {
          admin: new Set([id1.publicKey])
        })
      })

      it('can\'t remove the creator\'s admin access', async () => {
        try {
          await accessController.revoke('admin', id1.publicKey)
        } catch (e) {
          assert.equal(e, null)
        }
        assert.deepEqual(accessController.capabilities, {
          admin: new Set([id1.publicKey])
        })
      })

      it('removes more capabilities', async () => {
        try {
          await accessController.grant('read', 'ABCD')
          await accessController.grant('delete', 'ABCD')
          await accessController.grant('write', id1.publicKey)
          await accessController.revoke('read', 'ABCDE')
          await accessController.revoke('delete', 'ABCDE')
        } catch (e) {
          assert.equal(e, null)
        }
        assert.deepEqual(accessController.capabilities, {
          admin: new Set([id1.publicKey]),
          delete: new Set(['ABCD']),
          read: new Set(['ABCD']),
          write: new Set([id1.publicKey])
        })
      })

      it('can\'t append after revoking capability', async () => {
        try {
          await accessController.grant('write', id2.publicKey)
          await accessController.revoke('write', id2.publicKey)
        } catch (e) {
          assert(e, null)
        }
        const mockEntry1 = {
          identity: id1
        }
        const mockEntry2 = {
          identity: id2
        }
        const canAppend = await accessController.canAppend(mockEntry1, id1.provider)
        const noAppend = await accessController.canAppend(mockEntry2, id2.provider)
        assert.equal(canAppend, true)
        assert.equal(noAppend, false)
      })

      it('emits \'updated\' event when a capability was removed', async () => {
        await accessController.grant('admin', 'cats')
        await accessController.grant('admin', 'dogs')

        return new Promise(async (resolve, reject) => {
          accessController.on('updated', () => {
            try {
              assert.deepEqual(accessController.capabilities, {
                admin: new Set([id1.publicKey, 'dogs']),
                delete: new Set(['ABCD']),
                read: new Set(['ABCD']),
                write: new Set([id1.publicKey])
              })
              resolve()
            } catch (e) {
              reject(e)
            }
          })
          await accessController.revoke('admin', 'cats')
        })
      })
    })

    describe('save and load', function () {
      let accessController, dbName

      before(async () => {
        dbName = 'testdb-load-' + new Date().getTime()
        accessController = new OrbitDBAccessController(orbitdb1)
        await accessController.load(dbName)
        await accessController.grant('write', 'A')
        await accessController.grant('write', 'B')
        await accessController.grant('write', 'C')
        await accessController.grant('write', 'C') // double entry
        await accessController.grant('another', 'AA')
        await accessController.grant('another', 'BB')
        await accessController.revoke('another', 'AA')
        await accessController.grant('admin', id1.publicKey)
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
        assert.deepEqual(accessController.get('write'), new Set(['A', 'B', 'C']))
        assert.deepEqual(accessController.get('another'), new Set(['BB']))
      })
    })
  })
  // TODO: use two separate peers for testing the AC
  // TODO: add tests for revocation correctness with a database (integration tests)
})
