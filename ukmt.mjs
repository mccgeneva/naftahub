import { isValidUkAccount, generateValidUkAccount } from "./lib/uk-modulus.ts"
const cases = [
  ["089999","66374958",true],
  ["107999","88837491",true],
  ["202959","63748472",true],
  ["871427","46238510",true],
  ["872427","46238510",false],
  ["089999","66374959",false],
  ["938611","07806039",true],
]
let ok=0, fail=0
for (const [sc,ac,exp] of cases){
  const got = isValidUkAccount(sc,ac)
  if(got===exp) ok++; else fail++
  console.log(`${got===exp?"OK":"MISMATCH"}  ${sc} ${ac}  expected=${exp} got=${got}`)
}
console.log(`\nReference cases: ${ok} ok, ${fail} mismatch`)
for (const sc of ["400003","309634","600001","200050","609104","090029"]){
  const acc = generateValidUkAccount(sc)
  console.log(`gen ${sc} -> ${acc}  valid=${isValidUkAccount(sc,acc)}`)
}
