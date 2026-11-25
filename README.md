# CSS optimization API

The server extracts CSS for a page with either `critical` or `minimalcss`.

## CSS extraction libraries

This project explicitly uses [`critical`](https://www.npmjs.com/package/critical)
and [`minimalcss`](https://www.npmjs.com/package/minimalcss), both listed in
`package.json`. The `critical` strategy is the default; pass
`"strategy":"minimal"` to use `minimalcss`. Other options, such as
[`beasties`](https://www.npmjs.com/package/beasties), may be worth trying later.

## Start

```sh
npm install
npm start
```

The server listens on port `3000` by default. Set `PORT` to change it.

## Create a job

```sh
curl -X POST http://localhost:3000/api/css/jobs \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/","strategy":"critical"}'
```

`strategy` is optional and defaults to `critical`. Choose `minimal` to use
Minimalcss. Both strategies return extracted CSS rather than rewriting the
source page.

The API responds with `202 Accepted` and a job object containing `id`,
`statusUrl`, and the current status (`queued`, `processing`, `completed`, or
`failed`). Poll `statusUrl` until the job completes. The completed response
includes `resultUrl`, which serves the CSS as `text/css`.

You can pass an optional `callbackUrl` in the request body. The server sends it
a JSON POST when the job completes or fails. Success includes `resultUrl`; a
failure includes `error`.

## Routes

- `GET /health` — server health
- `POST /api/css/jobs` — create an optimization job
- `GET /api/css/jobs/:id` — read job status
- `GET /api/css/jobs/:id/css` — download completed CSS  

Jobs are held in memory, so they are cleared when the server restarts.
