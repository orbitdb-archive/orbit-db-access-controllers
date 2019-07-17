'use strict'

const EventEmitter = require('events').EventEmitter

/**
 * Interface for OrbitDB Access Controllers
 *
 * Any OrbitDB access controller needs to define and implement
 * the methods defined by the interface here.
 */
class AccessController extends EventEmitter {
  /*
    Every AC needs to have a 'Factory' method
    that creates an instance of the AccessController
  */
  static async create (orbitdb, options) {}

  /* Return the type for this controller */
  static get type () {
    throw new Error(`'static get type ()' needs to be defined in the inheriting class`)
  }

  /*
    Return the type for this controller
    NOTE! This is the only property of the interface that
    shouldn't be overridden in the inherited Access Controller
  */
  get type () {
    return this.constructor.type
  }

  /* Each Access Controller has some address to anchor to */
  get address () {}

  /*
    Define what optional functions are actually implemented in this controller
  */
  get definedCapabilities () {
    return {
      grant: false,
      revoke: false
    }
  }

  /*
    Called by the databases (the log) to see if entry should
    be allowed in the database. Return true if the entry is allowed,
    false is not allowed
  */
  async canAppend (entry, identityProvider) {}

  /* Add and remove access */
  async grant (access, identity) {}
  async revoke (access, identity) {}

  /* AC creation and loading */
  async load (address) {}
  /* Returns AC manifest parameters object */
  async save () {}
  /* Called when the database for this AC gets closed */
  async close () {}
}

module.exports = AccessController
