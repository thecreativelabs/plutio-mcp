# 01 — Find a client by name and pull their full CRM footprint

Good sanity-check flow for a new install. Also useful as a "who is this?" lookup before a sales call.

## Prompt

> Look up everything we have on Jane Doe in Plutio. Include the company he's linked to, active projects, and any unpaid invoices.

## What Claude will do

1. **`plutio_people`** with `action: list`, `query: {"name.first": "Mark", "name.last": "Doe"}` → gets the person record + `companies[]` refs.
2. **`plutio_companies`** with `action: get`, `id: <companyId from step 1>` → company details.
3. **`plutio_projects`** with `action: list`, `query: {"client._id": <personId>}` → active projects.
4. **`plutio_invoices`** with `action: list`, `query: {"client._id": <personId>, "status": {"$ne": "paid"}}` → outstanding invoices.

## Example answer

> **Jane Doe** — client  
> **Phone:** (555) 555-0123  
> **Company:** Acme Widgets (`company_abc123`)  
>
> **Active projects (2):**
> - Website Redesign — in progress, 62% complete
> - Mobile App Phase 2 — pending kickoff
>
> **Outstanding invoices (1):**
> - INV-1029 — $907.50 USD, due 2026-04-15 (7 days overdue)

## Why this works

`people` records in Plutio embed `companies: [{_id}]`. One hop to `companies/{id}` gets the rest. Projects and invoices both reference `client._id`, so MongoDB-style `{"client._id": ...}` works directly.
