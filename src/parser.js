'use strict'

import Result from './result'
import * as util from './util'

/**
 * Class representing a parsers
 * Every class extending this one should have a process method
 */
export default class Parser {
  /**
   * Creates a parser
   */
  constructor () {
    if (this.process === undefined) {
      throw new TypeError('Must override process')
    }
    this.result = new Result()

    this.mapValues = false
  }

  /**
   * Maps parsed values
   * @param {Function}  mapValues - function that mapes the values
   * @return {Parser}   this parser
   */
  map (mapValues) {
    this.mapValues = mapValues
    return this
  }

  /**
   * Parses an input
   * @param {Iterable}  input - iterable (string, array) with the values to be parsed
   * @return {Result}   result of the parse
   */
  parse (input) {
    this.result = new Result(input)
    this.result = this.process(input)

    if (this.mapValues) this.result.values = this.result.values.map(this.mapValues)

    return this.result
  }

  /**
   * Returns a parser for this or empty.
   * @param {Mixed}   empty - value to be pased in the empty result
   * @return {Parser} new generated parser
   */
  orNone (empty = '') {
    return this.or(empty)
  }

  /**
   * Returns a negated version of this parser
   * @return {Parser} new generated parser
   */
  not () {
    return new NegatedParser(this)
  }

  /**
   * Returns a parser that then does another parsing
   * @param {Function}  cb - callback that returns a new parser
   * @param {Boolean}   alwaysCheckSecond - whether to check or not for the second step on empty.
   * @return {Parser} new generated parser
   */
  then (next, alwaysCheckSecond) {
    if (next === undefined) return Parser.zero()
    const cb = !(typeof next === 'function')
      ? () => next
      : next
    return new BindedParser(this, cb, alwaysCheckSecond)
  }

  /**
   * Returns a parser of this parser or another
   * @param {Array<Parser>}   arguments - list of parsers to or
   * @return {Parser}         new generated parser
   */
  or () {
    const parsers = [this, ...arguments].map((parser) => {
      if (!(parser instanceof Parser)) return Parser.result(parser)
      return parser
    })

    return new AddedParser(...parsers)
  }

  /**
   * Creates a parser that success if this one passes a condition
   * @param {Function}  condition - function that takes an input and returns a boolean
   * @return  {Parser}  parser that success in a condition
   */
  satisfy (condition) {
    return this.then((input) => condition(input) ? input : Parser.zero())
  }

  /**
   * Alias of satisfy
   * @param {Function}  condition - function that takes an input and returns a boolean
   * @return  {Parser}  parser that success in a condition
   */
  filter (condition) {
    return this.satisfy(condition)
  }

  /**
   * Returns a parser to check that input has at least one element
   * @return  {Parser}
   */
  many (type) {
    return this.then((c) =>
      this.manyOrNone('', type).then((c1) => {
        if (!c1) c1 = util.accumulator(typeof c, type)

        if (c1.constructor === String) c1 = c + c1
        else {
          c1.unshift(c)
        }
        return Parser.result(c1)
      }))
  }

  /**
   * Returns a parser to check that input has 0+ elements of this parser
   * @param {Mixed}   empty - value to be pased in the empty result
   * @return {Parser}
   */
  manyOrNone (empty = '', type) {
    return this.many(type).or(empty)
  }

  /**
   * Returns a parser to check that the item is a given value
   * @param {Mixed}   value - value to check
   * @return {Parser}
   */
  equals (value) {
    return this.satisfy((input) => value === input)
  }

  /**
   * Returns a parser to checks that the first items are equals to a given value
   * @param {Mixed}   value - value to check
   * @param {Boolean} partial - checks for partial success
   * @return {Parser}
   */
  startsWith (value, partial = false) {
    const handleResult = (partialValue) => {
      if (partial) return partialValue

      if (partialValue === value) return value

      return Parser.zero()
    }

    if (!value.length) return Parser.zero()

    return this.equals(value[0]).then((head) =>
            this.startsWith(value.slice(1)).then((tail) =>
              handleResult(head + tail), true))
  }

  /**
   * Returns a parser that checks for various results of this separated by another parser
   * @param {Parser}  parser - returns the separator
   * @param {Mixed}   empty - value to be pased in the empty result
   * @return {Parser}
   */
  sepBy (parser, empty = '') {
    return this.then((head) => {
      const sepParser = parser.then((_) =>
        this.then((next) => next)
      )
      return sepParser.manyOrNone().then((tail) =>
        util.toArray(head).concat(tail)
      )
    }).or(empty)
  }

  /**
   * Returns a parser that checks for this parser betweeen other parsers
   * @param {Parser}  left - parser for the left part
   * @param {Parser}  right - parser for the right part (optional)
   * @return {Parser}
   */
  between (left, right) {
    if (!right) right = left

    return left.then((_) =>
            this.then((res) =>
              right.then((_) =>
                res)))
  }

  /**
   * Returns a parser that checks for this parser to be chained with an operation
   * @param  {Parser}  operation - operation to chain with the parser
   * @param  {Mixed}   def - value to be pased in case of empty result
   * @return {Parser}
   */
  chain (operation, def) {
    const rest = (x) => operation.then((f) =>
      this.then((y) => rest(f(x, y)))
    ).or(x)

    const parser = this.then(rest)

    if (def !== undefined) return parser.or(def)
    return parser
  }

  /**
   * Returns a parser that checks for this parser to be chained to the right with an operation
   * @param  {Parser}   operation - operation to chain with the parser
   * @param  {Mixed}   def - value to be pased in case of empty result
   * @return {Parser}
   */
  chainRight (operation, def) {
    const rest = (x) => operation.then((f) =>
      this.chainRight(operation).then((y) => f(x, y))
    ).or(x)

    const parser = this.then(rest)

    if (def) return parser.or(def)
    return parser
  }

  /**
   * Returns a parser that checks that strims the results
   * @param  {Parser} junk - parser with the junk to trim
   * @return {Parser}
   */
  trim (junk = Parser.junk) {
    return this.between(junk)
  }

  /**
   * Returns a copy of the current parser
   * @return {Parser}
   */
  copy () {
    const newParser = new this.constructor()
    return Object.assign(newParser, this)
  }
}

// Operations

/**
 * Result
 * Return always a basic value
 * @param {Mixed}   value - value of the result
 * @return {Parser}
 */
Parser.result = function (value) {
  return new ResultParser(value)
}

/**
 * Zero
 * Returns the zero parser
 * @return {Parser}
 */
Parser.zero = function () {
  return new ZeroParser()
}

/**
 * Item
 * Returns the item parser
 * @return {Parser}
 */
Parser.item = function () {
  return new ItemParser()
}

/**
 * lazy
 * Returns a parser that will be defined on execution time
 * @param   {Function}  fn - returns a lazy parser
 * @return  {Parser}
 */
Parser.lazy = (fn) => new LazyParser(fn)

/**
 * Operators
 * Creates a parser for a list of operators
 * @param   {Array<Parser>} arguments - list of parsers
 * @return  {Parser}
 */
Parser.operations = function () {
  return [...arguments].reduce((parser, next) =>
      parser.or(next[0].then(() => next[1])), Parser.zero())
}

// Basic parsers

/**
 * Item parser
 * Returns first character of the input and zero if a zero length input
 */
class ItemParser extends Parser {
  process (input) {
    if (input && input.length) {
      return this.result.push(input[0], input.slice(1))
    }
    return this.result
  }
}

/**
 * Zero parser
 * Returns always an empty result
 */
class ZeroParser extends Parser {
  process (_) {
    return this.result
  }
}

/**
 * Result parser
 * Returns always the same value
 */
class ResultParser extends Parser {
  constructor (value) {
    super()
    this.value = value
  }

  process (input) {
    return this.result.push(this.value === undefined
        ? input
        : this.value, input)
  }
}

/**
 * Binded parser
 * Returns the result of thening two parsers
 */
class BindedParser extends Parser {
  constructor (parser, cb, alwaysCheckSecond = false) {
    super()
    this.parser = parser.copy()
    this.cb = cb
    this.alwaysCheckSecond = alwaysCheckSecond
  }

  process (input) {
    const firstResult = this.parser.parse(input)
    const nextParserFn = this.parserifyCb()

    if (this.alwaysCheckSecond && !firstResult.length) return nextParserFn('', input).parse(input)

    for (const [ value, string ] of firstResult) {
      this.result = this.result.concat(nextParserFn(value, string).parse(string))
    }
    return this.result
  }

  parserifyCb () {
    return (value, input) => {
      let nextParser = this.cb.bind(this)(value, input)
      if (!(nextParser instanceof Parser)) nextParser = Parser.result(nextParser)

      return nextParser.copy()
    }
  }

  /**
   * Returns a copy of the current parser
   * @return {Parser}
   */
  copy () {
    return new BindedParser(this.parser, this.cb, this.alwaysCheckSecond)
  }
}

/**
 * Added parser
 * Returns the result of adding two parsers
 */
class AddedParser extends Parser {
  constructor () {
    super()
    this.parsers = [...arguments].map((parser) => parser.copy())
  }

  process (input) {
    for (const index in this.parsers) {
      const parser = this.parsers[index]
      const res = parser.parse(input)
      if (res.length) return res
    }
    return this.result
  }

  /**
   * Returns a copy of the current parser
   * @return {Parser}
   */
  copy () {
    return new AddedParser(...this.parsers)
  }
}

class NegatedParser extends Parser {
  constructor (parser) {
    super()
    this.parser = parser.copy()
  }

  process (input) {
    const res = this.parser.process(input)
    if (res.length) return this.result
    return this.result.push(input, input)
  }

  /**
   * Returns a copy of the current parser
   * @return {Parser}
   */
  copy () {
    return new NegatedParser(this.parser)
  }
}

class LazyParser extends Parser {
  constructor (parserFn) {
    super()
    this.parserFn = parserFn.bind(this)
  }

  getParser () {
    if (this.parser) return this.parser.copy()
    this.parser = this.parserFn().copy()
    return this.parser
  }

  process (input) {
    return this.getParser().process(input)
  }

  copy () {
    if (this.parser) return this.parser.copy()
    return new LazyParser(this.parserFn)
  }
}
