// ---------------------------------------------------------------------------
// UK bank account modulus checking (VocaLink valacdos v6.40)
//
// UK domestic account numbers carry a checksum over the sort code + account
// number. Third-party IBAN validators run this check, so a GB IBAN whose
// account number is purely random is reported "incorrect" even when the IBAN's
// own MOD-97 checksum is valid. This module implements the official VocaLink
// algorithm (MOD10 / MOD11 / DBLAL plus exception codes 1-14) so we can both
// validate and GENERATE account numbers that genuinely pass the check.
//
// Reference: VocaLink "Validating account numbers / modulus checking" spec.
// ---------------------------------------------------------------------------

import { WEIGHT_TABLE, SC_SUBSTITUTES, type WeightRow } from "./uk-modulus-data"

// Index of each of the 14 digits (6 sort code + 8 account number) by letter,
// matching the weight-table column names u,v,w,x,y,z,a,b,c,d,e,f,g,h.
const POS = { u: 0, v: 1, w: 2, x: 3, y: 4, z: 5, a: 6, b: 7, c: 8, d: 9, e: 10, f: 11, g: 12, h: 13 } as const

const digits = (s: string) => s.replace(/\D/g, "")

/** All weight-table rows whose range contains this sort code (max 2). */
function rowsForSortCode(sortCode: number): WeightRow[] {
  const out: WeightRow[] = []
  for (const row of WEIGHT_TABLE) {
    if (sortCode >= row.s && sortCode <= row.e) {
      out.push(row)
      if (out.length === 2) break
    }
  }
  return out
}

function substituteSortCode(sortCode: string): string {
  const sub = SC_SUBSTITUTES.find((x) => x.o === Number(sortCode))
  return sub ? String(sub.s).padStart(6, "0") : sortCode
}

// Exception-aware weight selection (exceptions 2, 7, 10 swap the weight row).
function weightsFor(row: WeightRow, number: string): number[] {
  const a = Number(number[POS.a])
  const b = Number(number[POS.b])
  const g = Number(number[POS.g])
  if (row.x === 2) {
    if (a !== 0 && g !== 9) return [0, 0, 1, 2, 5, 3, 6, 4, 8, 7, 10, 9, 3, 1]
    if (a !== 0 && g === 9) return [0, 0, 0, 0, 0, 0, 0, 0, 8, 7, 10, 9, 3, 1]
  }
  if (row.x === 7 && g === 9) {
    return [0, 0, 0, 0, 0, 0, 0, 0, row.w[8], row.w[9], row.w[10], row.w[11], row.w[12], row.w[13]]
  }
  if (row.x === 10) {
    const ab = `${a}${b}`
    if (ab === "09" || (ab === "99" && b === 9)) {
      return [0, 0, 0, 0, 0, 0, 0, 0, row.w[8], row.w[9], row.w[10], row.w[11], row.w[12], row.w[13]]
    }
  }
  return row.w
}

// Build the 14-digit string (sort code + account), applying exception sort-code
// overrides (5 = substitution table, 8 = 090126, 9 = 309634).
function buildNumber(row: WeightRow, sortCode: string, account: string): string {
  let sc = sortCode
  if (row.x === 5) sc = substituteSortCode(sortCode)
  else if (row.x === 8) sc = "090126"
  else if (row.x === 9) sc = "309634"
  return `${sc}${account}`
}

function checkSkippable(row: WeightRow, number: string): boolean {
  const a = Number(number[POS.a])
  const c = Number(number[POS.c])
  const g = Number(number[POS.g])
  const h = Number(number[POS.h])
  if (row.x === 3 && (c === 6 || c === 9)) return true
  if (row.x === 6 && a >= 4 && a <= 8 && g === h) return true
  return false
}

function passesRow(row: WeightRow, sortCode: string, account: string): boolean {
  const number = buildNumber(row, sortCode, account)
  if (checkSkippable(row, number)) return true

  const mod = row.m === "MOD11" ? 11 : 10
  const weights = weightsFor(row, number)

  let products: number[] = []
  for (let i = 0; i < 14; i++) products[i] = Number(number[i]) * weights[i]

  // DBLAL ("double alternate"): sum the individual digits of each product.
  if (row.m === "DBLAL") products = products.join("").split("").map(Number)

  let total = products.reduce((acc, n) => acc + n, 0)
  if (row.x === 1) total += 27

  const remainder = total % mod
  const g = Number(number[POS.g])
  const h = Number(number[POS.h])

  if (row.x === 4) return remainder === g + h
  if (row.x === 5) {
    if (row.m === "DBLAL") return (remainder === 0 && h === 0) || h === 10 - remainder
    if (remainder === 1) return false
    if (remainder === 0 && g === 0) return true
    return g === 11 - remainder
  }
  return remainder === 0
}

// Exceptions where a passing FIRST check alone is sufficient (the second check,
// if present, is not required to also pass).
const FIRST_ONLY_EXCEPTIONS = [2, 9, 10, 11, 12, 13, 14]

/**
 * Validate a UK sort code + account number against the VocaLink weight table.
 * Faithfully mirrors the official decision flow:
 *  - sort codes absent from the table are valid by default;
 *  - one row → that check must pass;
 *  - two rows → both must pass, UNLESS the first row's exception is one of
 *    {2,9,10,11,12,13,14}, in which case the first passing alone is enough;
 *  - exception 14 has special fallback handling on first-check failure.
 */
export function isValidUkAccount(sortCode: string, account: string): boolean {
  const sc = digits(sortCode)
  let acc = digits(account)
  if (sc.length !== 6) return false
  // Normalise common short account-number formats to 8 digits.
  if (acc.length === 6) acc = `00${acc}`
  if (acc.length === 7) acc = `0${acc}`
  if (acc.length < 6 || acc.length > 10) return false
  if (acc.length !== 8) return false

  const rows = rowsForSortCode(Number(sc))
  if (rows.length === 0) return true // no rule on file → valid by default

  const first = rows[0]
  if (passesRow(first, sc, acc)) {
    if (rows.length === 1 || FIRST_ONLY_EXCEPTIONS.includes(first.x)) return true
    return passesRow(rows[1], sc, acc)
  }

  // First check failed.
  if (first.x === 14) {
    const eighth = Number(acc[7])
    if (![0, 1, 9].includes(eighth)) return false
    // 8th digit 0/1/9: drop it and prepend 0, then re-run the first check.
    return passesRow(first, sc, `0${acc.slice(0, 7)}`)
  }
  if (rows.length === 1 || !FIRST_ONLY_EXCEPTIONS.includes(first.x)) return false
  return passesRow(rows[1], sc, acc)
}

/**
 * Generate a random 8-digit account number that passes the modulus check for
 * the given sort code. Falls back to a plain random number only if no passing
 * value is found (extremely unlikely; bounded so generation never hangs).
 */
export function generateValidUkAccount(sortCode: string): string {
  const sc = digits(sortCode)
  const rows = rowsForSortCode(Number(sc))
  const randomAccount = () =>
    Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join("")

  // No rule on file: any 8-digit number is accepted by validators.
  if (rows.length === 0) return randomAccount()

  for (let attempt = 0; attempt < 20000; attempt++) {
    const acc = randomAccount()
    if (isValidUkAccount(sc, acc)) return acc
  }
  return randomAccount()
}
