'use strict'

const assert = require('assert')
const rmrf = require('rimraf')
const OrbitDB = require('orbit-db')
const IdentityProvider = require('orbit-db-identity-provider')
const Keystore = require('orbit-db-keystore')
const AccessControllers = require('../')
const ContractAccessController = require('../src/contract-access-controller')
const DepositContractAccessController = require('../src/deposit-contract-access-controller')
const { open } = require('@colony/purser-software')
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
  describe('orbit-db - ContractAccessController Integration', function () {
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

      const wallet1 = await open({ privateKey: '0x3141592653589793238462643383279502884197169399375105820974944592' })
      const wallet2 = await open({ privateKey: '0x2141592653589793238462643383279502884197169399375105820974944592' })

      const signer1 = async (id, data) => await wallet1.signMessage({ message: data })
      const signer2 = async (id, data) => await wallet2.signMessage({ message: data })

      id1 = await IdentityProvider.createIdentity(keystore1, wallet1.address, { type: 'ethers', identitySignerFn: signer1 })
      id2 = await IdentityProvider.createIdentity(keystore2, wallet2.address, { type: 'ethers', identitySignerFn: signer2 })

      web3 = new Web3(ganache.provider())
      accounts = await web3.eth.getAccounts()

      let options = {
        AccessControllers: [ ContractAccessController, DepositContractAccessController ]
      }
      AccessControllers.addAccessControllers(options)

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
      accessControllers.forEach(async (ac, i) => {
        let db, db2
        let dag
        let dbManifest, acManifest
        let contract

        before(async () => {
          contract = await new web3.eth.Contract(ac.contract.abi)
                              .deploy({ data: ac.contract.bytecode })
                              .send({ from: accounts[i], gas: '1000000' })

          //DB creator needs to provide ac-type, abi and contract-address
          db = await orbitdb1.feed('AABB', {
            identity: id1,
            accessController: {
              type: ac.AccessController.type,
              web3: web3,
              abi: ac.contract.abi,
              contractAddress: contract._address,
              defaultAccount: accounts[i]
            }
          })

          //DB peer needs to provide web3 instance
          db2 = await orbitdb2.feed(db.address, {
            identity: id2,
            accessController: {
              web3: web3,
              defaultAccount: accounts[(i+1) % accessControllers.length] //peer owns different eth-account
            }
          })

          await db2.load()

          dag = await ipfs1.object.get(db.address.root)
          dbManifest = JSON.parse(dag.toJSON().data)
          const hash = dbManifest.accessController.split('/').pop()
          const acManifestDag = await ipfs1.object.get(hash)
          acManifest = JSON.parse(acManifestDag.toJSON().data)
        })

        it('makes database use the correct access controller', async () => {
          assert.equal(acManifest.params.contractAddress, db.access.address)
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
            assert.equal(acManifest.type, ac.AccessController.type)
          })

          it('has correct address', async () => {
            assert.equal(acManifest.params.contractAddress.indexOf('0x'), 0)
            assert.equal(acManifest.params.contractAddress, db.access.address)
          })
        })

        describe('access controls', () => {
          it('throws error if key not permitted to write', async () => {
            let err
            try {
              await db.add('hello?') // should throw error
              assert.equal('Should not end here', false)
            } catch (e) {
              err = e
            }
            assert.equal(err, `Error: Could not append entry, key "${id1.id}" is not allowed to write to the log`)
          })

          it('granting access enables to write to the database', async () => {
            await db.access.grant('write', id1.id)
            const doChanges = () => {
              return new Promise(async (resolve, reject) => {
                try {
                  await db.add('hello!')
                  db2.events.once('replicated', () => {
                    // FIXME: timeout to get rid of the "libp2p node not started yet" errors
                    setTimeout(() => resolve(), 1000)
                  })
                } catch(e) {
                  reject(e)
                }
              })
            }
            // Try adding something again
            await doChanges()

            const res1 = await db.iterator().collect().map(e => e.payload.value)
            const res2 = await db2.iterator().collect().map(e => e.payload.value)
            assert.deepEqual(res1, ['hello!'])
            assert.deepEqual(res2, ['hello!'])
          })

          it('can\'t grant access if not admin', async () => {
            await db2.access.grant('write', id2.id)
            const canAppend = await db2.access.canAppend( { identity: id2 })
            assert.equal(canAppend, false)
          })

          it('can\'t revoke access if not admin', async () => {
            await db2.access.revoke('write', id1.id)
            const canAppend = await db2.access.canAppend( { identity: id1 })
            assert.equal(canAppend, true)
          })

          it('can check permissions without defaultAccount set', async () => {
            db2.access.defaultAccount = null
            const canAppend = await db2.access.canAppend( { identity: id1 })
            assert.equal(canAppend, true)
          })

          it('can\'t change permissions without from address if no defaultAccount set', async () => {
            let err
            db2.access.defaultAccount = null
            try {
              await db2.access.grant('write', id2.id)
            } catch(e){
              err = e
            }
            assert.equal(err, 'Error: No "from" address specified in neither the given options, nor the default options.')
          })

          it('can change permissions by passing in from address', async () => {
            let err
            db2.access.defaultAccount = null
            try {
              await db2.access.grant('write', id2.id, { from: accounts[i] }) //from address can grant/revoke access
            } catch(e){
              err = e
            }
            assert.equal(err, null)
            const canAppend = await db2.access.canAppend( { identity: id2 })
            assert.equal(canAppend, true)
          })

          it('revoking access disables ability to write to the database', async () => {
            let err
            try {
              // Revoke user's access
              await db.access.revoke('write', id2.id)
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
})
