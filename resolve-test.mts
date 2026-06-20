import { lookupBankByIban } from "@/lib/iban-swift"

for (const iban of ["AT911912050086967810", "DE89370400440532013000", "GB29NWBK60161331926819"]) {
  const info = await lookupBankByIban(iban)
  console.log(`\n${iban}`)
  console.log("  name:", info?.name)
  console.log("  bic:", info?.bic)
  console.log("  city/postal:", info?.postalCode, info?.city)
  console.log("  country:", info?.country)
}
