# Lab 3 — direct-API authorization evidence (PDF Part 7)

Captured 2026-10-03T15:56:53Z against the local Docker stack through the Vite /api proxy,
with the seeded local-development accounts (README). Each request is sent straight to the API,
bypassing the UI, by a role BR-20 does not grant; the server answers 403 FORBIDDEN and changes nothing.
Ticket 4029 is a seeded IN_PROGRESS ticket.

Sign-ins: requester=200 staff=200 admin=200 (HTTP status of each login)

## Baseline: the right role is let in

### IT Staff reads the ticket
$ curl -X GET /api/staff/tickets/4029 -b <staff session>
HTTP 200
{"id":4029,"ticketNumber":"TCK-004029","requester":{"id":1,"name":"Somchai Prasert","email":"somchai.prasert@kmutt.ac.th","isActive":true},"category":{"id":4,"name":"Network"},"relatedSystem":{"id":3,"name":"VPN"},"summary":"VPN disconnects while uploading large files","description":"The VPN connection drops whenever I upload large drawing files to the department file share from home.","requestedP

## Requester → IT Staff operations

### Requester opens the IT Staff Ticket Queue
$ curl -X GET /api/staff/tickets -b <requester session>
HTTP 403
{"error":{"code":"FORBIDDEN","message":"You don't have permission to do that."}}


### Requester opens IT Staff Ticket Detail
$ curl -X GET /api/staff/tickets/4029 -b <requester session>
HTTP 403
{"error":{"code":"FORBIDDEN","message":"You don't have permission to do that."}}


### Requester reassigns the ticket
$ curl -X PATCH /api/staff/tickets/4029/owner -b <requester session> -H 'Content-Type: application/json' -d '{"ownerId":1,"expectedOwnerId":82,"expectedStatus":"IN_PROGRESS"}'
HTTP 403
{"error":{"code":"FORBIDDEN","message":"You don't have permission to do that."}}


### Requester changes IT Priority
$ curl -X PATCH /api/staff/tickets/4029/it-priority -b <requester session> -H 'Content-Type: application/json' -d '{"itPriority":"LOW","expectedStatus":"IN_PROGRESS"}'
HTTP 403
{"error":{"code":"FORBIDDEN","message":"You don't have permission to do that."}}


### Requester sets the status to RESOLVED (BR-05)
$ curl -X PATCH /api/staff/tickets/4029/status -b <requester session> -H 'Content-Type: application/json' -d '{"status":"RESOLVED","expectedStatus":"IN_PROGRESS","expectedOwnerId":82,"resolutionSummary":"I fixed it myself, honestly."}'
HTTP 403
{"error":{"code":"FORBIDDEN","message":"You don't have permission to do that."}}


### Requester sets the status to CLOSED (BR-05)
$ curl -X PATCH /api/staff/tickets/4029/status -b <requester session> -H 'Content-Type: application/json' -d '{"status":"CLOSED","expectedStatus":"IN_PROGRESS","expectedOwnerId":82}'
HTTP 403
{"error":{"code":"FORBIDDEN","message":"You don't have permission to do that."}}


### Requester reads Internal Notes (BR-25)
$ curl -X GET /api/tickets/4029/internal-notes -b <requester session>
HTTP 403
{"error":{"code":"FORBIDDEN","message":"You don't have permission to do that."}}


### Requester writes an Internal Note
$ curl -X POST /api/tickets/4029/internal-notes -b <requester session> -H 'Content-Type: application/json' -d '{"body":"Let me in"}'
HTTP 403
{"error":{"code":"FORBIDDEN","message":"You don't have permission to do that."}}


## Administrator → IT Staff ticket changes (BR-21)

### Administrator reassigns the ticket
$ curl -X PATCH /api/staff/tickets/4029/owner -b <admin session> -H 'Content-Type: application/json' -d '{"ownerId":86,"expectedOwnerId":82,"expectedStatus":"IN_PROGRESS"}'
HTTP 403
{"error":{"code":"FORBIDDEN","message":"You don't have permission to do that."}}


### Administrator changes IT Priority
$ curl -X PATCH /api/staff/tickets/4029/it-priority -b <admin session> -H 'Content-Type: application/json' -d '{"itPriority":"LOW","expectedStatus":"IN_PROGRESS"}'
HTTP 403
{"error":{"code":"FORBIDDEN","message":"You don't have permission to do that."}}


### Administrator changes the status
$ curl -X PATCH /api/staff/tickets/4029/status -b <admin session> -H 'Content-Type: application/json' -d '{"status":"WAITING_FOR_REQUESTER","expectedStatus":"IN_PROGRESS","expectedOwnerId":82}'
HTTP 403
{"error":{"code":"FORBIDDEN","message":"You don't have permission to do that."}}


### Administrator posts a Public Comment
$ curl -X POST /api/tickets/4029/comments -b <admin session> -H 'Content-Type: application/json' -d '{"body":"An Administrator must not post this"}'
HTTP 403
{"error":{"code":"FORBIDDEN","message":"You don't have permission to do that."}}


### Administrator posts an Internal Note
$ curl -X POST /api/tickets/4029/internal-notes -b <admin session> -H 'Content-Type: application/json' -d '{"body":"An Administrator must not post this"}'
HTTP 403
{"error":{"code":"FORBIDDEN","message":"You don't have permission to do that."}}


## IT Staff → Requester-only and Administrator operations

### IT Staff lists 'My Tickets'
$ curl -X GET /api/tickets -b <staff session>
HTTP 403
{"error":{"code":"FORBIDDEN","message":"You don't have permission to do that."}}


### IT Staff marks 'Problem appears resolved'
$ curl -X POST /api/tickets/4029/appears-resolved -b <staff session> -H 'Content-Type: application/json' -d '{}'
HTTP 403
{"error":{"code":"FORBIDDEN","message":"You don't have permission to do that."}}


### IT Staff opens User Management
$ curl -X GET /api/admin/users -b <staff session>
HTTP 403
{"error":{"code":"FORBIDDEN","message":"You don't have permission to do that."}}


## No session at all

### Anonymous changes the status
$ curl -X PATCH /api/staff/tickets/4029/status -b <none session> -H 'Content-Type: application/json' -d '{"status":"RESOLVED","expectedStatus":"IN_PROGRESS","expectedOwnerId":82,"resolutionSummary":"Anonymous attempt."}'
HTTP 401
{"error":{"code":"UNAUTHENTICATED","message":"Sign in to continue."}}


