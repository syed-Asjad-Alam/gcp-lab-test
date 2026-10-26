# gcp-lab-test

A zero-dependency Node.js (22+) REST API for creating, reading, updating and deleting users. Data is held in memory and is lost on restart.

## Run

    API_KEY=choose-a-secret PORT=3000 npm start
    npm test

`API_KEY` is required. Every request must send `Authorization: Bearer <API_KEY>`. `PORT` defaults to 3000.

## API

User fields: `id` (server-generated UUID), `name` (1-100 chars), `email` (unique, valid), `createdAt`, `updatedAt`.

| Method | Path | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| POST | /users | `{name, email}` | 201 user | 400, 401, 409, 413, 429 |
| GET | /users?limit=&offset= | | 200 `{users, limit, offset}` (limit 1-100, default 20) | 400, 401, 429 |
| GET | /users/:id | | 200 user | 401, 404, 429 |
| PUT | /users/:id | `{name?, email?}` (at least one) | 200 user | 400, 401, 404, 409, 413, 429 |
| DELETE | /users/:id | | 204 | 401, 404, 429 |

Unknown body fields (such as `id`) are rejected with 400. Bodies are capped at 10 KB. Requests are limited to 100 per minute per client address.
