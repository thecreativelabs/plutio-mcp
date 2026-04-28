# Plutio MCP — real-world example prompts

Drop any of these into Claude, Cursor, or another MCP client after installing `@thecreativelabs/plutio-mcp`. Each example shows the **user prompt**, the **tool calls Claude will make**, and the **shape of the answer** you'll get back.

All examples are verified against a real Plutio workspace. Nothing here is hypothetical.

| # | Example | Primary tools |
|---|---|---|
| [01](01-crm-lookup.md) | Find a client by name, pull their full CRM footprint | `plutio_people`, `plutio_companies`, `plutio_projects`, `plutio_invoices` |
| [02](02-unpaid-invoice-aging.md) | Aged unpaid-invoice report grouped by days overdue | `plutio_invoices` |
| [03](03-weekly-project-status.md) | Weekly status report across active projects | `plutio_projects`, `plutio_tasks`, `plutio_time_entries` |
| [04](04-lead-qualification.md) | Qualify form responses into people records | `plutio_form_responses`, `plutio_people`, `plutio_workspace_schema` |
| [05](05-custom-field-update.md) | Set a select-type custom field using schema introspection | `plutio_workspace_schema`, `plutio_people` |
| [06](06-raw-request.md) | Use `plutio_request` as the escape hatch for undocumented endpoints | `plutio_request` |
| [07](07-recurring-revenue-dashboard.md) | MRR / ARR dashboard from active subscriptions | `plutio_invoice_subscriptions` |
| [08](08-upcoming-renewals.md) | List subscriptions billing in the next 30 days | `plutio_invoice_subscriptions`, `plutio_people` |
| [09](09-subscription-bulk-adjustment.md) | Bulk-raise subscription amounts (pricing changes) | `plutio_invoice_subscriptions` |
| [10](10-chatgpt-setup.md) | Using plutio-mcp from ChatGPT (HTTP mode + ngrok) | — |
| [11](11-proposal-builder.md) | Automated proposal builder with presets & block templates | `plutio_list_proposal_presets`, `plutio_proposal_from_preset`, `plutio_analyze_proposal` |
| [12](12-contract-builder.md) | Contract builder with variable substitution (NDA, service agreement) | `plutio_list_contract_presets`, `plutio_contract_from_preset` |

## Tips

- Always let Claude call `plutio_api_reference` first if it's unsure which tool to use — it's cheap and orients the agent.
- Call `plutio_workspace_schema` before anything involving custom fields (select dropdowns, rating scales, etc.). The agent needs the real field `_id`s and option `_id`s to write valid payloads.
- `PLUTIO_READ_ONLY=true` is the default — flip to `false` only when you're ready for the agent to write.
- Plutio's list endpoints support MongoDB-style queries. Claude usually composes these well from a prose filter like "invoices due before April 1 and not paid".
