# CLAUDE.md

# Odentia Core

This file defines how Claude should work on this repository.

It intentionally avoids project vision, business decisions and current development status.
Those documents live in:

- PROJECT_IDENTITY.md
- PROJECT_STATUS.md
- README.md

Always read those files before implementing any feature.

---

# Development Philosophy

Odentia is built following an MVP-first philosophy.

The objective is to validate ideas with real users as quickly as possible.

Always prioritize:

- simplicity
- readability
- maintainability
- development speed

Avoid premature optimization.

Avoid overengineering.

Avoid unnecessary abstractions.

If a simple solution solves the current problem, prefer it.

---

# Project Principles

Always preserve these principles.

## SaaS First

Odentia is a SaaS platform.

Marketplace is a complementary module.

Never design the platform around Marketplace.

---

## Platform Independence

Odentia must continue operating even if Marketplace is unavailable.

Never introduce mandatory dependencies on Marketplace.

---

## Marketplace Independence

Marketplace is an independent product.

Assume it may:

- run on another server
- use another database
- use another technology stack
- be maintained by another team

Communication must happen through public APIs only.

Never access Marketplace databases directly.

Never share business logic.

---

## Single User Experience

Although technically separated, users must perceive a single product.

Maintain a consistent:

- visual language
- navigation
- components
- branding
- UX

---

# Architecture

Unless explicitly instructed otherwise:

- Feature-first architecture.
- Server Components by default.
- Client Components only when necessary.
- Strict TypeScript.
- Clean folder organization.
- Avoid unnecessary global state.

---

# Multi-Tenant

Every dental practice is an isolated tenant.

Never assume data can be shared between tenants.

---

# Domain Model

This is a permanent architectural decision. It is the source of truth for the
system's domain and must be respected by every future implementation.

Odentia is a SaaS for **dental practices (Clinics)**, not for individual dentists.

## Core Entity

The **Clinic** is the system's primary entity.

Architecture, permissions, and the data model must be built around the Clinic.

Subscription, configuration, patients, schedule, orders, reports, and team all
belong to the Clinic.

Users belong to a Clinic and get their permissions through a role.

---

## Roles

### Superadmin

Represents the Odentia team.

Manages the entire platform:

- Clinics
- Plans
- Subscriptions
- Marketplace
- Global operations

### Clinic Admin

The clinic's owner or administrator.

Can manage:

- Subscription and billing
- Clinic configuration
- Team (dentists and assistants)
- Full schedule
- Patients
- Medical records
- Orders
- Global reports

Also has all the clinical permissions of a Dentist.

**The Clinic Admin never needs a second role to see patients.**

### Dentist

Manages only their own clinical operation.

Can manage:

- Their own schedule
- Their own patients
- Medical records
- Treatments
- Orders
- Reports scoped to their own operation
- Personal settings

Does not manage users, subscriptions, or clinic-wide configuration.

### Assistant

Supports the clinic's operation.

Can:

- Manage appointments
- Manage patients
- View medical records, subject to permissions
- Place orders
- View operational reports

Does not manage users, subscriptions, or administrative configuration.

Initially, assistants can work with every dentist in the clinic. The model
must stay ready to support assigning assistants to specific dentists later,
without requiring a major refactor.

---

## Data Model

All data belongs to the Clinic.

Some records are also associated with a specific Dentist, for example:

- Appointments
- Medical records
- Treatments
- Production
- Individual reports
- Schedules

Patients belong to the Clinic, not to the Dentist. The same patient can be
seen by different dentists within the same clinic.

---

## Primary Use Case

The system must natively support the most common scenario: an independent
dentist working alone, with no assistants.

In this case there is a single user with the Clinic Admin role, who manages
the clinic and sees patients using the same account.

Creating a second user, or assigning a second role to act as a dentist, must
never be required.

---

## Implementation Rule

From this point forward, every new feature must be designed to respect this
domain model.

If a future implementation conflicts with this architecture: stop, explain
the conflict, and propose an adaptation before writing any code.

---

# Security

Security always has priority over convenience.

Never expose:

- patient information
- medical records
- credentials
- private data

Never bypass authentication or authorization.

---

# UI / UX Principles

The platform should feel:

- modern
- lightweight
- intuitive
- fast

Prioritize:

- few clicks
- clear navigation
- responsive layouts
- mobile-first design

Avoid:

- clutter
- unnecessary dialogs
- complex forms

---

# Code Style

Always write code that is:

- clean
- strongly typed
- modular
- easy to understand

Prefer composition over inheritance.

Avoid duplicated logic.

Use meaningful naming.

---

# Documentation

Whenever a significant architectural decision is made:

- update documentation when appropriate
- keep code and documentation aligned

Never document obvious implementation details.

---

# Decision Making

When multiple implementations are possible:

1. Simpler
2. Easier to maintain
3. Faster to validate with users
4. Easier to evolve later

Prefer these over theoretical scalability.

---

# Working with Claude

When starting a new task:

1. Read:
   - PROJECT_IDENTITY.md
   - PROJECT_STATUS.md

2. Understand the current phase.

3. Implement only what is needed for the current milestone.

4. Do not anticipate future phases unless explicitly requested.

---

# Things Claude Should Avoid

Do not:

- overengineer
- create generic frameworks prematurely
- implement features not requested
- optimize before necessary
- introduce unnecessary dependencies
- create abstractions without a real use case
- build for hypothetical future requirements

---

# General Rule

When in doubt, always choose the solution that helps deliver a better MVP sooner.

Speed of learning is more valuable than technical perfection.