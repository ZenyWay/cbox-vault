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
import padStart from './pad-start'
import { isString, isFunction } from './utils'
import getBinAllocator, { BinAllocator } from 'bin-allocator'
import getRandomShuffle from 'randomshuffle'

export interface ShuffledBinArrayFactory {
  (bins: string[], opts?: Partial<ShuffledBinsSpec>): ShuffledBinArray
}

export interface ShuffledBinsSpec {
  /**
   * map number indexes to string keys
   */
  map (index: number): string

  /**
   * randomly shuffle a given array
   */
  randomshuffle <T>(arr: T[]): T[]
}

export interface ShuffledBinArray {
  allocator: BinAllocator<string>
  keys: {
    ordered: string[],
    shuffled: string[]
  }
}

class ShuffledBinArrayClass implements ShuffledBinArray {
  static getInstance: ShuffledBinArrayFactory =
  function (bins: string[], opts?: Partial<ShuffledBinsSpec>): ShuffledBinArray {
    if (!isValidBinList(bins)) { throw new TypeError('invalid argument') }

    const shuffle = opts && isFunction(opts.randomshuffle)
    ? opts.randomshuffle
    : getRandomShuffle()

    const orderedbins = getBinAllocator(bins)

    const keysize = (orderedbins.length - 1).toString(16).length

    const map = opts && isFunction(opts.map)
    ? opts.map
    : (val: number) => padStart(val.toString(16), keysize, '0')

    const orderedkeys = orderedbins.map((val, i) => map(i))
    const keys = {
      ordered: orderedkeys,
      shuffled: shuffle(orderedkeys)
    }

    const shuffledbins = new ShuffledBinArrayClass(orderedbins, keys)

    return shuffledbins
  }

  private constructor (
    public readonly allocator: BinAllocator<string>,
    public readonly keys: {
      ordered: string[],
      shuffled: string[]
    }
  ) {}
}

function isValidBinList (bins: any): bins is string[] {
  return Array.isArray(bins) && bins.every(isString)
}

const getShuffledBinArray: ShuffledBinArrayFactory = ShuffledBinArrayClass.getInstance
export default getShuffledBinArray
