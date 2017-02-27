/*
 * Copyright 2017 Stephane M. Catala
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
import { DocBox } from './doc-box'
import { isUndefined } from './utils'
import newRxPouchDb, {
  RxPouchDb,
  DocRevStatus, VersionedDoc, DocRef, DocRevs, DocIdRange, DocId, ReadOpts
} from 'rx-pouchdb'
import { Observable } from 'rxjs'
import { OpgpService, OpgpProxyKey, KeyRefMap } from 'opgp-service'
import { __assign as assign } from 'tslib'

export type Eventual<T> = PromiseLike<T>|T
export type OneOrMore<T> = T[]|T

/**
 * @interface
 * @function
 *
 * @param {any} db a PouchDB instance
 * @param {OpgpProxyKey} key unlocked
 * @param {Partial<CoreVaultSpec>} opts
 *
 * @returns {CoreVault}
 *
 * @throws {TypeError} if db is not an instance of PouchDB
 *
 */
export interface CoreVaultFactory {
  (db: any, opgp: OpgpService, keys: KeyRing, opts?: Partial<CoreVaultSpec>): CoreVault
}

export interface CoreVaultSpec {
  read: ReadOpts
}

export interface CoreVault {
  /** TODO update inline doc !
   * rx operator that stores the documents from an input sequence to
   * the underlying [cryptobox](https://www.npmjs.com/package/cryptobox) instance,
   * and maps that input sequence to a corresponding sequence of
   * resulting {DocRef} references.
   *
   * @template D extends VersionedDoc[]|VersionedDoc
   * a versioned document,
   * or an array of versioned documents.
   *
   * @param {Observable<D>|PromiseLike<D>|ArrayLike<D>} docs
   * a sequence of instances or arrays of {ZenypassDoc} versioned documents.
   *
   * @return {Observable<DocRef[]|DocRef>}
   * sequence of resulting {DocRef} references after storage.
   * when the input `doc$` sequence emits an array of documents,
   * the output sequence emits a resulting array of {DocRef} references,
   * in the same order.
   *
   * @error {Error} when storing a document fails,
   * e.g. when the underlying key is locked.
   * // TODO provide more detail on possible storage errors
   *
   * @public
   * @method
   *
   * @memberOf CboxVault
   */
  write (doc$: Observable<OneOrMore<DocBox>>): Observable<OneOrMore<DocRef>>

  /** TODO update inline doc !
   * rx operator that maps a sequence of document references
   * to the corresponding documents fetched from
   * the underlying [cryptobox](https://www.npmjs.com/package/cryptobox) instance.
   * the input document reference sequence may alternatively emit
   * any of the following:
   * * individual {DocRef} or {DocId} references,
   * * arrays of {DocRef} or {DocId} references,
   * * {DocIdRange} ranges of document references,
   * * {DocRevs} sets of references to document revisions.
   *
   * @template R extends DocRef[]|DocIdRange|DocRevs|DocRef
   * a single or multiple document reference(s),
   * specified as a {DocRef} or {DocId} document reference,
   * an array of {DocRef} or {DocId} document references,
   * a {DocIdRange} range of document references,
   * or a {DocRevs} set of references to document revisions.
   *
   * @template D extends VersionedDoc|(VersionedDoc&DocRevStatus)
   *
   * @param {Observable<R>|PromiseLike<R>|ArrayLike<R>} refs
   * a sequence of document references.
   *
   * @param {ReadOpts=} opts
   *
   * @return {Observable<D[]|D>}
   * the referenced {VersionedDoc} document(s)
   * or only the corresponding {VersionedDoc} stubbed references,
   * retrieved from the underlying
   * [cryptobox](https://www.npmjs.com/package/cryptobox) instance.
   * when the input `refs` sequence emits
   * an array of {DocRef} or {DocId} references,
   * a {DocIdRange} range of document references,
   * or a {DocRevs} set of references to document revisions,
   * the output sequence emits a resulting array
   * of versioned documents or {DocRef} references,
   * in the order of the input array of references,
   * or else as specified by the {DocIdRange} range.
   *
   * restricted properties are returned as getter methods
   * that take a passphrase as input and return the property value
   * if the hash of the given passphrase
   * equals {CboxVaultSpec.restrict.hash}
   *
   * @error {Error} when retrieving a document fails
   * e.g. when the underlying key is locked.
   * // TODO provide more detail on possible fetch errors
   *
   * @public
   * @method
   *
   * @memberOf CboxVault
   */
  read (ref$: Observable<OneOrMore<DocRef>|DocRevs|DocIdRange>, opts?: ReadOpts):
  Observable<OneOrMore<DocBox>|DocBox&DocRevStatus>

  /**
   * @param {OpgpProxyKey} key unlocked
   *
   * @returns {CoreVault}
   *
   * @error {Error} 'invalid key', e.g. if key is locked
   */
  unlock (keys: KeyRing): CoreVault
}

export interface KeyRing {
  cipher: OneOrMore<Eventual<OpgpProxyKey>>
  auth: OneOrMore<Eventual<OpgpProxyKey>>
}

export interface RevStatusDoc extends VersionedDoc, RevStatus {}

export interface RevStatus {
  _revisions?: any, // TODO define _revisions interface
  _revs_info?: any, // TODO define _revs_info interface
  _conflicts?: any, // TODO define _conflicts interface
}

/**
 * wrapper that unwraps all Eventual<OpgpProxyKey> instances for core vault
 */
class CoreVaultWrapperClass implements CoreVault {
  static getInstance: CoreVaultFactory =
  function (db: any, opgp: OpgpService, keys: KeyRing, opts?: Partial<CoreVaultSpec>): CoreVault {
    const rxdb = newRxPouchDb(db, opts)
    const keys$ = Observable.fromPromise(unwrapKeyRing(keys))
    const vault$ = keys$.map(keys => CoreVaultClass.getInstance(rxdb, opgp, keys))

    return new CoreVaultWrapperClass(vault$)
  }

  write (doc$: Observable<OneOrMore<DocBox>>): Observable<OneOrMore<DocRef>> {
    return this.vault$.flatMap(vault => vault.write(doc$))
  }

  read (ref$: Observable<OneOrMore<DocRef>|DocRevs|DocIdRange>, opts?: ReadOpts):
  Observable<OneOrMore<DocBox|DocBox&DocRevStatus>> {
    return this.vault$.flatMap(vault => vault.read(ref$, opts))
  }

  unlock (keys: KeyRing): CoreVault {
    const vault$ = this.vault$
    .flatMap(vault => unwrapKeyRing(keys).then(keys => vault.unlock(keys)))

    return new CoreVaultWrapperClass(vault$)
  }

  private constructor (
    private vault$: Observable<CoreVaultClass>
  ) {}
}

/**
 * unwrap all Promise<OpgpProxyKey> in the given KeyRing
 */
function unwrapKeyRing (keys: KeyRing): Promise<KeyRefMap> {
  return unwrapOneOrMore(keys.auth)
  .then(auth => unwrapOneOrMore(keys.cipher).then(cipher =>  ({ // Promise.join
    auth: auth,
    cipher: cipher
  })))
}

function unwrapOneOrMore <T>(values: OneOrMore<Eventual<T>>): Promise<OneOrMore<T>> {
  return Promise.all((<Eventual<T>[]>[]).concat(values))
}

/**
 * core vault, without encoded `_id` fields.
 */
class CoreVaultClass {
  static getInstance =
  function (rxdb: RxPouchDb, opgp: OpgpService, keys: KeyRefMap, opts?: Partial<CoreVaultSpec>) {
    return new CoreVaultClass(rxdb, opgp, keys)
  }

  write (doc$: Observable<OneOrMore<DocBox>>): Observable<OneOrMore<DocRef>> {
    const cipher$: Observable<OneOrMore<DocBox>> =
    doc$.flatMap(doc => this.encrypt(doc))

    return this.rxdb.write(cipher$)
  }

  read (ref$: Observable<OneOrMore<DocRef>|DocRevs|DocIdRange>, opts?: ReadOpts):
  Observable<OneOrMore<DocBox>|DocBox&DocRevStatus> {
    const cipher$ = <Observable<OneOrMore<DocBox>|DocBox&DocRevStatus>>
    this.rxdb.read(ref$)

    return cipher$.flatMap(doc => this.decrypt(doc))
  }

  unlock (keys: KeyRefMap) {
    return CoreVaultClass.getInstance(this.rxdb, this.opgp, keys)
  }

  private constructor (
    private rxdb: RxPouchDb,
    private opgp: OpgpService,
    private keys: KeyRefMap
  ) {}

  private encrypt (doc: OneOrMore<DocBox>): Promise<OneOrMore<DocBox>> {
    return Array.isArray(doc)
    ? Promise.all(doc.map(doc => this.encryptDoc(doc)))
    : this.encryptDoc(doc)
  }

  private decrypt (doc: OneOrMore<DocBox>): Promise<OneOrMore<DocBox>> {
    return Array.isArray(doc)
    ? Promise.all(doc.map(doc => this.decryptDoc(doc)))
    : this.decryptDoc(doc)
  }

  private encryptDoc (doc: DocBox): Promise<DocBox> {
    return Promise.resolve(this.opgp.encrypt(this.keys, doc.content)
    .then(content => setDocBoxContent(doc, content)))
  }

  private decryptDoc (doc: DocBox): Promise<DocBox> {
    return Promise.resolve(this.opgp.decrypt(this.keys, doc.content)
    .then(content => setDocBoxContent(doc, content)))
  }
}

function setDocBoxContent (doc: DocBox, content: string): DocBox {
  return assign({}, doc, { content: content })
}

const getCoreVault: CoreVaultFactory = CoreVaultWrapperClass.getInstance
export default getCoreVault
