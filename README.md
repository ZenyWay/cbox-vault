# cbox-vault [![Join the chat at https://gitter.im/ZenyWay/cbox-vault](https://badges.gitter.im/ZenyWay/cbox-vault.svg)](https://gitter.im/ZenyWay/cbox-vault?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![NPM](https://nodei.co/npm/cbox-vault.png?compact=true)](https://nodei.co/npm/cbox-vault/)
[![build status](https://travis-ci.org/ZenyWay/cbox-vault.svg?branch=master)](https://travis-ci.org/ZenyWay/cbox-vault)
[![coverage status](https://coveralls.io/repos/github/ZenyWay/cbox-vault/badge.svg?branch=master)](https://coveralls.io/github/ZenyWay/cbox-vault)
[![Dependency Status](https://gemnasium.com/badges/github.com/ZenyWay/cbox-vault.svg)](https://gemnasium.com/github.com/ZenyWay/cbox-vault)

pouchdb-based vault that encrypts/decrypts docs to/from the underlying db.
* replicates the [Observable](http://reactivex.io/rxjs/)-based
API of [rx-pouchdb](https://www.npmjs.com/package/rx-pouchdb)
that it wraps, adding support for encryption.
* encryption builds on [openpgp](https://openpgpjs.org/)
with [opgp-service](https://www.npmjs.com/package/opgp-service)

# <a name="example"></a> example
```ts
import getCboxVault from 'cbox-vault'
import { Observable } from 'rxjs'
import getOpgpService, { OpgpKeyOpts } from 'opgp-service'
const PouchDB = require('pouchdb-browser')

import debug = require('debug')
debug.enable('example:*,cbox-vault:*,rx-pouchdb:*')

const opgp = getOpgpService()

const db = new PouchDB('sids')
const key = opgp.generateKey('john.doe@example.com', {
  size: 2048,
  unlocked: true
})

key.then(debug('example:key:'))

const sids = getCboxVault(db, opgp, { // encrypt and sign with same key-pair
  cipher: key,
  auth: key
}, {
  read: { include_docs: true } // required for bulk read
})

const docs = [{
  _id: 'hubbard-rob_monty-on-the-run',
  title: 'Monty on the Run',
  author: 'Rob Hubbard',
  release: '1985'
}, [{
  _id: 'hubbard-rob_sanxion',
  title: 'Sanxion',
  author: 'Rob Hubbard',
  release: '1986'
}, {
  _id: 'tel-jeroen_ikari-union',
  title: 'Ikari Union',
  author: 'Jeroen Tel',
  release: '1987'
}]]

// write docs to vault
const ref$ = sids.write(docs)
.do(debug('example:write:'))

// read docs from vault
const doc$ = sids.read(ref$) // read all written docs
.do(debug('example:read:'))

const rob$ = sids.read([{ // search Rob Hubbard tunes
  startkey: 'hubbard',
  endkey: 'hubbard\ufff0'
}])
.do(debug('example:search-rob'))

doc$.concat(rob$)
.forEach(nop)
.catch(debug('example:error:'))
.then(() => db.destroy())
.then(debug('example:destroy:done'))
.catch(debug('example:destroy:error:'))

function nop () {}
```
the files of this example are available [here](./spec/example).

# <a name="api"></a> API v1.0 experimental
`ES5` and [`Typescript`](http://www.typescriptlang.org/) compatible.
coded in `Typescript 2`, transpiled to `ES5`.

Typescript type definitions of the API can be found [here](./src/api.d.ts).

# <a name="contributing"></a> CONTRIBUTING
see the [contribution guidelines](./CONTRIBUTING.md)

# <a name="license"></a> LICENSE
Copyright 2017 Stéphane M. Catala

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the [License](./LICENSE) for the specific language governing permissions and
Limitations under the License.
