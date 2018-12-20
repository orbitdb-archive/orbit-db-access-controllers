# orbit-db-access-controllers

> Access Controllers for OrbitDB

## Install

This project uses [npm](http://npmjs.com/) and [nodejs](https://nodejs.org/).

```sh
npm i orbit-db-access-controllers
```

#### Creating a custom Access Controller

You can create a custom access controller by implementing the `AccessController` [interface](https://github.com/orbitdb/orbit-db-access-controllers/blob/master/src/access-controller-interface.js) and adding it to the AccessControllers object before passing it to OrbitDB.

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
    write: [identity1.publicKey]
  }
})
```

## Contribute

We would be happy to accept PRs! If you want to work on something, it'd be good to talk beforehand to make sure nobody else is working on it. You can reach us on IRC [#orbitdb](http://webchat.freenode.net/?channels=%23orbitdb) on Freenode, or in the comments of the [issues section](https://github.com/orbitdb/orbit-db-access-controllers/issues).

We also have **regular community calls**, which we announce in the issues in [the @orbitdb welcome repository](https://github.com/orbitdb/welcome/issues). Join us!

If you want to code but don't know where to start, check out the issues labelled ["help wanted"](https://github.com/orbitdb/orbit-db-access-controllers/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22+sort%3Areactions-%2B1-desc).

For specific guidelines for contributing to this repository, check out the [Contributing guide](CONTIRBUTING.md). For more on contributing to OrbitDB in general, take a look at the [orbitdb welcome repository](https://github.com/orbitdb/welcome). Please note that all interactions in @orbitdb fall under our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © 2018 Haja Networks Oy
