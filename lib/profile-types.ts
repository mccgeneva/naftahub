// ---------------------------------------------------------------------------
// Serializable identity profiles.
//
// Static users (lib/users.ts) embed lucide icon *components* (ElementType) in
// their profile arrays. React components cannot cross the server→client Server
// Action boundary, so admin-created (dynamic) users are stored in the database
// using a plain, serializable shape (label/value strings only). The client then
// "hydrates" that shape back into a full UserProfile by attaching icons.
// ---------------------------------------------------------------------------

import type { ElementType } from "react"
import {
  User,
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  CalendarDays,
  BadgeCheck,
  Briefcase,
  Flag,
  Landmark,
  FileText,
  Hash,
} from "lucide-react"
import type { ProfileItem, UserProfile } from "@/lib/users"

/** A profile row without its (non-serializable) icon component. */
export interface SerializableProfileItem {
  label: string
  value: string
}

/** A full UserProfile with all icon components stripped — safe to send from a
 * Server Action to the client. */
export interface SerializableUserProfile {
  id: string
  email: string
  password: string
  sessionToken: string
  firstName: string
  shortName: string
  fullName: string
  initials: string
  company: string
  role: string
  headerTag: string
  accountBadge: string
  accountEmail: string
  supportEmail: string
  cardHolderPerson: string
  cardHolderCompany: string
  principal: SerializableProfileItem[]
  companyInfo: SerializableProfileItem[]
  banking: SerializableProfileItem[]
  passportImage?: string
  passportMeta?: UserProfile["passportMeta"]
}

// Pick a sensible icon for a profile row based on its label so hydrated dynamic
// profiles look consistent with the hand-authored static ones.
function iconForLabel(label: string): ElementType {
  const l = label.toLowerCase()
  if (/(e-?mail|@)/.test(l)) return Mail
  if (/(mobile|phone|tel)/.test(l)) return Phone
  if (/(website|url|web)/.test(l)) return Globe
  if (/(address|place|location|born|birth place)/.test(l)) return MapPin
  if (/(date|issue|expir|birth|onboard)/.test(l)) return CalendarDays
  if (/(passport|kyc|verif|sanction|aml|pep|authority|capacity|status)/.test(l)) return BadgeCheck
  if (/(occupation|role|mandate|profile|relationship)/.test(l)) return Briefcase
  if (/(nationality|country)/.test(l)) return Flag
  if (/(bank|iban|swift|bic|source of funds)/.test(l)) return Landmark
  if (/(company|business|entity|holder)/.test(l)) return Building2
  if (/(number|no\.|id|lei|cif|nif|tax|reference|ref)/.test(l)) return Hash
  if (/(name|represented|signatory|owner|ubo)/.test(l)) return User
  return FileText
}

function hydrateItems(items: SerializableProfileItem[] | undefined): ProfileItem[] {
  return (items ?? []).map((it) => ({ ...it, icon: iconForLabel(it.label) }))
}

/** Convert a serializable profile (from the DB / a Server Action) into a full
 * UserProfile usable by the client UI. */
export function hydrateProfile(p: SerializableUserProfile): UserProfile {
  return {
    ...p,
    principal: hydrateItems(p.principal),
    companyInfo: hydrateItems(p.companyInfo),
    banking: hydrateItems(p.banking),
  }
}
