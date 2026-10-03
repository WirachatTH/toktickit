#!/usr/bin/env bash
# Direct-API authorization evidence for Lab 3 (PDF Part 7): the wrong role is
# refused with 403 by the server itself, with no UI involved.
#
# Usage, from the repository root, with the Docker stack up and seeded:
#   bash artifacts/lab-03/api-evidence/capture-authorization-evidence.sh artifacts/lab-03/api-evidence/authorization-evidence.md
#
# It picks an IN_PROGRESS ticket from the queue itself, so it works on any
# seeded database (set TICKET=<id> to use a specific one). Every call is a read
# or a refused change, so nothing in the database changes; the ticket is read
# before and after to show it. It stops with an error, and writes nothing, if a
# sign-in fails, no IN_PROGRESS ticket exists, or the baseline read isn't 200.
#
# In Git Bash, run it without MSYS_NO_PATHCONV set: curl's cookie files live
# under /tmp and need the usual path translation.
set -u
OUT="${1:?usage: capture-authorization-evidence.sh <output-file>}"
B=http://127.0.0.1:5173
O="Origin: http://localhost:5173"
P=TokTickIT-dev-2026
J=$(mktemp -d)
DRAFT="$J/evidence.md"
trap 'rm -rf "$J"' EXIT
fail() { echo "capture-authorization-evidence: $*" >&2; exit 1; }

login() { curl -s -c "$J/$1" -o /dev/null -w "%{http_code}" -H "$O" -H "Content-Type: application/json" -d "{\"email\":\"$2\",\"password\":\"$P\"}" "$B/api/auth/login"; }
my_id() { curl -s -b "$J/$1" "$B/api/auth/me" | grep -oE '"user":\{"id":[0-9]+' | grep -oE '[0-9]+$'; }

for who in "requester somchai.prasert@kmutt.ac.th" "staff chanon.rattanakorn@kmutt.ac.th" "admin siriporn.boonmee@kmutt.ac.th"; do
  set -- $who
  status=$(login "$1" "$2")
  [ "$status" = "200" ] || fail "sign-in as $2 returned HTTP $status (is the stack up and seeded?)"
done
REQUESTER_ID=$(my_id requester); ADMIN_ID=$(my_id admin)

# An IN_PROGRESS ticket and its owner, from the queue (IN_PROGRESS always has an owner, BR-42).
T="${TICKET:-$(curl -s -b "$J/staff" "$B/api/staff/tickets?status=IN_PROGRESS&pageSize=1" | grep -oE '"data":\[\{"id":[0-9]+' | grep -oE '[0-9]+$')}"
[ -n "$T" ] || fail "no IN_PROGRESS ticket found in the queue"
BASE=$(curl -s -b "$J/staff" -w '\n%{http_code}' "$B/api/staff/tickets/$T")
[ "$(echo "$BASE" | tail -1)" = "200" ] || fail "baseline read of ticket $T returned HTTP $(echo "$BASE" | tail -1), not 200"
OWNER=$(echo "$BASE" | grep -oE '"owner":\{"id":[0-9]+' | grep -oE '[0-9]+$')
STATUS=$(echo "$BASE" | grep -oE '"currentStatus":"[A-Z_]+"' | grep -oE '[A-Z_]+"$' | tr -d '"')
[ "$STATUS" = "IN_PROGRESS" ] && [ -n "$OWNER" ] || fail "ticket $T is $STATUS with owner '${OWNER:-none}', not an owned IN_PROGRESS ticket"

call() {  # label, jar, method, path, [json]
  local label="$1" jar="$2" method="$3" path="$4" data="${5:-}"
  {
    echo "### $label"
    if [ -n "$data" ]; then
      echo "\$ curl -X $method $path -b <$jar session> -H 'Content-Type: application/json' -d '$data'"
      body=$(curl -s -X "$method" -b "$J/$jar" -H "$O" -H "Content-Type: application/json" -d "$data" -w '\n%{http_code}' "$B$path")
    else
      echo "\$ curl -X $method $path -b <$jar session>"
      body=$(curl -s -X "$method" -b "$J/$jar" -H "$O" -w '\n%{http_code}' "$B$path")
    fi
    echo "HTTP $(echo "$body" | tail -1)"
    echo "$body" | sed '$d' | head -c 400
    echo; echo
  } >> "$DRAFT"
}
fingerprint() {
  curl -s -b "$J/staff" "$B/api/staff/tickets/$T" | grep -oE '"(currentStatus|itPriority|requesterResolvedAt|updatedAt)":("[^"]*"|null)|"owner":\{"id":[0-9]+' | tr '\n' ' '
  echo "comments=$(curl -s -b "$J/staff" "$B/api/tickets/$T/comments" | grep -o '"body":' | wc -l) notes=$(curl -s -b "$J/staff" "$B/api/tickets/$T/internal-notes" | grep -o '"body":' | wc -l)"
}

{
  echo "# Lab 3 — direct-API authorization evidence (PDF Part 7)"
  echo
  echo "Captured $(date -u +%Y-%m-%dT%H:%M:%SZ) against the local Docker stack through the Vite /api proxy,"
  echo "with the seeded local-development accounts (README). Each request is sent straight to the API,"
  echo "bypassing the UI, by a role BR-20 does not grant; the server answers 403 FORBIDDEN and changes nothing."
  echo "Ticket $T is an IN_PROGRESS ticket owned by user $OWNER, picked from the queue by the script"
  echo "(artifacts/lab-03/api-evidence/capture-authorization-evidence.sh)."
  echo
  echo "Signed in as: Requester somchai.prasert (id $REQUESTER_ID), IT Staff chanon.rattanakorn, Administrator siriporn.boonmee (id $ADMIN_ID)."
  echo
  echo "## Baseline: the right role is let in"
  echo
} > "$DRAFT"
call "IT Staff reads the ticket" staff GET "/api/staff/tickets/$T"
BEFORE=$(fingerprint)
{ echo "Ticket $T before the refused calls (read as IT Staff):"; echo "    $BEFORE"; echo; } >> "$DRAFT"
echo "## Requester → IT Staff operations" >> "$DRAFT"; echo >> "$DRAFT"
call "Requester opens the IT Staff Ticket Queue" requester GET "/api/staff/tickets"
call "Requester opens IT Staff Ticket Detail" requester GET "/api/staff/tickets/$T"
call "Requester reassigns the ticket to themselves" requester PATCH "/api/staff/tickets/$T/owner" "{\"ownerId\":$REQUESTER_ID,\"expectedOwnerId\":$OWNER,\"expectedStatus\":\"IN_PROGRESS\"}"
call "Requester changes IT Priority" requester PATCH "/api/staff/tickets/$T/it-priority" '{"itPriority":"LOW","expectedStatus":"IN_PROGRESS"}'
call "Requester sets the status to RESOLVED (BR-05)" requester PATCH "/api/staff/tickets/$T/status" "{\"status\":\"RESOLVED\",\"expectedStatus\":\"IN_PROGRESS\",\"expectedOwnerId\":$OWNER,\"resolutionSummary\":\"I fixed it myself, honestly.\"}"
call "Requester sets the status to CLOSED (BR-05)" requester PATCH "/api/staff/tickets/$T/status" "{\"status\":\"CLOSED\",\"expectedStatus\":\"IN_PROGRESS\",\"expectedOwnerId\":$OWNER}"
call "Requester reads Internal Notes (BR-25)" requester GET "/api/tickets/$T/internal-notes"
call "Requester writes an Internal Note" requester POST "/api/tickets/$T/internal-notes" '{"body":"Let me in"}'
echo "## Administrator → IT Staff ticket changes (BR-21)" >> "$DRAFT"; echo >> "$DRAFT"
call "Administrator assigns the ticket to themselves" admin PATCH "/api/staff/tickets/$T/owner" "{\"ownerId\":$ADMIN_ID,\"expectedOwnerId\":$OWNER,\"expectedStatus\":\"IN_PROGRESS\"}"
call "Administrator changes IT Priority" admin PATCH "/api/staff/tickets/$T/it-priority" '{"itPriority":"LOW","expectedStatus":"IN_PROGRESS"}'
call "Administrator changes the status" admin PATCH "/api/staff/tickets/$T/status" "{\"status\":\"WAITING_FOR_REQUESTER\",\"expectedStatus\":\"IN_PROGRESS\",\"expectedOwnerId\":$OWNER}"
call "Administrator posts a Public Comment" admin POST "/api/tickets/$T/comments" '{"body":"An Administrator must not post this"}'
call "Administrator posts an Internal Note" admin POST "/api/tickets/$T/internal-notes" '{"body":"An Administrator must not post this"}'
echo "## IT Staff → Requester-only and Administrator operations" >> "$DRAFT"; echo >> "$DRAFT"
call "IT Staff lists 'My Tickets'" staff GET "/api/tickets"
call "IT Staff marks 'Problem appears resolved'" staff POST "/api/tickets/$T/appears-resolved" '{}'
call "IT Staff opens User Management" staff GET "/api/admin/users"
echo "## No session at all" >> "$DRAFT"; echo >> "$DRAFT"
call "Anonymous changes the status" none PATCH "/api/staff/tickets/$T/status" "{\"status\":\"RESOLVED\",\"expectedStatus\":\"IN_PROGRESS\",\"expectedOwnerId\":$OWNER,\"resolutionSummary\":\"Anonymous attempt.\"}"
AFTER=$(fingerprint)
{
  echo "## Nothing changed"
  echo
  echo "Ticket $T after every call above (read as IT Staff):"
  echo "    $AFTER"
  echo
} >> "$DRAFT"
if [ "$BEFORE" = "$AFTER" ]; then
  echo "Before and after are identical: status, owner, IT Priority, appears-resolved signal, last-updated time, comment count, and note count." >> "$DRAFT"
  cp "$DRAFT" "$OUT"
  echo "wrote $OUT (ticket $T)"
else
  echo "WARNING: the ticket changed between the two reads." >> "$DRAFT"
  cp "$DRAFT" "$OUT"
  fail "ticket $T changed between the before and after reads; see $OUT"
fi
