# orbit-db-access-controllers

> Access Controllers for OrbitDB

[![Gitter](https://img.shields.io/gitter/room/nwjs/nw.js.svg)](https://gitter.im/orbitdb/Lobby)
[![npm version](https://badge.fury.io/js/orbit-db-access-controllers.svg)](https://www.npmjs.com/package/orbit-db-access-controllers)
[![node](https://img.shields.io/node/v/orbit-db-access-controllers.svg)](https://www.npmjs.com/package/orbit-db-access-controllers)

## Install

This project uses [npm](http://npmjs.com/) and [nodejs](https://nodejs.org/).

```sh
npm i orbit-db-access-controllers
```

## Usage

By default, if no write-array is specified in options, the access control is set so that the initial user is the only one who has access (specified by the identity property of the orbitdb instance given in the argument). For the Ethereum-based contract example, the account which deploys the contract is initially given access.

#### Creating a custom Access Controller

You can create a custom access controller by implementing the `AccessController` [interface](https://github.com/orbitdb/orbit-db-access-controllers/blob/master/src/access-controller-interface.js) and adding it to the AccessControllers object before passing it to OrbitDB. For more detailed examples, see the implementation of the [Ethereum Contract Access Controller](https://github.com/orbitdb/orbit-db-access-controllers/blob/master/src/contract-access-controller.js) and [OrbitDB Access Controller](https://github.com/orbitdb/orbit-db-access-controllers/blob/master/src/orbitdb-access-controller.js).

```javascript
class OtherAccessController extends AccessController {

  static get type () { return 'othertype' } // Return the type for this controller

  async canAppend(entry, identityProvider) {
    // logic to determine if entry can be added, for example:
    if (entry.payload === "hello world" && entry.identity.id === identity.id && identityProvider.verifyIdentity(entry.identity))
      return true

    return false
  }
  async grant (access, identity) {} // Logic for granting access to identity
}

let AccessControllers = require('orbit-db-access-controllers')
AccessControllers.addAccessController({ AccessController: OtherAccessController })

const orbitdb = await OrbitDB.createInstance(ipfs, {
  AccessControllers: AccessControllers
})

const db = await orbitdb.keyvalue('first-database', {
  accessController: {
    type: 'othertype',
    write: [identity.publicKey]
  }
})
```

## Contribute

We would be happy to accept PRs! If you want to work on something, it'd be good to talk beforehand to make sure nobody else is working on it. You can reach us [on Gitter](https://gitter.im/orbitdb/Lobby), or in the [issues section](https://github.com/orbitdb/orbit-db-access-controllers/issues)

We also have **regular community calls**, which we announce in the issues in [the @orbitdb welcome repository](https://github.com/orbitdb/welcome/issues). Join us!

If you want to code but don't know where to start, check out the issues labelled ["help wanted"](https://github.com/orbitdb/orbit-db-access-controllers/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22+sort%3Areactions-%2B1-desc).

For specific guidelines for contributing to this repository, check out the [Contributing guide](CONTRIBUTING.md). For more on contributing to OrbitDB in general, take a look at the [orbitdb welcome repository](https://github.com/orbitdb/welcome). Please note that all interactions in [@orbitdb](https://github.com/orbitdb) fall under our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © 2018 Haja Networks Oy
