# 05 — Set a select-type custom field (schema introspection first)

Plutio custom fields use `_id` references, not titles. Without introspection, any attempt to "set maintenance plan to Premium" will fail with a cryptic schema error. `plutio_workspace_schema` solves this in one tool call.

Requires `PLUTIO_READ_ONLY=false`.

## Prompt

> Upgrade Jane Doe's Maintenance Plan to Premium Plan in Plutio.

## What Claude will do

1. **`plutio_workspace_schema`** with `entity: "person"` → returns:
    ```json
    {
      "entities": {
        "person": {
          "Maintenance Plan": {
            "_id": "field_maintenance_plan",
            "inputType": "select",
            "options": {
              "Standard Plan": "opt_standard",
              "Premium Plan":  "opt_premium",
              "Elite Plan":    "opt_elite"
            }
          }
        }
      }
    }
    ```
2. **`plutio_people`** list with `{"name.first": "Jane", "name.last": "Doe"}` → get `_id`.
3. **`plutio_people`** update:
    ```json
    {
      "action": "update",
      "id": "person_abc123",
      "data": {
        "customFields": [
          { "_id": "field_maintenance_plan", "value": "opt_premium" }
        ]
      }
    }
    ```
    Internally this routes through Plutio's `/people/bulk` endpoint — `PUT /people/{id}` isn't supported.

## Example answer

> Done. Jane Doe's **Maintenance Plan** is now **Premium Plan** (effective 2026-04-22).

## Why introspection matters

Without `plutio_workspace_schema`, the agent would send `value: "Premium Plan"` as a string, and Plutio would reject with `"Invalid custom field value"`. Custom field values for select inputs are always option IDs, not labels.

## Cache behavior

`plutio_workspace_schema` caches for 5 minutes. Add `{"refresh": true}` after admin-level schema changes in Plutio.
