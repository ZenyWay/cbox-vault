/*
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
import { isString } from './utils'
import { RxPouchDb } from 'rx-pouchdb'
import { Observable } from 'rxjs'
import { OpgpService, OpgpProxyKey } from 'opgp-service'
import * as Promise from 'bluebird'

export type Streamable<T> = Observable<T>|PromiseLike<T>|ArrayLike<T>
export type Eventual<T> = PromiseLike<T>|T
export type OneOrMore<T> = T[]|T

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

export interface KeyRing {
  cipher: OneOrMore<Eventual<OpgpProxyKey>>
  auth: OneOrMore<Eventual<OpgpProxyKey>>
}

export interface CboxVaultSpec extends CoreVaultSpec, IdEncoderSpec {
  /**
   * restrict access to specifically listed properties
   * with a defined passphrase.
   * TODO implement support for `CboxVaultSpec.restrict`
   */
  restrict: VaultRestrictSpec
}

export interface CoreVaultSpec {
  read: ReadOpts
}

export interface VaultRestrictSpec {
  /**
   * hash of passphrase (SHA256) required
   * for unlocking restricted properties.
   */
  hash: string
  /**
   * restrict list of restricted properties,
   * in [dot-prop](https://www.npmjs.com/package/dot-prop) syntax.
   */
  props: string[]
}

export interface IdEncoderSpec {
  /**
   * shuffled random bins for `_id` codec
   */
  bins: string[]
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
  write <D extends VersionedDoc>
  (docs: Streamable<OneOrMore<D>>): Observable<OneOrMore<DocRef>>

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
  read <R extends DocRef|DocRevs, D extends RevStatusDoc|VersionedDoc>
  (refs: Streamable<OneOrMore<R>|DocIdRange>, opts?: ReadOpts): Observable<OneOrMore<D>>

  /**
   * @param {OpgpProxyKey|Promise<OpgpProxyKey>} key unlocked
   *
   * @returns {CoreVault}
   *
   * @error {Error} 'invalid key', e.g. if key is locked
   */
  unlock (keys: KeyRing): CboxVault
}

export interface RevStatusDoc extends VersionedDoc, RevStatus {}

export interface RevStatus {
  _revisions?: any, // TODO define _revisions interface
  _revs_info?: any, // TODO define _revs_info interface
  _conflicts?: any, // TODO define _conflicts interface
}

export interface VersionedDoc extends DocRef {
  _deleted?: boolean
}

/**
 * @public
 * @interface {DocRef}
 * a unique identifier (reference) of a specific version of a JSON document.
 * @see (JSON Document field description)[http://wiki.apache.org/couchdb/HTTP_Document_API#Special_Fields]
 */
export interface DocRef extends DocId {
  /**
   * @public
   * @prop {string} _rev? unique document revision identification string.
   * default: latest revision of document
   */
  _rev?: string
}

/**
 * @public
 * @interface {DocRevs}
 * a set of unique references to an array of versions of a JSON document.
 * @see (JSON Document field description)[http://wiki.apache.org/couchdb/HTTP_Document_API#Special_Fields]
 */
export interface DocRevs extends DocId {
  /**
   * @public
   * @prop {string[]} _revs list of document revision identification strings.
   * an empty array represents all document revisions.
   */
  _revs: string[]
}

/**
 * @public
 * @interface {DocId}
 * a unique identifier (reference) of a JSON document.
 * on its own, identifies the latest version of that document.
 * @see (JSON Document field description)[http://wiki.apache.org/couchdb/HTTP_Document_API#Special_Fields]
 */
export interface DocId {
  /**
   * @public
   * @prop {string} _id unique document identification string.
   */
  _id: string
}

/**
 * @public
 * @interface {DocIdRange}
 * a specification of a range of {DocRef#_id} document identifiers.
 * @see [pouhDB#allDocs](https://pouchdb.com/api.html#batch_fetch) options
 */
export interface DocIdRange {
  /**
   * @public
   * @prop {string} startkey
   * the start of the range of {DocRef#_id} document identifiers.
   * @see [pouhDB#allDocs](https://pouchdb.com/api.html#batch_fetch) options
   */
  startkey: string,
  /**
   * @public
   * @prop {string} endkey
   * the end of the range of {DocRef#_id} document identifiers.
   * @see [pouhDB#allDocs](https://pouchdb.com/api.html#batch_fetch) options
   */
  endkey: string,
  /**
   * @public
   * @prop {boolean} descending
   * reverse the order of the range of {DocRef#_id} document identifiers.
   * when `true`, the order of {DocIdRange#startkey} and {DocIdRange#endkey}
   * is reversed.
   * default: `false`.
   * @see [pouhDB#allDocs](https://pouchdb.com/api.html#batch_fetch) options
   */
  descending?: boolean,
  /**
   * @public
   * @prop {boolean} inclusive_end
   * when `true`, include documents with a {DocRef#_id} equal to
   * the given {DocIdRange#endkey}.
   * default: `true`.
   * @see [pouhDB#allDocs](https://pouchdb.com/api.html#batch_fetch) options
   */
  inclusive_end?: boolean
}

/**
 * @public
 * @interface {ReadOpts}
 */
export interface ReadOpts {
  /**
   * @public
   * @prop {boolean} binary
   * when `true`, retrieve the requested documents,
   * instead of only their {DocRef} references.
   * ignored and forced to `true` when fetching a single document.
   * default: `false` for retrieving only {DocRef} references
   * @see [PouchDb#allDocs](https://pouchdb.com/api.html#batch_fetch) options
   */
  include_docs?: boolean
}
