# 18 — UI and Information Architecture

## Public customer area

### Tracknologia landing

Keep the MVP customer surface small.

Primary action:

- **Track Repair**

Repair Requests may primarily be entered through Provider-specific links rather than a global marketplace.

### Provider-specific request page

```text
Provider identity
Supported Service Modes

Customer Details
Device Details
Reported Problem
Preferred Service Mode
Review
Submit
```

### Track Repair

```text
Tracking Code input
↓
Public Repair View
```

Public view should emphasize:

- Provider
- Device
- Status
- Customer Update
- Last Updated
- Service-mode-appropriate handover wording when READY

## Authenticated Provider area

### Dashboard

Suggested information hierarchy:

```text
Repair Requests      N
Active Repairs       N
Waiting              N
Ready                N
Completed

[ + Create Repair ]
```

The Waiting summary links to an aggregate Repair view containing both
`WAITING_FOR_PARTS` and `AWAITING_APPROVAL`, matching the displayed count.

Do not force shop-only widgets such as branch/staff workload onto Independent Repairers.

### Repair list item

Prefer device-first recognition:

```text
Lenovo IdeaPad 3
TN-2026-00125
Juan Dela Cruz
Battery issue
IN_PROGRESS
Updated 10:32
```

Repair search accepts common customer/device punctuation. Invalid bounded input
is preserved in the field and receives an inline validation message rather than
silently opening the unfiltered list.

### Repair detail editing

If the Repair's recorded Service Mode is no longer configured, keep it visible
and selected in the edit form with a clear "recorded on this Repair; no longer
offered" note. The Provider User may preserve it or intentionally choose no
mode/currently offered mode; the UI must not erase it during an unrelated edit.

### Repair Request review

Display customer-submitted information clearly as **reported** information.

Actions:

- Accept & Create Repair
- Decline Request

### Accept & Create Repair

Pre-fill request information but allow Provider verification/correction.

Separate:

- Customer/Device data
- Reported Problem
- Provider intake observations
- private technical fields

### Direct Create Repair

Use the same final Repair-input model without a Request prerequisite.

## Device input design

### Device Type

Controlled list with `Other`.

Initial candidate list:

- Phone
- Tablet
- Laptop
- Desktop Computer
- Monitor
- Television
- Printer
- Game Console
- Smartwatch / Wearable
- Camera
- Audio Device
- Other

### Customer-entered technical depth

Keep Brand/Model optional or recommended, with deeper fields optional.

### Provider-entered intake depth

May include:

- Serial / IMEI
- Color / Variant
- Device Specifications
- Physical Condition
- Accessories Received
- Initial Observation

Do not require every field if that would slow normal repair intake.
