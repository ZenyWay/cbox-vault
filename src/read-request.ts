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
  Eventual, OneOrMore,
  DocId, DocRef, DocRevs, DocIdRange, VersionedDoc, RevStatusDoc
} from './core-vault'
import getEncoder, { IdEncoder } from './id-encoder'
import { isString, isFunction } from './utils'
import { Observable } from 'rxjs'

export interface ReadRequestFactoryBuilder {
  (encoder: IdEncoder, opts?: Partial<ReadRequestFactorySpec>): ReadRequestFactory
}

export interface ReadRequestFactorySpec {
  // void
}

export interface ReadRequestFactory {
  (refs: OneOrMore<DocRef>|DocRevs|DocIdRange, opts?: Partial<ReadRequestSpec>): Observable<ReadRequest>
}

export interface ReadRequestSpec {
  // void
}

export interface ReadRequest {
  key: string
  value: OneOrMore<DocRef>|DocRevs|DocIdRange
  mapResponse (docs: OneOrMore<VersionedDoc>|RevStatusDoc): OneOrMore<VersionedDoc>|RevStatusDoc
}

abstract class ReadRequestClass implements ReadRequest {
  static getFactory: ReadRequestFactoryBuilder =
  function (_encoder: IdEncoder, opts?: Partial<ReadRequestFactorySpec>) {
    const encoder = isValidIdEncoder(_encoder) ? _encoder : getEncoder()
    const keygenerator = new KeyGenerator()

    return (refs: OneOrMore<DocRef>|DocRevs|DocIdRange, opts?: Partial<ReadRequestSpec>) => {
      return isDocIdRange(refs)
      ? DocIdRangeReadRequestClass.getInstance$(encoder, keygenerator, refs)
      : DocRefReadRequestClass.getInstance$(encoder, keygenerator, refs)
    }
  }

  mapResponse (docs: OneOrMore<VersionedDoc>|RevStatusDoc): OneOrMore<VersionedDoc>|RevStatusDoc {
    return docs
  }

  value: OneOrMore<DocRef>|DocRevs|DocIdRange

  protected constructor (
    private encoder: IdEncoder,
    public key: string
  ) {}
}

class DocIdRangeReadRequestClass extends ReadRequestClass implements ReadRequest {
  static getInstance$ (encoder: IdEncoder, keygenerator: KeyGenerator,
  range: DocIdRange, opts?: Partial<ReadRequestSpec>): Observable<ReadRequest> {
    const key = keygenerator.getKey()
    const reqs: Promise<ReadRequest[]> = encoder.encodeRange(range)
    .then(ranges => ranges
      .map(sub => new DocIdRangeReadRequestClass(encoder, key, range, sub)))

    return Observable.fromPromise(reqs)
    .concatMap(reqs => Observable.from(reqs))
  }

  mapResponse (docs: VersionedDoc[]): OneOrMore<VersionedDoc>|RevStatusDoc {
    return docs.filter(isWithinRange(this.range)).sort(compareDocIds)
  }

  private constructor (encoder: IdEncoder, key: string,
    private range: DocIdRange,
    public value: DocIdRange
  ) {
    super(encoder, key)
  }
}

function compareDocIds (a: DocId, b: DocId): number {
  return a._id > b._id ? 1 : a._id < b._id ? -1 : 0
}

class DocRefReadRequestClass extends ReadRequestClass implements ReadRequest {
  static getInstance$ (encoder: IdEncoder, keygenerator: KeyGenerator,
  refs: OneOrMore<DocRef>|DocRevs, opts?: Partial<ReadRequestSpec>): Observable<ReadRequest> {
    const key = keygenerator.getKey()
    const req: Promise<ReadRequest> = encoder.encode<DocRef|DocRevs>(refs)
    .then(refs => new DocRefReadRequestClass(encoder, key, refs))

    return Observable.fromPromise(req)
  }

  private constructor (encoder: IdEncoder, key: string,
    public value: OneOrMore<DocRef>|DocRevs
  ) {
    super(encoder, key)
  }
}

/**
 * inexpensively generate unique keys
 */
class KeyGenerator {
  getKey () {
    return ++this.seq + Math.random().toString().slice(1)
  }
  constructor (
    private seq: number = 0
  ) {}
}

const RANGE_PREDICATE_FACTORY = {
  unbound: () => (doc: VersionedDoc) => true,
  bound: (range: DocIdRange) => (doc: VersionedDoc) => (doc._id <= range.endkey) && (doc._id >= range.startkey),
  lobound: (range: DocIdRange) => (doc: VersionedDoc) => (doc._id >= range.endkey),
  hibound: (range: DocIdRange) => (doc: VersionedDoc) => (doc._id <= range.endkey),
}

function isWithinRange (range?: DocIdRange): (doc: VersionedDoc) => boolean {
  if (!range) { return RANGE_PREDICATE_FACTORY.unbound() }
  const lobound = isString(range.startkey)
  const hibound = isString(range.endkey)
  return lobound
  ? hibound
    ? RANGE_PREDICATE_FACTORY.bound(range)
    : RANGE_PREDICATE_FACTORY.lobound(range)
  : hibound
    ? RANGE_PREDICATE_FACTORY.hibound(range)
    : RANGE_PREDICATE_FACTORY.unbound()
}

function isValidIdEncoder (val: any): val is IdEncoder {
  return !!val && isFunction(val.encode) && isFunction(val.encodeRange)
}

function isDocIdRange (val: any): val is DocIdRange {
  return !val._id && (isString(val.startkey) || isString(val.endkey))
}

const getReadRequestFactory: ReadRequestFactoryBuilder = ReadRequestClass.getFactory
export default getReadRequestFactory
