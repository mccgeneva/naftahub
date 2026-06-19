"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Users,
  UserPlus,
  Loader2,
  KeyRound,
  Copy,
  Check,
  Pencil,
  Trash2,
  ShieldCheck,
  ShieldOff,
  Ban,
  Search,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { CountryCombobox } from "@/components/country-combobox"
import { useActivityLog } from "@/components/activity-tracker"
import {
  listUsers,
  createUser,
  editUser,
  resetUserPassword,
  updateUserStatus,
  removeUser,
  type AdminUserView,
} from "@/app/actions/admin-users"
import type { UserStatus } from "@/lib/profile-types"

const STATUS_META: Record<UserStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-500/10 text-green-400 border-green-500/30" },
  suspended: { label: "Suspended", className: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  inactive: { label: "Inactive", className: "bg-red-500/10 text-red-400 border-red-500/30" },
}

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB")
}

interface CredentialReveal {
  email: string
  password: string
  title: string
}

export function UserManager() {
  const logActivity = useActivityLog()

  const [users, setUsers] = useState<AdminUserView[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")

  // Create form
  const [createOpen, setCreateOpen] = useState(false)
  const [fullName, setFullName] = useState("")
  const [company, setCompany] = useState("")
  const [role, setRole] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [nationality, setNationality] = useState("")
  const [address, setAddress] = useState("")
  const [website, setWebsite] = useState("")
  const [accountBadge, setAccountBadge] = useState("PRO Account")
  const [creating, setCreating] = useState(false)

  // Edit form
  const [editTarget, setEditTarget] = useState<AdminUserView | null>(null)
  const [editFullName, setEditFullName] = useState("")
  const [editCompany, setEditCompany] = useState("")
  const [editRole, setEditRole] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editBadge, setEditBadge] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)

  // Reset password dialog
  const [resetTarget, setResetTarget] = useState<AdminUserView | null>(null)
  const [resetPassword, setResetPassword] = useState("")
  const [resetting, setResetting] = useState(false)

  // Credential reveal dialog (shown after create / reset)
  const [reveal, setReveal] = useState<CredentialReveal | null>(null)
  const [copied, setCopied] = useState<"email" | "password" | "both" | null>(null)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<AdminUserView | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = () => {
    setLoading(true)
    listUsers(ADMIN_PASSCODE)
      .then((res) => {
        if (!res.ok) {
          toast.error(res.error)
          setUsers([])
          return
        }
        setUsers(res.users)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.company.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    )
  }, [users, query])

  const resetCreateForm = () => {
    setFullName("")
    setCompany("")
    setRole("")
    setEmail("")
    setPassword("")
    setPhone("")
    setNationality("")
    setAddress("")
    setWebsite("")
    setAccountBadge("PRO Account")
  }

  const handleCreate = async () => {
    if (!fullName.trim() && !company.trim()) {
      toast.error("Enter at least a full name or a company.")
      return
    }
    setCreating(true)
    const res = await createUser({
      passcode: ADMIN_PASSCODE,
      fullName: fullName.trim(),
      company: company.trim(),
      role: role.trim() || undefined,
      email: email.trim() || undefined,
      password: password.trim() || undefined,
      phone: phone.trim() || undefined,
      nationality: nationality.trim() || undefined,
      address: address.trim() || undefined,
      website: website.trim() || undefined,
      accountBadge: accountBadge.trim() || undefined,
      adminName: "Administrator",
    })
    setCreating(false)

    if (!res.ok) {
      toast.error(res.error)
      return
    }

    setUsers((prev) => [res.user, ...prev])
    setCreateOpen(false)
    setReveal({
      email: res.user.email,
      password: res.tempPassword ?? res.user.password,
      title: "Client account created",
    })
    toast.success("Client account created", {
      description: `${res.user.fullName} (${res.user.company}) can now sign in.`,
    })
    logActivity({
      action: `Administrator created client account for ${res.user.fullName}`,
      category: "Administration / User Management",
      details: {
        summary: `Administrator created a new client account for ${res.user.fullName} (${res.user.company}) with login ${res.user.email}.`,
        account: `${res.user.fullName} — ${res.user.email}`,
        company: res.user.company,
        status: res.user.status,
      },
    })
    resetCreateForm()
  }

  const openEdit = (u: AdminUserView) => {
    setEditTarget(u)
    setEditFullName(u.fullName)
    setEditCompany(u.company)
    setEditRole(u.role)
    setEditEmail(u.email)
    // Coerce any legacy/blank badge to one of the two valid tiers so the editor
    // always shows a real account type.
    setEditBadge(u.accountBadge?.toLowerCase().includes("avant") ? "Avant-garde Account" : "PRO Account")
  }

  const handleEdit = async () => {
    if (!editTarget) return
    setSavingEdit(true)
    const res = await editUser({
      passcode: ADMIN_PASSCODE,
      id: editTarget.id,
      fullName: editFullName.trim() || undefined,
      company: editCompany.trim() || undefined,
      role: editRole.trim() || undefined,
      email: editEmail.trim() || undefined,
      accountBadge: editBadge.trim() || undefined,
      adminName: "Administrator",
    })
    setSavingEdit(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setUsers((prev) => prev.map((u) => (u.id === res.user.id ? res.user : u)))
    setEditTarget(null)
    toast.success("Account updated", { description: `${res.user.fullName} was updated.` })
    logActivity({
      action: `Administrator edited client account ${res.user.fullName}`,
      category: "Administration / User Management",
      details: {
        summary: `Administrator updated the profile of ${res.user.fullName} (${res.user.company}).`,
        account: `${res.user.fullName} — ${res.user.email}`,
      },
    })
  }

  const openReset = (u: AdminUserView) => {
    setResetTarget(u)
    setResetPassword("")
  }

  const handleReset = async () => {
    const u = resetTarget
    if (!u) return
    const custom = resetPassword.trim()
    if (custom && custom.length < 6) {
      toast.error("Password must be at least 6 characters.")
      return
    }
    setResetting(true)
    // Pass the typed password to assign it directly; leave blank to auto-generate.
    const res = await resetUserPassword(ADMIN_PASSCODE, u.id, custom || undefined, "Administrator")
    setResetting(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setUsers((prev) => prev.map((x) => (x.id === res.user.id ? res.user : x)))
    setResetTarget(null)
    setReveal({
      email: res.user.email,
      password: res.tempPassword ?? res.user.password,
      title: "Credentials reset",
    })
    toast.success(custom ? "Password updated" : "Temporary password generated")
    logActivity({
      action: `Administrator reset credentials for ${u.fullName}`,
      category: "Administration / User Management",
      details: {
        summary: `Administrator ${custom ? "set a new password" : "generated a new temporary password"} for ${u.fullName} (${u.company}).`,
        account: `${u.fullName} — ${u.email}`,
      },
    })
  }

  const handleStatus = async (u: AdminUserView, status: UserStatus) => {
    const res = await updateUserStatus(ADMIN_PASSCODE, u.id, status, "Administrator")
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setUsers((prev) => prev.map((x) => (x.id === res.user.id ? res.user : x)))
    toast.success(`Account ${STATUS_META[status].label.toLowerCase()}`, {
      description: `${u.fullName} is now ${STATUS_META[status].label.toLowerCase()}.`,
    })
    logActivity({
      action: `Administrator set ${u.fullName} to ${status}`,
      category: "Administration / User Management",
      details: {
        summary: `Administrator changed the status of ${u.fullName} (${u.company}) to ${status}.`,
        account: `${u.fullName} — ${u.email}`,
        status,
      },
    })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await removeUser(ADMIN_PASSCODE, deleteTarget.id, "Administrator")
    setDeleting(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setUsers(res.users)
    const removed = deleteTarget
    setDeleteTarget(null)
    toast.success("Account deleted", { description: `${removed.fullName} was permanently removed.` })
    logActivity({
      action: `Administrator deleted client account ${removed.fullName}`,
      category: "Administration / User Management",
      details: {
        summary: `Administrator permanently deleted the client account of ${removed.fullName} (${removed.company}).`,
        account: `${removed.fullName} — ${removed.email}`,
      },
    })
  }

  const copy = async (text: string, which: "email" | "password" | "both") => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      toast.error("Unable to copy to clipboard")
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold">User Management</CardTitle>
              <p className="text-sm text-muted-foreground text-pretty">
                Create client accounts, generate credentials, and control access. New accounts can
                sign in immediately and receive their own fully isolated environment.
              </p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            New client
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, company, or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
          </p>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {users.length === 0
                ? "No client accounts have been created yet. Use “New client” to add one."
                : "No accounts match your search."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((u) => {
              const meta = STATUS_META[u.status]
              return (
                <div
                  key={u.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-foreground">{u.fullName}</p>
                      <Badge variant="outline" className={cn("text-[10px]", meta.className)}>
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{u.company}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {u.email} · {u.role} · created {fmtDate(u.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => openReset(u)}>
                      <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Reset
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                    </Button>
                    {u.status === "active" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatus(u, "suspended")}
                        className="text-amber-500 hover:text-amber-400"
                      >
                        <ShieldOff className="mr-1.5 h-3.5 w-3.5" /> Suspend
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatus(u, "active")}
                        className="text-green-500 hover:text-green-400"
                      >
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Activate
                      </Button>
                    )}
                    {u.status !== "inactive" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatus(u, "inactive")}
                        className="text-red-500 hover:text-red-400"
                      >
                        <Ban className="mr-1.5 h-3.5 w-3.5" /> Deactivate
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-400"
                      onClick={() => setDeleteTarget(u)}
                      aria-label={`Delete ${u.fullName}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create a client account</DialogTitle>
            <DialogDescription>
              Leave the login email or password blank to auto-generate them. You can hand the
              generated credentials to the client afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto py-2 pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="um-fullname">Full name</Label>
                <Input
                  id="um-fullname"
                  placeholder="e.g. Louis Thyssen"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="um-company">Company</Label>
                <Input
                  id="um-company"
                  placeholder="e.g. MCC Capital Group Inc."
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="um-role">Role / title</Label>
                <Input
                  id="um-role"
                  placeholder="e.g. Director & Authorised Signatory"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="um-badge">Account tier</Label>
                <Select value={accountBadge} onValueChange={setAccountBadge}>
                  <SelectTrigger id="um-badge" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRO Account">PRO Account</SelectItem>
                    <SelectItem value="Avant-garde Account">Avant-garde Account</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="um-email">Login email (optional)</Label>
                <Input
                  id="um-email"
                  placeholder="Auto-generated if blank"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="um-password">Temporary password (optional)</Label>
                <Input
                  id="um-password"
                  placeholder="Auto-generated if blank"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="um-phone">Phone (optional)</Label>
                <Input id="um-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="um-nat">Nationality (optional)</Label>
                <CountryCombobox
                  id="um-nat"
                  valueMode="name"
                  value={nationality}
                  onChange={setNationality}
                  placeholder="Search and select country"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="um-address">Address (optional)</Label>
              <Input id="um-address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="um-website">Website (optional)</Label>
              <Input id="um-website" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="mt-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              Create account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit client account</DialogTitle>
            <DialogDescription>Update the displayed identity and login email.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ue-fullname">Full name</Label>
                <Input
                  id="ue-fullname"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ue-company">Company</Label>
                <Input
                  id="ue-company"
                  value={editCompany}
                  onChange={(e) => setEditCompany(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ue-role">Role / title</Label>
                <Input id="ue-role" value={editRole} onChange={(e) => setEditRole(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ue-badge">Account tier</Label>
                <Select value={editBadge} onValueChange={setEditBadge}>
                  <SelectTrigger id="ue-badge" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRO Account">PRO Account</SelectItem>
                    <SelectItem value="Avant-garde Account">Avant-garde Account</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ue-email">Login email</Label>
              <Input id="ue-email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={savingEdit}>
              {savingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for{" "}
              <span className="font-medium text-foreground">{resetTarget?.fullName}</span> (
              {resetTarget?.email}). Type the exact password you want to assign, or leave it blank to
              auto-generate one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reset-password">New password</Label>
            <Input
              id="reset-password"
              type="text"
              autoComplete="off"
              inputMode="text"
              placeholder="Leave blank to auto-generate"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              className="font-mono text-base"
            />
            <p className="text-xs text-muted-foreground">
              Minimum 6 characters. The client will use this password to sign in immediately.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleReset} disabled={resetting}>
              {resetting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" />
              )}
              {resetPassword.trim() ? "Set password" : "Generate password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credential reveal dialog */}
      <Dialog open={!!reveal} onOpenChange={(o) => !o && setReveal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{reveal?.title}</DialogTitle>
            <DialogDescription>
              Share these credentials with the client securely. The password is shown only here —
              you can always generate a new one with “Reset”.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Login email</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={reveal?.email ?? ""} className="font-mono text-sm" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => reveal && copy(reveal.email, "email")}
                  aria-label="Copy email"
                >
                  {copied === "email" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Temporary password</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={reveal?.password ?? ""} className="font-mono text-sm" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => reveal && copy(reveal.password, "password")}
                  aria-label="Copy password"
                >
                  {copied === "password" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                reveal && copy(`Email: ${reveal.email}\nPassword: ${reveal.password}`, "both")
              }
            >
              {copied === "both" ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              Copy both
            </Button>
            <Button onClick={() => setReveal(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete client account?</DialogTitle>
            <DialogDescription>
              This permanently removes{" "}
              <span className="font-medium text-foreground">{deleteTarget?.fullName}</span> (
              {deleteTarget?.email}). They will no longer be able to sign in. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
