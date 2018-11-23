'use strict'

const assert = require('assert')
const rmrf = require('rimraf')
const OrbitDB = require('orbit-db')
const IdentityProvider = require('orbit-db-identity-provider')
const Keystore = require('orbit-db-keystore')
const AccessControllerStore = require('orbit-db-access-controller-store')
const AccessControllers = require('../')
const Clock = require('ipfs-log/src/lamport-clock')

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
  describe.only('orbit-db - OrbitDBAccessController Integration', function () {
    this.timeout(config.timeout)

    let ipfsd1, ipfsd2, ipfs1, ipfs2, id1, id2
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

      id1 = await IdentityProvider.createIdentity(keystore1, 'userAA')
      id2 = await IdentityProvider.createIdentity(keystore2, 'userBB')

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

      mockEntry1 = {
        identity: id1,
        clock: new Clock(id1.publicKey, 1)
      }
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

    describe('OrbitDB Integration', function () {
      let db, db2
      let dag
      let dbManifest, acManifest

      beforeEach(async () => {
        db = await orbitdb1.feed('AABB', {
          identity: id1,
          accessController: {
            type: 'orbitdb',
            write: [id1]
          }
        })

        db2 = await orbitdb2.feed(db.address, { identity: id2 })
        await db2.load()

        dag = await ipfs1.object.get(db.address.root)
        dbManifest = JSON.parse(dag.toJSON().data)
        const hash = dbManifest.accessController.split('/').pop()
        const acManifestDag = await ipfs1.object.get(hash)
        acManifest = JSON.parse(acManifestDag.toJSON().data)
      })

      afterEach(async () => {
        if (db) {
          await db.drop()
        }
        if (db2) {
          await db2.drop()
        }
      })

      it('has the correct access rights after creating the database', async () => {
        assert.deepEqual(db.access.capabilities, {
          admin: new Set([id1.publicKey]),
          write: new Set([id1.publicKey])
        })
      })

      it('makes database use the correct access controller', async () => {
        assert.equal(acManifest.params.address, db.access._db.address)
      })

      it('saves database manifest file locally', async () => {
        assert.notEqual(dbManifest, null)
      })

      it('saves access controller manifest file locally', async () => {
        assert.notEqual(acManifest, null)
      })

      describe('database manifest', () => {
        it('has correct name', async () => {
          assert.equal(dbManifest.name, 'AABB')
        })

        it('has correct type', async () => {
          assert.equal(dbManifest.type, 'feed')
        })

        it('has correct address', async () => {
          assert.notEqual(dbManifest.accessController, null)
          assert.equal(dbManifest.accessController.indexOf('/ipfs'), 0)
        })
      })

      describe('access controller manifest', () => {
        it('has correct type', async () => {
          assert.equal(acManifest.type, 'orbitdb')
        })

        it('has correct address', async () => {
          assert.equal(acManifest.params.address.indexOf('/orbitdb'), 0)
          assert.equal(acManifest.params.address.split('/').pop(), '_access')
        })
      })

      describe('access controls', () => {
        it('granting access enables to write to the database', async () => {
          let err
          try {
            await db2.add('hello?')
            assert.equal('Should not end here', false)
          } catch (e) {
            // console.log(e)
            err = e
          }

          assert.equal(err, 'Error: Could not append entry, key "userBB" is not allowed to write to the log')

          const doChanges = () => {
            return new Promise(async (resolve, reject) => {
              try {
                // Wait for the second user's AC to notify it was updated
                db2.access.once('updated', async () => {
                  // Wait for the first user's db to replicate the update
                  db.events.once('replicated', () => {
                    // FIXME: timeout to get rid of the "libp2p node not started yet" errors
                    setTimeout(() => resolve(), 1000)
                  })
                  // Try adding something again
                  await db2.add('hello!')
                })
                // Give access to the second user
                const lastEntry = db.iterator({ limit: 1 }).collect()[0]
                await db.access.grant('write', id2, { after: mockEntry1 })
              } catch (e) {
                reject(e)
              }
            })
          }
          await doChanges()
          const res1 = await db.iterator().collect().map(e => e.payload.value)
          const res2 = await db2.iterator().collect().map(e => e.payload.value)
          assert.deepEqual(res1, ['hello!'])
          assert.deepEqual(res2, ['hello!'])
        })

        it('granting and revoking access allows entries written under granted access to be in the log', async () => {
          let err
          try {
            await db2.add('hello?')
            assert.equal('Should not end here', false)
          } catch (e) {
            err = e
          }

          assert.equal(err, 'Error: Could not append entry, key "userBB" is not allowed to write to the log')

          const doChanges = () => {
            return new Promise(async (resolve, reject) => {
              try {
                // Wait for the second user's AC to notify it was updated
                db2.access.once('updated', async () => {
                  // Wait for the first user's db to replicate the update
                  db.events.once('replicated', async () => {
                    try {
                      const lastEntry = db.iterator({ limit: 1 }).collect()[0]
                      await db.access.revoke('write', id2, { after: lastEntry })
                      const addr = db.address
                      await db.close()
                      db = await orbitdb1.feed(addr)
                      await db.load()
                      // FIXME: timeout to get rid of the "libp2p node not started yet" errors
                      // setTimeout(() => resolve(), 2000)
                      resolve()
                    } catch (e) {
                      // assert.equal(e, null)
                      reject(e)
                    }
                  })
                  // Try adding something again
                  await db2.add('hello!')
                })
                // Give access to the second user
                const lastEntry = db.iterator({ limit: 1 }).collect()[0]
                await db.access.grant('write', id2, { after: mockEntry1 })
              } catch (e) {
                reject(e)
              }
            })
          }
          await doChanges()
          const res1 = await db.iterator().collect().map(e => e.payload.value)
          const res2 = await db2.iterator().collect().map(e => e.payload.value)
          assert.deepEqual(res1, ['hello!'])
          assert.deepEqual(res2, ['hello!'])
        })

        it('can\'t grant access if doesn\'t have write access', async () => {
          let err
          try {
            await db2.access.grant('write', id2, { after: mockEntry1 })
          } catch (e) {
            err = e
          }
          assert.equal(err, 'Error: Could not append entry, key "userBB" is not allowed to write to the log')
        })

        it('can\'t revoke access if doesn\'t have write access', async () => {
          let err
          try {
            await db2.access.revoke('write', id1, { after: mockEntry1 })
          } catch (e) {
            err = e
          }
          assert.equal(err, 'Error: Could not append entry, key "userBB" is not allowed to write to the log')
        })

        it('revoking access disables ability to write to the database', async () => {
          const getError = () => {
            return new Promise(async (resolve, reject) => {
              try {
                // Wait for the second user's AC to notify it was updated
                db2.access.once('updated', async () => {
                  let err
                  try {
                    // Try adding something again
                    await db2.add('hello?')
                  } catch (e) {
                    err = e
                  }
                  resolve(err)
                })
                // Revoke user's access
                await db.access.revoke('write', id2, { after: mockEntry1 })
              } catch (e) {
                reject(e)
              }
            })
          }
          const err = await getError()
          assert.equal(err, 'Error: Could not append entry, key "userBB" is not allowed to write to the log')
        })
      })
    })
  })
  // TODO: use two separate peers for testing the AC
  // TODO: add tests for revocation correctness with a database (integration tests)
})
