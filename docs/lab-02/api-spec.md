# Lab 2 API Contract — Tok TickIT Requester Ticketing MVP

Base URL: `${VITE_API_URL}` (client) / `http://localhost:3000` (default dev). All
request/response bodies are JSON unless noted (attachment upload is
`multipart/form-data`; attachment download returns the raw file).

## 0. Conventions used throughout this contract

**Requester header.** Every route below except the three reference-data `GET`s
requires an `X-Dev-Requester-Id: <integer>` header identifying the currently
selected Development Requester (spec §BR-07, Decision D-3). Missing or invalid
→ `401`.

**Error envelope.** Every non-2xx response body has this shape:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Summary must be between 5 and 120 characters." } }
```
`message` is always safe to show a user; it never contains stack traces, SQL, or
file paths (BR-28). `code` is a stable machine-readable string the frontend may
switch on (e.g. to highlight a specific field).

**Common error codes.**
| Code | Meaning |
| :--- | :--- |
| `VALIDATION_ERROR` | Request body/query failed validation (`400`). |
| `UNAUTHENTICATED` | Missing/invalid `X-Dev-Requester-Id` (`401`). |
| `NOT_FOUND` | Resource doesn't exist, or exists but isn't owned by the caller (`404`) — see Decision D-2. |
| `UNSUPPORTED_MEDIA_TYPE` | Attachment content-type/signature not in the allowed set (`415`). |
| `PAYLOAD_TOO_LARGE` | Attachment exceeds 5 MB (`413`). |
| `CONFLICT` | Attachment limit (5 active) already reached (`409`). |
| `INTERNAL_ERROR` | Unexpected server-side failure; message is always the generic "Something went wrong. Please try again." (`500`). |

**Pagination metadata shape**, used by any list endpoint:
```json
{ "page": 1, "pageSize": 10, "totalItems": 23, "totalPages": 3 }
```

---

## 1. `GET /api/categories`
**Purpose:** reference data for Create Ticket's Category select and My Tickets' Category filter.
**Auth:** none required (public reference data).

**Response `200`:**
```json
[ { "id": 1, "name": "Hardware" }, { "id": 2, "name": "Software" } ]
```
Always ordered by `id` ascending. Empty array is a valid response, not an error
(client shows its own empty state per BR-13/FR-13 conventions).

**Errors:** `500 INTERNAL_ERROR` on unexpected DB failure.

---

## 2. `GET /api/systems`
**Purpose:** reference data for Create Ticket's Related System select and My Tickets' filter.
**Auth:** none required.

**Response `200`:**
```json
[ { "id": 1, "name": "Campus Wi-Fi" }, { "id": 2, "name": "Email" } ]
```
Only rows with `isActive = true`, ordered by `id` ascending.

**Errors:** `500 INTERNAL_ERROR`.

---

## 3. `GET /api/requesters`
**Purpose:** populates the Development Requester Selector dropdown.
**Auth:** none required — this endpoint is what makes the Selector possible before
any identity is chosen.

**Response `200`:**
```json
[ { "id": 1, "name": "Alex Chaiwat", "email": "alex.chaiwat@example.com" } ]
```
Only rows with `isActive = true` (BR-06), ordered by `name` ascending. Never
includes `isActive` itself, password, or any auth-shaped field (BR-48).

**Errors:** `500 INTERNAL_ERROR`.

---

## 4. `POST /api/tickets`
**Purpose:** create a Ticket, optionally with its initial Attachments, atomically (BR-38).
**Auth:** required.
**Content-Type:** `multipart/form-data` (fields below as form parts; files under
the repeated field name `attachments`, 0–5 files).

**Request fields:**
| Field | Type | Required | Rule |
| :--- | :--- | :--- | :--- |
| `categoryId` | integer | yes | must reference an existing Category |
| `relatedSystemId` | integer | yes | must reference an existing, active RelatedSystem |
| `summary` | string | yes | trimmed, 5–120 chars (BR-20) |
| `description` | string | yes | trimmed, 20–2000 chars (BR-21) |
| `requestedPriority` | `"LOW"\|"MEDIUM"\|"HIGH"` | no | defaults `MEDIUM` (BR-05) |
| `attachments` | file[] | no | 0–5 files, each ≤5 MB, JPG/JPEG/PNG/WEBP/PDF only |

**Response `201`:**
```json
{
  "id": 42,
  "ticketNumber": "TCK-000042",
  "requesterId": 3,
  "categoryId": 1,
  "relatedSystemId": 2,
  "summary": "Laptop battery drains quickly",
  "description": "Battery drops from 100% to 20% within an hour of unplugging...",
  "requestedPriority": "MEDIUM",
  "currentStatus": "NEW",
  "createdAt": "2026-08-27T09:15:00.000Z",
  "updatedAt": "2026-08-27T09:15:00.000Z",
  "attachments": [
    { "id": 7, "originalFilename": "battery_report.pdf", "mimeType": "application/pdf", "sizeBytes": 184320, "uploadedAt": "2026-08-27T09:15:00.000Z", "isRemoved": false }
  ]
}
```

**Errors:**
| Status | Code | Cause |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | missing/out-of-range `summary`/`description`, invalid `requestedPriority`, `categoryId`/`relatedSystemId` not found or inactive |
| `401` | `UNAUTHENTICATED` | missing/invalid/inactive `X-Dev-Requester-Id` |
| `413` | `PAYLOAD_TOO_LARGE` | any attached file exceeds 5 MB |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | any attached file's real content type isn't JPG/JPEG/PNG/WEBP/PDF |
| `400` | `VALIDATION_ERROR` | more than 5 files attached |
| `500` | `INTERNAL_ERROR` | DB or disk failure after validation passed — whole request rolls back (BR-38), nothing persisted |

Validation runs and fails **before** any file is written to disk or any row is
inserted, so a `400`/`413`/`415` guarantees zero side effects.

---

## 5. `GET /api/tickets`
**Purpose:** the selected Requester's own Tickets — search, filter, sort, paginate (BR-14–19).
**Auth:** required.

**Query parameters:**
| Param | Type | Default | Notes |
| :--- | :--- | :--- | :--- |
| `search` | string | — | matches `ticketNumber` prefix or `summary` substring, case-insensitive |
| `categoryId` | integer | — | exact match |
| `relatedSystemId` | integer | — | exact match |
| `requestedPriority` | `LOW\|MEDIUM\|HIGH` | — | exact match |
| `sort` | `createdAt\|updatedAt\|ticketNumber\|summary\|requestedPriority` | `createdAt` | invalid value → default, never `400` |
| `order` | `asc\|desc` | `desc` | invalid value → default |
| `page` | integer ≥1 | `1` | invalid/negative/non-numeric → `1` |
| `pageSize` | integer 1–50 | `10` | out of range → clamped |

**Response `200`:**
```json
{
  "data": [
    {
      "id": 42, "ticketNumber": "TCK-000042", "summary": "Laptop battery drains quickly",
      "categoryName": "Hardware", "relatedSystemName": "Corporate Laptop",
      "requestedPriority": "MEDIUM", "currentStatus": "NEW",
      "attachmentCount": 1, "createdAt": "2026-08-27T09:15:00.000Z", "updatedAt": "2026-08-27T09:15:00.000Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 10, "totalItems": 1, "totalPages": 1 }
}
```
`attachmentCount` counts only active (non-removed) attachments. Scoped server-side
to `requesterId = <X-Dev-Requester-Id>` — no query parameter can widen this scope
(BR-12, tested by API-7.2).

**Errors:** `401 UNAUTHENTICATED`; `500 INTERNAL_ERROR`. (No `400` — see BR-19/Decision D-5.)

---

## 6. `GET /api/tickets/:id`
**Purpose:** one owned Ticket's full detail, including all Attachments (active and removed).
**Auth:** required.

**Response `200`:**
```json
{
  "id": 42, "ticketNumber": "TCK-000042",
  "requester": { "id": 3, "name": "Alex Chaiwat", "email": "alex.chaiwat@example.com" },
  "category": { "id": 1, "name": "Hardware" },
  "relatedSystem": { "id": 2, "name": "Corporate Laptop" },
  "summary": "Laptop battery drains quickly",
  "description": "Battery drops from 100% to 20% within an hour of unplugging...",
  "requestedPriority": "MEDIUM", "currentStatus": "NEW",
  "createdAt": "2026-08-27T09:15:00.000Z", "updatedAt": "2026-08-27T09:15:00.000Z",
  "attachments": [
    { "id": 7, "originalFilename": "battery_report.pdf", "mimeType": "application/pdf", "sizeBytes": 184320, "uploadedAt": "2026-08-27T09:15:00.000Z", "isRemoved": false, "removedAt": null, "removedReason": null },
    { "id": 8, "originalFilename": "old_photo.jpg", "mimeType": "image/jpeg", "sizeBytes": 92000, "uploadedAt": "2026-08-26T10:00:00.000Z", "isRemoved": true, "removedAt": "2026-08-27T08:00:00.000Z", "removedReason": "Wrong screenshot, replaced by battery_report.pdf" }
  ]
}
```

**Errors:**
| Status | Code | Cause |
| :--- | :--- | :--- |
| `401` | `UNAUTHENTICATED` | missing/invalid header |
| `404` | `NOT_FOUND` | Ticket doesn't exist, **or** exists but belongs to a different Requester (Decision D-2, AC-03) |

---

## 7. `POST /api/tickets/:id/attachments`
**Purpose:** add one Attachment to an already-existing, owned Ticket (BR-39).
**Auth:** required. **Content-Type:** `multipart/form-data`, single file field `file`.

**Response `201`:**
```json
{ "id": 9, "originalFilename": "network_trace.png", "mimeType": "image/png", "sizeBytes": 240000, "uploadedAt": "2026-08-27T10:00:00.000Z", "isRemoved": false }
```

**Errors:**
| Status | Code | Cause |
| :--- | :--- | :--- |
| `401` | `UNAUTHENTICATED` | missing/invalid header |
| `404` | `NOT_FOUND` | Ticket doesn't exist or isn't owned by the caller |
| `413` | `PAYLOAD_TOO_LARGE` | file exceeds 5 MB |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | file's real content type not allowed |
| `409` | `CONFLICT` | Ticket already has 5 active Attachments (checked inside the same transaction as the insert, so a burst of concurrent uploads can't exceed 5 — BR-32, API-6.20) |
| `500` | `INTERNAL_ERROR` | disk write failure — no Attachment row is left referencing a missing file |

---

## 8. `GET /api/tickets/:ticketId/attachments/:attachmentId`
**Purpose:** metadata for one Attachment (used by both the active and removed rendering paths on Ticket Detail).
**Auth:** required.

**Response `200`:** same shape as one element of the `attachments` array in
endpoint 6, including removed ones — metadata always visible per BR-36.

**Errors:** `401 UNAUTHENTICATED`; `404 NOT_FOUND` (Ticket not owned, Attachment
doesn't belong to that Ticket, or Attachment doesn't exist).

---

## 9. `GET /api/tickets/:ticketId/attachments/:attachmentId/download`
**Purpose:** stream the active file's bytes.
**Auth:** required.

**Response `200`:** raw file bytes, `Content-Type` set to the stored `mimeType`,
`Content-Disposition: attachment; filename="<originalFilename>"`.

**Errors:**
| Status | Code | Cause |
| :--- | :--- | :--- |
| `401` | `UNAUTHENTICATED` | missing/invalid header |
| `404` | `NOT_FOUND` | Ticket not owned, Attachment doesn't belong to Ticket, Attachment doesn't exist, **or** Attachment is soft-removed (BR-37, Decision D-2 — removed and "not yours" are indistinguishable from the outside) |

---

## 10. `PATCH /api/tickets/:ticketId/attachments/:attachmentId/remove`
**Purpose:** soft-remove an owned, currently-active Attachment (BR-34–36).
**Auth:** required.

**Request body:**
```json
{ "reason": "Wrong screenshot, replaced by battery_report.pdf" }
```
`reason` required, trimmed, 3–200 characters.

**Response `200`:**
```json
{ "id": 8, "isRemoved": true, "removedAt": "2026-08-27T08:00:00.000Z", "removedReason": "Wrong screenshot, replaced by battery_report.pdf" }
```

**Errors:**
| Status | Code | Cause |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | `reason` missing or outside 3–200 chars |
| `401` | `UNAUTHENTICATED` | missing/invalid header |
| `404` | `NOT_FOUND` | Ticket not owned, Attachment doesn't belong to Ticket, or doesn't exist |
| `409` | `CONFLICT` | Attachment is already soft-removed (idempotency guard — API-6.18) |

---

## Status code summary

| Status | Used for |
| :--- | :--- |
| `200` | Successful retrieval, download, or removal. |
| `201` | Ticket or Attachment created. |
| `400` | Body/param validation failure (create Ticket, remove Attachment). |
| `401` | Missing/invalid/inactive `X-Dev-Requester-Id`. |
| `404` | Resource missing or not owned by the caller (Decision D-2) — used uniformly instead of `403`. |
| `409` | Attachment-limit conflict, or removing an already-removed Attachment. |
| `413` | Attachment exceeds 5 MB. |
| `415` | Attachment type not permitted (fails real content inspection). |
| `500` | Unexpected server-side failure; message is always the safe generic string. |
