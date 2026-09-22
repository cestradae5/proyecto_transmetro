# Admin-Dashboard Specification

## Purpose

Define an authenticated, role-aware admin dashboard at `/landing` that replaces the duplicate `/admin` scaffold with eight permission-gated modules and a five-role authorization model.

## Requirements

### Requirement: Authenticated Route Protection

The system MUST protect the `/landing` route so that unauthenticated access is denied or redirected before the dashboard renders. The system SHALL use the existing cookie-backed `/authentication/me` contract as the session validation source.

#### Scenario: Unauthenticated access to `/landing`

- GIVEN a user who is not authenticated
- WHEN they navigate to `/landing`
- THEN they are redirected to the login page
- AND the dashboard does not render

#### Scenario: Authenticated access to `/landing`

- GIVEN a user with a valid session
- WHEN they navigate to `/landing`
- THEN the dashboard renders with module entries filtered by their permissions

### Requirement: Module Registry and Permission Codes

The system SHALL define eight modules — infrastructure, fleet, personnel, operational alerts, central operations panel, administrative reports, audit log, and recharge reporting — each with a unique permission code. The system SHALL map five roles (Administrador del sistema, Operador central, Operador de estación, Piloto, Guardia) to these permission codes.

#### Scenario: Administrador del sistema sees all modules

- GIVEN an authenticated Administrador del sistema
- WHEN the dashboard loads
- THEN all eight modules are visible and accessible

#### Scenario: Operador de estación sees only authorized modules

- GIVEN an authenticated Operador de estación
- WHEN the dashboard loads
- THEN only modules matching their permission codes are visible
- AND unauthorized modules are hidden from navigation

### Requirement: Permission-Aware Navigation

The system MUST render navigation entries dynamically based on the authenticated user's permission codes. The system SHALL not rely on hidden frontend links for authorization enforcement.

#### Scenario: Navigation reflects role permissions

- GIVEN a user with limited permissions
- WHEN navigation is rendered
- THEN only authorized module links appear
- AND no unauthorized module link is present in the DOM

#### Scenario: Edge case — permission change during session

- GIVEN a user whose permissions are revoked mid-session
- WHEN the navigation is refreshed
- THEN previously accessible modules are removed from navigation

### Requirement: Backend Authorization Enforcement

The system MUST enforce permissions on backend-protected routes independently of frontend visibility. Backend enforcement SHALL be authoritative and mandatory for all module operations.

#### Scenario: Backend denies unauthorized module access

- GIVEN a user with frontend-visible module access but insufficient backend permissions
- WHEN they attempt to access a protected backend endpoint
- THEN the server returns a denial response
- AND the frontend does not render module content

#### Scenario: Backend confirms authorized access

- GIVEN a user with valid backend permissions
- WHEN they access a protected endpoint
- THEN the server returns the requested data

### Requirement: `/admin` Route Removal

The system MUST remove the `/admin` route and its scaffold entirely. The system SHALL NOT maintain aliases or redirects from `/admin`.

#### Scenario: Successful login redirects to `/landing`

- GIVEN a user with valid credentials
- WHEN they complete the login flow
- THEN they are redirected to `/landing`
- AND `/admin` does not resolve

### Requirement: Role Matrix Test Coverage

The system MUST include automated tests covering all five roles against all eight modules, validating both granted and denied access.

#### Scenario: Complete role matrix test

- GIVEN five role fixtures (Administrador del sistema, Operador central, Operador de estación, Piloto, Guardia)
- WHEN each role attempts to access each module
- THEN every access is either confirmed or denied per the permission mapping
- AND all test assertions pass

#### Scenario: Edge case — unknown role

- GIVEN a request with an unrecognized role
- WHEN access is attempted
- THEN all modules are denied
