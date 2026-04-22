# 04 — Qualify form responses into people records

Inbound lead-form submissions live in `form-responses` as raw data. This workflow converts qualifying ones into proper `people` records with appropriate tags and custom fields set.

Requires `PLUTIO_READ_ONLY=false`.

## Prompt

> Look at form responses from the "New Client Inquiry" form submitted in the last 7 days. For any where the budget field is over $5000, create a new person record with role=lead and tag="qualified". Use the Maintenance Plan custom field set to "Standard Plan" as the initial tier.

## What Claude will do

1. **`plutio_forms`** list, find the one titled "New Client Inquiry" → get `_id`.
2. **`plutio_form_responses`** list with `{"formId": <id>, "createdAt": {"$gte": "<7 days ago>"}}`.
3. **`plutio_workspace_schema`** with `entity: "person"` → learn the `_id`s of "Maintenance Plan" and its "Standard Plan" option.
4. Filter locally: keep responses with `data.budget > 5000`.
5. For each, **`plutio_people`** create:
    ```json
    {
      "action": "create",
      "data": {
        "name": { "first": "<response.data.firstName>", "last": "<response.data.lastName>" },
        "contactEmails": [{ "email": "<response.data.email>", "type": "email" }],
        "role": "lead",
        "tags": ["qualified"],
        "customFields": [
          { "_id": "field_maintenance_plan", "value": "opt_standard" }
        ]
      }
    }
    ```

## Example answer

```
Reviewed 8 responses from the last 7 days.
Qualified (budget > $5,000): 3

Created:
  • Sarah Okonkwo <sarah@greenhaus.io>     — budget $8,500
  • Juan Vela <juan@velacollective.com>     — budget $12,000
  • Priya Nair <priya@lumencrafted.co>      — budget $6,750

Below threshold (kept in form-responses, not promoted):
  • Alex Ng <alex@ng-freelance.com>         — budget $1,200
  ... and 4 more
```

## Why this matters

This is the highest-leverage workflow in the whole package for freelancers and agencies. One natural-language prompt replaces a manual lead-triage step that most people spend 20 minutes on every week.

## Tip

Build this into a scheduled task (via Claude's `schedule` feature, or a cron calling the MCP over `npx`) to run every Monday at 9am.
