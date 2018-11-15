h'use strict'

const assert = require('assert')
const rmrf = require('rimraf')
const OrbitDB = require('orbit-db')
const IdentityProvider = require('orbit-db-identity-provider')
const Keystore = require('orbit-db-keystore')
const AccessControllers = require('../')
const { open } = require('@colony/purser-software')
const { abi, bytecode } = require('./Access')
const ganache = require('ganache-cli')
const Web3 = require('web3')

// Include test utilities
const {
  config,
  startIpfs,
  stopIpfs,
  testAPIs
} = require('./utils')

const dbPath1 = './orbitdb/tests/contract-access-controller-integration/1'
const dbPath2 = './orbitdb/tests/contract-access-controller-integration/2'
const ipfsPath1 = './orbitdb/tests/contract-access-controller-integration/1/ipfs'
const ipfsPath2 = './orbitdb/tests/contract-access-controller-integration/2/ipfs'

Object.keys(testAPIs).forEach(API => {
  describe('orbit-db - ContractAccessController Integration', function () {
    this.timeout(config.timeout)

    let ipfsd1, ipfsd2, ipfs1, ipfs2, id1, id2
    let orbitdb1, orbitdb2
    let web3, accounts, contract

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

      const wallet1 = await open({ privateKey: '0x3141592653589793238462643383279502884197169399375105820974944592' })
      const wallet2 = await open({ privateKey: '0x2141592653589793238462643383279502884197169399375105820974944592' })

      const signer1 = async (id, data) => await wallet1.signMessage({ message: data })
      const signer2 = async (id, data) => await wallet2.signMessage({ message: data })

      id1 = await IdentityProvider.createIdentity(keystore1, wallet1.address, { type: 'ethers', identitySignerFn: signer1 })
      id2 = await IdentityProvider.createIdentity(keystore2, wallet2.address, { type: 'ethers', identitySignerFn: signer2 })

      web3 = new Web3(ganache.provider())
      accounts = await web3.eth.getAccounts()
      contract = await new web3.eth.Contract(abi)
                          .deploy({ data: bytecode })
                          .send({ from: accounts[0], gas: '1000000' })

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

    describe('OrbitDB Integration', function () {
      let db, db2
      let dag
      let dbManifest, acManifest

      before(async () => {
        db = await orbitdb1.feed('AABB', {
          identity: id1,
          accessController: {
            type: 'eth-contract',
            web3: web3,
            abi: abi,
            contractAddress: contract._address
          }
        })

        db2 = await orbitdb2.feed(db.address, { identity: id2, accessController: { web3: web3 } })
        await db2.load()

        dag = await ipfs1.object.get(db.address.root)
        dbManifest = JSON.parse(dag.toJSON().data)
        const hash = dbManifest.accessController.split('/').pop()
        const acManifestDag = await ipfs1.object.get(hash)
        acManifest = JSON.parse(acManifestDag.toJSON().data)
      })

      it('makes database use the correct access controller', async () => {
        assert.equal(acManifest.params.contractAddress, db.access.contract._address)
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
          assert.equal(acManifest.type, 'eth-contract')
        })

        it('has correct address', async () => {
          console.log(acManifest)
          assert.equal(acManifest.params.contractAddress.indexOf('0x'), 0)
          assert.equal(acManifest.params.contractAddress, contract._address)
        })
      })

      describe('access controls', () => {
        it('granting access enables to write to the database', async () => {
          let err
          try {
            await db.add('hello?')
            assert.equal('Should not end here', false)
          } catch (e) {
            err = e
          }

          assert.equal(err, `Error: Could not append entry, key "${id1.id}" is not allowed to write to the log`)
          // await doChanges()
          await db.access.grant('write', id1.id, { from: accounts[0] })
          await db.add('hello!')
          const res1 = await db.iterator().collect().map(e => e.payload.value)
          // const res2 = await db2.iterator().collect().map(e => e.payload.value)
          assert.deepEqual(res1, ['hello!'])
          // assert.deepEqual(res2, ['hello!'])
        })

        it('can\'t grant access if not admin', async () => {
          await db2.access.grant('write', id2.id, { from: accounts[1] })
          const canAppend = await db2.access.canAppend( { identity: id2 })
          assert.equal(canAppend, false)
        })

        it('can\'t revoke access if not admin', async () => {
          await db2.access.revoke('write', id1.id, { from: accounts[1] })
          const canAppend = await db2.access.canAppend( { identity: id1 })
          assert.equal(canAppend, true)
        })

        it('revoking access disables ability to write to the database', async () => {
          let err
          try {
            db.events.once('replicated', () => {
              // FIXME: timeout to get rid of the "libp2p node not started yet" errors
              setTimeout(() => resolve(), 1000)
            })
            // Revoke user's access
            await db.access.revoke('write', id2.id, { from: accounts[0] })
            await db2.add('hello?')
          } catch (e) {
            err = e
          }
          assert.equal(err, `Error: Could not append entry, key "${id2.id}" is not allowed to write to the log`)
        })
      })
    })
  })
})
