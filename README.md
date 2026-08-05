# Odentia Core

Odentia Core is the independent multi-tenant SaaS platform for managing dental practices.

It owns authentication, practices, team roles, patients, scheduling, clinical operations, reports, subscriptions, and the main Odentia application experience.

The LopaDent Marketplace is an external, optional system integrated through versioned APIs and secure user handoff. Odentia Core must continue operating when that Marketplace is unavailable or disabled.

## Status

Repository initialization and product/architecture definition.

## Start here

1. Read [`CLAUDE.md`](./CLAUDE.md).
2. Review [`docs/product-scope.md`](./docs/product-scope.md).
3. Review [`docs/architecture.md`](./docs/architecture.md).
4. Agree on the initial stack before generating application code.

## Current business hypothesis

- One PRO plan: COP 99,900/month per practice
- 30-day full-access evaluation
- Subscription paid by the practice or sponsored by an authorized partner
- LopaDent is the exclusive Marketplace supplier under the current model

These values must remain configurable and are subject to validation.
