/**
 * Shared admin role predicates (Security Hardening v1.0).
 *
 * One definition of the admin hierarchy for the whole app so UI capability
 * checks and server-side guards can never drift apart. `super_admin` is a
 * strict superset of `admin` — it never gains permissions `admin` lacks here,
 * it simply stops being denied where `admin` is allowed.
 */
export type AnyRole = string | null | undefined;

/** Roles treated as full product/catalog administrators. */
export const ADMIN_ROLES = ["admin", "super_admin"] as const;

/** True when the role set contains any full administrator role. */
export function hasAnyAdminRole(roles: AnyRole[] | AnyRole): boolean {
  const list = Array.isArray(roles) ? roles : [roles];
  return list.some((r) => !!r && (ADMIN_ROLES as readonly string[]).includes(r));
}

/** Alias used by catalog/product surfaces for readability. */
export const isProductAdministrator = hasAnyAdminRole;

/** Generic "does this role set include any of these roles" check. */
export function hasAnyRole(roles: AnyRole[] | AnyRole, allowed: readonly string[]): boolean {
  const list = Array.isArray(roles) ? roles : [roles];
  return list.some((r) => !!r && allowed.includes(r));
}
