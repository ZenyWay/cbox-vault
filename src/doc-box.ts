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
import { OneOrMore } from './core-vault'
import { VersionedDoc, DocRevStatus } from 'rx-pouchdb'
import { __assign as assign } from 'tslib'

/**
 * stringified doc wrapped in a corresponding VersionedDoc
 */
export interface DocBox extends VersionedDoc {
  content: string
}

export function box <D extends VersionedDoc>(doc: OneOrMore<D>, id?: string): OneOrMore<DocBox> {
  return Array.isArray(doc)
  ? doc.map(d => boxDoc(d))  // ignore index argument from map
  : boxDoc(doc)
}

export function unbox <D extends VersionedDoc>(box: OneOrMore<DocBox>|DocBox&DocRevStatus): OneOrMore<D>|D&DocRevStatus {
  return Array.isArray(box)
  ? box.map(b => unboxDocBox<D>(b))  // ignore index argument from map
  : unboxDocBox<D>(box)
}

function boxDoc <D extends VersionedDoc>(doc: D, id?: string): DocBox {
  const box = <DocBox>{
    _id: id || doc._id, // empty id string considered undefined
    content: JSON.stringify(doc)
  }
  if (doc._rev) { box._rev = doc._rev } // empty _rev string considered undefined
  if (doc._deleted) { box._deleted = doc._deleted }

  return box
}

function unboxDocBox <D extends VersionedDoc>
(box: DocBox|DocBox&DocRevStatus): D|D&DocRevStatus {
  const doc = assign({}, box) // VersionedDoc & DocRevStatus
  delete doc.content
  assign(doc, <D>JSON.parse(box.content)) // shallow copy ok
  doc._rev = box._rev // doc._rev is stale

  return doc
}

