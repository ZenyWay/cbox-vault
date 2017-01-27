/**
 * Copyright 2016 Stephane M. Catala
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * Limitations under the License.
 */
;
import getCboxVault from '../../src'
import getOpgpService from 'opgp-service'
const PouchDB = require('pouchdb-browser')
const pbkdf2 = require('pbkdf2').pbkdf2
const randombytes = require('randombytes')

import debug = require('debug')
debug.enable('example:*,cbox-vault:*,rx-pouchdb:*')

const opgp = getOpgpService()

// setup hash function for securely hashing _id values before storing to db
const salt = randombytes(64)
const hash = function (id: string): Promise<Uint8Array> {
  return new Promise(function (resolve, reject) {
    pbkdf2(id, salt, 4096, 24, function (err: any, hash: Uint8Array) {
      if (err) { reject(err) } else { resolve(hash) }
    })
  })
}

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
  hash: hash,
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

function getId (doc: any): any {
  return Array.isArray(doc) ? doc.map(getId) : { _id: doc._id }
}

const refs = docs.map(getId)

// write docs to vault
const write$ = sids.write(docs)
.do(debug('example:write:'))

// read docs from vault
const read$ = sids.read(refs)
.do(debug('example:read:'))

// search Rob Hubbard tunes
const search$ = sids.read([{
  startkey: 'hubbard',
  endkey: 'hubbard\ufff0'
}])
.do(debug('example:search:'))

write$.forEach(nop)
.catch(debug('example:write:error:'))
.then(() => read$.forEach(nop))
.catch(debug('example:read:error:'))
.then(() => search$.forEach(nop))
.catch(debug('example:search:error:'))
.then(() => db.destroy())
.then(debug('example:destroy:done'))
.catch(debug('example:destroy:error:'))

function nop () {}
