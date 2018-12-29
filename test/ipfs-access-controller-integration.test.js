'use strict'

const assert = require('assert')
const rmrf = require('rimraf')
const OrbitDB = require('orbit-db')
const IdentityProvider = require('orbit-db-identity-provider')
const Keystore = require('orbit-db-keystore')
const AccessControllers = require('../')

// Include test utilities
const {
  config,
  startIpfs,
  stopIpfs,
  testAPIs
} = require('./utils')

const dbPath1 = './orbitdb/tests/orbitdb-access-controller-integration/1'
const dbPath2 = './orbitdb/tests/orbitdb-access-controller-integration/2'
const ipfsPath1 = './orbitdb/tests/orbitdb-access-controller-integration/1/ipfs'
const ipfsPath2 = './orbitdb/tests/orbitdb-access-controller-integration/2/ipfs'

Object.keys(testAPIs).forEach(API => {
  describe('orbit-db - IPFSAccessController Integration', function () {
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

      id1 = await IdentityProvider.createIdentity({ id: 'A', keystore: keystore1 })
      id2 = await IdentityProvider.createIdentity({ id: 'B', keystore: keystore2 })

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
      if (orbitdb1) { await orbitdb1.stop() }

      if (orbitdb2) { await orbitdb2.stop() }

      if (ipfsd1) { await stopIpfs(ipfsd1) }

      if (ipfsd2) { await stopIpfs(ipfsd2) }
    })

    describe('OrbitDB Integration', function () {
      let db, db2
      let dag
      let dbManifest, acManifest

      before(async () => {
        db = await orbitdb1.feed('AABB', {
          identity: id1,
          accessController: {
            type: 'ipfs',
            write: [id1.publicKey]
          }
        })

        db2 = await orbitdb2.feed(db.address, {
          identity: id2
        })
        await db2.load()

        dag = await ipfs1.object.get(db.address.root)
        dbManifest = JSON.parse(dag.toJSON().data)
        const hash = dbManifest.accessController.split('/').pop()
        const acManifestDag = await ipfs1.object.get(hash)
        acManifest = JSON.parse(acManifestDag.toJSON().data)
      })

      it('has the correct access rights after creating the database', async () => {
        assert.deepStrictEqual(db.access.write, [id1.publicKey])
      })

      it('makes database use the correct access controller', async () => {
        const { address } = await db.access.save()
        assert.strictEqual(acManifest.params.address, address)
      })

      it('saves database manifest file locally', async () => {
        assert.notStrictEqual(dbManifest, null)
      })

      it('saves access controller manifest file locally', async () => {
        assert.notStrictEqual(acManifest, null)
      })

      it('has correct type', async () => {
        assert.strictEqual(acManifest.type, 'ipfs')
      })

      describe('database manifest', () => {
        it('has correct name', async () => {
          assert.strictEqual(dbManifest.name, 'AABB')
        })

        it('has correct type', async () => {
          assert.strictEqual(dbManifest.type, 'feed')
        })

        it('has correct address', async () => {
          assert.notStrictEqual(dbManifest.accessController, null)
          assert.strictEqual(dbManifest.accessController.indexOf('/ipfs'), 0)
        })
      })

      describe('access controls', () => {
        it('allows to write if user has write access', async () => {
          let err
          try {
            await db.add('hello?')
          } catch (e) {
            err = e
          }

          const res = await db.iterator().collect().map(e => e.payload.value)
          assert.strictEqual(err, undefined)
          assert.deepStrictEqual(res, ['hello?'])
        })

        it('doesn\'t allow to write without write access', async () => {
          let err
          try {
            await db2.add('hello!!')
            assert.strictEqual('Should not end here', false)
          } catch (e) {
            err = e
          }

          const res = await db2.iterator().collect().map(e => e.payload.value)
          assert.strictEqual(err.message, `Could not append entry, key "${db2.identity.id}" is not allowed to write to the log`)
          assert.deepStrictEqual(res.includes(e => e === 'hello!!'), false)
        })
      })
    })
  })
  // TODO: use two separate peers for testing the AC
  // TODO: add tests for revocation correctness with a database (integration tests)
})
