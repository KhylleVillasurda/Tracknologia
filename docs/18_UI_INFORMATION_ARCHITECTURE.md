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

The implemented `/track` surface uses a narrow mobile-first column and a
POST-backed form. Success keeps status visible by text as well as color,
highlights the latest Customer Update, collapses earlier Updates, and labels
Service Mode without exposing free-form arrangement details. Malformed and
unknown codes share the same neutral result.

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
