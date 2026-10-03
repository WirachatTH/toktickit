#!/usr/bin/env bash
# Direct-API authorization evidence for Lab 3 (PDF Part 7): the wrong role is
# refused with 403 by the server itself, with no UI involved.
#
# Usage, from the repository root, with the Docker stack up and seeded:
#   bash artifacts/lab-03/api-evidence/capture-authorization-evidence.sh #        artifacts/lab-03/api-evidence/authorization-evidence.md
# (In Git Bash, run it without MSYS_NO_PATHCONV set: curl's cookie files live
# under /tmp and need the usual path translation.)
#
# Every call is either a read or a refused change, so nothing in the database
# changes; the ticket is read before and after to show it.
set -u
B=http://127.0.0.1:5173
O="Origin: http://localhost:5173"
P=TokTickIT-dev-2026
J=$(mktemp -d)
OUT="$1"
T=4029   # a seeded IN_PROGRESS ticket (owned by Chanon Rattanakorn)

login() { curl -s -c "$J/$1" -o /dev/null -w "%{http_code}" -H "$O" -H "Content-Type: application/json" -d "{\"email\":\"$2\",\"password\":\"$P\"}" $B/api/auth/login; }
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
  } >> "$OUT"
}

{
  echo "# Lab 3 — direct-API authorization evidence (PDF Part 7)"
  echo
  echo "Captured $(date -u +%Y-%m-%dT%H:%M:%SZ) against the local Docker stack through the Vite /api proxy,"
  echo "with the seeded local-development accounts (README). Each request is sent straight to the API,"
  echo "bypassing the UI, by a role BR-20 does not grant; the server answers 403 FORBIDDEN and changes nothing."
  echo "Ticket $T is a seeded IN_PROGRESS ticket."
  echo
  echo "Sign-ins: requester=$(login requester somchai.prasert@kmutt.ac.th) staff=$(login staff chanon.rattanakorn@kmutt.ac.th) admin=$(login admin siriporn.boonmee@kmutt.ac.th) (HTTP status of each login)"
  echo
  echo "## Baseline: the right role is let in"
  echo
} > "$OUT"
call "IT Staff reads the ticket" staff GET "/api/staff/tickets/$T"
fingerprint() { curl -s -b "$J/staff" "$B/api/staff/tickets/$T" | grep -oE '"(currentStatus|itPriority|requesterResolvedAt|updatedAt)":("[^"]*"|null)|"owner":\{"id":[0-9]+' | tr '
' ' '; echo "comments=$(curl -s -b "$J/staff" "$B/api/tickets/$T/comments" | grep -o '"body":' | wc -l) notes=$(curl -s -b "$J/staff" "$B/api/tickets/$T/internal-notes" | grep -o '"body":' | wc -l)"; }
BEFORE=$(fingerprint)
{ echo "Ticket $T before the refused calls (read as IT Staff):"; echo "    $BEFORE"; echo; } >> "$OUT"
echo "## Requester → IT Staff operations" >> "$OUT"; echo >> "$OUT"
call "Requester opens the IT Staff Ticket Queue" requester GET "/api/staff/tickets"
call "Requester opens IT Staff Ticket Detail" requester GET "/api/staff/tickets/$T"
call "Requester reassigns the ticket" requester PATCH "/api/staff/tickets/$T/owner" '{"ownerId":1,"expectedOwnerId":82,"expectedStatus":"IN_PROGRESS"}'
call "Requester changes IT Priority" requester PATCH "/api/staff/tickets/$T/it-priority" '{"itPriority":"LOW","expectedStatus":"IN_PROGRESS"}'
call "Requester sets the status to RESOLVED (BR-05)" requester PATCH "/api/staff/tickets/$T/status" '{"status":"RESOLVED","expectedStatus":"IN_PROGRESS","expectedOwnerId":82,"resolutionSummary":"I fixed it myself, honestly."}'
call "Requester sets the status to CLOSED (BR-05)" requester PATCH "/api/staff/tickets/$T/status" '{"status":"CLOSED","expectedStatus":"IN_PROGRESS","expectedOwnerId":82}'
call "Requester reads Internal Notes (BR-25)" requester GET "/api/tickets/$T/internal-notes"
call "Requester writes an Internal Note" requester POST "/api/tickets/$T/internal-notes" '{"body":"Let me in"}'
echo "## Administrator → IT Staff ticket changes (BR-21)" >> "$OUT"; echo >> "$OUT"
call "Administrator reassigns the ticket" admin PATCH "/api/staff/tickets/$T/owner" '{"ownerId":86,"expectedOwnerId":82,"expectedStatus":"IN_PROGRESS"}'
call "Administrator changes IT Priority" admin PATCH "/api/staff/tickets/$T/it-priority" '{"itPriority":"LOW","expectedStatus":"IN_PROGRESS"}'
call "Administrator changes the status" admin PATCH "/api/staff/tickets/$T/status" '{"status":"WAITING_FOR_REQUESTER","expectedStatus":"IN_PROGRESS","expectedOwnerId":82}'
call "Administrator posts a Public Comment" admin POST "/api/tickets/$T/comments" '{"body":"An Administrator must not post this"}'
call "Administrator posts an Internal Note" admin POST "/api/tickets/$T/internal-notes" '{"body":"An Administrator must not post this"}'
echo "## IT Staff → Requester-only and Administrator operations" >> "$OUT"; echo >> "$OUT"
call "IT Staff lists 'My Tickets'" staff GET "/api/tickets"
call "IT Staff marks 'Problem appears resolved'" staff POST "/api/tickets/$T/appears-resolved" '{}'
call "IT Staff opens User Management" staff GET "/api/admin/users"
echo "## No session at all" >> "$OUT"; echo >> "$OUT"
call "Anonymous changes the status" none PATCH "/api/staff/tickets/$T/status" '{"status":"RESOLVED","expectedStatus":"IN_PROGRESS","expectedOwnerId":82,"resolutionSummary":"Anonymous attempt."}'
AFTER=$(fingerprint)
{
  echo "## Nothing changed"
  echo
  echo "Ticket $T after every call above (read as IT Staff):"
  echo "    $AFTER"
  echo
  if [ "$BEFORE" = "$AFTER" ]; then echo "Before and after are identical: status, owner, IT Priority, appears-resolved signal, last-updated time, comment count, and note count."; else echo "WARNING: the ticket changed between the two reads."; fi
} >> "$OUT"
rm -rf "$J"
