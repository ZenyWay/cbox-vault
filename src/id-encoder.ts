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
import { Eventual, OneOrMore, DocId, DocIdRange } from './core-vault'
import { ShuffledBinArray } from './shuffled-bins'
import { isString, isFunction } from './utils'
import * as base64 from 'base64-js'
import { __assign as assign } from 'tslib'

export interface IdEncoderFactory {
  (hash?: (id: string) => Eventual<Uint8Array>, opts?: Partial<IdEncoderSpec>): IdEncoder
}

export interface IdEncoderSpec {
  shuffledbins: Eventual<ShuffledBinArray>
}

export interface IdEncoder {
  encodeRange (range: DocIdRange): Promise<DocIdRange[]>
  encode <D extends DocId>(doc: OneOrMore<D>): Promise<OneOrMore<D>>
}

interface UnitIdEncoder {
  encodeRange (range: DocIdRange): Promise<DocIdRange[]>
  encode <D extends DocId>(doc: D): Promise<D>
}

const ENCODED_HASH = '%23'
const ENCODED_SLASH = '%2F'
const MAX_UNICODE = '\uffff'

class PassThroughEncoder implements IdEncoder {
  encodeRange (range: DocIdRange): Promise<DocIdRange[]> {
    return Promise.resolve([ range ])
  }
  encode <D extends DocId>(doc: OneOrMore<D>): Promise<OneOrMore<D>> {
    return Promise.resolve(doc)
  }
}

class IdEncoderWrapperClass implements IdEncoder {
  static getInstance: IdEncoderFactory =
  function (hash?: (id: string) => Eventual<Uint8Array>, opts?: Partial<IdEncoderSpec>): IdEncoder {
    if (!isFunction(hash)) { return new PassThroughEncoder() }

    const encoder = Promise.resolve(opts && opts.shuffledbins)
    .then(shuffledbins => isValidShuffledBinArray(shuffledbins)
      ? SemiHomomorphicIdEncoderClass.getInstance(hash, shuffledbins)
      : IdEncoderClass.getInstance(hash))

    return new IdEncoderWrapperClass(encoder)
  }

  encodeRange (range: DocIdRange): Promise<DocIdRange[]> {
    return this.encoder.then(encoder => encoder.encodeRange(range))
  }

  encode <D extends DocId>(doc: OneOrMore<D>): Promise<OneOrMore<D>> {
    return this.encoder.then(encoder => encode(encoder, doc))
  }

  constructor (
    private encoder: Promise<UnitIdEncoder>
  ) {}
}

function encode <D extends DocId>(encoder: UnitIdEncoder, doc: OneOrMore<D>): Promise<OneOrMore<D>> {
  return Array.isArray(doc)
    ? Promise.all(doc.map(doc => encoder.encode(doc)))
    : encoder.encode(doc)
}

class IdEncoderClass implements UnitIdEncoder {
  static getInstance (hash: (id: string) => Eventual<Uint8Array>, shuffledbins?: ShuffledBinArray): IdEncoder {
    return new IdEncoderClass(hash)
  }

  /**
   * since `_id` fields are not hashed homomorphically,
   * this method returns the full range of hashed `_id` fields.
   */
  encodeRange (range: DocIdRange): Promise<DocIdRange[]> {
    return Promise.resolve([ getFullPrefixedRange(this.getPrefix()) ])
  }

  encode <D extends DocId>(doc: D): Promise<D> {
    return Promise.resolve(this.hash(doc._id))
    .then(hash => setDocId(doc, this.getPrefix() + base64.fromByteArray(hash)))
  }

  protected constructor (
    protected hash: (id: string) => Eventual<Uint8Array>
  ) {}

  protected getPrefix (key?: string): string {
    return !key ? ENCODED_HASH : ENCODED_HASH + key
  }
}

class SemiHomomorphicIdEncoderClass extends IdEncoderClass implements UnitIdEncoder {
  static getInstance (hash: (id: string) => Eventual<Uint8Array>, shuffledbins: ShuffledBinArray): IdEncoder {
    return new SemiHomomorphicIdEncoderClass(hash, shuffledbins)
  }

  /**
   * ignores DocIdRange.descending and DocIdRange.inclusive_end properties
   */
  encodeRange (range: DocIdRange): Promise<DocIdRange[]> {
    const startindex =
    !range.startkey ? 0 : this.shuffledbins.allocator.indexOf(range.startkey)

    const endindex = range.endkey
    ? this.shuffledbins.allocator.indexOf(range.endkey) + 1
    : this.shuffledbins.allocator.length

    const ranges = this.shuffledbins.keys.shuffled
    .slice(startindex, endindex) // up until but excluding zero-based endindex
    .map(key => getFullPrefixedRange(this.getPrefix(key)))
    // TODO efficiently merge sequential keys, i.e. with sequential startkey values

    return Promise.resolve(ranges)
  }

  encode <D extends DocId>(doc: D): Promise<D> {
    const index = this.shuffledbins.allocator.indexOf(doc._id)
    const key = this.shuffledbins.keys.shuffled[index]

    return super.encode(doc)
    .then(doc => setDocId(doc, this.getPrefix(key) + doc._id))
  }

  private constructor (
    hash: (id: string) => Eventual<Uint8Array>,
    private shuffledbins: ShuffledBinArray,
  ) {
    super(hash)
  }

  protected getPrefix (key: string): string {
    return super.getPrefix(key) + ENCODED_SLASH
  }
}

function getFullPrefixedRange (prefix: string): DocIdRange {
  return {
    startkey: prefix,
    endkey: prefix + MAX_UNICODE
  }
}

function setDocId <D extends DocId>(doc: D, id: string): D {
  return assign({}, doc, { _id: id })
}

function isValidShuffledBinArray (bins?: any): bins is ShuffledBinArray {
  return !!bins && !!bins.keys
  && Array.isArray(bins.keys.shuffled)
  && !!bins.allocator && bins.allocator.length === bins.keys.shuffled.length
  && [ 'indexOf', 'map' ].every(prop => isFunction(bins.allocator[prop]))
  && bins.keys.shuffled.every(isString)
}

const getIdCodec: IdEncoderFactory = IdEncoderWrapperClass.getInstance
export default getIdCodec
