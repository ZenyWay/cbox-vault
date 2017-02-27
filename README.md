# cbox-vault [![Join the chat at https://gitter.im/ZenyWay/cbox-vault](https://badges.gitter.im/ZenyWay/cbox-vault.svg)](https://gitter.im/ZenyWay/cbox-vault?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![NPM](https://nodei.co/npm/cbox-vault.png?compact=true)](https://nodei.co/npm/cbox-vault/)
[![build status](https://travis-ci.org/ZenyWay/cbox-vault.svg?branch=master)](https://travis-ci.org/ZenyWay/cbox-vault)
[![coverage status](https://coveralls.io/repos/github/ZenyWay/cbox-vault/badge.svg?branch=master)](https://coveralls.io/github/ZenyWay/cbox-vault)
[![Dependency Status](https://gemnasium.com/badges/github.com/ZenyWay/cbox-vault.svg)](https://gemnasium.com/github.com/ZenyWay/cbox-vault)

pouchdb-based vault that encrypts/decrypts docs to/from the underlying db.
* replicates the [Observable](http://reactivex.io/rxjs/)-based
API of [rx-pouchdb](https://www.npmjs.com/package/rx-pouchdb)
that it wraps, adding support for encryption.
* encryption builds on the robust [openpgp](https://openpgpjs.org/) library
with [opgp-service](https://www.npmjs.com/package/opgp-service).
* supports hashing of document `_id` fields (see example).

# <a name="example"></a> example
```ts
import getCboxVault, { DocId, VersionedDoc } from 'cbox-vault'
import getOpgpService from 'opgp-service'
import getRandomBinsFactory from 'randombins'
const PouchDB = require('pouchdb-browser')
const pbkdf2 = require('pbkdf2').pbkdf2
const randombytes = require('randombytes')

import debug = require('debug')
debug.enable('example:*,cbox-vault:*,rx-pouchdb:*,id-encoder:*,shuffled-bins:*')

const opgp = getOpgpService()

// define hash function for securely hashing _id values before storing to db
const salt = randombytes(64)
const hash = function (id: string): Promise<Uint8Array> {
  return new Promise(function (resolve, reject) {
    pbkdf2(id, salt, 4096, 24, function (err: any, hash: Uint8Array) {
      if (err) { reject(err) } else { resolve(hash) }
    })
  })
}

// define random bins for more efficient startkey/endkey search
const alphabet = '-abcdefghijklmnopqrstuvw_'
const getRandomBins = getRandomBinsFactory({ size: 16})
const bins = getRandomBins([ alphabet, alphabet ])
.reduce((arr, bin) => arr.concat(bin), [])

const key = opgp.generateKey('john.doe@example.com', {
  size: 2048,
  unlocked: true
})

const db = new PouchDB('sids')
const sids = getCboxVault(db, opgp, { // encrypt and sign with same key-pair
  cipher: key,
  auth: key
}, {
  hash: hash,
  bins: bins,
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

function getId <D extends VersionedDoc>(doc: D): DocId
function getId <D extends VersionedDoc>(doc: D[]|D) {
  return Array.isArray(doc) ? doc.map(getId) : <DocId>{ _id: doc._id }
}

const refs = docs.map(getId)

// write docs to vault
const write$ = sids.write(docs)

// read docs from vault
const read$ = sids.read(refs)

// search Rob Hubbard tunes
const search$ = sids.read([{
  startkey: 'hubbard-',
  endkey: 'hubbard-\uffff'
}])

write$.forEach(debug('example:write:'))
.catch(debug('example:write:error:'))
.then(() => read$.forEach(debug('example:read:')))
.catch(debug('example:read:error:'))
.then(() => search$.forEach(debug('example:search:')))
.catch(debug('example:search:error:'))
.then(() => db.destroy())
.then(debug('example:destroy:done'))
.catch(debug('example:destroy:error:'))
```
view [a live version of this example in the browser console](https://cdn.rawgit.com/ZenyWay/cbox-vault/v1.1.0/spec/example/index.html),
or by cloning this repository and running the following commands from a terminal:
```bash
npm install
npm run example
```
the files of this example are available [in this repository](./spec/example).

# <a name="api"></a> API v1.0 stable
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
