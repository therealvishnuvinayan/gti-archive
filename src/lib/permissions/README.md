# Permission Keys

Permission checks in GTI Archive should be written against stable permission keys such as `project.create`, `calendar.update`, or `archive.view`.

Routes, server-action names, and API endpoints are implementation details. They can move over time without changing the underlying business rule.

Use the permission helpers in this folder to enforce access:

- `hasPermission(user, permissionKey)`
- `requirePermission(user, permissionKey)`
- `hasProjectPermission(user, project, permissionKey)`
- `requireProjectPermission(user, project, permissionKey)`

# Profile Storage

The code catalog in [definitions.ts](/Users/vishnuvinayan/Projects/GTI/gti-archive/src/lib/permissions/definitions.ts:1) is still the source of truth for which permission keys exist.

The database stores editable profile assignments for:

- global roles
- global collaborator types
- access presets kept for backward compatibility and future migration work

The primary product model is role and collaborator type permissions. The resolver reads DB-backed profile permissions first and falls back to code defaults when rows are missing or the permission profile tables are not available yet.

Legacy per-user module access columns still exist on `User`, but they are no longer used as active permission vetoes in the normal runtime model. Standard permission testing should be done through role profiles, collaborator type profiles, and the existing hard business rules.

Run `pnpm permissions:sync` after schema changes to upsert permission definitions and seed any missing profile rows.

# Resolver Rules

Permission keys grant capability only inside a valid business context. Hard rules still apply even when a profile enables a permission key.

Examples:

- project membership still scopes project visibility
- project budget remains owner-only in the current phase
- executor or owner workflow rules still apply where the product already enforces them
- notification ownership still applies

Per-user custom overrides and project-specific overrides are not implemented yet.
