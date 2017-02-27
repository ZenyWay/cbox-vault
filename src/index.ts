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
import getCoreVault, {
  Eventual, OneOrMore, CoreVault, CoreVaultSpec, KeyRing
} from './core-vault'
import {
  DocRevStatus, VersionedDoc, DocRef, DocRevs, DocIdRange, DocId, ReadOpts
} from 'rx-pouchdb'
import getReadRequestFactory, { ReadRequestFactory } from './read-request'
import getEncoder, { IdEncoder } from './id-encoder'
import getShuffledBins from './shuffled-bins'
import { DocBox, box, unbox } from './doc-box'
import { OpgpService } from 'opgp-service'
import { Observable } from 'rxjs'
import { Subscribable } from 'rxjs/Observable'
import { __assign as assign } from 'tslib'
import * as debug from 'debug'

export type Streamable<T> = Subscribable<T>|PromiseLike<T>|ArrayLike<T>

export {
  Eventual, OneOrMore, KeyRing,
  DocRevStatus, VersionedDoc, DocRef, DocRevs, DocIdRange, DocId, ReadOpts
}

/**
 * @interface
 * @function
 *
 * @param {any} db a PouchDB instance
 * @param {OpgpProxyKey} key unlocked
 * @param {Partial<CboxVaultSpec>} opts
 *
 * @returns {CboxVault}
 *
 * @throws {TypeError} if db is not an instance of PouchDB
 *
 */
export interface CboxVaultFactory {
  (db: any, opgp: OpgpService, keys: KeyRing, opts?: Partial<CboxVaultSpec>): CboxVault
}

export interface CboxVaultSpec extends CoreVaultSpec {
  /**
   * hash function for encoding `_id` fields
   * e.g. id => pbkdf2(id, salt, iterations, length, 'sha512').
   * `_id` fields are not encoded if this function is not defined.
   */
  hash (id: string): Eventual<Uint8Array|string>
  /**
   * list of string bin delimitors
   */
  bins: Eventual<string[]>
}

export interface CboxVault {
  /**
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
  write <D extends VersionedDoc> (docs: Streamable<D>): Observable<D>
  write <D extends VersionedDoc> (docs: Streamable<D[]>): Observable<D[]>
  write <D extends VersionedDoc>
  (docs: Streamable<OneOrMore<D>>): Observable<OneOrMore<D>>

  /**
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
  read <D extends VersionedDoc> (refs: Streamable<DocRef>, opts?: ReadOpts):
  Observable<D>
  read <D extends VersionedDoc> (refs: Streamable<DocRef[]>, opts?: ReadOpts):
  Observable<D[]>
  read <D extends VersionedDoc> (refs: Streamable<DocIdRange>, opts?: ReadOpts):
  Observable<D[]>
  read <D extends VersionedDoc> (refs: Streamable<DocRevs>, opts?: ReadOpts):
  Observable<D&DocRevStatus>
  read <D extends VersionedDoc>
  (refs: Streamable<OneOrMore<DocRef>|DocRevs|DocIdRange>, opts?: ReadOpts):
  Observable<OneOrMore<D>|D&DocRevStatus>

  /**
   * @param {OpgpProxyKey|Promise<OpgpProxyKey>} key unlocked
   *
   * @returns {CoreVault}
   *
   * @error {Error} 'invalid key', e.g. if key is locked
   */
  unlock (keys: KeyRing): CboxVault
}

class CboxVaultClass implements CboxVault {
  static getInstance: CboxVaultFactory =
  function (db: any, opgp: OpgpService, keys: KeyRing, opts?: Partial<CboxVaultSpec>): CboxVault {
    const vault = getCoreVault(db, opgp, keys, { read: opts && opts.read })
    const encoder = opts && getEncoder(opts.hash, {
      // TODO: change encoder opts to accept string[]|BinAllocator<string> instead of shuffledbins
      shuffledbins: Promise.resolve(opts && opts.bins).then(bins => getShuffledBins(bins))
    })
    const getReadRequest$ = getReadRequestFactory(encoder)

    return new CboxVaultClass(vault, encoder, getReadRequest$)
  }

  write <D extends VersionedDoc> (docs: Streamable<OneOrMore<D>>) {
    const doc$ = Observable.from(docs)
    .do<OneOrMore<D>>(debug('cbox-vault:write:'))
    .share() // hot observable that waits for first subscription

    const req$ = doc$.map(doc => box(doc)) // ignore index argument from map
    .concatMap(ref => this.encoder.encode(ref))

    return this.vault.write(req$)
    .zip(doc$)
    .map(([ ref, doc ]) => update(doc, ref))
    .share()
  }

  read <D extends VersionedDoc>
  (refs: Streamable<OneOrMore<DocRef>|DocRevs|DocIdRange>, opts?: ReadOpts) {
    const ref$: Observable<OneOrMore<DocRef>|DocRevs|DocIdRange> = Observable.from(refs)
    .do(debug('cbox-vault:read:'))
    .share() // hot observable that waits for first subscription

    const req$ = ref$.concatMap(refs => this.getReadRequest$(refs))
    .share()

    return this.vault.read(req$.pluck('value'))
    .map(unbox) // unbox ignores index argument from map
    .zip(req$)
    .groupBy(([ val, req ]) => req.key, ([ val, req ]) => req.mapResponse(val))
    .flatMap(res$ => res$.reduce(concat))
    .share()
  }

  unlock (keys: KeyRing): CboxVault {
    return new CboxVaultClass(this.vault.unlock(keys), this.encoder, this.getReadRequest$)
  }

  private constructor (
    private vault: CoreVault,
    private encoder: IdEncoder,
    private getReadRequest$: ReadRequestFactory
  ) {}
}

function concat <D extends VersionedDoc>(acc: D[], val: OneOrMore<D>|D&DocRevStatus):
OneOrMore<VersionedDoc>|VersionedDoc&DocRevStatus {
  return !acc || !acc.length ? val : acc.concat(val)
}

function update <D extends VersionedDoc>(doc: OneOrMore<D>, ref: OneOrMore<DocRef>): OneOrMore<D> {
  return  Array.isArray(ref) ? zip(<D[]>doc, ref, updateDoc) : updateDoc(<D>doc, ref)
}

function updateDoc <D extends VersionedDoc>(doc: D, ref: DocRef): D {
  return assign({}, doc, { _rev: ref._rev })
}

function zip <A,B,C>(a: A[], b: B[], map: (a: A, b: B) => C): C[] {
  return a.map((u, i) => map(u, b[i]))
}

const getCboxVault: CboxVaultFactory = CboxVaultClass.getInstance
export default getCboxVault
