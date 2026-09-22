# Administrative-Google-Sign-In — Delta Specification

## Purpose

Describe modifications to the existing Google sign-in flow to incorporate explicit module permissions and role-permission mappings, with backend authorization as the authoritative enforcement layer.

## ADDED Requirements

### Requirement: Explicit Module Permissions in Auth Payload

The authentication response from `/authentication/me` MUST include a module permissions array alongside the existing session data. Each permission code MUST correspond to a defined module.

#### Scenario: Auth payload includes permissions

- GIVEN a successful Google sign-in
- WHEN the `/authentication/me` response is received
- THEN the payload contains a `permissions` array with module codes
- AND each code maps to a defined module

#### Scenario: Edge case — empty permissions

- GIVEN a user whose role grants no module permissions
- WHEN the auth payload is received
- THEN the permissions array is empty
- AND no dashboard modules are accessible

### Requirement: Role-Permission Mapping Enforcement

The system MUST enforce module permissions based on the authenticated user's role-permission mapping. The mapping MUST be defined server-side and MUST be the sole source of truth.

#### Scenario: Server validates role against module access

- GIVEN an authenticated user with role "Operador central"
- WHEN the server evaluates module access
- THEN only modules mapped to that role are permitted
- AND the client receives only authorized module codes

#### Scenario: Frontend cannot bypass permission mapping

- GIVEN a modified frontend that attempts to access an unauthorized module
- WHEN the request reaches the backend
- THEN the server denies the request
- AND the client receives a 403 or equivalent denial

## MODIFIED Requirements

### Requirement: Session Gate and Route Protection

The system MUST gate the `/landing` route with the restored session state and the updated permission payload. Previously, route protection relied on role-name assumptions; now it uses explicit module-permission codes.

(Previously: Navigation and access were gated by role-name string matching without module-level granularity)

#### Scenario: Session gate with permission-based access

- GIVEN a valid session with module permissions
- WHEN the `/landing` route is accessed
- THEN the dashboard renders filtered by permission codes
- AND the previous `/admin` route is absent

#### Scenario: Login callback destination preserved

- GIVEN a successful authentication callback
- WHEN the session is restored
- THEN the destination remains `/landing`
- AND the user sees their authorized modules

## REMOVED Requirements

### Requirement: Role-Name-Based Navigation

(Reason: Replaced by explicit module-permission mappings that are authoritative and backend-enforced)
(Migration: All role-name-based navigation logic is replaced by permission-code filtering in both frontend and backend)

## RENAMED Requirements

### Requirement: Administrative Scaffold → Permission-Aware Dashboard Modules

(Reason: The administrative scaffold has been replaced by typed dashboard modules governed by permission codes)
(Migration: All references to the administrative scaffold must point to the new module registry and permission system)
