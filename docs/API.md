# AgroSathi API

Base URL: `http://localhost:5000/api` (or `http://localhost:5173/api` through the nginx proxy).

Every response uses one envelope:

```json
{ "success": true, "message": "Request successful", "data": {} }
{ "success": false, "message": "Unauthorized" }
```

Validation errors add `"errors": [{ "field": "email", "message": "Invalid email" }]` (HTTP 422).
Authentication is an HTTP-only cookie named `token`, set by login/register. Send requests with credentials.
Status codes: 400 bad request, 401 not logged in or token expired, 403 wrong role or not your data, 404, 409 duplicate, 422 validation, 429 rate limited, 503 AI or weather unavailable.

## Authentication
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | Farmer self-registration: `name, email, mobile, password, village (or location), district, state`. Rate limited. |
| POST | `/auth/login` | `email, password`. Same error for unknown email and wrong password. |
| POST | `/auth/logout` | Clears the cookie. |
| GET | `/auth/me` | Current user. |
| GET | `/health` | Liveness check (`{ status: "ok" }`), used by the Docker healthcheck. |

## Farmer APIs (role: farmer)
| Method | Path | Notes |
|---|---|---|
| GET/PUT | `/farmers/me` | Profile (location, farm size, soil, irrigation). |
| GET | `/farmers/me/agent` | Assigned agent. |
| GET | `/farmers/me/dashboard` | Crops, agent, open tickets, recent AI chats, conversation. |
| GET | `/farmers/locations` | Location options for the selector. |
| GET/POST | `/crops` | List or add crops. `PUT/DELETE /crops/:id` for owned crops. |
| GET | `/crops/categories` | Crop categories. |
| GET/POST/PUT/DELETE | `/farms` | Farms. |
| POST | `/tickets` | `subject, description, category, priority, crop_id`. |
| GET | `/conversations/mine` | Own conversation, agent card, recent messages. |

## Agent APIs (role: agent)
Agents only see farmers assigned to them and tickets or conversations tied to those farmers.

| Method | Path | Notes |
|---|---|---|
| GET | `/agents/me/dashboard` | Counts and priority tickets. |
| GET | `/farmers` | Assigned farmers with crops, location, current issue. |
| GET | `/farmers/:id` | Profile, crops, tickets. 403 if not assigned. |
| GET | `/conversations` | Own conversations with unread counts. |
| GET | `/weather/farmer/:id` | Weather and alerts for a farmer's location. |
| POST | `/ai/assist` | `action` is `ask`, `summarize`, `troubleshooting_questions`, `generate_response` or `improve_response`; plus `ticketId` or `conversationId`, and `draft` for improve. Returns suggestions only. Nothing is sent to the farmer. |
| GET | `/knowledge/search?q=` | Read-only retrieval test. |

## Tickets (farmer, agent, admin; scoped by role)
| Method | Path | Notes |
|---|---|---|
| GET | `/tickets?status=` | Farmers see their own, agents their assigned, admins all. |
| GET | `/tickets/:id` | Detail and replies. |
| PATCH | `/tickets/:id` | Agents/admins: `status, priority`. Admin: `agent_id`. Farmers: close their own ticket only. |
| POST | `/tickets/:id/messages` | Reply on the ticket. |

Statuses: `open, assigned, in_progress, waiting_for_farmer, resolved, closed`. Priorities: `low, medium, high, urgent`.

## Conversations
| Method | Path | Notes |
|---|---|---|
| GET | `/conversations/:id/messages?limit=&before=` | History from MySQL. |
| POST | `/conversations/:id/messages` | REST fallback; same code path as the socket event. `body` max 4000 chars. Admins cannot send. |
| POST | `/conversations/:id/read` | Mark messages from the other party as read. |

## Weather
| Method | Path | Notes |
|---|---|---|
| GET | `/weather/me` | Farmer's weather, 5-day forecast, rain chance, alerts. |
| GET | `/weather?lat=&lon=` or `?q=` | Ad-hoc lookup. |
| GET | `/weather/status` | Whether `WEATHER_API_KEY` is set. |

Responses are cached in Redis (default 30 minutes) and saved to `weather_cache`. If the provider fails, the last saved forecast is returned with `stale: true`; if none exists, HTTP 503 and the rest of the app keeps working.

## AI (role: farmer unless stated)
| Method | Path | Notes |
|---|---|---|
| GET | `/ai/status` | `aiConfigured` and the disclaimer text (any role). |
| POST | `/ai/chat` | `message, conversationId?`. Uses farmer and crop context plus retrieved knowledge. Returns the answer, sources and disclaimer. 503 with a friendly message when AI is unavailable. |
| GET | `/ai/conversations`, `/ai/conversations/:id` | History. `DELETE` removes one. |
| GET | `/ai/recommendations` | Crop tips from the farmer's crops and weather. |
| POST | `/ai/assist` | Agent/admin, see above. |

AI requests are limited to 15 per minute per client.

## Knowledge base
| Method | Path | Role |
|---|---|---|
| GET | `/knowledge` | admin |
| GET/PUT/DELETE | `/knowledge/:id` | admin |
| POST | `/knowledge` | admin; chunks and indexes the document |
| POST | `/knowledge/reindex` | admin; rebuild all embeddings (needed after changing `EMBEDDING_PROVIDER`) |
| GET | `/knowledge/search?q=` | agent, admin |

## Notifications
`GET /notifications` (own, newest first), `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`.

## Admin APIs (role: admin; every route under `/admin`)
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/stats` | Totals, tickets by status, tickets and AI per day. |
| GET/POST | `/admin/users` | List (`?role=&search=`) or create farmer, agent or admin. |
| PUT/DELETE | `/admin/users/:id` | Update name, email, mobile, role, `is_active`, password, agent specialization and capacity. Cannot demote or delete yourself. |
| GET | `/admin/assignments` | Agent workload and all farmers with their agent. |
| GET | `/admin/assignments/suggest` | Least-loaded agent with free capacity (suggestion only). |
| POST | `/admin/assignments` | `{ farmerId, agentId }`. Assigns or reassigns. |
| DELETE | `/admin/assignments/:farmerId` | Unassign. |
| CRUD | `/admin/crop-categories`, `/admin/locations` | Lookup data. `GET /admin/crops` lists all crops. |
| GET | `/admin/audit-logs?page=&limit=&action=` | Audit trail. |
| GET | `/admin/ai-usage` | Totals, per feature, recent calls. |
| GET | `/admin/weather-alerts` | Alerts sent. `POST /admin/weather-alerts/run` runs the check now. |
| GET | `/admin/settings` | Non-secret configuration status. |
| GET | `/agents` | Agents with workload and online state. |

## WebSocket (Socket.IO, path `/socket.io`)
The handshake is authenticated with the same HTTP-only cookie. The client reconnects automatically; after reconnecting it rejoins and reloads history.

Client to server (all take an acknowledgement callback except typing):
| Event | Payload | Ack |
|---|---|---|
| `conversation:join` | `{ conversationId }` | `{ ok, otherOnline }` |
| `message:send` | `{ conversationId, body }` | `{ ok, message }` |
| `typing:start`, `typing:stop` | `{ conversationId }` | none |
| `message:read` | `{ conversationId }` | `{ ok }` |

Server to client:
| Event | Payload |
|---|---|
| `message:new` | message row (`id, conversation_id, sender_id, body, created_at, read_at`) |
| `message:read` | `{ conversationId, readerId, at }` |
| `typing` | `{ conversationId, userId, typing }` |
| `presence:update` | `{ userId, role, online }` |
| `notification:new` | notification row |
