# Lab 2: API Specifications

All endpoints return JSON responses and expect `application/json` payloads unless otherwise specified (like file uploads).

## 1. Mock Login Endpoints

### `GET /api/requesters`
- **Description:** Returns all active requesters in the system.
- **Success:** `200 OK`
- **Response:**
  ```json
  [
    { "id": 1, "name": "John Doe", "email": "john@example.com", "isActive": true }
  ]
  ```

### `GET /api/categories`
- **Description:** Returns all valid IT request categories.
- **Success:** `200 OK`
- **Response:** `[ { "id": 1, "name": "Software" } ]`

### `GET /api/systems`
- **Description:** Returns all valid IT related systems.
- **Success:** `200 OK`
- **Response:** `[ { "id": 1, "name": "ERP" } ]`

## 2. Ticket Management Endpoints

### `POST /api/tickets`
- **Description:** Creates a new ticket.
- **Headers:** `X-Requester-Id: <user_id>` (for mock auth ownership)
- **Payload:**
  ```json
  {
    "subject": "Laptop broken",
    "description": "Screen is cracked",
    "categoryId": 2,
    "systemId": 1
  }
  ```
- **Validation Errors:** `400 Bad Request` if missing required fields or exceeding char limits.
- **Success:** `201 Created`
- **Response:** `{ "id": 101, "ticketNumber": "TKT-0101", "status": "Open" }`

### `GET /api/tickets`
- **Description:** Retrieves paginated tickets for the active user.
- **Headers:** `X-Requester-Id: <user_id>`
- **Query Params:** `?page=1&search=laptop&categoryId=2&sortBy=date&order=desc`
- **Success:** `200 OK`
- **Response:**
  ```json
  {
    "data": [ ... ],
    "total": 1,
    "page": 1
  }
  ```

### `GET /api/tickets/:id`
- **Description:** Retrieves a single ticket and its active attachments.
- **Headers:** `X-Requester-Id: <user_id>`
- **Errors:** `403 Forbidden` (if ticket belongs to another user), `404 Not Found`.
- **Success:** `200 OK`

## 3. Attachment Endpoints

### `GET /api/attachments/:id`
- **Description:** Retrieves metadata for a specific attachment (filename, size, mimetype, etc.).
- **Headers:** `X-Requester-Id: <user_id>`
- **Errors:** `403 Forbidden` (if ticket belongs to another user), `404 Not Found`.
- **Success:** `200 OK`

### `POST /api/tickets/:id/attachments`
- **Description:** Uploads a file for a ticket.
- **Headers:** `X-Requester-Id: <user_id>`, `Content-Type: multipart/form-data`
- **Errors:** `400 Bad Request` (too large, invalid type, max limit reached), `403 Forbidden`.
- **Success:** `201 Created`

### `DELETE /api/attachments/:id`
- **Description:** Soft-removes an attachment.
- **Headers:** `X-Requester-Id: <user_id>`
- **Payload:** `{ "reason": "Uploaded wrong file" }`
- **Success:** `200 OK`

### `GET /api/attachments/:id/download`
- **Description:** Downloads the physical file.
- **Headers:** `X-Requester-Id: <user_id>`
- **Errors:** `400 Bad Request` (if `isDeleted` is true), `403 Forbidden`.
- **Success:** `200 OK` with binary file stream.
