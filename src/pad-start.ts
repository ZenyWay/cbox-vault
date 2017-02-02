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

/**
 * minimal implementation of String#padStart
 * (which is poorly supported in browsers as of January 2017).
 * it does not support unicode,
 * but is OK for padding hexadecimal.
 */
export default function padStart (str: string, length?: number, padstring?: string): string {
	const padlen = +length - str.length
  return Number.isSafeInteger(padlen) && padlen > 0
  ? addStart(str, padlen, toPadString(padstring))
  : str
}

function toPadString (padstring: any, alt?: string): string {
	const padchars = padstring && padstring.toString()
  return padchars && padchars.length ? padchars : alt || ' '
}

function addStart (str: string, length: number, padstring: string): string {
  return length > padstring.length
  ? addStart(str, length, padstring + padstring)
  : padstring.slice(0, length) + str
}
